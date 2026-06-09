"""
SS-V1 — Self-study vocabulary (Channel A packs + Channel B AI course).
"""
from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

from self_study import CHANNEL_B_ONLY

VOCAB_SKILL = "vocabulary"

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


def _shuffle_options(correct: str, pool: list[str]) -> tuple[list[str], int]:
    import random

    distractors = [x for x in pool if x != correct]
    random.shuffle(distractors)
    options = [correct] + distractors[:3]
    random.shuffle(options)
    return options, options.index(correct)


def _practice_for_words(words: list[dict]) -> list[dict]:
    """Classic practice — up to 15 items covering the word list (games handle speed rounds)."""
    out: list[dict] = []
    word_list = [wd["word"] for wd in words]
    for i, wd in enumerate(words[:15]):
        w = wd["word"]
        meaning = wd.get("coreMeaning") or ""
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
            out.append(
                {
                    "id": f"vp{i + 1}",
                    "type": "affix_drill",
                    "promptEn": f"Affix pattern «{affix_hint}» → which word?",
                    "promptZh": f"词缀 «{affix_hint}» → 哪个词？",
                    "options": options,
                    "correctIndex": correct_idx,
                }
            )
    return out


def _game_rounds_for_words(words: list[dict]) -> dict[str, Any]:
    """Payload for Star Battle + Speed Race front-end games."""
    import random

    rounds = []
    pool = list(words)
    random.shuffle(pool)
    for i, wd in enumerate(pool[:20]):
        w = wd["word"]
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
        "progress": {
            "learnDone": bool(prog and prog["learn_done"]),
            "practiceDone": bool(prog and prog["practice_done"]),
            "practiceScore": prog["practice_score"] if prog else None,
        },
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
    seed_default_vocab_course(conn)


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
    if VOCAB_SKILL in CHANNEL_B_ONLY:
        return "B"
    return "A" if _has_manager_push(conn, class_name, VOCAB_SKILL) else "B"


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
                "channelBActive": channel == "B",
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
        if _vocab_channel(conn, class_name) == "A" and _has_manager_push(conn, class_name, VOCAB_SKILL):
            conn.close()
            return jsonify({"error": "Today uses Channel A — open a material pack", "channel": "A"}), 400

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
        """Channel B — open a calendar day to view that day's 30 words."""
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
        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"error": "No active vocabulary course"}), 404

        day_num = max(1, int(day_number))
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
            practice = _practice_for_words(words)
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
        course = _active_course(conn, class_name)
        if not course:
            conn.close()
            return jsonify({"error": "No course"}), 404

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
        row = conn.execute(
            "SELECT * FROM vocab_material_units WHERE id = ?",
            (unit_id,),
        ).fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Unit not found"}), 404
        return jsonify(
            {
                "unit": {
                    "id": row["id"],
                    "label": row["unit_label"],
                    "words": json.loads(row["words_json"]),
                }
            }
        )

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

        if kind == "unit":
            unit_id = int(data.get("unitId") or 0)
            if not unit_id:
                conn.close()
                return jsonify({"error": "unitId required"}), 400
            conn.execute(
                """
                INSERT INTO student_vocab_pack_progress (student_username, unit_id, completed_at)
                VALUES (?, ?, ?)
                ON CONFLICT(student_username, unit_id) DO UPDATE SET completed_at = excluded.completed_at
                """,
                (username, unit_id, now),
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True})

        course_id = int(data.get("courseId") or 0)
        day_number = int(data.get("dayNumber") or 0)
        learn_done = 1 if data.get("learnDone", True) else 0
        practice_done = 1 if data.get("practiceDone") else 0
        practice_score = data.get("practiceScore")
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
                (student_username, course_id, day_number, learn_done, practice_done, practice_score, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username, course_id, day_number) DO UPDATE SET
                learn_done = CASE WHEN excluded.learn_done = 1 OR student_vocab_day_progress.learn_done = 1 THEN 1 ELSE 0 END,
                practice_done = CASE WHEN excluded.practice_done = 1 OR student_vocab_day_progress.practice_done = 1 THEN 1 ELSE 0 END,
                practice_score = COALESCE(excluded.practice_score, student_vocab_day_progress.practice_score),
                completed_at = COALESCE(excluded.completed_at, student_vocab_day_progress.completed_at)
            """,
            (
                username,
                course_id,
                day_number,
                learn_done,
                practice_done,
                practice_score,
                completed_at,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/admin/self-study/vocabulary/packs", methods=["GET", "POST"])
    def admin_vocab_packs():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        if request.method == "GET":
            rows = conn.execute(
                "SELECT * FROM vocab_material_packs ORDER BY sort_order ASC, id ASC"
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
                        }
                        for r in rows
                    ]
                }
            )
        data = request.get_json(silent=True) or {}
        name = str(data.get("displayName") or data.get("display_name") or "").strip()[:200]
        if not name:
            conn.close()
            return jsonify({"error": "displayName required"}), 400
        cls = str(data.get("className") or data.get("class_name") or "").strip()
        cls = normalize_class_name(cls) if cls else None
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO vocab_material_packs (display_name, class_name, sort_order, is_active, created_at, updated_at)
            VALUES (?, ?, 0, 1, ?, ?)
            """,
            (name, cls, now, now),
        )
        conn.commit()
        pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()
        return jsonify({"id": pid, "displayName": name}), 201

    @app.route("/api/admin/self-study/vocabulary/push-channel-a", methods=["PUT"])
    def admin_vocab_push_channel_a():
        """Enable Channel A routing for vocabulary (uses self_study_skill_push)."""
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        actor = get_current_authenticated_user(conn) or {}
        manager_name = str(actor.get("username") or "manager").strip()
        data = request.get_json(silent=True) or {}
        class_name = normalize_class_name(str(data.get("className") or data.get("class_name") or ""))
        is_active = 1 if data.get("isActive", data.get("is_active", True)) else 0
        if not class_name:
            conn.close()
            return jsonify({"error": "className required"}), 400
        now = _now_iso()
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
