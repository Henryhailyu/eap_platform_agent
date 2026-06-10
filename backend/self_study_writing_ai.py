"""
SS-W2 — AI EAP writing: Essay / Proposal / Mini-dissertation / Research report.
On-demand generation when a student enters a module; IELTS rubric + EAP rigour.
"""
from __future__ import annotations

import json
import re
from typing import Any

ESSAY_WORD_MIN = 280
ESSAY_WORD_MAX = 320
ESSAY_WORD_TARGET = 300
LONG_WORD_MIN = 800
LONG_WORD_MAX = 1200

VALID_MODULES = frozenset({"ESSAY", "PROPOSAL", "MINI_DISSERTATION", "RESEARCH_REPORT"})
VALID_ESSAY_TYPES = frozenset({"DISCUSSIVE", "ARGUMENTATIVE"})


def writing_ai_available() -> bool:
    try:
        from eap_ai import ai_is_configured

        return bool(ai_is_configured and ai_is_configured())
    except Exception:
        return False


def _ai_json(system: str, user: str, *, max_tokens: int = 8000) -> dict[str, Any]:
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
        temperature=0.42,
        response_format={"type": "json_object"},
    )
    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError("Empty AI response")
    return json.loads(raw)


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", text or ""))


def _word_limits(module_id: str) -> dict[str, int]:
    if module_id == "ESSAY":
        return {"wordMin": ESSAY_WORD_MIN, "wordMax": ESSAY_WORD_MAX, "wordTarget": ESSAY_WORD_TARGET}
    return {"wordMin": LONG_WORD_MIN, "wordMax": LONG_WORD_MAX, "wordTarget": 1000}


def _essay_system(essay_type: str) -> str:
    thesis = (
        "The essay will discuss that"
        if essay_type == "DISCUSSIVE"
        else "The essay will argue that"
    )
    return f"""
You are an EAP (English for Academic Purposes) writing instructor at university foundation level (IELTS ~6.0–6.5).
Generate a model {essay_type.lower()} ESSAY plus teaching analysis plus a related practice prompt.

EAP essay rules (stricter than IELTS Task 2):
- Exactly FOUR paragraphs: Introduction, Main body 1, Main body 2, Conclusion.
- Total length ~{ESSAY_WORD_TARGET} words (acceptable {ESSAY_WORD_MIN}–{ESSAY_WORD_MAX}).
- Introduction thesis MUST begin: "{thesis} …" (complete the clause clearly).
- Each body paragraph: clear topic sentence, developed support, cohesive devices (however, furthermore, in contrast, consequently, for instance).
- Formal academic register; no contractions; hedging where appropriate.
- Conclusion: synthesise — no new arguments.

Return ONLY valid JSON with keys:
title, titleZh,
sample {{ fullText (string with \\n\\n between paragraphs), wordCount (int) }},
analysis {{
  task {{ summaryEn, comments[] }},
  organization {{ sections[]: {{ role, guideEn }}, comments[] }},
  vocabulary {{ highlights[]: {{ phrase, noteEn }}, comments[] }},
  grammar {{ highlights[]: {{ pattern, noteEn }}, comments[] }}
}},
practice {{ promptEn, promptZh, relatedTopicEn }}
All teaching text in English. promptZh is Chinese translation of the practice question only.
"""


def _long_system(module_id: str) -> str:
    structures = {
        "PROPOSAL": (
            "Sections: Title; Abstract (80–100 words); Introduction/Background; "
            "Aims and Objectives; Literature Context; Methodology; Timeline; "
            "Expected Outcomes; Brief References (3–4 items)."
        ),
        "MINI_DISSERTATION": (
            "Sections: Abstract; Introduction; Literature Review; Methodology; "
            "Findings and Discussion; Conclusion; References (3–5 items)."
        ),
        "RESEARCH_REPORT": (
            "Sections: Executive Summary; Introduction; Methods; Results; "
            "Discussion; Conclusions and Recommendations; References (3–5 items)."
        ),
    }
    label = module_id.replace("_", " ").title()
    return f"""
You are an EAP writing instructor. Generate a model {label} plus teaching analysis plus a related practice prompt.

Length: {LONG_WORD_MIN}–{LONG_WORD_MAX} words for the sample fullText.
{structures.get(module_id, "")}

EAP rules: formal register, clear section headings implied by paragraph breaks (use \\n\\n between sections),
topic sentences, objective tone, hedging, citation-style phrases (According to X, 2023).

Return ONLY valid JSON with keys:
title, titleZh,
sample {{ fullText, wordCount }},
analysis {{
  task {{ summaryEn, comments[] }},
  organization {{ sections[]: {{ role, guideEn }}, comments[] }},
  vocabulary {{ highlights[]: {{ phrase, noteEn }}, comments[] }},
  grammar {{ highlights[]: {{ pattern, noteEn }}, comments[] }}
}},
practice {{ promptEn, promptZh, relatedTopicEn }}
"""


