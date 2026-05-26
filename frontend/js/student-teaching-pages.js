/**
 * Phase K5 — student shared teaching page viewer.
 */
(function () {
  const LIST_PAGE = "student-teaching-pages";
  const VIEW_PAGE = "student-teaching-page";
  const API = () => window.EAP_STUDENT_TEACHING_PAGES;

  function t(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getClassFromUrl() {
    return new URLSearchParams(window.location.search).get("class") || "";
  }

  function getPageIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("page") || "";
  }

  async function bootListPage() {
    if (document.body.getAttribute("data-page") !== LIST_PAGE) return;
    if (typeof validateSatelliteSessionOrGate !== "function") return;
    const user = await validateSatelliteSessionOrGate("student");
    if (!user) return;
    if (typeof initAppPageHeader === "function") initAppPageHeader();
    if (typeof initStudentTeachingPagesNavLink === "function") initStudentTeachingPagesNavLink();

    const listEl = document.getElementById("stp-list");
    const emptyEl = document.getElementById("stp-empty");
    const errEl = document.getElementById("stp-error");
    const api = API();
    if (!listEl || !api) return;

    let className = getClassFromUrl();
    if (!className && typeof getLoggedInUser === "function") {
      const u = getLoggedInUser();
      className = u?.class_name || u?.className || "";
    }

    try {
      const pages = await api.listPages(className);
      if (!pages.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      const q = className ? `?class=${encodeURIComponent(className)}` : "";
      listEl.innerHTML = pages
        .map((p) => {
          const href = `student-teaching-page.html?id=${encodeURIComponent(p.id)}${className ? `&class=${encodeURIComponent(className)}` : ""}`;
          return `
        <article class="stp-card">
          <h2 class="stp-card__title">${escapeHtml(p.title)}</h2>
          <p class="stp-card__meta">${escapeHtml(p.topic || "")}</p>
          <a class="btn-primary" href="${href}">${escapeHtml(t("stp_open_page"))}</a>
        </article>`;
        })
        .join("");
    } catch (err) {
      if (errEl) {
        errEl.textContent = (err && err.message) || t("stp_load_failed");
        errEl.classList.remove("hidden");
      }
    }
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  async function bootViewPage() {
    if (document.body.getAttribute("data-page") !== VIEW_PAGE) return;
    if (typeof validateSatelliteSessionOrGate !== "function") return;
    const user = await validateSatelliteSessionOrGate("student");
    if (!user) return;
    if (typeof initAppPageHeader === "function") initAppPageHeader();
    if (typeof initStudentTeachingPagesNavLink === "function") initStudentTeachingPagesNavLink();

    const api = API();
    const id = getPageIdFromUrl();
    const className = getClassFromUrl();
    const backEl = document.querySelector(".stp-view .stp-back");
    if (backEl && className) {
      backEl.href = `student-teaching-pages.html?class=${encodeURIComponent(className)}`;
    }
    const titleEl = document.getElementById("stp-view-title");
    const frame = document.getElementById("stp-view-frame");
    const errEl = document.getElementById("stp-view-error");
    if (!api || !id || !frame) return;

    try {
      const page = await api.getPageMeta(id, className);
      if (titleEl) titleEl.textContent = page.title || t("stp_view_title");
      frame.src = api.viewUrl(id, className);
    } catch (err) {
      if (errEl) {
        errEl.textContent = (err && err.message) || t("stp_load_failed");
        errEl.classList.remove("hidden");
      }
    }
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void bootListPage();
    void bootViewPage();
  });
})();
