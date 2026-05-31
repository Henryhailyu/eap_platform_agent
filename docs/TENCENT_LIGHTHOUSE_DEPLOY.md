# 腾讯云 Lighthouse 部署 EAP（大陆测试站）

**适用：** 已购买 **Docker CE** 轻量服务器（如上海 2核4G）。  
**示例 IP：** 替换为你控制台里的公网 IP（当前截图示例 `124.222.124.42`）。

---

## 第 0 步：你现在有什么

| 项目 | 说明 |
|------|------|
| 产品 | 轻量应用服务器 + **Docker CE** 镜像 ✅ |
| 地域 | 上海（或其它已选地域） |
| 访问 | 公网 IPv4 |
| 不要装 | 龙虾 / OpenClaw 等与 EAP 无关模板 |

---

## 第 1 步：控制台放行端口（必做）

1. 打开 [轻量控制台 → 服务器](https://console.cloud.tencent.com/lighthouse/instance) → 点你的实例。  
2. 进入 **防火墙**（或「安全组/防火墙模板」→ 绑定到本机）。  
3. **添加规则：**

| 协议 | 端口 | 来源 | 用途 |
|------|------|------|------|
| TCP | **22** | 仅你的办公 IP（可选） | SSH |
| TCP | **5051** | 0.0.0.0/0 | 试点网站（先测通） |
| TCP | **80** | 0.0.0.0/0 | 以后域名 HTTP |
| TCP | **443** | 0.0.0.0/0 | 以后 HTTPS |

> 未放行 **5051** 时，浏览器无法打开 `http://IP:5051/ui/`。

---

## 第 2 步：登录服务器

**方式 A（简单）：** 控制台实例卡片 → **登录** → 「OrcaTerm / 网页终端」。

**方式 B（本机终端）：**

```bash
ssh root@你的公网IP
```

使用购买时 **自动生成的密码**（控制台可重置密码）。

---

## 第 3 步：安装 Git（若无）

```bash
apt-get update
apt-get install -y git
git --version
```

---

## 第 4 步：拉取代码

```bash
cd /root
git clone https://github.com/Henryhailyu/eap_platform_agent.git
cd eap_platform_agent
```

若仓库为私有，需配置 SSH key 或 Personal Access Token。

---

## 试点验收三步（OrcaTerm 按顺序执行）

### ① Cookie（HTTP 试点必做）

```bash
cd ~/eap_platform_agent
nano .env
```

增加一行：

```env
EAP_SESSION_COOKIE_SECURE=0
```

保存后：

```bash
set -a && source .env && set +a
sudo docker compose up -d
```

浏览器 **退出登录 → 再登录** 后测 Live PPT。

### ② 改掉默认密码 123456

`docker compose exec` 默认**不会**带上 `.env` 里的密码，必须显式传入：

```bash
cd ~/eap_platform_agent
set -a && source .env && set +a
sudo docker compose exec -e EAP_PILOT_DEFAULT_PASSWORD="$EAP_PILOT_DEFAULT_PASSWORD" eap \
  python /app/backend/scripts/seed_pilot.py
```

成功时应看到：`Updated passwords for: teacher1, student1, manager1, teacher2`

然后让 compose 长期带上密码（更新 `docker-compose.yml` 后）：

```bash
sudo docker compose up -d
```

用 `.env` 里 `EAP_PILOT_DEFAULT_PASSWORD` 登录；`123456` 应失效。

### ③ 学生端

教师 Live 页复制 join 链接，无痕打开， `student1` + 新密码登录。

### ④ 更新代码（PPT 仍 Not logged in 时）

在 Mac 打包最新前端/后端后 `scp` 上传，或 `git pull` 后：

```bash
cd ~/eap_platform_agent
git pull
set -a && source .env && set +a
sudo docker compose up -d --build
```

**不要用** `cd /path/to/eap_platform_agent`（那是文档占位符）。`ubuntu` 用户若报 `permission denied` on docker.sock，必须加 **`sudo`**（或 `sudo usermod -aG docker ubuntu` 后重新 SSH 登录）。

部署后确认：`curl -s http://127.0.0.1:5051/ui/teacher.html | grep app.js` 应看到较新的 `?v=20260531-materials-batch`（或更新版本号）。

---

## 第 5 步：配置环境变量

```bash
cd /root/eap_platform_agent
nano .env
```

写入（**把 IP 换成你的**）：

```env
EAP_SECRET_KEY=请换成随机串
EAP_PUBLIC_URL=http://124.222.124.42:5051
EAP_PILOT_DEFAULT_PASSWORD=请设强密码
EAP_SEED_PILOT=1
EAP_SEED_DEMO_TASKS=1
```

生成随机密钥（在服务器上执行）：

```bash
openssl rand -hex 32
```

保存后：

```bash
export $(grep -v '^#' .env | xargs)
```

---

## 第 6 步：构建并启动 Docker

**OrcaTerm 容易断线：** 用 `screen` 或 `nohup`，避免构建 1 小时后断开前功尽弃。

```bash
sudo apt-get install -y screen
screen -S eapbuild
cd ~/eap_platform_agent
set -a && source .env && set +a
sudo docker compose up --build -d
# 断开会话：Ctrl+A 然后按 D；恢复：screen -r eapbuild
```

或后台日志：

```bash
cd ~/eap_platform_agent
set -a && source .env && set +a
nohup sudo docker compose up --build -d > ~/eap_build.log 2>&1 &
tail -f ~/eap_build.log
```

```bash
cd /root/eap_platform_agent
docker compose up --build -d
```

- **首次约 10–25 分钟**（安装 LibreOffice 等）。  
- 查看日志：

```bash
docker compose logs -f
```

看到 Gunicorn 监听 **5051** 即成功。`Ctrl+C` 退出日志。

---

## 第 7 步：浏览器验收

在本机浏览器打开：

```text
http://你的公网IP:5051/ui/index.html
```

健康检查：

```text
http://你的公网IP:5051/api/health
```

登录（若用 `.env` 里设的试点密码）：

- 教师 `teacher1` / 你设的 `EAP_PILOT_DEFAULT_PASSWORD`  
- 学生 `student1` / 同上  

**不要长期使用 `123456`。**

---

## 第 8 步：常用运维命令

```bash
cd /root/eap_platform_agent
docker compose ps
docker compose restart
docker compose pull   # 若你以后改为拉镜像
docker compose up -d --build   # 更新代码后重新构建
```

数据在 Docker volume **`eap_data`**（数据库与 uploads）。备份：

```bash
docker compose exec eap ls -la /data
# 或 docker volume inspect eap_platform_agent_eap_data
```

---

## 第 9 步：备案与域名（正式给全校用）

| 阶段 | 做法 |
|------|------|
| 现在 | `http://IP:5051` 小范围测试 |
| 正式 | 域名 **ICP 备案** → Nginx 反代 80/443 → `EAP_PUBLIC_URL=https://你的域名` |
| 录课/直播 | 再按 `CHINA_LIVE_VOD_ROADMAP.md` 买 VOD/TRTC |

Nginx 简要：对外 443 → 本机 `127.0.0.1:5051`，并设置 `EAP_TRUST_PROXY=1`。

---

## 第 10 步：AI（可选）

在 `.env` 增加（与 Render 相同）：

```env
EAP_AI_ENABLED=1
EAP_DEEPSEEK_API_KEY=你的密钥
```

然后 `docker compose up -d` 重启。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 浏览器打不开 | 检查防火墙是否放行 **5051** |
| `docker compose` 不存在 | 试 `docker compose version`；旧镜像用 `docker-compose` |
| 构建失败 / 磁盘满 | `df -h`；轻量盘 60GB 一般够 |
| PPT 预览慢 | 正常，LibreOffice 首次转换 10–30 秒 |
| 仍想用 Render | 可双轨；大陆师生用 Lighthouse IP/域名 |

---

## 与编程任务的衔接

1. 本站跑通后，继续 **L32 教师端推送加固** → **学生端 display 修复**。  
2. 需要我改代码部署时：在服务器 `git pull` + `docker compose up -d --build`。  
3. **暂不必买** 云点播/TRTC，直到开始做录课 Phase N。

---

*Last updated: 2026-05-28*
