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

  function renderAffixCard(w, index) {
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
      <button type="button" class="ssc-word-card ssc-word-card--affix ssc-word-card--btn" data-word-idx="${index}" aria-label="${escapeHtml(w.word)}">
        <h3 class="ssc-word-card__term">${escapeHtml(w.word)}</h3>
        ${w.phonetic ? `<p class="ssc-word-card__phonetic">${escapeHtml(w.phonetic)}</p>` : ""}
        <p class="ssc-word-card__def">${escapeHtml(w.coreMeaning || "")}</p>
        ${affixLine}
        ${mnemonic}
        ${examples}
        <span class="ssc-word-card__tap">${t("self_study_vocab_tap_detail")}</span>
      </button>
    `;
  }

  function closeWordDetail() {
    document.getElementById("ssc-word-detail")?.remove();
    document.body.classList.remove("ssc-word-detail-open");
  }

  function formatUkIpa(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.startsWith("/") && s.endsWith("/")) return s;
    if (s.startsWith("[") && s.endsWith("]")) return `/${s.slice(1, -1)}/`;
    return `/${s.replace(/^\/+|\/+$/g, "")}/`;
  }

  function pickUkIpa(ex, word) {
    if (!ex || typeof ex !== "object") return formatUkIpa(word && word.phonetic);
    const raw =
      ex.phonetic_ipa_uk ||
      ex.phonetic_uk ||
      ex.phonetic_ipa ||
      ex.phonetic ||
      ex.ipa ||
      ex.pronunciation ||
      (word && word.phonetic);
    return formatUkIpa(raw);
  }

  async function openWordDetail(word, levelId) {
    closeWordDetail();
    const overlay = document.createElement("div");
    overlay.id = "ssc-word-detail";
    overlay.className = "ssc-word-detail";
    overlay.innerHTML = `
      <div class="ssc-word-detail__backdrop" data-close="1"></div>
      <div class="ssc-word-detail__panel" role="dialog" aria-modal="true" aria-labelledby="ssc-word-detail-title">
        <button type="button" class="ssc-word-detail__close" data-close="1" aria-label="${t("self_study_close")}">×</button>
        <header class="ssc-word-detail__head">
          <h2 id="ssc-word-detail-title" class="ssc-word-detail__term">${escapeHtml(word.word)}</h2>
          <p class="ssc-word-detail__phonetic" id="ssc-word-detail-ipa" aria-live="polite">${word.phonetic ? escapeHtml(formatUkIpa(word.phonetic)) : t("self_study_vocab_ipa_loading")}</p>
          <p class="ssc-word-detail__core">${escapeHtml(word.coreMeaning || "")}</p>
        </header>
        <div class="ssc-word-detail__body" id="ssc-word-detail-body">
          <p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("ssc-word-detail-open");
    overlay.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeWordDetail);
    });

    const aff = word.affix || {};
    const parts = [aff.prefix, aff.root, aff.suffix].filter(Boolean);
    let aiBlock = "";
    const AI = global.EAP_SELF_STUDY_AI;
    if (AI && typeof AI.explainVocabulary === "function") {
      try {
        const ex = await AI.explainVocabulary(word.word, levelId || "intermediate", isZh() ? "zh" : "en");
        if (ex) {
          const ipa = pickUkIpa(ex, word);
          const ipaEl = document.getElementById("ssc-word-detail-ipa");
          if (ipaEl) ipaEl.textContent = ipa || t("self_study_vocab_ipa_unavailable");
          aiBlock = `
            <section class="ssc-word-detail__section">
              <h3>${t("self_study_vocab_detail_meaning")}</h3>
              <p>${escapeHtml(ex.definition_en || "")}</p>
              ${ex.definition_zh ? `<p class="ssc-word-detail__zh">${escapeHtml(ex.definition_zh)}</p>` : ""}
            </section>
            ${ex.synonyms_en ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_synonyms")}</h3><p>${escapeHtml(ex.synonyms_en)}</p></section>` : ""}
            ${ex.antonyms_en ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_antonyms")}</h3><p>${escapeHtml(ex.antonyms_en)}</p></section>` : ""}
            ${ex.eap_usage_en || ex.eap_usage_zh ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_eap")}</h3><p>${escapeHtml(ex.eap_usage_en || "")}</p>${ex.eap_usage_zh ? `<p class="ssc-word-detail__zh">${escapeHtml(ex.eap_usage_zh)}</p>` : ""}</section>` : ""}
            ${ex.word_root ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_root")}</h3><p>${escapeHtml(ex.word_root)}</p></section>` : ""}
            ${ex.collocation ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_collocation")}</h3><p>${escapeHtml(ex.collocation)}</p></section>` : ""}
            ${ex.derived_words ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_related")}</h3><p>${escapeHtml(ex.derived_words)}</p></section>` : ""}
            ${ex.example_en ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_examples")}</h3><p>${escapeHtml(ex.example_en)}</p>${ex.example_zh ? `<p class="ssc-word-detail__zh">${escapeHtml(ex.example_zh)}</p>` : ""}</section>` : ""}
            ${ex.memory_tip_en ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_mnemonic")}</h3><p>${escapeHtml(ex.memory_tip_en)}</p>${ex.memory_tip_zh ? `<p class="ssc-word-detail__zh">${escapeHtml(ex.memory_tip_zh)}</p>` : ""}</section>` : ""}
          `;
        }
      } catch (e) {
        aiBlock = `<p class="ssc-vocab-error">${escapeHtml(e.message)}</p>`;
        const ipaEl = document.getElementById("ssc-word-detail-ipa");
        const fallback = formatUkIpa(word.phonetic);
        if (ipaEl) ipaEl.textContent = fallback || t("self_study_vocab_ipa_unavailable");
      }
    }

    const body = document.getElementById("ssc-word-detail-body");
    if (body) {
      body.innerHTML = `
        ${parts.length ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_detail_affix")}</h3><p class="ssc-affix-line">${parts.map((p) => `<span class="ssc-affix-part">${escapeHtml(p)}</span>`).join(" + ")}</p></section>` : ""}
        ${word.mnemonic ? `<section class="ssc-word-detail__section"><h3>${t("self_study_vocab_mnemonic")}</h3><p>${escapeHtml(word.mnemonic)}</p></section>` : ""}
        ${aiBlock || `<p class="ssc-vocab-hint">${t("self_study_vocab_detail_offline")}</p>`}
      `;
    }
  }

  function bindWordCards(root, words, levelId) {
    root.querySelectorAll("[data-word-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-word-idx"), 10);
        const w = words[idx];
        if (w) void openWordDetail(w, levelId);
      });
    });
  }

  const state = {
    overview: null,
    today: null,
    selectedDay: null,
    activeChannel: "B",
    activeTab: "learn",
    practiceRetake: false,
    packId: null,
    unitId: null,
    unitWords: null,
  };

  function estimateExamTotal(exam) {
    let total = 0;
    (exam?.sections || []).forEach((section) => {
      const st = section.type;
      if (st === "mcq" || st === "fill") {
        total += (section.items || []).length;
      } else if (st === "match") {
        (section.items || []).forEach((item) => {
          total += (item.pairs || []).length;
        });
      } else if (st === "order") {
        total += (section.items || []).length;
      } else if (st === "writing") {
        total += 2;
      }
    });
    return Math.max(total, 1);
  }

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
    const active = state.activeChannel || "B";
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

  function bindTabClicks(shell) {
    shell.querySelectorAll(".ssc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        showTab(tab);
        void renderPanel(tab);
      });
    });
  }

  function rebuildTabChrome(shell) {
    if (!shell || !state.overview) return;
    const channel = state.activeChannel || "B";
    const tabs = buildTabs(channel);
    const allowed = new Set(tabs.map((x) => x.id));
    if (!allowed.has(state.activeTab)) {
      state.activeTab = channel === "A" ? (state.unitId ? "learn" : "packs") : "learn";
    }
    const nav = shell.querySelector(".ssc-tabs");
    if (nav) nav.outerHTML = renderTabsNav(channel, state.activeTab);
    tabs.forEach((tab) => {
      if (!document.getElementById(`ssc-panel-${tab.id}`)) {
        const panel = document.createElement("div");
        panel.id = `ssc-panel-${tab.id}`;
        panel.className = "ssc-tab-panel";
        panel.setAttribute("data-panel", tab.id);
        panel.setAttribute("role", "tabpanel");
        panel.hidden = tab.id !== state.activeTab;
        shell.appendChild(panel);
      }
    });
    document.querySelectorAll(".ssc-tab-panel").forEach((panel) => {
      const id = panel.getAttribute("data-panel");
      if (!allowed.has(id)) panel.hidden = true;
      else panel.hidden = id !== state.activeTab;
    });
    bindTabClicks(shell);
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
  }

  async function renderLearnPanel(root) {
    if (state.selectedDay) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
      try {
        state.today = await SERVER().getVocabDay(state.selectedDay, state.activeChannel);
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    } else if (!state.today) {
      try {
        state.today = await SERVER().getVocabToday(state.activeChannel);
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    }

    const data = state.today;
    if (data.channelAComplete) {
      root.innerHTML = `
        <div class="ssc-banner">
          <h2>${t("self_study_vocab_channel_a_complete")}</h2>
          <p>${escapeHtml(data.message || "")}</p>
        </div>
      `;
      updateHeader(100, t("self_study_vocab_channel_a_complete"));
      return;
    }
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
      <div class="ssc-word-grid">${words.map((w, i) => renderAffixCard(w, i)).join("")}</div>
      ${data.channel === "A" ? `<p class="ssc-vocab-hint">${t("self_study_vocab_channel_a_daily_hint")}</p>` : ""}
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
      state.practiceRetake = false;
      void renderLearnPanel(root);
    });

    bindWordCards(root, words, state.placementLevel || "intermediate");

    document.getElementById("ssc-learn-done-btn")?.addEventListener("click", async () => {
      try {
        const body =
          data.channel === "A"
            ? {
                kind: "channel_a",
                className: state.overview.className,
                dayNumber: data.dayNumber,
                learnDone: true,
                practiceDone: prog.practiceDone,
                practiceScore: prog.practiceScore,
              }
            : {
                kind: "day",
                courseId: data.courseId,
                dayNumber: data.dayNumber,
                learnDone: true,
                practiceDone: prog.practiceDone,
                practiceScore: prog.practiceScore,
              };
        await SERVER().completeVocab(body);
        state.today = null;
        await renderLearnPanel(root);
      } catch (e) {
        alert(e.message);
      }
    });
  }

  function orderedParts(item, answers) {
    const parts = item.parts || [];
    const saved = answers[item.id];
    if (Array.isArray(saved) && saved.length === parts.length) {
      return saved.map((idx) => parts[idx]).filter(Boolean);
    }
    return parts;
  }

  function bindOrderDragLists(root, answers) {
    root.querySelectorAll(".ssc-exam-order").forEach((list) => {
      const orderId = list.getAttribute("data-order");
      let dragEl = null;
      list.querySelectorAll("li[draggable]").forEach((li) => {
        li.addEventListener("dragstart", (ev) => {
          dragEl = li;
          li.classList.add("ssc-exam-order__drag");
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        });
        li.addEventListener("dragend", () => {
          li.classList.remove("ssc-exam-order__drag");
          dragEl = null;
          answers[orderId] = [...list.querySelectorAll("li[data-idx]")].map((el) =>
            parseInt(el.getAttribute("data-idx"), 10),
          );
        });
        li.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          if (!dragEl || dragEl === li) return;
          const rect = li.getBoundingClientRect();
          const after = ev.clientY > rect.top + rect.height / 2;
          list.insertBefore(dragEl, after ? li.nextSibling : li);
        });
      });
    });
  }

  function renderExamSection(section, answers, onAnswer) {
    const type = section.type || "mcq";
    const items = section.items || [];
    if (type === "mcq" || type === "fill") {
      return items
        .map((item) => {
          const chosen = answers[item.id];
          if (type === "fill") {
            return `<div class="ssc-exam-item" data-id="${escapeHtml(item.id)}">
              <p class="ssc-exam-prompt">${escapeHtml(item.promptEn || item.prompt || "")}</p>
              <input type="text" class="ssc-exam-input" data-fill="${escapeHtml(item.id)}" value="${escapeHtml(chosen || "")}" placeholder="${t("self_study_exam_type_answer")}" />
            </div>`;
          }
          const opts = item.options || [];
          return `<div class="ssc-exam-item" data-id="${escapeHtml(item.id)}">
            <p class="ssc-exam-prompt">${escapeHtml(item.promptEn || item.prompt || "")}</p>
            <ul class="ssc-options">${opts.map((o, i) => `<li><button type="button" class="ssc-option${chosen === i ? " ssc-option--selected" : ""}" data-q="${escapeHtml(item.id)}" data-i="${i}">${escapeHtml(o)}</button></li>`).join("")}</ul>
          </div>`;
        })
        .join("");
    }
    if (type === "match") {
      return items
        .map((item) => {
          const pairs = item.pairs || [];
          const rights = [...new Set(pairs.map((x) => x.right))];
          return `<div class="ssc-exam-item"><p class="ssc-exam-prompt">${escapeHtml(item.promptEn || t("self_study_exam_match"))}</p>
            <ul class="ssc-exam-match">${pairs.map((p) => `<li><span class="ssc-exam-match__left">${escapeHtml(p.left)}</span><select class="ssc-exam-select" data-match="${escapeHtml(item.id)}" data-left="${escapeHtml(p.left)}">${["", ...rights].map((r) => `<option value="${escapeHtml(r)}"${answers[`${item.id}:${p.left}`] === r ? " selected" : ""}>${escapeHtml(r || "—")}</option>`).join("")}</select></li>`).join("")}</ul></div>`;
        })
        .join("");
    }
    if (type === "order") {
      return items
        .map((item) => {
          const parts = orderedParts(item, answers);
          const idxMap = (item.parts || []).map((p) => parts.indexOf(p));
          return `<div class="ssc-exam-item"><p class="ssc-exam-prompt">${escapeHtml(item.promptEn || t("self_study_exam_order"))}</p>
            <ol class="ssc-exam-order" data-order="${escapeHtml(item.id)}">${parts.map((p, i) => {
              const origIdx = (item.parts || []).indexOf(p);
              return `<li draggable="true" data-idx="${origIdx >= 0 ? origIdx : i}">${escapeHtml(p)}</li>`;
            }).join("")}</ol></div>`;
        })
        .join("");
    }
    if (type === "writing") {
      const val = answers.writing || "";
      return `<div class="ssc-exam-item ssc-exam-writing">
        <p class="ssc-exam-prompt">${escapeHtml(itemPrompt(section))}</p>
        <textarea id="ssc-exam-writing" class="ssc-exam-textarea" rows="10" placeholder="${t("self_study_exam_writing_ph")}">${escapeHtml(val)}</textarea>
        <p class="ssc-exam-wordcount" id="ssc-exam-wc">${t("self_study_exam_word_count", { n: String(val.trim().split(/\s+/).filter(Boolean).length) })}</p>
      </div>`;
    }
    return "";
  }

  function itemPrompt(section) {
    const items = section.items || [];
    return items[0]?.promptEn || items[0]?.prompt || section.promptEn || "";
  }

  async function renderPracticePanel(root) {
    if (!state.today) {
      try {
        state.today = state.selectedDay
          ? await SERVER().getVocabDay(state.selectedDay, state.activeChannel)
          : await SERVER().getVocabToday(state.activeChannel);
      } catch (e) {
        root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
        return;
      }
    }
    const data = state.today;
    if (data.channelAComplete) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_channel_a_complete")}</p>`;
      return;
    }
    if (!data.newWords || !(data.words || []).length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_practice_today")}</p>`;
      return;
    }

    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let exam;
    try {
      exam =
        state.activeChannel === "A"
          ? await SERVER().getVocabPracticeExam({
              channel: "A",
              className: state.overview.className,
              dayNumber: data.dayNumber,
            })
          : await SERVER().getVocabPracticeExam({
              channel: "B",
              courseId: data.courseId,
              dayNumber: data.dayNumber,
            });
    } catch (e) {
      root.innerHTML = `<p class="ssc-vocab-error" role="alert">${escapeHtml(e.message)}</p>`;
      return;
    }

    const sections = exam.sections || [];
    if (!sections.length) {
      root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_vocab_no_practice_today")}</p>`;
      return;
    }

    const answers = {};
    const prog = data.progress || {};

    function bindExamInteractions() {
      root.querySelectorAll(".ssc-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          const qid = btn.getAttribute("data-q");
          answers[qid] = parseInt(btn.getAttribute("data-i"), 10);
          root.querySelectorAll(`.ssc-option[data-q="${qid}"]`).forEach((el) => {
            el.classList.toggle("ssc-option--selected", el === btn);
          });
        });
      });
      root.querySelectorAll("[data-fill]").forEach((inp) => {
        inp.addEventListener("input", () => {
          answers[inp.getAttribute("data-fill")] = inp.value;
        });
      });
      root.querySelectorAll("[data-match]").forEach((sel) => {
        sel.addEventListener("change", () => {
          const id = sel.getAttribute("data-match");
          const left = sel.getAttribute("data-left");
          answers[`${id}:${left}`] = sel.value;
        });
      });
      const ta = document.getElementById("ssc-exam-writing");
      if (ta) {
        ta.addEventListener("input", () => {
          answers.writing = ta.value;
          const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
          const wcEl = document.getElementById("ssc-exam-wc");
          if (wcEl) wcEl.textContent = t("self_study_exam_word_count", { n: String(wc) });
        });
      }
      bindOrderDragLists(root, answers);
    }

    async function submitExam() {
      const btn = document.getElementById("ssc-exam-submit");
      if (btn) btn.disabled = true;
      root.querySelectorAll(".ssc-exam-order").forEach((list) => {
        const orderId = list.getAttribute("data-order");
        answers[orderId] = [...list.querySelectorAll("li[data-idx]")].map((el) =>
          parseInt(el.getAttribute("data-idx"), 10),
        );
      });
      try {
        const result = await SERVER().gradeVocabPracticeExam({
          courseId: data.courseId,
          dayNumber: data.dayNumber,
          answers,
          exam,
        });
        const completeBody =
          data.channel === "A"
            ? {
                kind: "channel_a",
                className: state.overview.className,
                dayNumber: data.dayNumber,
                learnDone: prog.learnDone,
                practiceDone: true,
                practiceScore: result.score || 0,
                practiceScoreTotal: result.total || estimateExamTotal(exam),
              }
            : {
                kind: "day",
                courseId: data.courseId,
                dayNumber: data.dayNumber,
                learnDone: prog.learnDone,
                practiceDone: true,
                practiceScore: result.score || 0,
                practiceScoreTotal: result.total || estimateExamTotal(exam),
              };
        await SERVER().completeVocab(completeBody);
        state.practiceRetake = false;
        state.today = null;
        root.innerHTML = `
          <div class="ssc-report">
            <h2>${t("self_study_vocab_practice_done")}</h2>
            <p>${t("self_study_vocab_practice_score", { correct: String(result.score || 0), total: String(result.total || 0) })}</p>
            ${result.writingFeedback ? `<div class="ssc-exam-feedback"><h3>${t("self_study_exam_writing_feedback")}</h3><p>${escapeHtml(result.writingFeedback)}</p></div>` : ""}
          </div>
        `;
        updateHeader(100, t("self_study_vocab_complete_short"));
      } catch (e) {
        alert(e.message);
        if (btn) btn.disabled = false;
      }
    }

    function renderExam() {
      root.innerHTML = `
        <div class="ssc-exam">
          <header class="ssc-exam-header">
            <h2>${t("self_study_exam_title")}</h2>
            <p>${escapeHtml(exam.titleEn || "")}</p>
          </header>
          ${sections.map((sec) => `<section class="ssc-exam-section"><h3>${escapeHtml(sec.titleEn || sec.type || "")}</h3>${renderExamSection(sec, answers)}</section>`).join("")}
          <div class="ssc-placement-actions">
            <button type="button" class="btn-primary" id="ssc-exam-submit">${t("self_study_exam_submit")}</button>
          </div>
        </div>
      `;
      bindExamInteractions();
      document.getElementById("ssc-exam-submit")?.addEventListener("click", () => void submitExam());
    }

    const examTotal = prog.practiceScoreTotal || estimateExamTotal(exam);

    if (prog.practiceDone && !state.practiceRetake) {
      root.innerHTML = `
        <div class="ssc-report">
          <h2>${t("self_study_vocab_practice_done")}</h2>
          <p>${t("self_study_vocab_practice_score", { correct: String(prog.practiceScore ?? 0), total: String(examTotal) })}</p>
          <button type="button" class="btn-secondary" id="ssc-practice-redo">${t("self_study_vocab_redo")}</button>
        </div>
      `;
      document.getElementById("ssc-practice-redo")?.addEventListener("click", () => {
        state.practiceRetake = true;
        renderExam();
      });
      return;
    }
    renderExam();
  }

  async function renderReviewPanel(root) {
    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let data;
    try {
      data = await SERVER().getVocabReviewYesterday(state.activeChannel);
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
          ? await SERVER().getVocabDay(state.selectedDay, state.activeChannel)
          : await SERVER().getVocabToday(state.activeChannel);
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
    const mount = document.createElement("div");
    mount.className = "ssc-game-mount";
    root.replaceChildren();
    const intro = document.createElement("p");
    intro.className = "ssc-vocab-hint ssc-game-intro";
    intro.textContent = t("self_study_vocab_game_intro");
    root.append(intro, mount);
    const onComplete = (res) => {
      mount.replaceChildren();
      const report = document.createElement("div");
      report.className = "ssc-report";
      report.innerHTML = `
        <h2>${t("self_study_vocab_game_done")}</h2>
        <p>${t("self_study_vocab_practice_score", { correct: String(res.score), total: String(res.total) })}</p>
      `;
      mount.appendChild(report);
    };
    if (mode === "star") global.EAP_VOCAB_GAMES.mountStarBattle(mount, games, onComplete);
    else global.EAP_VOCAB_GAMES.mountSpeedRace(mount, games, onComplete);
  }

  async function renderCalendarPanel(root) {
    root.innerHTML = `<p class="ssc-vocab-hint">${t("self_study_ai_loading")}</p>`;
    let data;
    try {
      data = await SERVER().getVocabCalendar(state.activeChannel);
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
        state.practiceRetake = false;
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
      state.practiceRetake = false;
      rebuildTabChrome(document.getElementById("ssc-module-root"));
      void renderPacksPanel(root);
    });
    root.querySelectorAll("[data-unit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.unitId = parseInt(btn.getAttribute("data-unit"), 10);
        state.unitWords = null;
        state.practiceRetake = false;
        rebuildTabChrome(document.getElementById("ssc-module-root"));
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

    const params = new URLSearchParams(global.location.search);
    const dayParam = parseInt(params.get("day") || "", 10);
    const tabParam = params.get("tab") || "";
    const channelParam = String(params.get("channel") || "B").toUpperCase();
    state.activeChannel = channelParam === "A" ? "A" : "B";
    if (dayParam > 0) state.selectedDay = dayParam;
    try {
      const st = await SERVER().getStatus();
      state.placementLevel = st.placement?.levelId || "intermediate";
    } catch (_) {
      state.placementLevel = "intermediate";
    }

    const channel = state.activeChannel || "B";
    let defaultTab = "learn";
    const allowedTabs = buildTabs(channel).map((x) => x.id);
    if (tabParam && allowedTabs.includes(tabParam)) defaultTab = tabParam;
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

    bindTabClicks(shell);

    await renderPanel(defaultTab);
    return true;
  }

  global.EAP_VOCAB_UI = { init };
})(typeof window !== "undefined" ? window : globalThis);
