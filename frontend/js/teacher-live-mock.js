/**
 * Teacher Live Teaching — mock games & student responses (Phase L).
 */
(function (global) {
  const BUILTIN_GAME_IDS = new Set(["board-race", "vocab-bingo", "matching-race"]);

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
  };
})(typeof window !== "undefined" ? window : globalThis);
