/**
 * Student AI Self-Study — module shell (S3 Vocabulary, S4 Reading & Writing).
 */
(function () {
  const PAGE = "student-self-study-module";
  const MOCK = window.EAP_SELF_STUDY_MOCK;
  const VOCAB = window.EAP_VOCAB_MOCK;
  const READ = window.EAP_READING_MOCK;
  const WRITE = window.EAP_WRITING_MOCK;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function redirectIfDisabled() {
    if (window.EAP_SELF_STUDY_ENABLED === false) {
      window.location.replace("student.html");
      return true;
    }
    return false;
  }

  function getSkill() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("skill") || "").toLowerCase();
  }

  function renderUnsupported(skill) {
    const root = document.getElementById("ssc-module-root");
    if (!root) return;
    root.innerHTML = `
      <div class="ssc-banner">
        <h2>${t("self_study_module_soon_title")}</h2>
        <p>${t("self_study_module_soon_body", { skill })}</p>
        <a href="student-self-study.html" class="btn-primary">${t("self_study_back_hub")}</a>
      </div>
    `;
  }

  function renderProgressBar(pct) {
    const el = document.getElementById("ssc-module-progress-pct");
    const fill = document.getElementById("ssc-module-progress-fill");
    if (el) el.textContent = `${pct}%`;
    if (fill) fill.style.width = `${pct}%`;
  }

  function renderTabs(active) {
    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      const tab = btn.getAttribute("data-tab");
      const selected = tab === active;
      btn.classList.toggle("ssc-tab--active", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
    document.querySelectorAll(".ssc-tab-panel").forEach((panel) => {
      const show = panel.getAttribute("data-panel") === active;
      panel.hidden = !show;
    });
  }

  function renderLearn(root, pack, progress) {
    const wordsHtml = pack.words
      .map(
        (w) => `
        <article class="ssc-word-card">
          <h3 class="ssc-word-card__term">${w.term}</h3>
          <p class="ssc-word-card__def">${VOCAB.wordDef(w)}</p>
        </article>
      `,
      )
      .join("");

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2 data-i18n="self_study_vocab_learn_title">Today's vocabulary</h2>
        <p>${VOCAB.lessonText(pack)}</p>
      </div>
      <div class="ssc-word-grid">${wordsHtml}</div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-learn-done-btn">${progress.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
      </div>
    `;
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();

    document.getElementById("ssc-learn-done-btn")?.addEventListener("click", () => {
      VOCAB.markLearnDone(progress.levelId);
      refreshVocabularyModule(progress.levelId);
    });
  }

  function renderPractice(root, pack, progress) {
    const qs = pack.practice;
    let index = 0;
    const answers = {};

    function renderQuestion() {
      const q = qs[index];
      if (!q) return finishPractice();

      const opts = VOCAB.text(q, "options");
      const chosen = answers[q.id];

      root.innerHTML = `
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(qs.length) })}</p>
        <div class="ssc-question-card">
          <h3>${VOCAB.text(q, "prompt")}</h3>
          <ul class="ssc-options">
            ${opts
              .map(
                (opt, i) =>
                  `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-i="${i}">${opt}</button></li>`,
              )
              .join("")}
          </ul>
        </div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-practice-next" ${chosen == null ? "disabled" : ""}>${index < qs.length - 1 ? t("self_study_next") : t("self_study_vocab_finish_practice")}</button>
        </div>
      `;

      root.querySelectorAll(".ssc-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          answers[q.id] = parseInt(btn.getAttribute("data-i"), 10);
          renderQuestion();
        });
      });
      document.getElementById("ssc-practice-next")?.addEventListener("click", () => {
        if (answers[q.id] == null) return;
        index += 1;
        renderQuestion();
      });
    }

    function finishPractice() {
      let correct = 0;
      qs.forEach((q) => {
        if (answers[q.id] === q.correctIndex) correct += 1;
      });
      VOCAB.markPracticeDone(progress.levelId, correct, qs.length);
      root.innerHTML = `
        <div class="ssc-report">
          <h2 data-i18n="self_study_vocab_practice_done">Practice complete</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(correct), total: String(qs.length) })}</p>
          <button type="button" class="btn-primary" id="ssc-go-game">${t("self_study_vocab_go_game")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-go-game")?.addEventListener("click", () => {
        renderTabs("game");
        renderGame(document.getElementById("ssc-panel-game"), pack, VOCAB.getProgress() || progress);
      });
      refreshVocabularyModule(progress.levelId);
    }

    if (progress.practiceDone) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2 data-i18n="self_study_vocab_practice_done">Practice complete</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(progress.practiceCorrect), total: String(progress.practiceTotal) })}</p>
          <button type="button" class="btn-secondary" id="ssc-practice-redo">${t("self_study_vocab_redo")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-practice-redo")?.addEventListener("click", () => {
        const p = VOCAB.ensureProgress(progress.levelId);
        p.practiceDone = false;
        VOCAB.saveProgress(p);
        index = 0;
        renderQuestion();
      });
      return;
    }

    renderQuestion();
  }

  function renderGame(root, pack, progress) {
    if (progress.gameDone) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2 data-i18n="self_study_vocab_game_title">Matching Race</h2>
          <p>${t("self_study_vocab_game_done", { attempts: String(progress.gameAttempts || 0) })}</p>
          <button type="button" class="btn-secondary" id="ssc-game-redo">${t("self_study_vocab_play_again")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-game-redo")?.addEventListener("click", () => {
        const p = VOCAB.ensureProgress(progress.levelId);
        p.gameDone = false;
        p.gameAttempts = 0;
        VOCAB.saveProgress(p);
        renderGame(root, pack, p);
        refreshVocabularyModule(progress.levelId);
      });
      return;
    }

    const pairs = VOCAB.matchingPairs(progress.levelId);
    let selectedTerm = null;
    let selectedDef = null;
    let matched = new Set();
    let attempts = 0;
    let wrongFlash = null;

    const terms = shuffle([...pairs]);
    const defs = shuffle(pairs.map((p) => ({ id: p.id, label: p.def })));

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function renderBoard() {
      const done = matched.size === pairs.length;
      root.innerHTML = `
        <div class="ssc-game-header">
          <h2 data-i18n="self_study_vocab_game_title">Matching Race</h2>
          <p data-i18n="self_study_vocab_game_hint">Match each term with its definition. Fewer attempts = better.</p>
          <p class="ssc-game-score" aria-live="polite">${t("self_study_vocab_game_status", { matched: String(matched.size), total: String(pairs.length), attempts: String(attempts) })}</p>
        </div>
        <div class="ssc-match-board">
          <div class="ssc-match-col" role="list">
            <h3 class="ssc-match-col__title" data-i18n="self_study_vocab_terms">Terms</h3>
            ${terms
              .map((p) => {
                const isMatched = matched.has(p.id);
                const isSel = selectedTerm === p.id;
                const isWrong = wrongFlash && wrongFlash.term === p.id;
                return `<button type="button" class="ssc-match-item${isMatched ? " ssc-match-item--done" : ""}${isSel ? " ssc-match-item--selected" : ""}${isWrong ? " ssc-match-item--wrong" : ""}" data-term="${p.id}" ${isMatched ? "disabled" : ""}>${p.term}</button>`;
              })
              .join("")}
          </div>
          <div class="ssc-match-col" role="list">
            <h3 class="ssc-match-col__title" data-i18n="self_study_vocab_defs">Definitions</h3>
            ${defs
              .map((d) => {
                const isMatched = matched.has(d.id);
                const isSel = selectedDef === d.id;
                const isWrong = wrongFlash && wrongFlash.def === d.id;
                return `<button type="button" class="ssc-match-item ssc-match-item--def${isMatched ? " ssc-match-item--done" : ""}${isSel ? " ssc-match-item--selected" : ""}${isWrong ? " ssc-match-item--wrong" : ""}" data-def="${d.id}" ${isMatched ? "disabled" : ""}>${d.label}</button>`;
              })
              .join("")}
          </div>
        </div>
        ${done ? `<div class="ssc-placement-actions"><button type="button" class="btn-primary" id="ssc-game-finish">${t("self_study_vocab_save_game")}</button></div>` : ""}
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();

      root.querySelectorAll("[data-term]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (matched.has(btn.getAttribute("data-term"))) return;
          selectedTerm = btn.getAttribute("data-term");
          tryMatch();
          renderBoard();
        });
      });
      root.querySelectorAll("[data-def]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (matched.has(btn.getAttribute("data-def"))) return;
          selectedDef = btn.getAttribute("data-def");
          tryMatch();
          renderBoard();
        });
      });

      document.getElementById("ssc-game-finish")?.addEventListener("click", () => {
        VOCAB.markGameDone(progress.levelId, matched.size, attempts);
        refreshVocabularyModule(progress.levelId);
        renderGame(root, pack, VOCAB.getProgress());
      });
    }

    function tryMatch() {
      if (!selectedTerm || !selectedDef) return;
      attempts += 1;
      if (selectedTerm === selectedDef) {
        matched.add(selectedTerm);
        selectedTerm = null;
        selectedDef = null;
        wrongFlash = null;
        if (matched.size === pairs.length && !progress.gameDone) {
          VOCAB.markGameDone(progress.levelId, matched.size, attempts);
          refreshVocabularyModule(progress.levelId);
        }
      } else {
        wrongFlash = { term: selectedTerm, def: selectedDef };
        setTimeout(() => {
          wrongFlash = null;
          selectedTerm = null;
          selectedDef = null;
          renderBoard();
        }, 450);
      }
    }

    renderBoard();
  }

  function refreshVocabularyModule(levelId) {
    const progress = VOCAB.ensureProgress(levelId);
    const pct = VOCAB.completionPercent(progress);
    renderProgressBar(pct);
    const statusEl = document.getElementById("ssc-module-status");
    if (statusEl) {
      statusEl.textContent =
        pct >= 100 ? t("self_study_vocab_complete") : t("self_study_vocab_in_progress", { pct: String(pct) });
    }
  }

  function initVocabulary(levelId) {
    const pack = VOCAB.getPack(levelId);
    const progress = VOCAB.ensureProgress(levelId);
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");

    if (titleEl) titleEl.textContent = t("self_study_mod_vocab");
    if (levelEl && MOCK) {
      levelEl.textContent = MOCK.levelDisplay(levelId);
      levelEl.className = `ssc-level-badge ssc-level-badge--${levelId}`;
      levelEl.hidden = false;
    }

    refreshVocabularyModule(levelId);

    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        renderTabs(tab);
        const p = VOCAB.getProgress() || progress;
        if (tab === "learn") renderLearn(document.getElementById("ssc-panel-learn"), pack, p);
        if (tab === "practice") renderPractice(document.getElementById("ssc-panel-practice"), pack, p);
        if (tab === "game") renderGame(document.getElementById("ssc-panel-game"), pack, p);
      });
    });

    renderTabs("learn");
    renderLearn(document.getElementById("ssc-panel-learn"), pack, progress);
    renderPractice(document.getElementById("ssc-panel-practice"), pack, progress);
    renderGame(document.getElementById("ssc-panel-game"), pack, progress);
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const sessionUser = await validatePageSessionOrFallback("student");
    if (!sessionUser) return;

    initAppPageHeader();

    const skill = getSkill();
    if (!MOCK) return;

    const placement = MOCK.getPlacement();
    if (!placement) {
      window.location.replace("student-self-study-placement.html");
      return;
    }

    const levelId = placement.levelId;
    const levelEl = document.getElementById("ssc-module-level");
    if (levelEl) {
      levelEl.textContent = MOCK.levelDisplay(levelId);
      levelEl.className = `ssc-level-badge ssc-level-badge--${levelId}`;
      levelEl.hidden = false;
    }

    if (skill === "vocabulary") {
      if (!VOCAB) return;
      initVocabulary(levelId);
    } else if (skill === "reading") {
      if (!window.EAP_MODULE_RW || !READ) return;
      window.EAP_MODULE_RW.initReading(levelId, MOCK, renderTabs);
    } else if (skill === "writing") {
      if (!window.EAP_MODULE_RW || !WRITE) return;
      window.EAP_MODULE_RW.initWriting(levelId, renderTabs);
    } else {
      renderUnsupported(skill || "—");
      return;
    }

    window.addEventListener("eap:langchange", () => {
      if (skill === "vocabulary" && VOCAB) initVocabulary(levelId);
      else if (skill === "reading" && window.EAP_MODULE_RW) window.EAP_MODULE_RW.initReading(levelId, MOCK, renderTabs);
      else if (skill === "writing" && window.EAP_MODULE_RW) window.EAP_MODULE_RW.initWriting(levelId, renderTabs);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
