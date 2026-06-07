"""
SS-R1 — Self-study reading (Channel A manager queue + Channel B AI passages).
"""
from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

from self_study import CHANNEL_B_ONLY

READING_SKILL = "reading"

SEED_PASSAGE_B1: dict[str, Any] = {
    "title": "Peer feedback in academic writing",
    "lessonEn": "Track argument structure: claim → evidence → limitation. Watch for hedging (may, tend to).",
    "lessonZh": "关注论证结构：主张 → 证据 → 局限。注意模糊语（may、tend to）。",
    "passageEn": (
        "Recent studies suggest that peer feedback may improve draft quality more than self-editing alone. "
        "Students who explain their revisions to a partner tend to notice logical gaps. "
        "Nevertheless, feedback quality depends on clear criteria supplied by the instructor."
    ),
    "passageZh": (
        "近期研究表明，同伴反馈可能比单独自我修改更能提高草稿质量。"
        "向同伴解释修改的学生往往能发现逻辑漏洞。"
        "然而，反馈质量取决于教师提供的清晰标准。"
    ),
    "questions": [
        {
            "id": "rb1q1",
            "typeId": "MC",
            "promptEn": "The passage mainly argues that peer feedback:",
            "promptZh": "短文主要认为同伴反馈：",
            "optionsEn": [
                "can help when criteria are clear",
                "always replaces teacher grading",
                "is useless for writing",
                "only helps vocabulary lists",
            ],
            "optionsZh": [
                "在标准清晰时会有帮助",
                "总是替代教师评分",
                "对写作无用",
                "仅帮助词汇表",
            ],
            "correctIndex": 0,
            "evidenceEn": "feedback quality depends on clear criteria supplied by the instructor",
            "evidenceZh": "反馈质量取决于教师提供的清晰标准",
        },
        {
            "id": "rb1q2",
            "typeId": "MC",
            "promptEn": "*Nevertheless* introduces:",
            "promptZh": "*Nevertheless* 引出：",
            "optionsEn": ["a limitation", "a synonym list", "a new unrelated topic", "page numbers"],
            "optionsZh": ["一个局限", "同义词表", "无关新话题", "页码"],
            "correctIndex": 0,
            "evidenceEn": "Nevertheless, feedback quality depends on clear criteria",
            "evidenceZh": "然而，反馈质量取决于……清晰标准",
        },
        {
            "id": "rb1q3",
            "typeId": "MC",
            "promptEn": "We can infer that vague criteria lead to:",
            "promptZh": "可推断模糊标准会导致：",
            "optionsEn": [
                "weaker feedback outcomes",
                "higher IELTS scores automatically",
                "shorter essays only",
                "no need for drafts",
            ],
            "optionsZh": [
                "较弱的反馈效果",
                "自动提高雅思分数",
                "仅更短作文",
                "不需要草稿",
            ],
            "correctIndex": 0,
            "evidenceEn": "feedback quality depends on clear criteria",
            "evidenceZh": "反馈质量取决于……清晰标准",
        },
        {
            "id": "rb1q4",
            "typeId": "MC",
            "promptEn": "The phrase *tend to* shows:",
            "promptZh": "*tend to* 表示：",
            "optionsEn": ["cautious generalisation", "absolute certainty", "humour", "a recipe"],
            "optionsZh": ["谨慎概括", "绝对确定", "幽默", "食谱"],
            "correctIndex": 0,
            "evidenceEn": "Students who explain their revisions to a partner tend to notice logical gaps",
            "evidenceZh": "向同伴解释修改的学生往往能发现逻辑漏洞",
        },
    ],
}

