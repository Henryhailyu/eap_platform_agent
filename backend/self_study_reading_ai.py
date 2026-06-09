"""
SS-R2 — AI reading passage generation, OCR structuring, and practice feedback.
"""
from __future__ import annotations

import json
import re
from typing import Any

READING_PASSAGE_LEVELS = ("P1", "P2", "P3")

_LEVEL_HINTS = {
    "P1": "IELTS Academic Passage 1 style — general interest, 600–900 words, easier vocabulary.",
    "P2": "IELTS Academic Passage 2 style — work/study topic, 750–900 words, medium difficulty.",
    "P3": "IELTS Academic Passage 3 style — abstract academic argument, 800–1000 words, harder vocabulary.",
}


def reading_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _ai_json(system: str, user: str, *, max_tokens: int = 3500) -> dict[str, Any]:
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
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    return json.loads(raw)


def _normalize_questions(questions: list[dict]) -> list[dict]:
    out: list[dict] = []
    for i, q in enumerate(questions or []):
        qid = str(q.get("id") or f"q{i + 1}")
        type_id = str(q.get("typeId") or "MC").upper()
        if type_id not in {"MC", "TFNG", "YNNG", "GAP", "MH"}:
            type_id = "MC"
        item: dict[str, Any] = {
            "id": qid,
            "typeId": type_id,
            "instructionEn": str(q.get("instructionEn") or "").strip(),
            "instructionZh": str(q.get("instructionZh") or "").strip(),
            "promptEn": str(q.get("promptEn") or "").strip(),
            "promptZh": str(q.get("promptZh") or "").strip(),
            "optionsEn": list(q.get("optionsEn") or []),
            "optionsZh": list(q.get("optionsZh") or []),
            "evidenceEn": str(q.get("evidenceEn") or "").strip(),
            "evidenceZh": str(q.get("evidenceZh") or "").strip(),
        }
        if type_id == "GAP":
            item["correctAnswer"] = str(q.get("correctAnswer") or "").strip()
            item["wordLimit"] = int(q.get("wordLimit") or 3)
        else:
            item["correctIndex"] = int(q.get("correctIndex") or 0)
        if type_id in ("TFNG", "YNNG") and not item["optionsEn"]:
            item["optionsEn"] = (
                ["TRUE", "FALSE", "NOT GIVEN"]
                if type_id == "TFNG"
                else ["YES", "NO", "NOT GIVEN"]
            )
            item["optionsZh"] = (
                ["正确", "错误", "未给出"]
                if type_id == "TFNG"
                else ["是", "否", "未给出"]
            )
        out.append(item)
    return out


