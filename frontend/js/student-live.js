/**
 * Student Live — join teacher session and submit poll/quiz answers (Phase L27).
 */
(function () {
  const PAGE = "student-live";
  const TEAM_KEY = "eap_live_team_id";
  const POLL_MS = 3500;

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
    pollTimer: null,
  };

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
      if (sentEl) sentEl.classList.add("hidden");
      return;
    }

    wait.classList.add("hidden");
    card.classList.remove("hidden");
    if (sentEl) sentEl.classList.add("hidden");
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

  async function refresh() {
    const api = window.EAP_LIVE_TEACHING_API;
    if (!api || !state.code) return;
    try {
      showError("");
      const data = await api.studentJoin(state.code);
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
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  function startPoll() {
    stopPoll();
    state.pollTimer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
  }

  function stopPoll() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function ensureStudentSession() {
    if (typeof ensurePageRole !== "function") {
      return typeof getLoggedInUser === "function" ? getLoggedInUser() : null;
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
      void refresh();
    });

    document.getElementById("slive-logout-btn")?.addEventListener("click", () => {
      if (typeof logoutAndGoHome === "function") logoutAndGoHome();
      else window.location.href = "index.html";
    });

    void (async () => {
      try {
        const user = await ensureStudentSession();
        if (!user) return;
        await refresh();
        startPoll();
      } catch (err) {
        showError(err.message || String(err));
      }
    })();

    window.addEventListener("beforeunload", stopPoll);
    window.addEventListener("eap:langchange", () => {
      renderTeamPick();
      void refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
