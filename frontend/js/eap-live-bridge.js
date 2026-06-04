/**
 * K6 + LP-M4 — in-lesson activity bridge; teacher reveal/segment sync to students (long-poll).
 */
(function (global) {
  const ctx = global.EAP_LIVE_CTX || {};
  const API_BASE = String(ctx.apiBase || global.location.origin || "").replace(/\/$/, "");
  const SESSION = String(ctx.sessionCode || "").trim().toUpperCase();
  const PAGE_ID = ctx.pageId;
  const IS_TEACHER = String(ctx.role || "").toLowerCase() === "teacher";

  let lessonSyncVersion = 0;
  let lessonSyncPollAbort = null;
  let lessonSyncPolling = false;

  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  function injectSyncStyles() {
    if (document.getElementById("eap-lesson-sync-style")) return;
    const style = document.createElement("style");
    style.id = "eap-lesson-sync-style";
    style.textContent = `
      .eap-lesson-segment--dimmed { opacity: 0.38; pointer-events: none; filter: grayscale(0.15); }
      .eap-reveal--synced { opacity: 0.85; }
    `;
    document.head.appendChild(style);
  }

  function teamId() {
    try {
      const id = sessionStorage.getItem("eap_live_team_id");
      return id && /^[ABCD]$/.test(id) ? id : "";
    } catch (_) {
      return "";
    }
  }

  function authHeaders(extra) {
    if (typeof global.EAP_getAuthHeaders === "function") {
      return global.EAP_getAuthHeaders(extra);
    }
    return extra && typeof extra === "object" ? { ...extra } : {};
  }

  function applyRevealTarget(root, targetSel) {
    if (!targetSel) return;
    const target = targetSel.startsWith("#") || targetSel.startsWith(".")
      ? root.querySelector(targetSel)
      : root.querySelector(`#${targetSel}`) || root.querySelector(`[data-eap-target="${targetSel}"]`);
    if (target) {
      target.classList.add("eap-revealed");
      target.hidden = false;
      target.style.display = "";
    }
    root.querySelectorAll(`.eap-reveal[data-eap-target="${targetSel}"], .eap-reveal[data-eap-target='#${targetSel.replace(/^#/, "")}']`).forEach((btn) => {
      btn.classList.add("eap-reveal--done", "eap-reveal--synced");
      btn.disabled = true;
    });
  }

  function applyActiveSegment(root, segmentIndex) {
    const blocks = root.querySelectorAll("[data-eap-live-segment]");
    if (!blocks.length) return;
    if (segmentIndex == null || Number.isNaN(Number(segmentIndex))) {
      blocks.forEach((el) => {
        const row = el.closest("section") || el.closest(".eap-segment") || el;
        row.classList.remove("eap-lesson-segment--dimmed");
      });
      return;
    }
    const n = Number(segmentIndex);
    blocks.forEach((el) => {
      const seg = parseInt(el.getAttribute("data-eap-live-segment"), 10);
      const row = el.closest("section") || el.closest(".eap-segment") || el;
      if (!Number.isNaN(seg) && seg === n) {
        row.classList.remove("eap-lesson-segment--dimmed");
      } else {
        row.classList.add("eap-lesson-segment--dimmed");
      }
    });
  }

  function applyLessonSyncState(state) {
    if (!state || typeof state !== "object") return;
    const root = document;
    (state.reveals || []).forEach((targetSel) => applyRevealTarget(root, targetSel));
    if ("active_segment" in state) {
      applyActiveSegment(root, state.active_segment);
    }
  }

  async function pushLessonSyncPatch(patch) {
    if (!SESSION || !IS_TEACHER) return null;
    try {
      const response = await fetch(
        `${API_BASE}/api/teacher/live/sessions/${encodeURIComponent(SESSION)}/lesson-sync`,
        {
          method: "POST",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ patch }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      if (data.lesson_sync) {
        lessonSyncVersion = Number(data.lesson_sync.version) || lessonSyncVersion;
        applyLessonSyncState(data.lesson_sync.state);
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  async function submitActivity(activityId, answerText, answerIndex, startedAt) {
    if (!SESSION || !PAGE_ID || !activityId) return;
    const durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    const body = {
      page_id: PAGE_ID,
      activity_id: activityId,
      answer_text: String(answerText || ""),
      duration_ms: durationMs,
      team_id: teamId(),
    };
    if (answerIndex != null && !Number.isNaN(Number(answerIndex))) {
      body.answer_index = Number(answerIndex);
    }
    try {
      await fetch(`${API_BASE}/api/student/live/join/${encodeURIComponent(SESSION)}/activity-respond`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    } catch (_) {
      /* ignore network errors in demo */
    }
  }

  function wireRevealButtons(root) {
    root.querySelectorAll(".eap-reveal, [data-eap-reveal]").forEach((btn) => {
      if (btn.dataset.eapBound === "1") return;
      btn.dataset.eapBound = "1";
      btn.addEventListener("click", () => {
        const targetSel = btn.getAttribute("data-eap-target") || "";
        const target = targetSel ? root.querySelector(targetSel) : btn.nextElementSibling;
        if (target) {
          target.classList.add("eap-revealed");
          target.hidden = false;
          target.style.display = "";
        }
        btn.classList.add("eap-reveal--done");
        btn.disabled = true;
        if (IS_TEACHER && targetSel) {
          void pushLessonSyncPatch({ reveal: targetSel });
        }
      });
    });
  }

  function wireActivities(root) {
    root.querySelectorAll(".eap-activity, [data-eap-id]").forEach((block) => {
      if (block.dataset.eapBound === "1") return;
      const activityId = block.getAttribute("data-eap-id") || block.id;
      if (!activityId) return;
      block.dataset.eapBound = "1";
      const type = (block.getAttribute("data-eap-type") || "text").toLowerCase();
      const startedAt = Date.now();

      if (type === "mcq") {
        const opts = block.querySelectorAll("[data-eap-option]");
        const pickOpts =
          opts.length > 0
            ? opts
            : block.querySelectorAll(
                "button:not(.eap-reveal):not(.eap-submit), .eap-option, [role='radio'], label.eap-option",
              );
        pickOpts.forEach((opt, idx) => {
          opt.addEventListener("click", () => {
            pickOpts.forEach((o) => {
              o.classList.remove("eap-selected");
              if (o.disabled !== undefined) o.disabled = true;
            });
            opt.classList.add("eap-selected");
            const label = opt.getAttribute("data-eap-option") || opt.textContent || "";
            void submitActivity(activityId, label.trim(), idx, startedAt);
          });
        });
        return;
      }

      const submitBtn = block.querySelector(".eap-submit, [data-eap-submit]");
      if (submitBtn) {
        submitBtn.addEventListener("click", () => {
          const input = block.querySelector("input, textarea, select");
          const val = input ? input.value : "";
          void submitActivity(activityId, val, null, startedAt);
          submitBtn.disabled = true;
        });
      }
    });
  }

  function wireLiveLaunchToParent(root) {
    if (!root || !global.parent || global.parent === global) return;
    root.querySelectorAll("[data-eap-live-tool]").forEach((block) => {
      const tool = (block.getAttribute("data-eap-live-tool") || "").trim().toLowerCase();
      const slotId = block.getAttribute("data-eap-live-id") || block.getAttribute("data-eap-id") || "";
      const targets = block.querySelectorAll(".eap-live-launch, [data-eap-live-launch]");
      targets.forEach((btn) => {
        if (btn.dataset.eapLiveBound === "1") return;
        btn.dataset.eapLiveBound = "1";
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          try {
            global.parent.postMessage(
              {
                type: "eap-live-pick",
                tool,
                slotId,
                gameId: block.getAttribute("data-eap-live-game") || "",
              },
              "*",
            );
          } catch (_) {
            /* ignore */
          }
        });
      });
    });
  }

  function stopLessonSyncPoll() {
    lessonSyncPolling = false;
    if (lessonSyncPollAbort) {
      lessonSyncPollAbort.abort();
      lessonSyncPollAbort = null;
    }
  }

  async function startLessonSyncPoll() {
    if (!SESSION || IS_TEACHER || lessonSyncPolling) return;
    stopLessonSyncPoll();
    lessonSyncPolling = true;
    const waitSec = 25;

    while (lessonSyncPolling) {
      const controller = new AbortController();
      lessonSyncPollAbort = controller;
      try {
        const qs = new URLSearchParams({
          since_version: String(lessonSyncVersion),
          timeout: String(waitSec),
        });
        const response = await fetch(
          `${API_BASE}/api/student/live/join/${encodeURIComponent(SESSION)}/wait-lesson-sync?${qs}`,
          { credentials: "include", headers: authHeaders(), signal: controller.signal },
        );
        const data = await response.json().catch(() => ({}));
        if (data.lesson_sync) {
          const ver = Number(data.lesson_sync.version) || 0;
          if (ver !== lessonSyncVersion) {
            lessonSyncVersion = ver;
            applyLessonSyncState(data.lesson_sync.state);
          }
        }
      } catch (err) {
        if (err && err.name === "AbortError") break;
        await new Promise((r) => global.setTimeout(r, 4000));
      } finally {
        if (lessonSyncPollAbort === controller) lessonSyncPollAbort = null;
      }
    }
  }

  function onParentMessage(ev) {
    const data = ev && ev.data;
    if (!data || data.type !== "eap-lesson-sync") return;
    const sync = data.lesson_sync;
    if (!sync) return;
    const ver = Number(sync.version) || 0;
    if (ver >= lessonSyncVersion) {
      lessonSyncVersion = ver;
      applyLessonSyncState(sync.state);
    }
  }

  function boot() {
    injectSyncStyles();
    wireRevealButtons(document);
    wireActivities(document);
    wireLiveLaunchToParent(document);
    document.querySelectorAll(".eap-reveal-target, [data-eap-answer-block]").forEach((el) => {
      if (!el.classList.contains("eap-revealed")) {
        el.hidden = true;
      }
    });
    if (!IS_TEACHER) {
      global.addEventListener("message", onParentMessage);
      void startLessonSyncPoll();
    }
  }

  global.EAP_applyLessonSyncState = applyLessonSyncState;
  global.EAP_pushLessonSyncPatch = pushLessonSyncPatch;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
