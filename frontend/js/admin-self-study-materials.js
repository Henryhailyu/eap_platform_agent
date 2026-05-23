/**
 * Manager centre — self-study materials upload (Phase S7 mock → Phase K1 server).
 */
(function () {
  const MAT = () => window.EAP_MANAGER_SSC_MATERIALS;
  const API = () => window.EAP_SELF_STUDY_MATERIALS_API;

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

  function populateSelect(sel, options, selectedId) {
    if (!sel) return;
    sel.innerHTML = options
      .map((o) => {
        const label = window.EAP_I18N && window.EAP_I18N.getLang() === "zh" ? o.labelZh : o.labelEn;
        const selected = o.id === selectedId ? " selected" : "";
        return `<option value="${o.id}"${selected}>${label}</option>`;
      })
      .join("");
  }

  function renderTable(tbody, emptyEl, items) {
    const api = MAT();
    if (!api || !tbody) return;
    const list = Array.isArray(items) ? items : [];
    tbody.innerHTML = "";

    if (!list.length) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    list.forEach((item) => {
      const tr = document.createElement("tr");
      const fileCell = item.fileUrl
        ? `<a href="${api.escapeHtml(api.resolveFileUrl(item.fileUrl))}" target="_blank" rel="noopener">${api.escapeHtml(item.fileName || "—")}</a>`
        : item.url
          ? `<a href="${api.escapeHtml(item.url)}" target="_blank" rel="noopener">${api.escapeHtml(item.url)}</a>`
          : api.escapeHtml(item.fileName || item.url || "—");
      tr.innerHTML = `
        <td>${api.escapeHtml(api.displayTitle(item))}</td>
        <td>${api.escapeHtml(api.moduleLabel(item.module))}</td>
        <td>${api.escapeHtml(api.levelLabel(item.level))}</td>
        <td>${api.escapeHtml(api.formatLabel(item.format))}</td>
        <td>${fileCell}</td>
        <td><button type="button" class="btn-secondary admin-mat-delete" data-id="${api.escapeHtml(item.id)}">${t("admin_mat_delete")}</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".admin-mat-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (!id || !window.confirm(t("admin_mat_delete_confirm"))) return;
        setStatus(document.getElementById("admin-mat-status"), "", false);
        try {
          const remote = API();
          if (remote && typeof remote.deleteAdminMaterial === "function") {
            await remote.deleteAdminMaterial(id);
          } else if (MAT()) {
            MAT().removeMaterial(id);
          }
          await reloadTable(tbody, emptyEl);
          setStatus(document.getElementById("admin-mat-status"), t("admin_mat_deleted"), false);
        } catch (_) {
          setStatus(document.getElementById("admin-mat-status"), t("admin_mat_save_failed"), true);
        }
      });
    });
  }

  async function loadMaterials() {
    const remote = API();
    if (remote && typeof remote.listAdminMaterials === "function") {
      return remote.listAdminMaterials();
    }
    const api = MAT();
    return api ? api.readAll() : [];
  }

  async function reloadTable(tbody, emptyEl) {
    const items = await loadMaterials();
    renderTable(tbody, emptyEl, items);
  }

  function applySuggestion(api, suggestion) {
    const modSel = document.getElementById("admin-mat-module");
    const levelSel = document.getElementById("admin-mat-level");
    const formatSel = document.getElementById("admin-mat-format");
    if (modSel) modSel.value = suggestion.module;
    if (levelSel) levelSel.value = suggestion.level;
    if (formatSel) formatSel.value = suggestion.format;
    const hint = document.getElementById("admin-mat-suggest-hint");
    if (hint) {
      hint.textContent = t("admin_mat_suggest_applied", {
        module: api.moduleLabel(suggestion.module),
        level: api.levelLabel(suggestion.level),
        format: api.formatLabel(suggestion.format),
      });
      hint.classList.remove("hidden");
    }
  }

  function initAdminSelfStudyMaterials() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    const api = MAT();
    if (!api) return;

    const form = document.getElementById("admin-mat-form");
    const tbody = document.getElementById("admin-mat-tbody");
    const emptyEl = document.getElementById("admin-mat-empty");
    const statusEl = document.getElementById("admin-mat-status");
    const fileInput = document.getElementById("admin-mat-file");
    const suggestBtn = document.getElementById("admin-mat-suggest-btn");
    const titleInput = document.getElementById("admin-mat-title");
    const titleZhInput = document.getElementById("admin-mat-title-zh");
    const notesInput = document.getElementById("admin-mat-notes");
    const urlInput = document.getElementById("admin-mat-url");
    const unitInput = document.getElementById("admin-mat-unit");

    populateSelect(document.getElementById("admin-mat-module"), api.MODULES, "vocabulary");
    populateSelect(document.getElementById("admin-mat-level"), api.LEVELS, "all");
    populateSelect(document.getElementById("admin-mat-format"), api.FORMATS, "pdf");

    void reloadTable(tbody, emptyEl);

    suggestBtn?.addEventListener("click", () => {
      const file = fileInput?.files?.[0];
      const suggestion = api.suggestTags(file?.name || "", `${notesInput?.value || ""} ${titleInput?.value || ""}`);
      applySuggestion(api, suggestion);
    });

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!titleInput?.value.trim()) titleInput.value = file.name.replace(/\.[^.]+$/, "");
      const suggestion = api.suggestTags(file.name, notesInput?.value || "");
      applySuggestion(api, suggestion);
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      setStatus(statusEl, "", false);

      const file = fileInput?.files?.[0];
      const format = document.getElementById("admin-mat-format")?.value || "pdf";
      const url = (urlInput?.value || "").trim();

      if (format === "url" && !url) {
        setStatus(statusEl, t("admin_mat_url_required"), true);
        return;
      }
      if (!file && format !== "url") {
        setStatus(statusEl, t("admin_mat_file_required"), true);
        return;
      }
      if (!titleInput?.value.trim()) {
        setStatus(statusEl, t("admin_mat_title_required"), true);
        return;
      }

      const remote = API();
      if (remote && typeof remote.uploadAdminMaterial === "function") {
        const fd = new FormData();
        fd.append("title", titleInput.value.trim());
        fd.append("title_zh", titleZhInput?.value || "");
        fd.append("module", document.getElementById("admin-mat-module")?.value || "vocabulary");
        fd.append("level", document.getElementById("admin-mat-level")?.value || "all");
        fd.append("format", format);
        fd.append("unit_label", unitInput?.value || "");
        fd.append("notes", notesInput?.value || "");
        if (format === "url") fd.append("url", url);
        if (file) fd.append("file", file);

        void (async () => {
          try {
            await remote.uploadAdminMaterial(fd);
            form.reset();
            populateSelect(document.getElementById("admin-mat-module"), api.MODULES, "vocabulary");
            populateSelect(document.getElementById("admin-mat-level"), api.LEVELS, "all");
            populateSelect(document.getElementById("admin-mat-format"), api.FORMATS, "pdf");
            document.getElementById("admin-mat-suggest-hint")?.classList.add("hidden");
            await reloadTable(tbody, emptyEl);
            setStatus(statusEl, t("admin_mat_saved"), false);
          } catch (err) {
            setStatus(statusEl, (err && err.message) || t("admin_mat_save_failed"), true);
          }
        })();
        return;
      }

      const payload = {
        title: titleInput?.value || "",
        titleZh: titleZhInput?.value || "",
        module: document.getElementById("admin-mat-module")?.value,
        level: document.getElementById("admin-mat-level")?.value,
        format,
        fileName: file ? file.name : "",
        notes: notesInput?.value || "",
        url: format === "url" ? url : "",
        textSnippet: "",
      };

      const finish = () => {
        try {
          api.addMaterial(payload);
          form.reset();
          populateSelect(document.getElementById("admin-mat-module"), api.MODULES, "vocabulary");
          populateSelect(document.getElementById("admin-mat-level"), api.LEVELS, "all");
          populateSelect(document.getElementById("admin-mat-format"), api.FORMATS, "pdf");
          document.getElementById("admin-mat-suggest-hint")?.classList.add("hidden");
          void reloadTable(tbody, emptyEl);
          setStatus(statusEl, t("admin_mat_saved"), false);
        } catch (err) {
          if (err && err.message === "title_required") {
            setStatus(statusEl, t("admin_mat_title_required"), true);
          } else {
            setStatus(statusEl, t("admin_mat_save_failed"), true);
          }
        }
      };

      if (file && (file.type === "text/plain" || /\.txt$/i.test(file.name))) {
        const reader = new FileReader();
        reader.onload = () => {
          payload.textSnippet = String(reader.result || "");
          finish();
        };
        reader.onerror = () => finish();
        reader.readAsText(file);
        return;
      }

      finish();
    });

    window.addEventListener("eap:langchange", () => {
      const modSel = document.getElementById("admin-mat-module");
      const levelSel = document.getElementById("admin-mat-level");
      const formatSel = document.getElementById("admin-mat-format");
      const mod = modSel?.value;
      const level = levelSel?.value;
      const format = formatSel?.value;
      populateSelect(modSel, api.MODULES, mod);
      populateSelect(levelSel, api.LEVELS, level);
      populateSelect(formatSel, api.FORMATS, format);
      void reloadTable(tbody, emptyEl);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", initAdminSelfStudyMaterials);
})();
