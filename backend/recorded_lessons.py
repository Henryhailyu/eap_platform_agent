"""
Phase N — recorded lesson metadata + local video storage (Tencent VOD later).
"""
from __future__ import annotations

import logging
import mimetypes
import os
import uuid
from datetime import datetime, timezone

log = logging.getLogger("eap.recorded_lessons")

RECORDED_LESSON_SUBDIR = "recorded-lessons"
ALLOWED_VIDEO_EXTENSIONS = frozenset({"mp4", "webm", "mov", "m4v"})
ALLOWED_AUDIO_EXTENSIONS = frozenset({"mp3", "m4a", "aac", "wav", "ogg"})
ALLOWED_RECORDED_MEDIA_EXTENSIONS = ALLOWED_VIDEO_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS
MAX_RECORDED_VIDEO_BYTES = 500 * 1024 * 1024  # 500 MB pilot cap
MAX_RECORDED_AUDIO_BYTES = 100 * 1024 * 1024  # 100 MB pilot cap

VISIBILITY_DRAFT = "draft"
VISIBILITY_PUBLISHED = "published"
RECORDED_LESSON_CATEGORY = "Recorded lesson"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def allowed_video_extension(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[-1].lower() in ALLOWED_VIDEO_EXTENSIONS


def allowed_audio_extension(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[-1].lower() in ALLOWED_AUDIO_EXTENSIONS


def allowed_recorded_media_extension(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[-1].lower() in ALLOWED_RECORDED_MEDIA_EXTENSIONS


def is_audio_extension(ext: str) -> bool:
    return (ext or "").lower() in ALLOWED_AUDIO_EXTENSIONS


def max_bytes_for_recorded_ext(ext: str) -> int:
    return MAX_RECORDED_AUDIO_BYTES if is_audio_extension(ext) else MAX_RECORDED_VIDEO_BYTES


def recorded_lessons_upload_dir(upload_dir: str) -> str:
    path = os.path.join(upload_dir, RECORDED_LESSON_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def normalize_stored_path(file_path: str) -> str:
    """Stored value is basename under recorded-lessons/."""
    if not file_path:
        return ""
    base = os.path.basename(file_path.replace("\\", "/"))
    if base.startswith(f"{RECORDED_LESSON_SUBDIR}/"):
        base = base.split("/", 1)[-1]
    return base


def save_recorded_video(upload_dir: str, original_name: str, data: bytes) -> tuple[str, str]:
    """Return (stored_basename, absolute_path)."""
    ext = original_name.rsplit(".", 1)[-1].lower()
    stored = f"{uuid.uuid4().hex}.{ext}"
    dest_dir = recorded_lessons_upload_dir(upload_dir)
    dest_abs = os.path.join(dest_dir, stored)
    with open(dest_abs, "wb") as f:
        f.write(data)
    return stored, dest_abs


def delete_recorded_video_file(upload_dir: str, file_path: str | None) -> None:
    base = normalize_stored_path(file_path or "")
    if not base:
        return
    dest_dir = recorded_lessons_upload_dir(upload_dir)
    full = os.path.join(dest_dir, base)
    if os.path.isfile(full):
        try:
            os.remove(full)
        except OSError:
            log.warning("Could not delete recorded video %s", full)


def video_mimetype(ext: str) -> str:
    """MIME for streaming a recorded lesson (video or audio)."""
    e = (ext or "").lower()
    if e == "mp3":
        return "audio/mpeg"
    if e == "m4a" or e == "aac":
        return "audio/mp4"
    if e == "wav":
        return "audio/wav"
    if e == "ogg":
        return "audio/ogg"
    if e == "mp4" or e == "m4v":
        return "video/mp4"
    if e == "webm":
        return "video/webm"
    if e == "mov":
        return "video/quicktime"
    guessed, _ = mimetypes.guess_type(f"file.{e}")
    return guessed or "application/octet-stream"


def lesson_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "class_name": row["class_name"] or "",
        "teacher_username": row["teacher_username"] or "",
        "title": row["title"] or "",
        "description": row["description"] or "",
        "file_path": row["file_path"] or "",
        "file_name": row["file_name"] or "",
        "file_ext": row["file_ext"] or "",
        "file_size_bytes": row["file_size_bytes"] or 0,
        "visibility": row["visibility"] or VISIBILITY_DRAFT,
        "calendar_task_id": row["calendar_task_id"],
        "vod_file_id": row["vod_file_id"] or "",
        "created_at": row["created_at"] or "",
        "updated_at": row["updated_at"] or "",
    }


def enrich_task_dicts_with_recordings(conn, task_dicts, *, published_only: bool = False) -> list:
    """Attach recorded_lesson {id, title, visibility} to each task dict when linked."""
    if not task_dicts:
        return task_dicts
    task_ids = [int(t["id"]) for t in task_dicts if t.get("id") is not None]
    if not task_ids:
        return task_dicts
    placeholders = ",".join("?" * len(task_ids))
    params: list = list(task_ids)
    vis_sql = ""
    if published_only:
        vis_sql = " AND visibility = ?"
        params.append(VISIBILITY_PUBLISHED)
    rows = conn.execute(
        f"""
        SELECT id, calendar_task_id, title, visibility, file_ext, file_name
        FROM recorded_lessons
        WHERE calendar_task_id IN ({placeholders}){vis_sql}
        """,
        params,
    ).fetchall()
    by_task: dict[int, list] = {}
    for r in rows:
        tid = r["calendar_task_id"]
        if tid is None:
            continue
        entry = {
            "id": r["id"],
            "title": r["title"] or "",
            "visibility": r["visibility"] or VISIBILITY_DRAFT,
            "file_ext": r["file_ext"] or "",
            "file_name": r["file_name"] or "",
        }
        by_task.setdefault(int(tid), []).append(entry)
    for t in task_dicts:
        tid = int(t["id"]) if t.get("id") is not None else None
        lessons = by_task.get(tid, []) if tid is not None else []
        t["recorded_lessons"] = lessons
        t["recorded_lesson"] = lessons[0] if lessons else None
    return task_dicts


def _clear_task_recording_links(conn, calendar_task_id: int, except_lesson_id: int | None = None) -> None:
    if except_lesson_id is not None:
        conn.execute(
            """
            UPDATE recorded_lessons
            SET calendar_task_id = NULL, updated_at = ?
            WHERE calendar_task_id = ? AND id != ?
            """,
            (_now_iso(), calendar_task_id, except_lesson_id),
        )
    else:
        conn.execute(
            """
            UPDATE recorded_lessons
            SET calendar_task_id = NULL, updated_at = ?
            WHERE calendar_task_id = ?
            """,
            (_now_iso(), calendar_task_id),
        )


def _attach_task_meta_to_lesson(conn, lesson: dict) -> dict:
    tid = lesson.get("calendar_task_id")
    if not tid:
        lesson["calendar_task_date"] = ""
        lesson["calendar_task_title"] = ""
        return lesson
    row = conn.execute(
        "SELECT date, title FROM calendar_tasks WHERE id = ?",
        (int(tid),),
    ).fetchone()
    if row:
        lesson["calendar_task_date"] = row["date"] or ""
        lesson["calendar_task_title"] = row["title"] or ""
    else:
        lesson["calendar_task_date"] = ""
        lesson["calendar_task_title"] = ""
    return lesson


def _create_calendar_task_for_recording(
    conn, class_name: str, task_date: str, title: str
) -> int:
    from app import normalize_class_name

    class_norm = normalize_class_name(class_name)
    cur = conn.execute(
        """
        INSERT INTO calendar_tasks
            (date, title, category, period, description, status, class_name)
        VALUES (?, ?, ?, '', '', 'Pending', ?)
        """,
        (task_date, title[:200], RECORDED_LESSON_CATEGORY, class_norm),
    )
    return int(cur.lastrowid)


def init_recorded_lessons_tables(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS recorded_lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            teacher_username TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_ext TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            visibility TEXT NOT NULL DEFAULT 'draft',
            calendar_task_id INTEGER,
            vod_file_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


def register_recorded_lessons_routes(app):
    from flask import Response, jsonify, request, send_file

    _SELECT = """
        SELECT id, class_name, teacher_username, title, description,
               file_path, file_name, file_ext, file_size_bytes, visibility,
               calendar_task_id, vod_file_id, created_at, updated_at
        FROM recorded_lessons
    """

    def _upload_root():
        from app import UPLOAD_DIR, ensure_uploads_directory

        ensure_uploads_directory()
        return UPLOAD_DIR

    def _stream_video(upload_dir: str, stored_name: str, ext: str):
        base = normalize_stored_path(stored_name)
        if not base:
            return jsonify({"error": "Invalid file path"}), 400
        from app import resolve_safe_file_in_directory

        dest_dir = recorded_lessons_upload_dir(upload_dir)
        resolved_dir, safe_base = resolve_safe_file_in_directory(dest_dir, base)
        if not resolved_dir:
            return jsonify({"error": "File not found"}), 404
        full = os.path.join(resolved_dir, safe_base)
        resp = send_file(
            full,
            mimetype=video_mimetype(ext),
            as_attachment=False,
            conditional=True,
            download_name=None,
        )
        resp.headers["Content-Disposition"] = "inline"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    @app.route("/api/teacher/recorded-lessons", methods=["GET", "POST"])
    def teacher_recorded_lessons_collection():
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err

            if request.method == "GET":
                class_name = str(request.args.get("class_name") or "").strip()
                if not class_name:
                    return jsonify({"error": "class_name is required"}), 400
                teacher_username = get_effective_teacher_username(conn, None)
                if should_require_session_identity() or should_enforce_membership():
                    if not teacher_username:
                        return jsonify({"error": "Not authenticated as teacher"}), 401
                    err = enforce_teacher_class_access_if_enabled(
                        conn, teacher_username, class_name
                    )
                    if err is not None:
                        return err
                rows = conn.execute(
                    _SELECT + " WHERE class_name = ? ORDER BY created_at DESC",
                    (class_name,),
                ).fetchall()
                lessons = [
                    _attach_task_meta_to_lesson(conn, lesson_row_to_dict(r)) for r in rows
                ]
                return jsonify({"lessons": lessons, "class_name": class_name})

            teacher_username = get_effective_teacher_username(
                conn, request.form.get("teacher_username")
            )
            class_name = str(request.form.get("class_name") or "").strip()
            title = str(request.form.get("title") or "").strip()[:200]
            description = str(request.form.get("description") or "").strip()[:2000]
            task_raw = request.form.get("calendar_task_id")
            calendar_task_id = None
            if task_raw and str(task_raw).strip().isdigit():
                calendar_task_id = int(task_raw)
            create_task_flag = str(request.form.get("create_calendar_task") or "").lower() in (
                "1",
                "true",
                "yes",
            )
            task_date = str(request.form.get("task_date") or "").strip()[:10]
            vis_raw = str(request.form.get("visibility") or "").strip().lower()
            initial_visibility = (
                VISIBILITY_PUBLISHED
                if vis_raw == VISIBILITY_PUBLISHED
                else VISIBILITY_DRAFT
            )

            if not class_name:
                return jsonify({"error": "class_name is required"}), 400
            if not title:
                return jsonify({"error": "title is required"}), 400
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(
                    conn, teacher_username, class_name
                )
                if err is not None:
                    return err

            from app import normalize_class_name

            class_norm = normalize_class_name(class_name)
            if create_task_flag:
                if not task_date:
                    return jsonify({"error": "task_date is required to create a calendar task"}), 400
                calendar_task_id = _create_calendar_task_for_recording(
                    conn, class_norm, task_date, title
                )
            elif calendar_task_id is not None:
                task_row = conn.execute(
                    "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
                    (calendar_task_id,),
                ).fetchone()
                if not task_row:
                    return jsonify({"error": "Calendar task not found"}), 404
                if normalize_class_name(task_row["class_name"]) != class_norm:
                    return jsonify({"error": "Task class does not match recording class"}), 400

            upload = request.files.get("file")
            if not upload or not upload.filename:
                return jsonify({"error": "file is required"}), 400
            name = os.path.basename(upload.filename.strip())
            if not allowed_recorded_media_extension(name):
                return jsonify(
                    {
                        "error": (
                            "File type not allowed. Allowed video: mp4, webm, mov, m4v; "
                            "audio: mp3, m4a, aac, wav, ogg"
                        )
                    }
                ), 400
            ext = name.rsplit(".", 1)[-1].lower()
            data = upload.read()
            cap = max_bytes_for_recorded_ext(ext)
            if len(data) > cap:
                cap_mb = cap // (1024 * 1024)
                return jsonify({"error": f"File too large (max {cap_mb} MB)"}), 400
            if len(data) == 0:
                return jsonify({"error": "Empty file"}), 400

            upload_dir = _upload_root()
            stored, _dest = save_recorded_video(upload_dir, name, data)
            now = _now_iso()
            cur = conn.execute(
                """
                INSERT INTO recorded_lessons
                    (class_name, teacher_username, title, description,
                     file_path, file_name, file_ext, file_size_bytes, visibility,
                     calendar_task_id, vod_file_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    class_norm,
                    teacher_username or "",
                    title,
                    description or None,
                    stored,
                    name[:512],
                    ext,
                    len(data),
                    initial_visibility,
                    calendar_task_id,
                    now,
                    now,
                ),
            )
            conn.commit()
            row = conn.execute(_SELECT + " WHERE id = ?", (cur.lastrowid,)).fetchone()
            lesson = _attach_task_meta_to_lesson(conn, lesson_row_to_dict(row))
            return jsonify({"lesson": lesson, "calendar_task_id": calendar_task_id}), 201
        finally:
            conn.close()

    @app.route("/api/teacher/recorded-lessons/<int:lesson_id>", methods=["PATCH", "DELETE"])
    def teacher_recorded_lesson_item(lesson_id):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err
            row = conn.execute(_SELECT + " WHERE id = ?", (lesson_id,)).fetchone()
            if not row:
                return jsonify({"error": "Lesson not found"}), 404
            teacher_username = get_effective_teacher_username(conn, None)
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "Not authenticated as teacher"}), 401
                err = enforce_teacher_class_access_if_enabled(
                    conn, teacher_username, row["class_name"]
                )
                if err is not None:
                    return err

            if request.method == "DELETE":
                delete_recorded_video_file(_upload_root(), row["file_path"])
                conn.execute("DELETE FROM recorded_lessons WHERE id = ?", (lesson_id,))
                conn.commit()
                return jsonify({"ok": True})

            body = request.get_json(silent=True) or {}
            title = body.get("title")
            description = body.get("description")
            visibility = body.get("visibility")
            if "calendar_task_id" in body:
                from app import normalize_class_name

                raw_tid = body.get("calendar_task_id")
                if raw_tid is None or raw_tid == "":
                    conn.execute(
                        "UPDATE recorded_lessons SET calendar_task_id = NULL, updated_at = ? WHERE id = ?",
                        (_now_iso(), lesson_id),
                    )
                elif not str(raw_tid).strip().isdigit():
                    return jsonify({"error": "calendar_task_id must be an integer"}), 400
                else:
                    tid = int(raw_tid)
                    task_row = conn.execute(
                        "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
                        (tid,),
                    ).fetchone()
                    if not task_row:
                        return jsonify({"error": "Calendar task not found"}), 404
                    if normalize_class_name(task_row["class_name"]) != normalize_class_name(
                        row["class_name"]
                    ):
                        return jsonify({"error": "Task class does not match recording class"}), 400
                    conn.execute(
                        "UPDATE recorded_lessons SET calendar_task_id = ?, updated_at = ? WHERE id = ?",
                        (tid, _now_iso(), lesson_id),
                    )

            updates = []
            params = []
            if title is not None:
                updates.append("title = ?")
                params.append(str(title).strip()[:200])
            if description is not None:
                updates.append("description = ?")
                params.append(str(description).strip()[:2000])
            if visibility is not None:
                v = str(visibility).strip().lower()
                if v not in (VISIBILITY_DRAFT, VISIBILITY_PUBLISHED):
                    return jsonify({"error": "visibility must be draft or published"}), 400
                updates.append("visibility = ?")
                params.append(v)
            if not updates:
                return jsonify({"lesson": lesson_row_to_dict(row)})
            updates.append("updated_at = ?")
            params.append(_now_iso())
            params.append(lesson_id)
            conn.execute(
                f"UPDATE recorded_lessons SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
            row = conn.execute(_SELECT + " WHERE id = ?", (lesson_id,)).fetchone()
            lesson = _attach_task_meta_to_lesson(conn, lesson_row_to_dict(row))
            return jsonify({"lesson": lesson})
        finally:
            conn.close()

    @app.route("/api/teacher/recorded-lessons/<int:lesson_id>/stream", methods=["GET"])
    def teacher_recorded_lesson_stream(lesson_id):
        from app import get_db_connection, require_session_role_if_enabled

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err
            row = conn.execute(_SELECT + " WHERE id = ?", (lesson_id,)).fetchone()
            if not row:
                return jsonify({"error": "Lesson not found"}), 404
            from app import (
                enforce_teacher_class_access_if_enabled,
                get_effective_teacher_username,
                should_enforce_membership,
                should_require_session_identity,
            )

            teacher_username = get_effective_teacher_username(conn, None)
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "Not authenticated as teacher"}), 401
                err = enforce_teacher_class_access_if_enabled(
                    conn, teacher_username, row["class_name"]
                )
                if err is not None:
                    return err
            return _stream_video(_upload_root(), row["file_path"], row["file_ext"])
        finally:
            conn.close()

    @app.route("/api/student/recorded-lessons", methods=["GET"])
    def student_recorded_lessons_collection():
        from app import get_db_connection, resolve_student_with_optional_enforcement

        conn = get_db_connection()
        try:
            class_name = str(request.args.get("class_name") or "").strip()
            if not class_name:
                return jsonify({"error": "class_name is required"}), 400
            _student_username, err = resolve_student_with_optional_enforcement(
                conn, request.args.get("student_username"), class_name
            )
            if err is not None:
                return err
            rows = conn.execute(
                _SELECT
                + " WHERE class_name = ? AND visibility = ? ORDER BY created_at DESC",
                (class_name, VISIBILITY_PUBLISHED),
            ).fetchall()
            lessons = []
            for r in rows:
                d = lesson_row_to_dict(r)
                d.pop("file_path", None)
                lessons.append(d)
            return jsonify({"lessons": lessons, "class_name": class_name})
        finally:
            conn.close()

    @app.route("/api/student/recorded-lessons/<int:lesson_id>/stream", methods=["GET"])
    def student_recorded_lesson_stream(lesson_id):
        from app import get_db_connection, resolve_student_with_optional_enforcement

        conn = get_db_connection()
        try:
            row = conn.execute(_SELECT + " WHERE id = ?", (lesson_id,)).fetchone()
            if not row:
                return jsonify({"error": "Lesson not found"}), 404
            if (row["visibility"] or "") != VISIBILITY_PUBLISHED:
                return jsonify({"error": "Lesson not available"}), 403
            class_name = row["class_name"] or ""
            _student_username, err = resolve_student_with_optional_enforcement(
                conn, request.args.get("student_username"), class_name
            )
            if err is not None:
                return err
            resp = _stream_video(_upload_root(), row["file_path"], row["file_ext"])
            if isinstance(resp, Response):
                resp.headers["Cache-Control"] = "private, no-store"
                resp.headers["X-Content-Type-Options"] = "nosniff"
            return resp
        finally:
            conn.close()
