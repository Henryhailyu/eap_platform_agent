"""
Manager performance lookup — student profile + homework + self-study aggregates.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from flask import jsonify, request


def register_admin_performance_routes(
    app,
    *,
    get_db_connection: Callable,
    require_admin_session: Callable,
    admin_user_assigned_class_codes: Callable,
    normalize_class_name: Callable,
) -> None:
    @app.route("/api/admin/performance/student", methods=["GET"])
    def admin_student_performance():
        conn = get_db_connection()
        guard = require_admin_session(conn)
        if guard is not None:
            conn.close()
            return guard

        full_name = str(request.args.get("full_name") or "").strip()
        student_id = str(request.args.get("student_id") or "").strip()
        if not full_name or not student_id:
            conn.close()
            return jsonify({"error": "full_name and student_id are required"}), 400

        row = conn.execute(
            """
            SELECT id, username, role, full_name, class_name, student_id, employee_id
            FROM users
            WHERE TRIM(COALESCE(role, '')) = 'student'
              AND TRIM(COALESCE(student_id, '')) = ?
              AND TRIM(COALESCE(full_name, '')) = ?
            LIMIT 1
            """,
            (student_id, full_name),
        ).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": "Student not found"}), 404

        username = str(row["username"])
        assigned = admin_user_assigned_class_codes(conn, row["id"], row["role"])
        primary_class = (
            assigned[0]
            if assigned
            else (str(row["class_name"]).strip() if row["class_name"] else None)
        )

        payload = {
            "profile": {
                "id": row["id"],
                "username": username,
                "full_name": row["full_name"],
                "student_id": row["student_id"],
                "class_name": row["class_name"],
                "assigned_classes": assigned,
            },
            "homework": _homework_summary(conn, username, primary_class, normalize_class_name),
            "self_study": _self_study_summary(conn, username),
            "risk_flags": [],
        }
        payload["risk_flags"] = _risk_flags(payload)
        conn.close()
        return jsonify({"performance": payload})


def _homework_summary(conn, username: str, class_name: str | None, normalize_class_name) -> dict[str, Any]:
    if not class_name:
        return {
            "class_name": None,
            "total_tasks": 0,
            "completed_tasks": 0,
            "completion_rate": 0.0,
            "homework_submitted_count": 0,
            "feedback_received_count": 0,
            "pending_feedback_count": 0,
        }

    class_norm = normalize_class_name(class_name)
    tasks = conn.execute(
        """
        SELECT id FROM calendar_tasks
        WHERE TRIM(COALESCE(class_name, '')) = ?
        """,
        (class_norm,),
    ).fetchall()
    task_ids = [int(t["id"]) for t in tasks]
    total_tasks = len(task_ids)
    if total_tasks == 0:
        return {
            "class_name": class_norm,
            "total_tasks": 0,
            "completed_tasks": 0,
            "completion_rate": 0.0,
            "homework_submitted_count": 0,
            "feedback_received_count": 0,
            "pending_feedback_count": 0,
        }

    placeholders = ",".join("?" * len(task_ids))
    completed = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM student_task_status
        WHERE student_username = ? AND class_name = ? AND status = 'completed'
          AND task_id IN ({placeholders})
        """,
        (username, class_norm, *task_ids),
    ).fetchone()
    completed_tasks = int(completed["c"] if completed else 0)

    sub_rows = conn.execute(
        f"""
        SELECT s.task_id, s.teacher_feedback, s.feedback_file_path, s.submitted_at
        FROM submissions s
        INNER JOIN (
            SELECT task_id, MAX(id) AS max_id
            FROM submissions
            WHERE student_username = ? AND task_id IN ({placeholders})
            GROUP BY task_id
        ) latest ON s.id = latest.max_id
        """,
        (username, *task_ids),
    ).fetchall()

    submitted = len(sub_rows)
    feedback_count = 0
    pending_feedback = 0
    for sub in sub_rows:
        has_fb = _trimmed(sub["teacher_feedback"]) or _trimmed(sub["feedback_file_path"])
        if has_fb:
            feedback_count += 1
        else:
            pending_feedback += 1

    rate = 0.0 if total_tasks == 0 else round((completed_tasks / total_tasks) * 100, 1)
    return {
        "class_name": class_norm,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_rate": rate,
        "homework_submitted_count": submitted,
        "feedback_received_count": feedback_count,
        "pending_feedback_count": pending_feedback,
    }


