"""
SS-V1 — Self-study vocabulary (Channel A packs + Channel B AI course).
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from flask import Response, jsonify, request
from werkzeug.utils import secure_filename

from self_study import CHANNEL_B_ONLY
from self_study_vocabulary_ai import (
    clean_vocab_extracted_text,
    is_academic_vocab_word,
    parse_vocabulary_upload,
)
from teaching_page_source_files import (
    allowed_source_extension,
    extract_text_from_bytes,
    normalize_extracted_text,
)

VOCAB_SKILL = "vocabulary"
CHANNEL_A_DAILY_WORDS = 30

DAY1_SEED_WORDS: list[dict[str, Any]] = [
    {"word": "precursor", "prefix": "pre", "root": "cur", "suffix": "or", "core": "one that runs ahead", "method": "affix"},
    {"word": "analyze", "prefix": "", "root": "lyz", "suffix": "", "core": "break apart to examine", "method": "affix"},
    {"word": "hypothesis", "prefix": "", "root": "thes", "suffix": "is", "core": "proposed explanation", "method": "affix"},
    {"word": "mitigate", "prefix": "", "root": "mit", "suffix": "ate", "core": "make less severe", "method": "affix"},
    {"word": "subsequent", "prefix": "sub", "root": "sequ", "suffix": "ent", "core": "following after", "method": "affix"},
    {"word": "coherent", "prefix": "co", "root": "her", "suffix": "ent", "core": "sticking together logically", "method": "affix"},
    {"word": "implication", "prefix": "im", "root": "plic", "suffix": "ation", "core": "something folded in / a consequence", "method": "affix"},
    {"word": "framework", "prefix": "", "root": "frame", "suffix": "work", "core": "structural support for ideas", "method": "affix"},
    {"word": "phenomenon", "prefix": "", "root": "phen", "suffix": "on", "core": "observable fact or event", "method": "affix"},
    {"word": "criteria", "prefix": "", "root": "crit", "suffix": "eria", "core": "standards for judgment", "method": "affix"},
    {"word": "allocate", "prefix": "al", "root": "loc", "suffix": "ate", "core": "assign to a place", "method": "affix"},
    {"word": "ambiguous", "prefix": "ambi", "root": "gu", "suffix": "ous", "core": "open to more than one meaning", "method": "affix"},
    {"word": "comprehensive", "prefix": "com", "root": "prehens", "suffix": "ive", "core": "covering broadly", "method": "affix"},
    {"word": "inevitable", "prefix": "in", "root": "evit", "suffix": "able", "core": "cannot be avoided", "method": "affix"},
    {"word": "paradigm", "prefix": "para", "root": "dig", "suffix": "m", "core": "model or pattern", "method": "affix"},
    {"word": "synthesis", "prefix": "syn", "root": "thes", "suffix": "is", "core": "combining into a whole", "method": "affix"},
    {"word": "validity", "prefix": "", "root": "valid", "suffix": "ity", "core": "soundness or strength", "method": "affix"},
    {"word": "correlation", "prefix": "cor", "root": "rel", "suffix": "ation", "core": "mutual relationship", "method": "affix"},
    {"word": "demographic", "prefix": "demo", "root": "graph", "suffix": "ic", "core": "population characteristics", "method": "affix"},
    {"word": "infrastructure", "prefix": "infra", "root": "struct", "suffix": "ure", "core": "underlying foundation", "method": "affix"},
    {"word": "methodology", "prefix": "", "root": "method", "suffix": "ology", "core": "system of methods", "method": "affix"},
    {"word": "perspective", "prefix": "per", "root": "spect", "suffix": "ive", "core": "way of seeing", "method": "affix"},
    {"word": "predominant", "prefix": "pre", "root": "domin", "suffix": "ant", "core": "most influential", "method": "affix"},
    {"word": "relevant", "prefix": "re", "root": "lev", "suffix": "ant", "core": "closely connected", "method": "affix"},
    {"word": "significant", "prefix": "sign", "root": "ific", "suffix": "ant", "core": "meaningful or notable", "method": "affix"},
    {"word": "underlie", "prefix": "under", "root": "lie", "suffix": "", "core": "form the basis of", "method": "affix"},
    {"word": "variable", "prefix": "", "root": "vari", "suffix": "able", "core": "likely to change", "method": "affix"},
    {"word": "whereas", "prefix": "where", "root": "as", "suffix": "", "core": "contrast connector", "method": "affix"},
    {"word": "nevertheless", "prefix": "never", "root": "the", "suffix": "less", "core": "in spite of that", "method": "mixed"},
    {"word": "chrysanthemum", "prefix": "", "root": "", "suffix": "", "core": "a type of flower", "method": "mnemonic",
     "mnemonic": "cry + san(三) + the + mum → mum with three mums holding chrysanthemums"},
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _word_entry(raw: dict[str, Any]) -> dict[str, Any]:
    w = str(raw.get("word") or "").strip()
    method = str(raw.get("method") or "affix")
    entry: dict[str, Any] = {
        "word": w,
        "phonetic": raw.get("phonetic") or "",
        "coreMeaning": raw.get("core") or raw.get("coreMeaning") or "",
        "methodPrimary": method,
        "affix": {
            "prefix": raw.get("prefix") or "",
            "root": raw.get("root") or "",
            "suffix": raw.get("suffix") or "",
            "gloss": raw.get("core") or "",
        },
        "mnemonic": raw.get("mnemonic"),
        "examples": raw.get("examples") or [
            f"The study examines how {w} affects academic outcomes."
        ],
    }
    return entry


def _usable_meaning(wd: dict[str, Any]) -> str | None:
    meaning = str(wd.get("coreMeaning") or wd.get("core") or "").strip()
    if not meaning:
        return None
    low = meaning.lower()
    word = str(wd.get("word") or "").strip().lower()
    if low.startswith("academic vocabulary:") or low == f"academic vocabulary: {word}":
        return None
    if len(meaning) > 180 or len(meaning.split()) > 22:
        return None
    return meaning


def _filter_study_words(words: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for wd in words:
        w = str(wd.get("word") or "").strip()
        if not is_academic_vocab_word(w):
            continue
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(wd)
    return out


def _clean_prompt_meaning(text: str) -> str:
    """Strip trailing punctuation so prompts read «…?» not «….?»."""
    s = " ".join(str(text or "").split()).strip()
    while s and s[-1] in ".!?;:":
        s = s[:-1].rstrip()
    return s


def _is_boilerplate_example(text: str) -> bool:
    low = str(text or "").lower()
    return "affects academic outcomes" in low or "the study examines how" in low


def _shuffle_options(correct: str, pool: list[str]) -> tuple[list[str], int]:
    import random

    distractors = [x for x in pool if x != correct]
    random.shuffle(distractors)
    options = [correct] + distractors[:3]
    random.shuffle(options)
    return options, options.index(correct)


def _exam_meaning_channel_a(wd: dict[str, Any]) -> str | None:
    """Channel A exam gloss — never use auto-generated example sentences as definitions."""
    meaning = _usable_meaning(wd)
    if meaning:
        return _clean_prompt_meaning(meaning)
    raw = str(wd.get("coreMeaning") or wd.get("core") or "").strip()
    if raw and not raw.lower().startswith("academic vocabulary:") and not _is_boilerplate_example(raw):
        return _clean_prompt_meaning(raw[:120])
    mnemonic = str(wd.get("mnemonic") or "").strip()
    if mnemonic:
        return _clean_prompt_meaning(mnemonic[:120])
    for ex in wd.get("examples") or []:
        s = str(ex).strip()
        if s and not _is_boilerplate_example(s):
            return _clean_prompt_meaning(s[:120])
    aff = wd.get("affix") or {}
    parts = [aff.get("prefix"), aff.get("root"), aff.get("suffix")]
    hint = "+".join(p for p in parts if p)
    if hint and hint != wd.get("word"):
        return f"built from parts: {hint}"
    return None


def _gloss_for_channel_a_game(wd: dict[str, Any]) -> str | None:
    """Star Battle / Speed Race — real gloss only (no affix-stem fallbacks)."""
    meaning = _usable_meaning(wd)
    if meaning:
        return _clean_prompt_meaning(meaning)
    return None


def _enrich_channel_a_words(words: list[dict]) -> list[dict]:
    """Fill missing Channel A glosses via AI so games and exams use real definitions."""
    import copy

    from self_study_vocabulary_ai import enrich_vocab_meanings

    words = copy.deepcopy(_filter_study_words(words))
    if not words:
        return words
    raw_units = [
        {
            "label": "batch",
            "words": [
                {
                    "word": wd.get("word"),
                    "core": wd.get("coreMeaning") or wd.get("core"),
                    "prefix": (wd.get("affix") or {}).get("prefix"),
                    "root": (wd.get("affix") or {}).get("root"),
                    "suffix": (wd.get("affix") or {}).get("suffix"),
                    "method": wd.get("methodPrimary"),
                    "mnemonic": wd.get("mnemonic"),
                }
                for wd in words
            ],
        }
    ]
    try:
        enriched = enrich_vocab_meanings(raw_units)
        gloss_by_word = {
            str(w["word"]).lower(): str(w.get("core") or "")
            for w in (enriched[0].get("words") or [])
            if w.get("word")
        }
        for wd in words:
            g = gloss_by_word.get(str(wd.get("word")).lower())
            if g and _usable_meaning({"coreMeaning": g, "word": wd.get("word")}):
                wd["coreMeaning"] = g
    except Exception:
        pass
    return words


def _meaning_for_channel_b(wd: dict[str, Any]) -> str:
    return _clean_prompt_meaning(wd.get("coreMeaning") or wd.get("word") or "")


def _practice_for_words(words: list[dict], *, channel: str = "B") -> list[dict]:
    """Classic practice — up to 15 items covering the word list (games handle speed rounds)."""
    out: list[dict] = []
    if channel == "A":
        words = _filter_study_words(words)
    word_list = [wd["word"] for wd in words]
    for i, wd in enumerate(words[:15]):
        w = wd["word"]
        meaning = _meaning_for_channel_b(wd) if channel == "B" else (_exam_meaning_channel_a(wd) or w)
        aff = wd.get("affix") or {}
        parts = [aff.get("prefix"), aff.get("root"), aff.get("suffix")]
        affix_hint = "+".join(p for p in parts if p) or w[:4]
        if i % 3 == 0:
            options, correct_idx = _shuffle_options(w, word_list)
            out.append(
                {
                    "id": f"vp{i + 1}",
                    "type": "meaning_mcq",
                    "promptEn": f"Which word means: {meaning}?",
                    "promptZh": f"哪个词表示：{meaning}？",
                    "options": options,
                    "correctIndex": correct_idx,
                }
            )
        elif i % 3 == 1:
            collocation = f"conduct a detailed _____ of the data"
            options, correct_idx = _shuffle_options(w, word_list)
            out.append(
                {
                    "id": f"vp{i + 1}",
                    "type": "collocation_mcq",
                    "promptEn": f"Best fit: {collocation.replace('_____', '______')}",
                    "promptZh": f"最佳搭配：{collocation.replace('_____', '______')}",
                    "options": options,
                    "correctIndex": correct_idx,
                    "hintEn": meaning,
                    "hintZh": meaning,
                }
            )
        else:
            options, correct_idx = _shuffle_options(w, word_list)
            affix_prompt = (
                f"Affix pattern {affix_hint} → which word?"
                if channel == "A"
                else f"Affix pattern «{affix_hint}» → which word?"
            )
            affix_prompt_zh = (
                f"词缀 {affix_hint} → 哪个词？"
                if channel == "A"
                else f"词缀 «{affix_hint}» → 哪个词？"
            )
            out.append(
                {
                    "id": f"vp{i + 1}",
                    "type": "affix_drill",
                    "promptEn": affix_prompt,
                    "promptZh": affix_prompt_zh,
                    "options": options,
                    "correctIndex": correct_idx,
                }
            )
    return out


_VOCAB_GAP_TEMPLATES = (
    "Scholars must understand _____ before analysing the dataset.",
    "The seminar focused on how _____ shapes academic writing.",
    "Students practised using _____ in a formal paragraph.",
    "The reading explained the role of _____ in the field.",
    "Researchers must _____ the data carefully.",
    "The lecture highlighted how _____ affects policy design.",
)


def _exam_shell(day_number: int, mcq_items, fill_items, match_pairs) -> dict[str, Any]:
    import random

    match_options = [p["right"] for p in match_pairs]
    random.shuffle(match_options)
    order_parts = [
        "In conclusion, the evidence supports a cautious policy response.",
        "For example, peer-reviewed studies document similar trends across regions.",
        "Therefore, universities should embed explicit vocabulary instruction in EAP courses.",
        "This paragraph argues that academic vocabulary underpins clear scholarly communication.",
    ]
    writing_prompt = (
        "Write a 150-word academic English paragraph using at least five words from today's list. "
        "Include: (1) a clear topic sentence, (2) one supporting reason, (3) a concrete example, "
        "and (4) a brief summary sentence. Use formal EAP register."
    )
    return {
        "titleEn": f"Day {day_number} vocabulary practice exam",
        "titleZh": f"第 {day_number} 天词汇小测",
        "sections": [
            {"type": "mcq", "titleEn": "Section A — Multiple choice", "items": mcq_items},
            {"type": "fill", "titleEn": "Section B — Gap fill", "items": fill_items},
            {
                "type": "match",
                "titleEn": "Section C — Match word to meaning",
                "items": [{"id": "match1", "pairs": match_pairs, "matchOptions": match_options}],
            },
            {
                "type": "order",
                "titleEn": "Section D — Put sentences in logical order",
                "items": [
                    {
                        "id": "order1",
                        "promptEn": "Drag to order: topic → support → example → conclusion.",
                        "parts": order_parts,
                        "correctOrder": [3, 2, 1, 0],
                    }
                ],
            },
            {
                "type": "writing",
                "titleEn": "Section E — Academic paragraph (150 words)",
                "items": [{"id": "writing1", "promptEn": writing_prompt}],
            },
        ],
    }


def _build_practice_exam_channel_b(words: list[dict], day_number: int) -> dict[str, Any]:
    """Channel B — stable AI-course exam (do not change when fixing Channel A)."""
    import random

    pool = list(words)
    random.shuffle(pool)
    word_list = [w["word"] for w in words]
    mcq_items: list[dict] = []
    fill_items: list[dict] = []
    fill_idx = 0
    for i, wd in enumerate(pool[:8]):
        w = wd["word"]
        meaning = _meaning_for_channel_b(wd)
        others = [x for x in word_list if x != w]
        opts, ci = _shuffle_options(w, others)
        if i < 5:
            mcq_items.append(
                {
                    "id": f"mcq{i + 1}",
                    "promptEn": f"Which word means: {meaning}?",
                    "promptZh": f"哪个词表示：{meaning}？",
                    "options": opts,
                    "correctIndex": ci,
                    "answer": w,
                }
            )
        else:
            template = _VOCAB_GAP_TEMPLATES[fill_idx % len(_VOCAB_GAP_TEMPLATES)]
            fill_idx += 1
            fill_items.append(
                {
                    "id": f"fill{i - 4}",
                    "promptEn": f"Gap fill — meaning: {meaning}. {template}",
                    "answer": w,
                }
            )
    match_pairs = [
        {"left": wd["word"], "right": _meaning_for_channel_b(wd)} for wd in pool[:6]
    ]
    random.shuffle(match_pairs)
    return _exam_shell(day_number, mcq_items, fill_items, match_pairs)


_CHANNEL_A_GAP_TEMPLATES = _VOCAB_GAP_TEMPLATES


def _build_practice_exam_channel_a(words: list[dict], day_number: int) -> dict[str, Any]:
    """Channel A — school-material packs; separate from Channel B."""
    import random

    words = _enrich_channel_a_words(words)

    pool = list(words)
    random.shuffle(pool)
    word_list = [w["word"] for w in words]
    mcq_items: list[dict] = []
    fill_items: list[dict] = []
    fill_idx = 0
    for i, wd in enumerate(pool[:8]):
        w = wd["word"]
        meaning = _exam_meaning_channel_a(wd)
        others = [x for x in word_list if x != w]
        opts, ci = _shuffle_options(w, others)
        if i < 5:
            if meaning:
                mcq_items.append(
                    {
                        "id": f"mcq{i + 1}",
                        "promptEn": f"Which word matches this definition: {meaning}?",
                        "promptZh": f"哪个词与释义 {meaning} 相符？",
                        "options": opts,
                        "correctIndex": ci,
                        "answer": w,
                    }
                )
            else:
                aff = wd.get("affix") or {}
                hint = "+".join(x for x in [aff.get("prefix"), aff.get("root"), aff.get("suffix")] if x) or w[:4]
                mcq_items.append(
                    {
                        "id": f"mcq{i + 1}",
                        "promptEn": f"Affix pattern {hint} → which word from today's list?",
                        "promptZh": f"词缀 {hint} → 今日词表中的哪个词？",
                        "options": opts,
                        "correctIndex": ci,
                        "answer": w,
                    }
                )
        elif meaning:
            template = _CHANNEL_A_GAP_TEMPLATES[fill_idx % len(_CHANNEL_A_GAP_TEMPLATES)]
            fill_idx += 1
            fill_items.append(
                {
                    "id": f"fill{fill_idx}",
                    "promptEn": f"Gap fill — meaning: {meaning}. {template.replace('_____', '______')}",
                    "answer": w,
                }
            )
    match_pairs = [
        {"left": wd["word"], "right": m}
        for wd in pool[:8]
        if (m := _exam_meaning_channel_a(wd))
    ][:6]
    random.shuffle(match_pairs)
    return _exam_shell(day_number, mcq_items, fill_items, match_pairs)


def _build_practice_exam(words: list[dict], day_number: int, *, channel: str = "B") -> dict[str, Any]:
    if channel == "A":
        return _build_practice_exam_channel_a(words, day_number)
    return _build_practice_exam_channel_b(words, day_number)


def _vocab_writing_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _vocab_writing_word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", text or ""))


def _exam_target_words(exam: dict) -> list[str]:
    words: set[str] = set()
    for section in exam.get("sections") or []:
        st = section.get("type")
        for item in section.get("items") or []:
            if st == "mcq":
                ans = item.get("answer")
                if ans:
                    words.add(str(ans).strip())
                else:
                    opts = item.get("options") or []
                    ci = int(item.get("correctIndex") or 0)
                    if 0 <= ci < len(opts):
                        words.add(str(opts[ci]).strip())
            elif st == "fill":
                if item.get("answer"):
                    words.add(str(item["answer"]).strip())
            elif st == "match":
                for pair in item.get("pairs") or []:
                    if pair.get("left"):
                        words.add(str(pair["left"]).strip())
    return sorted(w for w in words if w)


def _writing_prompt_from_exam(exam: dict) -> str:
    for section in exam.get("sections") or []:
        if section.get("type") != "writing":
            continue
        for item in section.get("items") or []:
            prompt = str(item.get("promptEn") or item.get("prompt") or "").strip()
            if prompt:
                return prompt
    return (
        "Write a 150-word academic English paragraph using at least five words from today's list. "
        "Include: (1) a clear topic sentence, (2) one supporting reason, (3) a concrete example, "
        "and (4) a brief summary sentence. Use formal EAP register."
    )


def _fallback_vocab_writing_feedback(draft: str, prompt: str, target_words: list[str]) -> dict[str, Any]:
    wc = _vocab_writing_word_count(draft)
    low = draft.lower()
    used = [w for w in target_words if w.lower() in low]
    missed = [w for w in target_words if w.lower() not in low][:8]
    connectors = ("however", "therefore", "for example", "in addition", "furthermore", "in conclusion")
    has_connector = any(c in low for c in connectors)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", draft) if p.strip()]
    strengths: list[str] = []
    priorities: list[str] = []
    if wc >= 120:
        strengths.append(f"Word count is on target ({wc} words).")
    elif wc >= 80:
        priorities.append(f"Expand toward ~150 words (currently {wc}).")
    else:
        priorities.append(f"Paragraph is too short ({wc} words); aim for 120–180.")
    if used:
        strengths.append(f"Used target vocabulary: {', '.join(used[:6])}.")
    if missed:
        priorities.append(f"Try weaving in: {', '.join(missed[:5])}.")
    if has_connector:
        strengths.append("Uses cohesive linking devices.")
    else:
        priorities.append("Add connectors (e.g. therefore, for example, in conclusion).")
    if len(paragraphs) >= 1:
        strengths.append("Clear paragraph structure detected.")
    rubric = {
        "topicSentence": "Check your opening sentence states the main idea clearly.",
        "supportingReason": "Ensure one explicit reason supports the topic sentence.",
        "example": "Add a concrete example to illustrate your point.",
        "summary": "End with a brief summary sentence (no new ideas).",
        "vocabUse": (
            f"Used {len(used)} of {len(target_words)} target words."
            if target_words
            else "Include at least five words from today's list."
        ),
        "register": "Maintain formal EAP register — avoid contractions and slang.",
    }
    summary_en = (
        f"You submitted {wc} words. "
        + (" ".join(strengths[:2]) if strengths else "Keep developing your academic paragraph.")
        + (" Focus on: " + "; ".join(priorities[:2]) + "." if priorities else "")
    )
    return {
        "wordCount": wc,
        "summaryEn": summary_en,
        "summaryZh": (
            f"共 {wc} 词。"
            + (" ".join(priorities[:2]) if priorities else "继续完善学术段落结构。")
        ),
        "strengths": strengths,
        "priorities": priorities,
        "rubric": rubric,
        "wordsUsed": used,
        "wordsMissed": missed,
        "source": "rule",
        "promptEn": prompt,
    }


def _generate_vocab_writing_feedback(
    draft: str, *, exam: dict, target_words: list[str] | None = None
) -> dict[str, Any]:
    prompt = _writing_prompt_from_exam(exam)
    words = target_words if target_words is not None else _exam_target_words(exam)
    if not draft.strip():
        return {
            "wordCount": 0,
            "summaryEn": "No writing submitted.",
            "summaryZh": "未提交写作内容。",
            "strengths": [],
            "priorities": ["Write a 150-word paragraph following the prompt."],
            "rubric": {},
            "wordsUsed": [],
            "wordsMissed": words[:8],
            "source": "empty",
            "promptEn": prompt,
        }
    if not _vocab_writing_ai_available():
        return _fallback_vocab_writing_feedback(draft, prompt, words)

    system = (
        "You are an EAP writing tutor marking a short 150-word academic paragraph practice. "
        "Evaluate against the prompt and today's vocabulary list. "
        "Return ONLY valid JSON with keys: "
        "summaryEn (2-4 sentences), summaryZh (Chinese mirror), "
        "strengths (string array), priorities (string array), "
        "rubric {topicSentence, supportingReason, example, summary, vocabUse, register} "
        "(each value: one sentence of specific feedback), "
        "wordsUsed (target words found in draft), wordsMissed (important target words absent)."
    )
    user = (
        f"Prompt:\n{prompt}\n\n"
        f"Target vocabulary ({len(words)} words): {', '.join(words[:40])}\n\n"
        f"Student draft ({_vocab_writing_word_count(draft)} words):\n{draft[:12000]}"
    )
    try:
        from eap_ai import create_chat_completion, get_openai_client

        client, profile = get_openai_client()
        response = create_chat_completion(
            client,
            profile,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=2200,
            temperature=0.35,
            response_format={"type": "json_object"},
        )
        raw = ""
        if response.choices:
            raw = (response.choices[0].message.content or "").strip()
        if not raw:
            raise RuntimeError("Empty AI response")
        data = json.loads(raw)
        return {
            "wordCount": _vocab_writing_word_count(draft),
            "summaryEn": str(data.get("summaryEn") or "").strip(),
            "summaryZh": str(data.get("summaryZh") or "").strip(),
            "strengths": list(data.get("strengths") or []),
            "priorities": list(data.get("priorities") or []),
            "rubric": dict(data.get("rubric") or {}),
            "wordsUsed": list(data.get("wordsUsed") or []),
            "wordsMissed": list(data.get("wordsMissed") or []),
            "source": "ai",
            "promptEn": prompt,
        }
    except Exception:
        return _fallback_vocab_writing_feedback(draft, prompt, words)


def _grade_practice_exam(exam: dict, answers: dict) -> dict[str, Any]:
    score = 0
    total = 0
    results: list[dict[str, Any]] = []
    for section in exam.get("sections") or []:
        st = section.get("type")
        section_title = section.get("titleEn") or st or ""
        if st in ("mcq", "fill"):
            for item in section.get("items") or []:
                total += 1
                iid = item.get("id")
                row: dict[str, Any] = {
                    "id": iid,
                    "sectionType": st,
                    "sectionTitle": section_title,
                    "promptEn": item.get("promptEn") or item.get("prompt") or "",
                    "promptZh": item.get("promptZh") or "",
                }
                if st == "mcq":
                    opts = item.get("options") or []
                    ci = int(item.get("correctIndex") or 0)
                    chosen_idx = answers.get(iid)
                    try:
                        chosen_idx = int(chosen_idx) if chosen_idx is not None else None
                    except (TypeError, ValueError):
                        chosen_idx = None
                    ok = chosen_idx is not None and chosen_idx == ci
                    correct_answer = item.get("answer") or (opts[ci] if 0 <= ci < len(opts) else "")
                    your_answer = opts[chosen_idx] if chosen_idx is not None and 0 <= chosen_idx < len(opts) else ""
                    row.update(
                        {
                            "correct": ok,
                            "yourAnswer": your_answer,
                            "correctAnswer": correct_answer,
                        }
                    )
                    if ok:
                        score += 1
                else:
                    given = str(answers.get(iid) or "").strip()
                    expect = str(item.get("answer") or "").strip()
                    ok = bool(given) and given.lower() == expect.lower()
                    row.update(
                        {
                            "correct": ok,
                            "yourAnswer": given,
                            "correctAnswer": expect,
                        }
                    )
                    if ok:
                        score += 1
                results.append(row)
        elif st == "match":
            for item in section.get("items") or []:
                iid = item.get("id")
                for pair in item.get("pairs") or []:
                    total += 1
                    left = pair.get("left") or ""
                    key = f"{iid}:{left}"
                    expect = pair.get("right") or ""
                    given = str(answers.get(key) or "").strip()
                    ok = bool(given) and given == expect
                    results.append(
                        {
                            "id": f"{iid}:{left}",
                            "sectionType": "match",
                            "sectionTitle": section_title,
                            "promptEn": f"Match «{left}» to its meaning",
                            "correct": ok,
                            "yourAnswer": given,
                            "correctAnswer": expect,
                        }
                    )
                    if ok:
                        score += 1
        elif st == "order":
            for item in section.get("items") or []:
                total += 1
                iid = item.get("id")
                parts = item.get("parts") or []
                given = answers.get(iid)
                expect = item.get("correctOrder")
                ok = False
                if isinstance(given, list) and isinstance(expect, list) and given == expect:
                    ok = True
                elif not expect and given:
                    ok = True
                your_order = (
                    [parts[i] for i in given if isinstance(i, int) and 0 <= i < len(parts)]
                    if isinstance(given, list)
                    else []
                )
                correct_order = (
                    [parts[i] for i in expect if isinstance(i, int) and 0 <= i < len(parts)]
                    if isinstance(expect, list)
                    else list(parts)
                )
                results.append(
                    {
                        "id": iid,
                        "sectionType": "order",
                        "sectionTitle": section_title,
                        "promptEn": item.get("promptEn") or "Put sentences in logical order",
                        "correct": ok,
                        "yourAnswer": your_order,
                        "correctAnswer": correct_order,
                    }
                )
                if ok:
                    score += 1
        elif st == "writing":
            pass
    writing_text = str(answers.get("writing") or "").strip()
    writing_feedback: dict[str, Any] | None = None
    if writing_text or any(s.get("type") == "writing" for s in exam.get("sections") or []):
        writing_feedback = _generate_vocab_writing_feedback(writing_text, exam=exam)
        wc = int(writing_feedback.get("wordCount") or 0)
        if 120 <= wc <= 180:
            score += 2
            total += 2
        elif wc >= 80:
            score += 1
            total += 2
        else:
            total += 2
    return {
        "score": score,
        "total": max(total, 1),
        "results": results,
        "writingFeedback": writing_feedback,
    }


def _game_rounds_for_words(words: list[dict], *, channel: str = "B") -> dict[str, Any]:
    """Payload for Star Battle + Speed Race front-end games."""
    import random

    study_words = _enrich_channel_a_words(words) if channel == "A" else list(words)
    rounds = []
    pool = list(study_words)
    random.shuffle(pool)
    for i, wd in enumerate(pool[:20]):
        w = wd["word"]
        if channel == "A":
            correct_meaning = _gloss_for_channel_a_game(wd)
            if not correct_meaning:
                continue
            distractors: list[str] = []
            seen = {correct_meaning.lower()}
            for owd in study_words:
                if owd["word"] == w:
                    continue
                gloss = _gloss_for_channel_a_game(owd)
                if gloss and gloss.lower() not in seen:
                    seen.add(gloss.lower())
                    distractors.append(gloss)
            if len(distractors) < 3:
                continue
            options, correct_idx = _shuffle_options(correct_meaning, distractors)
            rounds.append(
                {
                    "id": f"vg{i + 1}",
                    "word": w,
                    "promptEn": f"Select the meaning of: {w}",
                    "promptZh": f"选择含义：{w}",
                    "options": options,
                    "correctIndex": correct_idx,
                    "mode": "meaning_pick",
                }
            )
        else:
            meaning = wd.get("coreMeaning") or w
            others = [x["word"] for x in words if x["word"] != w]
            random.shuffle(others)
            options, correct_idx = _shuffle_options(w, others)
            rounds.append(
                {
                    "id": f"vg{i + 1}",
                    "word": w,
                    "promptEn": meaning,
                    "promptZh": meaning,
                    "options": options,
                    "correctIndex": correct_idx,
                    "mode": "collocation" if i % 4 == 1 else "meaning",
                }
            )
    return {
        "rounds": rounds,
        "timeLimitSec": 45,
        "lives": 3,
    }


def _practice_progress_payload(prog) -> dict[str, Any]:
    out: dict[str, Any] = {
        "learnDone": bool(prog and prog["learn_done"]),
        "practiceDone": bool(prog and prog["practice_done"]),
        "practiceScore": prog["practice_score"] if prog else None,
        "practiceScoreTotal": prog["practice_score_total"] if prog else None,
        "practiceResult": None,
    }
    if prog:
        raw_result = None
        try:
            if "practice_result_json" in prog.keys():
                raw_result = prog["practice_result_json"]
        except Exception:
            raw_result = None
        if raw_result:
            try:
                out["practiceResult"] = json.loads(raw_result)
            except (TypeError, json.JSONDecodeError):
                pass
    return out


def _vocab_day_payload(
    *,
    course,
    day_row,
    words: list[dict],
    practice: list[dict],
    prog,
    sched: dict,
) -> dict[str, Any]:
    if not practice:
        practice = _practice_for_words(words)
    return {
        "channel": "B",
        "courseId": course["id"],
        "dayNumber": int(day_row["day_number"]),
        "schedule": sched,
        "newWords": bool(sched.get("newWords", True)),
        "words": words,
        "wordCount": len(words),
        "practice": practice,
        "games": _game_rounds_for_words(words),
        "progress": _practice_progress_payload(prog),
    }


def migrate_self_study_vocabulary_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_material_packs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            class_name TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_material_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_id INTEGER NOT NULL,
            unit_label TEXT NOT NULL,
            unit_order INTEGER NOT NULL DEFAULT 0,
            words_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (pack_id) REFERENCES vocab_material_packs(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            start_date TEXT,
            total_days INTEGER NOT NULL DEFAULT 30,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_course_days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            words_json TEXT NOT NULL,
            practice_json TEXT,
            UNIQUE(course_id, day_number),
            FOREIGN KEY (course_id) REFERENCES vocab_courses(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_vocab_pack_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            unit_id INTEGER NOT NULL,
            completed_at TEXT NOT NULL,
            UNIQUE(student_username, unit_id),
            FOREIGN KEY (unit_id) REFERENCES vocab_material_units(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_vocab_day_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            course_id INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            learn_done INTEGER NOT NULL DEFAULT 0,
            practice_done INTEGER NOT NULL DEFAULT 0,
            practice_score INTEGER,
            completed_at TEXT,
            UNIQUE(student_username, course_id, day_number),
            FOREIGN KEY (course_id) REFERENCES vocab_courses(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_vocab_word_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            word_normalized TEXT NOT NULL,
            course_id INTEGER,
            first_seen_at TEXT NOT NULL,
            UNIQUE(student_username, word_normalized)
        )
        """
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(student_vocab_day_progress)").fetchall()}
    if "practice_score_total" not in cols:
        conn.execute(
            "ALTER TABLE student_vocab_day_progress ADD COLUMN practice_score_total INTEGER"
        )
    if "practice_result_json" not in cols:
        conn.execute("ALTER TABLE student_vocab_day_progress ADD COLUMN practice_result_json TEXT")
    unit_cols = {row[1] for row in conn.execute("PRAGMA table_info(vocab_material_units)").fetchall()}
    if "practice_json" not in unit_cols:
        conn.execute("ALTER TABLE vocab_material_units ADD COLUMN practice_json TEXT")
    if "games_json" not in unit_cols:
        conn.execute("ALTER TABLE vocab_material_units ADD COLUMN games_json TEXT")
    pack_cols = {row[1] for row in conn.execute("PRAGMA table_info(vocab_material_packs)").fetchall()}
    if "source_filename" not in pack_cols:
        conn.execute("ALTER TABLE vocab_material_packs ADD COLUMN source_filename TEXT")
    if "push_selected" not in pack_cols:
        conn.execute(
            "ALTER TABLE vocab_material_packs ADD COLUMN push_selected INTEGER NOT NULL DEFAULT 0"
        )
    ca_cols = {row[1] for row in conn.execute("PRAGMA table_info(vocab_channel_a_state)").fetchall()}
    if ca_cols and "pack_ids_json" not in ca_cols:
        conn.execute("ALTER TABLE vocab_channel_a_state ADD COLUMN pack_ids_json TEXT")
    pack_prog_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(student_vocab_pack_progress)").fetchall()
    }
    if "practice_done" not in pack_prog_cols:
        conn.execute("ALTER TABLE student_vocab_pack_progress ADD COLUMN practice_done INTEGER NOT NULL DEFAULT 0")
    if "practice_score" not in pack_prog_cols:
        conn.execute("ALTER TABLE student_vocab_pack_progress ADD COLUMN practice_score INTEGER")
    if "practice_score_total" not in pack_prog_cols:
        conn.execute("ALTER TABLE student_vocab_pack_progress ADD COLUMN practice_score_total INTEGER")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_pack_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_id INTEGER NOT NULL,
            word_order INTEGER NOT NULL,
            word_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (pack_id) REFERENCES vocab_material_packs(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_channel_a_state (
            class_name TEXT PRIMARY KEY,
            pack_id INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (pack_id) REFERENCES vocab_material_packs(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vocab_channel_a_days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            pack_id INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            words_json TEXT NOT NULL,
            practice_json TEXT,
            games_json TEXT,
            UNIQUE(class_name, day_number),
            FOREIGN KEY (pack_id) REFERENCES vocab_material_packs(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_vocab_channel_a_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            class_name TEXT NOT NULL,
            day_number INTEGER NOT NULL,
            learn_done INTEGER NOT NULL DEFAULT 0,
            practice_done INTEGER NOT NULL DEFAULT 0,
            practice_score INTEGER,
            practice_score_total INTEGER,
            completed_at TEXT,
            UNIQUE(student_username, class_name, day_number)
        )
        """
    )
    ca_prog_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(student_vocab_channel_a_progress)").fetchall()
    }
    if "practice_result_json" not in ca_prog_cols:
        conn.execute(
            "ALTER TABLE student_vocab_channel_a_progress ADD COLUMN practice_result_json TEXT"
        )

    _backfill_pack_words_from_units(conn)
    seed_default_vocab_course(conn)


def _backfill_pack_words_from_units(conn) -> None:
    packs = conn.execute(
        "SELECT id FROM vocab_material_packs WHERE is_active = 1"
    ).fetchall()
    for pack in packs:
        pack_id = int(pack["id"])
        if _pack_word_count(conn, pack_id) > 0:
            continue
        rows = conn.execute(
            """
            SELECT words_json FROM vocab_material_units
            WHERE pack_id = ?
            ORDER BY unit_order ASC, id ASC
            """,
            (pack_id,),
        ).fetchall()
        if not rows:
            continue
        units: list[dict[str, Any]] = []
        for row in rows:
            words = json.loads(row["words_json"])
            if words:
                units.append({"label": "Imported", "words": words})
        if units:
            _sync_pack_word_bank(conn, pack_id, units, replace=True)


def _exam_max_total(exam: dict) -> int:
    """Maximum scorable items for a practice exam (writing section counts as 2)."""
    total = 0
    for section in exam.get("sections") or []:
        st = section.get("type")
        if st in ("mcq", "fill"):
            total += len(section.get("items") or [])
        elif st == "match":
            for item in section.get("items") or []:
                total += len(item.get("pairs") or [])
        elif st == "order":
            total += len(section.get("items") or [])
        elif st == "writing":
            total += 2
    return max(total, 1)


def seed_default_vocab_course(conn) -> None:
    existing = conn.execute(
        "SELECT id FROM vocab_courses WHERE class_name = ? AND status = 'active' LIMIT 1",
        ("EAP047",),
    ).fetchone()
    if existing:
        return
    now = _now_iso()
    start = _today_utc().isoformat()
    conn.execute(
        """
        INSERT INTO vocab_courses (class_name, title, status, start_date, total_days, version, created_at, updated_at)
        VALUES (?, ?, 'active', ?, 30, 1, ?, ?)
        """,
        ("EAP047", "EAP047 Academic Vocabulary — Month 1", start, now, now),
    )
    course_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    words_day1 = [_word_entry(w) for w in DAY1_SEED_WORDS]
    practice = _practice_for_words(words_day1)
    conn.execute(
        """
        INSERT INTO vocab_course_days (course_id, day_number, words_json, practice_json)
        VALUES (?, 1, ?, ?)
        """,
        (course_id, json.dumps(words_day1, ensure_ascii=False), json.dumps(practice, ensure_ascii=False)),
    )
    day2_raw = DAY1_SEED_WORDS[15:25] + DAY1_SEED_WORDS[5:15]
    words_day2 = [_word_entry(w) for w in day2_raw]
    conn.execute(
        """
        INSERT INTO vocab_course_days (course_id, day_number, words_json, practice_json)
        VALUES (?, 2, ?, ?)
        """,
        (
            course_id,
            json.dumps(words_day2, ensure_ascii=False),
            json.dumps(_practice_for_words(words_day2), ensure_ascii=False),
        ),
    )
    pack_exists = conn.execute(
        "SELECT id FROM vocab_material_packs WHERE display_name LIKE '%Merriam%' LIMIT 1"
    ).fetchone()
    if not pack_exists:
        conn.execute(
            """
            INSERT INTO vocab_material_packs (display_name, class_name, sort_order, is_active, created_at, updated_at)
            VALUES (?, ?, 1, 1, ?, ?)
            """,
            ("Merriam-Webster Vocabulary Builder 词汇学习", "EAP047", now, now),
        )
        pack_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        unit_words = [_word_entry(w) for w in DAY1_SEED_WORDS[:6]]
        conn.execute(
            """
            INSERT INTO vocab_material_units (pack_id, unit_label, unit_order, words_json, created_at)
            VALUES (?, ?, 1, ?, ?)
            """,
            ("Unit 1 — Word roots", pack_id, json.dumps(unit_words, ensure_ascii=False), now),
        )
    conn.commit()


def _student_class_name(conn, student_username: str) -> str:
    row = conn.execute(
        """
        SELECT COALESCE(NULLIF(TRIM(u.class_name), ''), 'EAP047') AS class_name
        FROM users u WHERE u.username = ? AND TRIM(COALESCE(u.role, '')) = 'student'
        LIMIT 1
        """,
        (student_username,),
    ).fetchone()
    return str(row["class_name"] if row else "EAP047").strip() or "EAP047"


def _has_manager_push(conn, class_name: str, skill: str) -> bool:
    row = conn.execute(
        "SELECT is_active FROM self_study_skill_push WHERE class_name = ? AND skill = ? LIMIT 1",
        (class_name, skill),
    ).fetchone()
    return bool(row and row["is_active"])


def _vocab_channel(conn, class_name: str) -> str:
    """Manager default route — does not override explicit student ?channel= choice."""
    if VOCAB_SKILL in CHANNEL_B_ONLY:
        return "B"
    return "A" if _has_manager_push(conn, class_name, VOCAB_SKILL) else "B"


def _requested_vocab_channel(conn, class_name: str, raw: str | None = None) -> str:
    """Student-selected channel. Defaults to B so Channel A push does not replace Channel B."""
    ch = str(raw or request.args.get("channel") or "").strip().upper()
    if ch == "A" and _has_manager_push(conn, class_name, VOCAB_SKILL):
        return "A"
    return "B"


def _active_course(conn, class_name: str) -> Any:
    return conn.execute(
        """
        SELECT * FROM vocab_courses
        WHERE class_name = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
        """,
        (class_name,),
    ).fetchone()


def _parse_start(start: str | None) -> date:
    if not start:
        return _today_utc()
    try:
        return date.fromisoformat(str(start)[:10])
    except ValueError:
        return _today_utc()


def _schedule_label(offset: int) -> dict[str, Any]:
    """offset 0 = course start Sunday."""
    wd = offset % 7
    if wd == 5:
        return {"mode": "review_week", "newWords": False, "label": "review_week"}
    if wd == 6:
        return {"mode": "review_week", "newWords": False, "label": "weekend_review"}
    if wd == 0:
        return {"mode": "new_lesson", "newWords": True, "label": "new_week"}
    return {"mode": "new_lesson", "newWords": True, "label": "new_plus_review_yesterday"}


def _course_day_number(course: Any, on_date: date | None = None) -> int:
    start = _parse_start(course["start_date"])
    today = on_date or _today_utc()
    offset = (today - start).days
    if offset < 0:
        return 1
    sched = _schedule_label(offset)
    if not sched["newWords"]:
        return max(1, min(int(course["total_days"]), offset))
    return max(1, min(int(course["total_days"]), offset + 1))


def _words_from_upload_units(units_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert parser output to stored word entries with practice/games per unit."""
    out: list[dict[str, Any]] = []
    for i, unit in enumerate(units_raw):
        words = [
            _word_entry(w)
            for w in unit.get("words") or []
            if isinstance(w, dict) and is_academic_vocab_word(str(w.get("word") or ""))
        ]
        if not words:
            continue
        out.append(
            {
                "label": str(unit.get("label") or f"Unit {i + 1}").strip()[:120],
                "words": words,
                "practice": _practice_for_words(words, channel="A"),
                "games": _game_rounds_for_words(words, channel="A"),
            }
        )
    return out


def _insert_pack_units(conn, pack_id: int, units: list[dict[str, Any]], *, replace: bool = True) -> int:
    now = _now_iso()
    if replace:
        conn.execute("DELETE FROM vocab_material_units WHERE pack_id = ?", (pack_id,))
    existing = conn.execute(
        "SELECT COALESCE(MAX(unit_order), 0) FROM vocab_material_units WHERE pack_id = ?",
        (pack_id,),
    ).fetchone()[0]
    order_base = int(existing or 0)
    count = 0
    for i, unit in enumerate(units):
        words = unit.get("words") or []
        if not words:
            continue
        practice = unit.get("practice") or _practice_for_words(words, channel="A")
        games = unit.get("games") or _game_rounds_for_words(words, channel="A")
        conn.execute(
            """
            INSERT INTO vocab_material_units
                (pack_id, unit_label, unit_order, words_json, practice_json, games_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pack_id,
                unit.get("label") or f"Unit {order_base + i + 1}",
                order_base + i + 1,
                json.dumps(words, ensure_ascii=False),
                json.dumps(practice, ensure_ascii=False),
                json.dumps(games, ensure_ascii=False),
                now,
            ),
        )
        count += 1
    word_count = _sync_pack_word_bank(conn, pack_id, units, replace=replace)
    if word_count == 0 and units:
        for unit in units:
            word_count += len(unit.get("words") or [])
    return max(count, word_count)


def _parse_vocab_upload_file(data: bytes, filename: str, *, pack_name: str = "") -> list[dict[str, Any]]:
    name = secure_filename(filename) or "vocab.txt"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else "txt"
    if ext == "doc":
        ext = "docx"
    if not allowed_source_extension(name) and ext not in {"xls", "xlsx"}:
        raise ValueError(f"Unsupported file type: {name}")
    extracted = clean_vocab_extracted_text(
        normalize_extracted_text(extract_text_from_bytes(data, ext))
    )
    if not extracted.strip():
        raise ValueError(f"No text extracted from {name}")
    units_raw = parse_vocabulary_upload(extracted, pack_name=pack_name)
    if not units_raw:
        raise ValueError(f"No vocabulary words found in {name}")
    return _words_from_upload_units(units_raw)


def _parse_vocab_upload_files(
    file_items: list[tuple[bytes, str]],
    *,
    pack_name: str = "",
) -> tuple[list[dict[str, Any]], str]:
    if not file_items:
        raise ValueError("At least one file required")
    merged: list[dict[str, Any]] = []
    names: list[str] = []
    multi = len(file_items) > 1
    for data, filename in file_items:
        safe_name = secure_filename(filename) or "vocab.txt"
        names.append(safe_name)
        units = _parse_vocab_upload_file(data, safe_name, pack_name=pack_name)
        if multi:
            stem = safe_name.rsplit(".", 1)[0][:60]
            for unit in units:
                unit["label"] = f"{stem} — {unit.get('label') or 'Unit'}"[:120]
        merged.extend(units)
    if not merged:
        raise ValueError("No vocabulary units parsed from uploaded files")
    return merged, ", ".join(names)[:500]


def _sync_pack_word_bank(
    conn,
    pack_id: int,
    units: list[dict[str, Any]],
    *,
    replace: bool = True,
) -> int:
    now = _now_iso()
    if replace:
        conn.execute("DELETE FROM vocab_pack_words WHERE pack_id = ?", (pack_id,))
    order_base = 0
    if not replace:
        row = conn.execute(
            "SELECT COALESCE(MAX(word_order), 0) FROM vocab_pack_words WHERE pack_id = ?",
            (pack_id,),
        ).fetchone()
        order_base = int(row[0] or 0)
    order = order_base
    count = 0
    for unit in units:
        for wd in unit.get("words") or []:
            if not wd or not wd.get("word") or not is_academic_vocab_word(str(wd.get("word"))):
                continue
            order += 1
            count += 1
            conn.execute(
                """
                INSERT INTO vocab_pack_words (pack_id, word_order, word_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (pack_id, order, json.dumps(wd, ensure_ascii=False), now),
            )
    return count


def _pack_word_count(conn, pack_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM vocab_pack_words WHERE pack_id = ?",
        (pack_id,),
    ).fetchone()
    return int(row["n"] if row else 0)


def _primary_pack_for_class(conn, class_name: str) -> Any:
    selected = _selected_pack_ids(conn, class_name)
    if selected:
        return conn.execute(
            "SELECT * FROM vocab_material_packs WHERE id = ? AND is_active = 1",
            (selected[0],),
        ).fetchone()
    return conn.execute(
        """
        SELECT * FROM vocab_material_packs
        WHERE is_active = 1
          AND (class_name IS NULL OR TRIM(class_name) = '' OR class_name = ?)
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """,
        (class_name,),
    ).fetchone()


def _selected_pack_ids(conn, class_name: str) -> list[int]:
    rows = conn.execute(
        """
        SELECT id FROM vocab_material_packs
        WHERE is_active = 1 AND push_selected = 1
          AND (class_name IS NULL OR TRIM(class_name) = '' OR class_name = ?)
        ORDER BY sort_order ASC, id ASC
        """,
        (class_name,),
    ).fetchall()
    return [int(r["id"]) for r in rows]


def _state_pack_ids(state: Any) -> list[int]:
    if not state:
        return []
    raw = state["pack_ids_json"] if "pack_ids_json" in state.keys() else None
    if raw:
        try:
            ids = [int(x) for x in json.loads(raw)]
            if ids:
                return ids
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return [int(state["pack_id"])]


def _merged_word_rows(conn, pack_ids: list[int]) -> list[Any]:
    rows: list[Any] = []
    for pid in pack_ids:
        rows.extend(
            conn.execute(
                """
                SELECT word_json FROM vocab_pack_words
                WHERE pack_id = ?
                ORDER BY word_order ASC, id ASC
                """,
                (pid,),
            ).fetchall()
        )
    return rows


def _pack_word_count_for_class(conn, class_name: str) -> int:
    pack_ids = _selected_pack_ids(conn, class_name)
    if not pack_ids:
        pack = _primary_pack_for_class(conn, class_name)
        pack_ids = [int(pack["id"])] if pack else []
    return len(_merged_word_rows(conn, pack_ids))


def _reset_channel_a_for_pack(conn, pack_id: int) -> None:
    pack = conn.execute(
        "SELECT class_name FROM vocab_material_packs WHERE id = ?",
        (pack_id,),
    ).fetchone()
    if not pack:
        return
    cls = str(pack["class_name"] or "").strip()
    now = _now_iso()
    today = _today_utc().isoformat()
    conn.execute("DELETE FROM vocab_channel_a_days WHERE pack_id = ?", (pack_id,))
    if cls:
        conn.execute("DELETE FROM vocab_channel_a_days WHERE class_name = ?", (cls,))
    for row in conn.execute(
        "SELECT class_name FROM vocab_channel_a_state WHERE pack_id = ?",
        (pack_id,),
    ).fetchall():
        conn.execute("DELETE FROM vocab_channel_a_days WHERE class_name = ?", (row["class_name"],))
        conn.execute(
            """
            UPDATE vocab_channel_a_state
            SET status = 'active', start_date = ?, updated_at = ?
            WHERE class_name = ?
            """,
            (today, now, row["class_name"]),
        )


def _complete_channel_a(conn, class_name: str) -> None:
    now = _now_iso()
    conn.execute(
        """
        UPDATE vocab_channel_a_state SET status = 'completed', updated_at = ?
        WHERE class_name = ?
        """,
        (now, class_name),
    )
    conn.execute(
        """
        UPDATE self_study_skill_push SET is_active = 0
        WHERE class_name = ? AND skill = ?
        """,
        (class_name, VOCAB_SKILL),
    )


def _channel_a_state(conn, class_name: str) -> Any:
    return conn.execute(
        "SELECT * FROM vocab_channel_a_state WHERE class_name = ?",
        (class_name,),
    ).fetchone()


def _channel_a_virtual_course(state: Any, total_words: int) -> dict[str, Any]:
    total_days = max(1, (total_words + CHANNEL_A_DAILY_WORDS - 1) // CHANNEL_A_DAILY_WORDS)
    return {
        "id": -int(state["pack_id"]),
        "start_date": state["start_date"],
        "total_days": total_days,
        "title": "Channel A vocabulary",
    }


def _channel_a_day_words(conn, class_name: str, day_number: int) -> tuple[list[dict], dict[str, Any]] | None:
    state = _channel_a_state(conn, class_name)
    if not state or state["status"] != "active":
        return None
    cached = conn.execute(
        """
        SELECT words_json, practice_json, games_json
        FROM vocab_channel_a_days
        WHERE class_name = ? AND day_number = ?
        """,
        (class_name, day_number),
    ).fetchone()
    if cached:
        words = _enrich_channel_a_words(json.loads(cached["words_json"]))
        practice = _practice_for_words(words, channel="A")
        games = _game_rounds_for_words(words, channel="A")
        return words, {"practice": practice, "games": games}

    offset = (max(1, day_number) - 1) * CHANNEL_A_DAILY_WORDS
    pack_ids = _state_pack_ids(state)
    rows = _merged_word_rows(conn, pack_ids)
    total = len(rows)
    if offset >= total:
        _complete_channel_a(conn, class_name)
        return None
    batch = rows[offset : offset + CHANNEL_A_DAILY_WORDS]
    words = _enrich_channel_a_words([json.loads(r["word_json"]) for r in batch])
    practice = _practice_for_words(words, channel="A")
    games = _game_rounds_for_words(words, channel="A")
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO vocab_channel_a_days
            (class_name, pack_id, day_number, words_json, practice_json, games_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(class_name, day_number) DO UPDATE SET
            pack_id = excluded.pack_id,
            words_json = excluded.words_json,
            practice_json = excluded.practice_json,
            games_json = excluded.games_json
        """,
        (
            class_name,
            state["pack_id"],
            day_number,
            json.dumps(words, ensure_ascii=False),
            json.dumps(practice, ensure_ascii=False),
            json.dumps(games, ensure_ascii=False),
        ),
    )
    if len(batch) < CHANNEL_A_DAILY_WORDS:
        _complete_channel_a(conn, class_name)
    return words, {"practice": practice, "games": games}


def _channel_a_today_payload(conn, *, class_name: str, username: str) -> dict[str, Any]:
    state = _channel_a_state(conn, class_name)
    if not state:
        raise ValueError("Channel A not configured for this class")
    if state["status"] == "completed":
        return {
            "channel": "A",
            "channelAComplete": True,
            "newWords": False,
            "message": "Channel A vocabulary list is complete.",
        }
    total_words = _pack_word_count_for_class(conn, class_name)
    if total_words < 1:
        return {
            "channel": "A",
            "channelAComplete": True,
            "newWords": False,
            "message": "No vocabulary words in the manager pack yet.",
        }
    course = _channel_a_virtual_course(state, total_words)
    offset = max(0, (_today_utc() - _parse_start(state["start_date"])).days)
    sched = _schedule_label(offset)
    day_num = _course_day_number(course)
    if not sched["newWords"]:
        return {
            "channel": "A",
            "schedule": sched,
            "newWords": False,
            "message": "No new words today — use review.",
            "dayNumber": day_num,
            "packId": state["pack_id"],
        }
    built = _channel_a_day_words(conn, class_name, day_num)
    if not built:
        return {
            "channel": "A",
            "channelAComplete": True,
            "newWords": False,
            "message": "Channel A vocabulary list is complete.",
        }
    words, extras = built
    prog = conn.execute(
        """
        SELECT * FROM student_vocab_channel_a_progress
        WHERE student_username = ? AND class_name = ? AND day_number = ?
        """,
        (username, class_name, day_num),
    ).fetchone()
    return {
        "channel": "A",
        "packId": int(state["pack_id"]),
        "courseId": None,
        "dayNumber": day_num,
        "schedule": sched,
        "newWords": True,
        "words": words,
        "wordCount": len(words),
        "practice": extras["practice"],
        "games": extras["games"],
        "progress": _practice_progress_payload(prog),
    }


def _unit_detail_payload(row: Any, prog: Any | None = None) -> dict[str, Any]:
    words = json.loads(row["words_json"])
    practice = _practice_for_words(words, channel="A")
    games = _game_rounds_for_words(words, channel="A")
    return {
        "id": row["id"],
        "label": row["unit_label"],
        "packId": row["pack_id"],
        "words": words,
        "practice": practice,
        "games": games,
        "wordCount": len(words),
        "progress": {
            "learnDone": bool(prog and prog["completed_at"]),
            "practiceDone": bool(prog and prog["practice_done"]),
            "practiceScore": prog["practice_score"] if prog else None,
            "practiceScoreTotal": prog["practice_score_total"] if prog else None,
        },
    }


def _record_word_history(conn, student: str, words: list[dict], course_id: int) -> None:
    now = _now_iso()
    for wd in words:
        norm = str(wd.get("word") or "").strip().lower()
        if not norm:
            continue
        conn.execute(
            """
            INSERT OR IGNORE INTO student_vocab_word_history
                (student_username, word_normalized, course_id, first_seen_at)
            VALUES (?, ?, ?, ?)
            """,
            (student, norm, course_id, now),
        )


def register_self_study_vocabulary_routes(
    app,
    *,
    get_db_connection: Callable,
    require_session_role_if_enabled: Callable,
    get_current_authenticated_user: Callable,
    get_effective_student_username: Callable,
    normalize_class_name: Callable,
) -> None:
    def require_manager_console_role(conn):
        err = require_session_role_if_enabled(conn, "manager")
        if not err:
            return None
        if not require_session_role_if_enabled(conn, "admin"):
            return None
        return err

    @app.route("/api/student/self-study/vocabulary/overview", methods=["GET"])
    def student_vocab_overview():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        channel = _vocab_channel(conn, class_name)
        placement = conn.execute(
            "SELECT vocab_entry_level FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        course = _active_course(conn, class_name)
        packs = conn.execute(
            """
            SELECT id, display_name, class_name, sort_order
            FROM vocab_material_packs
            WHERE is_active = 1 AND (class_name IS NULL OR TRIM(class_name) = '' OR class_name = ?)
            ORDER BY sort_order ASC, id ASC
            """,
            (class_name,),
        ).fetchall()
        channel_a_on = _has_manager_push(conn, class_name, VOCAB_SKILL)
        channel_a_state = _channel_a_state(conn, class_name) if channel_a_on else None
        channel_a_pack = _primary_pack_for_class(conn, class_name) if channel_a_on else None
        channel_a_words = (
            _pack_word_count(conn, int(channel_a_pack["id"])) if channel_a_pack else 0
        )
        conn.close()

        today = _today_utc()
        day_num = _course_day_number(course, today) if course else None
        offset = (_today_utc() - _parse_start(course["start_date"] if course else None)).days if course else 0
        sched = _schedule_label(max(0, offset))
        return jsonify(
            {
                "className": class_name,
                "channel": channel,
                "channelAEnabled": channel_a_on,
                "channelAComplete": bool(
                    channel_a_state and channel_a_state["status"] == "completed"
                ),
                "channelAWordCount": channel_a_words,
                "channelBActive": bool(course),
                "vocabEntryLevel": bool(placement and placement["vocab_entry_level"]),
                "course": {
                    "id": course["id"] if course else None,
                    "title": course["title"] if course else None,
                    "startDate": course["start_date"] if course else None,
                    "totalDays": int(course["total_days"]) if course else 30,
                }
                if course
                else None,
                "todayDayNumber": day_num,
                "todaySchedule": sched,
                "packs": [
                    {
                        "id": p["id"],
                        "displayName": p["display_name"],
                        "className": p["class_name"],
                    }
                    for p in packs
                ],
            }
        )

    @app.route("/api/student/self-study/vocabulary/today", methods=["GET"])
    def student_vocab_today():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        channel = _requested_vocab_channel(conn, class_name)
        if channel == "A":
            payload = _channel_a_today_payload(conn, class_name=class_name, username=username)
            conn.commit()
            conn.close()
            return jsonify(payload)

        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"error": "No active vocabulary course for your class"}), 404

        offset = max(0, (_today_utc() - _parse_start(course["start_date"])).days)
        sched = _schedule_label(offset)
        day_num = _course_day_number(course)
        if not sched["newWords"]:
            conn.close()
            return jsonify(
                {
                    "channel": "B",
                    "schedule": sched,
                    "newWords": False,
                    "message": "No new words today — use review.",
                }
            )

        day_row = conn.execute(
            "SELECT * FROM vocab_course_days WHERE course_id = ? AND day_number = ?",
            (course["id"], day_num),
        ).fetchone()
        if not day_row:
            conn.close()
            return jsonify({"error": "No lesson for this day yet", "dayNumber": day_num}), 404

        words = json.loads(day_row["words_json"])
        practice = json.loads(day_row["practice_json"] or "[]")
        if not practice:
            practice = _practice_for_words(words)
        prog = conn.execute(
            """
            SELECT * FROM student_vocab_day_progress
            WHERE student_username = ? AND course_id = ? AND day_number = ?
            """,
            (username, course["id"], day_num),
        ).fetchone()
        conn.close()

        return jsonify(
            _vocab_day_payload(
                course=course,
                day_row=day_row,
                words=words,
                practice=practice,
                prog=prog,
                sched=sched,
            )
        )

    @app.route("/api/student/self-study/vocabulary/day/<int:day_number>", methods=["GET"])
    def student_vocab_day(day_number: int):
        """Open a calendar day to view that day's vocabulary (Channel A or B)."""
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        day_num = max(1, int(day_number))
        channel = _requested_vocab_channel(conn, class_name)
        if channel == "A":
            built = _channel_a_day_words(conn, class_name, day_num)
            if not built:
                conn.commit()
                conn.close()
                return jsonify({"error": "No lesson for this day", "dayNumber": day_num}), 404
            words, extras = built
            state = _channel_a_state(conn, class_name)
            prog = conn.execute(
                """
                SELECT * FROM student_vocab_channel_a_progress
                WHERE student_username = ? AND class_name = ? AND day_number = ?
                """,
                (username, class_name, day_num),
            ).fetchone()
            sched = _schedule_label(max(0, day_num - 1))
            conn.commit()
            conn.close()
            return jsonify(
                {
                    "channel": "A",
                    "packId": int(state["pack_id"]) if state else None,
                    "courseId": None,
                    "dayNumber": day_num,
                    "schedule": sched,
                    "newWords": True,
                    "words": words,
                    "wordCount": len(words),
                    "practice": extras["practice"],
                    "games": extras["games"],
                    "progress": _practice_progress_payload(prog),
                }
            )

        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"error": "No active vocabulary course"}), 404

        day_row = conn.execute(
            "SELECT * FROM vocab_course_days WHERE course_id = ? AND day_number = ?",
            (course["id"], day_num),
        ).fetchone()
        if not day_row:
            conn.close()
            return jsonify({"error": "No lesson for this day", "dayNumber": day_num}), 404

        words = json.loads(day_row["words_json"])
        practice = json.loads(day_row["practice_json"] or "[]")
        if not practice:
            practice = _practice_for_words(words, channel="B")
        prog = conn.execute(
            """
            SELECT * FROM student_vocab_day_progress
            WHERE student_username = ? AND course_id = ? AND day_number = ?
            """,
            (username, course["id"], day_num),
        ).fetchone()
        sched = _schedule_label(max(0, day_num - 1))
        conn.close()
        return jsonify(
            _vocab_day_payload(
                course=course,
                day_row=day_row,
                words=words,
                practice=practice,
                prog=prog,
                sched=sched,
            )
        )

    @app.route("/api/student/self-study/vocabulary/review-yesterday", methods=["GET"])
    def student_vocab_review_yesterday():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        if _requested_vocab_channel(conn, class_name) == "A":
            ref_day = int(request.args.get("day") or 0)
            if ref_day > 1:
                day_num = ref_day - 1
            else:
                state = _channel_a_state(conn, class_name)
                if not state:
                    conn.close()
                    return jsonify({"words": [], "dayNumber": 0})
                total = _pack_word_count_for_class(conn, class_name)
                virtual = _channel_a_virtual_course(state, total)
                day_num = max(1, _course_day_number(virtual) - 1)
            built = _channel_a_day_words(conn, class_name, day_num)
            conn.commit()
            conn.close()
            if not built:
                return jsonify({"words": [], "dayNumber": day_num})
            words, _extras = built
            return jsonify({"dayNumber": day_num, "words": words, "mode": "flashcard", "channel": "A"})

        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"error": "No course"}), 404

        ref_day = int(request.args.get("day") or 0)
        if ref_day > 1:
            day_num = ref_day - 1
        else:
            day_num = max(1, _course_day_number(course) - 1)
        day_row = conn.execute(
            "SELECT words_json FROM vocab_course_days WHERE course_id = ? AND day_number = ?",
            (course["id"], day_num),
        ).fetchone()
        conn.close()
        if not day_row:
            return jsonify({"words": [], "dayNumber": day_num})
        return jsonify(
            {
                "dayNumber": day_num,
                "words": json.loads(day_row["words_json"]),
                "mode": "flashcard",
            }
        )

    @app.route("/api/student/self-study/vocabulary/calendar", methods=["GET"])
    def student_vocab_calendar():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        class_name = _student_class_name(conn, username)
        channel = _requested_vocab_channel(conn, class_name)
        if channel == "A":
            state = _channel_a_state(conn, class_name)
            if not state:
                conn.close()
                return jsonify({"days": [], "channel": "A"})
            total_words = _pack_word_count_for_class(conn, class_name)
            course = _channel_a_virtual_course(state, total_words)
            pack_ids = _state_pack_ids(state)
            all_rows = _merged_word_rows(conn, pack_ids)
            start = _parse_start(state["start_date"])
            prog_rows = {
                int(r["day_number"]): r
                for r in conn.execute(
                    """
                    SELECT day_number, learn_done, practice_done
                    FROM student_vocab_channel_a_progress
                    WHERE student_username = ? AND class_name = ?
                    """,
                    (username, class_name),
                ).fetchall()
            }
            days_out = []
            for i in range(30):
                d = start + timedelta(days=i)
                sched = _schedule_label(i)
                day_num = i + 1 if sched.get("newWords") else None
                if day_num is None and sched.get("label") == "review_weekend":
                    day_num = i + 1
                wc = 0
                row = None
                if day_num and sched.get("newWords"):
                    offset = (day_num - 1) * CHANNEL_A_DAILY_WORDS
                    if offset < len(all_rows):
                        batch = all_rows[offset : offset + CHANNEL_A_DAILY_WORDS]
                        wc = len(_filter_study_words([json.loads(r["word_json"]) for r in batch]))
                        row = wc > 0
                pr = prog_rows.get(day_num) if day_num else None
                days_out.append(
                    {
                        "date": d.isoformat(),
                        "offset": i,
                        "schedule": sched,
                        "dayNumber": day_num if row else None,
                        "wordCount": wc,
                        "hasLesson": bool(row),
                        "learnDone": bool(pr and pr["learn_done"]),
                        "practiceDone": bool(pr and pr["practice_done"]),
                    }
                )
            conn.close()
            return jsonify(
                {
                    "channel": "A",
                    "startDate": state["start_date"],
                    "totalDays": int(course["total_days"]),
                    "days": days_out,
                }
            )

        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"days": []})

        start = _parse_start(course["start_date"])
        day_rows = {
            int(r["day_number"]): r
            for r in conn.execute(
                "SELECT day_number, words_json FROM vocab_course_days WHERE course_id = ?",
                (course["id"],),
            ).fetchall()
        }
        prog_rows = {
            int(r["day_number"]): r
            for r in conn.execute(
                """
                SELECT day_number, learn_done, practice_done
                FROM student_vocab_day_progress
                WHERE student_username = ? AND course_id = ?
                """,
                (username, course["id"]),
            ).fetchall()
        }
        days_out = []
        for i in range(30):
            d = start + timedelta(days=i)
            sched = _schedule_label(i)
            day_num = i + 1 if sched.get("newWords") else None
            if day_num is None and sched.get("label") == "review_weekend":
                day_num = i + 1
            row = day_rows.get(day_num) if day_num else None
            wc = len(json.loads(row["words_json"])) if row else 0
            pr = prog_rows.get(day_num) if day_num else None
            days_out.append(
                {
                    "date": d.isoformat(),
                    "offset": i,
                    "schedule": sched,
                    "dayNumber": day_num,
                    "wordCount": wc,
                    "hasLesson": bool(row),
                    "learnDone": bool(pr and pr["learn_done"]),
                    "practiceDone": bool(pr and pr["practice_done"]),
                }
            )
        conn.close()
        return jsonify(
            {
                "startDate": course["start_date"],
                "totalDays": int(course["total_days"]),
                "days": days_out,
            }
        )

    @app.route("/api/student/self-study/vocabulary/packs/<int:pack_id>/units", methods=["GET"])
    def student_vocab_pack_units(pack_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        pack = conn.execute(
            "SELECT * FROM vocab_material_packs WHERE id = ? AND is_active = 1",
            (pack_id,),
        ).fetchone()
        if not pack:
            conn.close()
            return jsonify({"error": "Pack not found"}), 404

        units = conn.execute(
            """
            SELECT u.*, p.completed_at IS NOT NULL AS completed
            FROM vocab_material_units u
            LEFT JOIN student_vocab_pack_progress p
              ON p.unit_id = u.id AND p.student_username = ?
            WHERE u.pack_id = ?
            ORDER BY u.unit_order ASC, u.id ASC
            """,
            (username, pack_id),
        ).fetchall()
        conn.close()
        return jsonify(
            {
                "pack": {"id": pack["id"], "displayName": pack["display_name"]},
                "units": [
                    {
                        "id": u["id"],
                        "label": u["unit_label"],
                        "order": u["unit_order"],
                        "wordCount": len(json.loads(u["words_json"])),
                        "completed": bool(u["completed"]),
                    }
                    for u in units
                ],
            }
        )

    @app.route("/api/student/self-study/vocabulary/units/<int:unit_id>", methods=["GET"])
    def student_vocab_unit_detail(unit_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401
        row = conn.execute(
            "SELECT * FROM vocab_material_units WHERE id = ?",
            (unit_id,),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Unit not found"}), 404
        prog = conn.execute(
            """
            SELECT completed_at, practice_done, practice_score, practice_score_total
            FROM student_vocab_pack_progress
            WHERE student_username = ? AND unit_id = ?
            """,
            (username, unit_id),
        ).fetchone()
        conn.close()
        return jsonify({"unit": _unit_detail_payload(row, prog)})

    @app.route("/api/student/self-study/vocabulary/complete", methods=["POST"])
    def student_vocab_complete():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        now = _now_iso()
        kind = str(data.get("kind") or "day").strip()

        if kind in ("channel_a", "channelA"):
            class_name = normalize_class_name(
                str(data.get("className") or data.get("class_name") or _student_class_name(conn, username))
            )
            day_number = int(data.get("dayNumber") or 0)
            learn_done = 1 if data.get("learnDone", True) else 0
            practice_done = 1 if data.get("practiceDone") else 0
            practice_score = data.get("practiceScore")
            practice_score_total = data.get("practiceScoreTotal")
            practice_result_json = None
            if data.get("practiceResult") is not None:
                practice_result_json = json.dumps(data.get("practiceResult"), ensure_ascii=False)
            if not day_number:
                conn.close()
                return jsonify({"error": "dayNumber required"}), 400
            completed_at = now if learn_done and practice_done else None
            conn.execute(
                """
                INSERT INTO student_vocab_channel_a_progress
                    (student_username, class_name, day_number, learn_done, practice_done,
                     practice_score, practice_score_total, practice_result_json, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(student_username, class_name, day_number) DO UPDATE SET
                    learn_done = CASE
                        WHEN excluded.learn_done = 1 OR student_vocab_channel_a_progress.learn_done = 1 THEN 1
                        ELSE 0
                    END,
                    practice_done = CASE
                        WHEN excluded.practice_done = 1 OR student_vocab_channel_a_progress.practice_done = 1 THEN 1
                        ELSE 0
                    END,
                    practice_score = COALESCE(
                        excluded.practice_score, student_vocab_channel_a_progress.practice_score
                    ),
                    practice_score_total = COALESCE(
                        excluded.practice_score_total,
                        student_vocab_channel_a_progress.practice_score_total
                    ),
                    practice_result_json = COALESCE(
                        excluded.practice_result_json,
                        student_vocab_channel_a_progress.practice_result_json
                    ),
                    completed_at = COALESCE(excluded.completed_at, student_vocab_channel_a_progress.completed_at)
                """,
                (
                    username,
                    class_name,
                    day_number,
                    learn_done,
                    practice_done,
                    practice_score,
                    practice_score_total,
                    practice_result_json,
                    completed_at,
                ),
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True})

        if kind == "unit":
            unit_id = int(data.get("unitId") or 0)
            if not unit_id:
                conn.close()
                return jsonify({"error": "unitId required"}), 400
            practice_done = 1 if data.get("practiceDone") else 0
            practice_score = data.get("practiceScore")
            practice_score_total = data.get("practiceScoreTotal")
            learn_done = data.get("learnDone", True)
            completed_at = now if learn_done else None
            conn.execute(
                """
                INSERT INTO student_vocab_pack_progress
                    (student_username, unit_id, completed_at, practice_done,
                     practice_score, practice_score_total)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(student_username, unit_id) DO UPDATE SET
                    completed_at = COALESCE(excluded.completed_at, student_vocab_pack_progress.completed_at),
                    practice_done = CASE
                        WHEN excluded.practice_done = 1 OR student_vocab_pack_progress.practice_done = 1 THEN 1
                        ELSE 0
                    END,
                    practice_score = COALESCE(excluded.practice_score, student_vocab_pack_progress.practice_score),
                    practice_score_total = COALESCE(
                        excluded.practice_score_total, student_vocab_pack_progress.practice_score_total
                    )
                """,
                (username, unit_id, completed_at, practice_done, practice_score, practice_score_total),
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True})

        course_id = int(data.get("courseId") or 0)
        day_number = int(data.get("dayNumber") or 0)
        learn_done = 1 if data.get("learnDone", True) else 0
        practice_done = 1 if data.get("practiceDone") else 0
        practice_score = data.get("practiceScore")
        practice_score_total = data.get("practiceScoreTotal")
        practice_result_json = None
        if data.get("practiceResult") is not None:
            practice_result_json = json.dumps(data.get("practiceResult"), ensure_ascii=False)
        if not course_id or not day_number:
            conn.close()
            return jsonify({"error": "courseId and dayNumber required"}), 400

        day_row = conn.execute(
            "SELECT words_json FROM vocab_course_days WHERE course_id = ? AND day_number = ?",
            (course_id, day_number),
        ).fetchone()
        if day_row:
            words = json.loads(day_row["words_json"])
            _record_word_history(conn, username, words, course_id)

        completed_at = now if learn_done and practice_done else None
        conn.execute(
            """
            INSERT INTO student_vocab_day_progress
                (student_username, course_id, day_number, learn_done, practice_done,
                 practice_score, practice_score_total, practice_result_json, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username, course_id, day_number) DO UPDATE SET
                learn_done = CASE WHEN excluded.learn_done = 1 OR student_vocab_day_progress.learn_done = 1 THEN 1 ELSE 0 END,
                practice_done = CASE WHEN excluded.practice_done = 1 OR student_vocab_day_progress.practice_done = 1 THEN 1 ELSE 0 END,
                practice_score = COALESCE(excluded.practice_score, student_vocab_day_progress.practice_score),
                practice_score_total = COALESCE(
                    excluded.practice_score_total, student_vocab_day_progress.practice_score_total
                ),
                practice_result_json = COALESCE(
                    excluded.practice_result_json, student_vocab_day_progress.practice_result_json
                ),
                completed_at = COALESCE(excluded.completed_at, student_vocab_day_progress.completed_at)
            """,
            (
                username,
                course_id,
                day_number,
                learn_done,
                practice_done,
                practice_score,
                practice_score_total,
                practice_result_json,
                completed_at,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/student/self-study/vocabulary/practice-exam", methods=["POST"])
    def student_vocab_practice_exam():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        channel = str(data.get("channel") or "B").strip().upper()
        class_name = normalize_class_name(
            str(data.get("className") or data.get("class_name") or "")
        )
        day_number = int(data.get("dayNumber") or 0)
        if channel == "A" and class_name and day_number:
            built = _channel_a_day_words(conn, class_name, day_number)
            conn.commit()
            conn.close()
            if not built:
                return jsonify({"error": "Channel A day not available"}), 404
            words, _extras = built
            exam = _build_practice_exam(words, day_number, channel="A")
            exam["titleEn"] = f"Day {day_number} vocabulary practice"
            exam["titleZh"] = f"第 {day_number} 天词汇练习"
            return jsonify(exam)

        unit_id = int(data.get("unitId") or 0)
        if unit_id:
            unit_row = conn.execute(
                "SELECT words_json, unit_order, unit_label FROM vocab_material_units WHERE id = ?",
                (unit_id,),
            ).fetchone()
            conn.close()
            if not unit_row:
                return jsonify({"error": "Unit not found"}), 404
            words = json.loads(unit_row["words_json"])
            exam = _build_practice_exam(words, int(unit_row["unit_order"] or 1), channel="A")
            exam["titleEn"] = f"{unit_row['unit_label']} — vocabulary practice"
            exam["titleZh"] = f"{unit_row['unit_label']} — 词汇练习"
            return jsonify(exam)

        course_id = int(data.get("courseId") or 0)
        day_number = int(data.get("dayNumber") or 0)
        if not course_id or not day_number:
            conn.close()
            return jsonify({"error": "courseId and dayNumber required, or unitId"}), 400

        day_row = conn.execute(
            "SELECT words_json FROM vocab_course_days WHERE course_id = ? AND day_number = ?",
            (course_id, day_number),
        ).fetchone()
        conn.close()
        if not day_row:
            return jsonify({"error": "No lesson for this day"}), 404
        words = json.loads(day_row["words_json"])
        return jsonify(_build_practice_exam(words, day_number, channel="B"))

    @app.route("/api/student/self-study/vocabulary/practice-exam/grade", methods=["POST"])
    def student_vocab_practice_exam_grade():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401
        conn.close()

        data = request.get_json(silent=True) or {}
        exam = data.get("exam") or {}
        answers = data.get("answers") or {}
        if not exam:
            return jsonify({"error": "exam required"}), 400
        return jsonify(_grade_practice_exam(exam, answers))

    @app.route("/api/admin/self-study/vocabulary/packs", methods=["GET", "POST"])
    def admin_vocab_packs():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        if request.method == "GET":
            rows = conn.execute(
                """
                SELECT p.*,
                       (SELECT COUNT(*) FROM vocab_pack_words w WHERE w.pack_id = p.id) AS unit_count
                FROM vocab_material_packs p
                WHERE p.is_active = 1
                ORDER BY p.sort_order ASC, p.id ASC
                """
            ).fetchall()
            conn.close()
            return jsonify(
                {
                    "packs": [
                        {
                            "id": r["id"],
                            "displayName": r["display_name"],
                            "className": r["class_name"],
                            "sortOrder": r["sort_order"],
                            "isActive": bool(r["is_active"]),
                            "unitCount": int(r["unit_count"] or 0),
                            "sourceFilename": r["source_filename"],
                            "pushSelected": bool(r["push_selected"] if "push_selected" in r.keys() else 0),
                        }
                        for r in rows
                    ]
                }
            )

        uploads = [f for f in request.files.getlist("files") if f and f.filename]
        if not uploads:
            single = request.files.get("file")
            if single and single.filename:
                uploads = [single]
        if uploads:
            name = str(request.form.get("displayName") or request.form.get("display_name") or "").strip()[:200]
            cls_raw = str(request.form.get("className") or request.form.get("class_name") or "").strip()
        else:
            data = request.get_json(silent=True) or {}
            name = str(data.get("displayName") or data.get("display_name") or "").strip()[:200]
            cls_raw = str(data.get("className") or data.get("class_name") or "").strip()
        if not name:
            conn.close()
            return jsonify({"error": "displayName required"}), 400
        cls = normalize_class_name(cls_raw) if cls_raw else None
        now = _now_iso()
        source_name = None
        unit_count = 0
        if uploads:
            try:
                file_items = [(f.read(), f.filename or "vocab.txt") for f in uploads]
                units, source_name = _parse_vocab_upload_files(file_items, pack_name=name)
            except ValueError as exc:
                conn.close()
                return jsonify({"error": str(exc)}), 400
            except Exception as exc:
                conn.close()
                return jsonify({"error": f"Upload parse failed: {exc}"}), 400
        else:
            units = []

        conn.execute(
            """
            INSERT INTO vocab_material_packs
                (display_name, class_name, sort_order, is_active, source_filename, created_at, updated_at)
            VALUES (?, ?, 0, 1, ?, ?, ?)
            """,
            (name, cls, source_name, now, now),
        )
        pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if units:
            unit_count = _insert_pack_units(conn, pid, units, replace=True)
            _reset_channel_a_for_pack(conn, pid)
        conn.commit()
        conn.close()
        return jsonify({"id": pid, "displayName": name, "unitCount": unit_count}), 201

    @app.route("/api/admin/self-study/vocabulary/packs/<int:pack_id>", methods=["DELETE"])
    def admin_vocab_pack_delete(pack_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        row = conn.execute(
            "SELECT id FROM vocab_material_packs WHERE id = ? AND is_active = 1",
            (pack_id,),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Pack not found"}), 404
        now = _now_iso()
        conn.execute(
            "UPDATE vocab_material_packs SET is_active = 0, updated_at = ? WHERE id = ?",
            (now, pack_id),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/admin/self-study/vocabulary/packs/<int:pack_id>/upload", methods=["POST"])
    def admin_vocab_pack_upload(pack_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        pack = conn.execute(
            "SELECT * FROM vocab_material_packs WHERE id = ? AND is_active = 1",
            (pack_id,),
        ).fetchone()
        if not pack:
            conn.close()
            return jsonify({"error": "Pack not found"}), 404
        uploads = [f for f in request.files.getlist("files") if f and f.filename]
        if not uploads:
            single = request.files.get("file")
            if single and single.filename:
                uploads = [single]
        if not uploads:
            conn.close()
            return jsonify({"error": "At least one file required"}), 400
        try:
            file_items = [(f.read(), f.filename or "vocab.txt") for f in uploads]
            units, source_name = _parse_vocab_upload_files(
                file_items,
                pack_name=str(pack["display_name"] or ""),
            )
        except ValueError as exc:
            conn.close()
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            conn.close()
            return jsonify({"error": f"Upload parse failed: {exc}"}), 400
        replace = str(request.form.get("replace", "true")).lower() not in ("0", "false", "no")
        preview_words = sum(len(u.get("words") or []) for u in units)
        if preview_words < 1:
            conn.close()
            return jsonify(
                {
                    "error": "No valid vocabulary words parsed — check file format or try a different list.",
                }
            ), 400
        unit_count = _insert_pack_units(conn, pack_id, units, replace=replace)
        if replace:
            _reset_channel_a_for_pack(conn, pack_id)
        now = _now_iso()
        conn.execute(
            "UPDATE vocab_material_packs SET source_filename = ?, updated_at = ? WHERE id = ?",
            (source_name, now, pack_id),
        )
        word_count = _pack_word_count(conn, pack_id)
        conn.commit()
        conn.close()
        return jsonify(
            {
                "ok": True,
                "unitCount": unit_count,
                "wordCount": word_count,
                "sourceFilename": source_name,
                "replaced": replace,
            }
        )

    @app.route("/api/admin/self-study/vocabulary/push-channel-a", methods=["PUT"])
    def admin_vocab_push_channel_a():
        """Enable Channel A routing for vocabulary (uses self_study_skill_push)."""
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn)
        manager_name = str(actor["username"] if actor else "manager").strip() or "manager"
        data = request.get_json(silent=True) or {}
        class_name = normalize_class_name(str(data.get("className") or data.get("class_name") or ""))
        is_active = 1 if data.get("isActive", data.get("is_active", True)) else 0
        if not class_name:
            conn.close()
            return jsonify({"error": "className required"}), 400
        now = _now_iso()
        raw_ids = data.get("packIds") or data.get("pack_ids") or []
        pack_ids: list[int] = []
        for raw in raw_ids:
            try:
                pack_ids.append(int(raw))
            except (TypeError, ValueError):
                continue
        if pack_ids:
            conn.execute(
                """
                UPDATE vocab_material_packs SET push_selected = 0
                WHERE class_name IS NULL OR TRIM(class_name) = '' OR class_name = ?
                """,
                (class_name,),
            )
            for pid in pack_ids:
                conn.execute(
                    """
                    UPDATE vocab_material_packs SET push_selected = 1
                    WHERE id = ? AND is_active = 1
                      AND (class_name IS NULL OR TRIM(class_name) = '' OR class_name = ?)
                    """,
                    (pid, class_name),
                )
        pack = _primary_pack_for_class(conn, class_name)
        pack_ids = _selected_pack_ids(conn, class_name) or ([int(pack["id"])] if pack else [])
        if is_active:
            if not pack_ids:
                conn.close()
                return jsonify({"error": "No vocabulary pack for this class — add a pack first"}), 400
            if _pack_word_count_for_class(conn, class_name) < 1:
                conn.close()
                return jsonify({"error": "Pack has no words — upload a vocabulary file first"}), 400
            primary_id = pack_ids[0]
            conn.execute(
                """
                INSERT INTO vocab_channel_a_state
                    (class_name, pack_id, pack_ids_json, start_date, status, updated_at)
                VALUES (?, ?, ?, ?, 'active', ?)
                ON CONFLICT(class_name) DO UPDATE SET
                    pack_id = excluded.pack_id,
                    pack_ids_json = excluded.pack_ids_json,
                    start_date = excluded.start_date,
                    status = 'active',
                    updated_at = excluded.updated_at
                """,
                (
                    class_name,
                    primary_id,
                    json.dumps(pack_ids),
                    _today_utc().isoformat(),
                    now,
                ),
            )
            conn.execute("DELETE FROM vocab_channel_a_days WHERE class_name = ?", (class_name,))
        conn.execute(
            """
            INSERT INTO self_study_skill_push (class_name, skill, is_active, pushed_at, pushed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(class_name, skill) DO UPDATE SET
                is_active = excluded.is_active,
                pushed_at = excluded.pushed_at,
                pushed_by = excluded.pushed_by
            """,
            (class_name, VOCAB_SKILL, is_active, now if is_active else None, manager_name, "vocab Channel A"),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "className": class_name, "isActive": bool(is_active)})

    @app.route("/api/admin/self-study/vocabulary/courses/<int:course_id>/export.csv", methods=["GET"])
    def admin_vocab_course_export(course_id: int):
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT day_number, words_json FROM vocab_course_days WHERE course_id = ? ORDER BY day_number",
            (course_id,),
        ).fetchall()
        conn.close()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["day_number", "word", "core_meaning", "method", "prefix", "root", "suffix", "mnemonic"])
        for row in rows:
            for wd in json.loads(row["words_json"]):
                aff = wd.get("affix") or {}
                writer.writerow(
                    [
                        row["day_number"],
                        wd.get("word"),
                        wd.get("coreMeaning"),
                        wd.get("methodPrimary"),
                        aff.get("prefix"),
                        aff.get("root"),
                        aff.get("suffix"),
                        wd.get("mnemonic") or "",
                    ]
                )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="vocab-course-{course_id}.csv"'},
        )
