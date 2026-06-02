/**
 * Format saved timestamps for teacher document lists (locale-aware).
 */
(function (global) {
  function lang() {
    return global.EAP_I18N && global.EAP_I18N.getLang() === "zh" ? "zh" : "en";
  }

  function formatSavedAt(iso) {
    const raw = String(iso || "").trim();
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const locale = lang() === "zh" ? "zh-CN" : "en-GB";
    try {
      return d.toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function savedAtLabel(iso) {
    const formatted = formatSavedAt(iso);
    if (!formatted) return "";
    if (typeof global.t === "function") return global.t("eap_saved_at", { when: formatted });
    return `Saved ${formatted}`;
  }

  global.EAP_formatSavedAt = formatSavedAt;
  global.EAP_savedAtLabel = savedAtLabel;
})(typeof window !== "undefined" ? window : globalThis);
