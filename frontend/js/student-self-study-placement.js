/**
 * Student AI Self-Study Centre — AI placement test (v2).
 * Channel A only — does not depend on Channel B UI modules.
 */
(function () {
  const PAGE = "student-self-study-placement";
  const SECTION_ORDER = ["vocabulary", "listening_listen", "listening", "reading", "speaking", "writing"];

  const SECTION_META = {
    vocabulary: { titleKey: "self_study_placement_part_vocab", durationKey: "self_study_placement_part_vocab_dur" },
    listening_listen: { titleKey: "self_study_placement_part_listen", durationKey: "self_study_placement_part_listen_dur" },
    listening: { titleKey: "self_study_placement_part_listen_q", durationKey: "self_study_placement_part_listen_q_dur" },
    reading: { titleKey: "self_study_placement_part_reading", durationKey: "self_study_placement_part_reading_dur" },
    speaking: { titleKey: "self_study_placement_part_speaking", durationKey: "self_study_placement_part_speaking_dur" },
    writing: { titleKey: "self_study_placement_part_writing", durationKey: "self_study_placement_part_writing_dur" },
  };

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isZh() {
    const lang = window.EAP_LANG || document.documentElement.lang || "en";
    return String(lang).toLowerCase().startsWith("zh");
  }

  function pickLang(en, zh) {
    return isZh() ? zh || en : en || zh;
  }

  const state = {
    screen: "intro",
    section: null,
    qIndex: 0,
    exam: null,
    answers: {},
    listeningNotes: "",
    listeningPlays: 0,
    speaking: {},
    writingText: "",
    writingDeadline: null,
    writingTimerId: null,
    speakingTimerId: null,
    mediaStream: null,
    mediaRecorder: null,
    recordChunks: [],
    recordedBlob: null,
    recordStopPromise: null,
    result: null,
    error: null,
    listeningAudioEnded: false,
    listeningAudioRefreshing: false,
    listeningAudioRefreshAttempted: false,
  };

  const speechCtl = { idx: 0, playing: false, segments: [], voice: null };

  function redirectIfDisabled() {
    if (window.EAP_SELF_STUDY_ENABLED === false) {
      window.location.replace("student.html");
      return true;
    }
    return false;
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
    state.mediaRecorder = null;
  }

  function clearTimers() {
    if (state.writingTimerId) {
      clearInterval(state.writingTimerId);
      state.writingTimerId = null;
    }
    if (state.speakingTimerId) {
      clearInterval(state.speakingTimerId);
      state.speakingTimerId = null;
    }
  }

  function sectionQuestions(section) {
    const exam = state.exam;
    if (!exam) return [];
    if (section === "vocabulary") return exam.vocabulary?.questions || [];
    if (section === "listening") return exam.listening?.questions || [];
    if (section === "reading") return exam.reading?.questions || [];
    if (section === "speaking") return exam.speaking?.questions || [];
    return [];
  }

  function totalSteps() {
    if (!state.exam) return 1;
    const v = sectionQuestions("vocabulary").length;
    const l = sectionQuestions("listening").length;
    const r = sectionQuestions("reading").length;
    const s = sectionQuestions("speaking").length;
    return v + 1 + l + r + s + 1;
  }

  function currentStepIndex() {
    if (state.screen === "intro" || state.screen === "generating") return 0;
    if (state.screen === "report" || state.screen === "submitting") return totalSteps();
    let n = 0;
    if (state.section === "vocabulary") return state.qIndex;
    n += sectionQuestions("vocabulary").length;
    if (state.section === "listening_listen") return n;
    if (state.section === "listening") return n + 1 + state.qIndex;
    n += 1 + sectionQuestions("listening").length;
    if (state.section === "reading") return n + state.qIndex;
    n += sectionQuestions("reading").length;
    if (state.section === "speaking") return n + state.qIndex;
    n += sectionQuestions("speaking").length;
    if (state.section === "writing") return n;
    return n;
  }

  function progressPercent() {
    const total = totalSteps();
    if (!total) return 0;
    if (state.screen === "report") return 100;
    return Math.round((currentStepIndex() / total) * 100);
  }

  function renderProgress() {
    const fill = document.getElementById("ssc-placement-progress-fill");
    const label = document.getElementById("ssc-placement-progress-label");
    const pct = progressPercent();
    if (fill) fill.style.width = `${pct}%`;
    if (!label) return;
    if (state.screen === "intro") {
      label.textContent = t("self_study_placement_progress_intro");
    } else if (state.screen === "generating") {
      label.textContent = t("self_study_placement_generating");
    } else if (state.screen === "submitting") {
      label.textContent = t("self_study_placement_submitting");
    } else if (state.screen === "report") {
      label.textContent = t("self_study_placement_progress_done");
    } else {
      const meta = SECTION_META[state.section] || {};
      label.textContent = t("self_study_placement_progress_section", {
        section: t(meta.titleKey || "self_study_placement_page_title"),
        current: String(currentStepIndex() + 1),
        total: String(totalSteps()),
      });
    }
  }

  function renderIntro(root) {
    const parts = ["vocabulary", "listening_listen", "reading", "speaking", "writing"]
      .map((id) => {
        const meta = SECTION_META[id === "listening_listen" ? "listening_listen" : id] || SECTION_META[id];
        return `<li><strong>${t(meta.titleKey)}</strong> — ${t(meta.durationKey)}</li>`;
      })
      .join("");
    root.innerHTML = `
      <div class="ssc-banner ssc-banner--placement">
        <h2 data-i18n="self_study_placement_intro_title">${escapeHtml(t("self_study_placement_intro_title"))}</h2>
        <p class="ssc-disclaimer" data-i18n="self_study_placement_disclaimer">${escapeHtml(t("self_study_placement_disclaimer"))}</p>
        <p data-i18n="self_study_placement_intro_body">${escapeHtml(t("self_study_placement_intro_body"))}</p>
        <ul class="ssc-daily-plan__list" aria-label="Sections">${parts}</ul>
        ${state.error ? `<p class="ssc-vocab-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-placement-start">${escapeHtml(t("self_study_placement_start"))}</button>
          <a href="student-self-study.html" class="btn-secondary">${escapeHtml(t("self_study_back_hub"))}</a>
        </div>
      </div>
    `;
    document.getElementById("ssc-placement-start")?.addEventListener("click", () => void startExam());
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function renderGenerating(root) {
    root.innerHTML = `
      <div class="ssc-placement-generating" role="status" aria-live="polite">
        <div class="ssc-placement-generating__spinner" aria-hidden="true"></div>
        <h2>${escapeHtml(t("self_study_placement_generating_title"))}</h2>
        <p>${escapeHtml(t("self_study_placement_generating"))}</p>
        <p class="ssc-disclaimer">${escapeHtml(t("self_study_placement_generating_hint"))}</p>
      </div>
    `;
  }

  async function startExam() {
    const SERVER = window.EAP_SELF_STUDY_SERVER;
    if (!SERVER?.generatePlacementExam) {
      state.error = t("self_study_placement_server_error");
      render();
      return;
    }
    state.error = null;
    state.screen = "generating";
    state.exam = null;
    state.answers = {};
    state.listeningNotes = "";
    state.listeningPlays = 0;
    state.listeningAudioRefreshAttempted = false;
    state.speaking = {};
    state.writingText = "";
    state.result = null;
    render();
    try {
      const data = await SERVER.generatePlacementExam();
      state.exam = data.exam;
      state.section = "vocabulary";
      state.qIndex = 0;
      state.screen = "section";
      render();
    } catch (e) {
      state.screen = "intro";
      state.error = e.message || t("self_study_placement_generate_failed");
      render();
    }
  }

  function renderMcq(root, section) {
    const qs = sectionQuestions(section);
    const q = qs[state.qIndex];
    if (!q) {
      advanceSection();
      renderSection(root);
      return;
    }
    const meta = SECTION_META[section] || {};
    const selected = state.answers[q.id];
    const passage =
      section === "reading" && state.exam?.reading?.passage
        ? `<div class="ssc-question-card__passage ssc-placement-passage"><h4>${escapeHtml(state.exam.reading.title || "")}</h4><div class="ssc-placement-passage__body">${escapeHtml(state.exam.reading.passage)}</div></div>`
        : "";

    root.innerHTML = `
      <div class="ssc-question-card">
        <p class="ssc-placement-progress__label" style="margin:0 0 0.75rem">${escapeHtml(t(meta.titleKey))} · ${escapeHtml(t(meta.durationKey))}</p>
        ${passage}
        <h3>${escapeHtml(q.prompt)}</h3>
        <ul class="ssc-options" role="listbox" aria-label="Answer options">
          ${(q.options || [])
            .map(
              (opt, i) =>
                `<li><button type="button" class="ssc-option${selected === i ? " ssc-option--selected" : ""}" data-index="${i}">${escapeHtml(opt)}</button></li>`,
            )
            .join("")}
        </ul>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-secondary" id="ssc-placement-prev" ${state.qIndex === 0 && section === "vocabulary" ? "disabled" : ""}>${escapeHtml(t("self_study_prev"))}</button>
        <button type="button" class="btn-primary" id="ssc-placement-next" ${selected == null ? "disabled" : ""}>${escapeHtml(t("self_study_next"))}</button>
      </div>
    `;

    root.querySelectorAll(".ssc-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.answers[q.id] = parseInt(btn.getAttribute("data-index"), 10);
        render();
      });
    });
    document.getElementById("ssc-placement-prev")?.addEventListener("click", () => goPrevMcq(section));
    document.getElementById("ssc-placement-next")?.addEventListener("click", () => goNextMcq(section));
  }

  function goPrevMcq(section) {
    if (state.qIndex > 0) {
      state.qIndex -= 1;
    } else if (section === "listening") {
      state.section = "listening_listen";
      state.qIndex = 0;
    } else if (section === "reading") {
      const lqs = sectionQuestions("listening");
      state.section = "listening";
      state.qIndex = Math.max(0, lqs.length - 1);
    } else if (section === "vocabulary") {
      /* stay */
    }
    render();
  }

  function goNextMcq(section) {
    const qs = sectionQuestions(section);
    const q = qs[state.qIndex];
    if (!q || state.answers[q.id] == null) return;
    if (state.qIndex < qs.length - 1) {
      state.qIndex += 1;
    } else {
      advanceSection();
    }
    render();
  }

  function hasServerListeningAudio(audio) {
    if (!audio) return false;
    if (audio.url) return true;
    return !!(
      audio.playlist &&
      Array.isArray(audio.segments) &&
      audio.segments.some((seg) => seg && seg.url)
    );
  }

  function speechSupported() {
    return !!(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
  }

  function pickSpeechVoice(gender) {
    const voices = globalThis.speechSynthesis.getVoices();
    const g = String(gender || "female").toLowerCase();
    const preferMale = g === "male";
    const enGb = voices.filter((v) => /en-gb/i.test(v.lang || ""));
    const enAny = voices.filter((v) => /^en/i.test(v.lang || ""));
    const pool = enGb.length ? enGb : enAny.length ? enAny : voices;
    const named = pool.find((v) => {
      const n = (v.name || "").toLowerCase();
      return preferMale ? /male|daniel|james|arthur|guy/.test(n) : /female|zira|sonia|hazel|samantha/.test(n);
    });
    return named || pool[0] || null;
  }

  function stopBrowserSpeech() {
    speechCtl.playing = false;
    if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
  }

  function segmentPartLabel(index) {
    return t("self_study_listening_segment_part", { n: String(index + 1) });
  }

  function speakPlacementSegmentAt(root, index) {
    const seg = speechCtl.segments[index];
    if (!seg || !seg.text) return;
    const utter = new globalThis.SpeechSynthesisUtterance(seg.text);
    utter.lang = "en-GB";
    utter.rate = 0.92;
    if (speechCtl.voice) utter.voice = speechCtl.voice;
    utter.onend = () => {
      if (!speechCtl.playing) return;
      if (index + 1 < speechCtl.segments.length) {
        speechCtl.idx = index + 1;
        root.querySelectorAll(".ssc-audio-seg-btn").forEach((btn) => {
          btn.classList.toggle(
            "ssc-audio-seg-btn--active",
            parseInt(btn.getAttribute("data-seg"), 10) === speechCtl.idx,
          );
        });
        speakPlacementSegmentAt(root, speechCtl.idx);
      } else {
        speechCtl.playing = false;
        state.listeningAudioEnded = true;
        const playBtn = root.querySelector("#ssc-speech-play");
        const pauseBtn = root.querySelector("#ssc-speech-pause");
        const stopBtn = root.querySelector("#ssc-speech-stop");
        if (playBtn) playBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
      }
    };
    utter.onerror = () => {
      speechCtl.playing = false;
    };
    globalThis.speechSynthesis.speak(utter);
  }

  function browserListeningPlayerHtml(segments) {
    const limit = state.exam?.listening?.audioPlayLimit ?? 1;
    const playsLeft = Math.max(0, limit - state.listeningPlays);
    const list = segments
      .map(
        (_, i) =>
          `<li><button type="button" class="ssc-audio-seg-btn${i === 0 ? " ssc-audio-seg-btn--active" : ""}" data-seg="${i}" aria-label="${escapeHtml(segmentPartLabel(i))}">${escapeHtml(segmentPartLabel(i))}</button></li>`,
      )
      .join("");
    return `
      <div class="ssc-audio-player" id="ssc-placement-speech-wrap">
        <p class="ssc-audio-player__label">${escapeHtml(t("self_study_placement_listen_once", { left: String(playsLeft) }))}</p>
        <p class="ssc-audio-player__label">${escapeHtml(t("self_study_listening_browser_play"))}</p>
        <div class="ssc-listening-speech-controls">
          <button type="button" class="btn-primary" id="ssc-speech-play">${escapeHtml(t("self_study_listening_play"))}</button>
          <button type="button" class="btn-secondary" id="ssc-speech-pause" disabled>${escapeHtml(t("self_study_listening_pause"))}</button>
          <button type="button" class="btn-secondary" id="ssc-speech-stop" disabled>${escapeHtml(t("self_study_listening_stop"))}</button>
        </div>
        <p class="ssc-disclaimer ssc-listening-speech-hint">${escapeHtml(t("self_study_listening_browser_hint"))}</p>
        <p class="ssc-audio-playlist__heading">${escapeHtml(t("self_study_listening_segments_heading"))}</p>
        <ol class="ssc-audio-playlist">${list}</ol>
      </div>
    `;
  }

  function bindPlacementBrowserSpeech(root, segments) {
    if (!speechSupported() || !segments || !segments.length) return;
    speechCtl.segments = segments;
    speechCtl.idx = 0;
    speechCtl.playing = false;
    const limit = state.exam?.listening?.audioPlayLimit ?? 1;

    const refreshVoice = () => {
      speechCtl.voice = pickSpeechVoice(speechCtl.segments[speechCtl.idx]?.gender);
    };
    refreshVoice();
    if (globalThis.speechSynthesis.onvoiceschanged !== undefined) {
      globalThis.speechSynthesis.onvoiceschanged = refreshVoice;
    }
    globalThis.speechSynthesis.getVoices();

    const playBtn = root.querySelector("#ssc-speech-play");
    const pauseBtn = root.querySelector("#ssc-speech-pause");
    const stopBtn = root.querySelector("#ssc-speech-stop");

    const updatePlayLabel = () => {
      const label = root.querySelector("#ssc-placement-speech-wrap .ssc-audio-player__label");
      const playsLeft = Math.max(0, limit - state.listeningPlays);
      if (label) label.textContent = t("self_study_placement_listen_once", { left: String(playsLeft) });
    };

    playBtn?.addEventListener("click", () => {
      if (state.listeningPlays >= limit) return;
      if (speechCtl.playing && globalThis.speechSynthesis.paused) {
        globalThis.speechSynthesis.resume();
        return;
      }
      stopBrowserSpeech();
      if (state.listeningPlays >= limit) return;
      state.listeningPlays += 1;
      updatePlayLabel();
      speechCtl.playing = true;
      speechCtl.voice = pickSpeechVoice(speechCtl.segments[speechCtl.idx]?.gender);
      globalThis.speechSynthesis.getVoices();
      if (pauseBtn) pauseBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = false;
      globalThis.setTimeout(() => {
        if (speechCtl.playing) speakPlacementSegmentAt(root, speechCtl.idx);
      }, 0);
    });

    pauseBtn?.addEventListener("click", () => {
      if (globalThis.speechSynthesis.speaking && !globalThis.speechSynthesis.paused) {
        globalThis.speechSynthesis.pause();
      }
    });

    stopBtn?.addEventListener("click", () => {
      stopBrowserSpeech();
      speechCtl.idx = 0;
      if (playBtn) playBtn.disabled = state.listeningPlays >= limit;
      if (pauseBtn) pauseBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
      root.querySelectorAll(".ssc-audio-seg-btn").forEach((btn) => btn.classList.remove("ssc-audio-seg-btn--active"));
    });

    root.querySelectorAll(".ssc-audio-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.listeningPlays >= limit && !speechCtl.playing) return;
        stopBrowserSpeech();
        speechCtl.idx = parseInt(btn.getAttribute("data-seg"), 10);
        if (state.listeningPlays < limit) {
          state.listeningPlays += 1;
          updatePlayLabel();
        }
        speechCtl.playing = true;
        speechCtl.voice = pickSpeechVoice(speechCtl.segments[speechCtl.idx]?.gender);
        if (pauseBtn) pauseBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
        root.querySelectorAll(".ssc-audio-seg-btn").forEach((b) => {
          b.classList.toggle("ssc-audio-seg-btn--active", b === btn);
        });
        speakPlacementSegmentAt(root, speechCtl.idx);
      });
    });
  }

  function listeningPlayerHtml() {
    const audio = state.exam?.listening?.audio;
    const limit = state.exam?.listening?.audioPlayLimit ?? 1;
    const playsLeft = Math.max(0, limit - state.listeningPlays);
    if (hasServerListeningAudio(audio)) {
      if (audio.playlist && Array.isArray(audio.segments) && audio.segments.length) {
        const first = audio.segments.find((s) => s?.url);
        const src = first ? escapeHtml(first.url) : "";
        return `
          <div class="ssc-audio-player">
            <p class="ssc-audio-player__label">${escapeHtml(t("self_study_placement_listen_once", { left: String(playsLeft) }))}</p>
            <audio id="ssc-placement-listen-audio" class="ssc-audio-player__el" preload="auto" ${src ? `src="${src}"` : ""} controls></audio>
          </div>
        `;
      }
      if (audio.url) {
        return `
          <div class="ssc-audio-player">
            <p class="ssc-audio-player__label">${escapeHtml(t("self_study_placement_listen_once", { left: String(playsLeft) }))}</p>
            <audio id="ssc-placement-listen-audio" class="ssc-audio-player__el" preload="auto" src="${escapeHtml(audio.url)}" controls></audio>
          </div>
        `;
      }
    }
    const playbackSegments = state.exam?.listening?.playbackSegments;
    if (playbackSegments?.length && speechSupported()) {
      return browserListeningPlayerHtml(playbackSegments);
    }
    if (state.listeningAudioRefreshing) {
      return `<p class="ssc-disclaimer" role="status">${escapeHtml(t("self_study_listening_loading_short"))}</p>`;
    }
    const ttsOn = state.exam?.audioStatus?.tts;
    if (ttsOn) {
      return `<p class="ssc-disclaimer" role="status">${escapeHtml(t("self_study_listening_audio_generating"))}</p>`;
    }
    return `<p class="ssc-disclaimer">${escapeHtml(t("self_study_listening_no_audio"))}</p>`;
  }

  function bindListeningAudio(root) {
    const el = root.querySelector("#ssc-placement-listen-audio");
    if (!el) return;
    const audio = state.exam?.listening?.audio;
    const limit = state.exam?.listening?.audioPlayLimit ?? 1;
    let segIdx = 0;

    const segments = audio?.segments?.filter((s) => s?.url) || [];
    const playNext = () => {
      if (segIdx + 1 < segments.length) {
        segIdx += 1;
        el.src = segments[segIdx].url;
        void el.play().catch(() => {});
      } else {
        state.listeningAudioEnded = true;
      }
    };

    el.addEventListener("play", () => {
      if (state.listeningPlays >= limit) {
        el.pause();
        return;
      }
      if (el.currentTime < 0.5 && state.listeningPlays < limit) {
        /* count once per user-initiated play session */
      }
    });

    let counted = false;
    el.addEventListener("playing", () => {
      if (!counted && state.listeningPlays < limit) {
        counted = true;
        state.listeningPlays += 1;
        const label = root.querySelector(".ssc-audio-player__label");
        const playsLeft = Math.max(0, limit - state.listeningPlays);
        if (label) label.textContent = t("self_study_placement_listen_once", { left: String(playsLeft) });
      }
    });

    el.addEventListener("ended", () => {
      counted = false;
      if (segments.length > 1) playNext();
      else state.listeningAudioEnded = true;
    });
  }

  async function refreshPlacementListeningAudio(root) {
    if (hasServerListeningAudio(state.exam?.listening?.audio)) return;
    const playbackSegments = state.exam?.listening?.playbackSegments;
    if (playbackSegments?.length && speechSupported()) return;
    if (state.listeningAudioRefreshAttempted || state.listeningAudioRefreshing) return;

    const SERVER = window.EAP_SELF_STUDY_SERVER;
    const examId = state.exam?.examId;
    if (!SERVER?.refreshPlacementListeningAudio || !examId) return;

    state.listeningAudioRefreshAttempted = true;
    state.listeningAudioRefreshing = true;
    const notes = state.listeningNotes;
    const card = root.querySelector(".ssc-question-card");
    if (card) {
      const player = card.querySelector(".ssc-audio-player, .ssc-disclaimer");
      if (player) {
        player.outerHTML = `<p class="ssc-disclaimer" role="status">${escapeHtml(t("self_study_listening_loading_short"))}</p>`;
      }
    }

    try {
      const data = await SERVER.refreshPlacementListeningAudio(examId);
      if (data?.audio) state.exam.listening.audio = data.audio;
      if (data?.playbackSegments?.length) {
        state.exam.listening.playbackSegments = data.playbackSegments;
      }
      if (data?.audioStatus) state.exam.audioStatus = data.audioStatus;
    } catch (_) {
      /* browser fallback or static message */
    } finally {
      state.listeningAudioRefreshing = false;
      const notesAfter = state.listeningNotes;
      renderListeningListen(root);
      state.listeningNotes = notesAfter;
    }
  }

  function renderListeningListen(root) {
    const meta = SECTION_META.listening_listen;
    root.innerHTML = `
      <div class="ssc-question-card">
        <p class="ssc-placement-progress__label" style="margin:0 0 0.75rem">${escapeHtml(t(meta.titleKey))} · ${escapeHtml(t(meta.durationKey))}</p>
        <p>${escapeHtml(t("self_study_placement_listening_hint"))}</p>
        ${listeningPlayerHtml()}
        <label class="ssc-listening-notes" for="ssc-listening-notes">
          <span>${escapeHtml(t("self_study_placement_notes_label"))}</span>
          <textarea id="ssc-listening-notes" rows="6" placeholder="${escapeHtml(t("self_study_placement_notes_ph"))}">${escapeHtml(state.listeningNotes)}</textarea>
          <span class="ssc-disclaimer">${escapeHtml(t("self_study_placement_notes_disclaimer"))}</span>
        </label>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-placement-listen-start">${escapeHtml(t("self_study_placement_start_questions"))}</button>
      </div>
    `;
    root.querySelector("#ssc-listening-notes")?.addEventListener("input", (ev) => {
      state.listeningNotes = ev.target.value;
    });
    const audio = state.exam?.listening?.audio;
    const playbackSegments = state.exam?.listening?.playbackSegments;
    if (hasServerListeningAudio(audio)) {
      bindListeningAudio(root);
    } else if (playbackSegments?.length && speechSupported()) {
      bindPlacementBrowserSpeech(root, playbackSegments);
    } else {
      void refreshPlacementListeningAudio(root);
    }
    document.getElementById("ssc-placement-listen-start")?.addEventListener("click", () => {
      state.section = "listening";
      state.qIndex = 0;
      render();
    });
  }

  function micAccessError() {
    if (!navigator.mediaDevices?.getUserMedia) return t("self_study_speaking_mic_unavailable");
    if (!globalThis.isSecureContext) return t("self_study_speaking_https_required");
    return null;
  }

  function pickRecorderMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
  }

  async function startRecording() {
    stopMedia();
    state.recordChunks = [];
    state.recordedBlob = null;
    state.recordStopPromise = null;
    const blocked = micAccessError();
    if (blocked) throw new Error(blocked);
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
    return blobType;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const raw = String(reader.result || "");
        resolve(raw.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function saveSpeakingAnswer(qid, blob, format) {
    const audioBase64 = await blobToBase64(blob);
    state.speaking[qid] = { audioBase64, format: format || "webm", transcript: "" };
  }

  function renderSpeaking(root) {
    const qs = sectionQuestions("speaking");
    const q = qs[state.qIndex];
    if (!q) {
      advanceSection();
      renderSection(root);
      return;
    }
    const meta = SECTION_META.speaking;
    const answerSec = state.exam?.speaking?.answerSec || 50;
    const audioUrl = q.promptAudio?.url ? escapeHtml(q.promptAudio.url) : "";
    root.innerHTML = `
      <div class="ssc-speaking-question-card">
        <p class="ssc-placement-progress__label">${escapeHtml(t(meta.titleKey))} · ${escapeHtml(t(meta.durationKey))}</p>
        <p class="ssc-speaking-examiner">${escapeHtml(t("self_study_placement_speaking_examiner"))}</p>
        <h3>${escapeHtml(q.prompt)}</h3>
        ${audioUrl ? `<audio id="ssc-sp-prompt-audio" preload="auto" src="${audioUrl}" hidden></audio>` : ""}
        <div class="ssc-speaking-timer" id="ssc-sp-timer" hidden>
          <span class="ssc-speaking-timer__label">${escapeHtml(t("self_study_placement_answer_time"))}</span>
          <span class="ssc-speaking-timer__value" id="ssc-sp-timer-val">${answerSec}</span>
        </div>
        <div id="ssc-sp-rec-block" class="ssc-speaking-record" hidden>
          <p id="ssc-sp-rec-status">${escapeHtml(t("self_study_speaking_recording"))}</p>
        </div>
        <p id="ssc-sp-mic-error" class="ssc-vocab-error" role="alert" hidden></p>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-secondary" id="ssc-sp-play" ${state.speaking[q.id] ? "" : ""}>${escapeHtml(t("self_study_placement_play_prompt"))}</button>
        <button type="button" class="btn-primary" id="ssc-sp-next" disabled>${escapeHtml(t("self_study_next"))}</button>
      </div>
    `;

    const playBtn = root.querySelector("#ssc-sp-play");
    const nextBtn = root.querySelector("#ssc-sp-next");
    const timerBox = root.querySelector("#ssc-sp-timer");
    const timerVal = root.querySelector("#ssc-sp-timer-val");
    const recBlock = root.querySelector("#ssc-sp-rec-block");
    const errEl = root.querySelector("#ssc-sp-mic-error");

    if (state.speaking[q.id]) {
      nextBtn.disabled = false;
      playBtn.textContent = t("self_study_placement_replay_prompt");
    }

    async function playPrompt() {
      const el = root.querySelector("#ssc-sp-prompt-audio");
      if (el) {
        await new Promise((resolve) => {
          el.onended = () => resolve();
          el.onerror = () => resolve();
          void el.play().catch(() => resolve());
        });
        return;
      }
      if (globalThis.speechSynthesis && q.prompt) {
        await new Promise((resolve) => {
          const u = new SpeechSynthesisUtterance(q.prompt);
          u.lang = "en-GB";
          u.onend = () => resolve();
          u.onerror = () => resolve();
          globalThis.speechSynthesis.cancel();
          globalThis.speechSynthesis.speak(u);
        });
      }
    }

    async function beginAnswer() {
      playBtn.disabled = true;
      if (timerBox) timerBox.hidden = false;
      if (recBlock) recBlock.hidden = false;
      let seconds = answerSec;
      if (timerVal) timerVal.textContent = String(seconds);
      let blobType = "webm";
      try {
        blobType = await startRecording();
      } catch (e) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = e.message || t("self_study_speaking_mic_denied");
        }
        playBtn.disabled = false;
        if (timerBox) timerBox.hidden = true;
        if (recBlock) recBlock.hidden = true;
        return;
      }

      if (state.speakingTimerId) clearInterval(state.speakingTimerId);
      state.speakingTimerId = setInterval(() => {
        seconds -= 1;
        if (timerVal) timerVal.textContent = String(Math.max(0, seconds));
        if (seconds <= 0) {
          clearInterval(state.speakingTimerId);
          state.speakingTimerId = null;
          void finishAnswer(blobType);
        }
      }, 1000);
    }

    async function finishAnswer(blobType) {
      if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
        state.mediaRecorder.stop();
      }
      if (state.recordStopPromise) await state.recordStopPromise;
      stopMedia();
      if (state.recordedBlob) {
        await saveSpeakingAnswer(q.id, state.recordedBlob, blobType);
      } else {
        state.speaking[q.id] = { audioBase64: "", format: blobType, transcript: "" };
      }
      playBtn.disabled = false;
      nextBtn.disabled = false;
      if (recBlock) recBlock.hidden = true;
    }

    playBtn?.addEventListener("click", async () => {
      await playPrompt();
      if (!state.speaking[q.id]) await beginAnswer();
    });

    nextBtn?.addEventListener("click", () => {
      stopMedia();
      clearTimers();
      if (state.qIndex < qs.length - 1) {
        state.qIndex += 1;
        render();
      } else {
        advanceSection();
        render();
      }
    });
  }

  function wordCount(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function renderWriting(root) {
    const prompt = state.exam?.writing?.prompt || "";
    const minW = state.exam?.writing?.minWords || 150;
    const maxW = state.exam?.writing?.maxWords || 180;
    const limitSec = state.exam?.writing?.timeLimitSec || 20 * 60;
    const meta = SECTION_META.writing;

    if (!state.writingDeadline) {
      state.writingDeadline = Date.now() + limitSec * 1000;
    }

    root.innerHTML = `
      <div class="ssc-question-card">
        <p class="ssc-placement-progress__label" style="margin:0 0 0.75rem">${escapeHtml(t(meta.titleKey))} · ${escapeHtml(t(meta.durationKey))}</p>
        <div class="ssc-writing-timer">
          <span>${escapeHtml(t("self_study_placement_writing_time"))}</span>
          <strong id="ssc-writing-timer-val">--:--</strong>
        </div>
        <h3>${escapeHtml(prompt)}</h3>
        <p class="ssc-disclaimer">${escapeHtml(t("self_study_placement_writing_words", { min: String(minW), max: String(maxW) }))}</p>
        ${state.error ? `<p class="ssc-vocab-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <textarea id="ssc-writing-essay" class="ssc-placement-writing" rows="14" placeholder="${escapeHtml(t("self_study_placement_writing_ph"))}">${escapeHtml(state.writingText)}</textarea>
        <p class="ssc-placement-wordcount"><span id="ssc-writing-wc">0</span> ${escapeHtml(t("self_study_placement_words"))}</p>
      </div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-writing-submit">${escapeHtml(t("self_study_placement_submit"))}</button>
      </div>
    `;

    const essayEl = root.querySelector("#ssc-writing-essay");
    const wcEl = root.querySelector("#ssc-writing-wc");
    const timerEl = root.querySelector("#ssc-writing-timer-val");

    function updateWc() {
      state.writingText = essayEl?.value || "";
      if (wcEl) wcEl.textContent = String(wordCount(state.writingText));
    }
    essayEl?.addEventListener("input", updateWc);
    updateWc();

    function fmtTime(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    function tick() {
      const left = Math.max(0, Math.floor((state.writingDeadline - Date.now()) / 1000));
      if (timerEl) timerEl.textContent = fmtTime(left);
      if (left <= 0) {
        clearTimers();
        void submitExam();
      }
    }
    tick();
    if (state.writingTimerId) clearInterval(state.writingTimerId);
    state.writingTimerId = setInterval(tick, 1000);

    document.getElementById("ssc-writing-submit")?.addEventListener("click", () => void submitExam());
  }

  function advanceSection() {
    const idx = SECTION_ORDER.indexOf(state.section);
    if (idx < 0 || idx >= SECTION_ORDER.length - 1) {
      if (state.section === "writing") return;
      state.section = SECTION_ORDER[idx + 1] || "writing";
    } else {
      state.section = SECTION_ORDER[idx + 1];
    }
    state.qIndex = 0;
    if (state.section === "writing") {
      state.writingDeadline = null;
    }
  }

  function renderSection(root) {
    if (state.section === "vocabulary") renderMcq(root, "vocabulary");
    else if (state.section === "listening_listen") renderListeningListen(root);
    else if (state.section === "listening") renderMcq(root, "listening");
    else if (state.section === "reading") renderMcq(root, "reading");
    else if (state.section === "speaking") renderSpeaking(root);
    else if (state.section === "writing") renderWriting(root);
    else advanceSection();
  }

  function renderSubmitting(root) {
    root.innerHTML = `
      <div class="ssc-placement-generating" role="status" aria-live="polite">
        <div class="ssc-placement-generating__spinner" aria-hidden="true"></div>
        <h2>${escapeHtml(t("self_study_placement_submitting_title"))}</h2>
        <p>${escapeHtml(t("self_study_placement_submitting"))}</p>
      </div>
    `;
  }

  function renderMcqReviewItem(item) {
    const opts = (item.options || [])
      .map((opt, i) => {
        let cls = "";
        if (i === item.correctIndex) cls = " ssc-review-opt--correct";
        else if (i === item.yourIndex) cls = " ssc-review-opt--wrong";
        return `<li class="ssc-review-opt${cls}">${escapeHtml(opt)}</li>`;
      })
      .join("");
    return `
      <article class="ssc-placement-review-item${item.correct ? " ssc-placement-review-item--ok" : ""}">
        <p class="ssc-placement-review-item__prompt">${escapeHtml(item.prompt)}</p>
        <ol class="ssc-review-options">${opts}</ol>
        ${item.explanation ? `<p class="ssc-placement-review-item__exp">${escapeHtml(item.explanation)}</p>` : ""}
      </article>
    `;
  }

  function renderSpeakingReviewItem(item) {
    return `
      <article class="ssc-placement-review-item">
        <p class="ssc-placement-review-item__prompt">${escapeHtml(item.prompt)}</p>
        ${item.yourAnswer ? `<p class="ssc-speaking-transcript"><strong>${escapeHtml(t("self_study_placement_your_answer"))}</strong> ${escapeHtml(item.yourAnswer)}</p>` : ""}
        ${item.feedback ? `<p>${escapeHtml(item.feedback)}</p>` : ""}
        ${item.sampleAnswer ? `<p class="ssc-disclaimer"><strong>${escapeHtml(t("self_study_placement_sample"))}</strong> ${escapeHtml(item.sampleAnswer)}</p>` : ""}
      </article>
    `;
  }

  function renderWritingReviewItem(item) {
    const strengths = (item.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    const improvements = (item.improvements || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    return `
      <article class="ssc-placement-review-item">
        <p class="ssc-placement-review-item__prompt">${escapeHtml(item.prompt)}</p>
        ${item.yourAnswer ? `<div class="ssc-placement-review-essay">${escapeHtml(item.yourAnswer)}</div>` : ""}
        ${item.feedback ? `<p>${escapeHtml(item.feedback)}</p>` : ""}
        ${strengths ? `<ul>${strengths}</ul>` : ""}
        ${improvements ? `<ul>${improvements}</ul>` : ""}
      </article>
    `;
  }

  function renderReviewSection(sec) {
    const items = (sec.items || [])
      .map((item) => {
        if (item.section === "mcq") return renderMcqReviewItem(item);
        if (item.section === "speaking") return renderSpeakingReviewItem(item);
        if (item.section === "writing") return renderWritingReviewItem(item);
        return "";
      })
      .join("");
    return `
      <details class="ssc-placement-review-section" open>
        <summary>${escapeHtml(sec.title || sec.id)}</summary>
        <div class="ssc-placement-review-section__body">${items}</div>
      </details>
    `;
  }

  function renderReport(root) {
    const stored = state.result;
    const report = stored?.report;
    if (!report) {
      state.screen = "intro";
      render();
      return;
    }

    const levelLabel = pickLang(report.levelLabelEn, report.levelLabelZh);
    const rangeLabel = pickLang(report.rangeEn, report.rangeZh);
    const disclaimer = pickLang(report.disclaimerEn, report.disclaimerZh);
    const reviewHtml = (report.reviewSections || []).map(renderReviewSection).join("");

    root.innerHTML = `
      <div class="ssc-report">
        <h2 data-i18n="self_study_report_title">${escapeHtml(t("self_study_report_title"))}</h2>
        <div class="ssc-placement-band">
          <span class="ssc-placement-band__label">${escapeHtml(t("self_study_placement_band_label"))}</span>
          <span class="ssc-placement-band__value">${Number(report.band).toFixed(1)}</span>
        </div>
        <p class="ssc-report__range">${escapeHtml(t("self_study_report_level"))}: <strong>${escapeHtml(levelLabel)}</strong> · ${escapeHtml(rangeLabel)}</p>
        <p class="ssc-disclaimer">${escapeHtml(disclaimer)}</p>
        <section class="ssc-placement-review">
          <h3>${escapeHtml(t("self_study_placement_review_title"))}</h3>
          ${reviewHtml}
        </section>
        <div class="ssc-placement-actions">
          <a href="student-self-study.html" class="btn-primary">${escapeHtml(t("self_study_continue_hub"))}</a>
          <a href="student-self-study-placement.html?retake=1" class="btn-secondary">${escapeHtml(t("self_study_placement_retake"))}</a>
        </div>
      </div>
    `;
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  async function submitExam() {
    const SERVER = window.EAP_SELF_STUDY_SERVER;
    if (!SERVER?.submitPlacementExam || !state.exam?.examId) return;
    clearTimers();
    stopMedia();
    state.screen = "submitting";
    render();
    try {
      const data = await SERVER.submitPlacementExam({
        examId: state.exam.examId,
        answers: state.answers,
        writingText: state.writingText,
        speaking: state.speaking,
      });
      state.result = data.result || data.placement;
      state.screen = "report";
      render();
    } catch (e) {
      state.screen = "section";
      state.section = "writing";
      state.error = e.message || t("self_study_placement_submit_failed");
      render();
    }
  }

  function render() {
    const root = document.getElementById("ssc-placement-root");
    if (!root) return;
    renderProgress();
    if (!(state.screen === "section" && state.section === "writing")) {
      clearTimers();
    }
    if (state.screen !== "section" || state.section !== "listening_listen") {
      stopBrowserSpeech();
    }
    if (state.screen === "intro") renderIntro(root);
    else if (state.screen === "generating") renderGenerating(root);
    else if (state.screen === "section") renderSection(root);
    else if (state.screen === "submitting") renderSubmitting(root);
    else if (state.screen === "report") renderReport(root);
  }

  function bindRetakeFromQuery() {
    if (new URLSearchParams(window.location.search).get("retake") === "1") {
      state.screen = "intro";
      state.result = null;
    }
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const ready = await bootStudentSatellitePage(PAGE, () => {});
    if (!ready) return;

    bindRetakeFromQuery();

    const SERVER = window.EAP_SELF_STUDY_SERVER;
    if (SERVER && !new URLSearchParams(window.location.search).has("retake")) {
      try {
        const remote = await SERVER.getPlacement();
        if (remote?.report?.band != null || remote?.levelId) {
          state.result = remote;
          state.screen = "report";
        }
      } catch (_) {
        /* intro */
      }
    }

    render();
    window.addEventListener("eap:langchange", () => render());
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
