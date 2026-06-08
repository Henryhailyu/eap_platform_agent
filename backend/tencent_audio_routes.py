"""SS-Sp4 — audio status API."""
from __future__ import annotations

from typing import Callable

from flask import jsonify

from tencent_audio import audio_status


def register_tencent_audio_routes(
    app,
    *,
    require_session_role_if_enabled: Callable,
    get_db_connection: Callable,
) -> None:
    @app.route("/api/student/self-study/audio/status", methods=["GET"])
    def student_audio_status():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        conn.close()
        if err:
            return err
        return jsonify(audio_status())

    @app.route("/api/admin/self-study/audio/status", methods=["GET"])
    def admin_audio_status():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "manager")
        if err:
            err = require_session_role_if_enabled(conn, "admin")
        conn.close()
        if err:
            return err
        return jsonify(audio_status())