def _fallback_essay(essay_type: str) -> dict[str, Any]:
    thesis = (
        "The essay will discuss that online learning offers clear benefits for university students, "
        "although face-to-face teaching remains essential for certain skills."
        if essay_type == "DISCUSSIVE"
        else "The essay will argue that universities should require first-year students to attend "
        "on-campus academic writing workshops."
    )
    full = (
        f"{thesis}\n\n"
        "Firstly, flexible online platforms allow students to review lecture materials at their own pace. "
        "For example, recorded seminars support commuters who cannot attend every session. "
        "Furthermore, digital resources reduce printing costs and improve access to recent research.\n\n"
        "However, in-person seminars develop oral argument and immediate feedback. "
        "In contrast, purely online discussion forums may delay clarification of misunderstandings. "
        "Moreover, collaborative projects in physical classrooms build teamwork habits valued by employers.\n\n"
        "In conclusion, blended delivery is the most practical model because it combines accessibility "
        "with the interpersonal learning that EAP programmes aim to develop."
    )
    return {
        "moduleId": "ESSAY",
        "essayType": essay_type,
        "title": f"EAP {essay_type.title()} Essay — Online and campus learning",
        "titleZh": "EAP 范文 — 在线与校园学习",
        "sample": {"fullText": full, "wordCount": word_count(full)},
        "analysis": {
            "task": {
                "summaryEn": "The sample addresses education delivery with a clear EAP thesis formula.",
                "comments": [
                    "Thesis uses the required 'The essay will discuss/argue that' frame.",
                    "Both sides / supporting reasons are developed with examples.",
                ],
            },
            "organization": {
                "sections": [
                    {"role": "introduction", "guideEn": "Thesis + preview of two main lines of argument."},
                    {"role": "body1", "guideEn": "First main point with example and linker."},
                    {"role": "body2", "guideEn": "Counter or second perspective; use contrastive cohesion."},
                    {"role": "conclusion", "guideEn": "Synthesis without new claims."},
                ],
                "comments": ["Four-paragraph block structure is explicit."],
            },
            "vocabulary": {
                "highlights": [
                    {"phrase": "in contrast", "noteEn": "Signals balanced comparison in discursive writing."},
                    {"phrase": "furthermore", "noteEn": "Adds a supporting point without a new paragraph theme."},
                ],
                "comments": ["Academic nouns: platforms, clarification, collaborative."],
            },
            "grammar": {
                "highlights": [
                    {"pattern": "although + clause", "noteEn": "Complex sentence in the thesis."},
                ],
                "comments": ["Consistent present tense for general claims."],
            },
        },
        "practice": {
            "promptEn": (
                "Some universities plan to increase the proportion of online lectures. "
                "Discuss the advantages and disadvantages of this policy for first-year students. "
                "Write approximately 300 words using four paragraphs."
            ),
            "promptZh": "部分大学计划提高在线讲座比例。讨论该政策对一年级学生的利弊。约 300 词，四段结构。",
            "relatedTopicEn": "online lectures and first-year students",
        },
    }


