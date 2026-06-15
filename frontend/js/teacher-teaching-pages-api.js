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
      const base = (data && (data.error || data.message)) || `HTTP ${response.status}`;
      const detail = data && data.detail ? String(data.detail).trim() : "";
      const msg = detail && detail !== base ? `${base}: ${detail}` : base;
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
    const page = data.page;
    if (page && Array.isArray(data.warnings)) {
      page.warnings = data.warnings;
    }
    return page;
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

  async function listTemplates() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/templates`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.templates) ? data.templates : [];
  }

  async function publishPage(id, published) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/teaching-pages/${encodeURIComponent(id)}/publish`,
      {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ published }),
      },
    );
    const data = await readJson(response);
    return data.page;
  }

  async function listAdminTemplates() {
    const response = await fetchFn()(`${API_BASE}/api/admin/teaching-page/templates`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.templates) ? data.templates : [];
  }

  async function getAdminTemplate(key) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/teaching-page/templates/${encodeURIComponent(key)}`,
      { credentials: "include", headers: authHeaders() },
    );
    return readJson(response);
  }

  async function saveAdminTemplate(key, systemPrompt) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/teaching-page/templates/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ system_prompt: systemPrompt }),
      },
    );
    const data = await readJson(response);
    return data.template;
  }

  async function resetAdminTemplate(key) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/teaching-page/templates/${encodeURIComponent(key)}`,
      { method: "DELETE", credentials: "include", headers: authHeaders() },
    );
    const data = await readJson(response);
    return data.template;
  }

  async function previewAdminTemplate(key, payload) {
    const response = await fetchFn()(
      `${API_BASE}/api/admin/teaching-page/templates/${encodeURIComponent(key)}/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload || {}),
      },
    );
    const data = await readJson(response);
    return data.page;
  }

  async function listStudentPages(className) {
    const q = className ? `?class_name=${encodeURIComponent(className)}` : "";
    const response = await fetchFn()(`${API_BASE}/api/student/teaching-pages${q}`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.pages) ? data.pages : [];
  }

  async function getStudentPageMeta(id, className) {
    const q = className ? `?class_name=${encodeURIComponent(className)}` : "";
    const response = await fetchFn()(
      `${API_BASE}/api/student/teaching-pages/${encodeURIComponent(id)}${q}`,
      { credentials: "include", headers: authHeaders() },
    );
    const data = await readJson(response);
    return data.page;
  }

  function studentViewUrl(id, className) {
    const q = className ? `?class_name=${encodeURIComponent(className)}` : "";
    return `${API_BASE}/api/student/teaching-pages/${encodeURIComponent(id)}/view${q}`;
  }

  async function listSourceFiles() {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/source-files`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.files) ? data.files : [];
  }

  async function uploadSourceFiles(fileList) {
    const form = new FormData();
    Array.from(fileList || []).forEach((file) => form.append("file", file));
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/source-files`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const data = await readJson(response);
    return Array.isArray(data.files) ? data.files : [];
  }

  async function confirmSourceFiles(fileIds) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/teaching-pages/source-files/confirm`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ file_ids: fileIds || [] }),
    });
    const data = await readJson(response);
    return Array.isArray(data.files) ? data.files : [];
  }

  async function getSourceFile(id) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/teaching-pages/source-files/${encodeURIComponent(id)}`,
      { credentials: "include", headers: authHeaders() },
    );
    const data = await readJson(response);
    return data.file;
  }

  async function deleteSourceFile(id) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/teaching-pages/source-files/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include", headers: authHeaders() },
    );
    return readJson(response);
  }

  global.EAP_TEACHER_TEACHING_PAGES = {
    getAiStatus,
    generatePage,
    listPages,
    savePage,
    getPage,
    deletePage,
    viewUrl,
    listTemplates,
    publishPage,
    listAdminTemplates,
    getAdminTemplate,
    saveAdminTemplate,
    resetAdminTemplate,
    previewAdminTemplate,
    listSourceFiles,
    uploadSourceFiles,
    confirmSourceFiles,
    getSourceFile,
    deleteSourceFile,
  };

  global.EAP_STUDENT_TEACHING_PAGES = {
    listPages: listStudentPages,
    getPageMeta: getStudentPageMeta,
    viewUrl: studentViewUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
