# EAP Platform — Agent Window Build

Separate fork for comparing **Cursor Agent window** vs **traditional Cursor** on Desktop.

| | Agent build | Desktop build |
|---|-------------|-----------------|
| Path | This folder | `~/Desktop/eap_platform` |
| Port | **5051** | **5050** |
| UI | Apple-like shell, random bg (12 images), EN/中文 | Original styling |

**Do not modify** `~/Desktop/eap_platform` from this project.

## Start

```bash
cd "/Users/henryhailyu/Documents/HL folder/Cursor coding file/eap_platform_agent/backend"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
EAP_REQUIRE_SESSION_IDENTITY=1 EAP_ENFORCE_MEMBERSHIP=1 python app.py
```

Open: **http://127.0.0.1:5051/ui/index.html**

## Demo accounts

- Teacher: `teacher1` / `123456` (authorized)
- Teacher (pending): `teacher2` / `123456` — blocked until a manager authorizes
- Student: `student1` / `123456`
- Manager: `manager1` / `123456` → http://127.0.0.1:5051/ui/admin.html
- Class: `EAP047`

## Internal demo (before D64)

1. Start Flask (command above).
2. Optional — refresh sample tasks on the calendar:

```bash
cd backend
python3 scripts/seed_internal_demo.py
```

3. Open http://127.0.0.1:5051/ui/index.html and follow the checklist in `../eap_platform cursor agent window/EAP_PROJECT_TRACKER.md` (section **D62**).

## Design features (Phase R)

- Random background on **each page navigation** (`image-1.jpg` … `image-12.jpg`)
- ~82% white frosted overlay
- Blue `#0071E3` + teal `#0A7EA4` accents
- 「中文」 language toggle (English default)

## Git checkpoints

This folder is a git repo. After each completed task we commit so you can restore:

```bash
cd "/Users/henryhailyu/Documents/HL folder/Cursor coding file/eap_platform_agent"
git log --oneline
git checkout <commit> -- .   # restore files from a commit (careful)
```

## Production / online pilot (Phase F)

Copy environment variables from `.env.example` into your host dashboard or `backend/.env` (never commit secrets).

**Recommended for any public pilot:**

```bash
export EAP_ENV=production
export EAP_SECRET_KEY="your-long-random-secret"
export EAP_PRODUCTION_PRESET=1
export EAP_TRUST_PROXY=1
export PORT=5051
export EAP_CORS_ORIGINS="https://your-school.example"
```

**Run with Gunicorn** (install `pip install -r requirements-prod.txt`):

```bash
cd backend
source venv/bin/activate
gunicorn -w 2 -b 0.0.0.0:5051 wsgi:app
```

Put **HTTPS** in front (nginx, Caddy, or your cloud load balancer). Set `EAP_TRUST_PROXY=1` so secure session cookies work behind TLS termination.

**Persistent data** on the server: mount volumes for `EAP_DATABASE_PATH`, `EAP_UPLOAD_DIR`, and `EAP_SUBMISSIONS_DIR`.

**Backup** (SQLite + files):

```bash
cd backend
python scripts/backup_database.py --out ../backups
```

Schedule that command daily on the host. PostgreSQL migration is planned for Phase G (`EAP_DATABASE_URL` in `.env.example`).

**Health check:** `GET /api/health` returns environment and security-flag status (no secrets).

## Online web pilot (Phase G)

The UI uses **same-origin** API calls when served from Flask (`/ui/`). Open your public URL root — it redirects to the login page.

### Option A — Docker (local test or any VPS)

```bash
cd "/Users/henryhailyu/Documents/HL folder/Cursor coding file/eap_platform_agent"
export EAP_SECRET_KEY="$(openssl rand -hex 32)"
docker compose up --build
```

Open **http://localhost:5051/** → login. Demo accounts: `teacher1` / `student1` / `manager1` — password `123456` until you run:

```bash
docker compose exec eap sh -c 'EAP_PILOT_DEFAULT_PASSWORD="your-new-password" python scripts/seed_pilot.py'
```

Data persists in the `eap_data` Docker volume.

### Option B — Render.com

1. Push this repo to GitHub.  
2. [Render](https://render.com) → **New** → **Blueprint** → connect the repo (`render.yaml` is included).  
3. After deploy, set **`EAP_PUBLIC_URL`** to your `https://….onrender.com` URL (same value for **`EAP_CORS_ORIGINS`** if needed).  
4. Visit the service URL; check **`GET /api/pilot/info`** for pilot onboarding JSON.

### What you provide (outside Cursor)

| Item | Example |
|------|---------|
| `EAP_SECRET_KEY` | `openssl rand -hex 32` |
| Public URL | `https://eap-pilot.onrender.com` → `EAP_PUBLIC_URL` |
| Strong pilot passwords | `EAP_PILOT_DEFAULT_PASSWORD` + `seed_pilot.py` |
| HTTPS | Provided by Render / your reverse proxy; set `EAP_TRUST_PROXY=1` |

PostgreSQL remains optional for a later upgrade; the pilot uses **SQLite on a persistent disk**.

## Mobile (Phase H)

Student and teacher pages are responsive below **768px**: compact calendar with task counts, full-width touch buttons, stacked master–detail with **Back to task list**, and form fields sized to avoid iOS zoom-on-focus.

Test: Chrome DevTools device mode, or open `http://127.0.0.1:5051/ui/student.html` on your phone (same Wi‑Fi).

## Tracker

See `../eap_platform cursor agent window/EAP_PROJECT_TRACKER.md`
