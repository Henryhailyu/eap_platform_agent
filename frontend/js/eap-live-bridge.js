/**
 * K6 — in-lesson activity bridge for live HTML pages (student iframe).
 */
(function (global) {
  const ctx = global.EAP_LIVE_CTX || {};
  const API_BASE = String(ctx.apiBase || global.location.origin || "").replace(/\/$/, "");
  const SESSION = String(ctx.sessionCode || "").trim().toUpperCase();
  const PAGE_ID = ctx.pageId;

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
        const targetSel = btn.getAttribute("data-eap-target");
        const target = targetSel ? root.querySelector(targetSel) : btn.nextElementSibling;
        if (target) {
          target.classList.add("eap-revealed");
          target.hidden = false;
          target.style.display = "";
        }
        btn.classList.add("eap-reveal--done");
        btn.disabled = true;
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

  function boot() {
    wireRevealButtons(document);
    wireActivities(document);
    wireLiveLaunchToParent(document);
    document.querySelectorAll(".eap-reveal-target, [data-eap-answer-block]").forEach((el) => {
      if (!el.classList.contains("eap-revealed")) {
        el.hidden = true;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