def _fallback_long(module_id: str) -> dict[str, Any]:
    titles = {
        "PROPOSAL": ("Pilot study proposal — peer writing feedback", "研究计划书范文 — 同伴写作反馈试点"),
        "MINI_DISSERTATION": ("Mini-dissertation — note-taking apps and recall", "迷你学位论文范文 — 笔记应用与记忆"),
        "RESEARCH_REPORT": ("Research report — library study-hall usage", "研究报告范文 — 图书馆自习室使用"),
    }
    title_en, title_zh = titles.get(module_id, ("EAP writing sample", "EAP 范文"))
    full = (
        "Abstract\n\n"
        "This study examines how structured peer feedback influences draft revision among first-year EAP students. "
        "The project responds to concerns that students submit essays without engaging with rubric criteria. "
        "Data will be collected over one academic term using draft portfolios and short surveys.\n\n"
        "Introduction\n\n"
        "Writing development is central to foundation programmes because assessment across disciplines depends on "
        "clear argument and source use. Recent programme reviews suggest that students understand criteria but "
        "rarely apply them when revising independently. Consequently, a small-scale classroom intervention is justified.\n\n"
        "Literature Context\n\n"
        "Previous classroom research indicates that guided peer review can improve cohesion when reviewers use "
        "a checklist aligned with IELTS Task Response and Coherence descriptors. However, studies also warn that "
        "vague comments produce limited revision. Therefore, this project combines checklist prompts with "
        "tutor moderation.\n\n"
        "Methodology\n\n"
        "The design is a mixed-methods case study in two parallel EAP047 groups. Each student will submit three "
        "drafts per genre. Peer reviewers will complete a structured form covering thesis clarity, paragraph roles, "
        "and lexical precision. Semi-structured interviews (n=12) will explore student perceptions.\n\n"
        "Findings and Discussion\n\n"
        "It is anticipated that students who receive specific peer comments will increase cohesive linker use and "
        "reduce under-length submissions. Nevertheless, workload constraints may limit the depth of feedback in "
        "weeks with multiple assignments. The discussion will relate patterns to EAP teaching implications.\n\n"
        "Conclusion\n\n"
        "The study should clarify whether a low-cost peer feedback protocol improves EAP essay structure before "
        "summative deadlines. Recommendations will inform next year's writing support timetable."
    )
    wc = word_count(full)
    return {
        "moduleId": module_id,
        "essayType": None,
        "title": title_en,
        "titleZh": title_zh,
        "sample": {"fullText": full, "wordCount": wc},
        "analysis": {
            "task": {
                "summaryEn": "The sample fulfils the genre purpose with academic objectivity.",
                "comments": ["Research gap stated; aims implied through methodology."],
            },
            "organization": {
                "sections": [
                    {"role": "abstract", "guideEn": "Concise overview of purpose, method, and expected contribution."},
                    {"role": "introduction", "guideEn": "Context + rationale for the study."},
                    {"role": "literature", "guideEn": "Brief critical summary of prior work."},
                    {"role": "methodology", "guideEn": "Design, participants, instruments."},
                    {"role": "discussion", "guideEn": "Expected patterns linked to pedagogy."},
                    {"role": "conclusion", "guideEn": "Contribution and recommendations."},
                ],
                "comments": ["Section breaks use clear academic headings."],
            },
            "vocabulary": {
                "highlights": [
                    {"phrase": "mixed-methods case study", "noteEn": "Standard research design collocation."},
                    {"phrase": "it is anticipated that", "noteEn": "Hedging for projected findings."},
                ],
                "comments": ["Formal nouns: intervention, descriptors, moderation."],
            },
            "grammar": {
                "highlights": [
                    {"pattern": "passive reporting (will be collected)", "noteEn": "Typical research report voice."},
                ],
                "comments": ["Complex noun phrases maintain formal tone."],
            },
        },
        "practice": {
            "promptEn": (
                f"Write a {module_id.replace('_', ' ').lower()} (800–1200 words) proposing a small study "
                "on how first-year students use AI tools when drafting academic essays. "
                "Include abstract, introduction, brief literature context, methodology, expected outcomes, and conclusion."
            ),
            "promptZh": "撰写一份 800–1200 词的研究文本，提议一项关于一年级学生如何用 AI 起草学术论文的小型研究。",
            "relatedTopicEn": "AI tools and first-year academic writing",
        },
    }


