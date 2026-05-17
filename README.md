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

## Tracker

See `../eap_platform cursor agent window/EAP_PROJECT_TRACKER.md`
