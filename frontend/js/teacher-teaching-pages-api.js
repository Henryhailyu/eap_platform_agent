/**
 * Phase K3 — teacher AI HTML teaching pages API.
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
      throw new Error(msg);
    }
    return data;
  }

  async function getAiStatus() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/ai/status`, {
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function generatePage(payload) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/generate`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload || {}),
    });
    const data = await readJson(response);
    return data.page;
  }

  async function listPages() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.pages) ? data.pages : [];
  }

  async function savePage(payload) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload || {}),
    });
    const data = await readJson(response);
    return data.page;
  }

  async function getPage(id) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/${encodeURIComponent(id)}`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return data.page;
  }

  async function deletePage(id) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  function viewUrl(id) {
    return `${API_BASE}/api/teacher/teaching-pages/${encodeURIComponent(id)}/view`;
  }

  global.EAP_TEACHER_TEACHING_PAGES = {
    getAiStatus,
    generatePage,
    listPages,
    savePage,
    getPage,
    deletePage,
    viewUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
