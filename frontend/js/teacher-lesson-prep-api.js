/**
 * LP-M1 — teacher Writing lesson prep packs API.
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
      const base = (data && (data.error || data.message)) || `HTTP ${response.status}`;
      const detail = data && data.detail ? String(data.detail).trim() : "";
      const msg = detail && detail !== base ? `${base}: ${detail}` : base;
      throw new Error(msg);
    }
    return data;
  }

  async function getMeta() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/lesson-prep/meta`, {
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function listPacks() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/lesson-prep/packs`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return data.packs || [];
  }

  async function getPack(packId) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}`,
      { credentials: "include", headers: authHeaders() },
    );
    const data = await readJson(response);
    return data.pack;
  }

  async function createPack(payload) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/lesson-prep/packs`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload || {}),
    });
    const data = await readJson(response);
    return data.pack;
  }

  async function updatePack(packId, payload) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}`,
      {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload || {}),
      },
    );
    const data = await readJson(response);
    return data.pack;
  }

  async function uploadPackFiles(packId, fileList, useInAi) {
    const form = new FormData();
    for (const f of fileList) {
      if (f) form.append("file", f);
    }
    if (useInAi === false) form.append("use_in_ai", "0");
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}/files`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: form,
      },
    );
    const data = await readJson(response);
    return data.files || [];
  }

  function pageViewUrl(pageId) {
    return `${API_BASE}/api/teacher/teaching-pages/${encodeURIComponent(pageId)}/view`;
  }

  async function generateHtml(packId) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}/html`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "{}",
      },
    );
    return readJson(response);
  }

  async function publishPack(packId, payload) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}/publish`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload || {}),
      },
    );
    return readJson(response);
  }

  async function generatePlan(packId) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/lesson-prep/packs/${encodeURIComponent(packId)}/plan`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "{}",
      },
    );
    return readJson(response);
  }

  global.EAP_TEACHER_LESSON_PREP = {
    getMeta,
    listPacks,
    getPack,
    createPack,
    updatePack,
    uploadPackFiles,
    generatePlan,
    generateHtml,
    publishPack,
    pageViewUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
