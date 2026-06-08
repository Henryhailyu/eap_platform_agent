# SS-Sp4 腾讯云采购检查表（试点 30 人 × 1 月）

**用途：** 拿着本表去 [腾讯云控制台](https://console.cloud.tencent.com/) 开通产品、下单资源包、配置密钥。  
**范围：** 学生端 **听力音频 + 口语录音/评测**（TTS · ASR · SOE · COS · CDN）。不含录课 TRTC/VOD、不含 LLM。  
**相关：** [`SS-Sp2-Sp3_SELF_STUDY_SPEAKING.md`](SS-Sp2-Sp3_SELF_STUDY_SPEAKING.md) · [`SS-L1_SELF_STUDY_LISTENING.md`](SS-L1_SELF_STUDY_LISTENING.md) · [`API_KEYS_AND_SECRETS.md`](API_KEYS_AND_SECRETS.md)

**定价参考日期：** 2026-06（以控制台购买页为准；活动价可能更低）

---

## 一、采购总览（最小包）

| 优先级 | 产品 | 试点是否必买 | 建议首月动作 |
|--------|------|-------------|-------------|
| P0 | 账号 + CAM 密钥 | ✅ | 企业实名 + 子账号密钥 |
| P0 | 语音合成 **TTS** | ✅ 开通 | **领取**精品音色 800 万字符免费包（够试点） |
| P0 | 语音识别 **ASR** | ✅ 开通 | 用新客 **录音文件识别 10 小时**免费额度 |
| P0 | 口语评测 **SOE 新版** | ✅ | 买 **1 万次体验包 ¥9.9**（每账号限购 1 个） |
| P0 | 对象存储 **COS** | ✅ | 建私有桶；可选新客 **100GB 存储包 ¥9.9** |
| P1 | **CDN** | 建议 | 试点流量小，可先 COS 默认域名，上线前再加 CDN |
| — | SOE 并发叠加 | ❌ 暂不买 | 新版默认 **50 路免费并发**，30 人够用 |
| — | TTS 并发叠加 | ❌ 暂不买 | 预生成音频，非实时合成 |
| — | TRTC / VOD / 混元 | ❌ | SS-Sp4 不需要 |

---

## 二、控制台操作检查表（按顺序打勾）

### 0. 账号与账单

- [ ] 登录 [腾讯云](https://cloud.tencent.com/) → **企业实名认证**（正式商用建议）
- [ ] [费用中心](https://console.cloud.tencent.com/expense/overview) → 充值 **¥100–200** 作为试点备用金（抵扣后付费）
- [ ] 开启 **余额告警**（如余额 < ¥50 短信/邮件提醒）

### 1. 访问管理 CAM（API 密钥）

控制台：[访问管理 → API 密钥](https://console.cloud.tencent.com/cam/capi)

- [ ] 创建 **子用户**（勿用主账号密钥上生产），如 `eap-pilot-audio`
- [ ] 勾选 **编程访问**，生成 `SecretId` + `SecretKey`（**只显示一次，请安全保存**）
- [ ] 附加策略（最小权限可先宽后窄）：
  - [ ] `QcloudSOEFullAccess`（口语评测新版）
  - [ ] `QcloudASRFullAccess`（语音识别）
  - [ ] `QcloudTTSFullAccess`（语音合成）
  - [ ] `QcloudCOSFullAccess` 或自定义 COS 桶读写策略
- [ ] 记录 **主账号 AppId**（部分 SDK 需要，在 [账号信息](https://console.cloud.tencent.com/developer) 查看）

### 2. 语音合成 TTS

产品页：[语音合成](https://cloud.tencent.com/product/tts)  
控制台：[语音合成](https://console.cloud.tencent.com/tts)

- [ ] **开通服务**（首次进入控制台按引导开通）
- [ ] [领取免费资源包](https://console.cloud.tencent.com/tts) → **精品音色 800 万字符**（3 个月有效，试点足够）
- [ ] （可选）**开通后付费**：设置 → 后付费 — 免费包用尽后自动续用，避免停服
- [ ] 试听音色，选定 **考官英文音色**（建议英音 `VoiceType`，记录编号 → `EAP_TTS_VOICE_ID`）
- [ ] **暂不购买**并发叠加包（音频预生成到 COS，非课堂实时并发）

**试点开关含义：**

| 控制台项 | 建议 |
|---------|------|
| 免费资源包 | ✅ 必领 |
| 后付费 | 建议开（防止免费包耗尽停服） |
| 并发叠加 | ❌ 跳过 |

### 3. 语音识别 ASR（口语转写）

产品页：[语音识别](https://cloud.tencent.com/product/asr)  
控制台：[语音识别](https://console.cloud.tencent.com/asr)

- [ ] **开通服务**
- [ ] 领取 **新用户免费额度**（控制台首页常见：**录音文件识别 10 小时** 等，以页面为准）
- [ ] 确认使用场景：**录音文件识别**（学生录完再识别），非「实时语音识别」
- [ ] （可选）购买 **录音文件识别 60 小时资源包**（约 ¥数十，1 年有效）— 仅当免费额度不够时

**试点开关含义：**

| 控制台项 | 建议 |
|---------|------|
| 录音文件识别 | ✅ 口语主路径 |
| 实时语音识别 | ❌ SS-Sp4 不需要 |
| 极速版 | ❌ 试点不必（更贵） |

### 4. 智聆口语评测 SOE（新版）

文档：[口语评测（新版）product/1774](https://cloud.tencent.com/document/product/1774)  
控制台：[智聆口语评测（新版）](https://console.cloud.tencent.com/soe)

- [ ] **开通服务**（英文版 + 中文版均可，合并计费）
- [ ] [购买页](https://buy.cloud.tencent.com/soe) → **1 万次体验包 ¥9.9**（每账号限购 1 个，**试点必买**）
- [ ] （可选）**开通后付费** ¥5/千次 — 资源包用尽后的兜底
- [ ] 记录控制台 **AppId**（SOE WebSocket 鉴权用 → `EAP_SOE_APPID`）
- [ ] **并发**：默认 **50 路免费**；30 人同时模考一般不需买「30 元/并发/月」叠加包

**计费提醒：** 每 **20 个英文单词**（或汉字）计 **1 次**。一句 60 词答案 ≈ **3 次**。

### 5. 对象存储 COS

产品页：[对象存储](https://cloud.tencent.com/product/cos)  
控制台：[COS 存储桶](https://console.cloud.tencent.com/cos/bucket)

- [ ] **创建存储桶**
  - [ ] 名称：如 `eap-pilot-audio-130xxxxxx`（全局唯一）
  - [ ] **地域**：与 Lighthouse 一致（如 **上海 `ap-shanghai`** 或 **广州 `ap-guangzhou`**）
  - [ ] 访问权限：**私有读写**（学生通过后端签名 URL 播放）
  - [ ] 版本控制：关（试点）
- [ ] **跨域 CORS**（桶 → 安全管理 → 跨域访问）  
  允许来源：试点站点 `https://你的域名` 及 `http://127.0.0.1:5051`（开发）
- [ ] **生命周期**（可选）  
  前缀 `self-study/recordings/` → **90 天后删除**（对齐产品规范）
- [ ] （可选）[新客 100GB 标准存储包 ¥9.9](https://buy.cloud.tencent.com/cos)（1 年有效，试点音频远用不完）

目录规划（开发实现时会用）：

```
self-study/tts/listening/     # 听力预生成 mp3
self-study/tts/speaking/      # 口语题目 mp3
self-study/recordings/        # 学生录音（90 天）
```

### 6. CDN（建议第二阶段再做）

控制台：[CDN 控制台](https://console.cloud.tencent.com/cdn)

- [ ] **试点可跳过**：直接用 COS **预签名 URL** 播放（开发更快）
- [ ] 正式试点对外时：
  - [ ] 添加加速域名（需 **已备案** 域名）
  - [ ] 源站指向 COS 桶
  - [ ] HTTPS 证书（腾讯云可免费申请）

### 7. 服务器环境变量（交给开发部署）

密钥写入 **Lighthouse / Render 环境变量** 或 `backend/.env`（**勿提交 Git**）。

见下文 **第四节**；配置完成后在群里告知：「SS-Sp4 密钥已写入服务器，可开始对接。」

### 8. 验收自测（下单后 10 分钟）

- [ ] CAM 密钥可调用 TTS 合成一句英文 → 得到 mp3
- [ ] mp3 上传 COS → 浏览器可播放（签名 URL）
- [ ] 上传 30s 英文 wav → ASR 返回文本
- [ ] SOE 对同一段音频返回准确度/流利度分数
- [ ] 费用中心 → 各产品 **用量统计** 有记录

---

## 三、环境变量名（SS-Sp4 约定）

复制到 `backend/.env` 或云主机环境变量（`EAP_*` 前缀与项目一致）。

```bash
# --- SS-Sp4 总开关 ---
EAP_AUDIO_ENABLED=1
# 任一项密钥缺失时，学生端回退文字稿（与当前 Web 行为一致）

# --- 腾讯云账号（TTS / ASR / SOE / COS 共用）---
EAP_TENCENT_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
EAP_TENCENT_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EAP_TENCENT_APP_ID=1300000000

# --- 地域（与 COS 桶、Lighthouse 同区）---
EAP_TENCENT_REGION=ap-shanghai

# --- COS 音频桶 ---
EAP_COS_BUCKET=eap-pilot-audio-1300000000
EAP_COS_REGION=ap-shanghai
EAP_COS_AUDIO_PREFIX=self-study/

# --- TTS（听力 + 口语播题）---
EAP_TTS_ENABLED=1
EAP_TTS_VOICE_ID=101051          # 控制台试听后填写（英音考官）
EAP_TTS_SAMPLE_RATE=16000
EAP_TTS_CODEC=mp3

# --- ASR（学生录音 → 文本）---
EAP_ASR_ENABLED=1
EAP_ASR_ENGINE=16k_en            # 雅思英文；中文题用 16k_zh

# --- SOE 口语评测（新版，PR 维度）---
EAP_SOE_ENABLED=1
EAP_SOE_APP_ID=1300000000        # 与 TENCENT_APP_ID 通常相同
EAP_SOE_ENGINE=16k_en

# --- CDN（可选；未配置则用 COS 预签名 URL）---
# EAP_CDN_AUDIO_DOMAIN=audio.your-school.example

# --- 数据保留 ---
EAP_SPEAKING_AUDIO_RETENTION_DAYS=90
```

**功能开关逻辑（开发实现时）：**

| 变量 | =0 或缺失时 |
|------|------------|
| `EAP_AUDIO_ENABLED` | 全站音频能力关闭 |
| `EAP_TTS_ENABLED` | 听力/口语仍显示文字稿 |
| `EAP_ASR_ENABLED` | 口语仅保存录音，不自动转写 |
| `EAP_SOE_ENABLED` | PR 维度仍用规则估分 + 免责声明 |

---

## 四、试点 30 人 × 1 月 — 用量假设与费用粗算

### 4.1 活跃度假设（可改）

| 指标 | 假设值 |
|------|--------|
| 注册学生 | 30 |
| 月活跃率 | 80% → **24 人** |
| 听力 | 每人 **15 篇/月**（Part 3/4 隔日，共享预生成音频） |
| 口语作答 | 每人 **15 条/月**（Part 1/2/3/模考合计） |
| 平均录音时长 | **60 秒/条**（含 Part 2 长答按 1 条计） |
| 平均作答英文词数 | **50 词/条**（SOE 计费用） |

### 4.2 各产品用量

| 产品 | 计算 | 月用量 |
|------|------|--------|
| **TTS** | 听力 30 篇 × 1,500 字符 + 口语 200 题 × 120 字符（**全员共享，一次性生成**） | **≈ 7 万字符** |
| **ASR** | 24 人 × 15 条 × 1 分钟 | **≈ 6 小时** |
| **SOE** | 24 人 × 15 条 × ⌈50÷20⌉ ≈ 3 次/条 | **≈ 1,080 次** |
| **COS 存储** | TTS ~100 MB + 录音 ~200 MB | **< 1 GB** |
| **CDN 流量** | 24 人 × 15 篇 × 2 MB 听力播放 | **≈ 0.7 GB** |

### 4.3 费用粗算（人民币）

| 产品 | 首月策略 | 粗算费用 |
|------|---------|---------|
| TTS | 领 **800 万字符免费包** | **¥0** |
| ASR | 新客 **10 小时免费**；超出 6h 仍免费 | **¥0** |
| SOE | 买 **1 万次 ¥9.9** 包 | **¥9.9**（一次性） |
| COS | 存储 <1GB 按量 | **< ¥1** |
| CDN | 试点可不用 | **¥0–2** |
| 账户预留金 | 后付费兜底 | 建议备 **¥100** 不一定会花掉 |

**试点首月合计（资源包路线）：约 ¥10–15 实花 + ¥100 账户余额预留。**

若 **不用任何免费额度**（保守上限）：

| 产品 | 单价（官网） | 上限费用 |
|------|-------------|---------|
| TTS 精品后付费 | ≈ ¥0.3/万字符 | 7 万字符 ≈ **¥0.2** |
| ASR 录音文件 | ≈ ¥1.75/小时 | 6h ≈ **¥10.5** |
| SOE 后付费 | ¥5/千次 | 1,080 次 ≈ **¥5.4** |
| COS + CDN | 按量 | **< ¥5** |
| **合计** | | **≈ ¥20–25/月** |

> 30 人同时期末冲刺、每人每天 1 次完整模考（5 步 × 3 SOE 次）× 30 天 ≈ SOE **10,800 次/月** — 仍落在 **1 万次包 + 少量后付费** 或需再买 **15 万次 ¥600** 包。正常课业节奏 **9.9 元包足够**。

### 4.4 推荐下单清单（复制给财务）

| # | 购买项 | 参考价 | 备注 |
|---|--------|--------|------|
| 1 | SOE 新版 **1 万次**资源包 | ¥9.9 | 限购 1 个，先买 |
| 2 | COS **100GB**新客存储包（可选） | ¥9.9 | 1 年有效，非必须 |
| 3 | 账户充值 | ¥100–200 | 后付费兜底 |
| 4 | TTS / ASR 免费包 | ¥0 | 控制台领取，不下单 |

**暂不买：** TTS 字符包、ASR 60h 包、SOE 并发、CDN 流量包、TRTC、VOD。

---

## 五、采购后交给开发的信息（模板）

复制填写后发回（**SecretKey 勿发微信明文**，用密码管理器或面对面录入服务器）：

```
已完成 SS-Sp4 采购：
- SecretId: AKIDxxxx（可发）
- SecretKey: 已写入服务器 .env（勿发聊天）
- AppId: 130xxxxxxx
- COS 桶: eap-pilot-audio-130xxxxxxx
- COS 地域: ap-shanghai
- TTS VoiceId: 101051（示例）
- SOE 1万次包: 已购买，余量 10000
- 账户余额: ¥xxx
```

---

## 六、合规与隐私（给学生说明前）

- [ ] 校方确认：学生 **语音可上传至腾讯云**（境内机房）
- [ ] 隐私页补充：录音用途、保留 **90 天**、仅教学评测
- [ ] 浏览器麦克风权限说明（Chrome / Safari / 微信内置浏览器差异）

---

## 七、下一步（开发）

采购与密钥就绪后，在会话中说：

> 「SS-Sp4 密钥已在 Lighthouse `.env`，开始对接 TTS + COS + ASR + SOE。」

SS-Sp4 已实现 — 见 [`SS-Sp4_SELF_STUDY_SPEAKING_AUDIO.md`](SS-Sp4_SELF_STUDY_SPEAKING_AUDIO.md)。密钥写入 Lighthouse 后执行 `docker compose up -d --build` 并做 UAT。

---

## 八、快速链接

| 用途 | 链接 |
|------|------|
| 总控制台 | https://console.cloud.tencent.com/ |
| TTS | https://console.cloud.tencent.com/tts |
| ASR | https://console.cloud.tencent.com/asr |
| SOE 新版 | https://console.cloud.tencent.com/soe |
| COS | https://console.cloud.tencent.com/cos/bucket |
| CDN | https://console.cloud.tencent.com/cdn |
| 费用账单 | https://console.cloud.tencent.com/expense/overview |
| TTS 计费说明 | https://cloud.tencent.com/document/product/1073/34112 |
| SOE 计费说明 | https://cloud.tencent.com/document/product/1774/107342 |
