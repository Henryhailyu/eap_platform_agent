/**
 * Student Live — join teacher session and submit poll/quiz answers (Phase L27–L29).
 */
(function () {
  const PAGE = "student-live";
  const TEAM_KEY = "eap_live_team_id";

  function t(key, vars) {
    if (window.EAP_I18N && typeof window.EAP_I18N.t === "function") {
      return window.EAP_I18N.t(key, vars);
    }
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sessionCodeFromUrl() {
    const p = new URLSearchParams(window.location.search);
    return (p.get("code") || "").trim().toUpperCase();
  }

  function isZh() {
    return !!(window.EAP_I18N && window.EAP_I18N.getLang() === "zh");
  }

  function questionText(q) {
    return isZh() ? q.textZh || q.textEn : q.textEn || q.textZh;
  }

  function questionOptions(q) {
    const zh = isZh();
    const opts = zh ? q.optionsZh : q.optionsEn;
    if (opts && opts.length) return opts;
    return zh ? q.optionsEn : q.optionsZh;
  }

  function normalizeGameType(raw) {
    const tpe = String(raw || "poll")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");
    return /^[a-z0-9_]+$/.test(tpe) ? tpe : "poll";
  }

  function gameI18nKey(gameType, suffix) {
    return `slive_game_${normalizeGameType(gameType)}${suffix ? `_${suffix}` : ""}`;
  }

  function gameLabel(q) {
    const type = normalizeGameType(q && q.gameType);
    const key = gameI18nKey(type);
    const label = t(key);
    return label !== key ? label : t("slive_game_poll");
  }

  function gameStudentPrompt(q) {
    const type = normalizeGameType(q && q.gameType);
    const key = gameI18nKey(type, "prompt");
    const msg = t(key);
    return msg !== key ? msg : t("slive_game_poll_prompt");
  }

  function formatGameContext(q) {
    const c = q && q.context;
    if (!c || typeof c !== "object") return "";
    const type = normalizeGameType(q.gameType);
    if (type === "board_race" && c.round != null) {
      return t("slive_ctx_round", { round: String(c.round) });
    }
    if (c.round != null && type !== "poll" && type !== "quiz") {
      return t("slive_ctx_round", { round: String(c.round) });
    }
    if (type === "sentence_builder" && c.puzzleIndex != null) {
      return t("slive_ctx_puzzle", {
        n: String(Number(c.puzzleIndex) + 1),
        total: String(c.puzzleTotal != null ? c.puzzleTotal : 3),
      });
    }
    return "";
  }

  function renderGameChrome(q) {
    const badge = document.getElementById("slive-game-badge");
    const prompt = document.getElementById("slive-game-prompt");
    const ctxEl = document.getElementById("slive-game-context");
    const card = document.getElementById("slive-question");
    if (!badge || !prompt || !ctxEl) return;

    const type = normalizeGameType(q && q.gameType);
    badge.textContent = gameLabel(q);
    badge.classList.remove("hidden");
    badge.removeAttribute("aria-hidden");
    badge.dataset.gameType = type;

    const ctxText = formatGameContext(q);
    if (ctxText) {
      ctxEl.textContent = ctxText;
      ctxEl.classList.remove("hidden");
      ctxEl.removeAttribute("aria-hidden");
    } else {
      ctxEl.textContent = "";
      ctxEl.classList.add("hidden");
      ctxEl.setAttribute("aria-hidden", "true");
    }

    const promptText = gameStudentPrompt(q);
    if (promptText) {
      prompt.textContent = promptText;
      prompt.classList.remove("hidden");
      prompt.removeAttribute("aria-hidden");
    } else {
      prompt.textContent = "";
      prompt.classList.add("hidden");
      prompt.setAttribute("aria-hidden", "true");
    }

    if (card) {
      card.classList.remove("slive-question--poll", "slive-question--game");
      card.classList.add(type === "poll" || type === "quiz" ? "slive-question--poll" : "slive-question--game");
    }
  }

  function clearGameChrome() {
    ["slive-game-badge", "slive-game-prompt", "slive-game-context"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = "";
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    });
    const card = document.getElementById("slive-question");
    if (card) card.classList.remove("slive-question--poll", "slive-question--game");
  }

  function getTeamId() {
    try {
      const id = sessionStorage.getItem(TEAM_KEY);
      return id && /^[ABCD]$/.test(id) ? id : null;
    } catch (_) {
      return null;
    }
  }

  function setTeamId(id) {
    try {
      sessionStorage.setItem(TEAM_KEY, id);
    } catch (_) {
      /* ignore */
    }
  }

  const state = {
    code: "",
    teamId: null,
    launchId: null,
    pollAbort: null,
    polling: false,
  };

  function formatLiveError(err) {
    const code = err && err.code;
    const status = err && err.httpStatus;
    const msg = (err && err.message) || "";
    if (code === "live_not_found" || status === 404 || msg === "Session not found") {
      return t("slive_session_not_found", { code: state.code });
    }
    if (msg === "LIVE_ROUTE_OR_SESSION_NOT_FOUND") {
      return t("slive_api_restart");
    }
    return msg || String(err);
  }

  function showError(msg, opts) {
    const el = document.getElementById("slive-error");
    const hint = document.getElementById("slive-logout-hint");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove("hidden");
      if (hint) {
        if (opts && opts.showLogout) hint.classList.remove("hidden");
        else hint.classList.add("hidden");
      }
    } else {
      el.textContent = "";
      el.classList.add("hidden");
      if (hint) hint.classList.add("hidden");
    }
  }

  function renderTeamPick() {
    const wrap = document.getElementById("slive-team-pick");
    const teams = document.getElementById("slive-teams");
    if (!wrap || !teams) return;
    const colors = { A: "#0071E3", B: "#0A7EA4", C: "#FF9500", D: "#AF52DE" };
    const labels = {
      A: t("slive_team_a"),
      B: t("slive_team_b"),
      C: t("slive_team_c"),
      D: t("slive_team_d"),
    };
    teams.innerHTML = ["A", "B", "C", "D"]
      .map(
        (id) =>
          `<button type="button" class="btn-secondary slive-team-btn${state.teamId === id ? " slive-team-btn--active" : ""}" data-team="${id}" style="border-color:${colors[id]}">${escapeHtml(labels[id])}</button>`,
      )
      .join("");
    wrap.classList.remove("hidden");
    teams.querySelectorAll("[data-team]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.teamId = btn.getAttribute("data-team");
        setTeamId(state.teamId);
        renderTeamPick();
      });
    });
  }

  function renderQuestion(payload) {
    const wait = document.getElementById("slive-wait");
    const card = document.getElementById("slive-question");
    const textEl = document.getElementById("slive-question-text");
    const optsEl = document.getElementById("slive-options");
    const sentEl = document.getElementById("slive-sent");
    if (!wait || !card || !textEl || !optsEl) return;

    const q = payload.question;
    if (!q) {
      wait.classList.remove("hidden");
      card.classList.add("hidden");
      clearGameChrome();
      if (sentEl) sentEl.classList.add("hidden");
      return;
    }

    wait.classList.add("hidden");
    card.classList.remove("hidden");
    if (sentEl) sentEl.classList.add("hidden");
    renderGameChrome(q);
    textEl.textContent = questionText(q);
    const opts = questionOptions(q);
    optsEl.innerHTML = opts
      .map(
        (label, i) =>
          `<button type="button" class="btn-primary slive-opt-btn" data-answer="${i}">${escapeHtml(label)}</button>`,
      )
      .join("");

    optsEl.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!state.teamId) {
          showError(t("slive_need_team"));
          return;
        }
        const api = window.EAP_LIVE_TEACHING_API;
        if (!api) {
          showError(t("slive_api_missing"));
          return;
        }
        btn.disabled = true;
        try {
          const idx = parseInt(btn.getAttribute("data-answer"), 10);
          const result = await api.studentRespond(state.code, state.teamId, idx);
          if (sentEl) {
            sentEl.textContent = result.correct
              ? t("slive_sent_ok")
              : t("slive_sent_done");
            sentEl.classList.remove("hidden");
          }
          optsEl.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
          });
        } catch (err) {
          showError(err.message || String(err));
          btn.disabled = false;
        }
      });
    });
  }

  function applyJoinPayload(data) {
    const meta = document.getElementById("slive-meta");
    if (meta) {
      meta.textContent = t("slive_meta", {
        class: data.class_name || "—",
        code: data.session_code || state.code,
      });
    }
    if (data.launch_id !== state.launchId) {
      state.launchId = data.launch_id;
      const sentEl = document.getElementById("slive-sent");
      if (sentEl) sentEl.classList.add("hidden");
    }
    renderQuestion(data);
  }

  async function refreshOnce() {
    const api = window.EAP_LIVE_TEACHING_API;
    if (!api || !state.code) return;
    showError("");
    const data = await api.studentJoin(state.code);
    applyJoinPayload(data);
  }

  function stopPoll() {
    state.polling = false;
    if (state.pollAbort) {
      state.pollAbort.abort();
      state.pollAbort = null;
    }
  }

  async function startPoll() {
    const api = window.EAP_LIVE_TEACHING_API;
    if (!api || !state.code) return;
    stopPoll();
    state.polling = true;

    const fallbackMs = api.FALLBACK_POLL_MS || 4000;

    while (state.polling) {
      const controller = new AbortController();
      state.pollAbort = controller;
      const hidden = typeof document !== "undefined" && document.hidden;
      try {
        showError("");
        let data;
        if (hidden) {
          data = await api.studentJoin(state.code);
        } else if (typeof api.studentJoinWait === "function") {
          data = await api.studentJoinWait(state.code, state.launchId, controller.signal);
        } else {
          data = await api.studentJoin(state.code);
        }
        applyJoinPayload(data);
      } catch (err) {
        if (err && err.name === "AbortError") break;
        showError(formatLiveError(err));
        await new Promise((r) => window.setTimeout(r, fallbackMs));
      } finally {
        if (state.pollAbort === controller) state.pollAbort = null;
      }
      if (!state.polling) break;
      if (hidden) {
        await new Promise((r) => window.setTimeout(r, fallbackMs));
      }
    }
  }

  async function ensureStudentSession() {
    if (typeof ensurePageRole !== "function") {
      return typeof getLoggedInUser === "function" ? getLoggedInUser() : null;
    }

    if (typeof validateSatelliteSessionOrGate === "function") {
      const user = await validateSatelliteSessionOrGate("student");
      if (user) return user;
      return null;
    }

    const result = await ensurePageRole("student");
    if (result.ok) return result.user;

    if (result.reason === "wrong_role") {
      if (typeof renderWrongRoleGate === "function") {
        renderWrongRoleGate(result.user.role);
      } else {
        showError(t("slive_wrong_role"), { showLogout: true });
      }
      return null;
    }

    if (result.redirect) {
      window.location.replace(result.redirect);
      return null;
    }

    showError(t("slive_login_required"));
    return null;
  }

  function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    if (window.EAP_I18N && typeof window.EAP_I18N.init === "function") {
      window.EAP_I18N.init();
    }

    state.code = sessionCodeFromUrl();
    state.teamId = getTeamId();
    renderTeamPick();

    if (!state.code) {
      const codePick = document.getElementById("slive-code-pick");
      const wait = document.getElementById("slive-wait");
      if (codePick) codePick.classList.remove("hidden");
      if (wait) wait.classList.add("hidden");
      document.getElementById("slive-code-form")?.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const raw = (document.getElementById("slive-code-input")?.value || "").trim();
        if (!raw) {
          showError(t("slive_no_code"));
          return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("code", raw.toUpperCase());
        window.location.replace(url.toString());
      });
      document.getElementById("slive-logout-btn")?.addEventListener("click", () => {
        if (typeof logoutAndGoHome === "function") logoutAndGoHome();
        else window.location.href = "index.html";
      });
      void ensureStudentSession();
      return;
    }

    document.getElementById("slive-refresh")?.addEventListener("click", () => {
      void refreshOnce().catch((err) => showError(formatLiveError(err)));
    });

    document.getElementById("slive-logout-btn")?.addEventListener("click", () => {
      if (typeof logoutAndGoHome === "function") logoutAndGoHome();
      else window.location.href = "index.html";
    });

    void (async () => {
      try {
        const user = await ensureStudentSession();
        if (!user) return;
        await refreshOnce();
        void startPoll();
      } catch (err) {
        showError(formatLiveError(err));
      }
    })();

    window.addEventListener("beforeunload", stopPoll);
    document.addEventListener("visibilitychange", () => {
      if (!state.code || !state.polling) return;
      if (!document.hidden) {
        void refreshOnce().catch(() => {});
      }
    });

    window.addEventListener("eap:langchange", () => {
      renderTeamPick();
      void refreshOnce().catch(() => {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
