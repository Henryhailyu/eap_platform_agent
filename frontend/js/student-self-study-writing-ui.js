/**
 * SS-W1 — server-backed writing (genre rotation, pre-coach, draft, IELTS rubric feedback).
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

  function countWords(text) {
    const m = String(text || "").match(/[A-Za-z0-9\u4e00-\u9fff]+/g);
    return m ? m.length : 0;
  }

  const state = {
    overview: null,
    taskId: null,
    taskDetail: null,
    activeTab: "plan",
    lastFeedback: null,
  };

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
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

  function genreLabel(genreId) {
    const key = `self_study_writing_genre_${String(genreId || "").toLowerCase()}`;
    const out = t(key);
    return out === key ? genreId : out;
  }

  async function loadTask(taskId) {
    state.taskId = taskId;
    state.taskDetail = await SERVER().getWritingTask(taskId);
    state.lastFeedback = null;
    return state.taskDetail;
  }

  function progressPct(detail) {
    if (!detail || !detail.submissions || !detail.submissions.length) return 0;
    return Math.min(100, detail.submissions.length * 33);
  }

  async function renderPlanPanel(root) {
    if (!state.taskId) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_writing_pick_task")}</p>`;
      return;
    }
    let detail;
    try {
      detail = state.taskDetail || (await loadTask(state.taskId));
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const task = detail.task;
    const c = task.content || {};
    const coach = c.preCoach || {};
    const outline = coach.outline || [];
    const checklist = isZh() ? coach.checklistZh || coach.checklistEn : coach.checklistEn || coach.checklistZh;

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(task.title)}</h2>
        <p class="ssc-writing-genre">${escapeHtml(genreLabel(task.genreId))}</p>
        <div class="ssc-passage-block">${escapeHtml(pickLang(c, "promptEn", "promptZh")).replace(/\n/g, "<br>")}</div>
        <p class="ssc-writing-word-hint">${t("self_study_writing_min_words", { n: String(c.wordLimitMin || 250) })}</p>
      </div>
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_task_decode")}</h3>
        <p>${escapeHtml(pickLang(coach, "taskDecodeEn", "taskDecodeZh"))}</p>
      </section>
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_outline")}</h3>
        <ol class="ssc-writing-outline">
          ${outline
            .map(
              (o) =>
                `<li><strong>${escapeHtml(o.role || "")}</strong> — ${escapeHtml(pickLang(o, "guideEn", "guideZh"))}</li>`,
            )
            .join("")}
        </ol>
      </section>
      ${
        checklist && checklist.length
          ? `<section class="ssc-writing-coach-block"><h3>${t("self_study_writing_checklist")}</h3><ul>${(checklist || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>`
          : ""
      }
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-go-draft">${t("self_study_writing_start_draft")}</button>
      </div>
    `;

    updateHeader(
      progressPct(detail),
      detail.submissions && detail.submissions.length
        ? t("self_study_writing_revision_status", { n: String(detail.submissions.length) })
        : t("self_study_module_in_progress", { pct: "0" }),
    );

    document.getElementById("ssc-go-draft")?.addEventListener("click", () => {
      showTab("draft");
      void renderDraftPanel(document.getElementById("ssc-panel-draft"));
    });
  }

  async function renderDraftPanel(root) {
    if (!state.taskId) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_writing_pick_task")}</p>`;
      return;
    }
    let detail;
    try {
      detail = state.taskDetail || (await loadTask(state.taskId));
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const minW = detail.task.content?.wordLimitMin || 250;
    const revLeft = detail.revisionsRemaining ?? 3;

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${t("self_study_writing_draft_title")}</h2>
        <p>${t("self_study_writing_revisions_left", { n: String(revLeft) })}</p>
      </div>
      <textarea id="ssc-writing-draft" class="ssc-writing-draft" rows="14" maxlength="50000" placeholder="${t("self_study_writing_draft_placeholder")}"></textarea>
      <p class="ssc-writing-wordcount" aria-live="polite"><span id="ssc-wc">0</span> / ${minW} ${t("self_study_writing_words")}</p>
      <div class="ssc-writing-upload">
        <label class="ssc-writing-upload__label" for="ssc-writing-file">${t("self_study_writing_upload_label")}</label>
        <input type="file" id="ssc-writing-file" accept=".doc,.docx,.pdf,.txt,image/*" />
        <p class="ssc-vocab-hint">${t("self_study_writing_upload_hint")}</p>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-submit-draft" ${revLeft <= 0 ? "disabled" : ""}>${t("self_study_writing_ai_score")}</button>
      </div>
    `;

    const ta = document.getElementById("ssc-writing-draft");
    const wcEl = document.getElementById("ssc-wc");
    function refreshWc() {
      if (wcEl) wcEl.textContent = String(countWords(ta?.value || ""));
    }
    ta?.addEventListener("input", refreshWc);
    refreshWc();

    const fileInput = document.getElementById("ssc-writing-file");

    document.getElementById("ssc-submit-draft")?.addEventListener("click", async () => {
      const draft = ta?.value?.trim() || "";
      const file = fileInput?.files?.[0] || null;
      if (draft.length < 20 && !file) {
        alert(t("self_study_writing_draft_short"));
        return;
      }
      const btn = document.getElementById("ssc-submit-draft");
      if (btn) {
        btn.disabled = true;
        btn.textContent = t("self_study_writing_ai_scoring");
      }
      try {
        const res = await SERVER().submitWriting(
          { taskId: state.taskId, draftText: draft, useAi: true },
          file,
        );
        state.lastFeedback = res.feedback;
        state.taskDetail = null;
        await loadTask(state.taskId);
        showTab("feedback");
        void renderFeedbackPanel(document.getElementById("ssc-panel-feedback"));
        updateHeader(100, t("self_study_writing_submitted"));
      } catch (e) {
        alert(e.message);
      } finally {
        if (btn) {
          btn.disabled = revLeft <= 0;
          btn.textContent = t("self_study_writing_ai_score");
        }
      }
    });
  }

  function renderFeedbackPanel(root) {
    const fb = state.lastFeedback;
    if (!fb) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_writing_no_feedback")}</p>`;
      return;
    }

    const criteria = (fb.criteria || [])
      .map((c) => {
        const label = isZh() ? c.labelZh || c.labelEn : c.labelEn || c.labelZh;
        const comments = (c.comments || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
        return `
          <article class="ssc-writing-criterion">
            <h3>${escapeHtml(label)} · ${t("self_study_writing_band")} ${c.estimatedBand}</h3>
            <ul>${comments}</ul>
          </article>
        `;
      })
      .join("");

    const strengths = (fb.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    const priorities = (fb.priorities || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    const revisions = (fb.actionableRevisions || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_writing_feedback_title")}</h2>
        <p>${t("self_study_writing_overall_band", { band: String(fb.overallBandEstimate) })}</p>
        <p class="ssc-disclaimer">${escapeHtml(pickLang(fb, "disclaimerEn", "disclaimerZh"))}</p>
        <p>${t("self_study_writing_wordcount_result", { count: String(fb.wordCount), min: String(fb.wordLimitMin) })}</p>
      </div>
      <div class="ssc-writing-criteria">${criteria}</div>
      ${strengths ? `<h3>${t("self_study_writing_strengths")}</h3><ul>${strengths}</ul>` : ""}
      ${priorities ? `<h3>${t("self_study_writing_priorities")}</h3><ul>${priorities}</ul>` : ""}
      ${revisions ? `<h3>${t("self_study_writing_revisions")}</h3><ul>${revisions}</ul>` : ""}
      <div class="ssc-placement-actions">
        <button type="button" class="btn-secondary" id="ssc-revise">${t("self_study_writing_revise")}</button>
      </div>
    `;

    document.getElementById("ssc-revise")?.addEventListener("click", () => {
      showTab("draft");
      void renderDraftPanel(document.getElementById("ssc-panel-draft"));
    });
  }

  function renderLibrary(shell) {
    const lib = state.overview.library || [];
    const suggested = state.overview.suggestedTask;
    const genreToday = state.overview.weekdayGenre;

    const libHtml = lib
      .map(
        (item) =>
          `<li><button type="button" class="ssc-vocab-pack-btn" data-task="${item.id}">${escapeHtml(item.title)} · ${escapeHtml(genreLabel(item.genreId))}</button></li>`,
      )
      .join("");

    return `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${genreToday ? t("self_study_writing_today_genre", { genre: genreLabel(genreToday) }) : t("self_study_writing_free_choice")}</span>
      </div>
      ${
        suggested
          ? `<div class="ssc-banner ssc-banner--placement">
        <p>${t("self_study_writing_suggested")}: <strong>${escapeHtml(suggested.title)}</strong></p>
        <button type="button" class="btn-primary" id="ssc-open-suggested" data-task="${suggested.id}">${t("self_study_writing_open_suggested")}</button>
      </div>`
          : ""
      }
      <div class="ssc-lesson-card">
        <h2>${t("self_study_writing_library")}</h2>
        <p>${t("self_study_writing_library_hint")}</p>
      </div>
      <ul class="ssc-vocab-pack-list">${libHtml}</ul>
      <nav class="ssc-tabs ssc-tabs--inner hidden" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" data-tab="plan">${t("self_study_writing_tab_plan")}</button>
        <button type="button" class="ssc-tab" data-tab="draft">${t("self_study_writing_tab_draft")}</button>
        <button type="button" class="ssc-tab" data-tab="feedback">${t("self_study_writing_tab_feedback")}</button>
      </nav>
      <div id="ssc-panel-plan" class="ssc-tab-panel" data-panel="plan"></div>
      <div id="ssc-panel-draft" class="ssc-tab-panel" data-panel="draft" hidden></div>
      <div id="ssc-panel-feedback" class="ssc-tab-panel" data-panel="feedback" hidden></div>
    `;
  }

  async function openTask(taskId) {
    state.taskId = taskId;
    state.taskDetail = null;
    const tabs = document.querySelector(".ssc-tabs--inner");
    if (tabs) tabs.classList.remove("hidden");
    showTab("plan");
    await renderPlanPanel(document.getElementById("ssc-panel-plan"));
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_writing");
    if (levelEl) levelEl.hidden = true;

    try {
      state.overview = await SERVER().getWritingOverview();
    } catch (_) {
      return false;
    }

    state.taskId = null;
    state.taskDetail = null;
    state.lastFeedback = null;

    shell.innerHTML = renderLibrary(shell);

    shell.querySelectorAll("[data-task]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-task"), 10);
        void openTask(id);
      });
    });

    document.getElementById("ssc-open-suggested")?.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.getAttribute("data-task"), 10);
      void openTask(id);
    });

    shell.querySelectorAll(".ssc-tabs--inner .ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showTab(tab);
        if (tab === "plan") void renderPlanPanel(document.getElementById("ssc-panel-plan"));
        if (tab === "draft") void renderDraftPanel(document.getElementById("ssc-panel-draft"));
        if (tab === "feedback") renderFeedbackPanel(document.getElementById("ssc-panel-feedback"));
      });
    });

    updateHeader(0, t("self_study_writing_hub_status", { n: String(state.overview.tasksCompleted || 0) }));
    return true;
  }

  global.EAP_WRITING_UI = { init };
})(typeof window !== "undefined" ? window : globalThis);
