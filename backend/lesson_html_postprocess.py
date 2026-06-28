"""
Post-process AI lesson HTML: design polish, live-teaching contract repair, validation.
"""
from __future__ import annotations

import json
import re
from typing import Any

_CJK_CHAR = r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]"
_PAREN_CJK_RE = re.compile(rf"\s*[\(（][^)\）]*{_CJK_CHAR}[^)\）]*[\)）]", re.UNICODE)
_CJK_RUN_RE = re.compile(_CJK_CHAR, re.UNICODE)


def strip_chinese_from_plain(text: str) -> str:
    """Remove Chinese glosses and CJK characters from plain text."""
    out = _PAREN_CJK_RE.sub("", str(text or ""))
    out = _CJK_RUN_RE.sub("", out)
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"（\s*）", "", out)
    out = re.sub(r"\s{2,}", " ", out)
    return out.strip()


def strip_chinese_from_html(html: str) -> str:
    """Remove Chinese glosses and CJK from generated lesson HTML."""
    text = str(html or "")
    if not text:
        return text
    text = _PAREN_CJK_RE.sub("", text)
    text = _CJK_RUN_RE.sub("", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"（\s*）", "", text)
    text = re.sub(
        r'(<html[^>]*\slang\s*=\s*["\'])[^"\']*(["\'])',
        r"\1en\2",
        text,
        count=1,
        flags=re.IGNORECASE,
    )
    return text


EAP_LESSON_DESIGN_CSS = """
:root {
  --eap-lesson-bg: #eef2f6;
  --eap-card: #ffffff;
  --eap-accent: #0a7ea4;
  --eap-heading: #0a4d68;
  --eap-muted: #5c6670;
}
body {
  font-family: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  background: var(--eap-lesson-bg);
  color: #1a1f24;
  line-height: 1.6;
  margin: 0;
  padding: 1rem 0 2rem;
}
main, .lesson-wrap, article {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1rem;
}
h1, h2, h3 { color: var(--eap-heading); line-height: 1.25; }
h1 { font-size: 1.85rem; margin: 0 0 1rem; }
h2 { font-size: 1.35rem; margin: 1.5rem 0 0.75rem; }
p, li { max-width: 72ch; }
.eap-segment, section.eap-segment, section[data-eap-live-segment] {
  background: var(--eap-card);
  border-radius: 12px;
  padding: 1.15rem 1.35rem;
  margin: 1rem auto;
  max-width: 960px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.eap-activity, .eap-live-slot {
  border: 1px solid rgba(10, 126, 164, 0.22);
  border-radius: 10px;
  padding: 1rem 1.1rem;
  margin: 1rem 0;
  background: #fafcfd;
}
.eap-question { font-weight: 600; margin: 0 0 0.65rem; }
.eap-options { display: flex; flex-direction: column; gap: 0.4rem; }
.eap-options button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #c8d0d8;
  background: #fff;
  cursor: pointer;
  font-size: 1rem;
}
.eap-options button:hover { border-color: var(--eap-accent); }
.eap-live-launch, .eap-reveal, button.eap-reveal {
  background: var(--eap-accent);
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 0.65rem;
  font-size: 0.95rem;
}
.eap-reveal-target, .eap-reveal-target[hidden] { margin-top: 0.5rem; }
table.eap-excel-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.95rem;
}
table.eap-excel-table th, table.eap-excel-table td {
  border: 1px solid #d0d7de;
  padding: 0.45rem 0.6rem;
  text-align: left;
}
table.eap-excel-table th { background: #f0f4f8; }
"""

_LIVE_TOOL_RE = re.compile(r'data-eap-live-tool\s*=\s*["\']([^"\']+)["\']', re.I)
_SEGMENT_RE = re.compile(r'data-eap-live-segment\s*=\s*["\'](\d+)["\']', re.I)
_H2_RE = re.compile(r"<h2\b[^>]*>[\s\S]*?</h2>", re.I)


