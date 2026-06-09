"""
SS-Sp5 — AI IELTS speaking generation (P1 / P2 / P3) and batch response feedback.
"""
from __future__ import annotations

import json
from typing import Any

PART1_QUESTION_COUNT = 4
PART3_QUESTION_COUNT = 4
PART1_TIME_SEC = 50
PART3_TIME_SEC = 80
PART2_PREP_DELAY_SEC = 15
PART2_PREP_SEC = 60
PART2_TIME_SEC = 120


def speaking_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _ai_json(system: str, user: str, *, max_tokens: int = 5000) -> dict[str, Any]:
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
        temperature=0.45,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    return json.loads(raw)


def _normalize_questions(raw_questions: list[dict], *, part_type: str, time_sec: int) -> list[dict]:
    out: list[dict] = []
    for i, q in enumerate(raw_questions or []):
        out.append(
            {
                "id": str(q.get("id") or f"{part_type.lower()}{i + 1}"),
                "partType": part_type,
                "promptEn": str(q.get("promptEn") or "").strip(),
                "promptZh": str(q.get("promptZh") or "").strip(),
                "timeLimitSec": time_sec,
                "minWords": 25 if part_type == "P1" else 35,
            }
        )
    return out


def _fallback_p1() -> dict[str, Any]:
    return {
        "partType": "P1",
        "title": "Part 1 — Study and daily life",
        "lessonEn": "Answer in full sentences. Each question allows 50 seconds.",
        "lessonZh": "用完整句子回答。每题 50 秒。",
        "batchFeedback": True,
        "questions": _normalize_questions(
            [
                {"promptEn": "Do you work or are you a student?", "promptZh": "你目前工作还是学生？"},
                {"promptEn": "What do you like most about your studies?", "promptZh": "你最喜欢学习的哪一点？"},
                {"promptEn": "How do you usually spend your evenings?", "promptZh": "你通常如何度过晚上？"},
                {"promptEn": "Do you prefer studying alone or with others? Why?", "promptZh": "你更喜欢独自学习还是与他人一起？为什么？"},
            ],
            part_type="P1",
            time_sec=PART1_TIME_SEC,
        ),
    }


def _fallback_p2() -> dict[str, Any]:
    card = {
        "id": "p2-cue",
        "partType": "P2",
        "topicEn": "Describe a place where you like to study",
        "topicZh": "描述一个你喜欢学习的地方",
        "bulletsEn": [
            "where it is",
            "how often you go there",
            "what you do there",
            "and explain why you like studying there",
        ],
        "bulletsZh": [
            "它在哪里",
            "你多久去一次",
            "你在那里做什么",
            "并解释你为什么喜欢在那里学习",
        ],
        "prepDelaySec": PART2_PREP_DELAY_SEC,
        "prepTimeSec": PART2_PREP_SEC,
        "timeLimitSec": PART2_TIME_SEC,
        "minWords": 80,
    }
    return {
        "partType": "P2",
        "title": "Part 2 — Long turn",
        "lessonEn": "You have 1 minute to prepare after the card appears, then speak for 2 minutes.",
        "lessonZh": "卡片出现后准备 1 分钟，然后作答 2 分钟。",
        "batchFeedback": True,
        "cueCard": card,
    }


def _fallback_p3(cue: dict[str, Any] | None) -> dict[str, Any]:
    topic = (cue or {}).get("topicEn") or "studying and learning environments"
    return {
        "partType": "P3",
        "title": "Part 3 — Discussion",
        "lessonEn": f"Questions relate to: {topic}. Each answer allows 80 seconds.",
        "lessonZh": f"问题与 Part 2 话题相关。每题 80 秒。",
        "batchFeedback": True,
        "linkedCueTopicEn": topic,
        "questions": _normalize_questions(
            [
                {
                    "promptEn": "Why do some students prefer studying at home rather than at university?",
                    "promptZh": "为什么有些学生更喜欢在家学习？",
                },
                {
                    "promptEn": "How has technology changed the way students prepare for exams?",
                    "promptZh": "科技如何改变了学生备考的方式？",
                },
                {
                    "promptEn": "Should universities provide more quiet study spaces?",
                    "promptZh": "大学是否应该提供更多安静学习空间？",
                },
                {
                    "promptEn": "Will online learning replace traditional classrooms in the future?",
                    "promptZh": "未来在线学习会取代传统课堂吗？",
                },
            ],
            part_type="P3",
            time_sec=PART3_TIME_SEC,
        ),
    }


