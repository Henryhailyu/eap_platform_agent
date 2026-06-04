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

  let bellAudioCtx = null;
  let bellHtmlAudio = null;
  let bellUnlocked = false;
  let lastBellAt = 0;

  function getBellAudioContext() {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    if (!bellAudioCtx) {
      try {
        bellAudioCtx = new Ctx();
      } catch (_) {
        return null;
      }
    }
    return bellAudioCtx;
  }

  function ensureHtmlBell() {
    if (bellHtmlAudio) return bellHtmlAudio;
    try {
      bellHtmlAudio = new Audio();
      bellHtmlAudio.preload = "auto";
      bellHtmlAudio.src = makeBeepWavDataUri(880, 0.18);
    } catch (_) {
      bellHtmlAudio = null;
    }
    return bellHtmlAudio;
  }

  /** Tiny mono WAV beep (works on iOS after user gesture). */
  function makeBeepWavDataUri(freqHz, durationSec) {
    const sampleRate = 22050;
    const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    const amp = 0.35 * 32767;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, i / 200) * Math.max(0, 1 - (i - numSamples + 400) / 400);
      const sample = Math.sin(2 * Math.PI * freqHz * t) * amp * env;
      view.setInt16(44 + i * 2, sample, true);
    }
    let binary = "";
    const u8 = new Uint8Array(buffer);
    for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
    return `data:audio/wav;base64,${global.btoa(binary)}`;
  }

  function unlockTimerAudio() {
    bellUnlocked = true;
    const ctx = getBellAudioContext();
    const html = ensureHtmlBell();
    const tasks = [];
    if (ctx && ctx.resume) {
      tasks.push(
        ctx.resume().catch(() => {
          /* ignore */
        }),
      );
    }
    if (html) {
      html.volume = 1;
      tasks.push(
        html
          .play()
          .then(() => {
            html.pause();
            html.currentTime = 0;
          })
          .catch(() => {
            /* ignore */
          }),
      );
    }
    if (ctx) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.02);
      } catch (_) {
        /* ignore */
      }
    }
    return Promise.all(tasks).then(() => true);
  }

  function playWebAudioBell() {
    const ctx = getBellAudioContext();
    if (!ctx) return false;
    try {
      const now = ctx.currentTime;
      const pattern = [
        { t: 0, f: 880, d: 0.15 },
        { t: 0.3, f: 988, d: 0.15 },
        { t: 0.6, f: 1175, d: 0.2 },
        { t: 1.0, f: 880, d: 0.3 },
        { t: 1.45, f: 988, d: 0.4 },
      ];
      pattern.forEach((hit) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = hit.f;
        gain.gain.setValueAtTime(0.0001, now + hit.t);
        gain.gain.exponentialRampToValueAtTime(0.6, now + hit.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + hit.t + hit.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + hit.t);
        osc.stop(now + hit.t + hit.d + 0.08);
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function playHtmlBellSequence() {
    const html = ensureHtmlBell();
    if (!html) return;
    const freqs = [880, 988, 1175, 988];
    freqs.forEach((freq, i) => {
      global.setTimeout(() => {
        try {
          html.src = makeBeepWavDataUri(freq, 0.22);
          html.volume = 1;
          html.currentTime = 0;
          void html.play().catch(() => {
            /* ignore */
          });
        } catch (_) {
          /* ignore */
        }
      }, i * 380);
    });
  }

  function playTimerBell3s() {
    const now = Date.now();
    if (now - lastBellAt < 1500) return;
    lastBellAt = now;

    const run = () => {
      playWebAudioBell();
      playHtmlBellSequence();
    };

    if (bellUnlocked) {
      void unlockTimerAudio().then(run);
      return;
    }
    void unlockTimerAudio().then(() => {
      bellUnlocked = true;
      run();
    });
  }

  function isTimerAudioUnlocked() {
    return bellUnlocked;
  }

  global.EAP_LIVE_TIMER_SHARED = {
    MAX_TOTAL_SEC,
    formatClock,
    buildTimerDisplayPayload,
    liveTimerSeconds,
    unlockTimerAudio,
    isTimerAudioUnlocked,
    playTimerBell3s,
  };
})(typeof window !== "undefined" ? window : globalThis);
