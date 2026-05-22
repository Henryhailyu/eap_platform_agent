/**
 * Vocabulary module content & progress (Phase S3) — static mock, sessionStorage only.
 */
(function (global) {
  const PROGRESS_KEY = "eap_self_study_vocab_progress";

  const PACKS = {
    beginner: {
      lessonEn:
        "Focus on high-frequency academic verbs and nouns. Notice collocations (e.g. conduct research) and simple word families (-lyse, -graph).",
      lessonZh: "重点掌握高频学术动词与名词。注意搭配（如 conduct research）及简单词族（-lyse、-graph 等）。",
      words: [
        { term: "analyze", defEn: "examine in detail", defZh: "详细分析" },
        { term: "evidence", defEn: "facts supporting a claim", defZh: "支持论点的证据" },
        { term: "significant", defEn: "important; noticeable", defZh: "重要的；显著的" },
        { term: "approach", defEn: "a way of dealing with something", defZh: "处理方法；途径" },
        { term: "establish", defEn: "set up or prove", defZh: "建立；证实" },
        { term: "factor", defEn: "something that influences a result", defZh: "影响因素" },
      ],
      practice: [
        {
          id: "bp1",
          promptEn: "Which word means “examine in detail”?",
          promptZh: "哪个词表示“详细分析”？",
          optionsEn: ["analyze", "ignore", "cancel", "borrow"],
          optionsZh: ["analyze", "ignore", "cancel", "borrow"],
          correctIndex: 0,
        },
        {
          id: "bp2",
          promptEn: "Choose the best collocation:",
          promptZh: "选择最佳搭配：",
          optionsEn: ["establish a method", "establish a joke", "establish a nap", "establish a song"],
          optionsZh: ["establish a method", "establish a joke", "establish a nap", "establish a song"],
          correctIndex: 0,
        },
        {
          id: "bp3",
          promptEn: "*Significant* in academic writing often means:",
          promptZh: "学术写作中 *significant* 常指：",
          optionsEn: ["important or noticeable", "tiny and hidden", "illegal", "humorous"],
          optionsZh: ["重要或显著", "微小且隐蔽", "非法", "幽默"],
          correctIndex: 0,
        },
        {
          id: "bp4",
          promptEn: "A *factor* in a study is:",
          promptZh: "研究中的 *factor* 是：",
          optionsEn: ["an influence on results", "a type of furniture", "a musical note only", "a holiday"],
          optionsZh: ["影响结果的因素", "一种家具", "仅是音符", "假期"],
          correctIndex: 0,
        },
        {
          id: "bp5",
          promptEn: "*Evidence* supports:",
          promptZh: "*Evidence* 用于支持：",
          optionsEn: ["a claim or argument", "only personal opinions without data", "unrelated stories", "fashion trends"],
          optionsZh: ["论点或主张", "仅无数据的个人意见", "无关故事", "时尚趋势"],
          correctIndex: 0,
        },
      ],
    },
    intermediate: {
      lessonEn:
        "Build precision with academic collocations and register. Link words to contexts: policy, methodology, implications.",
      lessonZh: "通过学术搭配与语域提升准确性。将词汇与语境关联：政策、方法论、含义/影响等。",
      words: [
        { term: "mitigate", defEn: "make less severe", defZh: "减轻、缓和" },
        { term: "implication", defEn: "a possible effect or meaning", defZh: "可能的影响或含义" },
        { term: "coherent", defEn: "logical and consistent", defZh: "连贯一致的" },
        { term: "subsequently", defEn: "after that; later", defZh: "随后；之后" },
        { term: "framework", defEn: "structure for understanding", defZh: "理解框架" },
        { term: "collocation", defEn: "natural word combination", defZh: "词语自然搭配" },
      ],
      practice: [
        {
          id: "ip1",
          promptEn: "*Mitigate* is closest to:",
          promptZh: "*Mitigate* 最接近：",
          optionsEn: ["reduce harm", "increase harm", "ignore harm", "celebrate harm"],
          optionsZh: ["减少危害", "增加危害", "忽略危害", "庆祝危害"],
          correctIndex: 0,
        },
        {
          id: "ip2",
          promptEn: "A *coherent* paragraph is:",
          promptZh: "*Coherent* 段落是：",
          optionsEn: ["logically connected", "random sentences", "only one word", "written in code"],
          optionsZh: ["逻辑连贯", "随机句子", "仅一个词", "用代码写成"],
          correctIndex: 0,
        },
        {
          id: "ip3",
          promptEn: "Which is a natural collocation?",
          promptZh: "哪一项是自然搭配？",
          optionsEn: ["conduct research", "drink research", "sleep research", "paint research"],
          optionsZh: ["conduct research", "drink research", "sleep research", "paint research"],
          correctIndex: 0,
        },
        {
          id: "ip4",
          promptEn: "*Subsequently* signals:",
          promptZh: "*Subsequently* 表示：",
          optionsEn: ["time order — after", "opposite meaning", "a question", "a greeting"],
          optionsZh: ["时间顺序 — 之后", "相反含义", "一个问题", "问候"],
          correctIndex: 0,
        },
        {
          id: "ip5",
          promptEn: "*Implication* often refers to:",
          promptZh: "*Implication* 常指：",
          optionsEn: ["what follows from an idea", "only grammar rules", "sports scores", "weather forecasts only"],
          optionsZh: ["从观点引申出的内容", "仅语法规则", "体育比分", "仅天气预报"],
          correctIndex: 0,
        },
      ],
    },
    advanced: {
      lessonEn:
        "Refine nuance, synthesis verbs, and discipline-specific register. Watch hedging (may, tend to) and evaluation (compelling, robust).",
      lessonZh: "精修语义细微差别、综合类动词及学科语域。注意模糊限制语（may、tend to）与评价语（compelling、robust）。",
      words: [
        { term: "synthesis", defEn: "combining ideas into a whole", defZh: "综合；合成" },
        { term: "paradigm", defEn: "model or typical pattern", defZh: "范式；典型模式" },
        { term: "corroborate", defEn: "confirm with evidence", defZh: "用证据佐证" },
        { term: "nuance", defEn: "subtle difference in meaning", defZh: "语义细微差别" },
        { term: "contentious", defEn: "causing disagreement", defZh: "有争议的" },
        { term: "robust", defEn: "strong; well-supported", defZh: "强有力的；稳健的" },
      ],
      practice: [
        {
          id: "ap1",
          promptEn: "*Corroborate* means:",
          promptZh: "*Corroborate* 意为：",
          optionsEn: ["support with evidence", "delete all data", "avoid reading", "change the topic randomly"],
          optionsZh: ["用证据支持", "删除所有数据", "避免阅读", "随意换话题"],
          correctIndex: 0,
        },
        {
          id: "ap2",
          promptEn: "*Synthesis* in EAP writing involves:",
          promptZh: "EAP 写作中的 *synthesis* 包括：",
          optionsEn: ["combining sources thoughtfully", "copying one source only", "ignoring citations", "using slang"],
          optionsZh: ["有思考地综合文献", "仅复制单一来源", "忽略引用", "使用俚语"],
          correctIndex: 0,
        },
        {
          id: "ap3",
          promptEn: "A *contentious* claim is:",
          promptZh: "*Contentious* 主张是：",
          optionsEn: ["debated or disputed", "universally accepted without discussion", "a recipe", "a map legend only"],
          optionsZh: ["有争论或争议", "无人讨论即公认", "食谱", "仅是图例"],
          correctIndex: 0,
        },
        {
          id: "ap4",
          promptEn: "*Nuance* refers to:",
          promptZh: "*Nuance* 指：",
          optionsEn: ["subtle meaning differences", "loud shouting", "page numbers", "font size"],
          optionsZh: ["细微语义差别", "大声喊叫", "页码", "字号"],
          correctIndex: 0,
        },
        {
          id: "ap5",
          promptEn: "A *robust* argument is:",
          promptZh: "*Robust* 论证是：",
          optionsEn: ["well-supported and strong", "empty and unsupported", "only emotional", "written in emoji only"],
          optionsZh: ["有充分支持且有力", "空洞无支撑", "仅情绪化", "仅用表情符号"],
          correctIndex: 0,
        },
      ],
    },
  };

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function getPack(levelId) {
    return PACKS[levelId] || PACKS.intermediate;
  }

  function getProgress() {
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveProgress(data) {
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
    } catch (_) {
      /* ignore */
    }
  }

  function defaultProgress(levelId) {
    return {
      levelId,
      learnDone: false,
      practiceDone: false,
      practiceCorrect: 0,
      practiceTotal: 0,
      gameDone: false,
      gameAttempts: 0,
      gameBestPairs: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  function ensureProgress(levelId) {
    let p = getProgress();
    if (!p || p.levelId !== levelId) {
      p = defaultProgress(levelId);
      saveProgress(p);
    }
    return p;
  }

  function completionPercent(p) {
    if (!p) return 0;
    let n = 0;
    if (p.learnDone) n += 34;
    if (p.practiceDone) n += 33;
    if (p.gameDone) n += 33;
    return Math.min(100, n);
  }

  function markLearnDone(levelId) {
    const p = ensureProgress(levelId);
    p.learnDone = true;
    p.updatedAt = new Date().toISOString();
    saveProgress(p);
    return p;
  }

  function markPracticeDone(levelId, correct, total) {
    const p = ensureProgress(levelId);
    p.practiceDone = true;
    p.practiceCorrect = correct;
    p.practiceTotal = total;
    p.updatedAt = new Date().toISOString();
    saveProgress(p);
    return p;
  }

  function markGameDone(levelId, pairsMatched, attempts) {
    const p = ensureProgress(levelId);
    p.gameDone = true;
    p.gameAttempts = attempts;
    p.gameBestPairs = Math.max(p.gameBestPairs || 0, pairsMatched);
    p.updatedAt = new Date().toISOString();
    saveProgress(p);
    return p;
  }

  function text(q, field) {
    const zh = isZh();
    if (field === "prompt") return zh ? q.promptZh : q.promptEn;
    return zh ? q.optionsZh : q.optionsEn;
  }

  function wordDef(w) {
    return isZh() ? w.defZh : w.defEn;
  }

  function lessonText(pack) {
    return isZh() ? pack.lessonZh : pack.lessonEn;
  }

  function matchingPairs(levelId) {
    const pack = getPack(levelId);
    return pack.words.map((w) => ({
      id: w.term,
      term: w.term,
      def: wordDef(w),
    }));
  }

  global.EAP_VOCAB_MOCK = {
    PROGRESS_KEY,
    PACKS,
    getPack,
    getProgress,
    saveProgress,
    ensureProgress,
    completionPercent,
    markLearnDone,
    markPracticeDone,
    markGameDone,
    text,
    wordDef,
    lessonText,
    matchingPairs,
  };
})(typeof window !== "undefined" ? window : globalThis);
