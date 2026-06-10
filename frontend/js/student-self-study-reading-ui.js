/**
 * SS-R2 — server-backed reading: single-page IELTS-style passage + mixed question types.
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

  const state = { today: null, selectedDay: null, lastScoring: null, practiceRetake: false };

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
    return prog.practiceDone ? 100 : prog.learnDone ? 35 : 0;
  }

  function channelBanner(data) {
    const ch = data.channel === "A" ? t("self_study_channel_a") : t("self_study_channel_b");
    const level = data.content && data.content.passageLevel ? data.content.passageLevel : "";
    const day = data.dayNumber ? t("self_study_reading_day_label", { day: String(data.dayNumber) }) : "";
    return `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${ch}</span>
        ${level ? `<span class="ssc-vocab-channel__sched">${escapeHtml(level)}</span>` : ""}
        ${day ? `<span class="ssc-vocab-channel__sched">${escapeHtml(day)}</span>` : ""}
      </div>
    `;
  }

  function parseDayFromUrl() {
    const n = parseInt(new URLSearchParams(global.location.search).get("day") || "", 10);
    return n > 0 ? n : null;
  }

  async function loadToday() {
    if (!state.today) {
      const day = state.selectedDay || parseDayFromUrl();
      state.today = await SERVER().getReadingToday(day);
    }
    return state.today;
  }

  function renderParagraphs(c) {
    const paras = isZh()
      ? (c.paragraphsZh && c.paragraphsZh.length ? c.paragraphsZh : c.paragraphsEn)
      : c.paragraphsEn;
    if (paras && paras.length) {
      return paras
        .map((p, i) => `<p class="ssc-reading-p__para" data-para="${i + 1}">${escapeHtml(p)}</p>`)
        .join("");
    }
    const flat = pickLang(c, "passageEn", "passageZh");
    return `<p class="ssc-reading-p__para">${escapeHtml(flat)}</p>`;
  }

  function renderQuestionItem(q, answers) {
    const typeId = (q.typeId || "MC").toUpperCase();
    const instruction = pickLang(q, "instructionEn", "instructionZh");
    const prompt = pickLang(q, "promptEn", "promptZh");
    const opts = isZh() ? q.optionsZh || q.optionsEn : q.optionsEn || q.optionsZh;
    const chosen = answers[q.id];

    if (typeId === "GAP") {
      const val = chosen != null ? String(chosen) : "";
      return `
        <div class="ssc-reading-q" data-qid="${escapeHtml(q.id)}">
          <p class="ssc-reading-q__type">${escapeHtml(typeId)}${q.wordLimit ? ` · ${t("self_study_reading_word_limit", { n: String(q.wordLimit) })}` : ""}</p>
          ${instruction ? `<p class="ssc-reading-q__instr">${escapeHtml(instruction)}</p>` : ""}
          <p class="ssc-reading-q__prompt">${escapeHtml(prompt)}</p>
          <input type="text" class="ssc-exam-input ssc-reading-gap" data-gap="${escapeHtml(q.id)}" value="${escapeHtml(val)}" placeholder="${t("self_study_exam_type_answer")}" />
        </div>
      `;
    }

    return `
      <div class="ssc-reading-q" data-qid="${escapeHtml(q.id)}">
        <p class="ssc-reading-q__type">${escapeHtml(typeId)}</p>
        ${instruction ? `<p class="ssc-reading-q__instr">${escapeHtml(instruction)}</p>` : ""}
        <p class="ssc-reading-q__prompt">${escapeHtml(prompt)}</p>
        <ul class="ssc-options">
          ${(opts || [])
            .map(
              (opt, i) =>
                `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-q="${escapeHtml(q.id)}" data-i="${i}">${escapeHtml(opt)}</button></li>`,
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  function bindQuestionInputs(root, answers) {
    root.querySelectorAll(".ssc-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qid = btn.getAttribute("data-q");
        answers[qid] = parseInt(btn.getAttribute("data-i"), 10);
        const block = btn.closest(".ssc-reading-q");
        if (block) {
          block.querySelectorAll(".ssc-option").forEach((opt) => {
            opt.classList.toggle("ssc-option--selected", opt === btn);
          });
        }
      });
    });
    root.querySelectorAll(".ssc-reading-gap").forEach((inp) => {
      inp.addEventListener("input", () => {
        answers[inp.getAttribute("data-gap")] = inp.value;
      });
    });
  }

  function errorTypeLabel(code) {
    const map = {
      wrong_option: t("self_study_reading_err_wrong"),
      not_in_passage: t("self_study_reading_err_not_in_passage"),
      opposite_meaning: t("self_study_reading_err_opposite"),
      over_inference: t("self_study_reading_err_over_inference"),
      word_limit: t("self_study_reading_err_word_limit"),
      spelling: t("self_study_reading_err_spelling"),
      not_given_confusion: t("self_study_reading_err_ng"),
    };
    return map[code] || code || "";
  }

  function renderResults(root, scoring) {
    if (!scoring) return;
    const items = (scoring.results || [])
      .map((r) => {
        const status = r.correct ? t("self_study_reading_correct") : t("self_study_reading_incorrect");
        const evidence = isZh() ? r.evidenceZh || r.evidenceEn : r.evidenceEn || r.evidenceZh;
        const feedback = isZh() ? r.feedbackZh || r.feedbackEn : r.feedbackEn || r.feedbackZh;
        const err = r.errorType ? errorTypeLabel(r.errorType) : "";
        return `
          <li class="ssc-reading-result${r.correct ? " ssc-reading-result--ok" : " ssc-reading-result--bad"}">
            <p class="ssc-reading-result__status">${status} · ${escapeHtml(r.id)}${err ? ` · ${escapeHtml(err)}` : ""}</p>
            ${feedback ? `<p class="ssc-reading-result__feedback">${escapeHtml(feedback)}</p>` : ""}
            ${evidence ? `<p class="ssc-reading-result__evidence">${t("self_study_reading_evidence")}: ${escapeHtml(evidence)}</p>` : ""}
          </li>
        `;
      })
      .join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_reading_results_title")}</h2>
        <p>${t("self_study_vocab_practice_score", { correct: String(scoring.correct), total: String(scoring.total) })}</p>
        <button type="button" class="btn-secondary" id="ssc-reading-redo">${t("self_study_vocab_redo")}</button>
      </div>
      <ul class="ssc-reading-results">${items}</ul>
    `;
    document.getElementById("ssc-reading-redo")?.addEventListener("click", () => {
      state.practiceRetake = true;
      state.lastScoring = null;
      void renderExamPanel(root);
    });
  }

  function renderGenerating(root) {
    root.innerHTML = `
      <div class="ssc-generating-card" role="status" aria-live="polite">
        <div class="ssc-generating-card__spinner" aria-hidden="true"></div>
        <p class="ssc-generating-card__title">${escapeHtml(t("self_study_reading_generating"))}</p>
        <p class="ssc-generating-card__hint">${escapeHtml(t("self_study_reading_generating_hint"))}</p>
      </div>
    `;
  }

  async function renderExamPanel(root) {
    renderGenerating(root);
    let data;
    try {
      state.today = null;
      data = await loadToday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const prog = data.progress || {};
    if (prog.practiceDone && !state.practiceRetake) {
      if (state.lastScoring) {
        renderResults(root, state.lastScoring);
        return;
      }
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_vocab_practice_done")}</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(prog.scoreCorrect || 0), total: String(prog.scoreTotal || 0) })}</p>
          <button type="button" class="btn-secondary" id="ssc-reading-redo">${t("self_study_vocab_redo")}</button>
        </div>
      `;
      document.getElementById("ssc-reading-redo")?.addEventListener("click", () => {
        state.practiceRetake = true;
        void renderExamPanel(root);
      });
      updateHeader(100, t("self_study_reading_complete_short"));
      return;
    }

    const c = data.content || {};
    const questions = c.questions || [];
    const answers = {};
    const lesson = pickLang(c, "lessonEn", "lessonZh");

    const paraText = (c.paragraphsEn || []).join(" ") || c.passageEn || "";
    const wordCount = paraText.trim().split(/\s+/).filter(Boolean).length;

    root.innerHTML = `
      <article class="ssc-reading-exam">
        <header class="ssc-reading-exam__head">
          <h2>${escapeHtml(data.title || c.title || t("self_study_mod_reading"))}</h2>
          ${lesson ? `<p class="ssc-reading-exam__tip">${escapeHtml(lesson)}</p>` : ""}
          <p class="ssc-reading-exam__meta">${t("self_study_reading_meta", { words: String(wordCount), questions: String(questions.length) })}</p>
        </header>
        <section class="ssc-reading-passage" aria-label="${t("self_study_reading_passage_label")}">
          ${renderParagraphs(c)}
        </section>
        <section class="ssc-reading-questions" aria-label="${t("self_study_reading_questions_label")}">
          <h3 class="ssc-reading-questions__title">${t("self_study_reading_questions_heading", { n: String(questions.length) })}</h3>
          ${questions.map((q) => renderQuestionItem(q, answers)).join("")}
        </section>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary ssc-reading-submit-btn" id="ssc-reading-submit">
            <span class="ssc-reading-submit__spinner" id="ssc-reading-submit-spinner" hidden aria-hidden="true"></span>
            <span class="ssc-reading-submit__label">${t("self_study_reading_submit")}</span>
          </button>
        </div>
      </article>
    `;

    bindQuestionInputs(root, answers);

    updateHeader(
      progressPct(prog),
      t("self_study_module_in_progress", { pct: String(progressPct(prog)) }),
    );

    document.getElementById("ssc-reading-submit")?.addEventListener("click", async () => {
      root.querySelectorAll(".ssc-reading-gap").forEach((inp) => {
        answers[inp.getAttribute("data-gap")] = inp.value;
      });
      const btn = document.getElementById("ssc-reading-submit");
      const spinner = document.getElementById("ssc-reading-submit-spinner");
      if (btn) {
        btn.disabled = true;
        btn.classList.add("ssc-reading-submit-btn--loading");
        btn.setAttribute("aria-busy", "true");
      }
      if (spinner) spinner.hidden = false;
      try {
        const res = await SERVER().completeReading({
          passageId: data.passageId,
          answers,
        });
        state.today = null;
        state.practiceRetake = false;
        state.lastScoring = res.scoring;
        renderResults(root, res.scoring);
        updateHeader(100, t("self_study_reading_complete_short"));
      } catch (e) {
        alert(e.message);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("ssc-reading-submit-btn--loading");
          btn.removeAttribute("aria-busy");
        }
        if (spinner) spinner.hidden = true;
      }
    });
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_reading");
    if (levelEl) levelEl.hidden = true;

    state.selectedDay = parseDayFromUrl();
    state.today = null;
    state.lastScoring = null;
    state.practiceRetake = false;

    let overview;
    try {
      overview = await SERVER().getReadingOverview();
    } catch (_) {
      return false;
    }

    shell.innerHTML = `
      ${channelBanner({ channel: overview.channel, dayNumber: state.selectedDay || (overview.schedule && overview.schedule.dayNumber) })}
      <div id="ssc-reading-panel" class="ssc-reading-panel"></div>
    `;

    await renderExamPanel(document.getElementById("ssc-reading-panel"));
    return true;
  }

  global.EAP_READING_UI = { init };
})(typeof window !== "undefined" ? window : globalThis);
