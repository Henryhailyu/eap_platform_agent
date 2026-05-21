# Vision — AI, materials, and HTML teaching pages (Phase K)

**Status:** **Documented, not implemented.**  
**Owner:** Hai Lyu — will supply detailed specification later.

This file records the **intent** discussed 2026-05-21 so development order stays clear while WeChat is suspended and **web is built first**.

---

## Student side (intent)

| Topic | Planned direction |
|-------|-------------------|
| Materials | Teacher-uploaded ebooks/texts (e.g. *Merriam-Webster’s Vocabulary Builder*): PDF, Word, TXT; EPUB/MOBI if feasible later |
| AI role | Daily study suggestions, review frequency, memorisation support tied to content |
| Pedagogy | Teacher/backend configures AI: memory strategies, associative learning, root–prefix–suffix |
| UX surface | Likely task-linked reader + study coach (exact UI TBD in owner spec) |

---

## Teacher / manager side (intent)

| Topic | Planned direction |
|-------|-------------------|
| Upload | Teacher uploads source material |
| AI output | Learning-oriented **HTML** teaching document |
| Manager | Controls **type/template** of AI-generated teaching page |
| Classroom | Teacher presents HTML; students open **same page** for in-class activities |

---

## Technical notes (for future implementation)

- **Copyright / licensing** for commercial books (e.g. Merriam-Webster) must be resolved before ingestion.
- **LLM API** (provider, keys, school data policy) — Phase K + Phase I5 compliance.
- **EPUB/MOBI** — separate ingestion pipeline; higher effort; defer unless required for v1.
- Reuse existing: task file upload, Bearer API, manager admin — extend, do not replace.

---

## Suggested Phase K slices (when spec is ready)

1. **K1** — Ingest PDF/Word/TXT per unit (no AI yet)  
2. **K2** — Student AI study coach (schedule + review) with teacher strategy prompts  
3. **K3** — Teacher AI → HTML lesson generator  
4. **K4** — Manager templates for AI page types  
5. **K5** — Shared “teaching page” viewer (web; later native + WeChat)

---

*Replace this placeholder with the owner’s detailed document when ready.*
