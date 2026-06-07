/**
 * SS-R1 — server-backed reading module (Channel A/B, 1 passage + questions per day).
 */
(function (global) {
  const SERVER = () => global.EAP_SELF_STUDY_SERVER;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pickLang(obj, enKey, zhKey) {
    if (!obj) return "";
    return isZh() ? obj[zhKey] || obj[enKey] || "" : obj[enKey] || obj[zhKey] || "";
  }

  const state = { today: null, activeTab: "read", lastScoring: null };

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function progressPct(prog) {
    if (!prog) return 0;
    let n = 0;
    if (prog.learnDone) n += 40;
    if (prog.practiceDone) n += 60;
    return n;
  }

  function showTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      const tab = btn.getAttribute("data-tab");
      const selected = tab === tabId;
      btn.classList.toggle("ssc-tab--active", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
    document.querySelectorAll(".ssc-tab-panel").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-panel") !== tabId;
    });
  }

  function channelBanner(data) {
    const ch = data.channel === "A" ? t("self_study_channel_a") : t("self_study_channel_b");
    const day = data.dayNumber ? t("self_study_reading_day_label", { day: String(data.dayNumber) }) : "";
    return `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${ch}</span>
        ${day ? `<span class="ssc-vocab-channel__sched">${escapeHtml(day)}</span>` : ""}
      </div>
    `;
  }

  async function loadToday() {
    if (!state.today) {
      state.today = await SERVER().getReadingToday();
    }
    return state.today;
  }

  async function renderReadPanel(root) {
    let data;
    try {
      data = await loadToday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }
    const c = data.content || {};
    const prog = data.progress || {};
    const passage = pickLang(c, "passageEn", "passageZh");
    const lesson = pickLang(c, "lessonEn", "lessonZh");

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(data.title || t("self_study_reading_learn_title"))}</h2>
        <p>${escapeHtml(lesson)}</p>
      </div>
      <div class="ssc-question-card__passage ssc-passage-block">${escapeHtml(passage)}</div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-read-done">${prog.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_reading_mark_read")}</button>
        <button type="button" class="btn-secondary" id="ssc-go-practice">${t("self_study_reading_start_questions")}</button>
      </div>
    `;

    updateHeader(
      progressPct(prog),
      prog.practiceDone
        ? t("self_study_reading_complete_short")
        : t("self_study_module_in_progress", { pct: String(progressPct(prog)) }),
    );

    document.getElementById("ssc-read-done")?.addEventListener("click", async () => {
      try {
        await SERVER().completeReading({ passageId: data.passageId, learnDone: true });
        state.today = null;
        await renderReadPanel(root);
      } catch (e) {
        alert(e.message);
      }
    });
    document.getElementById("ssc-go-practice")?.addEventListener("click", () => {
      showTab("practice");
      void renderPracticePanel(document.getElementById("ssc-panel-practice"));
    });
  }

  async function renderPracticePanel(root) {
    let data;
    try {
      data = await loadToday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const prog = data.progress || {};
    if (prog.practiceDone && state.lastScoring) {
      renderResults(root, data, state.lastScoring);
      return;
    }
    if (prog.practiceDone) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_vocab_practice_done")}</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(prog.scoreCorrect || 0), total: String(prog.scoreTotal || 0) })}</p>
        </div>
      `;
      return;
    }

    const questions = (data.content && data.content.questions) || [];
    const c = data.content || {};
    const passage = pickLang(c, "passageEn", "passageZh");
    let index = 0;
    const answers = {};

    function renderQuestion() {
      const q = questions[index];
      if (!q) return submit();

      const opts = isZh() ? q.optionsZh || q.optionsEn : q.optionsEn || q.optionsZh;
      const chosen = answers[q.id];

      root.innerHTML = `
        <details class="ssc-reading-passage-ref">
          <summary>${t("self_study_reading_show_passage")}</summary>
          <div class="ssc-passage-block">${escapeHtml(passage)}</div>
        </details>
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(questions.length) })}</p>
        <div class="ssc-question-card">
          <p class="ssc-question-type">${escapeHtml(q.typeId || "MC")}</p>
          <h3>${escapeHtml(pickLang(q, "promptEn", "promptZh"))}</h3>
          <ul class="ssc-options">
            ${(opts || [])
              .map(
                (opt, i) =>
                  `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-i="${i}">${escapeHtml(opt)}</button></li>`,
              )
              .join("")}
          </ul>
        </div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-practice-next" ${chosen == null ? "disabled" : ""}>${index < questions.length - 1 ? t("self_study_next") : t("self_study_reading_submit")}</button>
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

    async function submit() {
      try {
        const res = await SERVER().completeReading({
          passageId: data.passageId,
          answers,
        });
        state.today = null;
        state.lastScoring = res.scoring;
        renderResults(root, data, res.scoring);
        updateHeader(100, t("self_study_reading_complete_short"));
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      }
    }

    renderQuestion();
  }

  function renderResults(root, data, scoring) {
    if (!scoring) return;
    const items = (scoring.results || [])
      .map((r) => {
        const status = r.correct ? t("self_study_reading_correct") : t("self_study_reading_incorrect");
        const evidence = isZh() ? r.evidenceZh || r.evidenceEn : r.evidenceEn || r.evidenceZh;
        return `
          <li class="ssc-reading-result${r.correct ? " ssc-reading-result--ok" : " ssc-reading-result--bad"}">
            <p class="ssc-reading-result__status">${status} · ${escapeHtml(r.id)}</p>
            ${evidence ? `<p class="ssc-reading-result__evidence">${t("self_study_reading_evidence")}: ${escapeHtml(evidence)}</p>` : ""}
          </li>
        `;
      })
      .join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_reading_results_title")}</h2>
        <p>${t("self_study_vocab_practice_score", { correct: String(scoring.correct), total: String(scoring.total) })}</p>
      </div>
      <ul class="ssc-reading-results">${items}</ul>
    `;
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_reading");
    if (levelEl) levelEl.hidden = true;

    let overview;
    try {
      overview = await SERVER().getReadingOverview();
    } catch (_) {
      return false;
    }

    state.today = null;
    state.lastScoring = null;
    state.activeTab = "read";

    shell.innerHTML = `
      ${channelBanner({ channel: overview.channel, dayNumber: overview.schedule && overview.schedule.dayNumber })}
      <nav class="ssc-tabs" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" role="tab" data-tab="read" aria-selected="true">${t("self_study_reading_tab_read")}</button>
        <button type="button" class="ssc-tab" role="tab" data-tab="practice" aria-selected="false">${t("self_study_tab_practice")}</button>
      </nav>
      <div id="ssc-panel-read" class="ssc-tab-panel" data-panel="read" role="tabpanel"></div>
      <div id="ssc-panel-practice" class="ssc-tab-panel" data-panel="practice" role="tabpanel" hidden></div>
    `;

    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showTab(tab);
        if (tab === "read") void renderReadPanel(document.getElementById("ssc-panel-read"));
        if (tab === "practice") void renderPracticePanel(document.getElementById("ssc-panel-practice"));
      });
    });

    await renderReadPanel(document.getElementById("ssc-panel-read"));
    return true;
  }

  global.EAP_READING_UI = { init };
})();
