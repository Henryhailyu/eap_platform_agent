# SS-V1 — Self-study vocabulary (Web)

**Parent:** [`SELF_STUDY_VOCABULARY.md`](SELF_STUDY_VOCABULARY.md) · [`VISION_SELF_STUDY.md`](VISION_SELF_STUDY.md)

## Delivered

### Database (`backend/self_study_vocabulary.py`)

| Table | Purpose |
|-------|---------|
| `vocab_material_packs` | Channel A manager packs |
| `vocab_material_units` | Units/chapters with `words_json` |
| `vocab_courses` | Channel B class AI course |
| `vocab_course_days` | 30 words/day + practice JSON |
| `student_vocab_pack_progress` | Unit completion |
| `student_vocab_day_progress` | Learn + practice per day |
| `student_vocab_word_history` | Global dedup per student |

**Seed:** EAP047 active course (days 1–2), Merriam-Webster sample pack + Unit 1.

### Student API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/student/self-study/vocabulary/overview` | Channel, course, packs, schedule |
| GET | `/api/student/self-study/vocabulary/today` | Channel B — 30 words + practice |
| GET | `/api/student/self-study/vocabulary/review-yesterday` | Manual flashcard review (Web) |
| GET | `/api/student/self-study/vocabulary/calendar` | 14-day review calendar |
| GET | `/api/student/self-study/vocabulary/packs/<id>/units` | Channel A unit list |
| GET | `/api/student/self-study/vocabulary/units/<id>` | Unit words (affix cards) |
| POST | `/api/student/self-study/vocabulary/complete` | Mark day or unit done |

### Manager API

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/admin/self-study/vocabulary/packs` | List / create packs |
| PUT | `/api/admin/self-study/vocabulary/push-channel-a` | Enable Channel A for class |
| GET | `/api/admin/self-study/vocabulary/courses/<id>/export.csv` | Excel-friendly export |

### Frontend

- `js/student-self-study-server.js` — vocabulary API client
- `js/student-self-study-vocabulary-ui.js` — server UI (Channel A packs / Channel B learn·practice·review·calendar)
- `js/admin-self-study-vocabulary.js` — manager packs + Channel A push + CSV export
- Mock fallback when server unavailable (`student-self-study-vocabulary-mock.js`)

### Web vs App

| Feature | Web (SS-V1) | App (later) |
|---------|-------------|-------------|
| 30 new words + practice | Yes | Yes |
| 2h spaced review push | **Manual** “复习昨日” tab | Scheduled |
| Review calendar | Read-only 14-day view | Full + notifications |

## UAT

1. `student1` (EAP047) → Vocabulary → Channel B → today’s 30 affix cards + practice  
2. Review tab → yesterday’s words flashcards (know/fuzzy/forget)  
3. Calendar → Fri = review only, Sun = new week  
4. `manager1` → Admin → Enable vocabulary Channel A for EAP047 → student overview shows Channel A → School packs tab  
5. Export course CSV → day_number, word, affix fields  

## Next

- **SS-R1** reading module (server-backed)
- Manager: upload pack units (Excel), AI course draft generation
- App: 2h review push + quiet hours
