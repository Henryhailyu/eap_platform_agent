/**
 * Phase K1 — server-backed self-study materials (manager upload, student list).
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

  async function listAdminMaterials() {
    const response = await fetchFn()(`${API_BASE}/api/admin/self-study/materials`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.materials) ? data.materials : [];
  }

  async function uploadAdminMaterial(formData) {
    const response = await fetchFn()(`${API_BASE}/api/admin/self-study/materials`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: formData,
    });
    const data = await readJson(response);
    return data.material;
  }

  async function deleteAdminMaterial(id) {
    const response = await fetchFn()(`${API_BASE}/api/admin/self-study/materials/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(),
    });
    return readJson(response);
  }

  async function listStudentMaterials(module, level) {
    const params = new URLSearchParams();
    params.set("module", module || "vocabulary");
    if (level) params.set("level", level);
    const response = await fetchFn()(`${API_BASE}/api/student/self-study/materials?${params.toString()}`, {
      credentials: "include",
      headers: authHeaders(),
    });
    const data = await readJson(response);
    return Array.isArray(data.materials) ? data.materials : [];
  }

  global.EAP_SELF_STUDY_MATERIALS_API = {
    listAdminMaterials,
    uploadAdminMaterial,
    deleteAdminMaterial,
    listStudentMaterials,
  };
})(typeof window !== "undefined" ? window : globalThis);
