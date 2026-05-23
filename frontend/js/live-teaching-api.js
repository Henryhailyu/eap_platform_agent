/**
 * Live Teaching API — teacher sessions & student responses (Phase L27–L29).
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
  const WAIT_TIMEOUT_SEC = 25;
  const FALLBACK_POLL_MS = 4000;

  async function parseJson(response) {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const data =
      contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      if (response.status === 404 && !data.error) {
        const err = new Error("LIVE_ROUTE_OR_SESSION_NOT_FOUND");
        err.code = "live_not_found";
        err.httpStatus = 404;
        throw err;
      }
      const msg = data.error || data.message || `HTTP ${response.status}`;
      const err = new Error(msg);
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  }

  function waitQuery(extra) {
    const params = new URLSearchParams();
    params.set("timeout", String(WAIT_TIMEOUT_SEC));
    if (extra) {
      Object.keys(extra).forEach((key) => {
        const val = extra[key];
        if (val == null || val === "") return;
        params.set(key, String(val));
      });
    }
    return params.toString();
  }

  async function createSession(className, date, options) {
    const opts = options && typeof options === "object" ? options : {};
    const body = { class_name: className, date: date || "" };
    if (opts.teacher_username) body.teacher_username = opts.teacher_username;
    const response = await fetch(`${API_BASE}/api/teacher/live/sessions`, {
      method: "POST",
      credentials: CREDENTIALS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseJson(response);
  }

  async function launchQuestion(sessionCode, question, options) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const opts = options && typeof options === "object" ? options : {};
    const body = { question };
    if (opts.teacher_username) body.teacher_username = opts.teacher_username;
    const response = await fetch(`${API_BASE}/api/teacher/live/sessions/${encodeURIComponent(code)}/launch`, {
      method: "POST",
      credentials: CREDENTIALS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  async function fetchResponsesWait(sessionCode, launchId, sinceCount, signal) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const qs = waitQuery({
      launch_id: launchId,
      since_count: sinceCount != null ? sinceCount : 0,
    });
    const response = await fetch(
      `${API_BASE}/api/teacher/live/sessions/${encodeURIComponent(code)}/responses/wait?${qs}`,
      { credentials: CREDENTIALS, signal },
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

  async function studentJoinWait(sessionCode, launchId, signal) {
    const code = String(sessionCode || "").trim().toUpperCase();
    const qs = waitQuery({
      launch_id: launchId != null ? launchId : "",
    });
    const response = await fetch(
      `${API_BASE}/api/student/live/join/${encodeURIComponent(code)}/wait?${qs}`,
      { credentials: CREDENTIALS, signal },
    );
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
    WAIT_TIMEOUT_SEC,
    FALLBACK_POLL_MS,
    createSession,
    launchQuestion,
    fetchResponses,
    fetchResponsesWait,
    studentJoin,
    studentJoinWait,
    studentRespond,
  };
})(typeof window !== "undefined" ? window : globalThis);
