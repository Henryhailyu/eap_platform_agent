"""
Phase K2b — manager-configurable AI prompts for self-study modules.
"""
from __future__ import annotations

from datetime import datetime, timezone

SELF_STUDY_AI_MODULES = frozenset({"vocabulary", "reading", "listening", "speaking", "writing"})

VOCABULARY_JSON_KEYS = (
    "phonetic_ipa_uk",
    "definition_en",
    "definition_zh",
    "synonyms_en",
    "antonyms_en",
    "eap_usage_en",
    "eap_usage_zh",
    "word_root",
    "collocation",
    "derived_words",
    "example_en",
    "example_zh",
    "memory_tip_en",
    "memory_tip_zh",
)

READING_JSON_KEYS = (
    "summary_en",
    "summary_zh",
    "key_idea_en",
    "key_idea_zh",
    "vocabulary_tip_en",
    "vocabulary_tip_zh",
)

LISTENING_JSON_KEYS = (
    "gist_en",
    "gist_zh",
    "note_taking_tip_en",
    "note_taking_tip_zh",
    "key_phrases",
)

SPEAKING_JSON_KEYS = (
    "feedback_en",
    "feedback_zh",
    "fluency_tip_en",
    "fluency_tip_zh",
    "sample_phrase_en",
    "sample_phrase_zh",
)

WRITING_JSON_KEYS = (
    "feedback_en",
    "feedback_zh",
    "structure_tip_en",
    "structure_tip_zh",
    "language_tip_en",
    "language_tip_zh",
)

MODULE_JSON_KEYS: dict[str, tuple[str, ...]] = {
    "vocabulary": VOCABULARY_JSON_KEYS,
    "reading": READING_JSON_KEYS,
    "listening": LISTENING_JSON_KEYS,
    "speaking": SPEAKING_JSON_KEYS,
    "writing": WRITING_JSON_KEYS,
}


DEFAULT_READING_SYSTEM_PROMPT = (
    "You are an EAP reading coach for IELTS-aligned university prep. "
    "Return ONLY valid JSON with exactly these keys: "
    + ", ".join(READING_JSON_KEYS)
    + ". "
    "Field rules: "
    "summary_en/zh — 2–3 sentence summary of the passage; "
    "key_idea_en/zh — one sentence main idea; "
    "vocabulary_tip_en/zh — 2–3 useful academic words/phrases from the passage with brief gloss. "
    "Use academic register suited to the student's level."
)

DEFAULT_VOCABULARY_SYSTEM_PROMPT = (
    "You are an EAP vocabulary coach for IELTS-aligned university prep. "
    "Return ONLY valid JSON with exactly these keys: "
    + ", ".join(VOCABULARY_JSON_KEYS)
    + ". "
    "Field rules: "
    "phonetic_ipa_uk — British English IPA in slashes, e.g. /ˈmɪtɪɡeɪt/; "
    "definition_en/zh — concise academic definition (1–2 sentences); "
    "synonyms_en — comma-separated near-synonyms for academic writing; "
    "antonyms_en — comma-separated antonyms, or empty string if none; "
    "eap_usage_en/zh — one sentence on how the word is used in EAP/academic texts; "
    "word_root — explain root, prefix, or suffix when useful, else a brief etymology note (empty string if N/A); "
    "collocation — one natural academic phrase using the word; "
    "derived_words — comma-separated related forms (e.g. analysis, analytical); "
    "example_en/zh — one academic example sentence; "
    "memory_tip_en/zh — short memorisation strategy. "
    "Use academic register suited to the student's level."
)

DEFAULT_WRITING_SYSTEM_PROMPT = (
    "You are an EAP writing coach for IELTS-aligned university prep. "
    "Return ONLY valid JSON with exactly these keys: "
    + ", ".join(WRITING_JSON_KEYS)
    + ". "
    "Field rules: "
    "feedback_en/zh — 2–3 sentences on strengths and one improvement area for the sample text; "
    "structure_tip_en/zh — one sentence on paragraph or essay structure; "
    "language_tip_en/zh — one academic language or cohesion tip tied to the sample. "
    "Use academic register suited to the student's level."
)

DEFAULT_LISTENING_SYSTEM_PROMPT = (
    "You are an EAP listening coach for IELTS-aligned university prep. "
    "Return ONLY valid JSON with exactly these keys: "
    + ", ".join(LISTENING_JSON_KEYS)
    + ". "
    "Field rules: "
    "gist_en/zh — 2–3 sentence summary of the lecture script; "
    "note_taking_tip_en/zh — one practical note-taking strategy for this script; "
    "key_phrases — comma-separated 3–5 signpost or topic phrases from the script. "
    "Use academic register suited to the student's level."
)

