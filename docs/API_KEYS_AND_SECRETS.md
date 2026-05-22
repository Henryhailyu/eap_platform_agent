# API keys and secrets — how to work with the agent

**Last updated:** 2026-05-22

This project is built **mock-first**. You do **not** need any API key for the current pilot (calendar, self-study S1–S6, Teacher Live mocks).

When you are ready for **real AI** (Phase K), **TTS**, **STT**, or other paid services, follow this workflow.

---

## What does NOT need keys today

| Feature | Status |
|---------|--------|
| Calendar / tasks / submissions | Live — no AI keys |
| Student Self-Study S1–S6 | Mock only — no keys |
| Teacher Live L2–L9 (this batch) | Mock only — no keys |
| Placement / feedback text | Rule-based templates |

---

## Golden rules (never break these)

1. **Never paste API keys in chat** if you can avoid it — prefer environment variables on your machine or host.
2. **Never commit** keys to git (no keys in `app.py`, HTML, or `api-config.js`).
3. **Never** store keys in the WeChat mini `config.js` or frontend bundles.
4. Use **separate keys** for development vs production (Render).
5. Tell the agent **which provider** you chose (OpenAI, Azure OpenAI, etc.) and **which features** should use it first.

---

## Recommended way to give the agent access

### Option A — Local development (best for testing)

1. Copy `eap_platform_agent/.env.example` → `eap_platform_agent/backend/.env`
2. Add lines (example names only — we will wire exact names in Phase K):

```bash
# Phase K — example placeholders (do not commit real values)
# EAP_OPENAI_API_KEY=sk-...
# EAP_AI_PROVIDER=openai
# EAP_AI_MODEL=gpt-4o-mini
```

3. Tell the agent: *“OpenAI key is in `backend/.env` as `EAP_OPENAI_API_KEY`. Implement Phase K vocabulary explain only.”*
4. The agent reads `.env` only locally; **`.env` must stay in `.gitignore`** (already standard).

### Option B — Render production

1. Render dashboard → your service → **Environment**
2. Add secret variables (e.g. `EAP_OPENAI_API_KEY`)
3. Redeploy
4. Tell the agent: *“Production key is set in Render env as `EAP_OPENAI_API_KEY`; code must read from `os.environ` only.”*

### Option C — You paste in chat (last resort)

- Only for a **one-off test**
- **Rotate/revoke** the key after testing if it was exposed
- Ask the agent to put it in `.env` locally, not in source files

---

## What to decide before Phase K (your product choices)

| Decision | Why it matters |
|----------|----------------|
| Provider (OpenAI / Azure / school gateway) | SDK and compliance |
| Data policy (can student text leave campus?) | May block cloud LLM |
| First feature (e.g. vocabulary explain vs game generation) | Smallest safe slice |
| Budget / rate limits | Model choice and caching |
| Languages (EN + 中文) | Prompt and model support |

Document your answers in [`VISION_AI_MATERIALS.md`](VISION_AI_MATERIALS.md) (or send a Word/PDF spec). The agent will implement **one slice** after approval.

---

## TTS / STT (later)

| Service | Typical env var | Used for |
|---------|-----------------|----------|
| Text-to-speech | `EAP_TTS_API_KEY` or vendor-specific | Listening module audio |
| Speech-to-text | `EAP_STT_API_KEY` | Speaking recording |

**Not started** until S5/S6 audio paths are approved and a host for audio files exists.

---

## What the agent will ask you when keys are needed

1. Which **provider** and **model**?
2. **Development only** or **production** too?
3. Is **student data** allowed to be sent to the vendor (yes/no/anon)?
4. **First approved feature** (one sentence scope)?
5. Confirm keys are in **`.env` or Render env**, not in git.

---

## Checklist before enabling real AI on the pilot URL

- [ ] Keys only in environment variables  
- [ ] `.env` not committed  
- [ ] Render secrets set (if production)  
- [ ] Rate limiting / error handling planned  
- [ ] Privacy note for students (school policy)  
- [ ] Feature flag to disable AI if key missing (`EAP_AI_ENABLED=0`)  
- [ ] Manual test on one class with demo accounts  

---

## Current step (no keys)

**Teacher Live Teaching** (Phase L, mock) and optional **push to Render** for student self-study — **no API keys required**.

When you have a provider choice and policy approval, say: *“Ready for Phase K — key is in backend/.env”* and we will plan the smallest real-AI slice.
