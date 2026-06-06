# Self-Study — Writing module

**Parent:** [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

---

## Goal

AI assigns academic writing tasks by **genre**, guides **paragraph-level** planning before writing, then scores and coaches using **IELTS Writing four criteria**.

**Source:** **AI only** (Channel B).  
**Calendar homework:** **fully independent** from teacher calendar tasks.  
**Levelling:** none by placement.  
**Daily push / Streak:** **none** — student completes **autonomously**.

---

## Supported genres (MVP pool)

### IELTS-aligned (no Task 1 charts)

| ID | Name | Structure | Min words |
|----|------|-----------|-----------|
| `IELTS_T2_ESSAY` | Argument / opinion essay | Intro → body ×2–3 → conclusion | 250 |

**Excluded:** `IELTS_T1_ACADEMIC` chart/graph description (per product decision).

### University genres (weekly rotation)

| ID | Name | Paragraph / section guide |
|----|------|---------------------------|
| `ESSAY_ARGUMENT` | Academic essay | Intro → PEEL bodies → conclusion |
| `SUMMARY` | Summary | Gist → key points → implication |
| `PROPOSAL` | Research / project proposal | Background → aims → method → timeline → outcomes |

**Extended (later):** `LIT_REVIEW` `CASE_STUDY` `IMRAD` `REFLECTIVE` `ESSAY_CRITIQUE` `REPORT_SHORT`

Class prompts (EAP047 vs EAP039) tune topic difficulty and genre mix — not per-student placement.

---

## Weekly genre rotation (suggested schedule)

| Weekday | Default genre |
|---------|----------------|
| Monday | `ESSAY_ARGUMENT` / `IELTS_T2_ESSAY` |
| Wednesday | `SUMMARY` |
| Friday | `PROPOSAL` |

Other days: no assigned genre — student may pick from backlog or skip. **No 19:00 reminder.**

---

## AI task generation

```
Manager class config + writing prompt
  → AI generates WritingTask:
       genre_id, title, prompt, word_limit_min, context_materials?, time_suggestion
  → export for manager review
  → Manager push (manager only)
```

---

## Pre-writing coach (before draft)

For assigned `genre_id`, AI returns:

1. **Task decode** — question parts, keywords  
2. **Outline** — number and role of paragraphs/sections  
3. **Per-paragraph guide** — what to include, useful patterns, pitfalls  
4. **Pre-submit checklist** — word count, thesis, cohesion, register  

Templates bound to genre (not generic essay advice only).

---

## Student submission

| Mode | Handling |
|------|----------|
| **Online editor** | Rich or plain text + live word count |
| **Upload** | Word / PDF / TXT → extract body text |

---

## AI feedback — IELTS four criteria

Map all genres to:

| Criterion | Task 2 / essay label |
|-----------|----------------------|
| ① | **Task Response** (Task 1 would be Task Achievement — not used for chart tasks) |
| ② | **Coherence & Cohesion** |
| ③ | **Lexical Resource** |
| ④ | **Grammatical Range & Accuracy** |

### Output structure

```
overall_band_estimate (practice only — disclaimer)
criteria[]: { id, estimated_band, comments[] }
paragraph_feedback[]
strengths[]
priorities[]
actionable_revisions[]  (sentence-level where possible)
```

Rules aligned with [IELTS Writing band descriptors (May 2023)](https://ielts.org/news-and-insights/ielts-writing-band-descriptors-and-key-assessment-criteria):

- Full connected text expected (bullet-only submission flagged)  
- Under word limit penalised in feedback  
- Plagiarism warning (future detection)  

---

## Revisions

- After first submission: **1–2 additional drafts** allowed  
- Each resubmit: new rubric feedback; show progress vs previous attempt  

---

## Student flow

```
Open writing hub → choose / see rotated genre task
  → Pre-writing coach (per paragraph)
  → Draft online or upload
  → Submit → IELTS rubric feedback
  → [Optional] Revise 1–2 times → resubmit
```

No App push schedule. Progress tracking optional (tasks completed count), not daily Streak.

---

## Entities (conceptual)

`WritingGenre` · `WritingTask` · `WritingPreCoach` · `WritingSubmission` · `WritingFeedback` · `WritingRevision`

---

## UAT

- Monday essay task with paragraph coach  
- Submit 250+ words → four criteria populated  
- Upload DOCX → same feedback path  
- Second revision shows delta comments  
- No linkage to calendar `Homework` task type
