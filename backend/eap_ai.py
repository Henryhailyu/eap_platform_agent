"""
Phase K2 — OpenAI-compatible AI client (OpenAI proxy + DeepSeek).

Secrets are read from environment variables only (see backend/.env locally or host dashboard).
Never import or log API keys in this module.
"""
from __future__ import annotations

import logging
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
            f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}."
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


def vocabulary_explain(
    term: str,
    level: str = "beginner",
    lang: str = "en",
    provider: str | None = None,
    system_prompt: str | None = None,
    json_keys: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Generate a structured vocabulary explanation for self-study (Phase K2)."""
    from self_study_ai_prompts import VOCABULARY_JSON_KEYS

    cleaned = " ".join(str(term or "").split()).strip()
    if not cleaned or len(cleaned) > 80:
        raise ValueError("term must be 1–80 characters")

    return module_coach_reply(
        "vocabulary",
        cleaned,
        level=level,
        lang=lang,
        system_prompt=system_prompt,
        json_keys=json_keys or VOCABULARY_JSON_KEYS,
        provider=provider,
    )


_MAX_TEACHING_SOURCE = 6000


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
    ui_lang = "zh" if str(lang or "en").strip().lower().startswith("zh") else "en"
    prompt = (system_prompt or DEFAULT_TEACHING_PAGE_SYSTEM_PROMPT).strip()
    extra = str(custom_instructions or "").strip()[:800]

    user_parts = [
        f"Create an EAP teaching page.",
        f"Lesson topic: {cleaned_topic}",
        f"Student level: {lvl}",
        f"Primary UI language for headings and instructions: {'Chinese' if ui_lang == 'zh' else 'English'}.",
        "Teaching content body may mix EN with brief zh glosses if UI language is Chinese.",
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
        max_tokens=4096,
        temperature=0.45,
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")

    html = sanitize_teaching_html(raw)
    return {
        "html": html,
        "title": cleaned_topic,
        "level": lvl,
        "provider": profile["id"],
        "model": profile["model"],
    }