def _normalize_content(raw: dict[str, Any], module_id: str, essay_type: str | None) -> dict[str, Any]:
    limits = _word_limits(module_id)
    sample = raw.get("sample") or {}
    full_text = str(sample.get("fullText") or "").strip()
    wc = int(sample.get("wordCount") or word_count(full_text))
    practice = raw.get("practice") or {}
    analysis = raw.get("analysis") or {}

    out: dict[str, Any] = {
        "moduleId": module_id,
        "essayType": essay_type,
        "title": str(raw.get("title") or "EAP Writing").strip(),
        "titleZh": str(raw.get("titleZh") or "").strip(),
        **limits,
        "sample": {"fullText": full_text, "wordCount": wc},
        "analysis": {
            "task": analysis.get("task") or {"summaryEn": "", "comments": []},
            "organization": analysis.get("organization") or {"sections": [], "comments": []},
            "vocabulary": analysis.get("vocabulary") or {"highlights": [], "comments": []},
            "grammar": analysis.get("grammar") or {"highlights": [], "comments": []},
        },
        "practice": {
            "promptEn": str(practice.get("promptEn") or "").strip(),
            "promptZh": str(practice.get("promptZh") or "").strip(),
            "relatedTopicEn": str(practice.get("relatedTopicEn") or "").strip(),
        },
    }
    return out


def generate_session(module_id: str, essay_type: str | None, class_name: str = "EAP047") -> dict[str, Any]:
    module_id = str(module_id or "").upper()
    if module_id not in VALID_MODULES:
        raise ValueError(f"moduleId must be one of {sorted(VALID_MODULES)}")

    et = None
    if module_id == "ESSAY":
        et = str(essay_type or "DISCUSSIVE").upper()
        if et not in VALID_ESSAY_TYPES:
            raise ValueError("essayType must be DISCUSSIVE or ARGUMENTATIVE")
    elif essay_type:
        et = None

    if not writing_ai_available():
        base = _fallback_essay(et or "DISCUSSIVE") if module_id == "ESSAY" else _fallback_long(module_id)
        return _normalize_content(base, module_id, et)

    if module_id == "ESSAY":
        system = _essay_system(et or "DISCUSSIVE")
        user = f"Class: {class_name}. Essay type: {et}. Fresh topic — avoid repeating common IELTS clichés."
        raw = _ai_json(system, user, max_tokens=5500)
    else:
        system = _long_system(module_id)
        user = f"Class: {class_name}. Module: {module_id}. Fresh academic topic suitable for foundation EAP."
        raw = _ai_json(system, user, max_tokens=9000)

    content = _normalize_content(raw, module_id, et)
    if not content["sample"]["fullText"] or not content["practice"]["promptEn"]:
        base = _fallback_essay(et or "DISCUSSIVE") if module_id == "ESSAY" else _fallback_long(module_id)
        content = _normalize_content(base, module_id, et)
    return content


def _word_count_penalty(wc: int, word_min: int, word_max: int) -> tuple[float, list[str]]:
    delta = 0.0
    notes: list[str] = []
    if wc < word_min:
        delta -= 1.0
        notes.append(f"Under length ({wc} words; required {word_min}–{word_max}). Task Response penalised.")
    elif wc > word_max:
        delta -= 0.8
        notes.append(f"Over length ({wc} words; required {word_min}–{word_max}). Stay within the EAP word limit.")
    else:
        notes.append(f"Word count within range ({wc} words; target {word_min}–{word_max}).")
    return delta, notes


def generate_feedback(
    draft: str,
    session_content: dict[str, Any],
    revision: int,
) -> dict[str, Any]:
    wc = word_count(draft)
    word_min = int(session_content.get("wordMin") or ESSAY_WORD_MIN)
    word_max = int(session_content.get("wordMax") or ESSAY_WORD_MAX)
    tr_delta, wc_notes = _word_count_penalty(wc, word_min, word_max)

    if not writing_ai_available():
        return _fallback_feedback(draft, session_content, revision, wc, wc_notes, tr_delta)

    module_id = session_content.get("moduleId") or "ESSAY"
    practice = session_content.get("practice") or {}
    system = (
        "You are an EAP writing examiner. Score the student draft using IELTS Writing band descriptors "
        "(Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy) "
        "but apply EAP university standards: strict paragraph/section roles, formal register, thesis discipline. "
        "Return ONLY valid JSON: overallBandEstimate (number), criteria[] "
        "{id: TR|CC|LR|GRA, labelEn, labelZh, estimatedBand, comments[]}, "
        "strengths[], priorities[], actionableRevisions[], paragraphFeedback[] "
        "{paragraphIndex, commentEn}."
    )
    user = (
        f"Module: {module_id}\nEssay type: {session_content.get('essayType')}\n"
        f"Practice prompt: {practice.get('promptEn')}\n"
        f"Word range: {word_min}–{word_max}\nStudent word count: {wc}\nRevision: {revision}\n\n"
        f"Draft:\n{draft[:14000]}"
    )
    try:
        data = _ai_json(system, user, max_tokens=3500)
    except Exception:
        return _fallback_feedback(draft, session_content, revision, wc, wc_notes, tr_delta)

    criteria = data.get("criteria") or []
    for c in criteria:
        if c.get("id") == "TR" and wc_notes:
            c["comments"] = wc_notes + list(c.get("comments") or [])
            if tr_delta and c.get("estimatedBand") is not None:
                c["estimatedBand"] = round(max(4.0, min(8.5, float(c["estimatedBand"]) + tr_delta)), 1)

    bands = [float(c.get("estimatedBand") or 5.5) for c in criteria if c.get("estimatedBand") is not None]
    overall = float(data.get("overallBandEstimate") or (sum(bands) / len(bands) if bands else 5.5))

    return {
        "wordCount": wc,
        "wordMin": word_min,
        "wordMax": word_max,
        "overallBandEstimate": round(overall, 1),
        "disclaimerEn": "AI practice estimate — not an official IELTS score.",
        "disclaimerZh": "AI 练习估分 — 非官方雅思成绩。",
        "criteria": criteria,
        "strengths": data.get("strengths") or [],
        "priorities": data.get("priorities") or [],
        "actionableRevisions": data.get("actionableRevisions") or [],
        "paragraphFeedback": data.get("paragraphFeedback") or [],
        "revisionNumber": revision,
        "source": "ai",
    }


