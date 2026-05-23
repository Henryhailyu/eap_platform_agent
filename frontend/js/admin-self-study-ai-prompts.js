/**
 * Manager centre — self-study AI prompt configuration (Phase K2b–K2c).
 */
(function () {
  const AI = () => window.EAP_SELF_STUDY_AI;
  const MAT = () => window.EAP_MANAGER_SSC_MATERIALS;

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

  function populateModules(sel, selected) {
    const api = MAT();
    if (!sel || !api || !api.MODULES) return;
    sel.innerHTML = api.MODULES.map((m) => {
      const label = window.EAP_I18N && window.EAP_I18N.getLang() === "zh" ? m.labelZh : m.labelEn;
      const selectedAttr = m.id === selected ? " selected" : "";
      return `<option value="${escapeHtml(m.id)}"${selectedAttr}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function syncPreviewFields(mod) {
    const isReading = mod === "reading";
    document.querySelectorAll(".admin-ai-preview-vocab").forEach((el) => {
      el.classList.toggle("hidden", isReading);
    });
    document.querySelectorAll(".admin-ai-preview-reading").forEach((el) => {
      el.classList.toggle("hidden", !isReading);
    });
  }

  function renderPreview(panel, mod, payload) {
    if (!panel || !payload) return;
    panel.classList.remove("hidden");

    if (mod === "reading") {
      const rows = [
        ["summary_en", t("self_study_reading_ai_title")],
        ["key_idea_en", t("self_study_reading_ai_key_idea")],
        ["vocabulary_tip_en", t("self_study_reading_ai_vocab_tip")],
      ];
      panel.innerHTML = `
        <h4 class="admin-ai-preview__title">${t("self_study_reading_ai_title")}</h4>
        ${rows
          .map(([key, label]) => {
            const val = payload[key];
            if (!val) return "";
            return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(val)}</p>`;
          })
          .join("")}
      `;
      return;
    }

    const rows = [
      ["definition_en", "Definition"],
      ["word_root", t("self_study_ai_word_root")],
      ["collocation", t("self_study_ai_collocation")],
      ["derived_words", t("self_study_ai_derived")],
      ["example_en", t("self_study_ai_example")],
      ["memory_tip_en", t("self_study_ai_memory_tip")],
    ];
    panel.innerHTML = `
      <h4 class="admin-ai-preview__title">${escapeHtml(payload.term || "—")}</h4>
      ${rows
        .map(([key, label]) => {
          const val = payload[key];
          if (!val) return "";
          return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(val)}</p>`;
        })
        .join("")}
    `;
  }

  async function loadPrompt(module) {
    const api = AI();
    if (!api) return null;
    return api.getAdminPrompt(module);
  }

  async function initAdminSelfStudyAiPrompts() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    const modSel = document.getElementById("admin-ai-module");
    const promptEl = document.getElementById("admin-ai-prompt");
    const statusEl = document.getElementById("admin-ai-status");
    const previewPanel = document.getElementById("admin-ai-preview");
    if (!modSel || !promptEl || !AI()) return;

    populateModules(modSel, "vocabulary");
    syncPreviewFields(modSel.value || "vocabulary");

    async function refreshPrompt() {
      const mod = modSel.value || "vocabulary";
      syncPreviewFields(mod);
      setStatus(statusEl, "", false);
      if (previewPanel) {
        previewPanel.classList.add("hidden");
        previewPanel.innerHTML = "";
      }
      try {
        const data = await loadPrompt(mod);
        promptEl.value = data.prompt?.system_prompt || data.default_prompt || "";
      } catch (_) {
        setStatus(statusEl, t("admin_ai_load_failed"), true);
      }
    }

    modSel.addEventListener("change", () => {
      void refreshPrompt();
    });

    document.getElementById("admin-ai-save-btn")?.addEventListener("click", async () => {
      const mod = modSel.value || "vocabulary";
      const text = promptEl.value.trim();
      if (!text) return;
      setStatus(statusEl, t("admin_ai_saving"), false);
      try {
        await AI().saveAdminPrompt(mod, text);
        setStatus(statusEl, t("admin_ai_saved"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_ai_save_failed"), true);
      }
    });

    document.getElementById("admin-ai-reset-btn")?.addEventListener("click", async () => {
      const mod = modSel.value || "vocabulary";
      if (!window.confirm(t("admin_ai_reset_confirm"))) return;
      setStatus(statusEl, "", false);
      try {
        const data = await AI().resetAdminPrompt(mod);
        promptEl.value = data.prompt?.system_prompt || "";
        setStatus(statusEl, t("admin_ai_reset_ok"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_ai_save_failed"), true);
      }
    });

    document.getElementById("admin-ai-preview-btn")?.addEventListener("click", async () => {
      const mod = modSel.value || "vocabulary";
      const level = document.getElementById("admin-ai-preview-level")?.value || "beginner";
      const lang = window.EAP_I18N && window.EAP_I18N.getLang() === "zh" ? "zh" : "en";
      const body = {
        level,
        lang,
        system_prompt: promptEl.value.trim(),
      };
      if (mod === "reading") {
        body.text = (document.getElementById("admin-ai-preview-passage")?.value || "").trim();
      } else {
        body.term = (document.getElementById("admin-ai-preview-term")?.value || "analyze").trim();
      }
      setStatus(statusEl, t("admin_ai_previewing"), false);
      try {
        const data = await AI().previewAdminPrompt(mod, body);
        const payload = data.coach || data.explanation;
        renderPreview(previewPanel, mod, payload);
        setStatus(statusEl, t("admin_ai_preview_ok"), false);
      } catch (err) {
        if (previewPanel) previewPanel.classList.add("hidden");
        setStatus(statusEl, (err && err.message) || t("admin_ai_preview_failed"), true);
      }
    });

    window.addEventListener("eap:langchange", () => {
      const mod = modSel.value;
      populateModules(modSel, mod);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });

    await refreshPrompt();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void initAdminSelfStudyAiPrompts();
  });
})();
