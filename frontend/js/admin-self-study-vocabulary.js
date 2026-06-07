/**
 * Manager centre — SS-V1 vocabulary packs, Channel A push, course export.
 */
(function () {
  const SERVER = () => window.EAP_SELF_STUDY_SERVER;

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

  async function loadPacks(tbody, emptyEl) {
    if (!tbody) return;
    try {
      const data = await apiFetch("/api/admin/self-study/vocabulary/packs");
      const packs = data.packs || [];
      tbody.innerHTML = "";
      if (!packs.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      packs.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(p.displayName)}</td>
          <td>${escapeHtml(p.className || "—")}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (_) {
      if (emptyEl) emptyEl.classList.remove("hidden");
    }
  }

  function bindForm(statusEl, tbody, emptyEl) {
    const form = document.getElementById("admin-vocab-pack-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("admin-vocab-pack-name")?.value?.trim();
      const cls = document.getElementById("admin-vocab-pack-class")?.value?.trim();
      if (!name) return;
      setStatus(statusEl, "", false);
      try {
        await apiFetch("/api/admin/self-study/vocabulary/packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: name, className: cls || null }),
        });
        form.reset();
        await loadPacks(tbody, emptyEl);
        setStatus(statusEl, t("admin_vocab_saved"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_vocab_failed"), true);
      }
    });
  }

  function bindPush(statusEl) {
    const onBtn = document.getElementById("admin-vocab-push-on");
    const offBtn = document.getElementById("admin-vocab-push-off");
    const clsInput = document.getElementById("admin-vocab-push-class");
    async function push(isActive) {
      const className = clsInput?.value?.trim() || "EAP047";
      setStatus(statusEl, "", false);
      try {
        await apiFetch("/api/admin/self-study/vocabulary/push-channel-a", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ className, isActive }),
        });
        setStatus(statusEl, t("admin_vocab_saved"), false);
      } catch (_) {
        setStatus(statusEl, t("admin_vocab_failed"), true);
      }
    }
    onBtn?.addEventListener("click", () => void push(true));
    offBtn?.addEventListener("click", () => void push(false));
  }

  function bindExport() {
    const btn = document.getElementById("admin-vocab-export");
    const courseInput = document.getElementById("admin-vocab-course-id");
    btn?.addEventListener("click", () => {
      const id = parseInt(courseInput?.value || "1", 10);
      if (!id) return;
      window.open(`${apiBase()}/api/admin/self-study/vocabulary/courses/${id}/export.csv`, "_blank");
    });
  }

  function init() {
    const section = document.getElementById("admin-vocab-section");
    if (!section) return;
    const statusEl = document.getElementById("admin-vocab-status");
    const tbody = document.getElementById("admin-vocab-tbody");
    const emptyEl = document.getElementById("admin-vocab-empty");
    bindForm(statusEl, tbody, emptyEl);
    bindPush(statusEl);
    bindExport();
    void loadPacks(tbody, emptyEl);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
