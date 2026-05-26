/**
 * Manager centre — teaching page AI templates (Phase K4).
 */
(function () {
  const API = () => window.EAP_TEACHER_TEACHING_PAGES;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("form-message--error", !!isError);
    el.classList.remove("form-message--success");
    if (text && !isError) el.classList.add("form-message--success");
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function templateLabel(tpl) {
    const zh = window.EAP_I18N && window.EAP_I18N.getLang() === "zh";
    return zh ? tpl.label_zh || tpl.template_key : tpl.label_en || tpl.template_key;
  }

  async function initAdminTeachingPageTemplates() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    const sel = document.getElementById("admin-tpt-template");
    const promptEl = document.getElementById("admin-tpt-prompt");
    const statusEl = document.getElementById("admin-tpt-status");
    const previewFrame = document.getElementById("admin-tpt-preview-frame");
    const previewEmpty = document.getElementById("admin-tpt-preview-empty");
    const api = API();
    if (!sel || !promptEl || !api) return;

    async function loadTemplates() {
      const list = await api.listAdminTemplates();
      sel.innerHTML = list
        .map((tpl) => {
          const label = templateLabel(tpl);
          return `<option value="${escapeHtml(tpl.template_key)}">${escapeHtml(label)}</option>`;
        })
        .join("");
    }

    async function refreshPrompt() {
      setStatus(statusEl, "", false);
      if (previewFrame) {
        previewFrame.classList.add("hidden");
        previewFrame.removeAttribute("srcdoc");
      }
      if (previewEmpty) previewEmpty.classList.remove("hidden");
      try {
        const key = sel.value || "standard";
        const data = await api.getAdminTemplate(key);
        promptEl.value = data.template?.system_prompt || "";
      } catch (_) {
        setStatus(statusEl, t("admin_tpt_load_failed"), true);
      }
    }

    await loadTemplates();
    await refreshPrompt();

    sel.addEventListener("change", () => {
      void refreshPrompt();
    });

    document.getElementById("admin-tpt-save-btn")?.addEventListener("click", async () => {
      const key = sel.value || "standard";
      setStatus(statusEl, t("admin_ai_saving"), false);
      try {
        await api.saveAdminTemplate(key, promptEl.value.trim());
        setStatus(statusEl, t("admin_ai_saved"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_ai_save_failed"), true);
      }
    });

    document.getElementById("admin-tpt-reset-btn")?.addEventListener("click", async () => {
      const key = sel.value || "standard";
      if (!window.confirm(t("admin_ai_reset_confirm"))) return;
      try {
        const tpl = await api.resetAdminTemplate(key);
        promptEl.value = tpl.system_prompt || "";
        setStatus(statusEl, t("admin_ai_reset_ok"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_ai_save_failed"), true);
      }
    });

    document.getElementById("admin-tpt-preview-btn")?.addEventListener("click", async () => {
      const key = sel.value || "standard";
      const level = document.getElementById("admin-tpt-preview-level")?.value || "intermediate";
      const lang = window.EAP_I18N && window.EAP_I18N.getLang() === "zh" ? "zh" : "en";
      const topic = (document.getElementById("admin-tpt-preview-topic")?.value || "").trim();
      const source_text = (document.getElementById("admin-tpt-preview-source")?.value || "").trim();
      setStatus(statusEl, t("admin_ai_previewing"), false);
      try {
        const page = await api.previewAdminTemplate(key, {
          topic: topic || "Academic integrity",
          source_text,
          level,
          lang,
          system_prompt: promptEl.value.trim(),
        });
        if (previewFrame && page?.html) {
          if (previewEmpty) previewEmpty.classList.add("hidden");
          previewFrame.classList.remove("hidden");
          previewFrame.srcdoc = page.html;
        }
        setStatus(statusEl, t("admin_ai_preview_ok"), false);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("admin_ai_preview_failed"), true);
      }
    });

    window.addEventListener("eap:langchange", () => {
      void loadTemplates().then(refreshPrompt);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void initAdminTeachingPageTemplates();
  });
})();
