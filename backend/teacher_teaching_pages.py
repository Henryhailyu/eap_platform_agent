"""
Phase K3 — teacher AI-generated HTML teaching pages.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

MAX_SOURCE_TEXT = 12_000
MAX_HTML_BYTES = 120_000
MAX_TITLE = 200

_INTERACTIVE_HTML_RULES = (
    "\nInteractive classroom requirements (K6) — REQUIRED:\n"
    "- Include 2–4 blocks exactly like this MCQ example (adapt content):\n"
    '<div class="eap-activity" data-eap-id="q1" data-eap-type="mcq" data-eap-answer="B">\n'
    '  <p class="eap-question">Which statement best summarises the passage?</p>\n'
    '  <div class="eap-options">\n'
    '    <button type="button" data-eap-option="A">Option A text</button>\n'
    '    <button type="button" data-eap-option="B">Option B text</button>\n'
    '    <button type="button" data-eap-option="C">Option C text</button>\n'
    "  </div>\n"
    '  <button type="button" class="eap-reveal" data-eap-target="#ans-q1">Show answer</button>\n'
    '  <div id="ans-q1" class="eap-reveal-target">Correct: B — brief explanation.</div>\n'
    "</div>\n"
    "- Each activity MUST have a unique data-eap-id and data-eap-answer (letter A–D or 0-based index).\n"
    "- Options MUST use button elements with data-eap-option=\"A\" etc.\n"
    "- Add Show answer buttons: class=\"eap-reveal\" with data-eap-target pointing to .eap-reveal-target.\n"
    "- Use CSS transitions on .eap-reveal-target (opacity/transform) for smooth reveal.\n"
    "- Style .eap-activity, .eap-options button, .eap-selected, .eap-revealed in the same <style> block.\n"
    "- Prefer data-eap-* markup over inline onclick (platform wires interactivity automatically).\n"
    "\nLive Teaching launch slots (LT-M1) — include 2–3 poll + 2–3 quiz blocks AND 1 game block:\n"
    "- Wrap each in: <div class=\"eap-activity eap-live-slot\" data-eap-id=\"live-poll-1\" "
    "data-eap-type=\"mcq\" data-eap-live-tool=\"poll\" data-eap-answer=\"B\"> … </div>\n"
    "- Quiz: data-eap-live-tool=\"quiz\". Game: data-eap-live-tool=\"game\" "
    "data-eap-live-game=\"quiz-battle\" | \"board-race\" | \"matching-race\" | "
    "\"vocab-bingo\" | \"treasure-hunt\".\n"
    "- Optional: data-eap-live-segment=\"N\" (0-based segment index from lesson plan).\n"
    "- Inside each slot: .eap-question, .eap-options with button[data-eap-option=\"A\"] etc., "
    "and <button type=\"button\" class=\"eap-live-launch btn-secondary\">Launch to class</button>.\n"
    "- Poll/quiz slots must have 3–4 options and a valid data-eap-answer letter.\n"
)

_CONTENT_RULES = (
    "\nContent rules — REQUIRED:\n"
    "- The <body> must start directly with lesson content (title banner / header). "
    "Do NOT add any paragraph or div that describes the document itself "
    "(e.g. never write \"This is a complete, self-contained HTML document…\" or similar meta text).\n"
    "- Do NOT include author notes, generation comments, or explanations outside the lesson.\n"
)

_VISUAL_DESIGN_RULES = (
    "\nVisual design — REQUIRED:\n"
    "- Page background: light solid colour (#f4f6f8 or #eef2f6).\n"
    "- All reading text must sit on opaque or high-opacity panels (white or rgba(255,255,255,0.92+) cards).\n"
    "- Decorative background images (CSS gradients, inline SVG, or data-URI) ONLY on header/banner sections — "
    "never behind body paragraphs.\n"
    "- If using opacity on a decorative layer, use exactly 0.5 (50%) — clear but not overpowering.\n"
    "- Prefer a solid colour wash overlay on banners rather than a faint full-page watermark.\n"
)


DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT = (
    "You are an expert EAP (English for Academic Purposes) lesson designer. "
    "Output ONLY the raw HTML document — no markdown fences, no text before <!DOCTYPE html>, no commentary after </html>.\n\n"
    "Requirements:\n"
    "- Start with <!DOCTYPE html> and include <html lang=\"...\">.\n"
    "- All CSS must be in a single <style> block in <head>. Use a clean, projector-friendly layout: "
    "large headings (1.75rem+), comfortable line-height, max-width ~960px centred content, soft neutral background.\n"
    "- Structure: title banner, learning objectives (ul), main teaching content (2–4 sections with h2), "
    "key vocabulary or language focus, 2–3 interactive practice activities, summary.\n"
    "- Use academic English suited to the stated level (beginner / intermediate / advanced).\n"
    "- Inline <script> is allowed for simple reveal/highlight only — no external script URLs.\n"
    "- Do NOT link to external CSS, JS, fonts, or images.\n"
    "- Do NOT use onclick/onload or javascript: URLs.\n"
    "- Keep total HTML under ~8000 words.\n"
    "- ALL visible content MUST be English only: no Chinese characters, no bilingual headings, "
    "no translations in parentheses, and no 中文 glosses anywhere in the document.\n"
    "- Set <html lang=\"en\">."
    + _CONTENT_RULES
    + _VISUAL_DESIGN_RULES
    + _INTERACTIVE_HTML_RULES
)

_FENCE_RE = re.compile(r"^```(?:html)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_EXTERNAL_SCRIPT_RE = re.compile(
    r"<script[^>]+src\s*=\s*['\"][^'\"]+['\"][^>]*>\s*</script>",
    re.IGNORECASE,
)
_EVENT_HANDLER_RE = re.compile(r"\s(on\w+)\s*=\s*['\"][^'\"]*['\"]", re.IGNORECASE)
_PREAMBLE_P_RE = re.compile(
    r"<(?:p|div|section)[^>]*>\s*This is a (?:complete,\s*)?self-contained HTML document[^<]*</(?:p|div|section)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_PREAMBLE_P2_RE = re.compile(
    r"<(?:p|div|section)[^>]*>\s*This HTML (?:lesson|document|page)[^<]*</(?:p|div|section)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_PREAMBLE_P3_RE = re.compile(
    r"<(?:p|div|section)[^>]*>\s*Here is the (?:complete\s+)?HTML document[^<]*</(?:p|div|section)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_PREAMBLE_P4_RE = re.compile(
    r"<(?:p|div|section)[^>]*>\s*Here is a (?:complete\s+)?(?:self-contained\s+)?HTML[^<]*</(?:p|div|section)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_PREAMBLE_META_RE = re.compile(
    r"<(?:p|div|section)[^>]*(?:class|id)=[\"'][^\"']*(?:meta|intro|preamble|preface|description|ai-note)[^\"']*[\"'][^>]*>.*?</(?:p|div|section)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_PREAMBLE_INCLUDES_RE = re.compile(
    r"<(?:p|div)[^>]*>[^<]*(?:includes a clear title|interactive multiple-choice activities for classroom use|structured teaching content with vocabulary)[^<]*</(?:p|div)>\s*",
    re.IGNORECASE | re.DOTALL,
)
_DECORATIVE_OPACITY_RE = re.compile(r"(opacity\s*:\s*)(0\.\d+)(?!\d)", re.IGNORECASE)
_RGBA_ALPHA_RE = re.compile(
    r"(background[^;{]*rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*)(0\.\d+)(\s*\))",
    re.IGNORECASE,
)


_PREAMBLE_MARKERS = (
    "self-contained html",
    "html document for",
    "html document is",
    "here is the complete",
    "here is a complete",
    "complete html document",
    "it includes a title banner",
    "learning objectives, vocabulary",
    "all styled for clear projection",
    "includes a clear title",
    "interactive multiple-choice",
    "structured teaching content",
    "for classroom use",
    "eap listening lesson",
)


def _plain_text_from_html(fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment or "")).strip().lower()


def _is_preamble_block(inner_html: str) -> bool:
    plain = _plain_text_from_html(inner_html)
    if len(plain) < 28:
        return False
    if plain.startswith("this is a ") and ("document" in plain or "html" in plain):
        return True
    if plain.startswith("this html ") and "lesson" in plain:
        return True
    if plain.startswith("here is the ") and ("html" in plain or "document" in plain):
        return True
    if plain.startswith("here is a ") and ("html" in plain or "document" in plain):
        return True
    return any(marker in plain for marker in _PREAMBLE_MARKERS)


def _strip_before_html_root(html: str) -> str:
    """Remove plain-text AI intros that appear before <!DOCTYPE> or <html>."""
    m = re.search(r"<!DOCTYPE\s+html|<html\b", html, re.IGNORECASE)
    return html[m.start() :] if m else html


def _strip_body_leading_preamble(html: str) -> str:
    body_m = re.search(r"(<body[^>]*>)([\s\S]*)(</body>)", html, re.IGNORECASE)
    if not body_m:
        return html
    open_tag, body_inner, close_tag = body_m.group(1), body_m.group(2), body_m.group(3)
    block_re = re.compile(
        r"^\s*(<(p|div|section|article|aside|header)(\s[^>]*)?>[\s\S]*?</\2>)",
        re.IGNORECASE,
    )
    for _ in range(8):
        m = block_re.match(body_inner)
        if not m or not _is_preamble_block(m.group(1)):
            break
        body_inner = body_inner[m.end() :]
    return html[: body_m.start(2)] + body_inner + html[body_m.end(2) :]


def _strip_ai_preamble(html: str) -> str:
    text = _strip_before_html_root(html)
    text = _PREAMBLE_P_RE.sub("", text)
    text = _PREAMBLE_P2_RE.sub("", text)
    text = _PREAMBLE_P3_RE.sub("", text)
    text = _PREAMBLE_P4_RE.sub("", text)
    text = _PREAMBLE_META_RE.sub("", text)
    text = _PREAMBLE_INCLUDES_RE.sub("", text)
    text = re.sub(
        r"<(?:p|div|section|article|aside)[^>]*>[\s\S]*?"
        r"(?:self-contained\s+HTML|HTML\s+document\s+for|Here is the (?:complete\s+)?HTML|includes\s+a\s+clear\s+title)"
        r"[\s\S]*?</(?:p|div|section|article|aside)>",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = _strip_body_leading_preamble(text)
    return text


def _normalize_decorative_opacity(html: str) -> str:
    """Set decorative background opacity to 50% for clearer banners."""

    def fix_style_block(match: re.Match) -> str:
        attrs = match.group(1)
        block = match.group(2)
        if "eap-reveal" in block:
            return match.group(0)

        def fix_rule(rule_match: re.Match) -> str:
            rule = rule_match.group(0)
            if "eap-reveal" in rule:
                return rule
            if "background" not in rule and "::before" not in rule and "::after" not in rule:
                return rule
            rule = _DECORATIVE_OPACITY_RE.sub(r"\g<1>0.5", rule)
            rule = _RGBA_ALPHA_RE.sub(r"\g<1>0.5\3", rule)
            return rule

        fixed = re.sub(r"[^{}]+\{[^{}]*\}", fix_rule, block, flags=re.DOTALL)
        return f"<style{attrs}>{fixed}</style>"

    return re.sub(r"<style([^>]*)>(.*?)</style>", fix_style_block, html, flags=re.IGNORECASE | re.DOTALL)


def polish_teaching_html(html: str) -> str:
    """Strip AI preamble and tune decorative opacity for display (existing saved pages)."""
    text = str(html or "")
    if not text:
        return text
    text = _strip_ai_preamble(text)
    text = _normalize_decorative_opacity(text)
    try:
        from lesson_html_postprocess import (
            enrich_lesson_meta_vocabulary,
            inject_icp_footer_html,
            strip_chinese_from_html,
        )

        text = strip_chinese_from_html(text)
        text = enrich_lesson_meta_vocabulary(text)
        text = inject_icp_footer_html(text)
    except ImportError:
        pass
    return text


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
    text = _strip_ai_preamble(text)
    text = _normalize_decorative_opacity(text)
    try:
        from lesson_html_postprocess import strip_chinese_from_html

        text = strip_chinese_from_html(text)
    except ImportError:
        pass
    return text


def row_to_dict(row, *, polish: bool = False) -> dict:
    html = row["html_content"]
    if polish and html:
        html = polish_teaching_html(html)
    return {
        "id": row["id"],
        "title": row["title"],
        "class_name": row["class_name"] or "",
        "task_id": row["task_id"],
        "topic": row["topic"] or "",
        "source_text": row["source_text"] or "",
        "html_content": html,
        "template_key": row["template_key"] or "standard",
        "published": bool(row["published"]),
        "published_at": row["published_at"] or "",
        "teacher_username": row["teacher_username"] or "",
        "created_at": row["created_at"] or "",
        "updated_at": row["updated_at"] or "",
    }


def row_to_public_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "class_name": row["class_name"] or "",
        "topic": row["topic"] or "",
        "template_key": row["template_key"] or "standard",
        "teacher_username": row["teacher_username"] or "",
        "published_at": row["published_at"] or "",
        "updated_at": row["updated_at"] or "",
    }
