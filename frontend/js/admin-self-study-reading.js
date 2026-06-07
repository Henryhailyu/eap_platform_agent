/**
 * Manager centre — SS-R1 reading Channel A push and passage export.
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

  function t(key) {
    if (typeof window.t === "function") return window.t(key);
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
        await apiFetch("/api/admin/self-study/reading/push-channel-a", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ className, isActive }),
        });
        setStatus(statusEl, t("admin_reading_saved"), false);
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

  function init() {
    const section = document.getElementById("admin-reading-section");
    if (!section) return;
    const statusEl = document.getElementById("admin-reading-status");
    const tbody = document.getElementById("admin-reading-tbody");
    const emptyEl = document.getElementById("admin-reading-empty");
    bindPush(statusEl);
    bindExport();
    void loadPassages(tbody, emptyEl);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
