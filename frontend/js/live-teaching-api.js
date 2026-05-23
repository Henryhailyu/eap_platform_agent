/**
 * Live Teaching API — teacher sessions & student responses (Phase L27).
 */
(function (global) {
  const API_BASE = (function resolveApiBase() {
    const custom = global.EAP_API_BASE;
    if (custom && String(custom).trim()) return String(custom).replace(/\/$/, "");
    if (global.location && global.location.origin && global.location.protocol !== "file:") {
      return global.location.origin;
    }
    return "http://127.0.0.1:5051";
  })();

  const CREDENTIALS = "include";

  async function parseJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.error || data.message || `HTTP ${response.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function createSession(className, date) {
    const response = await fetch(`${API_BASE}/api/teacher/live/sessions`, {
      method: "POST",
      credentials: CREDENTIALS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_name: className, date: date || "" }),
    });
    return parseJson(response);
  }

  async function launchQuestion(sessionCode, question) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const response = await fetch(`${API_BASE}/api/teacher/live/sessions/${encodeURIComponent(code)}/launch`, {
      method: "POST",
      credentials: CREDENTIALS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return parseJson(response);
  }

  async function fetchResponses(sessionCode, launchId) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const q = launchId != null ? `?launch_id=${encodeURIComponent(String(launchId))}` : "";
    const response = await fetch(
      `${API_BASE}/api/teacher/live/sessions/${encodeURIComponent(code)}/responses${q}`,
      { credentials: CREDENTIALS },
    );
    return parseJson(response);
  }

  async function studentJoin(sessionCode) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const response = await fetch(`${API_BASE}/api/student/live/join/${encodeURIComponent(code)}`, {
      credentials: CREDENTIALS,
    });
    return parseJson(response);
  }

  async function studentRespond(sessionCode, teamId, answerIndex) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const response = await fetch(
      `${API_BASE}/api/student/live/join/${encodeURIComponent(code)}/respond`,
      {
        method: "POST",
        credentials: CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, answer_index: answerIndex }),
      },
    );
    return parseJson(response);
  }

  global.EAP_LIVE_TEACHING_API = {
    API_BASE,
    createSession,
    launchQuestion,
    fetchResponses,
    studentJoin,
    studentRespond,
  };
})(typeof window !== "undefined" ? window : globalThis);
