/**
 * SS-L1 / SS-L2 — server-backed listening (Part 3/4, notes coach + key-point compare).
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

  const state = { today: null, coach: null, lastScoring: null, activeTab: "listen" };

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
    if (prog.listenDone) n += 35;
    if (prog.selfNotes && String(prog.selfNotes).trim()) n += 15;
    if (prog.practiceDone) n += 50;
    return Math.min(100, n);
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

  function partLabel(partType) {
    if (partType === "P3") return t("self_study_listening_part3");
    if (partType === "P4") return t("self_study_listening_part4");
    return partType || "";
  }

  async function loadToday() {
    if (!state.today) {
      state.today = await SERVER().getListeningToday();
    }
    return state.today;
  }

  async function renderListenPanel(root) {
    let data;
    try {
      data = await loadToday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const c = data.content || {};
    const prog = data.progress || {};
    const script = pickLang(c, "scriptEn", "scriptZh");
    const lesson = pickLang(c, "lessonEn", "lessonZh");
    const savedNotes = prog.selfNotes || "";

    const audio = data.audio;
    const audioBlock = audio?.url
      ? `<div class="ssc-audio-player">
          <p class="ssc-audio-player__label">${t("self_study_listening_audio_play")}</p>
          <audio controls preload="metadata" src="${escapeHtml(audio.url)}" class="ssc-audio-player__el"></audio>
          ${audio.truncated ? `<p class="ssc-disclaimer">${t("self_study_listening_audio_truncated")}</p>` : ""}
        </div>`
      : `<p class="ssc-disclaimer">${t("self_study_listening_no_audio")}</p>`;

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(data.title || t("self_study_listening_learn_title"))}</h2>
        <p>${escapeHtml(lesson)}</p>
        ${audioBlock}
      </div>
      <pre class="ssc-script-block">${escapeHtml(script)}</pre>
      <div class="ssc-listening-notes">
        <label for="ssc-self-notes" class="ssc-listening-notes__label">${t("self_study_listening_notes_label")}</label>
        <textarea id="ssc-self-notes" class="ssc-listening-notes__input" rows="6" maxlength="8000" placeholder="${t("self_study_listening_notes_placeholder")}">${escapeHtml(savedNotes)}</textarea>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-secondary" id="ssc-save-notes">${t("self_study_listening_save_notes")}</button>
        <button type="button" class="btn-primary" id="ssc-listen-done">${prog.listenDone ? t("self_study_listening_marked") : t("self_study_listening_mark_listened")}</button>
        <button type="button" class="btn-secondary" id="ssc-go-practice">${t("self_study_listening_start_questions")}</button>
      </div>
    `;

    updateHeader(
      progressPct({ ...prog, selfNotes: savedNotes }),
      prog.practiceDone
        ? t("self_study_listening_complete_short")
        : t("self_study_module_in_progress", { pct: String(progressPct({ ...prog, selfNotes: savedNotes })) }),
    );

    async function persist(listenDone, notes) {
      await SERVER().completeListening({
        itemId: data.itemId,
        listenDone: !!listenDone,
        selfNotes: notes,
      });
      state.today = null;
    }

    document.getElementById("ssc-save-notes")?.addEventListener("click", async () => {
      const notes = document.getElementById("ssc-self-notes")?.value || "";
      try {
        await persist(prog.listenDone, notes);
        root.insertAdjacentHTML("beforeend", `<p class="ssc-vocab-success" role="status">${t("self_study_listening_notes_saved")}</p>`);
      } catch (e) {
        alert(e.message);
      }
    });

    document.getElementById("ssc-listen-done")?.addEventListener("click", async () => {
      const notes = document.getElementById("ssc-self-notes")?.value || "";
      try {
        await persist(true, notes);
        await renderListenPanel(root);
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
          <button type="button" class="btn-primary" id="ssc-go-coach">${t("self_study_listening_view_coach")}</button>
        </div>
      `;
      document.getElementById("ssc-go-coach")?.addEventListener("click", () => {
        showTab("coach");
        void renderCoachPanel(document.getElementById("ssc-panel-coach"));
      });
      return;
    }

    const questions = (data.content && data.content.questions) || [];
    const c = data.content || {};
    const script = pickLang(c, "scriptEn", "scriptZh");
    let index = 0;
    const answers = {};

    function renderQuestion() {
      const q = questions[index];
      if (!q) return submit();

      const opts = isZh() ? q.optionsZh || q.optionsEn : q.optionsEn || q.optionsZh;
      const chosen = answers[q.id];

      root.innerHTML = `
        <details class="ssc-reading-passage-ref">
          <summary>${t("self_study_listening_show_script")}</summary>
          <pre class="ssc-script-block ssc-script-block--compact">${escapeHtml(script)}</pre>
        </details>
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(questions.length) })}</p>
        <div class="ssc-question-card">
          <p class="ssc-question-type">${escapeHtml(q.typeId || "LMC")}</p>
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
          <button type="button" class="btn-primary" id="ssc-practice-next" ${chosen == null ? "disabled" : ""}>${index < questions.length - 1 ? t("self_study_next") : t("self_study_listening_submit")}</button>
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
      const notes = document.getElementById("ssc-self-notes")?.value || prog.selfNotes || "";
      try {
        const res = await SERVER().completeListening({
          itemId: data.itemId,
          answers,
          selfNotes: notes,
        });
        state.today = null;
        state.lastScoring = res.scoring;
        state.coach = res.coach || null;
        renderResults(root, data, res.scoring);
        updateHeader(100, t("self_study_listening_complete_short"));
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
        <button type="button" class="btn-primary" id="ssc-go-coach">${t("self_study_listening_view_coach")}</button>
      </div>
      <ul class="ssc-reading-results">${items}</ul>
    `;
    document.getElementById("ssc-go-coach")?.addEventListener("click", () => {
      showTab("coach");
      void renderCoachPanel(document.getElementById("ssc-panel-coach"));
    });
  }

  function renderComparisonHtml(coach) {
    const cmp = coach && coach.comparison;
    if (!cmp || !cmp.points || !cmp.points.length) return "";

    const pct = cmp.coveragePct != null ? cmp.coveragePct : 0;
    const matched = cmp.matchedCount != null ? cmp.matchedCount : 0;
    const total = cmp.totalCount != null ? cmp.totalCount : cmp.points.length;
    const barClass =
      pct >= 75 ? "ssc-listening-coverage--good" : pct >= 40 ? "ssc-listening-coverage--mid" : "ssc-listening-coverage--low";

    const rows = cmp.points
      .map((pt) => {
        const label = pickLang(pt, "labelEn", "labelZh") || pt.labelEn || pt.labelZh || "";
        const cls = pt.matched ? "ssc-listening-kp--matched" : "ssc-listening-kp--missed";
        const icon = pt.matched ? "✓" : "○";
        const status = pt.matched
          ? t("self_study_listening_kp_matched")
          : t("self_study_listening_kp_missed");
        return `<li class="ssc-listening-kp ${cls}"><span class="ssc-listening-kp__icon" aria-hidden="true">${icon}</span><span class="ssc-listening-kp__label">${escapeHtml(label)}</span><span class="ssc-listening-kp__status">${escapeHtml(status)}</span></li>`;
      })
      .join("");

    return `
      <section class="ssc-listening-compare-summary" aria-labelledby="ssc-listening-coverage-title">
        <h3 id="ssc-listening-coverage-title">${t("self_study_listening_coverage_title")}</h3>
        <p class="ssc-listening-coverage__meta">${t("self_study_listening_coverage_meta", { matched: String(matched), total: String(total), pct: String(pct) })}</p>
        <div class="ssc-listening-coverage__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${t("self_study_listening_coverage_title")}">
          <div class="ssc-listening-coverage__bar ${barClass}" style="width:${pct}%"></div>
        </div>
        <h4 class="ssc-listening-kp-heading">${t("self_study_listening_key_points")}</h4>
        <ul class="ssc-listening-kp-list">${rows}</ul>
      </section>
    `;
  }

  async function renderCoachPanel(root) {
    let data;
    try {
      data = await loadToday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    let coach = state.coach;
    if (!coach) {
      try {
        const res = await SERVER().getListeningCoach(data.itemId);
        coach = res.coach;
        state.coach = coach;
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-hint">${escapeHtml(e.message)}</p>`;
        return;
      }
    }

    const exemplar = pickLang(coach, "exemplarNotesEn", "exemplarNotesZh");
    const tips = isZh() ? coach.coachingTipsZh || coach.coachingTipsEn : coach.coachingTipsEn || coach.coachingTipsZh;
    const tipsHtml = (tips || [])
      .map((tip) => `<li>${escapeHtml(tip)}</li>`)
      .join("");

    const selfNotes = (data.progress && data.progress.selfNotes) || "";

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${t("self_study_listening_coach_title")}</h2>
        <p>${t("self_study_listening_coach_hint")}</p>
      </div>
      ${renderComparisonHtml(coach)}
      <div class="ssc-listening-coach-grid">
        <section class="ssc-listening-coach-col">
          <h3>${t("self_study_listening_your_notes")}</h3>
          <pre class="ssc-script-block ssc-script-block--compact">${escapeHtml(selfNotes || t("self_study_listening_no_notes"))}</pre>
        </section>
        <section class="ssc-listening-coach-col">
          <h3>${t("self_study_listening_exemplar_notes")}</h3>
          <pre class="ssc-script-block ssc-script-block--compact">${escapeHtml(exemplar)}</pre>
        </section>
      </div>
      ${tipsHtml ? `<h3 class="ssc-listening-tips-heading">${t("self_study_listening_coaching_tips")}</h3><ul class="ssc-listening-tips">${tipsHtml}</ul>` : ""}
    `;
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_listening");
    if (levelEl) levelEl.hidden = true;

    let overview;
    try {
      overview = await SERVER().getListeningOverview();
    } catch (_) {
      return false;
    }

    state.today = null;
    state.coach = null;
    state.lastScoring = null;
    state.activeTab = "listen";

    const pt = overview.schedule && overview.schedule.partType;
    const day = overview.schedule && overview.schedule.dayNumber;

    shell.innerHTML = `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${escapeHtml(partLabel(pt))}${day ? ` · ${t("self_study_reading_day_label", { day: String(day) })}` : ""}</span>
      </div>
      <nav class="ssc-tabs" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" role="tab" data-tab="listen" aria-selected="true">${t("self_study_listening_tab_listen")}</button>
        <button type="button" class="ssc-tab" role="tab" data-tab="practice" aria-selected="false">${t("self_study_tab_practice")}</button>
        <button type="button" class="ssc-tab" role="tab" data-tab="coach" aria-selected="false">${t("self_study_listening_tab_coach")}</button>
      </nav>
      <div id="ssc-panel-listen" class="ssc-tab-panel" data-panel="listen" role="tabpanel"></div>
      <div id="ssc-panel-practice" class="ssc-tab-panel" data-panel="practice" role="tabpanel" hidden></div>
      <div id="ssc-panel-coach" class="ssc-tab-panel" data-panel="coach" role="tabpanel" hidden></div>
    `;

    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showTab(tab);
        if (tab === "listen") void renderListenPanel(document.getElementById("ssc-panel-listen"));
        if (tab === "practice") void renderPracticePanel(document.getElementById("ssc-panel-practice"));
        if (tab === "coach") void renderCoachPanel(document.getElementById("ssc-panel-coach"));
      });
    });

    await renderListenPanel(document.getElementById("ssc-panel-listen"));
    return true;
  }

  global.EAP_LISTENING_UI = { init };
})();
