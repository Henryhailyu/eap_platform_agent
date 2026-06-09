"""
SS-W1 — Self-study writing (Channel B; genre rotation Mon/Wed/Fri; IELTS rubric feedback).
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

WRITING_SKILL = "writing"
MAX_REVISIONS = 3

GENRE_LABELS = {
    "IELTS_T2_ESSAY": {"en": "IELTS Task 2 — Opinion essay", "zh": "雅思 Task 2 — 观点议论文"},
    "ESSAY_ARGUMENT": {"en": "Academic argument essay", "zh": "学术论证短文"},
    "SUMMARY": {"en": "Academic summary", "zh": "学术摘要"},
    "PROPOSAL": {"en": "Research proposal", "zh": "研究计划书"},
}

WEEKDAY_GENRES = {
    0: "IELTS_T2_ESSAY",
    2: "SUMMARY",
    4: "PROPOSAL",
}

SEED_TASKS: list[dict[str, Any]] = [
    {
        "genreId": "IELTS_T2_ESSAY",
        "title": "University funding and access",
        "promptEn": (
            "Some people believe that university education should be fully funded by governments so that everyone can attend. "
            "Others think students should pay at least part of the cost.\n\n"
            "Discuss both views and give your own opinion. Write at least 250 words."
        ),
        "promptZh": (
            "有人认为政府应全额资助高等教育以使人人可入学；"
            "也有人认为学生应至少承担部分费用。\n\n"
            "讨论双方观点并给出你的看法。至少 250 词。"
        ),
        "wordLimitMin": 250,
        "preCoach": {
            "taskDecodeEn": "Keywords: government funding, access, who pays. You need both views + your position.",
            "taskDecodeZh": "关键词：政府资助、入学机会、谁付费。需呈现双方观点并表明立场。",
            "outline": [
                {
                    "role": "introduction",
                    "guideEn": "Paraphrase the question; state that both views exist; preview your stance.",
                    "guideZh": "改写题目；指出存在两种观点；预告你的立场。",
                },
                {
                    "role": "body1",
                    "guideEn": "View A — free tuition improves access; give one concrete reason/example.",
                    "guideZh": "观点 A — 免费学费促进入学；给出理由或例子。",
                },
                {
                    "role": "body2",
                    "guideEn": "View B — student contribution / quality; avoid repeating body1 ideas.",
                    "guideZh": "观点 B — 学生分担/质量；避免重复 body1。",
                },
                {
                    "role": "conclusion",
                    "guideEn": "Clear opinion + brief justification; no new arguments.",
                    "guideZh": "明确立场 + 简要理由；不引入新论点。",
                },
            ],
            "checklistEn": [
                "At least 250 words",
                "Both views covered",
                "Clear thesis in introduction",
                "Paragraphs with topic sentences",
            ],
            "checklistZh": [
                "至少 250 词",
                "涵盖双方观点",
                "引言有清晰论点",
                "段落有主题句",
            ],
        },
    },
    {
        "genreId": "SUMMARY",
        "title": "Summarise library study-hall report",
        "promptEn": (
            "Read the context below and write a one-paragraph academic summary (120–180 words).\n\n"
            "City libraries now run evening study halls for commuters. Attendance rose 18% last term. "
            "Councils may expand the programme if funding continues."
        ),
        "promptZh": (
            "阅读以下材料，写一段学术摘要（120–180 词）。\n\n"
            "城市图书馆为通勤者开设晚间自习室。上学期出席率上升 18%。若资金持续，委员会可能扩大该项目。"
        ),
        "wordLimitMin": 120,
        "preCoach": {
            "taskDecodeEn": "One paragraph; main trend + key figure + possible future action.",
            "taskDecodeZh": "一段式；主要趋势 + 关键数据 + 可能后续措施。",
            "outline": [
                {
                    "role": "gist",
                    "guideEn": "Open with the main point in one sentence.",
                    "guideZh": "首句点明主旨。",
                },
                {
                    "role": "detail",
                    "guideEn": "Include the 18% figure accurately; hedge if needed.",
                    "guideZh": "准确写入 18% 数据；必要时使用模糊限制语。",
                },
                {
                    "role": "implication",
                    "guideEn": "Close with conditional expansion (funding).",
                    "guideZh": "以有条件的扩建计划收尾。",
                },
            ],
            "checklistEn": [
                "120–180 words",
                "No personal opinion",
                "Accurate figures",
                "Formal register",
            ],
            "checklistZh": [
                "120–180 词",
                "不含个人意见",
                "数据准确",
                "正式语域",
            ],
        },
    },
    {
        "genreId": "PROPOSAL",
        "title": "Pilot writing-feedback tool — proposal excerpt",
        "promptEn": (
            "Write the **Background** and **Aims** sections of a short research proposal (200–280 words) "
            "for a pilot that tests blended writing feedback in first-year EAP classes."
        ),
        "promptZh": (
            "为「混合写作反馈」试点撰写研究计划书的 **背景** 与 **目标** 两节（200–280 词）。"
        ),
        "wordLimitMin": 200,
        "preCoach": {
            "taskDecodeEn": "Genre = proposal; sections = Background + Aims only; audience = programme lead.",
            "taskDecodeZh": "体裁 = 计划书；仅写背景与目标；读者 = 课程负责人。",
            "outline": [
                {
                    "role": "background",
                    "guideEn": "Problem context + why now; cite gap in current feedback practice.",
                    "guideZh": "问题背景 + 时机；指出当前反馈实践的不足。",
                },
                {
                    "role": "aims",
                    "guideEn": "2–3 measurable aims; use infinitive verbs (to evaluate, to compare).",
                    "guideZh": "2–3 条可衡量目标；用不定式（to evaluate, to compare）。",
                },
            ],
            "checklistEn": [
                "200–280 words",
                "Background before aims",
                "Formal nouns (uptake, feasibility)",
                "No full methodology section",
            ],
            "checklistZh": [
                "200–280 词",
                "先背景后目标",
                "正式名词（uptake、feasibility）",
                "不写完整方法论",
            ],
        },
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _today_weekday() -> int:
    return datetime.now(timezone.utc).weekday()


def migrate_self_study_writing_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS writing_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT,
            genre_id TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS student_writing_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            task_id INTEGER NOT NULL,
            revision_number INTEGER NOT NULL DEFAULT 1,
            draft_text TEXT NOT NULL,
            word_count INTEGER NOT NULL DEFAULT 0,
            feedback_json TEXT,
            submitted_at TEXT NOT NULL,
            UNIQUE(student_username, task_id, revision_number),
            FOREIGN KEY (task_id) REFERENCES writing_tasks(id) ON DELETE CASCADE
        )
        """
    )
    seed_default_writing_tasks(conn)


