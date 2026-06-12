"""
Manager roster import — upload Word/Excel/PDF/TXT, AI extract, preview, confirm.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from flask import jsonify, request
from werkzeug.security import generate_password_hash

from teaching_page_source_files import extract_text_from_bytes, normalize_extracted_text

ROSTER_ALLOWED_EXTENSIONS = frozenset({"pdf", "doc", "docx", "txt", "xls", "xlsx"})
MAX_ROSTER_FILE_BYTES = 8 * 1024 * 1024
MAX_ROSTER_TEXT_CHARS = 14_000
DEFAULT_IMPORT_PASSWORD = "123456"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_class_code(code: str) -> str:
    return str(code or "").strip().upper()


def _slug_username(base: str, fallback: str) -> str:
    raw = re.sub(r"[^a-zA-Z0-9_]", "", str(base or "").strip().lower())
    if raw:
        return raw[:40]
    return fallback[:40]


def _parse_roster_ai(text: str, role: str) -> dict[str, Any]:
    from eap_ai import ai_is_configured, create_chat_completion, format_ai_error, get_openai_client, parse_ai_json_object

    if not ai_is_configured():
        raise RuntimeError("AI is not configured on the server")

    id_field = "employee_id" if role == "teacher" else "student_id"
    if role == "teacher":
        shape = (
            '{"people":[{"full_name":"","employee_id":"","office_number":"","email":"",'
            '"office_phone":"","mobile_phone":"","username":"","class_codes":["EAP047"],"authorized":false}],'
            '"warnings":[]}'
        )
        field_rules = (
            "employee_id = staff ID number; office_number = office/room number; "
            "office_phone = desk phone; mobile_phone = registered mobile; "
        )
    else:
        shape = (
            '{"people":[{"full_name":"","student_id":"","email":"","mobile_phone":"",'
            '"username":"","class_codes":["EAP047"]}],"warnings":[]}'
        )
        field_rules = (
            "student_id = official student ID number; "
            "email = official school email address; "
            "mobile_phone = registered phone number; "
        )
    system = (
        "You extract structured roster rows from school documents for an EAP platform. "
        f"Return ONLY valid JSON with this shape: {shape}. "
        "Rules: include every person in the document; "
        f"{field_rules}"
        f"{id_field} is required when present in the document; "
        "username is a short login id (often the number or pinyin) when obvious, else empty; "
        "class_codes is a list of class codes like EAP047; "
        "for teachers authorized is true only when the document clearly says approved/active. "
        "Use empty strings for unknown fields, not null."
    )
    user = f"Role: {role}\n\nDocument text:\n{text}"

    client, profile = get_openai_client(None)
    try:
        resp = create_chat_completion(
            client,
            profile,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=4000,
            temperature=0.1,
        )
        raw = resp.choices[0].message.content or ""
        data = parse_ai_json_object(raw)
    except Exception as exc:
        raise RuntimeError(format_ai_error(exc)) from exc

    people = data.get("people") if isinstance(data, dict) else None
    if not isinstance(people, list):
        raise RuntimeError("AI did not return a people list")
    warnings = data.get("warnings") if isinstance(data.get("warnings"), list) else []
    return {"people": people, "warnings": warnings, "ai_used": True}


def _header_map(headers: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for i, h in enumerate(headers):
        key = str(h or "").strip().lower()
        if not key:
            continue
        if any(x in key for x in ("姓名", "name", "名字")):
            mapping["full_name"] = i
        elif any(x in key for x in ("学号", "student id", "student_id", "student no")):
            mapping["student_id"] = i
        elif any(x in key for x in ("工号", "employee", "staff", "职工")):
            mapping["employee_id"] = i
        elif any(x in key for x in ("班级", "class", "module", "eap")):
            mapping["class"] = i
        elif "username" in key or "账号" in key or "登录" in key:
            mapping["username"] = i
        elif any(x in key for x in ("邮箱", "email", "e-mail")):
            mapping["email"] = i
        elif any(x in key for x in ("办公室", "office no", "office number", "办公室号", "办公号")):
            mapping["office_number"] = i
        elif any(x in key for x in ("办公电话", "office phone", "座机", "分机")):
            mapping["office_phone"] = i
        elif any(x in key for x in ("手机", "mobile", "cell", "电话", "phone")) and "office" not in key and "办公" not in key:
            mapping["mobile_phone"] = i
        elif any(x in key for x in ("学校邮箱", "school email", "official email")):
            mapping["email"] = i
    return mapping


def _parse_roster_rule_based(text: str, role: str) -> dict[str, Any]:
    people: list[dict[str, Any]] = []
    warnings: list[str] = []
    id_key = "employee_id" if role == "teacher" else "student_id"

    for block in text.split("[TABLE]"):
        lines = [ln.strip() for ln in block.splitlines() if ln.strip() and not ln.strip().startswith("===")]
        table_rows: list[list[str]] = []
        for line in lines:
            if line.startswith("|") and "|" in line[1:]:
                cells = [c.strip() for c in line.strip("|").split("|")]
                if any(cells):
                    table_rows.append(cells)
        if len(table_rows) < 2:
            continue
        headers = table_rows[0]
        colmap = _header_map(headers)
        if "full_name" not in colmap and len(headers) >= 2:
            colmap = {"full_name": 0, id_key: 1, "class": 2 if len(headers) > 2 else -1}
        for row in table_rows[1:]:
            if len(row) < 2:
                continue
            name_idx = colmap.get("full_name", 0)
            id_idx = colmap.get(id_key, 1)
            full_name = row[name_idx] if name_idx < len(row) else ""
            ext_id = row[id_idx] if id_idx < len(row) else ""
            if not full_name and not ext_id:
                continue
            class_codes: list[str] = []
            cls_idx = colmap.get("class", -1)
            if cls_idx >= 0 and cls_idx < len(row) and row[cls_idx]:
                class_codes = [
                    _normalize_class_code(c)
                    for c in re.split(r"[,;/\s]+", row[cls_idx])
                    if _normalize_class_code(c)
                ]
            uname_idx = colmap.get("username", -1)
            username = row[uname_idx].strip() if uname_idx >= 0 and uname_idx < len(row) else ""
            entry: dict[str, Any] = {
                "full_name": full_name,
                id_key: ext_id,
                "username": username,
                "class_codes": class_codes,
            }
            for field in ("email", "office_number", "office_phone", "mobile_phone"):
                fidx = colmap.get(field, -1)
                if fidx >= 0 and fidx < len(row) and row[fidx]:
                    entry[field] = row[fidx].strip()
            if role == "teacher":
                entry["authorized"] = False
            people.append(entry)

    if not people:
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("==="):
                continue
            parts = re.split(r"[\t,;|]+", line)
            if len(parts) < 2:
                continue
            full_name = parts[0].strip()
            ext_id = parts[1].strip()
            if not full_name or not ext_id:
                continue
            if not re.search(r"[\u4e00-\u9fffA-Za-z]", full_name):
                continue
            entry = {
                "full_name": full_name,
                id_key: ext_id,
                "username": "",
                "class_codes": [],
            }
            if role == "teacher":
                entry["authorized"] = False
            if len(parts) > 2 and parts[2].strip():
                entry["class_codes"] = [_normalize_class_code(parts[2].strip())]
            people.append(entry)

    if not people:
        warnings.append("No rows detected — try AI parse or check column headers (姓名, 学号/工号, 班级).")
    return {"people": people, "warnings": warnings, "ai_used": False}


def _normalize_people(raw_people: list, role: str, default_class: str | None) -> tuple[list[dict], list[str]]:
    id_key = "employee_id" if role == "teacher" else "student_id"
    out: list[dict] = []
    warnings: list[str] = []
    seen: set[str] = set()

    for i, row in enumerate(raw_people):
        if not isinstance(row, dict):
            continue
        full_name = str(row.get("full_name") or "").strip()
        ext_id = str(row.get(id_key) or row.get("id") or "").strip()
        if not full_name and not ext_id:
            warnings.append(f"Row {i + 1}: skipped (no name or ID)")
            continue

        class_codes = row.get("class_codes")
        if not isinstance(class_codes, list):
            class_codes = []
        codes = [_normalize_class_code(c) for c in class_codes if _normalize_class_code(c)]
        if not codes and default_class:
            codes = [_normalize_class_code(default_class)]

        username = str(row.get("username") or "").strip().lower()
        if not username:
            username = _slug_username(ext_id, _slug_username(full_name, f"user{i + 1}"))

        dedupe = f"{username}|{ext_id}"
        if dedupe in seen:
            continue
        seen.add(dedupe)

        entry: dict[str, Any] = {
            "full_name": full_name,
            id_key: ext_id,
            "username": username,
            "class_codes": codes,
            "selected": True,
        }
        if role == "teacher":
            entry["authorized"] = bool(row.get("authorized"))
        for field in ("email", "office_number", "office_phone", "mobile_phone"):
            val = str(row.get(field) or "").strip()
            if val:
                entry[field] = val
        out.append(entry)

    return out, warnings


def _resolve_ext_for_upload(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _extract_roster_text(data: bytes, ext: str) -> str:
    ext = str(ext or "").lower()
    if ext == "doc":
        from teaching_page_source_files import _extract_text_via_office_pdf

        return normalize_extracted_text(_extract_text_via_office_pdf(data, "doc"))
    return normalize_extracted_text(extract_text_from_bytes(data, ext))


def _class_id_for_code(conn, class_code: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM classes WHERE class_code = ?",
        (_normalize_class_code(class_code),),
    ).fetchone()
    return int(row["id"]) if row else None


def _assign_teacher(conn, class_id: int, teacher_user_id: int) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO teacher_classes (class_id, teacher_id, assigned_at)
        VALUES (?, ?, ?)
        """,
        (class_id, teacher_user_id, _now_iso()),
    )


