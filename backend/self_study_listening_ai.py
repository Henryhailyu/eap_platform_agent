"""
SS-L3a — AI listening passage generation (IELTS Part 3 / Part 4) and practice feedback.
"""
from __future__ import annotations

import json
import re
from typing import Any

from self_study_dialogue import assign_dialogue_genders

_MIN_SCRIPT_WORDS = 650
_MIN_QUESTION_COUNT = 10

_P3_TYPES = frozenset({"LMC", "LM", "LSeC", "LSAQ"})
_P4_TYPES = frozenset({"LMC", "LNC", "LSC", "LSeC", "LTC"})


def listening_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _ai_json(system: str, user: str, *, max_tokens: int = 7000) -> dict[str, Any]:
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


def _normalize_questions(questions: list[dict], part_type: str) -> list[dict]:
    allowed = _P3_TYPES if part_type == "P3" else _P4_TYPES
    out: list[dict] = []
    for i, q in enumerate(questions or []):
        qid = str(q.get("id") or f"q{i + 1}")
        type_id = str(q.get("typeId") or "LMC").upper()
        if type_id not in allowed:
            type_id = "LMC"
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
        if type_id == "LM":
            pairs = []
            for p in q.get("pairs") or []:
                pairs.append(
                    {
                        "left": str(p.get("left") or "").strip(),
                        "right": str(p.get("right") or "").strip(),
                    }
                )
            item["pairs"] = pairs
        elif type_id in ("LSeC", "LNC", "LSAQ", "LSC", "LFC"):
            item["correctAnswer"] = str(q.get("correctAnswer") or "").strip()
            item["wordLimit"] = int(q.get("wordLimit") or 3)
        else:
            item["correctIndex"] = int(q.get("correctIndex") or 0)
        out.append(item)
    return out


def script_word_count(content: dict[str, Any]) -> int:
    text = str(content.get("scriptEn") or "").strip()
    if not text:
        turns = content.get("turns") or []
        if turns:
            text = " ".join(str(t.get("text") or "") for t in turns)
        else:
            text = " ".join(str(p) for p in (content.get("paragraphs") or []))
    return len(re.sub(r"\s+", " ", text).split())


def item_needs_upgrade(content: dict[str, Any]) -> bool:
    return script_word_count(content) < _MIN_SCRIPT_WORDS or len(content.get("questions") or []) < _MIN_QUESTION_COUNT


def normalize_listening_content(raw: dict[str, Any]) -> dict[str, Any]:
    part_type = str(raw.get("partType") or "P4").upper()
    if part_type not in ("P3", "P4"):
        part_type = "P4"

    turns = []
    for t in raw.get("turns") or []:
        gender = str(t.get("gender") or "").lower()
        if gender not in ("male", "female"):
            gender = ""
        turns.append(
            {
                "speaker": str(t.get("speaker") or "Speaker").strip(),
                "gender": gender,
                "text": str(t.get("text") or "").strip(),
            }
        )
    if part_type == "P3" and turns:
        turns = assign_dialogue_genders(turns)

    paragraphs = [str(p).strip() for p in (raw.get("paragraphs") or []) if str(p).strip()]
    script_en = str(raw.get("scriptEn") or "").strip()
    script_zh = str(raw.get("scriptZh") or "").strip()
    if not script_en and turns:
        script_en = "\n\n".join(f"{t['speaker']}: {t['text']}" for t in turns if t["text"])
    if not script_en and paragraphs:
        script_en = "\n\n".join(paragraphs)
    if not script_zh and turns:
        script_zh = "\n\n".join(f"{t['speaker']}: {t['text']}" for t in turns if t["text"])

    tips_en = raw.get("coachingTipsEn") or []
    tips_zh = raw.get("coachingTipsZh") or []
    if isinstance(tips_en, str):
        tips_en = [tips_en] if tips_en else []
    if isinstance(tips_zh, str):
        tips_zh = [tips_zh] if tips_zh else []

    return {
        "partType": part_type,
        "title": str(raw.get("title") or "Listening practice").strip(),
        "lessonEn": str(raw.get("lessonEn") or "").strip(),
        "lessonZh": str(raw.get("lessonZh") or "").strip(),
        "turns": turns,
        "paragraphs": paragraphs,
        "scriptEn": script_en,
        "scriptZh": script_zh,
        "questions": _normalize_questions(raw.get("questions") or [], part_type),
        "exemplarNotesEn": str(raw.get("exemplarNotesEn") or "").strip(),
        "exemplarNotesZh": str(raw.get("exemplarNotesZh") or "").strip(),
        "coachingTipsEn": list(tips_en),
        "coachingTipsZh": list(tips_zh),
        "keyPointsEn": raw.get("keyPointsEn") or [],
        "keyPointsZh": raw.get("keyPointsZh") or [],
    }


