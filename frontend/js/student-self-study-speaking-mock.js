/**
 * Speaking module — typed-response mock & progress (Phase S6, no STT/recording).
 */
(function (global) {
  const PROGRESS_KEY = "eap_self_study_speaking_progress";

  const PACKS = {
    beginner: {
      lessonEn:
        "Use a clear point → one reason → short example. Speak in full sentences; avoid one-word answers.",
      lessonZh: "结构：观点 → 一个理由 → 短例子。用完整句子，避免单词回答。",
      promptsEn: [
        "Introduce yourself and your field of study (30+ words).",
        "Describe one course you enjoy and why (30+ words).",
      ],
      promptsZh: [
        "介绍你自己和专业（30 词以上）。",
        "描述一门你喜欢的课程及原因（30 词以上）。",
      ],
      minWords: 30,
      practice: [
        {
          id: "bs1",
          promptEn: "A strong short answer should:",
          promptZh: "有力的短回答应：",
          optionsEn: [
            "have a clear main point",
            "avoid any verbs",
            "use only slang",
            "be one word only",
          ],
          optionsZh: ["有清晰主旨", "避免动词", "只用俚语", "仅一个词"],
          correctIndex: 0,
        },
        {
          id: "bs2",
          promptEn: "To extend an answer, add:",
          promptZh: "扩展回答可加入：",
          optionsEn: ["one reason or example", "random unrelated facts", "only punctuation", "nothing"],
          optionsZh: ["一个理由或例子", "无关事实", "仅标点", "什么都不加"],
          correctIndex: 0,
        },
        {
          id: "bs3",
          promptEn: "Academic discussion tone should be:",
          promptZh: "学术讨论语气应：",
          optionsEn: ["polite and clear", "aggressive", "only emoji", "silent"],
          optionsZh: ["礼貌清晰", "攻击性", "仅表情", "沉默"],
          correctIndex: 0,
        },
        {
          id: "bs4",
          promptEn: "If you forget a word, you can:",
          promptZh: "若忘记词汇，可以：",
          optionsEn: [
            "paraphrase with simpler words",
            "stop speaking entirely",
            "shout",
            "change topic randomly",
          ],
          optionsZh: ["用更简单的词改写", "完全停止", "喊叫", "随意换话题"],
          correctIndex: 0,
        },
      ],
      gamePromptEn: "Explain how you prepare for a weekly tutorial (30+ words). Mention one strategy.",
      gamePromptZh: "说明你如何准备每周研讨课（30 词以上），并提到一种策略。",
    },
    intermediate: {
      lessonEn:
        "Structure: position → support → brief counterpoint. Use linking phrases: however, for instance, as a result.",
      lessonZh: "结构：立场 → 支持 → 简短反驳。使用 however、for instance、as a result 等连接词。",
      promptsEn: [
        "Argue for or against group projects in university (40+ words).",
        "Explain one challenge of online learning and a solution (40+ words).",
      ],
      promptsZh: [
        "支持或反对大学小组项目（40 词以上）。",
        "说明在线学习的一个挑战及解决办法（40 词以上）。",
      ],
      minWords: 40,
      practice: [
        {
          id: "is1",
          promptEn: "Coherence means:",
          promptZh: "连贯性指：",
          optionsEn: [
            "ideas connect logically",
            "speaking as fast as possible",
            "using no structure",
            "avoiding all nouns",
          ],
          optionsZh: ["观点逻辑衔接", "尽可能快说", "无结构", "避免所有名词"],
          correctIndex: 0,
        },
        {
          id: "is2",
          promptEn: "A counterpoint should:",
          promptZh: "反驳段应：",
          optionsEn: [
            "acknowledge another view briefly",
            "ignore all other views",
            "only tell jokes",
            "repeat the title",
          ],
          optionsZh: ["简短承认另一观点", "忽略所有其他观点", "只讲笑话", "重复标题"],
          correctIndex: 0,
        },
        {
          id: "is3",
          promptEn: "Fluency in EAP speaking focuses on:",
          promptZh: "EAP 口语流利度侧重：",
          optionsEn: [
            "steady pace with few long pauses",
            "memorising unrelated lists",
            "maximum volume",
            "zero preparation",
          ],
          optionsZh: ["稳定语速、少长停顿", "背无关列表", "最大音量", "零准备"],
          correctIndex: 0,
        },
        {
          id: "is4",
          promptEn: "*For instance* is used to:",
          promptZh: "*For instance* 用于：",
          optionsEn: ["give an example", "end the talk", "define grammar only", "cite a novel"],
          optionsZh: ["举例", "结束发言", "仅定义语法", "引用小说"],
          correctIndex: 0,
        },
        {
          id: "is5",
          promptEn: "Seminar participation should:",
          promptZh: "研讨课参与应：",
          optionsEn: [
            "build on others' points respectfully",
            "interrupt constantly",
            "avoid evidence",
            "use only slang",
          ],
          optionsZh: ["礼貌承接他人观点", "不断打断", "避免证据", "只用俚语"],
          correctIndex: 0,
        },
      ],
      gamePromptEn:
        "Discuss whether universities should limit AI tools in homework (40+ words). State a clear position.",
      gamePromptZh: "讨论高校是否应限制作业中的 AI 工具（40 词以上），明确立场。",
    },
    advanced: {
      lessonEn:
        "Develop stance, evidence, and evaluation. Hedge claims (may, tend to) and signpost structure for listeners.",
      lessonZh: "展开立场、证据与评价。用 may、tend to 等模糊限制语，并为听众标示结构。",
      promptsEn: [
        "Evaluate one benefit and one risk of AI in academic writing (50+ words).",
        "Present a one-minute thesis on sustainable campus policy (50+ words).",
      ],
      promptsZh: [
        "评价 AI 用于学术写作的一个益处与一个风险（50 词以上）。",
        "用约一分钟阐述可持续校园政策论点（50 词以上）。",
      ],
      minWords: 50,
      practice: [
        {
          id: "as1",
          promptEn: "Evaluation language often includes:",
          promptZh: "评价性语言常包括：",
          optionsEn: ["may, however, therefore", "only slang", "random numbers", "no verbs"],
          optionsZh: ["may、however、therefore", "仅俚语", "随机数字", "无动词"],
          correctIndex: 0,
        },
        {
          id: "as2",
          promptEn: "A seminar thesis should:",
          promptZh: "研讨论点应：",
          optionsEn: [
            "be specific and debatable",
            "be impossible to discuss",
            "avoid all evidence",
            "repeat the question only",
          ],
          optionsZh: ["具体且可讨论", "无法讨论", "避免所有证据", "仅重复问题"],
          correctIndex: 0,
        },
        {
          id: "as3",
          promptEn: "Signposting helps listeners by:",
          promptZh: "路标语帮助听众：",
          optionsEn: [
            "showing structure (first, next, finally)",
            "hiding the main point",
            "speaking faster only",
            "removing all pauses",
          ],
          optionsZh: ["显示结构（first、next、finally）", "隐藏主旨", "仅加快语速", "去掉所有停顿"],
          correctIndex: 0,
        },
        {
          id: "as4",
          promptEn: "When citing a source orally:",
          promptZh: "口头引用来源时：",
          optionsEn: [
            "name the study or author briefly",
            "invent data",
            "avoid any reference",
            "only use emoji",
          ],
          optionsZh: ["简要说明研究或作者", "编造数据", "避免任何引用", "仅用表情"],
          correctIndex: 0,
        },
      ],
      gamePromptEn:
        "Argue whether IELTS-style tests fairly measure EAP readiness (50+ words). Include one limitation.",
      gamePromptZh: "论证雅思类考试是否公平衡量 EAP 准备度（50 词以上），并指出一个局限。",
    },
  };

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function getPack(levelId) {
    return PACKS[levelId] || PACKS.intermediate;
  }

  function lesson(pack) {
    return isZh() ? pack.lessonZh : pack.lessonEn;
  }

  function prompts(pack) {
    return isZh() ? pack.promptsZh : pack.promptsEn;
  }

  function gamePrompt(pack) {
    return isZh() ? pack.gamePromptZh : pack.gamePromptEn;
  }

  function qText(q, field) {
    const zh = isZh();
    if (field === "prompt") return zh ? q.promptZh : q.promptEn;
    return zh ? q.optionsZh : q.optionsEn;
  }

  function countWords(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function buildMockFeedback(text, pack) {
    const zh = isZh();
    const words = countWords(text);
    const hasHowever = /\bhowever\b/i.test(text);
    const hasExample = /\b(for example|for instance|such as)\b/i.test(text);
    const hasHedge = /\b(may|might|tend to|suggest)\b/i.test(text);

    const strengths = [];
    const improvements = [];

    if (words >= pack.minWords) {
      strengths.push(zh ? `达到建议长度（${words} 词）。` : `Met suggested length (${words} words).`);
    } else {
      improvements.push(
        zh
          ? `可再扩展至约 ${pack.minWords} 词以上。`
          : `Try expanding to at least ${pack.minWords} words.`,
      );
    }
    if (hasHowever || hasExample) {
      strengths.push(zh ? "使用了连接或举例表达。" : "Used linking or example language.");
    } else {
      improvements.push(
        zh ? "可加入 however / for example 等连接。" : "Add linking phrases such as however / for example.",
      );
    }
    if (pack.minWords >= 50 && hasHedge) {
      strengths.push(zh ? "使用了适当的模糊限制语。" : "Used appropriate hedging.");
    } else if (pack.minWords >= 50) {
      improvements.push(zh ? "高级回答可使用 may / tend to 等模糊语。" : "Consider hedging with may / tend to.");
    }
    if (/\b(I think|I believe|in my opinion)\b/i.test(text) && pack.minWords < 50) {
      strengths.push(zh ? "表达了个人立场。" : "Expressed a personal position.");
    }

    if (strengths.length === 0) {
      strengths.push(zh ? "你完成了回应练习。" : "You completed the response practice.");
    }

    return { strengths, improvements, wordCount: words };
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
      gameWordCount: 0,
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

  function markGameDone(levelId, wordCount) {
    const p = ensureProgress(levelId);
    p.gameDone = true;
    p.gameWordCount = wordCount;
    p.updatedAt = new Date().toISOString();
    saveProgress(p);
    return p;
  }

  global.EAP_SPEAKING_MOCK = {
    PROGRESS_KEY,
    getPack,
    lesson,
    prompts,
    gamePrompt,
    qText,
    countWords,
    buildMockFeedback,
    getProgress,
    saveProgress,
    ensureProgress,
    completionPercent,
    markLearnDone,
    markPracticeDone,
    markGameDone,
  };
})(typeof window !== "undefined" ? window : globalThis);
