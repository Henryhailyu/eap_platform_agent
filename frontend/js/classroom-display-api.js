/**
 * K6d — classroom display library API (persistent per class).
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
      throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
    }
    return data;
  }

  async function listItems(className) {
    const q = className ? `?class_name=${encodeURIComponent(className)}` : "";
    const response = await fetchFn()(`${API_BASE}/api/teacher/classroom-display${q}`, {
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function addHtmlPage(className, pageId, title) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/classroom-display`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ class_name: className, page_id: pageId, title: title || "" }),
    });
    const data = await readJson(response);
    return data.item;
  }

  async function uploadFile(className, file, title) {
    const form = new FormData();
    form.append("class_name", className);
    form.append("file", file);
    if (title) form.append("title", title);
    const response = await fetchFn()(`${API_BASE}/api/teacher/classroom-display`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });
    const data = await readJson(response);
    return data.item;
  }

  async function deleteItem(itemId) {
    const response = await fetchFn()(`${API_BASE}/api/teacher/classroom-display/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function activateItem(itemId) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/classroom-display/${encodeURIComponent(itemId)}/activate`,
      {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      },
    );
    return readJson(response);
  }

  function viewItemUrl(itemId) {
    return `${API_BASE}/api/teacher/classroom-display/${encodeURIComponent(itemId)}/view`;
  }

  async function ensurePreview(itemId) {
    const response = await fetchFn()(
      `${API_BASE}/api/teacher/classroom-display/${encodeURIComponent(itemId)}/ensure-preview`,
      {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      },
    );
    return readJson(response);
  }

  global.EAP_CLASSROOM_DISPLAY = {
    listItems,
    addHtmlPage,
    uploadFile,
    deleteItem,
    activateItem,
    ensurePreview,
    viewItemUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
