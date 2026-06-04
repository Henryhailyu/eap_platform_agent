/**
 * HM-M1a — Manager homework marking profiles + descriptor uploads.
 */
(function () {
  function t(key) {
    if (typeof window.t === "function") return window.t(key);
    return key;
  }

  function resolveApiBase() {
    if (window.EAP_API_BASE_RESOLVED) {
      return String(window.EAP_API_BASE_RESOLVED).replace(/\/$/, "");
    }
    const custom = window.EAP_API_BASE;
    if (custom != null && String(custom).trim() !== "") {
      return String(custom).trim().replace(/\/$/, "");
    }
    if (window.location && /^https?:$/i.test(window.location.protocol)) {
      return window.location.origin.replace(/\/$/, "");
    }
    return "http://127.0.0.1:5051";
  }

  async function apiFetch(path, options) {
    const fn = typeof window.EAP_fetch === "function" ? window.EAP_fetch : fetch;
    const response = await fn(`${resolveApiBase()}${path}`, {
      credentials: "include",
      ...(options || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("admin-hm-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
    el.classList.toggle("form-message--error", !!isError);
  }

  function renderDescriptors(listEl, descriptors) {
    if (!listEl) return;
    if (!descriptors.length) {
      listEl.innerHTML = `<li class="admin-hm-desc__empty">${escapeHtml(t("admin_hm_no_descriptors"))}</li>`;
      return;
    }
    listEl.innerHTML = descriptors
      .map(
        (d) => `
      <li class="admin-hm-desc__row">
        <span>${escapeHtml(d.label || d.original_name)} — ${escapeHtml(d.extract_status)} (${d.char_count} chars)</span>
        <button type="button" class="btn-secondary admin-hm-desc-delete" data-id="${d.id}">${escapeHtml(t("admin_hm_delete_descriptor"))}</button>
      </li>`
      )
      .join("");
    listEl.querySelectorAll(".admin-hm-desc-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        void apiFetch(`/api/admin/homework-marking/descriptors/${id}`, { method: "DELETE" })
          .then(() => loadProfiles())
          .catch((err) => setStatus(err.message, true));
      });
    });
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  let profiles = [];
  let selectedId = null;

  async function loadProfiles() {
    const data = await apiFetch("/api/admin/homework-marking/profiles");
    profiles = data.profiles || [];
    const sel = document.getElementById("admin-hm-profile-select");
    if (!sel) return;
    sel.innerHTML = profiles
      .map(
        (p) =>
          `<option value="${p.id}">${escapeHtml(p.title)} (${escapeHtml(p.profile_key)})</option>`
      )
      .join("");
    if (!selectedId && profiles.length) selectedId = profiles[0].id;
    if (selectedId) sel.value = String(selectedId);
    showProfile(Number(sel.value));
  }

  function resetSaveButton() {
    const btn = document.getElementById("admin-hm-save-btn");
    if (btn && typeof window.EAP_resetSaveButton === "function") {
      window.EAP_resetSaveButton(btn);
    }
  }

  function showProfile(id) {
    selectedId = id;
    const p = profiles.find((x) => Number(x.id) === Number(id));
    if (!p) return;
    const promptEl = document.getElementById("admin-hm-prompt");
    const catEl = document.getElementById("admin-hm-category");
    const titleEl = document.getElementById("admin-hm-title");
    if (promptEl) promptEl.value = p.system_prompt || "";
    if (catEl) catEl.value = p.task_category || "";
    if (titleEl) titleEl.value = p.title || "";
    renderDescriptors(document.getElementById("admin-hm-descriptors"), p.descriptors || []);
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    const section = document.getElementById("admin-hm-section");
    if (!section) return;

    document.getElementById("admin-hm-profile-select")?.addEventListener("change", (ev) => {
      resetSaveButton();
      showProfile(Number(ev.target.value));
    });

    ["admin-hm-prompt", "admin-hm-category", "admin-hm-title"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", resetSaveButton);
    });

    document.getElementById("admin-hm-save-btn")?.addEventListener("click", () => {
      if (!selectedId) return;
      const btn = document.getElementById("admin-hm-save-btn");
      const body = {
        title: document.getElementById("admin-hm-title")?.value || "",
        task_category: document.getElementById("admin-hm-category")?.value || "",
        system_prompt: document.getElementById("admin-hm-prompt")?.value || "",
      };
      const save = () =>
        apiFetch(`/api/admin/homework-marking/profiles/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(() => {
          setStatus(t("admin_hm_saved"), false);
          return loadProfiles();
        });
      const run = typeof window.EAP_runSaveButton === "function" ? window.EAP_runSaveButton : null;
      if (run && btn) {
        void run(btn, save).catch((err) => setStatus(err.message, true));
      } else {
        void save().catch((err) => setStatus(err.message, true));
      }
    });

    document.getElementById("admin-hm-upload-btn")?.addEventListener("click", () => {
      const input = document.getElementById("admin-hm-file");
      if (!input || !input.files || !input.files[0] || !selectedId) return;
      const fd = new FormData();
      fd.append("file", input.files[0]);
      const label = document.getElementById("admin-hm-file-label")?.value || "";
      if (label) fd.append("label", label);
      void apiFetch(`/api/admin/homework-marking/profiles/${selectedId}/descriptors`, {
        method: "POST",
        body: fd,
      })
        .then(() => {
          input.value = "";
          setStatus(t("admin_hm_descriptor_uploaded"), false);
          return loadProfiles();
        })
        .catch((err) => setStatus(err.message, true));
    });

    try {
      await loadProfiles();
    } catch (err) {
      setStatus((err && err.message) || t("admin_hm_load_failed"), true);
    }
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