SEED_PASSAGE_B2: dict[str, Any] = {
    "title": "Online learning and study plans",
    "lessonEn": "Read for the main idea first, then scan for details. Underline topic sentences.",
    "lessonZh": "先把握主旨，再扫读细节。标出主题句。",
    "passageEn": (
        "Online learning helps students review materials at their own pace. "
        "However, without a study plan, students may fall behind. "
        "Teachers recommend short daily sessions rather than one long cramming block."
    ),
    "passageZh": (
        "在线学习帮助学生按自己的节奏复习材料。"
        "但若没有学习计划，学生可能落后。"
        "教师建议每日短时学习，而非一次长时间突击。"
    ),
    "questions": [
        {
            "id": "rb2q1",
            "typeId": "MC",
            "promptEn": "What is the main idea?",
            "promptZh": "主旨是什么？",
            "optionsEn": [
                "Online learning works best with a regular plan",
                "Teachers dislike online tools",
                "Cramming is always effective",
                "Students never use online materials",
            ],
            "optionsZh": [
                "有计划时在线学习效果最好",
                "教师不喜欢在线工具",
                "突击总是有效",
                "学生从不用在线材料",
            ],
            "correctIndex": 0,
            "evidenceEn": "without a study plan, students may fall behind",
            "evidenceZh": "没有学习计划，学生可能落后",
        },
        {
            "id": "rb2q2",
            "typeId": "MC",
            "promptEn": "According to the text, teachers recommend:",
            "promptZh": "根据文本，教师建议：",
            "optionsEn": ["short daily sessions", "no homework", "only weekend study", "ignoring deadlines"],
            "optionsZh": ["每日短时学习", "不做作业", "仅周末学习", "忽略截止日期"],
            "correctIndex": 0,
            "evidenceEn": "Teachers recommend short daily sessions",
            "evidenceZh": "教师建议每日短时学习",
        },
        {
            "id": "rb2q3",
            "typeId": "MC",
            "promptEn": "The word *However* signals:",
            "promptZh": "*However* 表示：",
            "optionsEn": ["contrast", "agreement", "a list", "a greeting"],
            "optionsZh": ["转折", "同意", "列举", "问候"],
            "correctIndex": 0,
            "evidenceEn": "However, without a study plan",
            "evidenceZh": "然而，若没有学习计划",
        },
    ],
}

