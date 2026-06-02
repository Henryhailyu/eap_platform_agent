# Teacher-side roadmap (execution order)

**Updated:** 2026-06-02  
**Pilot class:** `EAP047` · **Pilot skill:** Writing  

---

## Completed (maintain)

| Area | Notes |
|------|--------|
| Calendar hub, tasks, bilingual, homework submit/feedback | `teacher.html` |
| Recorded lessons | `teacher-recorded.html` |
| Live teaching + classroom display | `teacher-live.html` |
| AI Lesson Builder (K3) | `teacher-lesson-ai.html` — single-step HTML; source file upload |
| AI connectivity | Token Plan `hy3-preview` on Lighthouse |

---

## In progress

| ID | Task | Doc |
|----|------|-----|
| **LP-M1** | Lesson prep **pack** + multi-file + duration/style + **AI lesson plan JSON** | [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md) |

---

## Planned (teacher-facing)

| ID | Task | Depends on |
|----|------|------------|
| **LP-M2** | Plan → interactive HTML → publish (calendar + teaching page) | LP-M1 |
| **LP-M3** | PPT/Excel ingest, bilingual hints, copy last week | LP-M2 |
| **LP-M4** | Real-time class sync (Phase B, ~35 students) | LP-M2+ |
| **HM-M1b** | Teacher **AI homework report** panel + approve → feedback | HM-M1a (Manager) |
| **HM-M2+** | Richer reports, regenerate, analytics | HM-M1b |

---

## Manager-first (blocks teacher HM UI)

| ID | Task | Doc |
|----|------|-----|
| **HM-M1a** | Marking **profiles**, **descriptor** uploads, prompts | [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md) |

---

## Deferred

- Live streaming / TRTC  
- WeChat teacher client (web only)  

---

## After teacher LP-M2 UAT

1. Student端 — teaching page viewer, homework loop polish  
2. Manager端 — templates, HM-M1a, academic calendar  
3. HM-M1b on teacher submissions  

---

*Current sprint: **LP-M1** (backend + wizard UI).*
