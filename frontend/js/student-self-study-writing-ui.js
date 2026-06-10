/**
 * SS-W2 — AI EAP writing: Essay / Proposal / Mini-dissertation / Research report.
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
    sessionId: null,
    sessionDetail: null,
    phase: "hub",
    pendingModule: null,
    lastFeedback: null,
    activeTab: "learn",
  };

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function showPanel(panelId) {
    document.querySelectorAll(".ssc-writing-panel").forEach((p) => {
      p.hidden = p.id !== panelId;
    });
  }

  function moduleLabel(mod) {
    return isZh() ? mod.labelZh || mod.labelEn : mod.labelEn || mod.labelZh;
  }

  function renderLoading(root, titleKey) {
    root.innerHTML = `
      <div class="ssc-listening-loading" role="status" aria-live="polite" aria-busy="true">
        <div class="ssc-listening-loading__spinner" aria-hidden="true"></div>
        <h2 class="ssc-listening-loading__title">${t(titleKey || "self_study_writing_loading_title")}</h2>
        <p class="ssc-listening-loading__body">${t("self_study_writing_loading_body")}</p>
        <p class="ssc-listening-loading__eta">${t("self_study_writing_loading_eta")}</p>
        <p class="ssc-listening-loading__patience">${t("self_study_listening_loading_patience")}</p>
      </div>
    `;
    updateHeader(0, t("self_study_writing_loading_short"));
  }

  function renderAnalysisBlock(analysis) {
    const a = analysis || {};
    const task = a.task || {};
    const org = a.organization || {};
    const vocab = a.vocabulary || {};
    const grammar = a.grammar || {};

    const sectionList = (org.sections || [])
      .map(
        (s) =>
          `<li><strong>${escapeHtml(s.role || "")}</strong> — ${escapeHtml(s.guideEn || "")}</li>`,
      )
      .join("");

    const comments = (arr) => (arr || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");

    const highlights = (items, key) =>
      (items || [])
        .map((h) => `<li><em>${escapeHtml(h[key] || "")}</em> — ${escapeHtml(h.noteEn || "")}</li>`)
        .join("");

    return `
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_analysis_task")}</h3>
        <p>${escapeHtml(task.summaryEn || "")}</p>
        <ul>${comments(task.comments)}</ul>
      </section>
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_analysis_org")}</h3>
        <ol class="ssc-writing-outline">${sectionList}</ol>
        <ul>${comments(org.comments)}</ul>
      </section>
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_analysis_vocab")}</h3>
        <ul>${highlights(vocab.highlights, "phrase")}</ul>
        <ul>${comments(vocab.comments)}</ul>
      </section>
      <section class="ssc-writing-coach-block">
        <h3>${t("self_study_writing_analysis_grammar")}</h3>
        <ul>${highlights(grammar.highlights, "pattern")}</ul>
        <ul>${comments(grammar.comments)}</ul>
      </section>
    `;
  }

  async function renderLearn(root) {
    const detail = state.sessionDetail;
    if (!detail?.session?.content) return;
    const c = detail.session.content;
    const sample = c.sample || {};
    const fullText = sample.fullText || "";

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-hub">← ${t("self_study_writing_back_hub")}</button>
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(detail.session.title)}</h2>
        <p class="ssc-writing-genre">${escapeHtml(t("self_study_writing_sample_label"))}</p>
        <p class="ssc-writing-word-hint">${t("self_study_writing_word_range", {
          min: String(c.wordMin || 0),
          max: String(c.wordMax || 0),
        })}</p>
      </div>
      <article class="ssc-writing-sample">
        <h3>${t("self_study_writing_sample_title")}</h3>
        <div class="ssc-passage-block ssc-writing-sample__body">${escapeHtml(fullText).replace(/\n/g, "<br>")}</div>
        <p class="ssc-vocab-hint">${t("self_study_writing_sample_wc", { n: String(sample.wordCount || countWords(fullText)) })}</p>
      </article>
      <h3 class="ssc-writing-analysis-heading">${t("self_study_writing_analysis_title")}</h3>
      ${renderAnalysisBlock(c.analysis)}
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-go-practice">${t("self_study_writing_start_practice")}</button>
      </div>
    `;

    updateHeader(40, t("self_study_module_in_progress", { pct: "40" }));
    document.getElementById("ssc-back-hub")?.addEventListener("click", backToHub);
    document.getElementById("ssc-go-practice")?.addEventListener("click", () => {
      state.phase = "practice";
      void renderPractice(document.getElementById("ssc-writing-practice"));
    });
  }

  async function renderPractice(root) {
    const detail = state.sessionDetail;
    if (!detail?.session?.content) return;
    const c = detail.session.content;
    const practice = c.practice || {};
    const revLeft = detail.revisionsRemaining ?? 3;
    const minW = c.wordMin || 280;
    const maxW = c.wordMax || 320;

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-learn">← ${t("self_study_writing_back_sample")}</button>
      <div class="ssc-lesson-card">
        <h2>${t("self_study_writing_practice_title")}</h2>
        <div class="ssc-passage-block">${escapeHtml(pickLang(practice, "promptEn", "promptZh")).replace(/\n/g, "<br>")}</div>
        <p class="ssc-writing-word-hint">${t("self_study_writing_word_range", { min: String(minW), max: String(maxW) })}</p>
        <p>${t("self_study_writing_revisions_left", { n: String(revLeft) })}</p>
      </div>
      <textarea id="ssc-writing-draft" class="ssc-writing-draft" rows="16" maxlength="50000" placeholder="${t("self_study_writing_draft_placeholder")}"></textarea>
      <p class="ssc-writing-wordcount" aria-live="polite">
        <span id="ssc-wc">0</span> ${t("self_study_writing_words")}
        · ${t("self_study_writing_word_range", { min: String(minW), max: String(maxW) })}
      </p>
      <div class="ssc-writing-upload">
        <label class="ssc-writing-upload__label" for="ssc-writing-file">${t("self_study_writing_upload_label")}</label>
        <input type="file" id="ssc-writing-file" accept=".doc,.docx,.txt" />
        <p class="ssc-vocab-hint">${t("self_study_writing_upload_hint_w2")}</p>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-submit-draft" ${revLeft <= 0 ? "disabled" : ""}>${t("self_study_writing_ai_score")}</button>
      </div>
    `;

    updateHeader(70, t("self_study_module_in_progress", { pct: "70" }));

    const ta = document.getElementById("ssc-writing-draft");
    const wcEl = document.getElementById("ssc-wc");
    function refreshWc() {
      const n = countWords(ta?.value || "");
      if (wcEl) wcEl.textContent = String(n);
      if (wcEl?.parentElement) {
        wcEl.parentElement.classList.toggle("ssc-writing-wordcount--warn", n < minW || n > maxW);
      }
    }
    ta?.addEventListener("input", refreshWc);
    refreshWc();

    document.getElementById("ssc-back-learn")?.addEventListener("click", () => {
      state.phase = "learn";
      void renderLearn(root);
    });

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
        const res = await SERVER().submitWriting({ sessionId: state.sessionId, draftText: draft }, file);
        state.lastFeedback = res.feedback;
        state.sessionDetail = await SERVER().getWritingSession(state.sessionId);
        state.phase = "feedback";
        void renderFeedback(document.getElementById("ssc-writing-practice"));
        updateHeader(100, t("self_study_writing_submitted"));
      } catch (e) {
        alert(e.message);
      } finally {
        if (btn) {
          btn.disabled = (state.sessionDetail?.revisionsRemaining ?? 0) <= 0;
          btn.textContent = t("self_study_writing_ai_score");
        }
      }
    });
  }

  function renderFeedback(root) {
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
    const revLeft = state.sessionDetail?.revisionsRemaining ?? 0;

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_writing_feedback_title")}</h2>
        <p>${t("self_study_writing_overall_band", { band: String(fb.overallBandEstimate) })}</p>
        <p class="ssc-disclaimer">${escapeHtml(pickLang(fb, "disclaimerEn", "disclaimerZh"))}</p>
        <p>${t("self_study_writing_wordcount_range", {
          count: String(fb.wordCount),
          min: String(fb.wordMin),
          max: String(fb.wordMax),
        })}</p>
      </div>
      <div class="ssc-writing-criteria">${criteria}</div>
      ${strengths ? `<h3>${t("self_study_writing_strengths")}</h3><ul>${strengths}</ul>` : ""}
      ${priorities ? `<h3>${t("self_study_writing_priorities")}</h3><ul>${priorities}</ul>` : ""}
      ${revisions ? `<h3>${t("self_study_writing_revisions")}</h3><ul>${revisions}</ul>` : ""}
      <div class="ssc-placement-actions">
        ${revLeft > 0 ? `<button type="button" class="btn-secondary" id="ssc-revise">${t("self_study_writing_revise")}</button>` : ""}
        <button type="button" class="btn-secondary" id="ssc-back-hub-fb">${t("self_study_writing_back_hub")}</button>
      </div>
    `;

    document.getElementById("ssc-revise")?.addEventListener("click", () => {
      state.phase = "practice";
      state.lastFeedback = null;
      void renderPractice(root);
    });
    document.getElementById("ssc-back-hub-fb")?.addEventListener("click", backToHub);
  }

  function backToHub() {
    state.sessionId = null;
    state.sessionDetail = null;
    state.phase = "hub";
    state.pendingModule = null;
    state.lastFeedback = null;
    showPanel("ssc-writing-hub");
    void renderHub(document.getElementById("ssc-writing-hub"));
  }

  async function startModule(moduleId, essayType) {
    state.phase = "loading";
    showPanel("ssc-writing-practice");
    const root = document.getElementById("ssc-writing-practice");
    renderLoading(root, "self_study_writing_loading_title");
    try {
      const session = await SERVER().startWritingSession({ moduleId, essayType });
      state.sessionId = session.sessionId;
      state.sessionDetail = await SERVER().getWritingSession(session.sessionId);
      state.phase = "learn";
      await renderLearn(root);
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>
        <button type="button" class="btn-secondary" id="ssc-back-hub-err">${t("self_study_writing_back_hub")}</button>`;
      document.getElementById("ssc-back-hub-err")?.addEventListener("click", backToHub);
    }
  }

  function renderEssayTypePicker(root, mod) {
    const types = mod.essayTypes || [];
    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-modules">← ${t("self_study_writing_back_hub")}</button>
      <div class="ssc-lesson-card">
        <h2>${t("self_study_writing_essay_choose")}</h2>
        <p>${t("self_study_writing_essay_choose_hint")}</p>
      </div>
      <div class="ssc-speaking-part-grid">
        ${types
          .map(
            (et) => `
          <button type="button" class="ssc-speaking-part-card" data-essay-type="${escapeHtml(et.id)}">
            <strong>${escapeHtml(isZh() ? et.labelZh || et.labelEn : et.labelEn)}</strong>
          </button>`,
          )
          .join("")}
      </div>
    `;
    document.getElementById("ssc-back-modules")?.addEventListener("click", () => {
      state.pendingModule = null;
      void renderHub(root);
    });
    root.querySelectorAll("[data-essay-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const et = btn.getAttribute("data-essay-type");
        void startModule("ESSAY", et);
      });
    });
  }

  async function renderHub(root) {
    let overview;
    try {
      overview = await SERVER().getWritingOverview();
      state.overview = overview;
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    if (state.pendingModule === "ESSAY") {
      const mod = (overview.modules || []).find((m) => m.moduleId === "ESSAY");
      if (mod) {
        renderEssayTypePicker(root, mod);
        return;
      }
    }

    const cards = (overview.modules || [])
      .map(
        (mod) => `
        <button type="button" class="ssc-speaking-part-card" data-module="${escapeHtml(mod.moduleId)}">
          <strong>${escapeHtml(moduleLabel(mod))}</strong>
          <span>${escapeHtml(t(`self_study_writing_module_desc_${mod.moduleId.toLowerCase()}`))}</span>
        </button>`,
      )
      .join("");

    root.innerHTML = `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${t("self_study_writing_hub_badge")}</span>
      </div>
      <div class="ssc-lesson-card">
        <h2>${t("self_study_writing_chooser_title")}</h2>
        <p>${t("self_study_writing_chooser_hint")}</p>
      </div>
      <div class="ssc-speaking-part-grid">${cards}</div>
    `;

    updateHeader(0, t("self_study_writing_hub_status", { n: String(overview.sessionsCompleted || 0) }));

    root.querySelectorAll("[data-module]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mid = btn.getAttribute("data-module");
        if (mid === "ESSAY") {
          state.pendingModule = "ESSAY";
          const mod = (overview.modules || []).find((m) => m.moduleId === "ESSAY");
          renderEssayTypePicker(root, mod || { essayTypes: [] });
        } else if (mid) {
          void startModule(mid, null);
        }
      });
    });
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_writing");
    if (levelEl) levelEl.hidden = true;

    state.sessionId = null;
    state.sessionDetail = null;
    state.phase = "hub";
    state.pendingModule = null;
    state.lastFeedback = null;

    shell.innerHTML = `
      <div id="ssc-writing-hub" class="ssc-writing-panel ssc-tab-panel"></div>
      <div id="ssc-writing-practice" class="ssc-writing-panel ssc-tab-panel" hidden></div>
    `;

    showPanel("ssc-writing-hub");
    await renderHub(document.getElementById("ssc-writing-hub"));
    return true;
  }

  global.EAP_WRITING_UI = { init };
})(typeof window !== "undefined" ? window : globalThis);
