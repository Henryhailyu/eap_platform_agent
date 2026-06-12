"""
EAP Platform API (Flask + SQLite) — Agent-window fork.

Separate copy from ~/Desktop/eap_platform (do not modify Desktop).
Default PORT=5051 so both projects can run side by side.
Open UI: http://127.0.0.1:5051/ui/index.html

calendar_tasks columns (see init_database + migrations):
    id, date, title, category, period, description, status, class_name,
    file_path, file_name

submissions table: student homework for a task (text + optional file), optional one revision row
columns after migrations: … + teacher_feedback, status + optional teacher feedback file columns
(feedback_file_path, feedback_file_name, feedback_file_uploaded_at) + revision_text, revision_file_path,
revision_file_name, revision_submitted_at, revision_status.

Homework and revision files live under backend/submissions/; file_path / revision_file_path store basenames.
Optional teacher feedback files: submission_attachments (attachment_type teacher_feedback) plus legacy
feedback_file_* columns on submissions for one overwrite file.

Phase D7: student_task_status table stores per-student calendar task completion; calendar_tasks.status
remains a legacy/global assignment row flag used by GET /api/tasks for teachers and PUT /legacy complete.
Phase D8: GET /api/teacher/task-completions exposes student_task_status counts for teachers without changing
GET /api/teacher/progress top-level completion semantics.

Legacy databases get new columns with ALTER TABLE only (no DROP, no data loss).
Teaching materials use backend/uploads/; student homework uses backend/submissions/.
"""
import json
import os
import re
import sqlite3
import uuid
from calendar import monthrange
from datetime import datetime, timezone

from flask import Flask, jsonify, redirect, request, send_from_directory, abort, session, Response
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from api_errors import (
    bearer_auth_failure_response,
    login_failure_response,
    teacher_not_authorized_response,
)
from auth_v1 import get_bearer_token_from_header, issue_access_token, verify_access_token
from eap_config import config, setup_logging, validate_production_config
from self_study_ai_prompts import (
    VOCABULARY_JSON_KEYS,
    coach_modules_with_api,
    default_prompt,
    get_prompt,
    json_keys_for_module,
    list_prompts,
    normalize_module,
    reset_prompt,
    save_prompt,
)

try:
    from eap_ai import (
        ai_is_configured,
        ai_ping,
        ai_public_status,
        format_ai_error,
        generate_teaching_page_html,
        module_coach_reply,
        vocabulary_explain,
    )
except ImportError:
    ai_is_configured = None  # type: ignore[assignment,misc]
    ai_ping = None  # type: ignore[assignment,misc]
    ai_public_status = None  # type: ignore[assignment,misc]
    format_ai_error = None  # type: ignore[assignment,misc]
    generate_teaching_page_html = None  # type: ignore[assignment,misc]
    module_coach_reply = None  # type: ignore[assignment,misc]
    vocabulary_explain = None  # type: ignore[assignment,misc]


def _ai_error_detail(exc: Exception) -> str:
    if format_ai_error:
        return format_ai_error(exc)
    return str(exc)[:200]

setup_logging()
validate_production_config()

# Create the Flask application
app = Flask(__name__)
app.secret_key = config.SECRET_KEY
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = config.SESSION_COOKIE_SAMESITE
app.config["SESSION_COOKIE_SECURE"] = config.SESSION_COOKIE_SECURE

if config.TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# When true, selected student read routes require a logged-in student session (Phase D9).
EAP_REQUIRE_SESSION_IDENTITY = config.REQUIRE_SESSION_IDENTITY

EAP_CORS_ORIGINS = config.CORS_ORIGINS

CORS(
    app,
    supports_credentials=True,
    origins=EAP_CORS_ORIGINS,
)


@app.after_request
def _eap_access_log(response):
    if config.ACCESS_LOG:
        app.logger.info("%s %s %s", request.method, request.path, response.status_code)
    return response


# Static frontend on the same origin as the API so Flask session cookies work under strict flags.
# Open http://127.0.0.1:5051/ui/index.html (not file://) for teacher/student demos.
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend"))


@app.route("/")
def root_redirect():
    """Phase G: send visitors to the login UI when the app is deployed online."""
    return redirect("/ui/index.html", code=302)


@app.route("/ui/", methods=["GET", "HEAD", "POST"])
@app.route("/ui/<path:filename>", methods=["GET", "HEAD", "POST"])
def serve_ui(filename="index.html"):
    """Serve frontend HTML/CSS/JS from ../frontend (same host/port as /api/*)."""
    if request.method == "POST":
        target = request.path if request.path else "/ui/index.html"
        return redirect(target, code=303)
    if not filename or str(filename).endswith("/"):
        filename = "index.html"
    safe = os.path.normpath(str(filename)).lstrip(os.sep)
    if safe.startswith("..") or os.path.isabs(safe):
        abort(404)
    if not os.path.isfile(os.path.join(FRONTEND_DIR, safe)):
        abort(404)
    response = send_from_directory(FRONTEND_DIR, safe)
    # HTML shells reference versioned JS; avoid stale cached pages missing new modules.
    if safe.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


# Basic health check used during development and regression testing
@app.route("/api/health", methods=["GET"])
def health_check():
    """Simple test route to check whether the backend is running."""
    db_ok = os.path.isfile(config.DATABASE_PATH)
    return jsonify(
        {
            "status": "ok" if db_ok else "degraded",
            "message": "EAP backend is running",
            "environment": config.ENV,
            "database_backend": config.DATABASE_BACKEND,
            "database_ready": db_ok,
            "strict_security": is_strict_security_enabled(),
            "session_identity_required": EAP_REQUIRE_SESSION_IDENTITY,
            "membership_enforced": EAP_ENFORCE_MEMBERSHIP,
            "pilot_mode": config.IS_PILOT,
            "public_url": config.PUBLIC_URL,
            "ai": ai_public_status() if ai_public_status else {"enabled": False, "configured": False},
        }
    )


@app.route("/api/pilot/info", methods=["GET"])
def pilot_info():
    """
    Phase G: non-secret pilot onboarding hints for a small user group.
    Hidden when EAP_PILOT_MODE is off and not in production.
    """
    if not config.IS_PILOT and not config.IS_PRODUCTION:
        return jsonify({"error": "Not found"}), 404
    return jsonify(
        {
            "pilot": True,
            "ui_entry": "/ui/index.html",
            "admin_entry": "/ui/admin.html",
            "class_code": "EAP047",
            "accounts": [
                {"role": "teacher", "username": "teacher1", "note": "Change password after first login in production."},
                {"role": "student", "username": "student1", "note": "Change password after first login in production."},
                {"role": "manager", "username": "manager1", "note": "Authorizes teachers; use admin UI."},
            ],
            "public_url": config.PUBLIC_URL,
            "strict_security": is_strict_security_enabled(),
        }
    )


@app.route("/api/debug/membership-check", methods=["GET"])
def debug_membership_check():
    """
    Development/integration helper: evaluates Phase C4 membership helpers only.

    Returns JSON booleans — does NOT authenticate the caller and is NOT used by production routes.
    Set role=teacher|student, username=…, class_name=… (query params).

    Phase D47: hidden (404) when strict security flags are on. Flags off: unchanged dev behaviour.
    """
    if is_strict_security_enabled():
        return jsonify({"error": "Not found"}), 404

    role = (request.args.get("role") or "").strip().lower()
    username = (request.args.get("username") or "").strip()
    raw_class = request.args.get("class_name")

    if role not in ("teacher", "student"):
        return jsonify({"error": 'role must be "teacher" or "student"'}), 400
    if not username:
        return jsonify({"error": "username is required"}), 400
    if raw_class is None or not str(raw_class).strip():
        return jsonify({"error": "class_name is required"}), 400

    norm = normalize_class_name(raw_class)

    conn = get_db_connection()
    try:
        user_row = get_user_by_username(conn, username)
        cid = class_id_for_code(conn, raw_class)
        if role == "teacher":
            allowed = is_teacher_assigned_to_class(conn, username, raw_class)
        else:
            allowed = is_student_enrolled_in_class(conn, username, raw_class)

        return jsonify(
            {
                "debug": True,
                "warning": "For development/integration only — not an authentication boundary.",
                "role": role,
                "username": username,
                "class_name_requested": str(raw_class).strip(),
                "normalized_class_code": norm,
                "user_found": user_row is not None,
                "class_row_found": cid is not None,
                "class_id": cid,
                "allowed_by_membership_helpers": allowed,
                "eap_enforce_membership_flag": EAP_ENFORCE_MEMBERSHIP,
            }
        )
    finally:
        conn.close()


# Database and upload paths (Phase F: overridable via environment — see .env.example)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = config.DATABASE_PATH
UPLOAD_DIR = config.UPLOAD_DIR
SUBMISSIONS_DIR = config.SUBMISSIONS_DIR

# Lowercase extensions (no dot) — keep in sync with what teachers may upload.
ALLOWED_UPLOAD_EXTENSIONS = frozenset(
    {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "mp3", "mp4", "txt", "jpg", "jpeg", "png"}
)

# Homework uploads: smaller allowlist than teaching materials (no ppt/mp3/mp4 here).
ALLOWED_HOMEWORK_EXTENSIONS = frozenset({"pdf", "doc", "docx", "txt", "jpg", "png"})

# Phase K1 — self-study manager uploads (no AI ingestion yet).
ALLOWED_SELF_STUDY_MATERIAL_EXTENSIONS = frozenset({"pdf", "doc", "docx", "txt"})


def get_db_connection():
    """
    Create a connection to the SQLite database.
    row_factory allows us to access data like a dictionary.
    WAL mode allows concurrent reads while a write is in progress,
    which prevents 503 errors when uploads overlap with read requests.
    """
    conn = sqlite3.connect(DATABASE_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def ensure_uploads_directory():
    """Create backend/uploads/ if it does not exist (safe to call every startup)."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    try:
        from classroom_display import classroom_display_upload_dir, previews_dir

        ud = classroom_display_upload_dir(UPLOAD_DIR)
        previews_dir(ud)
    except Exception:
        pass


def ensure_submissions_directory():
    """Create backend/submissions/ if it does not exist (safe to call every startup)."""
    os.makedirs(SUBMISSIONS_DIR, exist_ok=True)


def allowed_file_extension(filename):
    """Return True if the file suffix is in ALLOWED_UPLOAD_EXTENSIONS."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    return ext in ALLOWED_UPLOAD_EXTENSIONS


def allowed_homework_extension(filename):
    """Return True if the file suffix is allowed for student homework uploads."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    return ext in ALLOWED_HOMEWORK_EXTENSIONS


def allowed_self_study_material_extension(filename):
    """Phase K1: PDF / Word / TXT only for self-study materials."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    return ext in ALLOWED_SELF_STUDY_MATERIAL_EXTENSIONS


def migrate_calendar_tasks_add_file_columns(conn):
    """
    Older databases may lack file_path / file_name on calendar_tasks.

    We ALTER only when a column is missing — existing task rows are kept.
    """
    rows = conn.execute("PRAGMA table_info(calendar_tasks)").fetchall()
    column_names = [r[1] for r in rows]
    if "file_path" not in column_names:
        conn.execute("ALTER TABLE calendar_tasks ADD COLUMN file_path TEXT")
    rows = conn.execute("PRAGMA table_info(calendar_tasks)").fetchall()
    column_names = [r[1] for r in rows]
    if "file_name" not in column_names:
        conn.execute("ALTER TABLE calendar_tasks ADD COLUMN file_name TEXT")


def migrate_calendar_tasks_add_i18n_columns(conn):
    """Optional Chinese fields for bilingual UI (Agent build)."""
    for col in ("title_zh", "description_zh"):
        rows = conn.execute("PRAGMA table_info(calendar_tasks)").fetchall()
        column_names = [r[1] for r in rows]
        if col not in column_names:
            conn.execute(f"ALTER TABLE calendar_tasks ADD COLUMN {col} TEXT")


def migrate_task_templates_add_i18n_columns(conn):
    for col in ("title_zh", "description_zh"):
        rows = conn.execute("PRAGMA table_info(task_templates)").fetchall()
        column_names = [r[1] for r in rows]
        if col not in column_names:
            conn.execute(f"ALTER TABLE task_templates ADD COLUMN {col} TEXT")


def migrate_teacher_teaching_pages_k45(conn):
    """Phase K4/K5: template_key, published, published_at on teacher_teaching_pages."""
    rows = conn.execute("PRAGMA table_info(teacher_teaching_pages)").fetchall()
    column_names = [r[1] for r in rows]
    if "template_key" not in column_names:
        conn.execute(
            "ALTER TABLE teacher_teaching_pages ADD COLUMN template_key TEXT NOT NULL DEFAULT 'standard'"
        )
    if "published" not in column_names:
        conn.execute(
            "ALTER TABLE teacher_teaching_pages ADD COLUMN published INTEGER NOT NULL DEFAULT 0"
        )
    if "published_at" not in column_names:
        conn.execute("ALTER TABLE teacher_teaching_pages ADD COLUMN published_at TEXT")


def backfill_calendar_tasks_title_zh(conn):
    """
    One-time friendly Chinese labels for demo rows missing title_zh.
    Does not overwrite teacher-provided title_zh.
    """
    prefixes = {
        "Classroom Learning": "课堂学习",
        "Vocabulary": "词汇",
        "Listening": "听力",
        "Reading": "阅读",
        "Speaking": "口语",
        "Writing": "写作",
        "Homework": "作业",
    }
    rows = conn.execute(
        """
        SELECT id, title, category, title_zh
        FROM calendar_tasks
        WHERE title_zh IS NULL OR TRIM(COALESCE(title_zh, '')) = ''
        """
    ).fetchall()
    for row in rows:
        cat = (row["category"] or "").strip()
        prefix = prefixes.get(cat, "学习任务")
        title = (row["title"] or "").strip() or "未命名任务"
        conn.execute(
            "UPDATE calendar_tasks SET title_zh = ? WHERE id = ?",
            (f"{prefix}：{title}", row["id"]),
        )


def migrate_calendar_tasks_add_class_name(conn):
    """
    Older databases may have calendar_tasks without class_name.

    We only run ALTER TABLE when the column is missing so we never delete rows.
    New rows default to EAP047; we also backfill NULL so counts stay consistent.
    """
    rows = conn.execute("PRAGMA table_info(calendar_tasks)").fetchall()
    # PRAGMA columns: cid, name, type, notnull, dflt_value, pk
    column_names = [r[1] for r in rows]
    if "class_name" in column_names:
        return
    conn.execute(
        "ALTER TABLE calendar_tasks ADD COLUMN class_name TEXT DEFAULT 'EAP047'"
    )
    conn.execute(
        """
        UPDATE calendar_tasks
        SET class_name = 'EAP047'
        WHERE class_name IS NULL OR TRIM(COALESCE(class_name, '')) = ''
        """
    )


def migrate_submissions_add_revision_columns(conn):
    """
    Older databases may lack revision columns on submissions.

    ALTER only when a column is missing — existing homework rows are preserved.
    Students can store one revision per submission row (overwrites on resubmit).
    """
    rows = conn.execute("PRAGMA table_info(submissions)").fetchall()
    column_names = [r[1] for r in rows]
    specs = [
        ("revision_text", "TEXT"),
        ("revision_file_path", "TEXT"),
        ("revision_file_name", "TEXT"),
        ("revision_submitted_at", "TEXT"),
        ("revision_status", "TEXT"),
    ]
    for name, col_type in specs:
        if name not in column_names:
            conn.execute(
                f"ALTER TABLE submissions ADD COLUMN {name} {col_type}",
            )
            rows = conn.execute("PRAGMA table_info(submissions)").fetchall()
            column_names = [r[1] for r in rows]


def migrate_student_study_plans_add_teacher_suggestion(conn):
    """
    Older databases may lack teacher_suggestion on student_study_plans.

    ALTER only when missing — existing plan rows are preserved.
    """
    rows = conn.execute("PRAGMA table_info(student_study_plans)").fetchall()
    column_names = [r[1] for r in rows]
    if "teacher_suggestion" not in column_names:
        conn.execute(
            "ALTER TABLE student_study_plans ADD COLUMN teacher_suggestion TEXT",
        )


def migrate_submissions_add_feedback_file_columns(conn):
    """
    Add optional teacher feedback file columns (one commented file per submission row).

    ALTER only when missing — never drops data. Files live under backend/submissions/.
    """
    rows = conn.execute("PRAGMA table_info(submissions)").fetchall()
    column_names = [r[1] for r in rows]
    specs = [
        ("feedback_file_path", "TEXT"),
        ("feedback_file_name", "TEXT"),
        ("feedback_file_uploaded_at", "TEXT"),
    ]
    for name, col_type in specs:
        if name not in column_names:
            conn.execute(
                f"ALTER TABLE submissions ADD COLUMN {name} {col_type}",
            )
            rows = conn.execute("PRAGMA table_info(submissions)").fetchall()
            column_names = [r[1] for r in rows]


def migrate_submissions_add_feedback_attribution(conn):
    """Track which teacher gave homework feedback (manager performance option B)."""
    rows = conn.execute("PRAGMA table_info(submissions)").fetchall()
    column_names = [r[1] for r in rows]
    if "feedback_by_username" not in column_names:
        conn.execute("ALTER TABLE submissions ADD COLUMN feedback_by_username TEXT")
    if "feedback_at" not in column_names:
        conn.execute("ALTER TABLE submissions ADD COLUMN feedback_at TEXT")


def migrate_users_add_password_hash(conn):
    """
    Older databases may lack password_hash on users.

    ALTER only when missing — existing rows are preserved; plain passwords upgrade on login.
    """
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    column_names = [r[1] for r in rows]
    if "password_hash" not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")


def migrate_users_add_is_authorized(conn):
    """Phase E1: manager must authorize teachers before they can sign in."""
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    column_names = [r[1] for r in rows]
    if "is_authorized" not in column_names:
        conn.execute(
            "ALTER TABLE users ADD COLUMN is_authorized INTEGER NOT NULL DEFAULT 1"
        )


def migrate_users_add_external_ids(conn):
    """Manager performance lookup: student_id (students) and employee_id (teachers)."""
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    column_names = [r[1] for r in rows]
    if "student_id" not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN student_id TEXT")
    if "employee_id" not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN employee_id TEXT")


def normalize_group_code(raw) -> str:
    """Teaching group within a module, e.g. G1, G12 (default G1)."""
    s = str(raw or "").strip()
    if not s:
        return "G1"
    s = re.sub(r"(?i)^group\s*", "", s).strip()
    if re.match(r"^\d+$", s):
        return f"G{s}"
    up = s.upper()
    if up.startswith("G") and len(up) > 1:
        return up
    return up


def migrate_class_enrollments_add_group_code(conn):
    """Module/group architecture: group within a class (module) enrollment."""
    rows = conn.execute("PRAGMA table_info(class_enrollments)").fetchall()
    column_names = [r[1] for r in rows]
    if "group_code" not in column_names:
        conn.execute("ALTER TABLE class_enrollments ADD COLUMN group_code TEXT")
    conn.execute(
        """
        UPDATE class_enrollments
        SET group_code = 'G1'
        WHERE group_code IS NULL OR TRIM(group_code) = ''
        """
    )


def migrate_users_add_contact_fields(conn):
    """Manager roster import: email, office, and phone fields."""
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    column_names = [r[1] for r in rows]
    for col in ("email", "office_number", "office_phone", "mobile_phone"):
        if col not in column_names:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
    conn.execute(
        """
        UPDATE users SET student_id = '20260001'
        WHERE username = 'student1' AND (student_id IS NULL OR TRIM(student_id) = '')
        """
    )
    conn.execute(
        """
        UPDATE users SET employee_id = 'T2026001'
        WHERE username = 'teacher1' AND (employee_id IS NULL OR TRIM(employee_id) = '')
        """
    )
    conn.execute(
        """
        UPDATE users SET employee_id = 'T2026002'
        WHERE username = 'teacher2' AND (employee_id IS NULL OR TRIM(employee_id) = '')
        """
    )


def user_is_authorized(row):
    """Teachers need is_authorized=1; admin and student are always allowed."""
    role = str(row["role"] or "").strip().lower()
    if role != "teacher":
        return True
    try:
        return int(row["is_authorized"]) != 0
    except (KeyError, IndexError, TypeError, ValueError):
        return True


DEFAULT_CLASS_CODES = ("EAP047", "EAP048", "EAP049")


def utc_now_iso():
    """ISO-8601 UTC timestamp for created_at / enrolled_at fields."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init_database():
    """
    Create tables if they do not already exist.

    - calendar_tasks: task API (includes class_name for class-based tasks)
    - task_templates: reusable teacher task definitions (not scheduled)
    - student_study_plans: student-authored personal study plans (not calendar_tasks)
    - users: login (password_hash; legacy plain password upgraded on login)
    - classes / class_enrollments / teacher_classes: membership (read-only APIs in Phase C1)
    - submissions: student homework (answer text + optional file) linked to a task
    - student_task_status: per-student completion for calendar tasks (Phase D7)

    If an existing calendar_tasks table has no class_name column yet, we add it safely.
    Same for file_path and file_name (teaching material upload per task).
    """
    ensure_uploads_directory()
    ensure_submissions_directory()

    conn = get_db_connection()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS calendar_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            period TEXT,
            description TEXT,
            status TEXT DEFAULT 'Pending',
            class_name TEXT DEFAULT 'EAP047',
            file_path TEXT,
            file_name TEXT
        )
    """)

    migrate_calendar_tasks_add_class_name(conn)
    migrate_calendar_tasks_add_file_columns(conn)
    migrate_calendar_tasks_add_i18n_columns(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS task_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            period TEXT,
            description TEXT,
            file_path TEXT,
            file_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    migrate_task_templates_add_i18n_columns(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS student_study_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            class_name TEXT DEFAULT 'EAP047',
            date TEXT NOT NULL,
            skill_area TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            planned_minutes INTEGER,
            status TEXT NOT NULL DEFAULT 'Planned',
            teacher_suggestion TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    migrate_student_study_plans_add_teacher_suggestion(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            full_name TEXT,
            class_name TEXT
        )
    """)

    migrate_users_add_password_hash(conn)
    migrate_users_add_is_authorized(conn)
    migrate_users_add_external_ids(conn)
    migrate_users_add_contact_fields(conn)

    from live_teaching import init_live_teaching_tables

    init_live_teaching_tables(conn)

    from classroom_display import init_classroom_display_tables

    init_classroom_display_tables(conn)

    from recorded_lessons import init_recorded_lessons_tables
    from task_materials import init_task_materials_tables

    init_recorded_lessons_tables(conn)
    init_task_materials_tables(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_code TEXT UNIQUE NOT NULL,
            display_name TEXT,
            course_code TEXT,
            semester TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS class_enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL REFERENCES classes(id),
            student_id INTEGER NOT NULL REFERENCES users(id),
            enrolled_at TEXT,
            group_code TEXT,
            UNIQUE(class_id, student_id)
        )
    """)

    migrate_class_enrollments_add_group_code(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS teacher_classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL REFERENCES classes(id),
            teacher_id INTEGER NOT NULL REFERENCES users(id),
            assigned_at TEXT,
            UNIQUE(class_id, teacher_id)
        )
    """)

    # Student homework rows: one student may submit multiple times over time (each POST adds a row).
    conn.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            student_id INTEGER,
            student_username TEXT,
            student_name TEXT,
            class_name TEXT,
            answer_text TEXT,
            file_path TEXT,
            file_name TEXT,
            submitted_at TEXT,
            teacher_feedback TEXT,
            status TEXT DEFAULT 'Submitted'
        )
    """)

    migrate_submissions_add_revision_columns(conn)
    migrate_submissions_add_feedback_file_columns(conn)
    migrate_submissions_add_feedback_attribution(conn)
    init_submission_attachments_table(conn)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS student_task_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            student_username TEXT NOT NULL,
            class_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            completed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(task_id, student_username, class_name)
        )
    """)
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_student_task_status_student_class
        ON student_task_status (student_username, class_name)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_student_task_status_task_id
        ON student_task_status (task_id)
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS academic_calendar_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            semester_start_date TEXT NOT NULL,
            teaching_weeks INTEGER NOT NULL DEFAULT 16,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS academic_calendar_notes (
            date TEXT PRIMARY KEY,
            label TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS self_study_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            title_zh TEXT,
            module TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'all',
            format TEXT NOT NULL,
            unit_label TEXT,
            file_path TEXT,
            file_name TEXT,
            url TEXT,
            notes TEXT,
            text_snippet TEXT,
            uploaded_by TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS self_study_ai_prompts (
            module TEXT PRIMARY KEY,
            system_prompt TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS teacher_teaching_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            class_name TEXT,
            task_id INTEGER,
            topic TEXT,
            source_text TEXT,
            html_content TEXT NOT NULL,
            template_key TEXT NOT NULL DEFAULT 'standard',
            published INTEGER NOT NULL DEFAULT 0,
            published_at TEXT,
            teacher_username TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS teaching_page_templates (
            template_key TEXT PRIMARY KEY,
            system_prompt TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS teacher_teaching_source_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_username TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            char_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'staged',
            created_at TEXT NOT NULL,
            confirmed_at TEXT
        )
        """
    )

    migrate_teacher_teaching_pages_k45(conn)

    from lesson_prep import migrate_lesson_prep_tables
    from homework_marking import migrate_homework_marking_tables
    from self_study import migrate_self_study_tables
    from self_study_vocabulary import migrate_self_study_vocabulary_tables
    from self_study_reading import migrate_self_study_reading_tables
    from self_study_listening import migrate_self_study_listening_tables
    from self_study_writing import migrate_self_study_writing_tables
    from self_study_speaking import migrate_self_study_speaking_tables

    migrate_lesson_prep_tables(conn)
    migrate_homework_marking_tables(conn)
    migrate_self_study_tables(conn)
    migrate_self_study_vocabulary_tables(conn)
    migrate_self_study_reading_tables(conn)
    migrate_self_study_listening_tables(conn)
    migrate_self_study_writing_tables(conn)
    migrate_self_study_speaking_tables(conn)

    seed_default_users(conn)
    ensure_e1_demo_users(conn)
    seed_academic_calendar(conn)
    upgrade_demo_users_password_hashes(conn)
    seed_default_classes(conn)
    seed_default_class_memberships(conn)
    seed_task_templates(conn)
    backfill_calendar_tasks_title_zh(conn)
    from self_study_ai_prompts import seed_default_prompts, upgrade_default_self_study_prompts
    from teaching_page_templates import seed_default_templates

    seed_default_prompts(conn)
    upgrade_default_self_study_prompts(conn)
    seed_default_templates(conn)

    conn.commit()
    conn.close()


