"""Phase N3/N5 — Tencent VOD webhook + play-auth + upload-sign routes."""
from __future__ import annotations

import logging
from typing import Any, Callable

from flask import Response, jsonify, request

from eap_config import config

from tencent_vod import (
    VOD_STATUS_FAILED,
    VOD_STATUS_PENDING,
    VOD_STATUS_READY,
    VOD_STATUS_TRANSCODING,
    apply_upload_signature,
    build_play_auth,
    generate_client_upload_signature,
    parse_vod_callback_event,
    verify_callback_signature,
    vod_enabled,
    vod_status_payload,
)

log = logging.getLogger("eap.tencent_vod.routes")


def _update_lesson_vod_status(
    conn,
    *,
    vod_file_id: str,
    status: str,
    message: str = "",
) -> int:
    from recorded_lessons import _now_iso

    now = _now_iso()
    cur = conn.execute(
        """
        UPDATE recorded_lessons
        SET vod_status = ?, vod_error = ?, updated_at = ?
        WHERE vod_file_id = ?
        """,
        (status, (message or "")[:500] or None, now, vod_file_id),
    )
    conn.commit()
    return int(cur.rowcount or 0)


def register_tencent_vod_routes(
    app,
    *,
    get_db_connection: Callable,
    require_session_role_if_enabled: Callable,
) -> None:
    @app.route("/api/webhooks/tencent-vod", methods=["POST"])
    def tencent_vod_webhook():
        raw = request.get_data(cache=True) or b""
        sign = request.headers.get("X-VOD-Signature") or request.args.get("sign")
        if not verify_callback_signature(raw, sign):
            log.warning("VOD webhook rejected — bad signature")
            return jsonify({"error": "Invalid signature"}), 403

        try:
            data = request.get_json(force=True, silent=False) or {}
        except Exception:
            data = {}
        if not data and raw:
            try:
                import json as _json

                data = _json.loads(raw.decode("utf-8"))
            except Exception:
                data = {}

        event = parse_vod_callback_event(data)
        if not event:
            return jsonify({"ok": True, "ignored": True})

        conn = get_db_connection()
        try:
            updated = _update_lesson_vod_status(
                conn,
                vod_file_id=event["file_id"],
                status=event["status"],
                message=str(event.get("message") or ""),
            )
            if updated == 0:
                log.info("VOD webhook: no lesson for file_id=%s status=%s", event["file_id"], event["status"])
            return jsonify({"ok": True, "updated": updated, "fileId": event["file_id"], "status": event["status"]})
        finally:
            conn.close()

    @app.route("/api/teacher/recorded-lessons/vod/status", methods=["GET"])
    def teacher_vod_status():
        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err:
                return err
            return jsonify(vod_status_payload())
        finally:
            conn.close()

    @app.route("/api/teacher/recorded-lessons/vod/upload-sign", methods=["POST"])
    def teacher_vod_upload_sign():
        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err:
                return err
            if not vod_enabled():
                return jsonify({"error": "VOD not configured"}), 503
            from app import get_effective_teacher_username

            teacher_username = get_effective_teacher_username(conn, None) or "eap-teacher"
            body = request.get_json(silent=True) or {}
            media_name = str(body.get("mediaName") or body.get("title") or "recording").strip()[:128]
            media_ext = str(body.get("mediaExt") or "mp4").strip().lstrip(".")[:16]
            try:
                signature = generate_client_upload_signature(teacher_username)
            except Exception as exc:
                log.exception("VOD upload signature failed")
                return jsonify({"error": str(exc)}), 502
            payload: dict[str, Any] = {
                "signature": signature,
                "appId": int(config.VOD_APP_ID),
                "vod": vod_status_payload(),
            }
            if body.get("includeApplyUpload"):
                try:
                    payload["upload"] = apply_upload_signature(media_name, media_ext)
                except Exception as exc:
                    payload["applyUploadError"] = str(exc)
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/api/teacher/recorded-lessons/vod/register", methods=["POST"])
    def teacher_vod_register():
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_effective_teacher_username,
            normalize_class_name,
            should_enforce_membership,
            should_require_session_identity,
        )
        from recorded_lessons import (
            VISIBILITY_DRAFT,
            VISIBILITY_PUBLISHED,
            _create_calendar_task_for_recording,
            create_vod_lesson_record,
        )

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err:
                return err
            if not vod_enabled():
                return jsonify({"error": "VOD not configured"}), 503

            body = request.get_json(silent=True) or {}
            class_name = str(body.get("class_name") or body.get("className") or "").strip()
            title = str(body.get("title") or "").strip()[:200]
            vod_file_id = str(body.get("vodFileId") or body.get("vod_file_id") or "").strip()
            file_name = str(body.get("fileName") or body.get("file_name") or title or "recording.mp4")[:512]
            file_ext = str(body.get("fileExt") or body.get("file_ext") or "mp4").lower().lstrip(".")[:16]
            file_size = int(body.get("fileSizeBytes") or body.get("file_size_bytes") or 0)
            description = str(body.get("description") or "").strip()[:2000]
            task_date = str(body.get("task_date") or body.get("taskDate") or "").strip()[:10]
            create_task = str(body.get("create_calendar_task") or body.get("createCalendarTask") or "").lower() in (
                "1",
                "true",
                "yes",
            )
            calendar_task_id = None
            raw_tid = body.get("calendar_task_id") or body.get("calendarTaskId")
            if raw_tid and str(raw_tid).strip().isdigit():
                calendar_task_id = int(raw_tid)
            vis_raw = str(body.get("visibility") or "").strip().lower()
            visibility = VISIBILITY_PUBLISHED if vis_raw == VISIBILITY_PUBLISHED else VISIBILITY_DRAFT

            if not class_name:
                return jsonify({"error": "class_name is required"}), 400
            if not title:
                return jsonify({"error": "title is required"}), 400
            if not vod_file_id:
                return jsonify({"error": "vodFileId is required"}), 400

            teacher_username = get_effective_teacher_username(conn, body.get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "Not authenticated as teacher"}), 401
                err = enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name)
                if err is not None:
                    return err

            class_norm = normalize_class_name(class_name)
            if create_task:
                if not task_date:
                    return jsonify({"error": "task_date is required to create a calendar task"}), 400
                calendar_task_id = _create_calendar_task_for_recording(conn, class_norm, task_date, title)
            elif calendar_task_id is not None:
                task_row = conn.execute(
                    "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
                    (calendar_task_id,),
                ).fetchone()
                if not task_row:
                    return jsonify({"error": "Calendar task not found"}), 404
                if normalize_class_name(task_row["class_name"]) != class_norm:
                    return jsonify({"error": "Task class does not match recording class"}), 400

            lesson = create_vod_lesson_record(
                conn,
                class_name=class_norm,
                teacher_username=teacher_username or "",
                title=title,
                description=description,
                vod_file_id=vod_file_id,
                file_name=file_name,
                file_ext=file_ext,
                file_size_bytes=file_size,
                calendar_task_id=calendar_task_id,
                visibility=visibility,
            )
            return jsonify({"lesson": lesson, "calendar_task_id": calendar_task_id}), 201
        finally:
            conn.close()

    @app.route("/api/student/recorded-lessons/<int:lesson_id>/play-auth", methods=["GET"])
    def student_recorded_play_auth(lesson_id: int):
        from recorded_lessons import VISIBILITY_PUBLISHED

        conn = get_db_connection()
        try:
            row = conn.execute(
                """
                SELECT id, class_name, visibility, vod_file_id, vod_status, file_path, file_ext
                FROM recorded_lessons WHERE id = ?
                """,
                (lesson_id,),
            ).fetchone()
            if not row:
                return jsonify({"error": "Lesson not found"}), 404
            if (row["visibility"] or "") != VISIBILITY_PUBLISHED:
                return jsonify({"error": "Lesson not available"}), 403

            from app import resolve_student_with_optional_enforcement

            class_name = row["class_name"] or ""
            student_username, err = resolve_student_with_optional_enforcement(
                conn, request.args.get("student_username"), class_name
            )
            if err is not None:
                return err

            vod_file_id = str(row["vod_file_id"] or "").strip()
            vod_status = str(row["vod_status"] or "local").strip()

            if vod_enabled() and vod_file_id and vod_status == VOD_STATUS_READY:
                try:
                    auth = build_play_auth(vod_file_id, student_username or "")
                    return jsonify(auth)
                except Exception as exc:
                    log.warning("VOD play-auth failed lesson=%s: %s", lesson_id, exc)

            if vod_file_id and vod_status in (VOD_STATUS_PENDING, VOD_STATUS_TRANSCODING):
                return jsonify(
                    {
                        "mode": "processing",
                        "vodStatus": vod_status,
                        "message": "Video is still processing. Try again shortly.",
                    }
                ), 202

            if vod_file_id and vod_status == VOD_STATUS_FAILED:
                fallback = bool(row["file_path"])
                return jsonify(
                    {
                        "mode": "failed",
                        "vodStatus": vod_status,
                        "fallbackLocal": fallback,
                        "message": "Cloud transcode failed.",
                    }
                ), 409

            stream_path = f"/api/student/recorded-lessons/{lesson_id}/stream"
            return jsonify(
                {
                    "mode": "local",
                    "streamUrl": stream_path,
                    "fileExt": row["file_ext"] or "",
                }
            )
        finally:
            conn.close()
