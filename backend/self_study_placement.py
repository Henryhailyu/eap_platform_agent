"""
AI placement test — isolated from Channel B daily self-study flows.

Generates a fresh IELTS-style exam per attempt, TTS listening audio, ASR+AI speaking/writing grading.
"""
from __future__ import annotations

import base64
import json
import logging
import random
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from flask import jsonify, request

from eap_ai import ai_is_configured, create_chat_completion, format_ai_error, get_openai_client, parse_ai_json_object
from tencent_audio import asr_ready, ensure_listening_audio, ensure_speaking_prompt_audio, prepare_audio_for_tencent, recognize_speech, tts_ready

log = logging.getLogger("eap.placement")

VALID_LEVELS = frozenset({"beginner", "intermediate", "advanced"})
_PLACEMENT_VERSION = 2


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def migrate_placement_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS placement_exam_sessions (
            id TEXT PRIMARY KEY,
            student_username TEXT NOT NULL,
            exam_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            submitted_at TEXT,
            result_json TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_placement_exam_student ON placement_exam_sessions(student_username)"
    )


def band_to_level(band: float) -> str:
    if band >= 7.0:
        return "advanced"
    if band >= 6.0:
        return "intermediate"
    return "beginner"


def ratio_to_band(ratio: float) -> float:
    raw = 4.0 + max(0.0, min(1.0, float(ratio))) * 5.0
    return round(raw * 2) / 2


