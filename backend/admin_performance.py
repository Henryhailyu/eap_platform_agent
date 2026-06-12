"""
Manager performance lookup — student and teacher profiles + homework aggregates.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from flask import jsonify, request

ATTACHMENT_TYPE_TEACHER_FEEDBACK = "teacher_feedback"
FEEDBACK_LAG_DAYS = 3


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

    @app.route("/api/admin/performance/teacher", methods=["GET"])
    def admin_teacher_performance():
        conn = get_db_connection()
        guard = require_admin_session(conn)
        if guard is not None:
            conn.close()
            return guard

        teacher_id_raw = request.args.get("teacher_id")
        if not teacher_id_raw:
            conn.close()
            return jsonify({"error": "teacher_id is required"}), 400
        try:
            teacher_id = int(teacher_id_raw)
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "teacher_id must be an integer"}), 400

        row = conn.execute(
            """
            SELECT id, username, role, full_name, class_name, is_authorized, employee_id,
                   email, office_number, office_phone, mobile_phone
            FROM users
            WHERE id = ? AND TRIM(COALESCE(role, '')) = 'teacher'
            LIMIT 1
            """,
            (teacher_id,),
        ).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": "Teacher not found"}), 404

        teacher_username = str(row["username"] or "").strip()
        assigned = admin_user_assigned_class_codes(conn, row["id"], row["role"])
        homework = _teacher_homework_summary(
            conn, teacher_username, assigned, normalize_class_name
        )
        activity = _teacher_activity_summary(conn, teacher_username)
        payload = {
            "profile": {
                "id": row["id"],
                "username": teacher_username,
                "full_name": row["full_name"],
                "employee_id": row["employee_id"],
                "email": row["email"],
                "office_number": row["office_number"],
                "office_phone": row["office_phone"],
                "mobile_phone": row["mobile_phone"],
                "is_authorized": bool(int(row["is_authorized"] or 0)),
                "assigned_classes": assigned,
            },
            "homework": homework,
            "teaching_activity": activity,
            "risk_flags": _teacher_risk_flags(homework, activity),
        }
        conn.close()
        return jsonify({"performance": payload})


def _submission_has_feedback_sql(alias: str = "s") -> str:
    a = alias
    return f"""(
        TRIM(COALESCE({a}.teacher_feedback, '')) != ''
        OR TRIM(COALESCE({a}.feedback_file_path, '')) != ''
        OR EXISTS (
            SELECT 1 FROM submission_attachments att
            WHERE att.submission_id = {a}.id AND att.attachment_type = ?
        )
    )"""


def _teacher_homework_summary(
    conn, teacher_username: str, class_codes: list[str], normalize_class_name
) -> dict[str, Any]:
    if not class_codes:
        return {
            "total_submissions": 0,
            "feedback_given_by_teacher": 0,
            "feedback_rate": 0.0,
            "pending_feedback_count": 0,
            "lag_3d_count": 0,
            "avg_feedback_hours": None,
            "per_class": [],
        }

    normalized = [normalize_class_name(c) for c in class_codes]
    placeholders = ",".join("?" * len(normalized))
    has_fb = _submission_has_feedback_sql("s")
    params_base = (*normalized, ATTACHMENT_TYPE_TEACHER_FEEDBACK)

    total_submissions = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) IN ({placeholders})
        """,
        normalized,
    ).fetchone()
    total = int(total_submissions["c"] if total_submissions else 0)

    feedback_by_teacher = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) IN ({placeholders})
          AND TRIM(COALESCE(s.feedback_by_username, '')) = ?
          AND {has_fb}
        """,
        (*normalized, teacher_username, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchone()
    given = int(feedback_by_teacher["c"] if feedback_by_teacher else 0)

    pending = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) IN ({placeholders})
          AND NOT {has_fb}
        """,
        params_base,
    ).fetchone()
    pending_count = int(pending["c"] if pending else 0)

    lag_cutoff = (datetime.now(timezone.utc) - timedelta(days=FEEDBACK_LAG_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    lag = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) IN ({placeholders})
          AND NOT {has_fb}
          AND TRIM(COALESCE(s.submitted_at, '')) != ''
          AND s.submitted_at <= ?
        """,
        (*normalized, ATTACHMENT_TYPE_TEACHER_FEEDBACK, lag_cutoff),
    ).fetchone()
    lag_count = int(lag["c"] if lag else 0)

    avg_hours = _teacher_avg_feedback_hours(conn, teacher_username, normalized)

    per_class = []
    for code in normalized:
        per_class.append(
            _teacher_class_homework_row(conn, teacher_username, code, lag_cutoff)
        )

    rate = 0.0 if total == 0 else round((given / total) * 100, 1)
    return {
        "total_submissions": total,
        "feedback_given_by_teacher": given,
        "feedback_rate": rate,
        "pending_feedback_count": pending_count,
        "lag_3d_count": lag_count,
        "avg_feedback_hours": avg_hours,
        "per_class": per_class,
    }


def _teacher_class_homework_row(
    conn, teacher_username: str, class_code: str, lag_cutoff: str
) -> dict[str, Any]:
    has_fb = _submission_has_feedback_sql("s")
    att = ATTACHMENT_TYPE_TEACHER_FEEDBACK

    total = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) = ?
        """,
        (class_code,),
    ).fetchone()

    given = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) = ?
          AND TRIM(COALESCE(s.feedback_by_username, '')) = ?
          AND {has_fb}
        """,
        (class_code, teacher_username, att),
    ).fetchone()

    pending = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) = ?
          AND NOT {has_fb}
        """,
        (class_code, att),
    ).fetchone()

    lag = conn.execute(
        f"""
        SELECT COUNT(*) AS c FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) = ?
          AND NOT {has_fb}
          AND TRIM(COALESCE(s.submitted_at, '')) != ''
          AND s.submitted_at <= ?
        """,
        (class_code, att, lag_cutoff),
    ).fetchone()

    return {
        "class_name": class_code,
        "total_submissions": int(total["c"] if total else 0),
        "feedback_given_by_teacher": int(given["c"] if given else 0),
        "pending_feedback_count": int(pending["c"] if pending else 0),
        "lag_3d_count": int(lag["c"] if lag else 0),
    }


