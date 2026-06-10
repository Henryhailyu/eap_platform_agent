"""
SS-0 — Self-Study Centre foundation (placement server, settings, daily channel routing).

Web-first: push schedulers deferred to SS-App; vocabulary 2h review = manual on Web (方案 A).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable

from flask import jsonify, request

SKILL_MODULES = ("vocabulary", "reading", "listening", "writing", "speaking")
CHANNEL_B_ONLY = frozenset({"listening", "writing", "speaking"})
VALID_LEVELS = frozenset({"beginner", "intermediate", "advanced"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def migrate_self_study_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_placement_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL UNIQUE,
            level_id TEXT NOT NULL,
            total_percent INTEGER NOT NULL DEFAULT 0,
            total_correct INTEGER NOT NULL DEFAULT 0,
            total_questions INTEGER NOT NULL DEFAULT 0,
            skill_scores_json TEXT,
            answers_json TEXT,
            report_json TEXT,
            vocab_entry_level INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_self_study_settings (
            student_username TEXT PRIMARY KEY,
            subscribed INTEGER NOT NULL DEFAULT 1,
            timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
            holiday_review_mode INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS self_study_skill_push (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            skill TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            pushed_at TEXT,
            pushed_by TEXT,
            notes TEXT,
            UNIQUE(class_name, skill)
        )
        """
    )


def _placement_row_to_dict(row: Any) -> dict:
    skill_scores = {}
    answers = {}
    report = {}
    if row["skill_scores_json"]:
        try:
            skill_scores = json.loads(row["skill_scores_json"])
        except json.JSONDecodeError:
            skill_scores = {}
    if row["answers_json"]:
        try:
            answers = json.loads(row["answers_json"])
        except json.JSONDecodeError:
            answers = {}
    if row["report_json"]:
        try:
            report = json.loads(row["report_json"])
        except json.JSONDecodeError:
            report = {}
    return {
        "levelId": row["level_id"],
        "totalPercent": int(row["total_percent"]),
        "totalCorrect": int(row["total_correct"]),
        "totalQuestions": int(row["total_questions"]),
        "skillScores": skill_scores,
        "answers": answers,
        "report": report,
        "vocabEntryLevel": bool(row["vocab_entry_level"]),
        "completedAt": row["completed_at"],
    }


def _settings_row_to_dict(row: Any | None) -> dict:
    if row is None:
        return {
            "subscribed": True,
            "timezone": "Asia/Shanghai",
            "holidayReviewMode": False,
        }
    return {
        "subscribed": bool(row["subscribed"]),
        "timezone": row["timezone"] or "Asia/Shanghai",
        "holidayReviewMode": bool(row["holiday_review_mode"]),
    }


def _student_class_name(conn, student_username: str) -> str:
    row = conn.execute(
        """
        SELECT COALESCE(NULLIF(TRIM(u.class_name), ''), 'EAP047') AS class_name
        FROM users u
        WHERE u.username = ? AND TRIM(COALESCE(u.role, '')) = 'student'
        LIMIT 1
        """,
        (student_username,),
    ).fetchone()
    if row is None:
        return "EAP047"
    return str(row["class_name"] or "EAP047").strip() or "EAP047"


def _has_manager_push(conn, class_name: str, skill: str) -> bool:
    row = conn.execute(
        """
        SELECT is_active FROM self_study_skill_push
        WHERE class_name = ? AND skill = ?
        LIMIT 1
        """,
        (class_name, skill),
    ).fetchone()
    return bool(row and row["is_active"])


def _daily_channel(conn, class_name: str, skill: str) -> str:
    if skill in CHANNEL_B_ONLY:
        return "B"
    return "A" if _has_manager_push(conn, class_name, skill) else "B"


def _web_review_hint(skill: str) -> dict | None:
    """方案 A: manual review on Web; no 2h push until SS-App."""
    if skill == "vocabulary":
        return {
            "mode": "manual",
            "action": "review_yesterday",
            "labelKey": "self_study_vocab_review_yesterday",
        }
    if skill in ("reading", "listening"):
        return {
            "mode": "manual",
            "action": "open_today_task",
            "labelKey": "self_study_open_today_task",
        }
    return None


