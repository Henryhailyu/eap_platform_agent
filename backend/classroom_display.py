"""
K6d — persistent classroom display library per class (HTML + uploaded files).
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone

log = logging.getLogger("eap.classroom_display")

OFFICE_TO_PDF_EXTS = frozenset({"ppt", "pptx", "doc", "docx"})
ALLOWED_DISPLAY_FILE_EXTENSIONS = frozenset({"pdf", "ppt", "pptx", "doc", "docx", "txt"})
MAX_DISPLAY_FILE_BYTES = 25 * 1024 * 1024


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def allowed_display_extension(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[-1].lower() in ALLOWED_DISPLAY_FILE_EXTENSIONS


def item_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "class_name": row["class_name"] or "",
        "item_type": row["item_type"] or "",
        "title": row["title"] or "",
        "page_id": row["page_id"],
        "file_path": row["file_path"] or "",
        "file_name": row["file_name"] or "",
        "file_ext": row["file_ext"] or "",
        "sort_order": row["sort_order"] or 0,
        "created_at": row["created_at"] or "",
        "updated_at": row["updated_at"] or "",
    }


def init_classroom_display_tables(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS classroom_display_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            teacher_username TEXT NOT NULL,
            item_type TEXT NOT NULL,
            title TEXT NOT NULL,
            page_id INTEGER,
            file_path TEXT,
            file_name TEXT,
            file_ext TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS classroom_display_state (
            class_name TEXT PRIMARY KEY,
            active_item_id INTEGER,
            updated_at TEXT NOT NULL
        )
        """
    )


DISPLAY_FILE_SUBDIR = "classroom-display"


def normalize_display_stored_path(file_path: str) -> str:
    fp = str(file_path or "").strip().replace("\\", "/")
    if fp.startswith("uploads/"):
        fp = fp[len("uploads/") :]
    if not fp:
        return ""
    if "/" not in fp:
        fp = f"{DISPLAY_FILE_SUBDIR}/{os.path.basename(fp)}"
    return fp


def display_file_public_url(file_path: str, request_host_url: str = "") -> str:
    fp = normalize_display_stored_path(file_path)
    if not fp:
        return ""
    base = (request_host_url or "").rstrip("/")
    return f"{base}/uploads/{fp}"


def display_file_basename(file_path: str) -> str:
    fp = normalize_display_stored_path(file_path)
    return os.path.basename(fp) if fp else ""


def classroom_display_upload_dir(base_upload_dir: str) -> str:
    path = os.path.join(base_upload_dir, DISPLAY_FILE_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def save_display_file(upload_dir: str, original_name: str, data: bytes) -> tuple[str, str]:
    ext = original_name.rsplit(".", 1)[-1].lower()
    stored = f"{uuid.uuid4().hex}.{ext}"
    dest = os.path.join(upload_dir, stored)
    with open(dest, "wb") as fh:
        fh.write(data)
    rel = f"{DISPLAY_FILE_SUBDIR}/{stored}"
    return rel, dest


def previews_dir(upload_dir: str) -> str:
    path = os.path.join(upload_dir, "previews")
    os.makedirs(path, exist_ok=True)
    return path


def _find_soffice_binary() -> str | None:
    """Locate LibreOffice headless binary (PATH, Linux Docker, or default macOS install)."""
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    for path in (
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ):
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def ensure_pdf_preview(upload_dir: str, file_path: str) -> str | None:
    """Convert Office file to PDF for inline classroom display (requires LibreOffice)."""
    rel = normalize_display_stored_path(file_path)
    if not rel:
        return None
    ext = rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
    if ext not in OFFICE_TO_PDF_EXTS:
        return None
    base_name = os.path.basename(rel)
    src = os.path.join(upload_dir, base_name)
    if not os.path.isfile(src):
        return None
    out_dir = previews_dir(upload_dir)
    preview_name = f"{os.path.splitext(base_name)[0]}.pdf"
    dest = os.path.join(out_dir, preview_name)
    preview_rel = f"{DISPLAY_FILE_SUBDIR}/previews/{preview_name}"
    if os.path.isfile(dest) and os.path.getmtime(dest) >= os.path.getmtime(src):
        return preview_rel
    soffice = _find_soffice_binary()
    if not soffice:
        log.warning("LibreOffice (soffice) not found — cannot preview %s", rel)
        return None
    profile_dir = os.path.join("/tmp", f"lo_profile_{os.getpid()}")
    os.makedirs(profile_dir, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--invisible",
        f"-env:UserInstallation=file://{profile_dir}",
        "--convert-to",
        "pdf",
        "--outdir",
        out_dir,
        src,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=120, check=False)
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or b"").decode("utf-8", errors="replace")[:500]
            log.warning("soffice convert failed (%s): %s", proc.returncode, err)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("soffice convert error: %s", exc)
        return None
    if os.path.isfile(dest):
        return preview_rel
    for name in os.listdir(out_dir):
        if name.lower().endswith(".pdf") and name.startswith(os.path.splitext(base_name)[0]):
            return f"{DISPLAY_FILE_SUBDIR}/previews/{name}"
    return None


