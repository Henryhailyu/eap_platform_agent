/**
 * Live Teaching — AI MCQ bank for class activities (games).
 * Uses the same lesson HTML as poll/quiz but generates distinct questions.
 */
(function (global) {
  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  function getLessonHtmlCached() {
    if (typeof global.EAP_getActiveLessonHtml === "function") {
      return global.EAP_getActiveLessonHtml();
    }
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_html") || "";
    } catch (_) {
      return "";
    }
  }

  function lessonHtmlFingerprint(html) {
    if (typeof global.EAP_lessonHtmlFingerprint === "function") {
      return global.EAP_lessonHtmlFingerprint(html);
    }
    const text = String(html || "");
    return `${text.length}:${text.slice(0, 280)}`;
  }

  function getLessonPageId() {
    if (typeof global.EAP_getActiveLessonPageId === "function") {
      return global.EAP_getActiveLessonPageId();
    }
    return global.__tliveLessonPageId || "";
  }

  function getCacheRoot() {
    const fp = lessonHtmlFingerprint(getLessonHtmlCached());
    const cache = global.__tliveAiQuestionCache;
    if (!cache || cache.fingerprint !== fp) return null;
    return cache;
  }

  function getCached(index) {
    const root = getCacheRoot();
    if (!root || !root.game) return null;
    return root.game[index] || null;
  }

  function setCached(index, question) {
    const prev = global.__tliveAiQuestionCache || {};
    const game = { ...(prev.game || {}) };
    game[index] = question;
    global.__tliveAiQuestionCache = {
      ...prev,
      fingerprint: lessonHtmlFingerprint(getLessonHtmlCached()),
      game,
    };
  }

  function questionText(q) {
    if (!q) return "";
    return String(q.textEn || q.textZh || "").trim();
  }

  function collectAvoidQuestions(excludeIndex) {
    const texts = [];
    const root = getCacheRoot();
    if (root) {
      if (root.poll) texts.push(questionText(root.poll));
      if (root.quiz) texts.push(questionText(root.quiz));
      if (root.game) {
        Object.keys(root.game).forEach((k) => {
          if (Number(k) === excludeIndex) return;
          texts.push(questionText(root.game[k]));
        });
      }
    }
    ["__tlivePollDraft", "__tliveQuizDraft"].forEach((key) => {
      const draft = global[key];
      if (draft && draft.question) texts.push(questionText(draft.question));
    });
    return texts.filter(Boolean).slice(0, 16);
  }

  function gameSlotsForIndex(index) {
    const all = Array.isArray(global.__tliveLessonSlots) ? global.__tliveLessonSlots : [];
    const slots =
      typeof global.EAP_gameSlotsPhase1 === "function" ? global.EAP_gameSlotsPhase1(all) : [];
    const slot = slots[index];
    if (!slot || typeof global.EAP_slotToLaunchQuestion !== "function") return null;
    return global.EAP_slotToLaunchQuestion(slot);
  }

  function resolveSync(MOCK, index) {
    if (global.__tliveOverrideQuestion) return global.__tliveOverrideQuestion;
    const i = Number.isInteger(index) ? index : 0;
    const slotQ = gameSlotsForIndex(i);
    if (slotQ) return slotQ;
    const cached = getCached(i);
    if (cached) return cached;
    return null;
  }

  const inflight = {};

  async function ensure(index, MOCK) {
    const i = Number.isInteger(index) ? index : 0;
    const existing = resolveSync(MOCK, i);
    if (existing) return existing;

    const html = getLessonHtmlCached();
    if (!html || html.length < 80) return null;

    if (inflight[i]) return inflight[i];

    const api = global.EAP_LIVE_TEACHING_API;
    if (!api || typeof api.generateQuestion !== "function") return null;

    inflight[i] = (async () => {
      try {
        const data = await api.generateQuestion({
          html,
          tool: "game",
          question_index: i,
          avoid_questions: collectAvoidQuestions(i),
          lesson_page_id: getLessonPageId(),
        });
        const q = data && data.question;
        if (!q || !Array.isArray(q.optionsEn) || q.optionsEn.length < 2) {
          throw new Error(t("tlive_game_ai_failed"));
        }
        setCached(i, q);
        return q;
      } finally {
        delete inflight[i];
      }
    })();

    return inflight[i];
  }

  global.EAP_LIVE_GAME_QUESTIONS = {
    getLessonHtmlCached,
    resolveSync,
    getCached,
    ensure,
    collectAvoidQuestions,
  };
})(typeof window !== "undefined" ? window : globalThis);