def _estimate_band(base: float, delta: float) -> float:
    return round(max(4.0, min(8.5, base + delta)), 1)


def _count_paragraphs(text: str) -> int:
    parts = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    return max(1, len(parts))


def _has_connectors(text: str) -> bool:
    low = (text or "").lower()
    markers = ("however", "therefore", "for example", "in addition", "furthermore", "although", "whereas")
    return any(m in low for m in markers)


def _fallback_feedback(
    draft: str,
    session_content: dict[str, Any],
    revision: int,
    wc: int,
    wc_notes: list[str],
    tr_delta: float,
) -> dict[str, Any]:
    paras = _count_paragraphs(draft)
    connectors = _has_connectors(draft)
    module_id = session_content.get("moduleId") or "ESSAY"

    cc_delta = 0.5 if paras >= 4 else -0.5
    lr_delta = 0.3 if len(draft) > 200 else -0.2
    gra_delta = 0.2

    criteria = [
        {
            "id": "TR",
            "labelEn": "Task Response",
            "labelZh": "任务回应",
            "estimatedBand": _estimate_band(5.5, tr_delta),
            "comments": wc_notes + ["Address every part of the practice prompt explicitly."],
        },
        {
            "id": "CC",
            "labelEn": "Coherence & Cohesion",
            "labelZh": "连贯与衔接",
            "estimatedBand": _estimate_band(5.5, cc_delta),
            "comments": [
                "Four clear paragraphs expected for essays."
                if module_id == "ESSAY"
                else "Use section-level topic sentences.",
                "Good cohesive devices." if connectors else "Add linking phrases between ideas.",
            ],
        },
        {
            "id": "LR",
            "labelEn": "Lexical Resource",
            "labelZh": "词汇资源",
            "estimatedBand": _estimate_band(5.5, lr_delta),
            "comments": ["Maintain formal academic register; avoid informal phrasing."],
        },
        {
            "id": "GRA",
            "labelEn": "Grammatical Range & Accuracy",
            "labelZh": "语法多样性与准确性",
            "estimatedBand": _estimate_band(5.5, gra_delta),
            "comments": ["Check complex sentences and article use."],
        },
    ]
    bands = [c["estimatedBand"] for c in criteria]
    return {
        "wordCount": wc,
        "wordMin": session_content.get("wordMin"),
        "wordMax": session_content.get("wordMax"),
        "overallBandEstimate": round(sum(bands) / len(bands), 1),
        "disclaimerEn": "Practice estimate only — not an official IELTS score.",
        "disclaimerZh": "仅为练习估分 — 非官方雅思成绩。",
        "criteria": criteria,
        "strengths": ["Draft submitted for review."],
        "priorities": ["Refine thesis statement to match EAP formula."],
        "actionableRevisions": ["Add one more cohesive linker in body paragraph 2."],
        "paragraphFeedback": [],
        "revisionNumber": revision,
        "source": "rules",
    }
