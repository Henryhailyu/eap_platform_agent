/**
 * Manager centre — SS-R2 reading Channel A push, upload/OCR, and passage export.
 */
(function () {
  let draftQueue = [];
  let selectedDraftId = null;
  let structuredContent = null;

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

  function isZh() {
    return !!(window.EAP_I18N && window.EAP_I18N.getLang() === "zh");
  }

  function pickLang(obj, enKey, zhKey) {
    if (!obj) return "";
    return isZh() ? obj[zhKey] || obj[enKey] || "" : obj[enKey] || obj[zhKey] || "";
  }

  function updateActionButtons(structureBtn, regenerateBtn, publishBtn) {
    const hasSelection = !!selectedDraftId;
    const hasStructured = !!structuredContent;
    if (structureBtn) structureBtn.disabled = !hasSelection;
    if (regenerateBtn) regenerateBtn.disabled = !hasSelection || !hasStructured;
    if (publishBtn) publishBtn.disabled = !hasSelection || !hasStructured;
  }

  function renderDraftList(listEl, structureBtn, regenerateBtn, publishBtn) {
    if (!listEl) return;
    if (!draftQueue.length) {
      listEl.innerHTML = "";
      listEl.classList.add("hidden");
      return;
    }
    listEl.classList.remove("hidden");
    listEl.innerHTML = `
      <p class="admin-reading-draft-list__hint">${escapeHtml(t("admin_reading_select_hint"))}</p>
      <ul class="admin-reading-draft-list__items">
        ${draftQueue
          .map(
            (d) => `
          <li class="admin-reading-draft-row${d.draftId === selectedDraftId ? " admin-reading-draft-row--selected" : ""}">
            <label class="admin-reading-draft-row__pick">
              <input type="checkbox" class="admin-reading-draft-check" data-draft-id="${d.draftId}"${
                d.draftId === selectedDraftId ? " checked" : ""
              } />
              <span class="admin-reading-draft-row__name">${escapeHtml(d.originalName)}</span>
            </label>
            <span class="admin-reading-draft-row__meta">${escapeHtml(
              t("admin_reading_preview_chars", { n: String(d.charCount || 0) }),
            )}</span>
            <button type="button" class="btn-secondary admin-reading-draft-delete" data-draft-id="${d.draftId}" data-i18n="admin_reading_delete_btn">${escapeHtml(
              t("admin_reading_delete_btn"),
            )}</button>
          </li>
        `,
          )
          .join("")}
      </ul>
    `;

    listEl.querySelectorAll(".admin-reading-draft-check").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) {
          selectedDraftId = parseInt(cb.getAttribute("data-draft-id") || "", 10) || null;
          structuredContent = null;
          listEl.querySelectorAll(".admin-reading-draft-check").forEach((other) => {
            if (other !== cb) other.checked = false;
          });
        } else if (selectedDraftId === parseInt(cb.getAttribute("data-draft-id") || "", 10)) {
          selectedDraftId = null;
          structuredContent = null;
        }
        listEl.querySelectorAll(".admin-reading-draft-row").forEach((row) => {
          row.classList.toggle(
            "admin-reading-draft-row--selected",
            parseInt(row.querySelector(".admin-reading-draft-check")?.getAttribute("data-draft-id") || "", 10) ===
              selectedDraftId,
          );
        });
        updateActionButtons(structureBtn, regenerateBtn, publishBtn);
        const preview = document.getElementById("admin-reading-upload-preview");
        if (preview) {
          preview.innerHTML = "";
          preview.classList.add("hidden");
        }
      });
    });

    listEl.querySelectorAll(".admin-reading-draft-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-draft-id") || "", 10);
        void deleteDraft(id, listEl, structureBtn, regenerateBtn, publishBtn);
      });
    });
  }

  async function deleteDraft(draftId, listEl, structureBtn, regenerateBtn, publishBtn) {
    try {
      await apiFetch(`/api/admin/self-study/reading/drafts/${draftId}`, { method: "DELETE" });
      draftQueue = draftQueue.filter((d) => d.draftId !== draftId);
      if (selectedDraftId === draftId) {
        selectedDraftId = null;
        structuredContent = null;
      }
      const preview = document.getElementById("admin-reading-upload-preview");
      if (preview) {
        preview.innerHTML = "";
        preview.classList.add("hidden");
      }
      renderDraftList(listEl, structureBtn, regenerateBtn, publishBtn);
      updateActionButtons(structureBtn, regenerateBtn, publishBtn);
    } catch (e) {
      alert(e.message);
    }
  }

  function renderGenerating(preview) {
    if (!preview) return;
    preview.classList.remove("hidden");
    preview.innerHTML = `
      <div class="ssc-generating-card admin-reading-generating" role="status" aria-live="polite">
        <div class="ssc-generating-card__spinner" aria-hidden="true"></div>
        <p class="ssc-generating-card__title">${escapeHtml(t("admin_reading_ai_generating"))}</p>
        <p class="ssc-generating-card__hint">${escapeHtml(t("admin_reading_ai_generating_hint"))}</p>
      </div>
    `;
  }

  function renderStructuredPreview(preview, content) {
    if (!preview || !content) return;
    const title = content.title || content.titleEn || t("admin_reading_preview_untitled");
    const paras = content.paragraphsEn || (content.passageEn ? [content.passageEn] : []);
    const questions = content.questions || [];
    const wordCount = (paras.join(" ") || content.passageEn || "").trim().split(/\s+/).filter(Boolean).length;
    const lesson = pickLang(content, "lessonEn", "lessonZh");

    preview.classList.remove("hidden");
    preview.innerHTML = `
      <article class="admin-reading-preview__full">
        <header class="admin-reading-preview__head">
          <p class="admin-reading-preview__label">${escapeHtml(t("admin_reading_preview_structured"))}</p>
          <h4 class="admin-reading-preview__title">${escapeHtml(title)}</h4>
          <p class="admin-reading-preview__meta">${escapeHtml(
            t("admin_reading_preview_meta", {
              words: String(wordCount),
              questions: String(questions.length),
            }),
          )}</p>
          ${lesson ? `<p class="admin-reading-preview__lesson">${escapeHtml(lesson)}</p>` : ""}
        </header>
        <section class="admin-reading-preview__scroll" tabindex="0" aria-label="${escapeHtml(t("admin_reading_preview_scroll_label"))}">
          <div class="admin-reading-preview__section">
            <h5>${escapeHtml(t("admin_reading_preview_passage_heading"))}</h5>
            ${paras.map((p) => `<p class="admin-reading-preview__para">${escapeHtml(p)}</p>`).join("")}
          </div>
          <div class="admin-reading-preview__section">
            <h5>${escapeHtml(t("admin_reading_preview_questions_heading", { n: String(questions.length) }))}</h5>
            ${questions
              .map((q, idx) => {
                const typeId = (q.typeId || "MC").toUpperCase();
                const instruction = pickLang(q, "instructionEn", "instructionZh");
                const prompt = pickLang(q, "promptEn", "promptZh");
                const opts = isZh() ? q.optionsZh || q.optionsEn : q.optionsEn || q.optionsZh;
                const optionsHtml =
                  typeId === "GAP"
                    ? `<p class="admin-reading-preview__gap">${escapeHtml(t("admin_reading_preview_gap"))}</p>`
                    : `<ol class="admin-reading-preview__options">
                        ${(opts || [])
                          .map((opt) => `<li>${escapeHtml(opt)}</li>`)
                          .join("")}
                      </ol>`;
                return `
                  <div class="admin-reading-preview__question">
                    <p class="admin-reading-preview__qnum">${idx + 1}. ${escapeHtml(typeId)}</p>
                    ${instruction ? `<p class="admin-reading-preview__instr">${escapeHtml(instruction)}</p>` : ""}
                    <p class="admin-reading-preview__prompt">${escapeHtml(prompt)}</p>
                    ${optionsHtml}
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>
      </article>
    `;
  }

  async function runStructure(statusEl, preview, structureBtn, regenerateBtn, publishBtn, isRegenerate) {
    if (!selectedDraftId) return;
    setStatus(statusEl, isRegenerate ? t("admin_reading_regenerating") : t("admin_reading_structuring"), false);
    if (structureBtn) structureBtn.disabled = true;
    if (regenerateBtn) regenerateBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;
    renderGenerating(preview);
    try {
      const data = await apiFetch(`/api/admin/self-study/reading/drafts/${selectedDraftId}/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passageLevel: "P2" }),
      });
      structuredContent = data.content || null;
      renderStructuredPreview(preview, structuredContent);
      setStatus(statusEl, t("admin_reading_structure_ok"), false);
    } catch (e) {
      if (preview) {
        preview.innerHTML = "";
        preview.classList.add("hidden");
      }
      setStatus(statusEl, e.message, true);
    } finally {
      updateActionButtons(structureBtn, regenerateBtn, publishBtn);
    }
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
    const regenerateBtn = document.getElementById("admin-reading-regenerate-btn");
    const publishBtn = document.getElementById("admin-reading-publish-btn");
    const preview = document.getElementById("admin-reading-upload-preview");
    const draftList = document.getElementById("admin-reading-draft-list");
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
        const newDrafts = data.drafts || [
          {
            draftId: data.draftId,
            originalName: data.originalName,
            charCount: data.charCount,
            preview: data.preview,
          },
        ];
        const existingIds = new Set(draftQueue.map((d) => d.draftId));
        newDrafts.forEach((d) => {
          if (!existingIds.has(d.draftId)) draftQueue.push(d);
        });
        if (!selectedDraftId && draftQueue.length) {
          selectedDraftId = draftQueue[0].draftId;
        }
        structuredContent = null;
        if (preview) {
          preview.innerHTML = "";
          preview.classList.add("hidden");
        }
        renderDraftList(draftList, structureBtn, regenerateBtn, publishBtn);
        updateActionButtons(structureBtn, regenerateBtn, publishBtn);
        const fileCount = data.fileCount || newDrafts.length;
        let msg = t("admin_reading_upload_ok_multi", {
          files: String(fileCount),
          n: String(data.charCount || 0),
        });
        if (data.errors && data.errors.length) {
          msg = `${msg} ${t("admin_reading_upload_partial", { n: String(data.errors.length) })}`;
        }
        setStatus(statusEl, msg, false);
        if (fileInput) fileInput.value = "";
      } catch (e) {
        setStatus(statusEl, e.message, true);
      }
    });

    structureBtn?.addEventListener("click", () => {
      void runStructure(statusEl, preview, structureBtn, regenerateBtn, publishBtn, false);
    });

    regenerateBtn?.addEventListener("click", () => {
      void runStructure(statusEl, preview, structureBtn, regenerateBtn, publishBtn, true);
    });

    publishBtn?.addEventListener("click", async () => {
      if (!selectedDraftId || !structuredContent) return;
      setStatus(statusEl, t("admin_reading_publishing"), false);
      if (publishBtn) publishBtn.disabled = true;
      try {
        const data = await apiFetch(`/api/admin/self-study/reading/drafts/${selectedDraftId}/publish`, {
          method: "POST",
        });
        const pubMsg = t("admin_reading_publish_ok", { day: String(data.scheduleDay || "") });
        let msg = data.channelAEnabled ? `${pubMsg} ${t("admin_reading_push_auto")}` : pubMsg;
        if (data.scheduleDaysSynced > 0) {
          msg = `${msg} ${t("admin_reading_schedule_synced", { n: String(data.scheduleDaysSynced) })}`;
        }
        setStatus(statusEl, msg, false);
        draftQueue = draftQueue.filter((d) => d.draftId !== selectedDraftId);
        selectedDraftId = draftQueue.length ? draftQueue[0].draftId : null;
        structuredContent = null;
        if (preview) {
          preview.innerHTML = "";
          preview.classList.add("hidden");
        }
        renderDraftList(draftList, structureBtn, regenerateBtn, publishBtn);
        updateActionButtons(structureBtn, regenerateBtn, publishBtn);
        void loadPassages(tbody, emptyEl);
      } catch (e) {
        setStatus(statusEl, e.message, true);
        updateActionButtons(structureBtn, regenerateBtn, publishBtn);
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
