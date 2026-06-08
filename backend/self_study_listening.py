"""
SS-L1 — Self-study listening (Channel B only; Part 3/4 alternate; Web text scripts first).
"""
from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timezone
from typing import Any, Callable

from flask import Response, jsonify, request

from tencent_audio import audio_status, ensure_listening_audio

LISTENING_SKILL = "listening"

SEED_P3_A: dict[str, Any] = {
    "title": "Part 3 — Urban design assignment discussion",
    "partType": "P3",
    "lessonEn": "Track who says what. Note opinions vs facts. Signposts: agree, disagree, suggest.",
    "lessonZh": "记录谁说了什么。区分观点与事实。留意 agree、disagree、suggest 等路标。",
    "scriptEn": (
        "[Part 3 — Discussion]\n\n"
        "TUTOR: Today we'll compare two approaches for the urban design assignment — transit-oriented development and green belts.\n\n"
        "STUDENT A: I think transit-oriented development fits our case study better because the station area already has mixed-use zoning.\n\n"
        "STUDENT B: I'm not convinced. Green belts could still limit sprawl without relying on expensive rail upgrades.\n\n"
        "TUTOR: Good — note that A is focusing on existing infrastructure while B worries about cost. "
        "For your report, decide which criterion matters more: feasibility or long-term containment."
    ),
    "scriptZh": (
        "[Part 3 — 讨论]\n\n"
        "导师：今天比较城市设计作业的两种思路——公交导向开发与绿带。\n\n"
        "学生 A：我认为公交导向更适合我们的案例，车站片区已是混合用地。\n\n"
        "学生 B：我不确定。绿带仍可在不依赖昂贵铁路改造的情况下限制蔓延。\n\n"
        "导师：注意 A 强调现有基础设施，B 担心成本。报告中需判断更看重可行性还是长期管控。"
    ),
    "questions": [
        {
            "id": "lp3a1",
            "typeId": "LMC",
            "promptEn": "The assignment compares:",
            "promptZh": "作业比较：",
            "optionsEn": [
                "transit-oriented development and green belts",
                "poetry and drama",
                "cafeteria menus",
                "exam dates only",
            ],
            "optionsZh": [
                "公交导向开发与绿带",
                "诗歌与戏剧",
                "食堂菜单",
                "仅考试日期",
            ],
            "correctIndex": 0,
            "evidenceEn": "compare two approaches — transit-oriented development and green belts",
            "evidenceZh": "比较两种思路——公交导向开发与绿带",
        },
        {
            "id": "lp3a2",
            "typeId": "LM",
            "promptEn": "Student A supports transit-oriented development because:",
            "promptZh": "学生 A 支持公交导向是因为：",
            "optionsEn": [
                "the station area has mixed-use zoning",
                "rail upgrades are impossible",
                "green belts are illegal",
                "the tutor disagrees",
            ],
            "optionsZh": [
                "车站片区已是混合用地",
                "铁路改造不可能",
                "绿带非法",
                "导师反对",
            ],
            "correctIndex": 0,
            "evidenceEn": "station area already has mixed-use zoning",
            "evidenceZh": "车站片区已是混合用地",
        },
        {
            "id": "lp3a3",
            "typeId": "LMC",
            "promptEn": "Student B's main concern is:",
            "promptZh": "学生 B 主要担心：",
            "optionsEn": [
                "cost of rail upgrades",
                "lack of assignment criteria",
                "too many speakers",
                "library opening hours",
            ],
            "optionsZh": [
                "铁路改造成本",
                "缺少作业标准",
                "说话人太多",
                "图书馆开放时间",
            ],
            "correctIndex": 0,
            "evidenceEn": "without relying on expensive rail upgrades",
            "evidenceZh": "不依赖昂贵铁路改造",
        },
        {
            "id": "lp3a4",
            "typeId": "LSAQ",
            "promptEn": "The tutor asks students to decide between:",
            "promptZh": "导师要求学生判断：",
            "optionsEn": [
                "feasibility vs long-term containment",
                "sports vs music",
                "breakfast vs lunch",
                "font size vs margins",
            ],
            "optionsZh": [
                "可行性与长期管控",
                "体育与音乐",
                "早餐与午餐",
                "字号与页边距",
            ],
            "correctIndex": 0,
            "evidenceEn": "feasibility or long-term containment",
            "evidenceZh": "可行性还是长期管控",
        },
        {
            "id": "lp3a5",
            "typeId": "LMC",
            "promptEn": "Student A and B mainly:",
            "promptZh": "学生 A 与 B 主要：",
            "optionsEn": [
                "disagree on which approach fits better",
                "agree on every point",
                "refuse to speak",
                "change the assignment topic",
            ],
            "optionsZh": [
                "对哪种方案更合适存在分歧",
                "在所有观点上一致",
                "拒绝发言",
                "更换作业题目",
            ],
            "correctIndex": 0,
            "evidenceEn": "I'm not convinced",
            "evidenceZh": "我不确定",
        },
    ],
    "exemplarNotesEn": (
        "TUTOR: topic = TOD vs green belts (assignment)\n"
        "A → TOD + mixed-use @ station ✓\n"
        "B → green belts; cost of rail ↑ concern\n"
        "TUTOR: report criterion → feasibility OR long-term containment"
    ),
    "exemplarNotesZh": (
        "导师：题目 = 公交导向 vs 绿带（作业）\n"
        "A → 公交导向 + 车站混合用地 ✓\n"
        "B → 绿带；担心铁路成本\n"
        "导师：报告标准 → 可行性 或 长期管控"
    ),
    "coachingTipsEn": [
        "Separate lines by speaker — helps Matching-style Part 3 questions.",
        "Use symbols only when shorter than words (e.g. → for leads to).",
        "Do not repeat the same idea in full words and symbols.",
    ],
    "coachingTipsZh": [
        "按说话人分行——有助于 Part 3 配对类题目。",
        "仅当符号比完整词更短时使用（如 → 表示导致）。",
        "不要用完整词和符号重复同一意思。",
    ],
}

