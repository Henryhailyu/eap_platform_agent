"""
SS-V1 — Parse manager vocabulary uploads (PDF/Word/Excel/TXT) into structured units.
"""
from __future__ import annotations

import json
import re
from typing import Any

_UNIT_HEADER_RE = re.compile(
    r"^(?:unit|chapter|lesson|part|section|week|day|第\s*\d+\s*[章节单元课]|第\s*[一二三四五六七八九十百千]+[章节单元课])\b",
    re.IGNORECASE,
)
_WORD_LINE_RE = re.compile(
    r"^([A-Za-z][A-Za-z\-']{1,48})\s*(?:[:\t|,，;；\-–—]\s*|\s{2,})(.+)$"
)
_TOKEN_RE = re.compile(r"\b[A-Za-z][A-Za-z\-']{2,48}\b")
_VALID_WORD = re.compile(r"^[A-Za-z][A-Za-z\-']{1,48}$")
_CHUNK_SIZE = 25
_MAX_MEANING_WORDS = 22
_MAX_MEANING_CHARS = 180

_LIGATURES = (
    ("ﬁ", "fi"),
    ("ﬂ", "fl"),
    ("ﬀ", "ff"),
    ("ﬃ", "ffi"),
    ("ﬄ", "ffl"),
)


def clean_vocab_extracted_text(text: str) -> str:
    """Fix common PDF / copy-paste artefacts before parsing."""
    cleaned = re.sub(r"\r\n?", "\n", str(text or ""))
    for src, dst in _LIGATURES:
        cleaned = cleaned.replace(src, dst)
    cleaned = re.sub(r"(?<=[a-zA-Z])9(?=[a-zA-Z])", "ti", cleaned)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _sanitize_word_token(word: str) -> str | None:
    w = " ".join(str(word or "").split()).strip()
    if not w or len(w) > 48:
        return None
    w = re.sub(r"(?<=[a-zA-Z])9(?=[a-zA-Z])", "ti", w)
    if not _VALID_WORD.match(w):
        return None
    return w


def _sanitize_meaning(meaning: str, word: str) -> str:
    m = " ".join(str(meaning or "").split()).strip()
    if not m or len(m) > _MAX_MEANING_CHARS or len(m.split()) > _MAX_MEANING_WORDS:
        return f"academic vocabulary: {word}"
    if m.lower() == word.lower():
        return f"academic vocabulary: {word}"
    return m


def vocab_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _ai_json(system: str, user: str, *, max_tokens: int = 8000) -> dict[str, Any]:
    from eap_ai import create_chat_completion, get_openai_client

    client, profile = get_openai_client()
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": system.strip()},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
        temperature=0.35,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    return json.loads(raw)


def _normalize_word(raw: dict[str, Any]) -> dict[str, Any] | None:
    word = _sanitize_word_token(str(raw.get("word") or ""))
    if not word:
        return None
    method = str(raw.get("method") or raw.get("methodPrimary") or "affix").strip().lower()
    if method not in ("affix", "mnemonic", "mixed"):
        method = "affix"
    core = _sanitize_meaning(
        str(raw.get("core") or raw.get("coreMeaning") or raw.get("meaning") or ""),
        word,
    )
    entry: dict[str, Any] = {
        "word": word,
        "prefix": str(raw.get("prefix") or "").strip()[:24],
        "root": str(raw.get("root") or word[:4])[:24],
        "suffix": str(raw.get("suffix") or "").strip()[:24],
        "core": core,
        "method": method,
    }
    mnemonic = raw.get("mnemonic")
    if mnemonic:
        entry["mnemonic"] = str(mnemonic).strip()[:240]
    return entry


def _normalize_units(payload: dict[str, Any]) -> list[dict[str, Any]]:
    units_out: list[dict[str, Any]] = []
    for i, unit in enumerate(payload.get("units") or []):
        label = str(unit.get("label") or unit.get("unitLabel") or f"Unit {i + 1}").strip()[:120]
        words: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw in unit.get("words") or []:
            entry = _normalize_word(raw if isinstance(raw, dict) else {"word": str(raw)})
            if not entry:
                continue
            key = entry["word"].lower()
            if key in seen:
                continue
            seen.add(key)
            words.append(entry)
        if words:
            units_out.append({"label": label or f"Unit {i + 1}", "words": words})
    return units_out


