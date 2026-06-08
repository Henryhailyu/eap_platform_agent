/**
 * Phase N — recorded lessons API (local storage; Tencent VOD later).
 */
(function (global) {
  /** Resolve the absolute API base URL (never a relative path). */
  function resolveBase() {
    const custom =
      (typeof global.EAP_API_BASE !== "undefined" && global.EAP_API_BASE) || "";
    if (custom && String(custom).trim()) return String(custom).trim().replace(/\/$/, "");
    if (typeof window !== "undefined" && window.location && window.location.origin) {
      return window.location.origin.replace(/\/$/, "");
    }
    return "";
  }

  function apiUrl(path) {
    return `${resolveBase()}${path}`;
  }

  async function apiFetch(path, options) {
    const fn = global.eapFetch || global.fetch;
    const res = await fn(apiUrl(path), {
      credentials: "include",
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /**
   * Upload via XHR with an absolute URL so it works reliably in same-origin
   * production (avoids fetch/AbortController issues with large multipart bodies).
   */
  function uploadXhr(url, formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;
      if (typeof global.EAP_getAuthHeaders === "function") {
        const hdrs = global.EAP_getAuthHeaders({});
        Object.keys(hdrs).forEach((k) => xhr.setRequestHeader(k, hdrs[k]));
      }
      xhr.timeout = 300000;
      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (_) {
          data = xhr.responseText ? { error: xhr.responseText.slice(0, 300) } : null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const msg =
            (data && (data.error || data.message)) ||
            xhr.statusText ||
            `Upload failed (${xhr.status})`;
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Network error — check server and retry."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Try a smaller file or retry."));
      xhr.send(formData);
    });
  }

  function streamUrl(lessonId, role) {
    const prefix =
      role === "student"
        ? `/api/student/recorded-lessons/${lessonId}/stream`
        : `/api/teacher/recorded-lessons/${lessonId}/stream`;
    return apiUrl(prefix);
  }

  global.EAP_RECORDED_LESSONS = {
    list(className) {
      const q = encodeURIComponent(className || "");
      return apiFetch(`/api/teacher/recorded-lessons?class_name=${q}`);
    },
    upload(formData) {
      return uploadXhr(apiUrl("/api/teacher/recorded-lessons"), formData);
    },
    update(lessonId, patch) {
      return apiFetch(`/api/teacher/recorded-lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch || {}),
      });
    },
    linkTask(lessonId, calendarTaskId) {
      return apiFetch(`/api/teacher/recorded-lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar_task_id: calendarTaskId }),
      });
    },
    remove(lessonId) {
      return apiFetch(`/api/teacher/recorded-lessons/${lessonId}`, {
        method: "DELETE",
      });
    },
    teacherStreamUrl(lessonId) {
      return streamUrl(lessonId, "teacher");
    },
    studentStreamUrl(lessonId) {
      return streamUrl(lessonId, "student");
    },
    listPublishedForStudent(className) {
      const q = encodeURIComponent(className || "");
      return apiFetch(`/api/student/recorded-lessons?class_name=${q}`);
    },
    studentPlayAuth(lessonId) {
      return apiFetch(`/api/student/recorded-lessons/${lessonId}/play-auth`);
    },
    vodStatus() {
      return apiFetch("/api/teacher/recorded-lessons/vod/status");
    },
    vodUploadSign(body) {
      return apiFetch("/api/teacher/recorded-lessons/vod/upload-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    },
    vodRegister(body) {
      return apiFetch("/api/teacher/recorded-lessons/vod/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
