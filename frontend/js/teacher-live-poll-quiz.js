/**
 * LT-M1 — Poll / Quiz tool panel: AI lesson slots + manual entry.
 */
(function (global) {
  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSegmentFilter() {
    const v = global.__tliveLessonSegmentFilter;
    return v == null || v === "" ? "all" : v;
  }

  function getSlots() {
    const all = Array.isArray(global.__tliveLessonSlots) ? global.__tliveLessonSlots : [];
    if (typeof global.EAP_slotsForSegment === "function") {
      return global.EAP_slotsForSegment(all, getSegmentFilter());
    }
    return all;
  }

  function renderSegmentFilter() {
    const segs = Array.isArray(global.__tliveLessonPlanSegments) ? global.__tliveLessonPlanSegments : [];
    if (!segs.length) return "";
    const cur = getSegmentFilter();
    const opts = [
      `<option value="all"${cur === "all" ? " selected" : ""}>${escapeHtml(t("tlive_pq_segment_all"))}</option>`,
      ...segs.map((seg, i) => {
        const title = (seg && (seg.title || seg.name)) || t("tlive_pq_segment_n", { n: i + 1 });
        const sel = String(cur) === String(i) ? " selected" : "";
        return `<option value="${i}"${sel}>${escapeHtml(String(title).slice(0, 64))}</option>`;
      }),
    ];
    return `
      <div class="tlive-pq-segment">
        <label class="tlive-pq-label" for="tlive-pq-segment">${escapeHtml(t("tlive_pq_segment_label"))}</label>
        <select id="tlive-pq-segment" class="tlive-pq-input">${opts.join("")}</select>
      </div>`;
  }

  function getDraftKey(tool) {
    return tool === "quiz" ? "__tliveQuizDraft" : "__tlivePollDraft";
  }

  function getDraft(tool) {
    return global[getDraftKey(tool)] || null;
  }

  function setDraft(tool, draft) {
    global[getDraftKey(tool)] = draft;
  }

  function getToolSlots(tool) {
    const all = getSlots();
    if (typeof global.EAP_slotsForToolWithLessonFallback === "function") {
      return global.EAP_slotsForToolWithLessonFallback(all, tool);
    }
    return global.EAP_slotsForTool ? global.EAP_slotsForTool(all, tool) : [];
  }

  function getLessonHtmlCached() {
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_html") || "";
    } catch (_) {
      return "";
    }
  }

  function lessonHtmlFingerprint(html) {
    const text = String(html || "");
    return `${text.length}:${text.slice(0, 280)}`;
  }

  function getAiQuestionCache(tool) {
    const cache = global.__tliveAiQuestionCache;
    if (!cache || cache.fingerprint !== lessonHtmlFingerprint(getLessonHtmlCached())) return null;
    return cache[tool] || null;
  }

  function setAiQuestionCache(tool, question) {
    const prev = global.__tliveAiQuestionCache || {};
    global.__tliveAiQuestionCache = {
      ...prev,
      fingerprint: lessonHtmlFingerprint(getLessonHtmlCached()),
      [tool]: question,
    };
  }

  function defaultDraft(tool, MOCK) {
    const slots = getToolSlots(tool);
    if (slots.length && global.EAP_slotToLaunchQuestion) {
      const q = global.EAP_slotToLaunchQuestion(slots[0]);
      if (q) {
        return { mode: "ai", slotId: slots[0].id, question: q };
      }
    }
    const aiQ = getAiQuestionCache(tool);
    if (aiQ) {
      return { mode: "ai-generated", slotId: "", question: aiQ };
    }
    return { mode: "manual", slotId: "", question: null };
  }

  function questionFromManualForm() {
    const text = (document.getElementById("tlive-mq-text")?.value || "").trim();
    const opts = [0, 1, 2, 3].map((i) =>
      (document.getElementById(`tlive-mq-opt-${i}`)?.value || "").trim(),
    );
    const filled = opts.filter(Boolean);
    if (!text || filled.length < 2) return null;
    const correct = parseInt(document.getElementById("tlive-mq-correct")?.value || "0", 10);
    return {
      id: "manual",
      textEn: text,
      textZh: text,
      optionsEn: filled,
      optionsZh: filled,
      correctIndex: Number.isNaN(correct) ? 0 : Math.max(0, Math.min(correct, filled.length - 1)),
      source: "manual",
    };
  }

  function syncManualFormFromQuestion(q) {
    if (!q) return;
    const textEl = document.getElementById("tlive-mq-text");
    if (textEl) textEl.value = q.textEn || "";
    const opts = q.optionsEn || [];
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`tlive-mq-opt-${i}`);
      if (el) el.value = opts[i] || "";
    }
    const corr = document.getElementById("tlive-mq-correct");
    if (corr) corr.value = String(q.correctIndex != null ? q.correctIndex : 0);
  }

  function resolveQuestion(tool, MOCK) {
    const draft = getDraft(tool) || defaultDraft(tool, MOCK);
    if (draft.mode === "manual") {
      const manual = questionFromManualForm();
      if (manual) return manual;
    }
    if (draft.question) return draft.question;
    return null;
  }

  function renderSlotOptionPreview(slot) {
    if (!slot) return "";
    const q = slot.textEn || slot.label || "";
    const opts = (slot.optionsEn || []).slice(0, 4);
    const optsHtml = opts.length
      ? `<ul class="tlive-pq-slot-card__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>`
      : "";
    return `<p class="tlive-pq-slot-card__q">${escapeHtml(q.slice(0, 200))}</p>${optsHtml}`;
  }

  function renderAiPicker(tool, MOCK) {
    const slots = getToolSlots(tool);
    if (slots.length) {
      const draft = getDraft(tool) || defaultDraft(tool, MOCK);
      return `
      <ul class="tlive-pq-slot-list" role="list">
        ${slots
          .map((slot, idx) => {
            const checked = draft.slotId === slot.id && draft.mode === "ai" ? " checked" : "";
            const label = global.EAP_liveSlotLabel ? global.EAP_liveSlotLabel(slot) : slot.id;
            return `<li class="tlive-pq-slot-card">
              <label class="tlive-pq-slot-item">
                <input type="radio" name="tlive-pq-slot" value="${escapeHtml(slot.id)}"${checked} />
                <span class="tlive-pq-slot-card__body">
                  <span class="tlive-pq-slot-card__num">${escapeHtml(t("tlive_pq_question_n", { n: idx + 1 }))}</span>
                  <span class="tlive-pq-slot-card__label">${escapeHtml(label)}</span>
                  ${renderSlotOptionPreview(slot)}
                </span>
              </label>
            </li>`;
          })
          .join("")}
      </ul>`;
    }
    const draft = getDraft(tool) || defaultDraft(tool, MOCK);
    if (draft.mode === "ai-generated" && draft.question) {
      return `
        <p class="tlive-pq-ai-generated-note">${escapeHtml(t("tlive_pq_ai_generated_note"))}</p>
        <div class="tlive-pq-slot-card tlive-pq-slot-card--generated">
          ${renderSlotOptionPreview({
            textEn: draft.question.textEn,
            optionsEn: draft.question.optionsEn,
          })}
        </div>`;
    }
    if (global.__tliveAiQuestionLoading === tool) {
      return `<p class="tlive-pq-empty tlive-pq-empty--loading">${escapeHtml(t("tlive_pq_ai_generating"))}</p>`;
    }
    const html = getLessonHtmlCached();
    if (!html || html.length < 80) {
      return `<p class="tlive-pq-empty">${escapeHtml(t("tlive_pq_no_lesson_html"))}</p>`;
    }
    return `<p class="tlive-pq-empty">${escapeHtml(t("tlive_pq_ai_generate_failed"))}</p>`;
  }

  function renderPreview(q, MOCK) {
    if (!q) return `<p class="tlive-pq-empty">${escapeHtml(t("tlive_pq_preview_empty"))}</p>`;
    const opts = MOCK ? MOCK.questionOptions(q) : q.optionsEn || [];
    return `
      <p class="tlive-pq-preview-q">${escapeHtml(MOCK ? MOCK.questionText(q) : q.textEn)}</p>
      <ol class="tlive-question-box__opts">${opts.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>`;
  }

  function mountPollQuizTool(opts) {
    const tool = opts.tool === "quiz" ? "quiz" : "poll";
    const MOCK = opts.mock;
    const canvas = opts.mountEl || opts.canvas;
    const onLaunch = opts.onLaunch;
    const onViewResponses = opts.onViewResponses;
    if (!canvas || !MOCK) return;

    try {
      const cached = global.sessionStorage?.getItem("eap_last_lesson_html");
      if (cached && typeof global.EAP_syncLessonSlotsFromHtml === "function") {
        global.EAP_syncLessonSlotsFromHtml(cached);
      }
    } catch (_) {
      /* ignore */
    }

    const toolSlots = getToolSlots(tool);
    if (!getDraft(tool)) {
      setDraft(tool, defaultDraft(tool, MOCK));
    }

    const titleKey = tool === "quiz" ? "tlive_quiz_title" : "tlive_poll_title";
    const lessonHint =
      toolSlots.length > 0
        ? t("tlive_pq_lesson_hint", { count: toolSlots.length })
        : getLessonHtmlCached().length >= 80
          ? t("tlive_pq_ai_from_lesson_lead")
          : t("tlive_pq_no_lesson_html");

    canvas.className = opts.sidePanel ? "tlive-tool-panel__inner" : "tlive-canvas__inner tlive-canvas__inner--left";
    canvas.innerHTML = `
      <div class="tlive-pq-panel" data-pq-tool="${tool}">
        <h2 class="tlive-pq-title">${escapeHtml(t(titleKey))}</h2>
        <p class="tlive-pq-lead">${escapeHtml(lessonHint)}</p>
        ${renderSegmentFilter()}

        <section class="tlive-pq-section" aria-labelledby="tlive-pq-ai-heading">
          <h3 id="tlive-pq-ai-heading" class="tlive-pq-section__title">${escapeHtml(t("tlive_pq_ai_heading"))}</h3>
          <p class="tlive-pq-ai-lead">${escapeHtml(t("tlive_pq_ai_lead"))}</p>
          <div id="tlive-pq-ai-list">${renderAiPicker(tool, MOCK)}</div>
        </section>

        <details class="tlive-pq-manual-details">
          <summary class="tlive-pq-manual-summary">${escapeHtml(t("tlive_pq_manual_heading"))}</summary>
          <div class="tlive-pq-manual-body">
            <p class="tlive-pq-manual-lead">${escapeHtml(t("tlive_pq_manual_lead"))}</p>
            <label class="tlive-pq-label" for="tlive-mq-text">${escapeHtml(t("tlive_pq_question_label"))}</label>
            <textarea id="tlive-mq-text" class="tlive-pq-textarea" rows="3"></textarea>
            <div class="tlive-pq-opts">
              ${[0, 1, 2, 3]
                .map(
                  (i) => `
                <label class="tlive-pq-label" for="tlive-mq-opt-${i}">${escapeHtml(t("tlive_pq_option_label", { n: i + 1 }))}</label>
                <input id="tlive-mq-opt-${i}" type="text" class="tlive-pq-input" />`,
                )
                .join("")}
            </div>
            <label class="tlive-pq-label" for="tlive-mq-correct">${escapeHtml(t("tlive_pq_correct_label"))}</label>
            <select id="tlive-mq-correct" class="tlive-pq-input">
              <option value="0">A / 1</option>
              <option value="1">B / 2</option>
              <option value="2">C / 3</option>
              <option value="3">D / 4</option>
            </select>
            <button type="button" class="btn-secondary tlive-pq-use-manual" id="tlive-pq-use-manual">${escapeHtml(t("tlive_pq_use_manual"))}</button>
          </div>
        </details>

        <section class="tlive-pq-section tlive-pq-preview-wrap">
          <h3 class="tlive-pq-section__title">${escapeHtml(t("tlive_pq_preview_heading"))}</h3>
          <div id="tlive-pq-preview">${renderPreview(resolveQuestion(tool, MOCK), MOCK)}</div>
        </section>

        <div class="tlive-board__controls">
          <button type="button" class="btn-primary" id="tlive-pq-launch">${escapeHtml(t("tlive_launch_question"))}</button>
          <button type="button" class="btn-secondary" id="tlive-pq-view-resp">${escapeHtml(t("tlive_view_responses"))}</button>
        </div>
      </div>
    `;

    const draft = getDraft(tool);
    if (draft && draft.mode === "manual" && draft.question) {
      syncManualFormFromQuestion(draft.question);
    } else if (draft && draft.question) {
      syncManualFormFromQuestion(draft.question);
    }

    function refreshAiList() {
      const list = document.getElementById("tlive-pq-ai-list");
      if (list) list.innerHTML = renderAiPicker(tool, MOCK);
      list?.querySelectorAll('input[name="tlive-pq-slot"]').forEach((radio) => {
        radio.addEventListener("change", onSlotRadioChange);
      });
    }

    function onSlotRadioChange() {
      const radio = this;
      const slotId = radio.value;
      const slot = getSlots().find((s) => s.id === slotId);
      if (!slot || !global.EAP_slotToLaunchQuestion) return;
      const q = global.EAP_slotToLaunchQuestion(slot);
      setDraft(tool, { mode: "ai", slotId, question: q });
      syncManualFormFromQuestion(q);
      refreshPreview();
    }

    function refreshPreview() {
      const prev = document.getElementById("tlive-pq-preview");
      if (prev) prev.innerHTML = renderPreview(resolveQuestion(tool, MOCK), MOCK);
    }

    document.getElementById("tlive-pq-segment")?.addEventListener("change", (ev) => {
      global.__tliveLessonSegmentFilter = ev.target.value;
      setDraft(tool, defaultDraft(tool, MOCK));
      refreshAiList();
      refreshPreview();
    });

    canvas.querySelectorAll('input[name="tlive-pq-slot"]').forEach((radio) => {
      radio.addEventListener("change", onSlotRadioChange);
    });

    document.getElementById("tlive-pq-use-manual")?.addEventListener("click", () => {
      const q = questionFromManualForm();
      if (!q) {
        if (typeof opts.onStatus === "function") opts.onStatus(t("tlive_pq_manual_incomplete"), true);
        return;
      }
      setDraft(tool, { mode: "manual", slotId: "", question: q });
      refreshPreview();
      if (typeof opts.onStatus === "function") opts.onStatus(t("tlive_pq_manual_ready"), false);
    });

    ["tlive-mq-text", "tlive-mq-opt-0", "tlive-mq-opt-1", "tlive-mq-opt-2", "tlive-mq-opt-3", "tlive-mq-correct"].forEach(
      (id) => {
        document.getElementById(id)?.addEventListener("input", () => {
          const q = questionFromManualForm();
          if (q) setDraft(tool, { mode: "manual", slotId: "", question: q });
          refreshPreview();
        });
      },
    );

    document.getElementById("tlive-pq-launch")?.addEventListener("click", () => {
      const q = resolveQuestion(tool, MOCK);
      if (!q) {
        if (typeof opts.onStatus === "function") opts.onStatus(t("tlive_pq_preview_empty"), true);
        return;
      }
      if (onLaunch) onLaunch(q, tool);
    });

    document.getElementById("tlive-pq-view-resp")?.addEventListener("click", () => {
      const q = resolveQuestion(tool, MOCK);
      if (onViewResponses) onViewResponses(q);
    });

    void ensureAiGeneratedQuestion(tool, MOCK, {
      refreshAiList,
      refreshPreview,
      onStatus: opts.onStatus,
    });
  }

  async function ensureAiGeneratedQuestion(tool, MOCK, ui) {
    if (getToolSlots(tool).length) return;
    const html = getLessonHtmlCached();
    if (!html || html.length < 80) return;
    if (getAiQuestionCache(tool)) {
      const cached = getAiQuestionCache(tool);
      setDraft(tool, { mode: "ai-generated", slotId: "", question: cached });
      ui.refreshAiList();
      ui.refreshPreview();
      return;
    }
    const api = global.EAP_LIVE_TEACHING_API;
    if (!api || typeof api.generateQuestion !== "function") return;
    global.__tliveAiQuestionLoading = tool;
    ui.refreshAiList();
    try {
      const data = await api.generateQuestion({ html, tool });
      const q = data && data.question;
      if (!q || !Array.isArray(q.optionsEn) || q.optionsEn.length < 2) {
        throw new Error(t("tlive_pq_ai_generate_failed"));
      }
      setAiQuestionCache(tool, q);
      setDraft(tool, { mode: "ai-generated", slotId: "", question: q });
      syncManualFormFromQuestion(q);
      ui.refreshAiList();
      ui.refreshPreview();
      if (typeof ui.onStatus === "function") {
        ui.onStatus(t("tlive_pq_ai_generated_ready"), false);
      }
    } catch (err) {
      if (typeof ui.onStatus === "function") {
        ui.onStatus((err && err.message) || t("tlive_pq_ai_generate_failed"), true);
      }
      ui.refreshAiList();
    } finally {
      global.__tliveAiQuestionLoading = null;
    }
  }

  function applySlotPick(tool, slotId, MOCK) {
    const slot = getSlots().find((s) => String(s.id) === String(slotId));
    if (!slot || !global.EAP_slotToLaunchQuestion) return false;
    const q = global.EAP_slotToLaunchQuestion(slot);
    setDraft(tool, { mode: "ai", slotId: slot.id, question: q });
    return true;
  }

  function persistDraftFromDom(tool, MOCK) {
    const panel = global.document && global.document.getElementById("tlive-tool-panel");
    const root = panel && panel.querySelector(`[data-pq-tool="${tool}"]`);
    if (!root) return;
    const mock = MOCK || global.EAP_TEACHER_LIVE_MOCK;
    if (!mock) return;
    const q = resolveQuestion(tool, mock);
    if (!q) return;
    const draft = getDraft(tool) || defaultDraft(tool, mock);
    const mode =
      root.querySelector('input[name="tlive-pq-slot"]:checked') && draft.mode === "ai"
        ? "ai"
        : draft.mode === "manual" || questionFromManualForm()
          ? "manual"
          : draft.mode;
    const slotId =
      mode === "ai"
        ? root.querySelector('input[name="tlive-pq-slot"]:checked')?.value || draft.slotId || ""
        : "";
    setDraft(tool, { mode, slotId, question: q });
  }

  global.EAP_LIVE_POLL_QUIZ = {
    mountPollQuizTool,
    applySlotPick,
    persistDraftFromDom,
    getDraft,
    setDraft,
    resolveQuestion,
    defaultDraft,
  };
})(typeof window !== "undefined" ? window : globalThis);