def _append_word(
    words: list[dict[str, Any]],
    seen: set[str],
    word: str,
    meaning: str,
) -> None:
    token = _sanitize_word_token(word)
    if not token:
        return
    key = token.lower()
    if key in seen:
        return
    seen.add(key)
    words.append(
        {
            "word": token,
            "prefix": "",
            "root": token[:4] if len(token) > 4 else token,
            "suffix": "",
            "core": _sanitize_meaning(meaning, token),
            "method": "affix",
        }
    )


def _tokens_from_blob(line: str) -> list[str]:
    out: list[str] = []
    for raw in _TOKEN_RE.findall(line):
        token = _sanitize_word_token(raw)
        if token:
            out.append(token)
    return out


def _parse_lines_rule_based(text: str) -> list[dict[str, Any]]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    units: list[dict[str, Any]] = []
    current_label = "Unit 1"
    current_words: list[dict[str, Any]] = []
    seen: set[str] = set()

    def flush() -> None:
        nonlocal current_words, current_label
        if current_words:
            units.append({"label": current_label, "words": current_words})
            current_words = []

    for ln in lines:
        if _UNIT_HEADER_RE.match(ln) and len(ln) < 80:
            flush()
            current_label = ln[:120]
            continue
        m = _WORD_LINE_RE.match(ln)
        if m:
            _append_word(current_words, seen, m.group(1).strip(), m.group(2).strip())
        elif re.match(r"^[A-Za-z][A-Za-z\-']{1,48}$", ln):
            _append_word(current_words, seen, ln, f"academic vocabulary: {ln}")
        else:
            tokens = _tokens_from_blob(ln)
            if len(tokens) >= 2:
                for token in tokens:
                    _append_word(current_words, seen, token, f"academic vocabulary: {token}")
            continue
        if len(current_words) >= _CHUNK_SIZE:
            flush()
            current_label = f"Unit {len(units) + 1}"

    flush()
    if not units:
        all_words: list[dict[str, Any]] = []
        blob_seen: set[str] = set()
        for ln in lines:
            m = _WORD_LINE_RE.match(ln)
            if m:
                _append_word(all_words, blob_seen, m.group(1).strip(), m.group(2).strip())
            else:
                for token in _tokens_from_blob(ln):
                    _append_word(all_words, blob_seen, token, f"academic vocabulary: {token}")
        for i in range(0, len(all_words), _CHUNK_SIZE):
            chunk = all_words[i : i + _CHUNK_SIZE]
            if chunk:
                units.append({"label": f"Unit {len(units) + 1}", "words": chunk})
    return units


def _parse_with_ai(text: str, *, pack_name: str = "") -> list[dict[str, Any]]:
    sample = text[:12000]
    system = (
        "You structure academic vocabulary lists for an EAP platform. "
        "Return JSON: {\"units\":[{\"label\":\"Unit 1\",\"words\":[{\"word\":\"analyze\","
        "\"prefix\":\"\",\"root\":\"lyz\",\"suffix\":\"\",\"core\":\"break apart to examine\","
        "\"method\":\"affix\",\"mnemonic\":null}]}]}. "
        "Each word must be ONE English headword only (no phrases). "
        "core must be a short gloss under 15 words. "
        "Split by chapters/units when headings exist; otherwise ~25 words per unit. "
        "Use affix breakdown when possible; mnemonic for opaque words."
    )
    user = f"Pack name: {pack_name or 'Vocabulary'}\n\nSource text:\n{sample}"
    payload = _ai_json(system, user)
    units = _normalize_units(payload)
    if units:
        return units
    raise RuntimeError("AI returned no vocabulary units")


def parse_vocabulary_upload(text: str, *, pack_name: str = "") -> list[dict[str, Any]]:
    """Parse extracted file text into units with raw word dicts for _word_entry()."""
    cleaned = clean_vocab_extracted_text(text)
    if not cleaned:
        return []
    if vocab_ai_available() and len(cleaned) > 80:
        try:
            return _parse_with_ai(cleaned, pack_name=pack_name)
        except Exception:
            pass
    return _parse_lines_rule_based(cleaned)