def seed_default_users(conn):
    """
    Insert demo teacher + student if those usernames are not in the database yet.

    New rows use password_hash; password column is empty string (NOT NULL compatibility).
    Existing rows are not modified here — legacy plain passwords upgrade on login or demo helper.
    """
    demo_password = "123456"
    demo_hash = generate_password_hash(demo_password)
    demo_users = [
        {
            "username": "teacher1",
            "role": "teacher",
            "full_name": "Demo Teacher",
            "class_name": "EAP047",
            "employee_id": "T2026001",
        },
        {
            "username": "student1",
            "role": "student",
            "full_name": "Demo Student",
            "class_name": "EAP047",
            "student_id": "20260001",
        },
        {
            "username": "manager1",
            "role": "admin",
            "full_name": "Demo Manager",
            "class_name": None,
        },
        {
            "username": "teacher2",
            "role": "teacher",
            "full_name": "Demo Teacher (pending)",
            "class_name": "EAP047",
            "is_authorized": 0,
            "employee_id": "T2026002",
        },
    ]

    for u in demo_users:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (u["username"],),
        ).fetchone()
        if row is None:
            is_auth = u.get("is_authorized", 1)
            conn.execute(
                """
                INSERT INTO users (
                    username, password, password_hash, role, full_name, class_name,
                    is_authorized, student_id, employee_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    u["username"],
                    "",
                    demo_hash,
                    u["role"],
                    u["full_name"],
                    u["class_name"],
                    is_auth,
                    u.get("student_id"),
                    u.get("employee_id"),
                ),
            )


def default_academic_calendar_dict():
    """Phase E2: seed values (matches former frontend ACADEMIC_CALENDAR defaults)."""
    return {
        "semester_start_date": "2026-02-23",
        "teaching_weeks": 16,
        "notable_dates": {
            "2025-09-10": "Teachers' Day",
            "2025-10-01": "National Day",
            "2025-10-02": "National Day",
            "2025-10-03": "National Day",
            "2025-10-06": "Mid-Autumn Festival",
            "2026-01-01": "New Year's Day",
            "2026-02-17": "Spring Festival",
            "2026-02-18": "Spring Festival",
            "2026-02-19": "Spring Festival",
            "2026-02-20": "Spring Festival",
            "2026-04-06": "Qingming Festival",
            "2026-05-01": "Labour Day",
            "2026-06-19": "Dragon Boat Festival",
        },
    }


def academic_calendar_payload(conn):
    """Public academic calendar shape for API + frontend."""
    row = conn.execute(
        """
        SELECT semester_start_date, teaching_weeks, updated_at
        FROM academic_calendar_config
        WHERE id = 1
        """
    ).fetchone()
    defaults = default_academic_calendar_dict()
    if row is None:
        semester_start = defaults["semester_start_date"]
        teaching_weeks = defaults["teaching_weeks"]
        updated_at = None
    else:
        semester_start = row["semester_start_date"] or defaults["semester_start_date"]
        teaching_weeks = int(row["teaching_weeks"] or defaults["teaching_weeks"])
        updated_at = row["updated_at"]

    note_rows = conn.execute(
        "SELECT date, label FROM academic_calendar_notes ORDER BY date ASC"
    ).fetchall()
    notable_dates = {str(r["date"]): str(r["label"]) for r in note_rows}
    if not notable_dates:
        notable_dates = dict(defaults["notable_dates"])

    return {
        "semester_start_date": semester_start,
        "teaching_weeks": teaching_weeks,
        "notable_dates": notable_dates,
        "updated_at": updated_at,
    }


def seed_academic_calendar(conn):
    """Insert default semester + holiday notes when tables are empty."""
    defaults = default_academic_calendar_dict()
    row = conn.execute(
        "SELECT id FROM academic_calendar_config WHERE id = 1"
    ).fetchone()
    if row is None:
        conn.execute(
            """
            INSERT INTO academic_calendar_config (id, semester_start_date, teaching_weeks, updated_at)
            VALUES (1, ?, ?, ?)
            """,
            (
                defaults["semester_start_date"],
                defaults["teaching_weeks"],
                utc_now_iso(),
            ),
        )
    note_count = conn.execute(
        "SELECT COUNT(*) AS c FROM academic_calendar_notes"
    ).fetchone()
    if note_count and int(note_count["c"]) == 0:
        for date_str, label in defaults["notable_dates"].items():
            conn.execute(
                "INSERT INTO academic_calendar_notes (date, label) VALUES (?, ?)",
                (date_str, label),
            )


def parse_iso_date_or_none(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text


def ensure_e1_demo_users(conn):
    """Insert Phase E1 demo manager + unauthorized teacher when missing (existing DBs)."""
    demo_password = "123456"
    demo_hash = generate_password_hash(demo_password)
    extras = [
        {
            "username": "manager1",
            "role": "admin",
            "full_name": "Demo Manager",
            "class_name": None,
            "is_authorized": 1,
        },
        {
            "username": "teacher2",
            "role": "teacher",
            "full_name": "Demo Teacher (pending)",
            "class_name": "EAP047",
            "is_authorized": 0,
            "employee_id": "T2026002",
        },
    ]
    for u in extras:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (u["username"],),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO users (
                    username, password, password_hash, role, full_name, class_name,
                    is_authorized, student_id, employee_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    u["username"],
                    "",
                    demo_hash,
                    u["role"],
                    u["full_name"],
                    u["class_name"],
                    u["is_authorized"],
                    u.get("student_id"),
                    u.get("employee_id"),
                ),
            )
    conn.execute(
        """
        UPDATE users
        SET is_authorized = 0
        WHERE username = 'teacher2' AND TRIM(COALESCE(role, '')) = 'teacher'
        """
    )


def upgrade_demo_users_password_hashes(conn):
    """
    Upgrade known demo accounts from legacy plain password to password_hash on startup.

    Only teacher1 and student1 with password exactly '123456' and no hash yet.
    Does not touch other users.
    """
    for username in ("teacher1", "student1"):
        row = conn.execute(
            """
            SELECT id, password, password_hash
            FROM users
            WHERE username = ?
            """,
            (username,),
        ).fetchone()
        if row is None:
            continue
        hash_val = row["password_hash"]
        if hash_val is not None and str(hash_val).strip():
            continue
        legacy = row["password"] if row["password"] is not None else ""
        if legacy != "123456":
            continue
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, password = ?
            WHERE id = ?
            """,
            (generate_password_hash("123456"), "", row["id"]),
        )


