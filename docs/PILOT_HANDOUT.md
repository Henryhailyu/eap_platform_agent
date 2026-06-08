# PILOT-HANDOUT — Teacher one-page quick start

**Purpose:** Printable handout for Lighthouse / classroom pilot (**EAP047**).  
**Printable page:** `/ui/pilot-handout-teacher.html`  
**Updated:** 2026-06-09

---

## Open & print

| Host | Handout URL |
|------|-------------|
| **Lighthouse (recommended)** | `http://124.222.124.42:5051/ui/pilot-handout-teacher.html` |
| Custom base | `.../ui/pilot-handout-teacher.html?base=http://YOUR_HOST:5051` |
| Demo password on sheet (internal only) | Add `&show_demo_password=1` — **do not** distribute publicly |

1. Open the URL in Chrome / Edge / Safari.  
2. Click **打印 / Print** (or browser Print → Save as PDF).  
3. Share PDF or paper with teachers; send **password separately** (not on the poster).

---

## What the handout covers

1. **Sign-in** — `teacher1` (password from coordinator)  
2. **Lesson prep** → publish to calendar (`teacher-lesson-ai.html?class=EAP047`)  
3. **Live teaching** — session code, push display, timer to students (`teacher-live.html`)  
4. **Homework** — new task, optional AI marking  
5. **Marking** — submissions → AI report → Approve  
6. **Recorded lessons** — upload → publish (`teacher-recorded.html`)  
7. **Students** — AI Self-Study Centre (`student-self-study-module.html`)  

**Smoke test after deploy:**

```bash
cd backend && python3 scripts/verify_pilot.py --base http://YOUR_HOST:5051 --password 'YOUR_PASSWORD'
```

Includes self-study + audio status + recorded-lessons API checks.

---

## Accounts (pilot)

| Role | Username | Password |
|------|----------|----------|
| Teacher | `teacher1` | Set via `EAP_PILOT_DEFAULT_PASSWORD` on server (see [`WEB_LAUNCH_OPS_RUNBOOK.md`](WEB_LAUNCH_OPS_RUNBOOK.md)) |
| Student | `student1` | Same rotation |
| Manager | `manager1` | Same rotation |

**Class code:** `EAP047`

**Render fallback (cold start):** `https://eap-platform-pilot.onrender.com/ui/index.html` — first visit after idle may show **502** for ~1 min; refresh once.

---

## Related docs

- [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md) — full rehearsal steps  
- [`CHECKLIST_EAP047_SELF_STUDY.md`](CHECKLIST_EAP047_SELF_STUDY.md) — self-study UAT addendum  
- [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md) — launch criteria  
- [`I0_PHONE_PILOT.md`](I0_PHONE_PILOT.md) — phone spot-check  

---

## Coordinator checklist

- [ ] Rotate passwords off `123456` before real classes  
- [ ] Print or PDF handout with correct `?base=` URL  
- [ ] Walk through §1–§4 once in a demo session  
- [ ] Keep [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md) for sign-off  
