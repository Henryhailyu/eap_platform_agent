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

  async function getVocabToday() {
    return apiFetch("/api/student/self-study/vocabulary/today");
  }

  async function getVocabReviewYesterday() {
    return apiFetch("/api/student/self-study/vocabulary/review-yesterday");
  }

  async function getVocabCalendar() {
    return apiFetch("/api/student/self-study/vocabulary/calendar");
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

  async function getReadingOverview() {
    return apiFetch("/api/student/self-study/reading/overview");
  }

  async function getReadingToday() {
    return apiFetch("/api/student/self-study/reading/today");
  }

  async function completeReading(body) {
    return apiFetch("/api/student/self-study/reading/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
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
    getVocabPackUnits,
    getVocabUnit,
    completeVocab,
    getReadingOverview,
    getReadingToday,
    completeReading,
  };
})();