def seed_default_classes(conn):
    """
    Insert demo class rows (EAP047–EAP049) if class_code is not already present.
    """
    now = utc_now_iso()
    for code in DEFAULT_CLASS_CODES:
        row = conn.execute(
            "SELECT id FROM classes WHERE class_code = ?",
            (code,),
        ).fetchone()
        if row is not None:
            continue
        conn.execute(
            """
            INSERT INTO classes
                (class_code, display_name, course_code, semester, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (code, code, "EAP", None, 1, now, now),
        )


def seed_default_class_memberships(conn):
    """
    Link demo student1 → EAP047 and teacher1 → EAP047/EAP048/EAP049 when users and classes exist.

    Skips safely if demo users are missing. Does not duplicate enrollment/assignment rows.
    """
    now = utc_now_iso()

    student = conn.execute(
        """
        SELECT id FROM users
        WHERE username = ? AND TRIM(COALESCE(role, '')) = 'student'
        """,
        ("student1",),
    ).fetchone()
    if student is not None:
        class_row = conn.execute(
            "SELECT id FROM classes WHERE class_code = ?",
            ("EAP047",),
        ).fetchone()
        if class_row is not None:
            exists = conn.execute(
                """
                SELECT id FROM class_enrollments
                WHERE class_id = ? AND student_id = ?
                """,
                (class_row["id"], student["id"]),
            ).fetchone()
            if exists is None:
                conn.execute(
                    """
                    INSERT INTO class_enrollments (class_id, student_id, enrolled_at)
                    VALUES (?, ?, ?)
                    """,
                    (class_row["id"], student["id"], now),
                )

    teacher = conn.execute(
        """
        SELECT id FROM users
        WHERE username = ? AND TRIM(COALESCE(role, '')) = 'teacher'
        """,
        ("teacher1",),
    ).fetchone()
    if teacher is not None:
        for code in DEFAULT_CLASS_CODES:
            class_row = conn.execute(
                "SELECT id FROM classes WHERE class_code = ?",
                (code,),
            ).fetchone()
            if class_row is None:
                continue
            exists = conn.execute(
                """
                SELECT id FROM teacher_classes
                WHERE class_id = ? AND teacher_id = ?
                """,
                (class_row["id"], teacher["id"]),
            ).fetchone()
            if exists is None:
                conn.execute(
                    """
                    INSERT INTO teacher_classes (class_id, teacher_id, assigned_at)
                    VALUES (?, ?, ?)
                    """,
                    (class_row["id"], teacher["id"], now),
                )


def seed_task_templates(conn):
    """
    Phase E7: starter templates per skill category when the library is empty.
    Skips insert if any template row already exists (teachers may have saved their own).
    """
    n = conn.execute("SELECT COUNT(*) FROM task_templates").fetchone()[0]
    if n is not None and int(n) > 0:
        return

    presets = [
        (
            "Classroom — guided discussion",
            "Classroom: Guided discussion",
            "Classroom Learning",
            "In class",
            "Prepare notes for the in-class discussion. Participate actively and complete the reflection prompt.",
        ),
        (
            "Vocabulary — unit word list",
            "Vocabulary: Unit word list",
            "Vocabulary",
            "Before class",
            "Study the word list, complete the matching exercises, and use each target word in an original sentence.",
        ),
        (
            "Listening — lecture clip",
            "Listening: Academic lecture clip",
            "Listening",
            "In class",
            "Listen to the recording and answer the comprehension questions. Note key phrases for follow-up discussion.",
        ),
        (
            "Reading — academic article",
            "Reading: Academic article",
            "Reading",
            "Prep",
            "Read the assigned article and annotate the main argument. Answer the guided reading questions.",
        ),
        (
            "Speaking — presentation",
            "Speaking: Short presentation",
            "Speaking",
            "In class",
            "Prepare a 3–5 minute presentation using the outline provided. Submit slides or notes if requested.",
        ),
        (
            "Writing — essay draft",
            "Writing: Essay draft",
            "Writing",
            "After class",
            "Write a structured response using academic language. Check organisation, citations, and word count.",
        ),
        (
            "Homework — assessment task",
            "Homework: Assessment submission",
            "Homework",
            "Due date",
            "Complete the assessment task and upload your work. Review the rubric before submitting.",
        ),
    ]

    for name, title, category, period, description in presets:
        conn.execute(
            """
            INSERT INTO task_templates
                (name, title, title_zh, category, period, description, description_zh,
                 file_path, file_name, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, datetime('now'), datetime('now'))
            """,
            (name, title, category, period, description),
        )


def class_row_to_dict(row):
    """Public JSON for one classes row."""
    return {
        "id": row["id"],
        "class_code": row["class_code"],
        "display_name": row["display_name"],
        "course_code": row["course_code"],
        "semester": row["semester"],
        "is_active": bool(row["is_active"]) if row["is_active"] is not None else True,
    }


def task_to_dict(task):
    """
    Convert a database row into a Python dictionary.
    This makes it easier to return JSON to the frontend.
    """
    title_zh = None
    description_zh = None
    try:
        title_zh = task["title_zh"]
        description_zh = task["description_zh"]
    except (IndexError, KeyError):
        pass
    return {
        "id": task["id"],
        "date": task["date"],
        "title": task["title"],
        "title_zh": title_zh,
        "category": task["category"],
        "period": task["period"],
        "description": task["description"],
        "description_zh": description_zh,
        "status": task["status"],
        "class_name": task["class_name"] if task["class_name"] is not None else "EAP047",
        "file_path": task["file_path"],
        "file_name": task["file_name"],
        "ai_marking_enabled": bool(task["ai_marking_enabled"])
        if "ai_marking_enabled" in task.keys()
        else False,
    }


ALLOWED_MY_COMPLETION_STATUSES = ("Pending", "Completed")


def upsert_student_task_status_row(conn, task_id, student_username, class_name_norm, status_canonical):
    """Insert or replace per-student completion; does not commit."""
    canon = status_canonical if status_canonical in ALLOWED_MY_COMPLETION_STATUSES else "Pending"
    conn.execute(
        """
        INSERT INTO student_task_status
            (task_id, student_username, class_name, status, completed_at, updated_at)
        VALUES (
            ?, ?, ?, ?,
            CASE WHEN ? = 'Completed' THEN datetime('now') ELSE NULL END,
            datetime('now')
        )
        ON CONFLICT(task_id, student_username, class_name) DO UPDATE SET
            status = excluded.status,
            completed_at = CASE WHEN excluded.status = 'Completed' THEN datetime('now') ELSE NULL END,
            updated_at = datetime('now')
        """,
        (task_id, student_username, class_name_norm, canon, canon),
    )


def my_completion_json_response(task_id, student_username, class_name_norm, row):
    """Build GET/PUT payload for one student's completion on a task."""
    if row is None:
        st = "Pending"
        cat = False
        ca = None
    else:
        st_raw = str(row["status"] or "").strip()
        st = "Completed" if st_raw.lower() == "completed" else "Pending"
        cat = st == "Completed"
        ca = row["completed_at"] if cat else None
    return {
        "task_id": int(task_id),
        "student_username": student_username,
        "class_name": class_name_norm,
        "status": st,
        "completed": cat,
        "completed_at": ca,
    }


def template_to_dict(row):
    """JSON shape for one task_templates row."""
    title_zh = None
    description_zh = None
    try:
        title_zh = row["title_zh"]
        description_zh = row["description_zh"]
    except (IndexError, KeyError):
        pass
    return {
        "id": row["id"],
        "name": row["name"],
        "title": row["title"],
        "title_zh": title_zh,
        "category": row["category"],
        "period": row["period"],
        "description": row["description"],
        "description_zh": description_zh,
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def remove_file_if_exists(rel_path):
    """Delete a file under UPLOAD_DIR given its stored basename (file_path column)."""
    if not rel_path or not isinstance(rel_path, str):
        return
    base = os.path.basename(rel_path.strip())
    if not base or base != rel_path.strip():
        return
    full = os.path.join(UPLOAD_DIR, base)
    if os.path.isfile(full):
        try:
            os.remove(full)
        except OSError:
            pass


def remove_homework_disk_file(rel_path):
    """Delete a file under SUBMISSIONS_DIR given its stored basename (homework/revision paths)."""
    if not rel_path or not isinstance(rel_path, str):
        return
    base = os.path.basename(rel_path.strip())
    if not base or base != rel_path.strip():
        return
    full = os.path.join(SUBMISSIONS_DIR, base)
    if os.path.isfile(full):
        try:
            os.remove(full)
        except OSError:
            pass


def normalize_class_name(value):
    """
    Match calendar_tasks behaviour: blank class becomes the demo default EAP047.
    Used when comparing the form's class_name to the task's class_name.
    """
    return (value or "").strip() or "EAP047"


# ---- Phase C4 / D9: class membership helpers ---------------------------------------
#
# EAP_ENFORCE_MEMBERSHIP: when true, selected student read routes (Phase D9) also require
# enrollment via is_student_enrolled_in_class. See eap_config / .env.example.
EAP_ENFORCE_MEMBERSHIP = config.ENFORCE_MEMBERSHIP


def get_user_by_username(conn, username):
    """
    Load a user row for membership checks. Does not return password or password_hash.
    """
    u = (username or "").strip()
    if not u:
        return None
    return conn.execute(
        """
        SELECT id, username, role, full_name, class_name
        FROM users
        WHERE username = ?
        """,
        (u,),
    ).fetchone()


def get_current_session_user(conn):
    """
    Phase D1 scaffolding: user row for session['user_id'], if any.

    Does not replace query/body trust on existing routes until a later phase wires enforcement.
    Returns None when not logged in or the user id is invalid / missing from the database.
    """
    raw_id = session.get("user_id")
    if raw_id is None:
        return None
    try:
        uid = int(raw_id)
    except (TypeError, ValueError):
        return None
    return conn.execute(
        """
        SELECT id, username, role, full_name, class_name
        FROM users
        WHERE id = ?
        """,
        (uid,),
    ).fetchone()


def get_current_authenticated_user(conn):
    """
    Phase I2b: Bearer token (when Authorization header is sent), else Flask session.

  When the browser sends Authorization, the token wins so each tab can keep its own
  role while a shared session cookie may reflect the most recent login in another tab.
    """
    token = get_bearer_token_from_header(request.headers.get("Authorization"))
    if token:
        uid = verify_access_token(token)
        if uid is not None:
            row = load_user_by_id_for_auth(conn, uid)
            if row is not None and user_is_authorized(row):
                return row
    user = get_current_session_user(conn)
    if user is not None:
        return user
    return None


def get_effective_actor_role(conn):
    """
    Phase D3: session role when logged in as teacher or student; else None.
    Does not enforce auth on routes — for helpers and future phases only.
    """
    user = get_current_authenticated_user(conn)
    if user is None:
        return None
    role = str(user["role"] or "").strip()
    if role in ("teacher", "student"):
        return role
    return None


def get_effective_teacher_username(conn, fallback_username=None):
    """
    Phase D3: prefer Flask session teacher username; else cleaned fallback_username.
    Session wins only when role is teacher. No 401/403 — returns None if unresolved.
    """
    user = get_current_authenticated_user(conn)
    if user is not None and str(user["role"] or "").strip() == "teacher":
        uname = str(user["username"] or "").strip()
        if uname:
            return uname
    fb = (fallback_username or "").strip()
    return fb or None


def get_effective_student_username(conn, fallback_username=None):
    """
    Phase D3: prefer Flask session student username; else cleaned fallback_username.
    Session wins only when role is student. No 401/403 — returns None if unresolved.
    """
    user = get_current_authenticated_user(conn)
    if user is not None and str(user["role"] or "").strip() == "student":
        uname = str(user["username"] or "").strip()
        if uname:
            return uname
    fb = (fallback_username or "").strip()
    return fb or None


def class_id_for_code(conn, class_name):
    """
    Resolve classes.id for an active catalogue row matching normalized class_code.
    Does not create rows. Returns None if missing or inactive.
    """
    code = normalize_class_name(class_name)
    row = conn.execute(
        """
        SELECT id
        FROM classes
        WHERE class_code = ?
          AND COALESCE(is_active, 1) != 0
        LIMIT 1
        """,
        (code,),
    ).fetchone()
    if row is None:
        return None
    return int(row["id"])


def is_teacher_assigned_to_class(conn, teacher_username, class_name):
    """
    True if teacher_username exists with role teacher and has a teacher_classes row
    for an active class with this class_code (normalized).
    """
    tu = (teacher_username or "").strip()
    if not tu:
        return False
    if class_name is None or not str(class_name).strip():
        return False
    norm = normalize_class_name(class_name)
    row = conn.execute(
        """
        SELECT 1 AS ok
        FROM users u
        INNER JOIN teacher_classes tc ON tc.teacher_id = u.id
        INNER JOIN classes c ON c.id = tc.class_id
        WHERE u.username = ?
          AND TRIM(COALESCE(u.role, '')) = 'teacher'
          AND c.class_code = ?
          AND COALESCE(c.is_active, 1) != 0
        LIMIT 1
        """,
        (tu, norm),
    ).fetchone()
    return row is not None


def is_student_enrolled_in_class(conn, student_username, class_name):
    """
    True if student_username exists with role student and has a class_enrollments row
    for an active class with this class_code (normalized).
    """
    su = (student_username or "").strip()
    if not su:
        return False
    if class_name is None or not str(class_name).strip():
        return False
    norm = normalize_class_name(class_name)
    row = conn.execute(
        """
        SELECT 1 AS ok
        FROM users u
        INNER JOIN class_enrollments ce ON ce.student_id = u.id
        INNER JOIN classes c ON c.id = ce.class_id
        WHERE u.username = ?
          AND TRIM(COALESCE(u.role, '')) = 'student'
          AND c.class_code = ?
          AND COALESCE(c.is_active, 1) != 0
        LIMIT 1
        """,
        (su, norm),
    ).fetchone()
    return row is not None


def should_require_session_identity():
    """True when EAP_REQUIRE_SESSION_IDENTITY is set to a truthy value (same parsing as module load)."""
    return bool(EAP_REQUIRE_SESSION_IDENTITY)


def should_enforce_membership():
    """True when EAP_ENFORCE_MEMBERSHIP is set to a truthy value (same parsing as module load)."""
    return bool(EAP_ENFORCE_MEMBERSHIP)


def is_strict_security_enabled():
    """Phase D40: True when strict download/list guards should apply."""
    return should_require_session_identity() or should_enforce_membership()


def safe_download_basename(filename):
    """
    Phase D40: basename-only download key with path traversal rejected.
    Returns None when the URL segment is unsafe.
    """
    if not filename or not isinstance(filename, str):
        return None
    if "\\" in filename or "/" in filename or ".." in filename:
        return None
    base = os.path.basename(filename)
    if base != filename or not base:
        return None
    return base


def stored_path_matches_download_basename(stored_path, basename):
    """True when a DB file_path column refers to the on-disk basename (optional uploads/ prefix)."""
    if not stored_path or not basename:
        return False
    s = str(stored_path).strip()
    if not s:
        return False
    if s == basename or s == f"uploads/{basename}":
        return True
    return os.path.basename(s) == basename


def resolve_safe_file_in_directory(directory, basename):
    """
    Phase D40: realpath/commonpath check and existence test.
    Returns (resolved_dir, basename) or (None, None).
    """
    resolved_dir = os.path.realpath(directory)
    candidate = os.path.realpath(os.path.join(directory, basename))
    try:
        if os.path.commonpath([candidate, resolved_dir]) != resolved_dir:
            return None, None
    except ValueError:
        return None, None
    if not os.path.isfile(candidate):
        return None, None
    return resolved_dir, basename


def calendar_tasks_for_upload_basename(conn, basename):
    """Rows in calendar_tasks whose file_path refers to basename."""
    rows = conn.execute(
        """
        SELECT id, class_name, file_path
        FROM calendar_tasks
        WHERE file_path IS NOT NULL AND TRIM(file_path) != ''
        """
    ).fetchall()
    return [r for r in rows if stored_path_matches_download_basename(r["file_path"], basename)]


def task_templates_for_upload_basename(conn, basename):
    """Rows in task_templates whose file_path refers to basename."""
    rows = conn.execute(
        """
        SELECT id, file_path
        FROM task_templates
        WHERE file_path IS NOT NULL AND TRIM(file_path) != ''
        """
    ).fetchall()
    return [r for r in rows if stored_path_matches_download_basename(r["file_path"], basename)]


def authorize_upload_download(conn, basename):
    """
    Phase D40: session + role/class authorization for GET /uploads/<filename> when strict flags on.
    Returns None if allowed, "not_found" if no DB reference, or (jsonify, status) on failure.
    """
    task_rows = calendar_tasks_for_upload_basename(conn, basename)
    template_rows = task_templates_for_upload_basename(conn, basename)
    if not task_rows and not template_rows:
        return "not_found"

    actor = get_current_authenticated_user(conn)
    if actor is None:
        return jsonify({"error": "Not logged in"}), 401

    role = str(actor["role"] or "").strip()
    uname = str(actor["username"] or "").strip()

    if role == "student":
        for row in task_rows:
            if is_student_enrolled_in_class(conn, uname, row["class_name"]):
                return None
        return jsonify({"error": "Forbidden"}), 403

    if role == "teacher":
        for row in task_rows:
            if is_teacher_assigned_to_class(conn, uname, row["class_name"]):
                return None
        if template_rows:
            return None
        return jsonify({"error": "Forbidden"}), 403

    return jsonify({"error": "Forbidden"}), 403


def submission_contexts_for_basename(conn, basename):
    """
    Distinct (student_username, class_name) pairs for submissions-related paths matching basename.
    """
    contexts = []
    seen = set()

    def add_context(student_username, class_name):
        cn = normalize_class_name(class_name)
        su = (student_username or "").strip()
        key = (su, cn)
        if cn and key not in seen:
            seen.add(key)
            contexts.append({"student_username": su, "class_name": cn})

    sub_rows = conn.execute(
        """
        SELECT student_username, class_name, file_path, revision_file_path, feedback_file_path
        FROM submissions
        """
    ).fetchall()
    for row in sub_rows:
        for col in ("file_path", "revision_file_path", "feedback_file_path"):
            if stored_path_matches_download_basename(row[col], basename):
                add_context(row["student_username"], row["class_name"])
                break

    attach_rows = conn.execute(
        """
        SELECT s.student_username, s.class_name, a.file_path
        FROM submission_attachments a
        INNER JOIN submissions s ON s.id = a.submission_id
        WHERE a.file_path IS NOT NULL AND TRIM(a.file_path) != ''
        """
    ).fetchall()
    for row in attach_rows:
        if stored_path_matches_download_basename(row["file_path"], basename):
            add_context(row["student_username"], row["class_name"])

    return contexts


def authorize_submission_file_download(conn, basename):
    """
    Phase D40: session + owner/class authorization for GET /submission-files/<filename> when strict flags on.
    Returns None if allowed, "not_found" if no DB reference, or (jsonify, status) on failure.
    """
    contexts = submission_contexts_for_basename(conn, basename)
    if not contexts:
        return "not_found"

    actor = get_current_authenticated_user(conn)
    if actor is None:
        return jsonify({"error": "Not logged in"}), 401

    role = str(actor["role"] or "").strip()
    uname = str(actor["username"] or "").strip()

    if role == "student":
        for ctx in contexts:
            if (
                ctx["student_username"]
                and ctx["student_username"] == uname
                and is_student_enrolled_in_class(conn, uname, ctx["class_name"])
            ):
                return None
        return jsonify({"error": "Forbidden"}), 403

    if role == "teacher":
        for ctx in contexts:
            if is_teacher_assigned_to_class(conn, uname, ctx["class_name"]):
                return None
        return jsonify({"error": "Forbidden"}), 403

    return jsonify({"error": "Forbidden"}), 403


def require_session_user_if_enabled(conn):
    """
    Phase D9: optional gate for routes that may require any logged-in user.
    Returns None if allowed, or (jsonify(...), status) when session is required but missing.
    """
    if not should_require_session_identity():
        return None
    user = get_current_authenticated_user(conn)
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    return None


def require_session_role_if_enabled(conn, expected_role):
    """
    Phase D9: optional gate — session must exist and role must match expected_role.
    Returns None if allowed, or a Flask (jsonify, status) tuple on failure.

    Phase D25: also used for global template POST/DELETE and **`GET /api/task-templates`** (Phase D42).
    """
    if not should_require_session_identity():
        return None
    user = get_current_authenticated_user(conn)
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    if str(user["role"] or "").strip() != expected_role:
        return jsonify({"error": "Wrong role"}), 403
    return None


def enforce_student_class_access_if_enabled(conn, student_username, class_name):
    """
    Phase D9: optional enrollment check. When disabled, returns None (no-op).
    class_name may be raw query text; whitespace-only is treated as missing.
    """
    if not should_enforce_membership():
        return None
    su = (student_username or "").strip()
    if not su:
        return jsonify({"error": "student_username is required"}), 400
    if class_name is None or not str(class_name).strip():
        return jsonify({"error": "class_name is required"}), 400
    if not is_student_enrolled_in_class(conn, su, class_name):
        return jsonify({"error": "Student is not enrolled in this class"}), 403
    return None


def enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name):
    """
    Phase D9/D10: optional teacher assignment check for class-scoped teacher read routes.
    """
    if not should_enforce_membership():
        return None
    tu = (teacher_username or "").strip()
    if not tu:
        return jsonify({"error": "teacher_username is required"}), 400
    if class_name is None or not str(class_name).strip():
        return jsonify({"error": "class_name is required"}), 400
    if not is_teacher_assigned_to_class(conn, tu, class_name):
        return jsonify({"error": "Teacher is not assigned to this class"}), 403
    return None


def resolve_student_with_optional_enforcement(conn, fallback_username, class_name):
    """
    Phase D9: effective student username with optional session role and enrollment enforcement.

    Used by student GET routes (Phase D9), **`GET /api/tasks`** (Phase D38),
    **`POST /api/tasks/<id>/submit`** (Phase D35), **`PUT /api/tasks/<id>/my-completion`** (Phase D36),
    and **`PUT /api/submissions/<id>/revision`** (Phase D36).
    Returns (student_username, error_response) where error_response is None or (jsonify, status).
    """
    err = require_session_role_if_enabled(conn, "student")
    if err is not None:
        return None, err
    student_username = get_effective_student_username(conn, fallback_username)
    if not student_username:
        return None, (jsonify({"error": "student_username is required"}), 400)
    err = enforce_student_class_access_if_enabled(conn, student_username, class_name)
    if err is not None:
        return None, err
    return student_username, None


def resolve_my_classes_username(conn, role, query_param):
    """
    Phase D47: my-classes username resolution.

    Strict flags on: require matching session role; session username is authoritative;
    mismatched query username → 403. Flags off: Phase D3 effective username + query fallback.
    Returns (username, error_response) where error_response is None or (jsonify, status).
    """
    if is_strict_security_enabled():
        err = require_session_role_if_enabled(conn, role)
        if err is not None:
            return None, err
        user = get_current_authenticated_user(conn)
        username = str(user["username"] or "").strip()
        if not username:
            return None, (jsonify({"error": "Not logged in"}), 401)
        query_u = (request.args.get(query_param) or "").strip()
        if query_u and query_u != username:
            return None, (jsonify({"error": "Forbidden"}), 403)
        return username, None

    if role == "teacher":
        username = get_effective_teacher_username(conn, request.args.get(query_param))
    else:
        username = get_effective_student_username(conn, request.args.get(query_param))
    if not username:
        return None, (jsonify({"error": f"{query_param} is required"}), 400)
    return username, None


def resolve_teacher_with_optional_enforcement(conn, fallback_username, class_name):
    """
    Phase D9/D10: effective teacher username with optional session role and assignment enforcement.

    Used by selected teacher class-scoped GET routes (Phase D10), **`GET /api/tasks`** (Phase D38),
    **`GET /api/tasks/<id>/submissions`** (Phase D11), **`GET /api/submissions`** (Phase D13), submission feedback writes (Phase D15), **`POST /api/tasks/<id>/upload`** (Phase D17), **`POST /api/tasks`** (Phase D19), **`POST /api/task-templates/<id>/apply`** (Phase D21), **`POST /api/tasks/<id>/copy`** (Phase D23 target + Phase D33 source class), **`DELETE /api/submission-attachments/<id>`** (Phase D27), and **`PUT /api/teacher/study-plans/<id>/suggestion`** (Phase D29). When flags are off, behaves like
    get_effective_teacher_username plus no-op membership check; teacher_username may be None
    (Phase D5 scaffolding — not used in SQL on those routes).
    """
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        return None, err
    teacher_username = get_effective_teacher_username(conn, fallback_username)
    if (should_require_session_identity() or should_enforce_membership()) and not teacher_username:
        return None, (jsonify({"error": "teacher_username is required"}), 400)
    err = enforce_teacher_class_access_if_enabled(conn, teacher_username, class_name)
    if err is not None:
        return None, err
    return teacher_username, None


def membership_check_result(ok, message=""):
    """Structured result for future enforcement layers (not used by routes in Phase C4)."""
    return {"ok": bool(ok), "message": message or ""}


def build_forbidden_response(message):
    """Optional Flask tuple for future 403 responses (not used by routes in Phase C4)."""
    return jsonify({"error": str(message) if message else "Forbidden"}), 403


STUDY_PLAN_SKILL_AREAS = frozenset(
    {
        "Vocabulary",
        "Listening",
        "Reading",
        "Speaking",
        "Writing",
        "Grammar",
        "Other",
    }
)
STUDY_PLAN_STATUSES = frozenset({"Planned", "Completed"})


def study_plan_to_dict(row):
    """JSON for one student_study_plans row."""
    return {
        "id": row["id"],
        "student_username": row["student_username"],
        "class_name": row["class_name"] if row["class_name"] is not None else "EAP047",
        "date": row["date"],
        "skill_area": row["skill_area"],
        "title": row["title"],
        "description": row["description"],
        "planned_minutes": row["planned_minutes"],
        "status": row["status"],
        "teacher_suggestion": row["teacher_suggestion"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def teacher_study_plan_view_dict(row):
    """Teacher list row: plan fields plus optional student display name from users join."""
    d = study_plan_to_dict(row)
    try:
        fn = row["student_full_name"]
    except (KeyError, IndexError):
        fn = None
    d["student_full_name"] = fn if fn is not None and str(fn).strip() else None
    return d


def parse_study_plan_planned_minutes(raw):
    """
    Optional integer 0–600. Returns (value_or_None, error_response_or_None).
    """
    if raw is None:
        return None, None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None, (jsonify({"error": "planned_minutes must be an integer"}), 400)
    if n < 0 or n > 600:
        return None, (jsonify({"error": "planned_minutes must be between 0 and 600"}), 400)
    return n, None


def _submission_row_for_student_task(conn, task_id, student_username):
    """
    One effective homework row per student per task.

    If duplicate rows exist (legacy double-submit), prefer the row that already has
    teacher feedback so students still see pushed comments on my-submission.
    """
    return conn.execute(
        """
        SELECT * FROM submissions
        WHERE task_id = ? AND student_username = ?
        ORDER BY
            CASE
                WHEN TRIM(COALESCE(teacher_feedback, '')) != ''
                  OR TRIM(COALESCE(feedback_file_path, '')) != ''
                  OR EXISTS (
                      SELECT 1 FROM submission_attachments a
                      WHERE a.submission_id = submissions.id
                        AND a.attachment_type = ?
                  )
                THEN 0
                ELSE 1
            END,
            id DESC
        LIMIT 1
        """,
        (int(task_id), student_username, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchone()


def submission_to_dict(row):
    """Convert a submissions table row to JSON-friendly dict."""
    return {
        "id": row["id"],
        "task_id": row["task_id"],
        "student_id": row["student_id"],
        "student_username": row["student_username"],
        "student_name": row["student_name"],
        "class_name": row["class_name"],
        "answer_text": row["answer_text"],
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "submitted_at": row["submitted_at"],
        "teacher_feedback": row["teacher_feedback"],
        "status": row["status"],
        "revision_text": row["revision_text"],
        "revision_file_path": row["revision_file_path"],
        "revision_file_name": row["revision_file_name"],
        "revision_submitted_at": row["revision_submitted_at"],
        "revision_status": row["revision_status"],
        "feedback_file_path": row["feedback_file_path"],
        "feedback_file_name": row["feedback_file_name"],
        "feedback_file_uploaded_at": row["feedback_file_uploaded_at"],
        "feedback_by_username": row["feedback_by_username"]
        if "feedback_by_username" in row.keys()
        else None,
        "feedback_at": row["feedback_at"] if "feedback_at" in row.keys() else None,
    }


def stamp_submission_feedback_attribution(conn, submission_id, teacher_username, feedback_at=None):
    """Record which teacher gave feedback on a submission row."""
    username = str(teacher_username or "").strip()
    if not username:
        return
    at = feedback_at or utc_now_iso()
    conn.execute(
        """
        UPDATE submissions
        SET feedback_by_username = ?, feedback_at = ?
        WHERE id = ?
        """,
        (username, at, submission_id),
    )


# ---- submission_attachments (e.g. multiple teacher feedback files per submission) ------------

ATTACHMENT_TYPE_TEACHER_FEEDBACK = "teacher_feedback"
MAX_TEACHER_FEEDBACK_ATTACHMENTS = 3


def init_submission_attachments_table(conn):
    """
    Optional files linked to a submission row (multiple teacher feedback files, etc.).

    Safe CREATE + index only; does not touch submissions data.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            attachment_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            uploaded_at TEXT,
            uploaded_by_role TEXT,
            uploaded_by_username TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_submission_attachments_submission_type
        ON submission_attachments (submission_id, attachment_type)
        """
    )


def attachment_row_to_dict(row):
    """JSON shape for one submission_attachments row (teacher feedback file)."""
    return {
        "id": row["id"],
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "uploaded_at": row["uploaded_at"],
        "uploaded_by_role": row["uploaded_by_role"],
        "uploaded_by_username": row["uploaded_by_username"],
    }


def batch_teacher_feedback_attachments(conn, submission_ids):
    """
    Map submission_id -> list of attachment dicts (teacher_feedback only).
    One query for many ids (avoids N+1 when listing submissions).
    """
    if not submission_ids:
        return {}
    unique_ids = list(dict.fromkeys(int(x) for x in submission_ids if x is not None))
    if not unique_ids:
        return {}
    placeholders = ",".join("?" * len(unique_ids))
    sql = f"""
        SELECT id, submission_id, file_path, file_name, uploaded_at, uploaded_by_role, uploaded_by_username
        FROM submission_attachments
        WHERE attachment_type = ? AND submission_id IN ({placeholders})
        ORDER BY submission_id ASC, id ASC
    """
    rows = conn.execute(
        sql,
        (ATTACHMENT_TYPE_TEACHER_FEEDBACK, *unique_ids),
    ).fetchall()
    out = {}
    for r in rows:
        sid = r["submission_id"]
        out.setdefault(sid, []).append(attachment_row_to_dict(r))
    return out


def submission_with_attachments(conn, row):
    """submission_to_dict + feedback_attachments list for API responses."""
    d = submission_to_dict(row)
    m = batch_teacher_feedback_attachments(conn, [row["id"]])
    d["feedback_attachments"] = m.get(row["id"], [])
    return d


def submissions_list_with_attachments(conn, rows):
    """Build list of submission dicts each including feedback_attachments (batch-loaded)."""
    if not rows:
        return []
    dicts = [submission_to_dict(r) for r in rows]
    ids = [d["id"] for d in dicts]
    m = batch_teacher_feedback_attachments(conn, ids)
    for d in dicts:
        d["feedback_attachments"] = m.get(d["id"], [])
    return dicts


def login_failure_json():
    """Phase D47 / I2e: failed login — web reads success/message; mobile reads error + code."""
    return login_failure_response()


def teacher_not_authorized_json():
    return teacher_not_authorized_response()


def login_user_public_dict(row):
    """Safe user fields for login and v1 auth responses (no password)."""
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "full_name": row["full_name"],
        "class_name": row["class_name"],
        "is_authorized": bool(user_is_authorized(row)),
    }


def authenticate_username_password(conn, username, password):
    """
    Shared credential check for /api/login and /api/v1/auth/login.

    Returns (user_row, None) on success or (None, flask_response_tuple) on failure.
    May commit password_hash upgrade for legacy plain passwords.
    """
    u = (username or "").strip()
    p = (password or "").strip()
    if not u or not p:
        return None, login_failure_json()

    row = conn.execute(
        """
        SELECT id, username, password, password_hash, role, full_name, class_name, is_authorized
        FROM users
        WHERE username = ?
        """,
        (u,),
    ).fetchone()

    if row is None:
        return None, login_failure_json()

    hash_val = row["password_hash"]
    if hash_val is not None and str(hash_val).strip():
        if not check_password_hash(hash_val, p):
            return None, login_failure_json()
    else:
        legacy = row["password"] if row["password"] is not None else ""
        if legacy != p:
            return None, login_failure_json()
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, password = ?
            WHERE id = ?
            """,
            (generate_password_hash(p), "", row["id"]),
        )
        conn.commit()

    if not user_is_authorized(row):
        return None, teacher_not_authorized_json()

    return row, None


def bearer_auth_failure_json():
    return bearer_auth_failure_response()


def load_user_by_id_for_auth(conn, user_id):
    return conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized
        FROM users
        WHERE id = ?
        """,
        (int(user_id),),
    ).fetchone()


@app.route("/api/login", methods=["POST"])
def login():
    """
    Simple login check against the users table.

    Request JSON:
        { "username": "teacher1", "password": "123456" }

    Returns JSON with "success" true/false (does not send the password back).
    Failed login: HTTP 401 with success false (Phase D47). Success: HTTP 200.
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    conn = get_db_connection()
    row, err = authenticate_username_password(conn, username, password)
    if err is not None:
        conn.close()
        return err

    conn.close()

    session.clear()
    session["user_id"] = row["id"]
    session["username"] = row["username"]
    session["role"] = row["role"]

    token, expires_in = issue_access_token(int(row["id"]))
    return jsonify(
        {
            "success": True,
            "user": login_user_public_dict(row),
            "access_token": token,
            "expires_in": expires_in,
            "token_type": "Bearer",
        }
    )


@app.route("/api/v1/auth/login", methods=["POST"])
def api_v1_auth_login():
    """
    Phase I2a: token login for mobile / WeChat clients. Does not set Flask session.

    Request JSON: { "username": "...", "password": "..." }
    Response: access_token, expires_in, token_type, user (no password fields).
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    conn = get_db_connection()
    row, err = authenticate_username_password(conn, username, password)
    conn.close()
    if err is not None:
        return err

    token, expires_in = issue_access_token(int(row["id"]))
    return jsonify(
        {
            "success": True,
            "access_token": token,
            "expires_in": expires_in,
            "token_type": "Bearer",
            "user": login_user_public_dict(row),
        }
    )


@app.route("/api/v1/upload-contract", methods=["GET"])
def api_v1_upload_contract():
    """
    Phase I2d: machine-readable upload limits for mobile / WeChat clients (no auth).
    """
    return jsonify(
        {
            "homework_extensions": sorted(ALLOWED_HOMEWORK_EXTENSIONS),
            "teacher_material_extensions": sorted(ALLOWED_UPLOAD_EXTENSIONS),
            "self_study_material_extensions": sorted(ALLOWED_SELF_STUDY_MATERIAL_EXTENSIONS),
            "max_bytes_recommended": 16 * 1024 * 1024,
            "wechat_upload_limit_bytes": 10 * 1024 * 1024,
            "homework_field_name": "file",
            "submit_path": "/api/tasks/<task_id>/submit",
            "revision_path": "/api/submissions/<submission_id>/revision",
        }
    )


@app.route("/api/v1/auth/me", methods=["GET"])
def api_v1_auth_me():
    """Phase I2a: current user from Authorization: Bearer <access_token> only."""
    token = get_bearer_token_from_header(request.headers.get("Authorization"))
    if not token:
        return bearer_auth_failure_json()

    uid = verify_access_token(token)
    if uid is None:
        return bearer_auth_failure_json()

    conn = get_db_connection()
    row = load_user_by_id_for_auth(conn, uid)
    conn.close()

    if row is None:
        return bearer_auth_failure_json()

    return jsonify({"success": True, "user": login_user_public_dict(row)})


@app.route("/api/me", methods=["GET"])
def api_me():
    """Return the current user (Phase D1 session; Phase I2b Bearer). Same shape as login."""
    conn = get_db_connection()
    row = get_current_authenticated_user(conn)
    conn.close()

    if row is None:
        session.clear()
        return jsonify({"success": False, "message": "Not logged in"}), 401

    return jsonify(
        {
            "success": True,
            "user": {
                "id": row["id"],
                "username": row["username"],
                "role": row["role"],
                "full_name": row["full_name"],
                "class_name": row["class_name"],
            },
        }
    )


@app.route("/api/logout", methods=["POST"])
def api_logout():
    """Clear server session (Phase D1). Client should still clear local storage."""
    session.clear()
    return jsonify({"success": True, "message": "Logged out"})


@app.route("/api/classes", methods=["GET"])
def list_classes():
    """
    List class catalogue rows (read-only; no membership enforcement).

    Query: active_only — default 1 (active only); pass 0 to include inactive classes.
    """
    active_q = (request.args.get("active_only") or "1").strip().lower()
    include_inactive = active_q in ("0", "false", "no")

    conn = get_db_connection()
    if include_inactive:
        rows = conn.execute(
            """
            SELECT id, class_code, display_name, course_code, semester, is_active
            FROM classes
            ORDER BY class_code ASC
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, class_code, display_name, course_code, semester, is_active
            FROM classes
            WHERE COALESCE(is_active, 1) != 0
            ORDER BY class_code ASC
            """
        ).fetchall()
    conn.close()
    return jsonify([class_row_to_dict(r) for r in rows])


@app.route("/api/teacher/my-classes", methods=["GET"])
def list_teacher_my_classes():
    """
    Classes assigned to one teacher (read-only; does not restrict other APIs yet).

    Query: teacher_username — required when no teacher Flask session; optional when
    logged in as teacher (Phase D3 uses session username when role matches).

    Phase D47: when strict security is on, requires teacher session; ignores mismatched
    teacher_username query param (session username is used).
    """
    conn = get_db_connection()
    teacher_username, d47_err = resolve_my_classes_username(
        conn, "teacher", "teacher_username"
    )
    if d47_err is not None:
        conn.close()
        return d47_err

    user = conn.execute(
        """
        SELECT id, username, role
        FROM users
        WHERE username = ?
        """,
        (teacher_username,),
    ).fetchone()
    if user is None or str(user["role"] or "").strip() != "teacher":
        conn.close()
        return jsonify({"error": "Teacher not found"}), 404

    rows = conn.execute(
        """
        SELECT
            c.id,
            c.class_code,
            c.display_name,
            tc.assigned_at
        FROM teacher_classes tc
        INNER JOIN classes c ON c.id = tc.class_id
        WHERE tc.teacher_id = ?
          AND COALESCE(c.is_active, 1) != 0
        ORDER BY c.class_code ASC
        """,
        (user["id"],),
    ).fetchall()
    conn.close()

    classes_out = []
    for r in rows:
        classes_out.append(
            {
                "id": r["id"],
                "class_code": r["class_code"],
                "display_name": r["display_name"],
                "assigned_at": r["assigned_at"],
            }
        )

    return jsonify(
        {
            "teacher_username": teacher_username,
            "classes": classes_out,
        }
    )


@app.route("/api/student/my-classes", methods=["GET"])
def list_student_my_classes():
    """
    Classes a student is enrolled in (read-only; does not restrict other APIs yet).

    Query: student_username — required when no student Flask session; optional when
    logged in as student (Phase D3 uses session username when role matches).

    Phase D47: when strict security is on, requires student session; ignores mismatched
    student_username query param (session username is used).
    """
    conn = get_db_connection()
    student_username, d47_err = resolve_my_classes_username(
        conn, "student", "student_username"
    )
    if d47_err is not None:
        conn.close()
        return d47_err

    user = conn.execute(
        """
        SELECT id, username, role
        FROM users
        WHERE username = ?
        """,
        (student_username,),
    ).fetchone()
    if user is None or str(user["role"] or "").strip() != "student":
        conn.close()
        return jsonify({"error": "Student not found"}), 404

    rows = conn.execute(
        """
        SELECT
            c.id,
            c.class_code,
            c.display_name,
            ce.enrolled_at
        FROM class_enrollments ce
        INNER JOIN classes c ON c.id = ce.class_id
        WHERE ce.student_id = ?
          AND COALESCE(c.is_active, 1) != 0
        ORDER BY c.class_code ASC
        """,
        (user["id"],),
    ).fetchall()
    conn.close()

    classes_out = []
    for r in rows:
        classes_out.append(
            {
                "id": r["id"],
                "class_code": r["class_code"],
                "display_name": r["display_name"],
                "enrolled_at": r["enrolled_at"],
            }
        )

    return jsonify(
        {
            "student_username": student_username,
            "classes": classes_out,
        }
    )


@app.route("/api/tasks", methods=["POST"])
def create_task():
    """
    Create a new calendar task.
    The frontend sends task data as JSON.

    class_name is optional; if missing or empty we store EAP047 (demo default class),
    via normalize_class_name (Phase D19).

    Phase D19: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement after required-field validation.
    """
    # silent=True + {} avoids errors if the body is empty or not JSON.
    data = request.get_json(silent=True) or {}

    date = data.get("date")
    title = data.get("title")
    category = data.get("category")
    period = data.get("period", "")
    description = data.get("description", "")
    title_zh = (data.get("title_zh") or "").strip() or None
    description_zh = (data.get("description_zh") or "").strip() or None

    if not date or not title or not category:
        return jsonify(
            {
                "error": "date, title, and category are required",
            }
        ), 400

    class_name = normalize_class_name(data.get("class_name"))
    ai_marking_enabled = 1 if data.get("ai_marking_enabled") else 0

    conn = get_db_connection()
    _, d19_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        class_name,
    )
    if d19_guard_err is not None:
        conn.close()
        return d19_guard_err

    cursor = conn.execute(
        """
        INSERT INTO calendar_tasks
            (date, title, title_zh, category, period, description, description_zh, status, class_name,
             ai_marking_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            date,
            title,
            title_zh,
            category,
            period,
            description,
            description_zh,
            "Pending",
            class_name,
            ai_marking_enabled,
        ),
    )

    new_task_id = int(cursor.lastrowid)

    recorded_lesson_ids = data.get("recorded_lesson_ids")
    if recorded_lesson_ids:
        from recorded_lessons import link_lessons_to_calendar_task

        link_lessons_to_calendar_task(conn, new_task_id, recorded_lesson_ids, class_name)

    conn.commit()

    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (new_task_id,),
    ).fetchone()

    out = task_to_dict(task)
    from recorded_lessons import enrich_task_dicts_with_recordings
    from task_materials import enrich_task_dicts_with_materials

    enrich_task_dicts_with_recordings(conn, [out])
    enrich_task_dicts_with_materials(conn, [out])
    conn.close()

    return jsonify(out), 201


@app.route("/api/tasks/<int:task_id>/copy", methods=["POST"])
def copy_task(task_id):
    """
    Duplicate a calendar task onto another date and/or class.

    JSON body:
      date (required, YYYY-MM-DD), class_name (optional, normalized with normalize_class_name),
      copy_material (bool) — when true and the source has file_path, reuse same upload reference
      (no physical file copy for MVP).

    Does not copy submissions, feedback, revisions, per-student completions, or student_task_status
    rows — new row is always Pending.

    Phase D23: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement on **target** **new_class** (from JSON), after source
    task **404** and **before** **INSERT**.

    Phase D33: same flags apply a **source**-class guard using **normalize_class_name(src["class_name"])**
    from **calendar_tasks** only (not request body). Under strict flags, the effective teacher must
    pass membership for **both** source and target classes; cross-class copy remains allowed when
    assigned to both.
    """
    data = request.get_json(silent=True) or {}
    new_date = (data.get("date") or "").strip()
    if not new_date or len(new_date) < 10:
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    new_date = new_date[:10]

    new_class = normalize_class_name(data.get("class_name"))
    copy_material = bool(data.get("copy_material"))

    conn = get_db_connection()
    src = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if src is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    source_class = normalize_class_name(src["class_name"])
    _, d33_source_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        source_class,
    )
    if d33_source_guard_err is not None:
        conn.close()
        return d33_source_guard_err

    _, d33_target_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        new_class,
    )
    if d33_target_guard_err is not None:
        conn.close()
        return d33_target_guard_err

    fp = None
    fn = None
    if copy_material:
        sfp = (src["file_path"] or "").strip() if src["file_path"] is not None else ""
        if sfp:
            fp = sfp
            sfn = (src["file_name"] or "").strip() if src["file_name"] is not None else ""
            fn = sfn if sfn else None

    title_zh = None
    description_zh = None
    try:
        title_zh = src["title_zh"]
        description_zh = src["description_zh"]
    except (IndexError, KeyError):
        pass

    cursor = conn.execute(
        """
        INSERT INTO calendar_tasks
            (date, title, title_zh, category, period, description, description_zh, status, class_name, file_path, file_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            new_date,
            src["title"],
            title_zh,
            src["category"],
            src["period"],
            src["description"],
            description_zh,
            "Pending",
            new_class,
            fp,
            fn,
        ),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (new_id,),
    ).fetchone()
    conn.close()
    return jsonify(task_to_dict(row)), 201


@app.route("/api/task-templates", methods=["GET"])
def list_task_templates():
    """
    All reusable task templates, newest updates first.

    Phase D42: when EAP_REQUIRE_SESSION_IDENTITY or EAP_ENFORCE_MEMBERSHIP is on, requires a
    logged-in teacher session (students and anonymous callers receive 401/403). Response shape
    unchanged. With flags off, legacy public listing is unchanged.
    """
    conn = get_db_connection()
    if is_strict_security_enabled():
        d42_template_guard_err = require_session_role_if_enabled(conn, "teacher")
        if d42_template_guard_err is not None:
            conn.close()
            return d42_template_guard_err
    rows = conn.execute(
        """
        SELECT * FROM task_templates
        ORDER BY updated_at DESC, name COLLATE NOCASE ASC
        """
    ).fetchall()
    conn.close()
    return jsonify([template_to_dict(r) for r in rows])


@app.route("/api/task-templates", methods=["POST"])
def create_task_template():
    """
    Save a reusable template (not a scheduled calendar row).

    JSON: name, title, category (required); period, description, file_path, file_name optional.

    Phase D25: optional EAP_REQUIRE_SESSION_IDENTITY — require_session_role_if_enabled(conn, "teacher")
    after required-field validation (no class membership; task_templates has no class_name/owner).
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    title = (data.get("title") or "").strip()
    category = (data.get("category") or "").strip()
    period = data.get("period")
    description = data.get("description")
    period_s = "" if period is None else str(period)
    description_s = "" if description is None else str(description)
    title_zh = (data.get("title_zh") or "").strip() or None
    description_zh = (data.get("description_zh") or "").strip() or None

    fp = None
    fn = None
    raw_fp = data.get("file_path")
    if raw_fp is not None and str(raw_fp).strip():
        fp = str(raw_fp).strip()
        raw_fn = data.get("file_name")
        fn_str = str(raw_fn).strip() if raw_fn is not None else ""
        fn = fn_str if fn_str else None

    if not name or not title or not category:
        return jsonify({"error": "name, title, and category are required"}), 400

    conn = get_db_connection()
    d25_guard_err = require_session_role_if_enabled(conn, "teacher")
    if d25_guard_err is not None:
        conn.close()
        return d25_guard_err

    cursor = conn.execute(
        """
        INSERT INTO task_templates
            (name, title, title_zh, category, period, description, description_zh, file_path, file_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """,
        (name, title, title_zh, category, period_s, description_s, description_zh, fp, fn),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute(
        "SELECT * FROM task_templates WHERE id = ?",
        (new_id,),
    ).fetchone()
    conn.close()
    return jsonify(template_to_dict(row)), 201


@app.route("/api/task-templates/<int:template_id>", methods=["PUT"])
def update_task_template(template_id):
    """
    Update a reusable template (name, title, category, period, description, optional material refs).

    Phase E7: allows teachers to refine saved templates from the manage list.
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    title = (data.get("title") or "").strip()
    category = (data.get("category") or "").strip()
    if not name or not title or not category:
        return jsonify({"error": "name, title, and category are required"}), 400

    period = data.get("period")
    description = data.get("description")
    period_s = "" if period is None else str(period)
    description_s = "" if description is None else str(description)
    title_zh = (data.get("title_zh") or "").strip() or None
    description_zh = (data.get("description_zh") or "").strip() or None

    fp = None
    fn = None
    if "file_path" in data:
        raw_fp = data.get("file_path")
        if raw_fp is not None and str(raw_fp).strip():
            fp = str(raw_fp).strip()
            raw_fn = data.get("file_name")
            fn_str = str(raw_fn).strip() if raw_fn is not None else ""
            fn = fn_str if fn_str else None

    conn = get_db_connection()
    row = conn.execute(
        "SELECT id FROM task_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Template not found"}), 404

    d25_guard_err = require_session_role_if_enabled(conn, "teacher")
    if d25_guard_err is not None:
        conn.close()
        return d25_guard_err

    if "file_path" in data:
        conn.execute(
            """
            UPDATE task_templates
            SET name = ?, title = ?, title_zh = ?, category = ?, period = ?,
                description = ?, description_zh = ?, file_path = ?, file_name = ?,
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                name,
                title,
                title_zh,
                category,
                period_s,
                description_s,
                description_zh,
                fp,
                fn,
                template_id,
            ),
        )
    else:
        conn.execute(
            """
            UPDATE task_templates
            SET name = ?, title = ?, title_zh = ?, category = ?, period = ?,
                description = ?, description_zh = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                name,
                title,
                title_zh,
                category,
                period_s,
                description_s,
                description_zh,
                template_id,
            ),
        )
    conn.commit()
    updated = conn.execute(
        "SELECT * FROM task_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    conn.close()
    return jsonify(template_to_dict(updated))


@app.route("/api/task-templates/<int:template_id>", methods=["DELETE"])
def delete_task_template(template_id):
    """
    Remove one task_templates row only.

    Does not delete calendar_tasks, uploads on disk, or any submission/feedback data.

    Phase D25: optional EAP_REQUIRE_SESSION_IDENTITY — require_session_role_if_enabled(conn, "teacher")
    after template existence check (404 first).
    """
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id FROM task_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Template not found"}), 404

    d25_guard_err = require_session_role_if_enabled(conn, "teacher")
    if d25_guard_err is not None:
        conn.close()
        return d25_guard_err

    conn.execute("DELETE FROM task_templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()
    return jsonify(
        {
            "ok": True,
            "id": template_id,
            "message": "Template deleted.",
        }
    )


@app.route("/api/task-templates/<int:template_id>/apply", methods=["POST"])
def apply_task_template(template_id):
    """
    Create a new calendar_tasks row from a template.

    JSON: date (required), class_name (optional), include_material (bool).
    Does not copy submissions or feedback — new task is always Pending.

    Phase D21: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement after template row is found (404 first).
    """
    data = request.get_json(silent=True) or {}
    new_date = (data.get("date") or "").strip()
    if not new_date or len(new_date) < 10:
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    new_date = new_date[:10]

    new_class = normalize_class_name(data.get("class_name"))
    include_material = bool(data.get("include_material"))

    conn = get_db_connection()
    tmpl = conn.execute(
        "SELECT * FROM task_templates WHERE id = ?",
        (template_id,),
    ).fetchone()
    if tmpl is None:
        conn.close()
        return jsonify({"error": "Template not found"}), 404

    _, d21_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        new_class,
    )
    if d21_guard_err is not None:
        conn.close()
        return d21_guard_err

    fp = None
    fn = None
    if include_material:
        sfp = (tmpl["file_path"] or "").strip() if tmpl["file_path"] is not None else ""
        if sfp:
            fp = sfp
            sfn = (tmpl["file_name"] or "").strip() if tmpl["file_name"] is not None else ""
            fn = sfn if sfn else None

    title_zh = None
    description_zh = None
    try:
        title_zh = tmpl["title_zh"]
        description_zh = tmpl["description_zh"]
    except (IndexError, KeyError):
        pass

    cursor = conn.execute(
        """
        INSERT INTO calendar_tasks
            (date, title, title_zh, category, period, description, description_zh, status, class_name, file_path, file_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            new_date,
            tmpl["title"],
            title_zh,
            tmpl["category"],
            tmpl["period"],
            tmpl["description"],
            description_zh,
            "Pending",
            new_class,
            fp,
            fn,
        ),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (new_id,),
    ).fetchone()
    conn.close()
    return jsonify(task_to_dict(row)), 201


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """
    Get tasks with optional filters (only rows that match every filter you pass).

    Shared calendar feed for student and teacher calendar views (month pills and daily lists).
    Response shape is unchanged; per-student completion is on my-completions routes, not here.

    Phase D38: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP — when either is on,
    class_name is required; students must be enrolled and teachers assigned for that class;
    anonymous all-task listing is blocked. With flags off, legacy behaviour is unchanged.

    Examples:
        /api/tasks?date=2026-05-10&class_name=EAP047
        /api/tasks?class_name=EAP047
        /api/tasks?date=2026-05-10
        /api/tasks   (no filters → all tasks; only when strict flags are off)
    """
    selected_date = request.args.get("date")
    class_name_filter = request.args.get("class_name")

    strict = should_require_session_identity() or should_enforce_membership()

    if strict:
        if class_name_filter is None or str(class_name_filter).strip() == "":
            return jsonify({"error": "class_name is required"}), 400

        class_name_norm = normalize_class_name(class_name_filter)
        conn = get_db_connection()

        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401

        role = str(actor["role"] or "").strip()
        if role == "student":
            _, d38_student_guard_err = resolve_student_with_optional_enforcement(
                conn,
                None,
                class_name_norm,
            )
            if d38_student_guard_err is not None:
                conn.close()
                return d38_student_guard_err
        elif role == "teacher":
            _, d38_teacher_guard_err = resolve_teacher_with_optional_enforcement(
                conn,
                None,
                class_name_norm,
            )
            if d38_teacher_guard_err is not None:
                conn.close()
                return d38_teacher_guard_err
        else:
            conn.close()
            return jsonify({"error": "Forbidden"}), 403

        conditions = ["class_name = ?"]
        params = [class_name_norm]
        if selected_date:
            conditions.append("date = ?")
            params.append(selected_date)

        where_clause = " AND ".join(conditions)
        tasks = conn.execute(
            f"SELECT * FROM calendar_tasks WHERE {where_clause} ORDER BY id DESC",
            params,
        ).fetchall()
        role = str(actor["role"] or "").strip()
        from recorded_lessons import enrich_task_dicts_with_recordings

        out = [task_to_dict(task) for task in tasks]
        enrich_task_dicts_with_recordings(
            conn, out, published_only=(role == "student")
        )
        from task_materials import enrich_task_dicts_with_materials
        from teaching_page_tasks import enrich_task_dicts_with_teaching_pages

        enrich_task_dicts_with_materials(conn, out)
        enrich_task_dicts_with_teaching_pages(
            conn, out, published_only=(role == "student")
        )
        conn.close()
        return jsonify(out)

    conditions = []
    params = []

    if selected_date:
        conditions.append("date = ?")
        params.append(selected_date)

    if class_name_filter is not None and str(class_name_filter).strip() != "":
        conditions.append("class_name = ?")
        params.append(class_name_filter.strip())

    conn = get_db_connection()

    if conditions:
        where_clause = " AND ".join(conditions)
        tasks = conn.execute(
            f"SELECT * FROM calendar_tasks WHERE {where_clause} ORDER BY id DESC",
            params,
        ).fetchall()
    else:
        tasks = conn.execute(
            "SELECT * FROM calendar_tasks ORDER BY id DESC",
        ).fetchall()

    from recorded_lessons import enrich_task_dicts_with_recordings

    out = [task_to_dict(task) for task in tasks]
    actor = get_current_authenticated_user(conn)
    if actor is not None:
        role = str(actor["role"] or "").strip()
        enrich_task_dicts_with_recordings(
            conn, out, published_only=(role == "student")
        )
        from task_materials import enrich_task_dicts_with_materials
        from teaching_page_tasks import enrich_task_dicts_with_teaching_pages

        enrich_task_dicts_with_materials(conn, out)
        enrich_task_dicts_with_teaching_pages(
            conn, out, published_only=(role == "student")
        )
    conn.close()

    return jsonify(out)


@app.route("/api/tasks/my-completions", methods=["GET"])
def batch_get_student_task_completions():
    """
    Phase D7: batch per-student completion for many task ids (same class scope).

    Query: class_name (required), student_username optional fallback,
           task_ids required comma-separated e.g. 1,2,3
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400
    class_name_norm = normalize_class_name(raw_class)

    raw_ids = request.args.get("task_ids")
    if raw_ids is None or str(raw_ids).strip() == "":
        conn.close()
        return jsonify({"error": "task_ids is required"}), 400

    task_ids_clean = []
    seen = set()
    for part in str(raw_ids).split(","):
        p = part.strip()
        if not p:
            continue
        try:
            tid_i = int(p, 10)
        except ValueError:
            conn.close()
            return jsonify({"error": "task_ids must be a comma-separated list of integers"}), 400
        if tid_i <= 0 or tid_i > 10**9:
            conn.close()
            return jsonify({"error": "task_ids must be a comma-separated list of integers"}), 400
        if tid_i not in seen:
            seen.add(tid_i)
            task_ids_clean.append(tid_i)

    if not task_ids_clean:
        conn.close()
        return jsonify({"error": "task_ids is required"}), 400

    if len(task_ids_clean) > 400:
        conn.close()
        return jsonify({"error": "task_ids list is too large"}), 400

    in_scope_ids = []
    for tid_i in task_ids_clean:
        trow = conn.execute(
            "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
            (tid_i,),
        ).fetchone()
        if trow is None:
            continue
        if normalize_class_name(trow["class_name"]) != class_name_norm:
            continue
        in_scope_ids.append(tid_i)

    completions = {}
    if in_scope_ids:
        placeholders = ",".join("?" * len(in_scope_ids))
        rows = conn.execute(
            f"""
            SELECT task_id, status, completed_at
            FROM student_task_status
            WHERE student_username = ? AND class_name = ? AND task_id IN ({placeholders})
            """,
            (student_username, class_name_norm, *in_scope_ids),
        ).fetchall()
        by_tid = {int(r["task_id"]): r for r in rows}
        for tid_i in in_scope_ids:
            r = by_tid.get(tid_i)
            completions[str(tid_i)] = _batch_completion_entry_json(tid_i, r)

    conn.close()

    return jsonify(
        {
            "student_username": student_username,
            "class_name": class_name_norm,
            "completions": completions,
        }
    )


def _batch_completion_entry_json(task_id, row_or_none):
    if row_or_none is None:
        st = "Pending"
        cm = False
        ca = None
    else:
        st_raw = str(row_or_none["status"] or "").strip()
        st = "Completed" if st_raw.lower() == "completed" else "Pending"
        cm = st == "Completed"
        ca = row_or_none["completed_at"] if cm else None
    return {
        "task_id": int(task_id),
        "status": st,
        "completed": cm,
        "completed_at": ca,
    }


@app.route("/api/tasks/<int:task_id>/my-completion", methods=["GET"])
def get_student_task_my_completion(task_id):
    """Phase D7: effective student's completion for one calendar task."""
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400
    class_name_norm = normalize_class_name(raw_class)

    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    if task is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    if normalize_class_name(task["class_name"]) != class_name_norm:
        conn.close()
        return jsonify({"error": "class_name does not match this task's class"}), 403

    row = conn.execute(
        """
        SELECT task_id, status, completed_at
        FROM student_task_status
        WHERE task_id = ? AND student_username = ? AND class_name = ?
        LIMIT 1
        """,
        (task_id, student_username, class_name_norm),
    ).fetchone()
    conn.close()

    payload = my_completion_json_response(task_id, student_username, class_name_norm, row)
    return jsonify(payload)


@app.route("/api/tasks/<int:task_id>/my-completion", methods=["PUT"])
def put_student_task_my_completion(task_id):
    """
    Phase D7: set effective student's completion; does not change calendar_tasks.status.

    Phase D36: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_student_with_optional_enforcement(conn, …, normalize_class_name(calendar_tasks.class_name))
    after task **404**. Authorization uses the task row class, not the body alone for membership.
    With strict flags on, student must be logged in and enrolled in the task class.
    Returned session-resolved student_username is used for **student_task_status**.
    With flags **off**, legacy anonymous/body **student_username** behaviour is unchanged.
    """
    data = request.get_json(silent=True) or {}

    conn = get_db_connection()

    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    if task is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    task_class = normalize_class_name(task["class_name"])
    student_username, d36_completion_guard_err = resolve_student_with_optional_enforcement(
        conn,
        data.get("student_username"),
        task_class,
    )
    if d36_completion_guard_err is not None:
        conn.close()
        return d36_completion_guard_err

    raw_class = data.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400
    class_name_norm = normalize_class_name(raw_class)

    if task_class != class_name_norm:
        conn.close()
        return jsonify({"error": "class_name does not match this task's class"}), 403

    st_in = (data.get("status") or "Completed").strip()
    if st_in.lower() not in ("pending", "completed"):
        conn.close()
        return jsonify({"error": "status must be Pending or Completed"}), 400
    canon = "Completed" if st_in.lower() == "completed" else "Pending"

    try:
        upsert_student_task_status_row(
            conn, task_id, student_username, class_name_norm, canon
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        conn.close()
        return jsonify({"error": "Could not save completion status"}), 500

    row = conn.execute(
        """
        SELECT task_id, status, completed_at
        FROM student_task_status
        WHERE task_id = ? AND student_username = ? AND class_name = ?
        LIMIT 1
        """,
        (task_id, student_username, class_name_norm),
    ).fetchone()
    conn.close()

    payload = my_completion_json_response(task_id, student_username, class_name_norm, row)
    return jsonify(payload)


@app.route("/api/tasks/<int:task_id>/complete", methods=["PUT"])
def complete_task(task_id):
    """
    Legacy global completion: sets **calendar_tasks.status** to **Completed** for the row
    (class-wide, not per-student). **student_task_status** is not used here.

    Phase D31: when **`should_require_session_identity()`** or **`should_enforce_membership()`**
    is true, this route returns **410** with a JSON hint and performs **no** database access.
    Supported per-student completion is **`PUT /api/tasks/<task_id>/my-completion`**
    (writes **student_task_status**; does not change **calendar_tasks.status**).

    With both flags off, behaviour matches the pre-D31 legacy path (no cookie required).
    """
    if should_require_session_identity() or should_enforce_membership():
        return jsonify(
            {
                "error": "Legacy global task completion is disabled",
                "message": "Use PUT /api/tasks/<task_id>/my-completion for per-student completion.",
            }
        ), 410

    conn = get_db_connection()

    conn.execute(
        "UPDATE calendar_tasks SET status = ? WHERE id = ?",
        ("Completed", task_id),
    )

    conn.commit()

    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    conn.close()

    if task is None:
        return jsonify({"error": "Task not found"}), 404

    return jsonify(task_to_dict(task))


@app.route("/api/tasks/<int:task_id>/upload", methods=["POST"])
def upload_task_file(task_id):
    """
    Upload a teaching material and attach it to an existing calendar task.

    Expects multipart/form-data from the browser with one part named "file"
    (the usual name when using JavaScript FormData.append("file", input.files[0])).

    Allowed extensions: pdf, doc, docx, ppt, pptx, mp3, mp4, txt, jpg, png.

    Saves a new random filename under backend/uploads/, then sets calendar_tasks.file_path
    and file_name. If the task already had a file, the old file is deleted from disk.

    Phase D17: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement after the calendar_tasks row is found (404 first).
    """
    ensure_uploads_directory()

    conn = get_db_connection()
    row = conn.execute(
        "SELECT id, file_path, class_name FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    if row is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    _, d17_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        row["class_name"],
    )
    if d17_guard_err is not None:
        conn.close()
        return d17_guard_err

    if "file" not in request.files:
        conn.close()
        return jsonify({"error": 'Missing form part named "file"'}), 400

    upload = request.files["file"]
    if upload is None or upload.filename is None or upload.filename.strip() == "":
        conn.close()
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file_extension(upload.filename):
        conn.close()
        return jsonify(
            {
                "error": (
                    "File type not allowed. Allowed: pdf, doc, docx, ppt, pptx, "
                    "mp3, mp4, txt, jpg, png"
                ),
            }
        ), 400

    ext = upload.filename.rsplit(".", 1)[-1].lower()
    # Safe unique name on disk (no user-controlled path segments).
    stored_name = f"{uuid.uuid4().hex}.{ext}"
    dest_abs = os.path.join(UPLOAD_DIR, stored_name)

    # Human-readable original filename (basename only; cap length for the database).
    display_name = os.path.basename(upload.filename.strip())[:512]

    previous = row["file_path"]

    try:
        upload.save(dest_abs)
        conn.execute(
            """
            UPDATE calendar_tasks
            SET file_path = ?, file_name = ?
            WHERE id = ?
            """,
            (stored_name, display_name, task_id),
        )
        conn.commit()
    except OSError:
        conn.close()
        if os.path.isfile(dest_abs):
            try:
                os.remove(dest_abs)
            except OSError:
                pass
        return jsonify({"error": "Could not save file on server"}), 500
    except sqlite3.Error:
        conn.rollback()
        conn.close()
        if os.path.isfile(dest_abs):
            try:
                os.remove(dest_abs)
            except OSError:
                pass
        return jsonify({"error": "Could not update task in database"}), 500

    conn.close()

    # DB updated successfully — drop the previous attachment if any.
    remove_file_if_exists(previous)

    conn = get_db_connection()
    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    conn.close()

    return jsonify(task_to_dict(task)), 200


@app.route("/uploads/<filename>", methods=["GET"])
def download_upload(filename):
    """
    Download a file stored under backend/uploads/.

    as_attachment=True sends Content-Disposition: attachment so browsers offer a real
    download (PDF, images, plain text, etc.) instead of only opening inline.

    Only plain filenames are allowed (no folders or ".." segments).

    Phase D40: when EAP_REQUIRE_SESSION_IDENTITY or EAP_ENFORCE_MEMBERSHIP is on, requires a
    logged-in user and DB-backed authorization via calendar_tasks (class enrollment/assignment)
    or task_templates (teacher-only when no matching task row). Orphan files return 404.
    With flags off, legacy direct download behaviour is unchanged.
    """
    ensure_uploads_directory()

    base = safe_download_basename(filename)
    if base is None:
        abort(404)

    if is_strict_security_enabled():
        conn = get_db_connection()
        d40_auth = authorize_upload_download(conn, base)
        conn.close()
        if d40_auth == "not_found":
            abort(404)
        if d40_auth is not None:
            return d40_auth

    resolved_dir, base = resolve_safe_file_in_directory(UPLOAD_DIR, base)
    if resolved_dir is None:
        abort(404)

    return send_from_directory(
        resolved_dir,
        base,
        as_attachment=True,
        download_name=base,
    )


@app.route("/api/tasks/<int:task_id>/submit", methods=["POST"])
def submit_task_homework(task_id):
    """
    Save a student's homework for one calendar task.

    Expects multipart/form-data (FormData from the browser).

    Form fields (text parts):
        student_id         — optional; user's id from login (stored as INTEGER or NULL)
        student_username   — optional; Flask session student wins when role is student (Phase D6)
        student_name       — optional; e.g. full name for teachers to read
        class_name         — should match the task's class (we verify for safety)
        answer_text        — optional if a file is attached, but you must send at least one of
                             answer_text (non-empty) or a file

    Form file:
        file — optional; allowed types: pdf, doc, docx, txt, jpg, png

    The file is stored under backend/submissions/ with a random safe basename.

    Phase D35: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_student_with_optional_enforcement(conn, …, normalize_class_name(calendar_tasks.class_name))
    after task **404** and before disk save or INSERT. Authorization uses the task row class, not
    the form class_name. With flags **off**, legacy form-username behaviour is unchanged.
    """
    ensure_submissions_directory()

    # ---- Read text fields from the form (multipart parts that are not the file). ----
    raw_student_id = (request.form.get("student_id") or "").strip()
    student_id = None
    if raw_student_id:
        try:
            student_id = int(raw_student_id)
        except ValueError:
            return jsonify({"error": "student_id must be a whole number if provided"}), 400

    student_name = (request.form.get("student_name") or "").strip() or None
    form_class_name = normalize_class_name(request.form.get("class_name"))
    answer_text_raw = request.form.get("answer_text")
    answer_text = (answer_text_raw or "").strip() or None

    # ---- Optional file part named "file" (same convention as teacher upload). ----
    upload = None
    if "file" in request.files:
        candidate = request.files["file"]
        if candidate is not None and candidate.filename and candidate.filename.strip():
            upload = candidate

    if upload is not None and not allowed_homework_extension(upload.filename):
        return jsonify(
            {
                "error": (
                    "Homework file type not allowed. Allowed: "
                    "pdf, doc, docx, txt, jpg, png"
                ),
            }
        ), 400

    has_file = upload is not None
    if not answer_text and not has_file:
        return jsonify(
            {
                "error": "Send answer_text and/or a homework file",
            }
        ), 400

    conn = get_db_connection()
    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()

    if task is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    task_class = normalize_class_name(task["class_name"])
    student_username, d35_student_guard_err = resolve_student_with_optional_enforcement(
        conn,
        request.form.get("student_username"),
        task_class,
    )
    if d35_student_guard_err is not None:
        conn.close()
        return d35_student_guard_err

    # Same class as on the task row keeps homework scoped to the right group.
    if task_class != form_class_name:
        conn.close()
        return jsonify(
            {"error": "class_name does not match this task's class"},
        ), 403

    stored_name = None
    display_name = None
    dest_abs = None
    if has_file:
        ext = upload.filename.rsplit(".", 1)[-1].lower()
        stored_name = f"{uuid.uuid4().hex}.{ext}"
        dest_abs = os.path.join(SUBMISSIONS_DIR, stored_name)
        display_name = os.path.basename(upload.filename.strip())[:512]

    if dest_abs is not None:
        try:
            upload.save(dest_abs)
        except OSError:
            conn.close()
            return jsonify({"error": "Could not save homework file on server"}), 500

    submitted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    existing = _submission_row_for_student_task(conn, task_id, student_username)

    try:
        if existing is not None:
            prev_path = existing["file_path"]
            if has_file and prev_path and str(prev_path).strip() != str(stored_name or "").strip():
                remove_homework_disk_file(prev_path)
            if not has_file:
                stored_name = existing["file_path"]
                display_name = existing["file_name"]
            conn.execute(
                """
                UPDATE submissions SET
                    student_id = ?,
                    student_name = ?,
                    answer_text = ?,
                    file_path = ?,
                    file_name = ?,
                    submitted_at = ?
                WHERE id = ?
                """,
                (
                    student_id,
                    student_name,
                    answer_text,
                    stored_name,
                    display_name,
                    submitted_at,
                    existing["id"],
                ),
            )
            conn.commit()
            new_id = existing["id"]
            created = False
        else:
            cursor = conn.execute(
                """
                INSERT INTO submissions (
                    task_id, student_id, student_username, student_name, class_name,
                    answer_text, file_path, file_name, submitted_at, teacher_feedback, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    student_id,
                    student_username,
                    student_name,
                    form_class_name,
                    answer_text,
                    stored_name,
                    display_name,
                    submitted_at,
                    None,
                    "Submitted",
                ),
            )
            conn.commit()
            new_id = cursor.lastrowid
            created = True
    except sqlite3.Error:
        conn.rollback()
        conn.close()
        if dest_abs is not None and os.path.isfile(dest_abs):
            try:
                os.remove(dest_abs)
            except OSError:
                pass
        return jsonify({"error": "Could not save submission in database"}), 500

    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (new_id,),
    ).fetchone()
    payload = submission_with_attachments(conn, row)
    conn.close()

    try:
        from homework_marking import queue_report_generation, _task_allows_ai_marking

        gen_kw = app.config.get("EAP_HOMEWORK_MARKING_GEN_KWARGS")
        if gen_kw:
            conn_hm = get_db_connection()
            try:
                task_row = conn_hm.execute(
                    "SELECT * FROM calendar_tasks WHERE id = ?",
                    (int(task_id),),
                ).fetchone()
                if task_row and _task_allows_ai_marking(conn_hm, int(task_id), task_row):
                    queue_report_generation(new_id, **gen_kw)
            finally:
                conn_hm.close()
    except Exception:
        pass

    return jsonify(payload), (201 if created else 200)


@app.route("/api/tasks/<int:task_id>/submissions", methods=["GET"])
def get_submissions_for_task(task_id):
    """
    Return every homework submission saved for this task (newest id first).

    Phase D11: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP — after the task
    row is found, resolve_teacher_with_optional_enforcement uses calendar_tasks.class_name
    (no class_name query param required). Response shape unchanged (JSON array).
    """
    conn = get_db_connection()
    task_row = conn.execute(
        "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if task_row is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    task_class_name = task_row["class_name"]
    _, d11_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        task_class_name,
    )
    if d11_guard_err is not None:
        conn.close()
        return d11_guard_err

    rows = conn.execute(
        """
        SELECT * FROM submissions
        WHERE task_id = ?
        ORDER BY id DESC
        """,
        (task_id,),
    ).fetchall()
    payload = submissions_list_with_attachments(conn, rows)
    conn.close()
    return jsonify(payload)


@app.route("/api/tasks/<int:task_id>/my-submission", methods=["GET"])
def get_my_submission_for_task(task_id):
    """
    Latest homework row for this student + task (does not return other students).

    Query: student_username — required when no student Flask session; optional when
    logged in as student (Phase D4). class_name matches task class like POST submit.
    Response: one submission object JSON, or HTTP 200 with JSON null if none.
    """
    conn = get_db_connection()
    q_class = normalize_class_name(request.args.get("class_name"))
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), q_class
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    task = conn.execute(
        "SELECT * FROM calendar_tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if task is None:
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    task_class = normalize_class_name(task["class_name"])
    if task_class != q_class:
        conn.close()
        return jsonify({"error": "class_name does not match this task's class"}), 403

    row = _submission_row_for_student_task(conn, task_id, student_username)

    if row is None:
        conn.close()
        return jsonify(None)

    payload = submission_with_attachments(conn, row)
    conn.close()
    return jsonify(payload)


@app.route("/api/submissions/<int:submission_id>/feedback", methods=["PUT"])
def update_submission_feedback(submission_id):
    """
    Teacher updates feedback on one submission row.

    Phase D15: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement after submission row is found (404 first).

    A) JSON (application/json) — unchanged behaviour for text-only clients:
        { "teacher_feedback": "...", "status": "Feedback Given" }
        Only teacher_feedback and status are updated; optional feedback_file_* columns stay as-is.

    B) multipart/form-data (FormData from the teacher page):
        teacher_feedback — string (may be empty if a file is attached)
        status — optional, defaults to "Feedback Given"
        file — optional; allowed: pdf, doc, docx, txt, jpg, png (same as homework)

    For (B), require at least one of: non-empty teacher_feedback after trim, or an uploaded file.
    A new file overwrites feedback_file_path / feedback_file_name / feedback_file_uploaded_at;
    the previous file may remain on disk for this MVP.
    """
    ensure_submissions_directory()

    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()

    if row is None:
        conn.close()
        return jsonify({"error": "Submission not found"}), 404

    teacher_username, d15_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        row["class_name"],
    )
    if d15_guard_err is not None:
        conn.close()
        return d15_guard_err

    ct = (request.content_type or "").lower()
    if "multipart/form-data" in ct:
        teacher_feedback_raw = request.form.get("teacher_feedback")
        teacher_feedback = (
            "" if teacher_feedback_raw is None else str(teacher_feedback_raw)
        )
        status = (request.form.get("status") or "").strip() or "Feedback Given"

        upload = None
        if "file" in request.files:
            candidate = request.files["file"]
            if candidate is not None and candidate.filename and candidate.filename.strip():
                upload = candidate

        has_text = bool(teacher_feedback.strip())
        has_file = upload is not None

        if not has_text and not has_file:
            conn.close()
            return jsonify(
                {"error": "Send teacher_feedback text and/or a feedback file"},
            ), 400

        if upload is not None and not allowed_homework_extension(upload.filename):
            conn.close()
            return jsonify(
                {
                    "error": (
                        "Feedback file type not allowed. Allowed: "
                        "pdf, doc, docx, txt, jpg, png"
                    ),
                },
            ), 400

        stored_name = None
        display_name = None
        dest_abs = None
        if has_file:
            ext = upload.filename.rsplit(".", 1)[-1].lower()
            stored_name = f"{uuid.uuid4().hex}.{ext}"
            dest_abs = os.path.join(SUBMISSIONS_DIR, stored_name)
            display_name = os.path.basename(upload.filename.strip())[:512]

        if dest_abs is not None:
            try:
                upload.save(dest_abs)
            except OSError:
                conn.close()
                return jsonify({"error": "Could not save feedback file on server"}), 500

        feedback_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if has_file:
            conn.execute(
                """
                UPDATE submissions SET
                    teacher_feedback = ?,
                    status = ?,
                    feedback_file_path = ?,
                    feedback_file_name = ?,
                    feedback_file_uploaded_at = ?
                WHERE id = ?
                """,
                (
                    teacher_feedback,
                    status,
                    stored_name,
                    display_name,
                    feedback_at,
                    submission_id,
                ),
            )
        else:
            conn.execute(
                """
                UPDATE submissions SET teacher_feedback = ?, status = ?
                WHERE id = ?
                """,
                (teacher_feedback, status, submission_id),
            )
        stamp_submission_feedback_attribution(
            conn, submission_id, teacher_username, feedback_at=feedback_at
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        payload = submission_with_attachments(conn, row)
        conn.close()
        return jsonify(payload)

    # ---- JSON path (legacy / simple text updates) ----
    data = request.get_json(silent=True) or {}

    raw_feedback = data.get("teacher_feedback")
    if raw_feedback is None:
        teacher_feedback = ""
    else:
        teacher_feedback = str(raw_feedback)

    status = (data.get("status") or "").strip() or "Feedback Given"

    conn.execute(
        """
        UPDATE submissions SET teacher_feedback = ?, status = ?
        WHERE id = ?
        """,
        (teacher_feedback, status, submission_id),
    )
    stamp_submission_feedback_attribution(conn, submission_id, teacher_username)
    conn.commit()

    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()
    payload = submission_with_attachments(conn, row)
    conn.close()

    return jsonify(payload)


@app.route("/api/submissions/<int:submission_id>/feedback-files", methods=["POST"])
def post_submission_feedback_files(submission_id):
    """
    Teacher uploads one or more additional feedback files (max 3 total rows with
    attachment_type teacher_feedback for this submission).

    Phase D15: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement after submission row is found (404 first).

    multipart/form-data:
        files — one or more file parts (same field name "files" repeated)
        uploaded_by_username — optional; stored on each new row
    """
    ensure_submissions_directory()

    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Submission not found"}), 404

    teacher_username, d15_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        row["class_name"],
    )
    if d15_guard_err is not None:
        conn.close()
        return d15_guard_err

    existing = conn.execute(
        """
        SELECT COUNT(*) FROM submission_attachments
        WHERE submission_id = ? AND attachment_type = ?
        """,
        (submission_id, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchone()[0]

    uploads = [
        f
        for f in request.files.getlist("files")
        if f and f.filename and str(f.filename).strip()
    ]

    if not uploads:
        conn.close()
        return jsonify({"error": "No files received (use form field name: files)"}), 400

    if existing + len(uploads) > MAX_TEACHER_FEEDBACK_ATTACHMENTS:
        conn.close()
        return jsonify(
            {
                "error": (
                    f"At most {MAX_TEACHER_FEEDBACK_ATTACHMENTS} teacher feedback files "
                    f"per submission ({existing} already saved)."
                ),
            },
        ), 400

    for up in uploads:
        if not allowed_homework_extension(up.filename):
            conn.close()
            return jsonify(
                {
                    "error": (
                        "Feedback file type not allowed. Allowed: "
                        "pdf, doc, docx, txt, jpg, png"
                    ),
                },
            ), 400

    uploaded_by_username = (request.form.get("uploaded_by_username") or "").strip() or None
    if not uploaded_by_username and teacher_username:
        uploaded_by_username = teacher_username
    uploaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    saved_paths = []

    try:
        for up in uploads:
            ext = up.filename.rsplit(".", 1)[-1].lower()
            stored_name = f"{uuid.uuid4().hex}.{ext}"
            dest_abs = os.path.join(SUBMISSIONS_DIR, stored_name)
            display_name = os.path.basename(up.filename.strip())[:512]
            up.save(dest_abs)
            saved_paths.append(dest_abs)
            conn.execute(
                """
                INSERT INTO submission_attachments (
                    submission_id, attachment_type, file_path, file_name,
                    uploaded_at, uploaded_by_role, uploaded_by_username
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    submission_id,
                    ATTACHMENT_TYPE_TEACHER_FEEDBACK,
                    stored_name,
                    display_name,
                    uploaded_at,
                    "teacher",
                    uploaded_by_username,
                ),
            )
        conn.execute(
            """
            UPDATE submissions SET status = ?
            WHERE id = ? AND TRIM(COALESCE(status, '')) != 'Feedback Given'
            """,
            ("Feedback Given", submission_id),
        )
        stamp_submission_feedback_attribution(
            conn, submission_id, uploaded_by_username or teacher_username, feedback_at=uploaded_at
        )
        conn.commit()
    except (OSError, sqlite3.Error):
        conn.rollback()
        for p in saved_paths:
            if os.path.isfile(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        conn.close()
        return jsonify({"error": "Could not save feedback files"}), 500

    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()
    payload = submission_with_attachments(conn, row)
    conn.close()
    return jsonify(payload), 201


@app.route("/api/submissions/<int:submission_id>/attachments", methods=["GET"])
def list_submission_attachments(submission_id):
    """
    List attachments for a submission. Query: attachment_type (default teacher_feedback).

    Phase D42: when strict flags are on, requires a logged-in user authorized for the submission
    row: student owner enrolled in submissions.class_name, or teacher assigned to that class.
    Unknown submission_id returns 404 before auth. Response shape unchanged.
    """
    att_type = (request.args.get("attachment_type") or ATTACHMENT_TYPE_TEACHER_FEEDBACK).strip()
    if att_type != ATTACHMENT_TYPE_TEACHER_FEEDBACK:
        return jsonify({"error": "Unsupported attachment_type for this endpoint"}), 400

    conn = get_db_connection()
    submission_row = conn.execute(
        "SELECT id, student_username, class_name FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()
    if submission_row is None:
        conn.close()
        return jsonify({"error": "Submission not found"}), 404

    if is_strict_security_enabled():
        submission_class = normalize_class_name(submission_row["class_name"])
        actor = get_current_authenticated_user(conn)
        if actor is None:
            conn.close()
            return jsonify({"error": "Not logged in"}), 401

        role = str(actor["role"] or "").strip()
        if role == "student":
            student_username, d42_student_guard_err = resolve_student_with_optional_enforcement(
                conn,
                None,
                submission_class,
            )
            if d42_student_guard_err is not None:
                conn.close()
                return d42_student_guard_err
            row_student = (submission_row["student_username"] or "").strip()
            if row_student != student_username:
                conn.close()
                return jsonify({"error": "Forbidden"}), 403
        elif role == "teacher":
            _, d42_teacher_guard_err = resolve_teacher_with_optional_enforcement(
                conn,
                None,
                submission_class,
            )
            if d42_teacher_guard_err is not None:
                conn.close()
                return d42_teacher_guard_err
        else:
            conn.close()
            return jsonify({"error": "Forbidden"}), 403

    rows = conn.execute(
        """
        SELECT id, submission_id, attachment_type, file_path, file_name, uploaded_at, uploaded_by_role, uploaded_by_username
        FROM submission_attachments
        WHERE submission_id = ? AND attachment_type = ?
        ORDER BY id ASC
        """,
        (submission_id, att_type),
    ).fetchall()
    conn.close()
    return jsonify([attachment_row_to_dict(r) for r in rows])


@app.route("/api/submission-attachments/<int:attachment_id>", methods=["DELETE"])
def delete_submission_attachment(attachment_id):
    """
    Remove one teacher_feedback attachment row (MVP: file may remain on disk).

    Phase D27: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement(conn, …, normalize_class_name(submissions.class_name))
    after attachment 404, wrong-type 400, and missing-submission 404 (all before guard).
    """
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM submission_attachments WHERE id = ?",
        (attachment_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Attachment not found"}), 404
    if (row["attachment_type"] or "").strip() != ATTACHMENT_TYPE_TEACHER_FEEDBACK:
        conn.close()
        return jsonify({"error": "Only teacher_feedback attachments can be deleted here"}), 400

    submission = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (row["submission_id"],),
    ).fetchone()
    if submission is None:
        conn.close()
        return jsonify({"error": "Submission not found"}), 404

    class_name = normalize_class_name(submission["class_name"])
    _, d27_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        class_name,
    )
    if d27_guard_err is not None:
        conn.close()
        return d27_guard_err

    conn.execute("DELETE FROM submission_attachments WHERE id = ?", (attachment_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/submissions/<int:submission_id>/revision", methods=["PUT"])
def submit_submission_revision(submission_id):
    """
    Student uploads a revised answer after teacher feedback (one revision slot per row; PUT overwrites).

    multipart/form-data (FormData from the browser):
        revision_text   — optional if a file is attached; otherwise should be non-empty
        student_username — required; effective student (session or form) must match this submission row (Phase D6)
        class_name      — optional but recommended; must match the submission's class_name

    File part:
        file — optional; same allowed types as homework (pdf, doc, docx, txt, jpg, png)

    Phase D36: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_student_with_optional_enforcement(conn, …, normalize_class_name(submissions.class_name))
    after submission **404** and before file save or DB update. Authorization uses the submission row
    class, not the form alone for membership. With strict flags on, student must be logged in,
    enrolled in the submission class, and own the submission. With flags **off**, legacy form-username
    behaviour is unchanged.
    """
    ensure_submissions_directory()

    form_class_name = normalize_class_name(request.form.get("class_name"))
    revision_text_raw = request.form.get("revision_text")
    revision_text = (revision_text_raw or "").strip() or None

    upload = None
    if "file" in request.files:
        candidate = request.files["file"]
        if candidate is not None and candidate.filename and candidate.filename.strip():
            upload = candidate

    if upload is not None and not allowed_homework_extension(upload.filename):
        return jsonify(
            {
                "error": (
                    "Revision file type not allowed. Allowed: "
                    "pdf, doc, docx, txt, jpg, png"
                ),
            }
        ), 400

    has_new_file = upload is not None
    if revision_text is None and not has_new_file:
        return jsonify(
            {"error": "Send revision_text and/or a revision file"},
        ), 400

    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()

    if row is None:
        conn.close()
        return jsonify({"error": "Submission not found"}), 404

    submission_class = normalize_class_name(row["class_name"])
    student_username, d36_revision_guard_err = resolve_student_with_optional_enforcement(
        conn,
        request.form.get("student_username"),
        submission_class,
    )
    if d36_revision_guard_err is not None:
        conn.close()
        return d36_revision_guard_err

    row_student = (row["student_username"] or "").strip()
    if row_student != student_username:
        conn.close()
        return jsonify({"error": "student_username does not match this submission"}), 403

    if submission_class != form_class_name:
        conn.close()
        return jsonify(
            {"error": "class_name does not match this submission's class"},
        ), 403

    stored_name = None
    display_name = None
    dest_abs = None
    if has_new_file:
        ext = upload.filename.rsplit(".", 1)[-1].lower()
        stored_name = f"{uuid.uuid4().hex}.{ext}"
        dest_abs = os.path.join(SUBMISSIONS_DIR, stored_name)
        display_name = os.path.basename(upload.filename.strip())[:512]

    if dest_abs is not None:
        try:
            upload.save(dest_abs)
        except OSError:
            conn.close()
            return jsonify({"error": "Could not save revision file on server"}), 500

    prev_revision_path = row["revision_file_path"]
    if has_new_file:
        new_revision_path = stored_name
        new_revision_display = display_name
    else:
        new_revision_path = row["revision_file_path"]
        new_revision_display = row["revision_file_name"]

    revision_plain = revision_text if revision_text is not None else ""
    revision_submitted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    revision_status = "Revision Submitted"

    try:
        conn.execute(
            """
            UPDATE submissions SET
                revision_text = ?,
                revision_file_path = ?,
                revision_file_name = ?,
                revision_submitted_at = ?,
                revision_status = ?
            WHERE id = ?
            """,
            (
                revision_plain,
                new_revision_path,
                new_revision_display,
                revision_submitted_at,
                revision_status,
                submission_id,
            ),
        )
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        conn.close()
        if dest_abs is not None and os.path.isfile(dest_abs):
            try:
                os.remove(dest_abs)
            except OSError:
                pass
        return jsonify({"error": "Could not save revision in database"}), 500

    conn.close()

    # Remove the previous revision file from disk only when it was replaced by a new upload.
    if has_new_file and prev_revision_path:
        prev_base = (prev_revision_path or "").strip()
        new_base = (new_revision_path or "").strip()
        if prev_base and prev_base != new_base:
            remove_homework_disk_file(prev_base)

    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM submissions WHERE id = ?",
        (submission_id,),
    ).fetchone()
    payload = submission_with_attachments(conn, row)
    conn.close()

    return jsonify(payload), 200


@app.route("/api/submissions", methods=["GET"])
def list_submissions_by_class():
    """
    List submissions, optionally filtered by class_name.

    Example: /api/submissions?class_name=EAP047
    If class_name is omitted, all submission rows are returned (newest first).

    Phase D13: when EAP_REQUIRE_SESSION_IDENTITY or EAP_ENFORCE_MEMBERSHIP is on,
    class_name is required and resolve_teacher_with_optional_enforcement applies.
    Not used by frontend/app.js; response shape unchanged (JSON array).
    """
    class_name_filter = request.args.get("class_name")
    conn = get_db_connection()

    if should_require_session_identity() or should_enforce_membership():
        if class_name_filter is None or str(class_name_filter).strip() == "":
            conn.close()
            return jsonify({"error": "class_name is required"}), 400
        _, d13_guard_err = resolve_teacher_with_optional_enforcement(
            conn,
            request.args.get("teacher_username"),
            class_name_filter,
        )
        if d13_guard_err is not None:
            conn.close()
            return d13_guard_err

    if class_name_filter is not None and str(class_name_filter).strip() != "":
        rows = conn.execute(
            """
            SELECT * FROM submissions
            WHERE class_name = ?
            ORDER BY id DESC
            """,
            (class_name_filter.strip(),),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM submissions ORDER BY id DESC",
        ).fetchall()

    payload = submissions_list_with_attachments(conn, rows)
    conn.close()
    return jsonify(payload)


@app.route("/submission-files/<filename>", methods=["GET"])
def download_submission_file(filename):
    """
    Download a homework file from backend/submissions/.

    Uses the same path safety checks as /uploads/<filename> for teaching materials.

    Phase D40: when strict flags are on, requires a logged-in user and DB-backed authorization:
    students may download their own homework, revision, and feedback files when enrolled in the
    submission class; teachers may download when assigned to that class. Orphan files return 404.
    With flags off, legacy direct download behaviour is unchanged.
    """
    ensure_submissions_directory()

    base = safe_download_basename(filename)
    if base is None:
        abort(404)

    if is_strict_security_enabled():
        conn = get_db_connection()
        d40_auth = authorize_submission_file_download(conn, base)
        conn.close()
        if d40_auth == "not_found":
            abort(404)
        if d40_auth is not None:
            return d40_auth

    resolved_dir, base = resolve_safe_file_in_directory(SUBMISSIONS_DIR, base)
    if resolved_dir is None:
        abort(404)

    return send_from_directory(
        resolved_dir,
        base,
        as_attachment=True,
        download_name=base,
    )


@app.route("/", methods=["GET"])
def home():
    """
    Helps when you open http://127.0.0.1:5050/ (default dev port) in the browser — shows quick links.
    """
    return jsonify(
        {
            "service": "EAP Platform API",
            "links": {
                "ui": "/ui/index.html (recommended — same origin as API for session cookies)",
                "health": "/api/health",
                "login": "/api/login",
                "me": "/api/me (GET; session cookie)",
                "logout": "/api/logout (POST; clears session)",
                "classes": "/api/classes (GET; optional active_only=0)",
                "teacher_my_classes": "/api/teacher/my-classes?teacher_username= (GET)",
                "student_my_classes": "/api/student/my-classes?student_username= (GET)",
                "dashboard": "/api/dashboard",
                "teacher_progress": "/api/teacher/progress?class_name=EAP047 (optional &date= &month=)",
                "teacher_task_completions": "/api/teacher/task-completions?class_name=EAP047 (optional &date= &month= &task_id= &teacher_username=; Phase D8)",
                "student_progress": "/api/student/progress?student_username=&class_name=EAP047 (optional &date= &month=)",
                "student_study_plans": "/api/student/study-plans?student_username=&class_name=&date= (GET; POST JSON)",
                "student_study_plans_summary": "/api/student/study-plans/summary?student_username=&class_name=&month=YYYY-MM (GET)",
                "student_study_plans_progress": "/api/student/study-plans/progress?student_username=&class_name=&month=YYYY-MM (GET)",
                "student_study_plan_update": "/api/student/study-plans/<id> (PUT JSON)",
                "student_study_plan_delete": "/api/student/study-plans/<id>?student_username= (DELETE)",
                "teacher_study_plans": "/api/teacher/study-plans?class_name=&date= (GET)",
                "teacher_study_plans_summary": "/api/teacher/study-plans/summary?class_name=&month=YYYY-MM (GET)",
                "teacher_study_plans_progress": "/api/teacher/study-plans/progress?class_name=&month=YYYY-MM (GET)",
                "teacher_study_plan_suggestion": "/api/teacher/study-plans/<id>/suggestion (PUT JSON: teacher_suggestion)",
                "dashboard_short": "/dashboard",
                "tasks": "/api/tasks",
                "task_copy": "/api/tasks/<id>/copy (POST JSON: date, class_name, copy_material)",
                "task_templates": "/api/task-templates (GET, POST JSON)",
                "task_template_apply": "/api/task-templates/<id>/apply (POST JSON: date, class_name, include_material)",
                "task_template_delete": "/api/task-templates/<id> (DELETE)",
                "task_upload_example": "/api/tasks/1/upload (POST multipart, field name: file)",
                "task_homework_submit": "/api/tasks/<id>/submit (POST multipart / FormData)",
                "task_submissions": "/api/tasks/<id>/submissions (GET)",
                "task_my_submission": "/api/tasks/<id>/my-submission?student_username=&class_name= (GET)",
                "task_my_completion_get": "/api/tasks/<id>/my-completion?class_name=&student_username= (GET; Phase D7)",
                "task_my_completion_put": "/api/tasks/<id>/my-completion (PUT JSON: class_name, optional student_username, optional status Pending|Completed)",
                "tasks_my_completions_batch": "/api/tasks/my-completions?class_name=&task_ids=1,2&student_username= (GET; Phase D7)",
                "submission_feedback": "/api/submissions/<id>/feedback (PUT JSON or multipart FormData)",
                "submission_revision": "/api/submissions/<id>/revision (PUT multipart / FormData)",
                "submissions_by_class": "/api/submissions?class_name=EAP047 (GET)",
                "file_download_example": "/uploads/<filename>",
                "homework_file_download_example": "/submission-files/<filename>",
            },
        }
    )


def _teacher_progress_task_where_clause(alias, class_name_normalized, date_str=None, month_str=None):
    """
    Build SQL WHERE snippet and params for filtering calendar_tasks rows by class.

    Optional exact calendar date (YYYY-MM-DD) narrows to one day.
    Optional month (YYYY-MM) narrows to that calendar month — ignored if date_str is set.
    """
    parts = [f"{alias}.class_name = ?"]
    params = [class_name_normalized]
    ds = (date_str or "").strip()
    ms = (month_str or "").strip()
    if ds and len(ds) >= 10:
        parts.append(f"{alias}.date = ?")
        params.append(ds[:10])
    elif ms and len(ms) == 7 and ms[4:5] == "-":
        # calendar_tasks.date is stored as ISO text; strftime matches YYYY-MM
        parts.append(f"strftime('%Y-%m', {alias}.date) = ?")
        params.append(ms)
    return " AND ".join(parts), params


def count_students_for_teacher_class_denominator(conn, class_name_norm):
    """
    Phase D8: student count for completion analytics denominators.

    Primary: distinct students enrolled in class (active classes.class_code match).
    Fallback: users with role student whose normalized class_name matches when enrollment count is 0.
    """
    class_row = conn.execute(
        """
        SELECT id FROM classes
        WHERE class_code = ? AND COALESCE(is_active, 1) != 0
        LIMIT 1
        """,
        (class_name_norm,),
    ).fetchone()
    if class_row is not None:
        n = conn.execute(
            """
            SELECT COUNT(DISTINCT ce.student_id)
            FROM class_enrollments ce
            INNER JOIN users u ON u.id = ce.student_id
            WHERE ce.class_id = ?
              AND TRIM(COALESCE(u.role, '')) = 'student'
            """,
            (class_row["id"],),
        ).fetchone()[0]
        if n is not None and int(n) > 0:
            return int(n)

    rows = conn.execute(
        """
        SELECT class_name FROM users
        WHERE TRIM(COALESCE(role, '')) = 'student'
        """
    ).fetchall()
    fb = sum(
        1 for r in rows if normalize_class_name(r["class_name"]) == class_name_norm
    )
    return int(fb)


def list_students_for_class(conn, class_name_norm):
    """
    Students enrolled in an active class (class_enrollments), or legacy users.class_name fallback.
    Returns list of {"username", "full_name"} sorted by username.
    """
    class_row = conn.execute(
        """
        SELECT id FROM classes
        WHERE class_code = ? AND COALESCE(is_active, 1) != 0
        LIMIT 1
        """,
        (class_name_norm,),
    ).fetchone()
    if class_row is not None:
        rows = conn.execute(
            """
            SELECT u.username, u.full_name
            FROM class_enrollments ce
            INNER JOIN users u ON u.id = ce.student_id
            WHERE ce.class_id = ?
              AND TRIM(COALESCE(u.role, '')) = 'student'
            ORDER BY u.username ASC
            """,
            (class_row["id"],),
        ).fetchall()
        if rows:
            return [
                {
                    "username": r["username"],
                    "full_name": r["full_name"],
                }
                for r in rows
            ]

    rows = conn.execute(
        """
        SELECT username, full_name, class_name
        FROM users
        WHERE TRIM(COALESCE(role, '')) = 'student'
        ORDER BY username ASC
        """
    ).fetchall()
    out = []
    for r in rows:
        if normalize_class_name(r["class_name"]) == class_name_norm:
            out.append({"username": r["username"], "full_name": r["full_name"]})
    return out


@app.route("/api/teacher/task-completions", methods=["GET"])
def get_teacher_task_completions():
    """
    Phase D8: per-task counts from student_task_status (students who clicked Complete).

    Does not change GET /api/teacher/progress. calendar_tasks.status is exposed as calendar_status only.

    Query:
      class_name — required (normalized)
      date — optional YYYY-MM-DD (same filtering as teacher progress)
      month — optional YYYY-MM if date omitted
      task_id — optional narrow to one calendar_tasks row
      teacher_username — optional query fallback (Phase D10: optional session + membership guards).

    If task_id is provided but no calendar row exists: 404. If the task exists but its class
    does not match the requested class_name (normalized), returns HTTP 200 with tasks: [].
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_name_norm = normalize_class_name(raw_class)
    date_q = request.args.get("date") or ""
    month_q = request.args.get("month") or ""

    task_where_sql, task_params = _teacher_progress_task_where_clause(
        "t", class_name_norm, date_str=date_q, month_str=month_q
    )

    total_students_den = count_students_for_teacher_class_denominator(conn, class_name_norm)

    tid_filter = None
    raw_tid = request.args.get("task_id")
    if raw_tid is not None and str(raw_tid).strip() != "":
        try:
            tid_filter = int(str(raw_tid).strip(), 10)
        except ValueError:
            conn.close()
            return jsonify({"error": "task_id must be an integer"}), 400
        tmeta = conn.execute(
            "SELECT id, class_name FROM calendar_tasks WHERE id = ?",
            (tid_filter,),
        ).fetchone()
        if tmeta is None:
            conn.close()
            return jsonify({"error": "Task not found"}), 404
        if normalize_class_name(tmeta["class_name"]) != class_name_norm:
            conn.close()
            return jsonify(
                {
                    "class_name": class_name_norm,
                    "total_students": total_students_den,
                    "tasks": [],
                }
            )

    extra_sql = ""
    extra_params = []
    if tid_filter is not None:
        extra_sql = " AND t.id = ?"
        extra_params.append(tid_filter)

    tasks_rows = conn.execute(
        f"""
        SELECT t.id, t.title, t.date, t.category, t.status
        FROM calendar_tasks t
        WHERE {task_where_sql}{extra_sql}
        ORDER BY t.date DESC, t.id DESC
        """,
        (*task_params, *extra_params),
    ).fetchall()

    task_ids = [int(r["id"]) for r in tasks_rows]
    completed_by_task = {}
    if task_ids:
        placeholders = ",".join("?" * len(task_ids))
        crows = conn.execute(
            f"""
            SELECT task_id, COUNT(DISTINCT student_username) AS n
            FROM student_task_status
            WHERE class_name = ?
              AND LOWER(TRIM(COALESCE(status, ''))) = 'completed'
              AND task_id IN ({placeholders})
            GROUP BY task_id
            """,
            (class_name_norm, *task_ids),
        ).fetchall()
        completed_by_task = {int(r["task_id"]): int(r["n"]) for r in crows}

    conn.close()

    out_tasks = []
    for r in tasks_rows:
        tid = int(r["id"])
        cs = int(completed_by_task.get(tid, 0))
        pend = max(0, total_students_den - cs)
        rate = (
            0.0
            if total_students_den == 0
            else round((cs / total_students_den) * 100, 2)
        )
        cal_st = r["status"] if r["status"] is not None else "Pending"
        out_tasks.append(
            {
                "task_id": tid,
                "title": r["title"],
                "date": r["date"],
                "category": r["category"],
                "calendar_status": cal_st,
                "completed_students": cs,
                "pending_students": pend,
                "total_students": total_students_den,
                "completion_rate": rate,
            }
        )

    return jsonify(
        {
            "class_name": class_name_norm,
            "total_students": total_students_den,
            "tasks": out_tasks,
        }
    )


@app.route("/api/teacher/progress", methods=["GET"])
def get_teacher_progress():
    """
    Homework-centric analytics for a class: combines calendar_tasks + submissions.

    Query:
      class_name — required scope (normalized; blank becomes EAP047 like elsewhere)
      date       — optional YYYY-MM-DD: only tasks on that calendar day
      month      — optional YYYY-MM: only tasks in that month (ignored if date is passed)
      teacher_username — optional query fallback (Phase D10: optional session + membership guards; not used in SQL).

    Returns counts for the filtered task set plus a per-task task_summary list.
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_name_norm = normalize_class_name(raw_class)
    date_q = request.args.get("date") or ""
    month_q = request.args.get("month") or ""

    task_where_sql, task_params = _teacher_progress_task_where_clause(
        "t", class_name_norm, date_str=date_q, month_str=month_q
    )

    # ---- Task-level stats (completion is the task row status, not homework). ----
    total_tasks = conn.execute(
        f"SELECT COUNT(*) FROM calendar_tasks t WHERE {task_where_sql}",
        task_params,
    ).fetchone()[0]

    pending_tasks = conn.execute(
        f"""
        SELECT COUNT(*) FROM calendar_tasks t
        WHERE {task_where_sql}
        AND LOWER(TRIM(COALESCE(t.status, ''))) != 'completed'
        """,
        task_params,
    ).fetchone()[0]

    completed_tasks = conn.execute(
        f"""
        SELECT COUNT(*) FROM calendar_tasks t
        WHERE {task_where_sql}
        AND LOWER(TRIM(COALESCE(t.status, ''))) = 'completed'
        """,
        task_params,
    ).fetchone()[0]

    if total_tasks == 0:
        completion_rate = 0.0
    else:
        completion_rate = round((completed_tasks / total_tasks) * 100, 2)

    # ---- Submission aggregates (only submissions whose task is in scope). ----
    submission_join_where = (
        f"FROM submissions s INNER JOIN calendar_tasks t ON s.task_id = t.id "
        f"WHERE {task_where_sql}"
    )

    total_submissions = conn.execute(
        f"SELECT COUNT(*) {submission_join_where}", task_params
    ).fetchone()[0]

    # Feedback = teacher wrote visible text OR legacy feedback file OR attachment row(s).
    feedback_given_count = conn.execute(
        f"""
        SELECT COUNT(*) {submission_join_where}
        AND (
            TRIM(COALESCE(s.teacher_feedback, '')) != ''
            OR TRIM(COALESCE(s.feedback_file_path, '')) != ''
            OR EXISTS (
                SELECT 1 FROM submission_attachments a
                WHERE a.submission_id = s.id AND a.attachment_type = ?
            )
        )
        """,
        (*task_params, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchone()[0]

    # Student uploaded a revised attempt (see submit_submission_revision in this app).
    revision_predicate = """
        (
            s.revision_submitted_at IS NOT NULL
            OR TRIM(COALESCE(s.revision_status, '')) = 'Revision Submitted'
        )
    """
    revision_submitted_count = conn.execute(
        f"SELECT COUNT(*) {submission_join_where} AND {revision_predicate}",
        task_params,
    ).fetchone()[0]

    # Submission row exists but the teacher has not given feedback in any supported form yet.
    submissions_waiting_for_feedback = conn.execute(
        f"""
        SELECT COUNT(*) {submission_join_where}
        AND TRIM(COALESCE(s.teacher_feedback, '')) = ''
        AND TRIM(COALESCE(s.feedback_file_path, '')) = ''
        AND NOT EXISTS (
            SELECT 1 FROM submission_attachments a
            WHERE a.submission_id = s.id AND a.attachment_type = ?
        )
        """,
        (*task_params, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchone()[0]

    # Tasks with no homework rows yet.
    tasks_without_submissions = conn.execute(
        f"""
        SELECT COUNT(*) FROM calendar_tasks t
        LEFT JOIN submissions s ON s.task_id = t.id
        WHERE {task_where_sql} AND s.id IS NULL
        """,
        task_params,
    ).fetchone()[0]

    # At least one submission on the task qualifies as revision submitted.
    tasks_with_revisions = conn.execute(
        f"""
        SELECT COUNT(DISTINCT t.id) FROM calendar_tasks t
        INNER JOIN submissions s ON s.task_id = t.id
        WHERE {task_where_sql} AND {revision_predicate}
        """,
        task_params,
    ).fetchone()[0]

    # ---- One row per task in scope + joined submission counts ----
    rows = conn.execute(
        f"""
        SELECT
            t.id AS task_id,
            t.title,
            t.date,
            t.category,
            t.status,
            COALESCE(agg.submission_count, 0) AS submission_count,
            COALESCE(agg.feedback_given_count, 0) AS feedback_given_count,
            COALESCE(agg.revision_count, 0) AS revision_count,
            COALESCE(agg.needs_feedback_count, 0) AS needs_feedback_count
        FROM calendar_tasks t
        LEFT JOIN (
            SELECT
                sub.task_id,
                COUNT(*) AS submission_count,
                SUM(
                  CASE WHEN
                    TRIM(COALESCE(sub.teacher_feedback, '')) != ''
                    OR TRIM(COALESCE(sub.feedback_file_path, '')) != ''
                    OR EXISTS (
                      SELECT 1 FROM submission_attachments a
                      WHERE a.submission_id = sub.id AND a.attachment_type = ?
                    )
                  THEN 1 ELSE 0 END
                ) AS feedback_given_count,
                SUM(
                  CASE WHEN
                    sub.revision_submitted_at IS NOT NULL
                    OR TRIM(COALESCE(sub.revision_status, '')) = 'Revision Submitted'
                  THEN 1 ELSE 0 END
                ) AS revision_count,
                SUM(
                  CASE WHEN
                    TRIM(COALESCE(sub.teacher_feedback, '')) = ''
                    AND TRIM(COALESCE(sub.feedback_file_path, '')) = ''
                    AND NOT EXISTS (
                      SELECT 1 FROM submission_attachments a
                      WHERE a.submission_id = sub.id AND a.attachment_type = ?
                    )
                  THEN 1 ELSE 0 END
                ) AS needs_feedback_count
            FROM submissions sub
            GROUP BY sub.task_id
        ) agg ON agg.task_id = t.id
        WHERE {task_where_sql}
        ORDER BY t.date DESC, t.id DESC
        """,
        (*task_params, ATTACHMENT_TYPE_TEACHER_FEEDBACK, ATTACHMENT_TYPE_TEACHER_FEEDBACK),
    ).fetchall()

    conn.close()

    task_summary = []
    for r in rows:
        task_summary.append(
            {
                "task_id": r["task_id"],
                "title": r["title"],
                "date": r["date"],
                "category": r["category"],
                "status": r["status"],
                "submission_count": int(r["submission_count"]),
                "feedback_given_count": int(r["feedback_given_count"]),
                "revision_count": int(r["revision_count"]),
                "needs_feedback_count": int(r["needs_feedback_count"]),
            }
        )

    return jsonify(
        {
            "class_name": class_name_norm,
            "total_tasks": total_tasks,
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": completion_rate,
            "total_submissions": total_submissions,
            "feedback_given_count": feedback_given_count,
            "revision_submitted_count": revision_submitted_count,
            "submissions_waiting_for_feedback": submissions_waiting_for_feedback,
            "tasks_without_submissions": tasks_without_submissions,
            "tasks_with_revisions": tasks_with_revisions,
            "task_summary": task_summary,
        }
    )


@app.route("/api/student/progress", methods=["GET"])
def get_student_progress():
    """
    Per-student learning progress for a class scope (optional date or month filter).

    Query:
      student_username — required when no student Flask session (Phase D4: session wins when role matches)
      class_name — required, normalized
      date — optional YYYY-MM-DD (tasks on that day only)
      month — optional YYYY-MM (ignored if date is set)

    Phase D7: completed_tasks / pending_tasks / tasks_needing_action "Mark as completed" use
    student_task_status (per student), not calendar_tasks.status.
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    class_name_norm = normalize_class_name(raw_class)
    date_q = request.args.get("date") or ""
    month_q = request.args.get("month") or ""

    task_where_sql, task_params = _teacher_progress_task_where_clause(
        "t", class_name_norm, date_str=date_q, month_str=month_q
    )

    tasks = conn.execute(
        f"""
        SELECT t.*
        FROM calendar_tasks t
        WHERE {task_where_sql}
        ORDER BY t.date ASC, t.id ASC
        """,
        task_params,
    ).fetchall()

    total_tasks = len(tasks)
    if total_tasks == 0:
        conn.close()
        return jsonify(
            {
                "student_username": student_username,
                "class_name": class_name_norm,
                "total_tasks": 0,
                "completed_tasks": 0,
                "pending_tasks": 0,
                "homework_submitted_count": 0,
                "feedback_received_count": 0,
                "revision_submitted_count": 0,
                "tasks_needing_action_count": 0,
                "tasks_needing_action": [],
                "completion_rate": 0.0,
                "category_summary": [],
            }
        )

    task_ids = [int(t["id"]) for t in tasks]
    placeholders = ",".join("?" * len(task_ids))

    st_rows = conn.execute(
        f"""
        SELECT task_id, status, completed_at
        FROM student_task_status
        WHERE student_username = ? AND class_name = ? AND task_id IN ({placeholders})
        """,
        (student_username, class_name_norm, *task_ids),
    ).fetchall()
    student_completed_task_ids = {
        int(sr["task_id"])
        for sr in st_rows
        if str(sr["status"] or "").strip().lower() == "completed"
    }

    sub_rows = conn.execute(
        f"""
        SELECT s.*
        FROM submissions s
        INNER JOIN (
            SELECT task_id, MAX(id) AS max_id
            FROM submissions
            WHERE student_username = ? AND task_id IN ({placeholders})
            GROUP BY task_id
        ) latest ON s.task_id = latest.task_id AND s.id = latest.max_id
        """,
        (student_username, *task_ids),
    ).fetchall()

    sub_by_task = {int(r["task_id"]): r for r in sub_rows}
    sub_ids = [int(r["id"]) for r in sub_rows]
    att_map = batch_teacher_feedback_attachments(conn, sub_ids) if sub_ids else {}

    def trimmed_nonempty(val):
        return val is not None and str(val).strip() != ""

    def row_has_feedback(sub_row):
        if sub_row is None:
            return False
        if trimmed_nonempty(sub_row["teacher_feedback"]):
            return True
        if trimmed_nonempty(sub_row["feedback_file_path"]):
            return True
        sid = int(sub_row["id"])
        return len(att_map.get(sid, [])) > 0

    def row_has_revision(sub_row):
        if sub_row is None:
            return False
        return trimmed_nonempty(sub_row["revision_text"]) or trimmed_nonempty(
            sub_row["revision_file_path"]
        )

    def task_completed_for_student(task_row):
        return int(task_row["id"]) in student_completed_task_ids

    completed_tasks = sum(1 for t in tasks if task_completed_for_student(t))
    pending_tasks = total_tasks - completed_tasks

    homework_submitted_count = 0
    feedback_received_count = 0
    revision_submitted_count = 0
    tasks_needing_action = []
    category_buckets = {}

    for t in tasks:
        tid = int(t["id"])
        has_sub = tid in sub_by_task
        sub = sub_by_task.get(tid)
        cat_key = str(t["category"] or "Other").strip() or "Other"
        if cat_key not in category_buckets:
            category_buckets[cat_key] = {
                "category": cat_key,
                "total": 0,
                "completed": 0,
                "needing_action": 0,
            }
        category_buckets[cat_key]["total"] += 1
        if task_completed_for_student(t):
            category_buckets[cat_key]["completed"] += 1

        if has_sub:
            homework_submitted_count += 1
            if row_has_feedback(sub):
                feedback_received_count += 1
            if row_has_revision(sub):
                revision_submitted_count += 1

        fb = row_has_feedback(sub) if has_sub else False
        rev = row_has_revision(sub) if has_sub else False
        tc = task_completed_for_student(t)

        needs = (not has_sub) or (fb and (not rev)) or (not tc)
        if not needs:
            continue

        category_buckets[cat_key]["needing_action"] += 1

        if not has_sub:
            action_needed = "Submit homework"
        elif fb and (not rev):
            action_needed = "Submit revision"
        elif not tc:
            action_needed = "Mark as completed"
        else:
            action_needed = "Mark as completed"

        item = {
            "task_id": tid,
            "title": t["title"],
            "date": t["date"],
            "category": t["category"],
            "status": t["status"],
            "action_needed": action_needed,
        }
        try:
            item["title_zh"] = t["title_zh"]
        except (KeyError, IndexError):
            item["title_zh"] = None
        tasks_needing_action.append(item)

    completion_rate = (
        0.0 if total_tasks == 0 else round((completed_tasks / total_tasks) * 100, 2)
    )
    category_summary = sorted(
        category_buckets.values(),
        key=lambda row: (-int(row["total"]), str(row["category"])),
    )

    conn.close()

    return jsonify(
        {
            "student_username": student_username,
            "class_name": class_name_norm,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "completion_rate": completion_rate,
            "homework_submitted_count": homework_submitted_count,
            "feedback_received_count": feedback_received_count,
            "revision_submitted_count": revision_submitted_count,
            "tasks_needing_action_count": len(tasks_needing_action),
            "tasks_needing_action": tasks_needing_action,
            "category_summary": category_summary,
        }
    )


@app.route("/api/teacher/class-roster-progress", methods=["GET"])
def get_teacher_class_roster_progress():
    """
    Per-student task progress for a class and calendar month (Phase E6 class reporting).

    Query:
      class_name — required (normalized)
      month — required YYYY-MM
      teacher_username — optional session fallback (Phase D10)
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_name_norm = normalize_class_name(raw_class)
    month_q = (request.args.get("month") or "").strip()
    if len(month_q) != 7 or month_q[4] != "-":
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400

    students = list_students_for_class(conn, class_name_norm)
    task_where_sql, task_params = _teacher_progress_task_where_clause(
        "t", class_name_norm, date_str="", month_str=month_q
    )
    tasks = conn.execute(
        f"""
        SELECT t.id, t.category
        FROM calendar_tasks t
        WHERE {task_where_sql}
        """,
        task_params,
    ).fetchall()
    total_tasks = len(tasks)
    task_ids = [int(t["id"]) for t in tasks]

    completed_set = set()
    sub_by_key = {}

    if task_ids:
        placeholders = ",".join("?" * len(task_ids))
        st_rows = conn.execute(
            f"""
            SELECT student_username, task_id
            FROM student_task_status
            WHERE class_name = ?
              AND LOWER(TRIM(COALESCE(status, ''))) = 'completed'
              AND task_id IN ({placeholders})
            """,
            (class_name_norm, *task_ids),
        ).fetchall()
        for sr in st_rows:
            un = str(sr["student_username"] or "").strip()
            if un:
                completed_set.add((un, int(sr["task_id"])))

        sub_rows = conn.execute(
            f"""
            SELECT s.student_username, s.task_id, s.teacher_feedback, s.feedback_file_path,
                   s.revision_text, s.revision_file_path, s.id AS submission_id
            FROM submissions s
            INNER JOIN (
                SELECT student_username, task_id, MAX(id) AS max_id
                FROM submissions
                WHERE task_id IN ({placeholders})
                GROUP BY student_username, task_id
            ) latest
              ON s.student_username = latest.student_username
             AND s.task_id = latest.task_id
             AND s.id = latest.max_id
            """,
            (*task_ids,),
        ).fetchall()
        sub_ids = [int(r["submission_id"]) for r in sub_rows]
        att_map = batch_teacher_feedback_attachments(conn, sub_ids) if sub_ids else {}

        def trimmed_nonempty(val):
            return val is not None and str(val).strip() != ""

        def row_has_feedback(sub_row):
            if trimmed_nonempty(sub_row["teacher_feedback"]):
                return True
            if trimmed_nonempty(sub_row["feedback_file_path"]):
                return True
            sid = int(sub_row["submission_id"])
            return len(att_map.get(sid, [])) > 0

        def row_has_revision(sub_row):
            return trimmed_nonempty(sub_row["revision_text"]) or trimmed_nonempty(
                sub_row["revision_file_path"]
            )

        for sr in sub_rows:
            un = str(sr["student_username"] or "").strip()
            if not un:
                continue
            sub_by_key[(un, int(sr["task_id"]))] = sr

    roster = []
    for stu in students:
        un = str(stu["username"] or "").strip()
        completed_n = 0
        hw_n = 0
        need_n = 0
        for t in tasks:
            tid = int(t["id"])
            key = (un, tid)
            sub = sub_by_key.get(key)
            has_sub = sub is not None
            if has_sub:
                hw_n += 1
            fb = row_has_feedback(sub) if has_sub else False
            rev = row_has_revision(sub) if has_sub else False
            tc = key in completed_set
            if tc:
                completed_n += 1
            needs = (not has_sub) or (fb and (not rev)) or (not tc)
            if needs:
                need_n += 1
        rate = 0.0 if total_tasks == 0 else round((completed_n / total_tasks) * 100, 2)
        roster.append(
            {
                "student_username": un,
                "full_name": stu.get("full_name"),
                "total_tasks": total_tasks,
                "completed_tasks": completed_n,
                "pending_tasks": max(0, total_tasks - completed_n),
                "completion_rate": rate,
                "homework_submitted_count": hw_n,
                "tasks_needing_action_count": need_n,
            }
        )

    conn.close()
    return jsonify(
        {
            "class_name": class_name_norm,
            "month": month_q,
            "total_students": len(roster),
            "total_tasks": total_tasks,
            "students": roster,
        }
    )


def _student_archive_workflow_state(task_row, sub_row, att_map, student_completed):
    """Mirror frontend student workflow labels for archive list/detail."""
    if student_completed:
        return "completed"
    if sub_row is None:
        return "needs_submission"

    def trimmed_nonempty(val):
        return val is not None and str(val).strip() != ""

    has_fb = False
    if trimmed_nonempty(sub_row["teacher_feedback"]) or trimmed_nonempty(sub_row["feedback_file_path"]):
        has_fb = True
    else:
        sid = int(sub_row["id"])
        has_fb = len(att_map.get(sid, [])) > 0

    has_rev = (
        trimmed_nonempty(sub_row["revision_submitted_at"])
        or trimmed_nonempty(sub_row["revision_text"])
        or trimmed_nonempty(sub_row["revision_file_path"])
    )
    if has_fb:
        return "revision_done" if has_rev else "needs_revision"
    return "awaiting_feedback"


@app.route("/api/student/learning-archive", methods=["GET"])
def get_student_learning_archive():
    """
    Phase E8: read-only portfolio of past tasks with submission, feedback, and revision history.

    Query:
      student_username — required without student session (Phase D4)
      class_name — required
      month — optional YYYY-MM (omit for all tasks in this class)
      category — optional exact category label filter
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    class_name_norm = normalize_class_name(raw_class)
    month_q = (request.args.get("month") or "").strip()
    category_q = (request.args.get("category") or "").strip()

    if month_q:
        task_where_sql, task_params = _teacher_progress_task_where_clause(
            "t", class_name_norm, date_str="", month_str=month_q
        )
    else:
        task_where_sql, task_params = _teacher_progress_task_where_clause(
            "t", class_name_norm
        )

    extra_sql = ""
    extra_params = []
    if category_q:
        extra_sql = " AND t.category = ?"
        extra_params.append(category_q)

    tasks = conn.execute(
        f"""
        SELECT t.*
        FROM calendar_tasks t
        WHERE {task_where_sql}{extra_sql}
        ORDER BY t.date DESC, t.id DESC
        """,
        (*task_params, *extra_params),
    ).fetchall()

    if not tasks:
        conn.close()
        return jsonify(
            {
                "student_username": student_username,
                "class_name": class_name_norm,
                "month": month_q or None,
                "category": category_q or None,
                "total": 0,
                "items": [],
            }
        )

    task_ids = [int(t["id"]) for t in tasks]
    placeholders = ",".join("?" * len(task_ids))

    st_rows = conn.execute(
        f"""
        SELECT task_id, status, completed_at
        FROM student_task_status
        WHERE student_username = ? AND class_name = ? AND task_id IN ({placeholders})
        """,
        (student_username, class_name_norm, *task_ids),
    ).fetchall()
    completed_set = {
        int(sr["task_id"])
        for sr in st_rows
        if str(sr["status"] or "").strip().lower() == "completed"
    }

    sub_rows = conn.execute(
        f"""
        SELECT s.*
        FROM submissions s
        INNER JOIN (
            SELECT task_id, MAX(id) AS max_id
            FROM submissions
            WHERE student_username = ? AND task_id IN ({placeholders})
            GROUP BY task_id
        ) latest ON s.task_id = latest.task_id AND s.id = latest.max_id
        """,
        (student_username, *task_ids),
    ).fetchall()
    sub_by_task = {int(r["task_id"]): r for r in sub_rows}
    sub_ids = [int(r["id"]) for r in sub_rows]
    att_map = batch_teacher_feedback_attachments(conn, sub_ids) if sub_ids else {}

    items = []
    for t in tasks:
        tid = int(t["id"])
        sub = sub_by_task.get(tid)
        student_completed = tid in completed_set
        wf = _student_archive_workflow_state(t, sub, att_map, student_completed)

        title_zh = None
        description_zh = None
        try:
            title_zh = t["title_zh"]
            description_zh = t["description_zh"]
        except (IndexError, KeyError):
            pass

        item = {
            "task_id": tid,
            "date": t["date"],
            "title": t["title"],
            "title_zh": title_zh,
            "category": t["category"],
            "period": t["period"],
            "description": t["description"],
            "description_zh": description_zh,
            "file_path": t["file_path"],
            "file_name": t["file_name"],
            "student_completed": student_completed,
            "workflow_state": wf,
            "has_submission": sub is not None,
            "has_feedback": wf in ("needs_revision", "revision_done"),
            "has_revision": wf == "revision_done",
        }
        if sub is not None:
            payload = submission_to_dict(sub)
            payload["feedback_attachments"] = att_map.get(int(sub["id"]), [])
            item["submission"] = payload
        else:
            item["submission"] = None
        items.append(item)

    conn.close()
    return jsonify(
        {
            "student_username": student_username,
            "class_name": class_name_norm,
            "month": month_q or None,
            "category": category_q or None,
            "total": len(items),
            "items": items,
        }
    )


@app.route("/api/student/study-plans/summary", methods=["GET"])
def list_student_study_plans_month_summary():
    """
    Per-date counts of personal study plans for one student, class, and calendar month.

    Query: student_username — required without student session (Phase D4). class_name
    (required), month=YYYY-MM (required).
    Returns only dates with total > 0.
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400
    class_name_norm = normalize_class_name(raw_class)

    month_q = (request.args.get("month") or "").strip()
    if len(month_q) != 7 or month_q[4] != "-":
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year_s, mon_s = month_q[:4], month_q[5:7]
    if not year_s.isdigit() or not mon_s.isdigit():
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year = int(year_s, 10)
    month = int(mon_s, 10)
    if month < 1 or month > 12:
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400

    last_day = monthrange(year, month)[1]
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{last_day:02d}"

    rows = conn.execute(
        """
        SELECT
            date,
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM student_study_plans
        WHERE student_username = ? AND class_name = ? AND date >= ? AND date <= ?
        GROUP BY date
        HAVING COUNT(*) > 0
        ORDER BY date ASC
        """,
        (student_username, class_name_norm, start_date, end_date),
    ).fetchall()
    conn.close()

    out = []
    for r in rows:
        total = int(r["total"] or 0)
        if total <= 0:
            continue
        completed = int(r["completed"] or 0)
        planned = total - completed
        date_val = r["date"]
        if not date_val or len(str(date_val)) < 10:
            continue
        d = str(date_val)[:10]
        out.append(
            {
                "date": d,
                "total": total,
                "completed": completed,
                "planned": planned,
            }
        )
    return jsonify(out)


@app.route("/api/student/study-plans/progress", methods=["GET"])
def get_student_study_plans_month_progress():
    """
    Month-level aggregates and per-skill counts for one student's personal study plans.

    Query: student_username — required without student session (Phase D4).
    class_name (required), month=YYYY-MM (required).
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400
    class_name_norm = normalize_class_name(raw_class)

    month_q = (request.args.get("month") or "").strip()
    if len(month_q) != 7 or month_q[4] != "-":
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year_s, mon_s = month_q[:4], month_q[5:7]
    if not year_s.isdigit() or not mon_s.isdigit():
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year = int(year_s, 10)
    month = int(mon_s, 10)
    if month < 1 or month > 12:
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400

    last_day = monthrange(year, month)[1]
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{last_day:02d}"
    month_key = f"{year:04d}-{month:02d}"

    agg = conn.execute(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed,
            SUM(COALESCE(planned_minutes, 0)) AS total_planned_minutes,
            SUM(
                CASE
                    WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN COALESCE(planned_minutes, 0)
                    ELSE 0
                END
            ) AS completed_planned_minutes
        FROM student_study_plans
        WHERE student_username = ? AND class_name = ? AND date >= ? AND date <= ?
        """,
        (student_username, class_name_norm, start_date, end_date),
    ).fetchone()

    skill_rows = conn.execute(
        """
        SELECT
            skill_area,
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM student_study_plans
        WHERE student_username = ? AND class_name = ? AND date >= ? AND date <= ?
        GROUP BY skill_area
        ORDER BY skill_area ASC
        """,
        (student_username, class_name_norm, start_date, end_date),
    ).fetchall()
    conn.close()

    total = int(agg["total"] or 0) if agg else 0
    completed = int(agg["completed"] or 0) if agg else 0
    planned = total - completed
    if total == 0:
        completion_rate = 0.0
    else:
        completion_rate = round(100.0 * completed / total, 1)

    total_planned_minutes = int(agg["total_planned_minutes"] or 0) if agg else 0
    completed_planned_minutes = int(agg["completed_planned_minutes"] or 0) if agg else 0

    skill_breakdown = []
    for r in skill_rows:
        sk = r["skill_area"]
        label = str(sk).strip() if sk is not None else "—"
        skill_breakdown.append(
            {
                "skill_area": label,
                "total": int(r["total"] or 0),
                "completed": int(r["completed"] or 0),
            }
        )

    return jsonify(
        {
            "month": month_key,
            "total": total,
            "completed": completed,
            "planned": planned,
            "completion_rate": completion_rate,
            "total_planned_minutes": total_planned_minutes,
            "completed_planned_minutes": completed_planned_minutes,
            "skill_breakdown": skill_breakdown,
        }
    )


@app.route("/api/student/study-plans", methods=["GET"])
def list_student_study_plans():
    """
    Personal study plans for one student, class, and calendar date (not calendar_tasks).

    Query: student_username — required without student session (Phase D4).
    """
    conn = get_db_connection()
    student_username, d9_err = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), request.args.get("class_name")
    )
    if d9_err is not None:
        conn.close()
        return d9_err

    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    date_q = (request.args.get("date") or "").strip()
    if not date_q or len(date_q) < 10:
        conn.close()
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    date_q = date_q[:10]

    class_name_norm = normalize_class_name(raw_class)

    rows = conn.execute(
        """
        SELECT * FROM student_study_plans
        WHERE student_username = ? AND class_name = ? AND date = ?
        ORDER BY created_at ASC, id ASC
        """,
        (student_username, class_name_norm, date_q),
    ).fetchall()
    conn.close()
    return jsonify([study_plan_to_dict(r) for r in rows])


@app.route("/api/student/study-plans", methods=["POST"])
def create_student_study_plan():
    """
    Create a personal study plan row (Phase D6: effective student session username + JSON fallback).

    Phase D47: under strict flags, resolve_student_with_optional_enforcement (session + enrollment).
    """
    data = request.get_json(silent=True) or {}
    conn = get_db_connection()
    class_name_norm = normalize_class_name(data.get("class_name"))

    if is_strict_security_enabled():
        student_username, d47_err = resolve_student_with_optional_enforcement(
            conn, data.get("student_username"), class_name_norm
        )
        if d47_err is not None:
            conn.close()
            return d47_err
    else:
        student_username = get_effective_student_username(conn, data.get("student_username"))
        if not student_username:
            conn.close()
            return jsonify({"error": "student_username is required"}), 400

    date_s = (data.get("date") or "").strip()
    if not date_s or len(date_s) < 10:
        conn.close()
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    date_s = date_s[:10]

    skill = (data.get("skill_area") or "").strip()
    if skill not in STUDY_PLAN_SKILL_AREAS:
        conn.close()
        return jsonify(
            {
                "error": "skill_area must be one of: "
                + ", ".join(sorted(STUDY_PLAN_SKILL_AREAS)),
            }
        ), 400

    title = (data.get("title") or "").strip()
    if not title:
        conn.close()
        return jsonify({"error": "title is required"}), 400

    desc_raw = data.get("description")
    desc_s = None if desc_raw is None else str(desc_raw)

    pm = None
    if "planned_minutes" in data and data["planned_minutes"] is not None:
        if str(data["planned_minutes"]).strip() != "":
            pm, err = parse_study_plan_planned_minutes(data["planned_minutes"])
            if err is not None:
                conn.close()
                return err

    status_in = data.get("status")
    if status_in is None or str(status_in).strip() == "":
        st = "Planned"
    else:
        st = str(status_in).strip()
        if st not in STUDY_PLAN_STATUSES:
            conn.close()
            return jsonify({"error": "status must be Planned or Completed"}), 400

    cursor = conn.execute(
        """
        INSERT INTO student_study_plans
            (student_username, class_name, date, skill_area, title, description, planned_minutes,
             status, teacher_suggestion, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
        """,
        (
            student_username,
            class_name_norm,
            date_s,
            skill,
            title,
            desc_s,
            pm,
            st,
        ),
    )
    conn.commit()
    new_id = cursor.lastrowid
    row = conn.execute(
        "SELECT * FROM student_study_plans WHERE id = ?",
        (new_id,),
    ).fetchone()
    conn.close()
    return jsonify(study_plan_to_dict(row)), 201


@app.route("/api/student/study-plans/<int:plan_id>", methods=["PUT"])
def update_student_study_plan(plan_id):
    """
    Update a plan; student_username in body must match row owner.

    Phase D47: under strict flags, load plan first, then resolve_student on row class_name.
    """
    data = request.get_json(silent=True) or {}
    conn = get_db_connection()

    row = conn.execute(
        "SELECT * FROM student_study_plans WHERE id = ?",
        (plan_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Plan not found"}), 404

    plan_class_norm = normalize_class_name(row["class_name"])

    if is_strict_security_enabled():
        student_username, d47_err = resolve_student_with_optional_enforcement(
            conn, data.get("student_username"), plan_class_norm
        )
        if d47_err is not None:
            conn.close()
            return d47_err
        if (row["student_username"] or "").strip() != student_username:
            conn.close()
            return jsonify({"error": "Not allowed to update this plan"}), 403
    else:
        owner = get_effective_student_username(conn, data.get("student_username"))
        if not owner:
            conn.close()
            return jsonify({"error": "student_username is required"}), 400
        if (row["student_username"] or "").strip() != owner:
            conn.close()
            return jsonify({"error": "Not allowed to update this plan"}), 403

    date_val = row["date"]
    if "date" in data:
        ds = (data.get("date") or "").strip()
        if not ds or len(ds) < 10:
            conn.close()
            return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
        date_val = ds[:10]

    skill_val = row["skill_area"]
    if "skill_area" in data:
        sk = (data.get("skill_area") or "").strip()
        if sk not in STUDY_PLAN_SKILL_AREAS:
            conn.close()
            return jsonify(
                {
                    "error": "skill_area must be one of: "
                    + ", ".join(sorted(STUDY_PLAN_SKILL_AREAS)),
                }
            ), 400
        skill_val = sk

    title_val = row["title"]
    if "title" in data:
        title_val = (data.get("title") or "").strip()
        if not title_val:
            conn.close()
            return jsonify({"error": "title is required"}), 400

    desc_val = row["description"]
    if "description" in data:
        dr = data.get("description")
        desc_val = None if dr is None else str(dr)

    pm_val = row["planned_minutes"]
    if "planned_minutes" in data:
        if data["planned_minutes"] is None or str(data["planned_minutes"]).strip() == "":
            pm_val = None
        else:
            pm_val, err = parse_study_plan_planned_minutes(data["planned_minutes"])
            if err is not None:
                conn.close()
                return err

    status_val = row["status"]
    if "status" in data:
        st = (data.get("status") or "").strip()
        if st not in STUDY_PLAN_STATUSES:
            conn.close()
            return jsonify({"error": "status must be Planned or Completed"}), 400
        status_val = st

    conn.execute(
        """
        UPDATE student_study_plans
        SET date = ?, skill_area = ?, title = ?, description = ?, planned_minutes = ?,
            status = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (date_val, skill_val, title_val, desc_val, pm_val, status_val, plan_id),
    )
    conn.commit()
    updated = conn.execute(
        "SELECT * FROM student_study_plans WHERE id = ?",
        (plan_id,),
    ).fetchone()
    conn.close()
    return jsonify(study_plan_to_dict(updated))


@app.route("/api/student/study-plans/<int:plan_id>", methods=["DELETE"])
def delete_student_study_plan(plan_id):
    """
    Remove one personal study plan row owned by student_username (query param).

    Deletes the row only — no calendar_tasks, submissions, or files.

    Phase D47: under strict flags, load plan first, then resolve_student on row class_name.
    """
    conn = get_db_connection()

    row = conn.execute(
        "SELECT id, student_username, class_name FROM student_study_plans WHERE id = ?",
        (plan_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Plan not found"}), 404

    plan_class_norm = normalize_class_name(row["class_name"])

    if is_strict_security_enabled():
        student_username, d47_err = resolve_student_with_optional_enforcement(
            conn, request.args.get("student_username"), plan_class_norm
        )
        if d47_err is not None:
            conn.close()
            return d47_err
        if (row["student_username"] or "").strip() != student_username:
            conn.close()
            return jsonify({"error": "Not allowed to delete this plan"}), 403
    else:
        owner = get_effective_student_username(conn, request.args.get("student_username"))
        if not owner:
            conn.close()
            return jsonify({"error": "student_username is required"}), 400
        if (row["student_username"] or "").strip() != owner:
            conn.close()
            return jsonify({"error": "Not allowed to delete this plan"}), 403

    conn.execute("DELETE FROM student_study_plans WHERE id = ?", (plan_id,))
    conn.commit()
    conn.close()
    return jsonify(
        {
            "ok": True,
            "id": plan_id,
            "message": "Study plan deleted.",
        }
    )


@app.route("/api/teacher/study-plans/summary", methods=["GET"])
def list_teacher_study_plans_month_summary():
    """
    Per-date aggregates of all students' personal study plans for one class and calendar month.

    Query: class_name (required), month=YYYY-MM (required).
    teacher_username optional (Phase D10: optional session + membership guards; not used in SQL).
    Returns only dates with total > 0.
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_norm = normalize_class_name(raw_class)

    month_q = (request.args.get("month") or "").strip()
    if len(month_q) != 7 or month_q[4] != "-":
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year_s, mon_s = month_q[:4], month_q[5:7]
    if not year_s.isdigit() or not mon_s.isdigit():
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year = int(year_s, 10)
    month = int(mon_s, 10)
    if month < 1 or month > 12:
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400

    last_day = monthrange(year, month)[1]
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{last_day:02d}"

    rows = conn.execute(
        """
        SELECT
            date,
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed,
            COUNT(DISTINCT student_username) AS students
        FROM student_study_plans
        WHERE class_name = ? AND date >= ? AND date <= ?
        GROUP BY date
        HAVING COUNT(*) > 0
        ORDER BY date ASC
        """,
        (class_norm, start_date, end_date),
    ).fetchall()
    conn.close()

    out = []
    for r in rows:
        total = int(r["total"] or 0)
        if total <= 0:
            continue
        completed = int(r["completed"] or 0)
        planned = total - completed
        students = int(r["students"] or 0)
        date_val = r["date"]
        if not date_val or len(str(date_val)) < 10:
            continue
        d = str(date_val)[:10]
        out.append(
            {
                "date": d,
                "total": total,
                "completed": completed,
                "planned": planned,
                "students": students,
            }
        )
    return jsonify(out)


@app.route("/api/teacher/study-plans/progress", methods=["GET"])
def get_teacher_study_plans_month_progress():
    """
    Class-level aggregates for all students' personal study plans in one calendar month.

    Query: class_name (required), month=YYYY-MM (required).
    teacher_username optional (Phase D10: optional session + membership guards; not used in SQL).
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_norm = normalize_class_name(raw_class)

    month_q = (request.args.get("month") or "").strip()
    if len(month_q) != 7 or month_q[4] != "-":
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year_s, mon_s = month_q[:4], month_q[5:7]
    if not year_s.isdigit() or not mon_s.isdigit():
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400
    year = int(year_s, 10)
    month = int(mon_s, 10)
    if month < 1 or month > 12:
        conn.close()
        return jsonify({"error": "month is required (YYYY-MM)"}), 400

    last_day = monthrange(year, month)[1]
    start_date = f"{year:04d}-{month:02d}-01"
    end_date = f"{year:04d}-{month:02d}-{last_day:02d}"
    month_key = f"{year:04d}-{month:02d}"

    agg = conn.execute(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed,
            COUNT(DISTINCT student_username) AS students_active,
            SUM(COALESCE(planned_minutes, 0)) AS total_planned_minutes,
            SUM(
                CASE
                    WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN COALESCE(planned_minutes, 0)
                    ELSE 0
                END
            ) AS completed_planned_minutes
        FROM student_study_plans
        WHERE class_name = ? AND date >= ? AND date <= ?
        """,
        (class_norm, start_date, end_date),
    ).fetchone()

    skill_rows = conn.execute(
        """
        SELECT
            skill_area,
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM student_study_plans
        WHERE class_name = ? AND date >= ? AND date <= ?
        GROUP BY skill_area
        ORDER BY skill_area ASC
        """,
        (class_norm, start_date, end_date),
    ).fetchall()

    student_rows = conn.execute(
        """
        SELECT
            p.student_username,
            MAX(COALESCE(u.full_name, '')) AS student_full_name,
            COUNT(*) AS total,
            SUM(CASE WHEN TRIM(COALESCE(p.status, '')) = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM student_study_plans p
        LEFT JOIN users u ON u.username = p.student_username
        WHERE p.class_name = ? AND p.date >= ? AND p.date <= ?
        GROUP BY p.student_username
        ORDER BY total DESC, p.student_username ASC
        """,
        (class_norm, start_date, end_date),
    ).fetchall()
    conn.close()

    total = int(agg["total"] or 0) if agg else 0
    completed = int(agg["completed"] or 0) if agg else 0
    planned = total - completed
    if total == 0:
        completion_rate = 0.0
    else:
        completion_rate = round(100.0 * completed / total, 1)

    students_active = int(agg["students_active"] or 0) if agg else 0
    total_planned_minutes = int(agg["total_planned_minutes"] or 0) if agg else 0
    completed_planned_minutes = int(agg["completed_planned_minutes"] or 0) if agg else 0

    skill_breakdown = []
    for r in skill_rows:
        sk = r["skill_area"]
        label = str(sk).strip() if sk is not None else "—"
        skill_breakdown.append(
            {
                "skill_area": label,
                "total": int(r["total"] or 0),
                "completed": int(r["completed"] or 0),
            }
        )

    student_breakdown = []
    for r in student_rows:
        uname = (r["student_username"] or "").strip()
        fn = r["student_full_name"]
        display_name = str(fn).strip() if fn is not None and str(fn).strip() else ""
        st_total = int(r["total"] or 0)
        st_completed = int(r["completed"] or 0)
        student_breakdown.append(
            {
                "student_username": uname,
                "student_name": display_name if display_name else uname,
                "total": st_total,
                "completed": st_completed,
                "planned": st_total - st_completed,
            }
        )

    return jsonify(
        {
            "month": month_key,
            "class_name": class_norm,
            "total": total,
            "completed": completed,
            "planned": planned,
            "completion_rate": completion_rate,
            "students_active": students_active,
            "total_planned_minutes": total_planned_minutes,
            "completed_planned_minutes": completed_planned_minutes,
            "skill_breakdown": skill_breakdown,
            "student_breakdown": student_breakdown,
        }
    )


@app.route("/api/teacher/study-plans", methods=["GET"])
def list_teacher_study_plans():
    """
    All personal study plans for a class on one date (read-only for teachers).

    teacher_username optional (Phase D10: optional session + membership guards; not used in SQL).
    """
    conn = get_db_connection()
    raw_class = request.args.get("class_name")
    if raw_class is None or str(raw_class).strip() == "":
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    _, d10_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        raw_class,
    )
    if d10_guard_err is not None:
        conn.close()
        return d10_guard_err

    class_norm = normalize_class_name(raw_class)

    date_q = (request.args.get("date") or "").strip()
    if not date_q or len(date_q) < 10:
        conn.close()
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    date_q = date_q[:10]

    rows = conn.execute(
        """
        SELECT p.*, u.full_name AS student_full_name
        FROM student_study_plans p
        LEFT JOIN users u ON u.username = p.student_username
        WHERE p.class_name = ? AND p.date = ?
        ORDER BY p.created_at ASC, p.id ASC
        """,
        (class_norm, date_q),
    ).fetchall()
    conn.close()
    return jsonify([teacher_study_plan_view_dict(r) for r in rows])


@app.route("/api/teacher/study-plans/<int:plan_id>/suggestion", methods=["PUT"])
def put_teacher_study_plan_suggestion(plan_id):
    """
    Update only teacher_suggestion and updated_at for one plan row.

    JSON: { "teacher_suggestion": "..." } — string may be empty to clear; null clears.

    Phase D29: optional EAP_REQUIRE_SESSION_IDENTITY / EAP_ENFORCE_MEMBERSHIP —
    resolve_teacher_with_optional_enforcement(conn, …, normalize_class_name(student_study_plans.class_name))
    after JSON validation and plan **404** (both before auth guard).
    """
    raw_bytes = request.get_data(cache=False)
    if not raw_bytes or not raw_bytes.strip():
        return jsonify({"error": "JSON body required"}), 400
    try:
        data = json.loads(raw_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return jsonify({"error": "Invalid JSON"}), 400
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON body"}), 400
    if "teacher_suggestion" not in data:
        return jsonify({"error": "teacher_suggestion is required"}), 400

    val = data["teacher_suggestion"]
    if val is None:
        sugg_sql = None
    elif isinstance(val, str):
        sugg_sql = val
    else:
        return jsonify({"error": "teacher_suggestion must be a string or null"}), 400

    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM student_study_plans WHERE id = ?",
        (plan_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Plan not found"}), 404

    class_name = normalize_class_name(row["class_name"])
    _, d29_guard_err = resolve_teacher_with_optional_enforcement(
        conn,
        request.args.get("teacher_username"),
        class_name,
    )
    if d29_guard_err is not None:
        conn.close()
        return d29_guard_err

    conn.execute(
        """
        UPDATE student_study_plans
        SET teacher_suggestion = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (sugg_sql, plan_id),
    )
    conn.commit()
    updated = conn.execute(
        "SELECT * FROM student_study_plans WHERE id = ?",
        (plan_id,),
    ).fetchone()
    conn.close()
    return jsonify(study_plan_to_dict(updated))


@app.route("/dashboard", methods=["GET"])
@app.route("/api/dashboard", methods=["GET"])
def get_dashboard():
    """
    Return simple teacher dashboard data.

    Optional query: class_name=EAP047
    When present, total_tasks, pending_tasks, completed_tasks, and completion_rate
    are calculated only for tasks in that class.

    /api/dashboard — legacy aggregate task counts (not used by current frontend; teacher UI uses
    GET /api/teacher/progress). /dashboard — same data at a short URL for the browser.
    """
    class_name_filter = request.args.get("class_name")
    class_sql = ""
    class_params = []

    if class_name_filter is not None and str(class_name_filter).strip() != "":
        class_sql = " WHERE class_name = ?"
        class_params = [class_name_filter.strip()]

    conn = get_db_connection()

    total_tasks = conn.execute(
        "SELECT COUNT(*) FROM calendar_tasks" + class_sql,
        class_params,
    ).fetchone()[0]

    pending_tasks = conn.execute(
        "SELECT COUNT(*) FROM calendar_tasks"
        + class_sql
        + (" AND " if class_sql else " WHERE ")
        + "LOWER(TRIM(COALESCE(status, ''))) != 'completed'",
        class_params,
    ).fetchone()[0]

    completed_tasks = conn.execute(
        "SELECT COUNT(*) FROM calendar_tasks"
        + class_sql
        + (" AND " if class_sql else " WHERE ")
        + "LOWER(TRIM(COALESCE(status, ''))) = 'completed'",
        class_params,
    ).fetchone()[0]

    conn.close()

    if total_tasks == 0:
        completion_rate = 0
    else:
        completion_rate = round((completed_tasks / total_tasks) * 100, 2)

    return jsonify(
        {
            "total_tasks": total_tasks,
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": completion_rate,
        }
    )


def require_admin_session(conn):
    """Phase E1: admin-only JSON routes."""
    return require_session_role_if_enabled(conn, "admin")


def user_public_dict(row):
    """Safe user fields for admin API (no password)."""
    payload = {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "full_name": row["full_name"],
        "class_name": row["class_name"],
        "is_authorized": bool(user_is_authorized(row)),
    }
    try:
        payload["student_id"] = row["student_id"]
    except (KeyError, IndexError):
        payload["student_id"] = None
    try:
        payload["employee_id"] = row["employee_id"]
    except (KeyError, IndexError):
        payload["employee_id"] = None
    for col in ("email", "office_number", "office_phone", "mobile_phone"):
        try:
            payload[col] = row[col]
        except (KeyError, IndexError):
            payload[col] = None
    return payload


def admin_user_assigned_class_codes(conn, user_id, role):
    """Class codes from teacher_classes or class_enrollments (Phase E3)."""
    role_norm = str(role or "").strip().lower()
    if role_norm == "teacher":
        rows = conn.execute(
            """
            SELECT c.class_code
            FROM teacher_classes tc
            INNER JOIN classes c ON c.id = tc.class_id
            WHERE tc.teacher_id = ?
            ORDER BY c.class_code ASC
            """,
            (user_id,),
        ).fetchall()
    elif role_norm == "student":
        rows = conn.execute(
            """
            SELECT c.class_code
            FROM class_enrollments ce
            INNER JOIN classes c ON c.id = ce.class_id
            WHERE ce.student_id = ?
            ORDER BY c.class_code ASC
            """,
            (user_id,),
        ).fetchall()
    else:
        return []
    return [str(r["class_code"]) for r in rows]


def admin_student_enrollments(conn, user_id):
    """Class (module) + group for each student enrollment."""
    rows = conn.execute(
        """
        SELECT c.class_code, ce.group_code
        FROM class_enrollments ce
        INNER JOIN classes c ON c.id = ce.class_id
        WHERE ce.student_id = ?
        ORDER BY c.class_code ASC
        """,
        (user_id,),
    ).fetchall()
    out = []
    for r in rows:
        gc = str(r["group_code"] or "").strip() or "G1"
        out.append({"class_code": str(r["class_code"]), "group_code": gc})
    return out


def admin_user_dict(conn, row):
    """Admin list user with assigned class codes from membership tables."""
    payload = user_public_dict(row)
    payload["assigned_classes"] = admin_user_assigned_class_codes(
        conn, row["id"], row["role"]
    )
    if str(row["role"] or "").strip().lower() == "student":
        payload["enrollments"] = admin_student_enrollments(conn, row["id"])
    return payload


def admin_class_member_user_dict(row):
    keys = row.keys() if hasattr(row, "keys") else ()
    group_code = None
    if "group_code" in keys and row["group_code"]:
        group_code = str(row["group_code"]).strip() or "G1"
    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "employee_id": row["employee_id"] if "employee_id" in keys else None,
        "student_id": row["student_id"] if "student_id" in keys else None,
        "email": row["email"] if "email" in keys else None,
        "office_number": row["office_number"] if "office_number" in keys else None,
        "office_phone": row["office_phone"] if "office_phone" in keys else None,
        "mobile_phone": row["mobile_phone"] if "mobile_phone" in keys else None,
        "group_code": group_code,
    }


def admin_class_summary_dict(conn, row):
    teacher_count = conn.execute(
        "SELECT COUNT(*) AS c FROM teacher_classes WHERE class_id = ?",
        (row["id"],),
    ).fetchone()
    student_count = conn.execute(
        "SELECT COUNT(*) AS c FROM class_enrollments WHERE class_id = ?",
        (row["id"],),
    ).fetchone()
    return {
        **class_row_to_dict(row),
        "teacher_count": int(teacher_count["c"]) if teacher_count else 0,
        "student_count": int(student_count["c"]) if student_count else 0,
    }


def admin_class_detail_payload(conn, class_id):
    row = conn.execute(
        """
        SELECT id, class_code, display_name, course_code, semester, is_active
        FROM classes
        WHERE id = ?
        """,
        (class_id,),
    ).fetchone()
    if row is None:
        return None

    teachers = conn.execute(
        """
        SELECT u.id, u.username, u.full_name, u.employee_id, u.email,
               u.office_number, u.office_phone, u.mobile_phone
        FROM teacher_classes tc
        INNER JOIN users u ON u.id = tc.teacher_id
        WHERE tc.class_id = ?
        ORDER BY u.username ASC
        """,
        (class_id,),
    ).fetchall()
    students = conn.execute(
        """
        SELECT u.id, u.username, u.full_name, u.student_id, u.email, u.mobile_phone,
               ce.group_code
        FROM class_enrollments ce
        INNER JOIN users u ON u.id = ce.student_id
        WHERE ce.class_id = ?
        ORDER BY ce.group_code ASC, u.username ASC
        """,
        (class_id,),
    ).fetchall()

    summary = admin_class_summary_dict(conn, row)
    summary["teachers"] = [admin_class_member_user_dict(t) for t in teachers]
    summary["students"] = [admin_class_member_user_dict(s) for s in students]
    return summary


def resolve_teacher_id(conn, data):
    if data.get("teacher_id") is not None:
        try:
            return int(data["teacher_id"])
        except (TypeError, ValueError):
            return None
    username = str(data.get("teacher_username") or "").strip()
    if not username:
        return None
    row = conn.execute(
        """
        SELECT id FROM users
        WHERE username = ? AND TRIM(COALESCE(role, '')) = 'teacher'
        """,
        (username,),
    ).fetchone()
    return int(row["id"]) if row else None


def resolve_student_id(conn, data):
    if data.get("student_id") is not None:
        try:
            return int(data["student_id"])
        except (TypeError, ValueError):
            return None
    username = str(data.get("student_username") or "").strip()
    if not username:
        return None
    row = conn.execute(
        """
        SELECT id FROM users
        WHERE username = ? AND TRIM(COALESCE(role, '')) = 'student'
        """,
        (username,),
    ).fetchone()
    return int(row["id"]) if row else None


@app.route("/api/admin/classes", methods=["GET", "POST"])
def admin_classes():
    """Phase E3: list or create classes (admin only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if request.method == "GET":
        rows = conn.execute(
            """
            SELECT id, class_code, display_name, course_code, semester, is_active
            FROM classes
            ORDER BY class_code ASC
            """
        ).fetchall()
        payload = [admin_class_summary_dict(conn, r) for r in rows]
        conn.close()
        return jsonify(payload)

    data = request.get_json(silent=True) or {}
    class_code = str(data.get("class_code") or "").strip().upper()
    display_name = str(data.get("display_name") or class_code).strip()
    course_code = str(data.get("course_code") or "EAP").strip() or "EAP"
    semester = str(data.get("semester") or "").strip() or None

    if not class_code:
        conn.close()
        return jsonify({"error": "class_code is required"}), 400

    existing = conn.execute(
        "SELECT id FROM classes WHERE class_code = ?",
        (class_code,),
    ).fetchone()
    if existing is not None:
        conn.close()
        return jsonify({"error": "class_code already exists"}), 409

    now = utc_now_iso()
    cur = conn.execute(
        """
        INSERT INTO classes (class_code, display_name, course_code, semester, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (class_code, display_name, course_code, semester, now, now),
    )
    conn.commit()
    class_id = cur.lastrowid
    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    return jsonify(payload), 201


@app.route("/api/admin/classes/<int:class_id>", methods=["GET", "PUT", "DELETE"])
def admin_class_detail(class_id):
    """Phase E3: class detail, update, or delete (admin only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if request.method == "GET":
        payload = admin_class_detail_payload(conn, class_id)
        conn.close()
        if payload is None:
            return jsonify({"error": "Class not found"}), 404
        return jsonify(payload)

    if request.method == "DELETE":
        row = conn.execute(
            "SELECT id, class_code FROM classes WHERE id = ?",
            (class_id,),
        ).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": "Class not found"}), 404
        conn.execute("DELETE FROM teacher_classes WHERE class_id = ?", (class_id,))
        conn.execute("DELETE FROM class_enrollments WHERE class_id = ?", (class_id,))
        conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))
        conn.commit()
        conn.close()
        return jsonify({"deleted": True, "id": class_id, "class_code": row["class_code"]})

    data = request.get_json(silent=True) or {}
    row = conn.execute(
        "SELECT id FROM classes WHERE id = ?",
        (class_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Class not found"}), 404

    display_name = data.get("display_name")
    course_code = data.get("course_code")
    semester = data.get("semester")
    is_active = data.get("is_active")

    fields = []
    values = []
    if display_name is not None:
        fields.append("display_name = ?")
        values.append(str(display_name).strip() or None)
    if course_code is not None:
        fields.append("course_code = ?")
        values.append(str(course_code).strip() or "EAP")
    if semester is not None:
        fields.append("semester = ?")
        values.append(str(semester).strip() or None)
    if is_active is not None:
        fields.append("is_active = ?")
        values.append(1 if bool(is_active) else 0)

    if fields:
        fields.append("updated_at = ?")
        values.append(utc_now_iso())
        values.append(class_id)
        conn.execute(
            f"UPDATE classes SET {', '.join(fields)} WHERE id = ?",
            tuple(values),
        )
        conn.commit()

    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/classes/<int:class_id>/teachers", methods=["POST"])
def admin_class_assign_teacher(class_id):
    """Assign a teacher to a class."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if conn.execute("SELECT id FROM classes WHERE id = ?", (class_id,)).fetchone() is None:
        conn.close()
        return jsonify({"error": "Class not found"}), 404

    data = request.get_json(silent=True) or {}
    teacher_id = resolve_teacher_id(conn, data)
    if teacher_id is None:
        conn.close()
        return jsonify({"error": "teacher_id or teacher_username is required"}), 400

    teacher = conn.execute(
        "SELECT id FROM users WHERE id = ? AND TRIM(COALESCE(role, '')) = 'teacher'",
        (teacher_id,),
    ).fetchone()
    if teacher is None:
        conn.close()
        return jsonify({"error": "Teacher not found"}), 404

    conn.execute(
        """
        INSERT OR IGNORE INTO teacher_classes (class_id, teacher_id, assigned_at)
        VALUES (?, ?, ?)
        """,
        (class_id, teacher_id, utc_now_iso()),
    )
    conn.commit()
    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/classes/<int:class_id>/teachers/<int:teacher_id>", methods=["DELETE"])
def admin_class_unassign_teacher(class_id, teacher_id):
    """Remove a teacher from a class."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    conn.execute(
        "DELETE FROM teacher_classes WHERE class_id = ? AND teacher_id = ?",
        (class_id, teacher_id),
    )
    conn.commit()
    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    if payload is None:
        return jsonify({"error": "Class not found"}), 404
    return jsonify(payload)


@app.route("/api/admin/classes/<int:class_id>/students", methods=["POST"])
def admin_class_enroll_student(class_id):
    """Enroll a student in a class."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if conn.execute("SELECT id FROM classes WHERE id = ?", (class_id,)).fetchone() is None:
        conn.close()
        return jsonify({"error": "Class not found"}), 404

    data = request.get_json(silent=True) or {}
    student_id = resolve_student_id(conn, data)
    if student_id is None:
        conn.close()
        return jsonify({"error": "student_id or student_username is required"}), 400

    student = conn.execute(
        "SELECT id FROM users WHERE id = ? AND TRIM(COALESCE(role, '')) = 'student'",
        (student_id,),
    ).fetchone()
    if student is None:
        conn.close()
        return jsonify({"error": "Student not found"}), 404

    group_code = normalize_group_code(data.get("group_code"))

    conn.execute(
        """
        INSERT INTO class_enrollments (class_id, student_id, enrolled_at, group_code)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(class_id, student_id) DO UPDATE SET group_code = excluded.group_code
        """,
        (class_id, student_id, utc_now_iso(), group_code),
    )
    conn.commit()
    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/classes/<int:class_id>/students/<int:student_id>", methods=["DELETE"])
def admin_class_unenroll_student(class_id, student_id):
    """Remove a student from a class."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    conn.execute(
        "DELETE FROM class_enrollments WHERE class_id = ? AND student_id = ?",
        (class_id, student_id),
    )
    conn.commit()
    payload = admin_class_detail_payload(conn, class_id)
    conn.close()
    if payload is None:
        return jsonify({"error": "Class not found"}), 404
    return jsonify(payload)


@app.route("/api/admin/teachers", methods=["GET"])
def admin_list_teachers():
    """List teacher accounts and authorization status (admin only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    rows = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized, student_id, employee_id,
               email, office_number, office_phone, mobile_phone
        FROM users
        WHERE TRIM(COALESCE(role, '')) = 'teacher'
        ORDER BY username ASC
        """
    ).fetchall()
    payload = [admin_user_dict(conn, r) for r in rows]
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/students", methods=["GET"])
def admin_list_students():
    """List student accounts (admin only, read-only for now)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    rows = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized, student_id, employee_id,
               email, office_number, office_phone, mobile_phone
        FROM users
        WHERE TRIM(COALESCE(role, '')) = 'student'
        ORDER BY username ASC
        """
    ).fetchall()
    payload = [admin_user_dict(conn, r) for r in rows]
    conn.close()
    return jsonify(payload)


@app.route("/api/academic-calendar", methods=["GET"])
def api_academic_calendar():
    """School academic calendar for teaching-week labels and holiday notes (all roles)."""
    conn = get_db_connection()
    payload = academic_calendar_payload(conn)
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/academic-calendar", methods=["GET", "PUT"])
def admin_academic_calendar():
    """Manager: read or update academic calendar settings."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if request.method == "GET":
        payload = academic_calendar_payload(conn)
        conn.close()
        return jsonify(payload)

    data = request.get_json(silent=True) or {}
    semester_start = parse_iso_date_or_none(data.get("semester_start_date"))
    if not semester_start:
        conn.close()
        return jsonify({"error": "semester_start_date (YYYY-MM-DD) is required"}), 400

    try:
        teaching_weeks = int(data.get("teaching_weeks", 16))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "teaching_weeks must be an integer"}), 400
    if teaching_weeks < 1 or teaching_weeks > 52:
        conn.close()
        return jsonify({"error": "teaching_weeks must be between 1 and 52"}), 400

    notable = data.get("notable_dates")
    if not isinstance(notable, dict):
        conn.close()
        return jsonify({"error": "notable_dates must be an object { YYYY-MM-DD: label }"}), 400

    cleaned_notes = {}
    for raw_date, raw_label in notable.items():
        iso = parse_iso_date_or_none(raw_date)
        label = str(raw_label or "").strip()
        if iso and label:
            cleaned_notes[iso] = label

    conn.execute(
        """
        INSERT INTO academic_calendar_config (id, semester_start_date, teaching_weeks, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            semester_start_date = excluded.semester_start_date,
            teaching_weeks = excluded.teaching_weeks,
            updated_at = excluded.updated_at
        """,
        (semester_start, teaching_weeks, utc_now_iso()),
    )
    conn.execute("DELETE FROM academic_calendar_notes")
    for iso, label in sorted(cleaned_notes.items()):
        conn.execute(
            "INSERT INTO academic_calendar_notes (date, label) VALUES (?, ?)",
            (iso, label),
        )
    conn.commit()
    payload = academic_calendar_payload(conn)
    conn.close()
    return jsonify(payload)


@app.route("/api/admin/teachers/<int:user_id>/authorized", methods=["PUT"])
def admin_set_teacher_authorized(user_id):
    """
    Authorize or revoke a teacher account.
    Body: { "authorized": true | false }
    """
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    data = request.get_json(silent=True) or {}
    if "authorized" not in data:
        conn.close()
        return jsonify({"error": "authorized (boolean) is required"}), 400
    authorized = bool(data.get("authorized"))

    row = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized
        FROM users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "User not found"}), 404
    if str(row["role"] or "").strip().lower() != "teacher":
        conn.close()
        return jsonify({"error": "User is not a teacher"}), 400

    conn.execute(
        "UPDATE users SET is_authorized = ? WHERE id = ?",
        (1 if authorized else 0, user_id),
    )
    conn.commit()
    updated = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized
        FROM users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    conn.close()
    return jsonify(user_public_dict(updated))


@app.route("/api/admin/teachers/<int:user_id>", methods=["DELETE"])
def admin_delete_teacher(user_id):
    """Remove a teacher account and unlink all class assignments (admin only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    row = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized
        FROM users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "User not found"}), 404
    if str(row["role"] or "").strip().lower() != "teacher":
        conn.close()
        return jsonify({"error": "User is not a teacher"}), 400

    username = row["username"]
    conn.execute("DELETE FROM teacher_classes WHERE teacher_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True, "id": user_id, "username": username})


@app.route("/api/admin/students/<int:user_id>", methods=["DELETE"])
def admin_delete_student(user_id):
    """Remove a student account and unlink all class enrollments (admin only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    row = conn.execute(
        """
        SELECT id, username, role, full_name, class_name, is_authorized
        FROM users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "User not found"}), 404
    if str(row["role"] or "").strip().lower() != "student":
        conn.close()
        return jsonify({"error": "User is not a student"}), 400

    username = row["username"]
    conn.execute("DELETE FROM class_enrollments WHERE student_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True, "id": user_id, "username": username})


SELF_STUDY_MODULES = frozenset({"vocabulary", "reading", "listening", "speaking", "writing"})
SELF_STUDY_LEVELS = frozenset({"all", "beginner", "intermediate", "advanced"})
SELF_STUDY_FORMATS = frozenset({"pdf", "doc", "ppt", "txt", "url"})


def self_study_material_row_to_dict(row):
    """JSON shape aligned with Phase S7 mock + K1 file URLs."""
    file_path = str(row["file_path"] or "").strip()
    file_url = f"/uploads/{os.path.basename(file_path)}" if file_path else ""
    created_at = row["created_at"]
    try:
        from datetime import datetime

        created_ms = int(
            datetime.fromisoformat(str(created_at).replace("Z", "+00:00")).timestamp() * 1000
        )
    except (TypeError, ValueError, OSError):
        created_ms = 0
    return {
        "id": str(row["id"]),
        "title": row["title"] or "",
        "titleZh": row["title_zh"] or "",
        "module": row["module"] or "vocabulary",
        "level": row["level"] or "all",
        "format": row["format"] or "pdf",
        "unitLabel": row["unit_label"] or "",
        "fileName": row["file_name"] or "",
        "fileUrl": file_url,
        "url": row["url"] or "",
        "notes": row["notes"] or "",
        "textSnippet": row["text_snippet"] or "",
        "createdAt": created_ms,
    }


def _self_study_materials_for_student(conn, module, level):
    mod = str(module or "").strip().lower()
    lvl = str(level or "beginner").strip().lower()
    if mod not in SELF_STUDY_MODULES:
        return []
    rows = conn.execute(
        """
        SELECT id, title, title_zh, module, level, format, unit_label,
               file_path, file_name, url, notes, text_snippet, uploaded_by, created_at
        FROM self_study_materials
        WHERE module = ? AND (level = 'all' OR level = ?)
        ORDER BY datetime(created_at) DESC, id DESC
        """,
        (mod, lvl),
    ).fetchall()
    return [self_study_material_row_to_dict(r) for r in rows]


@app.route("/api/admin/self-study/materials", methods=["GET", "POST"])
def admin_self_study_materials():
    """Phase K1: manager upload/list self-study materials (PDF/Word/TXT; url metadata)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    if request.method == "GET":
        rows = conn.execute(
            """
            SELECT id, title, title_zh, module, level, format, unit_label,
                   file_path, file_name, url, notes, text_snippet, uploaded_by, created_at
            FROM self_study_materials
            ORDER BY datetime(created_at) DESC, id DESC
            """
        ).fetchall()
        conn.close()
        return jsonify({"materials": [self_study_material_row_to_dict(r) for r in rows]})

    ensure_uploads_directory()
    actor = get_current_authenticated_user(conn)
    uploaded_by = str(actor["username"] or "").strip() if actor else ""

    title = str(request.form.get("title") or "").strip()
    if not title:
        conn.close()
        return jsonify({"error": "title is required"}), 400

    module = str(request.form.get("module") or "vocabulary").strip().lower()
    level = str(request.form.get("level") or "all").strip().lower()
    fmt = str(request.form.get("format") or "pdf").strip().lower()
    if module not in SELF_STUDY_MODULES:
        conn.close()
        return jsonify({"error": "invalid module"}), 400
    if level not in SELF_STUDY_LEVELS:
        conn.close()
        return jsonify({"error": "invalid level"}), 400
    if fmt not in SELF_STUDY_FORMATS:
        conn.close()
        return jsonify({"error": "invalid format"}), 400

    unit_label = str(request.form.get("unit_label") or request.form.get("unit") or "").strip()[:120]
    title_zh = str(request.form.get("title_zh") or request.form.get("titleZh") or "").strip()[:120]
    notes = str(request.form.get("notes") or "").strip()[:500]
    url = str(request.form.get("url") or "").strip()[:2048]
    text_snippet = str(request.form.get("text_snippet") or request.form.get("textSnippet") or "").strip()[
        :4000
    ]

    stored_name = None
    display_name = ""
    if fmt == "url":
        if not url:
            conn.close()
            return jsonify({"error": "url is required for web link format"}), 400
    else:
        if "file" not in request.files:
            conn.close()
            return jsonify({"error": 'Missing form part named "file"'}), 400
        upload = request.files["file"]
        if upload is None or upload.filename is None or upload.filename.strip() == "":
            conn.close()
            return jsonify({"error": "No file selected"}), 400
        if not allowed_self_study_material_extension(upload.filename):
            conn.close()
            return jsonify({"error": "File type not allowed. Allowed: pdf, doc, docx, txt"}), 400
        ext = upload.filename.rsplit(".", 1)[-1].lower()
        stored_name = f"{uuid.uuid4().hex}.{ext}"
        dest_abs = os.path.join(UPLOAD_DIR, stored_name)
        display_name = os.path.basename(upload.filename.strip())[:512]
        try:
            upload.save(dest_abs)
            if ext == "txt" and not text_snippet:
                with open(dest_abs, "r", encoding="utf-8", errors="replace") as fh:
                    text_snippet = fh.read(4000)
        except OSError:
            conn.close()
            return jsonify({"error": "Could not save uploaded file"}), 500

    now = utc_now_iso()
    cur = conn.execute(
        """
        INSERT INTO self_study_materials
            (title, title_zh, module, level, format, unit_label,
             file_path, file_name, url, notes, text_snippet, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            title_zh or None,
            module,
            level,
            fmt,
            unit_label or None,
            stored_name,
            display_name or None,
            url or None,
            notes or None,
            text_snippet or None,
            uploaded_by or None,
            now,
        ),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT id, title, title_zh, module, level, format, unit_label,
               file_path, file_name, url, notes, text_snippet, uploaded_by, created_at
        FROM self_study_materials WHERE id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    conn.close()
    return jsonify({"material": self_study_material_row_to_dict(row)}), 201


@app.route("/api/admin/self-study/materials/<int:material_id>", methods=["DELETE"])
def admin_self_study_material_delete(material_id):
    """Phase K1: remove one self-study material row and its upload file."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    row = conn.execute(
        "SELECT id, file_path FROM self_study_materials WHERE id = ?",
        (material_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Material not found"}), 404

    file_path = str(row["file_path"] or "").strip()
    if file_path:
        full = os.path.join(UPLOAD_DIR, os.path.basename(file_path))
        if os.path.isfile(full):
            try:
                os.remove(full)
            except OSError:
                pass

    conn.execute("DELETE FROM self_study_materials WHERE id = ?", (material_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/student/self-study/materials", methods=["GET"])
def student_self_study_materials():
    """Phase K1: list materials for one skill module and student placement level."""
    module = request.args.get("module") or request.args.get("skill")
    level = request.args.get("level") or "beginner"

    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "student")
    if err is not None:
        conn.close()
        return err

    materials = _self_study_materials_for_student(conn, module, level)
    conn.close()
    return jsonify({"materials": materials})


@app.route("/api/admin/ai/status", methods=["GET"])
def admin_ai_status():
    """Phase K2: safe AI configuration status (manager only; no secrets)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    conn.close()
    if not ai_public_status:
        return jsonify({"error": "AI module not available"}), 503
    return jsonify(ai_public_status())


@app.route("/api/admin/ai/ping", methods=["POST"])
def admin_ai_ping():
    """Phase K2: run one minimal completion to verify API key (manager only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    conn.close()
    if not ai_is_configured or not ai_ping:
        return jsonify({"error": "AI not configured", "status": ai_public_status()}), 503
    if not ai_is_configured():
        return jsonify({"error": "AI not enabled or key missing", "status": ai_public_status()}), 503
    body = request.get_json(silent=True) or {}
    provider = (body.get("provider") or "").strip() or None
    if provider and not ai_is_configured(provider):
        return jsonify(
            {"error": f"Provider '{provider}' is not configured", "status": ai_public_status()}
        ), 503
    try:
        result = ai_ping(provider)
        code = 200 if result.get("ok") else 502
        return jsonify(result), code
    except Exception as exc:  # noqa: BLE001 — surface provider errors to admin only
        return jsonify({"ok": False, "error": str(exc), "status": ai_public_status()}), 502


@app.route("/api/student/self-study/ai/status", methods=["GET"])
def student_self_study_ai_status():
    """Phase K2: safe AI availability for student self-study (no secrets)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "student")
    if err is not None:
        conn.close()
        return err
    conn.close()
    if not ai_public_status:
        return jsonify({"available": False, "reason": "ai_module_missing"})
    status = ai_public_status()
    return jsonify(
        {
            "available": bool(status.get("enabled") and status.get("configured")),
            "active_provider": status.get("active_provider"),
            "model": status.get("model"),
            "coach_modules": sorted(coach_modules_with_api()),
        }
    )


@app.route("/api/student/self-study/ai/coach/<module>", methods=["POST"])
def student_self_study_ai_coach(module):
    """Phase K2c: generic self-study AI coach (reading, etc.) using manager prompts."""
    try:
        mod = normalize_module(module)
    except ValueError:
        return jsonify({"error": "Invalid module"}), 400

    if mod not in coach_modules_with_api() or mod == "vocabulary":
        return jsonify({"error": "Use vocabulary-explain for vocabulary"}), 400

    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "student")
    if err is not None:
        conn.close()
        return err

    if not module_coach_reply or not ai_is_configured or not ai_is_configured():
        conn.close()
        return jsonify({"error": "AI study coach is not available"}), 503

    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or body.get("passage") or "").strip()
    level = str(body.get("level") or "beginner").strip().lower()
    lang = str(body.get("lang") or "en").strip().lower()
    if not text:
        conn.close()
        return jsonify({"error": "text is required"}), 400

    try:
        prompt_row = get_prompt(conn, mod)
        result = module_coach_reply(
            mod,
            text,
            level=level,
            lang=lang,
            system_prompt=prompt_row["system_prompt"],
            json_keys=json_keys_for_module(mod),
        )
        conn.close()
        return jsonify({"coach": result})
    except ValueError as exc:
        conn.close()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        conn.close()
        return jsonify({"error": "AI request failed", "detail": _ai_error_detail(exc)}), 502


@app.route("/api/student/self-study/ai/vocabulary-explain", methods=["POST"])
def student_self_study_vocabulary_explain():
    """Phase K2: AI vocabulary coach — structured explain for one term."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "student")
    if err is not None:
        conn.close()
        return err

    if not vocabulary_explain or not ai_is_configured or not ai_is_configured():
        conn.close()
        return jsonify({"error": "AI study coach is not available"}), 503

    body = request.get_json(silent=True) or {}
    term = str(body.get("term") or "").strip()
    level = str(body.get("level") or "beginner").strip().lower()
    lang = str(body.get("lang") or "en").strip().lower()
    if not term:
        conn.close()
        return jsonify({"error": "term is required"}), 400

    try:
        prompt_row = get_prompt(conn, "vocabulary")
        result = vocabulary_explain(
            term,
            level=level,
            lang=lang,
            system_prompt=prompt_row["system_prompt"],
            json_keys=VOCABULARY_JSON_KEYS,
        )
        conn.close()
        return jsonify({"explanation": result})
    except ValueError as exc:
        conn.close()
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001 — provider errors for student UI
        conn.close()
        return jsonify({"error": "AI request failed", "detail": _ai_error_detail(exc)}), 502


@app.route("/api/admin/self-study/ai/prompts", methods=["GET"])
def admin_self_study_ai_prompts_list():
    """Phase K2b: list manager AI prompts for all self-study modules."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    prompts = list_prompts(conn)
    conn.close()
    return jsonify(
        {
            "prompts": prompts,
            "json_keys": {mod: list(json_keys_for_module(mod)) for mod in sorted(coach_modules_with_api())},
            "coach_modules": sorted(coach_modules_with_api()),
        }
    )


@app.route("/api/admin/self-study/ai/prompts/<module>", methods=["GET", "PUT", "DELETE"])
def admin_self_study_ai_prompt(module):
    """Phase K2b: read, save, or reset one module AI system prompt."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    try:
        mod = normalize_module(module)
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid module"}), 400

    if request.method == "GET":
        payload = get_prompt(conn, mod)
        conn.close()
        return jsonify({"prompt": payload, "default_prompt": default_prompt(mod)})

    actor = get_current_authenticated_user(conn)
    username = str(actor["username"] or "").strip() if actor else ""

    if request.method == "DELETE":
        payload = reset_prompt(conn, mod, username)
        conn.close()
        return jsonify({"prompt": payload})

    body = request.get_json(silent=True) or {}
    text = str(body.get("system_prompt") or "").strip()
    if not text:
        conn.close()
        return jsonify({"error": "system_prompt is required"}), 400
    try:
        payload = save_prompt(conn, mod, text, username)
    except ValueError as exc:
        conn.close()
        return jsonify({"error": str(exc)}), 400
    conn.close()
    return jsonify({"prompt": payload})


@app.route("/api/admin/self-study/ai/prompts/<module>/preview", methods=["POST"])
def admin_self_study_ai_prompt_preview(module):
    """Phase K2b: preview AI output with current or draft prompt (manager only)."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard

    try:
        mod = normalize_module(module)
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid module"}), 400

    if not ai_is_configured or not ai_is_configured():
        conn.close()
        return jsonify({"error": "AI not configured"}), 503

    if mod not in coach_modules_with_api():
        conn.close()
        return jsonify({"error": "Preview not available for this module yet"}), 400

    body = request.get_json(silent=True) or {}
    level = str(body.get("level") or "beginner").strip().lower()
    lang = str(body.get("lang") or "en").strip().lower()
    draft = str(body.get("system_prompt") or "").strip()
    prompt_row = get_prompt(conn, mod)
    conn.close()
    system_prompt = draft or prompt_row["system_prompt"]
    keys = json_keys_for_module(mod)

    try:
        if mod == "vocabulary":
            if not vocabulary_explain:
                return jsonify({"error": "AI module not available"}), 503
            term = str(body.get("term") or "analyze").strip()
            result = vocabulary_explain(
                term,
                level=level,
                lang=lang,
                system_prompt=system_prompt,
                json_keys=keys or VOCABULARY_JSON_KEYS,
            )
            return jsonify({"explanation": result, "coach": result})
        if not module_coach_reply:
            return jsonify({"error": "AI module not available"}), 503
        text = str(body.get("text") or body.get("passage") or "").strip()
        if not text:
            return jsonify({"error": "text or passage is required for reading preview"}), 400
        result = module_coach_reply(
            mod,
            text,
            level=level,
            lang=lang,
            system_prompt=system_prompt,
            json_keys=keys,
        )
        return jsonify({"coach": result, "explanation": result})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "AI request failed", "detail": _ai_error_detail(exc)}), 502


# --- Phase K3–K5: Teacher AI HTML teaching pages ---

from teacher_teaching_pages import (
    MAX_SOURCE_TEXT,
    MAX_TITLE,
    polish_teaching_html,
    row_to_dict as teaching_page_row_to_dict,
    row_to_public_dict as teaching_page_public_row,
)
from teaching_page_templates import (
    get_prompt as get_teaching_template_prompt,
    list_prompts as list_teaching_templates,
    normalize_template_key,
    reset_prompt as reset_teaching_template_prompt,
    save_prompt as save_teaching_template_prompt,
)
from teaching_page_source_files import (
    ALLOWED_SOURCE_EXTENSIONS,
    MAX_SOURCE_FILE_BYTES,
    MAX_SOURCE_FILES_PER_TEACHER,
    allowed_source_extension,
    delete_stored_file,
    extract_text_from_bytes,
    merge_source_text,
    normalize_extracted_text,
    row_to_detail as teaching_source_file_detail,
    row_to_dict as teaching_source_file_row,
    save_source_file,
    teaching_source_upload_dir,
)

_TEACHING_PAGE_SELECT = """
    SELECT id, title, class_name, task_id, topic, source_text, html_content,
           template_key, published, published_at, teacher_username, created_at, updated_at
    FROM teacher_teaching_pages
"""

_TEACHING_SOURCE_SELECT = """
    SELECT id, teacher_username, original_name, stored_name, extracted_text, char_count,
           status, created_at, confirmed_at
    FROM teacher_teaching_source_files
"""


def _teaching_source_upload_dir():
    ensure_uploads_directory()
    return teaching_source_upload_dir(UPLOAD_DIR)


def _resolve_teaching_source_text(conn, teacher: str, paste_text: str, file_ids: list | None) -> str:
    """Merge pasted notes with confirmed uploaded source files."""
    ids = []
    if file_ids:
        for raw in file_ids:
            if raw is None:
                continue
            s = str(raw).strip()
            if s.isdigit():
                ids.append(int(s))
    if not ids:
        return str(paste_text or "").strip()[:MAX_SOURCE_TEXT]

    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        _TEACHING_SOURCE_SELECT
        + f" WHERE teacher_username = ? AND status = 'confirmed' AND id IN ({placeholders})",
        (teacher, *ids),
    ).fetchall()
    file_texts = [r["extracted_text"] or "" for r in rows]
    return merge_source_text(paste_text, file_texts, MAX_SOURCE_TEXT)


@app.route("/api/teacher/teaching-pages/source-files", methods=["GET", "POST"])
def teacher_teaching_source_files_collection():
    """Upload or list staged/confirmed lesson source files (PDF/DOCX/TXT)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""

    if request.method == "GET":
        rows = conn.execute(
            _TEACHING_SOURCE_SELECT
            + " WHERE teacher_username = ? ORDER BY datetime(created_at) DESC, id DESC",
            (teacher,),
        ).fetchall()
        conn.close()
        return jsonify({"files": [teaching_source_file_row(r) for r in rows]})

    existing = conn.execute(
        "SELECT COUNT(*) AS n FROM teacher_teaching_source_files WHERE teacher_username = ?",
        (teacher,),
    ).fetchone()["n"]
    uploads = [f for f in request.files.getlist("file") if f and f.filename]
    if not uploads:
        single = request.files.get("file")
        if single and single.filename:
            uploads = [single]
    if not uploads:
        conn.close()
        return jsonify({"error": "No file provided (field name: file)"}), 400
    if existing + len(uploads) > MAX_SOURCE_FILES_PER_TEACHER:
        conn.close()
        return jsonify({"error": f"Maximum {MAX_SOURCE_FILES_PER_TEACHER} source files per teacher"}), 400

    upload_dir = _teaching_source_upload_dir()
    created = []
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    for up in uploads:
        name = os.path.basename(str(up.filename or "").strip())
        if not name:
            continue
        if not allowed_source_extension(name):
            conn.close()
            return jsonify(
                {"error": "File type not allowed. Allowed: pdf, docx, txt"}
            ), 400
        data = up.read()
        if not data:
            conn.close()
            return jsonify({"error": f"Empty file: {name}"}), 400
        if len(data) > MAX_SOURCE_FILE_BYTES:
            conn.close()
            return jsonify({"error": f"File too large (max {MAX_SOURCE_FILE_BYTES // (1024 * 1024)} MB): {name}"}), 400
        ext = name.rsplit(".", 1)[-1].lower()
        try:
            extracted = normalize_extracted_text(extract_text_from_bytes(data, ext))
        except ValueError as exc:
            conn.close()
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            conn.close()
            return jsonify({"error": str(exc)}), 503
        except Exception as exc:  # noqa: BLE001
            conn.close()
            return jsonify({"error": f"Could not read file: {name}", "detail": str(exc)[:120]}), 400
        if not extracted:
            conn.close()
            return jsonify({"error": f"No readable text found in: {name}"}), 400

        stored_name, _dest = save_source_file(upload_dir, name, data)
        cur = conn.execute(
            """
            INSERT INTO teacher_teaching_source_files
                (teacher_username, original_name, stored_name, extracted_text, char_count,
                 status, created_at, confirmed_at)
            VALUES (?, ?, ?, ?, ?, 'staged', ?, NULL)
            """,
            (teacher, name[:512], stored_name, extracted, len(extracted), now),
        )
        row = conn.execute(
            _TEACHING_SOURCE_SELECT + " WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        created.append(teaching_source_file_row(row))

    conn.commit()
    conn.close()
    return jsonify({"files": created}), 201


@app.route("/api/teacher/teaching-pages/source-files/confirm", methods=["POST"])
def teacher_teaching_source_files_confirm():
    """Mark staged source files as confirmed for AI generation."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""
    body = request.get_json(silent=True) or {}
    raw_ids = body.get("file_ids") or body.get("ids") or []
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    if raw_ids:
        ids = [int(str(x)) for x in raw_ids if str(x).strip().isdigit()]
        if not ids:
            conn.close()
            return jsonify({"error": "file_ids required"}), 400
        placeholders = ",".join("?" for _ in ids)
        conn.execute(
            f"""
            UPDATE teacher_teaching_source_files
            SET status = 'confirmed', confirmed_at = ?
            WHERE teacher_username = ? AND status = 'staged' AND id IN ({placeholders})
            """,
            (now, teacher, *ids),
        )
    else:
        conn.execute(
            """
            UPDATE teacher_teaching_source_files
            SET status = 'confirmed', confirmed_at = ?
            WHERE teacher_username = ? AND status = 'staged'
            """,
            (now, teacher),
        )

    conn.commit()
    rows = conn.execute(
        _TEACHING_SOURCE_SELECT
        + " WHERE teacher_username = ? ORDER BY datetime(created_at) DESC, id DESC",
        (teacher,),
    ).fetchall()
    conn.close()
    return jsonify({"files": [teaching_source_file_row(r) for r in rows]})


@app.route("/api/teacher/teaching-pages/source-files/<int:file_id>", methods=["GET", "DELETE"])
def teacher_teaching_source_file_detail(file_id):
    """Preview extracted text or delete one source file."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""
    row = conn.execute(
        _TEACHING_SOURCE_SELECT + " WHERE id = ? AND teacher_username = ?",
        (file_id, teacher),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    if request.method == "GET":
        conn.close()
        return jsonify({"file": teaching_source_file_detail(row)})

    delete_stored_file(_teaching_source_upload_dir(), row["stored_name"])
    conn.execute(
        "DELETE FROM teacher_teaching_source_files WHERE id = ? AND teacher_username = ?",
        (file_id, teacher),
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/admin/teaching-page/templates", methods=["GET"])
def admin_teaching_page_templates_list():
    """Phase K4: list manager HTML page type templates."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    templates = list_teaching_templates(conn)
    conn.close()
    return jsonify({"templates": templates})


@app.route("/api/admin/teaching-page/templates/<template_key>", methods=["GET", "PUT", "DELETE"])
def admin_teaching_page_template_detail(template_key):
    """Phase K4: read, save, or reset one teaching page template."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    try:
        key = normalize_template_key(template_key)
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid template"}), 400

    actor = get_current_authenticated_user(conn)
    updated_by = str(actor["username"] or "").strip() if actor else ""

    if request.method == "GET":
        payload = get_teaching_template_prompt(conn, key)
        conn.close()
        return jsonify({"template": payload, "default_prompt": payload["system_prompt"]})

    if request.method == "DELETE":
        payload = reset_teaching_template_prompt(conn, key, updated_by)
        conn.close()
        return jsonify({"template": payload})

    body = request.get_json(silent=True) or {}
    text = str(body.get("system_prompt") or "").strip()
    try:
        payload = save_teaching_template_prompt(conn, key, text, updated_by)
    except ValueError as exc:
        conn.close()
        return jsonify({"error": str(exc)}), 400
    conn.close()
    return jsonify({"template": payload})


@app.route("/api/admin/teaching-page/templates/<template_key>/preview", methods=["POST"])
def admin_teaching_page_template_preview(template_key):
    """Phase K4: preview HTML output with current or draft template prompt."""
    conn = get_db_connection()
    guard = require_admin_session(conn)
    if guard is not None:
        conn.close()
        return guard
    try:
        key = normalize_template_key(template_key)
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid template"}), 400

    if not generate_teaching_page_html or not ai_is_configured or not ai_is_configured():
        conn.close()
        return jsonify({"error": "AI not configured"}), 503

    body = request.get_json(silent=True) or {}
    topic = str(body.get("topic") or "Academic integrity").strip()
    source_text = str(body.get("source_text") or body.get("text") or "").strip()
    level = str(body.get("level") or "intermediate").strip().lower()
    lang = str(body.get("lang") or "en").strip().lower()
    draft = str(body.get("system_prompt") or "").strip()
    prompt_row = get_teaching_template_prompt(conn, key)
    conn.close()
    system_prompt = draft or prompt_row["system_prompt"]

    try:
        result = generate_teaching_page_html(
            topic,
            source_text=source_text,
            level=level,
            lang=lang,
            system_prompt=system_prompt,
        )
        result["template_key"] = key
        return jsonify({"page": result})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "AI request failed", "detail": _ai_error_detail(exc)}), 502


@app.route("/api/teacher/teaching-pages/ai/ping", methods=["POST"])
def teacher_teaching_pages_ai_ping():
    """Verify Hunyuan/OpenAI credentials from the server (teacher session)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err
    conn.close()
    if not ai_ping or not ai_is_configured or not ai_is_configured():
        return jsonify({"error": "AI not configured", "status": ai_public_status()}), 503
    try:
        result = ai_ping()
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"ok": False, "error": "AI ping failed", "detail": _ai_error_detail(exc)}), 502


