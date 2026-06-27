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

  function isLiveLaunchControl(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.classList && node.classList.contains("eap-live-launch")) return true;
    if (node.hasAttribute && node.hasAttribute("data-eap-live-launch")) return true;
    if (node.classList && (node.classList.contains("eap-reveal") || node.classList.contains("eap-submit"))) {
      return true;
    }
    const txt = (node.textContent || "").trim();
    if (/^launch to (class|students)\b/i.test(txt)) return true;
    if (/^(show|reveal)\s+(the\s+)?answer/i.test(txt)) return true;
    return false;
  }

  function isLaunchOptionText(text) {
    const raw = String(text || "").trim();
    if (!raw) return true;
    const plain = raw.replace(/^[A-Da-d][.)]\s*/, "").trim();
    return (
      /^launch to (class|students)\b/i.test(raw) ||
      /^launch to (class|students)\b/i.test(plain) ||
      /^(show|reveal)\s+(the\s+)?answer/i.test(plain)
    );
  }

  function filterLaunchOptions(optionsEn, optionsZh) {
    const en = [];
    const zh = [];
    (optionsEn || []).forEach((line, i) => {
      const raw = String(line || "").trim();
      if (!raw || isLaunchOptionText(raw)) return;
      en.push(raw);
      zh.push(optionsZh && optionsZh[i] != null ? optionsZh[i] : raw);
    });
    return { optionsEn: en, optionsZh: zh };
  }

  function collectOptionNodes(el) {
    const tagged = el.querySelectorAll("[data-eap-option]");
    if (tagged.length) return tagged;
    return Array.from(el.querySelectorAll(".eap-options button")).filter(
      (node) => !isLiveLaunchControl(node),
    );
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

    const optionsEn = [];
    const optionsZh = [];
    collectOptionNodes(el).forEach((node) => {
      if (isLiveLaunchControl(node)) return;
      const letter = node.getAttribute("data-eap-option") || "";
      const txt = (node.textContent || "").trim();
      if (!txt || isLaunchOptionText(txt)) return;
      const line = letter ? `${letter}. ${txt}` : txt;
      if (line && !isLaunchOptionText(line)) {
        optionsEn.push(line);
        optionsZh.push(line);
      }
    });

    if (!optionsEn.length) {
      const rawOpts = el.getAttribute("data-eap-live-options");
      if (rawOpts) {
        rawOpts.split("|").forEach((part) => {
          const p = part.trim();
          if (p && !isLaunchOptionText(p)) optionsEn.push(p);
        });
        optionsZh.push(...optionsEn);
      }
    }

    const filtered = filterLaunchOptions(optionsEn, optionsZh);

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
      optionsEn: filtered.optionsEn,
      optionsZh: filtered.optionsZh,
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

  const LIVE_LESSON_FP_VERSION = "live-v5";

  function getActiveLessonHtml() {
    const cache = global.__tliveLessonCache;
    if (cache && cache.type === "html" && cache.html) {
      return String(cache.html);
    }
    if (cache && cache.type === "file") {
      return "";
    }
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_html") || "";
    } catch (_) {
      return "";
    }
  }

  function getActiveLessonPageId() {
    if (global.__tliveLessonPageId != null && global.__tliveLessonPageId !== "") {
      return String(global.__tliveLessonPageId);
    }
    const cache = global.__tliveLessonCache;
    if (cache && cache.pageId != null && cache.pageId !== "") {
      return String(cache.pageId);
    }
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_page_id") || "";
    } catch (_) {
      return "";
    }
  }

  function sampleHtmlHash(text) {
    let hash = 0;
    const step = Math.max(1, Math.floor(text.length / 640));
    for (let i = 0; i < text.length; i += step) {
      hash = (hash * 33 + text.charCodeAt(i)) | 0;
    }
    return hash;
  }

  function lessonHtmlFingerprint(html, pageId) {
    const text = String(html != null ? html : getActiveLessonHtml());
    const pid = pageId != null && pageId !== "" ? String(pageId) : getActiveLessonPageId();
    const len = text.length;
    const head = text.slice(0, 200);
    const mid =
      len > 400 ? text.slice(Math.floor(len / 2) - 80, Math.floor(len / 2) + 80) : "";
    const tail = len > 120 ? text.slice(-120) : text;
    return `${LIVE_LESSON_FP_VERSION}:${pid}:${len}:${sampleHtmlHash(text)}:${head}:${mid}:${tail.slice(0, 80)}`;
  }

  function invalidateLiveLessonAiCache() {
    global.__tliveAiQuestionCache = null;
    global.__tlivePollDraft = null;
    global.__tliveQuizDraft = null;
    global.__tliveLessonVocab = null;
    global.__tliveOverrideQuestion = null;
    global.__tliveGameQuestionLoading = null;
    global.__tliveVocabGameLoading = null;
    global.__tliveGameQuestionFailed = null;
  }

  function syncLessonSlotsFromHtml(html, opts) {
    const text = String(html || "");
    if (!text) return;
    const pageId =
      opts && opts.pageId != null && opts.pageId !== ""
        ? opts.pageId
        : global.__tliveLessonPageId;
    if (pageId != null && pageId !== "") {
      global.__tliveLessonPageId = pageId;
      try {
        global.sessionStorage?.setItem("eap_last_lesson_page_id", String(pageId));
      } catch (_) {
        /* ignore */
      }
    }
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
    const fp = lessonHtmlFingerprint(text, pageId);
    if (!global.__tliveLessonHtmlFingerprint || global.__tliveLessonHtmlFingerprint !== fp) {
      invalidateLiveLessonAiCache();
      global.__tliveLessonHtmlFingerprint = fp;
    }
  }

  function resolveLessonPageId(pageId) {
    if (pageId != null && pageId !== "") return String(pageId);
    if (typeof global.EAP_resolveActiveLessonPageId === "function") {
      const resolved = global.EAP_resolveActiveLessonPageId();
      if (resolved) return String(resolved);
    }
    return getActiveLessonPageId();
  }

  function syncActiveLessonFromCache(pageId) {
    const html = getActiveLessonHtml();
    if (!html || html.length < 80) return false;
    syncLessonSlotsFromHtml(html, { pageId: resolveLessonPageId(pageId) });
    return true;
  }

  async function refreshActiveLessonHtmlFromServer(pageId, timeoutMs) {
    const pid = resolveLessonPageId(pageId);
    if (!pid) return null;
    const cache = global.__tliveLessonCache;
    if (cache && cache.type === "file") return null;
    const api = global.EAP_TEACHER_TEACHING_PAGES;
    if (!api || typeof api.getPage !== "function") return null;
    const waitMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;
    try {
      const pagePromise = api.getPage(pid);
      const page = await Promise.race([
        pagePromise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("lesson fetch timeout")), waitMs);
        }),
      ]);
      const html = page && page.html_content ? String(page.html_content) : "";
      if (html.length < 80) return null;
      const title = (page && page.title ? String(page.title) : "").trim();
      global.__tliveLessonOnStage = true;
      global.__tliveLessonPageId = pid;
      global.__tliveLessonCache = {
        type: "html",
        html,
        title: title || (cache && cache.title) || "",
        pageId: pid,
      };
      syncLessonSlotsFromHtml(html, { pageId: pid });
      return html;
    } catch (_) {
      return null;
    }
  }

  async function ensureActiveLessonSynced(pageId, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const localOk = syncActiveLessonFromCache(pageId);
    if (options.localOnly) return localOk;
    if (options.skipServer) return localOk;
    const pid = resolveLessonPageId(pageId);
    if (!pid) return localOk;
    const fromServer = await refreshActiveLessonHtmlFromServer(
      pageId,
      options.timeoutMs != null ? options.timeoutMs : 12000,
    );
    if (fromServer) return true;
    return localOk;
  }

  function slotToQuestion(slot) {
    if (!slot) return null;
    const filtered = filterLaunchOptions(
      Array.isArray(slot.optionsEn) ? slot.optionsEn : [],
      Array.isArray(slot.optionsZh) ? slot.optionsZh : [],
    );
    const optionsEn = filtered.optionsEn.filter(Boolean);
    if (!optionsEn.length) return null;
    return {
      id: slot.id,
      textEn: slot.textEn || "",
      textZh: slot.textZh || slot.textEn || "",
      optionsEn,
      optionsZh: filtered.optionsZh.length ? filtered.optionsZh : optionsEn,
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

  function slotsForToolWithLessonFallback(slots, tool) {
    const direct = slotsForTool(slots, tool);
    if (direct.length) return direct;
    const want = normalizeTool(tool);
    if (want === "poll") {
      const quizSlots = slotsForTool(slots, "quiz");
      if (quizSlots.length) return quizSlots;
    }
    return (slots || []).filter((s) => {
      const opts = s && s.optionsEn;
      return Array.isArray(opts) && opts.filter(Boolean).length >= 2;
    });
  }

  global.EAP_LIVE_PHASE1_GAME_IDS = PHASE1_GAME_IDS;
  global.EAP_parseLiveLessonSlots = parseLiveLessonSlots;
  global.EAP_parseLessonMetaFromHtml = parseLessonMetaFromHtml;
  global.EAP_slotsForSegment = slotsForSegment;
  global.EAP_slotToLaunchQuestion = slotToQuestion;
  global.EAP_slotsForTool = slotsForTool;
  global.EAP_slotsForToolWithLessonFallback = slotsForToolWithLessonFallback;
  global.EAP_gameSlotsPhase1 = gameSlotsPhase1;
  global.EAP_liveSlotLabel = slotLabel;
  global.EAP_syncLessonSlotsFromHtml = syncLessonSlotsFromHtml;
  global.EAP_getActiveLessonHtml = getActiveLessonHtml;
  global.EAP_getActiveLessonPageId = getActiveLessonPageId;
  global.EAP_lessonHtmlFingerprint = lessonHtmlFingerprint;
  global.EAP_invalidateLiveLessonAiCache = invalidateLiveLessonAiCache;
  global.EAP_syncActiveLessonFromCache = syncActiveLessonFromCache;
  global.EAP_refreshActiveLessonHtmlFromServer = refreshActiveLessonHtmlFromServer;
  global.EAP_ensureActiveLessonSynced = ensureActiveLessonSynced;
})(typeof window !== "undefined" ? window : globalThis);
