/**
 * Teacher Game Builder — 15 templates + mock AI preview (Phase L10–L12).
 */
(function (global) {
  const STORAGE_KEY = "eap_teacher_saved_games";

  const GAME_TEMPLATES = [
    { id: "board-race", nameEn: "Board Race", nameZh: "棋盘竞赛", type: "board_race", icon: "🎲" },
    { id: "vocab-bingo", nameEn: "Vocabulary Bingo", nameZh: "词汇 Bingo", type: "vocab_bingo", icon: "🎯" },
    { id: "matching-race", nameEn: "Matching Race", nameZh: "配对竞赛", type: "matching_race", icon: "🔗" },
    { id: "quiz-battle", nameEn: "Quiz Battle", nameZh: "问答对战", type: "quiz_battle", icon: "⚔" },
    { id: "treasure-hunt", nameEn: "Treasure Hunt", nameZh: "寻宝", type: "placeholder", icon: "🗺" },
    { id: "escape-room", nameEn: "Escape Room", nameZh: "密室逃脱", type: "placeholder", icon: "🔐" },
    { id: "quiz-battle", nameEn: "Quiz Battle", nameZh: "问答对战", type: "placeholder", icon: "⚔" },
    { id: "word-ladder", nameEn: "Word Ladder", nameZh: "词汇阶梯", type: "placeholder", icon: "📶" },
    { id: "sentence-builder", nameEn: "Sentence Builder", nameZh: "句子构建", type: "placeholder", icon: "🧩" },
    { id: "argument-sorting", nameEn: "Argument Sorting", nameZh: "论证排序", type: "placeholder", icon: "📋" },
    { id: "summary-mission", nameEn: "Summary Mission", nameZh: "摘要任务", type: "placeholder", icon: "📝" },
    { id: "memory-card", nameEn: "Memory Card Game", nameZh: "记忆翻牌", type: "placeholder", icon: "🃏" },
    { id: "hot-seat", nameEn: "Hot Seat", nameZh: "热座猜词", type: "placeholder", icon: "💺" },
    { id: "debate-cards", nameEn: "Debate Cards", nameZh: "辩论卡", type: "placeholder", icon: "🗣" },
    { id: "ranking-challenge", nameEn: "Ranking Challenge", nameZh: "排序挑战", type: "placeholder", icon: "📊" },
    { id: "spin-wheel", nameEn: "Spin Wheel", nameZh: "转盘", type: "placeholder", icon: "🎡" },
  ];

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function tplLabel(tpl, field) {
    const zh = isZh();
    return field === "name" ? (zh ? tpl.nameZh : tpl.nameEn) : tpl.nameEn;
  }

  function readCustomGames() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeCustomGames(games) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch (_) {
      /* ignore */
    }
  }

  function saveCustomGame(game) {
    const list = readCustomGames();
    const idx = list.findIndex((g) => g.id === game.id);
    if (idx >= 0) list[idx] = game;
    else list.push(game);
    writeCustomGames(list);
    return game;
  }

  function deleteCustomGame(gameId) {
    const live = global.EAP_TEACHER_LIVE_MOCK;
    if (live && typeof live.deleteCustomGame === "function") {
      return live.deleteCustomGame(gameId);
    }
    const next = readCustomGames().filter((g) => g.id !== gameId);
    writeCustomGames(next);
    return true;
  }

  function isCustomGame(game) {
    const live = global.EAP_TEACHER_LIVE_MOCK;
    if (live && typeof live.isCustomGame === "function") return live.isCustomGame(game);
    return !!(game && game.id);
  }

  function mockGeneratePreview(templateId, topic, className) {
    const tpl = GAME_TEMPLATES.find((t) => t.id === templateId) || GAME_TEMPLATES[0];
    const zh = isZh();
    const title = tplLabel(tpl, "name");
    const topicLine = topic || (zh ? "（未填写主题）" : "(no topic entered)");
    const classLine = className || "EAP047";

    const sampleQuestions = zh
      ? [
          "学术写作中哪一项最适合模糊限制主张？",
          "选择与 <em>conduct</em> 搭配正确的名词：",
          "概括段落主旨的最佳句子是？",
        ]
      : [
          "Which phrase best hedges a claim in academic writing?",
          "Choose the noun that collocates with <em>conduct</em>:",
          "Which sentence best states the paragraph main idea?",
        ];

    return `
      <article class="tgb-preview-card">
        <header>
          <span class="tgb-preview-badge">${zh ? "模拟 AI 生成" : "Mock AI generated"}</span>
          <h3>${title}</h3>
          <p class="tgb-preview-meta">${zh ? "班级" : "Class"}: ${classLine} · ${zh ? "主题" : "Topic"}: ${topicLine}</p>
        </header>
        <section>
          <h4>${zh ? "活动说明" : "Activity overview"}</h4>
          <p>${zh ? "根据您的课堂材料生成的演示活动（规则与题目为模板示例，非真实 AI）。" : "Demo activity from your lesson topic (rules and items are template samples, not real AI)."}</p>
        </section>
        <section>
          <h4>${zh ? "示例题目" : "Sample questions"}</h4>
          <ol>${sampleQuestions.map((q) => `<li>${q}</li>`).join("")}</ol>
        </section>
        <section>
          <h4>${zh ? "课堂提示" : "Classroom tips"}</h4>
          <ul>
            <li>${zh ? "在 Live Teaching 中从 Saved Games 启动。" : "Launch from Saved Games in Live Teaching."}</li>
            <li>${zh ? "点击 Launch to students 查看模拟回复面板。" : "Use Launch to students to open the mock response panel."}</li>
          </ul>
        </section>
      </article>
    `;
  }

  function buildGameFromDraft(draft) {
    const zh = isZh();
    const tpl = GAME_TEMPLATES.find((t) => t.id === draft.templateId) || GAME_TEMPLATES[0];
    const slug = `${draft.templateId}-${Date.now()}`;
    return {
      id: slug,
      templateId: tpl.id,
      nameEn: `${tpl.nameEn}: ${draft.topic || "Lesson"}`,
      nameZh: `${tpl.nameZh}：${draft.topic || (zh ? "课堂" : "Lesson")}`,
      descEn: `Mock game for ${draft.className || "EAP047"} — ${draft.topic || "topic"}`,
      descZh: `模拟活动 · ${draft.className || "EAP047"} · ${draft.topic || "主题"}`,
      type: tpl.type,
      topic: draft.topic,
      className: draft.className,
      previewHtml: draft.previewHtml,
      savedAt: new Date().toISOString(),
      custom: true,
    };
  }

  global.EAP_GAME_BUILDER_MOCK = {
    STORAGE_KEY,
    GAME_TEMPLATES,
    tplLabel,
    readCustomGames,
    saveCustomGame,
    deleteCustomGame,
    isCustomGame,
    mockGeneratePreview,
    buildGameFromDraft,
  };
})(typeof window !== "undefined" ? window : globalThis);
