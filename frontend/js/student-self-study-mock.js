/**
 * Student AI Self-Study Centre — mock placement data & scoring (Phase S2).
 * No external APIs. Results stored in sessionStorage only.
 */
(function (global) {
  const STORAGE_KEY = "eap_self_study_placement";

  const LEVELS = {
    beginner: {
      id: "beginner",
      labelEn: "Beginner",
      labelZh: "初级",
      rangeEn: "IELTS-aligned 5.0–6.0",
      rangeZh: "对标雅思 5.0–6.0",
    },
    intermediate: {
      id: "intermediate",
      labelEn: "Intermediate",
      labelZh: "中级",
      rangeEn: "IELTS-aligned 6.0–7.0",
      rangeZh: "对标雅思 6.0–7.0",
    },
    advanced: {
      id: "advanced",
      labelEn: "Advanced",
      labelZh: "高级",
      rangeEn: "IELTS-aligned 7.0+",
      rangeZh: "对标雅思 7.0+",
    },
  };

  const PARTS = [
    {
      id: "vocabulary",
      skill: "vocabulary",
      titleEn: "Part 1 — Vocabulary & academic word knowledge",
      titleZh: "第一部分 — 词汇与学术用词",
      durationEn: "~5 minutes",
      durationZh: "约 5 分钟",
      questions: [
        {
          id: "v1",
          promptEn: "Choose the best meaning of *mitigate* in academic writing.",
          promptZh: "在学术写作中，*mitigate* 的最佳含义是？",
          optionsEn: ["Make less severe", "Prove completely", "Ignore entirely", "Repeat often"],
          optionsZh: ["减轻、缓和", "完全证明", "完全忽略", "频繁重复"],
          correctIndex: 0,
        },
        {
          id: "v2",
          promptEn: "Which collocation is most natural?",
          promptZh: "哪一组搭配最自然？",
          optionsEn: [
            "conduct research",
            "make research",
            "do a research",
            "take research",
          ],
          optionsZh: ["conduct research", "make research", "do a research", "take research"],
          correctIndex: 0,
        },
        {
          id: "v3",
          promptEn: "The word *analysis* belongs to which word family root?",
          promptZh: "*analysis* 属于哪个词根家族？",
          optionsEn: ["-lyse / -lysis (break apart)", "-graph (write)", "-phon (sound)", "-port (carry)"],
          optionsZh: ["-lyse / -lysis（分解）", "-graph（写）", "-phon（声音）", "-port（携带）"],
          correctIndex: 0,
        },
        {
          id: "v4",
          promptEn: "Select the closest paraphrase: *The findings are inconclusive.*",
          promptZh: "选择与原句最接近的改写：*The findings are inconclusive.*",
          optionsEn: [
            "The results do not provide a clear answer yet",
            "The results are definitely wrong",
            "The experiment was cancelled",
            "The data were collected quickly",
          ],
          optionsZh: [
            "结果尚不能给出明确结论",
            "结果肯定是错的",
            "实验已取消",
            "数据收集很快",
          ],
          correctIndex: 0,
        },
        {
          id: "v5",
          promptEn: "Which phrase is appropriate in a formal essay introduction?",
          promptZh: "哪一短语适合用于正式论文引言？",
          optionsEn: [
            "This essay examines",
            "I kinda think",
            "Stuff happens when",
            "Totally awesome idea",
          ],
          optionsZh: [
            "本文探讨……",
            "我觉得吧……",
            "反正就是……",
            "超棒的想法",
          ],
          correctIndex: 0,
        },
        {
          id: "v6",
          promptEn: "What does *subsequently* mean?",
          promptZh: "*subsequently* 的意思是？",
          optionsEn: ["After that / later", "Before that", "At the same time", "Never"],
          optionsZh: ["随后、之后", "在此之前", "同时", "从不"],
          correctIndex: 0,
        },
      ],
    },
    {
      id: "reading",
      skill: "reading",
      titleEn: "Part 2 — Reading",
      titleZh: "第二部分 — 阅读",
      durationEn: "~6 minutes",
      durationZh: "约 6 分钟",
      passageEn:
        "Many universities now encourage students to reflect on how they learn, not only what they learn. Metacognitive strategies—such as planning reading tasks, monitoring comprehension, and reviewing notes—can improve performance on long academic texts. However, reflection alone is insufficient without practice applying strategies in real assignments.",
      passageZh:
        "许多高校鼓励学生反思“如何学习”，而不仅是“学什么”。元认知策略——如规划阅读任务、监控理解程度、复习笔记——有助于提高长篇学术文本的表现。但若不在真实作业中练习运用，仅靠反思仍不足够。",
      questions: [
        {
          id: "r1",
          promptEn: "What is the main idea of the passage?",
          promptZh: "短文的主旨是？",
          optionsEn: [
            "Learning strategies matter when practised, not only reflected on",
            "Universities should cancel long reading lists",
            "Note-taking is unnecessary for students",
            "Reflection always guarantees high grades",
          ],
          optionsZh: [
            "学习策略需要在实践中运用，而非仅靠反思",
            "高校应取消长篇阅读清单",
            "学生不需要记笔记",
            "反思总能保证高分",
          ],
          correctIndex: 0,
        },
        {
          id: "r2",
          promptEn: "According to the text, metacognitive strategies include:",
          promptZh: "根据文本，元认知策略包括：",
          optionsEn: [
            "Planning, monitoring, and reviewing",
            "Memorising passwords and usernames",
            "Skipping all difficult chapters",
            "Copying lectures word for word",
          ],
          optionsZh: ["规划、监控与复习", "记忆密码与用户名", "跳过所有难章节", "逐字抄写讲座"],
          correctIndex: 0,
        },
        {
          id: "r3",
          promptEn: "The word *insufficient* is closest in meaning to:",
          promptZh: "*insufficient* 最接近的含义是：",
          optionsEn: ["Not enough", "Extremely powerful", "Fully complete", "Highly expensive"],
          optionsZh: ["不足够", "非常强大", "完全完整", "非常昂贵"],
          correctIndex: 0,
        },
        {
          id: "r4",
          promptEn: "What can be inferred about reflection?",
          promptZh: "关于“反思”可以推断什么？",
          optionsEn: [
            "It is useful but needs to be combined with practice",
            "It replaces the need for assignments",
            "It is discouraged by universities",
            "It only helps with vocabulary lists",
          ],
          optionsZh: [
            "有用，但需与实践结合",
            "可替代作业需求",
            "被高校反对",
            "仅对词汇表有帮助",
          ],
          correctIndex: 0,
        },
        {
          id: "r5",
          promptEn: "The final sentence mainly serves to:",
          promptZh: "最后一句的主要作用是：",
          optionsEn: [
            "Qualify the benefit of reflection",
            "Introduce a new unrelated topic",
            "Define metacognition formally",
            "List university rankings",
          ],
          optionsZh: ["限定反思的益处", "引入无关新话题", "正式定义元认知", "列出大学排名"],
          correctIndex: 0,
        },
      ],
    },
    {
      id: "listening",
      skill: "listening",
      titleEn: "Part 3 — Listening (text-based sample)",
      titleZh: "第三部分 — 听力（文字稿样题）",
      durationEn: "~5 minutes",
      durationZh: "约 5 分钟",
      passageEn:
        "[Lecture excerpt — read as listening script]\n\nGood morning. Today we'll outline the structure of a typical research presentation. First, state the research question clearly. Second, summarise your method in one or two sentences. Third, present key results without reading every slide aloud. Finally, explain limitations and suggest one direction for future study. Questions are welcome at the end.",
      passageZh:
        "[讲座节选 — 作为听力文字稿]\n\n早上好。今天我们将概述典型研究报告的结构。首先，清晰陈述研究问题。其次，用一两句话概括方法。第三，呈现关键结果，但不要逐字朗读每张幻灯片。最后，说明局限性并提出一个未来研究方向。欢迎在最后提问。",
      questions: [
        {
          id: "l1",
          promptEn: "What is the speaker's main purpose?",
          promptZh: "讲话者的主要目的是？",
          optionsEn: [
            "Explain how to organise a research presentation",
            "Announce exam cancellation",
            "Sell presentation software",
            "Compare two universities",
          ],
          optionsZh: [
            "说明如何组织研究报告",
            "宣布取消考试",
            "推销演示软件",
            "比较两所大学",
          ],
          correctIndex: 0,
        },
        {
          id: "l2",
          promptEn: "According to the script, results should be:",
          promptZh: "根据文稿，结果部分应：",
          optionsEn: [
            "Presented without reading every slide word for word",
            "Omitted entirely",
            "Read aloud in full from each slide",
            "Shown only as jokes",
          ],
          optionsZh: [
            "呈现关键内容，但不要逐字朗读幻灯片",
            "完全省略",
            "逐字朗读每张幻灯片",
            "仅以笑话形式展示",
          ],
          correctIndex: 0,
        },
        {
          id: "l3",
          promptEn: "Which section comes last before questions?",
          promptZh: "在提问之前，哪一部分通常最后出现？",
          optionsEn: [
            "Limitations and future direction",
            "Research question only",
            "Method details only",
            "Personal hobbies",
          ],
          optionsZh: ["局限性与未来方向", "仅研究问题", "仅方法细节", "个人爱好"],
          correctIndex: 0,
        },
        {
          id: "l4",
          promptEn: "The phrase *outline the structure* suggests the lecture is:",
          promptZh: "*outline the structure* 表明本讲座：",
          optionsEn: ["Introductory / organisational", "A final exam", "A debate competition", "A poetry reading"],
          optionsZh: ["介绍性 / 结构性", "期末考试", "辩论赛", "诗歌朗诵"],
          correctIndex: 0,
        },
        {
          id: "l5",
          promptEn: "When should listeners ask questions?",
          promptZh: "听众应在何时提问？",
          optionsEn: ["At the end", "Before the speaker arrives", "During the method section only", "Never"],
          optionsZh: ["在最后", "在讲者到达之前", "仅在方法部分", "从不"],
          correctIndex: 0,
        },
      ],
    },
    {
      id: "writing",
      skill: "writing",
      titleEn: "Part 4 — Writing & sentence awareness",
      titleZh: "第四部分 — 写作与句子意识",
      durationEn: "~4 minutes",
      durationZh: "约 4 分钟",
      questions: [
        {
          id: "w1",
          promptEn: "Choose the best correction:",
          promptZh: "选择最佳改正：",
          optionsEn: [
            "The data suggest that further study is needed.",
            "The data suggest that further study are needed.",
            "The data suggests that further study are needed.",
            "The data suggesting that further study is needed.",
          ],
          optionsZh: [
            "The data suggest that further study is needed.",
            "The data suggest that further study are needed.",
            "The data suggests that further study are needed.",
            "The data suggesting that further study is needed.",
          ],
          correctIndex: 0,
        },
        {
          id: "w2",
          promptEn: "Which order is most logical for summary sentences?",
          promptZh: "摘要句子的最佳顺序是？",
          optionsEn: [
            "Topic → key finding → implication",
            "Implication → joke → unrelated detail",
            "Question → personal story → recipe",
            "Title → bibliography only",
          ],
          optionsZh: [
            "主题 → 主要发现 → 含义",
            "含义 → 笑话 → 无关细节",
            "问题 → 个人故事 → 食谱",
            "标题 → 仅参考文献",
          ],
          correctIndex: 0,
        },
        {
          id: "w3",
          promptEn: "Select the strongest academic sentence:",
          promptZh: "选择最学术的句子：",
          optionsEn: [
            "The policy may reduce inequality over the long term.",
            "The policy is like super cool and stuff.",
            "Policy bad. End of story.",
            "Everyone knows the policy is perfect.",
          ],
          optionsZh: [
            "该政策或在长期内减少不平等。",
            "这政策超酷之类的。",
            "政策很糟。故事结束。",
            "大家都知道这政策完美无缺。",
          ],
          correctIndex: 0,
        },
        {
          id: "w4",
          promptEn: "Which connector best shows contrast?",
          promptZh: "哪个连接词最能表示对比？",
          optionsEn: ["However", "Therefore", "Similarly", "Firstly"],
          optionsZh: ["However（然而）", "Therefore（因此）", "Similarly（同样）", "Firstly（首先）"],
          correctIndex: 0,
        },
        {
          id: "w5",
          promptEn: "Pick the best summary sentence for a short article on climate policy:",
          promptZh: "为气候政策短文选择最佳摘要句：",
          optionsEn: [
            "The article argues that coordinated policy is essential to meet emission targets.",
            "Climate is weather and weather is fun.",
            "The article has many pages and a cover.",
            "Policy is a word with six letters.",
          ],
          optionsZh: [
            "文章认为协调政策对实现减排目标至关重要。",
            "气候就是天气，天气很有趣。",
            "文章有很多页和封面。",
            "Policy 是一个有六个字母的词。",
          ],
          correctIndex: 0,
        },
      ],
    },
  ];

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function partLabel(part, field) {
    const zh = isZh();
    if (field === "title") return zh ? part.titleZh : part.titleEn;
    if (field === "duration") return zh ? part.durationZh : part.durationEn;
    return "";
  }

  function questionText(q, field) {
    const zh = isZh();
    if (field === "prompt") return zh ? q.promptZh : q.promptEn;
    if (field === "options") return zh ? q.optionsZh : q.optionsEn;
    return "";
  }

  function passageText(part) {
    const zh = isZh();
    return zh ? part.passageZh || "" : part.passageEn || "";
  }

  function levelFromPercent(percent) {
    if (percent <= 40) return "beginner";
    if (percent <= 70) return "intermediate";
    return "advanced";
  }

  function skillLevelFromPercent(percent) {
    if (percent <= 35) return "beginner";
    if (percent <= 65) return "intermediate";
    return "advanced";
  }

  function scorePart(part, answers) {
    let correct = 0;
    const total = part.questions.length;
    part.questions.forEach((q) => {
      const chosen = answers[q.id];
      if (chosen === q.correctIndex) correct += 1;
    });
    const percent = total ? Math.round((correct / total) * 100) : 0;
    return { correct, total, percent };
  }

  function buildReport(levelId, skillScores) {
    const level = LEVELS[levelId];
    const zh = isZh();
    const skillLabels = {
      vocabulary: zh ? "词汇" : "Vocabulary",
      reading: zh ? "阅读" : "Reading",
      listening: zh ? "听力" : "Listening",
      speaking: zh ? "口语" : "Speaking",
      writing: zh ? "写作" : "Writing",
    };

    const profile = {
      vocabulary: skillLevelFromPercent(skillScores.vocabulary || 0),
      reading: skillLevelFromPercent(skillScores.reading || 0),
      listening: skillLevelFromPercent(skillScores.listening || 0),
      speaking: "not_assessed",
      writing: skillLevelFromPercent(skillScores.writing || 0),
    };

    const templates = {
      beginner: {
        strengthsEn: [
          "You show awareness of basic academic vocabulary.",
          "You can follow short structured texts.",
        ],
        strengthsZh: ["你对基础学术词汇有一定意识。", "能跟上简短的结构化文本。"],
        improveEn: [
          "Build collocation and word-family knowledge.",
          "Practise longer reading and note-taking from lectures.",
          "Develop summary sentences and paragraph organisation.",
        ],
        improveZh: [
          "加强搭配与词根词缀知识。",
          "练习更长篇阅读与讲座笔记。",
          "发展摘要句与段落组织能力。",
        ],
        pathEn: [
          "Vocabulary: foundation academic words and collocations.",
          "Reading: main idea and detail in short passages.",
          "Listening: lecture structure (text-based practice first).",
          "Writing: sentence patterns and basic summaries.",
          "Speaking: short academic explanations (coming later).",
        ],
        pathZh: [
          "词汇：基础学术词与搭配。",
          "阅读：短文中主旨与细节。",
          "听力：讲座结构（先以文字稿练习）。",
          "写作：句型与基础摘要。",
          "口语：简短学术说明（稍后开放）。",
        ],
      },
      intermediate: {
        strengthsEn: [
          "Good understanding of general academic vocabulary.",
          "Can identify main ideas in short academic texts.",
          "Can follow basic lecture structure.",
        ],
        strengthsZh: [
          "对一般学术词汇理解较好。",
          "能识别短学术文本的主旨。",
          "能跟上基础讲座结构。",
        ],
        improveEn: [
          "Strengthen collocation awareness.",
          "Practise inference and argument structure in reading.",
          "Improve listening note-taking.",
          "Develop summary writing and paragraph development.",
        ],
        improveZh: [
          "加强搭配意识。",
          "练习阅读推断与论证结构。",
          "改进听力笔记。",
          "发展摘要写作与段落展开。",
        ],
        pathEn: [
          "Vocabulary: intermediate collocations and academic phrases.",
          "Reading: inference and argument structure.",
          "Listening: lecture note-taking practice.",
          "Writing: summaries and paragraph development.",
          "Speaking: academic discussion practice (coming later).",
        ],
        pathZh: [
          "词汇：中级搭配与学术短语。",
          "阅读：推断与论证结构。",
          "听力：讲座笔记练习。",
          "写作：摘要与段落展开。",
          "口语：学术讨论练习（稍后开放）。",
        ],
      },
      advanced: {
        strengthsEn: [
          "Strong academic vocabulary and collocation awareness.",
          "Confident with inference and text organisation.",
          "Ready for advanced synthesis and critical reading tasks.",
        ],
        strengthsZh: [
          "学术词汇与搭配意识较强。",
          "对推断与文本组织较有把握。",
          "可挑战更高阶综合与批判性阅读任务。",
        ],
        improveEn: [
          "Refine precision in summary and synthesis writing.",
          "Extend listening practice to longer authentic-style scripts.",
          "Prepare seminar discussion and presentation skills.",
        ],
        improveZh: [
          "精修摘要与综合写作的准确性。",
          "将听力练习扩展到更长仿真文稿。",
          "准备研讨发言与展示技能。",
        ],
        pathEn: [
          "Vocabulary: precision, register, and discipline-specific terms.",
          "Reading: critical reading and synthesis.",
          "Listening: extended lectures and note-taking.",
          "Writing: advanced summaries and argument essays.",
          "Speaking: seminar and presentation skills (coming later).",
        ],
        pathZh: [
          "词汇：语域精准与学科术语。",
          "阅读：批判性阅读与综合。",
          "听力：更长讲座与笔记。",
          "写作：高阶摘要与议论文。",
          "口语：研讨与展示技能（稍后开放）。",
        ],
      },
    };

    const t = templates[levelId] || templates.intermediate;
    return {
      levelId,
      levelLabel: zh ? level.labelZh : level.labelEn,
      rangeLabel: zh ? level.rangeZh : level.rangeEn,
      skillProfile: profile,
      skillLabels,
      strengths: zh ? t.strengthsZh : t.strengthsEn,
      improvementsList: zh ? t.improveZh : t.improveEn,
      path: zh ? t.pathZh : t.pathEn,
    };
  }

  function computePlacement(answersByQuestionId) {
    const skillScores = {};
    let totalCorrect = 0;
    let totalQuestions = 0;

    PARTS.forEach((part) => {
      const scored = scorePart(part, answersByQuestionId);
      skillScores[part.skill] = scored.percent;
      totalCorrect += scored.correct;
      totalQuestions += scored.total;
    });

    const totalPercent = totalQuestions
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;
    const levelId = levelFromPercent(totalPercent);
    const report = buildReport(levelId, skillScores);

    return {
      levelId,
      totalPercent,
      totalCorrect,
      totalQuestions,
      skillScores,
      report,
      answers: { ...answersByQuestionId },
      completedAt: new Date().toISOString(),
    };
  }

  function getPlacement() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function savePlacement(result) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (_) {
      /* ignore */
    }
  }

  function clearPlacement() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function levelDisplay(levelId) {
    const L = LEVELS[levelId];
    if (!L) return levelId;
    return isZh() ? L.labelZh : L.labelEn;
  }

  function mockDailyPlan(levelId) {
    const zh = isZh();
    const plans = {
      beginner: zh
        ? ["词汇模块：学习 6 个学术词 + 配对游戏", "阅读一篇短文的 main idea", "听力结构笔记（稍后）"]
        : [
            "Vocabulary: learn 6 academic words + matching game",
            "Read one short passage for main idea",
            "Listening structure notes (later)",
          ],
      intermediate: zh
        ? ["词汇模块：搭配与语域练习", "阅读推断题 1 组", "摘要句选择练习（稍后）"]
        : [
            "Vocabulary: collocations and register practice",
            "One set of reading inference questions",
            "Summary sentence practice (later)",
          ],
      advanced: zh
        ? ["词汇模块：综合与评价用语", "精读论证结构短文", "听力结构笔记（文字稿）"]
        : [
            "Vocabulary: synthesis and evaluation language",
            "Close read one argument-structure passage",
            "Lecture structure notes (script-based)",
          ],
    };
    return plans[levelId] || plans.intermediate;
  }

  global.EAP_SELF_STUDY_MOCK = {
    STORAGE_KEY,
    LEVELS,
    PARTS,
    partLabel,
    questionText,
    passageText,
    computePlacement,
    getPlacement,
    savePlacement,
    clearPlacement,
    levelDisplay,
    mockDailyPlan,
    levelFromPercent,
    skillLevelFromPercent,
  };
})(typeof window !== "undefined" ? window : globalThis);
