"""
SS-Sp1 — Self-study speaking (Part 1 simulator; Web text + timer; TTS/STT/SOE deferred).
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

SPEAKING_SKILL = "speaking"
PART1_TIME_LIMIT = 60
PART1_MIN_WORDS = 30

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


def _session_payload(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "partType": raw.get("partType") or "P1",
        "title": raw.get("title") or "",
        "lessonEn": raw.get("lessonEn") or "",
        "lessonZh": raw.get("lessonZh") or "",
        "questions": raw.get("questions") or [],
    }


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

    if timed_out:
        fc_improve.append("Timer ended — practise finishing within 60 seconds without rushing.")
    elif elapsed_sec and elapsed_sec >= 45:
        fc_strengths.append("Good use of the full response window.")

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
        "disclaimerEn": "Practice estimate from typed response — not an official IELTS score. TTS/STT/SOE pending.",
        "disclaimerZh": "基于文字稿的练习估分 — 非官方雅思成绩。TTS/STT/SOE 待接入。",
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
                    "questionCount": len(content.get("questions") or []),
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

        return jsonify(
            {
                "session": {
                    "id": row["id"],
                    "title": row["title"],
                    "partType": row["part_type"],
                    "content": content,
                },
                "responses": list(latest_by_q.values()),
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

        if not session_id or not question_id:
            conn.close()
            return jsonify({"error": "sessionId and questionId required"}), 400
        if len(response_text) < 5:
            conn.close()
            return jsonify({"error": "Response too short"}), 400

        row = conn.execute(
            "SELECT content_json FROM speaking_sessions WHERE id = ? AND is_active = 1",
            (session_id,),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Session not found"}), 404

        content = json.loads(row["content_json"])
        q_meta = next((q for q in content.get("questions") or [] if q.get("id") == question_id), None)
        if not q_meta:
            conn.close()
            return jsonify({"error": "Question not found"}), 404

        min_words = int(q_meta.get("minWords") or PART1_MIN_WORDS)
        feedback = _build_feedback(
            response_text,
            min_words=min_words,
            timed_out=bool(timed_out),
            elapsed_sec=elapsed_sec,
        )
        now = _now_iso()
        wc = _word_count(response_text)

        conn.execute(
            """
            INSERT INTO student_speaking_responses
                (student_username, session_id, question_id, response_text, word_count,
                 elapsed_sec, timed_out, feedback_json, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "feedback": feedback})

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
            for q in content.get("questions") or []:
                writer.writerow(
                    [
                        row["id"],
                        row["title"],
                        row["part_type"],
                        q.get("id"),
                        q.get("promptEn"),
                        q.get("timeLimitSec"),
                    ]
                )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="speaking-sessions.csv"'},
        )
