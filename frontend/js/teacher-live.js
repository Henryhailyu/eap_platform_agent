/**
 * Teacher Live Teaching Page (Phase L2–L12 — mock).
 */
(function () {
  const PAGE = "teacher-live";

  function getMock() {
    return window.EAP_TEACHER_LIVE_MOCK || null;
  }

  function refreshLessonSlotsFromHtml(html, pageId) {
    if (pageId != null && pageId !== "") {
      window.__tliveLessonPageId = pageId;
    }
    if (typeof window.EAP_syncLessonSlotsFromHtml === "function") {
      window.EAP_syncLessonSlotsFromHtml(html, {
        pageId: pageId != null && pageId !== "" ? pageId : window.__tliveLessonPageId,
      });
    } else if (typeof window.EAP_parseLessonMetaFromHtml === "function") {
      const meta = window.EAP_parseLessonMetaFromHtml(html);
      window.__tliveLessonPlanSegments = meta.segments || [];
      window.__tliveLessonSlots =
        typeof window.EAP_parseLiveLessonSlots === "function"
          ? window.EAP_parseLiveLessonSlots(html)
          : [];
    } else {
      window.__tliveLessonPlanSegments = [];
      window.__tliveLessonSlots = [];
    }
    if (window.__tliveLessonSegmentFilter == null) {
      window.__tliveLessonSegmentFilter = "all";
    }
  }

  function syncLiveLessonFromActiveSource() {
    const html =
      typeof window.EAP_getActiveLessonHtml === "function"
        ? window.EAP_getActiveLessonHtml()
        : window.sessionStorage?.getItem("eap_last_lesson_html") || "";
    if (!html || html.length < 80) return false;
    const pageId = resolveActiveLessonPageId();
    refreshLessonSlotsFromHtml(html, pageId);
    return true;
  }

  async function ensureLiveLessonSynced(opts) {
    const pageId =
      typeof resolveActiveLessonPageId === "function" ? resolveActiveLessonPageId() : "";
    if (typeof window.EAP_ensureActiveLessonSynced === "function") {
      return window.EAP_ensureActiveLessonSynced(pageId, opts);
    }
    return syncLiveLessonFromActiveSource();
  }

  function restoreLessonSlotsFromSession() {
    /* Defer to display-library load; avoid binding poll/quiz to stale sessionStorage. */
  }

  function lessonSlotsForActiveSegment() {
    const all = window.__tliveLessonSlots || [];
    if (typeof window.EAP_slotsForSegment === "function") {
      return window.EAP_slotsForSegment(all, window.__tliveLessonSegmentFilter);
    }
    return all;
  }

  /** LT-M1: question from lesson slot / AI cache, else mock when no lesson HTML. */
  function pickLaunchQuestion(MOCK, index, gameId) {
    if (window.__tliveOverrideQuestion) return window.__tliveOverrideQuestion;
    const gid = gameId || window.__tliveActiveGameId || "";
    if (gid) {
      const slots = lessonSlotsForActiveSegment().filter(
        (s) => s.tool === "game" && String(s.gameId) === String(gid),
      );
      if (slots.length && typeof window.EAP_slotToLaunchQuestion === "function") {
        const q = window.EAP_slotToLaunchQuestion(slots[0]);
        if (q) return q;
      }
    }
    const GQ = window.EAP_LIVE_GAME_QUESTIONS;
    if (GQ && typeof GQ.resolveSync === "function") {
      const q = GQ.resolveSync(MOCK, index);
      if (q) return q;
      const html =
        typeof GQ.getLessonHtmlCached === "function" ? GQ.getLessonHtmlCached() : "";
      if (html.length >= 80) return null;
    }
    const i = Number.isInteger(index) ? index : 0;
    return MOCK.MOCK_QUESTIONS[i % MOCK.MOCK_QUESTIONS.length];
  }

  function isLiveGameActive() {
    return !!(
      window.__tliveGameLaunchingId ||
      window.__tliveBoard ||
      window.__tliveBingo ||
      window.__tliveMatching ||
      window.__tliveQuiz ||
      window.__tliveTreasure ||
      window.__tliveEscape ||
      window.__tliveLadder ||
      window.__tliveSentence ||
      window.__tliveArgument ||
      window.__tliveSummary ||
      window.__tliveMemory ||
      window.__tliveHotSeat ||
      window.__tliveDebate ||
      window.__tliveRanking
    );
  }

  function isGamesLibraryView() {
    return getActiveToolbarTool() === "games" && !isLiveGameActive();
  }

  function maybeFetchGameQuestion(index, rerender) {
    syncLiveLessonFromActiveSource();
    const GQ = window.EAP_LIVE_GAME_QUESTIONS;
    if (!GQ || window.__tliveGameQuestionLoading === index) return true;
    const failed = window.__tliveGameQuestionFailed;
    if (failed && failed[index]) return false;
    const html = typeof GQ.getLessonHtmlCached === "function" ? GQ.getLessonHtmlCached() : "";
    if (html.length < 80) return false;
    window.__tliveGameQuestionLoading = index;
    const canvas = document.getElementById("tlive-canvas-inner");
    if (canvas && !isLiveGameActive()) {
      canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
      canvas.innerHTML = `<div class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_game_ai_generating"))}</div>`;
    }
    GQ.ensure(index, getMock())
      .catch(() => {
        window.__tliveGameQuestionFailed = window.__tliveGameQuestionFailed || {};
        window.__tliveGameQuestionFailed[index] = true;
      })
      .finally(() => {
        window.__tliveGameQuestionLoading = null;
        if (typeof rerender === "function") rerender();
      });
    return true;
  }

  function lessonHtmlAvailable() {
    const html =
      typeof window.EAP_getActiveLessonHtml === "function"
        ? window.EAP_getActiveLessonHtml()
        : "";
    return html.length >= 80;
  }

  function resolveGameQuestionForRender(MOCK, index, rerender) {
    syncLiveLessonFromActiveSource();
    const q = pickLaunchQuestion(MOCK, index, window.__tliveActiveGameId);
    if (q) return { q, pending: false };
    if (lessonHtmlAvailable() && maybeFetchGameQuestion(index, rerender)) {
      return { q: null, pending: true };
    }
    if (lessonHtmlAvailable()) {
      return { q: null, pending: false, missing: true };
    }
    const i = Number.isInteger(index) ? index : 0;
    return { q: MOCK.MOCK_QUESTIONS[i % MOCK.MOCK_QUESTIONS.length], pending: false };
  }

  function showVocabGameLoading() {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = `<div class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_vocab_ai_generating"))}</div>`;
  }

  async function startVocabGame(kind, onReady) {
    window.__tliveGameLaunchingId = kind;
    try {
      await ensureLiveLessonSynced({ timeoutMs: 12000 });
      const MOCK = getMock();
      if (!MOCK) {
        window.__tliveGameLaunchingId = null;
        return;
      }
      const GV = window.EAP_LIVE_GAME_VOCAB;
      const cached = GV && typeof GV.getCached === "function" ? GV.getCached() : null;
      if (cached && cached.length >= (GV ? GV.MIN : 8)) {
        window.__tliveLessonVocab = cached;
        onReady(cached);
        window.__tliveGameLaunchingId = null;
        return;
      }
      if (window.__tliveVocabGameLoading) return;
      window.__tliveVocabGameLoading = kind;
      showVocabGameLoading();
      const finish = (terms) => {
        window.__tliveVocabGameLoading = null;
        window.__tliveGameLaunchingId = null;
        if (terms && terms.length >= (GV ? GV.MIN : 8)) {
          window.__tliveLessonVocab = terms;
          onReady(terms);
        } else {
          window.__tliveLessonVocab = null;
          onReady(null);
        }
      };
      if (GV && typeof GV.ensure === "function") {
        GV.ensure()
          .then(finish)
          .catch(() => finish(null));
      } else {
        finish(null);
      }
    } catch (_) {
      window.__tliveGameLaunchingId = null;
    }
  }

  const SIDE_PANEL_TOOLS = new Set(["poll", "quiz"]);
  const CANVAS_OVERLAY_TOOLS = new Set(["games", "timer", "wheel", "upload"]);

  function destroyPollQuizPanel() {
    const panel = document.getElementById("tlive-tool-panel");
    const wrap = document.getElementById("tlive-canvas-wrap");
    if (panel) {
      panel.classList.add("hidden");
      panel.hidden = true;
      panel.innerHTML = "";
    }
    if (wrap) wrap.classList.remove("tlive-canvas-wrap--split");
    window.__tliveSidePanelVisible = false;
    window.__tliveSidePanelTool = null;
  }

  function collapseSideToolPanel() {
    const panel = document.getElementById("tlive-tool-panel");
    const wrap = document.getElementById("tlive-canvas-wrap");
    if (panel) {
      panel.classList.add("hidden");
      panel.hidden = true;
    }
    if (wrap) wrap.classList.remove("tlive-canvas-wrap--split");
    window.__tliveSidePanelVisible = false;
  }

  function expandSideToolPanel(tool) {
    const panel = document.getElementById("tlive-tool-panel");
    const wrap = document.getElementById("tlive-canvas-wrap");
    if (panel) {
      panel.classList.remove("hidden");
      panel.hidden = false;
    }
    if (wrap) wrap.classList.add("tlive-canvas-wrap--split");
    window.__tliveSidePanelVisible = true;
    window.__tliveSidePanelTool = tool || null;
  }

  function hidePollQuizPanel() {
    destroyPollQuizPanel();
  }

  function persistPollQuizDraft(tool) {
    const pq = window.EAP_LIVE_POLL_QUIZ;
    if (pq && typeof pq.persistDraftFromDom === "function") {
      pq.persistDraftFromDom(tool, getMock());
    }
  }

  function getActiveToolbarTool() {
    const active = document.querySelector(".tlive-tool--active");
    return active ? active.getAttribute("data-tool") : null;
  }

  function clearActiveTool() {
    document.querySelectorAll(".tlive-tool").forEach((btn) => {
      btn.classList.remove("tlive-tool--active");
    });
  }

  function restoreLessonFromCache() {
    const cache = window.__tliveLessonCache;
    if (!cache || !window.__tliveLessonOnStage) return false;
    collapseSideToolPanel();
    stopLiveTimerIfMounted();
    window.__tliveWheelUnmount = null;
    if (cache.type === "html" && cache.html) {
      renderHtmlLessonOnCanvas(cache.html, cache.title, cache.pageId);
      return true;
    }
    if (cache.type === "file" && cache.item) {
      void renderFileOnCanvas(cache.item);
      return true;
    }
    return false;
  }

  function shouldToggleOffOverlayTool(tool) {
    return (
      window.__tliveLessonOnStage &&
      window.__tliveLessonCache &&
      CANVAS_OVERLAY_TOOLS.has(tool) &&
      getActiveToolbarTool() === tool
    );
  }

  function dismissSidePanelIfOpen() {
    if (window.__tliveSidePanelVisible && window.__tliveSidePanelTool) {
      persistPollQuizDraft(window.__tliveSidePanelTool);
      collapseSideToolPanel();
    }
  }

  function shouldToggleOffSidePanelTool(tool) {
    return (
      window.__tliveLessonOnStage &&
      SIDE_PANEL_TOOLS.has(tool) &&
      window.__tliveSidePanelVisible &&
      window.__tliveSidePanelTool === tool
    );
  }

  function getPollQuizMountTarget() {
    if (window.__tliveLessonOnStage) {
      const panel = document.getElementById("tlive-tool-panel");
      const wrap = document.getElementById("tlive-canvas-wrap");
      if (panel) {
        expandSideToolPanel(window.__tliveSidePanelTool);
        return { el: panel, sidePanel: true };
      }
    }
    destroyPollQuizPanel();
    const canvas = document.getElementById("tlive-canvas-inner");
    return { el: canvas, sidePanel: false };
  }

  async function mountPollQuizForTool(tool, MOCK) {
    await ensureLessonHtmlForActiveDisplayItem({ timeoutMs: 12000 });
    syncLiveLessonFromActiveSource();
    void ensureLiveLessonSynced({ timeoutMs: 12000 });
    const fp =
      typeof window.EAP_lessonHtmlFingerprint === "function"
        ? window.EAP_lessonHtmlFingerprint()
        : "";
    const target = getPollQuizMountTarget();
    if (!target.el || !window.EAP_LIVE_POLL_QUIZ) return;
    const panel = document.getElementById("tlive-tool-panel");
    const alreadyMounted =
      target.sidePanel &&
      window.__tliveSidePanelTool === tool &&
      panel &&
      panel.querySelector(`[data-pq-tool="${tool}"]`) &&
      window.__tlivePollQuizMountedFp === fp;
    if (alreadyMounted) {
      expandSideToolPanel(tool);
      return;
    }
    if (panel && panel.querySelector(`[data-pq-tool="${tool}"]`) && window.__tlivePollQuizMountedFp !== fp) {
      panel.innerHTML = "";
    }
    if (target.sidePanel && window.__tliveSidePanelTool && window.__tliveSidePanelTool !== tool) {
      persistPollQuizDraft(window.__tliveSidePanelTool);
    }
    window.EAP_LIVE_POLL_QUIZ.mountPollQuizTool({
      tool,
      mock: MOCK,
      canvas: target.el,
      mountEl: target.el,
      sidePanel: target.sidePanel,
      onLaunch: (q, toolId) => {
        launchToStudents(q, null, liveLaunchMeta(toolId === "quiz" ? "quiz" : "poll"));
      },
      onViewResponses: (q) => openResponsesModal(q, null),
      onStatus: updateLaunchStatus,
    });
    if (target.sidePanel) {
      expandSideToolPanel(tool);
    }
    window.__tlivePollQuizMountedFp = fp;
  }

  function handleLivePickMessage(data) {
    if (!data || data.type !== "eap-live-pick") return;
    const tool = String(data.tool || "").toLowerCase();
    const slotId = data.slotId || "";
    const MOCK = getMock();
    if (tool === "poll" || tool === "quiz") {
      setActiveTool(tool);
      if (window.EAP_LIVE_POLL_QUIZ && MOCK) {
        void mountPollQuizForTool(tool, MOCK);
        window.EAP_LIVE_POLL_QUIZ.applySlotPick(tool, slotId, MOCK);
      }
      updateLaunchStatus(t("tlive_pq_loaded_from_lesson"), false);
      return;
    }
    if (tool === "game") {
      const slot = (window.__tliveLessonSlots || []).find((s) => String(s.id) === String(slotId));
      const gameId = (slot && slot.gameId) || data.gameId || "quiz-battle";
      if (window.EAP_LIVE_PHASE1_GAME_IDS && !window.EAP_LIVE_PHASE1_GAME_IDS.has(gameId)) {
        updateLaunchStatus(t("tlive_game_not_phase1"), true);
        return;
      }
      let launchQ = null;
      if (slot && typeof window.EAP_slotToLaunchQuestion === "function") {
        launchQ = window.EAP_slotToLaunchQuestion(slot);
      }
      setActiveTool("games");
      void loadGame(gameId, { question: launchQ });
      updateLaunchStatus(t("tlive_pq_loaded_from_lesson"), false);
    }
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

    if (typeof initAppPageHeader === "function") {
      initAppPageHeader();
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

  function stopLiveTimerIfMounted() {
    if (typeof window.__tliveTimerUnmount === "function") {
      window.__tliveTimerUnmount();
      window.__tliveTimerUnmount = null;
    }
  }

  function renderWelcome(ctx) {
    window.__tliveLessonOnStage = false;
    window.__tliveLessonCache = null;
    hidePollQuizPanel();
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !MOCK) return;
    stopLiveTimerIfMounted();
    stopActivityStatsPoll();
    canvas.className = "tlive-canvas__inner";
    canvas.innerHTML = `
      <h2 style="color:#0A4D68;margin:0 0 0.5rem">${escapeHtml(t("tlive_welcome_title"))}</h2>
      <p style="color:#6e6e73;max-width:28rem">${escapeHtml(t("tlive_welcome_lead"))}</p>
      <p style="font-size:0.875rem;color:#6e6e73">${escapeHtml(t("tlive_context", { class: ctx.className, date: ctx.date || "—" }))}</p>
      <p class="tlive-disclaimer">${escapeHtml(t("tlive_mock_disclaimer"))}</p>
    `;
  }

  function guardGameQuestionCanvas(resolved, canvas) {
    if (resolved.q) return false;
    if (!canvas) return true;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    if (resolved.pending) {
      canvas.innerHTML = `<div class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_game_ai_generating"))}</div>`;
      return true;
    }
    if (resolved.missing) {
      canvas.innerHTML = `<div class="tlive-pq-empty">${escapeHtml(t("tlive_game_ai_failed"))}</div>`;
      return true;
    }
    canvas.innerHTML = `<div class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_game_ai_generating"))}</div>`;
    return true;
  }

  function renderBoardRace(boardState, questionIndex) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;
    const idx = Number.isInteger(questionIndex) ? questionIndex : 0;
    const resolved = resolveGameQuestionForRender(MOCK, idx, () =>
      renderBoardRace(boardState, idx),
    );
    const state = boardState || MOCK.createBoardState();
    const lastEvent = MOCK.formatLastEvent(state, t);
    const winnerTeam = state.winnerId ? state.teams.find((x) => x.id === state.winnerId) : null;
    const winnerBanner = winnerTeam
      ? `<div class="tlive-board-winner" role="status">${escapeHtml(t("tlive_board_winner", { team: MOCK.teamName(winnerTeam) }))}</div>`
      : "";
    const teamOptions = state.teams
      .map((team, i) => `<option value="${i}">${escapeHtml(MOCK.teamName(team))}</option>`)
      .join("");

    if (resolved.pending && !resolved.q) {
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
        <div class="tlive-question-box">${gameQuestionLoadingHtml()}</div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-reset-board">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
      </div>`;
      document.getElementById("tlive-reset-board")?.addEventListener("click", () => {
        if (!window.confirm(t("tlive_board_reset_confirm"))) return;
        window.__tliveBoard = MOCK.createBoardState();
        window.__tliveQuestionIndex = 0;
        renderBoardRace(window.__tliveBoard, 0);
      });
      return;
    }

    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
    const opts = MOCK.questionOptions(q);

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
      const board = window.__tliveBoard || state;
      launchToStudents(
        q,
        board,
        liveLaunchMeta("board_race", { round: board && board.round != null ? board.round : 1 }),
      );
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
      window.__tliveQuestionIndex = (window.__tliveQuestionIndex || 0) + 1;
      renderBoardRace(window.__tliveBoard || state, window.__tliveQuestionIndex);
    });

    document.getElementById("tlive-reset-board")?.addEventListener("click", () => {
      if (!window.confirm(t("tlive_board_reset_confirm"))) return;
      window.__tliveBoard = MOCK.createBoardState();
      window.__tliveQuestionIndex = 0;
      renderBoardRace(window.__tliveBoard, 0);
    });
  }

  function getLiveApi() {
    return window.EAP_LIVE_TEACHING_API || null;
  }

  const LIVE_SESSION_STORAGE_KEY = "eap_teacher_live_session_v1";

  function loadPersistedLiveSession(ctx) {
    try {
      const raw = sessionStorage.getItem(LIVE_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.code) return null;
      const className = (ctx && ctx.className) || "EAP047";
      if (parsed.class_name && parsed.class_name !== className) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function persistLiveSession(sess) {
    if (!sess || !sess.code) return;
    try {
      sessionStorage.setItem(
        LIVE_SESSION_STORAGE_KEY,
        JSON.stringify({
          code: sess.code,
          class_name: sess.class_name,
          join_url: sess.join_url,
          join_path: sess.join_path,
        }),
      );
    } catch (_) {
      /* ignore */
    }
  }

  function clearPersistedLiveSession() {
    try {
      sessionStorage.removeItem(LIVE_SESSION_STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  /** Live API requires a valid Flask teacher session — do not trust local eap_user alone. */
  async function liveTeacherContext() {
    if (typeof fetchCurrentSessionUser !== "function") return null;
    const server = await fetchCurrentSessionUser();
    if (server && server.role === "teacher") {
      if (typeof saveUserToSession === "function") saveUserToSession(server);
      return server;
    }
    if (server && server.role && typeof authStorageRemoveAll === "function") {
      authStorageRemoveAll();
      if (typeof initAppPageHeader === "function") initAppPageHeader();
    }
    return null;
  }

  function launchErrorMessage(err) {
    const msg = (err && err.message) || "";
    const status = err && err.httpStatus;
    if (/not logged in/i.test(msg) || status === 401) {
      return t("tlive_launch_fail_login");
    }
    if (/wrong role/i.test(msg) || status === 403) {
      return t("tlive_launch_fail_wrong_role");
    }
    if (/session not found/i.test(msg) || status === 404 || (err && err.code === "live_not_found")) {
      return t("tlive_launch_fail_session");
    }
    return t("tlive_launch_fail_generic");
  }

  function liveSessionActive() {
    return !!(window.__tliveLiveSession && window.__tliveLiveSession.code);
  }

  function updateSessionJoinBanner() {
    const el = document.getElementById("tlive-session-join");
    const codeEl = document.getElementById("tlive-session-code");
    const linkEl = document.getElementById("tlive-join-link");
    const sess = window.__tliveLiveSession;
    if (!el) return;
    if (!sess || !sess.code) {
      el.classList.add("hidden");
      el.setAttribute("hidden", "");
      return;
    }
    el.classList.remove("hidden");
    el.removeAttribute("hidden");
    if (codeEl) codeEl.textContent = sess.code;
    if (linkEl) {
      linkEl.href = sess.join_path || `student-live.html?code=${encodeURIComponent(sess.code)}`;
      linkEl.textContent = sess.join_url || linkEl.href;
    }
  }

  async function ensureLiveSession(ctx) {
    const api = getLiveApi();
    if (!api) return false;

    const teacherAuth = await liveTeacherContext();
    if (!teacherAuth) {
      clearPersistedLiveSession();
      window.__tliveLiveSession = null;
      return false;
    }

    if (window.__tliveLiveSession && window.__tliveLiveSession.code) {
      updateSessionJoinBanner();
      return true;
    }

    const persisted = loadPersistedLiveSession(ctx);
    if (persisted && persisted.code) {
      window.__tliveLiveSession = {
        code: persisted.code,
        join_url: persisted.join_url,
        join_path: persisted.join_path,
        class_name: persisted.class_name || ctx.className,
        launchId: null,
        useLive: true,
      };
      updateSessionJoinBanner();
      return true;
    }

    try {
      const data = await api.createSession(ctx.className, ctx.date, {
        teacher_username: teacherAuth.username,
      });
      window.__tliveLiveSession = {
        code: data.session_code,
        join_url: data.join_url,
        join_path: data.join_path,
        class_name: data.class_name,
        launchId: null,
        useLive: true,
      };
      persistLiveSession(window.__tliveLiveSession);
      updateSessionJoinBanner();
      return true;
    } catch (_) {
      window.__tliveLiveSession = { useLive: false };
      return false;
    }
  }

  function normalizeQuestionForLaunch(question) {
    if (!question || typeof question !== "object") return null;
    const optionsEn = Array.isArray(question.optionsEn) ? question.optionsEn : [];
    const optionsZh = Array.isArray(question.optionsZh) ? question.optionsZh : [];
    return {
      textEn: String(question.textEn || "").trim(),
      textZh: String(question.textZh || "").trim(),
      optionsEn,
      optionsZh: optionsZh.length ? optionsZh : optionsEn,
      correctIndex: Number.isInteger(question.correctIndex) ? question.correctIndex : 0,
    };
  }

  /** Phase L29 — attach game type + classroom context for student live UI. */
  function buildLaunchPayload(question, launchMeta) {
    const base = normalizeQuestionForLaunch(question);
    if (!base) return null;
    const meta = launchMeta && typeof launchMeta === "object" ? launchMeta : {};
    const gameType = String(meta.gameType || "poll")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");
    const out = { ...base, gameType: gameType || "poll" };
    if (meta.context && typeof meta.context === "object") {
      out.context = meta.context;
    }
    return out;
  }

  function liveLaunchMeta(gameType, context) {
    const meta = { gameType: gameType || "poll" };
    if (context && typeof context === "object") meta.context = context;
    return meta;
  }

  function updateLaunchStatus(message, isOk) {
    const el = document.getElementById("tlive-launch-status");
    if (!el) return;
    if (!message) {
      el.textContent = "";
      el.classList.add("hidden");
      el.hidden = true;
      return;
    }
    el.textContent = message;
    el.classList.remove("hidden");
    el.hidden = false;
    el.classList.toggle("tlive-launch-status--ok", !!isOk);
    el.classList.toggle("tlive-launch-status--err", !isOk);
  }

  let activityStatsAbort = null;
  let activityStatsPageId = null;

  function stopActivityStatsPoll() {
    if (activityStatsAbort) {
      activityStatsAbort.abort();
      activityStatsAbort = null;
    }
    activityStatsPageId = null;
  }

  function renderActivityStatsPanel(stats) {
    const panel = document.getElementById("tlive-activity-stats");
    if (!panel) return;
    const summary = (stats && stats.summary) || {};
    const activities = (stats && stats.activities) || [];
    if (!activities.length) {
      panel.innerHTML = `<p class="tlive-activity-stats__empty">${escapeHtml(t("tlive_activity_empty"))}</p>`;
      return;
    }
    panel.innerHTML = `
      <p class="tlive-activity-stats__summary">${escapeHtml(
        t("tlive_activity_summary", {
          count: String(summary.responses || 0),
          pct: String(summary.accuracy_pct != null ? summary.accuracy_pct : 0),
        }),
      )}</p>
      <ul class="tlive-activity-stats__list">
        ${activities
          .map(
            (a) => `
          <li>
            <strong>${escapeHtml(a.activity_id)}</strong>
            — ${escapeHtml(t("tlive_activity_row", { count: String(a.count || 0), pct: String(a.accuracy_pct || 0), sec: String(Math.round((a.avg_duration_ms || 0) / 1000)) }))}
          </li>`,
          )
          .join("")}
      </ul>`;
  }

  async function refreshActivityStats(pageId, sinceCount) {
    const api = getLiveApi();
    const sess = window.__tliveLiveSession;
    if (!api || !sess || !sess.code || !pageId) return null;
    try {
      if (typeof api.fetchActivityStatsWait === "function" && sinceCount != null) {
        const controller = new AbortController();
        activityStatsAbort = controller;
        return await api.fetchActivityStatsWait(sess.code, pageId, sinceCount, controller.signal);
      }
      return await api.fetchActivityStats(sess.code, pageId);
    } catch (err) {
      if (err && err.name === "AbortError") return null;
      return await api.fetchActivityStats(sess.code, pageId);
    }
  }

  async function startActivityStatsPoll(pageId) {
    stopActivityStatsPoll();
    if (!pageId) return;
    activityStatsPageId = pageId;
    let sinceCount = 0;

    async function loop() {
      if (activityStatsPageId !== pageId) return;
      try {
        const stats = await refreshActivityStats(pageId, sinceCount);
        if (!stats) return;
        sinceCount = (stats.summary && stats.summary.responses) || 0;
        renderActivityStatsPanel(stats);
      } catch (_) {
        /* ignore */
      }
      if (activityStatsPageId === pageId) {
        window.setTimeout(loop, getLiveApi()?.FALLBACK_POLL_MS || 4000);
      }
    }
    void loop();
  }

  async function pushDisplayToClass(payload, opts) {
    const silent = !!(opts && opts.silent);
    const api = getLiveApi();
    if (!api || typeof api.pushDisplay !== "function") {
      if (!silent) updateLaunchStatus(t("tlive_push_fail_no_api"), false);
      return false;
    }
    const teacher = await liveTeacherContext();
    if (!teacher) {
      if (!silent) updateLaunchStatus(t("tlive_launch_fail_login"), false);
      return false;
    }
    const ctx = contextFromUrl();
    if (!(await ensureLiveSession(ctx))) {
      if (!silent) updateLaunchStatus(t("tlive_launch_fail_no_session"), false);
      return false;
    }
    const sess = window.__tliveLiveSession;
    try {
      await api.pushDisplay(sess.code, payload || {}, { teacher_username: teacher.username });
      if (!silent) updateLaunchStatus(t("tlive_push_ok"), true);
      return true;
    } catch (err) {
      if (!silent) updateLaunchStatus(launchErrorMessage(err), false);
      return false;
    }
  }

  function injectLessonBridge(html, pageId) {
    let text = html;
    if (typeof window.EAP_polishLessonHtml === "function") {
      text = window.EAP_polishLessonHtml(text);
    }
    if (typeof window.EAP_injectLiveBridge === "function") {
      const ctx =
        pageId && window.__tliveLiveSession?.code
          ? {
              sessionCode: window.__tliveLiveSession.code,
              pageId,
              apiBase: (getLiveApi() && getLiveApi().API_BASE) || window.location.origin,
              role: "teacher",
            }
          : null;
      return window.EAP_injectLiveBridge(text, ctx);
    }
    return text;
  }

  function renderHtmlLessonOnCanvas(html, title, pageId) {
    window.__tliveLessonOnStage = true;
    window.__tliveLessonCache = { type: "html", html, title, pageId };
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !html) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    const activityCount =
      typeof window.EAP_countLessonActivities === "function" ? window.EAP_countLessonActivities(html) : 0;
    const segments = Array.isArray(window.__tliveLessonPlanSegments) ? window.__tliveLessonPlanSegments : [];
    const segmentOpts = segments.length
      ? segments
          .map((seg, i) => {
            const label = (seg && (seg.title || seg.name)) || t("tlive_pq_segment_n", { n: i + 1 });
            return `<option value="${i}">${escapeHtml(label)}</option>`;
          })
          .join("")
      : "";
    const segmentBar = segments.length
      ? `<div class="tlive-lesson-sync" role="group" aria-label="${escapeHtml(t("tlive_lesson_sync_group"))}">
          <label class="tlive-lesson-sync__label" for="tlive-lesson-segment">${escapeHtml(t("tlive_lesson_sync_segment"))}</label>
          <select id="tlive-lesson-segment" class="tlive-lesson-sync__select">
            <option value="">${escapeHtml(t("tlive_lesson_sync_all_segments"))}</option>
            ${segmentOpts}
          </select>
          <button type="button" class="btn-secondary btn-small" id="tlive-lesson-segment-push">${escapeHtml(t("tlive_lesson_sync_push_segment"))}</button>
          <span class="tlive-lesson-sync__status" id="tlive-lesson-sync-status" aria-live="polite"></span>
        </div>`
      : "";

    canvas.innerHTML = `
      <div class="tla-live-present tla-live-present--with-stats">
        <div class="tla-live-present__head">
          <p class="tla-live-present__title">${escapeHtml(title || t("tla_preview_title"))}</p>
          <button type="button" class="btn-secondary btn-small" id="tlive-push-html-again">${escapeHtml(t("tlive_push_again"))}</button>
        </div>
        ${segmentBar}
        <div class="tla-live-present__stage">
          <iframe class="tla-live-present__frame" sandbox="allow-scripts allow-same-origin" title="${escapeHtml(title || "Lesson")}"></iframe>
          <aside id="tlive-activity-stats" class="tlive-activity-stats" aria-live="polite">${
            activityCount
              ? `<p class="tlive-activity-stats__summary">${escapeHtml(t("tlive_activity_live_hint", { count: activityCount }))}</p>`
              : `<p class="tlive-activity-stats__empty">${escapeHtml(t("tlive_activity_none_hint"))}</p>`
          }</aside>
        </div>
      </div>
    `;
    refreshLessonSlotsFromHtml(html, pageId);
    window.__tliveLessonPageId = pageId || null;
    const frame = canvas.querySelector("iframe");
    if (frame) frame.srcdoc = injectLessonBridge(html, pageId);
    document.getElementById("tlive-push-html-again")?.addEventListener("click", () => {
      void pushHtmlLessonToClass({ html, title, pageId });
    });
    document.getElementById("tlive-lesson-segment-push")?.addEventListener("click", () => {
      const sel = document.getElementById("tlive-lesson-segment");
      const statusEl = document.getElementById("tlive-lesson-sync-status");
      const raw = sel ? sel.value : "";
      const patch =
        raw === "" ? { active_segment: null } : { active_segment: parseInt(raw, 10) };
      const api = getLiveApi();
      const code = window.__tliveLiveSession?.code;
      const teacher = window.__tliveTeacherUser;
      if (!api || !code || typeof api.pushLessonSync !== "function") {
        if (statusEl) statusEl.textContent = t("tlive_lesson_sync_fail");
        return;
      }
      if (statusEl) statusEl.textContent = t("tlive_lesson_sync_pushing");
      void api
        .pushLessonSync(code, patch, teacher?.username ? { teacher_username: teacher.username } : {})
        .then(() => {
          if (statusEl) statusEl.textContent = t("tlive_lesson_sync_ok");
          try {
            frame?.contentWindow?.EAP_applyLessonSyncState?.({
              active_segment: patch.active_segment == null ? null : patch.active_segment,
            });
          } catch (_) {
            /* preview iframe */
          }
        })
        .catch(() => {
          if (statusEl) statusEl.textContent = t("tlive_lesson_sync_fail");
        });
    });
    if (pageId && activityCount) void startActivityStatsPoll(pageId);
    if (window.__tliveSidePanelVisible && window.__tliveSidePanelTool) {
      const MOCK = getMock();
      const sideTool = window.__tliveSidePanelTool;
      if (MOCK && (sideTool === "poll" || sideTool === "quiz")) {
        window.__tlivePollQuizMountedFp = null;
        void mountPollQuizForTool(sideTool, MOCK);
      }
    }
  }

  async function pushHtmlLessonToClass(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const html = o.html || "";
    const title = o.title || "";
    const pageId = o.page_id || o.pageId || null;
    const className = o.class_name || o.className || contextFromUrl().className;
    if (!html) return false;
    let libItem = null;
    if (pageId) libItem = await addHtmlToDisplayLibrary(className, pageId, title, false);
    renderHtmlLessonOnCanvas(html, title, pageId);
    const api = getDisplayApi();
    if (libItem && api) {
      try {
        const res = await api.activateItem(libItem.id);
        if (res.display) return pushDisplayToClass(res.display);
      } catch (_) {
        /* fall through */
      }
    }
    const payload = { mode: "html", title };
    if (pageId) payload.page_id = pageId;
    if (libItem) payload.display_item_id = libItem.id;
    return pushDisplayToClass(payload);
  }

  async function pushSlidesDisplay() {
    window.__tliveLessonOnStage = false;
    hidePollQuizPanel();
    stopActivityStatsPoll();
    return pushDisplayToClass({ mode: "slides", title: t("tlive_welcome_title") });
  }

  const displayLibrary = { items: [], activeId: null, className: "" };

  function resolveActiveLessonPageId() {
    const activeId = displayLibrary.activeId;
    if (activeId && displayLibrary.items.length) {
      const item = displayLibrary.items.find((i) => String(i.id) === String(activeId));
      if (item && item.item_type === "html" && item.page_id) {
        return String(item.page_id);
      }
    }
    if (typeof window.EAP_getActiveLessonPageId === "function") {
      const pid = window.EAP_getActiveLessonPageId();
      if (pid) return String(pid);
    }
    return window.__tliveLessonPageId != null && window.__tliveLessonPageId !== ""
      ? String(window.__tliveLessonPageId)
      : "";
  }

  async function ensureLessonHtmlForActiveDisplayItem(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const activeId = displayLibrary.activeId;
    if (!activeId) return syncLiveLessonFromActiveSource();
    const item = displayLibrary.items.find((i) => String(i.id) === String(activeId));
    if (!item || item.item_type !== "html" || !item.page_id) {
      return syncLiveLessonFromActiveSource();
    }
    const pageId = String(item.page_id);
    const cache = window.__tliveLessonCache;
    if (
      cache &&
      cache.type === "html" &&
      String(cache.pageId) === pageId &&
      cache.html &&
      cache.html.length >= 80
    ) {
      refreshLessonSlotsFromHtml(cache.html, pageId);
      return true;
    }
    if (options.localOnly) return syncLiveLessonFromActiveSource();
    const tapi = window.EAP_TEACHER_TEACHING_PAGES;
    if (!tapi || typeof tapi.getPage !== "function") return syncLiveLessonFromActiveSource();
    const waitMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 12000;
    try {
      const pagePromise = tapi.getPage(pageId);
      const page = await Promise.race([
        pagePromise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("lesson fetch timeout")), waitMs);
        }),
      ]);
      const html = page && page.html_content ? String(page.html_content) : "";
      if (html.length < 80) return syncLiveLessonFromActiveSource();
      const title = (page && page.title ? String(page.title) : item.title || "").trim();
      window.__tliveLessonOnStage = true;
      window.__tliveLessonPageId = pageId;
      window.__tliveLessonCache = { type: "html", html, title, pageId };
      refreshLessonSlotsFromHtml(html, pageId);
      return true;
    } catch (_) {
      return syncLiveLessonFromActiveSource();
    }
  }

  window.EAP_resolveActiveLessonPageId = resolveActiveLessonPageId;

  function getDisplayApi() {
    return window.EAP_CLASSROOM_DISPLAY || null;
  }

  function classroomDisplayFileUrl(item, apiBase) {
    if (item && item.file_url) return item.file_url;
    const fp = String((item && item.file_path) || "").replace(/\\/g, "/");
    const base = String(apiBase || window.location.origin).replace(/\/$/, "");
    const rel = fp.includes("classroom-display/") ? fp : `classroom-display/${fp.split("/").pop() || fp}`;
    const parts = rel.split("/").map((p) => encodeURIComponent(p));
    return `${base}/uploads/${parts.join("/")}`;
  }

  async function loadDisplayLibrary(ctx) {
    const api = getDisplayApi();
    displayLibrary.loadError = null;
    if (!api) {
      renderDisplayLibraryList();
      return;
    }
    displayLibrary.className = ctx.className || "EAP047";
    try {
      let teacherUsername = "";
      try {
        const teacher = await liveTeacherContext();
        teacherUsername = (teacher && teacher.username) || "";
      } catch (_) {
        /* session optional in demo */
      }
      const data = await api.listItems(displayLibrary.className, teacherUsername);
      displayLibrary.items = (data.items || []).slice().sort((a, b) => {
        const ta = String(a.updated_at || a.created_at || "");
        const tb = String(b.updated_at || b.created_at || "");
        return tb.localeCompare(ta);
      });
      displayLibrary.activeId = data.active_item_id || null;
      renderDisplayLibraryList();
    } catch (err) {
      displayLibrary.items = [];
      displayLibrary.activeId = null;
      displayLibrary.loadError = (err && err.message) || t("tlive_display_load_failed");
      renderDisplayLibraryList();
      updateLaunchStatus(displayLibrary.loadError, false);
    }
  }

  function renderDisplayLibraryList() {
    const list = document.getElementById("tlive-display-list");
    if (!list) return;
    if (displayLibrary.loadError) {
      list.innerHTML = `<li class="tlive-display-list__empty">${escapeHtml(displayLibrary.loadError)}</li>`;
      return;
    }
    if (!displayLibrary.items.length) {
      list.innerHTML = `<li class="tlive-display-list__empty">${escapeHtml(t("tlive_display_empty"))}</li>`;
      return;
    }
    list.innerHTML = displayLibrary.items
      .map((item) => {
        const active = item.id === displayLibrary.activeId ? " tlive-display-list__item--active" : "";
        const badge = item.item_type === "html" ? t("tlive_display_type_html") : t("tlive_display_type_file");
        const when =
          typeof window.EAP_savedAtLabel === "function"
            ? window.EAP_savedAtLabel(item.updated_at || item.created_at)
            : "";
        const whenHtml = when
          ? `<span class="tlive-display-list__when">${escapeHtml(when)}</span>`
          : "";
        return `<li class="tlive-display-list__item${active}">
          <button type="button" class="tlive-display-list__show" data-show="${item.id}">${escapeHtml(item.title)}</button>
          ${whenHtml}
          <span class="tlive-display-list__badge">${escapeHtml(badge)}</span>
          <button type="button" class="btn-secondary btn-small" data-del-display="${item.id}">${escapeHtml(t("tla_delete"))}</button>
        </li>`;
      })
      .join("");
    list.querySelectorAll("[data-show]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = displayLibrary.items.find((i) => String(i.id) === btn.getAttribute("data-show"));
        if (item) void showDisplayLibraryItem(item, true);
      });
    });
    list.querySelectorAll("[data-del-display]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void deleteDisplayLibraryItem(btn.getAttribute("data-del-display"));
      });
    });
  }

  function mergeDisplayLibraryItem(updated) {
    if (!updated || updated.id == null) return;
    const idx = displayLibrary.items.findIndex((i) => String(i.id) === String(updated.id));
    if (idx >= 0) displayLibrary.items[idx] = { ...displayLibrary.items[idx], ...updated };
    else displayLibrary.items.push(updated);
  }

  async function showDisplayLibraryItem(item, pushLive) {
    const api = getDisplayApi();
    if (!item) return;
    displayLibrary.activeId = item.id;
    renderDisplayLibraryList();
    if (api && pushLive) {
      try {
        const res = await api.activateItem(item.id);
        if (res.item) {
          mergeDisplayLibraryItem(res.item);
          item = res.item;
        }
        if (res.display) await pushDisplayToClass(res.display);
      } catch (_) {
        /* still show locally */
      }
    }
    if (item.item_type === "html" && item.page_id) {
      const tapi = window.EAP_TEACHER_TEACHING_PAGES;
      if (tapi) {
        try {
          const page = await tapi.getPage(item.page_id);
          renderHtmlLessonOnCanvas(page.html_content, page.title, item.page_id);
          return;
        } catch (_) {
          /* fall through */
        }
      }
    }
    if (item.item_type === "file") {
      await renderFileOnCanvas(item);
    }
  }

  async function renderFileOnCanvas(item) {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas) return;
    window.__tliveLessonOnStage = true;
    window.__tliveLessonCache = { type: "file", item };
    window.__tliveLessonPageId = null;
    window.__tliveLessonSlots = [];
    window.__tliveLessonPlanSegments = [];
    window.__tlivePollQuizMountedFp = null;
    if (typeof window.EAP_invalidateLiveLessonAiCache === "function") {
      window.EAP_invalidateLiveLessonAiCache();
    }
    stopActivityStatsPoll();
    const base = (getLiveApi() && getLiveApi().API_BASE) || window.location.origin;
    const lib = getDisplayApi();
    const downloadUrlVal = item.download_url || classroomDisplayFileUrl(item, base);
    let previewPdfUrl = item.preview_pdf_url || "";
    const inlineViewUrl =
      item.id && lib && typeof lib.viewItemUrl === "function" ? lib.viewItemUrl(item.id) : "";
    const ext = (item.file_ext || "").toLowerCase();
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    const mount = window.EAP_mountFileViewer;
    if (typeof mount === "function") {
      const ensurePreviewFn =
        lib && typeof lib.ensurePreview === "function" && item.id
          ? async () => {
              const res = await lib.ensurePreview(item.id);
              if (res.item) {
                mergeDisplayLibraryItem(res.item);
                return {
                  previewPdfUrl: res.item.preview_pdf_url || "",
                  downloadUrl: res.item.download_url || downloadUrlVal,
                };
              }
              return { previewPdfUrl: "", downloadUrl: downloadUrlVal };
            }
          : null;
      await mount(canvas, {
        url: downloadUrlVal,
        downloadUrl: downloadUrlVal,
        inlineViewUrl,
        previewPdfUrl: inlineViewUrl || previewPdfUrl,
        ext,
        title: item.title || item.file_name,
        fetchPreviewWithCredentials: true,
        downloadLabel: t("tlive_display_download"),
        openLabel: t("tlive_display_open_file"),
        previewHint: t("tlive_preview_unavailable_hint"),
        loadingHint: t("tlive_preview_converting"),
        lead: t("tlive_display_file_lead"),
        ensurePreview: ensurePreviewFn,
      });
      return;
    }
    canvas.innerHTML = `
      <div class="tlive-file-display">
        <h2>${escapeHtml(item.title || item.file_name)}</h2>
        <a class="btn-primary" href="${escapeHtml(downloadUrlVal)}" target="_blank" rel="noopener">${escapeHtml(t("tlive_display_open_file"))}</a>
      </div>`;
  }

  async function deleteDisplayLibraryItem(id) {
    const api = getDisplayApi();
    if (!api || !window.confirm(t("tlive_display_delete_confirm"))) return;
    try {
      const res = await api.deleteItem(id);
      displayLibrary.items = displayLibrary.items.filter((i) => String(i.id) !== String(id));
      if (res.cleared_active || String(displayLibrary.activeId) === String(id)) {
        displayLibrary.activeId = null;
        const ctx = contextFromUrl();
        renderWelcome(ctx);
      }
      renderDisplayLibraryList();
    } catch (err) {
      updateLaunchStatus((err && err.message) || t("tlive_display_delete_failed"), false);
    }
  }

  function bindDisplayLibrary(ctx) {
    document.getElementById("tlive-display-upload-btn")?.addEventListener("click", () => {
      document.getElementById("tlive-display-file-input")?.click();
    });
    document.getElementById("tlive-display-file-input")?.addEventListener("change", (ev) => {
      const files = ev.target.files;
      if (!files || !files.length) return;
      void (async () => {
        const api = getDisplayApi();
        if (!api) return;
        for (const file of files) {
          try {
            const item = await api.uploadFile(displayLibrary.className || ctx.className, file);
            displayLibrary.items.push(item);
            await showDisplayLibraryItem(item, true);
          } catch (err) {
            updateLaunchStatus((err && err.message) || t("tlive_display_upload_failed"), false);
          }
        }
        renderDisplayLibraryList();
        ev.target.value = "";
      })();
    });
  }

  async function addHtmlToDisplayLibrary(className, pageId, title, activate) {
    const api = getDisplayApi();
    if (!api) return null;
    try {
      const item = await api.addHtmlPage(className, pageId, title);
      if (displayLibrary.className === className) {
        const exists = displayLibrary.items.some((i) => String(i.id) === String(item.id));
        if (!exists) displayLibrary.items.push(item);
        renderDisplayLibraryList();
      }
      if (activate) await showDisplayLibraryItem(item, true);
      return item;
    } catch (_) {
      return null;
    }
  }

  async function launchToStudents(question, boardState, launchMeta) {
    const payload = buildLaunchPayload(question, launchMeta);
    if (!payload || !payload.optionsEn.length) {
      updateLaunchStatus(t("tlive_launch_fail_no_question"), false);
      return false;
    }

    window.__tliveLaunched = {
      question: payload,
      boardState: boardState || null,
      at: Date.now(),
    };

    const api = getLiveApi();
    if (!api) {
      updateLaunchStatus(t("tlive_launch_fail_no_api"), false);
      return false;
    }

    const teacher = await liveTeacherContext();
    if (!teacher) {
      if (typeof authStorageRemoveAll === "function") authStorageRemoveAll();
      if (typeof initAppPageHeader === "function") initAppPageHeader();
      updateLaunchStatus(t("tlive_launch_fail_login"), false);
      return false;
    }
    if (typeof initAppPageHeader === "function") initAppPageHeader();

    const ctx = contextFromUrl();
    let sess = window.__tliveLiveSession;
    if (!sess || !sess.code) {
      const ok = await ensureLiveSession(ctx);
      if (!ok) {
        updateLaunchStatus(t("tlive_launch_fail_no_session"), false);
        return false;
      }
      sess = window.__tliveLiveSession;
    }

    const launchOpts = { teacher_username: teacher.username };

    async function postLaunch(code) {
      updateLaunchStatus(t("tlive_launch_sending"), false);
      const data = await api.launchQuestion(code, payload, launchOpts);
      sess.launchId = data.launch_id;
      sess.useLive = true;
      persistLiveSession(sess);
      updateLaunchStatus(t("tlive_launch_ok"), true);
      return true;
    }

    try {
      return await postLaunch(sess.code);
    } catch (err) {
      sess.useLive = false;
      const status = err && err.httpStatus;
      if (status === 401 || /not logged in/i.test((err && err.message) || "")) {
        clearPersistedLiveSession();
        window.__tliveLiveSession = null;
        if (typeof authStorageRemoveAll === "function") authStorageRemoveAll();
        if (typeof initAppPageHeader === "function") initAppPageHeader();
        updateLaunchStatus(t("tlive_launch_fail_login"), false);
        return false;
      }
      if (status === 404 || (err && err.code === "live_not_found")) {
        clearPersistedLiveSession();
        window.__tliveLiveSession = null;
        const ok = await ensureLiveSession(ctx);
        if (ok && window.__tliveLiveSession && window.__tliveLiveSession.code) {
          sess = window.__tliveLiveSession;
          try {
            return await postLaunch(sess.code);
          } catch (retryErr) {
            updateLaunchStatus(launchErrorMessage(retryErr), false);
            return false;
          }
        }
      }
      updateLaunchStatus(launchErrorMessage(err), false);
      return false;
    }
  }

  async function fetchResponseRows(question, boardState, opts) {
    const MOCK = getMock();
    if (!MOCK || !question) return { rows: [], live: false, count: 0 };

    const sess = window.__tliveLiveSession;
    const api = getLiveApi();
    if (api && sess && sess.code && sess.launchId) {
      try {
        const sinceCount = opts && opts.sinceCount != null ? opts.sinceCount : 0;
        const useWait =
          opts &&
          opts.wait &&
          typeof api.fetchResponsesWait === "function" &&
          !(typeof document !== "undefined" && document.hidden);
        const data = useWait
          ? await api.fetchResponsesWait(sess.code, sess.launchId, sinceCount, opts.signal)
          : await api.fetchResponses(sess.code, sess.launchId);
        return { rows: data.responses || [], live: true, count: data.count || 0 };
      } catch (_) {
        /* fall through to mock */
      }
    }

    return { rows: MOCK.simulateResponses(question), live: false, count: 0 };
  }

  async function buildResponsesHtml(question, boardState, fetchOpts) {
    const MOCK = getMock();
    if (!MOCK || !question) return "";
    const { rows, live, count } = await fetchResponseRows(question, boardState, fetchOpts);
    const disclaimer = live
      ? t("tlive_responses_live", { n: String(count) })
      : t("tlive_responses_mock");

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
            ${rows.length
              ? rows
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
                  .join("")
              : `<tr><td colspan="5">${escapeHtml(t("tlive_responses_empty"))}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="tlive-disclaimer">${escapeHtml(disclaimer)}</p>
    `;
  }

  function responsesModalLoadingHtml() {
    return `
      <div class="tlive-responses-modal__loading" role="status" aria-live="polite" aria-busy="true">
        <div class="tlive-responses-modal__loading-box">
          <span class="tlive-responses-modal__spinner" aria-hidden="true"></span>
          <p class="tlive-responses-modal__loading-text">${escapeHtml(t("tlive_responses_loading"))}</p>
        </div>
      </div>`;
  }

  function hasBoardContext(boardState) {
    return !!(boardState && boardState.teams);
  }

  function closeResponsesModal() {
    const modal = document.getElementById("tlive-responses-modal");
    if (!modal) return;
    modal._tlivePollStop = true;
    if (modal._tlivePollAbort) {
      modal._tlivePollAbort.abort();
      modal._tlivePollAbort = null;
    }
    if (modal._tlivePollId) {
      window.clearInterval(modal._tlivePollId);
      modal._tlivePollId = null;
    }
    modal.classList.add("hidden");
    modal.setAttribute("hidden", "");
    document.body.classList.remove("tlive-modal-open");
  }

  function buildResponsesModalFootHtml(board) {
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
    return rankingMode
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

  async function openResponsesModal(question, boardState) {
    const MOCK = getMock();
    const modal = document.getElementById("tlive-responses-modal");
    const body = document.getElementById("tlive-responses-modal-body");
    const foot = document.getElementById("tlive-responses-modal-foot");
    if (!MOCK || !modal || !body || !question) return;

    const board = boardState !== undefined ? boardState : window.__tliveLaunched?.boardState;

    modal._tlivePollStop = false;
    modal._tliveLastCount = 0;

    async function paintBody(fetchOpts) {
      const result = await fetchResponseRows(question, board, fetchOpts);
      modal._tliveLastCount = result.count || 0;
      const MOCK = getMock();
      const { rows, live, count } = result;
      const disclaimer = live
        ? t("tlive_responses_live", { n: String(count) })
        : t("tlive_responses_mock");
      body.innerHTML = `
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
            ${rows.length
              ? rows
                  .map((r) => {
                    const team = board?.teams?.find((x) => x.id === r.teamId);
                    const teamLabel = team ? MOCK.teamName(team) : r.teamId;
                    return `<tr class="${r.correct ? "tlive-resp--correct" : ""}">
                  <td>${escapeHtml(r.student)}</td>
                  <td><span class="tlive-resp-team" style="color:${team?.color || "#333"}">${escapeHtml(teamLabel)}</span></td>
                  <td class="tlive-resp-answer">${escapeHtml(r.answer)}</td>
                  <td>${r.correct ? "✓" : "—"}</td>
                  <td>${r.timeSec}s</td>
                </tr>`;
                  })
                  .join("")
              : `<tr><td colspan="5">${escapeHtml(t("tlive_responses_empty"))}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="tlive-disclaimer">${escapeHtml(disclaimer)}</p>
    `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    }

    body.innerHTML = responsesModalLoadingHtml();
    if (foot) {
      foot.innerHTML = `<button type="button" class="btn-secondary" id="tlive-modal-close-btn">${escapeHtml(t("tlive_close_modal"))}</button>`;
    }
    modal.classList.remove("hidden");
    modal.removeAttribute("hidden");
    document.body.classList.add("tlive-modal-open");
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    document.getElementById("tlive-modal-close-btn")?.addEventListener("click", closeResponsesModal);
    document.getElementById("tlive-responses-modal-close")?.focus();

    await paintBody();

    async function pollResponsesLive() {
      const fallbackMs =
        (getLiveApi() && getLiveApi().FALLBACK_POLL_MS) || 4000;
      while (!modal._tlivePollStop && !modal.hasAttribute("hidden")) {
        const controller = new AbortController();
        modal._tlivePollAbort = controller;
        try {
          await paintBody({
            wait: true,
            sinceCount: modal._tliveLastCount,
            signal: controller.signal,
          });
        } catch (_) {
          await new Promise((r) => window.setTimeout(r, fallbackMs));
        } finally {
          if (modal._tlivePollAbort === controller) modal._tlivePollAbort = null;
        }
      }
    }

    if (foot) {
      foot.innerHTML = buildResponsesModalFootHtml(board);
    }

    document.getElementById("tlive-modal-roll-correct")?.addEventListener("click", () => {
      if (!MOCK) return;
      const result = MOCK.processCorrectTeams(window.__tliveBoard || board, question);
      window.__tliveBoard = result.state;
      renderBoardRace(window.__tliveBoard, window.__tliveQuestionIndex || 0);
      void paintBody();
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

    if (liveSessionActive() && window.__tliveLiveSession.launchId) {
      void pollResponsesLive();
    }
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
    window.__tliveOverrideQuestion = null;
    window.__tliveActiveGameId = null;
  }

  function renderQuizBattle(state) {
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;

    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderQuizBattle(state),
    );
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

    if (resolved.pending && !resolved.q) {
      canvas.className = "tlive-canvas__inner tlive-canvas__inner--board tlive-canvas__inner--stage";
      canvas.innerHTML = `
      <div class="tlive-board tlive-quiz">
        <header class="tlive-board__head">
          <h2 class="tlive-board__title">${escapeHtml(t("tlive_quiz_battle_title"))}</h2>
          <p class="tlive-board__round">${escapeHtml(t("tlive_board_round", { round: String(state.round) }))}${challenge ? ` · ${escapeHtml(t("tlive_quiz_challenge"))}` : ""}</p>
        </header>
        <table class="tlive-leaderboard">
          <thead><tr>
            <th>${escapeHtml(t("tlive_board_rank"))}</th>
            <th>${escapeHtml(t("tlive_board_team"))}</th>
            <th>${escapeHtml(t("tlive_board_points"))}</th>
          </tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
        <div class="tlive-question-box">${gameQuestionLoadingHtml()}</div>
        <div class="tlive-board__controls">
          <button type="button" class="btn-secondary" id="tlive-quiz-reset">${escapeHtml(t("tlive_board_reset"))}</button>
        </div>
      </div>`;
      document.getElementById("tlive-quiz-reset")?.addEventListener("click", () => {
        if (!window.confirm(t("tlive_board_reset_confirm"))) return;
        window.__tliveQuiz = MOCK.createQuizBattleState();
        renderQuizBattle(window.__tliveQuiz);
      });
      return;
    }

    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
    const opts = MOCK.questionOptions(q);

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

    document.getElementById("tlive-quiz-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("quiz_battle", { round: state.round })),
    );

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
        questionIndex: (window.__tliveQuiz.questionIndex + 1),
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

    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderTreasureHunt(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-treasure-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("treasure_hunt", { round: state.round })),
    );

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
        questionIndex: (window.__tliveTreasure.questionIndex + 1),
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

    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderEscapeRoom(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-escape-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("escape_room", { round: state.round })),
    );

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
        questionIndex: (window.__tliveEscape.questionIndex + 1),
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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderWordLadder(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-ladder-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("word_ladder", { round: state.round })),
    );

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
        questionIndex: (window.__tliveLadder.questionIndex + 1),
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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderSentenceBuilder(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-sentence-launch")?.addEventListener("click", () => {
      const st = window.__tliveSentence || state;
      launchToStudents(
        q,
        null,
        liveLaunchMeta("sentence_builder", {
          puzzleIndex: st && st.puzzleIndex != null ? st.puzzleIndex : 0,
          puzzleTotal: 3,
        }),
      );
    });

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
        questionIndex: (window.__tliveSentence.questionIndex + 1),
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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderArgumentSorting(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-argument-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("argument_sorting", { round: state.round })),
    );

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
        questionIndex: (window.__tliveArgument.questionIndex + 1),
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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderSummaryMission(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-summary-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("summary_mission", { round: state.round })),
    );

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
        questionIndex: (window.__tliveSummary.questionIndex + 1),
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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderRankingChallenge(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-ranking-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("ranking_challenge", { round: state.round })),
    );

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
    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderDebateCards(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-debate-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("debate_cards", { round: state.round })),
    );

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

    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderHotSeat(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-hotseat-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("hot_seat")),
    );

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

    const resolved = resolveGameQuestionForRender(MOCK, state.questionIndex, () =>
      renderMemoryCard(state),
    );
    if (guardGameQuestionCanvas(resolved, canvas)) return;
    const q = resolved.q;
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

    document.getElementById("tlive-memory-launch")?.addEventListener("click", () =>
      launchToStudents(q, null, liveLaunchMeta("memory_card", { round: state.round })),
    );

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
      window.__tliveBingo = MOCK.createBingoState(window.__tliveLessonVocab);
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
      window.__tliveMatching = MOCK.createMatchingState(window.__tliveLessonVocab);
      renderMatchingRace(window.__tliveMatching);
    });
  }

  function getSavedGamesList() {
    const MOCK = getMock();
    if (!MOCK) return [];
    return MOCK.SAVED_GAMES || [];
  }

  function launchSelectedGame(game, MOCK, opts) {
    const keepQuestion =
      opts && opts.question ? opts.question : window.__tliveOverrideQuestion || null;
    setActiveTool("games");
    clearLiveGameState();
    window.__tliveActiveGameId = game.id;
    if (keepQuestion) window.__tliveOverrideQuestion = keepQuestion;
    if (game.type === "board_race" || game.id === "board-race") {
      window.__tliveBoard = MOCK.createBoardState();
      window.__tliveQuestionIndex = 0;
      renderBoardRace(window.__tliveBoard, 0);
      return;
    }
    if (game.type === "vocab_bingo" || game.id === "vocab-bingo") {
      void startVocabGame("bingo", (terms) => {
        window.__tliveBingo = MOCK.createBingoState(terms);
        renderVocabBingo(window.__tliveBingo);
      });
      return;
    }
    if (game.type === "matching_race" || game.id === "matching-race") {
      void startVocabGame("matching", (terms) => {
        window.__tliveMatching = MOCK.createMatchingState(terms);
        renderMatchingRace(window.__tliveMatching);
      });
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

  function gameListItemHtml(g, MOCK) {
    return `
      <li class="tlive-games-panel__row">
        <button type="button" class="tlive-game-item tlive-games-panel__item" data-game="${escapeHtml(g.id)}">
          <strong>${escapeHtml(MOCK.gameLabel(g, "name"))}</strong>
          <span>${escapeHtml(MOCK.gameLabel(g, "desc"))}</span>
        </button>
      </li>`;
  }

  function buildSuggestedGamesBlockHtml(MOCK, games) {
    const gameSlots =
      typeof window.EAP_gameSlotsPhase1 === "function"
        ? window.EAP_gameSlotsPhase1(lessonSlotsForActiveSegment())
        : [];
    if (!gameSlots.length) return "";
    return `<section class="tlive-lesson-games">
          <h3 class="tlive-lesson-games__title">${escapeHtml(t("tlive_lesson_games_heading"))}</h3>
          <p class="tlive-lesson-games__lead">${escapeHtml(t("tlive_lesson_games_lead"))}</p>
          <ul class="tlive-lesson-games__list">
            ${gameSlots
              .map((slot) => {
                const g = games.find((x) => x.id === slot.gameId);
                const name = g ? MOCK.gameLabel(g, "name") : slot.gameId;
                const label = window.EAP_liveSlotLabel ? window.EAP_liveSlotLabel(slot) : name;
                return `<li>
                  <button type="button" class="btn-primary tlive-lesson-game-btn" data-lesson-game="${escapeHtml(slot.gameId)}" data-slot-id="${escapeHtml(slot.id)}">
                    ${escapeHtml(name)} — ${escapeHtml(label.slice(0, 48))}
                  </button>
                </li>`;
              })
              .join("")}
          </ul>
        </section>`;
  }

  function patchGamesLibrarySuggested() {
    if (!isGamesLibraryView()) return;
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!MOCK || !canvas) return;
    const panel = canvas.querySelector(".tlive-games-panel");
    if (!panel) return;
    const games = getSavedGamesList();
    const html = buildSuggestedGamesBlockHtml(MOCK, games);
    const existing = panel.querySelector(".tlive-lesson-games");
    if (html) {
      if (existing) existing.outerHTML = html;
      else {
        const toast = panel.querySelector("#tlive-games-toast");
        const insertBefore = toast ? toast.nextSibling : panel.querySelector(".tlive-games-panel__scroll");
        if (insertBefore) {
          insertBefore.insertAdjacentHTML("beforebegin", html);
        }
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function pickGameFromCanvasClick(ev) {
    const lessonBtn = ev.target.closest("[data-lesson-game]");
    if (lessonBtn) {
      const gameId = lessonBtn.getAttribute("data-lesson-game");
      const slotId = lessonBtn.getAttribute("data-slot-id");
      const slot = (window.__tliveLessonSlots || []).find((s) => String(s.id) === String(slotId));
      let launchQ = null;
      if (slot && typeof window.EAP_slotToLaunchQuestion === "function") {
        launchQ = window.EAP_slotToLaunchQuestion(slot);
      }
      if (gameId) loadGame(gameId, { question: launchQ });
      return;
    }
    const gameBtn = ev.target.closest("[data-game]");
    if (gameBtn) {
      const id = gameBtn.getAttribute("data-game");
      if (id) loadGame(id);
    }
  }

  function bindGamesCanvasDelegation() {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || canvas.dataset.tliveGamesBound === "1") return;
    canvas.dataset.tliveGamesBound = "1";
    canvas.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-game], [data-lesson-game]")) return;
      ev.preventDefault();
      pickGameFromCanvasClick(ev);
    });
  }

  function bindGamesCanvasDelegation() {
    const force = !!(opts && opts.force);
    if (!force && isLiveGameActive()) return;
    const MOCK = getMock();
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !MOCK) return;
    const games = getSavedGamesList();
    const suggestedBlock = buildSuggestedGamesBlockHtml(MOCK, games);

    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tlive-games-panel tlive-stage-fill">
        <h2 class="tlive-games-panel__title">${escapeHtml(t("tlive_saved_games"))}</h2>
        <p class="tlive-games-panel__lead">${escapeHtml(t("tlive_games_canvas_lead"))}</p>
        ${suggestedBlock}
        <p id="tlive-games-toast" class="tlive-games-toast hidden" role="status"></p>
        <div class="tlive-games-panel__scroll" role="region" aria-label="${escapeHtml(t("tlive_games_list_region"))}">
          <ul class="tlive-games-panel__list">
            ${games.map((g) => gameListItemHtml(g, MOCK)).join("")}
          </ul>
        </div>
        <p class="tlive-disclaimer">${escapeHtml(t("tlive_saved_games_hint"))}</p>
      </div>
    `;

  }

  function showGamesToast(text) {
    const el = document.getElementById("tlive-games-toast");
    if (el) {
      el.textContent = text;
      el.classList.remove("hidden");
    }
  }

  function gameQuestionLoadingHtml() {
    return `<p class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_game_ai_generating"))}</p>`;
  }

  function showGamesTool() {
    syncLiveLessonFromActiveSource();
    stopLiveTimerIfMounted();
    window.__tliveGameLaunchingId = null;
    clearLiveGameState();
    renderGamesLibrary({ force: true });
    const gen = (window.__tliveGamesLibraryRefreshGen = (window.__tliveGamesLibraryRefreshGen || 0) + 1);
    void ensureLessonHtmlForActiveDisplayItem({ timeoutMs: 12000 }).then((ok) => {
      if (gen !== window.__tliveGamesLibraryRefreshGen) return;
      if (!ok || !isGamesLibraryView()) return;
      patchGamesLibrarySuggested();
    });
  }

  function loadGame(gameId, opts) {
    window.__tliveGamesLibraryRefreshGen = (window.__tliveGamesLibraryRefreshGen || 0) + 1;
    window.__tliveGameLaunchingId = gameId;
    const MOCK = getMock();
    if (!MOCK) {
      window.__tliveGameLaunchingId = null;
      return;
    }
    syncLiveLessonFromActiveSource();
    if (!(window.__tliveLessonSlots || []).length) {
      void ensureLessonHtmlForActiveDisplayItem({ timeoutMs: 8000 }).then(() => {
        if (!(window.__tliveLessonSlots || []).length) {
          showGamesToast(t("tlive_pq_no_lesson_html"));
          window.__tliveGameLaunchingId = null;
          return;
        }
        loadGame(gameId, opts);
      });
      return;
    }
    const games = getSavedGamesList();
    const game = games.find((g) => g.id === gameId);
    if (!game) {
      showGamesToast(t("tlive_game_not_phase1"));
      window.__tliveGameLaunchingId = null;
      return;
    }
    try {
      launchSelectedGame(game, MOCK, opts);
    } catch (err) {
      showGamesToast((err && err.message) || t("tlive_game_ai_failed"));
      if (isGamesLibraryView()) renderGamesLibrary({ force: true });
      window.__tliveGameLaunchingId = null;
      return;
    }
    const asyncVocab =
      game.type === "vocab_bingo" ||
      game.id === "vocab-bingo" ||
      game.type === "matching_race" ||
      game.id === "matching-race";
    if (!asyncVocab) window.__tliveGameLaunchingId = null;
    void ensureLessonHtmlForActiveDisplayItem({ timeoutMs: 12000 });
  }

  function renderNameWheelTool(ctx) {
    const canvas = document.getElementById("tlive-canvas-inner");
    const wheel = window.EAP_NAME_WHEEL;
    if (!canvas || !wheel) {
      showBootError(t("tlive_wheel_load_error"));
      return;
    }
    clearLiveGameState();
    stopLiveTimerIfMounted();
    window.__tliveWheelUnmount = null;
    wheel.mount(canvas, {
      className: ctx.className,
      t,
      escapeHtml,
    });
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function renderTimerTool() {
    const canvas = document.getElementById("tlive-canvas-inner");
    const timerMod = window.EAP_LIVE_TIMER;
    if (!canvas || !timerMod || typeof timerMod.mount !== "function") {
      showBootError(t("tlive_timer_load_error"));
      return;
    }
    clearLiveGameState();
    stopLiveTimerIfMounted();
    const api = timerMod.mount(canvas, {
      t,
      escapeHtml,
      onPush: (payload) => pushDisplayToClass(payload),
      onSync: (payload) => pushDisplayToClass(payload, { silent: true }),
    });
    window.__tliveTimerUnmount = api && typeof api.unmount === "function" ? api.unmount : null;
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

        if (shouldToggleOffSidePanelTool(tool)) {
          persistPollQuizDraft(tool);
          collapseSideToolPanel();
          clearActiveTool();
          return;
        }

        if (shouldToggleOffOverlayTool(tool)) {
          if (restoreLessonFromCache()) {
            clearActiveTool();
            return;
          }
        }

        setActiveTool(tool);
        if (tool === "games") {
          dismissSidePanelIfOpen();
          showGamesTool();
        } else if (tool === "timer") {
          dismissSidePanelIfOpen();
          renderTimerTool();
        } else if (tool === "wheel") {
          dismissSidePanelIfOpen();
          renderNameWheelTool(ctx);
        } else if (tool === "slides") {
          dismissSidePanelIfOpen();
          void pushSlidesDisplay();
          renderWelcome(ctx);
        }
        else if (tool === "poll" || tool === "quiz") {
          if (MOCK) void mountPollQuizForTool(tool, MOCK);
        } else if (tool === "upload") {
          dismissSidePanelIfOpen();
          const canvas = document.getElementById("tlive-canvas-inner");
          const lessonAi = window.EAP_TEACHER_LESSON_AI;
          if (canvas && lessonAi && typeof lessonAi.mountLivePanel === "function") {
            void (async () => {
              const api = window.EAP_TEACHER_TEACHING_PAGES;
              if (api && lessonAi.setAiAvailable) {
                try {
                  const st = await api.getAiStatus();
                  lessonAi.setAiAvailable(!!st.available);
                } catch (_) {
                  lessonAi.setAiAvailable(false);
                }
              }
              lessonAi.mountLivePanel(canvas, ctx);
            })();
          } else if (canvas) {
            canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
            canvas.innerHTML = `<p>${escapeHtml(t("tlive_tool_soon"))}</p>`;
          }
        } else if (tool === "ai") {
          window.location.href = "teacher-lesson-ai.html";
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

  function reapplyActiveToolView(ctx) {
    const tool = getActiveToolbarTool();
    const MOCK = getMock();
    if (tool === "games") {
      showGamesTool();
      return true;
    }
    if ((tool === "poll" || tool === "quiz") && MOCK) {
      void mountPollQuizForTool(tool, MOCK);
      return true;
    }
    if (tool === "timer") {
      renderTimerTool();
      return true;
    }
    if (tool === "wheel") {
      renderNameWheelTool(ctx);
      return true;
    }
    return false;
  }

  async function applyBootCanvas(ctx) {
    const tool = getActiveToolbarTool();
    if (tool && tool !== "slides") {
      reapplyActiveToolView(ctx);
      return;
    }
    if (displayLibrary.activeId) {
      await ensureLiveSession(ctx);
      const active = displayLibrary.items.find((i) => i.id === displayLibrary.activeId);
      if (active) await showDisplayLibraryItem(active, true);
      else renderWelcome(ctx);
    } else {
      renderWelcome(ctx);
    }
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
      const backHref = `teacher.html${q.toString() ? `?${q.toString()}` : ""}`;
      back.href = backHref;
      back.addEventListener("click", (ev) => {
        if (typeof window.EAP_warmNavigate === "function" && /onrender\.com$/i.test(location.hostname || "")) {
          ev.preventDefault();
          window.EAP_warmNavigate(backHref);
        }
      });
    }

    bindToolbar(ctx);
    bindModal();
    bindGamesCanvasDelegation();
    if (!window.__tliveMessageBound) {
      window.__tliveMessageBound = true;
      window.addEventListener("message", (ev) => {
        if (!ev.data || typeof ev.data !== "object") return;
        handleLivePickMessage(ev.data);
      });
    }
    bindDisplayLibrary(ctx);
    setActiveTool("slides");
    void (async () => {
      await loadDisplayLibrary(ctx);
      await applyBootCanvas(ctx);
      const urlTool = new URLSearchParams(window.location.search).get("tool");
      if (urlTool === "games") {
        setActiveTool("games");
        showGamesTool();
      }
    })();
  }

  function boot() {
    restoreLessonSlotsFromSession();
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
        isGamesLibraryView()
      ) {
        renderGamesLibrary({ force: true });
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
      } else if (window.__tliveHotSeat) {
        renderHotSeat(window.__tliveHotSeat);
      } else if (window.__tliveDebate) {
        renderDebateCards(window.__tliveDebate);
      } else if (window.__tliveRanking) {
        renderRankingChallenge(window.__tliveRanking);
      } else if (tool === "wheel") {
        renderNameWheelTool(ctx);
      } else if (tool === "timer") {
        renderTimerTool();
      } else if (tool === "slides") {
        renderWelcome(ctx);
      }
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      initPageChrome();
    });

    void (async () => {
      try {
        if (typeof validateSatelliteSessionOrGate !== "function") return;
        const sessionUser = await validateSatelliteSessionOrGate("teacher");
        if (!sessionUser) return;
        initPageChrome();
        const liveReady = await ensureLiveSession(ctx);
        if (!liveReady && typeof fetchCurrentSessionUser === "function") {
          const me = await fetchCurrentSessionUser();
          if (!me) {
            updateLaunchStatus(t("tlive_launch_fail_login"), false);
          }
        }
      } catch (_) {
        showBootError(t("tlive_boot_session_hint"));
      }
    })();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      void liveTeacherContext().then((user) => {
        if (user && typeof initAppPageHeader === "function") initAppPageHeader();
      });
    });
  }

  window.EAP_TEACHER_LIVE = {
    pushHtmlLessonToClass,
    pushDisplayToClass,
    pushSlidesDisplay,
    renderHtmlLessonOnCanvas,
    stopActivityStatsPoll,
    addHtmlToDisplayLibrary,
    loadDisplayLibrary,
    showDisplayLibraryItem,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
