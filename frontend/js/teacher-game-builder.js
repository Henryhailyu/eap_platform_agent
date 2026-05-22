/**
 * Teacher Game Builder UI (Phase L10–L12 — mock).
 */
(function () {
  const PAGE = "teacher-game-builder";
  function getMock() {
    return window.EAP_GAME_BUILDER_MOCK || null;
  }

  function initPageChrome() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && logoutBtn.dataset.eapBound !== "1") {
      logoutBtn.dataset.eapBound = "1";
      logoutBtn.addEventListener("click", () => {
        if (typeof logoutAndGoHome === "function") logoutAndGoHome();
        else window.location.href = "index.html";
      });
    }
    const welcomeEl = document.getElementById("header-welcome");
    if (welcomeEl && typeof getLoggedInUser === "function") {
      const user = getLoggedInUser();
      if (user) {
        welcomeEl.textContent = t("welcome_user", { name: user.full_name || user.username || "User" });
      }
    }
  }

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  let selectedTemplateId = null;
  let currentPreviewHtml = "";
  let lastSavedGameId = null;

  function setSaveButtonState(saved) {
    const btn = document.getElementById("tgb-save");
    if (!btn) return;
    if (saved) {
      btn.textContent = t("tgb_saved_btn");
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("tgb-save-btn--saved");
    } else {
      btn.textContent = t("tgb_save");
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
      btn.classList.remove("tgb-save-btn--saved");
    }
  }

  function showStep(step) {
    ["templates", "design", "preview"].forEach((s) => {
      const el = document.getElementById(`tgb-step-${s}`);
      if (el) el.classList.toggle("hidden", s !== step);
    });
    document.getElementById("tgb-progress-templates")?.classList.toggle("tgb-progress__dot--done", step !== "templates");
    document.getElementById("tgb-progress-design")?.classList.toggle("tgb-progress__dot--done", step === "preview");
    document.getElementById("tgb-progress-preview")?.classList.toggle("tgb-progress__dot--active", step === "preview");
  }

  function renderTemplates() {
    const MOCK = getMock();
    const grid = document.getElementById("tgb-template-grid");
    if (!grid || !MOCK) return;
    grid.innerHTML = MOCK.GAME_TEMPLATES.map(
      (tpl) => `
        <button type="button" class="tgb-template-card" data-template="${tpl.id}" aria-pressed="false">
          <span class="tgb-template-card__icon" aria-hidden="true">${tpl.icon}</span>
          <strong>${MOCK.tplLabel(tpl, "name")}</strong>
        </button>
      `,
    ).join("");

    grid.querySelectorAll(".tgb-template-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTemplateId = btn.getAttribute("data-template");
        grid.querySelectorAll(".tgb-template-card").forEach((b) => {
          const on = b.getAttribute("data-template") === selectedTemplateId;
          b.classList.toggle("tgb-template-card--selected", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const next = document.getElementById("tgb-to-design");
        if (next) next.disabled = !selectedTemplateId;
      });
    });
  }

  function runMockGenerate() {
    const MOCK = getMock();
    const topic = (document.getElementById("tgb-topic")?.value || "").trim();
    const className = (document.getElementById("tgb-class")?.value || "EAP047").trim();
    if (!selectedTemplateId || !MOCK) return;
    currentPreviewHtml = MOCK.mockGeneratePreview(selectedTemplateId, topic, className);
    const box = document.getElementById("tgb-preview-box");
    if (box) box.innerHTML = currentPreviewHtml;
    lastSavedGameId = null;
    setSaveButtonState(false);
    const msg = document.getElementById("tgb-save-msg");
    if (msg) msg.classList.add("hidden");
    showStep("preview");
  }

  function saveGame() {
    const MOCK = getMock();
    if (!MOCK || !selectedTemplateId) return;
    const topic = (document.getElementById("tgb-topic")?.value || "").trim();
    const className = (document.getElementById("tgb-class")?.value || "EAP047").trim();
    const game = MOCK.buildGameFromDraft({
      templateId: selectedTemplateId,
      topic,
      className,
      previewHtml: currentPreviewHtml,
    });
    MOCK.saveCustomGame(game);
    lastSavedGameId = game.id;
    setSaveButtonState(true);
    const msg = document.getElementById("tgb-save-msg");
    if (msg) {
      msg.textContent = t("tgb_saved_ok");
      msg.classList.remove("hidden");
    }
  }

  function bindEvents(ctx) {
    document.getElementById("tgb-to-design")?.addEventListener("click", () => {
      if (!selectedTemplateId) return;
      const MOCK = getMock();
      const tpl = MOCK && MOCK.GAME_TEMPLATES.find((x) => x.id === selectedTemplateId);
      const label = document.getElementById("tgb-selected-template");
      if (label && tpl && MOCK) label.textContent = MOCK.tplLabel(tpl, "name");
      showStep("design");
    });
    document.getElementById("tgb-back-templates")?.addEventListener("click", () => showStep("templates"));
    document.getElementById("tgb-generate")?.addEventListener("click", runMockGenerate);
    document.getElementById("tgb-regenerate")?.addEventListener("click", runMockGenerate);
    document.getElementById("tgb-back-design")?.addEventListener("click", () => showStep("design"));
    document.getElementById("tgb-save")?.addEventListener("click", saveGame);

    const liveLink = document.getElementById("tgb-open-live");
    if (liveLink) {
      const q = new URLSearchParams();
      if (ctx.className) q.set("class_name", ctx.className);
      if (ctx.date) q.set("date", ctx.date);
      liveLink.href = `teacher-live.html${q.toString() ? `?${q.toString()}` : ""}`;
    }
  }

  function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (window.EAP_TEACHER_LIVE_ENABLED === false) {
      window.location.replace("teacher.html");
      return;
    }
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    initPageChrome();
    if (!getMock()) return;

    const p = new URLSearchParams(window.location.search);
    const ctx = {
      className: p.get("class_name") || "EAP047",
      date: p.get("date") || "",
    };
    const classInput = document.getElementById("tgb-class");
    if (classInput) classInput.value = ctx.className;

    renderTemplates();
    bindEvents(ctx);
    showStep("templates");

    window.addEventListener("eap:langchange", () => {
      renderTemplates();
      if (selectedTemplateId && document.getElementById("tgb-step-preview") && !document.getElementById("tgb-step-preview").classList.contains("hidden")) {
        runMockGenerate();
      }
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
      initPageChrome();
    });

    void (async () => {
      if (typeof validatePageSessionOrFallback !== "function") return;
      const sessionUser = await validatePageSessionOrFallback("teacher");
      if (!sessionUser) return;
      if (typeof initAppPageHeader === "function") initAppPageHeader();
      initPageChrome();
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
