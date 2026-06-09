/**
 * SS-V3 — Vocabulary Star Battle (space war) + Speed Race.
 */
(function (global) {
  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function pickPrompt(round) {
    return round.promptEn || round.word || "";
  }

  function mountStarBattle(root, games, onComplete) {
    const rounds = (games && games.rounds) || [];
    const timeLimit = (games && games.timeLimitSec) || 45;
    let idx = 0;
    let score = 0;
    let lives = (games && games.lives) || 3;
    let timeLeft = timeLimit;
    let timerId = null;
    let locked = false;

    function stopTimer() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function finish() {
      stopTimer();
      root.classList.remove("ssc-game--pulse");
      onComplete({ score, total: rounds.length, lives });
    }

    function tick() {
      timeLeft -= 1;
      const el = root.querySelector("#ssc-game-timer");
      if (el) el.textContent = String(timeLeft);
      if (timeLeft <= 10) root.classList.add("ssc-game--pulse");
      if (timeLeft <= 0) finish();
    }

    function spawnLaser(arena, fromBtn) {
      const laser = document.createElement("div");
      laser.className = "ssc-game-laser";
      const rect = fromBtn.getBoundingClientRect();
      const arenaRect = arena.getBoundingClientRect();
      laser.style.left = `${rect.left - arenaRect.left + rect.width / 2}px`;
      laser.style.bottom = `${arenaRect.bottom - rect.bottom + 20}px`;
      arena.appendChild(laser);
      setTimeout(() => laser.remove(), 400);
    }

    function renderRound() {
      const r = rounds[idx];
      if (!r) return finish();
      const opts = r.options || [];
      root.innerHTML = `
        <div class="ssc-game ssc-game--star">
          <div class="ssc-game-hud">
            <span class="ssc-game-hud__lives" title="lives">${"★".repeat(lives)}${"☆".repeat(Math.max(0, 3 - lives))}</span>
            <span class="ssc-game-hud__score">${t("self_study_vocab_game_score", { n: String(score) })}</span>
            <span class="ssc-game-hud__timer"><span id="ssc-game-timer">${timeLeft}</span>s</span>
          </div>
          <div class="ssc-game-arena ssc-game-arena--space">
            <div class="ssc-game-starfield" aria-hidden="true"></div>
            <div class="ssc-game-enemy" aria-hidden="true">👾</div>
            <div class="ssc-game-player" aria-hidden="true">🚀</div>
            <p class="ssc-game-prompt ssc-game-prompt--space">${escapeHtml(pickPrompt(r))}</p>
            <div class="ssc-game-options ssc-game-options--space">
              ${opts
                .map(
                  (o, i) =>
                    `<button type="button" class="ssc-game-opt ssc-game-opt--space" data-i="${i}">${escapeHtml(o)}</button>`,
                )
                .join("")}
            </div>
          </div>
          <p class="ssc-game-round">${t("self_study_vocab_game_wave", { current: String(idx + 1), total: String(rounds.length) })}</p>
        </div>
      `;
      const arena = root.querySelector(".ssc-game-arena");
      root.querySelectorAll(".ssc-game-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (locked) return;
          locked = true;
          const pick = parseInt(btn.getAttribute("data-i"), 10);
          const ok = pick === r.correctIndex;
          spawnLaser(arena, btn);
          const enemy = root.querySelector(".ssc-game-enemy");
          if (enemy) enemy.classList.add(ok ? "ssc-game-enemy--hit" : "ssc-game-enemy--dodge");
          btn.classList.add(ok ? "ssc-game-opt--ok" : "ssc-game-opt--bad");
          if (ok) score += 1;
          else lives -= 1;
          setTimeout(() => {
            locked = false;
            idx += 1;
            if (lives <= 0 || idx >= rounds.length) finish();
            else renderRound();
          }, ok ? 320 : 560);
        });
      });
    }

    stopTimer();
    timerId = setInterval(tick, 1000);
    renderRound();
    return () => stopTimer();
  }

  function mountSpeedRace(root, games, onComplete) {
    const rounds = (games && games.rounds) || [];
    const timeLimit = (games && games.timeLimitSec) || 45;
    let idx = 0;
    let score = 0;
    let progress = 0;
    let timeLeft = timeLimit;
    let timerId = null;
    let locked = false;

    function stopTimer() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function finish() {
      stopTimer();
      onComplete({ score, total: rounds.length, progress });
    }

    function tick() {
      timeLeft -= 1;
      const el = root.querySelector("#ssc-game-timer");
      if (el) el.textContent = String(timeLeft);
      if (timeLeft <= 0) finish();
    }

    function renderRound() {
      const r = rounds[idx];
      if (!r) return finish();
      const opts = r.options || [];
      const pct = Math.min(92, Math.round((progress / Math.max(1, rounds.length)) * 92));
      root.innerHTML = `
        <div class="ssc-game ssc-game--race">
          <div class="ssc-game-hud">
            <span class="ssc-game-hud__score">${t("self_study_vocab_game_score", { n: String(score) })}</span>
            <span class="ssc-game-hud__timer"><span id="ssc-game-timer">${timeLeft}</span>s</span>
          </div>
          <div class="ssc-game-track-wrap">
            <div class="ssc-game-track">
              <div class="ssc-game-car" style="left:${pct}%">🏎️</div>
              <div class="ssc-game-track__finish"></div>
            </div>
          </div>
          <p class="ssc-game-prompt">${escapeHtml(pickPrompt(r))}</p>
          <div class="ssc-game-options ssc-game-options--race">
            ${opts
              .map(
                (o, i) =>
                  `<button type="button" class="ssc-game-opt" data-i="${i}">${escapeHtml(o)}</button>`,
              )
              .join("")}
          </div>
          <p class="ssc-game-round">${idx + 1} / ${rounds.length}</p>
        </div>
      `;
      root.querySelectorAll(".ssc-game-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (locked) return;
          locked = true;
          const pick = parseInt(btn.getAttribute("data-i"), 10);
          const ok = pick === r.correctIndex;
          btn.classList.add(ok ? "ssc-game-opt--ok" : "ssc-game-opt--bad");
          if (ok) {
            score += 1;
            progress += 1;
          } else {
            progress = Math.max(0, progress - 0.5);
          }
          setTimeout(() => {
            locked = false;
            idx += 1;
            if (idx >= rounds.length) finish();
            else renderRound();
          }, ok ? 200 : 400);
        });
      });
    }

    if (!rounds.length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_practice_today")}</p>`;
      return () => {};
    }

    stopTimer();
    timerId = setInterval(tick, 1000);
    renderRound();
    return () => stopTimer();
  }

  global.EAP_VOCAB_GAMES = {
    mountStarBattle,
    mountSpeedRace,
  };
})(typeof window !== "undefined" ? window : globalThis);
