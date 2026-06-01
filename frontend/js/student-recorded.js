/**
 * Phase N4 — Student recorded lesson viewer: calendar month view.
 * Recordings are grouped by calendar date; the user can navigate months.
 */
(function (global) {
  const PAGE = "student-recorded";
  const api = () => global.EAP_RECORDED_LESSONS;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function resolveClassName() {
    const fromUrl =
      new URLSearchParams(global.location.search).get("class_name") ||
      new URLSearchParams(global.location.search).get("class") || "";
    if (fromUrl.trim()) return fromUrl.trim();
    if (typeof global.getLoggedInUser === "function") {
      const u = global.getLoggedInUser();
      const c = (u && (u.class_name || u.className)) || "";
      if (c) return String(c).trim();
    }
    return "EAP047";
  }

  function formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  const AUDIO_EXTS = new Set(["mp3", "m4a", "aac", "wav", "ogg"]);
  function isAudio(lesson) {
    const ext = String(lesson.file_ext || "").toLowerCase();
    if (ext && AUDIO_EXTS.has(ext)) return true;
    const name = String(lesson.file_name || lesson.title || "").toLowerCase();
    for (const e of AUDIO_EXTS) { if (name.endsWith("." + e)) return true; }
    return false;
  }

  function showError(msg) {
    const el = document.getElementById("srec-error");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  // ── State ────────────────────────────────────────────────────────────────
  let allLessons = [];
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth(); // 0-based

  function monthISO() {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  }

  function monthLabel() {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(
      typeof global.eapLocale === "function" ? global.eapLocale() : "en",
      { year: "numeric", month: "long" }
    );
  }

  /** Best date string for a lesson: task date, then upload time, then "". */
  function lessonDate(lesson) {
    const pick = (raw) => {
      const s = raw != null ? String(raw).trim() : "";
      if (!s) return "";
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : "";
    };
    return (
      pick(lesson.calendar_task_date) ||
      pick(lesson.created_at) ||
      pick(lesson.updated_at)
    );
  }

  /** Group lessons that belong to the current viewMonth by date. */
  function lessonsForMonth() {
    const prefix = monthISO();
    const byDate = {};
    const undated = [];
    allLessons.forEach((lesson) => {
      const dateStr = lessonDate(lesson);
      if (!dateStr) {
        undated.push(lesson);
        return;
      }
      if (!dateStr.startsWith(prefix)) return;
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(lesson);
    });
    if (undated.length) byDate._undated = undated;
    return byDate;
  }

  function formatDate(iso) {
    if (!iso || iso.length < 10) return t("srec_no_date");
    const d = new Date(`${iso}T12:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(
      typeof global.eapLocale === "function" ? global.eapLocale() : "en",
      { weekday: "short", year: "numeric", month: "short", day: "numeric" }
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function buildLessonCard(lesson) {
    const card = document.createElement("div");
    card.className = "srec-lesson-card";

    const typeIcon = isAudio(lesson) ? "🎵" : "🎬";
    const header = document.createElement("div");
    header.className = "srec-lesson-card__header";

    const icon = document.createElement("span");
    icon.className = "srec-lesson-card__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = typeIcon;

    const info = document.createElement("div");
    info.className = "srec-lesson-card__info";

    const titleEl = document.createElement("p");
    titleEl.className = "srec-lesson-card__title";
    titleEl.textContent = lesson.title || (isAudio(lesson) ? "Audio recording" : "Video recording");

    const meta = document.createElement("p");
    meta.className = "srec-lesson-card__meta";
    meta.textContent = [lesson.file_name, formatBytes(lesson.file_size_bytes)]
      .filter(Boolean).join(" · ");

    info.appendChild(titleEl);
    info.appendChild(meta);
    header.appendChild(icon);
    header.appendChild(info);
    card.appendChild(header);

    // Inline player
    if (api() && lesson.id != null) {
      const playerWrap = document.createElement("div");
      playerWrap.className = "srec-lesson-card__player";
      if (isAudio(lesson)) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.src = api().studentStreamUrl(lesson.id);
        audio.addEventListener("contextmenu", (e) => e.preventDefault());
        playerWrap.appendChild(audio);
      } else {
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("controlsList", "nodownload");
        video.src = api().studentStreamUrl(lesson.id);
        video.addEventListener("contextmenu", (e) => e.preventDefault());
        playerWrap.appendChild(video);
      }
      card.appendChild(playerWrap);

      // Full-screen button → player.html
      const actions = document.createElement("div");
      actions.className = "srec-lesson-card__actions";
      const fsBtn = document.createElement("a");
      fsBtn.className = "btn-secondary srec-lesson-card__fs-btn";
      fsBtn.href = `player.html?id=${lesson.id}&role=student&title=${encodeURIComponent(lesson.title || "")}`;
      fsBtn.target = "_blank";
      fsBtn.rel = "noopener noreferrer";
      fsBtn.textContent = t("srec_open_player");
      actions.appendChild(fsBtn);
      card.appendChild(actions);
    }

    return card;
  }

  function renderMonth() {
    const listEl = document.getElementById("srec-list");
    const emptyEl = document.getElementById("srec-empty");
    const monthLabelEl = document.getElementById("srec-month-label");
    if (!listEl) return;

    if (monthLabelEl) monthLabelEl.textContent = monthLabel();
    listEl.innerHTML = "";

    const byDate = lessonsForMonth();
    const undated = byDate._undated || [];
    delete byDate._undated;
    const dates = Object.keys(byDate).sort().reverse(); // newest first

    if (!dates.length && !undated.length) {
      if (emptyEl) {
        emptyEl.textContent = t("srec_empty_month");
        emptyEl.classList.remove("hidden");
      }
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    if (!dates.length && undated.length && emptyEl) {
      emptyEl.textContent = t("srec_other_month_hint");
      emptyEl.classList.remove("hidden");
    }

    dates.forEach((dateStr) => {
      const lessons = byDate[dateStr];
      const group = document.createElement("div");
      group.className = "srec-date-group";

      const summary = document.createElement("details");
      summary.className = "srec-date-details";
      summary.open = true; // expanded by default

      const sumEl = document.createElement("summary");
      sumEl.className = "srec-date-details__summary";

      const dateLabel = document.createElement("span");
      dateLabel.className = "srec-date-details__date";
      dateLabel.textContent = formatDate(dateStr);

      const countBadge = document.createElement("span");
      countBadge.className = "srec-date-details__count";
      countBadge.textContent = `${lessons.length} ${t("srec_date_group_toggle")}`;

      sumEl.appendChild(dateLabel);
      sumEl.appendChild(countBadge);
      summary.appendChild(sumEl);

      const body = document.createElement("div");
      body.className = "srec-date-details__body";

      lessons.forEach((lesson) => {
        body.appendChild(buildLessonCard(lesson));
      });

      summary.appendChild(body);
      group.appendChild(summary);
      listEl.appendChild(group);
    });

    if (undated.length) {
      const group = document.createElement("div");
      group.className = "srec-date-group srec-date-group--undated";
      const summary = document.createElement("details");
      summary.className = "srec-date-details";
      summary.open = true;
      const sumEl = document.createElement("summary");
      sumEl.className = "srec-date-details__summary";
      const dateLabel = document.createElement("span");
      dateLabel.className = "srec-date-details__date";
      dateLabel.textContent = t("srec_no_date");
      sumEl.appendChild(dateLabel);
      const body = document.createElement("div");
      body.className = "srec-date-details__body";
      undated.forEach((lesson) => body.appendChild(buildLessonCard(lesson)));
      summary.appendChild(sumEl);
      summary.appendChild(body);
      group.appendChild(summary);
      listEl.appendChild(group);
    }
  }

  function bindMonthNav() {
    const prevBtn = document.getElementById("srec-prev-month");
    const nextBtn = document.getElementById("srec-next-month");
    if (prevBtn && prevBtn.dataset.eapBound !== "1") {
      prevBtn.dataset.eapBound = "1";
      prevBtn.addEventListener("click", () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderMonth();
        updateNavButtons();
      });
    }
    if (nextBtn && nextBtn.dataset.eapBound !== "1") {
      nextBtn.dataset.eapBound = "1";
      nextBtn.addEventListener("click", () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        renderMonth();
        updateNavButtons();
      });
    }
  }

  function updateNavButtons() {
    const nextBtn = document.getElementById("srec-next-month");
    if (!nextBtn) return;
    const now = new Date();
    const isCurrentOrFuture =
      viewYear > now.getFullYear() ||
      (viewYear === now.getFullYear() && viewMonth >= now.getMonth());
    nextBtn.disabled = isCurrentOrFuture;
  }

  async function loadAndRender() {
    const className = resolveClassName();
    showError("");
    try {
      const data = await api().listPublishedForStudent(className);
      allLessons = (data.lessons || []).filter((l) => l && l.id != null);
      if (allLessons.length) {
        const months = allLessons
          .map((l) => lessonDate(l).slice(0, 7))
          .filter(Boolean)
          .sort();
        if (months.length) {
          const [y, m] = months[months.length - 1].split("-").map(Number);
          viewYear = y;
          viewMonth = m - 1;
        }
      }
    } catch (err) {
      showError((err && err.message) || t("srec_load_failed"));
      allLessons = [];
    }
    renderMonth();
    updateNavButtons();
  }

  async function bootPage() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (typeof global.redirectFilePageToHostedUi === "function" && global.redirectFilePageToHostedUi()) return;
    if (typeof global.validateSatelliteSessionOrGate !== "function") return;
    const user = await global.validateSatelliteSessionOrGate("student");
    if (!user) return;
    if (typeof global.initAppPageHeader === "function") global.initAppPageHeader();
    if (typeof global.initStudentRecordedNavLink === "function") global.initStudentRecordedNavLink();

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && logoutBtn.dataset.eapBound !== "1") {
      logoutBtn.dataset.eapBound = "1";
      logoutBtn.addEventListener("click", () => {
        if (typeof global.logoutAndGoHome === "function") global.logoutAndGoHome();
        else global.location.href = "index.html";
      });
    }

    bindMonthNav();
    await loadAndRender();
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void bootPage(); });
  } else {
    void bootPage();
  }
})(typeof window !== "undefined" ? window : globalThis);
