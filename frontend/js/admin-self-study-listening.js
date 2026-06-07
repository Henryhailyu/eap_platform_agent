/**
 * Manager centre — SS-L1 listening items list and CSV export.
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

  async function apiFetch(path) {
    const fn = typeof window.EAP_fetch === "function" ? window.EAP_fetch : fetch;
    const response = await fn(`${apiBase()}${path}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText || "Request failed");
    return data;
  }

  function t(key) {
    if (typeof window.t === "function") return window.t(key);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadItems(tbody, emptyEl) {
    if (!tbody) return;
    try {
      const data = await apiFetch("/api/admin/self-study/listening/items");
      const list = data.items || [];
      tbody.innerHTML = "";
      if (!list.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      list.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(item.title)}</td>
          <td>${escapeHtml(item.partType)}</td>
          <td>${escapeHtml(item.className || "—")}</td>
          <td>${item.sortOrder}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
    }
  }

  function init() {
    const section = document.getElementById("admin-listening-section");
    if (!section) return;
    const tbody = document.getElementById("admin-listening-tbody");
    const emptyEl = document.getElementById("admin-listening-empty");
    document.getElementById("admin-listening-export")?.addEventListener("click", () => {
      window.open(`${apiBase()}/api/admin/self-study/listening/items/export.csv`, "_blank");
    });
    void loadItems(tbody, emptyEl);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
