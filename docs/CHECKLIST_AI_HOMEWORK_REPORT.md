# AI Homework Report — deployment & test checklist

Use this when the teacher page shows **NOT FOUND**, **Internal Server Error**, or **Generate / refresh report** does nothing.

---

## A. Server must run the fixed code (most common issue)

The fix for homework AI routes was **not on `origin/main` until deployed**. If you only refreshed the browser but did not `git pull` + rebuild Docker on Lighthouse, the server still runs the broken build.

### A1 — On your Mac (repo)

```bash
cd ~/eap_platform_agent   # or your clone path
git fetch origin
git log -1 --oneline      # should include: fix homework AI auth + task descriptors
git status                # should be clean after pull
```

### A2 — On Tencent Lighthouse (124.222.124.42)

```bash
cd ~/eap_platform_agent
git pull origin main
set -a && source .env && set +a
sudo docker compose up -d --build --force-recreate
sudo docker compose ps    # eap container should be Up
sudo docker compose logs --tail=40 eap
```

### A3 — Quick API smoke test (on server or Mac)

Replace `SUBMISSION_ID` with a real id from the teacher UI (browser DevTools → Network, or database).

```bash
# Without login → expect 401, NOT 500
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  "http://127.0.0.1:5051/api/teacher/submissions/SUBMISSION_ID/ai-report"

# HTTP 500 = still broken auth or crash — check docker logs
# HTTP 404 = wrong submission id or route not registered
# HTTP 401 = route OK, need teacher session
```

**Broken build symptom:** `HTTP 500` on the URL above even before login (confirmed on pre-fix deploy).

---

## B. Environment (`.env` on server)

| Variable | Required for AI reports |
|----------|-------------------------|
| `EAP_AI_ENABLED` | `1` |
| `EAP_OPENAI_API_KEY` or `EAP_DEEPSEEK_API_KEY` | non-empty |
| `EAP_SESSION_COOKIE_SECURE` | `0` if you use `http://124.222.124.42:5051` (not HTTPS) |

After editing `.env`:

```bash
sudo docker compose up -d --force-recreate
```

Test AI config (inside container or from `backend/` with same env):

```bash
cd backend && python3 scripts/test_ai_key.py
```

---

## C. Browser (teacher)

1. Open **`http://124.222.124.42:5051/ui/teacher.html`** (same host as API — do not open HTML via Live Server on another port unless `api-config.js` sets `EAP_API_BASE`).
2. Log in as **teacher** (e.g. Demo Teacher).
3. **Hard refresh:** Mac `Cmd+Shift+R`, Windows `Ctrl+Shift+R`.
4. Confirm scripts loaded new cache keys (order matters: **app.js before** homework marking):
   - `app.js?v=20260603-hm-api`
   - `teacher-homework-marking.js?v=20260603-hm-api`
5. In Network, `ai-report` request URL must start with `http://124.222.124.42:5051/api/...` — **not** `/ui/api/...` (wrong base causes false “API not found”).
6. Open **DevTools → Network**, filter `ai-report`:
   - **Generate** click → `POST .../ai-report/generate`
   - Status **200** + JSON `ai_report` → OK
   - **500** → server not updated or AI crash — see logs
   - **503** + `"AI is not configured"` → fix `.env`
   - **401** → log in again; check cookie / Bearer token
   - **404** → wrong submission id or old server without HM routes

---

## D. Data / workflow (feature behaviour)

### D1 — Task must allow AI marking

For **new** tasks (after descriptor feature):

1. **Create New Task** → category **Homework** or **Writing**
2. Check **AI report / marking descriptor**
3. Upload descriptor file(s) → **Save Task**

For **old** tasks created before the checkbox: AI still works if category is **Homework** or **Writing** and Manager profile **writing_pilot** exists (default seed).

### D2 — Student submission

- Student must **submit** homework (text and/or attachment).
- Docx/pdf text is extracted server-side for the model.

### D3 — Manager descriptors (optional extra)

**Admin** → Homework AI marking → upload descriptors on profile **Writing homework (EAP047 pilot)**. Used when the task has no per-task descriptor files.

### D4 — Teacher review flow

1. Calendar → task → **View submissions** → open a submission
2. Section **AI Report (English)** should load (not NOT FOUND / 500)
3. Click **Generate / refresh report** → wait (can take 30–90s)
4. Status **Draft ready** → **Approve → teacher feedback**

---

## E. Common mistakes

| Mistake | What you see |
|---------|----------------|
| Only refreshed browser, no `git pull` + Docker rebuild on server | Same error as before (500 / NOT FOUND) |
| `EAP_AI_ENABLED=0` or missing API key | Generate returns **503** or failed report |
| Testing on `file://` or port 5500 without `EAP_API_BASE` | API calls fail / wrong host |
| HTTPS front-end but `EAP_SESSION_COOKIE_SECURE=0` mismatch | **401** on API |
| Task category not Homework/Writing and AI not enabled on task | Failed report: *AI marking is not enabled* |
| Empty submission (no text, image only) | Failed: *No submission text to analyse* |

---

## F. One full end-to-end test (recommended)

1. Deploy fixed code (section A).
2. Teacher: new **Homework** task with AI checkbox + descriptor upload → **Save Task**.
3. Student: submit a **.docx** or paste essay text.
4. Teacher: open submission → **Generate / refresh report** → **Approve**.
5. Confirm **teacher feedback** field filled with English report sections.

---

## G. If still broken — collect for support

```bash
# On server
cd ~/eap_platform_agent && git log -1 --oneline
grep EAP_AI_ENABLED .env
sudo docker compose logs --tail=80 eap
```

Browser: screenshot of Network tab for `ai-report` request (status, response body).