SEED_P4_A: dict[str, Any] = {
    "title": "Part 4 — Sustainable communities lecture",
    "partType": "P4",
    "lessonEn": "Lecture flow: framing → evidence → implication. Capture numbers and named concepts.",
    "lessonZh": "讲座结构：框架 → 证据 → 含义。记录数字与专有概念。",
    "scriptEn": (
        "[Part 4 — Lecture]\n\n"
        "Good morning. This lecture introduces Peter Calthorpe's ideas on sustainable communities. "
        "Walkable neighbourhoods near transit can reduce car dependence by roughly fifteen to twenty percent in pilot cities. "
        "However, density alone does not guarantee affordability; inclusive zoning policies matter. "
        "I will close with two design principles for your reading list."
    ),
    "scriptZh": (
        "[Part 4 — 讲座]\n\n"
        "早上好。本讲座介绍 Peter Calthorpe 关于可持续社区的观点。"
        "公交附近步行友好社区在试点城市可将驾车依赖降低约 15–20%。"
        "但仅靠密度无法保证可负担性；包容性分区政策很重要。"
        "最后我将给出两条设计原则供阅读清单参考。"
    ),
    "questions": [
        {
            "id": "lp4a1",
            "typeId": "LNC",
            "promptEn": "The lecture topic is:",
            "promptZh": "讲座主题是：",
            "optionsEn": [
                "sustainable communities (Calthorpe)",
                "ancient pottery",
                "campus cafeteria",
                "grammar rules only",
            ],
            "optionsZh": [
                "可持续社区（Calthorpe）",
                "古代陶器",
                "校园食堂",
                "仅语法规则",
            ],
            "correctIndex": 0,
            "evidenceEn": "Peter Calthorpe's ideas on sustainable communities",
            "evidenceZh": "Peter Calthorpe 关于可持续社区的观点",
        },
        {
            "id": "lp4a2",
            "typeId": "LTC",
            "promptEn": "Car dependence may fall by:",
            "promptZh": "驾车依赖可能下降：",
            "optionsEn": [
                "about 15–20%",
                "exactly 50%",
                "0%",
                "100%",
            ],
            "optionsZh": [
                "约 15–20%",
                "正好 50%",
                "0%",
                "100%",
            ],
            "correctIndex": 0,
            "evidenceEn": "fifteen to twenty percent",
            "evidenceZh": "15–20%",
        },
        {
            "id": "lp4a3",
            "typeId": "LMC",
            "promptEn": "*However* introduces:",
            "promptZh": "*However* 引出：",
            "optionsEn": [
                "a limitation of density",
                "full agreement",
                "the opening greeting only",
                "exam instructions",
            ],
            "optionsZh": [
                "密度的局限",
                "完全同意",
                "仅开场问候",
                "考试说明",
            ],
            "correctIndex": 0,
            "evidenceEn": "density alone does not guarantee affordability",
            "evidenceZh": "仅靠密度无法保证可负担性",
        },
        {
            "id": "lp4a4",
            "typeId": "LSC",
            "promptEn": "Affordability also needs:",
            "promptZh": "可负担性还需要：",
            "optionsEn": [
                "inclusive zoning policies",
                "more car parks only",
                "shorter lectures",
                "fewer readings",
            ],
            "optionsZh": [
                "包容性分区政策",
                "仅更多停车场",
                "更短讲座",
                "更少阅读",
            ],
            "correctIndex": 0,
            "evidenceEn": "inclusive zoning policies matter",
            "evidenceZh": "包容性分区政策很重要",
        },
        {
            "id": "lp4a5",
            "typeId": "LPL",
            "promptEn": "The speaker will end with:",
            "promptZh": "讲者将以此结束：",
            "optionsEn": [
                "two design principles",
                "a music performance",
                "unrelated jokes",
                "cancellation of the course",
            ],
            "optionsZh": [
                "两条设计原则",
                "音乐表演",
                "无关笑话",
                "取消课程",
            ],
            "correctIndex": 0,
            "evidenceEn": "two design principles for your reading list",
            "evidenceZh": "两条设计原则供阅读清单",
        },
    ],
    "exemplarNotesEn": (
        "Topic: Calthorpe / sustainable communities\n"
        "Walkable + transit → car use ↓ 15–20% (pilots)\n"
        "BUT density ≠ affordability → inclusive zoning\n"
        "Close: 2 design principles (reading list)"
    ),
    "exemplarNotesZh": (
        "主题：Calthorpe / 可持续社区\n"
        "步行+公交 → 驾车 ↓ 15–20%（试点）\n"
        "但 密度 ≠ 可负担 → 包容性分区\n"
        "结尾：2 条设计原则（阅读清单）"
    ),
    "coachingTipsEn": [
        "Capture numbers exactly — completion tasks often use verbatim figures.",
        "Use arrows for cause/effect (walkable → less car use).",
        "Flag contrast words (However) in the margin.",
    ],
    "coachingTipsZh": [
        "准确记录数字——填空题常要求原文措辞。",
        "用箭头表示因果（步行友好 → 驾车减少）。",
        "在页边标出转折词（However）。",
    ],
}

