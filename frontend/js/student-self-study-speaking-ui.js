/**
 * SS-Sp5 — IELTS speaking: P1 / P2 / P3 chooser, exam flow, batch AI feedback.
 */
(function (global) {
  const SERVER = () => global.EAP_SELF_STUDY_SERVER;

  const TIMERS = { P1: 50, P3: 80, P2_DELAY: 15, P2_PREP: 60, P2_SPEAK: 120 };

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
    overview: null,
    sessionId: null,
    sessionDetail: null,
    questionIndex: 0,
    phase: "hub",
    batchResults: null,
    prepNotes: "",
    timerId: null,
    secondsLeft: 0,
    mediaRecorder: null,
    mediaStream: null,
    recordChunks: [],
    recordedBlob: null,
  };

  function clearTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function stopMedia() {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      try {
        state.mediaRecorder.stop();
      } catch (_) {
        /* ignore */
      }
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((tr) => tr.stop());
      state.mediaStream = null;
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
      const match = panelId.replace("ssc-speaking-", "");
      btn.classList.toggle("ssc-tab--active", tab === match);
      btn.setAttribute("aria-selected", tab === match ? "true" : "false");
    });
  }

  function playBeep() {
    try {
      const ctx = new (global.AudioContext || global.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (_) {
      /* silent fallback */
    }
  }

  function audioFormatFromBlob(blob) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.includes("webm")) return "webm";
    if (type.includes("ogg")) return "ogg-opus";
    if (type.includes("mp4") || type.includes("m4a")) return "m4a";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    if (type.includes("wav")) return "wav";
    return "webm";
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function getItems(detail) {
    if (!detail?.session) return [];
    if (detail.session.items?.length) return detail.session.items;
    const c = detail.session.content || {};
    if (detail.session.partType === "P2" && c.cueCard) return [c.cueCard];
    return c.questions || [];
  }

  function isCueItem(item) {
    return !!(item?.bulletsEn || item?.bulletsZh || item?.topicEn);
  }

  function partBadge(partType) {
    const map = {
      P1: "self_study_speaking_part1_badge",
      P2: "self_study_speaking_part2_badge",
      P3: "self_study_speaking_part3_badge",
    };
    return t(map[partType] || "self_study_speaking_part1_badge");
  }

  function renderLoading(root, titleKey) {
    root.innerHTML = `
      <div class="ssc-listening-loading" role="status" aria-live="polite" aria-busy="true">
        <div class="ssc-listening-loading__spinner" aria-hidden="true"></div>
        <h2 class="ssc-listening-loading__title">${t(titleKey || "self_study_speaking_loading_title")}</h2>
        <p class="ssc-listening-loading__body">${t("self_study_speaking_loading_body")}</p>
        <p class="ssc-listening-loading__eta">${t("self_study_speaking_loading_eta")}</p>
        <p class="ssc-listening-loading__patience">${t("self_study_listening_loading_patience")}</p>
      </div>
    `;
    updateHeader(0, t("self_study_speaking_loading_short"));
  }

  function renderCueCardHtml(item) {
    const bullets = isZh() ? item.bulletsZh || item.bulletsEn : item.bulletsEn || item.bulletsZh;
    const list = (bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    return `
      <div class="ssc-speaking-cue-card">
        <p class="ssc-speaking-cue-card__label">${t("self_study_speaking_cue_card")}</p>
        <h3>${escapeHtml(pickLang(item, "topicEn", "topicZh"))}</h3>
        <ul class="ssc-speaking-cue-card__bullets">${list}</ul>
      </div>
    `;
  }

  function promptPlayerHtml(item, audioId) {
    const a = item?.promptAudio;
    if (a?.url) {
      return `<audio id="${audioId}" preload="auto" src="${escapeHtml(a.url)}" hidden></audio>`;
    }
    return "";
  }

  function micAccessError() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return t("self_study_speaking_mic_unavailable");
    }
    if (!global.isSecureContext) {
      return t("self_study_speaking_https_required");
    }
    return null;
  }

  async function warmUpMicrophone() {
    const blocked = micAccessError();
    if (blocked) {
      state.micWarmError = blocked;
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      state.micWarmError = null;
      return true;
    } catch (e) {
      state.micWarmError = e.message || t("self_study_speaking_mic_denied");
      return false;
    }
  }

  function pickRecorderMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
  }

  function speakPromptText(text) {
    return new Promise((resolve) => {
      if (!text || !global.speechSynthesis) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 0.92;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(u);
    });
  }

  async function playPrompt(item, audioId) {
    const el = document.getElementById(audioId);
    if (el && el.tagName === "AUDIO") {
      return new Promise((resolve) => {
        el.onended = () => resolve();
        el.onerror = () => resolve();
        void el.play().catch(() => resolve());
      });
    }
    const text = pickLang(item, "promptEn", "promptZh");
    await speakPromptText(text);
  }

  function startCountdown(root, limit, labelKey, onExpire) {
    const timerEl = root.querySelector("#ssc-timer-val");
    const labelEl = root.querySelector("#ssc-timer-label");
    if (labelEl && labelKey) labelEl.textContent = t(labelKey);
    state.secondsLeft = limit;
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

  async function startRecording() {
    stopMedia();
    state.recordChunks = [];
    state.recordedBlob = null;
    state.recordStopPromise = null;
    const blocked = micAccessError();
    if (blocked) {
      throw new Error(blocked);
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error(t("self_study_speaking_mic_unavailable"));
    }
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mime = pickRecorderMime();
    try {
      state.mediaRecorder = mime
        ? new MediaRecorder(state.mediaStream, { mimeType: mime })
        : new MediaRecorder(state.mediaStream);
    } catch (_) {
      state.mediaRecorder = new MediaRecorder(state.mediaStream);
    }
    const blobType = state.mediaRecorder.mimeType || mime || "audio/webm";
    state.recordStopPromise = new Promise((resolve) => {
      state.mediaRecorder.onstop = () => {
        if (state.recordChunks.length) {
          state.recordedBlob = new Blob(state.recordChunks, { type: blobType });
        }
        resolve();
      };
    });
    state.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data?.size) state.recordChunks.push(ev.data);
    };
    state.mediaRecorder.start(250);
  }

  function showMicError(root, message) {
    let box = root.querySelector("#ssc-mic-error");
    if (!box) {
      root.insertAdjacentHTML(
        "beforeend",
        `<div id="ssc-mic-error" class="ssc-vocab-error" role="alert"></div>`,
      );
      box = root.querySelector("#ssc-mic-error");
    }
    if (box) {
      box.hidden = false;
      box.innerHTML = `
        <p>${escapeHtml(message)}</p>
        <button type="button" class="btn-secondary" id="ssc-mic-retry">${t("self_study_speaking_mic_retry")}</button>
      `;
    }
  }

  async function beginAnswerWindow(root, limit, onExpire) {
    const block = root.querySelector("#ssc-rec-block");
    const statusEl = root.querySelector("#ssc-rec-status");
    const playBtn = root.querySelector("#ssc-play-question");
    const errBox = root.querySelector("#ssc-mic-error");
    if (errBox) errBox.hidden = true;
    if (playBtn) playBtn.disabled = true;
    if (statusEl) statusEl.textContent = t("self_study_speaking_mic_requesting");
    if (block) block.hidden = false;

    playBeep();

    try {
      await startRecording();
    } catch (e) {
      if (block) block.hidden = true;
      if (playBtn) playBtn.disabled = false;
      showMicError(root, e.message || t("self_study_speaking_mic_denied"));
      root.querySelector("#ssc-mic-retry")?.addEventListener("click", async () => {
        const warmed = await warmUpMicrophone();
        if (!warmed && state.micWarmError) {
          showMicError(root, state.micWarmError);
          return;
        }
        await beginAnswerWindow(root, limit, onExpire);
      });
      return;
    }

    if (statusEl) statusEl.textContent = t("self_study_speaking_recording");
    startCountdown(root, limit, "self_study_speaking_time_left", onExpire);
  }

  async function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      try {
        if (typeof state.mediaRecorder.requestData === "function") {
          state.mediaRecorder.requestData();
        }
        state.mediaRecorder.stop();
      } catch (_) {
        /* ignore */
      }
      if (state.recordStopPromise) {
        await Promise.race([
          state.recordStopPromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((tr) => tr.stop());
      state.mediaStream = null;
    }
    state.mediaRecorder = null;
    state.recordStopPromise = null;
  }

  async function submitResponse(item, timedOut, limit) {
    await stopRecording();
    const elapsed = Math.max(0, limit - state.secondsLeft);
    const body = {
      sessionId: state.sessionId,
      questionId: item.id,
      responseText: "",
      timedOut: !!timedOut,
      elapsedSec: elapsed,
    };
    if (state.recordedBlob && state.recordedBlob.size > 400) {
      body.audioBase64 = await blobToBase64(state.recordedBlob);
      body.audioFormat = audioFormatFromBlob(state.recordedBlob);
    } else if (!state.recordedBlob || state.recordedBlob.size <= 400) {
      throw new Error(t("self_study_speaking_recording_empty"));
    }
    return SERVER().submitSpeakingResponse(body);
  }

  async function finishBatch(root) {
    if (!state.sessionId) return;
    state.phase = "analysing";
    showPanel("ssc-speaking-practice");
    renderLoading(root, "self_study_speaking_analysing_title");
    try {
      const res = await SERVER().completeSpeakingSession({ sessionId: state.sessionId });
      state.batchResults = res.results || [];
      state.phase = "results";
      renderBatchResults(root, res);
      updateHeader(100, t("self_study_speaking_complete_short"));
    } catch (e) {
      state.phase = "analysing";
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_speaking_analysing_title")}</h2>
          <p class="ssc-vocab-error" role="alert">${escapeHtml(e.message || t("self_study_ai_error"))}</p>
          <div class="ssc-placement-actions">
            <button type="button" class="btn-primary" id="ssc-analyse-retry">${t("self_study_speaking_analyse_retry")}</button>
            <button type="button" class="btn-secondary" id="ssc-back-parts">${t("self_study_speaking_back_hub")}</button>
          </div>
        </div>
      `;
      document.getElementById("ssc-analyse-retry")?.addEventListener("click", () => {
        void finishBatch(root);
      });
      document.getElementById("ssc-back-parts")?.addEventListener("click", backToHub);
    }
  }

  function renderAnswerSaved(root, current, total, onDone) {
    state.phase = "exam";
    showPanel("ssc-speaking-practice");
    root.innerHTML = `
      <div class="ssc-listening-loading" role="status" aria-live="polite">
        <div class="ssc-listening-loading__spinner" aria-hidden="true"></div>
        <h2 class="ssc-listening-loading__title">${t("self_study_speaking_answer_saved", { current: String(current), total: String(total) })}</h2>
        <p class="ssc-listening-loading__body">${t("self_study_speaking_next_question_soon")}</p>
      </div>
    `;
    updateHeader(
      Math.round((current / total) * 100),
      t("self_study_module_in_progress", { pct: String(Math.round((current / total) * 100)) }),
    );
    global.setTimeout(() => {
      if (typeof onDone === "function") onDone();
    }, 1400);
  }

  async function afterAnswerSubmitted(root, items) {
    const total = items.length;
    state.questionIndex += 1;
    if (state.questionIndex >= total) {
      await finishBatch(root);
      return;
    }
    renderAnswerSaved(root, state.questionIndex, total, () => {
      void renderPractice(root);
    });
  }

  function renderBatchResults(root, res) {
    const partType = res.partType || state.sessionDetail?.session?.partType || "P1";
    const items = (res.results || [])
      .map((row, i) => {
        const fb = row.feedback || {};
        const prompt = pickLang(row, "promptEn", "promptZh");
        const summary = pickLang(fb, "summaryEn", "summaryZh");
        const criteria = (fb.criteria || [])
          .map((c) => {
            const label = pickLang(c, "labelEn", "labelZh");
            const comment = pickLang(c, "commentEn", "commentZh");
            return comment ? `<li><strong>${escapeHtml(label)}</strong>: ${escapeHtml(comment)}</li>` : "";
          })
          .join("");
        const improvements = (isZh() ? fb.improvementsZh : fb.improvementsEn) || fb.improvementsEn || [];
        const impHtml = improvements.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
        return `
          <article class="ssc-speaking-result-card">
            <h3>${t("self_study_speaking_result_q", { n: String(i + 1) })}</h3>
            <p class="ssc-speaking-result__prompt"><strong>${t("self_study_speaking_question_label")}</strong> ${escapeHtml(prompt)}</p>
            <p class="ssc-speaking-result__transcript"><strong>${t("self_study_speaking_transcript_label")}</strong> ${escapeHtml(row.transcript || t("self_study_speaking_no_transcript"))}</p>
            ${summary ? `<p class="ssc-speaking-result__summary">${escapeHtml(summary)}</p>` : ""}
            ${fb.overallBandEstimate != null ? `<p>${t("self_study_speaking_overall_band", { band: String(fb.overallBandEstimate) })}</p>` : ""}
            ${criteria ? `<ul class="ssc-speaking-result__criteria">${criteria}</ul>` : ""}
            ${impHtml ? `<h4>${t("self_study_speaking_improve")}</h4><ul>${impHtml}</ul>` : ""}
            ${row.timedOut ? `<p class="ssc-vocab-hint">${t("self_study_speaking_timed_out")}</p>` : ""}
          </article>
        `;
      })
      .join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2>${t("self_study_speaking_feedback_title")} · ${escapeHtml(partBadge(partType))}</h2>
        <button type="button" class="btn-secondary" id="ssc-back-parts">${t("self_study_speaking_back_hub")}</button>
      </div>
      <div class="ssc-speaking-batch-results">${items}</div>
    `;
    document.getElementById("ssc-back-parts")?.addEventListener("click", () => {
      state.sessionId = null;
      state.sessionDetail = null;
      state.batchResults = null;
      state.phase = "hub";
      showPanel("ssc-speaking-hub");
      void renderHub(document.getElementById("ssc-speaking-hub"));
    });
  }

  async function runQuestionTurn(root, item, detail, idx, items) {
    const pt = detail.session.partType;
    const limit = item.timeLimitSec || (pt === "P3" ? TIMERS.P3 : TIMERS.P1);
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");
    const audioId = "ssc-prompt-audio";

    const micWarn = state.micWarmError
      ? `<p class="ssc-vocab-error" role="alert">${escapeHtml(state.micWarmError)}</p>`
      : "";
    root.innerHTML = `
      <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-parts">← ${t("self_study_speaking_back_hub")}</button>
      ${micWarn}
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
        <p class="ssc-disclaimer">${t("self_study_speaking_listen_then_answer", { sec: String(limit) })}</p>
        ${!global.isSecureContext ? `<p class="ssc-vocab-error" role="alert">${t("self_study_speaking_https_required")}</p>` : ""}
        ${promptPlayerHtml(item, audioId)}
        <button type="button" class="btn-primary" id="ssc-play-question">${t("self_study_speaking_play_question")}</button>
      </div>
      <div class="ssc-speaking-timer" id="ssc-rec-block" hidden aria-live="polite">
        <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_time_left")}</span>
        <span class="ssc-speaking-timer__value" id="ssc-timer-val">${limit}</span>s
        <p class="ssc-vocab-hint" id="ssc-rec-status">${t("self_study_speaking_recording")}</p>
      </div>
    `;

    document.getElementById("ssc-back-parts")?.addEventListener("click", backToHub);
    updateHeader(
      Math.round((idx / items.length) * 100),
      t("self_study_module_in_progress", { pct: String(Math.round((idx / items.length) * 100)) }),
    );

    document.getElementById("ssc-play-question")?.addEventListener("click", async () => {
      await playPrompt(item, audioId);
      await beginAnswerWindow(root, limit, async () => {
        const statusEl = root.querySelector("#ssc-rec-status");
        if (statusEl) statusEl.textContent = t("self_study_speaking_submitting");
        try {
          await submitResponse(item, true, limit);
          await afterAnswerSubmitted(root, items);
        } catch (err) {
          alert(err.message);
          const playBtn = root.querySelector("#ssc-play-question");
          if (playBtn) playBtn.disabled = false;
        }
      });
    });
  }

  async function runP2Flow(root, item, detail) {
    const delay = item.prepDelaySec || TIMERS.P2_DELAY;
    const prep = item.prepTimeSec || TIMERS.P2_PREP;
    const speak = item.timeLimitSec || TIMERS.P2_SPEAK;
    const lesson = pickLang(detail.session.content, "lessonEn", "lessonZh");

    if (state.phase === "p2-card") {
      root.innerHTML = `
        <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-parts">← ${t("self_study_speaking_back_hub")}</button>
        <div class="ssc-lesson-card"><h2>${escapeHtml(detail.session.title)}</h2><p>${escapeHtml(lesson)}</p></div>
        ${renderCueCardHtml(item)}
        <p class="ssc-disclaimer">${t("self_study_speaking_p2_delay_hint", { sec: String(delay) })}</p>
        <div class="ssc-speaking-timer ssc-speaking-timer--prep" aria-live="polite">
          <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_p2_get_ready")}</span>
          <span class="ssc-speaking-timer__value" id="ssc-timer-val">${delay}</span>s
        </div>
      `;
      document.getElementById("ssc-back-parts")?.addEventListener("click", backToHub);
      startCountdown(root, delay, "self_study_speaking_p2_get_ready", () => {
        state.phase = "p2-prep";
        void renderPractice(root);
      });
      return;
    }

    if (state.phase === "p2-prep") {
      root.innerHTML = `
        <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-back-parts">← ${t("self_study_speaking_back_hub")}</button>
        ${renderCueCardHtml(item)}
        <div class="ssc-speaking-timer ssc-speaking-timer--prep" aria-live="polite">
          <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_prep_time_left")}</span>
          <span class="ssc-speaking-timer__value" id="ssc-timer-val">${prep}</span>s
        </div>
        <label for="ssc-prep-notes" class="ssc-listening-notes__label">${t("self_study_speaking_prep_notes")}</label>
        <textarea id="ssc-prep-notes" class="ssc-listening-notes__input" rows="4" maxlength="5000" placeholder="${t("self_study_speaking_prep_placeholder")}">${escapeHtml(state.prepNotes)}</textarea>
      `;
      document.getElementById("ssc-back-parts")?.addEventListener("click", backToHub);
      startCountdown(root, prep, "self_study_speaking_prep_time_left", () => {
        state.phase = "p2-record";
        void renderPractice(root);
      });
      return;
    }

    if (state.phase === "p2-record") {
      root.innerHTML = `
        ${renderCueCardHtml(item)}
        ${!global.isSecureContext ? `<p class="ssc-vocab-error" role="alert">${t("self_study_speaking_https_required")}</p>` : ""}
        <div class="ssc-speaking-timer" id="ssc-rec-block" aria-live="polite">
          <span class="ssc-speaking-timer__label" id="ssc-timer-label">${t("self_study_speaking_time_left")}</span>
          <span class="ssc-speaking-timer__value" id="ssc-timer-val">${speak}</span>s
          <p class="ssc-vocab-hint" id="ssc-rec-status">${t("self_study_speaking_mic_requesting")}</p>
        </div>
      `;
      await beginAnswerWindow(root, speak, async () => {
        try {
          await submitResponse(item, true, speak);
          await afterAnswerSubmitted(root, getItems(detail));
        } catch (err) {
          alert(err.message);
        }
      });
    }
  }

  function backToHub() {
    clearTimer();
    stopMedia();
    state.sessionId = null;
    state.sessionDetail = null;
    state.questionIndex = 0;
    state.phase = "hub";
    showPanel("ssc-speaking-hub");
    void renderHub(document.getElementById("ssc-speaking-hub"));
  }

  async function startPart(partType) {
    clearTimer();
    stopMedia();
    state.phase = "loading";
    state.questionIndex = 0;
    state.prepNotes = "";
    state.batchResults = null;
    showPanel("ssc-speaking-practice");
    const root = document.getElementById("ssc-speaking-practice");
    renderLoading(root, "self_study_speaking_loading_title");
    try {
      const [res] = await Promise.all([
        SERVER().startSpeakingSession({ partType }),
        warmUpMicrophone(),
      ]);
      state.sessionId = res.sessionId;
      state.sessionDetail = res;
      state.phase = partType === "P2" ? "p2-card" : "exam";
      await renderPractice(root);
    } catch (e) {
      const msg = e.message || String(e);
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(msg)}</p>
        <button type="button" class="btn-secondary" id="ssc-back-parts">${t("self_study_speaking_back_hub")}</button>`;
      document.getElementById("ssc-back-parts")?.addEventListener("click", backToHub);
    }
  }

  async function renderPractice(root) {
    if (!state.sessionId || !state.sessionDetail) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_speaking_pick_part")}</p>`;
      return;
    }
    const detail = state.sessionDetail;
    const items = getItems(detail);
    const item = items[state.questionIndex];

    if (state.phase === "results" && state.batchResults) {
      renderBatchResults(root, { partType: detail.session.partType, results: state.batchResults });
      return;
    }

    if (detail.session.partType === "P2" && item) {
      await runP2Flow(root, item, detail);
      return;
    }

    if (!item) {
      await finishBatch(root);
      return;
    }

    await runQuestionTurn(root, item, detail, state.questionIndex, items);
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

    const parts = overview.parts || {};
    const p3 = parts.P3 || {};
    const p3Locked = !p3.available;

    root.innerHTML = `
      <div class="ssc-vocab-channel" role="status">
        <span class="ssc-vocab-channel__badge">${t("self_study_channel_b")}</span>
        <span class="ssc-vocab-channel__sched">${t("self_study_speaking_hub_badge")}</span>
      </div>
      <div class="ssc-lesson-card">
        <h2>${t("self_study_speaking_chooser_title")}</h2>
        <p>${t("self_study_speaking_chooser_hint")}</p>
      </div>
      <div class="ssc-speaking-part-grid">
        <button type="button" class="ssc-speaking-part-card" data-part="P1">
          <span class="ssc-speaking-pack-badge">${t("self_study_speaking_part1_badge")}</span>
          <strong>${t("self_study_speaking_part1_title")}</strong>
          <span>${t("self_study_speaking_part1_desc", { sec: String(TIMERS.P1) })}</span>
        </button>
        <button type="button" class="ssc-speaking-part-card" data-part="P2">
          <span class="ssc-speaking-pack-badge">${t("self_study_speaking_part2_badge")}</span>
          <strong>${t("self_study_speaking_part2_title")}</strong>
          <span>${t("self_study_speaking_part2_desc")}</span>
        </button>
        <button type="button" class="ssc-speaking-part-card${p3Locked ? " ssc-speaking-part-card--locked" : ""}" data-part="P3" ${p3Locked ? "disabled" : ""}>
          <span class="ssc-speaking-pack-badge">${t("self_study_speaking_part3_badge")}</span>
          <strong>${t("self_study_speaking_part3_title")}</strong>
          <span>${p3Locked ? t("self_study_speaking_part3_locked") : t("self_study_speaking_part3_desc", { sec: String(TIMERS.P3) })}</span>
        </button>
      </div>
    `;

    updateHeader(0, t("self_study_speaking_hub_status"));
    root.querySelectorAll("[data-part]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pt = btn.getAttribute("data-part");
        if (pt) void startPart(pt);
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
    const entries = data.entries || [];
    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${t("self_study_speaking_history_title")}</h2>
        <p class="ssc-vocab-hint">${entries.length ? "" : t("self_study_speaking_history_empty")}</p>
      </div>
      ${entries.length ? `<ul class="ssc-speaking-history">${entries.map((e) => `<li class="ssc-speaking-history__item"><span class="ssc-speaking-pack-badge">${partBadge(e.partType)}</span> <strong>${escapeHtml(e.sessionTitle)}</strong> · ${escapeHtml(e.questionId)}</li>`).join("")}</ul>` : ""}
    `;
  }

  function onLangChange() {
    const root = document.getElementById("ssc-speaking-practice");
    if (state.phase === "results" && state.batchResults && root) {
      renderBatchResults(root, {
        partType: state.sessionDetail?.session?.partType || "P1",
        results: state.batchResults,
      });
      if (global.EAP_I18N) global.EAP_I18N.applyStatic();
      return;
    }
    if (state.sessionId && root && !["hub", "loading"].includes(state.phase)) {
      showPanel("ssc-speaking-practice");
      void renderPractice(root);
      if (global.EAP_I18N) global.EAP_I18N.applyStatic();
      return;
    }
    void init();
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
    state.phase = "hub";

    shell.innerHTML = `
      <nav class="ssc-tabs" role="tablist">
        <button type="button" class="ssc-tab ssc-tab--active" data-tab="hub" aria-selected="true">${t("self_study_speaking_tab_parts")}</button>
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
          backToHub();
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

  global.EAP_SPEAKING_UI = { init, onLangChange };
})(typeof window !== "undefined" ? window : globalThis);