SEED_PASSAGE_A1: dict[str, Any] = {
    "title": "EAP047 Reading — Unit 1 (manager)",
    "lessonEn": "School material: skim headings, then read for the writer's claim and supporting examples.",
    "lessonZh": "教务资料：先扫标题，再读作者主张与支持例证。",
    "passageEn": (
        "Universities increasingly expect first-year students to evaluate sources critically. "
        "A useful first step is to separate factual reporting from author interpretation. "
        "When a paragraph moves from data to recommendation, underline the shift and ask what evidence supports the advice."
    ),
    "passageZh": (
        "高校日益要求一年级学生批判性评估文献来源。"
        "有用的第一步是将事实报道与作者解释分开。"
        "当段落从数据转向建议时，标出转折并追问有何证据支持该建议。"
    ),
    "questions": [
        {
            "id": "ra1q1",
            "typeId": "MC",
            "promptEn": "The passage recommends that students:",
            "promptZh": "短文建议学生：",
            "optionsEn": [
                "distinguish facts from interpretation",
                "ignore all recommendations",
                "memorise page numbers only",
                "avoid reading academic texts",
            ],
            "optionsZh": [
                "区分事实与解释",
                "忽略所有建议",
                "只背页码",
                "避免阅读学术文本",
            ],
            "correctIndex": 0,
            "evidenceEn": "separate factual reporting from author interpretation",
            "evidenceZh": "将事实报道与作者解释分开",
        },
        {
            "id": "ra1q2",
            "typeId": "MC",
            "promptEn": "When a paragraph shifts to advice, readers should:",
            "promptZh": "当段落转向建议时，读者应：",
            "optionsEn": [
                "check what evidence supports it",
                "skip the paragraph",
                "copy the advice without reading",
                "change the topic",
            ],
            "optionsZh": [
                "检查有何证据支持",
                "跳过该段",
                "不读就复制建议",
                "换话题",
            ],
            "correctIndex": 0,
            "evidenceEn": "ask what evidence supports the advice",
            "evidenceZh": "追问有何证据支持该建议",
        },
    ],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _parse_start(start: str | None) -> date:
    if not start:
        return _today_utc()
    try:
        return date.fromisoformat(str(start)[:10])
    except ValueError:
        return _today_utc()


def migrate_self_study_reading_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reading_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'B',
            start_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reading_passages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT,
            title TEXT NOT NULL,
            source_channel TEXT NOT NULL DEFAULT 'B',
            sort_order INTEGER NOT NULL DEFAULT 0,
            content_json TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reading_schedule_days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            passage_id INTEGER NOT NULL,
            UNIQUE(schedule_id, day_number),
            FOREIGN KEY (schedule_id) REFERENCES reading_schedules(id) ON DELETE CASCADE,
            FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            passage_id INTEGER NOT NULL,
            learn_done INTEGER NOT NULL DEFAULT 0,
            practice_done INTEGER NOT NULL DEFAULT 0,
            score_correct INTEGER,
            score_total INTEGER,
            answers_json TEXT,
            completed_at TEXT,
            UNIQUE(student_username, passage_id),
            FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE
        )
        """
    )
    seed_default_reading_course(conn)


def _passage_payload(raw: dict[str, Any], *, include_answers: bool = False) -> dict[str, Any]:
    questions = []
    for q in raw.get("questions") or []:
        item: dict[str, Any] = {
            "id": q["id"],
            "typeId": q.get("typeId") or "MC",
            "promptEn": q.get("promptEn") or "",
            "promptZh": q.get("promptZh") or "",
            "optionsEn": q.get("optionsEn") or [],
            "optionsZh": q.get("optionsZh") or [],
        }
        if include_answers:
            item["correctIndex"] = q.get("correctIndex", 0)
            item["evidenceEn"] = q.get("evidenceEn") or ""
            item["evidenceZh"] = q.get("evidenceZh") or ""
        questions.append(item)
    return {
        "title": raw.get("title") or "",
        "lessonEn": raw.get("lessonEn") or "",
        "lessonZh": raw.get("lessonZh") or "",
        "passageEn": raw.get("passageEn") or "",
        "passageZh": raw.get("passageZh") or "",
        "questions": questions,
    }


def seed_default_reading_course(conn) -> None:
    existing = conn.execute(
        "SELECT id FROM reading_schedules WHERE class_name = ? AND channel = 'B' AND status = 'active' LIMIT 1",
        ("EAP047",),
    ).fetchone()
    if existing:
        return
    now = _now_iso()
    start = _today_utc().isoformat()

    def insert_passage(data: dict, channel: str, order: int) -> int:
        conn.execute(
            """
            INSERT INTO reading_passages (class_name, title, source_channel, sort_order, content_json, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                "EAP047",
                data["title"],
                channel,
                order,
                json.dumps(_passage_payload(data, include_answers=True), ensure_ascii=False),
                now,
                now,
            ),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    p1 = insert_passage(SEED_PASSAGE_B1, "B", 1)
    p2 = insert_passage(SEED_PASSAGE_B2, "B", 2)
    insert_passage(SEED_PASSAGE_A1, "A", 1)

    conn.execute(
        """
        INSERT INTO reading_schedules (class_name, channel, start_date, status, created_at, updated_at)
        VALUES (?, 'B', ?, 'active', ?, ?)
        """,
        ("EAP047", start, now, now),
    )
    sched_b = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        "INSERT INTO reading_schedule_days (schedule_id, day_number, passage_id) VALUES (?, 1, ?)",
        (sched_b, p1),
    )
    conn.execute(
        "INSERT INTO reading_schedule_days (schedule_id, day_number, passage_id) VALUES (?, 2, ?)",
        (sched_b, p2),
    )

    conn.execute(
        """
        INSERT INTO reading_schedules (class_name, channel, start_date, status, created_at, updated_at)
        VALUES (?, 'A', ?, 'active', ?, ?)
        """,
        ("EAP047", start, now, now),
    )
    sched_a = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    a_row = conn.execute(
        "SELECT id FROM reading_passages WHERE source_channel = 'A' AND class_name = 'EAP047' ORDER BY sort_order LIMIT 1"
    ).fetchone()
    if a_row:
        conn.execute(
            "INSERT INTO reading_schedule_days (schedule_id, day_number, passage_id) VALUES (?, 1, ?)",
            (sched_a, a_row["id"]),
        )
    conn.commit()


def _student_class_name(conn, student_username: str) -> str:
    row = conn.execute(
        """
        SELECT COALESCE(NULLIF(TRIM(u.class_name), ''), 'EAP047') AS class_name
        FROM users u WHERE u.username = ? AND TRIM(COALESCE(u.role, '')) = 'student'
        LIMIT 1
        """,
        (student_username,),
    ).fetchone()
    return str(row["class_name"] if row else "EAP047").strip() or "EAP047"


def _has_manager_push(conn, class_name: str, skill: str) -> bool:
    row = conn.execute(
        "SELECT is_active FROM self_study_skill_push WHERE class_name = ? AND skill = ? LIMIT 1",
        (class_name, skill),
    ).fetchone()
    return bool(row and row["is_active"])


def _reading_channel(conn, class_name: str) -> str:
    if READING_SKILL in CHANNEL_B_ONLY:
        return "B"
    return "A" if _has_manager_push(conn, class_name, READING_SKILL) else "B"


