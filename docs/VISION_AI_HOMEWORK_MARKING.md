# Vision — AI homework marking reports (HM track)

**Status:** Approved for implementation (recorded 2026-06-02)  
**Owner:** Hai Lyu  
**Pilot:** Class `EAP047`, category **Writing** (align with lesson prep pilot)  
**Report language:** **English only** (AI draft); teacher may edit before release  

---

## 1. Goal

When a student submits homework, the platform prepares an **English AI Report** for the teacher in the **same place they already review submissions**. The report is **detailed**: what is wrong, why it matters against the marking standard, and **actionable revision advice**. Teachers **review and approve** (or edit) before students see final feedback.

**Manager leads configuration; teachers consume reports.**

---

## 2. Roles

| Role | Responsibility |
|------|----------------|
| **Manager** | Global AI instructions (report structure, tone, depth); per–task-type **report profiles**; upload **marking descriptors** (multi-format); enable/disable auto-generation; optional rubric dimensions |
| **Teacher** | Open submission → read **AI Report**; regenerate if needed; edit → publish as official **teacher feedback** (existing submission flow) |
| **Student** | Sees **teacher-approved** feedback only — not raw AI report unless product later allows it |

---

## 3. Manager configuration (HM-M1a)

### 3.1 Report profile (per homework type / template)

- **Profile key** (e.g. `writing_weekly`, `writing_task2`)
- **System prompt** — defines sections, e.g.:
  - Executive summary
  - Strengths
  - Issues by criterion (task response, coherence, vocabulary, grammar, …)
  - Quoted excerpts from student work with comments
  - Actionable revisions (rewrite suggestions, checklists)
  - Optional suggested band / level (informational only until teacher confirms)
- **Output language:** English (locked for pilot)
- **Link to calendar task category** or template (optional)

### 3.2 Marking descriptor library

- Manager uploads **one or more** reference files per profile or shared pool:
  - **Formats (M1):** PDF, DOCX, TXT  
  - **Later:** PPT, Excel if needed
- Server **extracts text** (reuse teaching-source / lesson-prep extraction pipeline)
- Versioning: `updated_at`, optional label; AI uses **active** descriptor set for that profile

### 3.3 Trigger policy

| Mode | Behaviour |
|------|-----------|
| **Recommended** | On successful student submission → queue background job → store draft `ai_report` |
| **Fallback** | Teacher opens submission with no report → on-demand generate |

### 3.4 Safety & compliance

- No API keys in DB; prompts only  
- Reports stored as draft until teacher publishes  
- Log generation errors; teacher sees safe message (reuse `format_ai_error`)

---

## 4. Teacher experience (HM-M1b)

- **Entry:** Existing homework review UI (calendar task → submissions list → one submission)
- **Panel:** `AI Report` (English), status: `pending` | `ready` | `failed`
- **Actions:**
  - View full report
  - **Regenerate** (optional, rate-limited)
  - **Copy section → feedback** or **Approve draft → feedback** (writes existing `teacher_feedback` fields)
- **Rule (recommended):** Student-visible feedback requires teacher **explicit approve** or manual edit (no silent auto-publish)

---

## 5. Data model (sketch)

| Table | Purpose |
|-------|---------|
| `homework_marking_profiles` | Manager-defined report templates + system prompt |
| `homework_marking_descriptors` | Uploaded files + extracted text + profile link |
| `submission_ai_reports` | `submission_id`, `status`, `report_json` or `report_markdown`, `provider`, `model`, `created_at`, `approved_at`, `teacher_username` |

Reuse `submissions` + `submission_attachments` for student work text/files.

---

## 6. AI pipeline

**Input (capped by token budget):**

1. Manager **system prompt** for profile  
2. Concatenated **marking descriptor** text  
3. Student **submission text** + extracted attachment text  
4. Task metadata (title, description, class, category Writing)

**Output:**

- Structured JSON preferred (sections as keys) **or** Markdown stored server-side  
- English only  

**Provider:** Same as lesson prep — `eap_ai` (Tencent Token Plan / Hunyuan-compatible).

---

## 7. API sketch

**Manager**

- `GET/POST/PUT /api/admin/homework-marking/profiles`  
- `POST /api/admin/homework-marking/profiles/<id>/descriptors` (multipart)  
- `DELETE /api/admin/homework-marking/descriptors/<id>`  

**Teacher**

- `GET /api/teacher/submissions/<id>/ai-report`  
- `POST /api/teacher/submissions/<id>/ai-report/generate` (on-demand)  
- `PUT /api/teacher/submissions/<id>/ai-report/approve` → copies into feedback  

**Internal / worker**

- Hook on `POST` student submission success → enqueue report job  

---

## 8. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **HM-M1a** | Manager: profiles + descriptor upload + extract; default Writing profile seed |
| **HM-M1b** | Teacher: AI Report panel + approve-to-feedback; async generate on submit |
| **HM-M2** | Richer report schema (criterion tags, excerpt anchors); regenerate + diff ✅ |
| **HM-M3** | Profile `class_name` + manager analytics (accept rate, regenerate count) ✅ |
| **HM-M4** | Manager dashboard: class/period filters, bar charts, CSV export ✅ |

**Dependency:** Manager profiles/descriptors before teacher UI is useful. Can run **after LP-M2 teacher UAT** or in parallel once HM-M1a is done.

---

## 9. Related docs

- [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md) — lesson prep LP-M1–M4  
- [`ROADMAP_TEACHER_PHASES.md`](ROADMAP_TEACHER_PHASES.md) — teacher-side order  
- [`FILE_UPLOAD_CONTRACT.md`](FILE_UPLOAD_CONTRACT.md) — extend for descriptor uploads  
- [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md) — AI keys  

---

*Next engineering action: complete **LP-M1** lesson prep; schedule **HM-M1a** (Manager) then **HM-M1b** (Teacher) per roadmap.*
