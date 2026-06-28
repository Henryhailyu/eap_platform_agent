"""
Phase K2 — OpenAI-compatible AI client (OpenAI proxy + DeepSeek).

Secrets are read from environment variables only (see backend/.env locally or host dashboard).
Never import or log API keys in this module.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from eap_config import config

log = logging.getLogger("eap.ai")

_PROVIDER_ALIASES = {
    "openai": "openai",
    "gptsapi": "openai",
    "hunyuan": "openai",
    "tencent": "openai",
    "混元": "openai",
    "deepseek": "deepseek",
}

_DEFAULT_HUNYUAN_BASE = "https://api.hunyuan.cloud.tencent.com/v1"
_DEFAULT_HUNYUAN_MODEL = "hunyuan-turbos-latest"


def _normalize_provider(name: str | None) -> str:
    raw = (name or config.AI_PROVIDER or "openai").strip().lower()
    return _PROVIDER_ALIASES.get(raw, raw)


def _effective_provider(requested: str | None = None) -> str:
    """Pick a provider that has credentials (Hunyuan uses openai-compatible env vars)."""
    preferred = _normalize_provider(requested or config.AI_PROVIDER)
    if _provider_profile(preferred):
        return preferred
    if _provider_profile("openai"):
        return "openai"
    if _provider_profile("deepseek"):
        return "deepseek"
    return preferred


def _provider_profile(name: str | None = None) -> dict[str, Any] | None:
    provider = _normalize_provider(name)
    if provider == "deepseek":
        if not config.DEEPSEEK_API_KEY:
            return None
        return {
            "id": "deepseek",
            "api_key": config.DEEPSEEK_API_KEY,
            "base_url": config.DEEPSEEK_BASE_URL or "https://api.deepseek.com",
            "model": config.DEEPSEEK_MODEL or "deepseek-chat",
        }
    if provider == "openai":
        if not config.OPENAI_API_KEY:
            return None
        base = config.OPENAI_BASE_URL or ""
        model = config.OPENAI_MODEL or config.AI_MODEL or "gpt-4o-mini"
        if "hunyuan.cloud.tencent.com" in base and model == "gpt-4o-mini":
            model = _DEFAULT_HUNYUAN_MODEL
        if not base and model.startswith("hunyuan"):
            base = _DEFAULT_HUNYUAN_BASE
        return {
            "id": "openai",
            "api_key": config.OPENAI_API_KEY,
            "base_url": base or None,
            "model": model,
        }
    return None


def _provider_public(name: str) -> dict[str, Any]:
    profile = _provider_profile(name)
    provider = _normalize_provider(name)
    return {
        "id": provider,
        "configured": profile is not None,
        "model": profile["model"] if profile else (config.DEEPSEEK_MODEL if provider == "deepseek" else config.OPENAI_MODEL),
        "base_url_set": bool(profile and profile.get("base_url")) if profile else False,
    }


def ai_is_configured(provider: str | None = None) -> bool:
    if not config.AI_ENABLED:
        return False
    if provider:
        return _provider_profile(_normalize_provider(provider)) is not None
    return _provider_profile(_effective_provider()) is not None


def ai_public_status() -> dict[str, Any]:
    """Safe status for health/admin routes — never includes keys."""
    configured_provider = _effective_provider()
    active_profile = _provider_profile(configured_provider)
    return {
        "enabled": config.AI_ENABLED,
        "configured": ai_is_configured(),
        "configured_provider": configured_provider,
        "active_provider": _normalize_provider(config.AI_PROVIDER),
        "active_configured": active_profile is not None,
        "model": active_profile["model"] if active_profile else None,
        "openai_key_set": bool(config.OPENAI_API_KEY),
        "deepseek_key_set": bool(config.DEEPSEEK_API_KEY),
        "providers": {
            "deepseek": _provider_public("deepseek"),
            "openai": _provider_public("openai"),
        },
    }


def _is_hunyuan_profile(profile: dict[str, Any]) -> bool:
    return "hunyuan.cloud.tencent.com" in (profile.get("base_url") or "")


_HUNYUAN_MODEL_FALLBACKS = (
    "hunyuan-turbos-latest",
    "hunyuan-turbo-latest",
    "hunyuan-turbo",
)


def parse_ai_json_object(raw: str) -> dict[str, Any]:
    """Parse model JSON output; tolerate markdown fences and minor syntax issues."""
    text = str(raw or "").strip()
    if not text:
        raise ValueError("empty AI response")
    text = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", text, flags=re.IGNORECASE | re.MULTILINE).strip()
    start = text.find("{")
    end = text.rfind("}")
    candidates: list[str] = []
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])
    candidates.append(text)
    last_exc: json.JSONDecodeError | None = None
    for candidate in candidates:
        cleaned = re.sub(r",\s*}", "}", candidate)
        cleaned = re.sub(r",\s*]", "]", cleaned)
        for attempt in (candidate, cleaned):
            try:
                data = json.loads(attempt)
            except json.JSONDecodeError as exc:
                last_exc = exc
                continue
            if isinstance(data, dict):
                return data
    raise RuntimeError("AI returned invalid JSON") from last_exc


def format_ai_error(exc: Exception) -> str:
    """Short, safe error text for JSON responses (no API keys)."""
    try:
        from openai import APIStatusError

        if isinstance(exc, APIStatusError):
            code = getattr(exc, "status_code", None)
            body = getattr(exc, "body", None)
            if isinstance(body, dict):
                err = body.get("error")
                if isinstance(err, dict):
                    msg = err.get("message") or err.get("code")
                    if msg:
                        return f"{code}: {msg}"[:200]
                msg = body.get("message")
                if msg:
                    return f"{code}: {msg}"[:200]
            return f"HTTP {code}: {str(exc)}"[:200]
    except ImportError:
        pass
    text = str(exc).strip()
    return text[:200] if text else type(exc).__name__


def _should_try_next_model(exc: Exception) -> bool:
    text = format_ai_error(exc).lower()
    return (
        "model" in text
        and ("not found" in text or "not exist" in text or "invalid" in text or "unknown" in text)
    ) or "modelnotfound" in text.replace(" ", "")


def create_chat_completion(client, profile: dict[str, Any], **kwargs: Any):
    """Call chat.completions with Hunyuan extras and model fallbacks."""
    models: list[str] = []
    primary = (profile.get("model") or "").strip()
    if primary:
        models.append(primary)
    if _is_hunyuan_profile(profile):
        for name in _HUNYUAN_MODEL_FALLBACKS:
            if name not in models:
                models.append(name)

    last_exc: Exception | None = None
    for model in models:
        req = dict(kwargs)
        req["model"] = model
        if _is_hunyuan_profile(profile):
            req["extra_body"] = {"enable_enhancement": True}
        try:
            return client.chat.completions.create(**req)
        except Exception as exc:
            last_exc = exc
            log.warning("AI chat failed model=%s: %s", model, format_ai_error(exc))
            if not _should_try_next_model(exc) or model == models[-1]:
                raise
    if last_exc:
        raise last_exc
    raise RuntimeError("No AI model configured")


def get_openai_client(provider: str | None = None):
    resolved = _effective_provider(provider)
    profile = _provider_profile(resolved)
    if not profile:
        wanted = _normalize_provider(provider or config.AI_PROVIDER)
        raise RuntimeError(
            f"AI provider '{wanted}' is not configured "
            "(set EAP_OPENAI_API_KEY for Hunyuan or EAP_DEEPSEEK_API_KEY)"
        )
    from openai import OpenAI

    kwargs: dict[str, Any] = {"api_key": profile["api_key"], "timeout": 180.0}
    if profile.get("base_url"):
        kwargs["base_url"] = profile["base_url"]
    return OpenAI(**kwargs), profile


def ai_ping(provider: str | None = None) -> dict[str, Any]:
    """Minimal chat completion to verify key + base URL."""
    client, profile = get_openai_client(provider)
    response = create_chat_completion(
        client,
        profile,
        messages=[{"role": "user", "content": "Reply with exactly: EAP_OK"}],
        max_tokens=16,
        temperature=0,
    )
    text = ""
    if response.choices:
        text = (response.choices[0].message.content or "").strip()
    ok = text == "EAP_OK" or "EAP_OK" in text
    return {
        "ok": ok,
        "provider": profile["id"],
        "model": profile["model"],
        "sample": text[:120],
    }


_VOCAB_LEVELS = frozenset({"beginner", "intermediate", "advanced"})
_MAX_COACH_TEXT = 4000


def _coach_json_reply(
    system_prompt: str,
    user_prompt: str,
    json_keys: tuple[str, ...],
    provider: str | None = None,
    max_tokens: int = 900,
    extra_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import json

    if not json_keys:
        raise ValueError("json_keys required")

    client, profile = get_openai_client(provider)
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": system_prompt.strip()},
            {"role": "user", "content": user_prompt},
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

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI returned invalid JSON") from exc

    def pick(key: str) -> str:
        return str(payload.get(key) or "").strip()

    result: dict[str, Any] = {
        "provider": profile["id"],
        "model": profile["model"],
    }
    if extra_meta:
        result.update(extra_meta)
    for key in json_keys:
        result[key] = pick(key)
    return result


def module_coach_reply(
    module: str,
    text: str,
    level: str = "beginner",
    lang: str = "en",
    system_prompt: str | None = None,
    json_keys: tuple[str, ...] | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """Generic self-study coach reply using manager system prompt (Phase K2c)."""
    from self_study_ai_prompts import default_prompt, json_keys_for_module, normalize_module

    mod = normalize_module(module)
    keys = json_keys or json_keys_for_module(mod)
    if not keys:
        raise ValueError(f"module '{mod}' has no JSON schema")

    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        raise ValueError("text is required")
    if len(cleaned) > _MAX_COACH_TEXT:
        cleaned = cleaned[:_MAX_COACH_TEXT]

    lvl = str(level or "beginner").strip().lower()
    if lvl not in _VOCAB_LEVELS:
        lvl = "beginner"
    ui_lang = "zh" if str(lang or "en").strip().lower().startswith("zh") else "en"
    prompt = (system_prompt or default_prompt(mod)).strip()

    if mod == "vocabulary":
        user_prompt = (
            f"Explain the word '{cleaned}' for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}. "
            "Required: phonetic_ipa_uk must be accurate British English (RP) IPA in slashes "
            f"(e.g. /ˌænθrəpəˈdʒenɪk/ for '{cleaned}'). Never leave phonetic_ipa_uk empty."
        )
        meta = {"term": cleaned, "level": lvl, "module": mod}
    elif mod == "reading":
        user_prompt = (
            f"Analyse this reading passage for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}.\n\n"
            f"Passage:\n{cleaned}"
        )
        meta = {"level": lvl, "module": mod, "passage_preview": cleaned[:160]}
    elif mod == "writing":
        user_prompt = (
            f"Coach this writing sample for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}.\n\n"
            f"Sample text:\n{cleaned}"
        )
        meta = {"level": lvl, "module": mod, "sample_preview": cleaned[:160]}
    elif mod == "listening":
        user_prompt = (
            f"Analyse this lecture script for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}.\n\n"
            f"Script:\n{cleaned}"
        )
        meta = {"level": lvl, "module": mod, "script_preview": cleaned[:160]}
    elif mod == "speaking":
        user_prompt = (
            f"Coach this typed speaking response for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}.\n\n"
            f"Student response:\n{cleaned}"
        )
        meta = {"level": lvl, "module": mod, "response_preview": cleaned[:160]}
    else:
        user_prompt = (
            f"Coach this {mod} self-study content for a {lvl}-level EAP student. "
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}.\n\n"
            f"Content:\n{cleaned}"
        )
        meta = {"level": lvl, "module": mod}

    return _coach_json_reply(prompt, user_prompt, keys, provider=provider, extra_meta=meta)


def vocabulary_phonetic_uk(
    term: str,
    provider: str | None = None,
) -> str:
    """Lightweight British IPA lookup when the full vocabulary explain omits phonetic_ipa_uk."""
    cleaned = " ".join(str(term or "").split()).strip()
    if not cleaned:
        return ""
    prompt = (
        "You are a British English pronunciation lexicographer (Received Pronunciation). "
        "Return ONLY valid JSON with exactly one key: phonetic_ipa_uk. "
        "The value must be RP IPA wrapped in forward slashes, e.g. /ˌænθrəpəˈdʒenɪk/. "
        "Never leave phonetic_ipa_uk empty."
    )
    user_prompt = f"British English (RP) IPA for: {cleaned}"
    result = _coach_json_reply(
        prompt,
        user_prompt,
        ("phonetic_ipa_uk",),
        provider=provider,
        max_tokens=120,
    )
    return str(result.get("phonetic_ipa_uk") or "").strip()


def vocabulary_explain(
    term: str,
    level: str = "beginner",
    lang: str = "en",
    provider: str | None = None,
    system_prompt: str | None = None,
    json_keys: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Generate a structured vocabulary explanation for self-study (Phase K2)."""
    from self_study_ai_prompts import VOCABULARY_JSON_KEYS, default_prompt

    cleaned = " ".join(str(term or "").split()).strip()
    if not cleaned or len(cleaned) > 80:
        raise ValueError("term must be 1–80 characters")

    effective_prompt = (system_prompt or default_prompt("vocabulary")).strip()
    if "phonetic_ipa_uk" not in effective_prompt:
        effective_prompt += (
            "\n\nRequired JSON field phonetic_ipa_uk: British English (RP) IPA in slashes; never empty."
        )

    result = module_coach_reply(
        "vocabulary",
        cleaned,
        level=level,
        lang=lang,
        system_prompt=effective_prompt,
        json_keys=json_keys or VOCABULARY_JSON_KEYS,
        provider=provider,
    )
    ipa = str(result.get("phonetic_ipa_uk") or "").strip()
    if not ipa:
        try:
            ipa = vocabulary_phonetic_uk(cleaned, provider=provider)
            if ipa:
                result["phonetic_ipa_uk"] = ipa
        except Exception:
            pass
    return result


