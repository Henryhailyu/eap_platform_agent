"""
Confirmed class vocabulary for Live Teaching vocab games (bingo, matching, memory).
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

_MIN_TERM_LEN = 3
_MAX_TERM_LEN = 64
_MAX_DEF_LEN = 200
_MIN_DEF_LEN = 6
_MIN_GAME_TERMS = 6


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _clean_line(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _is_valid_term_pair(term: str, def_en: str) -> bool:
    try:
        from eap_ai import _is_valid_game_vocab_term

        return bool(_is_valid_game_vocab_term(term, def_en))
    except ImportError:
        t0 = _clean_line(term)
        d0 = _clean_line(def_en)
        if not t0 or not d0:
            return False
        if len(t0) < _MIN_TERM_LEN or len(t0) > _MAX_TERM_LEN:
            return False
        if len(d0) < _MIN_DEF_LEN or len(d0) > _MAX_DEF_LEN:
            return False
        if not re.match(r"^[a-zA-Z][a-zA-Z\s'\-]*$", t0):
            return False
        return True


def normalize_vocab_list(items: list[Any] | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        term = _clean_line(str(raw.get("term") or raw.get("word") or ""))
        def_en = _clean_line(
            str(raw.get("defEn") or raw.get("definition") or raw.get("def") or "")
        )
        if not _is_valid_term_pair(term, def_en):
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"term": term, "defEn": def_en, "defZh": def_en})
    return out


def parse_pasted_vocabulary(text: str) -> list[dict[str, str]]:
    """Parse teacher paste: one term per line, separated by — - : or tab."""
    pairs: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw_line in str(text or "").splitlines():
        line = _clean_line(raw_line)
        if not line:
            continue
        line = re.sub(r"^\d+[.)]\s*", "", line)
        term = ""
        def_en = ""
        if "\t" in line:
            parts = line.split("\t", 1)
            term, def_en = parts[0], parts[1] if len(parts) > 1 else ""
        else:
            for sep in (" — ", " – ", " - ", ": ", "："):
                if sep in line:
                    left, right = line.split(sep, 1)
                    term, def_en = left, right
                    break
            if not term:
                term = line
                def_en = f"{line[0].upper()}{line[1:]} — key vocabulary for this class"
        term = _clean_line(term)
        def_en = _clean_line(def_en)
        if not _is_valid_term_pair(term, def_en):
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        pairs.append({"term": term, "defEn": def_en, "defZh": def_en})
    return pairs


def vocab_json_load(raw: str | None) -> list[dict[str, str]]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return normalize_vocab_list(data)
    if isinstance(data, dict):
        inner = data.get("terms") or data.get("vocabulary")
        if isinstance(inner, list):
            return normalize_vocab_list(inner)
    return []


def vocab_json_dump(terms: list[dict[str, str]]) -> str:
    return json.dumps(normalize_vocab_list(terms), ensure_ascii=False)


def pad_vocab_terms(terms: list[dict[str, str]], target: int = 24) -> list[dict[str, str]]:
    base = normalize_vocab_list(terms)
    if not base:
        return []
    out: list[dict[str, str]] = []
    for i in range(max(1, target)):
        src = base[i % len(base)]
        out.append(
            {
                "term": src["term"],
                "defEn": src["defEn"],
                "defZh": src.get("defZh") or src["defEn"],
            }
        )
    return out[:target]


def suggest_vocab_from_html(html: str) -> list[dict[str, str]]:
    try:
        from eap_ai import extract_live_vocab_from_html

        result = extract_live_vocab_from_html(html)
        return normalize_vocab_list((result or {}).get("terms") or [])
    except Exception:
        return []


def init_lesson_vocabulary_tables(conn) -> None:
    rows = conn.execute("PRAGMA table_info(teacher_teaching_pages)").fetchall()
    column_names = {r[1] for r in rows}
    if "lesson_vocabulary_json" not in column_names:
        conn.execute("ALTER TABLE teacher_teaching_pages ADD COLUMN lesson_vocabulary_json TEXT")
    if "lesson_vocabulary_draft_json" not in column_names:
        conn.execute("ALTER TABLE teacher_teaching_pages ADD COLUMN lesson_vocabulary_draft_json TEXT")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS live_class_vocabulary (
            teacher_username TEXT NOT NULL,
            class_name TEXT NOT NULL,
            vocabulary_json TEXT NOT NULL,
            source_page_id INTEGER,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (teacher_username, class_name)
        )
        """
    )


