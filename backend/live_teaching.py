"""
Live Teaching — teacher sessions and student responses (Phase L27).

Tables: live_sessions, live_launches, live_responses.
Routes registered via register_live_teaching_routes(app) from app.py.
"""
import json
import random
import string
from datetime import datetime, timezone


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_live_teaching_tables(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS live_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_code TEXT UNIQUE NOT NULL,
            class_name TEXT NOT NULL,
            teacher_username TEXT,
            session_date TEXT,
            created_at TEXT NOT NULL,
            active_launch_id INTEGER
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS live_launches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES live_sessions(id),
            question_json TEXT NOT NULL,
            launched_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS live_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            launch_id INTEGER NOT NULL REFERENCES live_launches(id),
            student_username TEXT NOT NULL,
            team_id TEXT NOT NULL,
            answer_index INTEGER NOT NULL,
            answer_text TEXT,
            correct INTEGER NOT NULL DEFAULT 0,
            submitted_at TEXT NOT NULL,
            UNIQUE(launch_id, student_username)
        )
    """)


_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _new_session_code(conn):
    for _ in range(32):
        code = "".join(random.choices(_CODE_CHARS, k=6))
        row = conn.execute(
            "SELECT id FROM live_sessions WHERE session_code = ?",
            (code,),
        ).fetchone()
        if not row:
            return code
    raise RuntimeError("Could not allocate live session code")


def _session_by_code(conn, code):
    return conn.execute(
        """
        SELECT id, session_code, class_name, teacher_username, session_date,
               created_at, active_launch_id
        FROM live_sessions WHERE session_code = ?
        """,
        (code.upper().strip(),),
    ).fetchone()


def _launch_row(conn, launch_id):
    return conn.execute(
        "SELECT id, session_id, question_json, launched_at FROM live_launches WHERE id = ?",
        (launch_id,),
    ).fetchone()


def _question_payload(launch_row):
    if not launch_row:
        return None
    try:
        return json.loads(launch_row["question_json"])
    except (TypeError, json.JSONDecodeError):
        return None


def register_live_teaching_routes(app):
    from flask import jsonify, request

    @app.route("/api/teacher/live/sessions", methods=["POST"])
    def teacher_live_create_session():
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        data = request.get_json(silent=True) or {}
        class_name = str(data.get("class_name") or "").strip() or "EAP047"
        session_date = str(data.get("date") or "").strip() or None

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err
            teacher_username = get_effective_teacher_username(conn, data.get("teacher_username"))
            if (should_require_session_identity() or should_enforce_membership()) and not teacher_username:
                return jsonify({"error": "teacher_username is required"}), 400
            err = enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name)
            if err is not None:
                return err

            code = _new_session_code(conn)
            now = utc_now_iso()
            cur = conn.execute(
                """
                INSERT INTO live_sessions
                    (session_code, class_name, teacher_username, session_date, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (code, class_name, teacher_username, session_date, now),
            )
            conn.commit()
            session_id = cur.lastrowid
            join_path = f"/ui/student-live.html?code={code}"
            join_url = request.host_url.rstrip("/") + join_path
            return jsonify(
                {
                    "session_id": session_id,
                    "session_code": code,
                    "class_name": class_name,
                    "join_path": join_path,
                    "join_url": join_url,
                }
            )
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/launch", methods=["POST"])
    def teacher_live_launch(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        data = request.get_json(silent=True) or {}
        question = data.get("question")
        if not question or not isinstance(question, dict):
            return jsonify({"error": "question object is required"}), 400

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err

            sess = _session_by_code(conn, session_code)
            if not sess:
                return jsonify({"error": "Session not found"}), 404

            teacher_username = get_effective_teacher_username(conn, data.get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(
                    conn, teacher_username, sess["class_name"]
                )
                if err is not None:
                    return err

            now = utc_now_iso()
            qjson = json.dumps(question, ensure_ascii=False)
            cur = conn.execute(
                """
                INSERT INTO live_launches (session_id, question_json, launched_at)
                VALUES (?, ?, ?)
                """,
                (sess["id"], qjson, now),
            )
            launch_id = cur.lastrowid
            conn.execute(
                "UPDATE live_sessions SET active_launch_id = ? WHERE id = ?",
                (launch_id, sess["id"]),
            )
            conn.commit()
            return jsonify(
                {
                    "launch_id": launch_id,
                    "session_code": sess["session_code"],
                    "launched_at": now,
                }
            )
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/responses", methods=["GET"])
    def teacher_live_responses(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        launch_id = request.args.get("launch_id", type=int)

        conn = get_db_connection()
        try:
            err = require_session_role_if_enabled(conn, "teacher")
            if err is not None:
                return err

            sess = _session_by_code(conn, session_code)
            if not sess:
                return jsonify({"error": "Session not found"}), 404

            teacher_username = get_effective_teacher_username(conn, request.args.get("teacher_username"))
            if should_require_session_identity() or should_enforce_membership():
                if not teacher_username:
                    return jsonify({"error": "teacher_username is required"}), 400
                err = enforce_teacher_class_access_if_enabled(
                    conn, teacher_username, sess["class_name"]
                )
                if err is not None:
                    return err

            lid = launch_id or sess["active_launch_id"]
            if not lid:
                return jsonify({"launch_id": None, "responses": [], "count": 0})

            launch = _launch_row(conn, lid)
            if not launch or launch["session_id"] != sess["id"]:
                return jsonify({"error": "Launch not found"}), 404

            rows = conn.execute(
                """
                SELECT student_username, team_id, answer_index, answer_text,
                       correct, submitted_at
                FROM live_responses
                WHERE launch_id = ?
                ORDER BY submitted_at ASC
                """,
                (lid,),
            ).fetchall()

            launched_at = launch["launched_at"]
            out = []
            for r in rows:
                try:
                    launched_dt = datetime.fromisoformat(launched_at.replace("Z", "+00:00"))
                    submitted_dt = datetime.fromisoformat(r["submitted_at"].replace("Z", "+00:00"))
                    time_sec = max(0, int((submitted_dt - launched_dt).total_seconds()))
                except (ValueError, TypeError):
                    time_sec = 0
                out.append(
                    {
                        "student": r["student_username"],
                        "teamId": r["team_id"],
                        "answer": r["answer_text"] or "",
                        "answerIndex": r["answer_index"],
                        "correct": bool(r["correct"]),
                        "timeSec": time_sec,
                    }
                )

            return jsonify(
                {
                    "launch_id": lid,
                    "question": _question_payload(launch),
                    "responses": out,
                    "count": len(out),
                }
            )
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>", methods=["GET"])
    def student_live_join(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement

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

            lid = sess["active_launch_id"]
            question = None
            launched_at = None
            if lid:
                launch = _launch_row(conn, lid)
                question = _question_payload(launch)
                launched_at = launch["launched_at"] if launch else None

            return jsonify(
                {
                    "session_code": sess["session_code"],
                    "class_name": sess["class_name"],
                    "student_username": student_username,
                    "active": question is not None,
                    "launch_id": lid,
                    "launched_at": launched_at,
                    "question": question,
                }
            )
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/respond", methods=["POST"])
    def student_live_respond(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement

        data = request.get_json(silent=True) or {}
        team_id = str(data.get("team_id") or "").strip().upper()
        if team_id not in ("A", "B", "C", "D"):
            return jsonify({"error": "team_id must be A, B, C, or D"}), 400
        try:
            answer_index = int(data.get("answer_index"))
        except (TypeError, ValueError):
            return jsonify({"error": "answer_index is required"}), 400

        conn = get_db_connection()
        try:
            sess = _session_by_code(conn, session_code)
            if not sess:
                return jsonify({"error": "Session not found"}), 404

            student_username, err = resolve_student_with_optional_enforcement(
                conn, data.get("student_username"), sess["class_name"]
            )
            if err is not None:
                return err

            lid = sess["active_launch_id"]
            if not lid:
                return jsonify({"error": "No active question"}), 409

            launch = _launch_row(conn, lid)
            question = _question_payload(launch)
            if not question:
                return jsonify({"error": "Invalid launch"}), 500

            opts_en = question.get("optionsEn") or []
            opts_zh = question.get("optionsZh") or []
            opts = opts_en if len(opts_en) >= len(opts_zh) else opts_zh
            if answer_index < 0 or answer_index >= len(opts):
                return jsonify({"error": "answer_index out of range"}), 400

            correct_index = int(question.get("correctIndex", -1))
            correct = 1 if answer_index == correct_index else 0
            answer_text = opts[answer_index]
            now = utc_now_iso()

            conn.execute(
                """
                INSERT INTO live_responses
                    (launch_id, student_username, team_id, answer_index, answer_text,
                     correct, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(launch_id, student_username) DO UPDATE SET
                    team_id = excluded.team_id,
                    answer_index = excluded.answer_index,
                    answer_text = excluded.answer_text,
                    correct = excluded.correct,
                    submitted_at = excluded.submitted_at
                """,
                (lid, student_username, team_id, answer_index, answer_text, correct, now),
            )
            conn.commit()
            return jsonify(
                {
                    "ok": True,
                    "correct": bool(correct),
                    "launch_id": lid,
                    "submitted_at": now,
                }
            )
        finally:
            conn.close()
