"""Extra teaching materials per calendar task (multiple files per task)."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from flask import jsonify, request

log = logging.getLogger("eap.task_materials")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_task_materials_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS task_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES calendar_tasks(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_materials_task_id ON task_materials(task_id)"
    )


def enrich_task_dicts_with_materials(conn, task_dicts: list) -> list:
    if not task_dicts:
        return task_dicts
    task_ids = [int(t["id"]) for t in task_dicts if t.get("id") is not None]
    if not task_ids:
        return task_dicts
    placeholders = ",".join("?" * len(task_ids))
    rows = conn.execute(
        f"""
        SELECT id, task_id, file_path, file_name, sort_order
        FROM task_materials
        WHERE task_id IN ({placeholders})
        ORDER BY task_id, sort_order, id
        """,
        task_ids,
    ).fetchall()
    by_task: dict[int, list] = {tid: [] for tid in task_ids}
    for r in rows:
        tid = int(r["task_id"])
        by_task.setdefault(tid, []).append(
            {
                "id": r["id"],
                "file_path": r["file_path"] or "",
                "file_name": r["file_name"] or "",
            }
        )
    for t in task_dicts:
        tid = int(t["id"]) if t.get("id") is not None else None
        extras = by_task.get(tid, []) if tid is not None else []
        t["materials"] = extras
        if extras and not (t.get("file_path") and str(t.get("file_path")).strip()):
            first = extras[0]
            t["file_path"] = first.get("file_path")
            t["file_name"] = first.get("file_name")
    return task_dicts


def register_task_materials_routes(app) -> None:
    @app.route("/api/tasks/<int:task_id>/materials", methods=["POST"])
    def add_task_material(task_id: int):
        from app import (
            UPLOAD_DIR,
            allowed_file_extension,
            ensure_uploads_directory,
            get_db_connection,
            resolve_teacher_with_optional_enforcement,
            task_to_dict,
        )

        from app import require_session_role_if_enabled

        ensure_uploads_directory()
        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err
            row = conn.execute(
                "SELECT id, class_name, file_path, file_name FROM calendar_tasks WHERE id = ?",
                (task_id,),
            ).fetchone()
            if row is None:
                return jsonify({"error": "Task not found"}), 404

            err = resolve_teacher_with_optional_enforcement(conn, None, row["class_name"])
            if err is not None:
                return err

            if "file" not in request.files:
                return jsonify({"error": 'Missing form part named "file"'}), 400
            upload = request.files["file"]
            if upload is None or upload.filename is None or not str(upload.filename).strip():
                return jsonify({"error": "No file selected"}), 400
            if not allowed_file_extension(upload.filename):
                return jsonify(
                    {
                        "error": (
                            "File type not allowed. Allowed: pdf, doc, docx, ppt, pptx, "
                            "mp3, mp4, txt, jpg, png"
                        )
                    }
                ), 400

            ext = upload.filename.rsplit(".", 1)[-1].lower()
            stored_name = f"{uuid.uuid4().hex}.{ext}"
            dest_abs = os.path.join(UPLOAD_DIR, stored_name)
            display_name = os.path.basename(upload.filename.strip())[:512]
            upload.save(dest_abs)

            count_row = conn.execute(
                "SELECT COUNT(*) AS c FROM task_materials WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            sort_order = int(count_row["c"] if count_row else 0)
            now = _now_iso()
            cur = conn.execute(
                """
                INSERT INTO task_materials (task_id, file_path, file_name, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (task_id, stored_name, display_name, sort_order, now),
            )
            if not (row["file_path"] and str(row["file_path"]).strip()):
                conn.execute(
                    "UPDATE calendar_tasks SET file_path = ?, file_name = ? WHERE id = ?",
                    (stored_name, display_name, task_id),
                )
            conn.commit()
            mat_row = conn.execute(
                "SELECT id, task_id, file_path, file_name FROM task_materials WHERE id = ?",
                (cur.lastrowid,),
            ).fetchone()
            task_row = conn.execute("SELECT * FROM calendar_tasks WHERE id = ?", (task_id,)).fetchone()
            return (
                jsonify(
                    {
                        "material": {
                            "id": mat_row["id"],
                            "task_id": mat_row["task_id"],
                            "file_path": mat_row["file_path"],
                            "file_name": mat_row["file_name"],
                        },
                        "task": task_to_dict(task_row),
                    }
                ),
                201,
            )
        finally:
            conn.close()
