"""
Live Teaching — teacher sessions and student responses (Phase L27–L29, K6 display + activities).

Tables: live_sessions, live_launches, live_responses, live_page_activity_responses.
Routes registered via register_live_teaching_routes(app) from app.py.

L28: long-poll wait endpoints (Render-friendly; no WebSocket required).
K6: classroom display push (slides / HTML / material) + HTML activity responses.
"""
import json
import os
import random
import re
import string
import time
from datetime import datetime, timezone

_WAIT_POLL_SEC = 0.45
_WAIT_MAX_SEC = 25

_ACTIVITY_ID_RE = re.compile(r'data-eap-id=["\']([^"\']+)["\']', re.IGNORECASE)
_ACTIVITY_ANSWER_RE = re.compile(
    r'data-eap-(?:id=["\']([^"\']+)["\'][^>]*answer=["\']([^"\']+)["\']|answer=["\']([^"\']+)["\'][^>]*id=["\']([^"\']+)["\'])',
    re.IGNORECASE,
)


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def migrate_live_k6(conn):
    """Add K6 display columns to live_sessions."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(live_sessions)").fetchall()}
    if "display_mode" not in cols:
        conn.execute(
            "ALTER TABLE live_sessions ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'welcome'"
        )
    if "display_json" not in cols:
        conn.execute("ALTER TABLE live_sessions ADD COLUMN display_json TEXT")
    if "display_version" not in cols:
        conn.execute(
            "ALTER TABLE live_sessions ADD COLUMN display_version INTEGER NOT NULL DEFAULT 0"
        )


def init_live_teaching_tables(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS live_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_code TEXT UNIQUE NOT NULL,
            class_name TEXT NOT NULL,
            teacher_username TEXT,
            session_date TEXT,
            created_at TEXT NOT NULL,
            active_launch_id INTEGER,
            display_mode TEXT NOT NULL DEFAULT 'welcome',
            display_json TEXT,
            display_version INTEGER NOT NULL DEFAULT 0
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS live_page_activity_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES live_sessions(id),
            page_id INTEGER NOT NULL,
            activity_id TEXT NOT NULL,
            student_username TEXT NOT NULL,
            team_id TEXT,
            answer_text TEXT NOT NULL,
            answer_index INTEGER,
            is_correct INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            submitted_at TEXT NOT NULL,
            UNIQUE(session_id, page_id, activity_id, student_username)
        )
    """)
    migrate_live_k6(conn)


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
               created_at, active_launch_id, display_mode, display_json, display_version
        FROM live_sessions WHERE session_code = ?
        """,
        (code.upper().strip(),),
    ).fetchone()


def _display_file_path_from_urls(display: dict) -> str:
    """Resolve stored classroom-display path from public URLs in display payload."""
    from urllib.parse import unquote, urlparse

    from classroom_display import normalize_display_stored_path

    for key in ("download_url", "file_url"):
        url = str((display or {}).get(key) or "").strip()
        if not url or "classroom-display" not in url:
            continue
        path = unquote(urlparse(url).path or "")
        idx = path.find("classroom-display/")
        if idx < 0:
            continue
        rel = path[idx:].lstrip("/")
        if rel.startswith("classroom-display/previews/"):
            continue
        normalized = normalize_display_stored_path(rel)
        if normalized:
            return normalized
    return ""


def _display_payload(sess, request_host_url: str = ""):
    mode = str(sess["display_mode"] or "welcome").strip().lower()
    raw = sess["display_json"]
    meta = {}
    if raw:
        try:
            meta = json.loads(raw)
            if not isinstance(meta, dict):
                meta = {}
        except (TypeError, json.JSONDecodeError):
            meta = {}
    file_url = str(meta.get("file_url") or "").strip()
    preview_pdf_url = str(meta.get("preview_pdf_url") or "").strip()
    download_url = str(meta.get("download_url") or file_url or "").strip()
    file_ext = str(meta.get("file_ext") or "").strip().lower()
    if mode in {"presentation", "office", "upload", "material"} and preview_pdf_url:
        mode = "pdf"
        file_url = preview_pdf_url or file_url
    elif mode in {"presentation", "office"} and file_ext == "pdf":
        mode = "pdf"
    payload = {
        "mode": mode or "welcome",
        "version": int(sess["display_version"] or 0),
        "title": str(meta.get("title") or "").strip(),
        "page_id": meta.get("page_id"),
        "upload_label": str(meta.get("upload_label") or "").strip(),
        "material_label": str(meta.get("material_label") or meta.get("upload_label") or "").strip(),
        "activity_answers": meta.get("activity_answers") if isinstance(meta.get("activity_answers"), dict) else {},
        "display_item_id": meta.get("display_item_id"),
        "file_url": file_url,
        "download_url": download_url,
        "preview_pdf_url": preview_pdf_url,
        "file_ext": file_ext,
    }
    if mode == "timer":
        timer_raw = meta.get("timer") if isinstance(meta.get("timer"), dict) else {}
        payload["timer"] = {
            "kind": str(timer_raw.get("kind") or "countdown").strip().lower(),
            "running": bool(timer_raw.get("running")),
            "done": bool(timer_raw.get("done")),
            "remaining_sec": int(timer_raw.get("remaining_sec") or 0),
            "duration_sec": int(timer_raw.get("duration_sec") or 0),
            "elapsed_sec": int(timer_raw.get("elapsed_sec") or 0),
            "synced_at": str(timer_raw.get("synced_at") or "").strip(),
        }
    code = str(sess["session_code"] or "").strip().upper()
    host = str(request_host_url or "").rstrip("/")
    if not host:
        try:
            from flask import request as flask_request

            host = (flask_request.host_url or "").rstrip("/")
        except RuntimeError:
            host = ""
    if host and code and payload["mode"] in {"pdf", "text", "material"} and (
        payload["file_url"] or payload.get("display_item_id")
    ):
        payload["student_view_url"] = f"{host}/api/student/live/join/{code}/display-file"
    return payload


def extract_activity_answers(html: str) -> dict[str, str]:
    answers: dict[str, str] = {}
    if not html:
        return answers
    for match in _ACTIVITY_ANSWER_RE.finditer(html):
        if match.group(1) and match.group(2):
            answers[match.group(1)] = match.group(2)
        elif match.group(4) and match.group(3):
            answers[match.group(4)] = match.group(3)
    return answers


def inject_live_bridge(html: str, session_code: str, page_id: int, api_base: str = "") -> str:
    """Append live activity bridge config for student iframe."""
    text = str(html or "")
    cfg = json.dumps(
        {
            "sessionCode": session_code,
            "pageId": page_id,
            "apiBase": api_base.rstrip("/"),
        },
        ensure_ascii=False,
    )
    snippet = (
        f'<script>window.EAP_LIVE_CTX={cfg};</script>'
        '<script src="/ui/js/eap-live-bridge.js"></script>'
    )
    lower = text.lower()
    if "</body>" in lower:
        idx = lower.rfind("</body>")
        return text[:idx] + snippet + text[idx:]
    return text + snippet


def _normalize_answer(val: str) -> str:
    return " ".join(str(val or "").strip().lower().split())


def _check_activity_correct(expected_map: dict, activity_id: str, answer_text: str, answer_index) -> bool:
    expected = expected_map.get(activity_id)
    if expected is None:
        return False
    exp = _normalize_answer(expected)
    if exp.isdigit() and answer_index is not None:
        return int(answer_index) == int(exp)
    return _normalize_answer(answer_text) == exp


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


def _clamp_wait_timeout(raw):
    try:
        sec = float(raw)
    except (TypeError, ValueError):
        sec = _WAIT_MAX_SEC
    return max(1.0, min(sec, _WAIT_MAX_SEC))


def _wait_until(predicate, timeout_sec):
    """Block up to timeout_sec; return True when predicate() is truthy."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(_WAIT_POLL_SEC)
    return predicate()


