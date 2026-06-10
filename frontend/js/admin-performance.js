/**
 * Manager centre — student performance lookup (School › Performance tab).
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

  function setStatus(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
    el.classList.toggle("form-message--error", Boolean(isError && message));
  }

  function flagLabel(code) {
    const key = `admin_perf_flag_${code}`;
    const label = t(key);
    return label === key ? code : label;
  }

  function renderPerformance(container, data) {
    if (!container || !data) return;
    const profile = data.profile || {};
    const hw = data.homework || {};
    const ss = data.self_study || {};
    const flags = Array.isArray(data.risk_flags) ? data.risk_flags : [];

    const classes =
      Array.isArray(profile.assigned_classes) && profile.assigned_classes.length
        ? profile.assigned_classes.join(", ")
        : profile.class_name || "—";

    const readingPct =
      ss.reading && ss.reading.score_percent != null ? `${ss.reading.score_percent}%` : "—";
    const listeningPct =
      ss.listening && ss.listening.score_percent != null ? `${ss.listening.score_percent}%` : "—";

    container.innerHTML = `
      <p class="admin-panel__hint">
        <strong>${escapeHtml(profile.full_name || profile.username || "")}</strong>
        · ${escapeHtml(profile.student_id || "")}
        · ${escapeHtml(classes)}
      </p>
      <div class="admin-perf-cards">
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_hw_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(hw.completion_rate ?? 0))}%</p>
          <p class="admin-perf-card__sub">${escapeHtml(
            t("admin_perf_hw_sub", {
              done: hw.completed_tasks ?? 0,
              total: hw.total_tasks ?? 0,
              submitted: hw.homework_submitted_count ?? 0,
              feedback: hw.feedback_received_count ?? 0,
            }),
          )}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_vocab_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String((ss.vocabulary && ss.vocabulary.days_completed) || 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(
            t("admin_perf_vocab_sub", { packs: (ss.vocabulary && ss.vocabulary.packs_completed) || 0 }),
          )}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_reading_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String((ss.reading && ss.reading.completed) || 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_perf_reading_sub", { pct: readingPct }))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_listening_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String((ss.listening && ss.listening.completed) || 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_perf_listening_sub", { pct: listeningPct }))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_writing_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String((ss.writing && ss.writing.sessions_completed) || 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(
            t("admin_perf_writing_sub", { submissions: (ss.writing && ss.writing.submissions) || 0 }),
          )}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_perf_speaking_title"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String((ss.speaking && ss.speaking.responses) || 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_perf_speaking_sub"))}</p>
        </div>
      </div>
      ${
        flags.length
          ? `<div class="admin-perf-flags">${flags
              .map(
                (f) =>
                  `<span class="admin-perf-flag${f.level === "info" ? " admin-perf-flag--info" : ""}">${escapeHtml(flagLabel(f.code))}</span>`,
              )
              .join("")}</div>`
          : ""
      }
    `;
    container.classList.remove("hidden");
  }

  function init() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    const form = document.getElementById("admin-perf-form");
    const statusEl = document.getElementById("admin-perf-status");
    const resultEl = document.getElementById("admin-perf-result");
    if (!form) return;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nameEl = document.getElementById("admin-perf-name");
      const idEl = document.getElementById("admin-perf-student-id");
      const fullName = (nameEl && nameEl.value ? nameEl.value : "").trim();
      const studentId = (idEl && idEl.value ? idEl.value : "").trim();
      if (!fullName || !studentId) return;

      setStatus(statusEl, "", false);
      if (resultEl) resultEl.classList.add("hidden");
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const q = new URLSearchParams({ full_name: fullName, student_id: studentId });
        const res = await global.apiGet(`/api/admin/performance/student?${q.toString()}`);
        renderPerformance(resultEl, res.performance);
      } catch (err) {
        setStatus(statusEl, err.message || t("admin_perf_not_found"), true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