def _task_payload(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "genreId": raw["genreId"],
        "title": raw["title"],
        "promptEn": raw.get("promptEn") or "",
        "promptZh": raw.get("promptZh") or "",
        "wordLimitMin": int(raw.get("wordLimitMin") or 250),
        "preCoach": raw.get("preCoach") or {},
    }


def seed_default_writing_tasks(conn) -> None:
    existing = conn.execute(
        "SELECT id FROM writing_tasks WHERE class_name = ? LIMIT 1",
        ("EAP047",),
    ).fetchone()
    if existing:
        return
    now = _now_iso()
    for i, task in enumerate(SEED_TASKS, start=1):
        conn.execute(
            """
            INSERT INTO writing_tasks (class_name, genre_id, title, sort_order, content_json, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                "EAP047",
                task["genreId"],
                task["title"],
                i,
                json.dumps(_task_payload(task), ensure_ascii=False),
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


def _count_paragraphs(text: str) -> int:
    parts = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    return max(1, len(parts))


def _has_connectors(text: str) -> bool:
    low = (text or "").lower()
    markers = ("however", "therefore", "for example", "in addition", "furthermore", "although", "whereas")
    return any(m in low for m in markers)


def _has_academic_lexis(text: str) -> int:
    low = (text or "").lower()
    terms = (
        "research",
        "evidence",
        "significant",
        "analysis",
        "policy",
        "university",
        "students",
        "education",
        "study",
        "however",
        "therefore",
    )
    return sum(1 for t in terms if t in low)


def _estimate_band(base: float, delta: float) -> float:
    return round(max(4.0, min(8.5, base + delta)), 1)


def _build_feedback(draft: str, task_content: dict, revision: int) -> dict[str, Any]:
    wc = _word_count(draft)
    min_w = int(task_content.get("wordLimitMin") or 250)
    paras = _count_paragraphs(draft)
    connectors = _has_connectors(draft)
    lexis = _has_academic_lexis(draft)
    genre = task_content.get("genreId") or ""

    tr_delta = 0.0
    cc_delta = 0.0
    lr_delta = 0.0
    gra_delta = 0.0
    comments_tr: list[str] = []
    comments_cc: list[str] = []
    comments_lr: list[str] = []
    comments_gra: list[str] = []

    if wc < min_w:
        tr_delta -= 1.0
        comments_tr.append(f"Under word minimum ({wc}/{min_w}). Address all parts after expanding.")
    elif wc >= min_w:
        tr_delta += 0.5
        comments_tr.append("Word count meets the minimum — task parts can be developed further.")

    if genre in ("IELTS_T2_ESSAY", "ESSAY_ARGUMENT"):
        if paras < 4:
            cc_delta -= 0.5
            comments_cc.append("Aim for intro + two body paragraphs + conclusion (clear paragraph blocks).")
        else:
            cc_delta += 0.5
            comments_cc.append("Paragraph structure is developing well.")
    elif paras < 2:
        cc_delta -= 0.5
        comments_cc.append("Use clear paragraph breaks for each section.")

    if connectors:
        cc_delta += 0.5
        comments_cc.append("Good use of cohesive connectors.")
    else:
        comments_cc.append("Add linking words (however, therefore, for example) between ideas.")

    if lexis >= 4:
        lr_delta += 0.5
        comments_lr.append("Academic vocabulary present — keep collocations precise.")
    else:
        lr_delta -= 0.3
        comments_lr.append("Widen academic lexis (evidence, significant, policy, analysis).")

    sentences = [s.strip() for s in re.split(r"[.!?]+", draft) if s.strip()]
    if len(sentences) >= 6:
        gra_delta += 0.4
        comments_gra.append("Range of sentence lengths — check complex clauses for accuracy.")
    else:
        comments_gra.append("Develop fuller sentences; review subject–verb agreement.")

    if revision > 1:
        comments_tr.insert(0, f"Revision {revision} — compare changes against prior feedback priorities.")

    criteria = [
        {
            "id": "TR",
            "labelEn": "Task Response",
            "labelZh": "任务回应",
            "estimatedBand": _estimate_band(5.5, tr_delta),
            "comments": comments_tr,
        },
        {
            "id": "CC",
            "labelEn": "Coherence & Cohesion",
            "labelZh": "连贯与衔接",
            "estimatedBand": _estimate_band(5.5, cc_delta),
            "comments": comments_cc,
        },
        {
            "id": "LR",
            "labelEn": "Lexical Resource",
            "labelZh": "词汇资源",
            "estimatedBand": _estimate_band(5.5, lr_delta),
            "comments": comments_lr,
        },
        {
            "id": "GRA",
            "labelEn": "Grammatical Range & Accuracy",
            "labelZh": "语法多样性与准确性",
            "estimatedBand": _estimate_band(5.5, gra_delta),
            "comments": comments_gra,
        },
    ]
    bands = [c["estimatedBand"] for c in criteria]
    overall = round(sum(bands) / len(bands), 1)

    strengths = []
    priorities = []
    if wc >= min_w:
        strengths.append("Met minimum word count.")
    if connectors:
        strengths.append("Uses cohesive devices.")
    if wc < min_w:
        priorities.append(f"Expand to at least {min_w} words with developed examples.")
    if paras < 4 and genre in ("IELTS_T2_ESSAY", "ESSAY_ARGUMENT"):
        priorities.append("Add clear body paragraphs with topic sentences.")
    if not priorities:
        priorities.append("Refine thesis clarity and tighten conclusion.")

    revisions = []
    if wc < min_w:
        revisions.append("Add one supporting example in each body paragraph.")
    if not connectors:
        revisions.append("Link paragraph 2 to paragraph 3 with however or in contrast.")

    return {
        "wordCount": wc,
        "wordLimitMin": min_w,
        "overallBandEstimate": overall,
        "disclaimerEn": "Practice estimate only — not an official IELTS score.",
        "disclaimerZh": "仅为练习估分 — 非官方雅思成绩。",
        "criteria": criteria,
        "strengths": strengths,
        "priorities": priorities,
        "actionableRevisions": revisions,
        "revisionNumber": revision,
        "source": "rules",
    }


def _build_feedback_ai(draft: str, task_content: dict, revision: int) -> dict[str, Any]:
    """IELTS rubric via configured OpenAI/Hunyuan client (same stack as homework AI)."""
    from eap_ai import ai_is_configured, create_chat_completion, format_ai_error, get_openai_client, parse_ai_json_object

    if not ai_is_configured():
        fb = _build_feedback(draft, task_content, revision)
        fb["aiUnavailable"] = True
        return fb

    wc = _word_count(draft)
    min_w = int(task_content.get("wordLimitMin") or 250)
    title = task_content.get("titleEn") or task_content.get("title") or "Writing task"
    prompt_body = task_content.get("promptEn") or task_content.get("prompt") or ""
    genre = task_content.get("genreId") or ""

    system = (
        "You are an IELTS Academic writing examiner. Score practice drafts using public band descriptors. "
        "Return ONLY valid JSON with keys: overallBandEstimate (number), criteria (array of "
        "{id: TR|CC|LR|GRA, labelEn, labelZh, estimatedBand, comments[]}), strengths[], priorities[], "
        "actionableRevisions[]. Be constructive; cite specific issues from the draft."
    )
    user = (
        f"Genre: {genre}\nTitle: {title}\nPrompt: {prompt_body}\n"
        f"Word minimum: {min_w}\nWord count: {wc}\nRevision: {revision}\n\nDraft:\n{draft[:12000]}"
    )

    client, profile = get_openai_client(None)
    resp = create_chat_completion(
        client,
        profile,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
        max_tokens=2000,
    )
    raw = (resp.choices[0].message.content or "").strip()
    data = parse_ai_json_object(raw)
    criteria = data.get("criteria") or []
    bands = [float(c.get("estimatedBand") or 5.5) for c in criteria if c.get("estimatedBand") is not None]
    overall = float(data.get("overallBandEstimate") or (sum(bands) / len(bands) if bands else 5.5))

    return {
        "wordCount": wc,
        "wordLimitMin": min_w,
        "overallBandEstimate": round(overall, 1),
        "disclaimerEn": "AI practice estimate — not an official IELTS score.",
        "disclaimerZh": "AI 练习估分 — 非官方雅思成绩。",
        "criteria": criteria,
        "strengths": data.get("strengths") or [],
        "priorities": data.get("priorities") or [],
        "actionableRevisions": data.get("actionableRevisions") or [],
        "revisionNumber": revision,
        "source": "ai",
    }


def _extract_upload_draft() -> tuple[str, str | None]:
    """Return (draft text, optional filename) from JSON or multipart upload."""
    if request.content_type and "multipart/form-data" in request.content_type:
        draft = (request.form.get("draftText") or request.form.get("draft") or "").strip()
        f = request.files.get("file")
        if f and f.filename:
            from teaching_page_source_files import allowed_source_extension, extract_text_from_bytes

            ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
            if ext in {"doc", "docx", "pdf", "txt"}:
                data = f.read()
                if ext == "txt":
                    text = data.decode("utf-8", errors="replace")
                else:
                    text = extract_text_from_bytes(data, ext if ext != "doc" else "docx")
                if text.strip():
                    return text.strip(), f.filename
        return draft, f.filename if f else None
    data = request.get_json(silent=True) or {}
    return str(data.get("draftText") or data.get("draft") or "").strip(), None


def _task_row_to_public(row: Any, include_content: bool = False) -> dict[str, Any]:
    content = json.loads(row["content_json"])
    out: dict[str, Any] = {
        "id": row["id"],
        "genreId": row["genre_id"],
        "title": row["title"],
        "wordLimitMin": content.get("wordLimitMin", 250),
    }
    if include_content:
        out["content"] = content
    return out


def _suggested_genre_today() -> str | None:
    return WEEKDAY_GENRES.get(_today_weekday())


def register_self_study_writing_routes(
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

    @app.route("/api/student/self-study/writing/overview", methods=["GET"])
    def student_writing_overview():
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
        genre_today = _suggested_genre_today()
        tasks = conn.execute(
            """
            SELECT * FROM writing_tasks
            WHERE is_active = 1 AND (class_name IS NULL OR class_name = ?)
            ORDER BY sort_order ASC, id ASC
            """,
            (class_name,),
        ).fetchall()

        suggested = None
        if genre_today:
            for t in tasks:
                if t["genre_id"] == genre_today:
                    suggested = _task_row_to_public(t)
                    break

        completed = conn.execute(
            """
            SELECT COUNT(DISTINCT task_id) AS n FROM student_writing_submissions
            WHERE student_username = ?
            """,
            (username,),
        ).fetchone()
        conn.close()

        return jsonify(
            {
                "className": class_name,
                "channel": "B",
                "weekdayGenre": genre_today,
                "suggestedTask": suggested,
                "library": [_task_row_to_public(t) for t in tasks],
                "tasksCompleted": int(completed["n"] if completed else 0),
                "noDailyPush": True,
            }
        )

    @app.route("/api/student/self-study/writing/tasks/<int:task_id>", methods=["GET"])
    def student_writing_task(task_id: int):
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        row = conn.execute("SELECT * FROM writing_tasks WHERE id = ? AND is_active = 1", (task_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Task not found"}), 404

        subs = conn.execute(
            """
            SELECT revision_number, word_count, submitted_at, feedback_json
            FROM student_writing_submissions
            WHERE student_username = ? AND task_id = ?
            ORDER BY revision_number ASC
            """,
            (username, task_id),
        ).fetchall()
        conn.close()

        submissions = []
        for s in subs:
            fb = json.loads(s["feedback_json"]) if s["feedback_json"] else None
            submissions.append(
                {
                    "revisionNumber": s["revision_number"],
                    "wordCount": s["word_count"],
                    "submittedAt": s["submitted_at"],
                    "overallBandEstimate": fb.get("overallBandEstimate") if fb else None,
                }
            )

        return jsonify(
            {
                "task": _task_row_to_public(row, include_content=True),
                "submissions": submissions,
                "revisionsRemaining": max(0, MAX_REVISIONS - len(submissions)),
            }
        )

    @app.route("/api/student/self-study/writing/submit", methods=["POST"])
    def student_writing_submit():
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
        if request.content_type and "multipart/form-data" in request.content_type:
            task_id = int(request.form.get("taskId") or 0)
        else:
            task_id = int(data.get("taskId") or 0)
        draft, upload_name = _extract_upload_draft()
        if not task_id:
            conn.close()
            return jsonify({"error": "taskId required"}), 400
        if len(draft) < 20:
            conn.close()
            return jsonify({"error": "Draft too short"}), 400

        row = conn.execute("SELECT * FROM writing_tasks WHERE id = ? AND is_active = 1", (task_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Task not found"}), 404

        existing = conn.execute(
            "SELECT COUNT(*) AS n FROM student_writing_submissions WHERE student_username = ? AND task_id = ?",
            (username, task_id),
        ).fetchone()
        rev = int(existing["n"] if existing else 0) + 1
        if rev > MAX_REVISIONS:
            conn.close()
            return jsonify({"error": f"Maximum {MAX_REVISIONS} submissions reached"}), 400

        content = json.loads(row["content_json"])
        use_ai = True
        if request.content_type and "multipart/form-data" in request.content_type:
            use_ai = request.form.get("useAi", "1") != "0"
        else:
            use_ai = data.get("useAi", True) is not False
        try:
            feedback = _build_feedback_ai(draft, content, rev) if use_ai else _build_feedback(draft, content, rev)
        except Exception as exc:
            from eap_ai import format_ai_error

            fb = _build_feedback(draft, content, rev)
            fb["aiError"] = format_ai_error(exc)
            feedback = fb
        if upload_name:
            feedback["uploadFileName"] = upload_name
        now = _now_iso()
        wc = _word_count(draft)

        conn.execute(
            """
            INSERT INTO student_writing_submissions
                (student_username, task_id, revision_number, draft_text, word_count, feedback_json, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (username, task_id, rev, draft[:50000], wc, json.dumps(feedback, ensure_ascii=False), now),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "revisionNumber": rev, "feedback": feedback})

    @app.route("/api/admin/self-study/writing/tasks", methods=["GET"])
    def admin_writing_tasks():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, class_name, genre_id, sort_order, is_active FROM writing_tasks ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        return jsonify(
            {
                "tasks": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "className": r["class_name"],
                        "genreId": r["genre_id"],
                        "sortOrder": r["sort_order"],
                        "isActive": bool(r["is_active"]),
                    }
                    for r in rows
                ]
            }
        )

    @app.route("/api/admin/self-study/writing/tasks/export.csv", methods=["GET"])
    def admin_writing_export():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, genre_id, content_json FROM writing_tasks WHERE is_active = 1 ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["task_id", "genre_id", "title", "word_limit_min", "prompt_en"])
        for row in rows:
            content = json.loads(row["content_json"])
            writer.writerow(
                [
                    row["id"],
                    row["genre_id"],
                    row["title"],
                    content.get("wordLimitMin"),
                    (content.get("promptEn") or "")[:500],
                ]
            )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="writing-tasks.csv"'},
        )
