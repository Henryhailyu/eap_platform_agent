# Teacher-side roadmap (execution order)

**Updated:** 2026-06-03  
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

## Recently done

| ID | Task |
|----|------|
| **LP-M3** | PPT/PPTX/XLSX ingest, bilingual HTML hints, copy last pack | LP-M2 |
| **HM-M1a** | Manager homework marking profiles + descriptor upload | — |
| **HM-M1b** | Teacher AI Report panel + approve → feedback | HM-M1a |
| **Phase A** | Student calendar → published teaching page link | LP-M2 |
| **LP-M2** | Plan → HTML → preview → publish to calendar + teaching page | [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md) |
| **LT-M2** | Segment filter on Poll/Quiz; 5 phase-1 games; `#eap-lesson-meta` sync | [`VISION_LIVE_INTERACTIONS.md`](VISION_LIVE_INTERACTIONS.md) |
| **LT-M1** | Live Poll/Quiz: AI slots + manual; Games suggestions | [`VISION_LIVE_INTERACTIONS.md`](VISION_LIVE_INTERACTIONS.md) |
| **LP-M1** | Lesson prep pack API + AI plan JSON + wizard UI |
| **LP-M1b** | Rename **AI-aided lesson prep**, default **collapsed** accordion |
| **Live timer** | Teacher push + student sync + 3s bell (`cc576b7`) | — |

---

## In progress (this sprint)

| ID | Task | Doc |
|----|------|-----|
| **EAP047-R** | **联合彩排** — lesson → student page → Live (incl. timer push) → homework → AI report | [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md) |

---

## Planned (teacher-facing)

| ID | Task | Depends on |
|----|------|------------|
| **LP-M3+** | Further LP-M3 polish (xls, richer Excel tables in HTML) | LP-M3 |
| **LP-M4** | Real-time class sync (Phase B, ~35 students) | LP-M2+ |
| **HM-M2+** | Richer reports, regenerate, analytics | HM-M1b ✅ |

---

---

## Deferred

- Live streaming / TRTC  
- WeChat teacher client (web only)  

---

## After teacher LP-M2 UAT

1. ~~Student端 — teaching page on calendar task~~ ✅ Phase A  
2. ~~Manager端 — HM-M1a marking profiles~~ ✅  
3. ~~HM-M1b on teacher submissions~~ ✅  

**Next:** Complete **EAP047-R** checklist → then **LP-M4** (real-time sync) unless rehearsal logs blockers.

---

*Current sprint: **EAP047-R rehearsal** (active) → **LP-M4** when signed off.*