_MAX_TEACHING_SOURCE = 12_000


def generate_teaching_page_html(
    topic: str,
    source_text: str = "",
    level: str = "intermediate",
    lang: str = "en",
    custom_instructions: str = "",
    system_prompt: str | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """Generate a self-contained HTML teaching page for classroom use (Phase K3)."""
    from teacher_teaching_pages import (
        DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT,
        MAX_SOURCE_TEXT,
        normalize_level,
        sanitize_teaching_html,
    )

    cleaned_topic = " ".join(str(topic or "").split()).strip()
    if not cleaned_topic or len(cleaned_topic) > 200:
        raise ValueError("topic must be 1–200 characters")

    source = str(source_text or "").strip()
    if len(source) > MAX_SOURCE_TEXT:
        source = source[:MAX_SOURCE_TEXT]

    lvl = normalize_level(level)
    prompt = (system_prompt or DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT).strip()
    extra = str(custom_instructions or "").strip()[:800]

    user_parts = [
        "Create an EAP teaching page.",
        f"Lesson topic: {cleaned_topic}",
        f"Student level: {lvl}",
        "Language: English only for ALL visible text (titles, headings, body, vocabulary, "
        "instructions, and activities). Do NOT include Chinese characters, bilingual headings, "
        "or translations in parentheses.",
    ]
    if source:
        user_parts.append(f"Source material (adapt — do not copy verbatim if copyrighted):\n{source}")
    if extra:
        user_parts.append(f"Teacher instructions:\n{extra}")
    user_prompt = "\n\n".join(user_parts)

    client, profile = get_openai_client(provider)
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=8192,
        temperature=0.4,
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")

    html = sanitize_teaching_html(raw)
    from lesson_html_postprocess import postprocess_lesson_html

    html, warnings = postprocess_lesson_html(html, plan=None)
    return {
        "html": html,
        "title": cleaned_topic,
        "level": lvl,
        "provider": profile["id"],
        "model": profile["model"],
        "warnings": warnings,
    }


_MAX_LIVE_LESSON_TEXT = 9000

_LIVE_POLL_SYSTEM = """You are an EAP classroom facilitator. Given lesson HTML text, write ONE live poll question.
Return ONLY valid JSON:
{
  "textEn": "question in English",
  "textZh": "same as textEn",
  "optionsEn": ["option A", "option B", "option C", "option D"],
  "optionsZh": ["same as optionsEn"],
  "correctIndex": 0
}
Rules:
- Question and ALL options MUST be English only (no Chinese characters or bilingual glosses).
- Question MUST relate directly to the lesson topic and vocabulary (not generic academic-writing trivia).
- Poll = quick check of understanding or opinion; still pick one best answer (correctIndex 0-3).
- Exactly 3 or 4 options, distinct and plausible.
- Academic English suited to university EAP students."""

_LIVE_QUIZ_SYSTEM = """You are an EAP classroom teacher. Given lesson HTML text, write ONE multiple-choice quiz question.
Return ONLY valid JSON:
{
  "textEn": "question in English",
  "textZh": "same as textEn",
  "optionsEn": ["option A", "option B", "option C", "option D"],
  "optionsZh": ["same as optionsEn"],
  "correctIndex": 0
}
Rules:
- Question and ALL options MUST be English only (no Chinese characters or bilingual glosses).
- Question MUST test content from the lesson (facts, vocabulary, skills taught).
- Exactly one clearly correct answer (correctIndex 0-3).
- Exactly 3 or 4 options. No trick questions."""

_LIVE_GAME_SYSTEM = """You are an EAP classroom game designer. Given lesson HTML text, write ONE multiple-choice question for a team classroom game (board race, quiz battle, etc.).
Return ONLY valid JSON:
{
  "textEn": "question in English",
  "textZh": "same as textEn",
  "optionsEn": ["option A", "option B", "option C", "option D"],
  "optionsZh": ["same as optionsEn"],
  "correctIndex": 0
}
Rules:
- Question and ALL options MUST be English only (no Chinese characters or bilingual glosses).
- Question MUST relate directly to the lesson topic, vocabulary, or skills (not generic academic-writing trivia).
- Suitable for fast team competition (30–60 seconds).
- Exactly one clearly correct answer (correctIndex 0-3).
- Exactly 3 or 4 options, distinct and plausible.
- MUST NOT repeat or closely paraphrase any question listed under "Avoid these questions"."""


def _lesson_plain_text_from_html(html: str, max_chars: int = _MAX_LIVE_LESSON_TEXT) -> str:
    text = str(html or "")
    text = re.sub(r"(?is)<script[\s\S]*?</script>", " ", text)
    text = re.sub(r"(?is)<style[\s\S]*?</style>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        return text[:max_chars]
    return text


def _normalize_live_question_payload(data: dict[str, Any], tool: str) -> dict[str, Any]:
    from lesson_html_postprocess import strip_chinese_from_plain

    text_en = strip_chinese_from_plain(str(data.get("textEn") or data.get("question") or ""))
    if not text_en:
        raise ValueError("AI question missing textEn")
    opts_en = data.get("optionsEn") or data.get("options") or []
    if not isinstance(opts_en, list):
        opts_en = []
    options_en = [strip_chinese_from_plain(str(o)) for o in opts_en if strip_chinese_from_plain(str(o))][:4]
    if len(options_en) < 2:
        raise ValueError("AI question needs at least two options")
    try:
        correct = int(data.get("correctIndex", 0))
    except (TypeError, ValueError):
        correct = 0
    correct = max(0, min(correct, len(options_en) - 1))
    qid = f"ai-{tool}-generated"
    return {
        "id": qid,
        "textEn": text_en,
        "textZh": text_en,
        "optionsEn": options_en,
        "optionsZh": options_en[:],
        "correctIndex": correct,
        "source": "ai",
    }


def generate_live_question_from_html(
    html: str,
    *,
    tool: str = "poll",
    question_index: int = 0,
    avoid_questions: list[str] | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """Generate one poll/quiz/game MCQ from pushed lesson HTML (Live Teaching LT-M3)."""
    lesson_text = _lesson_plain_text_from_html(html)
    if len(lesson_text) < 80:
        raise ValueError("Lesson HTML has too little text to generate a question")

    kind = str(tool or "poll").strip().lower()
    if kind not in ("poll", "quiz", "game"):
        kind = "poll"
    if kind == "game":
        system = _LIVE_GAME_SYSTEM
    elif kind == "quiz":
        system = _LIVE_QUIZ_SYSTEM
    else:
        system = _LIVE_POLL_SYSTEM

    try:
        q_idx = int(question_index)
    except (TypeError, ValueError):
        q_idx = 0
    q_idx = max(0, q_idx)

    avoid_lines: list[str] = []
    for raw in avoid_questions or []:
        line = str(raw or "").strip()
        if line and line not in avoid_lines:
            avoid_lines.append(line)
    avoid_block = ""
    if avoid_lines:
        avoid_block = (
            "Avoid these questions (already used for poll, quiz, or other game rounds):\n"
            + "\n".join(f"- {line}" for line in avoid_lines[:16])
            + "\n\n"
        )

    user_prompt = (
        f"Tool: {kind}\n"
        f"Question number: {q_idx + 1}\n"
        f"{avoid_block}"
        f"Lesson text (from HTML on screen):\n{lesson_text}\n\n"
        "Write one question students can answer in 30–60 seconds."
    )

    client, profile = get_openai_client(provider)
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=900,
        temperature=0.35,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    payload = parse_ai_json_object(raw)
    question = _normalize_live_question_payload(payload, kind)
    return {
        "question": question,
        "tool": kind,
        "provider": profile["id"],
        "model": profile["model"],
    }


_VOCAB_HEADING = re.compile(
    r"(?i)(vocabulary|key\s+terms?|word\s+list|词汇|重点词|keyword|lexis|terminology|new\s+words?)"
)

_LIVE_VOCAB_TARGET = 24
_LIVE_VOCAB_MIN = 8

_BLOCKED_VOCAB_TERMS = frozenset({
    "word",
    "words",
    "term",
    "terms",
    "definition",
    "definitions",
    "example",
    "examples",
    "meaning",
    "meanings",
    "vocabulary",
    "title",
    "question",
    "answer",
    "free",
    "释义",
    "词汇",
    "单词",
    "词",
})

_PLACEHOLDER_DEFS = frozenset({
    "definition",
    "definition (释义)",
    "meaning",
    "word",
    "释义",
    "词汇",
    "单词",
})

_PLAIN_VOCAB_STOPWORDS = frozenset({
    "about",
    "above",
    "after",
    "again",
    "against",
    "also",
    "although",
    "among",
    "another",
    "because",
    "before",
    "being",
    "below",
    "between",
    "could",
    "does",
    "doing",
    "during",
    "each",
    "either",
    "enough",
    "every",
    "first",
    "further",
    "having",
    "however",
    "into",
    "itself",
    "later",
    "might",
    "never",
    "nothing",
    "often",
    "other",
    "perhaps",
    "rather",
    "second",
    "several",
    "shall",
    "should",
    "since",
    "something",
    "sometimes",
    "still",
    "such",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "though",
    "through",
    "under",
    "until",
    "very",
    "were",
    "what",
    "when",
    "where",
    "whether",
    "which",
    "while",
    "would",
    "your",
    "lesson",
    "students",
    "student",
    "teacher",
    "class",
    "classroom",
    "question",
    "activity",
    "section",
    "segment",
    "reading",
    "chapter",
    "title",
    "english",
    "language",
    "university",
    "academic",
    "writing",
    "learning",
    "discussion",
    "example",
    "group",
    "groups",
    "launch",
    "option",
    "options",
    "button",
    "reveal",
    "correct",
    "incorrect",
    "score",
    "slide",
    "slides",
    "content",
    "focus",
    "notes",
    "summary",
    "objective",
    "objectives",
    "material",
    "materials",
})


def _is_valid_game_vocab_term(term: str, def_en: str) -> bool:
    """Keep only letter-based EAP vocabulary suitable for bingo/matching."""
    term = re.sub(r"\s+", " ", str(term or "")).strip()
    def_en = re.sub(r"\s+", " ", str(def_en or "")).strip()
    if not term or not def_en or len(term) > 64 or len(def_en) > 200:
        return False
    t_key = term.lower()
    d_key = def_en.lower()
    if t_key in _BLOCKED_VOCAB_TERMS or d_key in _PLACEHOLDER_DEFS:
        return False
    if re.search(r"(?i)definition\s*[\(（].*释义", def_en):
        return False
    if t_key in d_key and len(def_en) < 24:
        return False
    if re.search(r"\d", term):
        return False
    if re.search(r"[°±×÷/\\@#$%^&*+=<>{}[\]|~`]", term):
        return False
    if not re.match(r"^[a-zA-Z][a-zA-Z\s'\-]*$", term):
        return False
    if len(term.replace("-", "").replace(" ", "")) < 3:
        return False
    if len(def_en) < 10:
        return False
    return True


def _filter_vocab_pairs(pairs: list[dict[str, str]]) -> list[dict[str, str]]:
    return [p for p in pairs if _is_valid_game_vocab_term(p.get("term", ""), p.get("defEn", ""))]


def _strip_html_tags(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(text or ""))).strip()


def _vocab_from_interaction_slots(slots: list[Any]) -> list[dict[str, str]]:
    """Extract term/definition pairs from lesson-plan word-definition MCQ slots."""
    pairs: list[dict[str, str]] = []
    for slot in slots or []:
        if not isinstance(slot, dict):
            continue
        q = str(
            slot.get("text")
            or slot.get("textEn")
            or slot.get("label")
            or slot.get("question")
            or ""
        )
        word_match = re.search(r"""\bword\s+['"]([^'"\n]+)['"]""", q, re.I)
        if not word_match:
            word_match = re.search(r"""\bterm\s+['"]([^'"\n]+)['"]""", q, re.I)
        if not word_match:
            continue
        term = re.sub(r"\s+", " ", word_match.group(1)).strip()
        opts = slot.get("options") or slot.get("optionsEn") or []
        if not isinstance(opts, list) or not opts:
            continue
        idx = slot.get("correctIndex")
        if not isinstance(idx, int) or idx < 0 or idx >= len(opts):
            idx = 0
        def_en = re.sub(r"^[A-Da-d][.)]\s*", "", str(opts[idx] or "")).strip()
        if term and def_en and _is_valid_game_vocab_term(term, def_en):
            pairs.append({"term": term, "defEn": def_en, "defZh": def_en})
    return pairs


def _parse_vocab_pairs_from_html(html: str) -> list[dict[str, str]]:
    """Best-effort extraction of term/definition pairs from lesson HTML."""
    raw = str(html or "")
    pairs: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(term: str, def_en: str, def_zh: str = "") -> None:
        from lesson_html_postprocess import strip_chinese_from_plain

        term = strip_chinese_from_plain(re.sub(r"\s+", " ", term).strip())
        def_en = strip_chinese_from_plain(re.sub(r"\s+", " ", def_en).strip())
        def_zh = strip_chinese_from_plain((def_zh or def_en).strip())
        if not _is_valid_game_vocab_term(term, def_en):
            return
        key = term.lower()
        if key in seen:
            return
        seen.add(key)
        pairs.append({"term": term, "defEn": def_en, "defZh": def_zh})

    meta_m = re.search(
        r'(?is)<script[^>]*\bid\s*=\s*["\']eap-lesson-meta["\'][^>]*>([\s\S]*?)</script>',
        raw,
    )
    if meta_m:
        try:
            meta_data = json.loads(meta_m.group(1))
            if isinstance(meta_data, dict):
                for item in meta_data.get("vocabulary") or []:
                    if isinstance(item, dict):
                        add(
                            str(item.get("term") or item.get("word") or ""),
                            str(item.get("defEn") or item.get("definition") or item.get("def") or ""),
                        )
                for item in _vocab_from_interaction_slots(meta_data.get("interaction_slots") or []):
                    add(item["term"], item["defEn"], item.get("defZh") or item["defEn"])
        except json.JSONDecodeError:
            pass

    for m in re.finditer(
        r"(?is)<dt[^>]*>([\s\S]*?)</dt>\s*<dd[^>]*>([\s\S]*?)</dd>",
        raw,
    ):
        add(_strip_html_tags(m.group(1)), _strip_html_tags(m.group(2)))

    for m in re.finditer(r"(?is)<tr[^>]*>([\s\S]*?)</tr>", raw):
        cells = re.findall(r"(?is)<t[dh][^>]*>([\s\S]*?)</t[dh]>", m.group(1))
        if len(cells) >= 2:
            add(_strip_html_tags(cells[0]), _strip_html_tags(cells[1]))

    for m in re.finditer(r"(?is)<li[^>]*>([\s\S]*?)</li>", raw):
        block = m.group(1)
        strong = re.search(r"(?is)<(?:strong|b)[^>]*>([\s\S]*?)</(?:strong|b)>", block)
        if not strong:
            continue
        term = _strip_html_tags(strong.group(1))
        rest = block.replace(strong.group(0), " ")
        rest = re.sub(r"^[:\-–—]\s*", "", _strip_html_tags(rest)).strip()
        if rest:
            add(term, rest)

    for m in re.finditer(r"(?is)<p[^>]*>([\s\S]*?)</p>", raw):
        block = m.group(1)
        strong = re.search(r"(?is)<(?:strong|b|em)[^>]*>([\s\S]*?)</(?:strong|b|em)>", block)
        if not strong:
            continue
        term = _strip_html_tags(strong.group(1))
        rest = block.replace(strong.group(0), " ")
        rest = re.sub(r"^[:\-–—]\s*", "", _strip_html_tags(rest)).strip()
        if term and rest:
            add(term, rest)

    for m in re.finditer(
        r"(?is)<(?:mark|span)[^>]*(?:class\s*=\s*['\"][^'\"]*(?:key-term|vocab-term)[^'\"]*['\"]|data-vocab-term)[^>]*>([\s\S]*?)</(?:mark|span)>",
        raw,
    ):
        term = _strip_html_tags(m.group(1))
        if not term:
            continue
        add(term, f"{term.capitalize()} — key vocabulary from this lesson")

    for hm in re.finditer(r"(?is)<h[23][^>]*>([\s\S]*?)</h[23]>", raw):
        heading = _strip_html_tags(hm.group(1))
        if not _VOCAB_HEADING.search(heading):
            continue
        start = hm.end()
        next_h = re.search(r"(?is)<h[23][^>]*>", raw[start:])
        section = raw[start : start + next_h.start()] if next_h else raw[start : start + 12000]
        plain = _strip_html_tags(section)
        for line in re.split(r"[\n\r]+", plain):
            line = line.strip()
            if not line or len(line) < 4:
                continue
            for sep in (" — ", " – ", " - ", ": "):
                if sep in line:
                    left, right = line.split(sep, 1)
                    add(left, right)
                    break

    return pairs


def _normalize_vocab_terms(items: list[Any]) -> list[dict[str, str]]:
    from lesson_html_postprocess import strip_chinese_from_plain

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        term = strip_chinese_from_plain(str(raw.get("term") or raw.get("word") or ""))
        def_en = strip_chinese_from_plain(
            str(raw.get("defEn") or raw.get("definition") or raw.get("def") or "")
        )
        def_zh = def_en
        if not term or not def_en:
            continue
        if not _is_valid_game_vocab_term(term, def_en):
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"term": term, "defEn": def_en, "defZh": def_zh})
    return out


