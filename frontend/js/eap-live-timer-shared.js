/**
 * Shared timer display payload + clock formatting (teacher push / student sync).
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

  function buildTimerDisplayPayload(state) {
    const s = state || {};
    const kind = s.kind === "stopwatch" ? "stopwatch" : "countdown";
    return {
      mode: "timer",
      title: String(s.title || "").trim(),
      timer: {
        kind,
        running: !!s.running,
        done: !!s.done,
        remaining_sec: Math.max(0, Math.min(MAX_TOTAL_SEC, Math.floor(s.remaining_sec || 0))),
        duration_sec: Math.max(0, Math.min(MAX_TOTAL_SEC, Math.floor(s.duration_sec || 0))),
        elapsed_sec: Math.max(0, Math.min(MAX_TOTAL_SEC, Math.floor(s.elapsed_sec || 0))),
        synced_at: s.synced_at || new Date().toISOString(),
      },
    };
  }

  function parseSyncedAtMs(syncedAt) {
    if (!syncedAt) return Date.now();
    const ms = Date.parse(String(syncedAt));
    return Number.isFinite(ms) ? ms : Date.now();
  }

  /** Interpolate seconds to show between server pushes. */
  function liveTimerSeconds(timer, nowMs) {
    const t = timer || {};
    const baseMs = parseSyncedAtMs(t.synced_at);
    const delta = Math.max(0, (nowMs || Date.now()) - baseMs) / 1000;
    if (t.kind === "stopwatch") {
      let sec = Math.floor(t.elapsed_sec || 0);
      if (t.running) sec += Math.floor(delta);
      return Math.min(MAX_TOTAL_SEC, sec);
    }
    let sec = Math.floor(t.remaining_sec || 0);
    if (t.running && !t.done) sec = Math.max(0, sec - Math.floor(delta));
    return sec;
  }

  function playTimerBell3s() {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return;
    let ctx;
    try {
      ctx = new Ctx();
    } catch (_) {
      return;
    }
    const resume = ctx.resume && ctx.resume();
    const play = () => {
      const now = ctx.currentTime;
      const pattern = [
        { t: 0, f: 880, d: 0.12 },
        { t: 0.2, f: 0, d: 0.08 },
        { t: 0.35, f: 988, d: 0.12 },
        { t: 0.55, f: 0, d: 0.08 },
        { t: 0.7, f: 1175, d: 0.18 },
        { t: 1.1, f: 0, d: 0.15 },
        { t: 1.4, f: 880, d: 0.25 },
        { t: 1.85, f: 0, d: 0.2 },
        { t: 2.1, f: 988, d: 0.35 },
      ];
      pattern.forEach((hit) => {
        if (!hit.f) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = hit.f;
        gain.gain.setValueAtTime(0.0001, now + hit.t);
        gain.gain.exponentialRampToValueAtTime(0.35, now + hit.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + hit.t + hit.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + hit.t);
        osc.stop(now + hit.t + hit.d + 0.05);
      });
      global.setTimeout(() => {
        try {
          ctx.close();
        } catch (_) {
          /* ignore */
        }
      }, 3200);
    };
    if (resume && typeof resume.then === "function") {
      resume.then(play).catch(play);
    } else {
      play();
    }
  }

  global.EAP_LIVE_TIMER_SHARED = {
    MAX_TOTAL_SEC,
    formatClock,
    buildTimerDisplayPayload,
    liveTimerSeconds,
    playTimerBell3s,
  };
})(typeof window !== "undefined" ? window : globalThis);
