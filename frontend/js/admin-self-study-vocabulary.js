/**
 * Manager centre — SS-V1 vocabulary packs, Channel A push, course export.
 */
(function () {
  function apiBase() {
    if (window.EAP_API_BASE_RESOLVED) {
      return String(window.EAP_API_BASE_RESOLVED).replace(/\/$/, "");
    }
    if (window.EAP_API_BASE != null && String(window.EAP_API_BASE).trim() !== "") {
      return String(window.EAP_API_BASE).trim().replace(/\/$/, "");
    }
    if (window.location && /^https?:$/i.test(window.location.protocol)) {
      return window.location.origin.replace(/\/$/, "");
    }
    return "http://127.0.0.1:5051";
  }

  async function apiFetch(path, options) {
    const fn = typeof window.EAP_fetch === "function" ? window.EAP_fetch : fetch;
    const response = await fn(`${apiBase()}${path}`, {
      credentials: "include",
      ...(options || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText || "Request failed");
    return data;
  }

  async function postMultipart(path, formData) {
    const url = `${apiBase()}${path}`;
    let response;
    if (typeof window.eapPostMultipart === "function") {
      response = await window.eapPostMultipart(url, formData);
    } else {
      response = await fetch(url, { method: "POST", credentials: "include", body: formData });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText || "Request failed");
    return data;
  }

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

  function appendFiles(fd, fileList) {
    const files = fileList ? Array.from(fileList) : [];
    files.forEach((file) => fd.append("files", file));
    return files.length;
  }

  function estimateUploadMinutes(fileCount, totalBytes) {
    if (fileCount > 2 || totalBytes > 2_000_000) return "3–5";
    if (fileCount > 1 || totalBytes > 500_000) return "1–3";
    return "1–2";
  }

  function showUploadOverlay(fileCount, totalBytes) {
    const section = document.getElementById("admin-vocab-section");
    if (!section) return;
    hideUploadOverlay();
    const mins = estimateUploadMinutes(fileCount, totalBytes);
    const overlay = document.createElement("div");
    overlay.id = "admin-vocab-upload-overlay";
    overlay.className = "admin-vocab-upload-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="admin-vocab-upload-overlay__card">
        <div class="admin-vocab-upload-spinner" aria-hidden="true"></div>
        <p class="admin-vocab-upload-overlay__title">${escapeHtml(t("admin_vocab_uploading"))}</p>
        <p class="admin-vocab-upload-overlay__eta">${escapeHtml(t("admin_vocab_upload_eta", { mins }))}</p>
      </div>
    `;
    section.appendChild(overlay);
  }

  function hideUploadOverlay() {
    document.getElementById("admin-vocab-upload-overlay")?.remove();
  }

  function totalFileBytes(fileList) {
    return Array.from(fileList || []).reduce((sum, f) => sum + (f.size || 0), 0);
  }

  function setSubmitBusy(form, busy) {
    const btn = form?.querySelector('button[type="submit"]');
    if (!btn) return;
    if (busy) {
      btn.disabled = true;
      btn.dataset.eapPrevLabel = btn.textContent;
      btn.textContent = t("admin_vocab_uploading");
      btn.classList.add("admin-vocab-btn--busy");
    } else {
      btn.disabled = false;
      btn.classList.remove("admin-vocab-btn--busy");
      if (btn.dataset.eapPrevLabel) {
        btn.textContent = btn.dataset.eapPrevLabel;
        delete btn.dataset.eapPrevLabel;
      }
    }
  }

  function selectedPackIds(tbody) {
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("[data-pack-push]:checked"))
      .map((el) => parseInt(el.getAttribute("data-pack-push"), 10))
      .filter((id) => id > 0);
  }

  async function deletePack(packId, statusEl, tbody, emptyEl) {
    if (!window.confirm(t("admin_vocab_delete_confirm"))) return;
    setStatus(statusEl, "", false);
    try {
      await apiFetch(`/api/admin/self-study/vocabulary/packs/${packId}`, { method: "DELETE" });
      await loadPacks(tbody, emptyEl);
      setStatus(statusEl, t("admin_vocab_deleted"), false);
    } catch (e) {
      setStatus(statusEl, e.message || t("admin_vocab_failed"), true);
    }
  }

  async function modifyPackFiles(packId, fileList, statusEl, tbody, emptyEl) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    if (!window.confirm(t("admin_vocab_modify_confirm"))) return;

    setStatus(statusEl, t("admin_vocab_uploading"), false);
    showUploadOverlay(files.length, totalFileBytes(files));
    const fd = new FormData();
    files.forEach((file) => fd.append("files", file));
    fd.append("replace", "true");
    try {
      const result = await postMultipart(`/api/admin/self-study/vocabulary/packs/${packId}/upload`, fd);
      await loadPacks(tbody, emptyEl);
      setStatus(
        statusEl,
        t("admin_vocab_upload_done", { n: String(result.unitCount || result.wordCount || 0) }),
        false,
      );
    } catch (e) {
      setStatus(statusEl, e.message || t("admin_vocab_failed"), true);
    } finally {
      hideUploadOverlay();
    }
  }

  async function loadPacks(tbody, emptyEl) {
    if (!tbody) return;
    try {
      const data = await apiFetch("/api/admin/self-study/vocabulary/packs");
      const packs = data.packs || [];
      tbody.innerHTML = "";
      if (!packs.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      packs.forEach((p) => {
        const tr = document.createElement("tr");
        const fileHint = p.sourceFilename
          ? `<span class="admin-vocab-file-tag">${escapeHtml(p.sourceFilename)}</span>`
          : "";
        tr.innerHTML = `
          <td class="admin-vocab-pack-name">
            <label class="admin-vocab-push-check" title="${escapeHtml(t("admin_vocab_push_select_hint"))}">
              <input type="checkbox" data-pack-push="${p.id}" ${p.pushSelected ? "checked" : ""} aria-label="${escapeHtml(t("admin_vocab_push_select_pack", { name: p.displayName }))}" />
              <span class="admin-vocab-push-check__box" aria-hidden="true"></span>
            </label>
            <span class="admin-vocab-pack-label">${escapeHtml(p.displayName)}${fileHint ? `<br>${fileHint}` : ""}</span>
          </td>
          <td>${escapeHtml(p.className || "—")}</td>
          <td>${escapeHtml(String(p.unitCount || 0))}</td>
          <td class="admin-table__actions">
            <label class="btn-secondary admin-vocab-modify-btn">
              ${escapeHtml(t("admin_vocab_modify"))}
              <input type="file" class="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" data-pack-modify="${p.id}" />
            </label>
            <button type="button" class="btn-secondary admin-vocab-delete-btn" data-pack-delete="${p.id}">${escapeHtml(t("admin_vocab_delete"))}</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll("[data-pack-delete]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = parseInt(btn.getAttribute("data-pack-delete"), 10);
          void deletePack(id, document.getElementById("admin-vocab-status"), tbody, emptyEl);
        });
      });
      tbody.querySelectorAll("[data-pack-modify]").forEach((input) => {
        input.addEventListener("change", () => {
          const id = parseInt(input.getAttribute("data-pack-modify"), 10);
          const files = input.files;
          input.value = "";
          void modifyPackFiles(id, files, document.getElementById("admin-vocab-status"), tbody, emptyEl);
        });
      });
    } catch (e) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      setStatus(document.getElementById("admin-vocab-status"), e.message || t("admin_vocab_failed"), true);
    }
  }

  function bindForm(statusEl, tbody, emptyEl) {
    const form = document.getElementById("admin-vocab-pack-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("admin-vocab-pack-name")?.value?.trim();
      const cls = document.getElementById("admin-vocab-pack-class")?.value?.trim();
      const fileInput = document.getElementById("admin-vocab-pack-file");
      const files = fileInput?.files;
      const fileCount = files ? files.length : 0;

      if (!name) {
        setStatus(statusEl, t("admin_vocab_name_required"), true);
        return;
      }

      setStatus(statusEl, "", false);
      setSubmitBusy(form, true);

      try {
        if (fileCount > 0) {
          setStatus(statusEl, t("admin_vocab_uploading"), false);
          showUploadOverlay(fileCount, totalFileBytes(files));
          const fd = new FormData();
          fd.append("displayName", name);
          if (cls) fd.append("className", cls);
          appendFiles(fd, files);
          const result = await postMultipart("/api/admin/self-study/vocabulary/packs", fd);
          setStatus(
            statusEl,
            t("admin_vocab_upload_done", { n: String(result.wordCount || result.unitCount || 0) }),
            false,
          );
        } else {
          await apiFetch("/api/admin/self-study/vocabulary/packs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName: name, className: cls || null }),
          });
          setStatus(statusEl, t("admin_vocab_saved"), false);
        }
        form.reset();
        await loadPacks(tbody, emptyEl);
      } catch (err) {
        setStatus(statusEl, err.message || t("admin_vocab_failed"), true);
      } finally {
        hideUploadOverlay();
        setSubmitBusy(form, false);
      }
    });
  }

  function bindPush(statusEl) {
    const onBtn = document.getElementById("admin-vocab-push-on");
    const offBtn = document.getElementById("admin-vocab-push-off");
    const clsInput = document.getElementById("admin-vocab-push-class");
    async function push(isActive) {
      const className = clsInput?.value?.trim() || "EAP047";
      const tbody = document.getElementById("admin-vocab-tbody");
      const packIds = selectedPackIds(tbody);
      if (isActive && !packIds.length) {
        setStatus(statusEl, t("admin_vocab_push_select_required"), true);
        return;
      }
      setStatus(statusEl, "", false);
      try {
        await apiFetch("/api/admin/self-study/vocabulary/push-channel-a", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ className, isActive, packIds }),
        });
        setStatus(statusEl, t("admin_vocab_saved"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_vocab_failed"), true);
      }
    }
    onBtn?.addEventListener("click", () => void push(true));
    offBtn?.addEventListener("click", () => void push(false));
  }

  function bindExport() {
    const btn = document.getElementById("admin-vocab-export");
    const courseInput = document.getElementById("admin-vocab-course-id");
    btn?.addEventListener("click", () => {
      const id = parseInt(courseInput?.value || "1", 10);
      if (!id) return;
      window.open(`${apiBase()}/api/admin/self-study/vocabulary/courses/${id}/export.csv`, "_blank");
    });
  }

  function init() {
    const section = document.getElementById("admin-vocab-section");
    if (!section) return;
    const statusEl = document.getElementById("admin-vocab-status");
    const tbody = document.getElementById("admin-vocab-tbody");
    const emptyEl = document.getElementById("admin-vocab-empty");
    bindForm(statusEl, tbody, emptyEl);
    bindPush(statusEl);
    bindExport();
    void loadPacks(tbody, emptyEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
