/**
 * Teacher Live Teaching — mock games & student responses (Phase L).
 */
(function (global) {
  const SAVED_GAMES = [
    {
      id: "board-race",
      nameEn: "Board Race",
      nameZh: "棋盘竞赛",
      descEn: "Team competition on a visual track — demo highlight",
      descZh: "队伍赛道竞赛 — 演示亮点",
      type: "board_race",
    },
    {
      id: "vocab-bingo",
      nameEn: "Vocabulary Bingo",
      nameZh: "词汇 Bingo",
      descEn: "Academic vocabulary grid — mock preview",
      descZh: "学术词汇格子 — 演示预览",
      type: "placeholder",
    },
    {
      id: "matching-race",
      nameEn: "Matching Race",
      nameZh: "配对竞赛",
      descEn: "Match terms to definitions — mock preview",
      descZh: "术语与释义配对 — 演示预览",
      type: "placeholder",
    },
  ];

  const MOCK_QUESTIONS = [
    {
      id: "q1",
      textEn: "Which phrase best hedges a claim in academic writing?",
      textZh: "学术写作中哪一项最适合模糊限制主张？",
      optionsEn: ["The results may suggest…", "The results prove forever…", "Everyone knows…", "No data exists ever…"],
      optionsZh: ["结果可能表明…", "结果永远证明…", "大家都知道…", "永远没有任何数据…"],
      correctIndex: 0,
    },
    {
      id: "q2",
      textEn: "Choose the strongest collocation:",
      textZh: "选择最佳搭配：",
      optionsEn: ["conduct research", "make research", "drink research", "sleep research"],
      optionsZh: ["conduct research", "make research", "drink research", "sleep research"],
      correctIndex: 0,
    },
  ];

  const MOCK_STUDENTS = [
    { id: "s1", name: "student1" },
    { id: "s2", name: "student2" },
    { id: "s3", name: "student3" },
    { id: "s4", name: "student4" },
    { id: "s5", name: "student5" },
  ];

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function gameLabel(g, field) {
    const zh = isZh();
    if (field === "name") return zh ? g.nameZh : g.nameEn;
    return zh ? g.descZh : g.descEn;
  }

  function questionText(q) {
    return isZh() ? q.textZh : q.textEn;
  }

  function questionOptions(q) {
    return isZh() ? q.optionsZh : q.optionsEn;
  }

  function createBoardState() {
    return {
      teams: [
        { id: "A", name: "Team A", score: 0, progress: 0 },
        { id: "B", name: "Team B", score: 0, progress: 0 },
        { id: "C", name: "Team C", score: 0, progress: 0 },
        { id: "D", name: "Team D", score: 0, progress: 0 },
      ],
      round: 0,
    };
  }

  function scoreBoardTeam(state, teamIndex) {
    const t = state.teams[teamIndex];
    if (!t) return state;
    t.score += 1;
    t.progress = Math.min(100, t.score * 20);
    state.round += 1;
    return state;
  }

  function simulateResponses(question) {
    const opts = questionOptions(question);
    return MOCK_STUDENTS.map((s, i) => ({
      student: s.name,
      answer: opts[i % opts.length],
      correct: i % opts.length === question.correctIndex,
      timeSec: 8 + i * 3,
    }));
  }

  function readCustomSavedGames() {
    try {
      const raw = sessionStorage.getItem("eap_teacher_saved_games");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  /** Built-in demos + games saved from Game Builder (sessionStorage). */
  function allSavedGames() {
    const custom = readCustomSavedGames();
    const builtinIds = new Set(SAVED_GAMES.map((g) => g.id));
    const merged = [...SAVED_GAMES];
    custom.forEach((g) => {
      if (!builtinIds.has(g.id)) merged.push(g);
    });
    return merged;
  }

  global.EAP_TEACHER_LIVE_MOCK = {
    SAVED_GAMES,
    MOCK_QUESTIONS,
    MOCK_STUDENTS,
    gameLabel,
    questionText,
    questionOptions,
    createBoardState,
    scoreBoardTeam,
    simulateResponses,
    allSavedGames,
  };
})();
