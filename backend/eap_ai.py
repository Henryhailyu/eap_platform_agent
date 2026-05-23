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
    "deepseek": "deepseek",
}


def _normalize_provider(name: str | None) -> str:
    raw = (name or config.AI_PROVIDER or "deepseek").strip().lower()
    return _PROVIDER_ALIASES.get(raw, raw)


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
        return {
            "id": "openai",
            "api_key": config.OPENAI_API_KEY,
            "base_url": config.OPENAI_BASE_URL or None,
            "model": config.OPENAI_MODEL or config.AI_MODEL or "gpt-4o-mini",
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
        return _provider_profile(provider) is not None
    if _provider_profile(config.AI_PROVIDER):
        return True
    return _provider_profile("deepseek") is not None or _provider_profile("openai") is not None


def ai_public_status() -> dict[str, Any]:
    """Safe status for health/admin routes — never includes keys."""
    active = _normalize_provider(config.AI_PROVIDER)
    active_profile = _provider_profile(active)
    return {
        "enabled": config.AI_ENABLED,
        "configured": ai_is_configured(),
        "active_provider": active,
        "active_configured": active_profile is not None,
        "model": active_profile["model"] if active_profile else None,
        "providers": {
            "deepseek": _provider_public("deepseek"),
            "openai": _provider_public("openai"),
        },
    }


def get_openai_client(provider: str | None = None):
    profile = _provider_profile(provider)
    if not profile:
        wanted = _normalize_provider(provider or config.AI_PROVIDER)
        raise RuntimeError(f"AI provider '{wanted}' is not configured")
    from openai import OpenAI

    kwargs: dict[str, Any] = {"api_key": profile["api_key"]}
    if profile.get("base_url"):
        kwargs["base_url"] = profile["base_url"]
    return OpenAI(**kwargs), profile


def ai_ping(provider: str | None = None) -> dict[str, Any]:
    """Minimal chat completion to verify key + base URL."""
    client, profile = get_openai_client(provider)
    response = client.chat.completions.create(
        model=profile["model"],
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


def vocabulary_explain(
    term: str,
    level: str = "beginner",
    lang: str = "en",
    provider: str | None = None,
) -> dict[str, Any]:
    """Generate a structured vocabulary explanation for self-study (Phase K2)."""
    import json

    cleaned = " ".join(str(term or "").split()).strip()
    if not cleaned or len(cleaned) > 80:
        raise ValueError("term must be 1–80 characters")

    lvl = str(level or "beginner").strip().lower()
    if lvl not in _VOCAB_LEVELS:
        lvl = "beginner"
    ui_lang = "zh" if str(lang or "en").strip().lower().startswith("zh") else "en"

    system_prompt = (
        "You are an EAP vocabulary coach for IELTS-aligned university prep. "
        "Return ONLY valid JSON with exactly these keys: "
        "definition_en, definition_zh, example_en, example_zh, collocation, "
        "memory_tip_en, memory_tip_zh. "
        "Keep each value concise (1–2 short sentences). Use academic register. "
        "Collocation should be one natural phrase using the word."
    )
    user_prompt = (
        f"Explain the word '{cleaned}' for a {lvl}-level EAP student. "
        f"Primary UI language: {'Chinese' if ui_lang == 'zh' else 'English'}."
    )

    client, profile = get_openai_client(provider)
    response = client.chat.completions.create(
        model=profile["model"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=700,
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

    return {
        "term": cleaned,
        "level": lvl,
        "provider": profile["id"],
        "model": profile["model"],
        "definition_en": pick("definition_en"),
        "definition_zh": pick("definition_zh"),
        "example_en": pick("example_en"),
        "example_zh": pick("example_zh"),
        "collocation": pick("collocation"),
        "memory_tip_en": pick("memory_tip_en"),
        "memory_tip_zh": pick("memory_tip_zh"),
    }