def normalize_passage_content(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize AI or OCR output into reading content_json."""
    paragraphs_en = [str(p).strip() for p in (raw.get("paragraphsEn") or []) if str(p).strip()]
    paragraphs_zh = [str(p).strip() for p in (raw.get("paragraphsZh") or []) if str(p).strip()]
    passage_en = str(raw.get("passageEn") or "").strip()
    if not passage_en and paragraphs_en:
        passage_en = "\n\n".join(paragraphs_en)
    passage_zh = str(raw.get("passageZh") or "").strip()
    if not passage_zh and paragraphs_zh:
        passage_zh = "\n\n".join(paragraphs_zh)
    level = str(raw.get("passageLevel") or "P2").upper()
    if level not in READING_PASSAGE_LEVELS:
        level = "P2"
    return {
        "title": str(raw.get("title") or "Reading passage").strip(),
        "passageLevel": level,
        "lessonEn": str(raw.get("lessonEn") or "").strip(),
        "lessonZh": str(raw.get("lessonZh") or "").strip(),
        "paragraphsEn": paragraphs_en,
        "paragraphsZh": paragraphs_zh,
        "passageEn": passage_en,
        "passageZh": passage_zh,
        "questions": _normalize_questions(raw.get("questions") or []),
    }


_GENERATION_SYSTEM = """You are an IELTS Academic Reading item writer for EAP047 university prep.
Return ONLY valid JSON with this shape:
{
  "title": string,
  "passageLevel": "P1"|"P2"|"P3",
  "lessonEn": string (1-2 sentence reading tip),
  "lessonZh": string,
  "paragraphsEn": string[] (5-8 paragraphs, full passage split),
  "paragraphsZh": string[] (optional Chinese gloss paragraphs, same count),
  "questions": [
    {
      "id": "q1",
      "typeId": "MC"|"TFNG"|"YNNG"|"GAP"|"MH",
      "instructionEn": string (IELTS-style instruction),
      "instructionZh": string,
      "promptEn": string,
      "promptZh": string,
      "optionsEn": string[] (required for MC, TFNG, YNNG, MH),
      "optionsZh": string[],
      "correctIndex": number (for MC, TFNG, YNNG, MH),
      "correctAnswer": string (for GAP only — verbatim from passage, obey word limit),
      "wordLimit": number (GAP only, usually 1-3),
      "evidenceEn": string (quote or paraphrase from passage supporting the answer),
      "evidenceZh": string
    }
  ]
}
Rules:
- Exactly 12-14 questions mixing MC, TFNG or YNNG, GAP, and MH.
- Answers must be verifiable from the passage text (verbatim for GAP).
- TFNG uses TRUE/FALSE/NOT GIVEN; YNNG uses YES/NO/NOT GIVEN.
- MH: options are paragraph headings; prompt references a paragraph letter.
- Academic register, no contractions in answers.
- EAP047 standard difficulty for all students."""


def generate_daily_passage(
    passage_level: str,
    day_number: int,
    class_name: str = "EAP047",
) -> dict[str, Any]:
    level = passage_level.upper() if passage_level.upper() in READING_PASSAGE_LEVELS else "P2"
    hint = _LEVEL_HINTS.get(level, _LEVEL_HINTS["P2"])
    user = (
        f"Generate one original IELTS Academic reading set for class {class_name}, day {day_number}. "
        f"Passage level: {level}. {hint} "
        "Topic: rotate across environment, education, technology, health, urban studies. "
        "Do not copy real IELTS papers."
    )
    payload = _ai_json(_GENERATION_SYSTEM, user, max_tokens=4500)
    content = normalize_passage_content(payload)
    if len(content.get("questions") or []) < 8:
        raise RuntimeError("AI generated too few questions")
    return content


_STRUCTURE_SYSTEM = """You are an EAP reading editor. Convert manager source text into IELTS-style reading JSON.
Use the same JSON schema as daily generation (title, passageLevel, lessonEn, lessonZh, paragraphsEn, paragraphsZh, questions).
Infer paragraph breaks from the source. Create 10-14 questions covering the source content.
Mix MC, TFNG, GAP, and MH. Keep answers evidence-based in the text."""


def structure_passage_from_text(
    source_text: str,
    *,
    title_hint: str = "",
    passage_level: str = "P2",
) -> dict[str, Any]:
    cleaned = re.sub(r"\s+", " ", str(source_text or "").strip())
    if len(cleaned) < 200:
        raise ValueError("Source text too short for reading conversion")
    if len(cleaned) > 12000:
        cleaned = cleaned[:12000]
    user = (
        f"Title hint: {title_hint or 'Untitled'}\n"
        f"Target passage level: {passage_level}\n\n"
        f"Source text:\n{cleaned}"
    )
    payload = _ai_json(_STRUCTURE_SYSTEM, user, max_tokens=4500)
    content = normalize_passage_content(payload)
    if not content.get("paragraphsEn") and content.get("passageEn"):
        content["paragraphsEn"] = [p.strip() for p in content["passageEn"].split("\n\n") if p.strip()]
    return content


_FEEDBACK_SYSTEM = """You are an IELTS Academic Reading examiner. Given passage, questions, student answers, and auto-mark results,
return ONLY valid JSON: { "items": [ { "id": "q1", "errorType": string|null, "feedbackEn": string, "feedbackZh": string } ] }
For correct answers: errorType=null, brief praise in feedbackEn.
For wrong answers: errorType one of: wrong_option, not_in_passage, opposite_meaning, over_inference, word_limit, spelling, not_given_confusion.
feedbackEn/Zh: 1-2 sentences with correct answer + evidence quote from passage."""


def enrich_scoring_with_ai_feedback(
    content: dict[str, Any],
    answers: dict[str, Any],
    scoring: dict[str, Any],
) -> dict[str, Any]:
    if not reading_ai_available():
        return scoring
    passage = content.get("passageEn") or ""
    q_summary = []
    for q in content.get("questions") or []:
        qid = q["id"]
        q_summary.append(
            {
                "id": qid,
                "typeId": q.get("typeId"),
                "promptEn": q.get("promptEn"),
                "correctIndex": q.get("correctIndex"),
                "correctAnswer": q.get("correctAnswer"),
                "studentAnswer": answers.get(qid),
                "correct": next(
                    (r.get("correct") for r in scoring.get("results") or [] if r.get("id") == qid),
                    None,
                ),
            }
        )
    user = json.dumps(
        {"passageExcerpt": passage[:6000], "items": q_summary},
        ensure_ascii=False,
    )
    try:
        payload = _ai_json(_FEEDBACK_SYSTEM, user, max_tokens=2000)
    except Exception:
        return scoring
    fb_map = {str(x.get("id")): x for x in (payload.get("items") or [])}
    results = []
    for row in scoring.get("results") or []:
        fb = fb_map.get(str(row.get("id"))) or {}
        merged = dict(row)
        if fb.get("errorType"):
            merged["errorType"] = fb["errorType"]
        if fb.get("feedbackEn"):
            merged["feedbackEn"] = fb["feedbackEn"]
        if fb.get("feedbackZh"):
            merged["feedbackZh"] = fb["feedbackZh"]
        results.append(merged)
    out = dict(scoring)
    out["results"] = results
    return out
