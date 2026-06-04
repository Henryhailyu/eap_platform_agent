# Vision — AI lesson preparation & interactive HTML (Writing pilot)

**Status:** Approved for implementation (Step 0 locked 2026-06-01)  
**Owner:** Hai Lyu  
**Pilot class:** `EAP047`  
**Pilot category:** Writing  

---

## 1. Goal

Teachers upload **multiple** teaching files (Word, TXT, Excel, PDF, PPT, later video/audio as attachments). They choose **class duration** and **teaching style**. AI:

1. Reads extracted content from selected files  
2. Produces a **structured lesson plan** (timed segments, activities)  
3. Generates an **interactive HTML page** (not a raw file viewer) for in-class use  
4. Publishes to students via existing calendar / teaching-page flow  

**Default AI language:** English. Optional **bilingual hints** when style is `Support-heavy (bilingual hints)` or student support profile is enabled.

---

## 2. Locked product decisions (Step 0)

| # | Decision | Value |
|---|----------|--------|
| 1 | Pilot lesson type | **Writing** |
| 2 | Default class duration | **100 minutes** (teacher can pick other presets in UI) |
| 3 | Teaching style options | `Interactive`, `Lecture-led`, `Exam drill`, `Flipped`, `Support-heavy (bilingual hints)`, `Student-centered` |
| 4 | HTML interaction | **Phase A:** in-page only (buttons, collapsible sections, fill-in blanks). **Phase B:** real-time sync for ~35 students (WebSocket / room per class session) — required long-term, not blocking M1 |
| 5 | Pilot class | **EAP047** only for first UAT |

---

## 3. Teacher workflow (target UX)

```text
New lesson prep (Writing)
  → Basic info (class EAP047, date, title, duration=100m, style=…)
  → Upload multiple files; tick “Use in AI planning” per file
  → Optional: learning objectives, IELTS band target (e.g. 5.5 support)
  → AI: lesson plan preview (JSON: segments, timing, activities)
  → Teacher edit / approve plan
  → AI: generate interactive HTML from approved plan + materials summary
  → Preview HTML → Publish → link calendar task + student teaching page
```

---

## 4. File handling

| Format | M1 | Later |
|--------|----|-------|
| TXT | Extract text | — |
| PDF | Extract text | OCR for scans |
| Word (.docx) | Extract text | — |
| PPT | Convert → PDF → text (reuse LibreOffice path from display library) | Slide thumbnails in HTML |
| Excel | Sheet names + table summary for AI | Structured vocab tables in HTML |
| Video / audio | Attachment only (no AI ingest) | ASR transcript optional |

**Lesson pack** entity: one prep session, many `pack_files` rows with `use_in_ai`, `extract_status`, `extracted_text`.

---

## 5. AI pipeline (two calls)

### Call 1 — Lesson plan

**Input:** extracted texts (capped per token budget), task meta, duration=100, style enum, Writing manager template prompt.

**Output JSON (example keys):**

- `segments[]`: `{ title, minutes, teacher_action, student_action, materials_ref }`
- `objectives[]`, `homework_sketch`, `interaction_slots[]` (for HTML phase)

### Call 2 — Interactive HTML

**Input:** approved plan JSON + manager HTML shell template for `writing` + style flags (bilingual hints on/off).

**Output:** sanitized HTML string stored in `teacher_teaching_pages` (extend existing K3–K5 tables).

**Safety:** no arbitrary script tags from model; allowlist components (details/summary, buttons, inputs, data attributes for Phase B hooks).

---

## 6. Interactive HTML — phases

### Phase A (M1–M2) — In-page

- Collapsible sections per lesson segment  
- “Reveal answer / model sentence” buttons  
- Short text inputs (local only, no server save) or optional “copy answer” for discussion  
- Timer hints aligned to 100-minute plan  

### Phase B (M3+) — Real-time sync (35 students)

- One **session room** per published page + class + date  
- WebSocket (or Tencent-compatible pub/sub if adopted later)  
- Teacher pushes “show segment 2”, poll votes, aggregate word cloud — **spec detail TBD in M3**  
- Lighthouse: may need second process or Redis; flag in deploy doc when purchased  

---

## 7. Manager configuration

Extend admin (like `teaching_page_templates` + `self_study_ai_prompts`):

| Item | Purpose |
|------|---------|
| `writing` HTML template shell | Layout + allowed widgets |
| System prompt for plan + HTML | Writing-specific, IELTS-aware |
| Duration presets | Default **100**; also 45, 60, 90 optional |
| Style enum labels | i18n EN/ZH |

Separate track: **AI homework marking reports** — see [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md) (Manager-led, teacher review).

---

## 8. Tencent Cloud usage

| Product | When | Purpose |
|---------|------|---------|
| **混元 API** | **Now (pilot)** | Lesson plan + HTML generation |
| **Lighthouse** | Already | App host |
| **COS** | When pack files routinely >500MB or disk tight | Storage |
| **ADP** | If PDF/PPT/Excel extraction quality insufficient | Document parse |
| **CDN** | If student HTML load slow nationally | Static delivery |
| **Not used** | — | Live streaming / TRTC |

---

## 9. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **LP-M1** | DB pack + multi-upload API; TXT/PDF/DOCX extract; teacher wizard (duration/style); Hunyuan via `eap_ai`; plan JSON |
| **LP-M2** | HTML gen + preview + publish to EAP047; student viewer |
| **LP-M3** | PPT/Excel; bilingual hint layer; copy last week |
| **LP-M4** | Real-time sync (Phase B) — reveal + segment focus via long-poll ✅ |
| **LP-M3+** | Excel table-friendly extract + HTML `<table>` generation hints ✅ |
| **LP-M3++** | Server embeds `eap-excel-table` HTML from Excel uploads into AI materials ✅ |
| **HM-M1** | Homework marking scripts (parallel track) |

---

## 10. API sketch (for developers)

- `POST /api/teacher/lesson-prep/packs` — create pack  
- `POST /api/teacher/lesson-prep/packs/<id>/files` — multipart upload  
- `POST /api/teacher/lesson-prep/packs/<id>/plan` — run AI plan  
- `PUT /api/teacher/lesson-prep/packs/<id>/plan` — teacher edits plan JSON  
- `POST /api/teacher/lesson-prep/packs/<id>/html` — generate HTML  
- `POST /api/teacher/lesson-prep/packs/<id>/publish` — link task + teaching page  

All scoped to teacher membership for `EAP047` in pilot.

---

## 11. Related docs

- [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md) — original K-phase intent  
- [`VISION_AI_HOMEWORK_MARKING.md`](VISION_AI_HOMEWORK_MARKING.md) — HM track (AI homework reports)  
- [`ROADMAP_TEACHER_PHASES.md`](ROADMAP_TEACHER_PHASES.md) — teacher execution order  
- [`FILE_UPLOAD_CONTRACT.md`](FILE_UPLOAD_CONTRACT.md) — extend for pack uploads  
- [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md) — AI keys  

---

*Done on `main`: **LP-M1** (plan JSON + wizard), **LP-M2** (plan → HTML → calendar publish + `#eap-lesson-meta`). UAT: `teacher1` + `EAP047`. AI: Token Plan `hy3-preview`.*