SEED_P3_B: dict[str, Any] = {
    "title": "Part 3 — Renewable campus project meeting",
    "partType": "P3",
    "lessonEn": "Listen for decisions and who volunteers for each task.",
    "lessonZh": "留意决定了什么、谁认领哪项任务。",
    "scriptEn": (
        "[Part 3 — Discussion]\n\n"
        "PROJECT LEAD: We need roles for the renewable campus poster — data, design, and presentation.\n\n"
        "MAYA: I can compile the survey numbers by Friday.\n\n"
        "JAMES: I'll handle design, but I need the figures before I start layouts.\n\n"
        "PROJECT LEAD: So Maya owns data first; James follows once numbers are ready. I'll draft the script."
    ),
    "scriptZh": (
        "[Part 3 — 讨论]\n\n"
        "项目负责人：可再生能源校园海报需要分工——数据、设计、汇报。\n\n"
        "Maya：我周五前整理调查数据。\n\n"
        "James：我负责设计，但需要先有数据才能排版。\n\n"
        "项目负责人：Maya 先做数据；数据就绪后 James 跟进。我来写讲稿。"
    ),
    "questions": [
        {
            "id": "lp3b1",
            "typeId": "LM",
            "promptEn": "Maya will:",
            "promptZh": "Maya 将：",
            "optionsEn": [
                "compile survey numbers",
                "design layouts first",
                "cancel the project",
                "write the final exam",
            ],
            "optionsZh": [
                "整理调查数据",
                "先做排版",
                "取消项目",
                "写期末考试",
            ],
            "correctIndex": 0,
            "evidenceEn": "compile the survey numbers by Friday",
            "evidenceZh": "周五前整理调查数据",
        },
        {
            "id": "lp3b2",
            "typeId": "LM",
            "promptEn": "James needs figures:",
            "promptZh": "James 需要数据：",
            "optionsEn": [
                "before starting layouts",
                "only after presentation",
                "never",
                "from another university only",
            ],
            "optionsZh": [
                "在开始排版之前",
                "仅在汇报之后",
                "从不需要",
                "仅来自其他大学",
            ],
            "correctIndex": 0,
            "evidenceEn": "need the figures before I start layouts",
            "evidenceZh": "需要先有数据才能排版",
        },
        {
            "id": "lp3b3",
            "typeId": "LMC",
            "promptEn": "The project lead will:",
            "promptZh": "项目负责人将：",
            "optionsEn": [
                "draft the presentation script",
                "draw all posters alone",
                "delete survey data",
                "change the course code",
            ],
            "optionsZh": [
                "撰写汇报讲稿",
                "独自画所有海报",
                "删除调查数据",
                "更改课程代码",
            ],
            "correctIndex": 0,
            "evidenceEn": "I'll draft the script",
            "evidenceZh": "我来写讲稿",
        },
    ],
    "exemplarNotesEn": "Roles: data (Maya, Fri) → design (James, after data) | Lead = script",
    "exemplarNotesZh": "分工：数据（Maya，周五）→ 设计（James，数据后）| 负责人 = 讲稿",
    "coachingTipsEn": ["Order of tasks matters — note dependencies (James after Maya)."],
    "coachingTipsZh": ["任务顺序很重要——记录依赖关系（James 在 Maya 之后）。"],
}

