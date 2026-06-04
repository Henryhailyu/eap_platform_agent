# WEB_LAUNCH 运维手册（Lighthouse + Render）

**用途：** 正式试点前一次性运维（强密码、备份、AI 密钥）。  
**试点班级：** `EAP047`  
**Lighthouse 示例：** `http://124.222.124.42:5051`  
**Render 试点：** `https://eap-platform-pilot.onrender.com`

---

## 1. 强密码（必做）

演示账号 `student1` / `teacher1` / `manager1` 默认 `123456` **不得**用于真实课堂。

### Lighthouse（OrcaTerm）

```bash
cd ~/eap_platform_agent
set -a && source .env && set +a
# 在 .env 中设置: EAP_PILOT_DEFAULT_PASSWORD=你的强密码

sudo docker compose exec -e EAP_PILOT_DEFAULT_PASSWORD="$EAP_PILOT_DEFAULT_PASSWORD" eap \
  python /app/backend/scripts/seed_pilot.py
```

或先改 `.env` 再重建（会按 seed 逻辑更新密码，以 `seed_pilot.py` 为准）：

```bash
nano .env   # EAP_PILOT_DEFAULT_PASSWORD=...
set -a && source .env && set +a
sudo docker compose up -d --build
```

### Render

Render 控制台 → **Environment** → 设置 `EAP_PILOT_DEFAULT_PASSWORD` → Shell：

```bash
cd /app/backend
EAP_PILOT_DEFAULT_PASSWORD='你的强密码' python scripts/seed_pilot.py
```

详见 [`RENDER_OPS.md`](RENDER_OPS.md)。

---

## 2. `/data` 备份（建议每周）

生产数据在 Docker 卷 **`eap_data`** 内，路径 **`/data/eap_platform.db`** 与 **`/data/uploads`**。

### Lighthouse 一键脚本（推荐）

在服务器上（已 `git pull` 后）：

```bash
cd ~/eap_platform_agent
chmod +x backend/scripts/backup_lighthouse_data.sh
./backend/scripts/backup_lighthouse_data.sh
```

备份目录：`~/eap_backups/eap_backup_YYYY-MM-DD_HHMMSS/`（含 DB + uploads 清单）。

### 手动（OrcaTerm）

```bash
cd ~/eap_platform_agent
STAMP=$(date -u +%Y%m%d_%H%M%S)
DEST=~/eap_backups/manual_$STAMP
mkdir -p "$DEST"
sudo docker compose exec eap ls -la /data
sudo docker compose cp eap:/data/eap_platform.db "$DEST/"
```

将 `~/eap_backups` 定期拷到本机或网盘。

### 本机开发库

```bash
cd backend
python scripts/backup_database.py --out ../backups
```

---

## 3. AI 密钥（备课 / AI 报告 / 自学教练）

### 必须变量（Lighthouse `.env` 或 Render Environment）

| 变量 | 说明 |
|------|------|
| `EAP_AI_ENABLED` | `1` |
| `EAP_AI_PROVIDER` | `openai` 或 `deepseek` |
| `EAP_OPENAI_API_KEY` + `EAP_OPENAI_BASE_URL` + `EAP_OPENAI_MODEL` | 混元/代理示例见本地 `.env` |
| 或 `EAP_DEEPSEEK_API_KEY` 等 | 见 [`RENDER_ENV_SETUP.md`](RENDER_ENV_SETUP.md) |

**切勿**把密钥写入 git 或前端文件。

### 验收

```bash
curl -s http://127.0.0.1:5051/api/health | python3 -m json.tool
```

期望：`"ai": { "enabled": true, "configured": true }`（外网把 host 换成公网 IP/域名）。

Lighthouse 外网：

```bash
curl -s http://124.222.124.42:5051/api/health
```

---

## 4. 部署后检查清单

- [ ] `git pull` + `sudo docker compose up -d --build --force-recreate`
- [ ] 强密码已轮换并口头通知教师
- [ ] `/api/health` AI 已配置
- [ ] 至少做一次 [`backup_lighthouse_data.sh`](../backend/scripts/backup_lighthouse_data.sh)
- [ ] 教师硬刷新 `/ui/`（避免旧 JS 缓存）
- [ ] 完整链参考 [`CHECKLIST_EAP047_PILOT_REHEARSAL.md`](CHECKLIST_EAP047_PILOT_REHEARSAL.md)（已签字可作回归）

---

## 5. 相关文档

- [`WEB_LAUNCH_CHECKLIST.md`](WEB_LAUNCH_CHECKLIST.md) — 上线定义  
- [`TENCENT_LIGHTHOUSE_DEPLOY.md`](TENCENT_LIGHTHOUSE_DEPLOY.md) — 轻量服务器部署  
- [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md) — 密钥规范  
