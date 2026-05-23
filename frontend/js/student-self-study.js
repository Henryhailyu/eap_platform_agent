/**
 * Student AI Self-Study Centre — hub (Phase S1).
 */
(function () {
  const MOCK = window.EAP_SELF_STUDY_MOCK;
  const PAGE = "student-self-study";

  const MODULES = [
    {
      id: "vocabulary",
      icon: "📚",
      titleKey: "self_study_mod_vocab",
      metaKey: "self_study_mod_vocab_meta",
      href: "student-self-study-module.html?skill=vocabulary",
      available: true,
    },
    {
      id: "reading",
      icon: "📖",
      titleKey: "self_study_mod_reading",
      metaKey: "self_study_mod_reading_meta",
      href: "student-self-study-module.html?skill=reading",
      available: true,
    },
    {
      id: "listening",
      icon: "🎧",
      titleKey: "self_study_mod_listening",
      metaKey: "self_study_mod_listening_meta",
      href: "student-self-study-module.html?skill=listening",
      available: true,
    },
    {
      id: "speaking",
      icon: "🎤",
      titleKey: "self_study_mod_speaking",
      metaKey: "self_study_mod_speaking_meta",
      href: "student-self-study-module.html?skill=speaking",
      available: true,
    },
    {
      id: "writing",
      icon: "✍️",
      titleKey: "self_study_mod_writing",
      metaKey: "self_study_mod_writing_meta",
      href: "student-self-study-module.html?skill=writing",
      available: true,
    },
  ];

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function redirectIfDisabled() {
    if (window.EAP_SELF_STUDY_ENABLED === false) {
      window.location.replace("student.html");
      return true;
    }
    return false;
  }

  function renderPlacementBanner(container, placement) {
    if (placement) return;

    container.innerHTML = `
      <div class="ssc-banner ssc-banner--placement">
        <h2 data-i18n="self_study_placement_cta_title">Complete your placement test</h2>
        <p data-i18n="self_study_placement_cta_body">
          Take a short practice placement (~20 minutes) to unlock your level and personalised self-study path.
        </p>
        <p class="ssc-disclaimer" data-i18n="self_study_placement_disclaimer">
          Demo diagnostic only — not an official IELTS score.
        </p>
        <a href="student-self-study-placement.html" class="btn-primary">${t("self_study_placement_start")}</a>
      </div>
    `;
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function renderLevelBadge(el, placement) {
    if (!el || !placement) return;
    const levelId = placement.levelId || "intermediate";
    el.textContent = MOCK ? MOCK.levelDisplay(levelId) : levelId;
    el.className = `ssc-level-badge ssc-level-badge--${levelId}`;
    el.hidden = false;
  }

  function renderDailyPlan(placement, forceNew) {
    const listEl = document.getElementById("ssc-daily-plan-list");
    const summaryEl = document.getElementById("ssc-daily-plan-summary");
    const statsEl = document.getElementById("ssc-daily-plan-stats");
    const regenBtn = document.getElementById("ssc-daily-regenerate");
    const disclaimerEl = document.getElementById("ssc-daily-disclaimer");
    const section = document.getElementById("ssc-daily-plan-section");

    if (!listEl) return;

    if (!placement || !window.EAP_DAILY_PLAN) {
      if (section) section.hidden = false;
      listEl.innerHTML = `<li data-i18n="self_study_daily_placeholder">${t("self_study_daily_placeholder")}</li>`;
      if (summaryEl) summaryEl.hidden = true;
      if (statsEl) statsEl.hidden = true;
      if (regenBtn) regenBtn.classList.add("hidden");
      if (disclaimerEl) disclaimerEl.hidden = true;
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      return;
    }

    const plan = window.EAP_DAILY_PLAN.generatePlan(placement, !!forceNew);
    if (!plan || !plan.tasks.length) {
      listEl.innerHTML = `<li>${t("self_study_daily_all_complete")}</li>`;
      return;
    }

    if (summaryEl) {
      summaryEl.textContent = window.EAP_DAILY_PLAN.planSummary(plan);
      summaryEl.hidden = false;
    }
    const stats = window.EAP_DAILY_PLAN.completionStats(plan);
    if (statsEl) {
      statsEl.textContent = t("self_study_daily_stats", {
        done: String(stats.done),
        total: String(stats.total),
        pct: String(stats.pct),
      });
      statsEl.hidden = false;
    }
    if (regenBtn) regenBtn.classList.remove("hidden");
    if (disclaimerEl) disclaimerEl.hidden = false;

    listEl.innerHTML = plan.tasks
      .map((task) => {
        const meta = window.EAP_DAILY_PLAN.MODULE_META[task.moduleId] || {};
        const modName = meta.nameKey ? t(meta.nameKey) : task.moduleId;
        const focus = task.focus ? `<span class="ssc-daily-task__focus">${t("self_study_daily_focus")}</span>` : "";
        const checked = task.done ? "checked" : "";
        const doneClass = task.done ? " ssc-daily-task--done" : "";
        return `
          <li class="ssc-daily-task${doneClass}">
            <label class="ssc-daily-task__check">
              <input type="checkbox" data-task-id="${task.id}" ${checked} aria-label="${t("self_study_daily_mark_done")}" />
            </label>
            <a href="${task.href}" class="ssc-daily-task__link">
              <span class="ssc-daily-task__mod">${meta.icon || ""} ${modName}</span>
              <span class="ssc-daily-task__title">${task.label}</span>
              <span class="ssc-daily-task__meta">~${task.minutes} min ${focus}</span>
            </a>
          </li>
        `;
      })
      .join("");

    listEl.querySelectorAll("input[data-task-id]").forEach((cb) => {
      cb.addEventListener("change", () => {
        window.EAP_DAILY_PLAN.toggleTaskDone(cb.getAttribute("data-task-id"));
        renderDailyPlan(placement, false);
      });
    });
  }

  function bindDailyRegenerate(placement) {
    const btn = document.getElementById("ssc-daily-regenerate");
    if (!btn) return;
    btn.addEventListener("click", () => {
      renderDailyPlan(placement, true);
    });
  }

  function renderModules(gridEl, placement) {
    if (!gridEl) return;
    const hasPlacement = !!placement;
    const levelId = placement ? placement.levelId : null;

    gridEl.innerHTML = MODULES.map((mod) => {
      const locked = mod.locked || !hasPlacement;
      const levelLabel = levelId && MOCK ? MOCK.levelDisplay(levelId) : "—";
      let modProgress = 0;
      if (levelId) {
        if (mod.id === "vocabulary" && window.EAP_VOCAB_MOCK) {
          modProgress = window.EAP_VOCAB_MOCK.completionPercent(
            window.EAP_VOCAB_MOCK.ensureProgress(levelId),
          );
        } else if (mod.id === "reading" && window.EAP_READING_MOCK) {
          modProgress = window.EAP_READING_MOCK.completionPercent(
            window.EAP_READING_MOCK.ensureProgress(levelId),
          );
        } else if (mod.id === "writing" && window.EAP_WRITING_MOCK) {
          modProgress = window.EAP_WRITING_MOCK.completionPercent(
            window.EAP_WRITING_MOCK.ensureProgress(levelId),
          );
        } else if (mod.id === "listening" && window.EAP_LISTENING_MOCK) {
          modProgress = window.EAP_LISTENING_MOCK.completionPercent(
            window.EAP_LISTENING_MOCK.ensureProgress(levelId),
          );
        } else if (mod.id === "speaking" && window.EAP_SPEAKING_MOCK) {
          modProgress = window.EAP_SPEAKING_MOCK.completionPercent(
            window.EAP_SPEAKING_MOCK.ensureProgress(levelId),
          );
        }
      }

      if (locked) {
        return `
          <div class="ssc-module-card ssc-module-card--locked" aria-disabled="true">
            <span class="ssc-module-card__icon" aria-hidden="true">${mod.icon}</span>
            <h3 class="ssc-module-card__title" data-i18n="${mod.titleKey}"></h3>
            <p class="ssc-module-card__meta" data-i18n="${mod.metaKey}"></p>
            <span class="ssc-module-card__tag ssc-module-card__tag--soon">${t("self_study_tag_locked")}</span>
          </div>
        `;
      }

      if (mod.available && mod.href) {
        const tag =
          modProgress >= 100
            ? t("self_study_tag_complete")
            : modProgress > 0
              ? t("self_study_tag_continue", { pct: String(modProgress) })
              : `${t("self_study_tag_start")} · ${levelLabel}`;
        return `
          <a href="${mod.href}" class="ssc-module-card" role="listitem">
            <span class="ssc-module-card__icon" aria-hidden="true">${mod.icon}</span>
            <h3 class="ssc-module-card__title" data-i18n="${mod.titleKey}"></h3>
            <p class="ssc-module-card__meta" data-i18n="${mod.metaKey}"></p>
            <span class="ssc-module-card__tag">${tag}</span>
          </a>
        `;
      }

      return `
        <div class="ssc-module-card ssc-module-card--locked" aria-disabled="true">
          <span class="ssc-module-card__icon" aria-hidden="true">${mod.icon}</span>
          <h3 class="ssc-module-card__title" data-i18n="${mod.titleKey}"></h3>
          <p class="ssc-module-card__meta" data-i18n="${mod.metaKey}"></p>
          <span class="ssc-module-card__tag ssc-module-card__tag--soon">${t("self_study_tag_soon")} · ${levelLabel}</span>
        </div>
      `;
    }).join("");

    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  function bindRetake() {
    const btn = document.getElementById("ssc-retake-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const msg = t("self_study_retake_confirm");
      if (!window.confirm(msg)) return;
      window.location.href = "student-self-study-placement.html?retake=1";
    });
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const ready = await bootStudentSatellitePage(PAGE, () => {});
    if (!ready) return;

    const placement = MOCK ? MOCK.getPlacement() : null;
    const bannerEl = document.getElementById("ssc-placement-banner");
    const levelEl = document.getElementById("ssc-level-badge");
    const modulesEl = document.getElementById("ssc-modules-grid");
    const retakeWrap = document.getElementById("ssc-retake-wrap");

    if (bannerEl) renderPlacementBanner(bannerEl, placement);
    renderLevelBadge(levelEl, placement);
    renderDailyPlan(placement);
    renderModules(modulesEl, placement);
    bindDailyRegenerate(placement);

    if (retakeWrap) {
      retakeWrap.hidden = !placement;
    }
    bindRetake();

    window.addEventListener("eap:langchange", () => {
      const p = MOCK ? MOCK.getPlacement() : null;
      if (bannerEl) renderPlacementBanner(bannerEl, p);
      renderLevelBadge(levelEl, p);
      renderDailyPlan(p);
      renderModules(modulesEl, p);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
