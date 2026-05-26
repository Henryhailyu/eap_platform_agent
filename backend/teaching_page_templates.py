"""
Phase K4 — manager-configurable AI templates for HTML teaching pages.
"""
from __future__ import annotations

from datetime import datetime, timezone

from teacher_teaching_pages import DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT

TEACHING_PAGE_TEMPLATE_KEYS = frozenset({"standard", "vocabulary", "reading", "discussion", "review"})

TEMPLATE_LABELS: dict[str, tuple[str, str]] = {
    "standard": ("Standard lesson", "标准课时"),
    "vocabulary": ("Vocabulary workshop", "词汇工作坊"),
    "reading": ("Reading workshop", "阅读工作坊"),
    "discussion": ("Discussion workshop", "讨论工作坊"),
    "review": ("Review & recap", "复习总结"),
}

_BASE_HTML_RULES = (
    "Output ONLY the raw HTML document — no markdown fences, no text before <!DOCTYPE>, no commentary.\n"
    "- Start with <!DOCTYPE html> and include <html lang=\"...\">.\n"
    "- All CSS in one <style> block; projector-friendly; max-width ~960px centred.\n"
    "- Inline <script> allowed for simple reveal/highlight only — no external URLs.\n"
    "- Do NOT use external CSS/JS/fonts/images or onclick handlers.\n"
    "- Do NOT add meta paragraphs describing the document (start with the lesson title banner).\n"
    "- Reading text on opaque panels; decorative backgrounds at opacity 0.5 (50%).\n"
    "- Include interactive eap-activity blocks (data-eap-id, data-eap-type, data-eap-answer) "
    "with button options data-eap-option=\"A\" and .eap-reveal show-answer controls.\n"
    "- At least 2 MCQ activities are required per page.\n"
)


def _template_prompt(structure: str) -> str:
    return (
        "You are an expert EAP lesson designer. "
        + _BASE_HTML_RULES
        + f"\nPage structure emphasis:\n{structure}\n"
        + "Use academic English suited to the stated level."
    )


DEFAULT_TEMPLATE_PROMPTS: dict[str, str] = {
    "standard": DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT,
    "vocabulary": _template_prompt(
        "Title banner; learning objectives; vocabulary set (8–12 items with definitions); "
        "collocation examples; 2 practice activities (matching + gap-fill); summary."
    ),
    "reading": _template_prompt(
        "Title banner; learning objectives; reading passage (250–400 words); "
        "comprehension questions; vocabulary from passage; short writing prompt; summary."
    ),
    "discussion": _template_prompt(
        "Title banner; discussion focus; 3–4 discussion prompts with sentence starters; "
        "useful evaluative language box; pair/group activity instructions; reflection."
    ),
    "review": _template_prompt(
        "Title banner; recap of prior topics (bullet list); quick-check quiz (5 MCQ); "
        "error correction mini-task; study tips; next-lesson preview."
    ),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_template_key(key: str | None) -> str:
    k = str(key or "standard").strip().lower()
    if k not in TEACHING_PAGE_TEMPLATE_KEYS:
        raise ValueError("invalid template")
    return k


def default_prompt(template_key: str) -> str:
    k = normalize_template_key(template_key)
    return DEFAULT_TEMPLATE_PROMPTS.get(k, DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT)


def template_label(template_key: str, lang: str = "en") -> str:
    k = normalize_template_key(template_key)
    en, zh = TEMPLATE_LABELS.get(k, (k, k))
    return zh if str(lang or "").lower().startswith("zh") else en


def prompt_row_to_dict(row) -> dict:
    key = row["template_key"]
    return {
        "template_key": key,
        "system_prompt": row["system_prompt"],
        "is_default": bool(row["is_default"]),
        "updated_by": row["updated_by"] or "",
        "updated_at": row["updated_at"] or "",
        "label_en": TEMPLATE_LABELS.get(key, (key, key))[0],
        "label_zh": TEMPLATE_LABELS.get(key, (key, key))[1],
    }


def get_prompt(conn, template_key: str) -> dict:
    k = normalize_template_key(template_key)
    row = conn.execute(
        "SELECT template_key, system_prompt, is_default, updated_by, updated_at "
        "FROM teaching_page_templates WHERE template_key = ?",
        (k,),
    ).fetchone()
    if row is None:
        return {
            "template_key": k,
            "system_prompt": default_prompt(k),
            "is_default": True,
            "updated_by": "",
            "updated_at": "",
            "label_en": TEMPLATE_LABELS.get(k, (k, k))[0],
            "label_zh": TEMPLATE_LABELS.get(k, (k, k))[1],
        }
    return prompt_row_to_dict(row)


def list_prompts(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT template_key, system_prompt, is_default, updated_by, updated_at "
        "FROM teaching_page_templates ORDER BY template_key"
    ).fetchall()
    saved = {r["template_key"]: prompt_row_to_dict(r) for r in rows}
    return [saved.get(k) or get_prompt(conn, k) for k in sorted(TEACHING_PAGE_TEMPLATE_KEYS)]


def save_prompt(conn, template_key: str, system_prompt: str, updated_by: str) -> dict:
    k = normalize_template_key(template_key)
    text = str(system_prompt or "").strip()
    if len(text) < 40:
        raise ValueError("system_prompt is too short")
    if len(text) > 12000:
        raise ValueError("system_prompt exceeds 12000 characters")
    is_default = 1 if text == default_prompt(k) else 0
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO teaching_page_templates (template_key, system_prompt, is_default, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(template_key) DO UPDATE SET
            system_prompt = excluded.system_prompt,
            is_default = excluded.is_default,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        """,
        (k, text, is_default, updated_by or "", now),
    )
    conn.commit()
    return get_prompt(conn, k)


def reset_prompt(conn, template_key: str, updated_by: str) -> dict:
    k = normalize_template_key(template_key)
    conn.execute("DELETE FROM teaching_page_templates WHERE template_key = ?", (k,))
    conn.commit()
    return get_prompt(conn, k)


def seed_default_templates(conn) -> None:
    now = _now_iso()
    for k in TEACHING_PAGE_TEMPLATE_KEYS:
        existing = conn.execute(
            "SELECT template_key FROM teaching_page_templates WHERE template_key = ?",
            (k,),
        ).fetchone()
        if existing:
            continue
        conn.execute(
            """
            INSERT INTO teaching_page_templates (template_key, system_prompt, is_default, updated_by, updated_at)
            VALUES (?, ?, 1, 'system', ?)
            """,
            (k, default_prompt(k), now),
        )