def _ai_json(system: str, user: str, *, max_tokens: int = 4500) -> dict[str, Any]:
    if not ai_is_configured():
        raise RuntimeError("AI is not configured on this server")
    client, profile = get_openai_client()
    response = create_chat_completion(
        client,
        profile,
        messages=[
            {"role": "system", "content": system.strip()},
            {"role": "user", "content": user.strip()},
        ],
        max_tokens=max_tokens,
        temperature=0.65,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    return parse_ai_json_object(raw)


def _normalize_mcq_questions(raw_list: Any, prefix: str, *, min_count: int, max_count: int) -> list[dict]:
    items = raw_list if isinstance(raw_list, list) else []
    out: list[dict] = []
    for i, row in enumerate(items):
        if not isinstance(row, dict):
            continue
        opts = row.get("options") or []
        if not isinstance(opts, list) or len(opts) < 2:
            continue
        options = [str(o).strip() for o in opts if str(o).strip()][:6]
        if len(options) < 2:
            continue
        try:
            correct_index = int(row.get("correctIndex", row.get("correct_index", 0)))
        except (TypeError, ValueError):
            correct_index = 0
        correct_index = max(0, min(correct_index, len(options) - 1))
        qid = str(row.get("id") or f"{prefix}{i + 1}").strip() or f"{prefix}{i + 1}"
        prompt = str(row.get("prompt") or row.get("question") or "").strip()
        if not prompt:
            continue
        explanation = str(row.get("explanation") or row.get("rationale") or "").strip()
        out.append(
            {
                "id": qid,
                "prompt": prompt,
                "options": options,
                "correctIndex": correct_index,
                "explanation": explanation,
            }
        )
        if len(out) >= max_count:
            break
    if len(out) < min_count:
        raise RuntimeError(f"AI returned too few {prefix} questions ({len(out)})")
    return out


def _generate_exam_content() -> dict[str, Any]:
    topic_seed = random.choice(
        [
            "university research ethics",
            "urban biodiversity",
            "renewable energy policy",
            "digital learning in higher education",
            "public health and vaccination",
            "museum curation and cultural heritage",
        ]
    )
    system = (
        "You are an expert IELTS item writer for an EAP placement diagnostic. "
        "Return ONLY valid JSON with keys: vocabulary, listening, reading, speaking, writing. "
        "All student-facing text must be in English. "
        "Vocabulary: exactly 10 four-option MCQ items testing academic collocation/meaning. "
        "Listening: script_en (~280-340 words, academic conversation between two speakers like IELTS Section 3), "
        "segments array [{speaker,gender,text}] with gender male|female, and 8 MCQ questions referencing the script. "
        "Reading: title, passage (~550-700 words, academic), 10 MCQ questions (IELTS reading style). "
        "Speaking: exactly 3 IELTS Part 1 personal questions (short answers expected). "
        "Writing: task2_prompt (IELTS Writing Task 2 essay question). "
        "Every question needs correctIndex (0-based) and a concise explanation."
    )
    user = (
        f"Create a fresh placement exam themed around: {topic_seed}. "
        "Listening script must be long enough for ~2 minutes of audio when read aloud. "
        "Do not repeat questions from common textbooks."
    )
    data = _ai_json(system, user, max_tokens=8000)

    vocab = _normalize_mcq_questions(data.get("vocabulary"), "v", min_count=10, max_count=10)
    listening_raw = data.get("listening") if isinstance(data.get("listening"), dict) else {}
    script_en = str(listening_raw.get("script_en") or listening_raw.get("script") or "").strip()
    segments = listening_raw.get("segments") if isinstance(listening_raw.get("segments"), list) else []
    listen_qs = _normalize_mcq_questions(
        listening_raw.get("questions"),
        "l",
        min_count=7,
        max_count=10,
    )
    if not script_en:
        raise RuntimeError("AI listening script missing")

    reading_raw = data.get("reading") if isinstance(data.get("reading"), dict) else {}
    passage = str(reading_raw.get("passage") or "").strip()
    passage_title = str(reading_raw.get("title") or "Reading passage").strip()
    read_qs = _normalize_mcq_questions(
        reading_raw.get("questions"),
        "r",
        min_count=8,
        max_count=12,
    )
    if not passage:
        raise RuntimeError("AI reading passage missing")

    speaking_raw = data.get("speaking") if isinstance(data.get("speaking"), dict) else {}
    speak_list = speaking_raw.get("questions") if isinstance(speaking_raw.get("questions"), list) else []
    speaking_qs: list[dict] = []
    for i, row in enumerate(speak_list):
        if not isinstance(row, dict):
            continue
        prompt = str(row.get("prompt") or row.get("question") or "").strip()
        if not prompt:
            continue
        speaking_qs.append(
            {
                "id": str(row.get("id") or f"s{i + 1}"),
                "prompt": prompt,
                "rubric": str(row.get("rubric") or "Answer naturally in 2-4 sentences.").strip(),
            }
        )
        if len(speaking_qs) >= 3:
            break
    if len(speaking_qs) < 3:
        raise RuntimeError("AI returned too few speaking questions")

    writing_raw = data.get("writing") if isinstance(data.get("writing"), dict) else {}
    writing_prompt = str(writing_raw.get("task2_prompt") or writing_raw.get("prompt") or "").strip()
    if not writing_prompt:
        raise RuntimeError("AI writing prompt missing")

    return {
        "version": _PLACEMENT_VERSION,
        "vocabulary": {"questions": vocab},
        "listening": {
            "script_en": script_en,
            "segments": segments,
            "questions": listen_qs,
        },
        "reading": {
            "title": passage_title,
            "passage": passage,
            "questions": read_qs,
        },
        "speaking": {"questions": speaking_qs},
        "writing": {
            "prompt": writing_prompt,
            "minWords": 150,
            "maxWords": 180,
            "timeLimitSec": 20 * 60,
        },
    }


def _attach_listening_audio(exam: dict[str, Any], exam_id: str) -> None:
    listening = exam.get("listening") or {}
    script = str(listening.get("script_en") or "")
    segments = listening.get("segments") if isinstance(listening.get("segments"), list) else None
    slot = abs(hash(exam_id)) % 10_000_000
    audio = ensure_listening_audio(slot, script, segments=segments)
    listening["audio"] = audio
    listening["audioPlayLimit"] = 1
    exam["listening"] = listening


def _attach_speaking_audio(exam: dict[str, Any], exam_id: str) -> None:
    speaking = exam.get("speaking") or {}
    questions = speaking.get("questions") if isinstance(speaking.get("questions"), list) else []
    slot = abs(hash(exam_id + "-sp")) % 10_000_000
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("prompt") or "")
        meta = ensure_speaking_prompt_audio(slot, str(q.get("id") or f"s{i + 1}"), prompt)
        q["promptAudio"] = meta
    speaking["questions"] = questions
    speaking["answerSec"] = 50
    exam["speaking"] = speaking