_GEN_P1_SYSTEM = """IELTS Speaking Part 1 writer for EAP047. Return ONLY JSON:
{
  "title": string,
  "lessonEn": string, "lessonZh": string,
  "questions": [ exactly 4 items: { "promptEn": string, "promptZh": string } ]
}
Topics: study, hometown, daily routine, technology, hobbies. Natural examiner questions."""


_GEN_P2_SYSTEM = """IELTS Speaking Part 2 cue card writer. Return ONLY JSON:
{
  "title": string,
  "lessonEn": string, "lessonZh": string,
  "cueCard": {
    "topicEn": string, "topicZh": string,
    "bulletsEn": string[4], "bulletsZh": string[4]
  }
}
Classic describe format with 4 bullets ending in "and explain why/how..."."""


_GEN_P3_SYSTEM = """IELTS Speaking Part 3 writer. Return ONLY JSON:
{
  "title": string,
  "lessonEn": string, "lessonZh": string,
  "questions": [ exactly 4 abstract discussion items: { "promptEn": string, "promptZh": string } ]
}
Questions must logically extend the Part 2 cue card topic."""


def generate_part1(class_name: str = "EAP047") -> dict[str, Any]:
    if not speaking_ai_available():
        return _fallback_p1()
    try:
        payload = _ai_json(_GEN_P1_SYSTEM, f"Generate Part 1 for {class_name}. Exactly 4 questions.", max_tokens=2500)
        questions = _normalize_questions(
            (payload.get("questions") or [])[:PART1_QUESTION_COUNT],
            part_type="P1",
            time_sec=PART1_TIME_SEC,
        )
        if len(questions) < PART1_QUESTION_COUNT:
            raise RuntimeError("Too few questions")
        return {
            "partType": "P1",
            "title": str(payload.get("title") or "Part 1 — Introduction"),
            "lessonEn": str(payload.get("lessonEn") or "Answer in full sentences. 50 seconds per question."),
            "lessonZh": str(payload.get("lessonZh") or "用完整句子回答。每题 50 秒。"),
            "batchFeedback": True,
            "questions": questions,
        }
    except Exception:
        return _fallback_p1()


def generate_part2(class_name: str = "EAP047") -> dict[str, Any]:
    if not speaking_ai_available():
        return _fallback_p2()
    try:
        payload = _ai_json(_GEN_P2_SYSTEM, f"Generate Part 2 cue card for {class_name}.", max_tokens=2000)
        cue = payload.get("cueCard") or {}
        card = {
            "id": "p2-cue",
            "partType": "P2",
            "topicEn": str(cue.get("topicEn") or "").strip(),
            "topicZh": str(cue.get("topicZh") or "").strip(),
            "bulletsEn": list(cue.get("bulletsEn") or [])[:4],
            "bulletsZh": list(cue.get("bulletsZh") or [])[:4],
            "prepDelaySec": PART2_PREP_DELAY_SEC,
            "prepTimeSec": PART2_PREP_SEC,
            "timeLimitSec": PART2_TIME_SEC,
            "minWords": 80,
        }
        if not card["topicEn"] or len(card["bulletsEn"]) < 3:
            raise RuntimeError("Invalid cue card")
        return {
            "partType": "P2",
            "title": str(payload.get("title") or "Part 2 — Long turn"),
            "lessonEn": str(payload.get("lessonEn") or "Prepare for 1 minute, then speak for 2 minutes."),
            "lessonZh": str(payload.get("lessonZh") or "准备 1 分钟后作答 2 分钟。"),
            "batchFeedback": True,
            "cueCard": card,
        }
    except Exception:
        return _fallback_p2()


def generate_part3(cue_context: dict[str, Any], class_name: str = "EAP047") -> dict[str, Any]:
    if not speaking_ai_available():
        return _fallback_p3(cue_context)
    topic_en = str(cue_context.get("topicEn") or cue_context.get("topic") or "").strip()
    bullets = cue_context.get("bulletsEn") or []
    user = (
        f"Part 2 cue topic: {topic_en}. Bullets: {json.dumps(bullets, ensure_ascii=False)}. "
        f"Class {class_name}. Exactly 4 Part 3 questions linked to this topic."
    )
    try:
        payload = _ai_json(_GEN_P3_SYSTEM, user, max_tokens=2800)
        questions = _normalize_questions(
            (payload.get("questions") or [])[:PART3_QUESTION_COUNT],
            part_type="P3",
            time_sec=PART3_TIME_SEC,
        )
        if len(questions) < PART3_QUESTION_COUNT:
            raise RuntimeError("Too few questions")
        return {
            "partType": "P3",
            "title": str(payload.get("title") or "Part 3 — Discussion"),
            "lessonEn": str(payload.get("lessonEn") or "Develop each answer with reasons and examples. 80 seconds each."),
            "lessonZh": str(payload.get("lessonZh") or "用理由与例子展开。每题 80 秒。"),
            "batchFeedback": True,
            "linkedCueTopicEn": topic_en,
            "questions": questions,
        }
    except Exception:
        return _fallback_p3(cue_context)