def clear_page_vocabulary(conn, page_id: int, teacher: str) -> None:
    now = _now_iso()
    conn.execute(
        """
        UPDATE teacher_teaching_pages
        SET lesson_vocabulary_json = NULL, updated_at = ?
        WHERE id = ? AND teacher_username = ?
        """,
        (now, page_id, teacher),
    )


def clear_class_vocabulary(conn, teacher: str, class_name: str) -> None:
    conn.execute(
        """
        DELETE FROM live_class_vocabulary
        WHERE teacher_username = ? AND class_name = ?
        """,
        (teacher, class_name),
    )


def get_page_vocabulary(conn, page_id: int, teacher: str) -> list[dict[str, str]]:
    row = conn.execute(
        """
        SELECT lesson_vocabulary_json FROM teacher_teaching_pages
        WHERE id = ? AND teacher_username = ?
        """,
        (page_id, teacher),
    ).fetchone()
    if not row:
        return []
    return vocab_json_load(row["lesson_vocabulary_json"])


def get_page_vocabulary_draft(conn, page_id: int, teacher: str) -> list[dict[str, str]]:
    row = conn.execute(
        """
        SELECT lesson_vocabulary_draft_json FROM teacher_teaching_pages
        WHERE id = ? AND teacher_username = ?
        """,
        (page_id, teacher),
    ).fetchone()
    if not row:
        return []
    return vocab_json_load(row["lesson_vocabulary_draft_json"])


def save_page_vocabulary(
    conn,
    page_id: int,
    teacher: str,
    terms: list[dict[str, str]],
) -> list[dict[str, str]]:
    normalized = normalize_vocab_list(terms)
    now = _now_iso()
    conn.execute(
        """
        UPDATE teacher_teaching_pages
        SET lesson_vocabulary_json = ?, updated_at = ?
        WHERE id = ? AND teacher_username = ?
        """,
        (vocab_json_dump(normalized), now, page_id, teacher),
    )
    return normalized


def save_page_vocabulary_draft(
    conn,
    page_id: int,
    teacher: str,
    terms: list[dict[str, str]],
) -> list[dict[str, str]]:
    normalized = normalize_vocab_list(terms)
    now = _now_iso()
    conn.execute(
        """
        UPDATE teacher_teaching_pages
        SET lesson_vocabulary_draft_json = ?, updated_at = ?
        WHERE id = ? AND teacher_username = ?
        """,
        (vocab_json_dump(normalized), now, page_id, teacher),
    )
    return normalized


def refresh_page_vocabulary_draft_from_html(conn, page_id: int, teacher: str) -> list[dict[str, str]]:
    row = conn.execute(
        "SELECT html_content FROM teacher_teaching_pages WHERE id = ? AND teacher_username = ?",
        (page_id, teacher),
    ).fetchone()
    if not row or not row["html_content"]:
        return []
    from teacher_teaching_pages import polish_teaching_html

    html = polish_teaching_html(row["html_content"])
    suggested = suggest_vocab_from_html(html)
    if suggested:
        save_page_vocabulary_draft(conn, page_id, teacher, suggested)
    return suggested


def get_class_vocabulary(conn, teacher: str, class_name: str) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT vocabulary_json, source_page_id, updated_at
        FROM live_class_vocabulary
        WHERE teacher_username = ? AND class_name = ?
        """,
        (teacher, class_name),
    ).fetchone()
    if not row:
        return {"terms": [], "source_page_id": None, "updated_at": ""}
    return {
        "terms": vocab_json_load(row["vocabulary_json"]),
        "source_page_id": row["source_page_id"],
        "updated_at": row["updated_at"] or "",
    }


def save_class_vocabulary(
    conn,
    teacher: str,
    class_name: str,
    terms: list[dict[str, str]],
    *,
    source_page_id: int | None = None,
) -> list[dict[str, str]]:
    normalized = normalize_vocab_list(terms)
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO live_class_vocabulary
            (teacher_username, class_name, vocabulary_json, source_page_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(teacher_username, class_name) DO UPDATE SET
            vocabulary_json = excluded.vocabulary_json,
            source_page_id = excluded.source_page_id,
            updated_at = excluded.updated_at
        """,
        (teacher, class_name, vocab_json_dump(normalized), source_page_id, now),
    )
    return normalized