def _assign_student(conn, class_id: int, student_user_id: int) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO class_enrollments (class_id, student_id, enrolled_at)
        VALUES (?, ?, ?)
        """,
        (class_id, student_user_id, _now_iso()),
    )


def _import_people(
    conn,
    role: str,
    rows: list[dict],
    *,
    default_password: str,
    normalize_class_name: Callable,
) -> dict[str, Any]:
    id_key = "employee_id" if role == "teacher" else "student_id"
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []
    pwd_hash = generate_password_hash(default_password or DEFAULT_IMPORT_PASSWORD)

    for row in rows:
        if not row.get("selected", True):
            skipped += 1
            continue
        full_name = str(row.get("full_name") or "").strip()
        ext_id = str(row.get(id_key) or "").strip()
        username = str(row.get("username") or "").strip().lower()
        if not username:
            errors.append(f"{full_name or ext_id}: missing username")
            skipped += 1
            continue

        existing = None
        if ext_id:
            existing = conn.execute(
                f"""
                SELECT id, username FROM users
                WHERE TRIM(COALESCE({id_key}, '')) = ? AND TRIM(COALESCE(role, '')) = ?
                """,
                (ext_id, role),
            ).fetchone()
        if existing is None:
            existing = conn.execute(
                "SELECT id, username FROM users WHERE username = ?",
                (username,),
            ).fetchone()

        user_id: int | None = None
        email = str(row.get("email") or "").strip() or None
        office_number = str(row.get("office_number") or "").strip() or None
        office_phone = str(row.get("office_phone") or "").strip() or None
        mobile_phone = str(row.get("mobile_phone") or "").strip() or None

        if existing:
            user_id = int(existing["id"])
            conn.execute(
                f"""
                UPDATE users SET full_name = ?, {id_key} = ?, class_name = COALESCE(class_name, ?),
                    email = COALESCE(?, email),
                    office_number = COALESCE(?, office_number),
                    office_phone = COALESCE(?, office_phone),
                    mobile_phone = COALESCE(?, mobile_phone)
                WHERE id = ?
                """,
                (
                    full_name or None,
                    ext_id or None,
                    normalize_class_name(row["class_codes"][0]) if row.get("class_codes") else None,
                    email,
                    office_number,
                    office_phone,
                    mobile_phone,
                    user_id,
                ),
            )
            # Authorization is managed on the Teachers tab — roster import never changes it.
            updated += 1
        else:
            clash = conn.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if clash:
                suffix = ext_id[-4:] if ext_id else uuid.uuid4().hex[:4]
                username = f"{username[:32]}_{suffix}"[:40]
            # New teachers stay pending until the manager authorizes them on the Teachers tab.
            is_auth = 0 if role == "teacher" else 1
            cur = conn.execute(
                f"""
                INSERT INTO users (
                    username, password, password_hash, role, full_name, class_name,
                    is_authorized, student_id, employee_id,
                    email, office_number, office_phone, mobile_phone
                )
                VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username,
                    pwd_hash,
                    role,
                    full_name or username,
                    normalize_class_name(row["class_codes"][0]) if row.get("class_codes") else None,
                    is_auth,
                    ext_id if role == "student" else None,
                    ext_id if role == "teacher" else None,
                    email,
                    office_number,
                    office_phone,
                    mobile_phone,
                ),
            )
            user_id = int(cur.lastrowid)
            created += 1

        for code in row.get("class_codes") or []:
            cid = _class_id_for_code(conn, code)
            if cid is None:
                errors.append(f"{full_name or username}: class {code} not found — create it first")
                continue
            if role == "teacher":
                _assign_teacher(conn, cid, user_id)
            else:
                _assign_student(conn, cid, user_id)

    conn.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }


