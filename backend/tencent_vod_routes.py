"""Phase N3/N5 — Tencent VOD webhook + play-auth + upload-sign routes."""
from __future__ import annotations

import logging
from typing import Any, Callable

from flask import Response, jsonify, request

from tencent_vod import (
    VOD_STATUS_FAILED,
    VOD_STATUS_PENDING,
    VOD_STATUS_READY,
    VOD_STATUS_TRANSCODING,
    apply_upload_signature,
    build_play_auth,
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
            body = request.get_json(silent=True) or {}
            media_name = str(body.get("mediaName") or body.get("title") or "recording").strip()[:128]
            media_ext = str(body.get("mediaExt") or "mp4").strip().lstrip(".")[:16]
            try:
                sig = apply_upload_signature(media_name, media_ext)
            except Exception as exc:
                log.exception("ApplyUpload failed")
                return jsonify({"error": str(exc)}), 502
            return jsonify({"upload": sig, "vod": vod_status_payload()})
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
