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

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
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
      const rankingMode = window.__tliveRanking && !window.__tliveRanking.winnerId;
      const debateMode = window.__tliveDebate && !window.__tliveDebate.winnerId && !rankingMode;
      const hotSeatMode = window.__tliveHotSeat && !window.__tliveHotSeat.winnerId && !debateMode && !rankingMode;
      const memoryMode =
        window.__tliveMemory && !window.__tliveMemory.winnerId && !hotSeatMode && !debateMode && !rankingMode;
      const summaryMode = window.__tliveSummary && !window.__tliveSummary.winnerId && !memoryMode;
      const argumentMode =
        window.__tliveArgument && !window.__tliveArgument.winnerId && !summaryMode && !memoryMode;
      const sentenceMode =
        window.__tliveSentence && !window.__tliveSentence.winnerId && !argumentMode && !summaryMode && !memoryMode;
      const ladderMode =
        window.__tliveLadder &&
        !window.__tliveLadder.winnerId &&
        !sentenceMode &&
        !argumentMode &&
        !summaryMode &&
        !memoryMode;
      const escapeMode =
        window.__tliveEscape &&
        !window.__tliveEscape.winnerId &&
        !ladderMode &&
        !sentenceMode &&
        !argumentMode &&
        !summaryMode &&
        !memoryMode;
      const treasureMode =
        window.__tliveTreasure &&
        !window.__tliveTreasure.winnerId &&
        !escapeMode &&
        !ladderMode &&
        !sentenceMode &&
        !argumentMode &&
        !summaryMode &&
        !memoryMode;
      const quizMode =
        window.__tliveQuiz &&
        !window.__tliveQuiz.winnerId &&
        !treasureMode &&
        !escapeMode &&
        !ladderMode &&
        !sentenceMode &&
        !argumentMode &&
        !summaryMode &&
        !memoryMode;
      const boardMode =
        hasBoardContext(board) &&
        !quizMode &&
        !treasureMode &&
        !escapeMode &&
        !ladderMode &&
        !sentenceMode &&
        !argumentMode &&
        !summaryMode &&
        !memoryMode;
      foot.innerHTML = rankingMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-ranking-score">${escapeHtml(t("tlive_ranking_award_btn"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : debateMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-debate-score">${escapeHtml(t("tlive_debate_award_btn"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : hotSeatMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-hotseat-score">${escapeHtml(t("tlive_hotseat_award_btn"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : memoryMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-memory-score">${escapeHtml(t("tlive_memory_award_btn"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : summaryMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-summary-score">${escapeHtml(t("tlive_summary_award"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : argumentMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-argument-score">${escapeHtml(t("tlive_argument_award"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : sentenceMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-sentence-score">${escapeHtml(t("tlive_sentence_award"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : ladderMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-ladder-climb">${escapeHtml(t("tlive_ladder_climb"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : escapeMode
        ? `<button type="button" class="btn-primary" id="tlive-modal-escape-score">${escapeHtml(t("tlive_escape_score_complete"))}</button>
           <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
        : treasureMode
          ? `<button type="button" class="btn-primary" id="tlive-modal-treasure-score">${escapeHtml(t("tlive_treasure_score_unlock"))}</button>
             <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
          : quizMode
          ? `<button type="button" class="btn-primary" id="tlive-modal-quiz-award">${escapeHtml(t("tlive_quiz_award_correct"))}</button>
             <button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`
          : boardMode
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

    document.getElementById("tlive-modal-quiz-award")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveQuiz) return;
      window.__tliveQuiz = MOCK.processQuizResponses(window.__tliveQuiz, question);
      renderQuizBattle(window.__tliveQuiz);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-treasure-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveTreasure) return;
      window.__tliveTreasure = MOCK.processTreasureResponses(window.__tliveTreasure, question);
      renderTreasureHunt(window.__tliveTreasure);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-escape-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveEscape) return;
      window.__tliveEscape = MOCK.processEscapeResponses(window.__tliveEscape, question);
      renderEscapeRoom(window.__tliveEscape);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-ladder-climb")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveLadder) return;
      window.__tliveLadder = MOCK.processWordLadderResponses(window.__tliveLadder, question);
      renderWordLadder(window.__tliveLadder);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-sentence-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveSentence) return;
      window.__tliveSentence = MOCK.processSentenceResponses(window.__tliveSentence, question);
      renderSentenceBuilder(window.__tliveSentence);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-argument-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveArgument) return;
      window.__tliveArgument = MOCK.processArgumentResponses(window.__tliveArgument, question);
      renderArgumentSorting(window.__tliveArgument);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-summary-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveSummary) return;
      window.__tliveSummary = MOCK.processSummaryResponses(window.__tliveSummary, question);
      renderSummaryMission(window.__tliveSummary);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-memory-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveMemory) return;
      window.__tliveMemory = MOCK.processMemoryResponses(window.__tliveMemory, question);
      renderMemoryCard(window.__tliveMemory);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-hotseat-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveHotSeat) return;
      window.__tliveHotSeat = MOCK.processHotSeatResponses(window.__tliveHotSeat, question);
      renderHotSeat(window.__tliveHotSeat);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-debate-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveDebate) return;
      window.__tliveDebate = MOCK.processDebateResponses(window.__tliveDebate, question);
      renderDebateCards(window.__tliveDebate);
      openResponsesModal(question, null);
    });

    document.getElementById("tlive-modal-ranking-score")?.addEventListener("click", () => {
      if (!MOCK || !window.__tliveRanking) return;
      window.__tliveRanking = MOCK.processRankingResponses(window.__tliveRanking, question);
      renderRankingChallenge(window.__tliveRanking);
      openResponsesModal(question, null);
    });
    document.getElementById("tlive-modal-close-btn")?.addEventListener("click", closeResponsesModal);

    document.getElementById("tlive-responses-modal-close")?.focus();
  }

  function clearLiveGameState() {
    window.__tliveBoard = null;
    window.__tliveBingo = null;
    window.__tliveMatching = null;
    window.__tliveQuiz = null;
    window.__tliveTreasure = null;
    window.__tliveEscape = null;
    window.__tliveLadder = null;
    window.__tliveSentence = null;
    window.__tliveArgument = null;
    window.__tliveSummary = null;
    window.__tliveMemory = null;
    window.__tliveHotSeat = null;
    window.__tliveDebate = null;
    window.__tliveRanking = null;
    window.__tliveQuestionIndex = 0;
  }

  function renderQuizBattle(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const challenge = MOCK.isChallengeRound(state.questionIndex);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatQuizEvent(state, t);

    const scoreRows = MOCK.getQuizRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget}</td>
        </tr>`;
      })
      .join("");

    const teamAwardBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-quiz-award-btn" data-quiz-award="${team.id}" data-pts="${challenge ? 2 : 1}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+${challenge ? 2 : 1} ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-quiz">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_quiz_battle_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))}${challenge ? ` · ${escapeHtml(t("tlive_quiz_challenge"))}` : ""}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_board_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-quiz-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-quiz-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-quiz-score-resp" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_quiz_award_correct"))}</button>
        </div>
        <div class="tlive-quiz-manual">${teamAwardBtns}</div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-quiz-next">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-quiz-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-quiz-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-quiz-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-quiz-score-resp")?.addEventListener("click", () => {
      window.__tliveQuiz = MOCK.processQuizResponses(window.__tliveQuiz, q);
      renderQuizBattle(window.__tliveQuiz);
    });

    canvas.querySelectorAll("[data-quiz-award]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-quiz-award");
        const pts = parseInt(btn.getAttribute("data-pts"), 10) || 1;
        window.__tliveQuiz = MOCK.awardQuizPoints(window.__tliveQuiz, teamId, pts);
        renderQuizBattle(window.__tliveQuiz);
      });
    });

    document.getElementById("tlive-quiz-next")?.addEventListener("click", () => {
      window.__tliveQuiz = {
        ...window.__tliveQuiz,
        questionIndex: (window.__tliveQuiz.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
        round: window.__tliveQuiz.round + 1,
      };
      renderQuizBattle(window.__tliveQuiz);
    });

    document.getElementById("tlive-quiz-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_board_reset_confirm"))) return;
      window.__tliveQuiz = MOCK.createQuizBattleState();
      renderQuizBattle(window.__tliveQuiz);
    });
  }

  function renderTreasureHunt(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatTreasureEvent(state, t);
    const allClues = state.unlockedCount >= MOCK.TREASURE_CLUE_COUNT;
    const clueProgress = t("tlive_treasure_progress", {
      n: String(state.unlockedCount),
      total: String(MOCK.TREASURE_CLUE_COUNT),
    });

    const scoreRows = MOCK.getTreasureRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget} ${escapeHtml(t("tlive_treasure_keys"))}</td>
        </tr>`;
      })
      .join("");

    const keyBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-treasure-key-btn" data-treasure-key="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-treasure">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_treasure_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(clueProgress)}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_treasure_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_treasure_keys_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderTreasureCluesMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-treasure-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-treasure-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-treasure-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_treasure_score_unlock"))}</button>
        </div>
        <div class="tlive-treasure-manual">${keyBtns}
          <button type="button" class="btn-secondary" id="tlive-treasure-unlock" ${allClues ? "disabled" : ""}>${escapeHtml(t("tlive_treasure_reveal_clue"))}</button>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-treasure-next">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-treasure-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-treasure-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-treasure-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-treasure-score")?.addEventListener("click", () => {
      window.__tliveTreasure = MOCK.processTreasureResponses(window.__tliveTreasure, q);
      renderTreasureHunt(window.__tliveTreasure);
    });

    canvas.querySelectorAll("[data-treasure-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-treasure-key");
        window.__tliveTreasure = MOCK.awardTreasureKey(window.__tliveTreasure, teamId, 1);
        renderTreasureHunt(window.__tliveTreasure);
      });
    });

    document.getElementById("tlive-treasure-unlock")?.addEventListener("click", () => {
      window.__tliveTreasure = MOCK.unlockTreasureClue(window.__tliveTreasure);
      renderTreasureHunt(window.__tliveTreasure);
    });

    document.getElementById("tlive-treasure-next")?.addEventListener("click", () => {
      window.__tliveTreasure = {
        ...window.__tliveTreasure,
        questionIndex: (window.__tliveTreasure.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
        round: window.__tliveTreasure.round + 1,
      };
      renderTreasureHunt(window.__tliveTreasure);
    });

    document.getElementById("tlive-treasure-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_treasure_reset_confirm"))) return;
      window.__tliveTreasure = MOCK.createTreasureHuntState();
      renderTreasureHunt(window.__tliveTreasure);
    });
  }

  function renderEscapeRoom(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatEscapeEvent(state, t);
    const allTasks = state.completedCount >= MOCK.ESCAPE_TASK_COUNT;
    const taskProgress = t("tlive_escape_progress", {
      n: String(state.completedCount),
      total: String(MOCK.ESCAPE_TASK_COUNT),
    });

    const scoreRows = MOCK.getEscapeRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget} ${escapeHtml(t("tlive_escape_tasks"))}</td>
        </tr>`;
      })
      .join("");

    const taskBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-escape-task-btn" data-escape-task="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-escape">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_escape_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(taskProgress)} · ${escapeHtml(MOCK.escapePasswordDisplay(state))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_escape_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_escape_tasks_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderEscapeRoomMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-escape-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-escape-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-escape-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_escape_score_complete"))}</button>
        </div>
        <div class="tlive-escape-manual">${taskBtns}
          <button type="button" class="btn-secondary" id="tlive-escape-complete" ${allTasks ? "disabled" : ""}>${escapeHtml(t("tlive_escape_complete_task"))}</button>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-escape-next">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-escape-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-escape-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-escape-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-escape-score")?.addEventListener("click", () => {
      window.__tliveEscape = MOCK.processEscapeResponses(window.__tliveEscape, q);
      renderEscapeRoom(window.__tliveEscape);
    });

    canvas.querySelectorAll("[data-escape-task]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-escape-task");
        window.__tliveEscape = MOCK.awardEscapeTask(window.__tliveEscape, teamId, 1);
        renderEscapeRoom(window.__tliveEscape);
      });
    });

    document.getElementById("tlive-escape-complete")?.addEventListener("click", () => {
      window.__tliveEscape = MOCK.completeEscapeTask(window.__tliveEscape);
      renderEscapeRoom(window.__tliveEscape);
    });

    document.getElementById("tlive-escape-next")?.addEventListener("click", () => {
      window.__tliveEscape = {
        ...window.__tliveEscape,
        questionIndex: (window.__tliveEscape.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
        round: window.__tliveEscape.round + 1,
      };
      renderEscapeRoom(window.__tliveEscape);
    });

    document.getElementById("tlive-escape-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_escape_reset_confirm"))) return;
      window.__tliveEscape = MOCK.createEscapeRoomState();
      renderEscapeRoom(window.__tliveEscape);
    });
  }

  function renderWordLadder(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const ladder = MOCK.getWordLadderSet(state);
    const steps = MOCK.ladderSteps(ladder);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatWordLadderEvent(state, t);
    const maxRung = MOCK.ladderWinRung(ladder);
    const ladderPrompt = MOCK.ladderNextPrompt(state);

    const scoreRows = MOCK.getWordLadderRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        const word = steps[row.score] || steps[0];
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${escapeHtml(word)} (${row.score + 1}/${steps.length})</td>
        </tr>`;
      })
      .join("");

    const climbBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-ladder-climb-btn" data-ladder-climb="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    const switchBtns = MOCK.WORD_LADDER_SETS.map((set, idx) => {
      const label = MOCK.ladderFamilyLabel(set);
      const active = idx === state.ladderIndex;
      return `<button type="button" class="btn-secondary ${active ? "tlive-ladder-switch--active" : ""}" data-ladder-switch="${idx}">${escapeHtml(label)}</button>`;
    }).join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-ladder">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_ladder_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(MOCK.ladderFamilyLabel(ladder))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_ladder_winner", { team: MOCK.teamName(winner), word: steps[maxRung] }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_ladder_rung_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderWordLadderMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_ladder_next_word"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(ladderPrompt)}</p>
          <p class="tlive-question-box__label" style="margin-top:0.75rem">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-ladder-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-ladder-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-ladder-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_ladder_climb"))}</button>
        </div>
        <div class="tlive-ladder-manual">${climbBtns}</div>
        <div class="tlive-ladder-switch">${switchBtns}</div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-ladder-next">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-ladder-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-ladder-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-ladder-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-ladder-score")?.addEventListener("click", () => {
      window.__tliveLadder = MOCK.processWordLadderResponses(window.__tliveLadder, q);
      renderWordLadder(window.__tliveLadder);
    });

    canvas.querySelectorAll("[data-ladder-climb]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-ladder-climb");
        window.__tliveLadder = MOCK.climbLadderRung(window.__tliveLadder, teamId, 1);
        renderWordLadder(window.__tliveLadder);
      });
    });

    canvas.querySelectorAll("[data-ladder-switch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-ladder-switch"), 10);
        window.__tliveLadder = MOCK.switchWordLadder(window.__tliveLadder, idx);
        renderWordLadder(window.__tliveLadder);
      });
    });

    document.getElementById("tlive-ladder-next")?.addEventListener("click", () => {
      window.__tliveLadder = {
        ...window.__tliveLadder,
        questionIndex: (window.__tliveLadder.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
        round: window.__tliveLadder.round + 1,
      };
      renderWordLadder(window.__tliveLadder);
    });

    document.getElementById("tlive-ladder-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_ladder_reset_confirm"))) return;
      window.__tliveLadder = MOCK.createWordLadderState(state.ladderIndex);
      renderWordLadder(window.__tliveLadder);
    });
  }

  function renderSentenceBuilder(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const puzzle = MOCK.getSentencePuzzle(state);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatSentenceEvent(state, t);
    const puzzleNum = (state.puzzleIndex % MOCK.SENTENCE_PUZZLE_COUNT) + 1;

    const scoreRows = MOCK.getSentenceRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget}</td>
        </tr>`;
      })
      .join("");

    const pointBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-sentence-pt-btn" data-sentence-pt="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-sentence">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_sentence_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(t("tlive_sentence_puzzle_n", { n: String(puzzleNum), total: String(MOCK.SENTENCE_PUZZLE_COUNT) }))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_sentence_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderSentenceBuilderMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-sentence-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-sentence-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-sentence-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_sentence_award"))}</button>
        </div>
        <div class="tlive-sentence-manual">${pointBtns}
          <button type="button" class="btn-secondary" id="tlive-sentence-reveal" ${state.answerRevealed ? "disabled" : ""}>${escapeHtml(t("tlive_sentence_reveal"))}</button>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-sentence-next-puzzle">${escapeHtml(t("tlive_sentence_next"))}</button>
          <button type="button" class="btn-secondary" id="tlive-sentence-next-q">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-sentence-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-sentence-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-sentence-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-sentence-score")?.addEventListener("click", () => {
      window.__tliveSentence = MOCK.processSentenceResponses(window.__tliveSentence, q);
      renderSentenceBuilder(window.__tliveSentence);
    });

    canvas.querySelectorAll("[data-sentence-pt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-sentence-pt");
        window.__tliveSentence = MOCK.awardSentencePoint(window.__tliveSentence, teamId, 1);
        renderSentenceBuilder(window.__tliveSentence);
      });
    });

    document.getElementById("tlive-sentence-reveal")?.addEventListener("click", () => {
      window.__tliveSentence = MOCK.revealSentenceAnswer(window.__tliveSentence);
      renderSentenceBuilder(window.__tliveSentence);
    });

    document.getElementById("tlive-sentence-next-puzzle")?.addEventListener("click", () => {
      window.__tliveSentence = MOCK.nextSentencePuzzle(window.__tliveSentence);
      renderSentenceBuilder(window.__tliveSentence);
    });

    document.getElementById("tlive-sentence-next-q")?.addEventListener("click", () => {
      window.__tliveSentence = {
        ...window.__tliveSentence,
        questionIndex: (window.__tliveSentence.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
      };
      renderSentenceBuilder(window.__tliveSentence);
    });

    document.getElementById("tlive-sentence-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_sentence_reset_confirm"))) return;
      window.__tliveSentence = MOCK.createSentenceBuilderState(state.puzzleIndex);
      renderSentenceBuilder(window.__tliveSentence);
    });
  }

  function renderArgumentSorting(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const argSet = MOCK.getArgumentSet(state);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatArgumentEvent(state, t);
    const setNum = (state.setIndex % MOCK.ARGUMENT_SET_COUNT) + 1;

    const scoreRows = MOCK.getArgumentRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget}</td>
        </tr>`;
      })
      .join("");

    const pointBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-argument-pt-btn" data-argument-pt="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-argument">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_argument_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(t("tlive_argument_set_n", { n: String(setNum), total: String(MOCK.ARGUMENT_SET_COUNT) }))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_argument_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderArgumentSortingMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-argument-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-argument-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-argument-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_argument_award"))}</button>
        </div>
        <div class="tlive-argument-manual">${pointBtns}
          <button type="button" class="btn-secondary" id="tlive-argument-reveal" ${state.structureRevealed ? "disabled" : ""}>${escapeHtml(t("tlive_argument_reveal"))}</button>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-argument-next-set">${escapeHtml(t("tlive_argument_next"))}</button>
          <button type="button" class="btn-secondary" id="tlive-argument-next-q">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-argument-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-argument-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-argument-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-argument-score")?.addEventListener("click", () => {
      window.__tliveArgument = MOCK.processArgumentResponses(window.__tliveArgument, q);
      renderArgumentSorting(window.__tliveArgument);
    });

    canvas.querySelectorAll("[data-argument-pt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-argument-pt");
        window.__tliveArgument = MOCK.awardArgumentPoint(window.__tliveArgument, teamId, 1);
        renderArgumentSorting(window.__tliveArgument);
      });
    });

    document.getElementById("tlive-argument-reveal")?.addEventListener("click", () => {
      window.__tliveArgument = MOCK.revealArgumentStructure(window.__tliveArgument);
      renderArgumentSorting(window.__tliveArgument);
    });

    document.getElementById("tlive-argument-next-set")?.addEventListener("click", () => {
      window.__tliveArgument = MOCK.nextArgumentSet(window.__tliveArgument);
      renderArgumentSorting(window.__tliveArgument);
    });

    document.getElementById("tlive-argument-next-q")?.addEventListener("click", () => {
      window.__tliveArgument = {
        ...window.__tliveArgument,
        questionIndex: (window.__tliveArgument.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
      };
      renderArgumentSorting(window.__tliveArgument);
    });

    document.getElementById("tlive-argument-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_argument_reset_confirm"))) return;
      window.__tliveArgument = MOCK.createArgumentSortingState(state.setIndex);
      renderArgumentSorting(window.__tliveArgument);
    });
  }

  function renderSummaryMission(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const mission = MOCK.getSummaryMission(state);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatSummaryEvent(state, t);
    const stepProgress = t("tlive_summary_progress", {
      n: String(state.completedSteps),
      total: String(MOCK.SUMMARY_STEP_COUNT),
    });

    const scoreRows = MOCK.getSummaryRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget} ${escapeHtml(t("tlive_summary_steps"))}</td>
        </tr>`;
      })
      .join("");

    const stepBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="btn-secondary tlive-summary-step-btn" data-summary-step="${team.id}" ${state.winnerId ? "disabled" : ""} style="border-color:${team.color}">+1 ${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-summary">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_summary_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(stepProgress)}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_summary_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_summary_steps_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        ${MOCK.renderSummaryMissionMarkup(state, t)}
        <div class="tlive-question-box">
          <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
          <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
          <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-summary-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-summary-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
          <button type="button" class="btn-primary" id="tlive-summary-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_summary_award"))}</button>
        </div>
        <div class="tlive-summary-manual">${stepBtns}
          <button type="button" class="btn-secondary" id="tlive-summary-complete" ${state.completedSteps >= MOCK.SUMMARY_STEP_COUNT ? "disabled" : ""}>${escapeHtml(t("tlive_summary_complete_step"))}</button>
          <button type="button" class="btn-secondary" id="tlive-summary-reveal" ${state.finalRevealed ? "disabled" : ""}>${escapeHtml(t("tlive_summary_reveal_final"))}</button>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-summary-next-mission">${escapeHtml(t("tlive_summary_next_mission_btn"))}</button>
          <button type="button" class="btn-secondary" id="tlive-summary-next-q">${escapeHtml(t("tlive_next_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-summary-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    document.getElementById("tlive-summary-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-summary-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-summary-score")?.addEventListener("click", () => {
      window.__tliveSummary = MOCK.processSummaryResponses(window.__tliveSummary, q);
      renderSummaryMission(window.__tliveSummary);
    });

    canvas.querySelectorAll("[data-summary-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const teamId = btn.getAttribute("data-summary-step");
        window.__tliveSummary = MOCK.awardSummaryStep(window.__tliveSummary, teamId, 1);
        renderSummaryMission(window.__tliveSummary);
      });
    });

    document.getElementById("tlive-summary-complete")?.addEventListener("click", () => {
      window.__tliveSummary = MOCK.completeSummaryMissionStep(window.__tliveSummary);
      renderSummaryMission(window.__tliveSummary);
    });

    document.getElementById("tlive-summary-reveal")?.addEventListener("click", () => {
      window.__tliveSummary = MOCK.revealSummaryFinal(window.__tliveSummary);
      renderSummaryMission(window.__tliveSummary);
    });

    document.getElementById("tlive-summary-next-mission")?.addEventListener("click", () => {
      window.__tliveSummary = MOCK.nextSummaryMission(window.__tliveSummary);
      renderSummaryMission(window.__tliveSummary);
    });

    document.getElementById("tlive-summary-next-q")?.addEventListener("click", () => {
      window.__tliveSummary = {
        ...window.__tliveSummary,
        questionIndex: (window.__tliveSummary.questionIndex + 1) % MOCK.MOCK_QUESTIONS.length,
      };
      renderSummaryMission(window.__tliveSummary);
    });

    document.getElementById("tlive-summary-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_summary_reset_confirm"))) return;
      window.__tliveSummary = MOCK.createSummaryMissionState(state.missionIndex);
      renderSummaryMission(window.__tliveSummary);
    });
  }

  function renderRankingChallenge(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const rankSet = MOCK.getRankingSet(state);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatRankingEvent(state, t);
    const setNum = (state.setIndex % MOCK.RANKING_SET_COUNT) + 1;

    const scoreRows = MOCK.getRankChallengeRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget}</td>
        </tr>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-ranking tlive-stage-fill">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_ranking_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(MOCK.rankingSetTitle(rankSet))} (${setNum}/${MOCK.RANKING_SET_COUNT})</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_ranking_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-stage-hero">${MOCK.renderRankingChallengeMarkup(state, t)}</div>
        <div class="tlive-stage-footer">
          <div class="tlive-question-box">
            <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
            <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
            <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
          </div>
          <div class="tlive-board__controls">
            <button type="button" class="btn-primary" id="tlive-ranking-launch">${escapeHtml(t("tlive_launch_question"))}</button>
            <button type="button" class="btn-secondary" id="tlive-ranking-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
            <button type="button" class="btn-primary" id="tlive-ranking-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_ranking_award_btn"))}</button>
            <button type="button" class="btn-secondary" id="tlive-ranking-reset">${escapeHtml(t("tlive_board_reset"))}</button>
          </div>
          <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
        </div>
      </div>
    `;

    document.getElementById("tlive-ranking-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-ranking-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-ranking-score")?.addEventListener("click", () => {
      window.__tliveRanking = MOCK.processRankingResponses(window.__tliveRanking, q);
      renderRankingChallenge(window.__tliveRanking);
    });

    canvas.querySelectorAll("[data-ranking-pt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveRanking = MOCK.awardRankingPoint(
          window.__tliveRanking,
          btn.getAttribute("data-ranking-pt"),
          1,
        );
        renderRankingChallenge(window.__tliveRanking);
      });
    });

    document.getElementById("tlive-ranking-reveal")?.addEventListener("click", () => {
      window.__tliveRanking = MOCK.revealRankingOrder(window.__tliveRanking);
      renderRankingChallenge(window.__tliveRanking);
    });

    document.getElementById("tlive-ranking-shuffle")?.addEventListener("click", () => {
      window.__tliveRanking = MOCK.reshuffleRankingDisplay(window.__tliveRanking);
      renderRankingChallenge(window.__tliveRanking);
    });

    document.getElementById("tlive-ranking-next-set")?.addEventListener("click", () => {
      window.__tliveRanking = MOCK.nextRankingSet(window.__tliveRanking);
      renderRankingChallenge(window.__tliveRanking);
    });

    document.getElementById("tlive-ranking-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_ranking_reset_confirm"))) return;
      window.__tliveRanking = MOCK.createRankingChallengeState(state.setIndex);
      renderRankingChallenge(window.__tliveRanking);
    });
  }

  function renderDebateCards(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const topic = MOCK.getDebateTopic(state);
    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatDebateEvent(state, t);
    const topicNum = (state.topicIndex % MOCK.DEBATE_TOPIC_COUNT) + 1;

    const scoreRows = MOCK.getDebateRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget}</td>
        </tr>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-debate tlive-stage-fill">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_debate_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))} · ${escapeHtml(MOCK.debateTopicTitle(topic))} (${topicNum}/${MOCK.DEBATE_TOPIC_COUNT})</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_debate_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-stage-hero">${MOCK.renderDebateCardsMarkup(state, t)}</div>
        <div class="tlive-stage-footer">
          <div class="tlive-question-box">
            <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
            <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
            <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
          </div>
          <div class="tlive-board__controls">
            <button type="button" class="btn-primary" id="tlive-debate-launch">${escapeHtml(t("tlive_launch_question"))}</button>
            <button type="button" class="btn-secondary" id="tlive-debate-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
            <button type="button" class="btn-primary" id="tlive-debate-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_debate_award_btn"))}</button>
            <button type="button" class="btn-secondary" id="tlive-debate-reset">${escapeHtml(t("tlive_board_reset"))}</button>
          </div>
          <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
        </div>
      </div>
    `;

    document.getElementById("tlive-debate-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-debate-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-debate-score")?.addEventListener("click", () => {
      window.__tliveDebate = MOCK.processDebateResponses(window.__tliveDebate, q);
      renderDebateCards(window.__tliveDebate);
    });

    canvas.querySelectorAll("[data-debate-team]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveDebate = MOCK.setDebateActiveTeam(
          window.__tliveDebate,
          btn.getAttribute("data-debate-team"),
        );
        renderDebateCards(window.__tliveDebate);
      });
    });

    canvas.querySelectorAll("[data-debate-pt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveDebate = MOCK.awardDebatePoint(
          window.__tliveDebate,
          btn.getAttribute("data-debate-pt"),
          1,
        );
        renderDebateCards(window.__tliveDebate);
      });
    });

    document.getElementById("tlive-debate-draw")?.addEventListener("click", () => {
      window.__tliveDebate = MOCK.drawDebateCard(window.__tliveDebate);
      renderDebateCards(window.__tliveDebate);
    });

    document.getElementById("tlive-debate-discard")?.addEventListener("click", () => {
      window.__tliveDebate = MOCK.discardDebateCard(window.__tliveDebate);
      renderDebateCards(window.__tliveDebate);
    });

    document.getElementById("tlive-debate-next-topic")?.addEventListener("click", () => {
      window.__tliveDebate = MOCK.nextDebateTopic(window.__tliveDebate);
      renderDebateCards(window.__tliveDebate);
    });

    document.getElementById("tlive-debate-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_debate_reset_confirm"))) return;
      window.__tliveDebate = MOCK.createDebateCardsState(state.topicIndex);
      renderDebateCards(window.__tliveDebate);
    });
  }

  function renderHotSeat(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatHotSeatEvent(state, t);

    const scoreRows = MOCK.getHotSeatRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget} ${escapeHtml(t("tlive_hotseat_points"))}</td>
        </tr>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-hotseat tlive-stage-fill">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_hotseat_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_hotseat_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_hotseat_points_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-stage-hero">${MOCK.renderHotSeatMarkup(state, t)}</div>
        <div class="tlive-stage-footer">
          <div class="tlive-question-box">
            <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
            <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
            <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
          </div>
          <div class="tlive-board__controls">
            <button type="button" class="btn-primary" id="tlive-hotseat-launch">${escapeHtml(t("tlive_launch_question"))}</button>
            <button type="button" class="btn-secondary" id="tlive-hotseat-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
            <button type="button" class="btn-secondary" id="tlive-hotseat-reset">${escapeHtml(t("tlive_board_reset"))}</button>
          </div>
          <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
        </div>
      </div>
    `;

    document.getElementById("tlive-hotseat-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-hotseat-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    canvas.querySelectorAll("[data-hotseat-team]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveHotSeat = MOCK.setHotSeatTeam(
          window.__tliveHotSeat,
          btn.getAttribute("data-hotseat-team"),
        );
        renderHotSeat(window.__tliveHotSeat);
      });
    });

    canvas.querySelectorAll("[data-hotseat-guess]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveHotSeat = MOCK.awardHotSeatGuess(
          window.__tliveHotSeat,
          btn.getAttribute("data-hotseat-guess"),
        );
        renderHotSeat(window.__tliveHotSeat);
      });
    });

    document.getElementById("tlive-hotseat-reveal")?.addEventListener("click", () => {
      window.__tliveHotSeat = MOCK.revealHotSeatWord(window.__tliveHotSeat);
      renderHotSeat(window.__tliveHotSeat);
    });

    document.getElementById("tlive-hotseat-hide")?.addEventListener("click", () => {
      window.__tliveHotSeat = MOCK.hideHotSeatWord(window.__tliveHotSeat);
      renderHotSeat(window.__tliveHotSeat);
    });

    document.getElementById("tlive-hotseat-next-word")?.addEventListener("click", () => {
      window.__tliveHotSeat = MOCK.nextHotSeatWord(window.__tliveHotSeat);
      renderHotSeat(window.__tliveHotSeat);
    });

    document.getElementById("tlive-hotseat-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_hotseat_reset_confirm"))) return;
      window.__tliveHotSeat = MOCK.createHotSeatState();
      renderHotSeat(window.__tliveHotSeat);
    });
  }

  function renderMemoryCard(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const q = MOCK.MOCK_QUESTIONS[state.questionIndex % MOCK.MOCK_QUESTIONS.length];
    const opts = MOCK.questionOptions(q);
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const lastEvent = MOCK.formatMemoryEvent(state, t);

    const scoreRows = MOCK.getMemoryRanking(state)
      .map((row, rank) => {
        const team = state.teams.find((x) => x.id === row.id) || row;
        return `<tr class="${state.winnerId === row.id ? "tlive-lb-row--winner" : ""}">
          <td>${rank + 1}</td>
          <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(MOCK.teamName(team))}</td>
          <td>${row.score} / ${state.winTarget} ${escapeHtml(t("tlive_memory_pairs"))}</td>
        </tr>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-memory tlive-stage-fill">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_memory_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_memory_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_memory_pairs_col"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        ${lastEvent ? `<p class="tlive-board-event">${escapeHtml(lastEvent)}</p>` : ""}
        <div class="tlive-stage-hero">${MOCK.renderMemoryCardMarkup(state, t)}</div>
        <div class="tlive-stage-footer">
          <div class="tlive-question-box">
            <p class="tlive-question-box__label">${escapeHtml(t("tlive_current_question"))}</p>
            <p class="tlive-question-box__text">${escapeHtml(MOCK.questionText(q))}</p>
            <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>
          </div>
          <div class="tlive-board__controls">
            <button type="button" class="btn-primary" id="tlive-memory-launch">${escapeHtml(t("tlive_launch_question"))}</button>
            <button type="button" class="btn-secondary" id="tlive-memory-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
            <button type="button" class="btn-primary" id="tlive-memory-score" ${state.winnerId ? "disabled" : ""}>${escapeHtml(t("tlive_memory_award_btn"))}</button>
            <button type="button" class="btn-secondary" id="tlive-memory-reset">${escapeHtml(t("tlive_board_reset"))}</button>
          </div>
          <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
        </div>
      </div>
    `;

    document.getElementById("tlive-memory-launch")?.addEventListener("click", () => launchToStudents(q, null));

    document.getElementById("tlive-memory-view-resp")?.addEventListener("click", () => openResponsesModal(q, null));

    document.getElementById("tlive-memory-score")?.addEventListener("click", () => {
      window.__tliveMemory = MOCK.processMemoryResponses(window.__tliveMemory, q);
      renderMemoryCard(window.__tliveMemory);
    });

    canvas.querySelectorAll("[data-memory-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-memory-card"), 10);
        const result = MOCK.tryMemoryCardFlip(window.__tliveMemory, idx);
        window.__tliveMemory = result.state;
        renderMemoryCard(window.__tliveMemory);
      });
    });

    canvas.querySelectorAll("[data-memory-team]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveMemory = {
          ...window.__tliveMemory,
          selectedTeam: btn.getAttribute("data-memory-team"),
        };
        renderMemoryCard(window.__tliveMemory);
      });
    });

    document.getElementById("tlive-memory-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_memory_reset_confirm"))) return;
      window.__tliveMemory = MOCK.createMemoryCardState();
      renderMemoryCard(window.__tliveMemory);
    });
  }

  function renderVocabBingo(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const clue = MOCK.bingoClue(state);
    const cell = clue.cell;
    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;

    const teamBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="tlive-team-pick${state.selectedTeam === team.id ? " tlive-team-pick--active" : ""}" data-team-pick="${team.id}" style="--team-color:${team.color}">${escapeHtml(MOCK.teamName(team))}</button>`,
      )
      .join("");

    const grid = state.cells
      .map((c) => {
        const marks = state.teams
          .filter((team) => c.marks[team.id])
          .map((team) => `<span class="tlive-bingo-mark" style="background:${team.color}"></span>`)
          .join("");
        const label = c.free ? t("tlive_bingo_free") : c.term;
        return `<button type="button" class="tlive-bingo-cell${c.free ? " tlive-bingo-cell--free" : ""}" data-bingo-cell="${c.index}" ${state.winnerId ? "disabled" : ""}>
          <span class="tlive-bingo-cell__term">${escapeHtml(label)}</span>
          <span class="tlive-bingo-cell__marks">${marks}</span>
        </button>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-bingo">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_bingo_title"))}</h2>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_board_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <div class="tlive-bingo-clue">
          <p class="tlive-bingo-clue__label">${escapeHtml(t("tlive_bingo_clue"))} (${clue.index + 1}/${clue.total})</p>
          <p class="tlive-bingo-clue__text">${escapeHtml(MOCK.termDef(cell))}</p>
          <p class="tlive-bingo-clue__hint">${escapeHtml(t("tlive_bingo_term_hint", { term: cell.term }))}</p>
        </div>
        <div class="tlive-bingo-teams">${teamBtns}</div>
        <p class="tlive-bingo-help">${escapeHtml(t("tlive_bingo_help"))}</p>
        <div class="tlive-bingo-grid" role="grid">${grid}</div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-bingo-next-clue">${escapeHtml(t("tlive_bingo_next_clue"))}</button>
          <button type="button" class="btn-secondary" id="tlive-bingo-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    canvas.querySelectorAll("[data-team-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveBingo = { ...window.__tliveBingo, selectedTeam: btn.getAttribute("data-team-pick") };
        renderVocabBingo(window.__tliveBingo);
      });
    });

    canvas.querySelectorAll("[data-bingo-cell]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-bingo-cell"), 10);
        window.__tliveBingo = MOCK.markBingoCell(window.__tliveBingo, idx, window.__tliveBingo.selectedTeam);
        renderVocabBingo(window.__tliveBingo);
      });
    });

    document.getElementById("tlive-bingo-next-clue")?.addEventListener("click", () => {
      window.__tliveBingo = MOCK.advanceBingoClue(window.__tliveBingo);
      renderVocabBingo(window.__tliveBingo);
    });

    document.getElementById("tlive-bingo-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_board_reset_confirm"))) return;
      window.__tliveBingo = MOCK.createBingoState();
      renderVocabBingo(window.__tliveBingo);
    });
  }

  function renderMatchingRace(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const winner = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const matchedIds = new Set(Object.keys(state.matched));

    const teamBtns = state.teams
      .map(
        (team) =>
          `<button type="button" class="tlive-team-pick${state.selectedTeam === team.id ? " tlive-team-pick--active" : ""}" data-team-pick="${team.id}" style="--team-color:${team.color}">${escapeHtml(MOCK.teamName(team))} · ${state.scores[team.id] || 0}</button>`,
      )
      .join("");

    const terms = state.pairs
      .map((p) => {
        const done = matchedIds.has(p.id);
        const sel = state.selectedTerm === p.id;
        return `<button type="button" class="tlive-match-item${done ? " tlive-match-item--done" : ""}${sel ? " tlive-match-item--selected" : ""}" data-match-term="${p.id}" ${done || state.winnerId ? "disabled" : ""}>${escapeHtml(p.term)}</button>`;
      })
      .join("");

    const defs = state.defs
      .map((d) => {
        const done = matchedIds.has(d.pairId);
        const team = state.teams.find((x) => x.id === state.matched[d.pairId]);
        return `<button type="button" class="tlive-match-item tlive-match-item--def${done ? " tlive-match-item--done" : ""}" data-match-def="${d.id}" ${done || state.winnerId ? "disabled" : ""}>
          ${escapeHtml(MOCK.matchingDefText(d))}
          ${team ? `<span class="tlive-match-item__team" style="color:${team.color}">${escapeHtml(MOCK.teamName(team))}</span>` : ""}
        </button>`;
      })
      .join("");

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-board tlive-matching">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_matching_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_matching_goal", { n: String(state.winTarget) }))}</p>
        </header>
        ${winner ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_board_winner", { team: MOCK.teamName(winner) }))}</div>` : ""}
        <div class="tlive-bingo-teams">${teamBtns}</div>
        <p class="tlive-bingo-help">${escapeHtml(t("tlive_matching_help"))}</p>
        <div class="tlive-match-board">
          <div class="tlive-match-col">
            <h3>${escapeHtml(t("tlive_matching_terms"))}</h3>
            <div class="tlive-match-list">${terms}</div>
          </div>
          <div class="tlive-match-col">
            <h3>${escapeHtml(t("tlive_matching_defs"))}</h3>
            <div class="tlive-match-list">${defs}</div>
          </div>
        </div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-matching-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
      </div>
    `;

    canvas.querySelectorAll("[data-team-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveMatching = { ...window.__tliveMatching, selectedTeam: btn.getAttribute("data-team-pick") };
        renderMatchingRace(window.__tliveMatching);
      });
    });

    canvas.querySelectorAll("[data-match-term]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__tliveMatching = { ...window.__tliveMatching, selectedTerm: btn.getAttribute("data-match-term") };
        renderMatchingRace(window.__tliveMatching);
      });
    });

    canvas.querySelectorAll("[data-match-def]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const defId = btn.getAttribute("data-match-def");
        const termId = window.__tliveMatching.selectedTerm;
        if (!termId) return;
        const result = MOCK.tryMatchingPair(window.__tliveMatching, termId, defId);
        window.__tliveMatching = result.state;
        renderMatchingRace(window.__tliveMatching);
      });
    });

    document.getElementById("tlive-matching-reset")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_board_reset_confirm"))) return;
      window.__tliveMatching = MOCK.createMatchingState();
      renderMatchingRace(window.__tliveMatching);
    });
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

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-games-panel tlive-stage-fill">
        <h2 class="tlive-games-panel__title">${escapeHtml(t("tlive_saved_games"))}</h2>
        <p class="tlive-games-panel__lead">${escapeHtml(t("tlive_games_canvas_lead"))}</p>
        <p id="tlive-games-toast" class="tlive-games-toast hidden" role="status"></p>
        <div class="tlive-games-panel__scroll" role="region" aria-label="${escapeHtml(t("tlive_games_list_region"))}">
          <ul class="tlive-games-panel__list">
            ${games.map((g) => gameListItemHtml(g, MOCK)).join("")}
          </ul>
        </div>
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
    clearLiveGameState();
    if (game.type === "board_race" || game.id === "board-race") {
      window.__tliveBoard = MOCK.createBoardState();
      window.__tliveQuestionIndex = 0;
      renderBoardRace(window.__tliveBoard, 0);
      return;
    }
    if (game.type === "vocab_bingo" || game.id === "vocab-bingo") {
      window.__tliveBingo = MOCK.createBingoState();
      renderVocabBingo(window.__tliveBingo);
      return;
    }
    if (game.type === "matching_race" || game.id === "matching-race") {
      window.__tliveMatching = MOCK.createMatchingState();
      renderMatchingRace(window.__tliveMatching);
      return;
    }
    if (game.type === "quiz_battle" || game.id === "quiz-battle") {
      window.__tliveQuiz = MOCK.createQuizBattleState();
      renderQuizBattle(window.__tliveQuiz);
      return;
    }
    if (game.type === "treasure_hunt" || game.id === "treasure-hunt") {
      window.__tliveTreasure = MOCK.createTreasureHuntState();
      renderTreasureHunt(window.__tliveTreasure);
      return;
    }
    if (game.type === "escape_room" || game.id === "escape-room") {
      window.__tliveEscape = MOCK.createEscapeRoomState();
      renderEscapeRoom(window.__tliveEscape);
      return;
    }
    if (game.type === "word_ladder" || game.id === "word-ladder") {
      window.__tliveLadder = MOCK.createWordLadderState(0);
      renderWordLadder(window.__tliveLadder);
      return;
    }
    if (game.type === "sentence_builder" || game.id === "sentence-builder") {
      window.__tliveSentence = MOCK.createSentenceBuilderState(0);
      renderSentenceBuilder(window.__tliveSentence);
      return;
    }
    if (game.type === "argument_sorting" || game.id === "argument-sorting") {
      window.__tliveArgument = MOCK.createArgumentSortingState(0);
      renderArgumentSorting(window.__tliveArgument);
      return;
    }
    if (game.type === "summary_mission" || game.id === "summary-mission") {
      window.__tliveSummary = MOCK.createSummaryMissionState(0);
      renderSummaryMission(window.__tliveSummary);
      return;
    }
    if (game.type === "memory_card" || game.id === "memory-card") {
      window.__tliveMemory = MOCK.createMemoryCardState();
      renderMemoryCard(window.__tliveMemory);
      return;
    }
    if (game.type === "hot_seat" || game.id === "hot-seat") {
      window.__tliveHotSeat = MOCK.createHotSeatState();
      renderHotSeat(window.__tliveHotSeat);
      return;
    }
    if (game.type === "debate_cards" || game.id === "debate-cards") {
      window.__tliveDebate = MOCK.createDebateCardsState(0);
      renderDebateCards(window.__tliveDebate);
      return;
    }
    if (game.type === "ranking_challenge" || game.id === "ranking-challenge") {
      window.__tliveRanking = MOCK.createRankingChallengeState(0);
      renderRankingChallenge(window.__tliveRanking);
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

  function renderNameWheelTool(ctx) {
    const canvas = document.getElementById("tlive-canvas-inner");
    const wheel = window.EAP_NAME_WHEEL;
    if (!canvas || !wheel) {
      showBootError(t("tlive_wheel_load_error"));
      return;
    }
    clearLiveGameState();
    window.__tliveWheelUnmount = null;
    wheel.mount(canvas, {
      className: ctx.className,
      t,
      escapeHtml,
    });
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
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
        else if (tool === "wheel") renderNameWheelTool(ctx);
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
      if (
        tool === "games" &&
        !window.__tliveBoard &&
        !window.__tliveBingo &&
        !window.__tliveMatching &&
        !window.__tliveQuiz &&
        !window.__tliveTreasure &&
        !window.__tliveEscape &&
        !window.__tliveLadder &&
        !window.__tliveSentence &&
        !window.__tliveArgument &&
        !window.__tliveSummary &&
        !window.__tliveMemory
      ) {
        renderGamesLibrary();
      } else if (window.__tliveBoard) {
        renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      } else if (window.__tliveBingo) {
        renderVocabBingo(window.__tliveBingo);
      } else if (window.__tliveMatching) {
        renderMatchingRace(window.__tliveMatching);
      } else if (window.__tliveQuiz) {
        renderQuizBattle(window.__tliveQuiz);
      } else if (window.__tliveTreasure) {
        renderTreasureHunt(window.__tliveTreasure);
      } else if (window.__tliveEscape) {
        renderEscapeRoom(window.__tliveEscape);
      } else if (window.__tliveLadder) {
        renderWordLadder(window.__tliveLadder);
      } else if (window.__tliveSentence) {
        renderSentenceBuilder(window.__tliveSentence);
      } else if (window.__tliveArgument) {
        renderArgumentSorting(window.__tliveArgument);
      } else if (window.__tliveSummary) {
        renderSummaryMission(window.__tliveSummary);
      } else if (window.__tliveMemory) {
        renderMemoryCard(window.__tliveMemory);
      } else if (tool === "wheel") {
        renderNameWheelTool(ctx);
      } else if (tool === "slides") {
        renderWelcome(ctx);
      }
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
