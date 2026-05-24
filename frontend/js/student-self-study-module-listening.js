/**
 * Student AI Self-Study — Listening module (Phase S5).
 */
(function () {
  const LISTEN = window.EAP_LISTENING_MOCK;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function managerMaterialsBlock(skill, levelId) {
    const MAT = window.EAP_MANAGER_SSC_MATERIALS;
    return MAT ? MAT.renderLearnBlock(skill, levelId) : "";
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

  function renderListeningCoach(explanation) {
    const zh = isZh();
    const gist = zh ? explanation.gist_zh || explanation.gist_en : explanation.gist_en;
    const noteTip = zh
      ? explanation.note_taking_tip_zh || explanation.note_taking_tip_en
      : explanation.note_taking_tip_en;
    const keyPhrases = explanation.key_phrases;
    return `
      ${gist ? `<p class="ssc-ai-coach-panel__def">${escapeHtml(gist)}</p>` : ""}
      ${
        noteTip
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_listening_ai_note_tip")}:</strong> ${escapeHtml(noteTip)}</p>`
          : ""
      }
      ${
        keyPhrases
          ? `<p class="ssc-ai-coach-panel__meta"><strong>${t("self_study_listening_ai_key_phrases")}:</strong> ${escapeHtml(keyPhrases)}</p>`
          : ""
      }
    `;
  }

  function bindListeningAiCoach(root, levelId, scriptText) {
    const panel = root.querySelector("#ssc-ai-coach-panel");
    const btn = root.querySelector("#ssc-listening-ai-btn");
    const AI = window.EAP_SELF_STUDY_AI;
    if (!panel || !btn || !AI) return;

    btn.addEventListener("click", async () => {
      const text = scriptText || "";
      if (!text) return;
      panel.classList.remove("hidden");
      panel.innerHTML = `<p class="ssc-ai-coach-panel__loading">${t("self_study_ai_loading")}</p>`;
      btn.disabled = true;
      try {
        const coach = await AI.coachModule("listening", text, levelId, isZh() ? "zh" : "en");
        panel.innerHTML = `
          <h3 class="ssc-ai-coach-panel__term">${t("self_study_listening_ai_title")}</h3>
          ${renderListeningCoach(coach)}
        `;
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {
        panel.innerHTML = `<p class="ssc-ai-coach-panel__error" role="alert">${t("self_study_ai_error")}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function refreshStatus(levelId) {
    const p = LISTEN.ensureProgress(levelId);
    const pct = LISTEN.completionPercent(p);
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) {
      statusEl.textContent =
        pct >= 100 ? t("self_study_listening_complete") : t("self_study_module_in_progress", { pct: String(pct) });
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
      const opts = LISTEN.qText(q, "options");
      const chosen = answers[q.id];

      root.innerHTML = `
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(questions.length) })}</p>
        <div class="ssc-question-card">
          <h3>${LISTEN.qText(q, "prompt")}</h3>
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
      LISTEN.markPracticeDone(levelId, correct, questions.length);
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
        const p = LISTEN.ensureProgress(levelId);
        p.practiceDone = false;
        LISTEN.saveProgress(p);
        index = 0;
        renderQ();
      });
      return;
    }
    renderQ();
  }

  function initListening(levelId, renderTabs) {
    const pack = LISTEN.getPack(levelId);
    let progress = LISTEN.ensureProgress(levelId);

    document.getElementById("ssc-module-title").textContent = t("self_study_mod_listening");
    refreshStatus(levelId);

    function renderLearn(root) {
      progress = LISTEN.getProgress() || progress;
      const scriptText = LISTEN.script(pack);
      const aiOn = aiCoachAvailable();
      root.innerHTML = `
        ${managerMaterialsBlock("listening", levelId)}
        ${
          aiOn
            ? `<div class="ssc-ai-coach-banner">
          <p class="ssc-ai-coach-banner__label">${t("self_study_ai_coach_label")}</p>
          <p class="ssc-ai-coach-banner__hint">${t("self_study_listening_ai_hint")}</p>
        </div>`
            : ""
        }
        <div class="ssc-lesson-card">
          <h2 data-i18n="self_study_listening_learn_title">Listening & note-taking</h2>
          <p>${LISTEN.lesson(pack)}</p>
          <p class="ssc-disclaimer" data-i18n="self_study_listening_no_audio">Text script only — audio (TTS) coming in a later phase.</p>
        </div>
        <pre class="ssc-script-block">${escapeHtml(scriptText)}</pre>
        ${
          aiOn
            ? `<div class="ssc-placement-actions">
          <button type="button" class="btn-secondary" id="ssc-listening-ai-btn">${t("self_study_listening_ai_btn")}</button>
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
        LISTEN.markLearnDone(levelId);
        progress = refreshStatus(levelId);
        renderLearn(root);
      });
      if (aiOn) {
        bindListeningAiCoach(root, levelId, scriptText);
      }
    }

    function renderPractice(root) {
      progress = LISTEN.getProgress() || progress;
      renderPracticeFlow(root, pack, progress, levelId, () => {
        renderTabs("game");
        renderGame(document.getElementById("ssc-panel-game"));
      });
    }

    function renderGame(root) {
      progress = LISTEN.getProgress() || progress;
      if (progress.gameDone) {
        root.innerHTML = `
          <div class="ssc-report">
            <h2 data-i18n="self_study_listening_game_title">Lecture Structure</h2>
            <p>${t("self_study_listening_game_done", { attempts: String(progress.gameAttempts || 0) })}</p>
            <button type="button" class="btn-secondary" id="ssc-game-redo">${t("self_study_vocab_play_again")}</button>
          </div>
        `;
        if (window.EAP_I18N) window.EAP_I18N.applyStatic();
        document.getElementById("ssc-game-redo")?.addEventListener("click", () => {
          const p = LISTEN.ensureProgress(levelId);
          p.gameDone = false;
          LISTEN.saveProgress(p);
          renderGame(root);
        });
        return;
      }

      const labels = LISTEN.structureLabels(pack);
      const target = pack.structureOrder.slice();
      let order = labels.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let attempts = 0;

      function renderBoard() {
        root.innerHTML = `
          <div class="ssc-game-header">
            <h2 data-i18n="self_study_listening_game_title">Lecture Structure</h2>
            <p data-i18n="self_study_listening_game_hint">Order the lecture sections to match the script flow.</p>
            <p class="ssc-game-score">${t("self_study_reading_game_attempts", { n: String(attempts) })}</p>
          </div>
          <ol class="ssc-sort-list">
            ${order
              .map(
                (idx, pos) => `
              <li class="ssc-sort-item">
                <span class="ssc-sort-item__num">${pos + 1}</span>
                <span class="ssc-sort-item__text">${labels[idx]}</span>
                <span class="ssc-sort-item__actions">
                  <button type="button" class="btn-secondary ssc-sort-btn" data-move="up" data-pos="${pos}" ${pos === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" class="btn-secondary ssc-sort-btn" data-move="down" data-pos="${pos}" ${pos === order.length - 1 ? "disabled" : ""}>↓</button>
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
          const ok = order.every((v, i) => v === target[i]);
          if (ok) {
            LISTEN.markGameDone(levelId, attempts);
            progress = refreshStatus(levelId);
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

  window.EAP_MODULE_LISTENING = { initListening };
})();
