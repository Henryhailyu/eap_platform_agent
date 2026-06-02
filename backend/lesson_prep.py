"""
LP-M1 — Writing lesson preparation packs (EAP047 pilot).

Multi-file upload, text extraction, AI structured lesson plan JSON.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from flask import jsonify, request

from teaching_page_source_files import (
    allowed_source_extension,
    delete_stored_file,
    extract_text_from_bytes,
    merge_source_text,
    normalize_extracted_text,
    save_source_file,
)

PILOT_CLASS = "EAP047"
PILOT_CATEGORY = "writing"
DEFAULT_DURATION_MINUTES = 100
MAX_PACK_FILES = 12
MAX_PACK_FILE_BYTES = 10 * 1024 * 1024
MAX_MATERIALS_FOR_AI = 14_000

TEACHING_STYLES = frozenset(
    {
        "interactive",
        "lecture_led",
        "exam_drill",
        "flipped",
        "support_bilingual",
        "student_centered",
    }
)

DURATION_PRESETS = (45, 60, 90, 100)

WRITING_PLAN_SYSTEM_PROMPT = (
    "You are an expert EAP Writing instructor planning a timed class. "
    "Output valid JSON only (no markdown). Use British or international academic English.\n\n"
    "Required JSON keys:\n"
    '- "title": string (lesson title)\n'
    '- "objectives": array of 3–6 strings (measurable learning objectives)\n'
    '- "segments": array of objects, each with:\n'
    '    "title", "minutes" (integer), "teacher_action", "student_action", '
    '    "materials_ref" (optional string referencing uploaded materials)\n'
    '  Segments must sum to the requested class duration in minutes.\n'
    "- When multiple pack files are provided, integrate content from ALL of them (not just one).\n"
    '- "homework_sketch": string (brief follow-up homework idea)\n'
    '- "interaction_slots": array of objects with:\n'
    '    "segment_title", "segment_index" (0-based), "activity_type" (poll|quiz|game|discussion),\n'
    '    "live_tool" (poll|quiz|game), "live_game" (quiz-battle|board-race|matching-race|vocab-bingo|treasure-hunt),\n'
    '    "description", "question_sketch", "options" (array of 2–4 option strings)\n'
    '- "notes_for_teacher": string (2–4 sentences: pacing, differentiation, common errors)\n'
)

WRITING_HTML_FROM_PLAN_EXTRA = (
    "\nYou are converting an APPROVED lesson plan JSON into one HTML document.\n"
    "- Follow the plan segments in order; use <h2> per segment with minutes in subtitle.\n"
    "- Build live poll/quiz/game blocks from interaction_slots (use question_sketch + options).\n"
    "- Each live block MUST include data-eap-live-segment=\"N\" (segment_index from plan).\n"
    "- Match segment_title in a visible heading before each live block.\n"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def migrate_lesson_prep_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS lesson_prep_packs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_username TEXT NOT NULL,
            class_name TEXT NOT NULL,
            title TEXT NOT NULL,
            lesson_date TEXT,
            duration_minutes INTEGER NOT NULL DEFAULT 100,
            teaching_style TEXT NOT NULL DEFAULT 'interactive',
            category TEXT NOT NULL DEFAULT 'writing',
            objectives TEXT,
            ielts_band_target TEXT,
            plan_json TEXT,
            plan_status TEXT NOT NULL DEFAULT 'draft',
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    rows = conn.execute("PRAGMA table_info(lesson_prep_packs)").fetchall()
    col_names = {r[1] for r in rows} if rows else set()
    if "teaching_page_id" not in col_names:
        conn.execute("ALTER TABLE lesson_prep_packs ADD COLUMN teaching_page_id INTEGER")
    if "calendar_task_id" not in col_names:
        conn.execute("ALTER TABLE lesson_prep_packs ADD COLUMN calendar_task_id INTEGER")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS lesson_prep_pack_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_id INTEGER NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            use_in_ai INTEGER NOT NULL DEFAULT 1,
            extract_status TEXT NOT NULL DEFAULT 'pending',
            extract_error TEXT,
            extracted_text TEXT NOT NULL DEFAULT '',
            char_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (pack_id) REFERENCES lesson_prep_packs(id) ON DELETE CASCADE
        )
        """
    )


