/**
 * Manager centre — teacher and student performance modals.
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

  function flagLabel(code, prefix) {
    const key = `${prefix || "admin_perf_flag_"}${code}`;
    const label = t(key);
    return label === key ? code : label;
  }

  function renderStudentPerformance(container, data) {
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
  }

  function renderTeacherPerformance(container, data) {
    if (!container || !data) return;
    const profile = data.profile || {};
    const hw = data.homework || {};
    const activity = data.teaching_activity || {};
    const flags = Array.isArray(data.risk_flags) ? data.risk_flags : [];
    const classes =
      Array.isArray(profile.assigned_classes) && profile.assigned_classes.length
        ? profile.assigned_classes.join(", ")
        : "—";
    const avgHours =
      hw.avg_feedback_hours != null ? `${hw.avg_feedback_hours}h` : t("admin_teacher_perf_na");

    const perClassRows = Array.isArray(hw.per_class) ? hw.per_class : [];
    const classTable =
      perClassRows.length > 0
        ? `<div class="admin-table-wrap admin-perf-class-table">
            <table class="admin-table admin-roster-sheet">
              <thead>
                <tr>
                  <th>${escapeHtml(t("class_label"))}</th>
                  <th>${escapeHtml(t("admin_teacher_perf_col_submissions"))}</th>
                  <th>${escapeHtml(t("admin_teacher_perf_col_feedback"))}</th>
                  <th>${escapeHtml(t("admin_teacher_perf_col_pending"))}</th>
                  <th>${escapeHtml(t("admin_teacher_perf_col_lag"))}</th>
                </tr>
              </thead>
              <tbody>
                ${perClassRows
                  .map(
                    (row) => `<tr>
                      <td>${escapeHtml(row.class_name || "—")}</td>
                      <td>${escapeHtml(String(row.total_submissions ?? 0))}</td>
                      <td>${escapeHtml(String(row.feedback_given_by_teacher ?? 0))}</td>
                      <td>${escapeHtml(String(row.pending_feedback_count ?? 0))}</td>
                      <td>${escapeHtml(String(row.lag_3d_count ?? 0))}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
        : `<p class="admin-panel__hint">${escapeHtml(t("admin_teacher_perf_no_classes"))}</p>`;

    container.innerHTML = `
      <p class="admin-panel__hint">
        <strong>${escapeHtml(profile.full_name || profile.username || "")}</strong>
        · ${escapeHtml(profile.employee_id || "")}
        · ${escapeHtml(classes)}
      </p>
      <div class="admin-perf-cards">
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_feedback_rate"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(hw.feedback_rate ?? 0))}%</p>
          <p class="admin-perf-card__sub">${escapeHtml(
            t("admin_teacher_perf_feedback_sub", {
              given: hw.feedback_given_by_teacher ?? 0,
              total: hw.total_submissions ?? 0,
            }),
          )}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_pending"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(hw.pending_feedback_count ?? 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_teacher_perf_pending_sub"))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_lag"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(hw.lag_3d_count ?? 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_teacher_perf_lag_sub"))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_avg_response"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(avgHours)}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_teacher_perf_avg_response_sub"))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_pages"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(activity.published_teaching_pages ?? 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(t("admin_teacher_perf_pages_sub"))}</p>
        </div>
        <div class="admin-perf-card">
          <p class="admin-perf-card__title">${escapeHtml(t("admin_teacher_perf_live"))}</p>
          <p class="admin-perf-card__value">${escapeHtml(String(activity.live_sessions ?? 0))}</p>
          <p class="admin-perf-card__sub">${escapeHtml(
            t("admin_teacher_perf_recorded_sub", { n: activity.recorded_lessons ?? 0 }),
          )}</p>
        </div>
      </div>
      <h3 class="section-heading section-heading--nested">${escapeHtml(t("admin_teacher_perf_by_class"))}</h3>
      ${classTable}
      ${
        flags.length
          ? `<div class="admin-perf-flags">${flags
              .map(
                (f) =>
                  `<span class="admin-perf-flag${f.level === "info" ? " admin-perf-flag--info" : ""}">${escapeHtml(flagLabel(f.code, "admin_teacher_perf_flag_"))}</span>`,
              )
              .join("")}</div>`
          : ""
      }
      <p class="admin-panel__hint admin-teacher-perf-note">${escapeHtml(t("admin_teacher_perf_attribution_note"))}</p>
    `;
  }

  const modalState = {
    modal: null,
    titleEl: null,
    bodyEl: null,
    statusEl: null,
  };

  function bindModal() {
    modalState.modal = document.getElementById("admin-perf-modal");
    modalState.titleEl = document.getElementById("admin-perf-modal-title");
    modalState.bodyEl = document.getElementById("admin-perf-modal-body");
    modalState.statusEl = document.getElementById("admin-perf-modal-status");
    if (!modalState.modal) return;

    modalState.modal.querySelectorAll("[data-admin-perf-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modalState.modal && !modalState.modal.classList.contains("hidden")) {
        closeModal();
      }
    });
  }

  function openModal(title) {
    if (!modalState.modal) return;
    if (modalState.titleEl) modalState.titleEl.textContent = title || "";
    if (modalState.bodyEl) modalState.bodyEl.innerHTML = "";
    setStatus(modalState.statusEl, "", false);
    modalState.modal.classList.remove("hidden");
    modalState.modal.hidden = false;
    document.body.classList.add("admin-perf-modal-open");
  }

  function closeModal() {
    if (!modalState.modal) return;
    modalState.modal.classList.add("hidden");
    modalState.modal.hidden = true;
    document.body.classList.remove("admin-perf-modal-open");
  }

  async function openTeacherModal(teacher, btn) {
    if (!teacher || teacher.id == null) return;
    const label = teacher.full_name || teacher.username || String(teacher.id);
    openModal(t("admin_teacher_perf_title", { name: label }));
    if (modalState.bodyEl) {
      modalState.bodyEl.innerHTML = `<p class="admin-panel__hint">${escapeHtml(t("admin_perf_loading"))}</p>`;
    }
    if (btn) btn.disabled = true;
    try {
      const res = await global.apiGet(`/api/admin/performance/teacher?teacher_id=${encodeURIComponent(teacher.id)}`);
      if (modalState.bodyEl) {
        modalState.bodyEl.innerHTML = "";
        renderTeacherPerformance(modalState.bodyEl, res.performance);
      }
    } catch (err) {
      setStatus(modalState.statusEl, err.message || t("admin_perf_not_found"), true);
      if (modalState.bodyEl) modalState.bodyEl.innerHTML = "";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function openStudentModal(student, btn) {
    if (!student) return;
    const fullName = String(student.full_name || "").trim();
    const studentId = String(student.student_id || "").trim();
    if (!fullName || !studentId) return;
    openModal(t("admin_student_perf_title", { name: fullName }));
    if (modalState.bodyEl) {
      modalState.bodyEl.innerHTML = `<p class="admin-panel__hint">${escapeHtml(t("admin_perf_loading"))}</p>`;
    }
    if (btn) btn.disabled = true;
    try {
      const q = new URLSearchParams({ full_name: fullName, student_id: studentId });
      const res = await global.apiGet(`/api/admin/performance/student?${q.toString()}`);
      if (modalState.bodyEl) {
        modalState.bodyEl.innerHTML = "";
        renderStudentPerformance(modalState.bodyEl, res.performance);
      }
    } catch (err) {
      setStatus(modalState.statusEl, err.message || t("admin_perf_not_found"), true);
      if (modalState.bodyEl) modalState.bodyEl.innerHTML = "";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function init() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    bindModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.EAP_ADMIN_PERF = {
    openTeacherModal,
    openStudentModal,
    renderStudentPerformance,
    renderTeacherPerformance,
    closeModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
