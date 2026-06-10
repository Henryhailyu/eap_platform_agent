# VISION — Manager centre organisation & Module/Group architecture

**Status:** Phase **A** (Hub UI) in progress · Phases **B–E** locked requirements (2026-06-10)  
**Related:** `admin.html` · `EAP_PROJECT_TRACKER.md`

---

## Phase A — Hub navigation (UI only)

**Goal:** Replace one long scroll of ~14 panels with **5 hub cards**; self-study uses a **left vertical menu**.  
**Constraint:** **No changes** to forms, tables, APIs, or `admin-self-study-*.js` business logic.

| Hub card | Contains (existing panels) |
|----------|----------------------------|
| **School & accounts** | Academic calendar, Classes, Teachers, Students |
| **Self-study centre** | Materials, Vocabulary, Reading, Listening, Writing, Speaking, AI coach instructions |
| **Teaching & lessons** | Teaching page AI templates |
| **Homework AI** | Homework AI marking (+ analytics) |

URLs: `admin.html` (hub) · `?module=school|self-study|teaching|homework` · `?module=self-study&skill=vocabulary|…`

---

## Locked decisions — Module / Group (Phases B–E)

| Topic | Decision |
|-------|----------|
| **Group naming** | **Globally unique** — e.g. `EAP039-G12` |
| **Teacher跨 Module** | **Allowed** — e.g. EAP039 Groups 1–4 **and** EAP047 Group 10 |
| **分工表** | **AI free-parse** any Word / TXT / PDF / Excel layout → preview → confirm → save |
| **反馈滞后预警** | **3 days** default (submitted, no teacher feedback) |
| **Seed migration** | Existing `EAP047` class → **Module=EAP047, Group=1** |

### Hierarchy

```
Academic year
  └── Module (level code, renameable yearly — e.g. EAP039 … EAP049)
        └── Group (1…N per module; global id EAP039-G12)
              └── Students, assignments, self-study push, teacher ownership
```

- **Module** = proficiency band (039 weakest → 049 strongest). Manager edits names each year (e.g. EAP039 → EAP011).
- **Group** = teaching group within a module (e.g. EAP039 Groups 1–58). Manager sets range or list per year.
- **UI:** After manager defines modules/groups, all targeting uses **dropdowns** (no free-text class codes).

### Teacher assignment

- Manual: teacher ↔ module ↔ group range/list.
- Upload: roster / assignment spreadsheet → AI extract → manager confirms.
- Manager sees which teacher covers which groups and workload signals.

### Manager supervision (Phase E)

| Signal | Behaviour |
|--------|-----------|
| Submissions without feedback **≥ 3 days** | Alert list (teacher, group, task) |
| Assigned homework, **low completion** | Group completion dashboard |
| Communication | **AI summary report** downloadable (manager ↔ teacher ↔ student context) |

---

## Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| **A** | Hub + self-study left nav; zero functional change | In progress |
| **B** | DB: `academic_year`, `modules`, `module_groups`; manager CRUD; dropdowns | Planned |
| **C** | Student/teacher ↔ group; assignment upload + AI parse | Planned |
| **D** | Push materials / AI prompts by module+group; teacher scoped views | Planned |
| **E** | Supervision dashboard + AI reports + 3-day feedback SLA | Planned |

**Dependency:** A → B → C → D → E

---

## Migration note

On Phase B deploy:

- Map legacy `class_name = 'EAP047'` → `module_code = EAP047`, `group_code = G1` / `EAP047-G1`.
- Keep backward-compatible reads until all UIs use module/group pickers.
