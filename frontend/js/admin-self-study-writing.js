/**
 * Manager centre — SS-W1 writing tasks list and CSV export.
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

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadTasks(tbody, emptyEl) {
    if (!tbody) return;
    try {
      const data = await apiFetch("/api/admin/self-study/writing/tasks");
      const list = data.tasks || [];
      tbody.innerHTML = "";
      if (!list.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      list.forEach((task) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(task.genreId)}</td>
          <td>${escapeHtml(task.className || "—")}</td>
          <td>${task.sortOrder}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
    }
  }

  function init() {
    if (!document.getElementById("admin-writing-section")) return;
    const tbody = document.getElementById("admin-writing-tbody");
    const emptyEl = document.getElementById("admin-writing-empty");
    document.getElementById("admin-writing-export")?.addEventListener("click", () => {
      window.open(`${apiBase()}/api/admin/self-study/writing/tasks/export.csv`, "_blank");
    });
    void loadTasks(tbody, emptyEl);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
