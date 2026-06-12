/**
 * Manager centre — AI roster upload for teachers and students (editable preview → push).
 */
(function (global) {
  const classRosterContext = { classCode: null, onImportSuccess: null };

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

  function setMsg(el, text, isError) {
    if (!el) return;
    el.innerHTML = "";
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("form-message--error", Boolean(isError && text));
    el.classList.remove("form-message--success", "form-message--warning");
    if (text && !isError) el.classList.add("form-message--success");
  }

  function setImportStatus(el, summary, errors, hasPartialSuccess) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("form-message--success", "form-message--error", "form-message--warning");
    if (!summary && (!errors || !errors.length)) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    const wrap = document.createElement("div");
    wrap.className = "admin-roster-import-status";
    if (summary) {
      const p = document.createElement("p");
      p.className = "admin-roster-import-status__summary";
      p.textContent = summary;
      wrap.appendChild(p);
    }
    if (Array.isArray(errors) && errors.length) {
      const title = document.createElement("p");
      title.className = "admin-roster-import-status__errors-title";
      title.textContent = t("admin_roster_import_errors_title", { n: errors.length });
      wrap.appendChild(title);
      const list = document.createElement("ul");
      list.className = "admin-roster-import-status__errors";
      errors.forEach((err) => {
        const li = document.createElement("li");
        li.textContent = String(err);
        list.appendChild(li);
      });
      wrap.appendChild(list);
    }
    el.appendChild(wrap);
    if (errors && errors.length) {
      el.classList.add(hasPartialSuccess ? "form-message--warning" : "form-message--error");
    } else {
      el.classList.add("form-message--success");
    }
  }

  function applyFixedClassToPeople(people, classCode) {
    const code = classCode ? String(classCode).trim().toUpperCase() : "";
    if (!code || !Array.isArray(people)) return people;
    return people.map((row) => ({ ...row, class_codes: [code] }));
  }

  function idField(role) {
    return role === "teacher" ? "employee_id" : "student_id";
  }

  function idLabel(role) {
    return role === "teacher" ? t("admin_col_employee_id") : t("admin_col_student_id");
  }

  function previewColumns(role, hideClass) {
    const idKey = idField(role);
    const cols = [
      { key: "full_name", label: t("admin_col_name"), wide: true },
      { key: idKey, label: idLabel(role) },
    ];
    if (role === "teacher") {
      cols.push(
        { key: "office_number", label: t("admin_col_office_number") },
        { key: "email", label: t("admin_col_email") },
        { key: "office_phone", label: t("admin_col_office_phone") },
        { key: "mobile_phone", label: t("admin_col_mobile_phone") },
      );
    } else {
      cols.push(
        { key: "group_code", label: t("admin_col_group") },
        { key: "email", label: t("admin_col_school_email") },
        { key: "mobile_phone", label: t("admin_col_registered_phone") },
      );
    }
    cols.push({ key: "username", label: t("username") });
    if (!hideClass) cols.push({ key: "class_codes", label: t("class_label"), isClasses: true });
    return cols;
  }

  function fieldValue(row, col) {
    if (col.isClasses) {
      return Array.isArray(row.class_codes) ? row.class_codes.join(", ") : "";
    }
    if (col.isAuth) return Boolean(row.authorized);
    const val = row[col.key];
    return val != null ? String(val) : "";
  }

  function renderEditableCell(row, col, idx) {
    if (col.isAuth) {
      const checked = row.authorized ? " checked" : "";
      return `<td><input type="checkbox" class="admin-roster-field" data-idx="${idx}" data-field="authorized"${checked} aria-label="${escapeHtml(col.label)}" /></td>`;
    }
    const val = fieldValue(row, col);
    const wide = col.wide || col.key === "email" || col.isClasses;
    const cls = `admin-roster-field${wide ? " admin-roster-field--wide" : ""}`;
    if (col.isClasses) {
      return `<td><input type="text" class="${cls}" data-idx="${idx}" data-field="class_codes" value="${escapeHtml(val)}" aria-label="${escapeHtml(col.label)}" /></td>`;
    }
    return `<td><input type="text" class="${cls}" data-idx="${idx}" data-field="${escapeHtml(col.key)}" value="${escapeHtml(val)}" aria-label="${escapeHtml(col.label)}" /></td>`;
  }

  function renderPreview(container, role, data, opts) {
    if (!container) return;
    const hideClass = Boolean(opts && opts.hideClass);
    const confirmId = (opts && opts.confirmId) || `admin-roster-confirm-${role}`;
    const passwordId = (opts && opts.passwordId) || `admin-roster-password-${role}`;
    const checkAllId = (opts && opts.checkAllId) || `admin-roster-check-all-${role}`;

    const people = Array.isArray(data.people) ? data.people : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];

    if (!people.length) {
      container.innerHTML = `<p class="admin-panel__hint">${escapeHtml(t("admin_roster_empty"))}</p>`;
      container.classList.remove("hidden");
      return;
    }

    const cols = previewColumns(role, hideClass);
    const head = cols.map((c) => `<th scope="col">${escapeHtml(c.label)}</th>`).join("");
    const rows = people
      .map((row, idx) => {
        const cells = cols.map((c) => renderEditableCell(row, c, idx)).join("");
        return `
          <tr>
            <td><input type="checkbox" class="admin-roster-row-check" data-idx="${idx}" ${row.selected !== false ? "checked" : ""} aria-label="Select row" /></td>
            ${cells}
          </tr>`;
      })
      .join("");

    const warnHtml = warnings.length
      ? `<ul class="admin-roster-warnings">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : "";

    const roleTitle = role === "teacher" ? t("admin_roster_extracted_teachers") : t("admin_roster_extracted_students");

    container.innerHTML = `
      <div class="admin-roster-extract-box">
        <h4 class="admin-roster-extract-box__title">${escapeHtml(roleTitle)}</h4>
        <p class="admin-panel__hint">
          ${escapeHtml(t("admin_roster_preview_editable", { n: people.length, ai: data.ai_used ? t("admin_roster_ai_yes") : t("admin_roster_ai_no") }))}
        </p>
        ${warnHtml}
        <div class="admin-table-wrap admin-roster-extract-box__table">
          <table class="admin-table admin-roster-preview-table">
            <thead>
              <tr>
                <th scope="col"><input type="checkbox" id="${escapeHtml(checkAllId)}" checked aria-label="Select all" /></th>
                ${head}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="admin-inline-form admin-roster-confirm-row">
          <div class="field">
            <label for="${escapeHtml(passwordId)}">${escapeHtml(t("admin_roster_default_password"))}</label>
            <input id="${escapeHtml(passwordId)}" type="text" value="123456" minlength="6" maxlength="64" autocomplete="off" />
          </div>
          <button type="button" class="btn-primary" id="${escapeHtml(confirmId)}">${escapeHtml(t("admin_roster_push_btn"))}</button>
        </div>
      </div>
    `;
    container.classList.remove("hidden");

    const checkAll = container.querySelector(`#${checkAllId}`);
    checkAll?.addEventListener("change", () => {
      container.querySelectorAll(".admin-roster-row-check").forEach((cb) => {
        cb.checked = checkAll.checked;
      });
    });
  }

  function collectEditedPeople(container, cache) {
    const people = Array.isArray(cache.people) ? cache.people.map((p) => ({ ...p })) : [];
    container.querySelectorAll(".admin-roster-row-check").forEach((cb) => {
      const idx = Number(cb.getAttribute("data-idx"), 10);
      if (people[idx]) people[idx].selected = cb.checked;
    });
    container.querySelectorAll(".admin-roster-field").forEach((input) => {
      const idx = Number(input.getAttribute("data-idx"), 10);
      const field = input.getAttribute("data-field");
      if (!people[idx] || !field) return;
      if (field === "authorized") {
        people[idx].authorized = input.checked;
        return;
      }
      if (field === "class_codes") {
        people[idx].class_codes = input.value
          .split(/[,;/\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return;
      }
      people[idx][field] = input.value.trim();
    });
    return people.filter((p) => p.selected !== false);
  }

  async function confirmImport(role, previewEl, fileEl, statusEl, opts) {
    const cache = previewEl && previewEl._eapRosterCache;
    if (!cache) return;
    const selected = collectEditedPeople(previewEl, cache);
    if (!selected.length) {
      setMsg(statusEl, t("admin_roster_none_selected"), true);
      return;
    }
    const confirmId = (opts && opts.confirmId) || `admin-roster-confirm-${role}`;
    const passwordId = (opts && opts.passwordId) || `admin-roster-password-${role}`;
    const confirmBtn = document.getElementById(confirmId);
    setMsg(statusEl, t("admin_roster_importing"), false);
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const pwdEl = document.getElementById(passwordId);
      const fixedClass = opts.getFixedClass ? opts.getFixedClass() : null;
      const peoplePayload = fixedClass ? applyFixedClassToPeople(selected, fixedClass) : selected;
      const body = {
        role,
        people: peoplePayload,
        default_password: pwdEl && pwdEl.value ? pwdEl.value : "123456",
      };
      if (fixedClass) body.fixed_class_code = fixedClass;
      const out = await global.apiPost("/api/admin/roster/confirm", body);
      const r = out.result || {};
      const summary = t("admin_roster_import_done", {
        created: r.created || 0,
        updated: r.updated || 0,
        skipped: r.skipped || 0,
      });
      const errors = Array.isArray(r.errors) ? r.errors : [];
      const hasPartialSuccess = (r.created || 0) + (r.updated || 0) > 0;
      setImportStatus(statusEl, summary, errors, hasPartialSuccess);
      if (fileEl) fileEl.value = "";
      previewEl._eapRosterCache = null;
      previewEl.classList.add("hidden");
      previewEl.innerHTML = "";
      if (typeof opts?.onImportSuccess === "function") {
        await opts.onImportSuccess();
      } else if (typeof global.__eapAdminLangRefresh === "function") {
        global.__eapAdminLangRefresh();
      }
    } catch (err) {
      setMsg(statusEl, err.message || t("admin_roster_import_failed"), true);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function bindPanel(role, opts) {
    opts = opts || {};
    const form = document.getElementById(opts.formId || `admin-roster-form-${role}`);
    const fileEl = document.getElementById(opts.fileId || `admin-roster-file-${role}`);
    const classEl = opts.classId ? document.getElementById(opts.classId) : document.getElementById(`admin-roster-class-${role}`);
    const statusEl = document.getElementById(opts.statusId || `admin-roster-status-${role}`);
    const previewEl = document.getElementById(opts.previewId || `admin-roster-preview-${role}`);
    if (!form || !fileEl) return;

    const previewOpts = {
      hideClass: Boolean(opts.hideClass),
      confirmId: opts.confirmId || `admin-roster-confirm-${role}`,
      passwordId: opts.passwordId || `admin-roster-password-${role}`,
      checkAllId: opts.checkAllId || `admin-roster-check-all-${role}`,
    };

    previewEl?.addEventListener("click", (ev) => {
      const btn = ev.target.closest(`#${previewOpts.confirmId}`);
      if (btn) {
        void confirmImport(role, previewEl, fileEl, statusEl, {
          ...previewOpts,
          onImportSuccess: opts.onImportSuccess,
          getFixedClass: opts.getFixedClass,
        });
      }
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const file = fileEl.files && fileEl.files[0];
      if (!file) return;

      const fixedClass = opts.getFixedClass ? opts.getFixedClass() : null;
      if (opts.requireClass && !fixedClass) {
        setMsg(statusEl, t("admin_class_roster_need_class"), true);
        return;
      }

      setMsg(statusEl, t("admin_roster_parsing"), false);
      if (previewEl) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
      }
      const parseBtn = form.querySelector('button[type="submit"]');
      if (parseBtn) parseBtn.disabled = true;

      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("role", role);
        fd.append("use_ai", "1");
        const defaultClass = fixedClass || (classEl && classEl.value.trim()) || "";
        if (defaultClass) fd.append("default_class", defaultClass);
        if (opts.scopeClass && defaultClass) fd.append("scope_class", "1");
        const base = global.EAP_API_BASE_RESOLVED || "";
        const res = await global.eapPostMultipart(`${base}/api/admin/roster/parse`, fd);
        let data = {};
        try {
          data = await res.json();
        } catch (_) {
          data = {};
        }
        if (!res.ok) throw new Error(data.error || t("admin_roster_parse_failed"));
        if (fixedClass && Array.isArray(data.people)) {
          data.people = applyFixedClassToPeople(data.people, fixedClass);
        }
        previewEl._eapRosterCache = data;
        renderPreview(previewEl, role, data, previewOpts);
        setMsg(statusEl, t("admin_roster_parse_ok", { n: (data.people || []).length }), false);
      } catch (err) {
        setMsg(statusEl, err.message || t("admin_roster_parse_failed"), true);
      } finally {
        if (parseBtn) parseBtn.disabled = false;
      }
    });
  }

  function setClassRosterContext(classCode, onImportSuccess) {
    classRosterContext.classCode = classCode ? String(classCode).trim().toUpperCase() : null;
    classRosterContext.onImportSuccess = typeof onImportSuccess === "function" ? onImportSuccess : null;
  }

  function initClassRosterPanels() {
    const onSuccess = () => classRosterContext.onImportSuccess && classRosterContext.onImportSuccess();
    bindPanel("teacher", {
      formId: "admin-class-roster-form-teacher",
      fileId: "admin-class-roster-file-teacher",
      statusId: "admin-class-roster-status-teacher",
      previewId: "admin-class-roster-preview-teacher",
      confirmId: "admin-class-roster-confirm-teacher",
      passwordId: "admin-class-roster-password-teacher",
      checkAllId: "admin-class-roster-check-all-teacher",
      hideClass: true,
      scopeClass: true,
      requireClass: true,
      getFixedClass: () => classRosterContext.classCode,
      onImportSuccess: onSuccess,
    });
    bindPanel("student", {
      formId: "admin-class-roster-form-student",
      fileId: "admin-class-roster-file-student",
      statusId: "admin-class-roster-status-student",
      previewId: "admin-class-roster-preview-student",
      confirmId: "admin-class-roster-confirm-student",
      passwordId: "admin-class-roster-password-student",
      checkAllId: "admin-class-roster-check-all-student",
      hideClass: true,
      scopeClass: true,
      requireClass: true,
      getFixedClass: () => classRosterContext.classCode,
      onImportSuccess: onSuccess,
    });
  }

  function init() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    initClassRosterPanels();
  }

  global.EAP_ADMIN_ROSTER = { setClassRosterContext, initClassRosterPanels };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