def _validate_content(content: dict[str, Any]) -> None:
    wc = script_word_count(content)
    qn = len(content.get("questions") or [])
    if wc < _MIN_SCRIPT_WORDS:
        raise RuntimeError(f"Script too short ({wc} words; need {_MIN_SCRIPT_WORDS}+)")
    if qn < _MIN_QUESTION_COUNT:
        raise RuntimeError(f"Too few questions ({qn}; need {_MIN_QUESTION_COUNT}+)")


_GENERATION_SYSTEM = """You are an IELTS Academic Listening item writer for EAP047 (Part 3 discussion OR Part 4 lecture only).
Return ONLY valid JSON.

Part 3 shape:
{
  "partType": "P3",
  "title": string,
  "lessonEn": string, "lessonZh": string,
  "turns": [ { "speaker": string, "gender": "male"|"female", "text": string } ],
  "questions": [ ... exactly 10 items ... ],
  "exemplarNotesEn": string (bullet-style notes, one key point per line),
  "exemplarNotesZh": string,
  "coachingTipsEn": string[],
  "coachingTipsZh": string[],
  "keyPointsEn": string[],
  "keyPointsZh": string[]
}

Part 4 shape:
{
  "partType": "P4",
  "title": string,
  "lessonEn": string, "lessonZh": string,
  "paragraphs": string[] (7-10 lecture paragraphs),
  "questions": [ ... exactly 10 items ... ],
  "exemplarNotesEn": string,
  "exemplarNotesZh": string,
  "coachingTipsEn": string[],
  "coachingTipsZh": string[],
  "keyPointsEn": string[],
  "keyPointsZh": string[]
}

Question object:
{
  "id": "q1",
  "typeId": "LMC"|"LM"|"LSeC"|"LSAQ"|"LNC"|"LSC"|"LTC",
  "instructionEn": string (IELTS instruction line),
  "instructionZh": string,
  "promptEn": string,
  "promptZh": string,
  "optionsEn": string[] (for LMC, LM option pool, LTC),
  "optionsZh": string[],
  "correctIndex": number (LMC, LTC),
  "correctAnswer": string (LSeC, LNC, LSAQ, LSC — verbatim from script, obey wordLimit),
  "wordLimit": number,
  "pairs": [{"left": string, "right": string}] (LM only — match speaker/heading to opinion/fact),
  "evidenceEn": string,
  "evidenceZh": string
}

Rules:
- Part 3: exactly 2 speakers (one male, one female) plus optional tutor; 700-900 words total in turns.
- Part 4: single lecturer; 700-1000 words in paragraphs (up to 1100).
- Exactly 10 questions in recording order.
- Part 3 mix: at least 3 LMC, 2 LM, 2 LSeC, 1 LSAQ.
- Part 4 mix: at least 3 LNC, 2 LSC, 2 LMC, 1 LSeC.
- Answers verbatim from script; strict word limits on gap items.
- Academic EAP047 register; original content only."""


def generate_daily_listening(
    part_type: str,
    day_number: int,
    class_name: str = "EAP047",
) -> dict[str, Any]:
    pt = part_type.upper() if part_type.upper() in ("P3", "P4") else "P4"
    topic_hint = (
        "Part 3 academic discussion between a male tutor and a female student (plus one male student if needed)."
        if pt == "P3"
        else "Part 4 academic lecture monologue."
    )
    user = (
        f"Generate IELTS Listening {pt} for class {class_name}, day {day_number}. {topic_hint} "
        "Topic rotate: campus sustainability, online learning, urban planning, health policy, AI in education."
    )
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            payload = _ai_json(_GENERATION_SYSTEM, user, max_tokens=7500)
            payload["partType"] = pt
            content = normalize_listening_content(payload)
            _validate_content(content)
            return content
        except Exception as exc:
            last_err = exc
            user += " Increase script length and ensure exactly 10 mixed questions."
    raise RuntimeError(str(last_err) if last_err else "AI generation failed")


_FEEDBACK_SYSTEM = """IELTS Listening examiner. Given script excerpt, questions, student answers, and auto-mark results,
return ONLY JSON: { "items": [ { "id": "q1", "errorType": string|null, "feedbackEn": string, "feedbackZh": string } ] }
Correct: errorType=null, brief praise. Wrong: errorType in wrong_option, not_in_recording, spelling, word_limit, order_error, not_given_confusion.
Include correct answer and script evidence in feedbackEn/Zh."""


def enrich_scoring_with_ai_feedback(
    content: dict[str, Any],
    answers: dict[str, Any],
    scoring: dict[str, Any],
) -> dict[str, Any]:
    if not listening_ai_available():
        return scoring
    script = (content.get("scriptEn") or "")[:6000]
    items = []
    for q in content.get("questions") or []:
        qid = q["id"]
        items.append(
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
    user = json.dumps({"scriptExcerpt": script, "items": items}, ensure_ascii=False)
    try:
        payload = _ai_json(_FEEDBACK_SYSTEM, user, max_tokens=2200)
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
