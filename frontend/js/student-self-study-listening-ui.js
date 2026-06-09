/**
 * SS-L3 — server-backed listening: listen (script hidden) → single-page exam → coach.
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

  const state = {
    today: null,
    selectedDay: null,
    lastScoring: null,
    coach: null,
    revealedScript: null,
    practiceRetake: false,
    phase: "listen",
  };

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function progressPct(prog, phase) {
    if (!prog) return phase === "exam" ? 40 : 0;
    if (prog.practiceDone) return 100;
    if (phase === "exam") return 65;
    if (prog.listenDone) return 40;
    return 15;
  }

  function partLabel(partType) {
    if (partType === "P3") return t("self_study_listening_part3");
    if (partType === "P4") return t("self_study_listening_part4");
    return partType || "";
  }

  function parseDayFromUrl() {
    const n = parseInt(new URLSearchParams(global.location.search).get("day") || "", 10);
    return n > 0 ? n : null;
  }

  async function loadToday() {
    if (!state.today) {
      const day = state.selectedDay || parseDayFromUrl();
      state.today = await SERVER().getListeningToday(day);
    }
    return state.today;
  }

  function channelBanner(data) {
    const day = data.dayNumber ? t("self_study_listening_day_label", { day: String(data.dayNumber) }) : "";
    return `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${escapeHtml(partLabel(data.partType))}</span>
        ${day ? `<span class="ssc-vocab-channel__sched">${escapeHtml(day)}</span>` : ""}
      </div>
    `;
  }

  function renderAudioPlayer(audio) {
    if (!audio || !audio.available) {
      return `<p class="ssc-disclaimer" role="status">${t("self_study_listening_no_audio")}</p>`;
    }
    if (audio.playlist && audio.segments && audio.segments.length) {
      const list = audio.segments
        .map(
          (seg, i) =>
            `<li><button type="button" class="ssc-audio-seg-btn" data-seg="${i}">${escapeHtml(seg.speaker || `Part ${i + 1}`)}</button></li>`,
        )
        .join("");
      return `
        <div class="ssc-audio-player" id="ssc-listening-audio-wrap">
          <p class="ssc-audio-player__label">${t("self_study_listening_audio_play")}</p>
          <audio id="ssc-listening-audio" controls preload="metadata" class="ssc-audio-player__el"></audio>
          <ol class="ssc-audio-playlist">${list}</ol>
          ${audio.truncated ? `<p class="ssc-disclaimer">${t("self_study_listening_audio_truncated")}</p>` : ""}
        </div>
      `;
    }
    if (audio.url) {
      return `
        <div class="ssc-audio-player">
          <p class="ssc-audio-player__label">${t("self_study_listening_audio_play")}</p>
          <audio controls preload="metadata" src="${escapeHtml(audio.url)}" class="ssc-audio-player__el"></audio>
          ${audio.truncated ? `<p class="ssc-disclaimer">${t("self_study_listening_audio_truncated")}</p>` : ""}
        </div>
      `;
    }
    return `<p class="ssc-disclaimer">${t("self_study_listening_audio_generating")}</p>`;
  }

  function bindPlaylistAudio(root, audio) {
    if (!audio || !audio.playlist || !audio.segments || !audio.segments.length) return;
    const el = root.querySelector("#ssc-listening-audio");
    if (!el) return;
    let idx = 0;
    const playSeg = (i) => {
      idx = i;
      const seg = audio.segments[i];
      if (!seg || !seg.url) return;
      el.src = seg.url;
      void el.play();
    };
    el.addEventListener("ended", () => {
      if (idx + 1 < audio.segments.length) playSeg(idx + 1);
    });
    root.querySelectorAll(".ssc-audio-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => playSeg(parseInt(btn.getAttribute("data-seg"), 10)));
    });
    playSeg(0);
  }

  function renderQuestionItem(q, answers) {
    const typeId = (q.typeId || "LMC").toUpperCase();
    const instruction = pickLang(q, "instructionEn", "instructionZh");
    const prompt = pickLang(q, "promptEn", "promptZh");
    const opts = isZh() ? q.optionsZh || q.optionsEn : q.optionsEn || q.optionsZh;
    const chosen = answers[q.id];

    if (typeId === "LM" && q.pairs && q.pairs.length) {
      const chosenMap = chosen && typeof chosen === "object" ? chosen : {};
      const rows = q.pairs
        .map((p) => {
          const left = p.left || "";
          const sel = chosenMap[left] || "";
          const options = (opts || [])
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}"${sel === opt ? " selected" : ""}>${escapeHtml(opt)}</option>`,
            )
            .join("");
          return `
            <div class="ssc-listening-lm-row">
              <span class="ssc-listening-lm-left">${escapeHtml(left)}</span>
              <select class="ssc-exam-select ssc-listening-lm-select" data-q="${escapeHtml(q.id)}" data-left="${escapeHtml(left)}">
                <option value="">${t("self_study_exam_choose")}</option>
                ${options}
              </select>
            </div>
          `;
        })
        .join("");
      return `
        <div class="ssc-reading-q" data-qid="${escapeHtml(q.id)}">
          <p class="ssc-reading-q__type">${escapeHtml(typeId)}</p>
          ${instruction ? `<p class="ssc-reading-q__instr">${escapeHtml(instruction)}</p>` : ""}
          <p class="ssc-reading-q__prompt">${escapeHtml(prompt)}</p>
          <div class="ssc-listening-lm">${rows}</div>
        </div>
      `;
    }

    if (["LSeC", "LNC", "LSAQ", "LSC", "LFC"].includes(typeId)) {
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
    root.querySelectorAll(".ssc-listening-lm-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const qid = sel.getAttribute("data-q");
        const left = sel.getAttribute("data-left");
        if (!answers[qid] || typeof answers[qid] !== "object") answers[qid] = {};
        answers[qid][left] = sel.value;
      });
    });
  }

  function collectAnswers(root, answers) {
    root.querySelectorAll(".ssc-reading-gap").forEach((inp) => {
      answers[inp.getAttribute("data-gap")] = inp.value;
    });
    root.querySelectorAll(".ssc-listening-lm-select").forEach((sel) => {
      const qid = sel.getAttribute("data-q");
      const left = sel.getAttribute("data-left");
      if (!answers[qid] || typeof answers[qid] !== "object") answers[qid] = {};
      answers[qid][left] = sel.value;
    });
  }

  function errorTypeLabel(code) {
    const map = {
      wrong_option: t("self_study_reading_err_wrong"),
      not_in_recording: t("self_study_listening_err_not_in_recording"),
      spelling: t("self_study_reading_err_spelling"),
      word_limit: t("self_study_reading_err_word_limit"),
      order_error: t("self_study_listening_err_order"),
      not_given_confusion: t("self_study_reading_err_ng"),
    };
    return map[code] || code || "";
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
        const status = pt.matched ? t("self_study_listening_kp_matched") : t("self_study_listening_kp_missed");
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

  function renderCoachSection(coach, selfNotes) {
    if (!coach) return "";
    const exemplar = pickLang(coach, "exemplarNotesEn", "exemplarNotesZh");
    const tips = isZh() ? coach.coachingTipsZh || coach.coachingTipsEn : coach.coachingTipsEn || coach.coachingTipsZh;
    const tipsHtml = (tips || []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join("");

    return `
      <section class="ssc-listening-coach-block" aria-labelledby="ssc-listening-coach-heading">
        <h2 id="ssc-listening-coach-heading">${t("self_study_listening_coach_title")}</h2>
        <p>${t("self_study_listening_coach_hint")}</p>
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
      </section>
    `;
  }

  function renderScriptBlock(scriptText) {
    if (!scriptText) return "";
    return `
      <details class="ssc-reading-passage-ref ssc-listening-script-reveal">
        <summary>${t("self_study_listening_show_script")}</summary>
        <pre class="ssc-script-block">${escapeHtml(scriptText)}</pre>
      </details>
    `;
  }

  function renderResults(root, data, scoring, coach) {
    if (!scoring) return;
    const scriptText = state.revealedScript || "";
    const selfNotes = (data.progress && data.progress.selfNotes) || "";
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
        <button type="button" class="btn-secondary" id="ssc-listening-redo">${t("self_study_vocab_redo")}</button>
      </div>
      ${renderScriptBlock(scriptText)}
      <ul class="ssc-reading-results">${items}</ul>
      ${renderCoachSection(coach, selfNotes)}
    `;
    document.getElementById("ssc-listening-redo")?.addEventListener("click", () => {
      state.practiceRetake = true;
      state.lastScoring = null;
      state.coach = null;
      state.phase = "exam";
      void renderMainPanel(root);
    });
  }

  async function renderListenPhase(root, data) {
    const prog = data.progress || {};
    const lesson = pickLang(data.content || {}, "lessonEn", "lessonZh");
    const savedNotes = prog.selfNotes || "";

    root.innerHTML = `
      <article class="ssc-listening-listen">
        <header class="ssc-reading-exam__head">
          <h2>${escapeHtml(data.title || t("self_study_listening_learn_title"))}</h2>
          ${lesson ? `<p class="ssc-reading-exam__tip">${escapeHtml(lesson)}</p>` : ""}
          <p class="ssc-disclaimer">${t("self_study_listening_script_hidden")}</p>
        </header>
        ${renderAudioPlayer(data.audio)}
        <label for="ssc-self-notes" class="ssc-listening-notes__label">${t("self_study_listening_notes_label")}</label>
        <textarea id="ssc-self-notes" class="ssc-listening-notes__input" rows="6" maxlength="8000" placeholder="${t("self_study_listening_notes_placeholder")}">${escapeHtml(savedNotes)}</textarea>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-secondary" id="ssc-save-notes">${t("self_study_listening_save_notes")}</button>
          <button type="button" class="btn-primary" id="ssc-start-exam">${t("self_study_listening_start_questions")}</button>
        </div>
      </article>
    `;

    bindPlaylistAudio(root, data.audio);

    document.getElementById("ssc-save-notes")?.addEventListener("click", async () => {
      const notes = document.getElementById("ssc-self-notes")?.value || "";
      try {
        await SERVER().completeListening({ itemId: data.itemId, listenDone: true, selfNotes: notes });
        state.today = null;
        root.insertAdjacentHTML("beforeend", `<p class="ssc-vocab-success" role="status">${t("self_study_listening_notes_saved")}</p>`);
      } catch (e) {
        alert(e.message);
      }
    });

    document.getElementById("ssc-start-exam")?.addEventListener("click", async () => {
      const notes = document.getElementById("ssc-self-notes")?.value || "";
      try {
        await SERVER().completeListening({ itemId: data.itemId, listenDone: true, selfNotes: notes });
        state.today = null;
        state.phase = "exam";
        await renderMainPanel(root);
      } catch (e) {
        alert(e.message);
      }
    });

    updateHeader(progressPct(prog, "listen"), t("self_study_module_in_progress", { pct: String(progressPct(prog, "listen")) }));
  }

  async function renderExamPhase(root, data) {
    const prog = data.progress || {};
    const c = data.content || {};
    const questions = c.questions || [];
    const answers = {};
    const lesson = pickLang(c, "lessonEn", "lessonZh");
    const scriptText = state.revealedScript || "";

    root.innerHTML = `
      <article class="ssc-reading-exam">
        <header class="ssc-reading-exam__head">
          <h2>${escapeHtml(data.title || t("self_study_mod_listening"))}</h2>
          ${lesson ? `<p class="ssc-reading-exam__tip">${escapeHtml(lesson)}</p>` : ""}
          <p class="ssc-reading-exam__meta">${t("self_study_listening_meta", { questions: String(questions.length) })}</p>
        </header>
        ${renderScriptBlock(scriptText)}
        <section class="ssc-reading-questions" aria-label="${t("self_study_listening_questions_label")}">
          <h3 class="ssc-reading-questions__title">${t("self_study_listening_questions_heading", { n: String(questions.length) })}</h3>
          ${questions.map((q) => renderQuestionItem(q, answers)).join("")}
        </section>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary ssc-reading-submit-btn" id="ssc-listening-submit">
            <span class="ssc-reading-submit__spinner" id="ssc-listening-submit-spinner" hidden aria-hidden="true"></span>
            <span class="ssc-reading-submit__label">${t("self_study_listening_submit")}</span>
          </button>
        </div>
      </article>
    `;

    bindQuestionInputs(root, answers);
    updateHeader(progressPct(prog, "exam"), t("self_study_module_in_progress", { pct: String(progressPct(prog, "exam")) }));

    document.getElementById("ssc-listening-submit")?.addEventListener("click", async () => {
      collectAnswers(root, answers);
      const btn = document.getElementById("ssc-listening-submit");
      const spinner = document.getElementById("ssc-listening-submit-spinner");
      if (btn) {
        btn.disabled = true;
        btn.classList.add("ssc-reading-submit-btn--loading");
        btn.setAttribute("aria-busy", "true");
      }
      if (spinner) spinner.hidden = false;
      const notes = document.getElementById("ssc-self-notes")?.value;
      try {
        const body = { itemId: data.itemId, answers };
        if (notes != null) body.selfNotes = notes;
        const res = await SERVER().completeListening(body);
        state.today = null;
        state.practiceRetake = false;
        state.lastScoring = res.scoring;
        state.coach = res.coach || null;
        state.revealedScript = isZh() ? res.scriptZh || res.scriptEn : res.scriptEn || res.scriptZh;
        state.phase = "results";
        renderResults(root, data, res.scoring, res.coach);
        updateHeader(100, t("self_study_listening_complete_short"));
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

  async function renderMainPanel(root) {
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
      if (!state.coach) {
        try {
          const coachRes = await SERVER().getListeningCoach(data.itemId);
          state.coach = coachRes.coach || null;
        } catch (_) {
          /* coach optional on revisit */
        }
      }
      const scoring =
        state.lastScoring ||
        (prog.scoreTotal != null
          ? { correct: prog.scoreCorrect || 0, total: prog.scoreTotal, results: [] }
          : null);
      if (scoring) {
        renderResults(root, data, scoring, state.coach);
        updateHeader(100, t("self_study_listening_complete_short"));
        return;
      }
    }

    if (state.phase === "listen" && !prog.listenDone && !state.practiceRetake) {
      await renderListenPhase(root, data);
      return;
    }
    await renderExamPhase(root, data);
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_listening");
    if (levelEl) levelEl.hidden = true;

    state.selectedDay = parseDayFromUrl();
    state.today = null;
    state.lastScoring = null;
    state.coach = null;
    state.revealedScript = null;
    state.practiceRetake = false;
    state.phase = "listen";

    let overview;
    try {
      overview = await SERVER().getListeningOverview();
    } catch (_) {
      return false;
    }

    const dayNum = state.selectedDay || (overview.schedule && overview.schedule.dayNumber);
    shell.innerHTML = `
      ${channelBanner({
        partType: overview.schedule && overview.schedule.partType,
        dayNumber: dayNum,
      })}
      <div id="ssc-listening-panel" class="ssc-listening-panel"></div>
    `;

    await renderMainPanel(document.getElementById("ssc-listening-panel"));
    return true;
  }

  global.EAP_LISTENING_UI = { init };
})(typeof window !== "undefined" ? window : globalThis);
