/**
 * HM-M1a / HM-M4 — Manager homework marking profiles + analytics dashboard.
 */
(function () {
  function t(key, vars) {
    if (typeof window.t === "function") return window.t(key, vars);
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
  let analyticsClassFilter = "EAP047";

  function getAnalyticsDays() {
    const sel = document.getElementById("admin-hm-analytics-days");
    return sel ? String(sel.value || "0") : "0";
  }

  function getAnalyticsClass() {
    const sel = document.getElementById("admin-hm-analytics-class");
    return sel ? String(sel.value || "").trim() : analyticsClassFilter;
  }

  function analyticsQueryString() {
    const params = new URLSearchParams();
    const cls = getAnalyticsClass();
    if (cls) params.set("class_name", cls);
    const days = getAnalyticsDays();
    if (days && days !== "0") params.set("days", days);
    const q = params.toString();
    return q ? `?${q}` : "";
  }

  function fillAnalyticsClassSelect(classes, selected) {
    const sel = document.getElementById("admin-hm-analytics-class");
    if (!sel) return;
    const list = Array.isArray(classes) ? classes.slice() : [];
    const opts = [
      { value: "", label: t("admin_hm_analytics_class_all") },
      ...list.map((c) => ({ value: c, label: c })),
    ];
    sel.innerHTML = opts
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join("");
    const want = selected != null ? String(selected) : analyticsClassFilter;
    if ([...sel.options].some((o) => o.value === want)) {
      sel.value = want;
    } else if (want && !list.includes(want)) {
      const opt = document.createElement("option");
      opt.value = want;
      opt.textContent = want;
      sel.appendChild(opt);
      sel.value = want;
    }
    analyticsClassFilter = sel.value;
  }

  function statusLabel(key) {
    const map = {
      ready: "admin_hm_chart_ready",
      pending: "admin_hm_chart_pending",
      failed: "admin_hm_chart_failed",
      approved: "admin_hm_chart_approved",
    };
    return t(map[key] || key);
  }

  function renderBarChart(titleKey, items, valueKey, labelKey) {
    if (!items || !items.length) {
      return `<p class="admin-hm-chart__empty">${escapeHtml(t("admin_hm_chart_no_data"))}</p>`;
    }
    const max = Math.max(1, ...items.map((x) => Number(x[valueKey]) || 0));
    const rows = items
      .map((item) => {
        const n = Number(item[valueKey]) || 0;
        const pct = Math.round((100 * n) / max);
        const label =
          labelKey === "key"
            ? statusLabel(item.key)
            : escapeHtml(item[labelKey] || "");
        return `
        <div class="admin-hm-chart__row">
          <span class="admin-hm-chart__label">${label}</span>
          <div class="admin-hm-chart__track" role="presentation">
            <div class="admin-hm-chart__bar" style="width:${pct}%"></div>
          </div>
          <span class="admin-hm-chart__value">${n}</span>
        </div>`;
      })
      .join("");
    return `
      <div class="admin-hm-chart">
        <h4 class="admin-hm-chart__title">${escapeHtml(t(titleKey))}</h4>
        ${rows}
      </div>`;
  }

  function renderAnalyticsBody(a) {
    const filterLabel = a.class_name
      ? escapeHtml(a.class_name)
      : escapeHtml(t("admin_hm_analytics_class_all"));
    const periodLabel =
      a.days && a.days > 0
        ? escapeHtml(t("admin_hm_analytics_period_days", { n: a.days }))
        : escapeHtml(t("admin_hm_analytics_days_all"));

    const summary = `
      <p class="admin-hm-analytics__title">${escapeHtml(t("admin_hm_analytics_title"))}</p>
      <p class="admin-hm-analytics__filter">${escapeHtml(t("admin_hm_analytics_filter", { class: filterLabel, period: periodLabel }))}</p>
      <ul class="admin-hm-analytics__list">
        <li>${escapeHtml(t("admin_hm_analytics_total", { n: a.total_reports || 0 }))}</li>
        <li>${escapeHtml(t("admin_hm_analytics_ready", { n: a.ready || 0 }))}</li>
        <li>${escapeHtml(t("admin_hm_analytics_approved", { n: a.approved || 0, pct: a.accept_rate_pct || 0 }))}</li>
        <li>${escapeHtml(t("admin_hm_analytics_regenerated", { n: a.regenerated || 0 }))}</li>
        <li>${escapeHtml(t("admin_hm_analytics_profiles", { n: a.active_profiles || 0 }))}</li>
      </ul>`;

    const charts = `
      <div class="admin-hm-charts">
        ${renderBarChart("admin_hm_chart_status", a.by_status || [], "count", "key")}
        ${renderBarChart("admin_hm_chart_category", a.by_category || [], "count", "category")}
        ${renderBarChart("admin_hm_chart_daily", (a.daily || []).map((d) => ({ category: d.day, count: d.count })), "count", "category")}
      </div>`;

    return summary + charts;
  }

  async function loadAnalytics() {
    const el = document.getElementById("admin-hm-analytics");
    if (!el) return;
    try {
      const data = await apiFetch(
        `/api/admin/homework-marking/analytics${analyticsQueryString()}`
      );
      const a = data.analytics || {};
      fillAnalyticsClassSelect(a.available_classes || [], getAnalyticsClass());
      el.innerHTML = renderAnalyticsBody(a);
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    } catch (err) {
      el.textContent = (err && err.message) || t("admin_hm_load_failed");
    }
  }

  function exportAnalyticsCsv() {
    const url = `${resolveApiBase()}/api/admin/homework-marking/analytics/export.csv${analyticsQueryString()}`;
    window.location.assign(url);
  }

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
    const classEl = document.getElementById("admin-hm-class");
    if (promptEl) promptEl.value = p.system_prompt || "";
    if (catEl) catEl.value = p.task_category || "";
    if (classEl) classEl.value = p.class_name || "";
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

    ["admin-hm-prompt", "admin-hm-category", "admin-hm-title", "admin-hm-class"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", resetSaveButton);
    });

    document.getElementById("admin-hm-analytics-class")?.addEventListener("change", () => {
      analyticsClassFilter = getAnalyticsClass();
      void loadAnalytics();
    });
    document.getElementById("admin-hm-analytics-days")?.addEventListener("change", () => {
      void loadAnalytics();
    });
    document.getElementById("admin-hm-analytics-refresh")?.addEventListener("click", () => {
      void loadAnalytics();
    });
    document.getElementById("admin-hm-analytics-export")?.addEventListener("click", () => {
      exportAnalyticsCsv();
    });

    document.getElementById("admin-hm-save-btn")?.addEventListener("click", () => {
      if (!selectedId) return;
      const btn = document.getElementById("admin-hm-save-btn");
      const body = {
        title: document.getElementById("admin-hm-title")?.value || "",
        task_category: document.getElementById("admin-hm-category")?.value || "",
        class_name: document.getElementById("admin-hm-class")?.value || "",
        system_prompt: document.getElementById("admin-hm-prompt")?.value || "",
      };
      const save = () =>
        apiFetch(`/api/admin/homework-marking/profiles/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(() => {
          setStatus(t("admin_hm_saved"), false);
          return Promise.all([loadProfiles(), loadAnalytics()]);
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

    const classSel = document.getElementById("admin-hm-analytics-class");
    if (classSel && analyticsClassFilter) {
      fillAnalyticsClassSelect([analyticsClassFilter], analyticsClassFilter);
    }

    try {
      await Promise.all([loadProfiles(), loadAnalytics()]);
    } catch (err) {
      setStatus((err && err.message) || t("admin_hm_load_failed"), true);
    }
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