SEED_P4_B: dict[str, Any] = {
    "title": "Part 4 — Academic integrity briefing",
    "partType": "P4",
    "lessonEn": "Note definitions, examples, and reporting steps in order.",
    "lessonZh": "按顺序记录定义、例子与报告步骤。",
    "scriptEn": (
        "[Part 4 — Lecture]\n\n"
        "First, I define academic integrity as honest engagement with sources and assessments. "
        "Next, I describe one case from last term involving uncited paraphrase. "
        "Finally, I explain how students should report concerns through the faculty portal."
    ),
    "scriptZh": (
        "[Part 4 — 讲座]\n\n"
        "首先，我将学术诚信定义为诚实对待文献与评估。"
        "接着，介绍上学期一个未标注出处的转述案例。"
        "最后，说明如何通过院系门户报告问题。"
    ),
    "questions": [
        {
            "id": "lp4b1",
            "typeId": "LPL",
            "promptEn": "The first section defines:",
            "promptZh": "第一部分定义：",
            "optionsEn": [
                "academic integrity",
                "sports schedules",
                "cafeteria prices",
                "library furniture",
            ],
            "optionsZh": [
                "学术诚信",
                "体育赛程",
                "食堂价格",
                "图书馆家具",
            ],
            "correctIndex": 0,
            "evidenceEn": "define academic integrity",
            "evidenceZh": "定义学术诚信",
        },
        {
            "id": "lp4b2",
            "typeId": "LNC",
            "promptEn": "The middle example involves:",
            "promptZh": "中间案例涉及：",
            "optionsEn": [
                "uncited paraphrase",
                "perfect citations",
                "group sports",
                "holiday travel",
            ],
            "optionsZh": [
                "未标注出处的转述",
                "完美引用",
                "团体运动",
                "假期旅行",
            ],
            "correctIndex": 0,
            "evidenceEn": "uncited paraphrase",
            "evidenceZh": "未标注出处的转述",
        },
        {
            "id": "lp4b3",
            "typeId": "LSC",
            "promptEn": "Reports should be filed via:",
            "promptZh": "报告应通过：",
            "optionsEn": [
                "the faculty portal",
                "social media only",
                "paper letters only",
                "random email addresses",
            ],
            "optionsZh": [
                "院系门户",
                "仅社交媒体",
                "仅纸质信函",
                "随意邮箱",
            ],
            "correctIndex": 0,
            "evidenceEn": "faculty portal",
            "evidenceZh": "院系门户",
        },
    ],
    "exemplarNotesEn": "1 def integrity | 2 case: uncited paraphrase | 3 report → faculty portal",
    "exemplarNotesZh": "1 定义诚信 | 2 案例：未标注转述 | 3 报告 → 院系门户",
    "coachingTipsEn": ["Signpost words (First/Next/Finally) map to lecture sections."],
    "coachingTipsZh": ["路标词（First/Next/Finally）对应讲座结构。"],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _parse_start(start: str | None) -> date:
    if not start:
        return _today_utc()
    try:
        return date.fromisoformat(str(start)[:10])
    except ValueError:
        return _today_utc()


def _part_type_for_day(day_number: int) -> str:
    return "P3" if day_number % 2 == 1 else "P4"


def _item_payload(raw: dict[str, Any], *, include_answers: bool = True) -> dict[str, Any]:
    questions = []
    for q in raw.get("questions") or []:
        item: dict[str, Any] = {
            "id": q["id"],
            "typeId": q.get("typeId") or "LMC",
            "promptEn": q.get("promptEn") or "",
            "promptZh": q.get("promptZh") or "",
            "optionsEn": q.get("optionsEn") or [],
            "optionsZh": q.get("optionsZh") or [],
        }
        if include_answers:
            item["correctIndex"] = q.get("correctIndex", 0)
            item["evidenceEn"] = q.get("evidenceEn") or ""
            item["evidenceZh"] = q.get("evidenceZh") or ""
        questions.append(item)
    tips_en = raw.get("coachingTipsEn") or []
    tips_zh = raw.get("coachingTipsZh") or []
    if isinstance(tips_en, str):
        tips_en = [tips_en]
    if isinstance(tips_zh, str):
        tips_zh = [tips_zh]
    return {
        "partType": raw.get("partType") or "P4",
        "title": raw.get("title") or "",
        "lessonEn": raw.get("lessonEn") or "",
        "lessonZh": raw.get("lessonZh") or "",
        "scriptEn": raw.get("scriptEn") or "",
        "scriptZh": raw.get("scriptZh") or "",
        "questions": questions,
        "exemplarNotesEn": raw.get("exemplarNotesEn") or "",
        "exemplarNotesZh": raw.get("exemplarNotesZh") or "",
        "coachingTipsEn": tips_en,
        "coachingTipsZh": tips_zh,
        "audioUrl": raw.get("audioUrl"),
    }


def migrate_self_study_listening_tables(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listening_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listening_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT,
            part_type TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS listening_schedule_days (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            day_number INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            part_type TEXT NOT NULL,
            UNIQUE(schedule_id, day_number),
            FOREIGN KEY (schedule_id) REFERENCES listening_schedules(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES listening_items(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS student_listening_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            item_id INTEGER NOT NULL,
            listen_done INTEGER NOT NULL DEFAULT 0,
            self_notes TEXT,
            practice_done INTEGER NOT NULL DEFAULT 0,
            score_correct INTEGER,
            score_total INTEGER,
            answers_json TEXT,
            completed_at TEXT,
            UNIQUE(student_username, item_id),
            FOREIGN KEY (item_id) REFERENCES listening_items(id) ON DELETE CASCADE
        )
        """
    )
    seed_default_listening_course(conn)


def seed_default_listening_course(conn) -> None:
    existing = conn.execute(
        "SELECT id FROM listening_schedules WHERE class_name = ? AND status = 'active' LIMIT 1",
        ("EAP047",),
    ).fetchone()
    if existing:
        return
    now = _now_iso()
    start = _today_utc().isoformat()

    def insert_item(data: dict, order: int) -> int:
        conn.execute(
            """
            INSERT INTO listening_items (class_name, part_type, title, sort_order, content_json, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                "EAP047",
                data["partType"],
                data["title"],
                order,
                json.dumps(_item_payload(data, include_answers=True), ensure_ascii=False),
                now,
                now,
            ),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    p3a = insert_item(SEED_P3_A, 1)
    p4a = insert_item(SEED_P4_A, 2)
    p3b = insert_item(SEED_P3_B, 3)
    p4b = insert_item(SEED_P4_B, 4)

    conn.execute(
        """
        INSERT INTO listening_schedules (class_name, start_date, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
        """,
        ("EAP047", start, now, now),
    )
    sched_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    day_map = [(1, p3a, "P3"), (2, p4a, "P4"), (3, p3b, "P3"), (4, p4b, "P4")]
    for day_num, item_id, pt in day_map:
        conn.execute(
            """
            INSERT INTO listening_schedule_days (schedule_id, day_number, item_id, part_type)
            VALUES (?, ?, ?, ?)
            """,
            (sched_id, day_num, item_id, pt),
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


def _active_schedule(conn, class_name: str) -> Any:
    return conn.execute(
        """
        SELECT * FROM listening_schedules
        WHERE class_name = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
        """,
        (class_name,),
    ).fetchone()


def _day_number(schedule: Any, on_date: date | None = None) -> int:
    start = _parse_start(schedule["start_date"])
    today = on_date or _today_utc()
    offset = (today - start).days
    return max(1, offset + 1)


def _item_for_day(conn, schedule_id: int, day_number: int) -> Any:
    row = conn.execute(
        """
        SELECT i.*, d.part_type AS scheduled_part
        FROM listening_schedule_days d
        JOIN listening_items i ON i.id = d.item_id
        WHERE d.schedule_id = ? AND d.day_number = ?
        LIMIT 1
        """,
        (schedule_id, day_number),
    ).fetchone()
    if row:
        return row
    pt = _part_type_for_day(day_number)
    return conn.execute(
        """
        SELECT i.*, i.part_type AS scheduled_part
        FROM listening_items i
        WHERE i.class_name = ? AND i.part_type = ? AND i.is_active = 1
        ORDER BY sort_order ASC, id ASC
        LIMIT 1
        """,
        ("EAP047", pt),
    ).fetchone()


def _strip_answers(content: dict) -> dict:
    out = dict(content)
    qs = []
    for q in content.get("questions") or []:
        qs.append(
            {
                "id": q["id"],
                "typeId": q.get("typeId") or "LMC",
                "promptEn": q.get("promptEn") or "",
                "promptZh": q.get("promptZh") or "",
                "optionsEn": q.get("optionsEn") or [],
                "optionsZh": q.get("optionsZh") or [],
            }
        )
    out["questions"] = qs
    out.pop("exemplarNotesEn", None)
    out.pop("exemplarNotesZh", None)
    out.pop("coachingTipsEn", None)
    out.pop("coachingTipsZh", None)
    return out


def _coach_payload(content: dict) -> dict:
    return {
        "exemplarNotesEn": content.get("exemplarNotesEn") or "",
        "exemplarNotesZh": content.get("exemplarNotesZh") or "",
        "coachingTipsEn": content.get("coachingTipsEn") or [],
        "coachingTipsZh": content.get("coachingTipsZh") or [],
    }


def _score_answers(content: dict, answers: dict[str, int]) -> dict[str, Any]:
    results = []
    correct = 0
    total = 0
    for q in content.get("questions") or []:
        qid = q["id"]
        total += 1
        chosen = answers.get(qid)
        if chosen is None:
            chosen = answers.get(str(qid))
        ci = int(q.get("correctIndex") or 0)
        ok = chosen is not None and int(chosen) == ci
        if ok:
            correct += 1
        results.append(
            {
                "id": qid,
                "correct": ok,
                "chosenIndex": chosen,
                "correctIndex": ci,
                "evidenceEn": q.get("evidenceEn") or "",
                "evidenceZh": q.get("evidenceZh") or "",
            }
        )
    return {"correct": correct, "total": total, "results": results}


def register_self_study_listening_routes(
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

    @app.route("/api/student/self-study/listening/overview", methods=["GET"])
    def student_listening_overview():
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
        schedule = _active_schedule(conn, class_name)
        day_num = _day_number(schedule) if schedule else None
        item = _item_for_day(conn, schedule["id"], day_num) if schedule and day_num else None
        prog = None
        if item:
            prog = conn.execute(
                "SELECT * FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
                (username, item["id"]),
            ).fetchone()
        conn.close()

        part_type = item["scheduled_part"] if item else (_part_type_for_day(day_num) if day_num else None)
        return jsonify(
            {
                "className": class_name,
                "channel": "B",
                "schedule": {
                    "startDate": schedule["start_date"] if schedule else None,
                    "dayNumber": day_num,
                    "partType": part_type,
                }
                if schedule
                else None,
                "todayItem": {
                    "id": item["id"],
                    "title": item["title"],
                    "partType": part_type,
                    "questionCount": len(json.loads(item["content_json"]).get("questions") or []),
                    "completed": bool(prog and prog["practice_done"]),
                }
                if item
                else None,
            }
        )

    @app.route("/api/student/self-study/listening/today", methods=["GET"])
    def student_listening_today():
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
        schedule = _active_schedule(conn, class_name)
        if not schedule:
            conn.close()
            return jsonify({"error": "No active listening schedule"}), 404

        day_num = _day_number(schedule)
        item = _item_for_day(conn, schedule["id"], day_num)
        if not item:
            conn.close()
            return jsonify({"error": "No listening item for today"}), 404

        content = json.loads(item["content_json"])
        prog = conn.execute(
            "SELECT * FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
            (username, item["id"]),
        ).fetchone()
        script_en = content.get("scriptEn") or ""
        audio = ensure_listening_audio(item["id"], script_en)
        conn.close()

        return jsonify(
            {
                "channel": "B",
                "itemId": item["id"],
                "dayNumber": day_num,
                "partType": item["scheduled_part"] or item["part_type"],
                "title": item["title"],
                "content": _strip_answers(content),
                "audio": audio,
                "audioStatus": audio_status(),
                "progress": {
                    "listenDone": bool(prog and prog["listen_done"]),
                    "selfNotes": prog["self_notes"] if prog else "",
                    "practiceDone": bool(prog and prog["practice_done"]),
                    "scoreCorrect": prog["score_correct"] if prog else None,
                    "scoreTotal": prog["score_total"] if prog else None,
                },
            }
        )

    @app.route("/api/student/self-study/listening/coach", methods=["GET"])
    def student_listening_coach():
        conn = get_db_connection()
        err = require_session_role_if_enabled(conn, "student")
        if err:
            conn.close()
            return err
        username = get_effective_student_username(conn)
        if not username:
            conn.close()
            return jsonify({"error": "Student session required"}), 401

        item_id = int(request.args.get("itemId") or 0)
        if not item_id:
            conn.close()
            return jsonify({"error": "itemId required"}), 400

        prog = conn.execute(
            "SELECT practice_done FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
            (username, item_id),
        ).fetchone()
        row = conn.execute("SELECT content_json FROM listening_items WHERE id = ?", (item_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Item not found"}), 404
        if not prog or not prog["practice_done"]:
            return jsonify({"error": "Complete practice first"}), 403

        content = json.loads(row["content_json"])
        return jsonify({"coach": _coach_payload(content)})

    @app.route("/api/student/self-study/listening/complete", methods=["POST"])
    def student_listening_complete():
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
        item_id = int(data.get("itemId") or 0)
        listen_done = 1 if data.get("listenDone") else 0
        self_notes = data.get("selfNotes")
        submit_answers = data.get("answers")
        if not item_id:
            conn.close()
            return jsonify({"error": "itemId required"}), 400

        row = conn.execute("SELECT content_json FROM listening_items WHERE id = ?", (item_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Item not found"}), 404

        content = json.loads(row["content_json"])
        now = _now_iso()
        practice_done = 0
        score_correct = None
        score_total = None
        answers_json = None
        scoring = None

        if submit_answers is not None:
            answers = submit_answers if isinstance(submit_answers, dict) else {}
            scoring = _score_answers(content, answers)
            practice_done = 1
            score_correct = scoring["correct"]
            score_total = scoring["total"]
            answers_json = json.dumps(answers, ensure_ascii=False)
            listen_done = 1

        notes_val = None
        if self_notes is not None:
            notes_val = str(self_notes)[:8000]

        completed_at = now if practice_done else (now if listen_done else None)
        conn.execute(
            """
            INSERT INTO student_listening_progress
                (student_username, item_id, listen_done, self_notes, practice_done,
                 score_correct, score_total, answers_json, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_username, item_id) DO UPDATE SET
                listen_done = CASE WHEN excluded.listen_done = 1 OR student_listening_progress.listen_done = 1 THEN 1 ELSE 0 END,
                self_notes = COALESCE(excluded.self_notes, student_listening_progress.self_notes),
                practice_done = CASE WHEN excluded.practice_done = 1 OR student_listening_progress.practice_done = 1 THEN 1 ELSE 0 END,
                score_correct = COALESCE(excluded.score_correct, student_listening_progress.score_correct),
                score_total = COALESCE(excluded.score_total, student_listening_progress.score_total),
                answers_json = COALESCE(excluded.answers_json, student_listening_progress.answers_json),
                completed_at = COALESCE(excluded.completed_at, student_listening_progress.completed_at)
            """,
            (
                username,
                item_id,
                listen_done,
                notes_val,
                practice_done,
                score_correct,
                score_total,
                answers_json,
                completed_at,
            ),
        )
        conn.commit()
        conn.close()
        out: dict[str, Any] = {"ok": True}
        if scoring:
            out["scoring"] = scoring
            out["coach"] = _coach_payload(content)
        return jsonify(out)

    @app.route("/api/admin/self-study/listening/items", methods=["GET"])
    def admin_listening_items():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            """
            SELECT id, title, class_name, part_type, sort_order, is_active
            FROM listening_items ORDER BY sort_order ASC, id ASC
            """
        ).fetchall()
        conn.close()
        return jsonify(
            {
                "items": [
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

    @app.route("/api/admin/self-study/listening/items/export.csv", methods=["GET"])
    def admin_listening_export():
        conn = get_db_connection()
        err = require_manager_console_role(conn)
        if err:
            conn.close()
            return err
        rows = conn.execute(
            "SELECT id, title, part_type, content_json FROM listening_items WHERE is_active = 1 ORDER BY sort_order, id"
        ).fetchall()
        conn.close()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["item_id", "title", "part_type", "question_id", "type_id", "prompt_en", "correct_index"])
        for row in rows:
            content = json.loads(row["content_json"])
            for q in content.get("questions") or []:
                writer.writerow(
                    [
                        row["id"],
                        row["title"],
                        row["part_type"],
                        q.get("id"),
                        q.get("typeId"),
                        q.get("promptEn"),
                        q.get("correctIndex"),
                    ]
                )
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="listening-items.csv"'},
        )
