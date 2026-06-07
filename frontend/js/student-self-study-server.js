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

  global.EAP_SELF_STUDY_SERVER = {
    getStatus,
    getPlacement,
    savePlacement,
    patchSettings,
    getDailyOverview,
  };
})();
