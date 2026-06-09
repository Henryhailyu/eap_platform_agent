/**
 * SS-V1 — server-backed vocabulary module (Channel A packs + Channel B AI course).
 */
(function (global) {
  const SERVER = () => global.EAP_SELF_STUDY_SERVER;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function promptText(q) {
    if (!q) return "";
    return isZh() ? q.promptZh || q.promptEn : q.promptEn || q.promptZh;
  }

  function scheduleLabel(sched) {
    if (!sched || !sched.label) return "";
    const key = `self_study_vocab_sched_${sched.label}`;
    const out = t(key);
    return out === key ? sched.label : out;
  }

  function renderAffixCard(w) {
    const aff = w.affix || {};
    const parts = [aff.prefix, aff.root, aff.suffix].filter(Boolean);
    const affixLine = parts.length
      ? `<p class="ssc-affix-line">${parts.map((p) => `<span class="ssc-affix-part">${escapeHtml(p)}</span>`).join('<span class="ssc-affix-plus">+</span>')}</p>`
      : "";
    const mnemonic =
      w.mnemonic && (w.methodPrimary === "mnemonic" || w.methodPrimary === "mixed")
        ? `<p class="ssc-word-card__mnemonic"><strong>${t("self_study_vocab_mnemonic")}:</strong> ${escapeHtml(w.mnemonic)}</p>`
        : "";
    const examples = Array.isArray(w.examples) && w.examples.length
      ? `<p class="ssc-word-card__example">${escapeHtml(w.examples[0])}</p>`
      : "";
    return `
      <article class="ssc-word-card ssc-word-card--affix">
        <h3 class="ssc-word-card__term">${escapeHtml(w.word)}</h3>
        ${w.phonetic ? `<p class="ssc-word-card__phonetic">${escapeHtml(w.phonetic)}</p>` : ""}
        <p class="ssc-word-card__def">${escapeHtml(w.coreMeaning || "")}</p>
        ${affixLine}
        ${mnemonic}
        ${examples}
      </article>
    `;
  }

  const state = {
    overview: null,
    today: null,
    selectedDay: null,
    activeTab: "learn",
    packId: null,
    unitId: null,
    unitWords: null,
  };

  function progressPct(progress) {
    if (!progress) return 0;
    let n = 0;
    if (progress.learnDone) n += 50;
    if (progress.practiceDone) n += 50;
    return n;
  }

  function updateHeader(pct, statusText) {
    const fill = document.getElementById("ssc-module-progress-fill");
    const pctEl = document.getElementById("ssc-module-progress-pct");
    const statusEl = document.getElementById("ssc-module-status");
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  function renderChannelBanner(overview) {
    const active = overview.channel === "A" ? "A" : "B";
    const aOn = overview.channelAEnabled ? t("self_study_vocab_channel_on") : t("self_study_vocab_channel_off");
    const bOn = overview.channelBActive ? t("self_study_vocab_channel_on") : t("self_study_vocab_channel_standby");
    const sched = overview.todaySchedule ? scheduleLabel(overview.todaySchedule) : "";
    return `
      <div class="ssc-vocab-channel-hub" role="status">
        <div class="ssc-vocab-channel-card${active === "A" ? " ssc-vocab-channel-card--active" : ""}">
          <span class="ssc-vocab-channel-card__label">${t("self_study_channel_a")}</span>
          <span class="ssc-vocab-channel-card__state">${aOn}</span>
        </div>
        <div class="ssc-vocab-channel-card${active === "B" ? " ssc-vocab-channel-card--active" : ""}">
          <span class="ssc-vocab-channel-card__label">${t("self_study_channel_b")}</span>
          <span class="ssc-vocab-channel-card__state">${bOn}</span>
        </div>
        ${sched ? `<p class="ssc-vocab-channel__sched">${escapeHtml(sched)}</p>` : ""}
        ${overview.vocabEntryLevel ? `<p class="ssc-vocab-channel__entry">${t("self_study_vocab_entry_level")}</p>` : ""}
      </div>
    `;
  }

  function buildTabs(channel) {
    if (channel === "A") {
      return [
        { id: "packs", labelKey: "self_study_vocab_tab_packs" },
        { id: "learn", labelKey: "self_study_tab_learn" },
      ];
    }
    return [
      { id: "learn", labelKey: "self_study_tab_learn" },
      { id: "practice", labelKey: "self_study_tab_practice" },
      { id: "game_star", labelKey: "self_study_vocab_tab_game_star" },
      { id: "game_race", labelKey: "self_study_vocab_tab_game_race" },
      { id: "review", labelKey: "self_study_vocab_tab_review" },
      { id: "calendar", labelKey: "self_study_vocab_tab_calendar" },
    ];
  }

  function renderTabsNav(channel, active) {
    const tabs = buildTabs(channel);
    return `
      <nav class="ssc-tabs" role="tablist" aria-label="Vocabulary">
        ${tabs
          .map(
            (tab) =>
              `<button type="button" class="ssc-tab${tab.id === active ? " ssc-tab--active" : ""}" role="tab" data-tab="${tab.id}" aria-selected="${tab.id === active ? "true" : "false"}" data-i18n="${tab.labelKey}">${t(tab.labelKey)}</button>`,
          )
          .join("")}
      </nav>
    `;
  }

  function showTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".ssc-tab").forEach((btn) => {
      const tab = btn.getAttribute("data-tab");
      const selected = tab === tabId;
      btn.classList.toggle("ssc-tab--active", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
    document.querySelectorAll(".ssc-tab-panel").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-panel") !== tabId;
    });
  }

  async function renderLearnPanel(root) {
    if (state.overview.channel === "A") {
      if (!state.unitId) {
        root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_pick_unit")}</p>`;
        return;
      }
      if (!state.unitWords) {
        root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
        try {
          const data = await SERVER().getVocabUnit(state.unitId);
          state.unitWords = data.unit;
        } catch (e) {
          root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
          return;
        }
      }
      const words = state.unitWords.words || [];
      root.innerHTML = `
        <div class="ssc-lesson-card">
          <h2>${escapeHtml(state.unitWords.label || "")}</h2>
          <p>${t("self_study_vocab_pack_learn_hint")}</p>
        </div>
        <div class="ssc-word-grid">${words.map(renderAffixCard).join("")}</div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-unit-done">${t("self_study_vocab_mark_unit_done")}</button>
        </div>
      `;
      document.getElementById("ssc-unit-done")?.addEventListener("click", async () => {
        try {
          await SERVER().completeVocab({ kind: "unit", unitId: state.unitId });
          root.insertAdjacentHTML("beforeend", `<p class="ssc-vocab-success" role="status">${t("self_study_vocab_unit_saved")}</p>`);
        } catch (e) {
          alert(e.message);
        }
      });
      return;
    }

    if (state.selectedDay) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
      try {
        state.today = await SERVER().getVocabDay(state.selectedDay);
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    } else if (!state.today) {
      try {
        state.today = await SERVER().getVocabToday();
      } catch (e) {
        if (e.message && e.message.includes("Channel A")) {
          root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_use_packs")}</p>`;
          return;
        }
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    }

    const data = state.today;
    if (!data.newWords) {
      root.innerHTML = `
        <div class="ssc-banner">
          <h2>${t("self_study_vocab_no_new_today")}</h2>
          <p>${escapeHtml(data.message || "")}</p>
          <button type="button" class="btn-primary" id="ssc-go-review">${t("self_study_vocab_review_yesterday")}</button>
        </div>
      `;
      document.getElementById("ssc-go-review")?.addEventListener("click", () => {
        showTab("review");
        void renderReviewPanel(document.getElementById("ssc-panel-review"));
      });
      updateHeader(0, t("self_study_vocab_review_day"));
      return;
    }

    const words = data.words || [];
    const prog = data.progress || {};
    const dayBack = state.selectedDay
      ? `<button type="button" class="btn-secondary ssc-vocab-back" id="ssc-clear-day">← ${t("self_study_vocab_calendar_today")}</button>`
      : "";
    root.innerHTML = `
      ${dayBack}
      <div class="ssc-lesson-card">
        <h2 data-i18n="self_study_vocab_learn_title">${t("self_study_vocab_learn_title")}</h2>
        <p>${t("self_study_vocab_day_label", { day: String(data.dayNumber || ""), count: String(words.length) })}</p>
        ${data.schedule ? `<p class="ssc-vocab-sched">${scheduleLabel(data.schedule)}</p>` : ""}
      </div>
      <div class="ssc-word-grid">${words.map(renderAffixCard).join("")}</div>
      <div class="ssc-placement-actions">
        <button type="button" class="btn-primary" id="ssc-learn-done-btn">${prog.learnDone ? t("self_study_vocab_learn_reviewed") : t("self_study_vocab_mark_learn")}</button>
      </div>
    `;
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();

    updateHeader(
      progressPct(prog),
      prog.learnDone && prog.practiceDone
        ? t("self_study_vocab_complete_short")
        : t("self_study_vocab_in_progress", { pct: String(progressPct(prog)) }),
    );

    document.getElementById("ssc-clear-day")?.addEventListener("click", () => {
      state.selectedDay = null;
      state.today = null;
      void renderLearnPanel(root);
    });

    document.getElementById("ssc-learn-done-btn")?.addEventListener("click", async () => {
      try {
        await SERVER().completeVocab({
          kind: "day",
          courseId: data.courseId,
          dayNumber: data.dayNumber,
          learnDone: true,
          practiceDone: prog.practiceDone,
          practiceScore: prog.practiceScore,
        });
        state.today = null;
        await renderLearnPanel(root);
      } catch (e) {
        alert(e.message);
      }
    });
  }

  async function renderPracticePanel(root) {
    if (!state.today) {
      try {
        state.today = await SERVER().getVocabToday();
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    }
    const data = state.today;
    if (!data.newWords || !data.practice || !data.practice.length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_practice_today")}</p>`;
      return;
    }

    const qs = data.practice;
    const prog = data.progress || {};
    let index = 0;
    const answers = {};

    function finishPractice() {
      let correct = 0;
      qs.forEach((q) => {
        if (answers[q.id] === q.correctIndex) correct += 1;
      });
      void SERVER()
        .completeVocab({
          kind: "day",
          courseId: data.courseId,
          dayNumber: data.dayNumber,
          learnDone: prog.learnDone,
          practiceDone: true,
          practiceScore: correct,
        })
        .then(() => {
          state.today = null;
          root.innerHTML = `
            <div class="ssc-report">
              <h2>${t("self_study_vocab_practice_done")}</h2>
              <p>${t("self_study_vocab_practice_score", { correct: String(correct), total: String(qs.length) })}</p>
            </div>
          `;
          updateHeader(100, t("self_study_vocab_complete_short"));
        })
        .catch((e) => alert(e.message));
    }

    function renderQuestion() {
      const q = qs[index];
      if (!q) return finishPractice();
      const opts = q.options || [];
      const chosen = answers[q.id];
      root.innerHTML = `
        <p class="ssc-placement-progress__label">${t("self_study_vocab_practice_progress", { current: String(index + 1), total: String(qs.length) })}</p>
        <div class="ssc-question-card">
          <h3>${escapeHtml(promptText(q))}</h3>
          <ul class="ssc-options">
            ${opts
              .map(
                (opt, i) =>
                  `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-i="${i}">${escapeHtml(opt)}</button></li>`,
              )
              .join("")}
          </ul>
        </div>
        <div class="ssc-placement-actions">
          <button type="button" class="btn-primary" id="ssc-practice-next" ${chosen == null ? "disabled" : ""}>${index < qs.length - 1 ? t("self_study_next") : t("self_study_vocab_finish_practice")}</button>
        </div>
      `;
      root.querySelectorAll(".ssc-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          answers[q.id] = parseInt(btn.getAttribute("data-i"), 10);
          renderQuestion();
        });
      });
      document.getElementById("ssc-practice-next")?.addEventListener("click", () => {
        if (answers[q.id] == null) return;
        index += 1;
        renderQuestion();
      });
    }

    if (prog.practiceDone) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_vocab_practice_done")}</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(prog.practiceScore || 0), total: String(qs.length) })}</p>
        </div>
      `;
      return;
    }
    renderQuestion();
  }

  async function renderReviewPanel(root) {
    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let data;
    try {
      data = await SERVER().getVocabReviewYesterday();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }
    const words = data.words || [];
    if (!words.length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_review_words")}</p>`;
      return;
    }

    let idx = 0;
    let revealed = false;

    function renderCard() {
      const w = words[idx];
      root.innerHTML = `
        <div class="ssc-flash-header">
          <h2>${t("self_study_vocab_review_yesterday")}</h2>
          <p>${t("self_study_vocab_flash_progress", { current: String(idx + 1), total: String(words.length), day: String(data.dayNumber || "") })}</p>
          <p class="ssc-vocab-web-note">${t("self_study_vocab_web_review_note")}</p>
        </div>
        <div class="ssc-flash-card${revealed ? " ssc-flash-card--revealed" : ""}">
          <p class="ssc-flash-card__term">${escapeHtml(w.word)}</p>
          ${revealed ? `<p class="ssc-flash-card__def">${escapeHtml(w.coreMeaning || "")}</p>` : `<button type="button" class="btn-secondary" id="ssc-flash-reveal">${t("self_study_vocab_reveal")}</button>`}
        </div>
        ${
          revealed
            ? `<div class="ssc-flash-actions">
          <button type="button" class="btn-secondary" data-rating="know">${t("self_study_vocab_flash_know")}</button>
          <button type="button" class="btn-secondary" data-rating="fuzzy">${t("self_study_vocab_flash_fuzzy")}</button>
          <button type="button" class="btn-secondary" data-rating="forget">${t("self_study_vocab_flash_forget")}</button>
        </div>`
            : ""
        }
      `;
      document.getElementById("ssc-flash-reveal")?.addEventListener("click", () => {
        revealed = true;
        renderCard();
      });
      root.querySelectorAll("[data-rating]").forEach((btn) => {
        btn.addEventListener("click", () => {
          revealed = false;
          idx += 1;
          if (idx >= words.length) {
            root.innerHTML = `<div class="ssc-report"><h2>${t("self_study_vocab_review_done")}</h2></div>`;
            return;
          }
          renderCard();
        });
      });
    }
    renderCard();
  }

  async function ensureGamesData() {
    if (!state.today || !state.today.games) {
      try {
        state.today = state.selectedDay
          ? await SERVER().getVocabDay(state.selectedDay)
          : await SERVER().getVocabToday();
      } catch (_) {
        return null;
      }
    }
    return state.today.games;
  }

  async function renderGamePanel(root, mode) {
    const games = await ensureGamesData();
    if (!games || !global.EAP_VOCAB_GAMES) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_practice_today")}</p>`;
      return;
    }
    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_game_intro")}</p><div id="ssc-game-mount"></div>`;
    const mount = document.getElementById("ssc-game-mount");
    const onComplete = (res) => {
      mount.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_vocab_game_done")}</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(res.score), total: String(res.total) })}</p>
        </div>
      `;
    };
    if (mode === "star") global.EAP_VOCAB_GAMES.mountStarBattle(mount, games, onComplete);
    else global.EAP_VOCAB_GAMES.mountSpeedRace(mount, games, onComplete);
  }

  async function renderCalendarPanel(root) {
    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let data;
    try {
      data = await SERVER().getVocabCalendar();
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }
    const days = data.days || [];
    root.innerHTML = `
      <div class="ssc-lesson-card">
        <h2>${t("self_study_vocab_tab_calendar")}</h2>
        <p>${t("self_study_vocab_calendar_hint")}</p>
      </div>
      <ul class="ssc-vocab-calendar">
        ${days
          .map((d) => {
            const sched = scheduleLabel(d.schedule);
            const dayNum = d.dayNumber ? t("self_study_vocab_day_short", { day: String(d.dayNumber) }) : "—";
            const wc = d.wordCount ? `${d.wordCount} ${t("self_study_vocab_words_short")}` : "";
            const done = d.learnDone && d.practiceDone ? " ✓" : "";
            const clickable = d.dayNumber && d.hasLesson;
            return `<li class="ssc-vocab-calendar__day${clickable ? " ssc-vocab-calendar__day--click" : ""}"${clickable ? ` data-day="${d.dayNumber}"` : ""}>
              <span class="ssc-vocab-calendar__date">${escapeHtml(d.date)}</span>
              <span class="ssc-vocab-calendar__sched">${escapeHtml(sched)}</span>
              <span class="ssc-vocab-calendar__num">${dayNum}${done}</span>
              <span class="ssc-vocab-calendar__wc">${escapeHtml(wc)}</span>
            </li>`;
          })
          .join("")}
      </ul>
    `;
    root.querySelectorAll("[data-day]").forEach((li) => {
      li.addEventListener("click", () => {
        state.selectedDay = parseInt(li.getAttribute("data-day"), 10);
        state.today = null;
        showTab("learn");
        void renderLearnPanel(document.getElementById("ssc-panel-learn"));
      });
    });
  }

  async function renderPacksPanel(root) {
    const packs = state.overview.packs || [];
    if (!packs.length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_packs")}</p>`;
      return;
    }

    if (!state.packId) {
      root.innerHTML = `
        <div class="ssc-lesson-card">
          <h2>${t("self_study_vocab_tab_packs")}</h2>
          <p>${t("self_study_vocab_packs_hint")}</p>
        </div>
        <ul class="ssc-vocab-pack-list">
          ${packs
            .map(
              (p) =>
                `<li><button type="button" class="ssc-vocab-pack-btn" data-pack="${p.id}">${escapeHtml(p.displayName)}</button></li>`,
            )
            .join("")}
        </ul>
      `;
      root.querySelectorAll("[data-pack]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.packId = parseInt(btn.getAttribute("data-pack"), 10);
          state.unitId = null;
          state.unitWords = null;
          void renderPacksPanel(root);
        });
      });
      return;
    }

    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let packData;
    try {
      packData = await SERVER().getVocabPackUnits(state.packId);
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    root.innerHTML = `
      <div class="ssc-lesson-card">
        <button type="button" class="btn-secondary ssc-vocab-back" id="ssc-pack-back">← ${t("self_study_vocab_all_packs")}</button>
        <h2>${escapeHtml(packData.pack.displayName)}</h2>
      </div>
      <ul class="ssc-vocab-unit-list">
        ${(packData.units || [])
          .map(
            (u) =>
              `<li>
            <button type="button" class="ssc-vocab-unit-btn${u.completed ? " ssc-vocab-unit-btn--done" : ""}" data-unit="${u.id}">
              ${escapeHtml(u.label)} · ${u.wordCount} ${t("self_study_vocab_words_short")}${u.completed ? " ✓" : ""}
            </button>
          </li>`,
          )
          .join("")}
      </ul>
    `;
    document.getElementById("ssc-pack-back")?.addEventListener("click", () => {
      state.packId = null;
      state.unitId = null;
      state.unitWords = null;
      void renderPacksPanel(root);
    });
    root.querySelectorAll("[data-unit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.unitId = parseInt(btn.getAttribute("data-unit"), 10);
        state.unitWords = null;
        showTab("learn");
        void renderLearnPanel(document.getElementById("ssc-panel-learn"));
      });
    });
  }

  async function renderPanel(tabId) {
    const panel = document.getElementById(`ssc-panel-${tabId}`);
    if (!panel) return;
    if (tabId === "learn") await renderLearnPanel(panel);
    else if (tabId === "practice") await renderPracticePanel(panel);
    else if (tabId === "review") await renderReviewPanel(panel);
    else if (tabId === "calendar") await renderCalendarPanel(panel);
    else if (tabId === "packs") await renderPacksPanel(panel);
    else if (tabId === "game_star") await renderGamePanel(panel, "star");
    else if (tabId === "game_race") await renderGamePanel(panel, "race");
  }

  async function init() {
    const shell = document.getElementById("ssc-module-root");
    const titleEl = document.getElementById("ssc-module-title");
    const levelEl = document.getElementById("ssc-module-level");
    if (!shell || !SERVER()) return false;

    if (titleEl) titleEl.textContent = t("self_study_mod_vocab");
    if (levelEl) levelEl.hidden = true;

    try {
      state.overview = await SERVER().getVocabOverview();
    } catch (e) {
      console.error("[EAP_VOCAB_UI] getVocabOverview failed:", e);
      return false;
    }

    state.today = null;
    state.packId = null;
    state.unitId = null;
    state.unitWords = null;

    const channel = state.overview.channel || "B";
    const defaultTab = channel === "A" ? "packs" : "learn";
    state.activeTab = defaultTab;

    const panels = buildTabs(channel)
      .map((tab) => `<div id="ssc-panel-${tab.id}" class="ssc-tab-panel" data-panel="${tab.id}" role="tabpanel"${tab.id !== defaultTab ? " hidden" : ""}></div>`)
      .join("");

    shell.innerHTML = `
      ${renderChannelBanner(state.overview)}
      ${renderTabsNav(channel, defaultTab)}
      ${panels}
    `;
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();

    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showTab(tab);
        void renderPanel(tab);
      });
    });

    await renderPanel(defaultTab);
    return true;
  }

  global.EAP_VOCAB_UI = { init };
})();
