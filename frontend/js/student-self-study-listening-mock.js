/**
 * Listening module — text-script mock & progress (Phase S5, no TTS).
 */
(function (global) {
  const PROGRESS_KEY = "eap_self_study_listening_progress";

  const PACKS = {
    beginner: {
      lessonEn: "Read the script like a short lecture. Listen for signposts: first, next, finally.",
      lessonZh: "将文字稿当作短讲座阅读。留意路标词：first、next、finally。",
      scriptEn:
        "[Lecture script — text only]\n\nFirst, I will define academic integrity. Next, I will give one example from last term. Finally, I will explain how to report concerns.",
      scriptZh:
        "[讲座文字稿]\n\n首先，我会定义学术诚信。接着，我会举上学期的例子。最后，我会说明如何报告问题。",
      practice: [
        {
          id: "bl1",
          promptEn: "What is the speaker's first topic?",
          promptZh: "讲者第一个话题是？",
          optionsEn: ["academic integrity", "sports results", "cafeteria menus", "holiday plans"],
          optionsZh: ["学术诚信", "体育成绩", "食堂菜单", "假期计划"],
          correctIndex: 0,
        },
        {
          id: "bl2",
          promptEn: "The example comes:",
          promptZh: "例子出现在：",
          optionsEn: ["in the middle section", "before the definition", "only after the exam", "never"],
          optionsZh: ["中间部分", "定义之前", "仅在考试后", "从不"],
          correctIndex: 0,
        },
        {
          id: "bl3",
          promptEn: "*Finally* signals:",
          promptZh: "*Finally* 表示：",
          optionsEn: ["the last main point", "a joke", "the title only", "page numbers"],
          optionsZh: ["最后一个要点", "笑话", "仅标题", "页码"],
          correctIndex: 0,
        },
        {
          id: "bl4",
          promptEn: "Best note for the opening:",
          promptZh: "开头最佳笔记：",
          optionsEn: ["Definition: academic integrity", "Recipe for soup", "Bus timetable", "None"],
          optionsZh: ["定义：学术诚信", "汤的做法", "公交时刻表", "无"],
          correctIndex: 0,
        },
      ],
      structureOrder: [0, 1, 2, 3],
      structureLabelsEn: [
        "Opening — define the topic",
        "Middle — give an example",
        "Middle — link to students",
        "Closing — explain reporting",
      ],
      structureLabelsZh: [
        "开场 — 定义主题",
        "中段 — 举例",
        "中段 — 联系学生",
        "结尾 — 说明报告方式",
      ],
    },
    intermediate: {
      lessonEn: "Track lecture moves: framing → evidence → implication. Note numbers and contrast markers.",
      lessonZh: "跟踪讲座结构：框架 → 证据 → 含义。记录数字与转折标记。",
      scriptEn:
        "[Lecture script]\n\nToday’s focus is renewable uptake on campus. Our survey shows a 14% rise in bike commuting, yet car trips fell only 3%. This gap suggests infrastructure, not attitude alone, drives change. I will end with two policy options.",
      scriptZh:
        "[讲座文字稿]\n\n今天聚焦校园可再生能源采用。调查显示自行车通勤上升 14%，但驾车仅降 3%。这一差距表明推动变化的是基础设施，而非仅靠态度。最后我将介绍两项政策选项。",
      practice: [
        {
          id: "il1",
          promptEn: "Main topic of the lecture:",
          promptZh: "讲座主题：",
          optionsEn: [
            "renewable uptake / transport on campus",
            "ancient poetry only",
            "cafeteria recipes",
            "exam cancellation",
          ],
          optionsZh: ["校园可再生能源/交通", "仅古代诗歌", "食堂食谱", "取消考试"],
          correctIndex: 0,
        },
        {
          id: "il2",
          promptEn: "The 14% figure refers to:",
          promptZh: "14% 指：",
          optionsEn: ["bike commuting increase", "car trips increase", "library fines", "class size"],
          optionsZh: ["自行车通勤增加", "驾车增加", "图书馆罚款", "班级人数"],
          correctIndex: 0,
        },
        {
          id: "il3",
          promptEn: "*Yet* introduces:",
          promptZh: "*Yet* 引出：",
          optionsEn: ["contrast with expectations", "agreement", "a definition", "a bibliography"],
          optionsZh: ["与预期的对比", "同意", "定义", "参考文献"],
          correctIndex: 0,
        },
        {
          id: "il4",
          promptEn: "Speaker implication:",
          promptZh: "讲者含义：",
          optionsEn: [
            "infrastructure matters for transport change",
            "students dislike all surveys",
            "bikes are banned",
            "policy is unnecessary",
          ],
          optionsZh: [
            "基础设施影响交通变化",
            "学生讨厌所有调查",
            "自行车被禁",
            "政策不必要",
          ],
          correctIndex: 0,
        },
        {
          id: "il5",
          promptEn: "Final section will present:",
          promptZh: "最后部分将介绍：",
          optionsEn: ["two policy options", "only jokes", "unrelated novels", "grammar rules only"],
          optionsZh: ["两项政策选项", "仅笑话", "无关小说", "仅语法规则"],
          correctIndex: 0,
        },
      ],
      structureOrder: [0, 1, 2, 3],
      structureLabelsEn: [
        "Frame the topic",
        "Present survey evidence",
        "Interpret the gap",
        "Preview closing policies",
      ],
      structureLabelsZh: [
        "框架主题",
        "呈现调查证据",
        "解释差距",
        "预告结尾政策",
      ],
    },
    advanced: {
      lessonEn: "Follow stance and hedging in research talks. Separate reported findings from speaker evaluation.",
      lessonZh: "跟踪研究报告中的立场与模糊语。区分报告发现与讲者评价。",
      scriptEn:
        "[Research seminar script]\n\nThe trial indicates that blended feedback may accelerate revision cycles, though gains appear uneven across disciplines. Critics caution that speed should not trade off against evidential depth. I will therefore outline safeguards before wider rollout.",
      scriptZh:
        "[研讨班文字稿]\n\n试验表明混合反馈可能加快修改周期，但各学科收益不均。批评者提醒不应以证据深度换取速度。因此我将概述推广前的保障措施。",
      practice: [
        {
          id: "al1",
          promptEn: "Reported finding:",
          promptZh: "报告的发现：",
          optionsEn: [
            "blended feedback may speed revision",
            "feedback is always harmful",
            "revision is banned",
            "disciplines are identical",
          ],
          optionsZh: [
            "混合反馈可能加快修改",
            "反馈总是有害",
            "禁止修改",
            "各学科完全相同",
          ],
          correctIndex: 0,
        },
        {
          id: "al2",
          promptEn: "*though* signals:",
          promptZh: "*though* 表示：",
          optionsEn: ["limitation", "complete agreement", "a recipe", "a title"],
          optionsZh: ["局限", "完全同意", "食谱", "标题"],
          correctIndex: 0,
        },
        {
          id: "al3",
          promptEn: "Critics' concern focuses on:",
          promptZh: "批评者关注：",
          optionsEn: [
            "depth of evidence vs speed",
            "cafeteria quality",
            "sports uniforms",
            "library opening hours only",
          ],
          optionsZh: [
            "证据深度与速度",
            "食堂质量",
            "运动服",
            "仅开馆时间",
          ],
          correctIndex: 0,
        },
        {
          id: "al4",
          promptEn: "Speaker's next move:",
          promptZh: "讲者下一步：",
          optionsEn: [
            "outline safeguards before rollout",
            "cancel all research",
            "ignore critics",
            "remove all citations",
          ],
          optionsZh: [
            "推广前概述保障措施",
            "取消所有研究",
            "忽略批评",
            "删除所有引用",
          ],
          correctIndex: 0,
        },
      ],
      structureOrder: [0, 1, 2, 3],
      structureLabelsEn: [
        "State trial finding (hedged)",
        "Note uneven gains",
        "Report critics' caution",
        "Propose safeguards / close",
      ],
      structureLabelsZh: [
        "陈述试验发现（带模糊语）",
        "指出收益不均",
        "转述批评者提醒",
        "提出保障措施 / 收尾",
      ],
    },
  };

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function getPack(levelId) {
    return PACKS[levelId] || PACKS.intermediate;
  }

  function script(pack) {
    return isZh() ? pack.scriptZh : pack.scriptEn;
  }

  function lesson(pack) {
    return isZh() ? pack.lessonZh : pack.lessonEn;
  }

  function structureLabels(pack) {
    return isZh() ? pack.structureLabelsZh : pack.structureLabelsEn;
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

  global.EAP_LISTENING_MOCK = {
    PROGRESS_KEY,
    getPack,
    script,
    lesson,
    structureLabels,
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