@app.route("/api/teacher/teaching-pages/templates", methods=["GET"])
def teacher_teaching_page_templates_list():
    """Phase K4: template types available for lesson generation (teacher)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err
    templates = list_teaching_templates(conn)
    conn.close()
    public = [
        {
            "template_key": t["template_key"],
            "label_en": t.get("label_en") or t["template_key"],
            "label_zh": t.get("label_zh") or t["template_key"],
            "is_default": t.get("is_default", True),
        }
        for t in templates
    ]
    return jsonify({"templates": public})


@app.route("/api/teacher/teaching-pages/ai/status", methods=["GET"])
def teacher_teaching_pages_ai_status():
    """Phase K3: AI availability for lesson generator (teacher)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err
    conn.close()
    if not ai_public_status:
        return jsonify({"available": False, "reason": "ai_module_missing"})
    status = ai_public_status()
    return jsonify(
        {
            "available": bool(status.get("enabled") and status.get("configured")),
            "active_provider": status.get("active_provider"),
            "model": status.get("model"),
        }
    )


@app.route("/api/teacher/teaching-pages/generate", methods=["POST"])
def teacher_teaching_pages_generate():
    """Phase K3/K4: generate HTML teaching page preview using manager template."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    if not generate_teaching_page_html or not ai_is_configured or not ai_is_configured():
        conn.close()
        return jsonify({"error": "AI lesson generator is not available"}), 503

    body = request.get_json(silent=True) or {}
    topic = str(body.get("topic") or body.get("title") or "").strip()
    paste_source = str(body.get("source_text") or body.get("sourceText") or "").strip()
    level = str(body.get("level") or "intermediate").strip().lower()
    lang = str(body.get("lang") or "en").strip().lower()
    custom_instructions = str(body.get("instructions") or body.get("custom_instructions") or "").strip()
    source_file_ids = body.get("source_file_ids") or body.get("sourceFileIds") or []

    if not topic:
        conn.close()
        return jsonify({"error": "topic is required"}), 400

    try:
        tkey = normalize_template_key(body.get("template_key") or "standard")
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid template"}), 400

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""
    source_text = _resolve_teaching_source_text(conn, teacher, paste_source, source_file_ids)

    prompt_row = get_teaching_template_prompt(conn, tkey)
    conn.close()

    try:
        result = generate_teaching_page_html(
            topic,
            source_text=source_text,
            level=level,
            lang=lang,
            custom_instructions=custom_instructions,
            system_prompt=prompt_row["system_prompt"],
        )
        result["template_key"] = tkey
        result["source_text_used"] = source_text
        return jsonify({"page": result})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": "AI request failed", "detail": _ai_error_detail(exc)}), 502


@app.route("/api/teacher/teaching-pages", methods=["GET", "POST"])
def teacher_teaching_pages_collection():
    """Phase K3: list or save teacher HTML teaching pages."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""

    if request.method == "GET":
        rows = conn.execute(
            _TEACHING_PAGE_SELECT + " WHERE teacher_username = ? ORDER BY datetime(updated_at) DESC, id DESC",
            (teacher,),
        ).fetchall()
        conn.close()
        return jsonify({"pages": [teaching_page_row_to_dict(r) for r in rows]})

    body = request.get_json(silent=True) or {}
    title = str(body.get("title") or "").strip()
    html_content = str(body.get("html_content") or body.get("html") or "").strip()
    if not title or len(title) > MAX_TITLE:
        conn.close()
        return jsonify({"error": "title is required (max 200 chars)"}), 400
    if not html_content:
        conn.close()
        return jsonify({"error": "html_content is required"}), 400
    html_content = polish_teaching_html(html_content)

    try:
        tkey = normalize_template_key(body.get("template_key") or "standard")
    except ValueError:
        conn.close()
        return jsonify({"error": "Invalid template"}), 400

    class_name = str(body.get("class_name") or body.get("className") or "").strip()[:80]
    topic = str(body.get("topic") or title).strip()[:MAX_TITLE]
    source_text = str(body.get("source_text") or "").strip()[:MAX_SOURCE_TEXT]
    task_id = body.get("task_id")
    task_id_val = None
    if task_id is not None and str(task_id).strip().isdigit():
        task_id_val = int(task_id)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    cur = conn.execute(
        """
        INSERT INTO teacher_teaching_pages
            (title, class_name, task_id, topic, source_text, html_content, template_key,
             published, published_at, teacher_username, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
        """,
        (title, class_name or None, task_id_val, topic, source_text or None, html_content, tkey, teacher, now, now),
    )
    conn.commit()
    row = conn.execute(
        _TEACHING_PAGE_SELECT + " WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    conn.close()
    return jsonify({"page": teaching_page_row_to_dict(row, polish=True)}), 201


@app.route("/api/teacher/teaching-pages/<int:page_id>", methods=["GET", "DELETE"])
def teacher_teaching_page_detail(page_id):
    """Phase K3: fetch or delete one teaching page."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""

    row = conn.execute(
        _TEACHING_PAGE_SELECT + " WHERE id = ?",
        (page_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    if str(row["teacher_username"] or "") != teacher:
        conn.close()
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "DELETE":
        conn.execute("DELETE FROM teacher_teaching_pages WHERE id = ?", (page_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    conn.close()
    return jsonify({"page": teaching_page_row_to_dict(row, polish=True)})


@app.route("/api/teacher/teaching-pages/<int:page_id>/view", methods=["GET"])
def teacher_teaching_page_view(page_id):
    """Phase K3: render saved HTML in browser (teacher session required)."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""

    row = conn.execute(
        "SELECT html_content, teacher_username FROM teacher_teaching_pages WHERE id = ?",
        (page_id,),
    ).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    if str(row["teacher_username"] or "") != teacher:
        return jsonify({"error": "Forbidden"}), 403

    return Response(polish_teaching_html(row["html_content"]), mimetype="text/html; charset=utf-8")


@app.route("/api/teacher/teaching-pages/<int:page_id>/publish", methods=["PUT"])
def teacher_teaching_page_publish(page_id):
    """Phase K5: publish or unpublish a teaching page for students."""
    conn = get_db_connection()
    err = require_session_role_if_enabled(conn, "teacher")
    if err is not None:
        conn.close()
        return err

    actor = get_current_authenticated_user(conn)
    teacher = str(actor["username"] or "").strip() if actor else ""

    row = conn.execute(
        _TEACHING_PAGE_SELECT + " WHERE id = ?",
        (page_id,),
    ).fetchone()
    if row is None:
        conn.close()
        return jsonify({"error": "Not found"}), 404
    if str(row["teacher_username"] or "") != teacher:
        conn.close()
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json(silent=True) or {}
    publish = body.get("published")
    if publish is None:
        publish = not bool(row["published"])
    else:
        publish = bool(publish)

    if publish and not str(row["class_name"] or "").strip():
        conn.close()
        return jsonify({"error": "class_name is required to publish for students"}), 400

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    published_at = now if publish else None
    conn.execute(
        """
        UPDATE teacher_teaching_pages
        SET published = ?, published_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (1 if publish else 0, published_at, now, page_id),
    )
    conn.commit()
    updated = conn.execute(
        _TEACHING_PAGE_SELECT + " WHERE id = ?",
        (page_id,),
    ).fetchone()
    conn.close()
    return jsonify({"page": teaching_page_row_to_dict(updated)})


@app.route("/api/student/teaching-pages", methods=["GET"])
def student_teaching_pages_list():
    """Phase K5: list published teaching pages for student's class."""
    class_name = normalize_class_name(request.args.get("class_name"))
    conn = get_db_connection()
    student_username, err_pair = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), class_name
    )
    if err_pair is not None:
        conn.close()
        return err_pair
    if not class_name:
        conn.close()
        return jsonify({"error": "class_name is required"}), 400

    rows = conn.execute(
        """
        SELECT id, title, class_name, topic, template_key, teacher_username, published_at, updated_at
        FROM teacher_teaching_pages
        WHERE published = 1 AND class_name = ?
        ORDER BY datetime(published_at) DESC, id DESC
        """,
        (class_name,),
    ).fetchall()
    conn.close()
    return jsonify({"pages": [teaching_page_public_row(r) for r in rows]})