def _strip_answers(exam: dict[str, Any]) -> dict[str, Any]:
    def strip_qs(rows: list[dict]) -> list[dict]:
        out = []
        for q in rows:
            out.append(
                {
                    "id": q.get("id"),
                    "prompt": q.get("prompt"),
                    "options": q.get("options"),
                }
            )
        return out

    listening = dict(exam.get("listening") or {})
    reading = dict(exam.get("reading") or {})
    speaking = dict(exam.get("speaking") or {})
    speak_qs = []
    for q in speaking.get("questions") or []:
        speak_qs.append(
            {
                "id": q.get("id"),
                "prompt": q.get("prompt"),
                "promptAudio": q.get("promptAudio"),
            }
        )
    return {
        "version": exam.get("version"),
        "examId": exam.get("examId"),
        "vocabulary": {"questions": strip_qs((exam.get("vocabulary") or {}).get("questions") or [])},
        "listening": {
            "scriptHint": "Listen once and take notes before answering.",
            "audio": listening.get("audio"),
            "audioPlayLimit": listening.get("audioPlayLimit", 1),
            "questions": strip_qs(listening.get("questions") or []),
        },
        "reading": {
            "title": reading.get("title"),
            "passage": reading.get("passage"),
            "questions": strip_qs(reading.get("questions") or []),
        },
        "speaking": {
            "questions": speak_qs,
            "answerSec": speaking.get("answerSec", 50),
        },
        "writing": {
            "prompt": (exam.get("writing") or {}).get("prompt"),
            "minWords": (exam.get("writing") or {}).get("minWords", 150),
            "maxWords": (exam.get("writing") or {}).get("maxWords", 180),
            "timeLimitSec": (exam.get("writing") or {}).get("timeLimitSec", 1200),
        },
        "audioStatus": {
            "tts": tts_ready(),
            "asr": asr_ready(),
        },
    }


def _score_mcq(questions: list[dict], answers: dict[str, Any]) -> tuple[int, int, list[dict]]:
    correct = 0
    review: list[dict] = []
    for q in questions:
        qid = str(q.get("id") or "")
        try:
            chosen = int(answers.get(qid))
        except (TypeError, ValueError):
            chosen = -1
        ok = chosen == int(q.get("correctIndex", -1))
        if ok:
            correct += 1
        review.append(
            {
                "id": qid,
                "section": "mcq",
                "prompt": q.get("prompt"),
                "options": q.get("options"),
                "yourIndex": chosen if chosen >= 0 else None,
                "correctIndex": q.get("correctIndex"),
                "explanation": q.get("explanation"),
                "correct": ok,
            }
        )
    return correct, len(questions), review


def _grade_writing(prompt: str, essay: str) -> dict[str, Any]:
    system = (
        "You are an IELTS Writing Task 2 examiner. Return ONLY JSON with keys: "
        "band (number 4.0-9.0 in 0.5 steps), feedback (short paragraph), "
        "strengths (array of 2 strings), improvements (array of 2 strings)."
    )
    user = f"Task prompt:\n{prompt}\n\nStudent essay ({len(essay.split())} words):\n{essay}"
    data = _ai_json(system, user, max_tokens=1200)
    try:
        band = float(data.get("band", 5.0))
    except (TypeError, ValueError):
        band = 5.0
    band = max(4.0, min(9.0, round(band * 2) / 2))
    return {
        "band": band,
        "feedback": str(data.get("feedback") or "").strip(),
        "strengths": data.get("strengths") if isinstance(data.get("strengths"), list) else [],
        "improvements": data.get("improvements") if isinstance(data.get("improvements"), list) else [],
    }


def _grade_speaking_question(prompt: str, transcript: str) -> dict[str, Any]:
    system = (
        "You are an IELTS Speaking Part 1 examiner. Return ONLY JSON with keys: "
        "band (4.0-9.0 in 0.5 steps), feedback (2-3 sentences), "
        "sampleAnswer (one model short answer)."
    )
    user = f"Question: {prompt}\nStudent transcript: {transcript or '(no speech detected)'}"
    data = _ai_json(system, user, max_tokens=700)
    try:
        band = float(data.get("band", 5.0))
    except (TypeError, ValueError):
        band = 5.0
    band = max(4.0, min(9.0, round(band * 2) / 2))
    return {
        "band": band,
        "feedback": str(data.get("feedback") or "").strip(),
        "sampleAnswer": str(data.get("sampleAnswer") or "").strip(),
        "transcript": transcript,
    }


def _build_report(band: float, level_id: str, review_sections: list[dict]) -> dict[str, Any]:
    level_labels = {
        "beginner": ("Beginner", "初级", "IELTS-aligned 5.0–6.0", "对标雅思 5.0–6.0"),
        "intermediate": ("Intermediate", "中级", "IELTS-aligned 6.0–7.0", "对标雅思 6.0–7.0"),
        "advanced": ("Advanced", "高级", "IELTS-aligned 7.0+", "对标雅思 7.0+"),
    }
    en, zh, range_en, range_zh = level_labels.get(level_id, level_labels["beginner"])
    return {
        "band": band,
        "levelId": level_id,
        "levelLabelEn": en,
        "levelLabelZh": zh,
        "rangeEn": range_en,
        "rangeZh": range_zh,
        "reviewSections": review_sections,
        "disclaimerEn": "Practice placement only — not an official IELTS score.",
        "disclaimerZh": "仅为练习分级测试，非官方雅思成绩。",
    }


