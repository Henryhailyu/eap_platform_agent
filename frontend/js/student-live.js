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
    displayVersion: 0,
    displayMode: "",
    payloadFingerprint: "",
    pollAbort: null,
    polling: false,
    lastSyncAt: 0,
  };

  function formatSyncTime(ts) {
    const d = new Date(ts || Date.now());
    try {
      const lang = window.EAP_I18N && window.EAP_I18N.getLang() === "zh" ? "zh-CN" : "en-GB";
      return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (_) {
      return d.toLocaleTimeString();
    }
  }

  function payloadFingerprint(data) {
    if (!data) return "";
    const q = data.question;
    const d = data.display || {};
    const displayPart = `${d.mode || ""}|${d.version != null ? d.version : ""}|${d.page_id || ""}`;
    if (!q) return `wait:${data.session_code || state.code || ""}|${displayPart}`;
    const opts = Array.isArray(q.optionsEn) ? q.optionsEn.join("\x1e") : "";
    return [
      data.launch_id != null ? String(data.launch_id) : "",
      normalizeGameType(q.gameType),
      q.textEn || q.textZh || "",
      opts,
      displayPart,
    ].join("|");
  }

  function showStudentFileDisplay(display, lesson, lessonFrame, lessonTitle, wait, slides, hintEl) {
    const fileUrl = display.file_url;
    const downloadUrl = display.download_url || fileUrl;
    const previewPdfUrl = display.preview_pdf_url || "";
    const ext = display.file_ext || "";
    const title = display.title || display.upload_label || t("slive_material_title");
    if (wait) wait.classList.add("hidden");
    if (slides) slides.classList.add("hidden");
    if (lesson) lesson.classList.remove("hidden");
    if (lessonTitle) lessonTitle.textContent = title;
    if (hintEl) hintEl.classList.add("hidden");

    const actions = document.getElementById("slive-lesson-actions");
    const downloadA = document.getElementById("slive-lesson-download");
    const dlFn = window.EAP_fileDownloadUrl;
    const dlUrl = typeof dlFn === "function" ? dlFn(downloadUrl) : downloadUrl;
    if (actions && downloadA) {
      downloadA.href = dlUrl;
      downloadA.textContent = t("slive_download_file");
      actions.classList.remove("hidden");
    }

    const mount = window.EAP_mountFileViewer;
    const mode = window.EAP_fileDisplayMode ? window.EAP_fileDisplayMode(ext) : "download";
    const wrap = document.getElementById("slive-file-viewer");
    if (wrap && typeof mount === "function") {
      wrap.classList.remove("hidden");
      let viewExt = ext;
      let viewPreview = previewPdfUrl;
      if (!viewPreview && String(display.mode || "").toLowerCase() === "pdf" && fileUrl) {
        viewPreview = fileUrl;
        viewExt = "pdf";
      }
      void mount(wrap, {
        url: downloadUrl,
        downloadUrl,
        previewPdfUrl: viewPreview,
        ext: viewExt,
        title,
        downloadLabel: t("slive_download_file"),
        openLabel: t("slive_open_file"),
        previewHint: t("slive_preview_unavailable_hint"),
      });
      if (lessonFrame) {
        lessonFrame.classList.add("hidden");
        lessonFrame.removeAttribute("src");
        lessonFrame.removeAttribute("srcdoc");
      }
      return;
    }

    if (wrap) wrap.classList.add("hidden");
    if (lessonFrame) {
      lessonFrame.classList.remove("hidden");
      lessonFrame.removeAttribute("srcdoc");
      const viewSrc = previewPdfUrl || (mode === "pdf" || mode === "text" ? fileUrl : "");
      if (viewSrc) {
        lessonFrame.src = viewSrc;
      } else {
        lessonFrame.removeAttribute("src");
      }
    }
  }

  async function renderLiveDisplay(data) {
    const display = (data && data.display) || {};
    const mode = String(display.mode || "welcome").toLowerCase();
    const wait = document.getElementById("slive-wait");
    const lesson = document.getElementById("slive-lesson");
    const slides = document.getElementById("slive-slides");
    const lessonTitle = document.getElementById("slive-lesson-title");
    const lessonFrame = document.getElementById("slive-lesson-frame");
    const hintEl = document.getElementById("slive-lesson-hint");

    if (mode === "html" && display.page_id) {
      if (wait) wait.classList.add("hidden");
      if (slides) slides.classList.add("hidden");
      if (lesson) lesson.classList.remove("hidden");
      if (lessonTitle) lessonTitle.textContent = display.title || t("slive_lesson_title");
      const fileWrap = document.getElementById("slive-file-viewer");
      if (fileWrap) {
        fileWrap.classList.add("hidden");
        fileWrap.innerHTML = "";
      }
      const actions = document.getElementById("slive-lesson-actions");
      if (actions) actions.classList.add("hidden");
      const api = window.EAP_LIVE_TEACHING_API;
      if (api && lessonFrame && typeof api.studentFetchLesson === "function") {
        try {
          lessonFrame.classList.remove("hidden");
          lessonFrame.removeAttribute("src");
          const payload = await api.studentFetchLesson(state.code);
          if (payload.html) {
            lessonFrame.srcdoc = payload.html;
            const count =
              typeof window.EAP_countLessonActivities === "function"
                ? window.EAP_countLessonActivities(payload.html)
                : 0;
            if (hintEl) {
              if (count) {
                hintEl.textContent = t("slive_lesson_interactive_hint");
                hintEl.classList.remove("hidden");
              } else {
                hintEl.textContent = t("slive_lesson_no_interactive");
                hintEl.classList.remove("hidden");
              }
            }
          }
        } catch (_) {
          /* keep previous frame */
        }
      }
      return;
    }

    const fileModes = ["pdf", "text", "presentation", "office", "material"];
    if (fileModes.includes(mode) && display.file_url) {
      showStudentFileDisplay(display, lesson, lessonFrame, lessonTitle, wait, slides, hintEl);
      return;
    }

    if (mode === "slides" || mode === "welcome") {
      if (lesson) lesson.classList.add("hidden");
      if (lessonFrame) {
        lessonFrame.removeAttribute("srcdoc");
        lessonFrame.removeAttribute("src");
      }
      if (slides) {
        slides.classList.remove("hidden");
        slides.innerHTML = `<p>${escapeHtml(t("slive_slides_wait"))}</p>`;
      }
      if (wait && !data.question) wait.classList.add("hidden");
      return;
    }

    if (lesson) lesson.classList.add("hidden");
    if (slides) slides.classList.add("hidden");
    if (!data.question && wait) wait.classList.remove("hidden");
  }

  function updateSyncStatus(data, opts) {
    const el = document.getElementById("slive-sync-status");
    if (!el) return;
    state.lastSyncAt = Date.now();
    if (opts && opts.manual) {
      el.textContent = t("slive_sync_updated", { time: formatSyncTime(state.lastSyncAt) });
      el.dataset.state = "updated";
    } else if (data && data.question) {
      el.textContent = t("slive_sync_live");
      el.dataset.state = "live";
    } else {
      el.textContent = t("slive_sync_waiting");
      el.dataset.state = "waiting";
    }
    el.classList.remove("hidden");
  }

  function setSyncListening() {
    const el = document.getElementById("slive-sync-status");
    if (!el) return;
    el.textContent = t("slive_sync_listening");
    el.dataset.state = "listening";
    el.classList.remove("hidden");
  }

  function ensurePollRunning() {
    if (!state.code || state.polling) return;
    void startPoll();
  }

  function formatLiveError(err) {
    const code = err && err.code;
    const status = err && err.httpStatus;
    const msg = (err && err.message) || "";
    if (status === 401 || /not logged in/i.test(msg)) {
      return t("slive_login_required");
    }
    if (status === 403 || /wrong role|forbidden|student only/i.test(msg)) {
      return t("slive_wrong_role");
    }
    if (code === "live_not_found" || status === 404 || msg === "Session not found") {
      return t("slive_session_not_found", { code: state.code });
    }
    if (msg === "LIVE_ROUTE_OR_SESSION_NOT_FOUND") {
      return t("slive_api_restart");
    }
    return msg || String(err);
  }

  function showLiveError(err) {
    const status = err && err.httpStatus;
    const msg = (err && err.message) || "";
    const wrongRole =
      status === 403 || /wrong role|forbidden|student only|signed in as a teacher/i.test(msg);
    showError(formatLiveError(err), { showLogout: wrongRole });
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
    const fp = payloadFingerprint(data);
    const contentChanged = fp !== state.payloadFingerprint;
    if (data.launch_id !== state.launchId || contentChanged) {
      state.launchId = data.launch_id;
      state.payloadFingerprint = fp;
      const sentEl = document.getElementById("slive-sent");
      if (sentEl) sentEl.classList.add("hidden");
    }
    if (data.display) {
      state.displayVersion = data.display.version != null ? data.display.version : state.displayVersion;
      state.displayMode = data.display.mode || state.displayMode;
    }
    void renderLiveDisplay(data);
    renderQuestion(data);
    updateSyncStatus(data);
  }

  async function refreshOnce(manual) {
    const api = window.EAP_LIVE_TEACHING_API;
    if (!api || !state.code) return;
    showError("");
    const data = await api.studentJoin(state.code);
    applyJoinPayload(data);
    if (manual) updateSyncStatus(data, { manual: true });
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
    setSyncListening();

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
        } else if (typeof api.studentJoinWaitDisplay === "function") {
          try {
            data = await api.studentJoinWaitDisplay(state.code, state.displayVersion, controller.signal);
          } catch (waitErr) {
            if (waitErr && waitErr.name === "AbortError") throw waitErr;
            data = await api.studentJoinWait(state.code, state.launchId, controller.signal);
          }
        } else if (typeof api.studentJoinWait === "function") {
          data = await api.studentJoinWait(state.code, state.launchId, controller.signal);
        } else {
          data = await api.studentJoin(state.code);
        }
        applyJoinPayload(data);
      } catch (err) {
        if (err && err.name === "AbortError") break;
        showLiveError(err);
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
      void refreshOnce(true)
        .then(() => ensurePollRunning())
        .catch((err) => showLiveError(err));
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
        showLiveError(err);
      }
    })();

    window.addEventListener("beforeunload", stopPoll);
    window.addEventListener("pageshow", () => {
      if (!state.code) return;
      void refreshOnce()
        .then(() => ensurePollRunning())
        .catch((err) => showLiveError(err));
    });
    document.addEventListener("visibilitychange", () => {
      if (!state.code || document.hidden) return;
      void refreshOnce()
        .then(() => ensurePollRunning())
        .catch(() => {});
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