def _active_schedule(conn, class_name: str, channel: str) -> Any:
    return conn.execute(
        """
        SELECT * FROM reading_schedules
        WHERE class_name = ? AND channel = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
        """,
        (class_name, channel),
    ).fetchone()


def _day_number(schedule: Any, on_date: date | None = None) -> int:
    start = _parse_start(schedule["start_date"])
    today = on_date or _today_utc()
    offset = (today - start).days
    return max(1, offset + 1)


def _passage_for_day(conn, schedule_id: int, day_number: int) -> Any:
    return conn.execute(
        """
        SELECT p.* FROM reading_schedule_days d
        JOIN reading_passages p ON p.id = d.passage_id
        WHERE d.schedule_id = ? AND d.day_number = ?
        LIMIT 1
        """,
        (schedule_id, day_number),
    ).fetchone()


def _strip_answers(content: dict) -> dict:
    out = dict(content)
    qs = []
    for q in content.get("questions") or []:
        qs.append(
            {
                "id": q["id"],
                "typeId": q.get("typeId") or "MC",
                "promptEn": q.get("promptEn") or "",
                "promptZh": q.get("promptZh") or "",
                "optionsEn": q.get("optionsEn") or [],
                "optionsZh": q.get("optionsZh") or [],
            }
        )
    out["questions"] = qs
    return out


def _score_answers(content: dict, answers: dict[str, int]) -> dict[str, Any]:
    results = []
    correct = 0
    total = 0
    for q in content.get("questions") or []:
        qid = q["id"]
        total += 1
        chosen = answers.get(qid)
        if chosen is None:
            try:
                chosen = answers.get(str(qid))
            except (TypeError, ValueError):
                chosen = None
        ci = int(q.get("correctIndex") or 0)
        ok = chosen is not None and int(chosen) == ci
        if ok:
            correct += 1
        results.append(
            {
                "id": qid,
                "correct": ok,
                "chosenIndex": chosen,
                "correctIndex": ci,
                "evidenceEn": q.get("evidenceEn") or "",
                "evidenceZh": q.get("evidenceZh") or "",
                "errorType": None if ok else "wrong_option",
            }
        )
    return {"correct": correct, "total": total, "results": results}


