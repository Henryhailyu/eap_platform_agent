"""
SS-Sp1–Sp3 — Self-study speaking (P1/P2/P3 + full mock; Web text + timer; TTS/STT/SOE deferred).
"""
from __future__ import annotations

import base64
import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

from tencent_audio import (
    asr_ready,
    audio_status,
    ensure_speaking_prompt_audio,
    evaluate_oral_sentence,
    merge_soe_into_feedback,
    recognize_speech,
    store_student_recording,
)

SPEAKING_SKILL = "speaking"
PART1_TIME_LIMIT = 60
PART1_MIN_WORDS = 30
PART2_PREP_SEC = 60
PART2_TIME_LIMIT = 120
PART2_MIN_WORDS = 80
PART3_TIME_LIMIT = 90
PART3_MIN_WORDS = 40

SEED_SESSION_A: dict[str, Any] = {
    "title": "Part 1 — Study and daily life",
    "partType": "P1",
    "lessonEn": "Answer in full sentences. Point → reason → short example. Keep going until the timer ends.",
    "lessonZh": "用完整句子回答。观点 → 理由 → 短例子。计时结束前尽量说完。",
    "questions": [
        {
            "id": "sp1a1",
            "promptEn": "Do you work or are you a student?",
            "promptZh": "你目前工作还是学生？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1a2",
            "promptEn": "What do you like most about your field of study?",
            "promptZh": "你最喜欢自己专业的哪一点？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1a3",
            "promptEn": "How do you usually spend your evenings?",
            "promptZh": "你通常如何度过晚上？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1a4",
            "promptEn": "Do you prefer studying alone or with others? Why?",
            "promptZh": "你更喜欢独自学习还是与他人一起？为什么？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
    ],
}

SEED_SESSION_B: dict[str, Any] = {
    "title": "Part 1 — Technology and learning",
    "partType": "P1",
    "lessonEn": "Use linking phrases (however, for example, as a result). Avoid one-word answers.",
    "lessonZh": "使用连接词（however、for example、as a result）。避免单词回答。",
    "questions": [
        {
            "id": "sp1b1",
            "promptEn": "How often do you use technology for learning?",
            "promptZh": "你多常使用科技来学习？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1b2",
            "promptEn": "What are the advantages of online resources for students?",
            "promptZh": "在线资源对学生有哪些好处？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1b3",
            "promptEn": "Is there anything you dislike about using apps for study?",
            "promptZh": "用 App 学习有什么你不喜欢的地方吗？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
        {
            "id": "sp1b4",
            "promptEn": "How might technology change university education in the future?",
            "promptZh": "科技未来可能如何改变大学教育？",
            "timeLimitSec": 60,
            "minWords": 30,
        },
    ],
}

SEED_SESSION_P2: dict[str, Any] = {
    "title": "Part 2 — A place where you study",
    "partType": "P2",
    "lessonEn": "Use the 60s prep to plan each bullet. Speak for the full 2 minutes — intro, each bullet, brief conclusion.",
    "lessonZh": "用 60 秒准备规划各要点。尽量说满 2 分钟 — 开场、各要点、简短收尾。",
    "cueCard": {
        "id": "p2-study-place",
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
        "prepTimeSec": PART2_PREP_SEC,
        "timeLimitSec": PART2_TIME_LIMIT,
        "minWords": PART2_MIN_WORDS,
    },
}

SEED_SESSION_P3: dict[str, Any] = {
    "title": "Part 3 — Studying and learning environments",
    "partType": "P3",
    "lessonEn": "Give developed answers with reasons and examples. Part 3 questions are more abstract than Part 1.",
    "lessonZh": "用理由与例子充分展开。Part 3 问题比 Part 1 更抽象。",
    "questions": [
        {
            "id": "p3q1",
            "promptEn": "Why do some students prefer studying at home rather than at university?",
            "promptZh": "为什么有些学生更喜欢在家而不是在大学学习？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
        {
            "id": "p3q2",
            "promptEn": "How has technology changed the way students prepare for exams?",
            "promptZh": "科技如何改变了学生备考的方式？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
        {
            "id": "p3q3",
            "promptEn": "Do you think universities should provide more quiet study spaces? Why or why not?",
            "promptZh": "你认为大学是否应该提供更多安静学习空间？为什么？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
        {
            "id": "p3q4",
            "promptEn": "In the future, will online learning replace traditional classrooms?",
            "promptZh": "未来在线学习会取代传统课堂吗？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
    ],
}

SEED_SESSION_MOCK: dict[str, Any] = {
    "title": "Full speaking mock — Study & technology",
    "partType": "MOCK",
    "lessonEn": "Complete Part 1 → Part 2 → Part 3 in one sitting (~11–14 min flow, shortened for Web MVP).",
    "lessonZh": "连续完成 Part 1 → Part 2 → Part 3（完整模考流程，网页版为精简版）。",
    "steps": [
        {
            "id": "mock-p1-1",
            "partType": "P1",
            "promptEn": "Do you enjoy studying?",
            "promptZh": "你喜欢学习吗？",
            "timeLimitSec": PART1_TIME_LIMIT,
            "minWords": PART1_MIN_WORDS,
        },
        {
            "id": "mock-p1-2",
            "partType": "P1",
            "promptEn": "What subject do you find most challenging?",
            "promptZh": "你觉得哪门学科最有挑战性？",
            "timeLimitSec": PART1_TIME_LIMIT,
            "minWords": PART1_MIN_WORDS,
        },
        {
            "id": "mock-p2",
            "partType": "P2",
            "topicEn": "Describe a piece of technology you use for studying",
            "topicZh": "描述一件你用于学习的科技产品",
            "bulletsEn": [
                "what it is",
                "how you use it",
                "how long you have used it",
                "and explain why it is useful for your studies",
            ],
            "bulletsZh": [
                "它是什么",
                "你如何使用它",
                "你用了多久",
                "并解释它为何对你的学习有用",
            ],
            "prepTimeSec": PART2_PREP_SEC,
            "timeLimitSec": PART2_TIME_LIMIT,
            "minWords": PART2_MIN_WORDS,
        },
        {
            "id": "mock-p3-1",
            "partType": "P3",
            "promptEn": "How important is technology in modern education?",
            "promptZh": "科技在现代教育中有多重要？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
        {
            "id": "mock-p3-2",
            "partType": "P3",
            "promptEn": "Should schools limit students' screen time? Why?",
            "promptZh": "学校是否应该限制学生的屏幕时间？为什么？",
            "timeLimitSec": PART3_TIME_LIMIT,
            "minWords": PART3_MIN_WORDS,
        },
    ],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def migrate_self_study_speaking_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS speaking_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT,
            part_type TEXT NOT NULL DEFAULT 'P1',
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            content_json TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_speaking_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            session_id INTEGER NOT NULL,
            question_id TEXT NOT NULL,
            response_text TEXT NOT NULL,
            word_count INTEGER NOT NULL DEFAULT 0,
            elapsed_sec INTEGER,
            timed_out INTEGER NOT NULL DEFAULT 0,
            feedback_json TEXT,
            submitted_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES speaking_sessions(id) ON DELETE CASCADE
        )
        """
    )
    seed_default_speaking_sessions(conn)
    seed_extended_speaking_sessions(conn)
    _migrate_speaking_audio_column(conn)


def _migrate_speaking_audio_column(conn) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(student_speaking_responses)")}
    if "audio_cos_key" not in cols:
        conn.execute("ALTER TABLE student_speaking_responses ADD COLUMN audio_cos_key TEXT")
        conn.commit()


def _item_prompt_en(item: dict[str, Any]) -> str:
    return str(item.get("promptEn") or item.get("topicEn") or "").strip()


def _enrich_session_items(session_id: int, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        copy = dict(item)
        prompt = _item_prompt_en(item)
        if prompt and item.get("id"):
            audio = ensure_speaking_prompt_audio(session_id, str(item["id"]), prompt)
            if audio:
                copy["promptAudio"] = audio
        out.append(copy)
    return out


def _session_payload(raw: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "partType": raw.get("partType") or "P1",
        "title": raw.get("title") or "",
        "lessonEn": raw.get("lessonEn") or "",
        "lessonZh": raw.get("lessonZh") or "",
        "questions": raw.get("questions") or [],
    }
    if raw.get("cueCard"):
        payload["cueCard"] = raw["cueCard"]
    if raw.get("steps"):
        payload["steps"] = raw["steps"]
    return payload


def _session_items(content: dict[str, Any], part_type: str) -> list[dict[str, Any]]:
    if part_type == "MOCK":
        return list(content.get("steps") or [])
    if part_type == "P2" and content.get("cueCard"):
        card = dict(content["cueCard"])
        card.setdefault("partType", "P2")
        return [card]
    items = list(content.get("questions") or [])
    for item in items:
        item.setdefault("partType", part_type)
    return items


def _item_count(content: dict[str, Any], part_type: str) -> int:
    return len(_session_items(content, part_type))


def _find_item(content: dict[str, Any], part_type: str, question_id: str) -> dict[str, Any] | None:
    for item in _session_items(content, part_type):
        if str(item.get("id") or "") == question_id:
            return item
    return None


def seed_default_speaking_sessions(conn) -> None:
    existing = conn.execute(
        "SELECT id FROM speaking_sessions WHERE class_name = ? LIMIT 1",
        ("EAP047",),
    ).fetchone()
    if existing:
        return
    now = _now_iso()
    for i, sess in enumerate([SEED_SESSION_A, SEED_SESSION_B], start=1):
        conn.execute(
            """
            INSERT INTO speaking_sessions (class_name, part_type, title, sort_order, content_json, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                "EAP047",
                sess["partType"],
                sess["title"],
                i,
                json.dumps(_session_payload(sess), ensure_ascii=False),
                now,
                now,
            ),
        )
    conn.commit()


def seed_extended_speaking_sessions(conn) -> None:
    """Add P2, P3, and full mock seeds when missing (existing deployments)."""
    now = _now_iso()
    seeds = [SEED_SESSION_P2, SEED_SESSION_P3, SEED_SESSION_MOCK]
    max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM speaking_sessions").fetchone()
    order = int(max_order["m"] if max_order else 0)
    for sess in seeds:
        exists = conn.execute(
            "SELECT id FROM speaking_sessions WHERE class_name = ? AND title = ? LIMIT 1",
            ("EAP047", sess["title"]),
        ).fetchone()
        if exists:
            continue
        order += 1
        conn.execute(
            """
            INSERT INTO speaking_sessions (class_name, part_type, title, sort_order, content_json, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                "EAP047",
                sess["partType"],
                sess["title"],
                order,
                json.dumps(_session_payload(sess), ensure_ascii=False),
                now,
                now,
            ),
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


def _word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", text or "")
    return len(words)


def _round_band_half(avg: float) -> float:
    return round(avg * 2) / 2


def _has_connectors(text: str) -> bool:
    low = (text or "").lower()
    markers = ("because", "however", "for example", "also", "usually", "prefer", "although", "so ")
    return any(m in low for m in markers)


def _build_feedback(
    response: str,
    *,
    min_words: int,
    timed_out: bool,
    elapsed_sec: int | None,
    part_type: str = "P1",
) -> dict[str, Any]:
    wc = _word_count(response)
    connectors = _has_connectors(response)
    sentences = [s.strip() for s in re.split(r"[.!?]+", response) if s.strip()]

    fc_delta = 0.0
    lr_delta = 0.0
    gra_delta = 0.0
    pr_delta = 0.0

    fc_strengths: list[str] = []
    fc_improve: list[str] = []
    lr_strengths: list[str] = []
    lr_improve: list[str] = []
    gra_strengths: list[str] = []
    gra_improve: list[str] = []
    pr_strengths: list[str] = []
    pr_improve: list[str] = []

    if wc >= min_words:
        fc_delta += 0.5
        fc_strengths.append("Answer length is developing — you sustained a short turn.")
    else:
        fc_delta -= 0.8
        fc_improve.append(f"Extend to at least {min_words} words with reasons and examples.")

    if connectors:
        fc_delta += 0.4
        fc_strengths.append("Uses linking phrases to connect ideas.")
    else:
        fc_improve.append("Add connectors: because, however, for example.")

    time_hint = { "P1": "60 seconds", "P2": "2 minutes", "P3": "90 seconds", "MOCK": "the time limit" }.get(part_type, "the time limit")
    full_window = { "P1": 45, "P2": 90, "P3": 60, "MOCK": 45 }.get(part_type, 45)

    if timed_out:
        fc_improve.append(f"Timer ended — practise finishing within {time_hint} without rushing.")
    elif elapsed_sec and elapsed_sec >= full_window:
        fc_strengths.append("Good use of the full response window.")

    if part_type == "P2" and wc >= min_words:
        fc_delta += 0.3
        fc_strengths.append("Long-turn structure — you covered the cue card at length.")
    if part_type == "P3":
        abstract = sum(1 for t in ("because", "however", "society", "education", "important", "future", "should") if t in response.lower())
        if abstract >= 2:
            lr_delta += 0.3
            lr_strengths.append("Abstract discussion vocabulary is developing.")

    if len(sentences) >= 3:
        gra_delta += 0.4
        gra_strengths.append("Multiple sentences — shows grammatical range.")
    else:
        gra_improve.append("Build 3–4 full sentences instead of fragments.")

    academic = sum(1 for t in ("study", "university", "technology", "learning", "prefer", "usually") if t in response.lower())
    if academic >= 2:
        lr_delta += 0.4
        lr_strengths.append("Topic vocabulary is on track.")
    else:
        lr_improve.append("Use topic words from the question in your answer.")

    pr_improve.append("Pronunciation scored from transcript only — enable recording + SOE for PR feedback.")
    pr_strengths.append("Clear written transcript received (speech scoring when STT is enabled).")

    criteria = [
        {
            "id": "FC",
            "labelEn": "Fluency and Coherence",
            "labelZh": "流利度与连贯性",
            "band": _round_band_half(max(4.0, min(8.0, 5.5 + fc_delta))),
            "strengths": fc_strengths,
            "improvements": fc_improve,
        },
        {
            "id": "LR",
            "labelEn": "Lexical Resource",
            "labelZh": "词汇资源",
            "band": _round_band_half(max(4.0, min(8.0, 5.5 + lr_delta))),
            "strengths": lr_strengths,
            "improvements": lr_improve,
        },
        {
            "id": "GRA",
            "labelEn": "Grammatical Range and Accuracy",
            "labelZh": "语法多样性与准确性",
            "band": _round_band_half(max(4.0, min(8.0, 5.5 + gra_delta))),
            "strengths": gra_strengths,
            "improvements": gra_improve,
        },
        {
            "id": "PR",
            "labelEn": "Pronunciation",
            "labelZh": "发音",
            "band": _round_band_half(max(4.0, min(7.0, 5.0 + pr_delta))),
            "strengths": pr_strengths,
            "improvements": pr_improve,
        },
    ]
    overall = _round_band_half(sum(c["band"] for c in criteria) / len(criteria))

    upgrades = []
    if not connectors:
        upgrades.append("I prefer studying with others because we can clarify ideas together.")
    if wc < min_words:
        upgrades.append("For example, I usually review lecture notes in the evening because it helps me prepare for seminars.")

    return {
        "wordCount": wc,
        "minWords": min_words,
        "timedOut": timed_out,
        "elapsedSec": elapsed_sec,
        "overallBandEstimate": overall,
        "disclaimerEn": "Practice estimate — not an official IELTS score. Audio features depend on server TTS/ASR/SOE settings.",
        "disclaimerZh": "练习估分 — 非官方雅思成绩。语音功能取决于服务器 TTS/ASR/SOE 配置。",
        "criteria": criteria,
        "actionableNextSteps": fc_improve[:2] + lr_improve[:1],
        "sampleUpgradePhrases": upgrades[:2],
    }


def register_self_study_speaking_routes(
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

    @app.route("/api/student/self-study/speaking/overview", methods=["GET"])
    def student_speaking_overview():
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
        rows = conn.execute(
            """
            SELECT id, title, part_type, sort_order, content_json
            FROM speaking_sessions
            WHERE is_active = 1 AND (class_name IS NULL OR class_name = ?)
            ORDER BY sort_order ASC, id ASC
            """,
            (class_name,),
        ).fetchall()

        answered = conn.execute(
            "SELECT COUNT(*) AS n FROM student_speaking_responses WHERE student_username = ?",
            (username,),
        ).fetchone()
        conn.close()

        sessions_out = []
        for r in rows:
            content = json.loads(r["content_json"])
            sessions_out.append(
                {
                    "id": r["id"],
                    "title": r["title"],
                    "partType": r["part_type"],
                    "questionCount": _item_count(content, r["part_type"]),
                }
            )

        return jsonify(
            {
                "className": class_name,
                "channel": "B",
                "noDailyPush": True,
                "sessions": sessions_out,
                "responsesCount": int(answered["n"] if answered else 0),
            }
        )

    @app.route("/api/student/self-study/speaking/history", methods=["GET"])
    def student_speaking_history():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        rows = conn.execute(
            """
            SELECT r.question_id, r.word_count, r.timed_out, r.submitted_at,
                   json_extract(r.feedback_json, '$.overallBandEstimate') AS band,
                   s.title AS session_title, s.part_type
            FROM student_speaking_responses r
            JOIN speaking_sessions s ON s.id = r.session_id
            WHERE r.student_username = ?
            ORDER BY r.submitted_at DESC
            LIMIT 50
            """,
            (username,),
        ).fetchall()
        conn.close()

        entries = [
            {
                "questionId": r["question_id"],
                "sessionTitle": r["session_title"],
                "partType": r["part_type"],
                "wordCount": r["word_count"],
                "timedOut": bool(r["timed_out"]),
                "submittedAt": r["submitted_at"],
                "overallBandEstimate": r["band"],
            }
            for r in rows
        ]
        bands = [float(e["overallBandEstimate"]) for e in entries if e.get("overallBandEstimate") is not None]
        recent = bands[:10]
        trend_avg = _round_band_half(sum(recent) / len(recent)) if recent else None

        return jsonify(
            {
                "entries": entries,
                "bandTrend": {
                    "recentAverage": trend_avg,
                    "sampleSize": len(recent),
                },
            }
        )

    @app.route("/api/student/self-study/speaking/sessions/<int:session_id>", methods=["GET"])
    def student_speaking_session(session_id: int):
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
            "SELECT * FROM speaking_sessions WHERE id = ? AND is_active = 1",
            (session_id,),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Session not found"}), 404

        content = json.loads(row["content_json"])
        responses = conn.execute(
            """
            SELECT question_id, word_count, timed_out, submitted_at,
                   json_extract(feedback_json, '$.overallBandEstimate') AS band
            FROM student_speaking_responses
            WHERE student_username = ? AND session_id = ?
            ORDER BY submitted_at DESC
            """,
            (username, session_id),
        ).fetchall()
        conn.close()

        latest_by_q: dict[str, dict] = {}
        for r in responses:
            qid = r["question_id"]
            if qid not in latest_by_q:
                latest_by_q[qid] = {
                    "questionId": qid,
                    "wordCount": r["word_count"],
                    "timedOut": bool(r["timed_out"]),
                    "submittedAt": r["submitted_at"],
                    "overallBandEstimate": r["band"],
                }

        part_type = row["part_type"]
        items = _enrich_session_items(row["id"], _session_items(content, part_type))
        return jsonify(
            {
                "session": {
                    "id": row["id"],
                    "title": row["title"],
                    "partType": part_type,
                    "content": content,
                    "items": items,
                    "itemCount": _item_count(content, part_type),
                },
                "responses": list(latest_by_q.values()),
                "audioStatus": audio_status(),
            }
        )

    @app.route("/api/student/self-study/speaking/respond", methods=["POST"])
    def student_speaking_respond():
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
        session_id = int(data.get("sessionId") or 0)
        question_id = str(data.get("questionId") or "").strip()
        response_text = str(data.get("responseText") or data.get("response") or "").strip()
        timed_out = 1 if data.get("timedOut") else 0
        elapsed = data.get("elapsedSec")
        elapsed_sec = int(elapsed) if elapsed is not None else None
        audio_b64 = str(data.get("audioBase64") or "").strip()
        audio_format = str(data.get("audioFormat") or "webm").lower().lstrip(".")
        audio_bytes: bytes | None = None
        audio_cos_key: str | None = None

        if not session_id or not question_id:
            conn.close()
            return jsonify({"error": "sessionId and questionId required"}), 400

        row = conn.execute(
            "SELECT content_json, part_type FROM speaking_sessions WHERE id = ? AND is_active = 1",
            (session_id,),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Session not found"}), 404

        content = json.loads(row["content_json"])
        pt = str(row["part_type"] or "P1")
        q_meta = _find_item(content, pt, question_id)
        if not q_meta:
            conn.close()
            return jsonify({"error": "Question not found"}), 404

        item_part = str(q_meta.get("partType") or pt)
        default_min = {
            "P1": PART1_MIN_WORDS,
            "P2": PART2_MIN_WORDS,
            "P3": PART3_MIN_WORDS,
            "MOCK": PART1_MIN_WORDS,
        }.get(item_part, PART1_MIN_WORDS)
        min_words = int(q_meta.get("minWords") or default_min)

        if audio_b64:
            try:
                audio_bytes = base64.b64decode(audio_b64)
                audio_cos_key = store_student_recording(
                    username, session_id, question_id, audio_bytes, audio_format
                )
                if asr_ready() and len(response_text) < 5:
                    response_text = recognize_speech(audio_bytes, audio_format)
            except Exception as exc:
                conn.close()
                return jsonify({"error": f"Audio processing failed: {exc}"}), 400

        if len(response_text) < 5:
            conn.close()
            return jsonify({"error": "Response too short — type or record your answer"}), 400

        feedback = _build_feedback(
            response_text,
            min_words=min_words,
            timed_out=bool(timed_out),
            elapsed_sec=elapsed_sec,
            part_type=item_part,
        )
        ref_text = _item_prompt_en(q_meta) or response_text
        if audio_bytes:
            soe = evaluate_oral_sentence(audio_bytes, ref_text, audio_format)
            feedback = merge_soe_into_feedback(feedback, soe)
            if audio_cos_key:
                feedback["audioCosKey"] = audio_cos_key
                feedback["transcriptSource"] = "asr" if asr_ready() else "typed"

        now = _now_iso()
        wc = _word_count(response_text)

        conn.execute(
            """
            INSERT INTO student_speaking_responses
                (student_username, session_id, question_id, response_text, word_count,
                 elapsed_sec, timed_out, feedback_json, submitted_at, audio_cos_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                session_id,
                question_id,
                response_text[:20000],
                wc,
                elapsed_sec,
                timed_out,
                json.dumps(feedback, ensure_ascii=False),
                now,
                audio_cos_key,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "feedback": feedback, "transcript": response_text})

    @app.route("/api/admin/self-study/speaking/sessions", methods=["GET"])
    def admin_speaking_sessions():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, class_name, part_type, sort_order, is_active FROM speaking_sessions ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        return jsonify(
            {
                "sessions": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "className": r["class_name"],
                        "partType": r["part_type"],
                        "sortOrder": r["sort_order"],
                        "isActive": bool(r["is_active"]),
                    }
                    for r in rows
                ]
            }
        )

    @app.route("/api/admin/self-study/speaking/sessions/export.csv", methods=["GET"])
    def admin_speaking_export():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, part_type, content_json FROM speaking_sessions WHERE is_active = 1 ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["session_id", "title", "part_type", "question_id", "prompt_en", "time_limit_sec"])
        for row in rows:
            content = json.loads(row["content_json"])
            for item in _session_items(content, row["part_type"]):
                prompt = item.get("promptEn") or item.get("topicEn") or ""
                limit = item.get("timeLimitSec") or item.get("prepTimeSec")
                writer.writerow(
                    [
                        row["id"],
                        row["title"],
                        item.get("partType") or row["part_type"],
                        item.get("id"),
                        prompt,
                        limit,
                    ]
                )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="speaking-sessions.csv"'},
        )
