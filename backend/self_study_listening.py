"""
SS-L1 / SS-L2 — Self-study listening (Channel B; Part 3/4 alternate; notes coach + compare).
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
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
    "keyPointsEn": [
        "Student A: transit-oriented development + mixed-use at station",
        "Student B: green belts without expensive rail upgrades",
        "Report criterion: feasibility vs long-term containment",
    ],
    "keyPointsZh": [
        "学生 A：公交导向 + 车站混合用地",
        "学生 B：绿带、不依赖昂贵铁路改造",
        "报告标准：可行性 vs 长期管控",
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
    "keyPointsEn": [
        "Topic: Calthorpe / sustainable communities",
        "Walkable + transit → car use down 15–20%",
        "Density does not guarantee affordability; inclusive zoning",
        "Close: two design principles",
    ],
    "keyPointsZh": [
        "主题：Calthorpe / 可持续社区",
        "步行+公交 → 驾车降低 15–20%",
        "密度不等于可负担；包容性分区",
        "结尾：两条设计原则",
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
    "keyPointsEn": [
        "Maya: compile survey numbers by Friday",
        "James: design after figures are ready",
        "Project lead: draft presentation script",
    ],
    "keyPointsZh": [
        "Maya：周五前整理调查数据",
        "James：数据就绪后再做设计",
        "项目负责人：撰写汇报讲稿",
    ],
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
    "keyPointsEn": [
        "Define academic integrity",
        "Example: uncited paraphrase case",
        "Report concerns via faculty portal",
    ],
    "keyPointsZh": [
        "定义学术诚信",
        "案例：未标注出处的转述",
        "通过院系门户报告问题",
    ],
}

_SEED_BY_TITLE: dict[str, dict[str, Any]] = {
    SEED_P3_A["title"]: SEED_P3_A,
    SEED_P4_A["title"]: SEED_P4_A,
    SEED_P3_B["title"]: SEED_P3_B,
    SEED_P4_B["title"]: SEED_P4_B,
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
    try:
        from self_study_listening_ai import normalize_listening_content

        raw = normalize_listening_content(raw)
    except Exception:
        pass
    questions = []
    for q in raw.get("questions") or []:
        type_id = str(q.get("typeId") or "LMC").upper()
        item: dict[str, Any] = {
            "id": q["id"],
            "typeId": type_id,
            "instructionEn": q.get("instructionEn") or "",
            "instructionZh": q.get("instructionZh") or "",
            "promptEn": q.get("promptEn") or "",
            "promptZh": q.get("promptZh") or "",
            "optionsEn": q.get("optionsEn") or [],
            "optionsZh": q.get("optionsZh") or [],
        }
        if type_id == "LM" and q.get("pairs"):
            item["pairs"] = q.get("pairs") or []
        elif type_id in ("LSeC", "LNC", "LSAQ", "LSC", "LFC"):
            item["wordLimit"] = int(q.get("wordLimit") or 3)
            if include_answers:
                item["correctAnswer"] = q.get("correctAnswer") or ""
        if include_answers:
            if "correctIndex" in q or type_id in ("LMC", "LTC", "LM") and not q.get("pairs"):
                item["correctIndex"] = int(q.get("correctIndex") or 0)
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
        "turns": raw.get("turns") or [],
        "paragraphs": raw.get("paragraphs") or [],
        "scriptEn": raw.get("scriptEn") or "",
        "scriptZh": raw.get("scriptZh") or "",
        "questions": questions,
        "exemplarNotesEn": raw.get("exemplarNotesEn") or "",
        "exemplarNotesZh": raw.get("exemplarNotesZh") or "",
        "coachingTipsEn": tips_en,
        "coachingTipsZh": tips_zh,
        "keyPointsEn": _key_points_list(raw.get("keyPointsEn")),
        "keyPointsZh": _key_points_list(raw.get("keyPointsZh")),
        "audioUrl": raw.get("audioUrl"),
    }


def _key_points_list(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return []


def _key_point_pairs(content: dict) -> list[tuple[str, str]]:
    en = _key_points_list(content.get("keyPointsEn"))
    zh = _key_points_list(content.get("keyPointsZh"))
    if en or zh:
        size = max(len(en), len(zh))
        pairs: list[tuple[str, str]] = []
        for i in range(size):
            pairs.append((en[i] if i < len(en) else "", zh[i] if i < len(zh) else ""))
        return pairs
    lines_en = [ln.strip() for ln in (content.get("exemplarNotesEn") or "").splitlines() if ln.strip()]
    lines_zh = [ln.strip() for ln in (content.get("exemplarNotesZh") or "").splitlines() if ln.strip()]
    size = max(len(lines_en), len(lines_zh))
    return [(lines_en[i] if i < len(lines_en) else "", lines_zh[i] if i < len(lines_zh) else "") for i in range(size)]


def _normalize_notes_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.lower().replace("–", "-").replace("—", "-")
    text = re.sub(r"[^\w\s%\-]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def _match_terms_from_label(label: str) -> list[str]:
    norm = _normalize_notes_text(label)
    if not norm:
        return []
    terms: list[str] = []
    for token in re.split(r"[\s/|→:;+,]+", norm):
        token = token.strip("-")
        if len(token) >= 2 or re.search(r"\d", token):
            terms.append(token)
    for word in norm.split():
        if len(word) >= 3 or re.search(r"\d", word):
            terms.append(word)
    seen: set[str] = set()
    out: list[str] = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _key_point_matched(notes_norm: str, label_en: str, label_zh: str) -> bool:
    if not notes_norm:
        return False
    for label in (label_en, label_zh):
        if not label:
            continue
        terms = _match_terms_from_label(label)
        if not terms:
            continue
        hits = sum(1 for term in terms if term in notes_norm)
        if hits >= max(1, round(len(terms) * 0.4)):
            return True
    return False


def compare_listening_notes(self_notes: str, content: dict) -> dict[str, Any]:
    pairs = _key_point_pairs(content)
    notes_norm = _normalize_notes_text(self_notes)
    points: list[dict[str, Any]] = []
    matched_count = 0
    for idx, (label_en, label_zh) in enumerate(pairs):
        matched = _key_point_matched(notes_norm, label_en, label_zh)
        if matched:
            matched_count += 1
        points.append(
            {
                "id": idx,
                "labelEn": label_en,
                "labelZh": label_zh,
                "matched": matched,
            }
        )
    total = len(points)
    coverage = round((matched_count / total) * 100) if total else 0
    return {
        "coveragePct": coverage,
        "matchedCount": matched_count,
        "totalCount": total,
        "points": points,
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
    _upgrade_listening_key_points(conn)


def _upgrade_listening_key_points(conn) -> None:
    """Patch EAP047 seed items created before SS-L2 keyPoints were added."""
    now = _now_iso()
    for title, seed in _SEED_BY_TITLE.items():
        row = conn.execute(
            "SELECT id, content_json FROM listening_items WHERE title = ? LIMIT 1",
            (title,),
        ).fetchone()
        if not row:
            continue
        content = json.loads(row["content_json"])
        if content.get("keyPointsEn") or content.get("keyPointsZh"):
            continue
        merged = dict(content)
        merged["keyPointsEn"] = seed.get("keyPointsEn") or []
        merged["keyPointsZh"] = seed.get("keyPointsZh") or []
        conn.execute(
            "UPDATE listening_items SET content_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(merged, ensure_ascii=False), now, row["id"]),
        )
    conn.commit()


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
    return conn.execute(
        """
        SELECT i.*, d.part_type AS scheduled_part
        FROM listening_schedule_days d
        JOIN listening_items i ON i.id = d.item_id
        WHERE d.schedule_id = ? AND d.day_number = ?
        LIMIT 1
        """,
        (schedule_id, day_number),
    ).fetchone()


def _attach_item_to_schedule(conn, schedule_id: int, day_number: int, item_id: int, part_type: str) -> None:
    conn.execute(
        """
        INSERT INTO listening_schedule_days (schedule_id, day_number, item_id, part_type)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(schedule_id, day_number) DO UPDATE SET
            item_id = excluded.item_id,
            part_type = excluded.part_type
        """,
        (schedule_id, day_number, item_id, part_type),
    )


def _insert_listening_item(conn, data: dict, class_name: str, sort_order: int) -> int:
    now = _now_iso()
    payload = _item_payload(data, include_answers=True)
    conn.execute(
        """
        INSERT INTO listening_items (class_name, part_type, title, sort_order, content_json, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (
            class_name,
            payload["partType"],
            payload["title"],
            sort_order,
            json.dumps(payload, ensure_ascii=False),
            now,
            now,
        ),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def _update_item_content(conn, item_id: int, data: dict) -> None:
    now = _now_iso()
    payload = _item_payload(data, include_answers=True)
    conn.execute(
        """
        UPDATE listening_items
        SET content_json = ?, title = ?, part_type = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            json.dumps(payload, ensure_ascii=False),
            payload["title"],
            payload["partType"],
            now,
            item_id,
        ),
    )


def _maybe_upgrade_item(
    conn,
    item: Any,
    *,
    schedule_id: int,
    day_number: int,
    class_name: str,
) -> Any:
    try:
        from self_study_listening_ai import (
            generate_daily_listening,
            item_needs_upgrade,
            listening_ai_available,
        )
    except Exception:
        return item
    if not listening_ai_available():
        return item
    content = json.loads(item["content_json"])
    if not item_needs_upgrade(content):
        return item
    try:
        pt = str(item["scheduled_part"] or item["part_type"] or _part_type_for_day(day_number)).upper()
        new_content = generate_daily_listening(pt, day_number, class_name)
        _update_item_content(conn, int(item["id"]), new_content)
        conn.commit()
        return _item_for_day(conn, schedule_id, day_number)
    except Exception:
        return item


def _ensure_item_for_day(
    conn,
    *,
    schedule: Any,
    day_number: int,
    class_name: str,
) -> Any:
    item = _item_for_day(conn, schedule["id"], day_number)
    if item:
        return _maybe_upgrade_item(
            conn,
            item,
            schedule_id=int(schedule["id"]),
            day_number=day_number,
            class_name=class_name,
        )
    try:
        from self_study_listening_ai import generate_daily_listening, listening_ai_available

        if not listening_ai_available():
            return None
        pt = _part_type_for_day(day_number)
        content = generate_daily_listening(pt, day_number, class_name)
        sort_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM listening_items WHERE class_name = ?",
            (class_name,),
        ).fetchone()
        item_id = _insert_listening_item(conn, content, class_name, int(sort_row["mx"] or 0) + 1)
        _attach_item_to_schedule(conn, schedule["id"], day_number, item_id, pt)
        conn.commit()
        return _item_for_day(conn, schedule["id"], day_number)
    except Exception:
        return None


def _strip_answers(content: dict) -> dict:
    out = dict(content)
    qs = []
    for q in content.get("questions") or []:
        type_id = str(q.get("typeId") or "LMC").upper()
        item: dict[str, Any] = {
            "id": q["id"],
            "typeId": type_id,
            "instructionEn": q.get("instructionEn") or "",
            "instructionZh": q.get("instructionZh") or "",
            "promptEn": q.get("promptEn") or "",
            "promptZh": q.get("promptZh") or "",
            "optionsEn": q.get("optionsEn") or [],
            "optionsZh": q.get("optionsZh") or [],
        }
        if type_id in ("LSeC", "LNC", "LSAQ", "LSC", "LFC"):
            item["wordLimit"] = int(q.get("wordLimit") or 3)
        if type_id == "LM" and q.get("pairs"):
            item["pairs"] = [{"left": p.get("left") or ""} for p in q.get("pairs") or []]
        qs.append(item)
    out["questions"] = qs
    out.pop("scriptEn", None)
    out.pop("scriptZh", None)
    out.pop("turns", None)
    out.pop("paragraphs", None)
    out.pop("exemplarNotesEn", None)
    out.pop("exemplarNotesZh", None)
    out.pop("coachingTipsEn", None)
    out.pop("coachingTipsZh", None)
    out.pop("keyPointsEn", None)
    out.pop("keyPointsZh", None)
    return out


def _coach_payload(content: dict, self_notes: str = "") -> dict:
    payload: dict[str, Any] = {
        "exemplarNotesEn": content.get("exemplarNotesEn") or "",
        "exemplarNotesZh": content.get("exemplarNotesZh") or "",
        "coachingTipsEn": content.get("coachingTipsEn") or [],
        "coachingTipsZh": content.get("coachingTipsZh") or [],
        "keyPointsEn": _key_points_list(content.get("keyPointsEn")),
        "keyPointsZh": _key_points_list(content.get("keyPointsZh")),
    }
    if self_notes is not None:
        payload["comparison"] = compare_listening_notes(self_notes, content)
    return payload


def _norm_gap(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _answer_for_question(q: dict, answers: dict) -> Any:
    qid = q["id"]
    if qid in answers:
        return answers[qid]
    return answers.get(str(qid))


def _score_lm_pairs(q: dict, given: Any) -> tuple[bool, dict[str, Any]]:
    pairs = q.get("pairs") or []
    if not pairs:
        return False, {}
    given_map = given if isinstance(given, dict) else {}
    all_ok = True
    pair_results: list[dict[str, Any]] = []
    for p in pairs:
        left = str(p.get("left") or "")
        expect = str(p.get("right") or "").strip()
        got = str(given_map.get(left) or given_map.get(left.lower()) or "").strip()
        ok = bool(got) and _norm_gap(got) == _norm_gap(expect)
        if not ok:
            all_ok = False
        pair_results.append({"left": left, "chosen": got, "correct": expect, "ok": ok})
    return all_ok, {"pairs": pair_results}


def _score_answers(content: dict, answers: dict[str, Any]) -> dict[str, Any]:
    results = []
    correct = 0
    total = 0
    for q in content.get("questions") or []:
        qid = q["id"]
        type_id = str(q.get("typeId") or "LMC").upper()
        total += 1
        given = _answer_for_question(q, answers)
        ok = False
        result_row: dict[str, Any] = {
            "id": qid,
            "typeId": type_id,
            "evidenceEn": q.get("evidenceEn") or "",
            "evidenceZh": q.get("evidenceZh") or "",
        }
        if type_id == "LM" and q.get("pairs"):
            ok, extra = _score_lm_pairs(q, given)
            result_row.update(extra)
            result_row["errorType"] = None if ok else "wrong_option"
        elif type_id in ("LSeC", "LNC", "LSAQ", "LSC", "LFC"):
            expect = _norm_gap(q.get("correctAnswer"))
            got = _norm_gap(given)
            ok = bool(got) and got == expect
            result_row["chosenAnswer"] = given
            result_row["correctAnswer"] = q.get("correctAnswer") or ""
            result_row["errorType"] = None if ok else ("word_limit" if not got else "spelling")
        else:
            ci = int(q.get("correctIndex") or 0)
            chosen = None
            if given is not None:
                try:
                    chosen = int(given)
                except (TypeError, ValueError):
                    chosen = None
            ok = chosen is not None and chosen == ci
            result_row["chosenIndex"] = chosen
            result_row["correctIndex"] = ci
            result_row["errorType"] = None if ok else "wrong_option"
        result_row["correct"] = ok
        if ok:
            correct += 1
        results.append(result_row)
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
        item = (
            _ensure_item_for_day(conn, schedule=schedule, day_number=day_num, class_name=class_name)
            if schedule and day_num
            else None
        )
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

        day_arg = request.args.get("day")
        if day_arg:
            try:
                day_num = max(1, int(day_arg))
            except (TypeError, ValueError):
                day_num = _day_number(schedule)
        else:
            day_num = _day_number(schedule)

        item = _ensure_item_for_day(
            conn,
            schedule=schedule,
            day_number=day_num,
            class_name=class_name,
        )
        if not item:
            conn.close()
            return jsonify({"error": "No listening item for this day", "dayNumber": day_num}), 404

        content = json.loads(item["content_json"])
        prog = conn.execute(
            "SELECT * FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
            (username, item["id"]),
        ).fetchone()
        script_en = content.get("scriptEn") or ""
        turns = content.get("turns") or []
        audio = ensure_listening_audio(item["id"], script_en, turns=turns)
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
            "SELECT practice_done, self_notes FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
            (username, item_id),
        ).fetchone()
        row = conn.execute("SELECT content_json FROM listening_items WHERE id = ?", (item_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Item not found"}), 404
        if not prog or not prog["practice_done"]:
            return jsonify({"error": "Complete practice first"}), 403

        content = json.loads(row["content_json"])
        self_notes = str(prog["self_notes"] or "") if prog else ""
        return jsonify({"coach": _coach_payload(content, self_notes)})

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
            try:
                from self_study_listening_ai import enrich_scoring_with_ai_feedback

                scoring = enrich_scoring_with_ai_feedback(content, answers, scoring)
            except Exception:
                pass
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
        notes_for_coach = notes_val if notes_val is not None else ""
        if scoring and notes_for_coach == "":
            prog_row = conn.execute(
                "SELECT self_notes FROM student_listening_progress WHERE student_username = ? AND item_id = ?",
                (username, item_id),
            ).fetchone()
            notes_for_coach = str(prog_row["self_notes"] or "") if prog_row else ""
        conn.close()
        out: dict[str, Any] = {"ok": True}
        if scoring:
            out["scoring"] = scoring
            out["coach"] = _coach_payload(content, notes_for_coach)
            out["scriptEn"] = content.get("scriptEn") or ""
            out["scriptZh"] = content.get("scriptZh") or ""
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