def register_self_study_reading_routes(
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

    @app.route("/api/student/self-study/reading/overview", methods=["GET"])
    def student_reading_overview():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        channel = _reading_channel(conn, class_name)
        schedule = _active_schedule(conn, class_name, channel)
        day_num = _day_number(schedule) if schedule else None
        passage = _passage_for_day(conn, schedule["id"], day_num) if schedule and day_num else None
        prog = None
        if passage:
            prog = conn.execute(
                "SELECT * FROM student_reading_progress WHERE student_username = ? AND passage_id = ?",
                (username, passage["id"]),
            ).fetchone()
        conn.close()

        return jsonify(
            {
                "className": class_name,
                "channel": channel,
                "schedule": {
                    "startDate": schedule["start_date"] if schedule else None,
                    "dayNumber": day_num,
                }
                if schedule
                else None,
                "todayPassage": {
                    "id": passage["id"],
                    "title": passage["title"],
                    "questionCount": len(json.loads(passage["content_json"]).get("questions") or []),
                    "completed": bool(prog and prog["practice_done"]),
                }
                if passage
                else None,
            }
        )

    @app.route("/api/student/self-study/reading/today", methods=["GET"])
    def student_reading_today():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        channel = _reading_channel(conn, class_name)
        schedule = _active_schedule(conn, class_name, channel)
        if not schedule:
            conn.close()
            return jsonify({"error": "No active reading schedule"}), 404

        day_num = _day_number(schedule)
        passage = _passage_for_day(conn, schedule["id"], day_num)
        if not passage:
            conn.close()
            return jsonify({"error": "No passage for today", "dayNumber": day_num}), 404

        content = json.loads(passage["content_json"])
        prog = conn.execute(
            "SELECT * FROM student_reading_progress WHERE student_username = ? AND passage_id = ?",
            (username, passage["id"]),
        ).fetchone()
        conn.close()

        return jsonify(
            {
                "channel": channel,
                "passageId": passage["id"],
                "dayNumber": day_num,
                "title": passage["title"],
                "content": _strip_answers(content),
                "progress": {
                    "learnDone": bool(prog and prog["learn_done"]),
                    "practiceDone": bool(prog and prog["practice_done"]),
                    "scoreCorrect": prog["score_correct"] if prog else None,
                    "scoreTotal": prog["score_total"] if prog else None,
                },
            }
        )

    @app.route("/api/student/self-study/reading/complete", methods=["POST"])
    def student_reading_complete():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        passage_id = int(data.get("passageId") or 0)
        learn_done = 1 if data.get("learnDone") else 0
        submit_answers = data.get("answers")
        if not passage_id:
            conn.close()
            return jsonify({"error": "passageId required"}), 400

        row = conn.execute("SELECT content_json FROM reading_passages WHERE id = ?", (passage_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Passage not found"}), 404

        content = json.loads(row["content_json"])
        now = _now_iso()
        practice_done = 0
        score_correct = None
        score_total = None
        answers_json = None
        scoring = None

        if submit_answers is not None:
            answers = submit_answers if isinstance(submit_answers, dict) else {}
            scoring = _score_answers(content, answers)
            practice_done = 1
            score_correct = scoring["correct"]
            score_total = scoring["total"]
            answers_json = json.dumps(answers, ensure_ascii=False)
            learn_done = 1

        completed_at = now if practice_done else (now if learn_done else None)
        conn.execute(
            """
            INSERT INTO student_reading_progress
                (student_username, passage_id, learn_done, practice_done, score_correct, score_total, answers_json, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username, passage_id) DO UPDATE SET
                learn_done = CASE WHEN excluded.learn_done = 1 OR student_reading_progress.learn_done = 1 THEN 1 ELSE 0 END,
                practice_done = CASE WHEN excluded.practice_done = 1 OR student_reading_progress.practice_done = 1 THEN 1 ELSE 0 END,
                score_correct = COALESCE(excluded.score_correct, student_reading_progress.score_correct),
                score_total = COALESCE(excluded.score_total, student_reading_progress.score_total),
                answers_json = COALESCE(excluded.answers_json, student_reading_progress.answers_json),
                completed_at = COALESCE(excluded.completed_at, student_reading_progress.completed_at)
            """,
            (
                username,
                passage_id,
                learn_done,
                practice_done,
                score_correct,
                score_total,
                answers_json,
                completed_at if (learn_done or practice_done) else None,
            ),
        )
        conn.commit()
        conn.close()
        out: dict[str, Any] = {"ok": True}
        if scoring:
            out["scoring"] = scoring
        return jsonify(out)

    @app.route("/api/admin/self-study/reading/push-channel-a", methods=["PUT"])
    def admin_reading_push_channel_a():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn) or {}
        manager_name = str(actor.get("username") or "manager").strip()
        data = request.get_json(silent=True) or {}
        class_name = normalize_class_name(str(data.get("className") or data.get("class_name") or ""))
        is_active = 1 if data.get("isActive", data.get("is_active", True)) else 0
        if not class_name:
            conn.close()
            return jsonify({"error": "className required"}), 400
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO self_study_skill_push (class_name, skill, is_active, pushed_at, pushed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(class_name, skill) DO UPDATE SET
                is_active = excluded.is_active,
                pushed_at = excluded.pushed_at,
                pushed_by = excluded.pushed_by
            """,
            (class_name, READING_SKILL, is_active, now if is_active else None, manager_name, "reading Channel A"),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "className": class_name, "isActive": bool(is_active)})

    @app.route("/api/admin/self-study/reading/passages", methods=["GET"])
    def admin_reading_passages():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, class_name, source_channel, sort_order, is_active FROM reading_passages ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        return jsonify(
            {
                "passages": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "className": r["class_name"],
                        "sourceChannel": r["source_channel"],
                        "sortOrder": r["sort_order"],
                        "isActive": bool(r["is_active"]),
                    }
                    for r in rows
                ]
            }
        )

    @app.route("/api/admin/self-study/reading/passages/export.csv", methods=["GET"])
    def admin_reading_export():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, source_channel, content_json FROM reading_passages WHERE is_active = 1 ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["passage_id", "title", "channel", "question_id", "type_id", "prompt_en", "correct_index"])
        for row in rows:
            content = json.loads(row["content_json"])
            for q in content.get("questions") or []:
                writer.writerow(
                    [
                        row["id"],
                        row["title"],
                        row["source_channel"],
                        q.get("id"),
                        q.get("typeId"),
                        q.get("promptEn"),
                        q.get("correctIndex"),
                    ]
                )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="reading-passages.csv"'},
        )
