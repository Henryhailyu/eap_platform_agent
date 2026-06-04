"""
HM-M1a / HM-M1b / HM-M2 — AI homework marking reports (Manager config + teacher review).
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

from flask import jsonify, request
from teaching_page_source_files import (
    allowed_source_extension,
    extract_text_from_bytes,
    normalize_extracted_text,
    save_source_file,
)

log = logging.getLogger("eap.homework_marking")

DESCRIPTOR_SUBDIR = "homework-marking-descriptors"
TASK_DESCRIPTOR_SUBDIR = "task-marking-descriptors"
MAX_DESCRIPTOR_BYTES = 10 * 1024 * 1024
MAX_STUDENT_TEXT = 12000
MAX_DESCRIPTOR_TEXT = 14000

DEFAULT_WRITING_PROFILE = {
    "profile_key": "writing_pilot",
    "title": "Writing homework (EAP047 pilot)",
    "task_category": "Writing",
    "system_prompt": """You are an expert EAP writing assessor. Produce a detailed ENGLISH report for the teacher only.
Use the marking descriptors and task context. Be specific: quote short excerpts from the student work when commenting.
Structure your reply as ONE JSON object with these keys (all strings; use Markdown inside string values where helpful):
- executive_summary (2–4 sentences)
- strengths (bullet-style text)
- issues (numbered issues with criterion labels: Task response, Coherence, Vocabulary, Grammar, etc.)
- actionable_revisions (concrete steps the student should take)
- suggested_band (informational IELTS-style band or level estimate; teacher decides final grade)
- criteria_issues (JSON array, optional but recommended: up to 8 objects, each with "criterion", "excerpt", "comment" — quote short student excerpts)
Do not invent facts not present in the submission. If the submission is too short, say so.""",
}

REPORT_JSON_KEYS = (
    "executive_summary",
    "strengths",
    "issues",
    "actionable_revisions",
    "suggested_band",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def migrate_homework_marking_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS homework_marking_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_key TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            task_category TEXT,
            system_prompt TEXT NOT NULL,
            auto_generate INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS homework_marking_descriptors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            label TEXT,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            extract_status TEXT NOT NULL DEFAULT 'pending',
            extract_error TEXT,
            extracted_text TEXT,
            char_count INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES homework_marking_profiles(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_ai_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL UNIQUE,
            profile_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            report_json TEXT,
            error_message TEXT,
            provider TEXT,
            model TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            approved_at TEXT,
            approved_by TEXT,
            FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
        )
        """
    )
    rows = conn.execute("PRAGMA table_info(calendar_tasks)").fetchall()
    col_names = [r[1] for r in rows]
    if "ai_marking_enabled" not in col_names:
        conn.execute(
            "ALTER TABLE calendar_tasks ADD COLUMN ai_marking_enabled INTEGER NOT NULL DEFAULT 0"
        )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS task_marking_descriptor_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            extract_status TEXT NOT NULL DEFAULT 'pending',
            extract_error TEXT,
            extracted_text TEXT,
            char_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES calendar_tasks(id) ON DELETE CASCADE
        )
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(submission_ai_reports)").fetchall()}
    if "previous_report_json" not in cols:
        conn.execute("ALTER TABLE submission_ai_reports ADD COLUMN previous_report_json TEXT")
    prof_cols = {r[1] for r in conn.execute("PRAGMA table_info(homework_marking_profiles)").fetchall()}
    if "class_name" not in prof_cols:
        conn.execute("ALTER TABLE homework_marking_profiles ADD COLUMN class_name TEXT")
    _seed_default_profile(conn)
    conn.execute(
        """
        UPDATE homework_marking_profiles SET class_name = 'EAP047'
        WHERE profile_key = ? AND (class_name IS NULL OR TRIM(class_name) = '')
        """,
        (DEFAULT_WRITING_PROFILE["profile_key"],),
    )