def _self_study_summary(conn, username: str) -> dict[str, Any]:
    vocab_days = conn.execute(
        """
        SELECT COUNT(*) AS c FROM student_vocab_day_progress
        WHERE student_username = ? AND (learn_done = 1 OR practice_done = 1)
        """,
        (username,),
    ).fetchone()
    vocab_packs = conn.execute(
        "SELECT COUNT(*) AS c FROM student_vocab_pack_progress WHERE student_username = ?",
        (username,),
    ).fetchone()

    reading = conn.execute(
        """
        SELECT
            COUNT(*) AS completed,
            SUM(COALESCE(score_correct, 0)) AS correct,
            SUM(COALESCE(score_total, 0)) AS total
        FROM student_reading_progress
        WHERE student_username = ? AND practice_done = 1
        """,
        (username,),
    ).fetchone()

    listening = conn.execute(
        """
        SELECT
            COUNT(*) AS completed,
            SUM(COALESCE(score_correct, 0)) AS correct,
            SUM(COALESCE(score_total, 0)) AS total
        FROM student_listening_progress
        WHERE student_username = ? AND practice_done = 1
        """,
        (username,),
    ).fetchone()

    writing = conn.execute(
        """
        SELECT COUNT(DISTINCT session_id) AS sessions,
               COUNT(*) AS submissions
        FROM student_writing_session_submissions
        WHERE student_username = ?
        """,
        (username,),
    ).fetchone()

    speaking = conn.execute(
        "SELECT COUNT(*) AS c FROM student_speaking_responses WHERE student_username = ?",
        (username,),
    ).fetchone()

    last_activity = _latest_self_study_date(conn, username)

    return {
        "vocabulary": {
            "days_completed": int(vocab_days["c"] if vocab_days else 0),
            "packs_completed": int(vocab_packs["c"] if vocab_packs else 0),
        },
        "reading": _skill_score(reading),
        "listening": _skill_score(listening),
        "writing": {
            "sessions_completed": int(writing["sessions"] if writing else 0),
            "submissions": int(writing["submissions"] if writing else 0),
        },
        "speaking": {
            "responses": int(speaking["c"] if speaking else 0),
        },
        "last_activity_at": last_activity,
    }


def _skill_score(row) -> dict[str, Any]:
    if not row:
        return {"completed": 0, "score_percent": None}
    completed = int(row["completed"] or 0)
    total = int(row["total"] or 0)
    correct = int(row["correct"] or 0)
    pct = None if total <= 0 else round((correct / total) * 100, 1)
    return {"completed": completed, "score_percent": pct}


def _latest_self_study_date(conn, username: str) -> str | None:
    candidates: list[str] = []
    for sql, params in (
        (
            "SELECT MAX(completed_at) AS d FROM student_vocab_day_progress WHERE student_username = ?",
            (username,),
        ),
        (
            "SELECT MAX(completed_at) AS d FROM student_reading_progress WHERE student_username = ?",
            (username,),
        ),
        (
            "SELECT MAX(completed_at) AS d FROM student_listening_progress WHERE student_username = ?",
            (username,),
        ),
        (
            "SELECT MAX(submitted_at) AS d FROM student_writing_session_submissions WHERE student_username = ?",
            (username,),
        ),
        (
            "SELECT MAX(submitted_at) AS d FROM student_speaking_responses WHERE student_username = ?",
            (username,),
        ),
    ):
        try:
            r = conn.execute(sql, params).fetchone()
            if r and r["d"]:
                candidates.append(str(r["d"]))
        except Exception:
            pass
    if not candidates:
        return None
    return max(candidates)


def _risk_flags(payload: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    hw = payload.get("homework") or {}
    ss = payload.get("self_study") or {}

    if hw.get("total_tasks", 0) > 0 and hw.get("completion_rate", 100) < 50:
        flags.append({"code": "low_homework_completion", "level": "warning"})

    if hw.get("pending_feedback_count", 0) > 0:
        flags.append({"code": "pending_teacher_feedback", "level": "info"})

    ss_total = (
        (ss.get("vocabulary") or {}).get("days_completed", 0)
        + (ss.get("reading") or {}).get("completed", 0)
        + (ss.get("listening") or {}).get("completed", 0)
        + (ss.get("writing") or {}).get("sessions_completed", 0)
        + (ss.get("speaking") or {}).get("responses", 0)
    )
    if ss_total == 0:
        flags.append({"code": "no_self_study_activity", "level": "warning"})

    last = ss.get("last_activity_at")
    if last:
        try:
            dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - dt > timedelta(days=7):
                flags.append({"code": "inactive_7_days", "level": "warning"})
        except (ValueError, TypeError):
            pass
    elif ss_total == 0:
        pass

    return flags


def _trimmed(val) -> bool:
    return val is not None and str(val).strip() != ""