def _merge_vocab_terms(primary: list[dict[str, str]], extra: list[dict[str, str]]) -> list[dict[str, str]]:
    merged = _normalize_vocab_terms(primary)
    seen = {p["term"].lower() for p in merged}
    for item in _normalize_vocab_terms(extra):
        key = item["term"].lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def _pad_vocab_terms(terms: list[dict[str, str]], target: int) -> list[dict[str, str]]:
    if not terms:
        return []
    out: list[dict[str, str]] = []
    for i in range(target):
        src = terms[i % len(terms)]
        out.append(
            {
                "term": src["term"],
                "defEn": src["defEn"],
                "defZh": src.get("defZh") or src["defEn"],
            }
        )
    return out


def _extract_vocab_from_lesson_plain(html: str, *, max_terms: int = 24) -> list[dict[str, str]]:
    """Frequency-based fallback: academic-ish words from lesson body text."""
    from collections import Counter

    plain = _lesson_plain_text_from_html(html)
    words = re.findall(r"\b[a-z]{5,}\b", plain.lower())
    freq = Counter(words)
    pairs: list[dict[str, str]] = []
    seen: set[str] = set()
    for word, _count in freq.most_common(500):
        if word in _BLOCKED_VOCAB_TERMS or word in _PLAIN_VOCAB_STOPWORDS:
            continue
        def_en = "Important vocabulary from this lesson"
        if not _is_valid_game_vocab_term(word, def_en):
            continue
        if word in seen:
            continue
        seen.add(word)
        pairs.append({"term": word, "defEn": def_en, "defZh": def_en})
        if len(pairs) >= max_terms:
            break
    return pairs


