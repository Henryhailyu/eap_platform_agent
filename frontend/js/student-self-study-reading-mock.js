/**
 * Reading module — static mock content & progress (Phase S4).
 */
(function (global) {
  const PROGRESS_KEY = "eap_self_study_reading_progress";

  const PACKS = {
    beginner: {
      lessonEn: "Read for the main idea first, then scan for details. Underline topic sentences.",
      lessonZh: "先把握主旨，再扫读细节。标出主题句。",
      passageEn:
        "Online learning helps students review materials at their own pace. However, without a study plan, students may fall behind. Teachers recommend short daily sessions rather than one long cramming block.",
      passageZh:
        "在线学习帮助学生按自己的节奏复习材料。但若没有学习计划，学生可能落后。教师建议每日短时学习，而非一次长时间突击。",
      practice: [
        {
          id: "br1",
          promptEn: "What is the main idea?",
          promptZh: "主旨是什么？",
          optionsEn: [
            "Online learning works best with a regular plan",
            "Teachers dislike online tools",
            "Cramming is always effective",
            "Students never use online materials",
          ],
          optionsZh: [
            "有计划时在线学习效果最好",
            "教师不喜欢在线工具",
            "突击总是有效",
            "学生从不用在线材料",
          ],
          correctIndex: 0,
        },
        {
          id: "br2",
          promptEn: "According to the text, teachers recommend:",
          promptZh: "根据文本，教师建议：",
          optionsEn: ["short daily sessions", "no homework", "only weekend study", "ignoring deadlines"],
          optionsZh: ["每日短时学习", "不做作业", "仅周末学习", "忽略截止日期"],
          correctIndex: 0,
        },
        {
          id: "br3",
          promptEn: "The word *However* signals:",
          promptZh: "*However* 表示：",
          optionsEn: ["contrast", "agreement", "a list", "a greeting"],
          optionsZh: ["转折", "同意", "列举", "问候"],
          correctIndex: 0,
        },
        {
          id: "br4",
          promptEn: "A supporting detail is:",
          promptZh: "一项支持性细节是：",
          optionsEn: [
            "students may fall behind without a plan",
            "all students prefer paper only",
            "online learning is illegal",
            "teachers cancel all classes",
          ],
          optionsZh: [
            "没有计划学生可能落后",
            "所有学生只喜欢纸质",
            "在线学习非法",
            "教师取消所有课程",
          ],
          correctIndex: 0,
        },
      ],
      argumentOrder: [0, 1, 2, 3],
      argumentSentencesEn: [
        "Many students now use online platforms for revision.",
        "Self-paced access can support flexible schedules.",
        "Without planning, progress may stall before assessments.",
        "Therefore, short daily study blocks are widely recommended.",
      ],
      argumentSentencesZh: [
        "许多学生如今使用在线平台进行复习。",
        "自定进度有助于灵活安排时间。",
        "若缺乏规划，可能在考核前停滞。",
        "因此，广泛建议每日短时学习。",
      ],
    },
    intermediate: {
      lessonEn: "Track argument structure: claim → evidence → limitation. Watch for hedging (may, tend to).",
      lessonZh: "关注论证结构：主张 → 证据 → 局限。注意模糊语（may、tend to）。",
      passageEn:
        "Recent studies suggest that peer feedback may improve draft quality more than self-editing alone. Students who explain their revisions to a partner tend to notice logical gaps. Nevertheless, feedback quality depends on clear criteria supplied by the instructor.",
      passageZh:
        "近期研究表明，同伴反馈可能比单独自我修改更能提高草稿质量。向同伴解释修改的学生往往能发现逻辑漏洞。然而，反馈质量取决于教师提供的清晰标准。",
      practice: [
        {
          id: "ir1",
          promptEn: "The passage mainly argues that peer feedback:",
          promptZh: "短文主要认为同伴反馈：",
          optionsEn: [
            "can help when criteria are clear",
            "always replaces teacher grading",
            "is useless for writing",
            "only helps vocabulary lists",
          ],
          optionsZh: [
            "在标准清晰时会有帮助",
            "总是替代教师评分",
            "对写作无用",
            "仅帮助词汇表",
          ],
          correctIndex: 0,
        },
        {
          id: "ir2",
          promptEn: "*Nevertheless* introduces:",
          promptZh: "*Nevertheless* 引出：",
          optionsEn: ["a limitation", "a synonym list", "a new unrelated topic", "page numbers"],
          optionsZh: ["一个局限", "同义词表", "无关新话题", "页码"],
          correctIndex: 0,
        },
        {
          id: "ir3",
          promptEn: "We can infer that vague criteria lead to:",
          promptZh: "可推断模糊标准会导致：",
          optionsEn: ["weaker feedback outcomes", "higher IELTS scores automatically", "shorter essays only", "no need for drafts"],
          optionsZh: ["较弱的反馈效果", "自动提高雅思分数", "仅更短作文", "不需要草稿"],
          correctIndex: 0,
        },
        {
          id: "ir4",
          promptEn: "The phrase *tend to* shows:",
          promptZh: "*tend to* 表示：",
          optionsEn: ["cautious generalisation", "absolute certainty", "humour", "a recipe"],
          optionsZh: ["谨慎概括", "绝对确定", "幽默", "食谱"],
          correctIndex: 0,
        },
        {
          id: "ir5",
          promptEn: "Paragraph function of the final sentence:",
          promptZh: "最后一句的段落功能是：",
          optionsEn: ["states a condition for success", "defines grammar rules", "lists exam dates", "quotes a novel"],
          optionsZh: ["说明成功条件", "定义语法规则", "列出考试日期", "引用小说"],
          correctIndex: 0,
        },
      ],
      argumentOrder: [0, 1, 2, 3],
      argumentSentencesEn: [
        "Peer review is increasingly used in EAP writing classes.",
        "Explaining revisions aloud may expose logical weaknesses.",
        "Empirical work reports gains when rubrics are explicit.",
        "Thus, instructor criteria remain central to effective feedback.",
      ],
      argumentSentencesZh: [
        "同伴互评在 EAP 写作课中日益普及。",
        "口头解释修改可能暴露逻辑弱点。",
        "有研究报告表明，评分标准明确时效果更佳。",
        "因此，教师标准仍是有效反馈的核心。",
      ],
    },
    advanced: {
      lessonEn: "Evaluate author stance and synthesis across sources. Separate evidence from interpretation.",
      lessonZh: "评价作者立场并综合多源观点。区分证据与解释。",
      passageEn:
        "While several meta-analyses report modest gains from automated writing feedback, critics contend that algorithms may privilege surface features over argument development. Advocates respond that timely low-stakes prompts complement, rather than replace, human response. The emerging consensus stresses hybrid models aligned to discipline-specific outcomes.",
      passageZh:
        "尽管多项元分析报告认为自动写作反馈带来温和提升，批评者指出算法可能偏重表面特征而非论证发展。支持者回应，及时的低风险评估可补充而非取代人工反馈。新兴共识强调与学科成果对齐的混合模式。",
      practice: [
        {
          id: "ar1",
          promptEn: "Author stance toward automated feedback is best described as:",
          promptZh: "作者对自动反馈的立场最适合描述为：",
          optionsEn: [
            "balanced — noting limits and a hybrid path",
            "entirely negative",
            "completely uncritical promotion",
            "unrelated to education",
          ],
          optionsZh: [
            "平衡 — 指出局限与混合路径",
            "完全负面",
            "完全不加批判地推广",
            "与教育无关",
          ],
          correctIndex: 0,
        },
        {
          id: "ar2",
          promptEn: "Critics worry that algorithms:",
          promptZh: "批评者担心算法：",
          optionsEn: [
            "focus on surface features",
            "eliminate all human teaching",
            "increase lecture attendance only",
            "ban academic vocabulary",
          ],
          optionsZh: ["关注表面特征", "取消所有人工教学", "仅提高听课率", "禁止学术词汇"],
          correctIndex: 0,
        },
        {
          id: "ar3",
          promptEn: "*The emerging consensus* refers to:",
          promptZh: "*The emerging consensus* 指：",
          optionsEn: [
            "a developing shared view in the field",
            "a single student's opinion",
            "a marketing slogan",
            "a grammar exercise",
          ],
          optionsZh: ["领域内正在形成的共识", "某学生个人意见", "营销口号", "语法练习"],
          correctIndex: 0,
        },
        {
          id: "ar4",
          promptEn: "Synthesis across the paragraph suggests:",
          promptZh: "综合全段可推断：",
          optionsEn: [
            "technology and human feedback should be combined thoughtfully",
            "only algorithms should grade final exams",
            "argument structure is unimportant",
            "discipline-specific outcomes are impossible",
          ],
          optionsZh: [
            "技术与人工反馈应审慎结合",
            "仅算法应评期末考试",
            "论证结构不重要",
            "学科成果不可能实现",
          ],
          correctIndex: 0,
        },
      ],
      argumentOrder: [0, 2, 1, 3],
      argumentSentencesEn: [
        "Automated feedback tools are now common in large writing programmes.",
        "Critics argue that surface correction may mask weak argumentation.",
        "Supporters highlight timely prompts that scaffold revision cycles.",
        "Hybrid designs should therefore align tools with disciplinary goals.",
      ],
      argumentSentencesZh: [
        "自动反馈工具已在大规模写作课程中普及。",
        "批评者认为表面修改可能掩盖论证薄弱。",
        "支持者强调及时提示可支撑修改循环。",
        "因此混合设计应使工具与学科目标一致。",
      ],
    },
  };

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function getPack(levelId) {
    return PACKS[levelId] || PACKS.intermediate;
  }

  function passage(pack) {
    return isZh() ? pack.passageZh : pack.passageEn;
  }

  function lesson(pack) {
    return isZh() ? pack.lessonZh : pack.lessonEn;
  }

  function qText(q, field) {
    const zh = isZh();
    if (field === "prompt") return zh ? q.promptZh : q.promptEn;
    return zh ? q.optionsZh : q.optionsEn;
  }

  function argumentSentences(pack) {
    return isZh() ? pack.argumentSentencesZh : pack.argumentSentencesEn;
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

  function markGameDone(levelId, attempts) {
    const p = ensureProgress(levelId);
    p.gameDone = true;
    p.gameAttempts = attempts;
    p.updatedAt = new Date().toISOString();
    saveProgress(p);
    return p;
  }

  global.EAP_READING_MOCK = {
    PROGRESS_KEY,
    getPack,
    passage,
    lesson,
    qText,
    argumentSentences,
    getProgress,
    saveProgress,
    ensureProgress,
    completionPercent,
    markLearnDone,
    markPracticeDone,
    markGameDone,
  };
})(typeof window !== "undefined" ? window : globalThis);
