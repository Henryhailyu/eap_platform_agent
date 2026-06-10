/**
 * SS-0 — server-backed self-study status, placement, daily channel overview.
 */
(function (global) {
  function apiBase() {
    if (global.EAP_API_BASE_RESOLVED) {
      return String(global.EAP_API_BASE_RESOLVED).replace(/\/$/, "");
    }
    const custom = global.EAP_API_BASE;
    if (custom != null && String(custom).trim() !== "") {
      return String(custom).trim().replace(/\/$/, "");
    }
    if (global.location && /^https?:$/i.test(global.location.protocol)) {
      return global.location.origin.replace(/\/$/, "");
    }
    return "http://127.0.0.1:5051";
  }

  async function apiFetch(path, options) {
    const fn = typeof global.EAP_fetch === "function" ? global.EAP_fetch : fetch;
    const response = await fn(`${apiBase()}${path}`, {
      credentials: "include",
      ...(options || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText || "Request failed");
    return data;
  }

  async function getStatus() {
    return apiFetch("/api/student/self-study/status");
  }

  async function getPlacement() {
    const data = await apiFetch("/api/student/self-study/placement");
    return data.placement || null;
  }

  async function savePlacement(result) {
    return apiFetch("/api/student/self-study/placement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  }

  async function patchSettings(body) {
    return apiFetch("/api/student/self-study/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function getDailyOverview() {
    return apiFetch("/api/student/self-study/daily-overview");
  }

  async function getVocabOverview() {
    return apiFetch("/api/student/self-study/vocabulary/overview");
  }

  async function getVocabToday(channel) {
    const ch = channel || "B";
    return apiFetch(`/api/student/self-study/vocabulary/today?channel=${encodeURIComponent(ch)}`);
  }

  async function getVocabReviewYesterday(channel, dayNumber) {
    const ch = channel || "B";
    const q = new URLSearchParams({ channel: ch });
    if (dayNumber > 0) q.set("day", String(dayNumber));
    return apiFetch(`/api/student/self-study/vocabulary/review-yesterday?${q}`);
  }

  async function getVocabCalendar(channel) {
    const ch = channel || "B";
    return apiFetch(`/api/student/self-study/vocabulary/calendar?channel=${encodeURIComponent(ch)}`);
  }

  async function getVocabDay(dayNumber, channel) {
    const ch = channel || "B";
    return apiFetch(
      `/api/student/self-study/vocabulary/day/${dayNumber}?channel=${encodeURIComponent(ch)}`,
    );
  }

  async function getVocabPackUnits(packId) {
    return apiFetch(`/api/student/self-study/vocabulary/packs/${packId}/units`);
  }

  async function getVocabUnit(unitId) {
    return apiFetch(`/api/student/self-study/vocabulary/units/${unitId}`);
  }

  async function completeVocab(body) {
    return apiFetch("/api/student/self-study/vocabulary/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getVocabPracticeExam(body) {
    return apiFetch("/api/student/self-study/vocabulary/practice-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function gradeVocabPracticeExam(body) {
    return apiFetch("/api/student/self-study/vocabulary/practice-exam/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getReadingOverview() {
    return apiFetch("/api/student/self-study/reading/overview");
  }

  async function getReadingToday(dayNumber) {
    const q = dayNumber ? `?day=${encodeURIComponent(String(dayNumber))}` : "";
    return apiFetch(`/api/student/self-study/reading/today${q}`);
  }

  async function completeReading(body) {
    return apiFetch("/api/student/self-study/reading/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getListeningOverview() {
    return apiFetch("/api/student/self-study/listening/overview");
  }

  async function getListeningToday(dayNumber) {
    const q = dayNumber ? `?day=${encodeURIComponent(String(dayNumber))}` : "";
    return apiFetch(`/api/student/self-study/listening/today${q}`);
  }

  async function getListeningCoach(itemId) {
    return apiFetch(`/api/student/self-study/listening/coach?itemId=${encodeURIComponent(itemId)}`);
  }

  async function completeListening(body) {
    return apiFetch("/api/student/self-study/listening/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getWritingOverview() {
    return apiFetch("/api/student/self-study/writing/overview");
  }

  async function startWritingSession(body) {
    return apiFetch("/api/student/self-study/writing/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getWritingSession(sessionId) {
    return apiFetch(`/api/student/self-study/writing/sessions/${sessionId}`);
  }

  async function submitWriting(body, file) {
    if (file) {
      const fd = new FormData();
      fd.append("sessionId", String(body.sessionId || body.taskId || ""));
      fd.append("draftText", body.draftText || "");
      fd.append("file", file);
      return apiFetch("/api/student/self-study/writing/submit", { method: "POST", body: fd });
    }
    return apiFetch("/api/student/self-study/writing/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getSpeakingOverview() {
    return apiFetch("/api/student/self-study/speaking/overview");
  }

  async function getSpeakingSession(sessionId) {
    return apiFetch(`/api/student/self-study/speaking/sessions/${sessionId}`);
  }

  async function startSpeakingSession(body) {
    return apiFetch("/api/student/self-study/speaking/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function completeSpeakingSession(body) {
    return apiFetch("/api/student/self-study/speaking/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function submitSpeakingResponse(body) {
    return apiFetch("/api/student/self-study/speaking/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function getSpeakingHistory() {
    return apiFetch("/api/student/self-study/speaking/history");
  }

  async function getAudioStatus() {
    return apiFetch("/api/student/self-study/audio/status");
  }

  global.EAP_SELF_STUDY_SERVER = {
    getStatus,
    getPlacement,
    savePlacement,
    patchSettings,
    getDailyOverview,
    getVocabOverview,
    getVocabToday,
    getVocabReviewYesterday,
    getVocabCalendar,
    getVocabDay,
    getVocabPackUnits,
    getVocabUnit,
    completeVocab,
    getVocabPracticeExam,
    gradeVocabPracticeExam,
    getReadingOverview,
    getReadingToday,
    completeReading,
    getListeningOverview,
    getListeningToday,
    getListeningCoach,
    completeListening,
    getWritingOverview,
    startWritingSession,
    getWritingSession,
    submitWriting,
    getSpeakingOverview,
    getSpeakingSession,
    startSpeakingSession,
    completeSpeakingSession,
    submitSpeakingResponse,
    getSpeakingHistory,
    getAudioStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);