@app.route("/api/student/teaching-pages/<int:page_id>/view", methods=["GET"])
def student_teaching_page_view(page_id):
    """Phase K5: student view of a published teaching page."""
    class_name = normalize_class_name(request.args.get("class_name"))
    conn = get_db_connection()
    student_username, err_pair = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), class_name
    )
    if err_pair is not None:
        conn.close()
        return err_pair

    row = conn.execute(
        """
        SELECT html_content, class_name, published
        FROM teacher_teaching_pages WHERE id = ?
        """,
        (page_id,),
    ).fetchone()
    conn.close()
    if row is None or not row["published"]:
        return jsonify({"error": "Not found"}), 404
    page_class = normalize_class_name(row["class_name"])
    if class_name and page_class and class_name != page_class:
        return jsonify({"error": "Forbidden"}), 403

    return Response(polish_teaching_html(row["html_content"]), mimetype="text/html; charset=utf-8")


@app.route("/api/student/teaching-pages/<int:page_id>", methods=["GET"])
def student_teaching_page_meta(page_id):
    """Phase K5: published page metadata for student viewer shell."""
    class_name = normalize_class_name(request.args.get("class_name"))
    conn = get_db_connection()
    student_username, err_pair = resolve_student_with_optional_enforcement(
        conn, request.args.get("student_username"), class_name
    )
    if err_pair is not None:
        conn.close()
        return err_pair

    row = conn.execute(
        """
        SELECT id, title, class_name, topic, template_key, teacher_username, published_at, updated_at, published
        FROM teacher_teaching_pages WHERE id = ?
        """,
        (page_id,),
    ).fetchone()
    conn.close()
    if row is None or not row["published"]:
        return jsonify({"error": "Not found"}), 404
    page_class = normalize_class_name(row["class_name"])
    if class_name and page_class and class_name != page_class:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"page": teaching_page_public_row(row)})


