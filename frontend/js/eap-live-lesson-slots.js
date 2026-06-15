/**
 * LT-M1 — Parse AI HTML lesson for live Poll / Quiz / Game launch slots.
 */
(function (global) {
  /** Games supported in LT-M2 phase 1 (must match teacher-live-mock SAVED_GAMES ids). */
  const PHASE1_GAME_IDS = new Set([
    "quiz-battle",
    "board-race",
    "matching-race",
    "vocab-bingo",
    "treasure-hunt",
  ]);

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function normalizeTool(raw) {
    const t = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (t === "poll" || t === "vote") return "poll";
    if (t === "quiz" || t === "mcq" || t === "question") return "quiz";
    if (t === "game" || t === "games") return "game";
    return "";
  }

  function letterToIndex(letter) {
    const c = String(letter || "A")
      .trim()
      .toUpperCase()
      .charAt(0);
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return code - 65;
    return 0;
  }

  function parseBlock(el) {
    const tool = normalizeTool(el.getAttribute("data-eap-live-tool"));
    if (!tool) return null;

    const id =
      el.getAttribute("data-eap-live-id") ||
      el.getAttribute("data-eap-id") ||
      el.id ||
      `slot-${Math.random().toString(36).slice(2, 8)}`;

    const label =
      el.getAttribute("data-eap-live-label") ||
      el.querySelector(".eap-question")?.textContent?.trim() ||
      "";

    const qNode = el.querySelector(".eap-question, [data-eap-question], h3, h4, p");
    const textEn =
      el.getAttribute("data-eap-live-question-en") ||
      el.getAttribute("data-eap-live-question") ||
      (qNode && qNode.textContent ? qNode.textContent.trim() : "") ||
      label;

    const textZh = el.getAttribute("data-eap-live-question-zh") || textEn;

    const optNodes = el.querySelectorAll("[data-eap-option], .eap-options button");
    const optionsEn = [];
    const optionsZh = [];
    optNodes.forEach((node) => {
      const letter = node.getAttribute("data-eap-option") || "";
      const txt = (node.textContent || "").trim();
      const line = letter ? `${letter}. ${txt}` : txt;
      if (line) {
        optionsEn.push(line);
        optionsZh.push(line);
      }
    });

    if (!optionsEn.length) {
      const rawOpts = el.getAttribute("data-eap-live-options");
      if (rawOpts) {
        rawOpts.split("|").forEach((part) => {
          const p = part.trim();
          if (p) optionsEn.push(p);
        });
        optionsZh.push(...optionsEn);
      }
    }

    const answerAttr =
      el.getAttribute("data-eap-answer") || el.getAttribute("data-eap-live-answer") || "A";
    const correctIndex = letterToIndex(answerAttr);

    let gameId = (el.getAttribute("data-eap-live-game") || "").trim().toLowerCase();
    if (tool === "game" && !gameId) gameId = "quiz-battle";
    if (tool === "game" && !PHASE1_GAME_IDS.has(gameId)) gameId = "quiz-battle";

    const segRaw = el.getAttribute("data-eap-live-segment");
    let segmentIndex = null;
    if (segRaw != null && String(segRaw).trim() !== "") {
      const n = parseInt(String(segRaw), 10);
      if (!Number.isNaN(n)) segmentIndex = n;
    }

    return {
      id: String(id),
      tool,
      gameId: tool === "game" ? gameId : "",
      segmentIndex,
      label: label || textEn.slice(0, 80),
      textEn,
      textZh,
      optionsEn,
      optionsZh,
      correctIndex,
      source: "html",
    };
  }

  function inferMcqSlot(el) {
    if (el.getAttribute("data-eap-live-tool")) return null;
    const type = (el.getAttribute("data-eap-type") || "").toLowerCase();
    if (type && type !== "mcq") return null;
    const opts = el.querySelectorAll("[data-eap-option]");
    if (!opts.length) return null;
    el.setAttribute("data-eap-live-tool", "quiz");
    return parseBlock(el);
  }

  function parseLessonMetaFromHtml(html) {
    const text = String(html || "");
    if (!text) return { segments: [], interaction_slots: [] };
    try {
      const doc = new DOMParser().parseFromString(text, "text/html");
      const node = doc.getElementById("eap-lesson-meta");
      if (!node || !node.textContent) return { segments: [], interaction_slots: [] };
      const data = JSON.parse(node.textContent);
      return {
        segments: Array.isArray(data.segments) ? data.segments : [],
        interaction_slots: Array.isArray(data.interaction_slots) ? data.interaction_slots : [],
        title: data.title || "",
      };
    } catch (_) {
      return { segments: [], interaction_slots: [] };
    }
  }

  function slotsForSegment(slots, segmentIndex) {
    if (segmentIndex == null || segmentIndex === "" || segmentIndex === "all") {
      return slots || [];
    }
    const n = parseInt(String(segmentIndex), 10);
    if (Number.isNaN(n)) return slots || [];
    return (slots || []).filter((s) => s.segmentIndex === n);
  }

  function parseLiveLessonSlots(html) {
    const text = String(html || "");
    if (!text) return [];
    let doc;
    try {
      doc = new DOMParser().parseFromString(text, "text/html");
    } catch (_) {
      return [];
    }
    const slots = [];
    const seen = new Set();

    doc.querySelectorAll("[data-eap-live-tool]").forEach((el) => {
      const slot = parseBlock(el);
      if (slot && !seen.has(slot.id)) {
        seen.add(slot.id);
        slots.push(slot);
      }
    });

    doc.querySelectorAll(".eap-activity, [data-eap-id]").forEach((el) => {
      const slot = inferMcqSlot(el);
      if (slot && !seen.has(slot.id)) {
        seen.add(slot.id);
        slots.push(slot);
      }
    });

    const meta = parseLessonMetaFromHtml(text);
    const hasHtmlLiveTools = slots.some((s) => s.source !== "plan-meta");
    if (hasHtmlLiveTools) {
      return slots;
    }
    (meta.interaction_slots || []).forEach((row, i) => {
      const tool = normalizeTool(row.live_tool || row.activity_type);
      if (tool !== "poll" && tool !== "quiz") return;
      const opts = Array.isArray(row.options) ? row.options.map((o) => String(o).trim()).filter(Boolean) : [];
      const question = String(row.question_sketch || row.description || "").trim();
      if (!question && !opts.length) return;
      const id = `plan-${tool}-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      let segmentIndex = null;
      if (row.segment_index != null && String(row.segment_index).trim() !== "") {
        const n = parseInt(String(row.segment_index), 10);
        if (!Number.isNaN(n)) segmentIndex = n;
      }
      slots.push({
        id,
        tool,
        gameId: "",
        segmentIndex,
        label: question.slice(0, 80),
        textEn: question,
        textZh: question,
        optionsEn: opts.length ? opts : ["Agree", "Disagree", "Not sure"],
        optionsZh: opts.length ? opts : ["Agree", "Disagree", "Not sure"],
        correctIndex: 0,
        source: "plan-meta",
      });
    });

    return slots;
  }

  function syncLessonSlotsFromHtml(html) {
    const text = String(html || "");
    if (!text) return;
    if (typeof global.EAP_parseLessonMetaFromHtml === "function") {
      const meta = global.EAP_parseLessonMetaFromHtml(text);
      global.__tliveLessonPlanSegments = meta.segments || [];
    }
    if (typeof global.EAP_parseLiveLessonSlots === "function") {
      global.__tliveLessonSlots = global.EAP_parseLiveLessonSlots(text);
    }
    try {
      global.sessionStorage?.setItem("eap_last_lesson_html", text);
    } catch (_) {
      /* ignore */
    }
  }

  function slotToQuestion(slot) {
    if (!slot) return null;
    const optionsEn = Array.isArray(slot.optionsEn) ? slot.optionsEn.filter(Boolean) : [];
    if (!optionsEn.length) return null;
    return {
      id: slot.id,
      textEn: slot.textEn || "",
      textZh: slot.textZh || slot.textEn || "",
      optionsEn,
      optionsZh: slot.optionsZh && slot.optionsZh.length ? slot.optionsZh : optionsEn,
      correctIndex: Number.isInteger(slot.correctIndex) ? slot.correctIndex : 0,
      source: "lesson",
      slotId: slot.id,
    };
  }

  function slotsForTool(slots, tool) {
    const want = normalizeTool(tool);
    return (slots || []).filter((s) => s.tool === want);
  }

  function gameSlotsPhase1(slots) {
    return (slots || []).filter((s) => s.tool === "game" && PHASE1_GAME_IDS.has(s.gameId));
  }

  function slotLabel(slot) {
    if (!slot) return "";
    const zh = isZh();
    const q = zh ? slot.textZh : slot.textEn;
    let base = slot.label || (q ? q.slice(0, 72) : slot.id);
    if (slot.segmentIndex != null) {
      const segs = global.__tliveLessonPlanSegments;
      if (Array.isArray(segs) && segs[slot.segmentIndex]) {
        const segTitle = segs[slot.segmentIndex].title || `§${slot.segmentIndex + 1}`;
        base = `[${segTitle}] ${base}`;
      }
    }
    return base;
  }

  global.EAP_LIVE_PHASE1_GAME_IDS = PHASE1_GAME_IDS;
  global.EAP_parseLiveLessonSlots = parseLiveLessonSlots;
  global.EAP_parseLessonMetaFromHtml = parseLessonMetaFromHtml;
  global.EAP_slotsForSegment = slotsForSegment;
  global.EAP_slotToLaunchQuestion = slotToQuestion;
  global.EAP_slotsForTool = slotsForTool;
  global.EAP_gameSlotsPhase1 = gameSlotsPhase1;
  global.EAP_liveSlotLabel = slotLabel;
  global.EAP_syncLessonSlotsFromHtml = syncLessonSlotsFromHtml;
})(typeof window !== "undefined" ? window : globalThis);
