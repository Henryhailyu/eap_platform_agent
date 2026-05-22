/**
 * S8 — Personalised daily study plan (rule-based mock, no AI API).
 */
(function (global) {
  const STORAGE_KEY = "eap_self_study_daily_plan";

  const MODULE_META = {
    vocabulary: { icon: "📚", nameKey: "self_study_mod_vocab" },
    reading: { icon: "📖", nameKey: "self_study_mod_reading" },
    listening: { icon: "🎧", nameKey: "self_study_mod_listening" },
    speaking: { icon: "🎤", nameKey: "self_study_mod_speaking" },
    writing: { icon: "✍️", nameKey: "self_study_mod_writing" },
  };

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getModuleProgress(levelId, moduleId) {
    const stores = {
      vocabulary: global.EAP_VOCAB_MOCK,
      reading: global.EAP_READING_MOCK,
      listening: global.EAP_LISTENING_MOCK,
      speaking: global.EAP_SPEAKING_MOCK,
      writing: global.EAP_WRITING_MOCK,
    };
    const store = stores[moduleId];
    if (!store || !levelId) return 0;
    return store.completionPercent(store.ensureProgress(levelId));
  }

  function weakestSkill(placement) {
    if (!placement || !placement.skillScores) return null;
    const scores = placement.skillScores;
    const entries = Object.keys(scores)
      .filter((k) => k !== "speaking" || scores[k] != null)
      .map((k) => ({ skill: k, pct: scores[k] }));
    if (!entries.length) return null;
    entries.sort((a, b) => a.pct - b.pct);
    return entries[0].skill;
  }

  function taskTemplates(levelId) {
    const zh = isZh();
    return {
      vocabulary: {
        learn: zh ? "词汇：复习今日词表（Learn）" : "Vocabulary: review today's word list (Learn)",
        practice: zh ? "词汇：完成搭配练习（Practice）" : "Vocabulary: complete collocation practice (Practice)",
        game: zh ? "词汇：配对竞赛（Game）" : "Vocabulary: Matching Race (Game)",
      },
      reading: {
        learn: zh ? "阅读：短文 + 策略（Learn）" : "Reading: passage + strategy (Learn)",
        practice: zh ? "阅读：推理题练习（Practice）" : "Reading: inference practice (Practice)",
        game: zh ? "阅读：论证排序（Game）" : "Reading: Argument Sorting (Game)",
      },
      listening: {
        learn: zh ? "听力：讲座文字稿（Learn）" : "Listening: lecture script (Learn)",
        practice: zh ? "听力：细节题（Practice）" : "Listening: detail questions (Practice)",
        game: zh ? "听力：讲座结构（Game）" : "Listening: Lecture Structure (Game)",
      },
      speaking: {
        learn: zh ? "口语：讨论提示（Learn）" : "Speaking: discussion prompts (Learn)",
        practice: zh ? "口语：策略小测（Practice）" : "Speaking: strategy quiz (Practice)",
        game: zh ? "口语：打字讨论挑战（Game）" : "Speaking: Discussion Challenge (typed)",
      },
      writing: {
        learn: zh ? "写作：句型与段落（Learn）" : "Writing: sentences & paragraphs (Learn)",
        practice: zh ? "写作：句子练习（Practice）" : "Writing: sentence practice (Practice)",
        game: zh ? "写作：摘要任务（Game）" : "Writing: Summary Mission (Game)",
      },
    };
  }

  function nextStepForModule(moduleId, pct, templates, levelId) {
    const t = templates[moduleId];
    if (!t) return null;
    if (pct >= 100) return null;
    const detail = getProgressDetail(moduleId, levelId);
    if (pct === 0 || !detail.learnDone) return { tab: "learn", label: t.learn, minutes: 12 };
    if (pct < 67 || !detail.practiceDone) return { tab: "practice", label: t.practice, minutes: 15 };
    return { tab: "game", label: t.game, minutes: 10 };
  }

  function getProgressDetail(moduleId, levelId) {
    const stores = {
      vocabulary: global.EAP_VOCAB_MOCK,
      reading: global.EAP_READING_MOCK,
      listening: global.EAP_LISTENING_MOCK,
      speaking: global.EAP_SPEAKING_MOCK,
      writing: global.EAP_WRITING_MOCK,
    };
    const store = stores[moduleId];
    if (!store || !levelId) return {};
    return store.ensureProgress(levelId) || {};
  }

  function generatePlan(placement, forceNew) {
    if (!placement) return null;

    const levelId = placement.levelId || "intermediate";
    const date = todayKey();

    if (!forceNew) {
      const saved = loadPlan();
      if (saved && saved.date === date && saved.levelId === levelId) return saved;
    }

    const templates = taskTemplates(levelId);
    const modules = ["vocabulary", "reading", "listening", "writing", "speaking"];
    const ranked = modules
      .map((id) => ({ id, pct: getModuleProgress(levelId, id) }))
      .sort((a, b) => a.pct - b.pct);

    const weak = weakestSkill(placement);
    const tasks = [];
    let priority = 1;

    ranked.forEach((mod) => {
      const step = nextStepForModule(mod.id, mod.pct, templates, levelId);
      if (!step) return;
      const boost = mod.id === weak;
      tasks.push({
        id: `${mod.id}-${step.tab}-${date}`,
        moduleId: mod.id,
        tab: step.tab,
        label: step.label,
        href: `student-self-study-module.html?skill=${mod.id}`,
        minutes: step.minutes,
        priority: priority++,
        focus: boost,
        done: false,
      });
    });

    while (tasks.length > 5) tasks.pop();
    if (tasks.length < 3) {
      ranked.slice(0, 3).forEach((mod) => {
        if (tasks.length >= 3) return;
        if (tasks.some((t) => t.moduleId === mod.id)) return;
        const step = nextStepForModule(mod.id, mod.pct, templates, levelId);
        if (step) {
          tasks.push({
            id: `${mod.id}-extra-${date}`,
            moduleId: mod.id,
            tab: step.tab,
            label: step.label,
            href: `student-self-study-module.html?skill=${mod.id}`,
            minutes: step.minutes,
            priority: priority++,
            focus: false,
            done: false,
          });
        }
      });
    }

    const zh = isZh();
    const weakLabel = weak ? (zh ? skillLabelZh(weak) : skillLabelEn(weak)) : "";

    const plan = {
      date,
      levelId,
      generatedAt: new Date().toISOString(),
      focusSkill: weak,
      focusLabel: weakLabel,
      summaryEn: weak
        ? `Today's focus: ${skillLabelEn(weak)} (placement weak area) + modules with the least progress.`
        : "Balanced practice across your five skill modules.",
      summaryZh: weak
        ? `今日重点：${skillLabelZh(weak)}（分级薄弱项）+ 进度最低的模块。`
        : "在五项技能模块间均衡练习。",
      tasks,
    };

    savePlan(plan);
    return plan;
  }

  function skillLabelEn(skill) {
    const m = { vocabulary: "Vocabulary", reading: "Reading", listening: "Listening", speaking: "Speaking", writing: "Writing" };
    return m[skill] || skill;
  }

  function skillLabelZh(skill) {
    const m = { vocabulary: "词汇", reading: "阅读", listening: "听力", speaking: "口语", writing: "写作" };
    return m[skill] || skill;
  }

  function loadPlan() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function savePlan(plan) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch (_) {
      /* ignore */
    }
  }

  function toggleTaskDone(taskId) {
    const plan = loadPlan();
    if (!plan || !plan.tasks) return plan;
    plan.tasks = plan.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
    savePlan(plan);
    return plan;
  }

  function planSummary(plan) {
    if (!plan) return "";
    return isZh() ? plan.summaryZh : plan.summaryEn;
  }

  function completionStats(plan) {
    if (!plan || !plan.tasks.length) return { done: 0, total: 0, pct: 0 };
    const done = plan.tasks.filter((t) => t.done).length;
    const total = plan.tasks.length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }

  global.EAP_DAILY_PLAN = {
    STORAGE_KEY,
    generatePlan,
    loadPlan,
    toggleTaskDone,
    planSummary,
    completionStats,
    MODULE_META,
    todayKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