# Create database tables when app loads (before first request)
init_database()

from live_teaching import register_live_teaching_routes

register_live_teaching_routes(app)

from classroom_display import register_classroom_display_routes

register_classroom_display_routes(app)

from recorded_lessons import register_recorded_lessons_routes
from task_materials import register_task_materials_routes

register_recorded_lessons_routes(app)

from tencent_vod_routes import register_tencent_vod_routes

register_tencent_vod_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
)

register_task_materials_routes(app)

from lesson_prep import register_lesson_prep_routes

register_lesson_prep_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    upload_dir=UPLOAD_DIR,
    ai_is_configured=ai_is_configured,
    format_ai_error=format_ai_error,
)

from homework_marking import register_homework_marking_routes

register_homework_marking_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    upload_dir=UPLOAD_DIR,
    submissions_dir=SUBMISSIONS_DIR,
    ai_is_configured=ai_is_configured,
    format_ai_error=format_ai_error,
)

from self_study import register_self_study_routes

register_self_study_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from self_study_vocabulary import register_self_study_vocabulary_routes

register_self_study_vocabulary_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from self_study_reading import register_self_study_reading_routes

register_self_study_reading_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from self_study_listening import register_self_study_listening_routes

register_self_study_listening_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from self_study_writing import register_self_study_writing_routes