def _normalize_report_payload(payload: dict) -> dict:
    report = {k: str(payload.get(k) or "").strip() for k in REPORT_JSON_KEYS}
    raw_issues = payload.get("criteria_issues")
    if isinstance(raw_issues, list):
        cleaned = []
        for item in raw_issues[:12]:
            if not isinstance(item, dict):
                continue
            criterion = str(item.get("criterion") or "").strip()[:80]
            excerpt = str(item.get("excerpt") or "").strip()[:400]
            comment = str(item.get("comment") or "").strip()[:800]
            if criterion or excerpt or comment:
                cleaned.append(
                    {"criterion": criterion, "excerpt": excerpt, "comment": comment}
                )
        if cleaned:
            report["criteria_issues"] = cleaned
    return report


def task_descriptor_upload_dir(upload_dir: str, task_id: int) -> str:
    path = os.path.join(upload_dir, TASK_DESCRIPTOR_SUBDIR, str(task_id))
    os.makedirs(path, exist_ok=True)
    return path


def _task_ai_marking_enabled(conn, task_id: int) -> bool:
    row = conn.execute(
        "SELECT ai_marking_enabled FROM calendar_tasks WHERE id = ?",
        (int(task_id),),
    ).fetchone()
    if row is None:
        return False
    try:
        return bool(row["ai_marking_enabled"])
    except (KeyError, IndexError):
        return False


def _task_allows_ai_marking(conn, task_id: int, task_row) -> bool:
    """Task opted in, has per-task descriptors, or legacy Homework/Writing pilot profile."""
    if _task_ai_marking_enabled(conn, task_id):
        return True
    if _descriptor_text_for_task(conn, task_id):
        return True
    cat = str(task_row["category"] or "").strip()
    cls = str(task_row["class_name"] or "").strip()
    if cat in ("Homework", "Writing"):
        profile = _pick_profile_for_task(conn, cat, cls)
        return profile is not None and bool(profile["auto_generate"])
    return False


def task_descriptor_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "task_id": row["task_id"],
        "original_name": row["original_name"],
        "stored_name": row["stored_name"],
        "extract_status": row["extract_status"],
        "extract_error": row["extract_error"] or "",
        "char_count": row["char_count"],
        "created_at": row["created_at"],
    }


def _descriptor_text_for_task(conn, task_id: int) -> str:
    rows = conn.execute(
        """
        SELECT extracted_text FROM task_marking_descriptor_files
        WHERE task_id = ? AND extract_status = 'ok'
        ORDER BY id ASC
        """,
        (int(task_id),),
    ).fetchall()
    blocks = []
    for row in rows:
        text = (row["extracted_text"] or "").strip()
        if text:
            blocks.append(text)
    merged = "\n\n---\n\n".join(blocks)
    if len(merged) > MAX_DESCRIPTOR_TEXT:
        merged = merged[:MAX_DESCRIPTOR_TEXT]
    return merged


