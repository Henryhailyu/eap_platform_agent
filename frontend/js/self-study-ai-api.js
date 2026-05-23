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

  async function coachModule(module, text, level, lang) {
    const response = await fetchFn()(
      `${API_BASE}/api/student/self-study/ai/coach/${encodeURIComponent(module || "reading")}`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          text: text || "",
          level: level || "beginner",
          lang: lang || "en",
        }),
      },
    );
    const data = await readJson(response);
    return data.coach;
  }

  async function listAdminPrompts() {
    const response = await fetchFn()(`${API_BASE}/api/admin/self-study/ai/prompts`, {
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function getAdminPrompt(module) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/self-study/ai/prompts/${encodeURIComponent(module)}`,
      { credentials: "include", headers: authHeaders() },
    );
    return readJson(response);
  }

  async function saveAdminPrompt(module, systemPrompt) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/self-study/ai/prompts/${encodeURIComponent(module)}`,
      {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ system_prompt: systemPrompt }),
      },
    );
    return readJson(response);
  }

  async function resetAdminPrompt(module) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/self-study/ai/prompts/${encodeURIComponent(module)}`,
      { method: "DELETE", credentials: "include", headers: authHeaders() },
    );
    return readJson(response);
  }

  async function previewAdminPrompt(module, payload) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/self-study/ai/prompts/${encodeURIComponent(module)}/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload || {}),
      },
    );
    return readJson(response);
  }

  global.EAP_SELF_STUDY_AI = {
    getStatus,
    explainVocabulary,
    coachModule,
    listAdminPrompts,
    getAdminPrompt,
    saveAdminPrompt,
    resetAdminPrompt,
    previewAdminPrompt,
  };
})(typeof window !== "undefined" ? window : globalThis);