register_self_study_writing_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from self_study_speaking import register_self_study_speaking_routes

register_self_study_speaking_routes(
    app,
    get_db_connection=get_db_connection,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_current_authenticated_user=get_current_authenticated_user,
    get_effective_student_username=get_effective_student_username,
    normalize_class_name=normalize_class_name,
)

from tencent_audio_routes import register_tencent_audio_routes

register_tencent_audio_routes(
    app,
    require_session_role_if_enabled=require_session_role_if_enabled,
    get_db_connection=get_db_connection,
)

from admin_performance import register_admin_performance_routes

register_admin_performance_routes(
    app,
    get_db_connection=get_db_connection,
    require_admin_session=require_admin_session,
    admin_user_assigned_class_codes=admin_user_assigned_class_codes,
    normalize_class_name=normalize_class_name,
)

from admin_roster_import import register_admin_roster_routes

register_admin_roster_routes(
    app,
    get_db_connection=get_db_connection,
    require_admin_session=require_admin_session,
    normalize_class_name=normalize_class_name,
)

# Start the Flask server
if __name__ == "__main__":
    # Flask is installed in backend/venv, not system Python. Either:
    #   source venv/bin/activate && python app.py
    #   ./venv/bin/python app.py
    # Production: use gunicorn wsgi:app (see README). Plain "python3 app.py" needs venv.
    app.run(host=config.HOST, port=config.PORT, debug=config.FLASK_DEBUG)
