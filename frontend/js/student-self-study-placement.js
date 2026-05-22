/**
 * Student AI Self-Study Centre — placement test UI (Phase S2).
 */
(function () {
  const MOCK = window.EAP_SELF_STUDY_MOCK;
  if (!MOCK) return;

  const PAGE = "student-self-study-placement";

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

  function formatSkillLevel(skillKey, levelKey) {
    if (levelKey === "not_assessed") {
      return t("self_study_skill_not_assessed");
    }
    return MOCK.levelDisplay(levelKey);
  }

  const state = {
    screen: "intro",
    partIndex: 0,
    questionIndex: 0,
    answers: {},
    startedAt: null,
  };

  function totalQuestions() {
    return MOCK.PARTS.reduce((n, p) => n + p.questions.length, 0);
  }

  function answeredCount() {
    return Object.keys(state.answers).length;
  }

  function progressPercent() {
    const total = totalQuestions();
    if (!total) return 0;
    if (state.screen === "intro") return 0;
    if (state.screen === "report") return 100;
    const done = answeredCount();
    return Math.round((done / total) * 100);
  }

  function currentPart() {
    return MOCK.PARTS[state.partIndex];
  }

  function currentQuestion() {
    const part = currentPart();
    if (!part) return null;
    return part.questions[state.questionIndex];
  }

  function renderProgress() {
    const fill = document.getElementById("ssc-placement-progress-fill");
    const label = document.getElementById("ssc-placement-progress-label");
    const pct = progressPercent();
    if (fill) fill.style.width = `${pct}%`;
    if (label) {
      if (state.screen === "intro") {
        label.textContent = t("self_study_placement_progress_intro");
      } else if (state.screen === "report") {
        label.textContent = t("self_study_placement_progress_done");
      } else {
        const part = currentPart();
        const partTitle = part ? MOCK.partLabel(part, "title") : "";
        label.textContent = t("self_study_placement_progress_part", {
          current: String(answeredCount() + 1),
          total: String(totalQuestions()),
          part: partTitle,
        });
      }
    }
  }

  function renderIntro(root) {
    root.innerHTML = `
      <div class="ssc-banner ssc-banner--placement">
        <h2 data-i18n="self_study_placement_intro_title">Practice placement test</h2>
        <p class="ssc-disclaimer" data-i18n="self_study_placement_disclaimer">
          Demo diagnostic only — not an official IELTS score. About 20 minutes; speaking is not assessed in this version.
        </p>
        <p data-i18n="self_study_placement_intro_body">
          Four short parts: vocabulary, reading, listening (text script), and writing awareness. Your result sets your self-study level.
        </p>
        <ul class="ssc-daily-plan__list" aria-label="Parts">
          ${MOCK.PARTS.map(
            (p) =>
              `<li><strong>${MOCK.partLabel(p, "title")}</strong> — ${MOCK.partLabel(p, "duration")}</li>`,
          ).join("")}
        </ul>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-placement-start">${t("self_study_placement_start")}</button>
          <a href="student-self-study.html" class="btn-secondary">${t("self_study_back_hub")}</a>
        </div>
      </div>
    `;
    document.getElementById("ssc-placement-start")?.addEventListener("click", () => {
      state.screen = "question";
      state.partIndex = 0;
      state.questionIndex = 0;
      state.answers = {};
      state.startedAt = Date.now();
      render();
    });
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function renderQuestion(root) {
    const part = currentPart();
    const q = currentQuestion();
    if (!part || !q) {
      finishTest();
      return;
    }

    const opts = MOCK.questionText(q, "options");
    const passage = MOCK.passageText(part);
    const selected = state.answers[q.id];

    root.innerHTML = `
      <div class="ssc-question-card">
        <p class="ssc-placement-progress__label" style="margin:0 0 0.75rem">${MOCK.partLabel(part, "title")} · ${MOCK.partLabel(part, "duration")}</p>
        ${passage ? `<div class="ssc-question-card__passage">${passage}</div>` : ""}
        <h3>${MOCK.questionText(q, "prompt")}</h3>
        <ul class="ssc-options" role="listbox" aria-label="Answer options">
          ${opts
            .map(
              (opt, i) =>
                `<li><button type="button" class="ssc-option${selected === i ? " ssc-option--selected" : ""}" data-index="${i}">${opt}</button></li>`,
            )
            .join("")}
        </ul>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-secondary" id="ssc-placement-prev" ${state.partIndex === 0 && state.questionIndex === 0 ? "disabled" : ""}>${t("self_study_prev")}</button>
        <button type="button" class="btn-primary" id="ssc-placement-next" ${selected == null ? "disabled" : ""}>${t("self_study_next")}</button>
      </div>
    `;

    root.querySelectorAll(".ssc-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        state.answers[q.id] = idx;
        render();
      });
    });

    document.getElementById("ssc-placement-prev")?.addEventListener("click", goPrev);
    document.getElementById("ssc-placement-next")?.addEventListener("click", goNext);
  }

  function goPrev() {
    if (state.questionIndex > 0) {
      state.questionIndex -= 1;
    } else if (state.partIndex > 0) {
      state.partIndex -= 1;
      state.questionIndex = MOCK.PARTS[state.partIndex].questions.length - 1;
    }
    render();
  }

  function goNext() {
    const part = currentPart();
    const q = currentQuestion();
    if (!part || !q || state.answers[q.id] == null) return;

    if (state.questionIndex < part.questions.length - 1) {
      state.questionIndex += 1;
    } else if (state.partIndex < MOCK.PARTS.length - 1) {
      state.partIndex += 1;
      state.questionIndex = 0;
    } else {
      finishTest();
      return;
    }
    render();
  }

  function finishTest() {
    const result = MOCK.computePlacement(state.answers);
    MOCK.savePlacement(result);
    state.screen = "report";
    render();
  }

  function renderReport(root) {
    const stored = MOCK.getPlacement();
    if (!stored || !stored.report) {
      state.screen = "intro";
      render();
      return;
    }

    const r = stored.report;
    const profileItems = Object.keys(r.skillProfile)
      .map((skill) => {
        const lv = r.skillProfile[skill];
        const label = r.skillLabels[skill] || skill;
        return `<div class="ssc-skill-item"><strong>${label}</strong>${formatSkillLevel(skill, lv)}</div>`;
      })
      .join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2 data-i18n="self_study_report_title">Your learning profile</h2>
        <p class="ssc-report__range"><span data-i18n="self_study_report_level">Overall level</span>: <strong>${r.levelLabel}</strong> · ${r.rangeLabel}</p>
        <p class="ssc-disclaimer" data-i18n="self_study_placement_disclaimer">Demo diagnostic only — not an official IELTS score.</p>
        <section>
          <h3 data-i18n="self_study_report_skills">Skill profile</h3>
          <div class="ssc-skill-grid">${profileItems}</div>
        </section>
        <section>
          <h3 data-i18n="self_study_report_strengths">Strengths</h3>
          <ul>${r.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>
        </section>
        <section>
          <h3 data-i18n="self_study_report_improve">Areas for improvement</h3>
          <ul>${r.improvementsList.map((s) => `<li>${s}</li>`).join("")}</ul>
        </section>
        <section>
          <h3 data-i18n="self_study_report_path">Recommended path</h3>
          <ul>${r.path.map((s) => `<li>${s}</li>`).join("")}</ul>
        </section>
        <p style="font-size:0.875rem;color:var(--eap-text-muted,#6e6e73)">${t("self_study_report_score", { score: String(stored.totalPercent), correct: String(stored.totalCorrect), total: String(stored.totalQuestions) })}</p>
        <div class="ssc-placement-actions">
          <a href="student-self-study.html" class="btn-primary">${t("self_study_continue_hub")}</a>
        </div>
      </div>
    `;
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function render() {
    const root = document.getElementById("ssc-placement-root");
    if (!root) return;
    renderProgress();
    if (state.screen === "intro") renderIntro(root);
    else if (state.screen === "question") renderQuestion(root);
    else if (state.screen === "report") renderReport(root);
  }

  function bindRetakeFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("retake") === "1") {
      MOCK.clearPlacement();
      state.screen = "intro";
    }
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const sessionUser = await validatePageSessionOrFallback("student");
    if (!sessionUser) return;

    initAppPageHeader();
    bindRetakeFromQuery();

    const existing = MOCK.getPlacement();
    if (existing && !new URLSearchParams(window.location.search).has("retake")) {
      state.screen = "report";
    }

    render();

    window.addEventListener("eap:langchange", () => {
      const stored = MOCK.getPlacement();
      if (stored && stored.answers) {
        const recomputed = MOCK.computePlacement(stored.answers);
        MOCK.savePlacement(recomputed);
      }
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
