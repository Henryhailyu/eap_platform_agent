/**
 * Phase N2 — Teacher recorded lessons (local upload).
 */
(function (global) {
  const PAGE = "teacher-recorded";
  const api = () => global.EAP_RECORDED_LESSONS;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readPageContext() {
    const p = new URLSearchParams(global.location.search);
    return { className: (p.get("class_name") || p.get("class") || "").trim() };
  }

  function formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setUploadStatus(msg, isError) {
    const el = document.getElementById("trec-upload-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("trec-status--error", !!isError);
  }

  async function loadTeacherClasses(selectEl, preferred) {
    if (!selectEl) return;
    if (typeof global.loadTeacherAssignedClasses === "function") {
      await global.loadTeacherAssignedClasses();
    }
    const selected =
      preferred ||
      (typeof global.defaultTeacherClassFromUser === "function"
        ? global.defaultTeacherClassFromUser()
        : "EAP047");
    if (typeof global.populateTeacherClassSelect === "function") {
      global.populateTeacherClassSelect(selectEl, selected);
      return;
    }
    const code = selected || "EAP047";
    selectEl.innerHTML = `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`;
    selectEl.value = code;
  }

  function renderList(lessons) {
    const list = document.getElementById("trec-list");
    const empty = document.getElementById("trec-list-empty");
    if (!list) return;
    list.innerHTML = "";
    const items = lessons || [];
    if (empty) empty.classList.toggle("hidden", items.length > 0);
    items.forEach((lesson) => {
      const li = document.createElement("li");
      li.className = "trec-item";
      li.setAttribute("role", "listitem");
      const published = lesson.visibility === "published";
      const badgeClass = published ? "trec-badge trec-badge--published" : "trec-badge";
      const badgeText = published ? t("trec_status_published") : t("trec_status_draft");
      li.innerHTML = `
        <div class="trec-item__head">
          <h3 class="trec-item__title">${escapeHtml(lesson.title)}</h3>
          <span class="${badgeClass}">${escapeHtml(badgeText)}</span>
        </div>
        <p class="trec-item__meta">${escapeHtml(lesson.file_name || "")} · ${escapeHtml(formatBytes(lesson.file_size_bytes))} · ${escapeHtml(lesson.created_at || "")}</p>
        <div class="trec-item__actions">
          <button type="button" class="btn-secondary" data-action="preview" data-id="${lesson.id}">${escapeHtml(t("trec_preview_btn"))}</button>
          <button type="button" class="btn-secondary" data-action="toggle" data-id="${lesson.id}" data-published="${published ? "1" : "0"}">${escapeHtml(published ? t("trec_unpublish_btn") : t("trec_publish_btn"))}</button>
          <button type="button" class="btn-secondary" data-action="delete" data-id="${lesson.id}">${escapeHtml(t("trec_delete_btn"))}</button>
        </div>
      `;
      list.appendChild(li);
    });
  }

  async function refreshList() {
    const classEl = document.getElementById("trec-class");
    const className = (classEl && classEl.value) || "EAP047";
    const data = await api().list(className);
    renderList(data.lessons || []);
  }

  function showPreview(lessonId) {
    const section = document.getElementById("trec-preview-section");
    const video = document.getElementById("trec-preview-video");
    if (!section || !video || !api()) return;
    video.src = api().teacherStreamUrl(lessonId);
    section.classList.remove("hidden");
    video.load();
  }

  async function handleListClick(ev) {
    const btn = ev.target.closest("button[data-action]");
    if (!btn || !api()) return;
    const id = Number(btn.getAttribute("data-id"));
    if (!id) return;
    const action = btn.getAttribute("data-action");
    if (action === "preview") {
      showPreview(id);
      return;
    }
    if (action === "toggle") {
      const published = btn.getAttribute("data-published") === "1";
      try {
        await api().update(id, {
          visibility: published ? "draft" : "published",
        });
        await refreshList();
      } catch (err) {
        setUploadStatus((err && err.message) || t("trec_error_generic"), true);
      }
      return;
    }
    if (action === "delete") {
      if (!global.confirm(t("trec_delete_confirm"))) return;
      try {
        await api().remove(id);
        await refreshList();
      } catch (err) {
        setUploadStatus((err && err.message) || t("trec_error_generic"), true);
      }
    }
  }

  function bindUploadForm() {
    const form = document.getElementById("trec-upload-form");
    if (!form || form.dataset.eapBound === "1") return;
    form.dataset.eapBound = "1";
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const classEl = document.getElementById("trec-class");
      const titleEl = document.getElementById("trec-title");
      const fileEl = document.getElementById("trec-file");
      const submitBtn = document.getElementById("trec-upload-btn");
      if (!fileEl || !fileEl.files || !fileEl.files[0]) {
        setUploadStatus(t("trec_error_no_file"), true);
        return;
      }
      const fd = new FormData();
      fd.append("class_name", (classEl && classEl.value) || "EAP047");
      fd.append("title", (titleEl && titleEl.value) || fileEl.files[0].name);
      fd.append("file", fileEl.files[0]);
      if (submitBtn) submitBtn.disabled = true;
      setUploadStatus(t("trec_uploading"), false);
      try {
        await api().upload(fd);
        setUploadStatus(t("trec_upload_ok"), false);
        form.reset();
        if (classEl) classEl.value = fd.get("class_name");
        await refreshList();
      } catch (err) {
        setUploadStatus((err && err.message) || t("trec_error_generic"), true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  async function bootPage() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (typeof global.redirectFilePageToHostedUi === "function" && global.redirectFilePageToHostedUi()) {
      return;
    }
    if (typeof global.validateSatelliteSessionOrGate !== "function") return;
    const user = await global.validateSatelliteSessionOrGate("teacher");
    if (!user) return;
    if (typeof global.initAppPageHeader === "function") global.initAppPageHeader();

    const ctx = readPageContext();
    const classSelect = document.getElementById("trec-class");
    const preferred =
      ctx.className || (user.class_name && String(user.class_name)) || "EAP047";
    await loadTeacherClasses(classSelect, preferred);

    bindUploadForm();
    document.getElementById("trec-list")?.addEventListener("click", handleListClick);
    classSelect?.addEventListener("change", () => {
      void refreshList().catch((err) => {
        setUploadStatus((err && err.message) || t("trec_error_generic"), true);
      });
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && logoutBtn.dataset.eapBound !== "1") {
      logoutBtn.dataset.eapBound = "1";
      logoutBtn.addEventListener("click", () => {
        if (typeof global.logoutAndGoHome === "function") global.logoutAndGoHome();
        else global.location.href = "index.html";
      });
    }

    try {
      await refreshList();
    } catch (err) {
      setUploadStatus((err && err.message) || t("trec_error_generic"), true);
    }

    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void bootPage();
    });
  } else {
    void bootPage();
  }
})(typeof window !== "undefined" ? window : globalThis);
