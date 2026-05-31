/**
 * Phase N4 — Student recorded lesson viewer (session-auth stream, no download UI).
 */
(function (global) {
  const PAGE = "student-recorded";
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

  function resolveClassName() {
    const fromUrl = new URLSearchParams(global.location.search).get("class_name") ||
      new URLSearchParams(global.location.search).get("class") ||
      "";
    if (fromUrl.trim()) return fromUrl.trim();
    if (typeof global.getLoggedInUser === "function") {
      const u = global.getLoggedInUser();
      const c = u?.class_name || u?.className || "";
      if (c) return String(c).trim();
    }
    return "EAP047";
  }

  function formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showError(msg) {
    const el = document.getElementById("srec-error");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function openPlayer(lesson) {
    const section = document.getElementById("srec-player-section");
    const video = document.getElementById("srec-player-video");
    const heading = document.getElementById("srec-player-heading");
    if (!section || !video || !api()) return;

    if (heading) heading.textContent = lesson.title || t("srec_list_title");
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.src = api().studentStreamUrl(lesson.id);
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
    void video.play().catch(() => {
      /* autoplay may be blocked until user interacts */
    });
  }

  function renderList(lessons) {
    const listEl = document.getElementById("srec-list");
    const emptyEl = document.getElementById("srec-empty");
    if (!listEl) return;
    const items = lessons || [];
    if (emptyEl) emptyEl.classList.toggle("hidden", items.length > 0);
    listEl.innerHTML = items
      .map(
        (lesson) => `
      <article class="srec-card" role="listitem">
        <h2 class="srec-card__title">${escapeHtml(lesson.title)}</h2>
        <p class="srec-card__meta">${escapeHtml(lesson.file_name || "")} · ${escapeHtml(formatBytes(lesson.file_size_bytes))}</p>
        <button type="button" class="btn-primary" data-watch-id="${lesson.id}">${escapeHtml(t("srec_watch_btn"))}</button>
      </article>`,
      )
      .join("");
  }

  async function loadList() {
    const className = resolveClassName();
    showError("");
    const data = await api().listPublishedForStudent(className);
    renderList(data.lessons || []);
  }

  function bindList() {
    const listEl = document.getElementById("srec-list");
    if (!listEl || listEl.dataset.eapBound === "1") return;
    listEl.dataset.eapBound = "1";
    listEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-watch-id]");
      if (!btn) return;
      const id = Number(btn.getAttribute("data-watch-id"));
      const card = btn.closest(".srec-card");
      const title = card?.querySelector(".srec-card__title")?.textContent || "";
      openPlayer({ id, title });
    });
  }

  function bindPlayerGuards() {
    const video = document.getElementById("srec-player-video");
    if (!video || video.dataset.eapBound === "1") return;
    video.dataset.eapBound = "1";
    video.addEventListener("contextmenu", (ev) => ev.preventDefault());
  }

  async function bootPage() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (typeof global.redirectFilePageToHostedUi === "function" && global.redirectFilePageToHostedUi()) {
      return;
    }
    if (typeof global.validateSatelliteSessionOrGate !== "function") return;
    const user = await global.validateSatelliteSessionOrGate("student");
    if (!user) return;
    if (typeof global.initAppPageHeader === "function") global.initAppPageHeader();
    if (typeof global.initStudentRecordedNavLink === "function") global.initStudentRecordedNavLink();

    bindList();
    bindPlayerGuards();

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && logoutBtn.dataset.eapBound !== "1") {
      logoutBtn.dataset.eapBound = "1";
      logoutBtn.addEventListener("click", () => {
        if (typeof global.logoutAndGoHome === "function") global.logoutAndGoHome();
        else global.location.href = "index.html";
      });
    }

    const watchId = new URLSearchParams(global.location.search).get("id");
    try {
      await loadList();
      if (watchId && /^\d+$/.test(watchId)) {
        const lessons = (await api().listPublishedForStudent(resolveClassName())).lessons || [];
        const lesson = lessons.find((l) => String(l.id) === watchId);
        if (lesson) openPlayer(lesson);
      }
    } catch (err) {
      showError((err && err.message) || t("srec_load_failed"));
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