def _student_join_payload(conn, sess, student_username):
    lid = sess["active_launch_id"]
    question = None
    launched_at = None
    if lid:
        launch = _launch_row(conn, lid)
        question = _question_payload(launch)
        launched_at = launch["launched_at"] if launch else None

    return {
        "session_code": sess["session_code"],
        "class_name": sess["class_name"],
        "student_username": student_username,
        "active": question is not None,
        "launch_id": lid,
        "launched_at": launched_at,
        "question": question,
        "display": _display_payload(sess),
    }


def _teacher_responses_payload(conn, sess, launch_id):
    lid = launch_id or sess["active_launch_id"]
    if not lid:
        return {"launch_id": None, "responses": [], "count": 0, "question": None}

    launch = _launch_row(conn, lid)
    if not launch or launch["session_id"] != sess["id"]:
        return None

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

    return {
        "launch_id": lid,
        "question": _question_payload(launch),
        "responses": out,
        "count": len(out),
    }


def _teacher_activity_stats_payload(conn, sess, page_id=None):
    display = _display_payload(sess)
    pid = page_id or display.get("page_id")
    if not pid:
        return {"page_id": None, "activities": [], "summary": {"responses": 0, "correct": 0, "accuracy_pct": 0}}

    pid = int(pid)
    rows = conn.execute(
        """
        SELECT activity_id, student_username, team_id, answer_text, answer_index,
               is_correct, duration_ms, submitted_at
        FROM live_page_activity_responses
        WHERE session_id = ? AND page_id = ?
        ORDER BY activity_id ASC, submitted_at ASC
        """,
        (sess["id"], pid),
    ).fetchall()

    by_activity: dict[str, dict] = {}
    for r in rows:
        aid = r["activity_id"]
        bucket = by_activity.setdefault(
            aid,
            {
                "activity_id": aid,
                "responses": [],
                "count": 0,
                "correct_count": 0,
                "total_duration_ms": 0,
            },
        )
        bucket["count"] += 1
        if r["is_correct"]:
            bucket["correct_count"] += 1
        bucket["total_duration_ms"] += int(r["duration_ms"] or 0)
        bucket["responses"].append(
            {
                "student": r["student_username"],
                "teamId": r["team_id"] or "",
                "answer": r["answer_text"] or "",
                "answerIndex": r["answer_index"],
                "correct": bool(r["is_correct"]),
                "durationMs": int(r["duration_ms"] or 0),
                "submittedAt": r["submitted_at"] or "",
            }
        )

    activities = []
    for _aid, bucket in sorted(by_activity.items()):
        count = bucket["count"]
        activities.append(
            {
                **bucket,
                "accuracy_pct": round(100 * bucket["correct_count"] / count) if count else 0,
                "avg_duration_ms": int(bucket["total_duration_ms"] / count) if count else 0,
            }
        )

    total = len(rows)
    correct = sum(1 for r in rows if r["is_correct"])
    return {
        "page_id": pid,
        "display": display,
        "activities": activities,
        "summary": {
            "responses": total,
            "correct": correct,
            "accuracy_pct": round(100 * correct / total) if total else 0,
        },
    }


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

            payload = _teacher_responses_payload(conn, sess, launch_id)
            if payload is None:
                return jsonify({"error": "Launch not found"}), 404
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/responses/wait", methods=["GET"])
    def teacher_live_responses_wait(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        launch_id = request.args.get("launch_id", type=int)
        since_count = request.args.get("since_count", default=0, type=int)
        timeout_sec = _clamp_wait_timeout(request.args.get("timeout", type=float))

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
            session_id = sess["id"]

            def count_changed():
                if not lid:
                    return False
                row = conn.execute(
                    "SELECT COUNT(*) AS c FROM live_responses WHERE launch_id = ?",
                    (lid,),
                ).fetchone()
                return int(row["c"] if row else 0) > since_count

            _wait_until(count_changed, timeout_sec)
            payload = _teacher_responses_payload(conn, sess, launch_id)
            if payload is None:
                return jsonify({"error": "Launch not found"}), 404
            payload["waited"] = True
            return jsonify(payload)
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

            return jsonify(_student_join_payload(conn, sess, student_username))
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/wait", methods=["GET"])
    def student_live_wait(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement

        since_launch_id = request.args.get("launch_id", type=int)
        timeout_sec = _clamp_wait_timeout(request.args.get("timeout", type=float))

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

            session_id = sess["id"]

            def launch_changed():
                row = conn.execute(
                    "SELECT active_launch_id FROM live_sessions WHERE id = ?",
                    (session_id,),
                ).fetchone()
                current = row["active_launch_id"] if row else None
                return current != since_launch_id

            _wait_until(launch_changed, timeout_sec)
            fresh = conn.execute(
                """
                SELECT id, session_code, class_name, teacher_username, session_date,
                       created_at, active_launch_id, display_mode, display_json, display_version
                FROM live_sessions WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            payload = _student_join_payload(conn, fresh, student_username)
            payload["waited"] = True
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/wait-display", methods=["GET"])
    def student_live_wait_display(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement

        since_version = request.args.get("display_version", default=0, type=int)
        timeout_sec = _clamp_wait_timeout(request.args.get("timeout", type=float))

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

            session_id = sess["id"]

            def display_changed():
                row = conn.execute(
                    "SELECT display_version FROM live_sessions WHERE id = ?",
                    (session_id,),
                ).fetchone()
                current = int(row["display_version"] if row else 0)
                return current != since_version

            _wait_until(display_changed, timeout_sec)
            fresh = conn.execute(
                """
                SELECT id, session_code, class_name, teacher_username, session_date,
                       created_at, active_launch_id, display_mode, display_json, display_version
                FROM live_sessions WHERE id = ?
                """,
                (session_id,),
            ).fetchone()
            payload = _student_join_payload(conn, fresh, student_username)
            payload["waited"] = True
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/display", methods=["POST"])
    def teacher_live_push_display(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        data = request.get_json(silent=True) or {}
        mode = str(data.get("mode") or "welcome").strip().lower()
        if mode not in {
            "welcome",
            "slides",
            "html",
            "material",
            "upload",
            "pdf",
            "text",
            "presentation",
            "office",
            "timer",
        }:
            return jsonify({"error": "Invalid display mode"}), 400
        if mode in {"presentation", "office", "upload"} and str(data.get("preview_pdf_url") or "").strip():
            mode = "pdf"
        elif mode in {"presentation", "office"}:
            mode = "material"

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

            title = str(data.get("title") or "").strip()[:200]
            page_id = data.get("page_id")
            page_id_val = int(page_id) if page_id is not None and str(page_id).strip().isdigit() else None
            upload_label = str(data.get("upload_label") or data.get("material_label") or "").strip()[:200]

            activity_answers = {}
            if mode == "html" and page_id_val:
                row = conn.execute(
                    "SELECT html_content FROM teacher_teaching_pages WHERE id = ?",
                    (page_id_val,),
                ).fetchone()
                if row and row["html_content"]:
                    activity_answers = extract_activity_answers(row["html_content"])

            meta = {
                "title": title,
                "page_id": page_id_val,
                "upload_label": upload_label,
                "material_label": upload_label,
                "activity_answers": activity_answers,
            }
            item_id_raw = data.get("display_item_id")
            if item_id_raw is not None and str(item_id_raw).strip().isdigit():
                meta["display_item_id"] = int(item_id_raw)
            file_url = str(data.get("file_url") or "").strip()
            if file_url:
                meta["file_url"] = file_url[:500]
            download_url = str(data.get("download_url") or "").strip()
            if download_url:
                meta["download_url"] = download_url[:500]
            preview_pdf_url = str(data.get("preview_pdf_url") or "").strip()
            if preview_pdf_url:
                meta["preview_pdf_url"] = preview_pdf_url[:500]
            file_ext = str(data.get("file_ext") or "").strip().lower()
            if file_ext:
                meta["file_ext"] = file_ext
            if mode in {"welcome", "slides"}:
                meta = {"title": title or "Classroom display"}
            elif mode == "timer":
                timer_obj = data.get("timer") if isinstance(data.get("timer"), dict) else {}
                meta = {
                    "title": title or "Timer",
                    "timer": {
                        "kind": str(timer_obj.get("kind") or "countdown").strip().lower(),
                        "running": bool(timer_obj.get("running")),
                        "done": bool(timer_obj.get("done")),
                        "remaining_sec": int(timer_obj.get("remaining_sec") or 0),
                        "duration_sec": int(timer_obj.get("duration_sec") or 0),
                        "elapsed_sec": int(timer_obj.get("elapsed_sec") or 0),
                        "synced_at": str(timer_obj.get("synced_at") or utc_now_iso()),
                    },
                }

            version = int(sess["display_version"] or 0) + 1
            now = utc_now_iso()
            conn.execute(
                """
                UPDATE live_sessions
                SET display_mode = ?, display_json = ?, display_version = ?
                WHERE id = ?
                """,
                (mode if mode != "upload" else "material", json.dumps(meta, ensure_ascii=False), version, sess["id"]),
            )
            conn.commit()

            fresh = _session_by_code(conn, session_code)
            return jsonify(
                {
                    "display": _display_payload(fresh),
                    "session_code": sess["session_code"],
                    "updated_at": now,
                }
            )
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/display-file", methods=["GET"])
    def student_live_display_file(session_code):
        """Inline file for current live display (session auth — works for enrolled students)."""
        from urllib.parse import unquote

        from flask import abort, send_from_directory

        from app import UPLOAD_DIR, ensure_uploads_directory, get_db_connection, resolve_student_with_optional_enforcement
        from classroom_display import (
            classroom_display_upload_dir,
            display_file_basename,
            ensure_pdf_preview,
            normalize_display_stored_path,
            previews_dir,
        )

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
            mode = str(display.get("mode") or "").lower()
            if mode == "html":
                abort(404)

            item_id = display.get("display_item_id")
            file_path = ""
            file_ext = str(display.get("file_ext") or "").lower()

            if item_id:
                row = conn.execute(
                    "SELECT item_type, file_path, file_ext FROM classroom_display_items WHERE id = ?",
                    (int(item_id),),
                ).fetchone()
                if row and str(row["item_type"] or "").lower() == "file":
                    file_path = row["file_path"] or ""
                    file_ext = (row["file_ext"] or file_ext or "").lower()

            if not file_path:
                file_path = _display_file_path_from_urls(display)

            ensure_uploads_directory()
            ud = classroom_display_upload_dir(UPLOAD_DIR)

            preview_dir = previews_dir(ud)
            for preview_url_key in ("preview_pdf_url", "file_url"):
                preview_url = str(display.get(preview_url_key) or "")
                if "/classroom-display/previews/" not in preview_url:
                    continue
                preview_base = unquote(preview_url.split("/previews/")[-1].split("?")[0])
                if preview_base and os.path.isfile(os.path.join(preview_dir, preview_base)):
                    return send_from_directory(
                        preview_dir,
                        preview_base,
                        mimetype="application/pdf",
                        as_attachment=False,
                        download_name=preview_base,
                    )

            if mode == "pdf" or file_ext in {"ppt", "pptx", "doc", "docx"}:
                preview_rel = ensure_pdf_preview(ud, file_path) if file_path else None
                if preview_rel:
                    base = display_file_basename(preview_rel)
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
                    ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
                    mime = "application/pdf" if ext == "pdf" else "text/plain; charset=utf-8"
                    if ext == "txt":
                        return send_from_directory(ud, base, mimetype=mime, as_attachment=False)
                    if ext == "pdf":
                        return send_from_directory(ud, base, mimetype=mime, as_attachment=False)

            abort(404)
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/lesson", methods=["GET"])
    def student_live_lesson_html(session_code):
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

            display = _display_payload(sess)
            if display["mode"] != "html" or not display.get("page_id"):
                return jsonify({"error": "No HTML lesson is live"}), 404

            page_id = int(display["page_id"])
            row = conn.execute(
                "SELECT id, title, html_content FROM teacher_teaching_pages WHERE id = ?",
                (page_id,),
            ).fetchone()
            if not row:
                return jsonify({"error": "Page not found"}), 404

            api_base = request.host_url.rstrip("/")
            from teacher_teaching_pages import polish_teaching_html

            html = polish_teaching_html(row["html_content"])
            html = inject_live_bridge(html, sess["session_code"], page_id, api_base)
            return jsonify(
                {
                    "title": row["title"] or display.get("title") or "",
                    "page_id": page_id,
                    "html": html,
                    "display": display,
                }
            )
        finally:
            conn.close()

    @app.route("/api/student/live/join/<session_code>/activity-respond", methods=["POST"])
    def student_live_activity_respond(session_code):
        from app import get_db_connection, resolve_student_with_optional_enforcement

        data = request.get_json(silent=True) or {}
        activity_id = str(data.get("activity_id") or "").strip()
        if not activity_id or len(activity_id) > 80:
            return jsonify({"error": "activity_id is required"}), 400

        try:
            page_id = int(data.get("page_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "page_id is required"}), 400

        answer_text = str(data.get("answer_text") or data.get("answer") or "").strip()[:500]
        if not answer_text:
            return jsonify({"error": "answer_text is required"}), 400

        answer_index = data.get("answer_index")
        answer_index_val = None
        if answer_index is not None and str(answer_index).strip().isdigit():
            answer_index_val = int(answer_index)

        try:
            duration_ms = max(0, int(data.get("duration_ms") or 0))
        except (TypeError, ValueError):
            duration_ms = 0

        team_id = str(data.get("team_id") or "").strip().upper()
        if team_id and team_id not in ("A", "B", "C", "D"):
            team_id = ""

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

            display = _display_payload(sess)
            if display["mode"] != "html" or int(display.get("page_id") or 0) != page_id:
                return jsonify({"error": "This lesson is not currently live"}), 409

            is_correct = _check_activity_correct(
                display.get("activity_answers") or {},
                activity_id,
                answer_text,
                answer_index_val,
            )
            now = utc_now_iso()
            conn.execute(
                """
                INSERT INTO live_page_activity_responses
                    (session_id, page_id, activity_id, student_username, team_id,
                     answer_text, answer_index, is_correct, duration_ms, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, page_id, activity_id, student_username) DO UPDATE SET
                    team_id = excluded.team_id,
                    answer_text = excluded.answer_text,
                    answer_index = excluded.answer_index,
                    is_correct = excluded.is_correct,
                    duration_ms = excluded.duration_ms,
                    submitted_at = excluded.submitted_at
                """,
                (
                    sess["id"],
                    page_id,
                    activity_id,
                    student_username,
                    team_id or None,
                    answer_text,
                    answer_index_val,
                    1 if is_correct else 0,
                    duration_ms,
                    now,
                ),
            )
            conn.commit()
            return jsonify(
                {
                    "ok": True,
                    "is_correct": bool(is_correct),
                    "activity_id": activity_id,
                    "submitted_at": now,
                }
            )
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/activity-stats", methods=["GET"])
    def teacher_live_activity_stats(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        page_id = request.args.get("page_id", type=int)
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

            display = _display_payload(sess)
            if not pid:
                return jsonify({"page_id": None, "activities": [], "summary": {"responses": 0}})

            payload = _teacher_activity_stats_payload(conn, sess, page_id)
            return jsonify(payload)
        finally:
            conn.close()

    @app.route("/api/teacher/live/sessions/<session_code>/activity-stats/wait", methods=["GET"])
    def teacher_live_activity_stats_wait(session_code):
        from app import (
            enforce_teacher_class_access_if_enabled,
            get_db_connection,
            get_effective_teacher_username,
            require_session_role_if_enabled,
            should_enforce_membership,
            should_require_session_identity,
        )

        page_id = request.args.get("page_id", type=int)
        since_count = request.args.get("since_count", default=0, type=int)
        timeout_sec = _clamp_wait_timeout(request.args.get("timeout", type=float))

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

            display = _display_payload(sess)
            pid = page_id or display.get("page_id")
            session_id = sess["id"]

            def count_changed():
                if not pid:
                    return False
                row = conn.execute(
                    """
                    SELECT COUNT(*) AS c FROM live_page_activity_responses
                    WHERE session_id = ? AND page_id = ?
                    """,
                    (session_id, int(pid)),
                ).fetchone()
                return int(row["c"] if row else 0) > since_count

            _wait_until(count_changed, timeout_sec)
            payload = _teacher_activity_stats_payload(conn, sess, page_id)
            payload["waited"] = True
            return jsonify(payload)
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
