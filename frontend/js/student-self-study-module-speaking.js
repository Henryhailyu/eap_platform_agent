/**
 * Student AI Self-Study — Speaking module (Phase S6, typed responses only).
 */
(function () {
  const SPEAK = window.EAP_SPEAKING_MOCK;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function managerMaterialsBlock(skill, levelId) {
    const MAT = window.EAP_MANAGER_SSC_MATERIALS;
    return MAT ? MAT.renderLearnBlock(skill, levelId) : "";
  }

  function refreshStatus(levelId) {
    const p = SPEAK.ensureProgress(levelId);
    const pct = SPEAK.completionPercent(p);
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) {
      statusEl.textContent =
        pct >= 100 ? t("self_study_speaking_complete") : t("self_study_module_in_progress", { pct: String(pct) });
    }
    return p;
  }

  function renderPracticeFlow(root, pack, progress, levelId, onGame) {
    const questions = pack.practice;
    let index = 0;
    const answers = {};

    function renderQ() {
      const q = questions[index];
      if (!q) return finish();
      const opts = SPEAK.qText(q, "options");
      const chosen = answers[q.id];

      root.innerHTML = `
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(questions.length) })}</p>
        <div class="ssc-question-card">
          <h3>${SPEAK.qText(q, "prompt")}</h3>
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
      SPEAK.markPracticeDone(levelId, correct, questions.length);
      root.innerHTML = `
        <div class="ssc-report">
          <h2 data-i18n="self_study_vocab_practice_done">Practice complete</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(correct), total: String(questions.length) })}</p>
          <button type="button" class="btn-primary" id="ssc-go-game">${t("self_study_go_to_game")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-go-game")?.addEventListener("click", onGame);
      refreshStatus(levelId);
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
        const p = SPEAK.ensureProgress(levelId);
        p.practiceDone = false;
        SPEAK.saveProgress(p);
        index = 0;
        renderQ();
      });
      return;
    }
    renderQ();
  }

  function initSpeaking(levelId, renderTabs) {
    const pack = SPEAK.getPack(levelId);
    let progress = SPEAK.ensureProgress(levelId);

    document.getElementById("ssc-module-title").textContent = t("self_study_mod_speaking");
    refreshStatus(levelId);

    function renderLearn(root) {
      progress = SPEAK.getProgress() || progress;
      const promptList = SPEAK.prompts(pack)
        .map((p) => `<li>${p}</li>`)
        .join("");

      root.innerHTML = `
        ${managerMaterialsBlock("speaking", levelId)}
        <div class="ssc-lesson-card">
          <h2 data-i18n="self_study_speaking_learn_title">Speaking & discussion</h2>
          <p>${SPEAK.lesson(pack)}</p>
          <p class="ssc-disclaimer" data-i18n="self_study_speaking_no_stt">Type your response — recording and speech-to-text coming later.</p>
        </div>
        <div class="ssc-lesson-card">
          <h3 data-i18n="self_study_speaking_prompts">Practice prompts</h3>
          <ul class="ssc-daily-plan__list">${promptList}</ul>
        </div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-learn-done">${progress.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
        </div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      document.getElementById("ssc-learn-done")?.addEventListener("click", () => {
        SPEAK.markLearnDone(levelId);
        progress = refreshStatus(levelId);
        renderLearn(root);
      });
    }

    function renderPractice(root) {
      progress = SPEAK.getProgress() || progress;
      renderPracticeFlow(root, pack, progress, levelId, () => {
        renderTabs("game");
        renderGame(document.getElementById("ssc-panel-game"));
      });
    }

    function renderGame(root) {
      progress = SPEAK.getProgress() || progress;

      if (progress.gameDone) {
        root.innerHTML = `
          <div class="ssc-report">
            <h2 data-i18n="self_study_speaking_game_title">Discussion Challenge</h2>
            <p>${t("self_study_speaking_game_saved", { words: String(progress.gameWordCount || 0) })}</p>
            <button type="button" class="btn-secondary" id="ssc-game-redo">${t("self_study_vocab_play_again")}</button>
          </div>
        `;
        if (window.EAP_I18N) window.EAP_I18N.applyStatic();
        document.getElementById("ssc-game-redo")?.addEventListener("click", () => {
          const p = SPEAK.ensureProgress(levelId);
          p.gameDone = false;
          SPEAK.saveProgress(p);
          renderGame(root);
        });
        return;
      }

      const minW = pack.minWords;
      root.innerHTML = `
        <div class="ssc-game-header">
          <h2 data-i18n="self_study_speaking_game_title">Discussion Challenge</h2>
          <p data-i18n="self_study_speaking_game_hint">Type your spoken response as text. Minimum {min} words.</p>
          <p class="ssc-game-prompt"><strong>${SPEAK.gamePrompt(pack)}</strong></p>
        </div>
        <label class="ssc-speak-label" for="ssc-speak-input" data-i18n="self_study_speaking_your_response">Your response</label>
        <textarea id="ssc-speak-input" class="ssc-speak-input" rows="6" placeholder=""></textarea>
        <p id="ssc-speak-count" class="ssc-speak-count" aria-live="polite">0 / ${minW}</p>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-speak-submit">${t("self_study_speaking_submit")}</button>
        </div>
        <div id="ssc-speak-feedback" class="ssc-speak-feedback hidden"></div>
      `;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();

      const input = document.getElementById("ssc-speak-input");
      const countEl = document.getElementById("ssc-speak-count");
      const hintEl = root.querySelector("[data-i18n='self_study_speaking_game_hint']");
      if (hintEl) hintEl.textContent = t("self_study_speaking_game_hint", { min: String(minW) });

      function updateCount() {
        const n = SPEAK.countWords(input.value);
        if (countEl) {
          countEl.textContent = t("self_study_speaking_word_count", { n: String(n), min: String(minW) });
          countEl.classList.toggle("ssc-speak-count--ok", n >= minW);
        }
      }
      input?.addEventListener("input", updateCount);
      updateCount();

      document.getElementById("ssc-speak-submit")?.addEventListener("click", () => {
        const text = input ? input.value : "";
        const n = SPEAK.countWords(text);
        if (n < minW) {
          const fb = document.getElementById("ssc-speak-feedback");
          if (fb) {
            fb.classList.remove("hidden");
            fb.innerHTML = `<p class="ssc-sort-feedback">${t("self_study_speaking_too_short", { min: String(minW) })}</p>`;
          }
          return;
        }
        const mock = SPEAK.buildMockFeedback(text, pack);
        SPEAK.markGameDone(levelId, n);
        progress = refreshStatus(levelId);

        const fb = document.getElementById("ssc-speak-feedback");
        if (fb) {
          fb.classList.remove("hidden");
          fb.innerHTML = `
            <div class="ssc-report">
              <h3 data-i18n="self_study_speaking_mock_feedback">Practice feedback (demo)</h3>
              <p class="ssc-disclaimer" data-i18n="self_study_speaking_feedback_note">Not AI — simple checklist for self-review.</p>
              <section>
                <h4 data-i18n="self_study_report_strengths">Strengths</h4>
                <ul>${mock.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>
              </section>
              <section>
                <h4 data-i18n="self_study_report_improve">Areas for improvement</h4>
                <ul>${mock.improvements.map((s) => `<li>${s}</li>`).join("")}</ul>
              </section>
            </div>
          `;
          if (window.EAP_I18N) window.EAP_I18N.applyStatic();
        }
        setTimeout(() => renderGame(root), 2500);
      });
    }

    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute("data-tab");
        renderTabs(tab);
        if (tab === "learn") renderLearn(document.getElementById("ssc-panel-learn"));
        if (tab === "practice") renderPractice(document.getElementById("ssc-panel-practice"));
        if (tab === "game") renderGame(document.getElementById("ssc-panel-game"));
      };
    });

    renderTabs("learn");
    renderLearn(document.getElementById("ssc-panel-learn"));
    renderPractice(document.getElementById("ssc-panel-practice"));
    renderGame(document.getElementById("ssc-panel-game"));
  }

  window.EAP_MODULE_SPEAKING = { initSpeaking };
})();