def _seed_default_profile(conn) -> None:
    row = conn.execute(
        "SELECT id FROM homework_marking_profiles WHERE profile_key = ?",
        (DEFAULT_WRITING_PROFILE["profile_key"],),
    ).fetchone()
    if row:
        return
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO homework_marking_profiles
            (profile_key, title, task_category, system_prompt, auto_generate, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, ?, ?)
        """,
        (
            DEFAULT_WRITING_PROFILE["profile_key"],
            DEFAULT_WRITING_PROFILE["title"],
            DEFAULT_WRITING_PROFILE["task_category"],
            DEFAULT_WRITING_PROFILE["system_prompt"],
            now,
            now,
        ),
    )


def descriptor_upload_dir(base_upload_dir: str, profile_id: int) -> str:
    path = os.path.join(base_upload_dir, DESCRIPTOR_SUBDIR, str(profile_id))
    os.makedirs(path, exist_ok=True)
    return path


def profile_row_to_dict(row) -> dict:
    class_name = ""
    if "class_name" in row.keys():
        class_name = str(row["class_name"] or "").strip()
    return {
        "id": row["id"],
        "profile_key": row["profile_key"],
        "title": row["title"],
        "task_category": row["task_category"] or "",
        "class_name": class_name,
        "system_prompt": row["system_prompt"],
        "auto_generate": bool(row["auto_generate"]),
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def descriptor_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "profile_id": row["profile_id"],
        "label": row["label"] or "",
        "original_name": row["original_name"],
        "extract_status": row["extract_status"],
        "extract_error": row["extract_error"] or "",
        "char_count": row["char_count"] or 0,
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def report_row_to_dict(row) -> dict | None:
    if row is None:
        return None
    report = None
    if row["report_json"]:
        try:
            report = json.loads(row["report_json"])
        except json.JSONDecodeError:
            report = {"raw": row["report_json"]}
    previous_report = None
    prev_raw = row["previous_report_json"] if "previous_report_json" in row.keys() else None
    if prev_raw:
        try:
            previous_report = json.loads(prev_raw)
        except json.JSONDecodeError:
            previous_report = None
    return {
        "id": row["id"],
        "submission_id": row["submission_id"],
        "profile_id": row["profile_id"],
        "status": row["status"],
        "report": report,
        "previous_report": previous_report,
        "error_message": row["error_message"] or "",
        "provider": row["provider"] or "",
        "model": row["model"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "approved_at": row["approved_at"] or "",
        "approved_by": row["approved_by"] or "",
    }


def format_report_as_feedback(report: dict) -> str:
    if not report:
        return ""
    parts = []
    for key, label in (
        ("executive_summary", "Summary"),
        ("strengths", "Strengths"),
        ("issues", "Issues"),
        ("actionable_revisions", "Actionable revisions"),
        ("suggested_band", "Suggested level (informational)"),
    ):
        val = str(report.get(key) or "").strip()
        if val:
            parts.append(f"## {label}\n\n{val}")
    crit = report.get("criteria_issues")
    if isinstance(crit, list) and crit:
        lines = ["## Issues by criterion\n"]
        for item in crit:
            if not isinstance(item, dict):
                continue
            criterion = str(item.get("criterion") or "").strip()
            excerpt = str(item.get("excerpt") or "").strip()
            comment = str(item.get("comment") or "").strip()
            if criterion:
                lines.append(f"### {criterion}")
            if excerpt:
                lines.append(f"> {excerpt}")
            if comment:
                lines.append(comment)
            lines.append("")
        if len(lines) > 1:
            parts.append("\n".join(lines).strip())
    return "\n\n".join(parts).strip()


def _pick_profile_for_task(conn, category: str, class_name: str = "") -> Any:
    cat = str(category or "").strip()
    cls = str(class_name or "").strip()
    if cls and cat:
        row = conn.execute(
            """
            SELECT * FROM homework_marking_profiles
            WHERE is_active = 1 AND task_category = ? AND class_name = ?
            ORDER BY id ASC LIMIT 1
            """,
            (cat, cls),
        ).fetchone()
        if row:
            return row
    if cat:
        row = conn.execute(
            """
            SELECT * FROM homework_marking_profiles
            WHERE is_active = 1 AND task_category = ?
              AND (class_name IS NULL OR TRIM(class_name) = '')
            ORDER BY id ASC LIMIT 1
            """,
            (cat,),
        ).fetchone()
        if row:
            return row
    if cls:
        row = conn.execute(
            """
            SELECT * FROM homework_marking_profiles
            WHERE is_active = 1 AND class_name = ?
              AND (task_category IS NULL OR TRIM(task_category) = '')
            ORDER BY id ASC LIMIT 1
            """,
            (cls,),
        ).fetchone()
        if row:
            return row
    return conn.execute(
        """
        SELECT * FROM homework_marking_profiles
        WHERE is_active = 1 AND profile_key = ?
        LIMIT 1
        """,
        (DEFAULT_WRITING_PROFILE["profile_key"],),
    ).fetchone()


def _homework_marking_analytics(conn, class_name: str = "") -> dict:
    cls = str(class_name or "").strip()
    where = ""
    params: list[Any] = []
    if cls:
        where = " AND t.class_name = ?"
        params.append(cls)
    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS total_reports,
            SUM(CASE WHEN r.status = 'ready' THEN 1 ELSE 0 END) AS ready,
            SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN r.approved_at IS NOT NULL AND TRIM(r.approved_at) != '' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN r.previous_report_json IS NOT NULL AND TRIM(r.previous_report_json) != '' THEN 1 ELSE 0 END) AS regenerated
        FROM submission_ai_reports r
        JOIN submissions s ON s.id = r.submission_id
        JOIN calendar_tasks t ON t.id = s.task_id
        WHERE 1=1{where}
        """,
        params,
    ).fetchone()
    profiles = conn.execute(
        """
        SELECT COUNT(*) AS c FROM homework_marking_profiles WHERE is_active = 1
        """
    ).fetchone()
    total = int(row["total_reports"] if row else 0)
    approved = int(row["approved"] if row else 0)
    accept_rate = round(100.0 * approved / total, 1) if total else 0.0
    return {
        "class_name": cls or None,
        "total_reports": total,
        "ready": int(row["ready"] if row else 0),
        "pending": int(row["pending"] if row else 0),
        "failed": int(row["failed"] if row else 0),
        "approved": approved,
        "regenerated": int(row["regenerated"] if row else 0),
        "accept_rate_pct": accept_rate,
        "active_profiles": int(profiles["c"] if profiles else 0),
    }