def _teacher_avg_feedback_hours(
    conn, teacher_username: str, class_codes: list[str]
) -> float | None:
    if not class_codes:
        return None
    placeholders = ",".join("?" * len(class_codes))
    rows = conn.execute(
        f"""
        SELECT s.submitted_at, s.feedback_at
        FROM submissions s
        WHERE TRIM(COALESCE(s.class_name, '')) IN ({placeholders})
          AND TRIM(COALESCE(s.feedback_by_username, '')) = ?
          AND TRIM(COALESCE(s.submitted_at, '')) != ''
          AND TRIM(COALESCE(s.feedback_at, '')) != ''
        """,
        (*class_codes, teacher_username),
    ).fetchall()
    deltas: list[float] = []
    for row in rows:
        submitted = _parse_iso_dt(row["submitted_at"])
        feedback = _parse_iso_dt(row["feedback_at"])
        if submitted and feedback and feedback >= submitted:
            deltas.append((feedback - submitted).total_seconds() / 3600.0)
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


def _teacher_activity_summary(conn, teacher_username: str) -> dict[str, Any]:
    pages = conn.execute(
        """
        SELECT COUNT(*) AS c FROM teacher_teaching_pages
        WHERE teacher_username = ? AND COALESCE(published, 0) = 1
        """,
        (teacher_username,),
    ).fetchone()
    live = conn.execute(
        "SELECT COUNT(*) AS c FROM live_sessions WHERE teacher_username = ?",
        (teacher_username,),
    ).fetchone()
    recorded = None
    try:
        recorded = conn.execute(
            "SELECT COUNT(*) AS c FROM recorded_lessons WHERE teacher_username = ?",
            (teacher_username,),
        ).fetchone()
    except Exception:
        recorded = None
    study_suggestions = conn.execute(
        """
        SELECT COUNT(*) AS c FROM student_study_plans
        WHERE TRIM(COALESCE(teacher_suggestion, '')) != ''
        """,
    ).fetchone()
    return {
        "published_teaching_pages": int(pages["c"] if pages else 0),
        "live_sessions": int(live["c"] if live else 0),
        "recorded_lessons": int(recorded["c"] if recorded else 0),
        "study_plan_suggestions": int(study_suggestions["c"] if study_suggestions else 0),
    }


def _teacher_risk_flags(homework: dict[str, Any], activity: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    if homework.get("lag_3d_count", 0) > 0:
        flags.append({"code": "feedback_lag_3d", "level": "warning"})
    if homework.get("pending_feedback_count", 0) > 0:
        flags.append({"code": "pending_homework_feedback", "level": "info"})
    if (
        homework.get("total_submissions", 0) > 0
        and homework.get("feedback_given_by_teacher", 0) == 0
    ):
        flags.append({"code": "no_attributed_feedback", "level": "warning"})
    if (
        activity.get("published_teaching_pages", 0) == 0
        and activity.get("live_sessions", 0) == 0
        and homework.get("feedback_given_by_teacher", 0) == 0
    ):
        flags.append({"code": "low_teaching_activity", "level": "info"})
    return flags


def _parse_iso_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


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