DEFAULT_SPEAKING_SYSTEM_PROMPT = (
    "You are an EAP speaking coach for IELTS-aligned university prep. "
    "Return ONLY valid JSON with exactly these keys: "
    + ", ".join(SPEAKING_JSON_KEYS)
    + ". "
    "Field rules: "
    "feedback_en/zh — 2–3 sentences on the student's typed response (strengths + one improvement); "
    "fluency_tip_en/zh — one tip on fluency, organisation, or discussion language; "
    "sample_phrase_en/zh — one upgraded academic phrase the student could use. "
    "Be concise and encouraging."
)

DEFAULT_MODULE_PROMPTS: dict[str, str] = {
    "vocabulary": DEFAULT_VOCABULARY_SYSTEM_PROMPT,
    "reading": DEFAULT_READING_SYSTEM_PROMPT,
    "listening": DEFAULT_LISTENING_SYSTEM_PROMPT,
    "speaking": DEFAULT_SPEAKING_SYSTEM_PROMPT,
    "writing": DEFAULT_WRITING_SYSTEM_PROMPT,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_module(module: str | None) -> str:
    mod = str(module or "").strip().lower()
    if mod not in SELF_STUDY_AI_MODULES:
        raise ValueError("invalid module")
    return mod


def coach_modules_with_api() -> frozenset[str]:
    """Modules with a student-facing AI coach route in this release."""
    return frozenset({"vocabulary", "reading", "writing", "listening", "speaking"})


def json_keys_for_module(module: str) -> tuple[str, ...]:
    mod = normalize_module(module)
    return MODULE_JSON_KEYS.get(mod, ())


def default_prompt(module: str) -> str:
    mod = normalize_module(module)
    return DEFAULT_MODULE_PROMPTS.get(mod, DEFAULT_VOCABULARY_SYSTEM_PROMPT)


def prompt_row_to_dict(row) -> dict:
    mod = row["module"]
    return {
        "module": mod,
        "system_prompt": row["system_prompt"],
        "is_default": bool(row["is_default"]),
        "updated_by": row["updated_by"] or "",
        "updated_at": row["updated_at"] or "",
    }


def get_prompt(conn, module: str) -> dict:
    mod = normalize_module(module)
    row = conn.execute(
        "SELECT module, system_prompt, is_default, updated_by, updated_at "
        "FROM self_study_ai_prompts WHERE module = ?",
        (mod,),
    ).fetchone()
    if row is None:
        return {
            "module": mod,
            "system_prompt": default_prompt(mod),
            "is_default": True,
            "updated_by": "",
            "updated_at": "",
        }
    return prompt_row_to_dict(row)


def list_prompts(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT module, system_prompt, is_default, updated_by, updated_at "
        "FROM self_study_ai_prompts ORDER BY module"
    ).fetchall()
    saved = {r["module"]: prompt_row_to_dict(r) for r in rows}
    out = []
    for mod in sorted(SELF_STUDY_AI_MODULES):
        out.append(saved.get(mod) or get_prompt(conn, mod))
    return out


def save_prompt(conn, module: str, system_prompt: str, updated_by: str) -> dict:
    mod = normalize_module(module)
    text = str(system_prompt or "").strip()
    if len(text) < 20:
        raise ValueError("system_prompt is too short")
    if len(text) > 8000:
        raise ValueError("system_prompt exceeds 8000 characters")
    is_default = 1 if text == default_prompt(mod) else 0
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO self_study_ai_prompts (module, system_prompt, is_default, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(module) DO UPDATE SET
            system_prompt = excluded.system_prompt,
            is_default = excluded.is_default,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
        """,
        (mod, text, is_default, updated_by or "", now),
    )
    conn.commit()
    return get_prompt(conn, mod)


def reset_prompt(conn, module: str, updated_by: str) -> dict:
    mod = normalize_module(module)
    conn.execute("DELETE FROM self_study_ai_prompts WHERE module = ?", (mod,))
    conn.commit()
    return get_prompt(conn, mod)


def seed_default_prompts(conn) -> None:
    now = _now_iso()
    for mod in SELF_STUDY_AI_MODULES:
        existing = conn.execute(
            "SELECT module FROM self_study_ai_prompts WHERE module = ?",
            (mod,),
        ).fetchone()
        if existing:
            continue
        conn.execute(
            """
            INSERT INTO self_study_ai_prompts (module, system_prompt, is_default, updated_by, updated_at)
            VALUES (?, ?, 1, 'system', ?)
            """,
            (mod, default_prompt(mod), now),
        )
