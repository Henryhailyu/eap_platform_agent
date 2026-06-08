/**
 * SS-Sp1–Sp4 — speaking: P1/P2/P3, mock, TTS/record/ASR/SOE when server keys on.
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

  function getItems(detail) {
    if (!detail?.session) return [];
    if (detail.session.items?.length) return detail.session.items;
    const c = detail.session.content || {};
    if (detail.session.partType === "P2" && c.cueCard) return [c.cueCard];
    if (detail.session.partType === "MOCK" && c.steps) return c.steps;
    return c.questions || [];
  }

  function isCueItem(item) {
    return item?.partType === "P2" || !!(item?.bulletsEn || item?.bulletsZh);
  }

  function partBadge(partType) {
    const map = {
      P1: "self_study_speaking_part1_badge",
      P2: "self_study_speaking_part2_badge",
      P3: "self_study_speaking_part3_badge",
      MOCK: "self_study_speaking_mock_badge",
    };
    return t(map[partType] || "self_study_speaking_part1_badge");
  }

  function itemPartType(item, sessionPartType) {
    return item?.partType || sessionPartType || "P1";
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
    phase: null,
    prepNotes: "",
  };

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function resetPhase() {
    state.phase = null;
    state.prepNotes = "";
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
    resetPhase();
    return state.sessionDetail;
  }

  function sessionProgress(detail) {
    const items = getItems(detail);
    const done = (detail.responses || []).length;
    return items.length ? Math.round((done / items.length) * 100) : 0;
  }

  function promptAudioHtml(item) {
    const a = item?.promptAudio;
    if (!a?.url) {
      const st = state.sessionDetail?.audioStatus || {};
      const msg = st.tts
        ? t("self_study_speaking_tts_generating")
        : t("self_study_speaking_tts_off");
      return `<p class="ssc-disclaimer">${escapeHtml(msg)}</p>`;
    }
    return `<div class="ssc-audio-player"><p class="ssc-audio-player__label">${t("self_study_speaking_play_question")}</p><audio controls preload="metadata" src="${escapeHtml(a.url)}" class="ssc-audio-player__el"></audio></div>`;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function renderCueCardHtml(item) {
    const bullets = isZh() ? item.bulletsZh || item.bulletsEn : item.bulletsEn || item.bulletsZh;
    const list = (bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    return `
      <div class="ssc-speaking-cue-card">
        <p class="ssc-speaking-cue-card__label">${t("self_study_speaking_cue_card")}</p>
        <h3>${escapeHtml(pickLang(item, "topicEn", "topicZh"))}</h3>
        <p class="ssc-speaking-cue-card__hint">${t("self_study_speaking_cue_hint")}</p>
        <ul class="ssc-speaking-cue-card__bullets">${list}</ul>
      </div>
    `;
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
        <span class="ssc-vocab-channel__sched">${t("self_study_speaking_hub_badge")}</span>
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
              `<li><button type="button" class="ssc-vocab-pack-btn" data-session="${s.id}">
                <span class="ssc-speaking-pack-badge">${partBadge(s.partType)}</span>
                ${escapeHtml(s.title)} · ${s.questionCount} ${t("self_study_speaking_items_short")}
              </button></li>`,
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

  async function renderHistory(root) {
    let data;
    try {
      data = await SERVER().getSpeakingHistory();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const trend = data.bandTrend || {};
    const entries = data.entries || [];

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${t("self_study_speaking_history_title")}</h2>
        ${trend.recentAverage != null
          ? `<p>${t("self_study_speaking_band_trend", { band: String(trend.recentAverage), n: String(trend.sampleSize || 0) })}</p>`
          : `<p class="ssc-vocab-hint">${t("self_study_speaking_history_empty")}</p>`}
      </div>
      ${entries.length
        ? `<ul class="ssc-speaking-history">
        ${entries
          .map(
            (e) =>
              `<li class="ssc-speaking-history__item">
                <span class="ssc-speaking-pack-badge">${partBadge(e.partType)}</span>
                <strong>${escapeHtml(e.sessionTitle)}</strong>
                <span>${escapeHtml(e.questionId)}</span>
                <span>${t("self_study_writing_band")} ${escapeHtml(String(e.overallBandEstimate ?? "—"))}</span>
                <time>${escapeHtml((e.submittedAt || "").slice(0, 10))}</time>
              </li>`,
          )
          .join("")}
      </ul>`
        : ""}
    `;
    updateHeader(0, t("self_study_speaking_history_status"));
  }

  async function openSession(sessionId) {
    clearTimer();
    state.sessionId = sessionId;
    state.sessionDetail = null;
    state.questionIndex = 0;
    state.lastFeedback = null;
    resetPhase();
    showPanel("ssc-speaking-practice");
    await renderPractice(document.getElementById("ssc-speaking-practice"));
  }

  function bindBackToHub(root) {
    root.querySelector("#ssc-back-sessions")?.addEventListener("click", () => {
      clearTimer();
      resetPhase();
      showPanel("ssc-speaking-hub");
      void renderHub(document.getElementById("ssc-speaking-hub"));
    });
  }

  function startCountdown(root, limit, onExpire, timerLabelKey) {
    const timerEl = root.querySelector("#ssc-timer-val");
    const labelEl = root.querySelector("#ssc-timer-label");
    if (labelEl && timerLabelKey) labelEl.textContent = t(timerLabelKey);

    state.secondsLeft = limit;
    state.startedAt = Date.now();
    if (timerEl) timerEl.textContent = String(limit);
    clearTimer();
    state.timerId = setInterval(() => {
      state.secondsLeft -= 1;
      if (timerEl) timerEl.textContent = String(Math.max(0, state.secondsLeft));
      if (state.secondsLeft <= 0) {
        clearTimer();
        onExpire();
      }
    }, 1000);
  }

  function bindResponseForm(root, item, detail, idx, items) {
    const limit = item.timeLimitSec || 60;
    const minW = item.minWords || 30;
    const ta = root.querySelector("#ssc-speaking-response");
    const wcEl = root.querySelector("#ssc-sp-wc");
    const submitBtn = root.querySelector("#ssc-submit-response");
    const recStatus = root.querySelector("#ssc-rec-status");
    let running = false;
    let mediaRecorder = null;
    let mediaStream = null;
    let recordChunks = [];
    let recordedBlob = null;

    function refreshWc() {
      if (wcEl) wcEl.textContent = String(countWords(ta?.value || ""));
    }
    ta?.addEventListener("input", refreshWc);

    function stopMedia() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch (_) {
          /* ignore */
        }
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((tr) => tr.stop());
        mediaStream = null;
      }
    }

    async function finishResponse(timedOut) {
      clearTimer();
      stopMedia();
      const text = ta?.value?.trim() || "";
      const elapsed = state.startedAt ? Math.min(limit, limit - state.secondsLeft) : 0;
      if (text.length < 5 && !recordedBlob) {
        alert(t("self_study_speaking_response_short"));
        return;
      }
      try {
        const body = {
          sessionId: state.sessionId,
          questionId: item.id,
          responseText: text,
          timedOut: !!timedOut,
          elapsedSec: elapsed,
        };
        if (recordedBlob) {
          body.audioBase64 = await blobToBase64(recordedBlob);
          body.audioFormat = recordedBlob.type.includes("webm") ? "webm" : "mp3";
        }
        const res = await SERVER().submitSpeakingResponse(body);
        if (res.transcript && ta && !text) {
          ta.value = res.transcript;
        }
        state.lastFeedback = res.feedback;
        state.sessionDetail = null;
        resetPhase();
        renderFeedback(root, item, res.feedback, items.length, idx);
      } catch (e) {
        alert(e.message);
      }
    }

    root.querySelector("#ssc-start-record")?.addEventListener("click", async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert(t("self_study_speaking_mic_unavailable"));
        return;
      }
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        recordChunks = [];
        recordedBlob = null;
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data?.size) recordChunks.push(ev.data);
        };
        mediaRecorder.onstop = () => {
          if (recordChunks.length) {
            recordedBlob = new Blob(recordChunks, { type: mime });
            if (recStatus) recStatus.textContent = t("self_study_speaking_record_saved");
          }
        };
        mediaRecorder.start();
        if (recStatus) recStatus.textContent = t("self_study_speaking_recording");
        if (submitBtn) submitBtn.disabled = false;
      } catch (e) {
        alert(e.message || t("self_study_speaking_mic_denied"));
      }
    });

    root.querySelector("#ssc-stop-record")?.addEventListener("click", () => {
      stopMedia();
      if (recStatus && !recordedBlob) recStatus.textContent = t("self_study_speaking_record_stopped");
    });

    root.querySelector("#ssc-start-timer")?.addEventListener("click", () => {
      if (running) return;
      running = true;
      if (submitBtn) submitBtn.disabled = false;
      ta?.focus();
      void root.querySelector("#ssc-start-record")?.click();
      startCountdown(root, limit, () => void finishResponse(true), "self_study_speaking_time_left");
    });

    submitBtn?.addEventListener("click", () => void finishResponse(false));
  }

  function renderP2Prep(root, item, detail, idx, items) {
    const prepLimit = item.prepTimeSec || 60;
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-sessions">← ${t("self_study_speaking_all_sessions")}</button>
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(detail.session.title)}</h2>
        <p>${escapeHtml(lesson)}</p>
        <p class="ssc-speaking-progress">${t("self_study_vocab_practice_progress", { current: String(idx + 1), total: String(items.length) })}</p>
      </div>
      ${renderCueCardHtml(item)}
      <div class="ssc-speaking-timer ssc-speaking-timer--prep" aria-live="polite">
        <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_prep_time_left")}</span>
        <span class="ssc-speaking-timer__value" id="ssc-timer-val">${prepLimit}</span>s
      </div>
      <label for="ssc-prep-notes" class="ssc-listening-notes__label">${t("self_study_speaking_prep_notes")}</label>
      <textarea id="ssc-prep-notes" class="ssc-listening-notes__input" rows="4" maxlength="5000" placeholder="${t("self_study_speaking_prep_placeholder")}"></textarea>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-start-prep">${t("self_study_speaking_start_prep")}</button>
        <button type="button" class="btn-secondary" id="ssc-skip-prep">${t("self_study_speaking_skip_prep")}</button>
      </div>
    `;

    updateHeader(sessionProgress(detail), t("self_study_module_in_progress", { pct: String(sessionProgress(detail)) }));
    bindBackToHub(root);

    const goSpeak = () => {
      const notes = root.querySelector("#ssc-prep-notes");
      state.prepNotes = notes?.value?.trim() || "";
      state.phase = "speak";
      clearTimer();
      void renderPractice(root);
    };

    root.querySelector("#ssc-start-prep")?.addEventListener("click", () => {
      startCountdown(root, prepLimit, goSpeak, "self_study_speaking_prep_time_left");
    });
    root.querySelector("#ssc-skip-prep")?.addEventListener("click", goSpeak);
  }

  function renderP2Speak(root, item, detail, idx, items) {
    const limit = item.timeLimitSec || 120;
    const minW = item.minWords || 80;
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");
    const notesBlock = state.prepNotes
      ? `<div class="ssc-speaking-prep-recap"><strong>${t("self_study_speaking_your_prep_notes")}</strong><p>${escapeHtml(state.prepNotes)}</p></div>`
      : "";

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-sessions">← ${t("self_study_speaking_all_sessions")}</button>
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(detail.session.title)}</h2>
        <p>${escapeHtml(lesson)}</p>
        <p class="ssc-speaking-progress">${t("self_study_vocab_practice_progress", { current: String(idx + 1), total: String(items.length) })}</p>
      </div>
      ${renderCueCardHtml(item)}
      ${notesBlock}
      ${promptAudioHtml(item)}
      <div class="ssc-speaking-timer" aria-live="polite">
        <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_time_left")}</span>
        <span class="ssc-speaking-timer__value" id="ssc-timer-val">${limit}</span>s
      </div>
      <label for="ssc-speaking-response" class="ssc-listening-notes__label">${t("self_study_speaking_your_response")}</label>
      <textarea id="ssc-speaking-response" class="ssc-listening-notes__input" rows="6" maxlength="20000" placeholder="${t("self_study_speaking_response_placeholder")}"></textarea>
      <p class="ssc-writing-wordcount"><span id="ssc-sp-wc">0</span> / ${minW} ${t("self_study_writing_words")}</p>
      <div class="ssc-speaking-record">
        <button type="button" class="btn-secondary" id="ssc-start-record">${t("self_study_speaking_start_record")}</button>
        <button type="button" class="btn-secondary" id="ssc-stop-record">${t("self_study_speaking_stop_record")}</button>
        <span id="ssc-rec-status" class="ssc-vocab-hint"></span>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-start-timer">${t("self_study_speaking_start_long_turn")}</button>
        <button type="button" class="btn-secondary" id="ssc-submit-response" disabled>${t("self_study_speaking_submit")}</button>
      </div>
    `;

    updateHeader(sessionProgress(detail), t("self_study_module_in_progress", { pct: String(sessionProgress(detail)) }));
    bindBackToHub(root);
    bindResponseForm(root, item, detail, idx, items);
  }

  function renderQuestionTurn(root, item, detail, idx, items) {
    const pt = itemPartType(item, detail.session.partType);
    const limit = item.timeLimitSec || (pt === "P3" ? 90 : 60);
    const minW = item.minWords || (pt === "P3" ? 40 : 30);
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");
    const startKey = pt === "P3" ? "self_study_speaking_start_p3_timer" : "self_study_speaking_start_timer";

    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-sessions">← ${t("self_study_speaking_all_sessions")}</button>
      <div class="ssc-lesson-card">
        <h2>${escapeHtml(detail.session.title)}</h2>
        <p>${escapeHtml(lesson)}</p>
        <p class="ssc-speaking-progress">
          <span class="ssc-speaking-pack-badge">${partBadge(pt)}</span>
          ${t("self_study_vocab_practice_progress", { current: String(idx + 1), total: String(items.length) })}
        </p>
      </div>
      <div class="ssc-speaking-question-card">
        <p class="ssc-speaking-examiner">${t("self_study_speaking_examiner")}</p>
        <h3>${escapeHtml(pickLang(item, "promptEn", "promptZh"))}</h3>
        ${promptAudioHtml(item)}
      </div>
      <div class="ssc-speaking-timer" aria-live="polite">
        <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_time_left")}</span>
        <span class="ssc-speaking-timer__value" id="ssc-timer-val">${limit}</span>s
      </div>
      <label for="ssc-speaking-response" class="ssc-listening-notes__label">${t("self_study_speaking_your_response")}</label>
      <textarea id="ssc-speaking-response" class="ssc-listening-notes__input" rows="5" maxlength="20000" placeholder="${t("self_study_speaking_response_placeholder")}"></textarea>
      <p class="ssc-writing-wordcount"><span id="ssc-sp-wc">0</span> / ${minW} ${t("self_study_writing_words")}</p>
      <div class="ssc-speaking-record">
        <button type="button" class="btn-secondary" id="ssc-start-record">${t("self_study_speaking_start_record")}</button>
        <button type="button" class="btn-secondary" id="ssc-stop-record">${t("self_study_speaking_stop_record")}</button>
        <span id="ssc-rec-status" class="ssc-vocab-hint"></span>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-start-timer">${t(startKey, { sec: String(limit) })}</button>
        <button type="button" class="btn-secondary" id="ssc-submit-response" disabled>${t("self_study_speaking_submit")}</button>
      </div>
    `;

    updateHeader(sessionProgress(detail), t("self_study_module_in_progress", { pct: String(sessionProgress(detail)) }));
    bindBackToHub(root);
    bindResponseForm(root, item, detail, idx, items);
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

    const items = getItems(detail);
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");
    const idx = state.questionIndex;
    const item = items[idx];

    if (!item) {
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

    const answered = (detail.responses || []).find((r) => r.questionId === item.id);

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
        resetPhase();
        void renderPractice(root);
      });
      return;
    }

    if (state.lastFeedback) {
      renderFeedback(root, item, state.lastFeedback, items.length, idx);
      return;
    }

    if (isCueItem(item)) {
      if (state.phase === "speak") {
        renderP2Speak(root, item, detail, idx, items);
      } else {
        renderP2Prep(root, item, detail, idx, items);
      }
      return;
    }

    renderQuestionTurn(root, item, detail, idx, items);
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
      resetPhase();
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
    resetPhase();

    shell.innerHTML = `
      <nav class="ssc-tabs" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" data-tab="hub" aria-selected="true">${t("self_study_speaking_tab_sessions")}</button>
        <button type="button" class="ssc-tab" data-tab="practice" aria-selected="false">${t("self_study_speaking_tab_practice")}</button>
        <button type="button" class="ssc-tab" data-tab="history" aria-selected="false">${t("self_study_speaking_tab_history")}</button>
      </nav>
      <div id="ssc-speaking-hub" class="ssc-speaking-panel ssc-tab-panel" data-panel="hub"></div>
      <div id="ssc-speaking-practice" class="ssc-speaking-panel ssc-tab-panel" data-panel="practice" hidden></div>
      <div id="ssc-speaking-history" class="ssc-speaking-panel ssc-tab-panel" data-panel="history" hidden></div>
    `;

    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (tab === "hub") {
          clearTimer();
          resetPhase();
          showPanel("ssc-speaking-hub");
          void renderHub(document.getElementById("ssc-speaking-hub"));
        } else if (tab === "practice" && state.sessionId) {
          showPanel("ssc-speaking-practice");
          void renderPractice(document.getElementById("ssc-speaking-practice"));
        } else if (tab === "history") {
          clearTimer();
          showPanel("ssc-speaking-history");
          void renderHistory(document.getElementById("ssc-speaking-history"));
        }
      });
    });

    await renderHub(document.getElementById("ssc-speaking-hub"));
    return true;
  }

  global.EAP_SPEAKING_UI = { init };
})();
