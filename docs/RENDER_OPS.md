# Render pilot — operations

**Service:** `eap-platform-pilot`  
**URL:** https://eap-platform-pilot.onrender.com  
**Cost:** ~$7/month (Starter) + ~$0.25/month (1 GB disk)

---

## Cold start (502)

Starter **sleeps** after ~15 minutes without traffic. While the container starts, Render may show **502 Bad Gateway** for up to ~60 s.

| User sees | Action |
|-----------|--------|
| **502 Bad Gateway** | Wait 30–60 s, refresh once — or open `/ui/index.html` (auto-retries health on Render) |
| “Starting EAP server…” overlay | Normal after sleep; page retries `/api/health` automatically |
| Slow first load after deploy | First boot seeds the DB; later restarts skip seeds and start faster |

**Deploy behaviour:** `docker_entrypoint.sh` runs full `seed_pilot` / demo seed only once (marker file `/data/.eap_seeded`). Restarts and wake-from-sleep only run `init_database` then Gunicorn.

To re-seed manually: Render Shell → `touch /data/.eap_seeded` remove + `EAP_FORCE_SEED=1` on one deploy, or delete the marker and redeploy.

For demos: visit the site 2 minutes before class.

---

## Passwords

Rotate on Render **Shell**:

```bash
cd /app/backend
EAP_PILOT_DEFAULT_PASSWORD='YourStrongPassword' python scripts/seed_pilot.py
```

Accounts: `student1`, `teacher1`, `manager1`, `teacher2`.

---

## Backups (recommended weekly)

From your Mac (download DB via Render Shell or SFTP not available on Starter — use Shell):

```bash
# On Render Shell — copy path
ls -la /data/eap_platform.db
```

**Option A — manual:** Render dashboard → Shell → archive instructions in Phase J.  
**Option B — local script** when you have DB file:

```bash
cd backend
python scripts/backup_database.py
```

Store copies off Render (iCloud / school drive).

---

## Redeploy after `git push`

Blueprint syncs from `main` automatically, or **Manual Deploy** on the service.

---

## Environment (optional)

| Variable | When to set |
|----------|-------------|
| `EAP_PUBLIC_URL` | `https://eap-platform-pilot.onrender.com` (pin CORS; optional) |
| `GUNICORN_WORKERS` | `1` (default; required for SQLite) |

---

## When WeChat is ready

See [`WECHAT_GO_LIVE.md`](WECHAT_GO_LIVE.md).
