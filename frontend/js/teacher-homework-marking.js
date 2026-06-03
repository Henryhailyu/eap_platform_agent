/**
 * HM-M1b — Teacher AI homework report panel on submission review.
 */
(function (global) {
  const API_BASE = () =>
    (typeof window !== "undefined" && window.EAP_API_BASE) ||
    (typeof API_BASE !== "undefined" ? API_BASE : "");

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

  async function apiFetch(path, options) {
    const base = String(API_BASE() || "").replace(/\/$/, "");
    const url = `${base}${path}`;
    const fn =
      typeof global.EAP_fetch === "function" ? global.EAP_fetch : global.fetch.bind(global);
    const opts = { credentials: "include", ...(options || {}) };
    if (typeof global.EAP_getAuthHeaders === "function") {
      opts.headers = global.EAP_getAuthHeaders(opts.headers);
    }
    const response = await fn(url, opts);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fallback =
        response.status === 404
          ? t("hm_report_route_missing")
          : response.statusText;
      throw new Error(data.error || data.detail || fallback);
    }
    return data;
  }

  function renderReportBody(container, report) {
    const sections = [
      ["executive_summary", "hm_report_summary"],
      ["strengths", "hm_report_strengths"],
      ["issues", "hm_report_issues"],
      ["actionable_revisions", "hm_report_revisions"],
      ["suggested_band", "hm_report_band"],
    ];
    container.innerHTML = "";
    sections.forEach(([key, i18nKey]) => {
      const val = report && report[key] ? String(report[key]).trim() : "";
      if (!val) return;
      const block = document.createElement("div");
      block.className = "hm-report-block";
      const h = document.createElement("h6");
      h.className = "hm-report-block__title";
      h.textContent = t(i18nKey);
      const body = document.createElement("div");
      body.className = "hm-report-block__body";
      body.textContent = val;
      block.appendChild(h);
      block.appendChild(body);
      container.appendChild(block);
    });
  }

  async function mountHomeworkAiReportPanel(container, submissionId) {
    if (!container || !submissionId) return;

    const section = document.createElement("div");
    section.className = "hm-report-panel";

    const title = document.createElement("h5");
    title.className = "task-submission-section__title";
    title.textContent = t("hm_report_title");

    const statusEl = document.createElement("p");
    statusEl.className = "hm-report-panel__status";
    statusEl.setAttribute("aria-live", "polite");

    const bodyEl = document.createElement("div");
    bodyEl.className = "hm-report-panel__body";

    const actions = document.createElement("div");
    actions.className = "hm-report-panel__actions";

    const genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.className = "btn-secondary";
    genBtn.textContent = t("hm_report_generate");

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn-primary";
    approveBtn.textContent = t("hm_report_approve");

    actions.appendChild(genBtn);
    actions.appendChild(approveBtn);

    section.appendChild(title);
    section.appendChild(statusEl);
    section.appendChild(bodyEl);
    section.appendChild(actions);
    container.appendChild(section);

    const refresh = async () => {
      statusEl.textContent = t("hm_report_loading");
      bodyEl.innerHTML = "";
      try {
        const data = await apiFetch(`/api/teacher/submissions/${submissionId}/ai-report`);
        const row = data.ai_report;
        if (!row) {
          statusEl.textContent = t("hm_report_none");
          approveBtn.disabled = true;
          return;
        }
        const st = row.status || "pending";
        if (st === "pending") {
          statusEl.textContent = t("hm_report_pending");
          approveBtn.disabled = true;
          return;
        }
        if (st === "failed") {
          statusEl.textContent = row.error_message || t("hm_report_failed");
          approveBtn.disabled = true;
          return;
        }
        if (st === "ready" && row.report) {
          statusEl.textContent = row.approved_at
            ? t("hm_report_approved")
            : t("hm_report_ready");
          renderReportBody(bodyEl, row.report);
          approveBtn.disabled = !!row.approved_at;
          return;
        }
        statusEl.textContent = t("hm_report_none");
        approveBtn.disabled = true;
      } catch (err) {
        statusEl.textContent = (err && err.message) || t("hm_report_failed");
        approveBtn.disabled = true;
      }
    };

    genBtn.addEventListener("click", () => {
      genBtn.disabled = true;
      statusEl.textContent = t("hm_report_generating");
      void apiFetch(`/api/teacher/submissions/${submissionId}/ai-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .then(() => refresh())
        .catch((err) => {
          statusEl.textContent = (err && err.message) || t("hm_report_failed");
        })
        .finally(() => {
          genBtn.disabled = false;
        });
    });

    approveBtn.addEventListener("click", () => {
      approveBtn.disabled = true;
      void apiFetch(`/api/teacher/submissions/${submissionId}/ai-report/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace" }),
      })
        .then((data) => {
          statusEl.textContent = t("hm_report_approved_ok");
          const ta = document.getElementById(`teacher-fb-draft-${submissionId}`);
          const fb = data?.submission?.teacher_feedback;
          if (ta && fb) ta.value = String(fb);
          return refresh();
        })
        .catch((err) => {
          statusEl.textContent = (err && err.message) || t("hm_report_failed");
          approveBtn.disabled = false;
        });
    });

    await refresh();
  }

  global.EAP_mountHomeworkAiReportPanel = mountHomeworkAiReportPanel;
})(typeof window !== "undefined" ? window : globalThis);