def _descriptor_text_for_profile(conn, profile_id: int) -> str:
    rows = conn.execute(
        """
        SELECT extracted_text FROM homework_marking_descriptors
        WHERE profile_id = ? AND is_active = 1 AND extract_status = 'ok'
        ORDER BY id ASC
        """,
        (profile_id,),
    ).fetchall()
    blocks = []
    for row in rows:
        text = (row["extracted_text"] or "").strip()
        if text:
            blocks.append(text)
    merged = "\n\n---\n\n".join(blocks)
    if len(merged) > MAX_DESCRIPTOR_TEXT:
        merged = merged[:MAX_DESCRIPTOR_TEXT]
    return merged


def _student_submission_text(
    conn, submission_row, upload_dir: str, submissions_dir: str | None = None
) -> str:
    parts = []
    answer = (submission_row["answer_text"] or "").strip()
    if answer:
        parts.append(answer)
    fp = submission_row["file_path"]
    if fp:
        path = os.path.join(upload_dir, os.path.basename(str(fp)))
        if submissions_dir is None:
            submissions_dir = os.path.join(os.path.dirname(upload_dir), "submissions")
        if not os.path.isfile(path) and submissions_dir and os.path.isdir(submissions_dir):
            alt = os.path.join(submissions_dir, os.path.basename(str(fp)))
            if os.path.isfile(alt):
                path = alt
        if os.path.isfile(path):
            ext = path.rsplit(".", 1)[-1].lower()
            try:
                with open(path, "rb") as fh:
                    raw = fh.read()
                if ext in ("jpg", "jpeg", "png"):
                    parts.append(
                        f"[Attachment image: {submission_row['file_name'] or fp} — text not extracted]"
                    )
                else:
                    extracted = normalize_extracted_text(
                        extract_text_from_bytes(raw, ext)
                    )
                    if extracted:
                        parts.append(
                            f"[Attachment: {submission_row['file_name'] or fp}]\n{extracted}"
                        )
            except Exception as exc:
                parts.append(f"[Attachment could not be read: {exc}]")
    merged = "\n\n".join(parts).strip()
    if len(merged) > MAX_STUDENT_TEXT:
        merged = merged[:MAX_STUDENT_TEXT]
    return merged