def register_placement_routes(
    app,
    *,
    get_db_connection: Callable,
    require_session_role_if_enabled: Callable,
    get_effective_student_username: Callable,
    placement_row_to_dict: Callable,
) -> None:
    @app.route("/api/student/self-study/placement/generate", methods=["POST"])
    def placement_generate():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401
        if not ai_is_configured():
            conn.close()
            return jsonify({"error": "AI is not configured for placement generation"}), 503
        try:
            exam_body = _generate_exam_content()
            exam_id = str(uuid.uuid4())
            exam_body["examId"] = exam_id
            if tts_ready():
                try:
                    _attach_listening_audio(exam_body, exam_id)
                    _attach_speaking_audio(exam_body, exam_id)
                except Exception as exc:
                    log.warning("Placement TTS attach failed: %s", exc)
            now = _now_iso()
            conn.execute(
                """
                INSERT INTO placement_exam_sessions (id, student_username, exam_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (exam_id, username, json.dumps(exam_body, ensure_ascii=False), now),
            )
            conn.commit()
            client_exam = _strip_answers(exam_body)
            conn.close()
            return jsonify({"exam": client_exam})
        except Exception as exc:
            conn.close()
            log.exception("placement generate failed")
            return jsonify({"error": format_ai_error(exc)}), 502

    @app.route("/api/student/self-study/placement/submit", methods=["POST"])
    def placement_submit():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err is not None:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        data = request.get_json(silent=True) or {}
        exam_id = str(data.get("examId") or data.get("exam_id") or "").strip()
        if not exam_id:
            conn.close()
            return jsonify({"error": "examId is required"}), 400

        row = conn.execute(
            """
            SELECT * FROM placement_exam_sessions
            WHERE id = ? AND student_username = ?
            """,
            (exam_id, username),
        ).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Placement session not found or expired"}), 404
        if row["submitted_at"]:
            conn.close()
            return jsonify({"error": "This placement attempt was already submitted"}), 409

        try:
            exam = json.loads(row["exam_json"])
        except json.JSONDecodeError:
            conn.close()
            return jsonify({"error": "Corrupt placement session"}), 500

        answers = data.get("answers") if isinstance(data.get("answers"), dict) else {}
        writing_text = str(data.get("writingText") or data.get("writing_text") or "").strip()
        speaking_payload = data.get("speaking") if isinstance(data.get("speaking"), dict) else {}

        review_sections: list[dict] = []
        section_bands: list[float] = []

        v_questions = (exam.get("vocabulary") or {}).get("questions") or []
        v_correct, v_total, v_review = _score_mcq(v_questions, answers)
        if v_total:
            section_bands.append(ratio_to_band(v_correct / v_total))
        review_sections.append({"id": "vocabulary", "title": "Vocabulary", "items": v_review})

        l_questions = (exam.get("listening") or {}).get("questions") or []
        l_correct, l_total, l_review = _score_mcq(l_questions, answers)
        if l_total:
            section_bands.append(ratio_to_band(l_correct / l_total))
        review_sections.append({"id": "listening", "title": "Listening", "items": l_review})

        r_questions = (exam.get("reading") or {}).get("questions") or []
        r_correct, r_total, r_review = _score_mcq(r_questions, answers)
        if r_total:
            section_bands.append(ratio_to_band(r_correct / r_total))
        review_sections.append({"id": "reading", "title": "Reading", "items": r_review})

        speak_questions = (exam.get("speaking") or {}).get("questions") or []
        speak_review: list[dict] = []
        speak_bands: list[float] = []
        for q in speak_questions:
            qid = str(q.get("id") or "")
            payload = speaking_payload.get(qid) if isinstance(speaking_payload.get(qid), dict) else {}
            transcript = str(payload.get("transcript") or "").strip()
            audio_b64 = str(payload.get("audioBase64") or payload.get("audio_base64") or "")
            voice_fmt = str(payload.get("format") or "webm")
            if not transcript and audio_b64 and asr_ready():
                try:
                    audio_bytes = base64.b64decode(audio_b64)
                    tencent_audio, fmt = prepare_audio_for_tencent(audio_bytes, voice_fmt)
                    transcript = recognize_speech(tencent_audio, fmt)
                except Exception as exc:
                    log.warning("Placement ASR failed %s: %s", qid, exc)
            graded = _grade_speaking_question(str(q.get("prompt") or ""), transcript)
            speak_bands.append(float(graded["band"]))
            speak_review.append(
                {
                    "id": qid,
                    "section": "speaking",
                    "prompt": q.get("prompt"),
                    "yourAnswer": transcript,
                    "band": graded["band"],
                    "feedback": graded["feedback"],
                    "sampleAnswer": graded["sampleAnswer"],
                    "correct": graded["band"] >= 6.0,
                }
            )
        if speak_bands:
            section_bands.append(sum(speak_bands) / len(speak_bands))
        review_sections.append({"id": "speaking", "title": "Speaking", "items": speak_review})

        writing_prompt = str((exam.get("writing") or {}).get("prompt") or "")
        writing_graded = _grade_writing(writing_prompt, writing_text) if writing_text else {
            "band": 4.0,
            "feedback": "No essay submitted.",
            "strengths": [],
            "improvements": ["Write a full 150–180 word response."],
        }
        section_bands.append(float(writing_graded["band"]))
        review_sections.append(
            {
                "id": "writing",
                "title": "Writing",
                "items": [
                    {
                        "id": "writing1",
                        "section": "writing",
                        "prompt": writing_prompt,
                        "yourAnswer": writing_text,
                        "band": writing_graded["band"],
                        "feedback": writing_graded["feedback"],
                        "strengths": writing_graded.get("strengths") or [],
                        "improvements": writing_graded.get("improvements") or [],
                        "correct": writing_graded["band"] >= 6.0,
                    }
                ],
            }
        )

        overall_band = round((sum(section_bands) / len(section_bands)) * 2) / 2 if section_bands else 4.0
        level_id = band_to_level(overall_band)
        total_objective = v_total + l_total + r_total
        total_correct = v_correct + l_correct + r_correct
        total_percent = int(round((total_correct / total_objective) * 100)) if total_objective else 0
        vocab_entry = 1 if overall_band < 6.0 else 0

        report = _build_report(overall_band, level_id, review_sections)
        result_payload = {
            "levelId": level_id,
            "totalPercent": total_percent,
            "totalCorrect": total_correct,
            "totalQuestions": total_objective,
            "skillScores": {},
            "answers": answers,
            "report": report,
            "vocabEntryLevel": bool(vocab_entry),
            "completedAt": _now_iso(),
        }

        now = _now_iso()
        conn.execute(
            """
            UPDATE placement_exam_sessions
            SET submitted_at = ?, result_json = ?
            WHERE id = ? AND student_username = ?
            """,
            (now, json.dumps(result_payload, ensure_ascii=False), exam_id, username),
        )
        conn.execute(
            """
            INSERT INTO student_placement_results (
                student_username, level_id, total_percent, total_correct, total_questions,
                skill_scores_json, answers_json, report_json, vocab_entry_level,
                completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username) DO UPDATE SET
                level_id = excluded.level_id,
                total_percent = excluded.total_percent,
                total_correct = excluded.total_correct,
                total_questions = excluded.total_questions,
                skill_scores_json = excluded.skill_scores_json,
                answers_json = excluded.answers_json,
                report_json = excluded.report_json,
                vocab_entry_level = excluded.vocab_entry_level,
                completed_at = excluded.completed_at,
                updated_at = excluded.updated_at
            """,
            (
                username,
                level_id,
                total_percent,
                total_correct,
                total_objective,
                json.dumps({}, ensure_ascii=False),
                json.dumps({**answers, "writingText": writing_text, "speaking": speaking_payload}, ensure_ascii=False),
                json.dumps(report, ensure_ascii=False),
                vocab_entry,
                now,
                now,
            ),
        )
        if not conn.execute(
            "SELECT 1 FROM student_self_study_settings WHERE student_username = ?",
            (username,),
        ).fetchone():
            conn.execute(
                """
                INSERT INTO student_self_study_settings
                    (student_username, subscribed, timezone, holiday_review_mode, updated_at)
                VALUES (?, 1, 'Asia/Shanghai', 0, ?)
                """,
                (username, now),
            )
        conn.commit()
        placement_row = conn.execute(
            "SELECT * FROM student_placement_results WHERE student_username = ?",
            (username,),
        ).fetchone()
        conn.close()
        return jsonify(
            {
                "result": result_payload,
                "placement": placement_row_to_dict(placement_row) if placement_row else result_payload,
                "selfStudyUnlocked": True,
            }
        )
