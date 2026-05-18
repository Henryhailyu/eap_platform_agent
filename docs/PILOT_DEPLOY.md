# I0 — Pilot deploy checklist

Complete these before publishing the **WeChat mini-program** or sharing the public pilot URL.

**While WeChat filing / verification is pending:** finish **I0 (HTTPS pilot)** and test the **web UI on a phone**. The mini-program in DevTools is already working locally; switch `wechat-mini/config.js` to your HTTPS URL after I0.

---

## 0. Local dev (Mac — web + WeChat simulator)

```bash
cd eap_platform_agent/backend
chmod +x scripts/start_pilot_dev.sh
./scripts/start_pilot_dev.sh
```

WeChat `config.js`: `apiBase: 'http://localhost:5051'` + 不校验合法域名 in DevTools.

Verify:

```bash
python scripts/verify_pilot.py --base http://127.0.0.1:5051 --password '123456'
```

---

## 1. Choose hosting

| Option | When to use |
|--------|-------------|
| **Docker Compose** (`docker-compose.yml`) | VPS, school server, local HTTPS test with Caddy/nginx |
| **Render** (`render.yaml`) | Fastest HTTPS without managing a VM |

---

## 2. Required environment

| Variable | Example | Notes |
|----------|---------|-------|
| `EAP_SECRET_KEY` | `openssl rand -hex 32` | **Never** use `replace-me-before-public-pilot` in production |
| `EAP_PUBLIC_URL` | `https://eap-pilot.onrender.com` | Must match the URL users open |
| `EAP_TRUST_PROXY` | `1` | Behind Render / nginx TLS |
| `EAP_ENV` | `production` | Set by Docker/Render blueprint |
| `EAP_PRODUCTION_PRESET` | `1` | Enables strict security defaults |
| `EAP_PILOT_MODE` | `1` | Pilot onboarding (`/api/pilot/info`) |

Persistent paths (Render blueprint sets these on `/data`):

- `EAP_DATABASE_PATH=/data/eap_platform.db`
- `EAP_UPLOAD_DIR=/data/uploads`
- `EAP_SUBMISSIONS_DIR=/data/submissions`

---

## 3. Deploy commands

### Docker (local or VPS)

```bash
cd eap_platform_agent
export EAP_SECRET_KEY="$(openssl rand -hex 32)"
export EAP_PUBLIC_URL="https://your-domain.example"   # or http://localhost:5051 for local only
docker compose up --build -d
```

### Render

1. Push repo to GitHub.  
2. Render → **New** → **Blueprint** → select repo.  
3. After first deploy, set **`EAP_PUBLIC_URL`** to `https://<your-service>.onrender.com`.  
4. Redeploy if needed.

---

## 4. Rotate passwords (mandatory before students use it)

```bash
# Docker
docker compose exec eap sh -c 'EAP_PILOT_DEFAULT_PASSWORD="YourStrongPassword" python scripts/seed_pilot.py'

# Or on the host with EAP_DATABASE_PATH set
cd backend
EAP_PILOT_DEFAULT_PASSWORD="YourStrongPassword" python scripts/seed_pilot.py
```

Demo accounts updated: `teacher1`, `student1`, `manager1`, `teacher2`.

---

## 5. Verify deployment

```bash
cd backend
python scripts/verify_pilot.py --base https://your-pilot-url.example --password 'YourStrongPassword'
```

Expect **all checks passed**. Fix any failure before go-live.

Manual checks:

- [ ] `GET /api/health` → `"status": "ok"`, `"strict_security": true`
- [ ] Open `https://…/` → login page loads  
- [ ] Log in as `student1` on **phone** (mobile web `/ui/student.html`)  
- [ ] Calendar, submit homework, view feedback  
- [ ] Daily backup scheduled: `python scripts/backup_database.py`

---

## 6. WeChat mini-program (after HTTPS works)

1. Register a [WeChat Mini Program](https://mp.weixin.qq.com/) (企业主体 preferred).  
2. In mini admin → **开发** → **开发管理** → **服务器域名**: add your `EAP_PUBLIC_URL` host (request + upload).  
3. Open `wechat-mini/` in [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).  
4. Set `wechat-mini/config.js` → `apiBase` to your HTTPS URL.  
5. Dev phase: enable **不校验合法域名** only for local debugging.  
6. See [`API_STUDENT_MINI.md`](API_STUDENT_MINI.md) and [`wechat-mini/README.md`](../wechat-mini/README.md).

---

## 7. Optional hardening

- `EAP_CORS_ORIGINS` if you serve UI from another origin  
- `EAP_TOKEN_TTL_SECONDS` (default 7 days)  
- Cron: `backup_database.py` + off-site copy of `/data`  
- PostgreSQL (`EAP_DATABASE_URL`) — future upgrade, not required for pilot

---

*Phase I0 operational guide — complements root `README.md`.*