def normalize_teaching_style(value: str | None) -> str:
    raw = str(value or "interactive").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "lecture": "lecture_led",
        "lecture-led": "lecture_led",
        "exam": "exam_drill",
        "flipped_classroom": "flipped",
        "support_heavy": "support_bilingual",
        "support-heavy": "support_bilingual",
        "bilingual": "support_bilingual",
        "student_centered": "student_centered",
        "student-centered": "student_centered",
    }
    raw = aliases.get(raw, raw)
    if raw not in TEACHING_STYLES:
        return "interactive"
    return raw


def pack_row_to_dict(row, *, include_plan: bool = False) -> dict[str, Any]:
    plan = None
    if include_plan and row["plan_json"]:
        try:
            plan = json.loads(row["plan_json"])
        except json.JSONDecodeError:
            plan = None
    return {
        "id": row["id"],
        "teacher_username": row["teacher_username"],
        "class_name": row["class_name"],
        "title": row["title"],
        "lesson_date": row["lesson_date"] or "",
        "duration_minutes": row["duration_minutes"],
        "teaching_style": row["teaching_style"],
        "category": row["category"],
        "objectives": row["objectives"] or "",
        "ielts_band_target": row["ielts_band_target"] or "",
        "plan_status": row["plan_status"],
        "status": row["status"],
        "has_plan": bool(row["plan_json"]),
        "plan": plan if include_plan else None,
        "teaching_page_id": row["teaching_page_id"] if "teaching_page_id" in row.keys() else None,
        "calendar_task_id": row["calendar_task_id"] if "calendar_task_id" in row.keys() else None,
        "has_html": bool(row["teaching_page_id"]) if "teaching_page_id" in row.keys() else False,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def file_row_to_dict(row, *, include_text: bool = False) -> dict[str, Any]:
    text = row["extracted_text"] or ""
    payload: dict[str, Any] = {
        "id": row["id"],
        "pack_id": row["pack_id"],
        "original_name": row["original_name"],
        "use_in_ai": bool(row["use_in_ai"]),
        "extract_status": row["extract_status"],
        "extract_error": row["extract_error"] or "",
        "char_count": row["char_count"] or len(text),
        "created_at": row["created_at"],
    }
    if include_text:
        payload["extracted_text"] = text
    return payload


def lesson_prep_upload_dir(base_upload_dir: str, pack_id: int) -> str:
    path = os.path.join(base_upload_dir, "teaching-sources", "lesson-prep", str(pack_id))
    os.makedirs(path, exist_ok=True)
    return path


def fetch_pack(conn, pack_id: int, teacher: str):
    return conn.execute(
        "SELECT * FROM lesson_prep_packs WHERE id = ? AND teacher_username = ?",
        (pack_id, teacher),
    ).fetchone()


def assert_pilot_class(class_name: str) -> str | None:
    name = str(class_name or "").strip()
    if name.upper() != PILOT_CLASS:
        return f"Pilot supports class {PILOT_CLASS} only"
    return None


def collect_pack_file_manifest(conn, pack_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, original_name, extract_status, char_count, use_in_ai
        FROM lesson_prep_pack_files
        WHERE pack_id = ?
        ORDER BY id ASC
        """,
        (pack_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "original_name": row["original_name"],
            "extract_status": row["extract_status"],
            "char_count": row["char_count"] or 0,
            "use_in_ai": bool(row["use_in_ai"]),
        }
        for row in rows
    ]


def collect_materials_text(conn, pack_id: int) -> str:
    rows = conn.execute(
        """
        SELECT original_name, extracted_text FROM lesson_prep_pack_files
        WHERE pack_id = ? AND use_in_ai = 1 AND extract_status = 'ok'
        ORDER BY id ASC
        """,
        (pack_id,),
    ).fetchall()
    blocks = []
    for row in rows:
        text = (row["extracted_text"] or "").strip()
        if not text:
            continue
        name = (row["original_name"] or "material").strip()
        blocks.append(f"=== File: {name} ===\n{text}")
    return merge_source_text("", blocks, MAX_MATERIALS_FOR_AI)


def build_plan_user_prompt(
    pack: dict, materials: str, *, file_manifest: list[dict[str, Any]] | None = None
) -> str:
    style = pack.get("teaching_style") or "interactive"
    style_labels = {
        "interactive": "Interactive (pair/group tasks, discussion)",
        "lecture_led": "Lecture-led (teacher exposition with short checks)",
        "exam_drill": "Exam drill (timed practice, exam criteria)",
        "flipped": "Flipped (pre-class prep assumed; class = workshop)",
        "support_bilingual": "Support-heavy (bilingual hints where helpful)",
        "student_centered": "Student-centered (student-led segments)",
    }
    lines = [
        f"Class: {pack.get('class_name')}",
        f"Lesson title: {pack.get('title')}",
        f"Duration: {pack.get('duration_minutes')} minutes (segments must sum to this).",
        f"Teaching style: {style_labels.get(style, style)}",
        f"Category: Writing (EAP)",
    ]
    if pack.get("lesson_date"):
        lines.append(f"Lesson date: {pack['lesson_date']}")
    if pack.get("objectives"):
        lines.append(f"Teacher objectives (input): {pack['objectives']}")
    if pack.get("ielts_band_target"):
        lines.append(f"IELTS / level target: {pack['ielts_band_target']}")
    manifest = file_manifest or []
    if manifest:
        lines.append(
            "\nUploaded pack files (use ALL listed files together when planning; "
            "synthesise across readings — do not pick only one file):"
        )
        for i, f in enumerate(manifest, 1):
            flag = "included in AI" if f.get("use_in_ai") and f.get("extract_status") == "ok" else "not used"
            lines.append(
                f"  {i}. {f.get('original_name')} — {f.get('extract_status')} "
                f"({f.get('char_count', 0)} chars) [{flag}]"
            )
    if materials:
        lines.append("\n--- UPLOADED MATERIALS (excerpts, all files) ---\n" + materials)
    else:
        lines.append("\n(No extracted text from pack files — plan from title and objectives only.)")
    return "\n".join(lines)


def inject_lesson_meta_script(html: str, plan: dict, pack: dict) -> str:
    """Embed plan segments for LT-M2 Live Teaching segment filter."""
    meta = {
        "title": plan.get("title") or pack.get("title"),
        "segments": plan.get("segments") or [],
        "interaction_slots": plan.get("interaction_slots") or [],
    }
    snippet = (
        f'<script type="application/json" id="eap-lesson-meta">'
        f"{json.dumps(meta, ensure_ascii=False)}</script>"
    )
    text = str(html or "")
    lower = text.lower()
    if "</body>" in lower:
        idx = lower.rindex("</body>")
        return text[:idx] + snippet + text[idx:]
    return text + snippet


def build_html_from_plan_prompt(pack: dict, plan: dict, materials: str) -> str:
    return (
        f"Approved lesson plan JSON:\n{json.dumps(plan, ensure_ascii=False, indent=2)}\n\n"
        f"Pack title: {pack.get('title')}\n"
        f"Class: {pack.get('class_name')} · Duration: {pack.get('duration_minutes')} min · "
        f"Style: {pack.get('teaching_style')}\n"
        f"Teacher objectives: {pack.get('objectives') or '(none)'}\n"
        f"IELTS target: {pack.get('ielts_band_target') or '(none)'}\n"
        + (f"\nMaterial excerpts:\n{materials}\n" if materials else "")
        + "\nGenerate the full HTML lesson now. Use interaction_slots for live poll/quiz/game blocks."
    )


def generate_writing_lesson_html(pack: dict, plan: dict, materials: str, system_prompt: str) -> dict[str, Any]:
    from eap_ai import generate_teaching_page_html

    topic = str(plan.get("title") or pack.get("title") or "Writing lesson").strip()
    combined_prompt = (system_prompt or "").strip() + WRITING_HTML_FROM_PLAN_EXTRA
    result = generate_teaching_page_html(
        topic,
        source_text=build_html_from_plan_prompt(pack, plan, materials),
        level="intermediate",
        lang="en",
        custom_instructions="",
        system_prompt=combined_prompt,
    )
    html = inject_lesson_meta_script(result.get("html") or "", plan, pack)
    result["html"] = html
    return result


def generate_writing_lesson_plan(
    pack: dict, materials: str, *, file_manifest: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    from eap_ai import create_chat_completion, get_openai_client

    client, profile = get_openai_client()
    user_prompt = build_plan_user_prompt(pack, materials, file_manifest=file_manifest)
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": WRITING_PLAN_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2800,
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    try:
        plan = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI returned invalid JSON") from exc
    if not isinstance(plan.get("segments"), list) or not plan["segments"]:
        raise RuntimeError("AI plan missing segments")
    return {
        "plan": plan,
        "provider": profile["id"],
        "model": profile["model"],
    }


def _load_plan_row(row) -> dict | None:
    if not row or not row["plan_json"]:
        return None
    try:
        plan = json.loads(row["plan_json"])
    except json.JSONDecodeError:
        return None
    return plan if isinstance(plan, dict) else None


def register_lesson_prep_routes(app, *, get_db_connection, require_session_role_if_enabled, get_current_authenticated_user, upload_dir: str, ai_is_configured, format_ai_error):
    """Register /api/teacher/lesson-prep/* routes on the Flask app."""

    def _teacher_conn():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "teacher")
        if err is not None:
            conn.close()
            return None, err
        actor = get_current_authenticated_user(conn)
        teacher = str(actor["username"] or "").strip() if actor else ""
        if not teacher:
            conn.close()
            return None, (jsonify({"error": "Unauthorized"}), 401)
        return (conn, teacher), None

    @app.route("/api/teacher/lesson-prep/meta", methods=["GET"])
    def lesson_prep_meta():
        """Pilot constants for the teacher wizard."""
        pair, err = _teacher_conn()
        if err:
            return err
        conn, _teacher = pair
        conn.close()
        return jsonify(
            {
                "pilot_class": PILOT_CLASS,
                "category": PILOT_CATEGORY,
                "default_duration_minutes": DEFAULT_DURATION_MINUTES,
                "duration_presets": list(DURATION_PRESETS),
                "teaching_styles": sorted(TEACHING_STYLES),
            }
        )

    @app.route("/api/teacher/lesson-prep/packs", methods=["GET", "POST"])
    def lesson_prep_packs_collection():
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair

        if request.method == "GET":
            rows = conn.execute(
                """
                SELECT * FROM lesson_prep_packs
                WHERE teacher_username = ?
                ORDER BY datetime(updated_at) DESC, id DESC
                """,
                (teacher,),
            ).fetchall()
            conn.close()
            return jsonify({"packs": [pack_row_to_dict(r) for r in rows]})

        data = request.get_json(silent=True) or {}
        class_name = str(data.get("class_name") or PILOT_CLASS).strip()
        pilot_err = assert_pilot_class(class_name)
        if pilot_err:
            conn.close()
            return jsonify({"error": pilot_err}), 400

        title = str(data.get("title") or "").strip()
        if not title:
            conn.close()
            return jsonify({"error": "title is required"}), 400

        duration = int(data.get("duration_minutes") or DEFAULT_DURATION_MINUTES)
        if duration not in DURATION_PRESETS:
            duration = DEFAULT_DURATION_MINUTES

        style = normalize_teaching_style(data.get("teaching_style"))
        now = _now_iso()
        cur = conn.execute(
            """
            INSERT INTO lesson_prep_packs
                (teacher_username, class_name, title, lesson_date, duration_minutes,
                 teaching_style, category, objectives, ielts_band_target,
                 plan_status, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'draft', ?, ?)
            """,
            (
                teacher,
                class_name,
                title[:200],
                str(data.get("lesson_date") or "").strip()[:32] or None,
                duration,
                style,
                PILOT_CATEGORY,
                str(data.get("objectives") or "").strip()[:4000] or None,
                str(data.get("ielts_band_target") or "").strip()[:64] or None,
                now,
                now,
            ),
        )
        conn.commit()
        pack_id = cur.lastrowid
        row = fetch_pack(conn, pack_id, teacher)
        conn.close()
        return jsonify({"pack": pack_row_to_dict(row)}), 201

    @app.route("/api/teacher/lesson-prep/packs/<int:pack_id>", methods=["GET", "PUT"])
    def lesson_prep_pack_detail(pack_id: int):
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        if request.method == "GET":
            files = conn.execute(
                "SELECT * FROM lesson_prep_pack_files WHERE pack_id = ? ORDER BY id ASC",
                (pack_id,),
            ).fetchall()
            conn.close()
            payload = pack_row_to_dict(row, include_plan=True)
            payload["files"] = [file_row_to_dict(f) for f in files]
            return jsonify({"pack": payload})

        data = request.get_json(silent=True) or {}
        title = str(data.get("title") or row["title"]).strip()
        if not title:
            conn.close()
            return jsonify({"error": "title is required"}), 400

        duration = int(data.get("duration_minutes") or row["duration_minutes"])
        if duration not in DURATION_PRESETS:
            duration = row["duration_minutes"]

        style = normalize_teaching_style(data.get("teaching_style") or row["teaching_style"])
        plan_json = row["plan_json"]
        plan_status = row["plan_status"]
        if "plan" in data and data["plan"] is not None:
            plan_json = json.dumps(data["plan"], ensure_ascii=False)
            plan_status = str(data.get("plan_status") or "approved").strip() or "approved"

        now = _now_iso()
        conn.execute(
            """
            UPDATE lesson_prep_packs SET
                title = ?, lesson_date = ?, duration_minutes = ?, teaching_style = ?,
                objectives = ?, ielts_band_target = ?, plan_json = ?, plan_status = ?,
                updated_at = ?
            WHERE id = ? AND teacher_username = ?
            """,
            (
                title[:200],
                str(data.get("lesson_date") or row["lesson_date"] or "").strip()[:32] or None,
                duration,
                style,
                str(data.get("objectives") or row["objectives"] or "").strip()[:4000] or None,
                str(data.get("ielts_band_target") or row["ielts_band_target"] or "").strip()[:64] or None,
                plan_json,
                plan_status,
                now,
                pack_id,
                teacher,
            ),
        )
        conn.commit()
        row = fetch_pack(conn, pack_id, teacher)
        conn.close()
        return jsonify({"pack": pack_row_to_dict(row, include_plan=True)})

    @app.route("/api/teacher/lesson-prep/packs/<int:pack_id>/files", methods=["POST"])
    def lesson_prep_pack_files_upload(pack_id: int):
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        count = conn.execute(
            "SELECT COUNT(*) AS n FROM lesson_prep_pack_files WHERE pack_id = ?",
            (pack_id,),
        ).fetchone()["n"]
        uploads = [f for f in request.files.getlist("file") if f and f.filename]
        if not uploads:
            single = request.files.get("file")
            if single and single.filename:
                uploads = [single]
        if not uploads:
            conn.close()
            return jsonify({"error": "No file provided (field name: file)"}), 400
        if count + len(uploads) > MAX_PACK_FILES:
            conn.close()
            return jsonify({"error": f"Maximum {MAX_PACK_FILES} files per pack"}), 400

        use_in_ai = request.form.get("use_in_ai", "1") not in ("0", "false", "no")
        upload_dir_path = lesson_prep_upload_dir(upload_dir, pack_id)
        created = []
        now = _now_iso()

        for up in uploads:
            name = os.path.basename(str(up.filename or "").strip())
            if not name or not allowed_source_extension(name):
                conn.close()
                return jsonify({"error": f"Unsupported or missing filename: {name!r}"}), 400
            ext = name.rsplit(".", 1)[-1].lower()
            data_bytes = up.read()
            if len(data_bytes) > MAX_PACK_FILE_BYTES:
                conn.close()
                return jsonify({"error": f"File too large (max {MAX_PACK_FILE_BYTES // (1024*1024)} MB)"}), 400
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

            stored_name, _dest = save_source_file(upload_dir_path, name, data_bytes)
            cur = conn.execute(
                """
                INSERT INTO lesson_prep_pack_files
                    (pack_id, original_name, stored_name, use_in_ai, extract_status,
                     extract_error, extracted_text, char_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pack_id,
                    name[:512],
                    stored_name,
                    1 if use_in_ai else 0,
                    extract_status,
                    extract_error,
                    extracted,
                    len(extracted),
                    now,
                ),
            )
            file_row = conn.execute(
                "SELECT * FROM lesson_prep_pack_files WHERE id = ?",
                (cur.lastrowid,),
            ).fetchone()
            created.append(file_row_to_dict(file_row))

        conn.execute(
            "UPDATE lesson_prep_packs SET updated_at = ? WHERE id = ?",
            (now, pack_id),
        )
        conn.commit()
        conn.close()
        return jsonify({"files": created}), 201

    @app.route(
        "/api/teacher/lesson-prep/packs/<int:pack_id>/files/<int:file_id>",
        methods=["DELETE"],
    )
    def lesson_prep_pack_file_delete(pack_id: int, file_id: int):
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        file_row = conn.execute(
            "SELECT * FROM lesson_prep_pack_files WHERE id = ? AND pack_id = ?",
            (file_id, pack_id),
        ).fetchone()
        if file_row is None:
            conn.close()
            return jsonify({"error": "File not found"}), 404

        upload_dir_path = lesson_prep_upload_dir(upload_dir, pack_id)
        delete_stored_file(upload_dir_path, file_row["stored_name"])
        conn.execute(
            "DELETE FROM lesson_prep_pack_files WHERE id = ? AND pack_id = ?",
            (file_id, pack_id),
        )
        now = _now_iso()
        conn.execute(
            "UPDATE lesson_prep_packs SET updated_at = ? WHERE id = ?",
            (now, pack_id),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "deleted_id": file_id})

    @app.route("/api/teacher/lesson-prep/packs/<int:pack_id>/plan", methods=["POST"])
    def lesson_prep_pack_generate_plan(pack_id: int):
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        if not ai_is_configured or not ai_is_configured():
            conn.close()
            return jsonify({"error": "AI is not configured on this server"}), 503

        materials = collect_materials_text(conn, pack_id)
        file_manifest = collect_pack_file_manifest(conn, pack_id)
        pack_dict = pack_row_to_dict(row)
        try:
            result = generate_writing_lesson_plan(
                pack_dict, materials, file_manifest=file_manifest
            )
        except Exception as exc:
            conn.close()
            detail = format_ai_error(exc) if format_ai_error else str(exc)
            return jsonify({"error": "AI plan generation failed", "detail": detail[:300]}), 502

        plan = result["plan"]
        now = _now_iso()
        conn.execute(
            """
            UPDATE lesson_prep_packs SET
                plan_json = ?, plan_status = 'planned', status = 'plan_ready',
                updated_at = ?
            WHERE id = ? AND teacher_username = ?
            """,
            (json.dumps(plan, ensure_ascii=False), now, pack_id, teacher),
        )
        conn.commit()
        row = fetch_pack(conn, pack_id, teacher)
        conn.close()
        return jsonify(
            {
                "pack": pack_row_to_dict(row, include_plan=True),
                "ai": {"provider": result["provider"], "model": result["model"]},
            }
        )

    @app.route("/api/teacher/lesson-prep/packs/<int:pack_id>/html", methods=["POST"])
    def lesson_prep_pack_generate_html(pack_id: int):
        """LP-M2: generate HTML from approved plan → save teaching page."""
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        plan = _load_plan_row(row)
        if not plan:
            conn.close()
            return jsonify({"error": "Generate and approve a lesson plan first"}), 400
        if row["plan_status"] not in ("approved", "planned"):
            conn.close()
            return jsonify({"error": "Plan must be approved before HTML generation"}), 400

        if not ai_is_configured or not ai_is_configured():
            conn.close()
            return jsonify({"error": "AI is not configured on this server"}), 503

        from teaching_page_templates import get_prompt as get_teaching_template_prompt
        from teaching_page_templates import normalize_template_key
        from teacher_teaching_pages import polish_teaching_html

        pack_dict = pack_row_to_dict(row, include_plan=True)
        materials = collect_materials_text(conn, pack_id)
        tkey = normalize_template_key("standard")
        prompt_row = get_teaching_template_prompt(conn, tkey)
        try:
            result = generate_writing_lesson_html(
                pack_dict,
                plan,
                materials,
                prompt_row["system_prompt"],
            )
        except Exception as exc:
            conn.close()
            detail = format_ai_error(exc) if format_ai_error else str(exc)
            return jsonify({"error": "AI HTML generation failed", "detail": detail[:300]}), 502

        html_content = polish_teaching_html(result.get("html") or "")
        if not html_content:
            conn.close()
            return jsonify({"error": "AI returned empty HTML"}), 502

        title = str(plan.get("title") or pack_dict["title"])[:200]
        class_name = pack_dict["class_name"]
        now = _now_iso()
        page_id = row["teaching_page_id"] if "teaching_page_id" in row.keys() else None

        if page_id:
            conn.execute(
                """
                UPDATE teacher_teaching_pages SET
                    title = ?, class_name = ?, topic = ?, html_content = ?,
                    template_key = ?, updated_at = ?
                WHERE id = ? AND teacher_username = ?
                """,
                (title, class_name, title, html_content, tkey, now, page_id, teacher),
            )
        else:
            cur = conn.execute(
                """
                INSERT INTO teacher_teaching_pages
                    (title, class_name, task_id, topic, source_text, html_content, template_key,
                     published, published_at, teacher_username, created_at, updated_at)
                VALUES (?, ?, NULL, ?, NULL, ?, ?, 0, NULL, ?, ?, ?)
                """,
                (title, class_name, title, html_content, tkey, teacher, now, now),
            )
            page_id = cur.lastrowid

        conn.execute(
            """
            UPDATE lesson_prep_packs SET
                teaching_page_id = ?, plan_status = 'approved', status = 'html_ready', updated_at = ?
            WHERE id = ? AND teacher_username = ?
            """,
            (page_id, now, pack_id, teacher),
        )
        conn.commit()
        page_row = conn.execute(
            "SELECT id, title, class_name, published, published_at FROM teacher_teaching_pages WHERE id = ?",
            (page_id,),
        ).fetchone()
        row = fetch_pack(conn, pack_id, teacher)
        conn.close()
        return jsonify(
            {
                "pack": pack_row_to_dict(row, include_plan=True),
                "page": {
                    "id": page_row["id"],
                    "title": page_row["title"],
                    "class_name": page_row["class_name"],
                    "published": bool(page_row["published"]),
                    "view_path": f"/api/teacher/teaching-pages/{page_row['id']}/view",
                },
                "html": html_content,
                "ai": {"provider": result.get("provider"), "model": result.get("model")},
            }
        )

    @app.route("/api/teacher/lesson-prep/packs/<int:pack_id>/publish", methods=["POST"])
    def lesson_prep_pack_publish(pack_id: int):
        """LP-M2: calendar task + publish teaching page for students."""
        pair, err = _teacher_conn()
        if err:
            return err
        conn, teacher = pair
        row = fetch_pack(conn, pack_id, teacher)
        if row is None:
            conn.close()
            return jsonify({"error": "Not found"}), 404

        page_id = row["teaching_page_id"] if "teaching_page_id" in row.keys() else None
        if not page_id:
            conn.close()
            return jsonify({"error": "Generate HTML before publishing"}), 400

        page = conn.execute(
            "SELECT * FROM teacher_teaching_pages WHERE id = ? AND teacher_username = ?",
            (page_id, teacher),
        ).fetchone()
        if page is None:
            conn.close()
            return jsonify({"error": "Teaching page not found"}), 404

        data = request.get_json(silent=True) or {}
        lesson_date = str(data.get("lesson_date") or row["lesson_date"] or "").strip()[:10]
        if not lesson_date:
            conn.close()
            return jsonify({"error": "lesson_date is required (YYYY-MM-DD)"}), 400

        class_name = str(row["class_name"] or PILOT_CLASS).strip()
        task_id = row["calendar_task_id"] if "calendar_task_id" in row.keys() else None
        now = _now_iso()

        if not task_id:
            plan = _load_plan_row(row)
            desc_parts = []
            if plan and plan.get("objectives"):
                objs = plan["objectives"]
                if isinstance(objs, list):
                    desc_parts.append("Objectives: " + "; ".join(str(x) for x in objs[:4]))
            desc_parts.append(f"Interactive lesson page (pack #{pack_id}).")
            description = " ".join(desc_parts)[:2000]
            cur = conn.execute(
                """
                INSERT INTO calendar_tasks
                    (date, title, title_zh, category, period, description, description_zh, status, class_name)
                VALUES (?, ?, NULL, ?, '', ?, NULL, 'Pending', ?)
                """,
                (lesson_date, page["title"], "Writing", description, class_name),
            )
            task_id = cur.lastrowid

        conn.execute(
            """
            UPDATE teacher_teaching_pages SET
                class_name = ?, task_id = ?, published = 1, published_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (class_name, task_id, now, now, page_id),
        )
        conn.execute(
            """
            UPDATE lesson_prep_packs SET
                lesson_date = ?, calendar_task_id = ?, status = 'published', updated_at = ?
            WHERE id = ? AND teacher_username = ?
            """,
            (lesson_date, task_id, now, pack_id, teacher),
        )
        conn.commit()
        task = conn.execute("SELECT * FROM calendar_tasks WHERE id = ?", (task_id,)).fetchone()
        row = fetch_pack(conn, pack_id, teacher)
        conn.close()
        return jsonify(
            {
                "pack": pack_row_to_dict(row, include_plan=True),
                "task": {
                    "id": task["id"],
                    "date": task["date"],
                    "title": task["title"],
                    "category": task["category"],
                    "class_name": task["class_name"],
                },
                "page": {"id": page_id, "published": True},
            }
        )
