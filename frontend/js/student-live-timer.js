/**
 * Student Live — synced classroom timer + 3s bell when countdown ends.
 */
(function (global) {
  const shared = () => global.EAP_LIVE_TIMER_SHARED || {};

  function mount(container, timer, opts) {
    const t = (opts && opts.t) || ((k) => k);
    const escapeHtml =
      (opts && opts.escapeHtml) ||
      ((x) =>
        String(x == null ? "" : x)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"));

    let lastDone = !!(timer && timer.done);
    let localTickId = null;
    let currentTimer = timer ? { ...timer } : null;

    function stopLocalTick() {
      if (localTickId != null) {
        global.clearInterval(localTickId);
        localTickId = null;
      }
    }

    function unmount() {
      stopLocalTick();
    }

    function render() {
      if (!currentTimer) return;
      const sh = shared();
      const sec = sh.liveTimerSeconds ? sh.liveTimerSeconds(currentTimer) : 0;
      const clock = sh.formatClock ? sh.formatClock(sec) : String(sec);
      const displayEl = container.querySelector("[data-slive-timer-display]");
      const statusEl = container.querySelector("[data-slive-timer-status]");
      const labelEl = container.querySelector("[data-slive-timer-label]");
      if (labelEl) {
        labelEl.textContent =
          currentTimer.kind === "stopwatch"
            ? t("tlive_timer_mode_stopwatch")
            : t("tlive_timer_mode_countdown");
      }
      if (displayEl) {
        displayEl.textContent = clock;
        displayEl.classList.toggle("slive-timer-display--done", !!currentTimer.done);
      }
      if (statusEl) {
        if (currentTimer.done) {
          statusEl.textContent = t("slive_timer_done");
          statusEl.className = "slive-timer-status slive-timer-status--done";
        } else if (currentTimer.running) {
          statusEl.textContent =
            currentTimer.kind === "stopwatch"
              ? t("tlive_stopwatch_running")
              : t("tlive_timer_running");
          statusEl.className = "slive-timer-status slive-timer-status--running";
        } else {
          statusEl.textContent = t("slive_timer_paused");
          statusEl.className = "slive-timer-status";
        }
      }

      const shouldBell =
        currentTimer.kind === "countdown" &&
        !!currentTimer.done &&
        !lastDone;
      if (shouldBell && sh.playTimerBell3s) {
        sh.playTimerBell3s();
      }
      lastDone = !!currentTimer.done;

      const hintSound = container.querySelector("[data-slive-timer-sound-hint]");
      if (hintSound) {
        const needUnlock = sh.isTimerAudioUnlocked && !sh.isTimerAudioUnlocked();
        const showHint =
          needUnlock &&
          currentTimer.kind === "countdown" &&
          (currentTimer.running || currentTimer.done);
        hintSound.classList.toggle("hidden", !showHint);
      }

      if (
        currentTimer.kind === "countdown" &&
        currentTimer.running &&
        !currentTimer.done &&
        sec <= 0
      ) {
        currentTimer = { ...currentTimer, done: true, running: false, remaining_sec: 0 };
        render();
      }
    }

    function updateTimer(next) {
      if (next && !next.done) lastDone = false;
      currentTimer = next ? { ...next } : null;
      stopLocalTick();
      if (!currentTimer) {
        container.innerHTML = "";
        return;
      }
      render();
      localTickId = global.setInterval(render, 250);
    }

    container.className = "slive-timer";
    container.innerHTML = `
      <p class="slive-timer__lead">${escapeHtml(t("slive_timer_sync_lead"))}</p>
      <p class="slive-timer__label" data-slive-timer-label></p>
      <div class="slive-timer-display" data-slive-timer-display aria-live="polite">00:00</div>
      <p class="slive-timer-status" data-slive-timer-status></p>
      <p class="slive-timer-sound-hint hidden" data-slive-timer-sound-hint></p>
    `;

    const hintEl = container.querySelector("[data-slive-timer-sound-hint]");
    if (hintEl) {
      hintEl.textContent = t("slive_timer_sound_hint");
    }

    updateTimer(timer);

    return { unmount, update: updateTimer };
  }

  global.EAP_STUDENT_LIVE_TIMER = { mount };
})(typeof window !== "undefined" ? window : globalThis);