def enrich_file_item(
    item: dict,
    request_host_url: str = "",
    upload_dir: str | None = None,
    *,
    build_preview: bool = True,
) -> dict:
    if str(item.get("item_type") or "").lower() != "file":
        return item
    fp = item.get("file_path") or ""
    item["download_url"] = display_file_public_url(fp, request_host_url)
    preview_rel = (
        ensure_pdf_preview(upload_dir, fp) if upload_dir and fp and build_preview else None
    )
    item["preview_pdf_url"] = display_file_public_url(preview_rel, request_host_url) if preview_rel else ""
    return item


def delete_display_file(upload_dir: str, stored_name: str | None) -> None:
    if not stored_name:
        return
    path = os.path.join(upload_dir, os.path.basename(stored_name))
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    base = os.path.basename(normalize_display_stored_path(stored_name))
    if base:
        preview = os.path.join(previews_dir(upload_dir), f"{os.path.splitext(base)[0]}.pdf")
        if os.path.isfile(preview):
            try:
                os.remove(preview)
            except OSError:
                pass


def display_file_mode(ext: str) -> str:
    e = str(ext or "").lower()
    if e == "pdf":
        return "pdf"
    if e == "txt":
        return "text"
    if e in ("ppt", "pptx"):
        return "presentation"
    if e in ("doc", "docx"):
        return "office"
    return "material"


def item_display_payload(item: dict, request_host_url: str = "", upload_dir: str | None = None) -> dict:
    """Map library item to live display push payload."""
    t = str(item.get("item_type") or "").lower()
    title = item.get("title") or ""
    if t == "html":
        return {"mode": "html", "title": title, "page_id": item.get("page_id"), "display_item_id": item.get("id")}
    if t == "file":
        file_path = item.get("file_path") or ""
        download_url = display_file_public_url(file_path, request_host_url)
        ext = (item.get("file_ext") or "").lower()
        preview_rel = ensure_pdf_preview(upload_dir, file_path) if upload_dir else None
        preview_url = display_file_public_url(preview_rel, request_host_url) if preview_rel else ""
        if ext == "pdf":
            mode, show_url = "pdf", download_url
        elif ext == "txt":
            mode, show_url = "text", download_url
        elif preview_url:
            mode, show_url = "pdf", preview_url
        else:
            mode = display_file_mode(ext)
            show_url = download_url
        return {
            "mode": mode,
            "title": title,
            "upload_label": item.get("file_name") or title,
            "file_url": show_url,
            "download_url": download_url,
            "preview_pdf_url": preview_url,
            "file_ext": ext,
            "display_item_id": item.get("id"),
        }
    return {"mode": "welcome", "title": title}


