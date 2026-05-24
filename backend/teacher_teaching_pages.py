"""
Phase K3 — teacher AI-generated HTML teaching pages.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

MAX_SOURCE_TEXT = 6000
MAX_HTML_BYTES = 120_000
MAX_TITLE = 200

DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT = (
    "You are an expert EAP (English for Academic Purposes) lesson designer. "
    "Return ONLY a complete, self-contained HTML document — no markdown fences, no commentary.\n\n"
    "Requirements:\n"
    "- Start with <!DOCTYPE html> and include <html lang=\"...\">.\n"
    "- All CSS must be in a single <style> block in <head>. Use a clean, projector-friendly layout: "
    "large headings (1.75rem+), comfortable line-height, max-width ~960px centred content, soft neutral background.\n"
    "- Structure: title banner, learning objectives (ul), main teaching content (2–4 sections with h2), "
    "key vocabulary or language focus, 2–3 short practice activities (student can answer on paper), summary.\n"
    "- Use academic English suited to the stated level (beginner / intermediate / advanced).\n"
    "- Inline <script> is allowed only for simple reveal/highlight interactions — no external script URLs.\n"
    "- Do NOT link to external CSS, JS, fonts, or images.\n"
    "- Do NOT use onclick/onload or javascript: URLs.\n"
    "- Keep total HTML under ~8000 words."
)

_FENCE_RE = re.compile(r"^```(?:html)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_EXTERNAL_SCRIPT_RE = re.compile(
    r"<script[^>]+src\s*=\s*['\"][^'\"]+['\"][^>]*>\s*</script>",
    re.IGNORECASE,
)
_EVENT_HANDLER_RE = re.compile(r"\s(on\w+)\s*=\s*['\"][^'\"]*['\"]", re.IGNORECASE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_level(level: str | None) -> str:
    lvl = str(level or "intermediate").strip().lower()
    if lvl not in {"beginner", "intermediate", "advanced"}:
        return "intermediate"
    return lvl


def sanitize_teaching_html(raw: str) -> str:
    text = str(raw or "").strip()
    text = _FENCE_RE.sub("", text).strip()
    if text.lower().startswith("html"):
        text = text[4:].lstrip()
    text = _EXTERNAL_SCRIPT_RE.sub("", text)
    text = _EVENT_HANDLER_RE.sub("", text)
    if len(text.encode("utf-8")) > MAX_HTML_BYTES:
        text = text.encode("utf-8")[:MAX_HTML_BYTES].decode("utf-8", errors="ignore")
    lower = text.lower()
    if "<html" not in lower and "<!doctype" not in lower:
        raise ValueError("AI response is not a valid HTML document")
    return text


def row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "class_name": row["class_name"] or "",
        "task_id": row["task_id"],
        "topic": row["topic"] or "",
        "source_text": row["source_text"] or "",
        "html_content": row["html_content"],
        "teacher_username": row["teacher_username"] or "",
        "created_at": row["created_at"] or "",
        "updated_at": row["updated_at"] or "",
    }
