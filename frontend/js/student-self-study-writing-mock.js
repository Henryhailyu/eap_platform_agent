/**
 * Writing module — static mock content & progress (Phase S4).
 */
(function (global) {
  const PROGRESS_KEY = "eap_self_study_writing_progress";

  const PACKS = {
    beginner: {
      lessonEn: "Use clear topic sentences. Link ideas with however, therefore, for example.",
      lessonZh: "使用清晰主题句。用 however、therefore、for example 连接观点。",
      sampleEn:
        "Many universities offer writing centres. Students can book short consultations. These sessions help clarify assignment goals.",
      sampleZh:
        "许多高校设有写作中心。学生可预约短时咨询。这些环节有助于明确作业目标。",
      practice: [
        {
          id: "bw1",
          promptEn: "Best topic sentence for a paragraph about writing centres:",
          promptZh: "关于写作中心段落的最佳主题句：",
          optionsEn: [
            "University writing centres support student drafting.",
            "Writing centres sell coffee only.",
            "Students never visit libraries.",
            "Homework is optional everywhere.",
          ],
          optionsZh: [
            "高校写作中心支持学生起草作业。",
            "写作中心只卖咖啡。",
            "学生从不去图书馆。",
            "各地作业都是可选的。",
          ],
          correctIndex: 0,
        },
        {
          id: "bw2",
          promptEn: "Choose the correct sentence:",
          promptZh: "选择正确句子：",
          optionsEn: [
            "Therefore, planning saves time before deadlines.",
            "Therefore planning saves time before deadline are.",
            "Therefore, planning save time before deadline.",
            "Therefore planning saved time before deadline was.",
          ],
          optionsZh: [
            "Therefore, planning saves time before deadlines.",
            "Therefore planning saves time before deadline are.",
            "Therefore, planning save time before deadline.",
            "Therefore planning saved time before deadline was.",
          ],
          correctIndex: 0,
        },
        {
          id: "bw3",
          promptEn: "Which connector shows an example?",
          promptZh: "哪个连接词表示举例？",
          optionsEn: ["For example", "However", "In conclusion only", "Never"],
          optionsZh: ["For example", "However", "仅 In conclusion", "Never"],
          correctIndex: 0,
        },
        {
          id: "bw4",
          promptEn: "Strong academic style avoids:",
          promptZh: "强学术风格应避免：",
          optionsEn: ["slang and vague words like \"stuff\"", "citations", "clear subjects", "formal verbs"],
          optionsZh: ["俚语与 stuff 等模糊词", "引用", "清晰主语", "正式动词"],
          correctIndex: 0,
        },
      ],
      summaryPassageEn:
        "City libraries now run evening study halls for commuters. Attendance rose 18% last term. Councils may expand the programme if funding continues.",
      summaryPassageZh:
        "城市图书馆现为通勤者开设晚间自习室。上学期出席率上升 18%。若资金持续，委员会可能扩大该项目。",
      summaryOptionsEn: [
        "Evening library study halls grew in popularity and may expand with funding.",
        "Libraries only sell books and never help students.",
        "Commuters dislike all public transport.",
        "Funding always disappears immediately.",
      ],
      summaryOptionsZh: [
        "晚间图书馆自习受欢迎，若资金允许可能扩建。",
        "图书馆只卖书从不帮助学生。",
        "通勤者讨厌一切公共交通。",
        "资金总是立刻消失。",
      ],
      summaryCorrect: 0,
    },
    intermediate: {
      lessonEn: "Build summaries with one-sentence main point + key supporting detail. Hedge when sources are limited.",
      lessonZh: "摘要用一句主旨 + 关键细节。证据有限时使用模糊限制语。",
      sampleEn:
        "The pilot module increased draft submissions by 12%. Yet participation varied across departments. Leaders argue that clearer rubrics could stabilise uptake.",
      sampleZh:
        "试点模块使草稿提交量增加 12%。但各部门参与不均。负责人认为更清晰的评分标准可稳定采用率。",
      practice: [
        {
          id: "iw1",
          promptEn: "Best summary sentence:",
          promptZh: "最佳摘要句：",
          optionsEn: [
            "A pilot raised submissions but uptake varied without shared rubrics.",
            "Pilot modules are always perfect.",
            "Departments never communicate.",
            "Rubrics are illegal in universities.",
          ],
          optionsZh: [
            "试点提高提交量，但缺乏统一标准时参与不均。",
            "试点模块总是完美。",
            "院系从不沟通。",
            "高校禁止评分标准。",
          ],
          correctIndex: 0,
        },
        {
          id: "iw2",
          promptEn: "*Yet* signals:",
          promptZh: "*Yet* 表示：",
          optionsEn: ["contrast", "cause and effect only", "a definition", "a joke"],
          optionsZh: ["转折", "仅因果", "定义", "笑话"],
          correctIndex: 0,
        },
        {
          id: "iw3",
          promptEn: "Hedging language includes:",
          promptZh: "模糊限制语包括：",
          optionsEn: ["may, tend to, suggest", "must, always, prove forever", "never, none, impossible only", "emoji"],
          optionsZh: ["may、tend to、suggest", "must、always、prove forever", "仅 never、none", "表情符号"],
          correctIndex: 0,
        },
        {
          id: "iw4",
          promptEn: "Paragraph organisation: topic sentence should:",
          promptZh: "段落组织：主题句应：",
          optionsEn: ["preview the paragraph focus", "repeat the essay title only", "list references", "be blank"],
          optionsZh: ["预示段落重点", "仅重复论文标题", "列出参考文献", "留空"],
          correctIndex: 0,
        },
        {
          id: "iw5",
          promptEn: "Revision priority for EAP summaries:",
          promptZh: "EAP 摘要修改优先：",
          optionsEn: [
            "accuracy of main idea before style flourishes",
            "longest possible sentence length",
            "removing all nouns",
            "adding slang for tone",
          ],
          optionsZh: [
            "先确保主旨准确再润色",
            "句子越长越好",
            "删除所有名词",
            "加俚语增色",
          ],
          correctIndex: 0,
        },
      ],
      summaryPassageEn:
        "Researchers tracked note-taking styles in two large lectures. Students using structured grids recalled more definitions, though inference questions remained difficult for both groups.",
      summaryPassageZh:
        "研究者追踪两场大型讲座的笔记方式。使用结构化表格的学生记住更多定义，但两组在推断题上仍感困难。",
      summaryOptionsEn: [
        "Structured note-taking improved recall of definitions but not inference for all students.",
        "Note-taking never matters in lectures.",
        "Inference questions disappeared from exams.",
        "Grids are banned on campus.",
      ],
      summaryOptionsZh: [
        "结构化笔记提高定义记忆，但推断题对两组仍难。",
        "讲座中笔记从不重要。",
        "推断题已从考试消失。",
        "校园禁止表格。",
      ],
      summaryCorrect: 0,
    },
    advanced: {
      lessonEn: "Synthesise sources: report + evaluate + implication. Control nominalisation and precision.",
      lessonZh: "综合文献：报告 + 评价 + 含义。控制名词化与表达精度。",
      sampleEn:
        "Policy briefs increasingly cite corpus evidence on stance markers. While such data may clarify disciplinary norms, over-reliance risks homogenising student voice unless tasks retain authentic problem spaces.",
      sampleZh:
        "政策简报日益引用语料库中立场标记证据。此类数据或可澄清学科规范，但若任务缺乏真实问题空间，过度依赖可能使学生表达趋同。",
      practice: [
        {
          id: "aw1",
          promptEn: "Strong synthesis sentence:",
          promptZh: "强综合句：",
          optionsEn: [
            "Corpus tools may guide stance use but should not erase authentic inquiry.",
            "Corpus tools replace all teacher feedback instantly.",
            "Students should never use evidence.",
            "Policy briefs are unrelated to writing.",
          ],
          optionsZh: [
            "语料工具可指导立场使用，但不应消除真实探究。",
            "语料工具立刻取代所有教师反馈。",
            "学生不应使用证据。",
            "政策简报与写作无关。",
          ],
          correctIndex: 0,
        },
        {
          id: "aw2",
          promptEn: "*homogenising* implies:",
          promptZh: "*homogenising* 暗示：",
          optionsEn: ["making outputs too similar", "improving diversity", "adding humour", "deleting citations"],
          optionsZh: ["使产出过于相似", "增加多样性", "增加幽默", "删除引用"],
          correctIndex: 0,
        },
        {
          id: "aw3",
          promptEn: "Evaluation language often uses:",
          promptZh: "评价性语言常使用：",
          optionsEn: ["may, risks, unless", "always, never, proves", "lol, stuff, thing", "only numbers"],
          optionsZh: ["may、risks、unless", "always、never、proves", "lol、stuff、thing", "仅数字"],
          correctIndex: 0,
        },
        {
          id: "aw4",
          promptEn: "Implication of the sample paragraph:",
          promptZh: "样段含义：",
          optionsEn: [
            "balance data-driven guidance with open tasks",
            "ban all corpus research",
            "remove problem-based assignments",
            "ignore disciplinary norms",
          ],
          optionsZh: [
            "平衡数据驱动指导与开放性任务",
            "禁止语料研究",
            "取消问题导向作业",
            "忽略学科规范",
          ],
          correctIndex: 0,
        },
      ],
      summaryPassageEn:
        "Three faculties trialled AI drafting assistants under strict disclosure rules. Draft speed rose, yet external examiners flagged uncited paraphrase in 9% of portfolios. Committees now demand explicit citation checkpoints before submission.",
      summaryPassageZh:
        "三个院系在严格披露规则下试用 AI 起草助手。起草速度提高，但外部考官在 9% 的作品集中标记未引用改写。委员会现要求在提交前设置明确引用检查点。",
      summaryOptionsEn: [
        "AI assistants sped drafting but raised citation risks, prompting mandatory checks.",
        "AI assistants removed the need for any citations.",
        "Examiner flags proved portfolios were perfect.",
        "Committees banned all technology permanently.",
      ],
      summaryOptionsZh: [
        "AI 助手加快起草但带来引用风险，促使强制检查。",
        "AI 助手使引用不再必要。",
        "考官标记证明作品集完美。",
        "委员会永久禁止一切技术。",
      ],
      summaryCorrect: 0,
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

  function sample(pack) {
    return isZh() ? pack.sampleZh : pack.sampleEn;
  }

  function summaryPassage(pack) {
    return isZh() ? pack.summaryPassageZh : pack.summaryPassageEn;
  }

  function summaryOptions(pack) {
    return isZh() ? pack.summaryOptionsZh : pack.summaryOptionsEn;
  }

  function qText(q, field) {
    const zh = isZh();
    if (field === "prompt") return zh ? q.promptZh : q.promptEn;
    return zh ? q.optionsZh : q.optionsEn;
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

  global.EAP_WRITING_MOCK = {
    PROGRESS_KEY,
    getPack,
    lesson,
    sample,
    summaryPassage,
    summaryOptions,
    qText,
    getProgress,
    saveProgress,
    ensureProgress,
    completionPercent,
    markLearnDone,
    markPracticeDone,
    markGameDone,
  };
})(typeof window !== "undefined" ? window : globalThis);
