/**
 * Phase N — recorded lessons API (local storage; Tencent VOD later).
 */
(function (global) {
  const API_BASE = () =>
    (typeof global.API_BASE !== "undefined" ? global.API_BASE : "") || "";

  function apiUrl(path) {
    const base = API_BASE().replace(/\/$/, "");
    return `${base}${path}`;
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
      const fn = global.eapFetch || global.fetch;
      return fn(apiUrl("/api/teacher/recorded-lessons"), {
        method: "POST",
        credentials: "include",
        body: formData,
      }).then(async (res) => {
        let data = null;
        try {
          data = await res.json();
        } catch (_) {
          data = null;
        }
        if (!res.ok) {
          const msg = (data && data.error) || res.statusText || "Upload failed";
          throw new Error(msg);
        }
        return data;
      });
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
  };
})(typeof window !== "undefined" ? window : globalThis);
