/**
 * SS-V3 — Calendar-first self-study hub (placement gate, day → channels → modules).
 */
(function (global) {
  const PAGE = "student-self-study";
  const SKILL_MODULES = [
    { id: "vocabulary", icon: "📚", titleKey: "self_study_mod_vocab", href: "student-self-study-module.html?skill=vocabulary" },
    { id: "reading", icon: "📖", titleKey: "self_study_mod_reading", href: "student-self-study-module.html?skill=reading" },
    { id: "listening", icon: "🎧", titleKey: "self_study_mod_listening", href: "student-self-study-module.html?skill=listening" },
    { id: "speaking", icon: "🎤", titleKey: "self_study_mod_speaking", href: "student-self-study-module.html?skill=speaking" },
    { id: "writing", icon: "✍️", titleKey: "self_study_mod_writing", href: "student-self-study-module.html?skill=writing" },
  ];

  const state = {
    placement: null,
    overview: null,
    calData: null,
    viewYear: 0,
    viewMonth: 0,
    selectedDate: null,
    selectedDay: null,
    activeChannel: "B",
  };

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

  function SERVER() {
    return global.EAP_SELF_STUDY_SERVER;
  }

  async function resolvePlacement() {
    const srv = SERVER();
    if (srv) {
      try {
        const data = await srv.getStatus();
        if (data.placement) return data.placement;
      } catch (_) {
        /* offline */
      }
    }
    return global.EAP_SELF_STUDY_MOCK ? global.EAP_SELF_STUDY_MOCK.getPlacement() : null;
  }

  function parseIsoDate(iso) {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monthLabel(year, month) {
    const loc = isZh() ? "zh-CN" : "en-US";
    return new Date(year, month, 1).toLocaleDateString(loc, { month: "long", year: "numeric" });
  }

  function weekdayHeaders() {
    const loc = isZh() ? "zh-CN" : "en-US";
    const base = new Date(2026, 5, 7);
    return Array.from({ length: 7 }, (_, i) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString(loc, { weekday: "short" }),
    );
  }

  function daysByDate(calData) {
    const map = new Map();
    (calData?.days || []).forEach((d) => {
      if (d.date) map.set(d.date, d);
    });
    return map;
  }

  function renderCalendarGrid(root) {
    const y = state.viewYear;
    const m = state.viewMonth;
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const byDate = daysByDate(state.calData);
    const today = isoToday();
    const cells = [];

    for (let i = 0; i < startPad; i += 1) {
      cells.push(`<div class="ssc-cal-cell ssc-cal-cell--pad" aria-hidden="true"></div>`);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const meta = byDate.get(iso);
      const isToday = iso === today;
      const selected = iso === state.selectedDate;
      const hasLesson = meta && meta.hasLesson;
      const done = meta && meta.learnDone && meta.practiceDone;
      const sched = meta?.schedule?.label || "";
      const schedShort =
        sched === "new_lesson"
          ? t("self_study_cal_new")
          : sched === "review_only"
            ? t("self_study_cal_review")
            : sched === "new_plus_review_yesterday"
              ? t("self_study_cal_new_review")
              : "";
      cells.push(`
        <button type="button" class="ssc-cal-cell ssc-cal-cell--day${isToday ? " ssc-cal-cell--today" : ""}${selected ? " ssc-cal-cell--selected" : ""}${hasLesson ? " ssc-cal-cell--lesson" : ""}"
          data-date="${iso}" aria-label="${iso}">
          <span class="ssc-cal-cell__num">${day}</span>
          ${schedShort ? `<span class="ssc-cal-cell__tag">${escapeHtml(schedShort)}</span>` : ""}
          ${hasLesson ? `<span class="ssc-cal-cell__dot${done ? " ssc-cal-cell__dot--done" : ""}" aria-hidden="true"></span>` : ""}
        </button>
      `);
    }

    root.innerHTML = `
      <div class="ssc-cal-toolbar">
        <button type="button" class="ssc-cal-nav" id="ssc-cal-prev" aria-label="${t("self_study_cal_prev")}">‹</button>
        <h2 class="ssc-cal-month">${escapeHtml(monthLabel(y, m))}</h2>
        <button type="button" class="ssc-cal-nav" id="ssc-cal-next" aria-label="${t("self_study_cal_next")}">›</button>
        <button type="button" class="ssc-cal-today btn-secondary" id="ssc-cal-today">${t("self_study_cal_today")}</button>
      </div>
      <div class="ssc-cal-weekdays">${weekdayHeaders().map((w) => `<span>${escapeHtml(w)}</span>`).join("")}</div>
      <div class="ssc-cal-grid" role="grid">${cells.join("")}</div>
    `;

    root.querySelector("#ssc-cal-prev")?.addEventListener("click", () => {
      const d = new Date(state.viewYear, state.viewMonth - 1, 1);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      renderCalendarGrid(root);
    });
    root.querySelector("#ssc-cal-next")?.addEventListener("click", () => {
      const d = new Date(state.viewYear, state.viewMonth + 1, 1);
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      renderCalendarGrid(root);
    });
    root.querySelector("#ssc-cal-today")?.addEventListener("click", () => {
      const now = new Date();
      state.viewYear = now.getFullYear();
      state.viewMonth = now.getMonth();
      state.selectedDate = isoToday();
      const meta = byDate.get(state.selectedDate);
      state.selectedDay = meta?.dayNumber || null;
      renderCalendarGrid(root);
      renderDayPanel(document.getElementById("ssc-day-panel"));
    });

    root.querySelectorAll("[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedDate = btn.getAttribute("data-date");
        const meta = byDate.get(state.selectedDate);
        state.selectedDay = meta?.dayNumber || null;
        root.querySelectorAll(".ssc-cal-cell--selected").forEach((el) => el.classList.remove("ssc-cal-cell--selected"));
        btn.classList.add("ssc-cal-cell--selected");
        renderDayPanel(document.getElementById("ssc-day-panel"));
      });
    });
  }

  function skillHref(skillId, dayNumber) {
    const mod = SKILL_MODULES.find((s) => s.id === skillId);
    if (!mod) return "#";
    let href = mod.href;
    if ((skillId === "vocabulary" || skillId === "reading" || skillId === "listening") && dayNumber) {
      href += `&day=${dayNumber}`;
    }
    return href;
  }

  function channelSkillAction(skillId, channel, dayNumber) {
    const ov = state.overview?.skills?.[skillId];
    const ch = ov?.channel || "B";
    if (channel === "A" && ch !== "A") {
      return { type: "hint", text: t("self_study_channel_a_standby") };
    }
    if (skillId === "vocabulary" && ov?.webReview?.action === "review_yesterday") {
      return {
        type: "link",
        href: `student-self-study-module.html?skill=vocabulary&tab=review`,
        label: t("self_study_vocab_review_yesterday"),
      };
    }
    if (ov?.webReview?.action === "open_today_task") {
      return {
        type: "link",
        href: skillHref(skillId, dayNumber),
        label: t("self_study_open_today_task"),
      };
    }
    return {
      type: "link",
      href: skillHref(skillId, dayNumber),
      label: t("self_study_open_module"),
    };
  }

  function renderDayPanel(panel) {
    if (!panel) return;
    if (!state.selectedDate) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const meta = daysByDate(state.calData).get(state.selectedDate);
    const dayNum = meta?.dayNumber || state.selectedDay;
    const ch = state.activeChannel;

    const channelCards = `
      <div class="ssc-hub-channels">
        <button type="button" class="ssc-hub-channel${ch === "A" ? " ssc-hub-channel--active" : ""}" data-ch="A">
          <span class="ssc-hub-channel__title">${t("self_study_channel_a")}</span>
          <span class="ssc-hub-channel__sub">${t("self_study_channel_a_sub")}</span>
        </button>
        <button type="button" class="ssc-hub-channel${ch === "B" ? " ssc-hub-channel--active" : ""}" data-ch="B">
          <span class="ssc-hub-channel__title">${t("self_study_channel_b")}</span>
          <span class="ssc-hub-channel__sub">${t("self_study_channel_b_sub")}</span>
        </button>
      </div>
    `;

    const skillsHtml = SKILL_MODULES.map((mod) => {
      const action = channelSkillAction(mod.id, ch, dayNum);
      const title = t(mod.titleKey);
      if (action.type === "hint") {
        return `<li class="ssc-hub-skill"><span class="ssc-hub-skill__icon">${mod.icon}</span><span class="ssc-hub-skill__title">${title}</span><span class="ssc-hub-skill__hint">${escapeHtml(action.text)}</span></li>`;
      }
      return `<li class="ssc-hub-skill">
        <span class="ssc-hub-skill__icon">${mod.icon}</span>
        <span class="ssc-hub-skill__title">${title}</span>
        <a class="btn-primary ssc-hub-skill__btn" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>
      </li>`;
    }).join("");

    panel.innerHTML = `
      <div class="ssc-hub-day">
        <h2 class="ssc-hub-day__title">${t("self_study_hub_day_title", { date: state.selectedDate })}</h2>
        ${meta?.wordCount ? `<p class="ssc-hub-day__meta">${t("self_study_vocab_day_label", { day: String(dayNum || "—"), count: String(meta.wordCount) })}</p>` : ""}
        ${channelCards}
        <ul class="ssc-hub-skills">${skillsHtml}</ul>
      </div>
    `;

    panel.querySelectorAll("[data-ch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeChannel = btn.getAttribute("data-ch") || "B";
        renderDayPanel(panel);
      });
    });
  }

  async function bootHub() {
    if (document.body.getAttribute("data-page") !== PAGE) return;

    const placement = await resolvePlacement();
    if (!placement) {
      global.location.replace("student-self-study-placement.html");
      return;
    }
    state.placement = placement;

    const levelEl = document.getElementById("ssc-level-badge");
    if (levelEl && global.EAP_SELF_STUDY_MOCK) {
      const levelId = placement.levelId || "intermediate";
      levelEl.textContent = global.EAP_SELF_STUDY_MOCK.levelDisplay(levelId);
      levelEl.className = `ssc-level-badge ssc-level-badge--${levelId}`;
      levelEl.hidden = false;
    }

    const srv = SERVER();
    if (srv) {
      try {
        state.overview = await srv.getDailyOverview();
      } catch (_) {
        state.overview = null;
      }
      try {
        state.calData = await srv.getVocabCalendar();
      } catch (_) {
        state.calData = { days: [] };
      }
    }

    const startIso = state.calData?.startDate || isoToday();
    const start = parseIsoDate(startIso);
    const now = new Date();
    state.viewYear = now.getFullYear();
    state.viewMonth = now.getMonth();
    state.selectedDate = isoToday();
    const todayMeta = daysByDate(state.calData).get(state.selectedDate);
    state.selectedDay = todayMeta?.dayNumber || null;

    const calRoot = document.getElementById("ssc-cal-root");
    if (calRoot) renderCalendarGrid(calRoot);
    renderDayPanel(document.getElementById("ssc-day-panel"));

    const retake = document.getElementById("ssc-retake-btn");
    if (retake) {
      retake.addEventListener("click", () => {
        if (!global.confirm(t("self_study_retake_confirm"))) return;
        global.location.href = "student-self-study-placement.html?retake=1";
      });
    }
    const retakeWrap = document.getElementById("ssc-retake-wrap");
    if (retakeWrap) retakeWrap.hidden = false;
  }

  global.EAP_SELF_STUDY_HUB = { bootHub };
})(typeof window !== "undefined" ? window : globalThis);
