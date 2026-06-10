/**
 * Manager centre — AI roster upload for teachers and students.
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
      .replace(/>/g, "&gt;");
  }

  function setMsg(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("form-message--error", Boolean(isError && text));
    el.classList.remove("form-message--success");
    if (text && !isError) el.classList.add("form-message--success");
  }

  function idField(role) {
    return role === "teacher" ? "employee_id" : "student_id";
  }

  function idLabel(role) {
    return role === "teacher" ? t("admin_col_employee_id") : t("admin_col_student_id");
  }

  function renderPreview(container, role, data) {
    if (!container) return;
    const people = Array.isArray(data.people) ? data.people : [];
    const idKey = idField(role);
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];

    if (!people.length) {
      container.innerHTML = `<p class="admin-panel__hint">${escapeHtml(t("admin_roster_empty"))}</p>`;
      container.classList.remove("hidden");
      return;
    }

    const rows = people
      .map((row, idx) => {
        const classes = Array.isArray(row.class_codes) ? row.class_codes.join(", ") : "";
        const authCell =
          role === "teacher"
            ? `<td>${row.authorized ? t("admin_status_authorized") : t("admin_status_pending")}</td>`
            : "";
        const authHead = role === "teacher" ? `<th scope="col">${escapeHtml(t("admin_col_status"))}</th>` : "";
        return `
          <tr>
            <td><input type="checkbox" class="admin-roster-row-check" data-idx="${idx}" ${row.selected !== false ? "checked" : ""} aria-label="Select row" /></td>
            <td>${escapeHtml(row.full_name || "—")}</td>
            <td>${escapeHtml(row[idKey] || "—")}</td>
            <td>${escapeHtml(row.username || "—")}</td>
            <td>${escapeHtml(classes || "—")}</td>
            ${authCell}
          </tr>`;
      })
      .join("");

    const warnHtml = warnings.length
      ? `<ul class="admin-roster-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : "";

    container.innerHTML = `
      <p class="admin-panel__hint">
        ${escapeHtml(t("admin_roster_preview_lead", { n: people.length, ai: data.ai_used ? t("admin_roster_ai_yes") : t("admin_roster_ai_no") }))}
      </p>
      ${warnHtml}
      <div class="admin-table-wrap">
        <table class="admin-table admin-roster-preview-table">
          <thead>
            <tr>
              <th scope="col"><input type="checkbox" id="admin-roster-check-all-${role}" checked aria-label="Select all" /></th>
              <th scope="col">${escapeHtml(t("admin_col_name"))}</th>
              <th scope="col">${escapeHtml(idLabel(role))}</th>
              <th scope="col">${escapeHtml(t("username"))}</th>
              <th scope="col">${escapeHtml(t("class_label"))}</th>
              ${role === "teacher" ? `<th scope="col">${escapeHtml(t("admin_col_status"))}</th>` : ""}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="admin-inline-form admin-roster-confirm-row">
        <div class="field">
          <label for="admin-roster-password-${role}">${escapeHtml(t("admin_roster_default_password"))}</label>
          <input id="admin-roster-password-${role}" type="text" value="123456" minlength="6" maxlength="64" autocomplete="off" />
        </div>
        <button type="button" class="btn-primary" id="admin-roster-confirm-${role}">${escapeHtml(t("admin_roster_confirm_btn"))}</button>
      </div>
    `;
    container.classList.remove("hidden");

    const checkAll = container.querySelector(`#admin-roster-check-all-${role}`);
    checkAll?.addEventListener("change", () => {
      container.querySelectorAll(".admin-roster-row-check").forEach((cb) => {
        cb.checked = checkAll.checked;
      });
    });
  }

  function collectSelectedPeople(container, cache) {
    const people = Array.isArray(cache.people) ? cache.people.map((p) => ({ ...p })) : [];
    container.querySelectorAll(".admin-roster-row-check").forEach((cb) => {
      const idx = Number(cb.getAttribute("data-idx"), 10);
      if (people[idx]) people[idx].selected = cb.checked;
    });
    return people.filter((p) => p.selected !== false);
  }

  async function confirmImport(role, previewEl, fileEl, statusEl) {
    const cache = previewEl && previewEl._eapRosterCache;
    if (!cache) return;
    const selected = collectSelectedPeople(previewEl, cache);
    if (!selected.length) {
      setMsg(statusEl, t("admin_roster_none_selected"), true);
      return;
    }
    const confirmBtn = document.getElementById(`admin-roster-confirm-${role}`);
    setMsg(statusEl, t("admin_roster_importing"), false);
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const pwdEl = document.getElementById(`admin-roster-password-${role}`);
      const out = await global.apiPost("/api/admin/roster/confirm", {
        role,
        people: selected,
        default_password: pwdEl && pwdEl.value ? pwdEl.value : "123456",
      });
      const r = out.result || {};
      let msg = t("admin_roster_import_done", {
        created: r.created || 0,
        updated: r.updated || 0,
        skipped: r.skipped || 0,
      });
      if (Array.isArray(r.errors) && r.errors.length) {
        msg += ` ${r.errors.join("; ")}`;
      }
      setMsg(statusEl, msg, false);
      if (fileEl) fileEl.value = "";
      previewEl._eapRosterCache = null;
      previewEl.classList.add("hidden");
      if (typeof global.__eapAdminLangRefresh === "function") {
        global.__eapAdminLangRefresh();
      }
    } catch (err) {
      setMsg(statusEl, err.message || t("admin_roster_import_failed"), true);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function bindPanel(role) {
    const form = document.getElementById(`admin-roster-form-${role}`);
    const fileEl = document.getElementById(`admin-roster-file-${role}`);
    const classEl = document.getElementById(`admin-roster-class-${role}`);
    const statusEl = document.getElementById(`admin-roster-status-${role}`);
    const previewEl = document.getElementById(`admin-roster-preview-${role}`);
    if (!form || !fileEl) return;

    previewEl?.addEventListener("click", (ev) => {
      const btn = ev.target.closest(`#admin-roster-confirm-${role}`);
      if (btn) void confirmImport(role, previewEl, fileEl, statusEl);
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const file = fileEl.files && fileEl.files[0];
      if (!file) return;

      setMsg(statusEl, t("admin_roster_parsing"), false);
      if (previewEl) previewEl.classList.add("hidden");
      const parseBtn = form.querySelector('button[type="submit"]');
      if (parseBtn) parseBtn.disabled = true;

      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("role", role);
        fd.append("use_ai", "1");
        if (classEl && classEl.value.trim()) {
          fd.append("default_class", classEl.value.trim());
        }
        const base = global.EAP_API_BASE_RESOLVED || "";
        const res = await global.eapPostMultipart(`${base}/api/admin/roster/parse`, fd);
        let data = {};
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }
        if (!res.ok) throw new Error(data.error || t("admin_roster_parse_failed"));
        previewEl._eapRosterCache = data;
        renderPreview(previewEl, role, data);
        setMsg(statusEl, t("admin_roster_parse_ok", { n: (data.people || []).length }), false);
      } catch (err) {
        setMsg(statusEl, err.message || t("admin_roster_parse_failed"), true);
      } finally {
        if (parseBtn) parseBtn.disabled = false;
      }
    });
  }

  function init() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    bindPanel("teacher");
    bindPanel("student");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
