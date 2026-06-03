/**
 * HM-M1b — Teacher AI homework report panel on submission review.
 */
(function (global) {
  function resolveApiBase() {
    if (global.EAP_API_BASE_RESOLVED) {
      return String(global.EAP_API_BASE_RESOLVED).replace(/\/$/, "");
    }
    const custom = global.EAP_API_BASE;
    if (custom != null && String(custom).trim() !== "") {
      return String(custom).trim().replace(/\/$/, "");
    }
    if (
      global.location &&
      global.location.protocol &&
      /^https?:$/i.test(global.location.protocol)
    ) {
      return global.location.origin.replace(/\/$/, "");
    }
    return "http://127.0.0.1:5051";
  }

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function apiFetch(path, options) {
    const base = resolveApiBase();
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
      let fallback = response.statusText;
      if (response.status === 404) {
        const errText = String((data && data.error) || "").toLowerCase();
        fallback =
          errText.includes("not found") && !errText.includes("route")
            ? t("hm_report_submission_missing")
            : t("hm_report_route_missing");
      }
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
    const sid = encodeURIComponent(String(submissionId).trim());

    const section = document.createElement("div");
    section.className = "hm-report-panel";

    const title = document.createElement("h5");
    title.className = "task-submission-section__title";
    title.textContent = t("hm_report_title");

    const statusEl = document.createElement("div");
    statusEl.className = "hm-report-panel__status";
    statusEl.setAttribute("role", "status");
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

    let pollTimer = null;
    let successFlashTimer = null;

    function clearPoll() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function setVisualState(mode, message) {
      statusEl.className = "hm-report-panel__status";
      if (mode) statusEl.classList.add(`hm-report-panel__status--${mode}`);
      statusEl.replaceChildren();
      if (mode === "loading" || mode === "generating" || mode === "pending") {
        const spinner = document.createElement("span");
        spinner.className = "hm-report-spinner";
        spinner.setAttribute("aria-hidden", "true");
        statusEl.appendChild(spinner);
      }
      if (mode === "success") {
        const icon = document.createElement("span");
        icon.className = "hm-report-success-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "✓";
        statusEl.appendChild(icon);
      }
      const text = document.createElement("span");
      text.className = "hm-report-panel__status-text";
      text.textContent = message || "";
      statusEl.appendChild(text);
    }

    function flashSuccessThen(message, onDone) {
      setVisualState("success", t("hm_report_done_flash"));
      if (successFlashTimer) clearTimeout(successFlashTimer);
      successFlashTimer = setTimeout(() => {
        successFlashTimer = null;
        if (typeof onDone === "function") onDone();
        else setVisualState("", message);
      }, 2200);
    }

    async function fetchReport() {
      const data = await apiFetch(`/api/teacher/submissions/${sid}/ai-report`);
      return data.ai_report;
    }

    async function applyReportRow(row, options) {
      const opts = options || {};
      const wasGenerating = !!opts.wasGenerating;
      if (!row) {
        clearPoll();
        setVisualState("", t("hm_report_none"));
        approveBtn.disabled = true;
        return "none";
      }
      const st = row.status || "pending";
      if (st === "pending") {
        setVisualState("pending", t("hm_report_generating_wait"));
        approveBtn.disabled = true;
        return "pending";
      }
      if (st === "failed") {
        clearPoll();
        setVisualState("error", row.error_message || t("hm_report_failed"));
        approveBtn.disabled = true;
        return "failed";
      }
      if (st === "ready" && row.report) {
        clearPoll();
        const readyMsg = row.approved_at ? t("hm_report_approved") : t("hm_report_ready");
        const showBody = () => {
          setVisualState("", readyMsg);
          renderReportBody(bodyEl, row.report);
          approveBtn.disabled = !!row.approved_at;
        };
        if (wasGenerating) {
          flashSuccessThen(readyMsg, showBody);
        } else {
          showBody();
        }
        return "ready";
      }
      clearPoll();
      setVisualState("", t("hm_report_none"));
      approveBtn.disabled = true;
      return "none";
    };

    const refresh = async (options) => {
      const opts = options || {};
      if (!opts.silent) {
        setVisualState("loading", t("hm_report_loading"));
        bodyEl.innerHTML = "";
      }
      try {
        const row = await fetchReport();
        return await applyReportRow(row, opts);
      } catch (err) {
        clearPoll();
        setVisualState("error", (err && err.message) || t("hm_report_failed"));
        approveBtn.disabled = true;
        return "error";
      }
    };

    const pollUntilSettled = async (wasGenerating) => {
      const maxAttempts = 45;
      for (let i = 0; i < maxAttempts; i += 1) {
        setVisualState("generating", t("hm_report_generating_wait"));
        genBtn.disabled = true;
        try {
          const row = await fetchReport();
          const st = row ? row.status : "none";
          if (st === "ready" || st === "failed" || !row) {
            genBtn.disabled = false;
            await applyReportRow(row, { wasGenerating: wasGenerating || st === "ready" });
            return;
          }
        } catch (err) {
          genBtn.disabled = false;
          setVisualState("error", (err && err.message) || t("hm_report_failed"));
          return;
        }
        await sleep(2000);
      }
      genBtn.disabled = false;
      setVisualState("pending", t("hm_report_still_running"));
    };

    genBtn.addEventListener("click", () => {
      clearPoll();
      genBtn.disabled = true;
      approveBtn.disabled = true;
      bodyEl.innerHTML = "";
      setVisualState("generating", t("hm_report_generating_wait"));
      void apiFetch(`/api/teacher/submissions/${sid}/ai-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .then(() => pollUntilSettled(true))
        .catch((err) => {
          setVisualState("error", (err && err.message) || t("hm_report_failed"));
          genBtn.disabled = false;
        });
    });

    approveBtn.addEventListener("click", () => {
      approveBtn.disabled = true;
      void apiFetch(`/api/teacher/submissions/${sid}/ai-report/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace" }),
      })
        .then((data) => {
          flashSuccessThen(t("hm_report_approved_ok"), () => {
            const ta = document.getElementById(`teacher-fb-draft-${submissionId}`);
            const fb = data?.submission?.teacher_feedback;
            if (ta && fb) ta.value = String(fb);
            void refresh({ silent: true });
          });
        })
        .catch((err) => {
          setVisualState("error", (err && err.message) || t("hm_report_failed"));
          approveBtn.disabled = false;
        });
    });

    const initial = await refresh();
    if (initial === "pending") {
      void pollUntilSettled(false);
    }
  }

  global.EAP_mountHomeworkAiReportPanel = mountHomeworkAiReportPanel;
})(typeof window !== "undefined" ? window : globalThis);
