# Render environment setup (sync local features to production)

**Service:** `eap-platform-pilot`  
**Dashboard:** https://dashboard.render.com → **eap-platform-pilot** → **Environment**

Local development uses `backend/.env`. **Render does not read that file** — you must set the same variables in the Render dashboard, then **Manual Deploy** or wait for auto-deploy after `git push`.

---

## 1. AI lesson generator & AI coaches (required for “Generate HTML lesson”)

### Symptoms

- Red text: *“AI is not configured on this server…”*
- `/api/health` shows `"ai": { "enabled": false }` or `"configured": false`

### Fix

1. Open **Environment** on Render.
2. Add or confirm these variables:

| Key | Value | Secret? |
|-----|--------|---------|
| `EAP_AI_ENABLED` | `1` | No |
| `EAP_AI_PROVIDER` | `deepseek` | No |
| `EAP_DEEPSEEK_API_KEY` | your DeepSeek API key | **Yes** |
| `EAP_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | No |
| `EAP_DEEPSEEK_MODEL` | `deepseek-chat` | No |

**Or** use OpenAI-compatible proxy instead:

| Key | Value |
|-----|--------|
| `EAP_AI_PROVIDER` | `openai` |
| `EAP_OPENAI_API_KEY` | your key |
| `EAP_OPENAI_BASE_URL` | e.g. `https://api.gptsapi.net/v1` |
| `EAP_OPENAI_MODEL` | `gpt-4o-mini` |

3. Click **Save Changes** → Render redeploys (~5–15 min).
4. Verify: open  
   `https://eap-platform-pilot.onrender.com/api/health`  
   → `"ai": { "enabled": true, "configured": true }`

**Never commit API keys to git.** Copy from your local `backend/.env` only into Render’s secret fields.

---

## 2. 502 Bad Gateway when opening teacher pages

### Cause

Render **Starter** sleeps after ~15 minutes without traffic. The first request may return **502** before the container is up.

### Fix (users)

1. Open first: https://eap-platform-pilot.onrender.com/ui/index.html  
   Wait for “Starting EAP server…” overlay to finish (~30–60 s).
2. Then sign in and use teacher / live / lesson pages.
3. Use **← Teaching calendar** links on Render — they wake the server before navigating.

### Fix (ops)

- Before class: visit `/api/health` or the home page 2 minutes early.
- Optional: upgrade Render plan to reduce sleep (paid).

---

## 3. File upload fails on Render

### Checklist

| Check | Action |
|-------|--------|
| Logged in as **teacher**? | Upload APIs require teacher session on the same browser tab |
| Latest deploy? | Needs commits `ec12a96`+ (classroom display) and `bd5a81e`+ (LibreOffice Docker) |
| Disk mounted? | Render **Disk** `/data` — uploads go to `/data/uploads` |
| File size | Display library max **25 MB**; source files max **10 MB** |
| PPT preview | First view may take 10–30 s (LibreOffice conversion); upload itself should return quickly after latest fix |

### Verify upload API

1. Log in as `teacher1` on the pilot site.
2. **Live Teaching** → Display library → **Upload file** (PDF small test).
3. If error: browser **DevTools → Network** → failed request → note status (401 / 413 / 500).

### Common errors

| Status | Meaning |
|--------|---------|
| 401 | Not logged in — open `/ui/index.html`, login again |
| 403 | Teacher not assigned to class |
| 413 | File too large |
| 502 | Server waking — retry after health check OK |

---

## 4. Variables already in `render.yaml` (auto on deploy)

These are set from the repo; you usually do **not** need to duplicate them:

- `EAP_ENV=production`
- `EAP_UPLOAD_DIR=/data/uploads`
- `EAP_DATABASE_PATH=/data/eap_platform.db`
- `EAP_PUBLIC_URL=https://eap-platform-pilot.onrender.com`
- `EAP_AI_ENABLED=1` (still need **API key** in dashboard)

---

## 5. After changing Environment

1. Wait for deploy **Live** (green).
2. Hard refresh browser: **Cmd+Shift+R**.
3. Re-test: AI generate, file upload, Live Teaching display.

---

## Related docs

- [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md)
- [`RENDER_OPS.md`](RENDER_OPS.md)
- [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md)
