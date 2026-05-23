/**
 * Phase K2 — student self-study AI coach API.
 */
(function (global) {
  const API_BASE =
    global.EAP_API_BASE && String(global.EAP_API_BASE).trim()
      ? String(global.EAP_API_BASE).replace(/\/$/, "")
      : global.location && global.location.origin && global.location.protocol !== "file:"
        ? global.location.origin
        : "http://127.0.0.1:5051";

  function fetchFn() {
    return typeof global.EAP_fetch === "function" ? global.EAP_fetch : global.fetch.bind(global);
  }

  function authHeaders(extra) {
    if (typeof global.EAP_getAuthHeaders === "function") {
      return global.EAP_getAuthHeaders(extra);
    }
    return extra && typeof extra === "object" ? { ...extra } : {};
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${response.status}`;
      const err = new Error(msg);
      err.httpStatus = response.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function getStatus() {
    const response = await fetchFn()(`${API_BASE}/api/student/self-study/ai/status`, {
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function explainVocabulary(term, level, lang) {
    const response = await fetchFn()(`${API_BASE}/api/student/self-study/ai/vocabulary-explain`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        term: term || "",
        level: level || "beginner",
        lang: lang || "en",
      }),
    });
    const data = await readJson(response);
    return data.explanation;
  }

  global.EAP_SELF_STUDY_AI = {
    getStatus,
    explainVocabulary,
  };
})(typeof window !== "undefined" ? window : globalThis);
