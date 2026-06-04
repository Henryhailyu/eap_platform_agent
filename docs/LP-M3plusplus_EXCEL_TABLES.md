# LP-M3++ — Excel tables embedded in lesson HTML

**Status:** Implemented (2026-06-04)  
**Builds on:** LP-M3+ pipe-row extract  

---

## Behaviour

1. Teacher uploads `.xlsx` / `.xls` in **AI Lesson Builder**.
2. Server extracts sheet text with `[TABLE]` + `| col | col |` rows.
3. `excel_table_text_to_html()` builds **ready HTML** `<table class="eap-excel-table">` with inline styles.
4. That HTML is appended to AI **materials** so the model **embeds** tables in the lesson (not only TSV in prose).

---

## UAT (EAP047)

| Step | Pass |
|------|------|
| Upload Excel with clear header row + 3+ data rows | ☐ |
| Generate plan → HTML | ☐ |
| Preview shows **bordered tables** (not only tab-separated text) | ☐ |
| Publish → student teaching page tables readable on mobile | ☐ |

---

*Related: [`VISION_LESSON_PREP.md`](VISION_LESSON_PREP.md)*
