/**
 * Student AI Self-Study — Reading & Writing modules (Phase S4).
 */
(function () {
  const READ = window.EAP_READING_MOCK;
  const WRITE = window.EAP_WRITING_MOCK;

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

  function aiCoachAvailable() {
    return !!(window.EAP_SELF_STUDY_AI && typeof window.EAP_SELF_STUDY_AI.coachModule === "function");
  }

  function renderReadingCoach(explanation) {
    const zh = isZh();
    const summary = zh ? explanation.summary_zh || explanation.summary_en : explanation.summary_en;
    const keyIdea = zh ? explanation.key_idea_zh || explanation.key_idea_en : explanation.key_idea_en;
    const vocabTip = zh ? explanation.vocabulary_tip_zh || explanation.vocabulary_tip_en : explanation.vocabulary_tip_en;
    return `
      ${summary ? `<p class="ssc-ai-coach-panel__def">${escapeHtml(summary)}</p>` : ""}
      ${
        keyIdea
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_reading_ai_key_idea")}:</strong> ${escapeHtml(keyIdea)}</p>`
          : ""
      }
      ${
        vocabTip
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_reading_ai_vocab_tip")}:</strong> ${escapeHtml(vocabTip)}</p>`
          : ""
      }
    `;
  }

  function bindReadingAiCoach(root, levelId, passageText) {
    const panel = root.querySelector("#ssc-ai-coach-panel");
    const btn = root.querySelector("#ssc-reading-ai-btn");
    const AI = window.EAP_SELF_STUDY_AI;
    if (!panel || !btn || !AI) return;

    btn.addEventListener("click", async () => {
      const text = passageText || "";
      if (!text) return;
      panel.classList.remove("hidden");
      panel.innerHTML = `<p class="ssc-ai-coach-panel__loading">${t("self_study_ai_loading")}</p>`;
      btn.disabled = true;
      try {
        const coach = await AI.coachModule("reading", text, levelId, isZh() ? "zh" : "en");
        panel.innerHTML = `
          <h3 class="ssc-ai-coach-panel__term">${t("self_study_reading_ai_title")}</h3>
          ${renderReadingCoach(coach)}
        `;
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {
        panel.innerHTML = `<p class="ssc-ai-coach-panel__error" role="alert">${t("self_study_ai_error")}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function managerMaterialsBlock(skill, levelId) {
    const MAT = window.EAP_MANAGER_SSC_MATERIALS;
    return MAT ? MAT.renderLearnBlock(skill, levelId) : "";
  }

  function refreshStatus(store, levelId, completeMsgKey) {
    const p = store.ensureProgress(levelId);
    const pct = store.completionPercent(p);
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) {
      statusEl.textContent =
        pct >= 100 ? t(completeMsgKey) : t("self_study_module_in_progress", { pct: String(pct) });
    }
    return p;
  }

  function renderPracticeFlow(root, questions, qTextFn, progress, store, levelId, onComplete) {
    let index = 0;
    const answers = {};

    function renderQ() {
      const q = questions[index];
      if (!q) return finish();
      const opts = qTextFn(q, "options");
      const chosen = answers[q.id];

      root.innerHTML = `
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(questions.length) })}</p>
        <div class="ssc-question-card">
          <h3>${qTextFn(q, "prompt")}</h3>
          <ul class="ssc-options">
            ${opts.map((opt, i) => `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-i="${i}">${opt}</button></li>`).join("")}
          </ul>
        </div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-practice-next" ${chosen == null ? "disabled" : ""}>${index < questions.length - 1 ? t("self_study_next") : t("self_study_vocab_finish_practice")}</button>
        </div>
      `;
      root.querySelectorAll(".ssc-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          answers[q.id] = parseInt(btn.getAttribute("data-i"), 10);
          renderQ();
        });
      });
      document.getElementById("ssc-practice-next")?.addEventListener("click", () => {
        if (answers[q.id] == null) return;
        index += 1;
        renderQ();
      });
    }

    function finish() {
      let correct = 0;
      questions.forEach((q) => {
        if (answers[q.id] === q.correctIndex) correct += 1;
      });
      store.markPracticeDone(levelId, correct, questions.length);
      root.innerHTML = `
        <div class="ssc-report">
          <h2 data-i18n="self_study_vocab_practice_done">Practice complete</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(correct), total: String(questions.length) })}</p>
          <button type="button" class="btn-primary" id="ssc-go-game">${t("self_study_go_to_game")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-go-game")?.addEventListener("click", onComplete);
      refreshStatus(store, levelId, store === READ ? "self_study_reading_complete" : "self_study_writing_complete");
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
        const p = store.ensureProgress(levelId);
        p.practiceDone = false;
        store.saveProgress(p);
        index = 0;
        renderQ();
      });
      return;
    }
    renderQ();
  }

  function initReading(levelId, renderTabs) {
    const pack = READ.getPack(levelId);
    let progress = READ.ensureProgress(levelId);

    document.getElementById("ssc-module-title").textContent = t("self_study_mod_reading");
    refreshStatus(READ, levelId, "self_study_reading_complete");

    function renderLearn(root) {
      progress = READ.getProgress() || progress;
      const passageText = READ.passage(pack);
      const aiOn = aiCoachAvailable();
      root.innerHTML = `
        ${managerMaterialsBlock("reading", levelId)}
        ${
          aiOn
            ? `<div class="ssc-ai-coach-banner">
          <p class="ssc-ai-coach-banner__label">${t("self_study_ai_coach_label")}</p>
          <p class="ssc-ai-coach-banner__hint">${t("self_study_reading_ai_hint")}</p>
        </div>`
            : ""
        }
        <div class="ssc-lesson-card">
          <h2 data-i18n="self_study_reading_learn_title">Reading strategy</h2>
          <p>${escapeHtml(READ.lesson(pack))}</p>
        </div>
        <div class="ssc-question-card__passage ssc-passage-block">${escapeHtml(passageText)}</div>
        ${
          aiOn
            ? `<div class="ssc-placement-actions">
          <button type="button" class="btn-secondary" id="ssc-reading-ai-btn">${t("self_study_reading_ai_btn")}</button>
        </div>
        <section id="ssc-ai-coach-panel" class="ssc-ai-coach-panel hidden" aria-live="polite"></section>`
            : ""
        }
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-learn-done">${progress.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-learn-done")?.addEventListener("click", () => {
        READ.markLearnDone(levelId);
        progress = refreshStatus(READ, levelId, "self_study_reading_complete");
        renderLearn(root);
      });
      if (aiOn) {
        bindReadingAiCoach(root, levelId, passageText);
      }
    }

    function renderPractice(root) {
      progress = READ.getProgress() || progress;
      renderPracticeFlow(
        root,
        pack.practice,
        READ.qText,
        progress,
        READ,
        levelId,
        () => {
          renderTabs("game");
          renderGame(document.getElementById("ssc-panel-game"));
        },
      );
    }

    function renderGame(root) {
      progress = READ.getProgress() || progress;
      if (progress.gameDone) {
        root.innerHTML = `
          <div class="ssc-report">
            <h2 data-i18n="self_study_reading_game_title">Argument Sorting</h2>
            <p>${t("self_study_reading_game_done", { attempts: String(progress.gameAttempts || 0) })}</p>
            <button type="button" class="btn-secondary" id="ssc-game-redo">${t("self_study_vocab_play_again")}</button>
          </div>
        `;
        if (window.EAP_I18N) window.EAP_I18N.applyStatic();
        document.getElementById("ssc-game-redo")?.addEventListener("click", () => {
          const p = READ.ensureProgress(levelId);
          p.gameDone = false;
          READ.saveProgress(p);
          renderGame(root);
        });
        return;
      }

      const sentences = READ.argumentSentences(pack);
      const target = pack.argumentOrder.slice();
      let order = sentences.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let attempts = 0;

      function arraysEqual(a, b) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }

      function renderBoard() {
        root.innerHTML = `
          <div class="ssc-game-header">
            <h2 data-i18n="self_study_reading_game_title">Argument Sorting</h2>
            <p data-i18n="self_study_reading_game_hint">Put sentences in logical order. Use arrows to move lines.</p>
            <p class="ssc-game-score">${t("self_study_reading_game_attempts", { n: String(attempts) })}</p>
          </div>
          <ol class="ssc-sort-list">
            ${order
              .map(
                (idx, pos) => `
              <li class="ssc-sort-item">
                <span class="ssc-sort-item__num">${pos + 1}</span>
                <span class="ssc-sort-item__text">${sentences[idx]}</span>
                <span class="ssc-sort-item__actions">
                  <button type="button" class="btn-secondary ssc-sort-btn" data-move="up" data-pos="${pos}" ${pos === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
                  <button type="button" class="btn-secondary ssc-sort-btn" data-move="down" data-pos="${pos}" ${pos === order.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
                </span>
              </li>`,
              )
              .join("")}
          </ol>
          <div class="ssc-placement-actions">
            <button type="button" class="btn-primary" id="ssc-check-order">${t("self_study_check_order")}</button>
          </div>
          <p id="ssc-sort-feedback" class="ssc-sort-feedback" role="status" aria-live="polite"></p>
        `;
        if (window.EAP_I18N) window.EAP_I18N.applyStatic();

        root.querySelectorAll("[data-move]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const pos = parseInt(btn.getAttribute("data-pos"), 10);
            const dir = btn.getAttribute("data-move");
            const swap = dir === "up" ? pos - 1 : pos + 1;
            if (swap < 0 || swap >= order.length) return;
            [order[pos], order[swap]] = [order[swap], order[pos]];
            renderBoard();
          });
        });

        document.getElementById("ssc-check-order")?.addEventListener("click", () => {
          attempts += 1;
          const fb = document.getElementById("ssc-sort-feedback");
          if (arraysEqual(order, target)) {
            READ.markGameDone(levelId, attempts);
            progress = refreshStatus(READ, levelId, "self_study_reading_complete");
            if (fb) fb.textContent = t("self_study_sort_correct");
            setTimeout(() => renderGame(root), 600);
          } else if (fb) {
            fb.textContent = t("self_study_sort_try_again");
          }
          const scoreEl = root.querySelector(".ssc-game-score");
          if (scoreEl) scoreEl.textContent = t("self_study_reading_game_attempts", { n: String(attempts) });
        });
      }

      renderBoard();
    }

    function bindTabs() {
      document.querySelectorAll(".ssc-tab").forEach((btn) => {
        btn.onclick = () => {
          const tab = btn.getAttribute("data-tab");
          renderTabs(tab);
          if (tab === "learn") renderLearn(document.getElementById("ssc-panel-learn"));
          if (tab === "practice") renderPractice(document.getElementById("ssc-panel-practice"));
          if (tab === "game") renderGame(document.getElementById("ssc-panel-game"));
        };
      });
    }

    bindTabs();
    renderTabs("learn");
    renderLearn(document.getElementById("ssc-panel-learn"));
    renderPractice(document.getElementById("ssc-panel-practice"));
    renderGame(document.getElementById("ssc-panel-game"));
  }

  function initWriting(levelId, renderTabs) {
    const pack = WRITE.getPack(levelId);
    let progress = WRITE.ensureProgress(levelId);

    document.getElementById("ssc-module-title").textContent = t("self_study_mod_writing");
    refreshStatus(WRITE, levelId, "self_study_writing_complete");

    function renderLearn(root) {
      progress = WRITE.getProgress() || progress;
      root.innerHTML = `
        ${managerMaterialsBlock("writing", levelId)}
        <div class="ssc-lesson-card">
          <h2 data-i18n="self_study_writing_learn_title">Writing focus</h2>
          <p>${WRITE.lesson(pack)}</p>
        </div>
        <div class="ssc-question-card__passage ssc-passage-block">${WRITE.sample(pack)}</div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-learn-done">${progress.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-learn-done")?.addEventListener("click", () => {
        WRITE.markLearnDone(levelId);
        progress = refreshStatus(WRITE, levelId, "self_study_writing_complete");
        renderLearn(root);
      });
    }

    function renderPractice(root) {
      progress = WRITE.getProgress() || progress;
      renderPracticeFlow(
        root,
        pack.practice,
        WRITE.qText,
        progress,
        WRITE,
        levelId,
        () => {
          renderTabs("game");
          renderGame(document.getElementById("ssc-panel-game"));
        },
      );
    }

    function renderGame(root) {
      progress = WRITE.getProgress() || progress;
      if (progress.gameDone) {
        root.innerHTML = `
          <div class="ssc-report">
            <h2 data-i18n="self_study_writing_game_title">Summary Mission</h2>
            <p>${t("self_study_writing_game_done", { attempts: String(progress.gameAttempts || 0) })}</p>
            <button type="button" class="btn-secondary" id="ssc-game-redo">${t("self_study_vocab_play_again")}</button>
          </div>
        `;
        if (window.EAP_I18N) window.EAP_I18N.applyStatic();
        document.getElementById("ssc-game-redo")?.addEventListener("click", () => {
          const p = WRITE.ensureProgress(levelId);
          p.gameDone = false;
          WRITE.saveProgress(p);
          renderGame(root);
        });
        return;
      }

      const passage = WRITE.summaryPassage(pack);
      const options = WRITE.summaryOptions(pack);
      let attempts = 0;
      let chosen = null;

      root.innerHTML = `
        <div class="ssc-game-header">
          <h2 data-i18n="self_study_writing_game_title">Summary Mission</h2>
          <p data-i18n="self_study_writing_game_hint">Choose the best one-sentence summary.</p>
        </div>
        <div class="ssc-question-card__passage ssc-passage-block">${passage}</div>
        <ul class="ssc-options">
          ${options.map((opt, i) => `<li><button type="button" class="ssc-option" data-i="${i}">${opt}</button></li>`).join("")}
        </ul>
        <p id="ssc-summary-feedback" class="ssc-sort-feedback" role="status" aria-live="polite"></p>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();

      root.querySelectorAll(".ssc-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          chosen = parseInt(btn.getAttribute("data-i"), 10);
          attempts += 1;
          const fb = document.getElementById("ssc-summary-feedback");
          root.querySelectorAll(".ssc-option").forEach((b) => b.classList.remove("ssc-option--selected", "ssc-option--wrong"));
          btn.classList.add("ssc-option--selected");
          if (chosen === pack.summaryCorrect) {
            WRITE.markGameDone(levelId, attempts);
            progress = refreshStatus(WRITE, levelId, "self_study_writing_complete");
            if (fb) fb.textContent = t("self_study_summary_correct");
            setTimeout(() => renderGame(root), 700);
          } else {
            btn.classList.add("ssc-option--wrong");
            if (fb) fb.textContent = t("self_study_summary_try_again");
          }
        });
      });
    }

    function bindTabs() {
      document.querySelectorAll(".ssc-tab").forEach((btn) => {
        btn.onclick = () => {
          const tab = btn.getAttribute("data-tab");
          renderTabs(tab);
          if (tab === "learn") renderLearn(document.getElementById("ssc-panel-learn"));
          if (tab === "practice") renderPractice(document.getElementById("ssc-panel-practice"));
          if (tab === "game") renderGame(document.getElementById("ssc-panel-game"));
        };
      });
    }

    bindTabs();
    renderTabs("learn");
    renderLearn(document.getElementById("ssc-panel-learn"));
    renderPractice(document.getElementById("ssc-panel-practice"));
    renderGame(document.getElementById("ssc-panel-game"));
  }

  window.EAP_MODULE_RW = {
    initReading,
    initWriting,
  };
})();