def extract_live_vocab_from_html(
    html: str,
    *,
    hint_terms: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Extract vocabulary from lesson HTML only (no AI)."""
    parsed = _filter_vocab_pairs(_parse_vocab_pairs_from_html(html))
    hints = _normalize_vocab_terms(hint_terms or [])
    parsed = _merge_vocab_terms(parsed, hints)
    if len(parsed) < _LIVE_VOCAB_MIN:
        parsed = _merge_vocab_terms(parsed, _extract_vocab_from_lesson_plain(html))
    if len(parsed) < _LIVE_VOCAB_MIN:
        raise ValueError("Not enough vocabulary found in lesson HTML")
    return {
        "terms": _pad_vocab_terms(parsed, _LIVE_VOCAB_TARGET),
        "source": "html",
        "count": min(len(parsed), _LIVE_VOCAB_TARGET),
    }


_LIVE_VOCAB_SYSTEM = """You are an EAP vocabulary specialist. Given lesson HTML text, produce vocabulary for classroom games (bingo + matching).
Return ONLY valid JSON:
{
  "terms": [
    {"term": "word or phrase", "defEn": "short English definition", "defZh": "same as defEn"}
  ]
}
Rules:
- FIRST use vocabulary explicitly listed in the lesson (especially any vocabulary / key terms section).
- If the lesson has fewer than 24 items, add important EAP terms or short collocations from the lesson until you have exactly 24.
- Terms and definitions MUST be English only — no Chinese characters, no bilingual glosses, no translations in parentheses.
- Terms MUST be English words or short phrases (1–4 words) made of letters, spaces, and hyphens only.
- NEVER include numbers, units, measurements, dates, statistics, symbols, or placeholders (e.g. never "word", "term", "definition").
- NEVER use table headers or template labels as terms or definitions.
- Each defEn MUST be a real English definition/clue (at least 10 characters), never placeholder text like "Definition (释义)".
- Pick one useful form per idea (prefer nouns); avoid duplicate roots (e.g. do not list both "innovation" and "innovations").
- Each definition: one short phrase (under 14 words), suitable as a bingo clue read aloud.
- Terms must be distinct academic/EAP vocabulary from the lesson topic.
- Exactly 24 items."""


def generate_live_vocab_from_html(
    html: str,
    *,
    hint_terms: list[dict[str, Any]] | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """Extract or AI-generate vocabulary term/definition pairs from lesson HTML."""
    parsed = _filter_vocab_pairs(_parse_vocab_pairs_from_html(html))
    hints = _normalize_vocab_terms(hint_terms or [])
    parsed = _merge_vocab_terms(parsed, hints)
    if len(parsed) < _LIVE_VOCAB_MIN:
        parsed = _merge_vocab_terms(parsed, _extract_vocab_from_lesson_plain(html))

    if len(parsed) >= _LIVE_VOCAB_MIN:
        return {
            "terms": _pad_vocab_terms(parsed, _LIVE_VOCAB_TARGET),
            "source": "html",
            "count": min(len(parsed), _LIVE_VOCAB_TARGET),
        }

    lesson_text = _lesson_plain_text_from_html(html)
    if len(lesson_text) < 80 and len(parsed) < _LIVE_VOCAB_MIN:
        raise ValueError("Lesson HTML has too little text to generate vocabulary")

    hint_block = ""
    if parsed:
        hint_block = (
            "Terms already found in the HTML (keep these; add more from the lesson to reach 24):\n"
            + "\n".join(f"- {p['term']}: {p['defEn']}" for p in parsed[:20])
            + "\n\n"
        )

    user_prompt = (
        f"{hint_block}"
        f"Lesson text (from HTML on screen):\n{lesson_text}\n\n"
        "Return exactly 24 term/definition pairs for classroom vocabulary games."
    )

    client, profile = get_openai_client(provider)
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": _LIVE_VOCAB_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2200,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    payload = parse_ai_json_object(raw)
    ai_terms = _normalize_vocab_terms(payload.get("terms") or payload.get("vocabulary") or [])
    merged = _merge_vocab_terms(parsed, ai_terms)

    if len(merged) < _LIVE_VOCAB_MIN:
        raise ValueError("AI vocabulary list is too short")

    source = "html+ai" if parsed else "ai"

    return {
        "terms": merged[:_LIVE_VOCAB_TARGET],
        "source": source,
        "count": min(len(merged), _LIVE_VOCAB_TARGET),
        "provider": profile["id"],
        "model": profile["model"],
    }
