# Teacher-side roadmap (execution order)

**Updated:** 2026-06-04  
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
| **LP-M4** | Real-time lesson HTML sync (reveal + segment focus) | [`LP-M4_LESSON_HTML_SYNC.md`](LP-M4_LESSON_HTML_SYNC.md) |
| **EAP047-R** | Full pilot rehearsal + §6 phone + §7 sign-off | [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md) |

---

## Recently shipped (2026-06-04 batch)

| ID | Task | Doc |
|----|------|-----|
| **HM-M2** | Regenerate + diff + `criteria_issues` | [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md) |
| **HM-M3** | Profile `class_name` + manager analytics panel | same |
| **LP-M3+** | Excel `.xls`/`.xlsx` table extract + HTML table prompt | [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md) |
| **WEB_LAUNCH ops** | [`WEB_LAUNCH_OPS_RUNBOOK.md`](WEB_LAUNCH_OPS_RUNBOOK.md) + `backup_lighthouse_data.sh` | — |

---

## Recently shipped (LP-M3++)

| ID | Task | Doc |
|----|------|-----|
| **LP-M3++** | Server-side Excel → `eap-excel-table` embed | [`LP-M3plusplus_EXCEL_TABLES.md`](LP-M3plusplus_EXCEL_TABLES.md) |

---

## In progress (next — step by step)

| ID | Task | Doc |
|----|------|-----|
| **HM-M4** | Manager marking dashboard: charts, CSV export, class filter | [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md) |
| **PILOT-HANDOUT** | 教师一页纸（Lighthouse URL、登录、Live/作业流程，可打印） | [`PILOT_HANDOUT.md`](PILOT_HANDOUT.md) |

---

## Deferred (after student-side refinement)

| ID | Task | Notes |
|----|------|-------|
| **WEB-J** | Privacy page, monitoring, custom domain | Not before student UX polish |

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

**Next:** Batch UAT on Lighthouse after deploy; run [`WEB_LAUNCH_OPS_RUNBOOK.md`](WEB_LAUNCH_OPS_RUNBOOK.md) on server.

---

*EAP047-R + LP-M4 signed off. Latest batch: HM-M2, HM-M3, LP-M3+, ops runbook.*