def generate_report_for_submission(
    submission_id: int,
    *,
    get_db_connection,
    upload_dir: str,
    submissions_dir: str | None = None,
    ai_is_configured,
    format_ai_error,
    force_regenerate: bool = False,
) -> None:
    if not ai_is_configured or not ai_is_configured():
        return
    conn = get_db_connection()
    try:
        sub = conn.execute(
            "SELECT * FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if sub is None:
            return
        task = conn.execute(
            "SELECT * FROM calendar_tasks WHERE id = ?",
            (sub["task_id"],),
        ).fetchone()
        if task is None:
            return
        if not _task_allows_ai_marking(conn, int(sub["task_id"]), task):
            now = _now_iso()
            msg = (
                "AI marking is not enabled for this task. When creating homework, "
                "check “AI report” and upload marking descriptors, or ask your manager "
                "to configure a class profile."
            )
            existing = conn.execute(
                "SELECT id FROM submission_ai_reports WHERE submission_id = ?",
                (submission_id,),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE submission_ai_reports SET status = 'failed',
                        error_message = ?, updated_at = ?
                    WHERE submission_id = ?
                    """,
                    (msg, now, submission_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO submission_ai_reports
                        (submission_id, status, error_message, created_at, updated_at)
                    VALUES (?, 'failed', ?, ?, ?)
                    """,
                    (submission_id, msg, now, now),
                )
            conn.commit()
            return
        profile = _pick_profile_for_task(conn, task["category"], task["class_name"])
        if profile is None or not profile["auto_generate"]:
            return

        now = _now_iso()
        existing = conn.execute(
            "SELECT id, status, report_json FROM submission_ai_reports WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        if existing and existing["status"] == "ready" and not force_regenerate:
            return

        if (
            force_regenerate
            and existing
            and existing["status"] == "ready"
            and existing["report_json"]
        ):
            conn.execute(
                """
                UPDATE submission_ai_reports SET previous_report_json = ?
                WHERE submission_id = ?
                """,
                (existing["report_json"], submission_id),
            )

        if existing:
            conn.execute(
                """
                UPDATE submission_ai_reports SET status = 'pending', profile_id = ?,
                    error_message = NULL, updated_at = ?
                WHERE submission_id = ?
                """,
                (profile["id"], now, submission_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO submission_ai_reports
                    (submission_id, profile_id, status, created_at, updated_at)
                VALUES (?, ?, 'pending', ?, ?)
                """,
                (submission_id, profile["id"], now, now),
            )
        conn.commit()

        student_text = _student_submission_text(conn, sub, upload_dir, submissions_dir)
        if not student_text:
            conn.execute(
                """
                UPDATE submission_ai_reports SET status = 'failed', error_message = ?,
                    updated_at = ? WHERE submission_id = ?
                """,
                ("No submission text to analyse", now, submission_id),
            )
            conn.commit()
            return

        descriptors = _descriptor_text_for_task(conn, int(sub["task_id"]))
        if not descriptors:
            descriptors = _descriptor_text_for_profile(conn, profile["id"])
        user_prompt = (
            f"Task title: {task['title']}\n"
            f"Category: {task['category']}\n"
            f"Class: {task['class_name']}\n"
            f"Task description: {(task['description'] or '')[:1500]}\n\n"
        )
        if descriptors:
            user_prompt += f"--- MARKING DESCRIPTORS ---\n{descriptors}\n\n"
        user_prompt += f"--- STUDENT SUBMISSION ---\n{student_text}"

        from eap_ai import create_chat_completion, get_openai_client, parse_ai_json_object

        client, ai_profile = get_openai_client(None)
        response = create_chat_completion(
            client,
            ai_profile,
            messages=[
                {"role": "system", "content": profile["system_prompt"].strip()},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2800,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        raw = ""
        if response.choices:
            raw = (response.choices[0].message.content or "").strip()
        payload = parse_ai_json_object(raw)
        report = _normalize_report_payload(payload)

        conn.execute(
            """
            UPDATE submission_ai_reports SET
                status = 'ready', report_json = ?, error_message = NULL,
                provider = ?, model = ?, updated_at = ?
            WHERE submission_id = ?
            """,
            (
                json.dumps(report, ensure_ascii=False),
                ai_profile.get("id"),
                ai_profile.get("model"),
                _now_iso(),
                submission_id,
            ),
        )
        conn.commit()
    except Exception as exc:
        detail = format_ai_error(exc) if format_ai_error else str(exc)
        log.warning("AI report failed for submission %s: %s", submission_id, detail)
        try:
            conn.execute(
                """
                UPDATE submission_ai_reports SET status = 'failed', error_message = ?,
                    updated_at = ? WHERE submission_id = ?
                """,
                (str(detail)[:500], _now_iso(), submission_id),
            )
            conn.commit()
        except Exception:
            pass
    finally:
        conn.close()


def queue_report_generation(submission_id: int, **kwargs) -> None:
    thread = threading.Thread(
        target=generate_report_for_submission,
        args=(submission_id,),
        kwargs=kwargs,
        daemon=True,
    )
    thread.start()


def register_homework_marking_routes(
    app,
    *,
    get_db_connection,
    require_session_role_if_enabled,
    get_current_authenticated_user,
    upload_dir: str,
    submissions_dir: str | None = None,
    ai_is_configured,
    format_ai_error,
):
    gen_kwargs = {
        "get_db_connection": get_db_connection,
        "upload_dir": upload_dir,
        "submissions_dir": submissions_dir,
        "ai_is_configured": ai_is_configured,
        "format_ai_error": format_ai_error,
    }

    def require_manager_console_role(conn):
        """Manager console users are role admin; also allow explicit manager role."""
        err = require_session_role_if_enabled(conn, "manager")
        if not err:
            return None
        if not require_session_role_if_enabled(conn, "admin"):
            return None
        return err

    @app.route("/api/admin/homework-marking/profiles", methods=["GET"])
    def admin_hm_profiles_list():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT * FROM homework_marking_profiles ORDER BY id ASC"
        ).fetchall()
        profiles = []
        for row in rows:
            d = profile_row_to_dict(row)
            desc_rows = conn.execute(
                "SELECT * FROM homework_marking_descriptors WHERE profile_id = ? ORDER BY id ASC",
                (row["id"],),
            ).fetchall()
            d["descriptors"] = [descriptor_row_to_dict(r) for r in desc_rows]
            profiles.append(d)
        conn.close()
        return jsonify({"profiles": profiles})

    @app.route("/api/admin/homework-marking/analytics", methods=["GET"])
    def admin_hm_analytics():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        class_name = str(request.args.get("class_name") or "").strip()[:80]
        payload = _homework_marking_analytics(conn, class_name)
        conn.close()
        return jsonify({"analytics": payload})

    @app.route("/api/admin/homework-marking/profiles", methods=["POST"])
    def admin_hm_profiles_create():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        data = request.get_json(silent=True) or {}
        key = str(data.get("profile_key") or "").strip()[:80]
        title = str(data.get("title") or "").strip()[:200]
        prompt = str(data.get("system_prompt") or "").strip()
        if not key or not title or not prompt:
            return jsonify({"error": "profile_key, title, and system_prompt are required"}), 400
        now = _now_iso()
        try:
            cur = conn.execute(
                """
                INSERT INTO homework_marking_profiles
                    (profile_key, title, task_category, class_name, system_prompt, auto_generate, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    key,
                    title,
                    str(data.get("task_category") or "").strip()[:80] or None,
                    str(data.get("class_name") or "").strip()[:80] or None,
                    prompt,
                    1 if data.get("auto_generate", True) else 0,
                    now,
                    now,
                ),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM homework_marking_profiles WHERE id = ?",
                (cur.lastrowid,),
            ).fetchone()
        except Exception:
            conn.close()
            return jsonify({"error": "Could not create profile (duplicate key?)"}), 400
        conn.close()
        return jsonify({"profile": profile_row_to_dict(row)}), 201

    @app.route("/api/admin/homework-marking/profiles/<int:profile_id>", methods=["PUT"])
    def admin_hm_profiles_update(profile_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        data = request.get_json(silent=True) or {}
        row = conn.execute(
            "SELECT * FROM homework_marking_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404
        title = str(data.get("title") or row["title"]).strip()[:200]
        prompt = str(data.get("system_prompt") or row["system_prompt"]).strip()
        category = str(data.get("task_category") if "task_category" in data else row["task_category"] or "").strip()[:80]
        class_name = str(
            data.get("class_name") if "class_name" in data else (row["class_name"] if "class_name" in row.keys() else "") or ""
        ).strip()[:80]
        auto_gen = data.get("auto_generate", row["auto_generate"])
        is_active = data.get("is_active", row["is_active"])
        conn.execute(
            """
            UPDATE homework_marking_profiles SET
                title = ?, task_category = ?, class_name = ?, system_prompt = ?,
                auto_generate = ?, is_active = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                title,
                category or None,
                class_name or None,
                prompt,
                1 if auto_gen else 0,
                1 if is_active else 0,
                _now_iso(),
                profile_id,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM homework_marking_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        conn.close()
        return jsonify({"profile": profile_row_to_dict(row)})

    @app.route("/api/admin/homework-marking/profiles/<int:profile_id>/descriptors", methods=["POST"])
    def admin_hm_descriptor_upload(profile_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        profile = conn.execute(
            "SELECT id FROM homework_marking_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if profile is None:
            conn.close()
            return jsonify({"error": "Profile not found"}), 404
        up = request.files.get("file")
        if not up or not up.filename:
            conn.close()
            return jsonify({"error": "No file provided"}), 400
        name = os.path.basename(str(up.filename).strip())
        if not allowed_source_extension(name):
            conn.close()
            return jsonify({"error": f"Unsupported file type: {name}"}), 400
        data_bytes = up.read()
        if len(data_bytes) > MAX_DESCRIPTOR_BYTES:
            conn.close()
            return jsonify({"error": "File too large"}), 400
        ext = name.rsplit(".", 1)[-1].lower()
        extract_status = "ok"
        extract_error = None
        extracted = ""
        try:
            extracted = normalize_extracted_text(extract_text_from_bytes(data_bytes, ext))
        except Exception as exc:
            extract_status = "failed"
            extract_error = str(exc)[:300]
        if extract_status == "ok" and not extracted:
            extract_status = "failed"
            extract_error = "No text could be extracted"
        upload_path = descriptor_upload_dir(upload_dir, profile_id)
        stored_name, _dest = save_source_file(upload_path, name, data_bytes)
        now = _now_iso()
        label = str(request.form.get("label") or "").strip()[:120]
        cur = conn.execute(
            """
            INSERT INTO homework_marking_descriptors
                (profile_id, label, original_name, stored_name, extract_status, extract_error,
                 extracted_text, char_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                label or None,
                name[:512],
                stored_name,
                extract_status,
                extract_error,
                extracted,
                len(extracted),
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM homework_marking_descriptors WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        conn.close()
        return jsonify({"descriptor": descriptor_row_to_dict(row)}), 201

    @app.route("/api/admin/homework-marking/descriptors/<int:descriptor_id>", methods=["DELETE"])
    def admin_hm_descriptor_delete(descriptor_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        row = conn.execute(
            "SELECT * FROM homework_marking_descriptors WHERE id = ?",
            (descriptor_id,),
        ).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404
        upload_path = descriptor_upload_dir(upload_dir, row["profile_id"])
        from teaching_page_source_files import delete_stored_file

        delete_stored_file(upload_path, row["stored_name"])
        conn.execute("DELETE FROM homework_marking_descriptors WHERE id = ?", (descriptor_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    def _teacher_task_access(conn, task_id: int, teacher: str):
        task = conn.execute("SELECT * FROM calendar_tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            return None, (jsonify({"error": "Task not found"}), 404)
        from app import resolve_teacher_with_optional_enforcement, normalize_class_name

        _, guard = resolve_teacher_with_optional_enforcement(
            conn, teacher, normalize_class_name(task["class_name"])
        )
        if guard is not None:
            return None, guard
        return task, None

    @app.route("/api/tasks/<int:task_id>/marking-descriptors", methods=["POST"])
    def teacher_task_marking_descriptors_upload(task_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "teacher")
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401
        teacher = str(actor["username"] or "").strip()
        task, guard = _teacher_task_access(conn, task_id, teacher)
        if guard:
            conn.close()
            return guard
        up = request.files.get("file")
        if not up or not up.filename:
            conn.close()
            return jsonify({"error": "No file provided"}), 400
        name = os.path.basename(str(up.filename).strip())
        if not allowed_source_extension(name):
            conn.close()
            return jsonify({"error": f"Unsupported file type: {name}"}), 400
        data_bytes = up.read()
        if len(data_bytes) > MAX_DESCRIPTOR_BYTES:
            conn.close()
            return jsonify({"error": "File too large"}), 400
        ext = name.rsplit(".", 1)[-1].lower()
        extract_status = "ok"
        extract_error = None
        extracted = ""
        try:
            extracted = normalize_extracted_text(extract_text_from_bytes(data_bytes, ext))
        except Exception as exc:
            extract_status = "failed"
            extract_error = str(exc)[:300]
        if extract_status == "ok" and not extracted:
            extract_status = "failed"
            extract_error = "No text could be extracted"
        upload_path = task_descriptor_upload_dir(upload_dir, task_id)
        stored_name, _dest = save_source_file(upload_path, name, data_bytes)
        now = _now_iso()
        cur = conn.execute(
            """
            INSERT INTO task_marking_descriptor_files
                (task_id, original_name, stored_name, extract_status, extract_error,
                 extracted_text, char_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                name[:512],
                stored_name,
                extract_status,
                extract_error,
                extracted,
                len(extracted),
                now,
            ),
        )
        conn.execute(
            "UPDATE calendar_tasks SET ai_marking_enabled = 1 WHERE id = ?",
            (task_id,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM task_marking_descriptor_files WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        conn.close()
        return jsonify({"descriptor": task_descriptor_row_to_dict(row)}), 201

    def _teacher_submission_access(conn, submission_id: int, teacher: str):
        sub = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        if sub is None:
            return None, None, (jsonify({"error": "Not found"}), 404)
        task = conn.execute(
            "SELECT class_name FROM calendar_tasks WHERE id = ?",
            (sub["task_id"],),
        ).fetchone()
        if task is None:
            return None, None, (jsonify({"error": "Task not found"}), 404)
        from app import resolve_teacher_with_optional_enforcement, normalize_class_name

        _, guard = resolve_teacher_with_optional_enforcement(
            conn, teacher, normalize_class_name(task["class_name"])
        )
        if guard is not None:
            return None, None, guard
        return sub, task, None

    @app.route("/api/teacher/submissions/<int:submission_id>/ai-report", methods=["GET"])
    def teacher_submission_ai_report(submission_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "teacher")
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401
        teacher = str(actor["username"] or "").strip()
        sub, _task, guard = _teacher_submission_access(conn, submission_id, teacher)
        if guard:
            conn.close()
            return guard
        row = conn.execute(
            "SELECT * FROM submission_ai_reports WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        conn.close()
        return jsonify({"ai_report": report_row_to_dict(row)})

    @app.route("/api/teacher/submissions/<int:submission_id>/ai-report/generate", methods=["POST"])
    def teacher_submission_ai_report_generate(submission_id: int):
        if not ai_is_configured or not ai_is_configured():
            return jsonify({"error": "AI is not configured on the server"}), 503
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "teacher")
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401
        teacher = str(actor["username"] or "").strip()
        sub, _task, guard = _teacher_submission_access(conn, submission_id, teacher)
        if guard:
            conn.close()
            return guard
        conn.close()
        generate_report_for_submission(submission_id, force_regenerate=True, **gen_kwargs)
        conn = get_db_connection()
        row = conn.execute(
            "SELECT * FROM submission_ai_reports WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        conn.close()
        return jsonify({"ai_report": report_row_to_dict(row)})

    @app.route("/api/teacher/submissions/<int:submission_id>/ai-report/approve", methods=["PUT"])
    def teacher_submission_ai_report_approve(submission_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "teacher")
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401
        teacher = str(actor["username"] or "").strip()
        sub, _task, guard = _teacher_submission_access(conn, submission_id, teacher)
        if guard:
            conn.close()
            return guard
        row = conn.execute(
            "SELECT * FROM submission_ai_reports WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        if row is None or row["status"] != "ready" or not row["report_json"]:
            conn.close()
            return jsonify({"error": "No ready AI report to approve"}), 400
        try:
            report = json.loads(row["report_json"])
        except json.JSONDecodeError:
            conn.close()
            return jsonify({"error": "Invalid report data"}), 500
        feedback = format_report_as_feedback(report)
        data = request.get_json(silent=True) or {}
        if data.get("feedback_text"):
            feedback = str(data["feedback_text"]).strip()
        mode = str(data.get("mode") or "replace").strip().lower()
        existing = (sub["teacher_feedback"] or "").strip()
        if mode == "append" and existing:
            feedback = f"{existing}\n\n---\n\n{feedback}"
        now = _now_iso()
        conn.execute(
            "UPDATE submissions SET teacher_feedback = ?, status = ? WHERE id = ?",
            (feedback, "Feedback Given", submission_id),
        )
        conn.execute(
            """
            UPDATE submission_ai_reports SET approved_at = ?, approved_by = ?, updated_at = ?
            WHERE submission_id = ?
            """,
            (now, teacher, now, submission_id),
        )
        conn.commit()
        sub_row = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        from app import submission_with_attachments

        payload = submission_with_attachments(conn, sub_row)
        report_row = conn.execute(
            "SELECT * FROM submission_ai_reports WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        conn.close()
        return jsonify({"submission": payload, "ai_report": report_row_to_dict(report_row)})

    app.config["EAP_HOMEWORK_MARKING_GEN_KWARGS"] = gen_kwargs
