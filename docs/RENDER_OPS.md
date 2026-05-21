# Render pilot — operations

**Service:** `eap-platform-pilot`  
**URL:** https://eap-platform-pilot.onrender.com  
**Cost:** ~$7/month (Starter) + ~$0.25/month (1 GB disk)

---

## Cold start (502)

Starter **sleeps** after ~15 minutes without traffic.

| User sees | Action |
|-----------|--------|
| **502 Bad Gateway** | Wait 60–90 s, refresh once |
| Slow first load | Open `/api/health` first, then `/ui/` |

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
