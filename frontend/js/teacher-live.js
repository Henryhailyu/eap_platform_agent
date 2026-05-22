/**
 * Teacher Live Teaching Page (Phase L2–L12 — mock).
 */
(function () {
  const PAGE = "teacher-live";

  function getMock() {
    return window.EAP_TEACHER_LIVE_MOCK || null;
  }

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function contextFromUrl() {
    const p = new URLSearchParams(window.location.search);
    return {
      className: p.get("class_name") || "EAP047",
      date: p.get("date") || "",
      taskId: p.get("task_id") || "",
    };
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Logout + welcome — runs immediately (not after async session). */
  function initPageChrome() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && logoutBtn.dataset.eapBound !== "1") {
      logoutBtn.dataset.eapBound = "1";
      logoutBtn.addEventListener("click", () => {
        if (typeof logoutAndGoHome === "function") {
          logoutAndGoHome();
        } else {
          try {
            if (typeof authStorageRemoveAll === "function") authStorageRemoveAll();
          } catch (_) {
            /* ignore */
          }
          window.location.href = "index.html";
        }
      });
    }

    const welcomeEl = document.getElementById("header-welcome");
    if (welcomeEl && typeof getLoggedInUser === "function") {
      const user = getLoggedInUser();
      if (user) {
        const name = user.full_name || user.username || "User";
        welcomeEl.textContent = t("welcome_user", { name });
      }
    }
  }

  function showBootError(message) {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    canvas.innerHTML = `
      <div class="tlive-boot-error">
        <h2 style="color:#0A4D68;margin:0 0 0.5rem">${escapeHtml(t("tlive_boot_error_title"))}</h2>
        <p>${escapeHtml(message)}</p>
        <p style="margin-top:1rem"><a class="btn-primary" href="index.html">${escapeHtml(t("tlive_boot_login_link"))}</a></p>
      </div>
    `;
  }

  function setActiveTool(toolId) {
    document.querySelectorAll(".tlive-tool").forEach((btn) => {
      btn.classList.toggle("tlive-tool--active", btn.getAttribute("data-tool") === toolId);
    });
  }

  function renderWelcome(ctx) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !MOCK) return;
    canvas.className = "tlive-canvas__inner";
    canvas.innerHTML = `
      <h2 style="color:#0A4D68;margin:0 0 0.5rem">${escapeHtml(t("tlive_welcome_title"))}</h2>
      <p style="color:#6e6e73;max-width:28rem">${escapeHtml(t("tlive_welcome_lead"))}</p>
      <p style="font-size:0.875rem;color:#6e6e73">${escapeHtml(t("tlive_context", { class: ctx.className, date: ctx.date || "—" }))}</p>
      <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
    `;
  }

  function renderBoardRace(boardState, questionIndex) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;
    const q = MOCK.MOCK_QUESTIONS[questionIndex % MOCK.MOCK_QUESTIONS.length];
    if (!q) return;

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    const teamsHtml = boardState.teams
      .map(
        (team, i) => `
        <div class="tlive-board__team">
          <h3>${escapeHtml(team.name)}</h3>
          <div class="tlive-board__track"><div class="tlive-board__fill" style="width:${team.progress}%"></div></div>
          <div class="tlive-board__score">${team.score}</div>
          <button type="button" class="btn-secondary tlive-score-btn" data-team="${i}" style="margin-top:0.5rem;font-size:0.75rem">${escapeHtml(t("tlive_award_point"))}</button>
        </div>
      `,
      )
      .join("");

    const opts = MOCK.questionOptions(q);
    canvas.innerHTML = `
      <div class="tlive-board">
        <h2 style="color:#0A4D68;margin:0 0 1rem">${escapeHtml(t("tlive_board_race_title"))}</h2>
        <div class="tlive-board__teams">${teamsHtml}</div>
        <div class="tlive-question-box">
          <p style="font-weight:600;margin:0 0 0.75rem">${escapeHtml(t("tlive_current_question"))}</p>
          <p style="margin:0 0 0.75rem">${escapeHtml(MOCK.questionText(q))}</p>
          <ol style="margin:0;padding-left:1.25rem;text-align:left">
            ${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
          </ol>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <button type="button" class="btn-primary" id="tlive-launch-q">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-next-q">${escapeHtml(t("tlive_next_question"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    canvas.querySelectorAll(".tlive-score-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-team"), 10);
        window.__tliveBoard = MOCK.scoreBoardTeam(window.__tliveBoard || MOCK.createBoardState(), i);
        renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      });
    });
    document.getElementById("tlive-next-q")?.addEventListener("click", () => {
      window.__tliveQuestionIndex = ((window.__tliveQuestionIndex || 0) + 1) % MOCK.MOCK_QUESTIONS.length;
      renderBoardRace(window.__tliveBoard || MOCK.createBoardState(), window.__tliveQuestionIndex);
    });
    document.getElementById("tlive-launch-q")?.addEventListener("click", () => {
      showInteractionPanel(q);
    });
  }

  function showInteractionPanel(question) {
    const MOCK = getMock();
    const panel = document.getElementById("tlive-panel-right");
    const body = document.getElementById("tlive-panel-body");
    if (!MOCK || !panel || !body || !question) return;
    panel.classList.remove("hidden");

    const rows = MOCK.simulateResponses(question);
    body.innerHTML = `
      <p style="font-size:0.8125rem;margin:0 0 0.75rem">${escapeHtml(MOCK.questionText(question))}</p>
      <table class="tlive-responses-table">
        <thead><tr><th>${escapeHtml(t("tlive_col_student"))}</th><th>${escapeHtml(t("tlive_col_answer"))}</th><th>${escapeHtml(t("tlive_col_ok"))}</th><th>${escapeHtml(t("tlive_col_time"))}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.student)}</td><td>${escapeHtml(r.answer)}</td><td>${r.correct ? "✓" : "—"}</td><td>${r.timeSec}s</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="tlive-disclaimer">${escapeHtml(t("tlive_responses_mock"))}</p>
    `;
  }

  function getSavedGamesList() {
    const MOCK = getMock();
    if (!MOCK) return [];
    return MOCK.allSavedGames ? MOCK.allSavedGames() : MOCK.SAVED_GAMES;
  }

  function bindGamePickers(root, onPick) {
    if (!root) return;
    root.querySelectorAll("[data-game]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-game");
        if (id) onPick(id);
      });
    });
  }

  function renderGamesLibrary() {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !MOCK) return;
    const games = getSavedGamesList();
    const builderHref = "teacher-game-builder.html" + (window.location.search || "");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    canvas.innerHTML = `
      <div class="tlive-games-panel">
        <h2 class="tlive-games-panel__title">${escapeHtml(t("tlive_saved_games"))}</h2>
        <p class="tlive-games-panel__lead">${escapeHtml(t("tlive_games_canvas_lead"))}</p>
        <ul class="tlive-games-panel__list">
          ${games
            .map(
              (g) => `
            <li>
              <button type="button" class="tlive-game-item tlive-games-panel__item" data-game="${escapeHtml(g.id)}">
                <strong>${escapeHtml(MOCK.gameLabel(g, "name"))}</strong>
                <span>${escapeHtml(MOCK.gameLabel(g, "desc"))}</span>
              </button>
            </li>`,
            )
            .join("")}
        </ul>
        <div class="tlive-games-panel__actions">
          <a class="btn-primary" href="${escapeHtml(builderHref)}">${escapeHtml(t("tlive_open_builder"))}</a>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_saved_games_hint"))}</p>
      </div>
    `;

    bindGamePickers(canvas, (id) => {
      closeGamesModal();
      loadGame(id);
    });
  }

  function ensureGamesModalPortal() {
    const modal = document.getElementById("tlive-games-modal");
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  }

  function closeGamesModal() {
    document.getElementById("tlive-games-modal")?.classList.add("hidden");
  }

  function openGamesModal() {
    const MOCK = getMock();
    ensureGamesModalPortal();
    const modal = document.getElementById("tlive-games-modal");
    const list = document.getElementById("tlive-games-list");
    if (!MOCK || !modal || !list) return;
    const games = getSavedGamesList();
    list.innerHTML = games
      .map(
        (g) =>
          `<li><button type="button" class="tlive-game-item" data-game="${escapeHtml(g.id)}"><strong>${escapeHtml(MOCK.gameLabel(g, "name"))}</strong><span>${escapeHtml(MOCK.gameLabel(g, "desc"))}</span></button></li>`,
      )
      .join("");
    modal.classList.remove("hidden");
    bindGamePickers(modal, (id) => {
      closeGamesModal();
      loadGame(id);
    });
  }

  function showGamesTool() {
    renderGamesLibrary();
    openGamesModal();
  }

  function loadGame(gameId) {
    const MOCK = getMock();
    if (!MOCK) return;
    const games = getSavedGamesList();
    const game = games.find((g) => g.id === gameId);
    if (!game) return;
    setActiveTool("games");
    if (game.type === "board_race") {
      window.__tliveBoard = MOCK.createBoardState();
      window.__tliveQuestionIndex = 0;
      renderBoardRace(window.__tliveBoard, 0);
      return;
    }
    const canvas = document.getElementById("tlive-canvas-inner");
    if (canvas) {
      canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
      canvas.innerHTML = `
        <h2 style="color:#0A4D68">${escapeHtml(MOCK.gameLabel(game, "name"))}</h2>
        <p>${escapeHtml(MOCK.gameLabel(game, "desc"))}</p>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_game_soon"))}</p>
      `;
    }
  }

  function bindToolbar(ctx) {
    document.querySelectorAll(".tlive-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const MOCK = getMock();
        if (!MOCK) {
          showBootError(t("tlive_boot_mock_missing"));
          return;
        }
        const tool = btn.getAttribute("data-tool");
        setActiveTool(tool);
        if (tool === "games") showGamesTool();
        else if (tool === "slides") renderWelcome(ctx);
        else if (tool === "poll" || tool === "quiz") {
          const q = MOCK.MOCK_QUESTIONS[0];
          showInteractionPanel(q);
          const canvas = document.getElementById("tlive-canvas-inner");
          if (canvas) {
            canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
            canvas.innerHTML = `
              <div class="tlive-question-box" style="max-width:32rem;width:100%">
                <h2 style="color:#0A4D68;margin:0 0 0.75rem">${escapeHtml(t(tool === "quiz" ? "tlive_quiz_title" : "tlive_poll_title"))}</h2>
                <p>${escapeHtml(MOCK.questionText(q))}</p>
                <button type="button" class="btn-primary" id="tlive-launch-poll" style="margin-top:1rem">${escapeHtml(t("tlive_launch_question"))}</button>
              </div>
            `;
            document.getElementById("tlive-launch-poll")?.addEventListener("click", () => showInteractionPanel(q));
          }
        } else {
          const canvas = document.getElementById("tlive-canvas-inner");
          if (canvas) {
            canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
            canvas.innerHTML = `<p>${escapeHtml(t("tlive_tool_soon"))}</p><p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>`;
          }
        }
      });
    });
  }

  function bindModal() {
    document.getElementById("tlive-games-close")?.addEventListener("click", closeGamesModal);
    document.getElementById("tlive-games-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "tlive-games-modal") closeGamesModal();
    });
    document.getElementById("tlive-panel-close")?.addEventListener("click", () => {
      document.getElementById("tlive-panel-right")?.classList.add("hidden");
    });
  }

  function initLiveUi(ctx) {
    const titleEl = document.getElementById("tlive-session-title");
    const metaEl = document.getElementById("tlive-session-meta");
    if (titleEl) titleEl.textContent = t("tlive_page_title");
    if (metaEl) {
      metaEl.textContent = t("tlive_context", { class: ctx.className, date: ctx.date || "—" });
    }

    const back = document.getElementById("tlive-back");
    if (back) {
      const q = new URLSearchParams();
      if (ctx.className) q.set("class", ctx.className);
      back.href = `teacher.html${q.toString() ? `?${q.toString()}` : ""}`;
    }

    ensureGamesModalPortal();
    bindToolbar(ctx);
    bindModal();
    setActiveTool("slides");
    renderWelcome(ctx);
  }

  function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (window.EAP_TEACHER_LIVE_ENABLED === false) {
      window.location.replace("teacher.html");
      return;
    }
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    initPageChrome();

    if (!getMock()) {
      showBootError(t("tlive_boot_mock_missing"));
      return;
    }

    const ctx = contextFromUrl();
    initLiveUi(ctx);

    window.addEventListener("eap:langchange", () => {
      const active = document.querySelector(".tlive-tool--active");
      const tool = active ? active.getAttribute("data-tool") : "slides";
      if (tool === "games" && !window.__tliveBoard) renderGamesLibrary();
      else if (window.__tliveBoard) renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      else if (tool === "slides") renderWelcome(ctx);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      initPageChrome();
    });

    void (async () => {
      try {
        if (typeof validatePageSessionOrFallback !== "function") return;
        const sessionUser = await validatePageSessionOrFallback("teacher");
        if (!sessionUser) return;
        if (typeof initAppPageHeader === "function") initAppPageHeader();
        initPageChrome();
      } catch (_) {
        showBootError(t("tlive_boot_session_hint"));
      }
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