_FEEDBACK_SYSTEM = """IELTS speaking examiner. For each item return JSON:
{
  "items": [
    {
      "id": "q1",
      "overallBandEstimate": number,
      "summaryEn": string,
      "summaryZh": string,
      "fluencyEn": string, "fluencyZh": string,
      "vocabularyEn": string, "vocabularyZh": string,
      "grammarEn": string, "grammarZh": string,
      "pronunciationEn": string, "pronunciationZh": string,
      "improvementsEn": string[],
      "improvementsZh": string[]
    }
  ]
}
Be constructive; reference the student's transcript. Bands 4.0–8.0 in 0.5 steps."""


def build_batch_ai_feedback(
    part_type: str,
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """items: { id, promptEn, promptZh, transcript, timedOut, elapsedSec }"""
    if not speaking_ai_available():
        return [_minimal_feedback_row(it, part_type) for it in items]
    user = json.dumps({"partType": part_type, "items": items}, ensure_ascii=False)
    try:
        payload = _ai_json(_FEEDBACK_SYSTEM, user, max_tokens=4000)
        fb_map = {str(x.get("id")): x for x in (payload.get("items") or [])}
    except Exception:
        return [_minimal_feedback_row(it, part_type) for it in items]

    out: list[dict[str, Any]] = []
    for it in items:
        fb = fb_map.get(str(it.get("id"))) or {}
        row = _minimal_feedback_row(it, part_type)
        row.update(
            {
                "overallBandEstimate": fb.get("overallBandEstimate") or row["overallBandEstimate"],
                "summaryEn": fb.get("summaryEn") or row["summaryEn"],
                "summaryZh": fb.get("summaryZh") or row["summaryZh"],
                "criteria": [
                    {
                        "id": "FC",
                        "labelEn": "Fluency and Coherence",
                        "labelZh": "流利度与连贯性",
                        "commentEn": fb.get("fluencyEn") or "",
                        "commentZh": fb.get("fluencyZh") or "",
                    },
                    {
                        "id": "LR",
                        "labelEn": "Lexical Resource",
                        "labelZh": "词汇资源",
                        "commentEn": fb.get("vocabularyEn") or "",
                        "commentZh": fb.get("vocabularyZh") or "",
                    },
                    {
                        "id": "GRA",
                        "labelEn": "Grammar",
                        "labelZh": "语法",
                        "commentEn": fb.get("grammarEn") or "",
                        "commentZh": fb.get("grammarZh") or "",
                    },
                    {
                        "id": "PR",
                        "labelEn": "Pronunciation",
                        "labelZh": "发音",
                        "commentEn": fb.get("pronunciationEn") or "",
                        "commentZh": fb.get("pronunciationZh") or "",
                    },
                ],
                "improvementsEn": fb.get("improvementsEn") or [],
                "improvementsZh": fb.get("improvementsZh") or [],
                "aiGenerated": True,
            }
        )
        out.append(row)
    return out


def _minimal_feedback_row(item: dict[str, Any], part_type: str) -> dict[str, Any]:
    transcript = str(item.get("transcript") or "")
    wc = len(__import__("re").findall(r"[A-Za-z0-9\u4e00-\u9fff]+", transcript))
    min_w = 25 if part_type == "P1" else 35 if part_type == "P3" else 80
    band = 6.0 if wc >= min_w else 5.0
    if item.get("timedOut") and wc < min_w:
        band = 4.5
    return {
        "id": item.get("id"),
        "overallBandEstimate": band,
        "summaryEn": "Practice feedback based on your transcript length and response.",
        "summaryZh": "根据你的转写稿长度与作答情况的练习反馈。",
        "criteria": [],
        "improvementsEn": ["Extend answers with reasons and examples."] if wc < min_w else [],
        "improvementsZh": ["用理由与例子充分展开。"] if wc < min_w else [],
        "aiGenerated": False,
        "transcript": transcript,
        "timedOut": bool(item.get("timedOut")),
    }
