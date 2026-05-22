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

    const state = boardState || MOCK.createBoardState();
    const opts = MOCK.questionOptions(q);
    const lastEvent = MOCK.formatLastEvent(state, t);
    const winnerTeam = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const winnerBanner = winnerTeam
      ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_board_winner", { team: MOCK.teamName(winnerTeam) }))}</div>`
      : "";

    const teamOptions = state.teams
      .map((team, i) => `<option value="${i}">${escapeHtml(MOCK.teamName(team))}</option>`)
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board";
    canvas.innerHTML = `
      <div class="tlive-board tlive-board--race">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_board_race_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))}</p>
        </header>
        ${winnerBanner}
        <div class="tlive-board__track-wrap">
          ${MOCK.renderTrackMarkup(state, escapeHtml)}
        </div>
        <p class="tlive-board-legend">${escapeHtml(t("tlive_board_legend"))}</p>
        <div class="tlive-board__lb-wrap">
          ${MOCK.renderLeaderboardMarkup(state, escapeHtml, t)}
        </div>
        ${lastEvent ? `<p class="tlive-board-event" aria-live="polite">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">
            ${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
          </ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-launch-q">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-view-responses">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-roll-correct" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_board_roll_correct"))}</button>
          <div class="tlive-board__manual">
            <label for="tlive-roll-team" class="tlive-board__manual-label">${escapeHtml(t("tlive_board_manual_roll"))}</label>
            <select id="tlive-roll-team" ${state.winnerId ? "disabled" : ""}>${teamOptions}</select>
            <button type="button" class="btn-secondary" id="tlive-roll-dice" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_board_roll_dice"))}</button>
          </div>
          <button type="button" class="btn-secondary" id="tlive-next-q">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-reset-board">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-launch-q")?.addEventListener("click", () => {
      launchToStudents(q, window.__tliveBoard || state);
    });

    document.getElementById("tlive-view-responses")?.addEventListener("click", () => {
      openResponsesModal(q, window.__tliveBoard || state);
    });

    document.getElementById("tlive-roll-correct")?.addEventListener("click", () => {
      const result = MOCK.processCorrectTeams(window.__tliveBoard || state, q);
      window.__tliveBoard = result.state;
      renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
    });

    document.getElementById("tlive-roll-dice")?.addEventListener("click", () => {
      const sel = document.getElementById("tlive-roll-team");
      const i = sel ? parseInt(sel.value, 10) : 0;
      const roll = MOCK.rollDice();
      window.__tliveBoard = MOCK.moveTeam(window.__tliveBoard || state, i, roll, "manual");
      renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
    });

    document.getElementById("tlive-next-q")?.addEventListener("click", () => {
      window.__tliveQuestionIndex = ((window.__tliveQuestionIndex || 0) + 1) % MOCK.MOCK_QUESTIONS.length;
      renderBoardRace(window.__tliveBoard || state, window.__tliveQuestionIndex);
    });

    document.getElementById("tlive-reset-board")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_board_reset_confirm"))) return;
      window.__tliveBoard = MOCK.createBoardState();
      window.__tliveQuestionIndex = 0;
      renderBoardRace(window.__tliveBoard, 0);
    });
  }

  function launchToStudents(question, boardState) {
    window.__tliveLaunched = {
      question,
      boardState: boardState || null,
      at: Date.now(),
    };
  }

  function buildResponsesHtml(question, boardState) {
    const MOCK = getMock();
    if (!MOCK || !question) return "";
    const rows = MOCK.simulateResponses(question);

    return `
      <p class="tlive-responses-modal__question">${escapeHtml(MOCK.questionText(question))}</p>
      <div class="tlive-responses-modal__table-wrap">
        <table class="tlive-responses-table tlive-responses-table--modal">
          <thead><tr>
            <th>${escapeHtml(t("tlive_col_student"))}</th>
            <th>${escapeHtml(t("tlive_col_team"))}</th>
            <th>${escapeHtml(t("tlive_col_answer"))}</th>
            <th>${escapeHtml(t("tlive_col_ok"))}</th>
            <th>${escapeHtml(t("tlive_col_time"))}</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((r) => {
                const team = boardState?.teams?.find((x) => x.id === r.teamId);
                const teamLabel = team ? MOCK.teamName(team) : r.teamId;
                return `<tr class="${r.correct ? "tlive-resp--correct" : ""}">
                  <td>${escapeHtml(r.student)}</td>
                  <td><span class="tlive-resp-team" style="color:${team?.color || "#333"}">${escapeHtml(teamLabel)}</span></td>
                  <td class="tlive-resp-answer">${escapeHtml(r.answer)}</td>
                  <td>${r.correct ? "✓" : "—"}</td>
                  <td>${r.timeSec}s</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="tlive-disclaimer">${escapeHtml(t("tlive_responses_mock"))}</p>
    `;
  }

  function hasBoardContext(boardState) {
    return !!(boardState && boardState.teams);
  }

  function closeResponsesModal() {
    const modal = document.getElementById("tlive-responses-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("hidden", "");
    document.body.classList.remove("tlive-modal-open");
  }

  function openResponsesModal(question, boardState) {
    const MOCK = getMock();
    const modal = document.getElementById("tlive-responses-modal");
    const body = document.getElementById("tlive-responses-modal-body");
    const foot = document.getElementById("tlive-responses-modal-foot");
    if (!MOCK || !modal || !body || !question) return;

    const board = boardState !== undefined ? boardState : window.__tliveLaunched?.boardState;
    body.innerHTML = buildResponsesHtml(question, board);

    if (foot) {
      foot.innerHTML = hasBoardContext(board)
        ? `<button type="button" class="btn-primary" id="tlive-modal-roll-correct">${escapeHtml(t("tlive_board_roll_correct"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : `<button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`;
    }

    modal.classList.remove("hidden");
    modal.removeAttribute("hidden");
    document.body.classList.add("tlive-modal-open");
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();

    document.getElementById("tlive-modal-roll-correct")?.addEventListener("click", () => {
      if (!MOCK) return;
      const result = MOCK.processCorrectTeams(window.__tliveBoard || board, question);
      window.__tliveBoard = result.state;
      renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      body.innerHTML = buildResponsesHtml(question, window.__tliveBoard);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
    document.getElementById("tlive-modal-close-btn")?.addEventListener("click", closeResponsesModal);

    document.getElementById("tlive-responses-modal-close")?.focus();
  }

  function getSavedGamesList() {
    const MOCK = getMock();
    if (!MOCK) return [];
    return MOCK.allSavedGames ? MOCK.allSavedGames() : MOCK.SAVED_GAMES;
  }

  function gameListItemHtml(g, MOCK) {
    const custom = typeof MOCK.isCustomGame === "function" && MOCK.isCustomGame(g);
    const deleteBtn = custom
      ? `<button type="button" class="btn-secondary tlive-game-delete" data-delete-game="${escapeHtml(g.id)}">${escapeHtml(t("tlive_delete_game"))}</button>`
      : "";
    return `
      <li class="tlive-games-panel__row">
        <button type="button" class="tlive-game-item tlive-games-panel__item" data-game="${escapeHtml(g.id)}">
          <strong>${escapeHtml(MOCK.gameLabel(g, "name"))}</strong>
          <span>${escapeHtml(MOCK.gameLabel(g, "desc"))}</span>
        </button>
        ${deleteBtn}
      </li>`;
  }

  function bindGameListActions(root, onPick, onAfterDelete) {
    if (!root) return;
    root.querySelectorAll("[data-game]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-game");
        if (id) onPick(id);
      });
    });
    root.querySelectorAll("[data-delete-game]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const MOCK = getMock();
        const id = btn.getAttribute("data-delete-game");
        if (!MOCK || !id || typeof MOCK.deleteCustomGame !== "function") return;
        if (!window.confirm(t("tlive_delete_confirm"))) return;
        MOCK.deleteCustomGame(id);
        if (typeof onAfterDelete === "function") onAfterDelete();
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
        <p id="tlive-games-toast" class="tlive-games-toast hidden" role="status"></p>
        <ul class="tlive-games-panel__list">
          ${games.map((g) => gameListItemHtml(g, MOCK)).join("")}
        </ul>
        <div class="tlive-games-panel__actions">
          <a class="btn-primary" href="${escapeHtml(builderHref)}">${escapeHtml(t("tlive_open_builder"))}</a>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_saved_games_hint"))}</p>
      </div>
    `;

    bindGameListActions(
      canvas,
      (id) => loadGame(id),
      () => {
        showGamesToast(t("tlive_game_deleted"));
        renderGamesLibrary();
      },
    );
  }

  function showGamesToast(text) {
    const el = document.getElementById("tlive-games-toast");
    if (el) {
      el.textContent = text;
      el.classList.remove("hidden");
    }
  }

  function showGamesTool() {
    renderGamesLibrary();
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
          const canvas = document.getElementById("tlive-canvas-inner");
          if (canvas) {
            canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
            canvas.innerHTML = `
              <div class="tlive-question-box" style="max-width:40rem;width:100%">
                <h2 style="color:#0A4D68;margin:0 0 0.75rem">${escapeHtml(t(tool === "quiz" ? "tlive_quiz_title" : "tlive_poll_title"))}</h2>
                <p>${escapeHtml(MOCK.questionText(q))}</p>
                <div class="tlive-board__controls" style="margin-top:1rem">
                  <button type="button" class="btn-primary" id="tlive-launch-poll">${escapeHtml(t("tlive_launch_question"))}</button>
                  <button type="button" class="btn-secondary" id="tlive-view-poll-responses">${escapeHtml(t("tlive_view_responses"))}</button>
                </div>
              </div>
            `;
            document.getElementById("tlive-launch-poll")?.addEventListener("click", () => launchToStudents(q, null));
            document.getElementById("tlive-view-poll-responses")?.addEventListener("click", () => openResponsesModal(q, null));
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
    const modal = document.getElementById("tlive-responses-modal");
    document.getElementById("tlive-responses-modal-close")?.addEventListener("click", closeResponsesModal);
    modal?.querySelector("[data-close-modal]")?.addEventListener("click", closeResponsesModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeResponsesModal();
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