def register_self_study_routes(
    app,
    *,
    get_db_connection: Callable,
    require_session_role_if_enabled: Callable,
    get_current_authenticated_user: Callable,
    get_effective_student_username: Callable,
    normalize_class_name: Callable,
) -> None:
    def require_manager_console_role(conn):
        err = require_session_role_if_enabled(conn, "manager")
        if not err:
            return None
        if not require_session_role_if_enabled(conn, "admin"):
            return None
        return err

    @app.route("/api/student/self-study/status", methods=["GET"])
    def student_self_study_status():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        placement_row = conn.execute(
            "SELECT * FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        settings_row = conn.execute(
            "SELECT * FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone()
        class_name = _student_class_name(conn, username)
        conn.close()

        placement = _placement_row_to_dict(placement_row) if placement_row else None
        settings = _settings_row_to_dict(settings_row)
        placement_complete = placement is not None
        unlocked = placement_complete and settings["subscribed"]

        return jsonify(
            {
                "placementComplete": placement_complete,
                "selfStudyUnlocked": unlocked,
                "placement": placement,
                "settings": settings,
                "className": class_name,
                "platform": "web",
                "pushEnabled": False,
            }
        )

    @app.route("/api/student/self-study/placement", methods=["GET"])
    def student_self_study_placement_get():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401
        row = conn.execute(
            "SELECT * FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        conn.close()
        if not row:
            return jsonify({"placement": None})
        return jsonify({"placement": _placement_row_to_dict(row)})

    @app.route("/api/student/self-study/placement", methods=["POST"])
    def student_self_study_placement_post():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        level_id = str(data.get("levelId") or data.get("level_id") or "").strip().lower()
        if level_id not in VALID_LEVELS:
            return jsonify({"error": "Invalid levelId"}), 400

        try:
            total_percent = int(data.get("totalPercent", data.get("total_percent", 0)))
            total_correct = int(data.get("totalCorrect", data.get("total_correct", 0)))
            total_questions = int(data.get("totalQuestions", data.get("total_questions", 0)))
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "Invalid score fields"}), 400

        skill_scores = data.get("skillScores") or data.get("skill_scores") or {}
        answers = data.get("answers") or {}
        report = data.get("report") or {}
        vocab_entry = 1 if total_percent <= 40 else 0
        now = _now_iso()

        conn.execute(
            """
            INSERT INTO student_placement_results (
                student_username, level_id, total_percent, total_correct, total_questions,
                skill_scores_json, answers_json, report_json, vocab_entry_level,
                completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username) DO UPDATE SET
                level_id = excluded.level_id,
                total_percent = excluded.total_percent,
                total_correct = excluded.total_correct,
                total_questions = excluded.total_questions,
                skill_scores_json = excluded.skill_scores_json,
                answers_json = excluded.answers_json,
                report_json = excluded.report_json,
                vocab_entry_level = excluded.vocab_entry_level,
                completed_at = excluded.completed_at,
                updated_at = excluded.updated_at
            """,
            (
                username,
                level_id,
                total_percent,
                total_correct,
                total_questions,
                json.dumps(skill_scores, ensure_ascii=False),
                json.dumps(answers, ensure_ascii=False),
                json.dumps(report, ensure_ascii=False),
                vocab_entry,
                now,
                now,
            ),
        )
        if not conn.execute(
            "SELECT 1 FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone():
            conn.execute(
                """
                INSERT INTO student_self_study_settings
                    (student_username, subscribed, timezone, holiday_review_mode, updated_at)
                VALUES (?, 1, 'Asia/Shanghai', 0, ?)
                """,
                (username, now),
            )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        conn.close()
        return jsonify(
            {
                "placement": _placement_row_to_dict(row),
                "selfStudyUnlocked": True,
            }
        )

    @app.route("/api/student/self-study/settings", methods=["PATCH"])
    def student_self_study_settings_patch():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        now = _now_iso()
        row = conn.execute(
            "SELECT * FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone()
        subscribed = row["subscribed"] if row else 1
        tz = row["timezone"] if row else "Asia/Shanghai"
        holiday = row["holiday_review_mode"] if row else 0

        if "subscribed" in data:
            subscribed = 1 if data.get("subscribed") else 0
        if "timezone" in data:
            tz = str(data.get("timezone") or "Asia/Shanghai").strip()[:64] or "Asia/Shanghai"
        if "holidayReviewMode" in data or "holiday_review_mode" in data:
            raw = data.get("holidayReviewMode", data.get("holiday_review_mode"))
            holiday = 1 if raw else 0

        conn.execute(
            """
            INSERT INTO student_self_study_settings
                (student_username, subscribed, timezone, holiday_review_mode, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(student_username) DO UPDATE SET
                subscribed = excluded.subscribed,
                timezone = excluded.timezone,
                holiday_review_mode = excluded.holiday_review_mode,
                updated_at = excluded.updated_at
            """,
            (username, subscribed, tz, holiday, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone()
        placement_row = conn.execute(
            "SELECT 1 FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        conn.close()
        settings = _settings_row_to_dict(row)
        return jsonify(
            {
                "settings": settings,
                "selfStudyUnlocked": bool(placement_row) and settings["subscribed"],
            }
        )

    @app.route("/api/student/self-study/daily-overview", methods=["GET"])
    def student_self_study_daily_overview():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        placement_row = conn.execute(
            "SELECT vocab_entry_level FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        settings_row = conn.execute(
            "SELECT * FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone()
        settings = _settings_row_to_dict(settings_row)

        skills: dict[str, dict] = {}
        for skill in SKILL_MODULES:
            channel = _daily_channel(conn, class_name, skill)
            entry: dict[str, Any] = {
                "skill": skill,
                "channel": channel,
                "managerPushActive": _has_manager_push(conn, class_name, skill),
            }
            hint = _web_review_hint(skill)
            if hint:
                entry["webReview"] = hint
            skills[skill] = entry

        conn.close()
        return jsonify(
            {
                "className": class_name,
                "placementComplete": placement_row is not None,
                "vocabEntryLevel": bool(placement_row and placement_row["vocab_entry_level"]),
                "settings": settings,
                "skills": skills,
                "pushDelivery": "web_manual",
                "note": "Scheduled push deferred to SS-App; vocabulary 2h review is manual on Web.",
            }
        )

    @app.route("/api/admin/self-study/push-flags", methods=["GET"])
    def admin_self_study_push_flags_list():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err is not None:
            conn.close()
            return err
        class_name = str(request.args.get("class_name") or "").strip()
        if class_name:
            cls = normalize_class_name(class_name)
            rows = conn.execute(
                """
                SELECT * FROM self_study_skill_push
                WHERE class_name = ?
                ORDER BY skill ASC
                """,
                (cls,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM self_study_skill_push ORDER BY class_name ASC, skill ASC"
            ).fetchall()
        conn.close()
        flags = [
            {
                "id": r["id"],
                "className": r["class_name"],
                "skill": r["skill"],
                "isActive": bool(r["is_active"]),
                "pushedAt": r["pushed_at"],
                "pushedBy": r["pushed_by"],
                "notes": r["notes"],
            }
            for r in rows
        ]
        return jsonify({"flags": flags})

    @app.route("/api/admin/self-study/push-flags", methods=["PUT"])
    def admin_self_study_push_flags_upsert():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err is not None:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        manager_name = str(actor["username"] if actor else "manager").strip() or "manager"

        data = request.get_json(silent=True) or {}
        class_name = normalize_class_name(str(data.get("className") or data.get("class_name") or ""))
        skill = str(data.get("skill") or "").strip().lower()
        if not class_name:
            conn.close()
            return jsonify({"error": "className is required"}), 400
        if skill not in SKILL_MODULES:
            conn.close()
            return jsonify({"error": "Invalid skill"}), 400
        is_active = 1 if data.get("isActive", data.get("is_active")) else 0
        notes = str(data.get("notes") or "").strip()[:500]
        now = _now_iso()
        pushed_at = now if is_active else None

        conn.execute(
            """
            INSERT INTO self_study_skill_push
                (class_name, skill, is_active, pushed_at, pushed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(class_name, skill) DO UPDATE SET
                is_active = excluded.is_active,
                pushed_at = CASE WHEN excluded.is_active = 1 THEN excluded.pushed_at ELSE self_study_skill_push.pushed_at END,
                pushed_by = excluded.pushed_by,
                notes = excluded.notes
            """,
            (class_name, skill, is_active, pushed_at, manager_name, notes or None),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT * FROM self_study_skill_push
            WHERE class_name = ? AND skill = ?
            """,
            (class_name, skill),
        ).fetchone()
        conn.close()
        return jsonify(
            {
                "flag": {
                    "id": row["id"],
                    "className": row["class_name"],
                    "skill": row["skill"],
                    "isActive": bool(row["is_active"]),
                    "pushedAt": row["pushed_at"],
                    "pushedBy": row["pushed_by"],
                    "notes": row["notes"],
                }
            }
        )
