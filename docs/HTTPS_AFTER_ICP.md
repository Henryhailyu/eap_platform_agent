# HTTPS 上线指南（备案通过后 · Lighthouse）

**域名（已购）：** `elc-eap-platform.top`  
**服务器：** Tencent Lighthouse `124.222.124.42`  
**应用端口：** Docker `5051`（Nginx 反代 443）

备案通过前继续用 `http://124.222.124.42:5051` 测试；**备案通过后**按本指南切换 HTTPS。

---

## 分工

| 谁 | 做什么 |
|----|--------|
| **你（腾讯云控制台）** | DNS A 记录、防火墙 80/443、跑服务器脚本 |
| **Cursor（已完成）** | `ops/nginx/eap-platform.conf.template`、`ops/lighthouse-setup-https.sh` |

---

## 第 1 步：DNS（腾讯云 DNSPod）

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | `@` | `124.222.124.42` |
| A | `www` | `124.222.124.42`（可选） |

等待解析生效（通常几分钟到几小时）：

```bash
dig +short elc-eap-platform.top
# 应返回 124.222.124.42
```

---

## 第 2 步：防火墙

Lighthouse 安全组 / 防火墙放行：

| 协议 | 端口 | 来源 |
|------|------|------|
| TCP | 80 | 0.0.0.0/0 |
| TCP | 443 | 0.0.0.0/0 |
| TCP | 5051 | 可改为仅内网或关闭对外（HTTPS 上线后） |

---

## 第 3 步：拉取最新代码

```bash
cd ~/eap_platform_agent
git pull
```

---

## 第 4 步：一键 HTTPS（Nginx + Let's Encrypt）

```bash
cd ~/eap_platform_agent
chmod +x ops/lighthouse-setup-https.sh

# 可选：填写邮箱以便证书到期提醒
sudo CERTBOT_EMAIL=your@email.com EAP_DOMAIN=elc-eap-platform.top ./ops/lighthouse-setup-https.sh
```

脚本会：

1. 安装 `nginx`、`certbot`
2. 部署反代配置 → `127.0.0.1:5051`
3. 申请 SSL 证书
4. 更新 `.env`：`EAP_PUBLIC_URL`、`EAP_SESSION_COOKIE_SECURE=1`、`EAP_TRUST_PROXY=1`

---

## 第 5 步：重启 Docker

```bash
cd ~/eap_platform_agent
set -a && source .env && set +a
sudo docker compose up -d --force-recreate
```

**推荐（安全）：** 编辑 `docker-compose.yml`，将对外端口改为仅本机：

```yaml
ports:
  - "127.0.0.1:5051:5051"
```

再执行 `sudo docker compose up -d --force-recreate`。之后师生只通过 `https://elc-eap-platform.top` 访问。

---

## 第 6 步：验证

```bash
curl -s https://elc-eap-platform.top/api/health
```

浏览器：

- `https://elc-eap-platform.top/ui/student.html` — 登录 `student1`
- **听力 TTS / 口语录音** — HTTPS 下麦克风权限正常
- 教师上传录课 — 大文件经 Nginx（已设 `client_max_body_size 520m`）

---

## 故障排查

| 现象 | 处理 |
|------|------|
| Certbot 失败 | 确认备案已通过、DNS 指向本机、80 端口可从公网访问 |
| 502 Bad Gateway | `curl http://127.0.0.1:5051/api/health` — 容器是否运行 |
| 登录后 401 | `.env` 中 `EAP_SESSION_COOKIE_SECURE=1` 与 HTTPS 一致；`EAP_TRUST_PROXY=1` |
| 仍跳转到 IP:5051 | 检查 `EAP_PUBLIC_URL=https://elc-eap-platform.top` 并 recreate 容器 |

---

## 证书续期

Let's Encrypt 证书约 90 天。`certbot` 安装后会配置自动续期。手动检查：

```bash
sudo certbot renew --dry-run
```

---

## 相关文档

- [`TENCENT_LIGHTHOUSE_DEPLOY.md`](TENCENT_LIGHTHOUSE_DEPLOY.md) — 基础部署
- [`CHINA_LIVE_VOD_ROADMAP.md`](CHINA_LIVE_VOD_ROADMAP.md) — 备案后 VOD/TRTC

*Last updated: 2026-06-09*