def merge_source_text_fair(paste_text: str, blocks: list[str], max_total: int) -> str:
    """Merge source blocks with proportional budget so every file keeps an excerpt."""
    parts: list[str] = []
    paste = str(paste_text or "").strip()
    if paste:
        parts.append(paste)
    for block in blocks:
        t = str(block or "").strip()
        if t:
            parts.append(t)
    if not parts:
        return ""
    total_len = sum(len(p) for p in parts)
    if total_len <= max_total:
        return "\n\n---\n\n".join(parts)

    n = len(parts)
    floor_each = max(280, max_total // (n * 2))
    budgets = [min(len(p), floor_each) for p in parts]
    used = sum(budgets)
    remaining = max(0, max_total - used)
    slack = [max(0, len(p) - b) for p, b in zip(parts, budgets)]
    slack_total = sum(slack)
    out: list[str] = []
    for i, part in enumerate(parts):
        extra = int(remaining * slack[i] / slack_total) if slack_total else 0
        take = min(len(part), budgets[i] + extra)
        chunk = part[:take]
        if len(part) > take:
            chunk += "\n… (truncated — re-upload smaller files or split across lessons)"
        out.append(chunk)
    merged = "\n\n---\n\n".join(out)
    return merged[:max_total]


def _inject_design_css(html: str) -> str:
    text = str(html or "")
    if "--eap-lesson-bg" in text:
        return text
    lower = text.lower()
    style_open = lower.find("<style")
    if style_open >= 0:
        close_angle = text.find(">", style_open)
        if close_angle >= 0:
            return text[: close_angle + 1] + EAP_LESSON_DESIGN_CSS + text[close_angle + 1 :]
    head_end = lower.find("</head>")
    if head_end >= 0:
        return text[:head_end] + f"<style>{EAP_LESSON_DESIGN_CSS}</style>" + text[head_end:]
    return f"<style>{EAP_LESSON_DESIGN_CSS}</style>" + text


def _normalize_live_ids(html: str) -> str:
    def repl(match: re.Match) -> str:
        block = match.group(0)
        if re.search(r"data-eap-live-id\s*=", block, re.I):
            return block
        id_m = re.search(r'data-eap-id\s*=\s*["\']([^"\']+)["\']', block, re.I)
        if not id_m:
            return block
        insert_pos = block.rfind(">")
        if insert_pos <= 0:
            return block
        return block[:insert_pos] + f' data-eap-live-id="{id_m.group(1)}"' + block[insert_pos:]

    return re.sub(
        r"<div[^>]*\bdata-eap-live-tool\b[^>]*>",
        repl,
        html,
        flags=re.I,
    )


def _ensure_launch_buttons(html: str) -> str:
    def fix_block(match: re.Match) -> str:
        block = match.group(0)
        if re.search(r"eap-live-launch|data-eap-live-launch", block, re.I):
            return block
        if block.rstrip().endswith("</div>"):
            return block[:-6] + (
                '<button type="button" class="eap-live-launch btn-secondary">'
                "Launch to class</button></div>"
            )
        return block + (
            '<button type="button" class="eap-live-launch btn-secondary">'
            "Launch to class</button>"
        )

    return re.sub(
        r'<div[^>]*class="[^"]*eap-(?:activity|live-slot)[^"]*"[^>]*data-eap-live-tool[^>]*>[\s\S]*?</div>',
        fix_block,
        html,
        flags=re.I,
    )


def _slot_block_html(slot: dict, index: int) -> str:
    tool = str(slot.get("live_tool") or slot.get("activity_type") or "poll").strip().lower()
    if tool not in ("poll", "quiz", "game"):
        tool = "poll"
    seg = slot.get("segment_index")
    seg_attr = f' data-eap-live-segment="{int(seg)}"' if seg is not None and str(seg).strip() != "" else ""
    game = str(slot.get("live_game") or "quiz-battle").strip().lower()
    game_attr = f' data-eap-live-game="{game}"' if tool == "game" else ""
    q = str(slot.get("question_sketch") or slot.get("description") or "Quick check").strip()
    opts = slot.get("options") if isinstance(slot.get("options"), list) else []
    opts = [str(o).strip() for o in opts if str(o).strip()][:4]
    if len(opts) < 2:
        opts = ["Option A", "Option B", "Option C"]
    letters = "ABCD"
    opt_html = "".join(
        f'<button type="button" data-eap-option="{letters[i]}">{o}</button>'
        for i, o in enumerate(opts)
    )
    answer = letters[min(1, len(opts) - 1)]
    title = str(slot.get("segment_title") or "").strip()
    heading = f"<h3>{title}</h3>" if title else ""
    return (
        f'<div class="eap-activity eap-live-slot" data-eap-id="live-{tool}-{index}" '
        f'data-eap-live-id="live-{tool}-{index}" data-eap-type="mcq" '
        f'data-eap-live-tool="{tool}" data-eap-answer="{answer}"{seg_attr}{game_attr}>'
        f"{heading}<p class=\"eap-question\">{q}</p>"
        f'<div class="eap-options">{opt_html}</div>'
        f'<button type="button" class="eap-live-launch btn-secondary">Launch to class</button>'
        f"</div>"
    )


def _inject_missing_plan_slots(html: str, plan: dict | None) -> str:
    if not plan:
        return html
    slots = plan.get("interaction_slots") if isinstance(plan.get("interaction_slots"), list) else []
    if not slots:
        return html
    live_count = len(_LIVE_TOOL_RE.findall(html))
    need = len([s for s in slots if str(s.get("live_tool") or s.get("activity_type") or "").strip()])
    if live_count >= max(1, need // 2):
        return html
    fragments = [_slot_block_html(s, i) for i, s in enumerate(slots) if isinstance(s, dict)]
    if not fragments:
        return html
    section = (
        '<section class="eap-segment eap-live-fallback" data-eap-live-segment="0">'
        "<h2>Class activities</h2>"
        + "".join(fragments)
        + "</section>"
    )
    lower = html.lower()
    if "</body>" in lower:
        idx = lower.rindex("</body>")
        return html[:idx] + section + html[idx:]
    return html + section


def _tag_h2_segments(html: str, plan: dict | None) -> str:
    """Add data-eap-live-segment on h2 headings when plan has matching segment count."""
    if not plan:
        return html
    segments = plan.get("segments") if isinstance(plan.get("segments"), list) else []
    h2s = list(_H2_RE.finditer(html))
    if not segments or not h2s or len(h2s) < len(segments):
        return html
    out = []
    last = 0
    for i, m in enumerate(h2s):
        out.append(html[last : m.start()])
        tag = m.group(0)
        if "data-eap-live-segment" not in tag.lower() and i < len(segments):
            tag = tag.replace("<h2", f'<h2 data-eap-live-segment="{i}"', 1)
        out.append(tag)
        last = m.end()
    out.append(html[last:])
    return "".join(out)


def validate_lesson_html(html: str, plan: dict | None = None) -> list[dict[str, str]]:
    """Return human-facing warning objects {code, message}."""
    text = str(html or "")
    warnings: list[dict[str, str]] = []
    if not text.strip():
        warnings.append({"code": "empty", "message": "HTML is empty"})
        return warnings

    tools = _LIVE_TOOL_RE.findall(text)
    if not tools:
        warnings.append(
            {
                "code": "no_live_slots",
                "message": "No live poll/quiz/game blocks found — Poll/Quiz tools will use manual entry only.",
            }
        )
    else:
        if not re.search(r"eap-live-launch|data-eap-live-launch", text, re.I):
            warnings.append(
                {
                    "code": "no_launch_buttons",
                    "message": "Live blocks are missing “Launch to class” buttons (auto-repair attempted).",
                }
            )
        if plan and _SEGMENT_RE.search(text) is None:
            warnings.append(
                {
                    "code": "no_segment_tags",
                    "message": "No segment markers — segment filter in Live Teaching may not work.",
                }
            )

    if "eap-lesson-meta" not in text and plan:
        warnings.append(
            {
                "code": "no_lesson_meta",
                "message": "Lesson plan metadata script missing (should be injected on save).",
            }
        )

    if "eap-excel-table" in text.lower() or (plan and any("TABLE" in str(s) for s in [])):
        pass
    if "[TABLE]" in text:
        warnings.append(
            {
                "code": "raw_table_text",
                "message": "Raw table text remains in the page — Excel content may not be fully rendered as tables.",
            }
        )

    activity_ids = len(re.findall(r"data-eap-id\s*=", text, re.I))
    if activity_ids and not re.search(r"eap-reveal|data-eap-reveal", text, re.I):
        warnings.append(
            {
                "code": "no_reveal_buttons",
                "message": "Activities found but no “Show answer” reveal buttons.",
            }
        )

    return warnings


ICP_SERVICE_NUMBER = "苏ICP备2026033339号-2"
ICP_MIIT_URL = "https://beian.miit.gov.cn/"
ICP_COPYRIGHT_OWNER = "吕海"

ICP_FOOTER_HTML = (
    '<footer class="eap-site-icp site-icp-footer" role="contentinfo">'
    f'<p class="site-icp-footer__copy">版权所有 © {ICP_COPYRIGHT_OWNER}</p>'
    f'<p class="site-icp-footer__icp">'
    f'<a href="{ICP_MIIT_URL}" target="_blank" rel="noopener noreferrer">{ICP_SERVICE_NUMBER}</a>'
    f"</p></footer>"
)

ICP_FOOTER_STYLE = """
.eap-site-icp,.site-icp-footer{margin:2rem 0 0;padding:.85rem 1rem;text-align:center;
font-size:.75rem;line-height:1.5;color:#6e6e73;border-top:1px solid rgba(0,0,0,.06)}
.eap-site-icp a{color:#5c6670;text-decoration:none}
.eap-site-icp a:hover{text-decoration:underline;color:#0a4d68}
"""


_META_SCRIPT_RE = re.compile(
    r'(?is)<script[^>]*\bid\s*=\s*["\']eap-lesson-meta["\'][^>]*>([\s\S]*?)</script>'
)


def enrich_lesson_meta_vocabulary(html: str, *, min_terms: int = 8) -> str:
    """Embed vocabulary[] in eap-lesson-meta so live vocab games can read lesson terms."""
    text = str(html or "")
    if len(text) < 80:
        return text

    meta_match = _META_SCRIPT_RE.search(text)
    data: dict[str, Any] = {}
    if meta_match:
        try:
            parsed = json.loads(meta_match.group(1))
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = {}

    existing = data.get("vocabulary")
    if isinstance(existing, list):
        try:
            from eap_ai import _filter_vocab_pairs, _normalize_vocab_terms

            normalized = _filter_vocab_pairs(_normalize_vocab_terms(existing))
            if len(normalized) >= min_terms:
                return text
        except ImportError:
            if len(existing) >= min_terms:
                return text

    try:
        from eap_ai import (
            _filter_vocab_pairs,
            _merge_vocab_terms,
            _parse_vocab_pairs_from_html,
            _vocab_from_interaction_slots,
        )
    except ImportError:
        return text

    pairs = _filter_vocab_pairs(_parse_vocab_pairs_from_html(text))
    pairs = _merge_vocab_terms(pairs, _vocab_from_interaction_slots(data.get("interaction_slots") or []))
    if isinstance(existing, list):
        pairs = _merge_vocab_terms(pairs, existing)
    if len(pairs) < min_terms:
        try:
            from eap_ai import _extract_vocab_from_lesson_plain

            pairs = _merge_vocab_terms(pairs, _extract_vocab_from_lesson_plain(text))
        except ImportError:
            pass

    if not pairs:
        return text

    data["vocabulary"] = pairs[:24]
    new_script = (
        f'<script type="application/json" id="eap-lesson-meta">'
        f"{json.dumps(data, ensure_ascii=False)}</script>"
    )
    if meta_match:
        return text[: meta_match.start()] + new_script + text[meta_match.end() :]
    lower = text.lower()
    if "</body>" in lower:
        idx = lower.rindex("</body>")
        return text[:idx] + new_script + text[idx:]
    return text + new_script


def inject_icp_footer_html(html: str) -> str:
    """Append MIIT ICP footer per Tencent 备案号悬挂说明 (non-Guangdong: 服务备案号)."""
    text = str(html or "")
    if not text.strip():
        return text
    if ICP_SERVICE_NUMBER in text and ICP_MIIT_URL in text:
        return text
    snippet = ICP_FOOTER_HTML
    if "site-icp-footer__icp" not in text and "<style" in text.lower():
        snippet = f"<style>{ICP_FOOTER_STYLE}</style>" + snippet
    lower = text.lower()
    if "</body>" in lower:
        idx = lower.rindex("</body>")
        return text[:idx] + snippet + text[idx:]
    return text + snippet


def postprocess_lesson_html(html: str, plan: dict | None = None) -> tuple[str, list[dict[str, str]]]:
    """Polish design, repair live markup, return (html, warnings)."""
    text = str(html or "")
    if not text:
        return text, validate_lesson_html(text, plan)

    text = _inject_design_css(text)
    text = _tag_h2_segments(text, plan)
    text = _normalize_live_ids(text)
    text = _ensure_launch_buttons(text)
    text = _inject_missing_plan_slots(text, plan)
    text = _ensure_launch_buttons(text)
    text = strip_chinese_from_html(text)
    text = inject_icp_footer_html(text)
    warnings = validate_lesson_html(text, plan)
    return text, warnings