def register_classroom_display_routes(app):
    from flask import jsonify, request

    _ITEM_SELECT = """
        SELECT id, class_name, teacher_username, item_type, title, page_id,
               file_path, file_name, file_ext, sort_order, created_at, updated_at
        FROM classroom_display_items
    """

    def _upload_dir():
        from app import UPLOAD_DIR, ensure_uploads_directory

        ensure_uploads_directory()
        return classroom_display_upload_dir(UPLOAD_DIR)

    def _get_active_id(conn, class_name: str):
        row = conn.execute(
            "SELECT active_item_id FROM classroom_display_state WHERE class_name = ?",
            (class_name,),
        ).fetchone()
        return row["active_item_id"] if row else None

    def _set_active(conn, class_name: str, item_id: int | None):
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO classroom_display_state (class_name, active_item_id, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(class_name) DO UPDATE SET
                active_item_id = excluded.active_item_id,
                updated_at = excluded.updated_at
            """,
            (class_name, item_id, now),
        )

    @app.route("/api/teacher/classroom-display", methods=["GET", "POST"])
    def teacher_classroom_display_collection():
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

            class_name = str(request.args.get("class_name") or request.form.get("class_name") or "").strip()
            if not class_name and request.is_json:
                body = request.get_json(silent=True) or {}
                class_name = str(body.get("class_name") or "").strip()

            if request.method == "GET":
                if not class_name:
                    return jsonify({"error": "class_name is required"}), 400
                teacher_username = get_effective_teacher_username(conn, request.args.get("teacher_username"))
                if should_require_session_identity() or should_enforce_membership():
                    if not teacher_username:
                        return jsonify({"error": "teacher_username is required"}), 400
                    err = enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name)
                    if err is not None:
                        return err

                rows = conn.execute(
                    _ITEM_SELECT + " WHERE class_name = ? ORDER BY sort_order ASC, id ASC",
                    (class_name,),
                ).fetchall()
                ud = _upload_dir()
                host = request.host_url
                items = [enrich_file_item(item_row_to_dict(r), host, ud) for r in rows]
                active_id = _get_active_id(conn, class_name)
                return jsonify({"items": items, "active_item_id": active_id, "class_name": class_name})

            # POST — add html ref or upload file
            teacher_username = get_effective_teacher_username(
                conn,
                request.form.get("teacher_username") or (request.get_json(silent=True) or {}).get("teacher_username"),
            )
            if not class_name:
                class_name = str(request.form.get("class_name") or "").strip()
            if not class_name:
                body = request.get_json(silent=True) or {}
                class_name = str(body.get("class_name") or "").strip()
            if not class_name:
                return jsonify({"error": "class_name is required"}), 400
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name)
                if err is not None:
                    return err

            now = _now_iso()
            body = request.get_json(silent=True) or {}

            # HTML page reference
            page_id = request.form.get("page_id") or body.get("page_id")
            if page_id is not None and str(page_id).strip().isdigit():
                pid = int(page_id)
                page = conn.execute(
                    "SELECT id, title FROM teacher_teaching_pages WHERE id = ?",
                    (pid,),
                ).fetchone()
                if not page:
                    return jsonify({"error": "Teaching page not found"}), 404
                title = str(request.form.get("title") or body.get("title") or page["title"] or "").strip()[:200]
                cur = conn.execute(
                    """
                    INSERT INTO classroom_display_items
                        (class_name, teacher_username, item_type, title, page_id,
                         file_path, file_name, file_ext, sort_order, created_at, updated_at)
                    VALUES (?, ?, 'html', ?, ?, NULL, NULL, NULL, 0, ?, ?)
                    """,
                    (class_name, teacher_username or "", title, pid, now, now),
                )
                conn.commit()
                row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (cur.lastrowid,)).fetchone()
                ud = _upload_dir()
                item = enrich_file_item(item_row_to_dict(row), request.host_url, ud)
                return jsonify({"item": item}), 201

            upload = request.files.get("file")
            if upload and upload.filename:
                name = os.path.basename(upload.filename.strip())
                if not allowed_display_extension(name):
                    return jsonify({"error": "File type not allowed. Allowed: pdf, ppt, pptx, doc, docx, txt"}), 400
                data = upload.read()
                if len(data) > MAX_DISPLAY_FILE_BYTES:
                    return jsonify({"error": "File too large (max 25 MB)"}), 400
                ext = name.rsplit(".", 1)[-1].lower()
                stored, _dest = save_display_file(_upload_dir(), name, data)
                title = str(request.form.get("title") or name).strip()[:200]
                cur = conn.execute(
                    """
                    INSERT INTO classroom_display_items
                        (class_name, teacher_username, item_type, title, page_id,
                         file_path, file_name, file_ext, sort_order, created_at, updated_at)
                    VALUES (?, ?, 'file', ?, NULL, ?, ?, ?, 0, ?, ?)
                    """,
                    (class_name, teacher_username or "", title, stored, name[:512], ext, now, now),
                )
                conn.commit()
                row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (cur.lastrowid,)).fetchone()
                ud = _upload_dir()
                item = enrich_file_item(
                    item_row_to_dict(row), request.host_url, ud, build_preview=False
                )
                return jsonify({"item": item}), 201

            return jsonify({"error": "Provide page_id or file upload"}), 400
        finally:
            conn.close()

    @app.route("/api/teacher/classroom-display/<int:item_id>", methods=["DELETE"])
    def teacher_classroom_display_delete(item_id):
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

            row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (item_id,)).fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

            teacher_username = get_effective_teacher_username(conn, request.args.get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, row["class_name"])
                if err is not None:
                    return err

            if row["file_path"]:
                delete_display_file(_upload_dir(), row["file_path"])

            conn.execute("DELETE FROM classroom_display_items WHERE id = ?", (item_id,))
            active = _get_active_id(conn, row["class_name"])
            if active == item_id:
                _set_active(conn, row["class_name"], None)
            conn.commit()
            return jsonify({"success": True, "cleared_active": active == item_id})
        finally:
            conn.close()

    @app.route("/api/teacher/classroom-display/<int:item_id>/activate", methods=["PUT"])
    def teacher_classroom_display_activate(item_id):
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

            row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (item_id,)).fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

            teacher_username = get_effective_teacher_username(conn, (request.get_json(silent=True) or {}).get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, row["class_name"])
                if err is not None:
                    return err

            _set_active(conn, row["class_name"], item_id)
            conn.commit()
            ud = _upload_dir()
            item = enrich_file_item(item_row_to_dict(row), request.host_url, ud)
            display = item_display_payload(item, request.host_url, ud)
            return jsonify({"item": item, "display": display, "active_item_id": item_id})
        finally:
            conn.close()

    @app.route("/api/teacher/classroom-display/<int:item_id>/view", methods=["GET"])
    def teacher_classroom_display_view(item_id):
        """Inline PDF/file for teacher canvas (session auth; iframe-safe via fetch+blob on client)."""
        from flask import abort, send_from_directory

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

            row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (item_id,)).fetchone()
            if not row or str(row["item_type"] or "").lower() != "file":
                return jsonify({"error": "Not found"}), 404

            teacher_username = get_effective_teacher_username(conn, request.args.get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, row["class_name"])
                if err is not None:
                    return err

            ud = _upload_dir()
            file_path = row["file_path"] or ""
            ext = (row["file_ext"] or "").lower()
            preview_rel = ensure_pdf_preview(ud, file_path) if file_path else None
            if preview_rel:
                base = display_file_basename(preview_rel)
                preview_dir = previews_dir(ud)
                if base and os.path.isfile(os.path.join(preview_dir, base)):
                    return send_from_directory(
                        preview_dir,
                        base,
                        mimetype="application/pdf",
                        as_attachment=False,
                        download_name=base,
                    )
            if file_path:
                rel = normalize_display_stored_path(file_path)
                base = display_file_basename(rel)
                if base and os.path.isfile(os.path.join(ud, base)):
                    file_ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
                    if file_ext == "pdf":
                        return send_from_directory(
                            ud, base, mimetype="application/pdf", as_attachment=False, download_name=base
                        )
                    if file_ext == "txt":
                        return send_from_directory(
                            ud,
                            base,
                            mimetype="text/plain; charset=utf-8",
                            as_attachment=False,
                            download_name=base,
                        )
            abort(404)
        finally:
            conn.close()

    @app.route("/api/teacher/classroom-display/<int:item_id>/ensure-preview", methods=["POST"])
    def teacher_classroom_display_ensure_preview(item_id):
        """Build PDF preview for PPT/DOC (LibreOffice). Used after upload on Render."""
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

            row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (item_id,)).fetchone()
            if not row:
                return jsonify({"error": "Not found"}), 404

            teacher_username = get_effective_teacher_username(
                conn, (request.get_json(silent=True) or {}).get("teacher_username")
            )
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, row["class_name"])
                if err is not None:
                    return err

            item_raw = item_row_to_dict(row)
            if str(item_raw.get("item_type") or "").lower() != "file":
                return jsonify({"error": "Not a file item"}), 400

            ud = _upload_dir()
            ext = (item_raw.get("file_ext") or "").lower()
            preview_rel = ensure_pdf_preview(ud, item_raw.get("file_path") or "")
            item = enrich_file_item(item_raw, request.host_url, ud, build_preview=True)
            preview_ready = bool(item.get("preview_pdf_url"))
            soffice_ok = _find_soffice_binary() is not None
            message = ""
            if ext in OFFICE_TO_PDF_EXTS and not preview_ready:
                if not soffice_ok:
                    message = "LibreOffice is not installed on the server."
                else:
                    message = "Could not convert this file to PDF for preview. Try Download or re-upload."
            return jsonify(
                {
                    "item": item,
                    "display": item_display_payload(item, request.host_url, ud),
                    "preview_ready": preview_ready,
                    "message": message,
                }
            )
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/display-item", methods=["GET"])
    def student_live_display_item(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement
        from live_teaching import _display_payload, _session_by_code

        conn = get_db_connection()
        try:
            sess = _session_by_code(conn, session_code)
            if not sess:
                return jsonify({"error": "Session not found"}), 404

            student_username, err = resolve_student_with_optional_enforcement(
                conn, request.args.get("student_username"), sess["class_name"]
            )
            if err is not None:
                return err

            display = _display_payload(sess)
            item_id = None
            meta_raw = sess["display_json"]
            if meta_raw:
                try:
                    meta = json.loads(meta_raw)
                    item_id = meta.get("display_item_id")
                except (TypeError, json.JSONDecodeError):
                    pass

            if not item_id:
                active_id = conn.execute(
                    "SELECT active_item_id FROM classroom_display_state WHERE class_name = ?",
                    (sess["class_name"],),
                ).fetchone()
                item_id = active_id["active_item_id"] if active_id else None

            if not item_id:
                return jsonify({"error": "No active display item"}), 404

            row = conn.execute(_ITEM_SELECT + " WHERE id = ?", (int(item_id),)).fetchone()
            if not row:
                return jsonify({"error": "Display item not found"}), 404

            item = item_row_to_dict(row)
            ud = _upload_dir()
            item = enrich_file_item(item, request.host_url, ud)
            payload = {"item": item, "display": item_display_payload(item, request.host_url, ud)}
            if item["item_type"] == "html" and item["page_id"]:
                from live_teaching import inject_live_bridge

                page = conn.execute(
                    "SELECT html_content, title FROM teacher_teaching_pages WHERE id = ?",
                    (item["page_id"],),
                ).fetchone()
                if page:
                    from teacher_teaching_pages import polish_teaching_html

                    html_raw = polish_teaching_html(page["html_content"])
                    payload["html"] = inject_live_bridge(
                        html_raw,
                        sess["session_code"],
                        int(item["page_id"]),
                        request.host_url.rstrip("/"),
                    )
                    payload["title"] = page["title"] or item["title"]
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/uploads/classroom-display/<filename>", methods=["GET"])
    def download_classroom_display_upload(filename):
        from flask import abort, send_from_directory

        from app import (
            UPLOAD_DIR,
            ensure_uploads_directory,
            get_current_authenticated_user,
            get_db_connection,
            is_strict_security_enabled,
            is_student_enrolled_in_class,
            is_teacher_assigned_to_class,
            safe_download_basename,
        )

        base = safe_download_basename(filename)
        if base is None:
            abort(404)

        ensure_uploads_directory()
        upload_dir = classroom_display_upload_dir(UPLOAD_DIR)
        if not os.path.isfile(os.path.join(upload_dir, base)):
            abort(404)

        if is_strict_security_enabled():
            conn = get_db_connection()
            try:
                actor = get_current_authenticated_user(conn)
                if actor is None:
                    return jsonify({"error": "Not logged in"}), 401
                row = conn.execute(
                    """
                    SELECT class_name FROM classroom_display_items
                    WHERE file_path LIKE ? OR file_path = ?
                    LIMIT 1
                    """,
                    (f"%{base}", base),
                ).fetchone()
                if not row:
                    abort(404)
                class_name = row["class_name"]
                role = str(actor["role"] or "").strip()
                uname = str(actor["username"] or "").strip()
                allowed = role == "manager"
                if role == "teacher":
                    allowed = is_teacher_assigned_to_class(conn, uname, class_name)
                elif role == "student":
                    allowed = is_student_enrolled_in_class(conn, uname, class_name)
                if not allowed:
                    return jsonify({"error": "Forbidden"}), 403
            finally:
                conn.close()

        ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
        force_download = str(request.args.get("download") or "").strip() in ("1", "true", "yes")
        inline_types = {"pdf", "txt"}
        mimetypes_map = {
            "pdf": "application/pdf",
            "txt": "text/plain; charset=utf-8",
        }
        if not force_download and ext in inline_types:
            return send_from_directory(
                upload_dir,
                base,
                mimetype=mimetypes_map[ext],
                as_attachment=False,
                download_name=base,
            )
        return send_from_directory(
            upload_dir,
            base,
            as_attachment=True,
            download_name=base,
        )

    @app.route("/uploads/classroom-display/previews/<filename>", methods=["GET"])
    def download_classroom_display_preview(filename):
        from flask import abort, send_from_directory

        from app import (
            UPLOAD_DIR,
            ensure_uploads_directory,
            get_current_authenticated_user,
            get_db_connection,
            is_strict_security_enabled,
            is_student_enrolled_in_class,
            is_teacher_assigned_to_class,
            safe_download_basename,
        )

        base = safe_download_basename(filename)
        if base is None or not base.lower().endswith(".pdf"):
            abort(404)

        ensure_uploads_directory()
        upload_dir = classroom_display_upload_dir(UPLOAD_DIR)
        preview_path = os.path.join(previews_dir(upload_dir), base)
        if not os.path.isfile(preview_path):
            abort(404)

        if is_strict_security_enabled():
            conn = get_db_connection()
            try:
                actor = get_current_authenticated_user(conn)
                if actor is None:
                    return jsonify({"error": "Not logged in"}), 401
                row = conn.execute(
                    """
                    SELECT class_name FROM classroom_display_items
                    WHERE file_path LIKE ? LIMIT 1
                    """,
                    (f"%{base.split('.')[0]}%",),
                ).fetchone()
                if not row:
                    abort(404)
                class_name = row["class_name"]
                role = str(actor["role"] or "").strip()
                uname = str(actor["username"] or "").strip()
                allowed = role == "manager"
                if role == "teacher":
                    allowed = is_teacher_assigned_to_class(conn, uname, class_name)
                elif role == "student":
                    allowed = is_student_enrolled_in_class(conn, uname, class_name)
                if not allowed:
                    return jsonify({"error": "Forbidden"}), 403
            finally:
                conn.close()

        return send_from_directory(
            previews_dir(upload_dir),
            base,
            mimetype="application/pdf",
            as_attachment=False,
            download_name=base,
        )
