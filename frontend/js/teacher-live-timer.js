/**
 * Teacher Live — Countdown timer & stopwatch (max 24 hours each).
 */
(function (global) {
  const MAX_TOTAL_SEC = 24 * 60 * 60;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatClock(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function readDurationFromInputs(root) {
    const h = Number(root.querySelector('[data-tlive-timer-hours]')?.value || 0);
    const m = Number(root.querySelector('[data-tlive-timer-minutes]')?.value || 0);
    const s = Number(root.querySelector('[data-tlive-timer-seconds]')?.value || 0);
    let total = (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
    total = Math.floor(total);
    if (total < 0) total = 0;
    if (total > MAX_TOTAL_SEC) total = MAX_TOTAL_SEC;
    return total;
  }

  function writeDurationInputs(root, totalSec) {
    const sec = Math.max(0, Math.min(MAX_TOTAL_SEC, Math.floor(totalSec)));
    const hEl = root.querySelector("[data-tlive-timer-hours]");
    const mEl = root.querySelector("[data-tlive-timer-minutes]");
    const sEl = root.querySelector("[data-tlive-timer-seconds]");
    if (hEl) hEl.value = String(Math.floor(sec / 3600));
    if (mEl) mEl.value = String(Math.floor((sec % 3600) / 60));
    if (sEl) sEl.value = String(sec % 60);
  }

  function mount(container, opts) {
    const t = (opts && opts.t) || ((k) => k);
    const escapeHtml =
      (opts && opts.escapeHtml) ||
      ((x) =>
        String(x == null ? "" : x)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"));

    let mode = "countdown";
    let tickId = null;
    let running = false;
    let countdownSetSec = 300;
    let countdownRemainSec = 300;
    let stopwatchElapsedMs = 0;
    let stopwatchStartMs = 0;
    let countdownDone = false;

    function stopTick() {
      if (tickId != null) {
        global.clearInterval(tickId);
        tickId = null;
      }
    }

    function unmount() {
      stopTick();
      running = false;
    }

    function syncControls(root) {
      const isCd = mode === "countdown";
      root.querySelectorAll("[data-tlive-timer-mode-panel]").forEach((panel) => {
        const m = panel.getAttribute("data-tlive-timer-mode-panel");
        panel.classList.toggle("hidden", m !== mode);
        panel.setAttribute("aria-hidden", m !== mode ? "true" : "false");
      });
      root.querySelectorAll("[data-tlive-timer-mode-tab]").forEach((tab) => {
        const on = tab.getAttribute("data-tlive-timer-mode-tab") === mode;
        tab.classList.toggle("tlive-timer-mode-tab--active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      });
      const cdInputs = root.querySelector(".tlive-timer-countdown-setup");
      if (cdInputs) {
        const lock = isCd && running;
        cdInputs.querySelectorAll("input").forEach((inp) => {
          inp.disabled = lock;
        });
      }
      const startBtn = root.querySelector("[data-tlive-timer-start]");
      const pauseBtn = root.querySelector("[data-tlive-timer-pause]");
      const resetBtn = root.querySelector("[data-tlive-timer-reset]");
      if (startBtn) startBtn.disabled = isCd && countdownDone;
      if (pauseBtn) pauseBtn.disabled = !running;
      if (resetBtn) resetBtn.disabled = false;
    }

    function renderDisplay(root) {
      const display = root.querySelector("[data-tlive-timer-display]");
      const status = root.querySelector("[data-tlive-timer-status]");
      if (!display) return;
      if (mode === "countdown") {
        display.textContent = formatClock(countdownRemainSec);
        display.classList.toggle("tlive-timer-display--done", countdownDone);
        if (status) {
          if (countdownDone) {
            status.textContent = t("tlive_timer_done");
            status.className = "tlive-timer-status tlive-timer-status--done";
          } else if (running) {
            status.textContent = t("tlive_timer_running");
            status.className = "tlive-timer-status tlive-timer-status--running";
          } else {
            status.textContent = t("tlive_timer_ready");
            status.className = "tlive-timer-status";
          }
        }
      } else {
        let ms = stopwatchElapsedMs;
        if (running && stopwatchStartMs) {
          ms += global.Date.now() - stopwatchStartMs;
        }
        const sec = Math.min(MAX_TOTAL_SEC, ms / 1000);
        display.textContent = formatClock(sec);
        display.classList.remove("tlive-timer-display--done");
        if (status) {
          if (running) {
            status.textContent = t("tlive_stopwatch_running");
            status.className = "tlive-timer-status tlive-timer-status--running";
          } else if (stopwatchElapsedMs > 0 || stopwatchStartMs) {
            status.textContent = t("tlive_stopwatch_paused");
            status.className = "tlive-timer-status";
          } else {
            status.textContent = t("tlive_stopwatch_ready");
            status.className = "tlive-timer-status";
          }
        }
        if (sec >= MAX_TOTAL_SEC && running) {
          stopwatchElapsedMs = MAX_TOTAL_SEC * 1000;
          stopwatchStartMs = 0;
          running = false;
          stopTick();
          if (status) {
            status.textContent = t("tlive_stopwatch_max");
            status.className = "tlive-timer-status tlive-timer-status--done";
          }
        }
      }
      syncControls(root);
    }

    function tick() {
      const root = container.querySelector(".tlive-timer-layout");
      if (!root) return;
      if (mode === "countdown" && running) {
        countdownRemainSec -= 1;
        if (countdownRemainSec <= 0) {
          countdownRemainSec = 0;
          countdownDone = true;
          running = false;
          stopTick();
        }
      }
      renderDisplay(root);
    }

    function startTimer(root) {
      if (mode === "countdown") {
        if (countdownDone) return;
        if (!running) {
          if (countdownRemainSec <= 0) {
            countdownRemainSec = countdownSetSec;
          }
          running = true;
          stopTick();
          tickId = global.setInterval(tick, 1000);
        }
      } else if (!running) {
        stopwatchStartMs = global.Date.now();
        running = true;
        stopTick();
        tickId = global.setInterval(tick, 50);
      }
      renderDisplay(root);
    }

    function pauseTimer(root) {
      if (!running) return;
      if (mode === "stopwatch" && stopwatchStartMs) {
        stopwatchElapsedMs += global.Date.now() - stopwatchStartMs;
        stopwatchStartMs = 0;
      }
      running = false;
      stopTick();
      renderDisplay(root);
    }

    function resetTimer(root) {
      stopTick();
      running = false;
      if (mode === "countdown") {
        countdownSetSec = readDurationFromInputs(root);
        if (countdownSetSec <= 0) countdownSetSec = 60;
        countdownRemainSec = countdownSetSec;
        countdownDone = false;
        writeDurationInputs(root, countdownSetSec);
      } else {
        stopwatchElapsedMs = 0;
        stopwatchStartMs = 0;
      }
      renderDisplay(root);
    }

    container.className = "tlive-canvas__inner tlive-canvas__inner--timer";
    container.innerHTML = `
      <div class="tlive-timer-layout">
        <aside class="tlive-timer-sidebar">
          <h2 class="tlive-timer-sidebar__title">${escapeHtml(t("tlive_timer_title"))}</h2>
          <p class="tlive-timer-sidebar__hint">${escapeHtml(t("tlive_timer_max_hint"))}</p>
          <div class="tlive-timer-mode-tabs" role="tablist">
            <button type="button" class="tlive-timer-mode-tab tlive-timer-mode-tab--active" data-tlive-timer-mode-tab="countdown" role="tab" aria-selected="true">${escapeHtml(t("tlive_timer_mode_countdown"))}</button>
            <button type="button" class="tlive-timer-mode-tab" data-tlive-timer-mode-tab="stopwatch" role="tab" aria-selected="false">${escapeHtml(t("tlive_timer_mode_stopwatch"))}</button>
          </div>
          <div data-tlive-timer-mode-panel="countdown" class="tlive-timer-countdown-setup">
            <p class="tlive-timer-setup-label">${escapeHtml(t("tlive_timer_set_duration"))}</p>
            <div class="tlive-timer-duration-row">
              <label><span>${escapeHtml(t("tlive_timer_hours"))}</span>
                <input type="number" min="0" max="24" step="1" value="0" data-tlive-timer-hours inputmode="numeric" /></label>
              <label><span>${escapeHtml(t("tlive_timer_minutes"))}</span>
                <input type="number" min="0" max="59" step="1" value="5" data-tlive-timer-minutes inputmode="numeric" /></label>
              <label><span>${escapeHtml(t("tlive_timer_seconds"))}</span>
                <input type="number" min="0" max="59" step="1" value="0" data-tlive-timer-seconds inputmode="numeric" /></label>
            </div>
          </div>
          <div data-tlive-timer-mode-panel="stopwatch" class="tlive-timer-stopwatch-setup hidden" aria-hidden="true">
            <p class="tlive-timer-setup-label">${escapeHtml(t("tlive_stopwatch_lead"))}</p>
          </div>
          <div class="tlive-timer-actions">
            <button type="button" class="btn-primary" data-tlive-timer-start>${escapeHtml(t("tlive_timer_start"))}</button>
            <button type="button" class="btn-secondary" data-tlive-timer-pause disabled>${escapeHtml(t("tlive_timer_pause"))}</button>
            <button type="button" class="btn-secondary" data-tlive-timer-reset>${escapeHtml(t("tlive_timer_reset"))}</button>
          </div>
        </aside>
        <div class="tlive-timer-stage">
          <p class="tlive-timer-stage__label" data-tlive-timer-stage-label>${escapeHtml(t("tlive_timer_mode_countdown"))}</p>
          <div class="tlive-timer-display" data-tlive-timer-display aria-live="polite">05:00</div>
          <p class="tlive-timer-status" data-tlive-timer-status>${escapeHtml(t("tlive_timer_ready"))}</p>
        </div>
      </div>
    `;

    const root = container.querySelector(".tlive-timer-layout");
    countdownSetSec = readDurationFromInputs(root);
    countdownRemainSec = countdownSetSec;

    root.querySelectorAll("[data-tlive-timer-mode-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (running) pauseTimer(root);
        mode = tab.getAttribute("data-tlive-timer-mode-tab") || "countdown";
        const label = root.querySelector("[data-tlive-timer-stage-label]");
        if (label) {
          label.textContent =
            mode === "countdown" ? t("tlive_timer_mode_countdown") : t("tlive_timer_mode_stopwatch");
        }
        syncControls(root);
        renderDisplay(root);
      });
    });

    root.querySelectorAll("[data-tlive-timer-hours],[data-tlive-timer-minutes],[data-tlive-timer-seconds]").forEach((inp) => {
      inp.addEventListener("change", () => {
        if (running) return;
        countdownSetSec = readDurationFromInputs(root);
        countdownRemainSec = countdownSetSec;
        countdownDone = false;
        renderDisplay(root);
      });
    });

    root.querySelector("[data-tlive-timer-start]")?.addEventListener("click", () => startTimer(root));
    root.querySelector("[data-tlive-timer-pause]")?.addEventListener("click", () => pauseTimer(root));
    root.querySelector("[data-tlive-timer-reset]")?.addEventListener("click", () => resetTimer(root));

    renderDisplay(root);

    return { unmount };
  }

  global.EAP_LIVE_TIMER = {
    MAX_TOTAL_SEC,
    formatClock,
    mount,
  };
})(typeof window !== "undefined" ? window : globalThis);
