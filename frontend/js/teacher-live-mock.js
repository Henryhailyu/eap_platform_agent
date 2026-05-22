/**
 * Teacher Live Teaching — mock games & student responses (Phase L).
 */
(function (global) {
  const BUILTIN_GAME_IDS = new Set([
    "board-race",
    "vocab-bingo",
    "matching-race",
    "quiz-battle",
    "treasure-hunt",
    "escape-room",
    "word-ladder",
    "sentence-builder",
    "argument-sorting",
    "summary-mission",
  ]);

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
      descEn: "5×5 academic word grid — first line wins",
      descZh: "5×5 学术词汇格 — 先连成一线者胜",
      type: "vocab_bingo",
    },
    {
      id: "matching-race",
      nameEn: "Matching Race",
      nameZh: "配对竞赛",
      descEn: "Race to match terms and definitions by team",
      descZh: "小组抢答配对术语与释义",
      type: "matching_race",
    },
    {
      id: "quiz-battle",
      nameEn: "Quiz Battle",
      nameZh: "问答对战",
      descEn: "Teams race to score points — challenge rounds worth double",
      descZh: "小组抢答得分 — 挑战轮双倍分",
      type: "quiz_battle",
    },
    {
      id: "treasure-hunt",
      nameEn: "Treasure Hunt",
      nameZh: "寻宝",
      descEn: "Answer questions to unlock clues — first team to the treasure wins",
      descZh: "答对题目解锁线索 — 先找到宝藏的小组获胜",
      type: "treasure_hunt",
    },
    {
      id: "escape-room",
      nameEn: "Escape Room",
      nameZh: "密室逃脱",
      descEn: "Complete language tasks to reveal the password — first team to escape wins",
      descZh: "完成语言任务拼出密码 — 率先逃脱的小组获胜",
      type: "escape_room",
    },
    {
      id: "word-ladder",
      nameEn: "Word Ladder",
      nameZh: "词汇阶梯",
      descEn: "Climb the word-family ladder — first team to the top wins",
      descZh: "沿词族阶梯向上 — 先到顶端的小组获胜",
      type: "word_ladder",
    },
    {
      id: "sentence-builder",
      nameEn: "Sentence Builder",
      nameZh: "句子构建",
      descEn: "Reorder phrase chunks into academic sentences — team race",
      descZh: "将短语块排成学术句子 — 小组竞赛",
      type: "sentence_builder",
    },
    {
      id: "argument-sorting",
      nameEn: "Argument Sorting",
      nameZh: "论证排序",
      descEn: "Place claim, reason, evidence, example & counterargument in order",
      descZh: "将主张、理由、论据、例证与反驳排序到位",
      type: "argument_sorting",
    },
    {
      id: "summary-mission",
      nameEn: "Summary Mission",
      nameZh: "摘要任务",
      descEn: "Complete six summary steps — first team to finish the mission wins",
      descZh: "完成六步摘要任务 — 率先完成的小组获胜",
      type: "summary_mission",
    },
  ];

  const TREASURE_CLUES = [
    {
      id: "c1",
      labelEn: "Clue 1",
      labelZh: "线索 1",
      textEn: "Scan paragraph 2 — the author hedges the claim with tentative language.",
      textZh: "扫读第2段 — 作者用试探性语言限制主张。",
    },
    {
      id: "c2",
      labelEn: "Clue 2",
      labelZh: "线索 2",
      textEn: "Find the collocation in the methods section: conduct + research.",
      textZh: "在方法部分找到搭配：conduct + research。",
    },
    {
      id: "c3",
      labelEn: "Clue 3",
      labelZh: "线索 3",
      textEn: "Footnote 3 cites Smith (2019) — note the sample size limitation.",
      textZh: "脚注3引用 Smith (2019) — 注意样本量局限。",
    },
    {
      id: "c4",
      labelEn: "Clue 4",
      labelZh: "线索 4",
      textEn: "The conclusion restates the research question from the introduction.",
      textZh: "结论重述了引言中的研究问题。",
    },
    {
      id: "c5",
      labelEn: "Clue 5",
      labelZh: "线索 5",
      textEn: "Final hint: follow the citation poster to Room B204.",
      textZh: "最终提示：沿引用规范海报前往 B204 教室。",
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
    {
      id: "q3",
      textEn: "Which sentence uses a hedging device appropriately?",
      textZh: "哪一句恰当使用了含糊限制语？",
      optionsEn: [
        "It appears that the trend is increasing.",
        "The trend is 100% proven forever.",
        "Everyone always agrees completely.",
        "There is zero evidence of any change.",
      ],
      optionsZh: [
        "趋势似乎正在上升。",
        "趋势已被永远百分之百证明。",
        "大家总是完全同意。",
        "没有任何变化的证据。",
      ],
      correctIndex: 0,
    },
    {
      id: "q4",
      textEn: "Select the best topic sentence for a body paragraph:",
      textZh: "选择最适合作为主体段主题句的一项：",
      optionsEn: [
        "One limitation of this approach is sample size.",
        "I like pizza and movies on weekends.",
        "The weather was nice yesterday.",
        "Click here for more info!!!",
      ],
      optionsZh: [
        "该方法的一个局限是样本量。",
        "我周末喜欢吃披萨看电影。",
        "昨天天气很好。",
        "点此了解更多！！！",
      ],
      correctIndex: 0,
    },
  ];

  const TRACK_LENGTH = 12;
  const TEAM_COLORS = ["#0071E3", "#0A7EA4", "#FF9500", "#AF52DE"];

  const SQUARE_DEFS = [
    { type: "start", labelEn: "Start", labelZh: "起点" },
    { type: "normal", labelEn: "1", labelZh: "1" },
    { type: "bonus", labelEn: "Bonus +1", labelZh: "奖励+1" },
    { type: "normal", labelEn: "3", labelZh: "3" },
    { type: "penalty", labelEn: "Back 1", labelZh: "退1格" },
    { type: "normal", labelEn: "5", labelZh: "5" },
    { type: "challenge", labelEn: "Challenge", labelZh: "挑战" },
    { type: "normal", labelEn: "7", labelZh: "7" },
    { type: "vocab", labelEn: "Vocab +2", labelZh: "词汇+2" },
    { type: "normal", labelEn: "9", labelZh: "9" },
    { type: "help", labelEn: "Team help", labelZh: "互助" },
    { type: "normal", labelEn: "11", labelZh: "11" },
    { type: "finish", labelEn: "Finish", labelZh: "终点" },
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

  function squareAt(position) {
    const idx = Math.max(0, Math.min(TRACK_LENGTH, position));
    return SQUARE_DEFS[idx] || SQUARE_DEFS[0];
  }

  function squareLabel(sq) {
    if (!sq) return "";
    return isZh() ? sq.labelZh : sq.labelEn;
  }

  function teamName(team) {
    return isZh() ? team.nameZh : team.name;
  }

  function createBoardState() {
    return {
      trackLength: TRACK_LENGTH,
      teams: [
        { id: "A", name: "Team A", nameZh: "A 组", position: 0, score: 0, color: TEAM_COLORS[0] },
        { id: "B", name: "Team B", nameZh: "B 组", position: 0, score: 0, color: TEAM_COLORS[1] },
        { id: "C", name: "Team C", nameZh: "C 组", position: 0, score: 0, color: TEAM_COLORS[2] },
        { id: "D", name: "Team D", nameZh: "D 组", position: 0, score: 0, color: TEAM_COLORS[3] },
      ],
      round: 1,
      lastEvent: null,
      winnerId: null,
    };
  }

  function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function cloneState(state) {
    return {
      ...state,
      teams: state.teams.map((t) => ({ ...t })),
      lastEvent: state.lastEvent ? { ...state.lastEvent } : null,
    };
  }

  function applySquareEffect(state, team, square) {
    const events = [];
    if (square.type === "bonus" && team.position < TRACK_LENGTH) {
      team.position = Math.min(TRACK_LENGTH, team.position + 1);
      team.score += 1;
      events.push("bonus");
    } else if (square.type === "penalty" && team.position > 0) {
      team.position = Math.max(0, team.position - 1);
      events.push("penalty");
    } else if (square.type === "vocab") {
      team.score += 2;
      events.push("vocab");
    } else if (square.type === "help") {
      team.score += 1;
      events.push("help");
    }
    return events;
  }

  function moveTeam(state, teamIndex, steps, reason) {
    const next = cloneState(state);
    if (next.winnerId) return next;
    const team = next.teams[teamIndex];
    if (!team) return next;

    const roll = steps;
    let pos = Math.min(TRACK_LENGTH, team.position + roll);
    team.position = pos;
    team.score += 1;

    const square = squareAt(pos);
    const effects = applySquareEffect(next, team, square);

    if (team.position >= TRACK_LENGTH) {
      next.winnerId = team.id;
      next.lastEvent = { type: "win", teamId: team.id, roll, reason, effects };
      return next;
    }

    next.round += 1;
    next.lastEvent = { type: "move", teamId: team.id, roll, position: team.position, square: square.type, reason, effects };
    return next;
  }

  /** Legacy manual +1 step (teacher override). */
  function scoreBoardTeam(state, teamIndex) {
    return moveTeam(state, teamIndex, 1, "manual");
  }

  function studentTeamId(index) {
    const ids = ["A", "B", "C", "D", "A"];
    return ids[index % ids.length];
  }

  function simulateResponses(question) {
    const opts = questionOptions(question);
    return MOCK_STUDENTS.map((s, i) => ({
      student: s.name,
      teamId: studentTeamId(i),
      answer: opts[i % opts.length],
      correct: i % opts.length === question.correctIndex,
      timeSec: 8 + i * 3,
    }));
  }

  function processCorrectTeams(state, question) {
    let current = cloneState(state);
    if (current.winnerId) return { state: current, rolls: [] };

    const rows = simulateResponses(question);
    const correctTeams = new Set(rows.filter((r) => r.correct).map((r) => r.teamId));
    const rolls = [];

    current.teams.forEach((team, index) => {
      if (!correctTeams.has(team.id) || current.winnerId) return;
      const roll = rollDice();
      const from = current.teams[index].position;
      current = moveTeam(current, index, roll, "correct");
      rolls.push({
        teamId: team.id,
        teamName: teamName(current.teams[index]),
        roll,
        from,
        to: current.teams[index].position,
      });
    });

    if (rolls.length && !current.winnerId) {
      current.lastEvent = { type: "batch", rolls: rolls.map((r) => ({ ...r })) };
    }

    return { state: current, rolls };
  }

  function getRanking(state) {
    return [...state.teams]
      .map((t, index) => ({ ...t, index }))
      .sort((a, b) => b.position - a.position || b.score - a.score);
  }

  function formatLastEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "batch" && Array.isArray(ev.rolls)) {
      if (!ev.rolls.length) return tFn("tlive_board_no_correct");
      return ev.rolls
        .map((r) => tFn("tlive_board_roll_summary", { team: r.teamName, roll: String(r.roll), to: String(r.to) }))
        .join(" · ");
    }
    const team = state.teams.find((x) => x.id === ev.teamId);
    const name = team ? teamName(team) : ev.teamId;
    if (ev.type === "win") {
      return tFn("tlive_board_win", { team: name, roll: String(ev.roll) });
    }
    if (ev.type === "move") {
      const sq = squareAt(ev.position);
      return tFn("tlive_board_move", {
        team: name,
        roll: String(ev.roll),
        pos: String(ev.position),
        square: squareLabel(sq),
      });
    }
    return "";
  }

  function renderTrackMarkup(state, escapeHtml) {
    const cells = [];
    for (let p = 0; p <= TRACK_LENGTH; p += 1) {
      const sq = squareAt(p);
      const tokens = state.teams
        .filter((team) => team.position === p)
        .map(
          (team) =>
            `<span class="tlive-token" style="background:${team.color}" title="${escapeHtml(teamName(team))}" aria-label="${escapeHtml(teamName(team))}"></span>`,
        )
        .join("");
      cells.push(`
        <div class="tlive-track__cell tlive-track__cell--${sq.type}" data-pos="${p}">
          <span class="tlive-track__num">${escapeHtml(squareLabel(sq))}</span>
          <div class="tlive-track__tokens">${tokens || '<span class="tlive-track__empty" aria-hidden="true">·</span>'}</div>
        </div>
      `);
    }
    return `<div class="tlive-track" role="img" aria-label="Board race track">${cells.join("")}</div>`;
  }

  function renderLeaderboardMarkup(state, escapeHtml, tFn) {
    const ranked = getRanking(state);
    const rows = ranked
      .map((team, rank) => {
        const lead = rank === 0 && team.position > 0 ? `<span class="tlive-lead-badge">${escapeHtml(tFn("tlive_board_leader"))}</span>` : "";
        return `
          <tr class="${state.winnerId === team.id ? "tlive-lb-row--winner" : ""}">
            <td>${rank + 1}</td>
            <td><span class="tlive-lb-swatch" style="background:${team.color}"></span> ${escapeHtml(teamName(team))} ${lead}</td>
            <td>${team.position} / ${TRACK_LENGTH}</td>
            <td>${team.score}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <table class="tlive-leaderboard">
        <thead>
          <tr>
            <th>${escapeHtml(tFn("tlive_board_rank"))}</th>
            <th>${escapeHtml(tFn("tlive_board_team"))}</th>
            <th>${escapeHtml(tFn("tlive_board_square"))}</th>
            <th>${escapeHtml(tFn("tlive_board_points"))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
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

  function writeCustomSavedGames(games) {
    try {
      sessionStorage.setItem("eap_teacher_saved_games", JSON.stringify(games));
    } catch (_) {
      /* ignore */
    }
  }

  function isCustomGame(game) {
    return !!(game && game.id && !BUILTIN_GAME_IDS.has(game.id));
  }

  function deleteCustomGame(gameId) {
    if (!gameId || BUILTIN_GAME_IDS.has(gameId)) return false;
    const next = readCustomSavedGames().filter((g) => g.id !== gameId);
    writeCustomSavedGames(next);
    return true;
  }

  const BINGO_TERMS = [
    { term: "analyze", defEn: "examine in detail", defZh: "详细分析" },
    { term: "evidence", defEn: "facts supporting a claim", defZh: "支持论点的证据" },
    { term: "mitigate", defEn: "make less severe", defZh: "减轻、缓和" },
    { term: "hypothesis", defEn: "a testable explanation", defZh: "可检验的假设" },
    { term: "framework", defEn: "structure for understanding", defZh: "理解框架" },
    { term: "implication", defEn: "a possible effect or meaning", defZh: "可能影响或含义" },
    { term: "coherent", defEn: "logical and consistent", defZh: "连贯一致的" },
    { term: "collocation", defEn: "natural word combination", defZh: "词语自然搭配" },
    { term: "subsequently", defEn: "after that; later", defZh: "随后；之后" },
    { term: "significant", defEn: "important; noticeable", defZh: "重要的；显著的" },
    { term: "methodology", defEn: "system of methods used", defZh: "所用方法体系" },
    { term: "paraphrase", defEn: "express in different words", defZh: "改写表达" },
    { term: "synthesis", defEn: "combine ideas into a whole", defZh: "综合整合" },
    { term: "validity", defEn: "soundness of reasoning or data", defZh: "论证或数据的有效性" },
    { term: "variable", defEn: "factor that can change", defZh: "可变因素" },
    { term: "correlation", defEn: "relationship between factors", defZh: "因素间相关关系" },
    { term: "constraint", defEn: "limit or restriction", defZh: "限制条件" },
    { term: "empirical", defEn: "based on observation or data", defZh: "基于观察或数据的" },
    { term: "inference", defEn: "conclusion from evidence", defZh: "根据证据推断" },
    { term: "nuance", defEn: "subtle difference in meaning", defZh: "含义的细微差别" },
    { term: "premise", defEn: "a starting assumption", defZh: "前提假设" },
    { term: "rationale", defEn: "reasoning behind a decision", defZh: "决策背后的理由" },
    { term: "scope", defEn: "range covered by a study", defZh: "研究涵盖范围" },
    { term: "trend", defEn: "general direction of change", defZh: "变化的总趋势" },
  ];

  const BINGO_LINES = (() => {
    const lines = [];
    for (let r = 0; r < 5; r += 1) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
    for (let c = 0; c < 5; c += 1) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
    lines.push([0, 6, 12, 18, 24]);
    lines.push([4, 8, 12, 16, 20]);
    return lines;
  })();

  const MATCHING_PAIRS = [
    { id: "p1", term: "conduct research", defEn: "carry out a study", defZh: "开展研究" },
    { id: "p2", term: "mitigate", defEn: "make less severe", defZh: "减轻、缓和" },
    { id: "p3", term: "hypothesis", defEn: "testable explanation", defZh: "可检验的假设" },
    { id: "p4", term: "implication", defEn: "possible effect or meaning", defZh: "可能影响或含义" },
    { id: "p5", term: "framework", defEn: "structure for understanding", defZh: "理解框架" },
    { id: "p6", term: "paraphrase", defEn: "express in different words", defZh: "改写表达" },
    { id: "p7", term: "empirical", defEn: "based on observation or data", defZh: "基于观察或数据" },
    { id: "p8", term: "validity", defEn: "soundness of reasoning", defZh: "论证的有效性" },
  ];

  const LIVE_TEAMS = [
    { id: "A", name: "Team A", nameZh: "A 组", color: TEAM_COLORS[0] },
    { id: "B", name: "Team B", nameZh: "B 组", color: TEAM_COLORS[1] },
    { id: "C", name: "Team C", nameZh: "C 组", color: TEAM_COLORS[2] },
    { id: "D", name: "Team D", nameZh: "D 组", color: TEAM_COLORS[3] },
  ];

  function shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function termDef(item) {
    return isZh() ? item.defZh : item.defEn;
  }

  function createBingoState() {
    const cells = [];
    let termIdx = 0;
    for (let i = 0; i < 25; i += 1) {
      if (i === 12) {
        cells.push({
          index: i,
          free: true,
          term: "FREE",
          termZh: "免费",
          defEn: "Free space — counts for all teams",
          defZh: "免费格 — 所有小组均算标记",
          marks: { A: true, B: true, C: true, D: true },
        });
      } else {
        const t = BINGO_TERMS[termIdx];
        termIdx += 1;
        cells.push({
          index: i,
          free: false,
          term: t.term,
          termZh: t.term,
          defEn: t.defEn,
          defZh: t.defZh,
          marks: { A: false, B: false, C: false, D: false },
        });
      }
    }
    return {
      cells,
      clueIndex: 0,
      selectedTeam: "A",
      winnerId: null,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
    };
  }

  function bingoClue(state) {
    const nonFree = state.cells.filter((c) => !c.free);
    const idx = state.clueIndex % nonFree.length;
    const cell = nonFree[idx];
    return { cell, index: idx, total: nonFree.length };
  }

  function markBingoCell(state, cellIndex, teamId) {
    const next = {
      ...state,
      cells: state.cells.map((c) => ({ ...c, marks: { ...c.marks } })),
    };
    const cell = next.cells[cellIndex];
    if (!cell || next.winnerId) return next;
    if (!cell.free) cell.marks[teamId] = true;

    for (let t = 0; t < LIVE_TEAMS.length; t += 1) {
      const team = LIVE_TEAMS[t].id;
      const hasLine = BINGO_LINES.some((line) =>
        line.every((i) => next.cells[i].marks[team]),
      );
      if (hasLine) {
        next.winnerId = team;
        break;
      }
    }
    return next;
  }

  function advanceBingoClue(state) {
    const nonFree = state.cells.filter((c) => !c.free);
    return { ...state, clueIndex: (state.clueIndex + 1) % nonFree.length };
  }

  function createMatchingState() {
    const defs = shuffleArr(
      MATCHING_PAIRS.map((p) => ({
        id: `d-${p.id}`,
        pairId: p.id,
        textEn: p.defEn,
        textZh: p.defZh,
      })),
    );
    return {
      pairs: MATCHING_PAIRS.map((p) => ({ ...p })),
      defs,
      matched: {},
      scores: { A: 0, B: 0, C: 0, D: 0 },
      selectedTerm: null,
      selectedTeam: "A",
      winnerId: null,
      winTarget: 6,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
    };
  }

  function matchingDefText(d) {
    return isZh() ? d.textZh : d.textEn;
  }

  function tryMatchingPair(state, termId, defId) {
    const next = {
      ...state,
      matched: { ...state.matched },
      scores: { ...state.scores },
    };
    const def = next.defs.find((d) => d.id === defId);
    if (!def || next.matched[def.pairId] || next.winnerId) {
      return { state: next, ok: false };
    }
    if (def.pairId !== termId) {
      return { state: { ...next, selectedTerm: null }, ok: false };
    }
    next.matched[termId] = next.selectedTeam;
    next.scores[next.selectedTeam] = (next.scores[next.selectedTeam] || 0) + 1;
    next.selectedTerm = null;
    if (next.scores[next.selectedTeam] >= next.winTarget) next.winnerId = next.selectedTeam;
    return { state: next, ok: true };
  }

  const QUIZ_WIN_TARGET = 10;

  function createQuizBattleState() {
    return {
      scores: { A: 0, B: 0, C: 0, D: 0 },
      questionIndex: 0,
      round: 1,
      winnerId: null,
      winTarget: QUIZ_WIN_TARGET,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
    };
  }

  function isChallengeRound(questionIndex) {
    return questionIndex % 3 === 2;
  }

  function awardQuizPoints(state, teamId, points) {
    const next = { ...state, scores: { ...state.scores }, lastEvent: null };
    if (next.winnerId) return next;
    next.scores[teamId] = (next.scores[teamId] || 0) + points;
    next.lastEvent = { type: "award", teamId, points };
    if (next.scores[teamId] >= next.winTarget) next.winnerId = teamId;
    return next;
  }

  function processQuizResponses(state, question) {
    const next = { ...state, scores: { ...state.scores } };
    if (next.winnerId) return next;

    const mult = isChallengeRound(next.questionIndex) ? 2 : 1;
    const rows = simulateResponses(question);
    const perTeam = {};

    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      const pts = perTeam[teamId] * mult;
      next.scores[teamId] = (next.scores[teamId] || 0) + pts;
      if (next.scores[teamId] >= next.winTarget) next.winnerId = teamId;
    });

    next.lastEvent = { type: "batch", perTeam, mult };
    return next;
  }

  function getQuizRanking(state) {
    return LIVE_TEAMS.map((t) => ({
      ...t,
      score: state.scores[t.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  const TREASURE_WIN_KEYS = 4;
  const TREASURE_CLUE_COUNT = TREASURE_CLUES.length;

  function createTreasureHuntState() {
    return {
      unlockedCount: 0,
      questionIndex: 0,
      round: 1,
      teamKeys: { A: 0, B: 0, C: 0, D: 0 },
      winnerId: null,
      winTarget: TREASURE_WIN_KEYS,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
      treasureFound: false,
    };
  }

  function treasureClueLabel(clue) {
    return isZh() ? clue.labelZh : clue.labelEn;
  }

  function treasureClueText(clue) {
    return isZh() ? clue.textZh : clue.textEn;
  }

  function pickTreasureWinner(state) {
    let bestId = null;
    let bestScore = -1;
    LIVE_TEAMS.forEach((team) => {
      const score = state.teamKeys[team.id] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestId = team.id;
      }
    });
    return bestScore >= state.winTarget ? bestId : null;
  }

  function awardTreasureKey(state, teamId, keys) {
    const next = { ...state, teamKeys: { ...state.teamKeys }, lastEvent: null };
    if (next.winnerId) return next;
    const add = keys || 1;
    next.teamKeys[teamId] = (next.teamKeys[teamId] || 0) + add;
    next.lastEvent = { type: "key", teamId, keys: add };
    const winnerId = pickTreasureWinner(next);
    if (winnerId) next.winnerId = winnerId;
    return next;
  }

  function unlockTreasureClue(state) {
    const next = { ...state, lastEvent: null };
    if (next.unlockedCount >= TREASURE_CLUE_COUNT) return next;
    next.unlockedCount = next.unlockedCount + 1;
    next.lastEvent = { type: "clue", index: next.unlockedCount - 1 };
    if (next.unlockedCount >= TREASURE_CLUE_COUNT) {
      next.treasureFound = true;
      if (!next.winnerId) next.winnerId = pickTreasureWinner(next);
    }
    return next;
  }

  function processTreasureResponses(state, question) {
    let next = { ...state, teamKeys: { ...state.teamKeys } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = awardTreasureKey(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    if (Object.keys(perTeam).length && next.unlockedCount < TREASURE_CLUE_COUNT) {
      next = unlockTreasureClue(next);
    }
    return next;
  }

  function getTreasureRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamKeys[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatTreasureEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "key") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_treasure_key_award", {
        team: team ? teamName(team) : ev.teamId,
        keys: String(ev.keys),
      });
    }
    if (ev.type === "clue") {
      const clue = TREASURE_CLUES[ev.index];
      return clue
        ? tFn("tlive_treasure_clue_unlocked", { clue: treasureClueLabel(clue) })
        : tFn("tlive_treasure_clue_unlocked", { clue: String(ev.index + 1) });
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_treasure_batch_key", {
          team: team ? teamName(team) : id,
          keys: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
  }

  function renderTreasureCluesMarkup(state, tFn) {
    const cards = TREASURE_CLUES.map((clue, i) => {
      const unlocked = i < state.unlockedCount;
      return `<li class="tlive-treasure-clue ${unlocked ? "tlive-treasure-clue--open" : "tlive-treasure-clue--locked"}">
        <span class="tlive-treasure-clue__badge">${escapeHtmlTreasure(treasureClueLabel(clue))}</span>
        <p class="tlive-treasure-clue__text">${unlocked ? escapeHtmlTreasure(treasureClueText(clue)) : escapeHtmlTreasure(tFn("tlive_treasure_locked"))}</p>
      </li>`;
    }).join("");
    const treasureOpen = state.treasureFound;
    return `<ol class="tlive-treasure-path">${cards}</ol>
      <div class="tlive-treasure-chest ${treasureOpen ? "tlive-treasure-chest--open" : ""}" role="status">
        <span class="tlive-treasure-chest__icon" aria-hidden="true">${treasureOpen ? "🏆" : "🗝"}</span>
        <p class="tlive-treasure-chest__label">${escapeHtmlTreasure(
          treasureOpen ? tFn("tlive_treasure_found") : tFn("tlive_treasure_goal"),
        )}</p>
      </div>`;
  }

  function escapeHtmlTreasure(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const ESCAPE_TASKS = [
    {
      id: "t1",
      letter: "E",
      labelEn: "Task 1: Hedging",
      labelZh: "任务1：含糊语",
      hintEn: "Identify the hedging device in the sample abstract.",
      hintZh: "在摘要样本中找出含糊限制手段。",
    },
    {
      id: "t2",
      letter: "S",
      labelEn: "Task 2: Collocation",
      labelZh: "任务2：搭配",
      hintEn: "Match the verb that collocates with research.",
      hintZh: "选出与 research 搭配的动词。",
    },
    {
      id: "t3",
      letter: "C",
      labelEn: "Task 3: Citation",
      labelZh: "任务3：引用",
      hintEn: "Find the in-text citation that matches the reference list.",
      hintZh: "找出与参考文献列表一致的文内引用。",
    },
    {
      id: "t4",
      letter: "A",
      labelEn: "Task 4: Argument",
      labelZh: "任务4：论证",
      hintEn: "Select the sentence that states a limitation clearly.",
      hintZh: "选出清楚陈述局限的句子。",
    },
    {
      id: "t5",
      letter: "P",
      labelEn: "Task 5: Paraphrase",
      labelZh: "任务5：转述",
      hintEn: "Choose the acceptable paraphrase of the source sentence.",
      hintZh: "选出对原句可接受的转述。",
    },
  ];

  const ESCAPE_TASK_COUNT = ESCAPE_TASKS.length;
  const ESCAPE_WIN_TASKS = ESCAPE_TASK_COUNT;

  function createEscapeRoomState() {
    return {
      completedCount: 0,
      questionIndex: 0,
      round: 1,
      teamTasks: { A: 0, B: 0, C: 0, D: 0 },
      winnerId: null,
      winTarget: ESCAPE_WIN_TASKS,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
      escaped: false,
    };
  }

  function escapeTaskLabel(task) {
    return isZh() ? task.labelZh : task.labelEn;
  }

  function escapeTaskHint(task) {
    return isZh() ? task.hintZh : task.hintEn;
  }

  function escapePasswordDisplay(state) {
    return ESCAPE_TASKS.map((task, i) => (i < state.completedCount ? task.letter : "•")).join(" ");
  }

  function pickEscapeWinner(state) {
    let bestId = null;
    let bestScore = -1;
    LIVE_TEAMS.forEach((team) => {
      const score = state.teamTasks[team.id] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestId = team.id;
      }
    });
    return bestScore >= state.winTarget ? bestId : null;
  }

  function awardEscapeTask(state, teamId, tasks) {
    const next = { ...state, teamTasks: { ...state.teamTasks }, lastEvent: null };
    if (next.winnerId) return next;
    const add = tasks || 1;
    next.teamTasks[teamId] = (next.teamTasks[teamId] || 0) + add;
    next.lastEvent = { type: "task", teamId, tasks: add };
    const winnerId = pickEscapeWinner(next);
    if (winnerId) next.winnerId = winnerId;
    return next;
  }

  function completeEscapeTask(state) {
    const next = { ...state, lastEvent: null };
    if (next.completedCount >= ESCAPE_TASK_COUNT) return next;
    next.completedCount = next.completedCount + 1;
    const task = ESCAPE_TASKS[next.completedCount - 1];
    next.lastEvent = { type: "letter", index: next.completedCount - 1, letter: task.letter };
    if (next.completedCount >= ESCAPE_TASK_COUNT) {
      next.escaped = true;
      if (!next.winnerId) next.winnerId = pickEscapeWinner(next);
    }
    return next;
  }

  function processEscapeResponses(state, question) {
    let next = { ...state, teamTasks: { ...state.teamTasks } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = awardEscapeTask(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    if (Object.keys(perTeam).length && next.completedCount < ESCAPE_TASK_COUNT) {
      next = completeEscapeTask(next);
    }
    return next;
  }

  function getEscapeRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamTasks[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatEscapeEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "task") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_escape_task_award", {
        team: team ? teamName(team) : ev.teamId,
        tasks: String(ev.tasks),
      });
    }
    if (ev.type === "letter") {
      return tFn("tlive_escape_letter_unlocked", { letter: ev.letter });
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_escape_batch_task", {
          team: team ? teamName(team) : id,
          tasks: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
  }

  function renderEscapeRoomMarkup(state, tFn) {
    const slots = ESCAPE_TASKS.map((task, i) => {
      const open = i < state.completedCount;
      return `<span class="tlive-escape-slot ${open ? "tlive-escape-slot--open" : ""}" aria-label="${open ? task.letter : tFn("tlive_escape_slot_locked")}">${open ? escapeHtmlTreasure(task.letter) : "•"}</span>`;
    }).join("");

    const cards = ESCAPE_TASKS.map((task, i) => {
      const done = i < state.completedCount;
      return `<li class="tlive-escape-task ${done ? "tlive-escape-task--done" : "tlive-escape-task--locked"}">
        <span class="tlive-escape-task__badge">${escapeHtmlTreasure(escapeTaskLabel(task))}</span>
        <p class="tlive-escape-task__text">${done ? escapeHtmlTreasure(tFn("tlive_escape_task_done", { letter: task.letter })) : escapeHtmlTreasure(escapeTaskHint(task))}</p>
      </li>`;
    }).join("");

    const doorOpen = state.escaped;
    return `<div class="tlive-escape-password" role="group" aria-label="${escapeHtmlTreasure(tFn("tlive_escape_password_label"))}">
        <p class="tlive-escape-password__label">${escapeHtmlTreasure(tFn("tlive_escape_password_label"))}</p>
        <div class="tlive-escape-password__slots">${slots}</div>
      </div>
      <ol class="tlive-escape-path">${cards}</ol>
      <div class="tlive-escape-door ${doorOpen ? "tlive-escape-door--open" : ""}" role="status">
        <span class="tlive-escape-door__icon" aria-hidden="true">${doorOpen ? "🚪" : "🔒"}</span>
        <p class="tlive-escape-door__label">${escapeHtmlTreasure(
          doorOpen ? tFn("tlive_escape_door_open") : tFn("tlive_escape_door_locked"),
        )}</p>
      </div>`;
  }

  const WORD_LADDER_SETS = [
    {
      id: "act",
      familyEn: "Word family: act",
      familyZh: "词族：act",
      stepsEn: ["act", "action", "active", "activity", "activate", "activation"],
      stepsZh: ["act", "action", "active", "activity", "activate", "activation"],
      nextPromptEn: [
        "Which word is the noun form related to act?",
        "Which word describes something that acts or has effect?",
        "Which noun names a type of act or process?",
        "Which verb means to put something into action?",
        "Which noun names the process of activating?",
      ],
      nextPromptZh: [
        "哪一个是与 act 相关的名词形式？",
        "哪一个词描述有作用或生效的事物？",
        "哪一个名词表示行为或过程？",
        "哪一个动词表示使……生效？",
        "哪一个名词表示激活的过程？",
      ],
    },
    {
      id: "predict",
      familyEn: "Word family: predict",
      familyZh: "词族：predict",
      stepsEn: ["predict", "prediction", "predictable", "unpredictable"],
      stepsZh: ["predict", "prediction", "predictable", "unpredictable"],
      nextPromptEn: [
        "Which noun names the result of predicting?",
        "Which adjective means able to be predicted?",
        "Which adjective means not able to be predicted?",
      ],
      nextPromptZh: [
        "哪一个名词表示预测的结果？",
        "哪一个形容词表示可预测的？",
        "哪一个形容词表示不可预测的？",
      ],
    },
  ];

  function getWordLadderSet(state) {
    return WORD_LADDER_SETS[state.ladderIndex % WORD_LADDER_SETS.length];
  }

  function ladderSteps(ladder) {
    return isZh() ? ladder.stepsZh : ladder.stepsEn;
  }

  function ladderFamilyLabel(ladder) {
    return isZh() ? ladder.familyZh : ladder.familyEn;
  }

  function ladderWinRung(ladder) {
    return ladderSteps(ladder).length - 1;
  }

  function createWordLadderState(ladderIndex) {
    const ladder = WORD_LADDER_SETS[ladderIndex || 0];
    return {
      ladderIndex: ladderIndex || 0,
      teamRung: { A: 0, B: 0, C: 0, D: 0 },
      questionIndex: 0,
      round: 1,
      winnerId: null,
      winTarget: ladderWinRung(ladder),
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
    };
  }

  function ladderNextPrompt(state) {
    const ladder = getWordLadderSet(state);
    const rung = Math.min(
      Math.max(...LIVE_TEAMS.map((t) => state.teamRung[t.id] || 0)),
      ladderWinRung(ladder) - 1,
    );
    const prompts = isZh() ? ladder.nextPromptZh : ladder.nextPromptEn;
    return prompts[rung] || prompts[prompts.length - 1] || "";
  }

  function climbLadderRung(state, teamId, steps) {
    const next = { ...state, teamRung: { ...state.teamRung }, lastEvent: null };
    if (next.winnerId) return next;
    const ladder = getWordLadderSet(next);
    const max = ladderWinRung(ladder);
    const add = steps || 1;
    const cur = next.teamRung[teamId] || 0;
    next.teamRung[teamId] = Math.min(cur + add, max);
    const word = ladderSteps(ladder)[next.teamRung[teamId]];
    next.lastEvent = { type: "climb", teamId, rung: next.teamRung[teamId], word };
    if (next.teamRung[teamId] >= max) next.winnerId = teamId;
    return next;
  }

  function processWordLadderResponses(state, question) {
    let next = { ...state, teamRung: { ...state.teamRung } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = climbLadderRung(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    return next;
  }

  function getWordLadderRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamRung[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatWordLadderEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "climb") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_ladder_climb_event", {
        team: team ? teamName(team) : ev.teamId,
        word: ev.word || "",
        rung: String(ev.rung + 1),
      });
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_ladder_batch_climb", {
          team: team ? teamName(team) : id,
          steps: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    if (ev.type === "switch") {
      return tFn("tlive_ladder_switched", { family: ev.family });
    }
    return "";
  }

  function renderWordLadderMarkup(state, tFn) {
    const ladder = getWordLadderSet(state);
    const steps = ladderSteps(ladder);
    const rows = [...steps]
      .reverse()
      .map((word, displayIdx) => {
        const rungIndex = steps.length - 1 - displayIdx;
        const isTop = rungIndex === steps.length - 1;
        const teamsHere = LIVE_TEAMS.filter((t) => (state.teamRung[t.id] || 0) === rungIndex)
          .map(
            (t) =>
              `<span class="tlive-ladder-team" style="background:${t.color}" title="${escapeHtmlTreasure(teamName(t))}"></span>`,
          )
          .join("");
        return `<li class="tlive-ladder-rung ${isTop ? "tlive-ladder-rung--top" : ""}">
          <span class="tlive-ladder-rung__num">${rungIndex + 1}</span>
          <span class="tlive-ladder-rung__word">${escapeHtmlTreasure(word)}</span>
          <span class="tlive-ladder-rung__teams">${teamsHere}</span>
        </li>`;
      })
      .join("");
    return `<p class="tlive-ladder-family">${escapeHtmlTreasure(ladderFamilyLabel(ladder))}</p>
      <ol class="tlive-ladder-viz">${rows}</ol>`;
  }

  function switchWordLadder(state, ladderIndex) {
    const ladder = WORD_LADDER_SETS[ladderIndex % WORD_LADDER_SETS.length];
    return {
      ...createWordLadderState(ladderIndex % WORD_LADDER_SETS.length),
      round: state.round,
      lastEvent: { type: "switch", family: ladderFamilyLabel(ladder) },
    };
  }

  const SENTENCE_PUZZLES = [
    {
      id: "p1",
      titleEn: "Topic sentence (hedging)",
      titleZh: "主题句（含糊限制）",
      chunksEn: [
        "Although the sample size was limited,",
        "the results may suggest",
        "a gradual improvement",
        "in academic writing quality.",
      ],
      chunksZh: [
        "尽管样本量有限，",
        "结果可能表明",
        "学术写作质量",
        "有逐步提升。",
      ],
      displayOrder: [1, 3, 0, 2],
      promptEn: "Reorder the chunks into a natural academic topic sentence with hedging.",
      promptZh: "将语块排成带含糊限制语的自然学术主题句。",
    },
    {
      id: "p2",
      titleEn: "Cause–effect sentence",
      titleZh: "因果句",
      chunksEn: [
        "Because participants received weekly feedback,",
        "their thesis statements",
        "became more focused",
        "over the semester.",
      ],
      chunksZh: [
        "由于参与者每周获得反馈，",
        "他们的论文主旨句",
        "在一学期内",
        "变得更加聚焦。",
      ],
      displayOrder: [2, 0, 3, 1],
      promptEn: "Put the chunks in order to show a clear cause–effect structure.",
      promptZh: "按顺序排列语块以呈现清晰的因果关系。",
    },
    {
      id: "p3",
      titleEn: "Thesis statement",
      titleZh: "论文主旨句",
      chunksEn: [
        "This essay argues that",
        "explicit citation instruction",
        "can reduce plagiarism risk",
        "in first-year EAP programmes.",
      ],
      chunksZh: [
        "本文主张",
        "明确的引用教学",
        "可降低",
        "一年级 EAP 课程中的抄袭风险。",
      ],
      displayOrder: [3, 1, 0, 2],
      promptEn: "Arrange the chunks into a strong academic thesis statement.",
      promptZh: "将语块排列成有力的学术论文主旨句。",
    },
  ];

  const SENTENCE_WIN_TARGET = 3;
  const SENTENCE_PUZZLE_COUNT = SENTENCE_PUZZLES.length;

  function getSentencePuzzle(state) {
    return SENTENCE_PUZZLES[state.puzzleIndex % SENTENCE_PUZZLE_COUNT];
  }

  function sentenceChunks(puzzle) {
    return isZh() ? puzzle.chunksZh : puzzle.chunksEn;
  }

  function sentencePuzzleTitle(puzzle) {
    return isZh() ? puzzle.titleZh : puzzle.titleEn;
  }

  function sentencePuzzlePrompt(puzzle) {
    return isZh() ? puzzle.promptZh : puzzle.promptEn;
  }

  function sentenceCorrectText(puzzle) {
    return sentenceChunks(puzzle).join(" ");
  }

  function createSentenceBuilderState(puzzleIndex) {
    return {
      puzzleIndex: puzzleIndex || 0,
      teamScores: { A: 0, B: 0, C: 0, D: 0 },
      questionIndex: 0,
      round: 1,
      winnerId: null,
      winTarget: SENTENCE_WIN_TARGET,
      answerRevealed: false,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
    };
  }

  function awardSentencePoint(state, teamId, points) {
    const next = { ...state, teamScores: { ...state.teamScores }, lastEvent: null };
    if (next.winnerId) return next;
    const add = points || 1;
    next.teamScores[teamId] = (next.teamScores[teamId] || 0) + add;
    next.lastEvent = { type: "point", teamId, points: add };
    if (next.teamScores[teamId] >= next.winTarget) next.winnerId = teamId;
    return next;
  }

  function revealSentenceAnswer(state) {
    return { ...state, answerRevealed: true, lastEvent: { type: "reveal" } };
  }

  function nextSentencePuzzle(state) {
    const nextIndex = (state.puzzleIndex + 1) % SENTENCE_PUZZLE_COUNT;
    return {
      ...createSentenceBuilderState(nextIndex),
      teamScores: { ...state.teamScores },
      winnerId: state.winnerId,
      round: state.round + 1,
      lastEvent: { type: "next", index: nextIndex },
    };
  }

  function processSentenceResponses(state, question) {
    let next = { ...state, teamScores: { ...state.teamScores } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = awardSentencePoint(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    if (Object.keys(perTeam).length) next = revealSentenceAnswer(next);
    return next;
  }

  function getSentenceRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamScores[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatSentenceEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "point") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_sentence_point", {
        team: team ? teamName(team) : ev.teamId,
        pts: String(ev.points),
      });
    }
    if (ev.type === "reveal") return tFn("tlive_sentence_revealed");
    if (ev.type === "next") {
      const puzzle = SENTENCE_PUZZLES[ev.index];
      return puzzle ? tFn("tlive_sentence_next_puzzle", { title: sentencePuzzleTitle(puzzle) }) : "";
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_sentence_batch_pts", {
          team: team ? teamName(team) : id,
          pts: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
  }

  function renderSentenceBuilderMarkup(state, tFn) {
    const puzzle = getSentencePuzzle(state);
    const chunks = sentenceChunks(puzzle);
    const order = puzzle.displayOrder || chunks.map((_, i) => i);
    const scrambled = order
      .map((idx, pos) => {
        return `<span class="tlive-sentence-chunk" data-pos="${pos + 1}"><span class="tlive-sentence-chunk__n">${pos + 1}</span>${escapeHtmlTreasure(chunks[idx])}</span>`;
      })
      .join("");

    const answerBlock = state.answerRevealed
      ? `<div class="tlive-sentence-answer" role="status">
          <p class="tlive-sentence-answer__label">${escapeHtmlTreasure(tFn("tlive_sentence_correct"))}</p>
          <p class="tlive-sentence-answer__text">${escapeHtmlTreasure(sentenceCorrectText(puzzle))}</p>
        </div>`
      : `<p class="tlive-sentence-hint">${escapeHtmlTreasure(tFn("tlive_sentence_hidden"))}</p>`;

    return `<div class="tlive-sentence-puzzle">
        <h3 class="tlive-sentence-puzzle__title">${escapeHtmlTreasure(sentencePuzzleTitle(puzzle))}</h3>
        <p class="tlive-sentence-puzzle__prompt">${escapeHtmlTreasure(sentencePuzzlePrompt(puzzle))}</p>
        <div class="tlive-sentence-chunks">${scrambled}</div>
        ${answerBlock}
      </div>`;
  }

  const ARGUMENT_ROLES = [
    { key: "claim", labelEn: "Claim", labelZh: "主张" },
    { key: "reason", labelEn: "Reason", labelZh: "理由" },
    { key: "evidence", labelEn: "Evidence", labelZh: "论据" },
    { key: "example", labelEn: "Example", labelZh: "例证" },
    { key: "counter", labelEn: "Counterargument", labelZh: "反驳" },
  ];

  const ARGUMENT_SETS = [
    {
      id: "a1",
      titleEn: "Citation instruction (paragraph)",
      titleZh: "引用教学（段落论证）",
      promptEn: "Sort each part into the correct place in the argument structure.",
      promptZh: "将各部分放入论证结构中的正确位置。",
      parts: {
        claim: {
          en: "Universities should teach explicit citation skills in first-year EAP courses.",
          zh: "高校应在一年级 EAP 课程中教授明确的引用技能。",
        },
        reason: {
          en: "Students often lack awareness of how to paraphrase sources appropriately.",
          zh: "学生常常不清楚如何恰当转述文献。",
        },
        evidence: {
          en: "A 2022 survey of 240 students found that 38% could not identify patchwriting.",
          zh: "一项针对240名学生的2022年调查发现，38%无法识别拼凑式写作。",
        },
        example: {
          en: "For instance, one cohort improved draft similarity scores after six weeks of practice.",
          zh: "例如，某班在六周训练后抄袭检测分数有所改善。",
        },
        counter: {
          en: "Some teachers argue that citation rules reduce students’ authentic voice.",
          zh: "有教师认为引用规范会削弱学生的真实表达。",
        },
      },
      poolOrder: ["evidence", "counter", "claim", "example", "reason"],
    },
    {
      id: "a2",
      titleEn: "Online learning (short essay)",
      titleZh: "在线学习（短文论证）",
      promptEn: "Match each card to claim, reason, evidence, example, or counterargument.",
      promptZh: "将每张卡片对应到主张、理由、论据、例证或反驳。",
      parts: {
        claim: {
          en: "Blended EAP classes may support academic writing more than fully online formats.",
          zh: "混合式 EAP 课堂可能比纯在线形式更有利于学术写作。",
        },
        reason: {
          en: "Face-to-face feedback helps students revise thesis statements more precisely.",
          zh: "面对面反馈有助于学生更精确地修改论文主旨句。",
        },
        evidence: {
          en: "Pilot data showed hybrid groups scored 12% higher on structure rubrics.",
          zh: "试点数据显示混合班在结构评分表上高出12%。",
        },
        example: {
          en: "In week 8, Group B reorganised body paragraphs after a live clinic.",
          zh: "第8周，B组在现场辅导后重组了主体段。",
        },
        counter: {
          en: "However, online modules offer flexibility for students with work commitments.",
          zh: "然而，在线模块为有工作的学生提供了灵活性。",
        },
      },
      poolOrder: ["reason", "claim", "example", "evidence", "counter"],
    },
  ];

  const ARGUMENT_WIN_TARGET = 3;
  const ARGUMENT_SET_COUNT = ARGUMENT_SETS.length;

  function argumentRoleLabel(role) {
    return isZh() ? role.labelZh : role.labelEn;
  }

  function argumentPartText(set, key) {
    const part = set.parts[key];
    if (!part) return "";
    return isZh() ? part.zh : part.en;
  }

  function getArgumentSet(state) {
    return ARGUMENT_SETS[state.setIndex % ARGUMENT_SET_COUNT];
  }

  function argumentSetTitle(set) {
    return isZh() ? set.titleZh : set.titleEn;
  }

  function argumentSetPrompt(set) {
    return isZh() ? set.promptZh : set.promptEn;
  }

  function createArgumentSortingState(setIndex) {
    return {
      setIndex: setIndex || 0,
      teamScores: { A: 0, B: 0, C: 0, D: 0 },
      questionIndex: 0,
      round: 1,
      winnerId: null,
      winTarget: ARGUMENT_WIN_TARGET,
      structureRevealed: false,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
    };
  }

  function awardArgumentPoint(state, teamId, points) {
    const next = { ...state, teamScores: { ...state.teamScores }, lastEvent: null };
    if (next.winnerId) return next;
    const add = points || 1;
    next.teamScores[teamId] = (next.teamScores[teamId] || 0) + add;
    next.lastEvent = { type: "point", teamId, points: add };
    if (next.teamScores[teamId] >= next.winTarget) next.winnerId = teamId;
    return next;
  }

  function revealArgumentStructure(state) {
    return { ...state, structureRevealed: true, lastEvent: { type: "reveal" } };
  }

  function nextArgumentSet(state) {
    const nextIndex = (state.setIndex + 1) % ARGUMENT_SET_COUNT;
    return {
      ...createArgumentSortingState(nextIndex),
      teamScores: { ...state.teamScores },
      winnerId: state.winnerId,
      round: state.round + 1,
      lastEvent: { type: "next", index: nextIndex },
    };
  }

  function processArgumentResponses(state, question) {
    let next = { ...state, teamScores: { ...state.teamScores } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = awardArgumentPoint(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    if (Object.keys(perTeam).length) next = revealArgumentStructure(next);
    return next;
  }

  function getArgumentRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamScores[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatArgumentEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "point") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_argument_point", {
        team: team ? teamName(team) : ev.teamId,
        pts: String(ev.points),
      });
    }
    if (ev.type === "reveal") return tFn("tlive_argument_revealed");
    if (ev.type === "next") {
      const set = ARGUMENT_SETS[ev.index];
      return set ? tFn("tlive_argument_next_set", { title: argumentSetTitle(set) }) : "";
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_argument_batch_pts", {
          team: team ? teamName(team) : id,
          pts: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
  }

  function renderArgumentSortingMarkup(state, tFn) {
    const set = getArgumentSet(state);
    const revealed = state.structureRevealed;

    const slots = ARGUMENT_ROLES.map((role) => {
      const text = revealed
        ? argumentPartText(set, role.key)
        : tFn("tlive_argument_slot_empty");
      return `<li class="tlive-argument-slot ${revealed ? "tlive-argument-slot--filled" : ""}">
        <span class="tlive-argument-slot__role">${escapeHtmlTreasure(argumentRoleLabel(role))}</span>
        <p class="tlive-argument-slot__text">${escapeHtmlTreasure(text)}</p>
      </li>`;
    }).join("");

    const pool = (set.poolOrder || ARGUMENT_ROLES.map((r) => r.key))
      .map((key, pos) => {
        const role = ARGUMENT_ROLES.find((r) => r.key === key);
        const label = role ? argumentRoleLabel(role) : key;
        return `<span class="tlive-argument-card">
          <span class="tlive-argument-card__n">${pos + 1}</span>
          <span class="tlive-argument-card__role">${escapeHtmlTreasure(label)}</span>
          <span class="tlive-argument-card__text">${escapeHtmlTreasure(argumentPartText(set, key))}</span>
        </span>`;
      })
      .join("");

    return `<div class="tlive-argument-puzzle">
        <h3 class="tlive-argument-puzzle__title">${escapeHtmlTreasure(argumentSetTitle(set))}</h3>
        <p class="tlive-argument-puzzle__prompt">${escapeHtmlTreasure(argumentSetPrompt(set))}</p>
        <div class="tlive-argument-layout">
          <div class="tlive-argument-slots">
            <p class="tlive-argument-slots__heading">${escapeHtmlTreasure(tFn("tlive_argument_structure"))}</p>
            <ol>${slots}</ol>
          </div>
          <div class="tlive-argument-pool">
            <p class="tlive-argument-pool__heading">${escapeHtmlTreasure(tFn("tlive_argument_pool"))}</p>
            <div class="tlive-argument-cards">${pool}</div>
          </div>
        </div>
        ${revealed ? "" : `<p class="tlive-argument-hint">${escapeHtmlTreasure(tFn("tlive_argument_hidden"))}</p>`}
      </div>`;
  }

  const SUMMARY_STEP_DEFS = [
    {
      key: "main_idea",
      labelEn: "Identify main idea",
      labelZh: "识别主旨",
      taskEn: "State the main idea of the passage in one sentence.",
      taskZh: "用一句话写出段落主旨。",
    },
    {
      key: "key_points",
      labelEn: "Select key points",
      labelZh: "选择要点",
      taskEn: "List two key points that support the main idea.",
      taskZh: "列出两个支持主旨的要点。",
    },
    {
      key: "remove_details",
      labelEn: "Remove minor details",
      labelZh: "删除次要细节",
      taskEn: "Name one detail that should be left out of the summary.",
      taskZh: "指出一个应省略的细节。",
    },
    {
      key: "paraphrase",
      labelEn: "Paraphrase",
      labelZh: "转述",
      taskEn: "Paraphrase one key sentence without copying phrases.",
      taskZh: "转述一个关键句，避免照搬原句。",
    },
    {
      key: "organise",
      labelEn: "Organise structure",
      labelZh: "组织结构",
      taskEn: "Order the summary points logically (general → specific).",
      taskZh: "按逻辑排列摘要要点（由概括到具体）。",
    },
    {
      key: "final",
      labelEn: "Write final summary",
      labelZh: "写出完整摘要",
      taskEn: "Combine your work into a 60–80 word summary.",
      taskZh: "整合为 60–80 词的完整摘要。",
    },
  ];

  const SUMMARY_MISSIONS = [
    {
      id: "m1",
      titleEn: "Research article excerpt",
      titleZh: "研究论文节选",
      passageEn:
        "A 2022 study of 240 first-year students found that explicit citation instruction reduced patchwriting by 18%. However, the sample came from one faculty only. Weekly paraphrasing practice and feedback were the main interventions. Some instructors worried that strict rules might limit voice.",
      passageZh:
        "一项针对240名一年级学生的2022年研究发现，明确的引用教学使拼凑式写作减少18%。然而，样本仅来自一个学院。每周转述练习与反馈是主要干预措施。部分教师担心严格规范会限制表达个性。",
      finalEn:
        "A 2022 single-faculty study reported that citation instruction and weekly paraphrasing practice reduced patchwriting among first-year students, though instructors raised concerns about student voice.",
      finalZh:
        "2022年一项单学院研究表明，引用教学与每周转述练习减少了一年级学生的拼凑式写作，但教师对表达个性有所顾虑。",
    },
    {
      id: "m2",
      titleEn: "Lecture on blended learning",
      titleZh: "混合式学习讲座",
      passageEn:
        "The lecturer argued that hybrid EAP classes may improve thesis development more than fully online courses. Pilot scores on structure rubrics were 12% higher for hybrid groups. Students valued flexibility in online modules. Face-to-face clinics helped groups reorganise body paragraphs in week 8.",
      passageZh:
        "讲座者认为混合式 EAP 课程可能比纯在线课程更有利于论文主旨发展。试点中混合班结构评分高出12%。学生重视在线模块的灵活性。第8周面对面辅导帮助小组重组主体段。",
      finalEn:
        "The lecture suggested hybrid EAP classes can support thesis and paragraph structure better than online-only formats, while students still benefit from flexible online components.",
      finalZh:
        "讲座指出混合式 EAP 比纯在线更有利于主旨与段落结构，学生仍受益于灵活的在线部分。",
    },
  ];

  const SUMMARY_STEP_COUNT = SUMMARY_STEP_DEFS.length;
  const SUMMARY_MISSION_COUNT = SUMMARY_MISSIONS.length;
  const SUMMARY_WIN_STEPS = SUMMARY_STEP_COUNT;

  function summaryStepLabel(step) {
    return isZh() ? step.labelZh : step.labelEn;
  }

  function summaryStepTask(step) {
    return isZh() ? step.taskZh : step.taskEn;
  }

  function getSummaryMission(state) {
    return SUMMARY_MISSIONS[state.missionIndex % SUMMARY_MISSION_COUNT];
  }

  function summaryMissionTitle(mission) {
    return isZh() ? mission.titleZh : mission.titleEn;
  }

  function summaryPassageText(mission) {
    return isZh() ? mission.passageZh : mission.passageEn;
  }

  function summaryFinalText(mission) {
    return isZh() ? mission.finalZh : mission.finalEn;
  }

  function currentSummaryStep(state) {
    const idx = Math.min(state.completedSteps, SUMMARY_STEP_COUNT - 1);
    return SUMMARY_STEP_DEFS[idx];
  }

  function createSummaryMissionState(missionIndex) {
    return {
      missionIndex: missionIndex || 0,
      completedSteps: 0,
      teamSteps: { A: 0, B: 0, C: 0, D: 0 },
      questionIndex: 0,
      round: 1,
      winnerId: null,
      winTarget: SUMMARY_WIN_STEPS,
      finalRevealed: false,
      missionComplete: false,
      teams: LIVE_TEAMS.map((x) => ({ ...x })),
      lastEvent: null,
    };
  }

  function awardSummaryStep(state, teamId, steps) {
    const next = { ...state, teamSteps: { ...state.teamSteps }, lastEvent: null };
    if (next.winnerId) return next;
    const add = steps || 1;
    const max = next.winTarget;
    next.teamSteps[teamId] = Math.min((next.teamSteps[teamId] || 0) + add, max);
    next.lastEvent = { type: "step", teamId, steps: add };
    if (next.teamSteps[teamId] >= max) next.winnerId = teamId;
    return next;
  }

  function completeSummaryMissionStep(state) {
    const next = { ...state, lastEvent: null };
    if (next.completedSteps >= SUMMARY_STEP_COUNT) return next;
    next.completedSteps = next.completedSteps + 1;
    const step = SUMMARY_STEP_DEFS[next.completedSteps - 1];
    next.lastEvent = { type: "complete", step: summaryStepLabel(step) };
    if (next.completedSteps >= SUMMARY_STEP_COUNT) {
      next.missionComplete = true;
      if (!next.winnerId) {
        let bestId = null;
        let best = -1;
        LIVE_TEAMS.forEach((t) => {
          const s = next.teamSteps[t.id] || 0;
          if (s > best) {
            best = s;
            bestId = t.id;
          }
        });
        if (bestId && best >= next.winTarget) next.winnerId = bestId;
      }
    }
    return next;
  }

  function revealSummaryFinal(state) {
    return { ...state, finalRevealed: true, lastEvent: { type: "reveal" } };
  }

  function nextSummaryMission(state) {
    const nextIndex = (state.missionIndex + 1) % SUMMARY_MISSION_COUNT;
    return {
      ...createSummaryMissionState(nextIndex),
      teamSteps: { ...state.teamSteps },
      winnerId: state.winnerId,
      round: state.round + 1,
      lastEvent: { type: "next", index: nextIndex },
    };
  }

  function processSummaryResponses(state, question) {
    let next = { ...state, teamSteps: { ...state.teamSteps } };
    if (next.winnerId) return next;

    const rows = simulateResponses(question);
    const perTeam = {};
    rows.forEach((r) => {
      if (r.correct) perTeam[r.teamId] = (perTeam[r.teamId] || 0) + 1;
    });

    Object.keys(perTeam).forEach((teamId) => {
      next = awardSummaryStep(next, teamId, perTeam[teamId]);
    });

    next.lastEvent = { type: "batch", perTeam };
    if (Object.keys(perTeam).length && next.completedSteps < SUMMARY_STEP_COUNT) {
      next = completeSummaryMissionStep(next);
    }
    return next;
  }

  function getSummaryRanking(state) {
    return LIVE_TEAMS.map((team) => ({
      ...team,
      score: state.teamSteps[team.id] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  function formatSummaryEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "step") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_summary_step_award", {
        team: team ? teamName(team) : ev.teamId,
        steps: String(ev.steps),
      });
    }
    if (ev.type === "complete") return tFn("tlive_summary_step_done", { step: ev.step });
    if (ev.type === "reveal") return tFn("tlive_summary_final_revealed");
    if (ev.type === "next") {
      const mission = SUMMARY_MISSIONS[ev.index];
      return mission ? tFn("tlive_summary_next_mission", { title: summaryMissionTitle(mission) }) : "";
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        return tFn("tlive_summary_batch_step", {
          team: team ? teamName(team) : id,
          steps: String(ev.perTeam[id]),
        });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
  }

  function renderSummaryMissionMarkup(state, tFn) {
    const mission = getSummaryMission(state);
    const stepList = SUMMARY_STEP_DEFS.map((step, i) => {
      const done = i < state.completedSteps;
      const current = i === state.completedSteps && !state.missionComplete;
      return `<li class="tlive-summary-step ${done ? "tlive-summary-step--done" : ""} ${current ? "tlive-summary-step--current" : ""}">
        <span class="tlive-summary-step__icon">${done ? "✓" : current ? "→" : "○"}</span>
        <span class="tlive-summary-step__label">${escapeHtmlTreasure(summaryStepLabel(step))}</span>
      </li>`;
    }).join("");

    const finalBlock =
      state.finalRevealed || state.missionComplete
        ? `<div class="tlive-summary-final" role="status">
            <p class="tlive-summary-final__label">${escapeHtmlTreasure(tFn("tlive_summary_model"))}</p>
            <p class="tlive-summary-final__text">${escapeHtmlTreasure(summaryFinalText(mission))}</p>
          </div>`
        : "";

    return `<div class="tlive-summary-mission">
        <h3 class="tlive-summary-mission__title">${escapeHtmlTreasure(summaryMissionTitle(mission))}</h3>
        <blockquote class="tlive-summary-passage">${escapeHtmlTreasure(summaryPassageText(mission))}</blockquote>
        <ol class="tlive-summary-steps">${stepList}</ol>
        <p class="tlive-summary-current-task"><strong>${escapeHtmlTreasure(tFn("tlive_summary_current"))}</strong> ${escapeHtmlTreasure(summaryStepTask(currentSummaryStep(state)))}</p>
        ${finalBlock}
      </div>`;
  }

  function formatQuizEvent(state, tFn) {
    const ev = state.lastEvent;
    if (!ev) return "";
    if (ev.type === "award") {
      const team = LIVE_TEAMS.find((x) => x.id === ev.teamId);
      return tFn("tlive_quiz_award", {
        team: team ? teamName(team) : ev.teamId,
        pts: String(ev.points),
      });
    }
    if (ev.type === "batch" && ev.perTeam) {
      const parts = Object.keys(ev.perTeam).map((id) => {
        const team = LIVE_TEAMS.find((x) => x.id === id);
        const pts = ev.perTeam[id] * ev.mult;
        return tFn("tlive_quiz_batch_pts", { team: team ? teamName(team) : id, pts: String(pts) });
      });
      return parts.length ? parts.join(" · ") : tFn("tlive_board_no_correct");
    }
    return "";
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
    TRACK_LENGTH,
    SQUARE_DEFS,
    createBoardState,
    rollDice,
    moveTeam,
    scoreBoardTeam,
    processCorrectTeams,
    getRanking,
    squareAt,
    squareLabel,
    teamName,
    formatLastEvent,
    renderTrackMarkup,
    renderLeaderboardMarkup,
    simulateResponses,
    studentTeamId,
    allSavedGames,
    isCustomGame,
    deleteCustomGame,
    BUILTIN_GAME_IDS,
    LIVE_TEAMS,
    createBingoState,
    bingoClue,
    markBingoCell,
    advanceBingoClue,
    termDef,
    createMatchingState,
    tryMatchingPair,
    matchingDefText,
    MATCHING_PAIRS,
    createQuizBattleState,
    awardQuizPoints,
    processQuizResponses,
    getQuizRanking,
    formatQuizEvent,
    isChallengeRound,
    QUIZ_WIN_TARGET,
    TREASURE_CLUES,
    TREASURE_CLUE_COUNT,
    createTreasureHuntState,
    awardTreasureKey,
    unlockTreasureClue,
    processTreasureResponses,
    getTreasureRanking,
    formatTreasureEvent,
    renderTreasureCluesMarkup,
    treasureClueLabel,
    treasureClueText,
    TREASURE_WIN_KEYS,
    ESCAPE_TASKS,
    ESCAPE_TASK_COUNT,
    createEscapeRoomState,
    awardEscapeTask,
    completeEscapeTask,
    processEscapeResponses,
    getEscapeRanking,
    formatEscapeEvent,
    renderEscapeRoomMarkup,
    escapePasswordDisplay,
    ESCAPE_WIN_TASKS,
    WORD_LADDER_SETS,
    createWordLadderState,
    getWordLadderSet,
    ladderSteps,
    ladderFamilyLabel,
    ladderWinRung,
    ladderNextPrompt,
    climbLadderRung,
    processWordLadderResponses,
    getWordLadderRanking,
    formatWordLadderEvent,
    renderWordLadderMarkup,
    switchWordLadder,
    SENTENCE_PUZZLES,
    SENTENCE_PUZZLE_COUNT,
    SENTENCE_WIN_TARGET,
    createSentenceBuilderState,
    getSentencePuzzle,
    sentencePuzzleTitle,
    sentencePuzzlePrompt,
    awardSentencePoint,
    revealSentenceAnswer,
    nextSentencePuzzle,
    processSentenceResponses,
    getSentenceRanking,
    formatSentenceEvent,
    renderSentenceBuilderMarkup,
    ARGUMENT_ROLES,
    ARGUMENT_SETS,
    ARGUMENT_SET_COUNT,
    ARGUMENT_WIN_TARGET,
    createArgumentSortingState,
    getArgumentSet,
    argumentSetTitle,
    awardArgumentPoint,
    revealArgumentStructure,
    nextArgumentSet,
    processArgumentResponses,
    getArgumentRanking,
    formatArgumentEvent,
    renderArgumentSortingMarkup,
    SUMMARY_STEP_DEFS,
    SUMMARY_MISSIONS,
    SUMMARY_STEP_COUNT,
    SUMMARY_MISSION_COUNT,
    SUMMARY_WIN_STEPS,
    createSummaryMissionState,
    getSummaryMission,
    currentSummaryStep,
    awardSummaryStep,
    completeSummaryMissionStep,
    revealSummaryFinal,
    nextSummaryMission,
    processSummaryResponses,
    getSummaryRanking,
    formatSummaryEvent,
    renderSummaryMissionMarkup,
  };
})(typeof window !== "undefined" ? window : globalThis);
