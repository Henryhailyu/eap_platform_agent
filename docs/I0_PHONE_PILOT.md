# I0b — Phone & tablet web pilot checklist

Use this after `verify_pilot.py` passes on HTTPS. **WeChat mini is not required** for this phase.

**Pilot URL:** https://eap-platform-pilot.onrender.com  
**Class:** EAP047  
**Demo password (production):** `123456` for `student1`, `teacher1`, `manager1` (set via `EAP_PILOT_DEFAULT_PASSWORD` in `render.yaml`; change in Render dashboard if needed).

> **Render cold start (502 Bad Gateway):** On Starter, the app **sleeps after ~15 min** with no visits. While waking, the browser may show **502** — this is normal, not a broken deploy.
>
> **Fix:** Wait **60–90 seconds**, then refresh **once**. Or open `/api/health` first; when you see JSON, open `/ui/index.html`.
>
> **Wake order:**  
> 1. https://eap-platform-pilot.onrender.com/api/health  
> 2. https://eap-platform-pilot.onrender.com/ui/index.html

---

## Accounts

| Role | Username | Use on |
|------|----------|--------|
| Student | `student1` | Phone student URL |
| Teacher | `teacher1` | Phone or laptop teacher URL |
| Manager | `manager1` | Laptop admin URL (optional) |

---

## A. Student — phone (required)

**URL:** https://eap-platform-pilot.onrender.com/ui/student.html

| # | Action | Pass? |
|---|--------|-------|
| A1 | Page loads; login form visible (not blank / 502) | ☐ |
| A2 | Log in as `student1` | ☐ |
| A3 | Tap **中文** — UI labels switch | ☐ |
| A4 | Calendar loads; class **EAP047** | ☐ |
| A5 | Open a day with a task (e.g. May 2026) | ☐ |
| A6 | Task detail opens; description readable | ☐ |
| A7 | Mark task complete (if button shown) | ☐ |
| A8 | Submit homework (text or small file) | ☐ |
| A9 | Open learning archive / progress if shown | ☐ |
| A10 | Logout works | ☐ |

---

## B. Teacher — phone or tablet (recommended)

**URL:** https://eap-platform-pilot.onrender.com/ui/teacher.html

| # | Action | Pass? |
|---|--------|-------|
| B1 | Log in as `teacher1` | ☐ |
| B2 | Calendar loads; select class **EAP047** | ☐ |
| B3 | Open a day with tasks | ☐ |
| B4 | **View submissions** — list loads | ☐ |
| B5 | Save written feedback on a submission | ☐ |
| B6 | Pinch/zoom not required for main buttons (touch targets OK) | ☐ |

---

## C. Landing & manager (optional)

| URL | Check |
|-----|--------|
| https://eap-platform-pilot.onrender.com/ | Redirects to login |
| https://eap-platform-pilot.onrender.com/ui/admin.html | `manager1` login (laptop preferred) |

---

## D. Report issues to development

Note for each failure:

- Device (e.g. iPhone 15 / Safari)
- URL
- Step number (A5, B4, …)
- Screenshot or exact error text

---

## E. Local dev vs production (do not mix)

| | Local Mac | Production (Render) |
|--|-----------|---------------------|
| URL | http://127.0.0.1:5051 | https://eap-platform-pilot.onrender.com |
| Password | `123456` (unless changed locally) | `EapPilot2026!Henry` (or your Render seed) |
| WeChat DevTools | `localhost:5051` | Wait for 备案; then HTTPS URL |

---

*Next after this checklist: WeChat production (`config.js`, 服务器域名, 体验版) when authorization completes.*
