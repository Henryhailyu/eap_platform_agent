/**
 * Shared loading / AI-generating UI for AI Self-Study Centre (hub + Channel B modules).
 */
(function (global) {
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

  function renderGeneratingCard(root, titleKey, hintKey) {
    if (!root) return;
    const title = t(titleKey || "self_study_ai_generating");
    const hint = hintKey ? t(hintKey) : "";
    root.innerHTML = `
      <div class="ssc-generating-card" role="status" aria-live="polite" aria-busy="true">
        <div class="ssc-generating-card__spinner" aria-hidden="true"></div>
        <p class="ssc-generating-card__title">${escapeHtml(title)}</p>
        ${hint ? `<p class="ssc-generating-card__hint">${escapeHtml(hint)}</p>` : ""}
      </div>
    `;
  }

  function renderHubCalendarLoading(root) {
    if (!root) return;
    root.innerHTML = `
      <div class="ssc-hub-loading" role="status" aria-live="polite" aria-busy="true">
        <div class="ssc-generating-card__spinner ssc-hub-loading__spinner" aria-hidden="true"></div>
        <p class="ssc-hub-loading__title">${escapeHtml(t("self_study_hub_loading"))}</p>
        <p class="ssc-hub-loading__hint">${escapeHtml(t("self_study_hub_loading_hint"))}</p>
        <div class="ssc-hub-loading__skeleton" aria-hidden="true">
          <div class="ssc-hub-loading__skeleton-bar"></div>
          <div class="ssc-hub-loading__skeleton-grid"></div>
        </div>
      </div>
    `;
  }

  global.EAP_SSC_LOADING = { renderGeneratingCard, renderHubCalendarLoading };
})(typeof window !== "undefined" ? window : globalThis);