def register_admin_roster_routes(
    app,
    *,
    get_db_connection: Callable,
    require_admin_session: Callable,
    normalize_class_name: Callable,
) -> None:
    @app.route("/api/admin/roster/parse", methods=["POST"])
    def admin_roster_parse():
        conn = get_db_connection()
        guard = require_admin_session(conn)
        if guard is not None:
            conn.close()
            return guard

        role = str(request.form.get("role") or "").strip().lower()
        if role not in ("teacher", "student"):
            conn.close()
            return jsonify({"error": "role must be teacher or student"}), 400

        default_class = _normalize_class_code(request.form.get("default_class") or "") or None
        use_ai = str(request.form.get("use_ai") or "1").strip() not in ("0", "false", "no")

        upload = request.files.get("file")
        if upload is None or not upload.filename:
            conn.close()
            return jsonify({"error": "file is required"}), 400
        ext_check = upload.filename.rsplit(".", 1)[-1].lower() if "." in upload.filename else ""
        if ext_check not in ROSTER_ALLOWED_EXTENSIONS:
            conn.close()
            return (
                jsonify({"error": "File type not allowed. Use Word, Excel, PDF, or TXT."}),
                400,
            )

        data = upload.read()
        if len(data) > MAX_ROSTER_FILE_BYTES:
            conn.close()
            return jsonify({"error": "File too large (max 8 MB)"}), 400

        ext = _resolve_ext_for_upload(upload.filename)
        try:
            raw_text = _extract_roster_text(data, ext)
        except Exception as exc:
            conn.close()
            return jsonify({"error": str(exc)}), 400

        if not raw_text:
            conn.close()
            return jsonify({"error": "No readable text in file"}), 400

        text = raw_text[:MAX_ROSTER_TEXT_CHARS]
        warnings: list[str] = []
        ai_used = False
        raw_people: list = []

        if use_ai:
            try:
                parsed = _parse_roster_ai(text, role)
                raw_people = parsed.get("people") or []
                warnings.extend(parsed.get("warnings") or [])
                ai_used = True
            except Exception as exc:
                warnings.append(f"AI parse failed ({exc}); used table rules instead.")
                parsed = _parse_roster_rule_based(text, role)
                raw_people = parsed.get("people") or []
                warnings.extend(parsed.get("warnings") or [])
        else:
            parsed = _parse_roster_rule_based(text, role)
            raw_people = parsed.get("people") or []
            warnings.extend(parsed.get("warnings") or [])

        people, norm_warnings = _normalize_people(raw_people, role, default_class)
        warnings.extend(norm_warnings)
        conn.close()

        return jsonify(
            {
                "role": role,
                "ai_used": ai_used,
                "filename": upload.filename,
                "text_preview": text[:500] + ("…" if len(text) > 500 else ""),
                "warnings": warnings,
                "people": people,
                "default_password_hint": DEFAULT_IMPORT_PASSWORD,
            }
        )

    @app.route("/api/admin/roster/confirm", methods=["POST"])
    def admin_roster_confirm():
        conn = get_db_connection()
        guard = require_admin_session(conn)
        if guard is not None:
            conn.close()
            return guard

        body = request.get_json(silent=True) or {}
        role = str(body.get("role") or "").strip().lower()
        if role not in ("teacher", "student"):
            conn.close()
            return jsonify({"error": "role must be teacher or student"}), 400

        rows = body.get("people")
        if not isinstance(rows, list) or not rows:
            conn.close()
            return jsonify({"error": "people array is required"}), 400

        default_password = str(body.get("default_password") or DEFAULT_IMPORT_PASSWORD).strip()
        if len(default_password) < 6:
            conn.close()
            return jsonify({"error": "default_password must be at least 6 characters"}), 400

        try:
            result = _import_people(
                conn,
                role,
                rows,
                default_password=default_password,
                normalize_class_name=normalize_class_name,
            )
        except Exception as exc:
            conn.rollback()
            conn.close()
            return jsonify({"error": str(exc)}), 500

        conn.close()
        return jsonify({"result": result})
