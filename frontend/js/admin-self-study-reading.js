/**
 * Manager centre — SS-R2 reading Channel A push, upload/OCR, and passage export.
 */
(function () {
  let lastDraftId = null;
  let draftQueue = [];

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
      .replace(/>/g, "&gt;");
  }

  function excerpt(text, max) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max)}…`;
  }

  function renderUploadPreview(preview, drafts, structured) {
    if (!preview) return;
    if (!drafts || !drafts.length) {
      preview.innerHTML = "";
      preview.classList.add("hidden");
      return;
    }
    preview.classList.remove("hidden");
    if (structured) {
      const c = structured;
      const title = c.title || c.titleEn || t("admin_reading_preview_untitled");
      const paras = c.paragraphsEn || (c.passageEn ? [c.passageEn] : []);
      const questions = c.questions || [];
      const wordCount = (paras.join(" ") || c.passageEn || "").trim().split(/\s+/).filter(Boolean).length;
      preview.innerHTML = `
        <article class="admin-reading-preview__passage">
          <p class="admin-reading-preview__label">${escapeHtml(t("admin_reading_preview_structured"))}</p>
          <h4 class="admin-reading-preview__title">${escapeHtml(title)}</h4>
          <p class="admin-reading-preview__meta">${escapeHtml(
            t("admin_reading_preview_meta", {
              words: String(wordCount),
              questions: String(questions.length),
            }),
          )}</p>
          ${paras
            .slice(0, 2)
            .map((p) => `<p class="admin-reading-preview__para">${escapeHtml(p)}</p>`)
            .join("")}
          ${paras.length > 2 ? `<p class="admin-reading-preview__more">…</p>` : ""}
        </article>
      `;
      return;
    }
    preview.innerHTML = drafts
      .map(
        (d, i) => `
        <article class="admin-reading-preview__card${i === 0 ? " admin-reading-preview__card--active" : ""}">
          <h4 class="admin-reading-preview__title">${escapeHtml(d.originalName)}</h4>
          <p class="admin-reading-preview__meta">${escapeHtml(
            t("admin_reading_preview_chars", { n: String(d.charCount || 0) }),
          )}</p>
          <p class="admin-reading-preview__para">${escapeHtml(excerpt(d.preview, 320))}</p>
        </article>
      `,
      )
      .join("");
  }

  function advanceDraftQueue(preview, structureBtn, publishBtn) {
    draftQueue = draftQueue.filter((d) => d.draftId !== lastDraftId);
    lastDraftId = draftQueue.length ? draftQueue[0].draftId : null;
    if (structureBtn) structureBtn.disabled = !lastDraftId;
    if (publishBtn) publishBtn.disabled = true;
    renderUploadPreview(preview, draftQueue, null);
  }

  async function loadPassages(tbody, emptyEl) {
    if (!tbody) return;
    try {
      const data = await apiFetch("/api/admin/self-study/reading/passages");
      const list = data.passages || [];
      tbody.innerHTML = "";
      if (!list.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      list.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(p.title)}</td>
          <td>${escapeHtml(p.sourceChannel)}</td>
          <td>${escapeHtml(p.className || "—")}</td>
          <td>${p.sortOrder}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
    }
  }

  function bindPush(statusEl) {
    const onBtn = document.getElementById("admin-reading-push-on");
    const offBtn = document.getElementById("admin-reading-push-off");
    const clsInput = document.getElementById("admin-reading-push-class");
    async function push(isActive) {
      const className = clsInput?.value?.trim() || "EAP047";
      setStatus(statusEl, "", false);
      try {
        const data = await apiFetch("/api/admin/self-study/reading/push-channel-a", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ className, isActive }),
        });
        let msg = data.warning ? `${t("admin_reading_saved")} — ${data.warning}` : t("admin_reading_saved");
        if (isActive && data.scheduleDaysSynced > 0) {
          msg = `${msg} ${t("admin_reading_schedule_synced", { n: String(data.scheduleDaysSynced) })}`;
        }
        setStatus(statusEl, msg, false);
      } catch (_) {
        setStatus(statusEl, t("admin_reading_failed"), true);
      }
    }
    onBtn?.addEventListener("click", () => void push(true));
    offBtn?.addEventListener("click", () => void push(false));
  }

  function bindExport() {
    document.getElementById("admin-reading-export")?.addEventListener("click", () => {
      window.open(`${apiBase()}/api/admin/self-study/reading/passages/export.csv`, "_blank");
    });
  }

  function bindUpload(statusEl, tbody, emptyEl) {
    const uploadBtn = document.getElementById("admin-reading-upload-btn");
    const structureBtn = document.getElementById("admin-reading-structure-btn");
    const publishBtn = document.getElementById("admin-reading-publish-btn");
    const preview = document.getElementById("admin-reading-upload-preview");
    const fileInput = document.getElementById("admin-reading-upload-file");
    const classInput = document.getElementById("admin-reading-upload-class");

    uploadBtn?.addEventListener("click", async () => {
      const files = fileInput?.files ? Array.from(fileInput.files) : [];
      if (!files.length) {
        setStatus(statusEl, t("admin_reading_upload_no_file"), true);
        return;
      }
      const className = classInput?.value?.trim() || "EAP047";
      const fd = new FormData();
      files.forEach((file) => fd.append("files", file));
      fd.append("className", className);
      setStatus(statusEl, t("admin_reading_uploading"), false);
      try {
        const fn = typeof window.EAP_fetch === "function" ? window.EAP_fetch : fetch;
        const response = await fn(`${apiBase()}/api/admin/self-study/reading/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Upload failed");
        draftQueue = data.drafts || [
          {
            draftId: data.draftId,
            originalName: data.originalName,
            charCount: data.charCount,
            preview: data.preview,
          },
        ];
        lastDraftId = draftQueue[0]?.draftId || data.draftId;
        if (structureBtn) structureBtn.disabled = !lastDraftId;
        if (publishBtn) publishBtn.disabled = true;
        renderUploadPreview(preview, draftQueue, null);
        const fileCount = data.fileCount || draftQueue.length;
        let msg = t("admin_reading_upload_ok_multi", {
          files: String(fileCount),
          n: String(data.charCount || 0),
        });
        if (data.errors && data.errors.length) {
          msg = `${msg} ${t("admin_reading_upload_partial", { n: String(data.errors.length) })}`;
        }
        setStatus(statusEl, msg, false);
      } catch (e) {
        setStatus(statusEl, e.message, true);
      }
    });

    structureBtn?.addEventListener("click", async () => {
      if (!lastDraftId) return;
      setStatus(statusEl, t("admin_reading_structuring"), false);
      if (structureBtn) structureBtn.disabled = true;
      try {
        const data = await apiFetch(`/api/admin/self-study/reading/drafts/${lastDraftId}/structure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passageLevel: "P2" }),
        });
        if (publishBtn) publishBtn.disabled = false;
        renderUploadPreview(preview, draftQueue, data.content || null);
        setStatus(statusEl, t("admin_reading_structure_ok"), false);
      } catch (e) {
        setStatus(statusEl, e.message, true);
      } finally {
        if (structureBtn) structureBtn.disabled = !lastDraftId;
      }
    });

    publishBtn?.addEventListener("click", async () => {
      if (!lastDraftId) return;
      setStatus(statusEl, t("admin_reading_publishing"), false);
      if (publishBtn) publishBtn.disabled = true;
      try {
        const data = await apiFetch(`/api/admin/self-study/reading/drafts/${lastDraftId}/publish`, {
          method: "POST",
        });
        const pubMsg = t("admin_reading_publish_ok", { day: String(data.scheduleDay || "") });
        let msg = data.channelAEnabled ? `${pubMsg} ${t("admin_reading_push_auto")}` : pubMsg;
        if (data.scheduleDaysSynced > 0) {
          msg = `${msg} ${t("admin_reading_schedule_synced", { n: String(data.scheduleDaysSynced) })}`;
        }
        setStatus(statusEl, msg, false);
        advanceDraftQueue(preview, structureBtn, publishBtn);
        void loadPassages(tbody, emptyEl);
      } catch (e) {
        setStatus(statusEl, e.message, true);
        if (publishBtn) publishBtn.disabled = false;
      }
    });
  }

  function init() {
    const section = document.getElementById("admin-reading-section");
    if (!section) return;
    const statusEl = document.getElementById("admin-reading-status");
    const tbody = document.getElementById("admin-reading-tbody");
    const emptyEl = document.getElementById("admin-reading-empty");
    bindPush(statusEl);
    bindExport();
    bindUpload(statusEl, tbody, emptyEl);
    void loadPassages(tbody, emptyEl);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
