/**
 * SS-Sp1 — server-backed speaking (Part 1, timer + typed response; TTS/STT deferred).
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
    questionIndex: 0,
    timerId: null,
    secondsLeft: 0,
    startedAt: null,
    lastFeedback: null,
  };

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function showPanel(panelId) {
    document.querySelectorAll(".ssc-speaking-panel").forEach((p) => {
      p.hidden = p.id !== panelId;
    });
    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      const tab = btn.getAttribute("data-tab");
      btn.classList.toggle("ssc-tab--active", tab === panelId.replace("ssc-speaking-", ""));
      btn.setAttribute("aria-selected", tab === panelId.replace("ssc-speaking-", "") ? "true" : "false");
    });
  }

  async function loadSession(sessionId) {
    state.sessionId = sessionId;
    state.sessionDetail = await SERVER().getSpeakingSession(sessionId);
    state.questionIndex = 0;
    state.lastFeedback = null;
    return state.sessionDetail;
  }

  function sessionProgress(detail) {
    const total = (detail.session.content.questions || []).length;
    const done = (detail.responses || []).length;
    return total ? Math.round((done / total) * 100) : 0;
  }

  async function renderHub(root) {
    let overview;
    try {
      overview = await SERVER().getSpeakingOverview();
      state.overview = overview;
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    root.innerHTML = `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${t("self_study_speaking_part1_badge")}</span>
      </div>
      <div class="ssc-lesson-card">
        <h2>${t("self_study_speaking_hub_title")}</h2>
        <p>${t("self_study_speaking_hub_hint")}</p>
        <p class="ssc-disclaimer">${t("self_study_speaking_no_stt")}</p>
      </div>
      <ul class="ssc-vocab-pack-list">
        ${(overview.sessions || [])
          .map(
            (s) =>
              `<li><button type="button" class="ssc-vocab-pack-btn" data-session="${s.id}">${escapeHtml(s.title)} · ${s.questionCount} ${t("self_study_speaking_questions_short")}</button></li>`,
          )
          .join("")}
      </ul>
      <p class="ssc-vocab-hint">${t("self_study_speaking_responses_count", { n: String(overview.responsesCount || 0) })}</p>
    `;

    updateHeader(0, t("self_study_speaking_hub_status"));

    root.querySelectorAll("[data-session]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-session"), 10);
        void openSession(id);
      });
    });
  }

  async function openSession(sessionId) {
    clearTimer();
    state.sessionId = sessionId;
    state.sessionDetail = null;
    state.questionIndex = 0;
    state.lastFeedback = null;
    showPanel("ssc-speaking-practice");
    await renderPractice(document.getElementById("ssc-speaking-practice"));
  }

  async function renderPractice(root) {
    if (!state.sessionId) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_speaking_pick_session")}</p>`;
      return;
    }

    let detail;
    try {
      detail = state.sessionDetail || (await loadSession(state.sessionId));
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const questions = detail.session.content.questions || [];
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");
    const idx = state.questionIndex;
    const q = questions[idx];

    if (!q) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_speaking_session_done")}</h2>
          <button type="button" class="btn-primary" id="ssc-back-hub">${t("self_study_speaking_back_hub")}</button>
        </div>
      `;
      document.getElementById("ssc-back-hub")?.addEventListener("click", () => {
        showPanel("ssc-speaking-hub");
        void renderHub(document.getElementById("ssc-speaking-hub"));
      });
      updateHeader(100, t("self_study_speaking_complete_short"));
      return;
    }

    const limit = q.timeLimitSec || 60;
    const minW = q.minWords || 30;
    const answered = (detail.responses || []).find((r) => r.questionId === q.id);

    if (answered && !state.lastFeedback) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_speaking_already_answered")}</h2>
          <p>${t("self_study_speaking_band_result", { band: String(answered.overallBandEstimate || "—") })}</p>
          <button type="button" class="btn-primary" id="ssc-next-q">${t("self_study_next")}</button>
        </div>
      `;
      document.getElementById("ssc-next-q")?.addEventListener("click", () => {
        state.questionIndex += 1;
        void renderPractice(root);
      });
      return;
    }

    if (state.lastFeedback) {
      renderFeedback(root, q, state.lastFeedback, questions.length, idx);
      return;
    }

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-sessions">← ${t("self_study_speaking_all_sessions")}</button>
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(detail.session.title)}</h2>
        <p>${escapeHtml(lesson)}</p>
        <p class="ssc-speaking-progress">${t("self_study_vocab_practice_progress", { current: String(idx + 1), total: String(questions.length) })}</p>
      </div>
      <div class="ssc-speaking-question-card">
        <p class="ssc-speaking-examiner">${t("self_study_speaking_examiner")}</p>
        <h3>${escapeHtml(pickLang(q, "promptEn", "promptZh"))}</h3>
        <p class="ssc-disclaimer">${t("self_study_speaking_tts_pending")}</p>
      </div>
      <div class="ssc-speaking-timer" aria-live="polite">
        <span class="ssc-speaking-timer__label">${t("self_study_speaking_time_left")}</span>
        <span class="ssc-speaking-timer__value" id="ssc-timer-val">${limit}</span>s
      </div>
      <label for="ssc-speaking-response" class="ssc-listening-notes__label">${t("self_study_speaking_your_response")}</label>
      <textarea id="ssc-speaking-response" class="ssc-listening-notes__input" rows="5" maxlength="20000" placeholder="${t("self_study_speaking_response_placeholder")}"></textarea>
      <p class="ssc-writing-wordcount"><span id="ssc-sp-wc">0</span> / ${minW} ${t("self_study_writing_words")}</p>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-start-timer">${t("self_study_speaking_start_timer")}</button>
        <button type="button" class="btn-secondary" id="ssc-submit-response" disabled>${t("self_study_speaking_submit")}</button>
      </div>
    `;

    updateHeader(sessionProgress(detail), t("self_study_module_in_progress", { pct: String(sessionProgress(detail)) }));

    const ta = document.getElementById("ssc-speaking-response");
    const wcEl = document.getElementById("ssc-sp-wc");
    const timerEl = document.getElementById("ssc-timer-val");
    const submitBtn = document.getElementById("ssc-submit-response");
    let running = false;

    function refreshWc() {
      if (wcEl) wcEl.textContent = String(countWords(ta?.value || ""));
    }
    ta?.addEventListener("input", refreshWc);

    async function finishResponse(timedOut) {
      clearTimer();
      const text = ta?.value?.trim() || "";
      const elapsed = state.startedAt ? Math.min(limit, limit - state.secondsLeft) : 0;
      if (text.length < 5) {
        alert(t("self_study_speaking_response_short"));
        return;
      }
      try {
        const res = await SERVER().submitSpeakingResponse({
          sessionId: state.sessionId,
          questionId: q.id,
          responseText: text,
          timedOut: !!timedOut,
          elapsedSec: elapsed,
        });
        state.lastFeedback = res.feedback;
        state.sessionDetail = null;
        renderFeedback(root, q, res.feedback, questions.length, idx);
      } catch (e) {
        alert(e.message);
      }
    }

    function tick() {
      state.secondsLeft -= 1;
      if (timerEl) timerEl.textContent = String(Math.max(0, state.secondsLeft));
      if (state.secondsLeft <= 0) {
        clearTimer();
        if (submitBtn) submitBtn.disabled = false;
        void finishResponse(true);
      }
    }

    document.getElementById("ssc-start-timer")?.addEventListener("click", () => {
      if (running) return;
      running = true;
      state.secondsLeft = limit;
      state.startedAt = Date.now();
      if (submitBtn) submitBtn.disabled = false;
      ta?.focus();
      clearTimer();
      state.timerId = setInterval(tick, 1000);
    });

    submitBtn?.addEventListener("click", () => void finishResponse(false));

    document.getElementById("ssc-back-sessions")?.addEventListener("click", () => {
      clearTimer();
      showPanel("ssc-speaking-hub");
      void renderHub(document.getElementById("ssc-speaking-hub"));
    });
  }

  function renderFeedback(root, q, fb, total, idx) {
    const criteria = (fb.criteria || [])
      .map((c) => {
        const label = isZh() ? c.labelZh || c.labelEn : c.labelEn || c.labelZh;
        const strengths = (c.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
        const improvements = (c.improvements || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
        return `
          <article class="ssc-writing-criterion">
            <h3>${escapeHtml(label)} · ${t("self_study_writing_band")} ${c.band}</h3>
            ${strengths ? `<ul>${strengths}</ul>` : ""}
            ${improvements ? `<p><strong>${t("self_study_speaking_improve")}</strong></p><ul>${improvements}</ul>` : ""}
          </article>
        `;
      })
      .join("");

    const upgrades = (fb.sampleUpgradePhrases || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_speaking_feedback_title")}</h2>
        <p>${t("self_study_speaking_overall_band", { band: String(fb.overallBandEstimate) })}</p>
        <p class="ssc-disclaimer">${escapeHtml(pickLang(fb, "disclaimerEn", "disclaimerZh"))}</p>
        ${fb.timedOut ? `<p class="ssc-vocab-hint">${t("self_study_speaking_timed_out")}</p>` : ""}
      </div>
      <div class="ssc-writing-criteria">${criteria}</div>
      ${upgrades ? `<h3>${t("self_study_speaking_upgrade_phrases")}</h3><ul>${upgrades}</ul>` : ""}
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-next-after-fb">${idx < total - 1 ? t("self_study_next") : t("self_study_speaking_finish_session")}</button>
      </div>
    `;

    document.getElementById("ssc-next-after-fb")?.addEventListener("click", () => {
      state.lastFeedback = null;
      state.questionIndex += 1;
      state.sessionDetail = null;
      void renderPractice(root);
    });
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_speaking");
    if (levelEl) levelEl.hidden = true;

    clearTimer();
    state.sessionId = null;
    state.sessionDetail = null;
    state.questionIndex = 0;
    state.lastFeedback = null;

    shell.innerHTML = `
      <nav class="ssc-tabs" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" data-tab="hub" aria-selected="true">${t("self_study_speaking_tab_sessions")}</button>
        <button type="button" class="ssc-tab" data-tab="practice" aria-selected="false">${t("self_study_speaking_tab_practice")}</button>
      </nav>
      <div id="ssc-speaking-hub" class="ssc-speaking-panel ssc-tab-panel" data-panel="hub"></div>
      <div id="ssc-speaking-practice" class="ssc-speaking-panel ssc-tab-panel" data-panel="practice" hidden></div>
    `;

    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (tab === "hub") {
          clearTimer();
          showPanel("ssc-speaking-hub");
          void renderHub(document.getElementById("ssc-speaking-hub"));
        } else if (tab === "practice" && state.sessionId) {
          showPanel("ssc-speaking-practice");
          void renderPractice(document.getElementById("ssc-speaking-practice"));
        }
      });
    });

    await renderHub(document.getElementById("ssc-speaking-hub"));
    return true;
  }

  global.EAP_SPEAKING_UI = { init };
})();
