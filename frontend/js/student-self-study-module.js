/**
 * Student AI Self-Study — module shell (S3 Vocabulary, S4 Reading & Writing).
 */
(function () {
  const PAGE = "student-self-study-module";
  const MOCK = window.EAP_SELF_STUDY_MOCK;
  const VOCAB = window.EAP_VOCAB_MOCK;
  const READ = window.EAP_READING_MOCK;
  const WRITE = window.EAP_WRITING_MOCK;
  const LISTEN = window.EAP_LISTENING_MOCK;
  const SPEAK = window.EAP_SPEAKING_MOCK;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function isZh() {
    return !!(window.EAP_I18N && window.EAP_I18N.getLang() === "zh");
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function managerMaterialsBlock(skill, levelId) {
    const MAT = window.EAP_MANAGER_SSC_MATERIALS;
    return MAT ? MAT.renderLearnBlock(skill, levelId) : "";
  }

  function renderLearn(root, pack, progress) {
    const aiAvailable = !!(window.EAP_SELF_STUDY_AI && typeof window.EAP_SELF_STUDY_AI.explainVocabulary === "function");
    const wordsHtml = pack.words
      .map(
        (w) => `
        <article class="ssc-word-card">
          <h3 class="ssc-word-card__term">${escapeHtml(w.term)}</h3>
          <p class="ssc-word-card__def">${escapeHtml(VOCAB.wordDef(w))}</p>
          ${
            aiAvailable
              ? `<button type="button" class="btn-secondary ssc-ai-explain-btn" data-term="${escapeHtml(w.term)}">${t("self_study_ai_explain_btn")}</button>`
              : ""
          }
        </article>
      `,
      )
      .join("");

    root.innerHTML = `
      ${managerMaterialsBlock("vocabulary", progress.levelId)}
      ${
        aiAvailable
          ? `<div class="ssc-ai-coach-banner">
        <p class="ssc-ai-coach-banner__label">${t("self_study_ai_coach_label")}</p>
        <p class="ssc-ai-coach-banner__hint">${t("self_study_ai_coach_hint")}</p>
      </div>`
          : ""
      }
      <div class="ssc-lesson-card">
        <h2 data-i18n="self_study_vocab_learn_title">Today's vocabulary</h2>
        <p>${escapeHtml(VOCAB.lessonText(pack))}</p>
      </div>
      <div class="ssc-word-grid">${wordsHtml}</div>
      <section id="ssc-ai-coach-panel" class="ssc-ai-coach-panel hidden" aria-live="polite"></section>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-learn-done-btn">${progress.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
      </div>
    `;
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();

    document.getElementById("ssc-learn-done-btn")?.addEventListener("click", () => {
      VOCAB.markLearnDone(progress.levelId);
      refreshVocabularyModule(progress.levelId);
    });

    if (aiAvailable) {
      bindVocabularyAiCoach(root, progress.levelId);
    }
  }

  function renderAiExplanation(explanation) {
    const zh = isZh();
    const def = zh ? explanation.definition_zh || explanation.definition_en : explanation.definition_en;
    const example = zh ? explanation.example_zh || explanation.example_en : explanation.example_en;
    const tip = zh ? explanation.memory_tip_zh || explanation.memory_tip_en : explanation.memory_tip_en;
    return `
      <h3 class="ssc-ai-coach-panel__term">${escapeHtml(explanation.term)}</h3>
      <p class="ssc-ai-coach-panel__def">${escapeHtml(def)}</p>
      ${
        explanation.word_root
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_ai_word_root")}:</strong> ${escapeHtml(explanation.word_root)}</p>`
          : ""
      }
      ${
        explanation.collocation
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_ai_collocation")}:</strong> ${escapeHtml(explanation.collocation)}</p>`
          : ""
      }
      ${
        explanation.derived_words
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_ai_derived")}:</strong> ${escapeHtml(explanation.derived_words)}</p>`
          : ""
      }
      ${
        example
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_ai_example")}:</strong> ${escapeHtml(example)}</p>`
          : ""
      }
      ${
        tip
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_ai_memory_tip")}:</strong> ${escapeHtml(tip)}</p>`
          : ""
      }
    `;
  }

  function bindVocabularyAiCoach(root, levelId) {
    const panel = root.querySelector("#ssc-ai-coach-panel");
    const AI = window.EAP_SELF_STUDY_AI;
    if (!panel || !AI) return;

    root.querySelectorAll(".ssc-ai-explain-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const term = btn.getAttribute("data-term") || "";
        if (!term) return;
        panel.classList.remove("hidden");
        panel.innerHTML = `<p class="ssc-ai-coach-panel__loading">${t("self_study_ai_loading")}</p>`;
        root.querySelectorAll(".ssc-ai-explain-btn").forEach((b) => {
          b.disabled = true;
        });
        try {
          const explanation = await AI.explainVocabulary(term, levelId, isZh() ? "zh" : "en");
          panel.innerHTML = renderAiExplanation(explanation);
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_) {
          panel.innerHTML = `<p class="ssc-ai-coach-panel__error" role="alert">${t("self_study_ai_error")}</p>`;
        } finally {
          root.querySelectorAll(".ssc-ai-explain-btn").forEach((b) => {
            b.disabled = false;
          });
        }
      });
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

  async function resolvePlacement() {
    const SERVER = window.EAP_SELF_STUDY_SERVER;
    if (SERVER) {
      try {
        const data = await SERVER.getStatus();
        if (data.placement) return data.placement;
      } catch (_) {
        /* fallback */
      }
    }
    return MOCK ? MOCK.getPlacement() : null;
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const ready = await bootStudentSatellitePage(PAGE, () => {});
    if (!ready) return;

    const skill = getSkill();
    if (!MOCK) return;

    const placement = await resolvePlacement();
    if (!placement) {
      window.location.replace("student-self-study-placement.html");
      return;
    }

    const levelId = placement.levelId;
    const MAT = window.EAP_MANAGER_SSC_MATERIALS;
    if (MAT && typeof MAT.refreshForModule === "function") {
      await MAT.refreshForModule(skill, levelId);
    }

    const levelEl = document.getElementById("ssc-module-level");
    if (levelEl) {
      levelEl.textContent = MOCK.levelDisplay(levelId);
      levelEl.className = `ssc-level-badge ssc-level-badge--${levelId}`;
      levelEl.hidden = false;
    }

    if (skill === "vocabulary") {
      const vocabUi = window.EAP_VOCAB_UI;
      if (vocabUi && typeof vocabUi.init === "function") {
        const ok = await vocabUi.init();
        if (ok) {
          window.addEventListener("eap:langchange", () => {
            void vocabUi.init();
            if (window.EAP_I18N) window.EAP_I18N.applyStatic();
          });
          return;
        }
      }
      if (!VOCAB) return;
      initVocabulary(levelId);
    } else if (skill === "reading") {
      const readingUi = window.EAP_READING_UI;
      if (readingUi && typeof readingUi.init === "function") {
        const ok = await readingUi.init();
        if (ok) {
          window.addEventListener("eap:langchange", () => {
            void readingUi.init();
            if (window.EAP_I18N) window.EAP_I18N.applyStatic();
          });
          return;
        }
      }
      if (!window.EAP_MODULE_RW || !READ) return;
      window.EAP_MODULE_RW.initReading(levelId, renderTabs);
    } else if (skill === "writing") {
      const writingUi = window.EAP_WRITING_UI;
      if (writingUi && typeof writingUi.init === "function") {
        const ok = await writingUi.init();
        if (ok) {
          window.addEventListener("eap:langchange", () => {
            void writingUi.init();
            if (window.EAP_I18N) window.EAP_I18N.applyStatic();
          });
          return;
        }
      }
      if (!window.EAP_MODULE_RW || !WRITE) return;
      window.EAP_MODULE_RW.initWriting(levelId, renderTabs);
    } else if (skill === "listening") {
      const listeningUi = window.EAP_LISTENING_UI;
      if (listeningUi && typeof listeningUi.init === "function") {
        const ok = await listeningUi.init();
        if (ok) {
          window.addEventListener("eap:langchange", () => {
            void listeningUi.init();
            if (window.EAP_I18N) window.EAP_I18N.applyStatic();
          });
          return;
        }
      }
      if (!window.EAP_MODULE_LISTENING || !LISTEN) return;
      window.EAP_MODULE_LISTENING.initListening(levelId, renderTabs);
    } else if (skill === "speaking") {
      const speakingUi = window.EAP_SPEAKING_UI;
      if (speakingUi && typeof speakingUi.init === "function") {
        const ok = await speakingUi.init();
        if (ok) {
          window.addEventListener("eap:langchange", () => {
            void speakingUi.init();
            if (window.EAP_I18N) window.EAP_I18N.applyStatic();
          });
          return;
        }
      }
      if (!window.EAP_MODULE_SPEAKING || !SPEAK) return;
      window.EAP_MODULE_SPEAKING.initSpeaking(levelId, renderTabs);
    } else {
      renderUnsupported(skill || "—");
      return;
    }

    window.addEventListener("eap:langchange", () => {
      if (skill === "vocabulary" && VOCAB) initVocabulary(levelId);
      else if (skill === "reading" && window.EAP_MODULE_RW) window.EAP_MODULE_RW.initReading(levelId, renderTabs);
      else if (skill === "writing" && window.EAP_MODULE_RW) window.EAP_MODULE_RW.initWriting(levelId, renderTabs);
      else if (skill === "listening" && window.EAP_MODULE_LISTENING)
        window.EAP_MODULE_LISTENING.initListening(levelId, renderTabs);
      else if (skill === "speaking" && window.EAP_MODULE_SPEAKING)
        window.EAP_MODULE_SPEAKING.initSpeaking(levelId, renderTabs);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
