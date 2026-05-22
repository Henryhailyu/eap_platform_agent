/**
 * Teacher Live Teaching Page (Phase L2–L7, L9 — mock).
 */
(function () {
  const PAGE = "teacher-live";
  const MOCK = window.EAP_TEACHER_LIVE_MOCK;

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

  function setActiveTool(toolId) {
    document.querySelectorAll(".tlive-tool").forEach((btn) => {
      btn.classList.toggle("tlive-tool--active", btn.getAttribute("data-tool") === toolId);
    });
  }

  function renderWelcome(ctx) {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas) return;
    canvas.className = "tlive-canvas__inner";
    canvas.innerHTML = `
      <h2 style="color:#0A4D68;margin:0 0 0.5rem">${t("tlive_welcome_title")}</h2>
      <p style="color:#6e6e73;max-width:28rem">${t("tlive_welcome_lead")}</p>
      <p style="font-size:0.875rem;color:#6e6e73">${t("tlive_context", { class: ctx.className, date: ctx.date || "—" })}</p>
      <p class="tlive-disclaimer">${t("tlive_mock_disclaimer")}</p>
    `;
  }

  function renderBoardRace(boardState, questionIndex) {
    const canvas = document.getElementById("tlive-canvas-inner");
    const q = MOCK.MOCK_QUESTIONS[questionIndex % MOCK.MOCK_QUESTIONS.length];
    if (!canvas || !q) return;

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    const teamsHtml = boardState.teams
      .map(
        (team, i) => `
        <div class="tlive-board__team">
          <h3>${team.name}</h3>
          <div class="tlive-board__track"><div class="tlive-board__fill" style="width:${team.progress}%"></div></div>
          <div class="tlive-board__score">${team.score}</div>
          <button type="button" class="btn-secondary tlive-score-btn" data-team="${i}" style="margin-top:0.5rem;font-size:0.75rem">${t("tlive_award_point")}</button>
        </div>
      `,
      )
      .join("");

    const opts = MOCK.questionOptions(q);
    canvas.innerHTML = `
      <div class="tlive-board">
        <h2 style="color:#0A4D68;margin:0 0 1rem">${t("tlive_board_race_title")}</h2>
        <div class="tlive-board__teams">${teamsHtml}</div>
        <div class="tlive-question-box">
          <p style="font-weight:600;margin:0 0 0.75rem">${t("tlive_current_question")}</p>
          <p style="margin:0 0 0.75rem">${MOCK.questionText(q)}</p>
          <ol style="margin:0;padding-left:1.25rem;text-align:left">
            ${opts.map((o) => `<li>${o}</li>`).join("")}
          </ol>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <button type="button" class="btn-primary" id="tlive-launch-q">${t("tlive_launch_question")}</button>
          <button type="button" class="btn-secondary" id="tlive-next-q">${t("tlive_next_question")}</button>
        </div>
        <p class="tlive-disclaimer">${t("tlive_mock_disclaimer")}</p>
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
    const panel = document.getElementById("tlive-panel-right");
    const body = document.getElementById("tlive-panel-body");
    if (!panel || !body) return;
    panel.classList.remove("hidden");

    const rows = MOCK.simulateResponses(question);
    body.innerHTML = `
      <p style="font-size:0.8125rem;margin:0 0 0.75rem">${MOCK.questionText(question)}</p>
      <table class="tlive-responses-table">
        <thead><tr><th>${t("tlive_col_student")}</th><th>${t("tlive_col_answer")}</th><th>${t("tlive_col_ok")}</th><th>${t("tlive_col_time")}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.student}</td><td>${r.answer}</td><td>${r.correct ? "✓" : "—"}</td><td>${r.timeSec}s</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="tlive-disclaimer">${t("tlive_responses_mock")}</p>
    `;
  }

  function openGamesModal() {
    const modal = document.getElementById("tlive-games-modal");
    const list = document.getElementById("tlive-games-list");
    if (!modal || !list) return;
    const games = MOCK.allSavedGames ? MOCK.allSavedGames() : MOCK.SAVED_GAMES;
    list.innerHTML = games.map(
      (g) =>
        `<li><button type="button" class="tlive-game-item" data-game="${g.id}"><strong>${MOCK.gameLabel(g, "name")}</strong><span>${MOCK.gameLabel(g, "desc")}</span></button></li>`,
    ).join("");
    modal.classList.remove("hidden");
    list.querySelectorAll(".tlive-game-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-game");
        modal.classList.add("hidden");
        loadGame(id);
      });
    });
  }

  function loadGame(gameId) {
    const games = MOCK.allSavedGames ? MOCK.allSavedGames() : MOCK.SAVED_GAMES;
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
      canvas.className = "tlive-canvas__inner";
      canvas.innerHTML = `
        <h2 style="color:#0A4D68">${MOCK.gameLabel(game, "name")}</h2>
        <p>${MOCK.gameLabel(game, "desc")}</p>
        <p class="tlive-disclaimer">${t("tlive_game_soon")}</p>
      `;
    }
  }

  function bindToolbar(ctx) {
    document.querySelectorAll(".tlive-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.getAttribute("data-tool");
        setActiveTool(tool);
        if (tool === "games") openGamesModal();
        else if (tool === "slides") renderWelcome(ctx);
        else if (tool === "poll" || tool === "quiz") {
          const q = MOCK.MOCK_QUESTIONS[0];
          showInteractionPanel(q);
          const canvas = document.getElementById("tlive-canvas-inner");
          if (canvas) {
            canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
            canvas.innerHTML = `
              <div class="tlive-question-box" style="max-width:32rem;width:100%">
                <h2 style="color:#0A4D68;margin:0 0 0.75rem">${t("tlive_poll_title")}</h2>
                <p>${MOCK.questionText(q)}</p>
                <button type="button" class="btn-primary" id="tlive-launch-poll" style="margin-top:1rem">${t("tlive_launch_question")}</button>
              </div>
            `;
            document.getElementById("tlive-launch-poll")?.addEventListener("click", () => showInteractionPanel(q));
          }
        } else {
          const canvas = document.getElementById("tlive-canvas-inner");
          if (canvas) {
            canvas.className = "tlive-canvas__inner";
            canvas.innerHTML = `<p>${t("tlive_tool_soon")}</p><p class="tlive-disclaimer">${t("tlive_mock_disclaimer")}</p>`;
          }
        }
      });
    });
  }

  function bindModal() {
    document.getElementById("tlive-games-close")?.addEventListener("click", () => {
      document.getElementById("tlive-games-modal")?.classList.add("hidden");
    });
    document.getElementById("tlive-games-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "tlive-games-modal") e.target.classList.add("hidden");
    });
    document.getElementById("tlive-panel-close")?.addEventListener("click", () => {
      document.getElementById("tlive-panel-right")?.classList.add("hidden");
    });
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (window.EAP_TEACHER_LIVE_ENABLED === false) {
      window.location.replace("teacher.html");
      return;
    }
    if (!MOCK) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const sessionUser = await validatePageSessionOrFallback("teacher");
    if (!sessionUser) return;

    initAppPageHeader();

    const ctx = contextFromUrl();
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

    window.addEventListener("eap:langchange", () => {
      if (window.__tliveBoard) {
        renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      } else {
        renderWelcome(ctx);
      }
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
