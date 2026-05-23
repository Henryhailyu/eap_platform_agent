/**
 * EAP Platform — frontend wired to the Flask API
 *
 * Backend base: http://127.0.0.1:5050 (override with window.EAP_API_BASE in api-config.js)
 * index.html: two login cards (student + teacher), same POST /api/login, role check per card.
 * sessionStorage + redirect. If already logged in, jumps to app.
 * teacher.html / student.html: validatePageSessionOrFallback() (+ requireRole retained) page guard + header;
 * GET /api/me resync when possible with local eap_user fallback (Phase D2). task APIs via fetch().
 * Monthly planner grids (#teacher-calendar-root / #student-calendar-root) fetch GET /api/tasks?class_name=
 * once per class for coloured pills; clicking a day still loads GET /api/tasks?class_name=&date= below.
 * teacher.html: progress dashboard via GET /api/teacher/progress?class_name=; optional Phase D8 GET /api/teacher/task-completions for “students marked complete” on the daily task list; task list via GET /api/tasks?class_name=&date=;
 *   “View Submissions” loads GET /api/tasks/<id>/submissions and lists student homework under the card.
 * student.html: daily view uses a master–detail layout; tasks load with ?date=&class_name=;
 * Student daily task completion (Phase D7): PUT /api/tasks/<id>/my-completion with JSON
 * (student_username + class_name + status); batch GET /api/tasks/my-completions for UI chips/cards.
 * Legacy PUT /api/tasks/<id>/complete still updates calendar_tasks.status (global) for compatibility.
 */

// ---- API config ---------------------------------------------------------------

/**
 * Base URL for all API calls. Must match your running Flask server (host + port).
 *
 * Default: http://127.0.0.1:5050 (matches backend/app.py default PORT).
 *
 * Edit frontend/api-config.js (loaded before this file) if your Flask URL differs.
 */
const API_BASE = (function resolveApiBase() {
  if (typeof window === "undefined") return "http://127.0.0.1:5051";
  const custom = window.EAP_API_BASE;
  if (custom != null && String(custom).trim() !== "") {
    return String(custom).trim().replace(/\/$/, "");
  }
  // Phase G: when UI is served by Flask at /ui/ (online pilot), use same origin.
  if (
    typeof window.location !== "undefined" &&
    window.location.protocol &&
    /^https?:$/i.test(window.location.protocol)
  ) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://127.0.0.1:5051";
})();

/** Agent build — bilingual UI (see js/i18n-core.js). */
function t(key, params) {
  if (typeof window !== "undefined" && window.EAP_I18N && window.EAP_I18N.t) {
    return window.EAP_I18N.t(key, params);
  }
  return key;
}

function eapLocale() {
  if (typeof window !== "undefined" && window.EAP_I18N && window.EAP_I18N.localeTag) {
    return window.EAP_I18N.localeTag();
  }
  return undefined;
}

const TASK_CATEGORY_I18N = {
  "Classroom Learning": "cat_classroom",
  Vocabulary: "cat_vocab",
  Listening: "cat_listening",
  Reading: "cat_reading",
  Speaking: "cat_speaking",
  Writing: "cat_writing",
  Homework: "cat_homework",
};

function translateCategory(label) {
  const key = TASK_CATEGORY_I18N[label];
  return key ? t(key) : label;
}

function translateStatus(status) {
  const raw = String(status || "").trim();
  if (!raw) return "—";
  const low = raw.toLowerCase();
  if (low === "pending") return t("status_pending");
  if (low === "completed" || low === "complete") return t("status_completed");
  if (low === "done") return t("status_done");
  return raw;
}

/** Map backend progress action_needed strings to i18n. */
function translateActionNeeded(action) {
  const a = action != null ? String(action).trim() : "";
  const map = {
    "Submit homework": "action_submit_homework",
    "Submit revision": "submit_revision",
    "Mark as completed": "mark_complete",
  };
  const key = map[a];
  return key ? t(key) : a || t("open_task");
}

/** True when UI language is Chinese (never infer from task content). */
function uiLangIsZh() {
  return !!(window.EAP_I18N && window.EAP_I18N.getLang() === "zh");
}

/** Task title for current UI language — English UI always uses `title` only. */
function taskDisplayTitle(task) {
  if (!task) return t("untitled_task");
  const base = task.title != null ? String(task.title).trim() : "";
  if (!uiLangIsZh()) {
    return base || t("untitled_task");
  }
  const titleZh =
    task.title_zh != null && String(task.title_zh).trim() !== "" ? String(task.title_zh).trim() : "";
  if (titleZh) return titleZh;
  if (base) {
    const cat = translateCategory(task.category || task.type || "");
    return `${cat}：${base}`;
  }
  return t("untitled_task");
}

/** Task description for current UI language — English UI always uses `description` only. */
function taskDisplayDescription(task) {
  if (!task) return "";
  if (!uiLangIsZh()) {
    return task.description != null ? String(task.description).trim() : "";
  }
  const descZh =
    task.description_zh != null && String(task.description_zh).trim() !== ""
      ? String(task.description_zh).trim()
      : "";
  if (descZh) return descZh;
  return task.description != null ? String(task.description).trim() : "";
}

/** Teacher create-task form: Chinese fields collapsed unless UI is 中文. */
function syncTeacherTaskZhFieldsPanel() {
  const panel = document.getElementById("teacher-task-zh-fields");
  if (!panel) return;
  panel.open = uiLangIsZh();
}

/** Phase D1: include Flask session cookie on API requests (pair with backend CORS credentials). */
const EAP_FETCH_CREDENTIALS = "include";

/** True when the page was opened as a local file (file://) — session cookies do not reach the API. */
function isFileProtocol() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

/** Same-origin UI URL when Flask serves ../frontend at /ui/ (required for strict security flags). */
function hostedUiPageUrl(htmlFile) {
  return `${API_BASE}/ui/${htmlFile}`;
}

/** Redirect file:// pages to http://127.0.0.1:5050/ui/… so login cookies work. Returns true if redirecting. */
function redirectFilePageToHostedUi() {
  if (!isFileProtocol()) return false;
  const name = window.location.pathname.split("/").pop() || "index.html";
  window.location.replace(hostedUiPageUrl(name));
  return true;
}

async function isApiReachable() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/** When fetch() fails before HTTP (Flask stopped / wrong URL in api-config.js). */
function apiUnreachableMessage() {
  return (
    `Cannot reach the API at ${API_BASE}. Start Flask from the backend folder (./venv/bin/python app.py), ` +
    `then open ${API_BASE}/api/health — you should see JSON. Wrong URL? Edit frontend/api-config.js (window.EAP_API_BASE).`
  );
}

/**
 * After a successful login we store the user object here until the tab is closed.
 * Other pages can read it with getLoggedInUser().
 */
const SESSION_USER_KEY = "eap_user";

/**
 * sessionStorage (built into the browser):
 * - Saves key/value strings for THIS TAB only.
 * - Data survives a page refresh, but disappears when you close the tab (or clear site data).
 * - Unlike localStorage, it does not leak across tabs, which is nice for simple “session” UX.
 *
 * We store JSON text under SESSION_USER_KEY. It is not secret — do not put passwords here.
 *
 * IMPORTANT (file:// and double‑clicking HTML files):
 * Many browsers give each file URL its own sessionStorage bucket. So after login on index.html,
 * teacher.html might not see the same session — you get sent back to index, which still thinks
 * you are logged in → fast redirect loop and a blank-looking screen.
 * For file:// we therefore store the user in localStorage instead (still cleared on Logout).
 * For http:// or https:// (e.g. python -m http.server) we use sessionStorage as usual.
 */
function authStorageGet() {
  return typeof window !== "undefined" && window.location.protocol === "file:"
    ? localStorage
    : sessionStorage;
}

function authStorageRemoveAll() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

/** Read the logged-in user object, or null if missing / invalid JSON. */
function getLoggedInUser() {
  const raw = authStorageGet().getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    authStorageRemoveAll();
    return null;
  }
}

/**
 * Synchronous page guard (local eap_user only). Teacher/student boot also runs
 * validatePageSessionOrFallback() to resync with GET /api/me when possible (Phase D2).
 */
function requireRole(expectedRole) {
  const user = getLoggedInUser();
  if (!user || user.role !== expectedRole) {
    window.location.replace(roleHomeUrl(user && user.role ? user.role : ""));
    return false;
  }
  return true;
}

/**
 * Logout: remove the stored user for this tab and open the login page.
 * (Teachers/students use the Logout button in the header.)
 */
function logoutAndGoHome() {
  fetch(`${API_BASE}/api/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: EAP_FETCH_CREDENTIALS,
  })
    .catch(() => {
      /* Offline or server stopped — still clear client session */
    })
    .finally(() => {
      authStorageRemoveAll();
      window.location.href = "index.html";
    });
}

/** Fills “Welcome, …” and wires the Logout button (run after requireRole passes). */
function initAppPageHeader() {
  const welcomeEl = document.getElementById("header-welcome");
  const user = getLoggedInUser();
  if (welcomeEl && user) {
    const name = user.full_name || user.username || "User";
    welcomeEl.textContent = t("welcome_user", { name });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logoutAndGoHome();
    });
  }
}

/** Phase S1 — show AI Self-Study entry when feature flag is on. */
function initStudentSelfStudyNavLink() {
  if (window.EAP_SELF_STUDY_ENABLED === false) return;
  const link = document.getElementById("student-self-study-link");
  if (link) link.classList.remove("hidden");
}

/** Phase L27 — student live class join link. */
function initStudentLiveNavLink() {
  if (window.EAP_TEACHER_LIVE_ENABLED === false) return;
  const link = document.getElementById("student-live-link");
  if (link) link.classList.remove("hidden");
}

/** Phase L2 — show Live Teaching entry when feature flag is on. */
function initTeacherLiveNavLink() {
  if (window.EAP_TEACHER_LIVE_ENABLED === false) return;
  const link = document.getElementById("teacher-live-link");
  if (link) {
    link.classList.remove("hidden");
    link.classList.add("btn-live-nav");
  }
}

/** Student satellite pages (self-study, placement, modules). */
async function bootStudentSatellitePage(pageId, afterReady) {
  if (document.body.getAttribute("data-page") !== pageId) return false;
  const result = await ensurePageRole("student");
  if (!result.ok) {
    if (result.reason === "wrong_role") {
      renderWrongRoleGate(result.user.role);
      return false;
    }
    if (result.redirect) window.location.replace(result.redirect);
    return false;
  }
  initAppPageHeader();
  if (typeof afterReady === "function") afterReady(result.user);
  return true;
}

/**
 * Categories shown on teacher form and student filter (keep in sync with your course).
 * Used to build <select> options in JavaScript.
 */
const TASK_CATEGORIES = [
  "Classroom Learning",
  "Vocabulary",
  "Listening",
  "Reading",
  "Speaking",
  "Writing",
  "Homework",
];

/** When enrolment API has no class and login has no class_name, student UI uses this (Phase C3). */
const STUDENT_CLASS_FALLBACK = "EAP047";

function resolveStudentClassNameFromLogin(user) {
  const fromLogin = user && user.class_name ? String(user.class_name).trim() : "";
  return fromLogin || STUDENT_CLASS_FALLBACK;
}

/**
 * Class codes the teacher can choose (must match what the backend stores in calendar_tasks).
 * Used to default the class selectors from the logged-in user's class_name when it matches.
 */
const TEACHER_CLASS_OPTIONS = ["EAP047", "EAP048", "EAP049"];

/** Active class codes for the logged-in teacher (API-driven; never left empty after init). */
let teacherClassOptions = [...TEACHER_CLASS_OPTIONS];

/** Latest rows from GET /api/teacher/my-classes (empty when using fallback). */
let teacherClassRows = [];

function getTeacherClassOptions() {
  return teacherClassOptions.length > 0 ? teacherClassOptions : [...TEACHER_CLASS_OPTIONS];
}

function teacherDefaultClassFallback() {
  const opts = getTeacherClassOptions();
  return opts.length > 0 ? opts[0] : "EAP047";
}

/**
 * Pick default class for teacher selectors: prefer login class_name when it is in the current list.
 */
function defaultTeacherClassFromUser() {
  const options = getTeacherClassOptions();
  const user = getLoggedInUser();
  const fromLogin = user && user.class_name ? String(user.class_name).trim() : "";
  if (fromLogin && options.includes(fromLogin)) {
    return fromLogin;
  }
  return teacherDefaultClassFallback();
}

/**
 * Load assigned classes for the logged-in teacher; fall back to TEACHER_CLASS_OPTIONS on any failure.
 */
async function loadTeacherAssignedClasses() {
  const user = getLoggedInUser();
  const username = user && user.username ? String(user.username).trim() : "";
  if (!username) {
    teacherClassOptions = [...TEACHER_CLASS_OPTIONS];
    teacherClassRows = [];
    return { source: "fallback", reason: "no-user" };
  }

  try {
    const qs = new URLSearchParams({ teacher_username: username });
    const data = await apiGet(`/api/teacher/my-classes?${qs.toString()}`);
    const rows = data && Array.isArray(data.classes) ? data.classes : [];
    const codes = rows
      .map((r) => (r.class_code != null ? String(r.class_code).trim() : ""))
      .filter(Boolean);
    const unique = [...new Set(codes)];

    if (unique.length > 0) {
      teacherClassOptions = unique;
      teacherClassRows = rows;
      return { source: "api", classes: unique };
    }

    console.warn(
      "[EAP] /api/teacher/my-classes returned no classes; using TEACHER_CLASS_OPTIONS fallback.",
    );
  } catch (err) {
    console.warn(
      "[EAP] Could not load teacher assigned classes; using TEACHER_CLASS_OPTIONS fallback.",
      err,
    );
  }

  teacherClassOptions = [...TEACHER_CLASS_OPTIONS];
  teacherClassRows = [];
  return { source: "fallback", reason: "empty-or-error" };
}

function populateTeacherClassSelect(selectEl, selectedValue) {
  if (!selectEl) return;
  const options = getTeacherClassOptions();
  const want = String(selectedValue || teacherDefaultClassFallback()).trim();
  const value = options.includes(want) ? want : teacherDefaultClassFallback();

  selectEl.innerHTML = "";
  options.forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code;
    selectEl.appendChild(opt);
  });
  selectEl.value = value;
}

function populateAllTeacherClassSelectors(selectedValue) {
  const v = selectedValue || defaultTeacherClassFromUser();
  [
    document.getElementById("teacher-dashboard-class"),
    document.getElementById("teacher-calendar-class"),
    document.getElementById("teacher-task-class"),
    document.getElementById("teacher-template-apply-class"),
  ].forEach((el) => populateTeacherClassSelect(el, v));
}

// ---- Small helpers for fetch() ----------------------------------------------

/**
 * Parse JSON from a Response safely.
 * If the body is not JSON, we still return a helpful error string.
 */
async function readJsonOrError(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/**
 * Phase D2: read current Flask session user without throwing (401 / offline / CORS-safe).
 * Do not use apiGet() here — it throws on non-OK responses.
 */
async function fetchCurrentSessionUser() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/me`, { credentials: EAP_FETCH_CREDENTIALS });
  } catch {
    return null;
  }
  const data = await readJsonOrError(response);
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  if (
    data &&
    data.success === true &&
    data.user &&
    typeof data.user === "object"
  ) {
    return data.user;
  }
  return null;
}

/**
 * Phase D2: prefer server session when /api/me works.
 * When the API is up but there is no Flask session, do not trust local eap_user alone (strict flags need cookies).
 */
async function validatePageSessionOrFallback(expectedRole) {
  const result = await ensurePageRole(expectedRole);
  if (result.ok) return result.user;
  if (result.reason === "wrong_role" && result.redirect) {
    saveUserToSession(result.user);
    window.location.replace(result.redirect);
    return null;
  }
  if (result.redirect) {
    window.location.replace(result.redirect);
    return null;
  }
  window.location.replace(hostedUiPageUrl("index.html"));
  return null;
}

/**
 * GET JSON from the API. Throws Error with a simple message if something fails.
 */
async function apiGet(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: EAP_FETCH_CREDENTIALS });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * POST JSON. Returns parsed body on success; throws on failure.
 */
async function apiPost(path, bodyObject) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObject),
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * POST JSON — copy an existing calendar task to another date/class.
 */
async function apiCopyTask(taskId, bodyObject) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/tasks/${taskId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObject),
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * PUT (no body needed for complete endpoint).
 */
async function apiPut(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/** DELETE helper for removing one teacher feedback attachment row. */
async function apiDelete(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * POST multipart: multiple teacher feedback files under /api/submissions/<id>/feedback-files.
 * FormData uses field name "files" once per file (browser standard for multiple).
 */
async function apiPostFeedbackFiles(submissionId, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/submissions/${submissionId}/feedback-files`, {
      method: "POST",
      body: formData,
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Upload failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/** PUT JSON body — used for `PUT /api/submissions/<id>/feedback` when no file is attached. */
async function apiPutJson(path, bodyObject) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObject),
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * PUT teacher feedback with optional file (multipart FormData).
 * Same endpoint as JSON feedback; browser sets Content-Type with boundary — do not set it manually.
 */
async function apiPutFeedbackFormData(submissionId, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/submissions/${submissionId}/feedback`, {
      method: "PUT",
      body: formData,
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }
  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * POST multipart/form-data to attach a teaching file to a task.
 *
 * Important: pass a FormData instance (or build one here). Do NOT set the Content-Type header —
 * the browser will set multipart boundaries automatically; a manual JSON header would break uploads.
 */
async function apiUploadTaskFile(taskId, file) {
  const formData = new FormData();
  // Flask expects the part name "file" (see backend upload handler).
  formData.append("file", file);

  let response;
  try {
    response = await fetch(`${API_BASE}/api/tasks/${taskId}/upload`, {
      method: "POST",
      body: formData,
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }

  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Upload failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * POST student homework: multipart FormData to Flask `POST /api/tasks/<id>/submit`.
 *
 * FormData is a browser helper that builds a multipart/form-data body (the same kind of request
 * many HTML forms make). We append text fields and an optional File from the <input type="file">.
 *
 * Do NOT set the `Content-Type` header manually — the browser must add the boundary parameter.
 */
async function apiSubmitHomework(taskId, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/tasks/${taskId}/submit`, {
      method: "POST",
      body: formData,
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }

  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Submit failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * PUT student revision: multipart FormData → `PUT /api/submissions/<id>/revision`.
 * Do not set Content-Type — the browser sets multipart boundaries (same as homework POST).
 */
async function apiPutRevisionFormData(submissionId, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/submissions/${submissionId}/revision`, {
      method: "PUT",
      body: formData,
      credentials: EAP_FETCH_CREDENTIALS,
    });
  } catch (err) {
    throw new Error(apiUnreachableMessage());
  }

  const data = await readJsonOrError(response);
  if (!response.ok) {
    const msg =
      (data && (data.error || data.message)) || `Revision submit failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Flask returns `category`; older UI code used `type` for labels — keep both.
 */
function normalizeTask(t) {
  return {
    id: t.id,
    date: t.date,
    title: t.title,
    title_zh: t.title_zh != null ? t.title_zh : null,
    category: t.category,
    type: t.category,
    period: t.period,
    description: t.description,
    description_zh: t.description_zh != null ? t.description_zh : null,
    status: t.status || "Pending",
    class_name: t.class_name != null && t.class_name !== "" ? t.class_name : "EAP047",
    file_path: t.file_path != null && String(t.file_path).trim() !== "" ? String(t.file_path).trim() : null,
    file_name: t.file_name != null && String(t.file_name).trim() !== "" ? String(t.file_name).trim() : null,
  };
}

function isCompleted(task) {
  return String(task.status || "").toLowerCase() === "completed";
}

/**
 * Phase D7: per-student completion from GET /api/tasks/my-completions merge (teacher UI still uses isCompleted(task)).
 */
function isStudentTaskCompleted(task) {
  if (!task || typeof task !== "object") return false;
  if (task.student_completed === true) return true;
  if (task.student_completed === false) return false;
  const st =
    task.my_completion_status != null ? String(task.my_completion_status).trim().toLowerCase() : "";
  return st === "completed";
}

function stampDefaultStudentTaskCompletion(task) {
  if (!task || typeof task !== "object") return;
  task.student_completed = false;
  task.my_completion_status = "Pending";
  task.my_completed_at = null;
}

async function mergeStudentMyCompletionsIntoTasks(tasksNorm, uname, classNameStr) {
  if (!tasksNorm || tasksNorm.length === 0) return;
  const idSet = new Set();
  tasksNorm.forEach((t) => {
    const n = Number(t && t.id, 10);
    if (Number.isFinite(n)) idSet.add(n);
  });
  const ids = Array.from(idSet);
  if (!ids.length) return;
  const trimmedName = uname != null ? String(uname).trim() : "";
  if (!trimmedName) {
    tasksNorm.forEach(stampDefaultStudentTaskCompletion);
    return;
  }
  const qc = new URLSearchParams();
  qc.set("class_name", classNameStr);
  qc.set("task_ids", ids.join(","));
  qc.set("student_username", trimmedName);
  try {
    const payload = await apiGet(`/api/tasks/my-completions?${qc.toString()}`);
    const mapObj =
      payload && payload.completions && typeof payload.completions === "object"
        ? payload.completions
        : {};
    for (let i = 0; i < tasksNorm.length; i += 1) {
      const t = tasksNorm[i];
      const key = String(t.id);
      const c = mapObj[key];
      if (c && typeof c === "object") {
        t.student_completed = !!c.completed;
        t.my_completion_status = c.status != null ? String(c.status) : "Pending";
        t.my_completed_at = c.completed_at != null ? c.completed_at : null;
      } else {
        stampDefaultStudentTaskCompletion(t);
      }
    }
  } catch {
    tasksNorm.forEach(stampDefaultStudentTaskCompletion);
  }
}

/** Sort by calendar date, then period text. */
function compareTasksForSort(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return String(a.period || "").localeCompare(String(b.period || ""), undefined, {
    numeric: true,
  });
}

/**
 * Show a date like 2026-05-09 without timezone surprises.
 */
function formatDisplayDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(eapLocale(), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Fill a <select> with category choices plus an empty first option (for teacher).
 */
function populateCategorySelect(selectEl, includePlaceholder) {
  selectEl.innerHTML = "";
  if (includePlaceholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = t("choose_category");
    selectEl.appendChild(opt);
  }
  TASK_CATEGORIES.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = translateCategory(label);
    selectEl.appendChild(opt);
  });
}

function syncTeacherCategoryChipHighlight(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  const value = String(selectEl.value || "").trim();
  chipsEl.querySelectorAll(".teacher-category-chip").forEach((btn) => {
    const on = btn.getAttribute("data-category") === value;
    btn.classList.toggle("teacher-category-chip--active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function populateTeacherCategoryChips(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  chipsEl.innerHTML = "";
  TASK_CATEGORIES.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "teacher-category-chip";
    btn.textContent = translateCategory(label);
    btn.setAttribute("data-category", label);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      selectEl.value = label;
      syncTeacherCategoryChipHighlight(chipsEl, selectEl);
    });
    chipsEl.appendChild(btn);
  });
  syncTeacherCategoryChipHighlight(chipsEl, selectEl);
}

/**
 * Student filter: "All" plus each category.
 */
function populateStudentFilterSelect(selectEl) {
  selectEl.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = t("all_categories");
  selectEl.appendChild(all);
  TASK_CATEGORIES.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = translateCategory(label);
    selectEl.appendChild(opt);
  });
}

function syncStudentCategoryChipHighlight(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  const val = selectEl.value || "all";
  chipsEl.querySelectorAll(".student-category-chip").forEach((chip) => {
    const cat = chip.getAttribute("data-category");
    const on = cat === val;
    chip.classList.toggle("student-category-chip--active", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function populateStudentCategoryChips(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  chipsEl.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "student-category-chip";
  allBtn.textContent = t("all_categories");
  allBtn.setAttribute("data-category", "all");
  allBtn.setAttribute("aria-pressed", "false");
  allBtn.addEventListener("click", () => {
    selectEl.value = "all";
    syncStudentCategoryChipHighlight(chipsEl, selectEl);
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
  chipsEl.appendChild(allBtn);
  TASK_CATEGORIES.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "student-category-chip";
    btn.textContent = translateCategory(label);
    btn.setAttribute("data-category", label);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      selectEl.value = label;
      syncStudentCategoryChipHighlight(chipsEl, selectEl);
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
    chipsEl.appendChild(btn);
  });
  syncStudentCategoryChipHighlight(chipsEl, selectEl);
}

// ---- Academic + monthly calendar (student / teacher) ---------------------------

/**
 * Semester metadata for labelling each week row.
 * Loaded from GET /api/academic-calendar (manager edits via admin centre).
 */
let ACADEMIC_CALENDAR = {
  semesterStartDate: "2026-02-23",
  teachingWeeks: 16,
  notableDates: {},
};
let academicCalendarLoadPromise = null;

function applyAcademicCalendarPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.semester_start_date) {
    ACADEMIC_CALENDAR.semesterStartDate = String(payload.semester_start_date);
  }
  if (payload.teaching_weeks != null) {
    ACADEMIC_CALENDAR.teachingWeeks = Number(payload.teaching_weeks) || 16;
  }
  if (payload.notable_dates && typeof payload.notable_dates === "object") {
    ACADEMIC_CALENDAR.notableDates = { ...payload.notable_dates };
  }
}

async function ensureAcademicCalendarLoaded() {
  if (!academicCalendarLoadPromise) {
    academicCalendarLoadPromise = (async () => {
      try {
        const data = await apiGet("/api/academic-calendar");
        applyAcademicCalendarPayload(data);
      } catch {
        /* keep in-page defaults */
      }
    })();
  }
  await academicCalendarLoadPromise;
}

function formatNotableDatesForTextarea(notableDates) {
  return Object.entries(notableDates || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, label]) => `${date} | ${label}`)
    .join("\n");
}

function parseNotableDatesFromTextarea(text) {
  const out = {};
  String(text || "")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const pipe = trimmed.indexOf("|");
      if (pipe < 0) return;
      const date = trimmed.slice(0, pipe).trim();
      const label = trimmed.slice(pipe + 1).trim();
      if (date && label) out[date] = label;
    });
  return out;
}

/**
 * Format a local calendar day as YYYY-MM-DD without UTC shift bugs.
 * `monthIndex` is 0-based (January = 0), same as JavaScript Date.
 */
function formatISODateLocal(year, monthIndex, day) {
  const y = String(year);
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today’s date in local time as YYYY-MM-DD. */
function getTodayISODateLocal() {
  const n = new Date();
  return formatISODateLocal(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * ISO 8601 week number for a local calendar day (Monday-based weeks, week 1 contains Jan 4).
 * Beginner note: we use local noon internally to dodge daylight-saving edge cases.
 */
function isoWeekNumberForLocalDay(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day, 12, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  // Thursday in this week decides the ISO year.
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const jan4 = new Date(thursday.getFullYear(), 0, 4, 12, 0, 0);
  const jan4Monday = new Date(jan4);
  jan4Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week1Monday = jan4Monday;
  const monday = new Date(thursday);
  monday.setDate(thursday.getDate() - 3);
  return 1 + Math.round((monday - week1Monday) / (7 * dayMs));
}

/**
 * Teaching week index (1-based) from ACADEMIC_CALENDAR.semesterStartDate, or null if out of range.
 */
function teachingWeekIndexForISODate(isoDateStr) {
  if (!isoDateStr || !ACADEMIC_CALENDAR.semesterStartDate) return null;
  const start = new Date(`${ACADEMIC_CALENDAR.semesterStartDate}T12:00:00`);
  const d = new Date(`${isoDateStr}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(d.getTime())) return null;
  const diffDays = Math.floor((d - start) / (24 * 60 * 60 * 1000));
  const weekIdx = Math.floor(diffDays / 7) + 1;
  if (weekIdx < 1 || weekIdx > ACADEMIC_CALENDAR.teachingWeeks) return null;
  return weekIdx;
}

function academicCalendarNoteForISODate(isoDateStr) {
  if (!isoDateStr || !ACADEMIC_CALENDAR.notableDates) return "";
  return ACADEMIC_CALENDAR.notableDates[isoDateStr] || "";
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedFileSummary(inputEl) {
  if (!inputEl || !inputEl.files || inputEl.files.length === 0) {
    return "No file selected.";
  }
  const file = inputEl.files[0];
  const size = formatFileSize(file.size);
  return size ? `Selected: ${file.name} (${size})` : `Selected: ${file.name}`;
}

function updateSelectedFileSummary(inputEl, summaryEl) {
  if (!summaryEl) return;
  summaryEl.textContent = selectedFileSummary(inputEl);
  summaryEl.classList.toggle(
    "file-selection-summary--active",
    !!(inputEl && inputEl.files && inputEl.files.length)
  );
}

/** Short label inside a calendar cell (task title). */
function truncateCalendarLabel(text, maxLen) {
  const s = String(text || "").trim();
  if (!s) return t("cal_task_default");
  const cap = maxLen ?? 28;
  return s.length <= cap ? s : `${s.slice(0, cap - 1)}…`;
}

/**
 * Maps API category strings to pill colour classes (must match CSS in style.css).
 * Covers TASK_CATEGORIES plus common synonyms like “Self-study”.
 */
function calendarCategoryClass(category) {
  const raw = String(category || "").trim().toLowerCase();
  if (!raw) return "cal-pill--other";

  if (raw.includes("classroom") || raw.includes("in-class")) return "cal-pill--classroom";
  if (raw.includes("homework")) return "cal-pill--homework";
  if (raw.includes("vocab")) return "cal-pill--vocab";
  if (raw.includes("listen")) return "cal-pill--listening";
  if (raw.includes("read")) return "cal-pill--reading";
  if (raw.includes("speak")) return "cal-pill--speaking";
  if (raw.includes("writ")) return "cal-pill--writing";
  if (raw.includes("self") && raw.includes("stud")) return "cal-pill--selfstudy";

  return "cal-pill--other";
}

/**
 * Build `{ "YYYY-MM-DD": [tasks…] }` from a flat task list returned by Flask.
 */
function bucketTasksByDate(tasks) {
  const map = {};
  tasks.forEach((t) => {
    const n = normalizeTask(t);
    if (!n.date) return;
    if (!map[n.date]) map[n.date] = [];
    map[n.date].push(n);
  });
  Object.keys(map).forEach((k) => {
    map[k].sort(compareTasksForSort);
  });
  return map;
}

const CALENDAR_MAX_VISIBLE_PILLS = 3;
const EAP_MOBILE_LAYOUT_MQ =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(max-width: 768px)")
    : null;

/** Phase H: narrow viewport — stacked master–detail, compact calendar. */
function isEapMobileLayout() {
  return !!(EAP_MOBILE_LAYOUT_MQ && EAP_MOBILE_LAYOUT_MQ.matches);
}

function calendarMaxVisiblePills() {
  return isEapMobileLayout() ? 1 : CALENDAR_MAX_VISIBLE_PILLS;
}

function setMobileMasterDetailOpen(workspaceEl, open) {
  if (!workspaceEl) return;
  workspaceEl.classList.toggle(
    workspaceEl.classList.contains("teacher-daily-workspace")
      ? "teacher-daily-workspace--detail-open"
      : "student-daily-workspace--detail-open",
    !!open,
  );
}

/**
 * Paint one month grid into `mountEl`.
 *
 * Beginner notes:
 * - We build real <button> cells for days (good for keyboard + screen readers).
 * - “Blank” cells before day 1 are empty <div>s (not clickable).
 * - Week numbers use the first real day in each row (your desk planner style).
 */
function renderMonthlyCalendarInto(mountEl, config) {
  if (!mountEl) return;

  const {
    year,
    monthIndex,
    selectedISO,
    todayISO,
    tasksByDate,
    onSelectDate,
    onPrevMonth,
    onNextMonth,
    personalStudyByDate = null,
    classStudyPlanSummaryByDate = null,
  } = config;

  mountEl.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = isEapMobileLayout() ? "eap-cal eap-cal--compact" : "eap-cal";

  const top = document.createElement("div");
  top.className = "eap-cal__toolbar";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "btn-secondary eap-cal__nav-btn";
  prevBtn.textContent = t("cal_prev_month");
  prevBtn.addEventListener("click", () => onPrevMonth());

  const title = document.createElement("h3");
  title.className = "eap-cal__title";
  const titleDate = new Date(year, monthIndex, 1);
  title.textContent = titleDate.toLocaleDateString(eapLocale(), {
    month: "long",
    year: "numeric",
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn-secondary eap-cal__nav-btn";
  nextBtn.textContent = t("cal_next_month");
  nextBtn.addEventListener("click", () => onNextMonth());

  top.appendChild(prevBtn);
  top.appendChild(title);
  top.appendChild(nextBtn);

  const grid = document.createElement("div");
  grid.className = "eap-cal__grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", `${title.textContent} planner`);

  const headerRow = document.createElement("div");
  headerRow.className = "eap-cal__row eap-cal__row--head";

  const corner = document.createElement("div");
  corner.className = "eap-cal__corner";
  corner.textContent = t("cal_week");
  headerRow.appendChild(corner);

  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`cal_weekday_${i}`));
  WEEKDAYS.forEach((label) => {
    const h = document.createElement("div");
    h.className = "eap-cal__weekday";
    h.textContent = label;
    headerRow.appendChild(h);
  });

  grid.appendChild(headerRow);

  const firstDow = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  /** @type {{ day: number|null, iso: string|null }[]} */
  const slots = [];

  for (let i = 0; i < firstDow; i += 1) {
    slots.push({ day: null, iso: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    slots.push({ day, iso: formatISODateLocal(year, monthIndex, day) });
  }
  while (slots.length % 7 !== 0) {
    slots.push({ day: null, iso: null });
  }

  for (let r = 0; r < slots.length / 7; r += 1) {
    const row = document.createElement("div");
    row.className = "eap-cal__row eap-cal__row--body";

    const rowSlice = slots.slice(r * 7, r * 7 + 7);
    const anchor = rowSlice.find((s) => s.iso);

    const weekCell = document.createElement("div");
    weekCell.className = "eap-cal__week-num";
    if (anchor && anchor.iso) {
      const parts = anchor.iso.split("-").map(Number);
      const isoWk = isoWeekNumberForLocalDay(parts[0], parts[1] - 1, parts[2]);
      const tw = teachingWeekIndexForISODate(anchor.iso);
      const wkEl = document.createElement("span");
      wkEl.className = "eap-cal__week-num-main";
      wkEl.textContent = t("cal_week_n", { n: isoWk });
      weekCell.appendChild(wkEl);
      if (tw != null) {
        const twEl = document.createElement("span");
        twEl.className = "eap-cal__week-num-sub";
        twEl.textContent = t("cal_teaching_week", { n: tw });
        weekCell.appendChild(twEl);
      }
    }
    row.appendChild(weekCell);

    rowSlice.forEach((slot) => {
      if (!slot.iso) {
        const blank = document.createElement("div");
        blank.className = "eap-cal__cell eap-cal__cell--blank";
        blank.setAttribute("aria-hidden", "true");
        row.appendChild(blank);
        return;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "eap-cal__cell eap-cal__cell--day";
      if (slot.iso === todayISO) btn.classList.add("eap-cal__cell--today");
      if (selectedISO && slot.iso === selectedISO) btn.classList.add("eap-cal__cell--selected");
      const dayNote = academicCalendarNoteForISODate(slot.iso);
      if (dayNote) {
        btn.classList.add("eap-cal__cell--notable");
        btn.title = dayNote;
      }

      const dayNum = document.createElement("span");
      dayNum.className = "eap-cal__day-num";
      dayNum.textContent = String(slot.day);

      const pills = document.createElement("div");
      pills.className = "eap-cal__pills";

      if (dayNote) {
        const noteEl = document.createElement("span");
        noteEl.className = "eap-cal__date-note";
        noteEl.textContent = dayNote;
        pills.appendChild(noteEl);
      }

      const dayTasks = (tasksByDate && tasksByDate[slot.iso]) || [];
      const maxPills = calendarMaxVisiblePills();
      const show = dayTasks.slice(0, maxPills);
      const more = Math.max(0, dayTasks.length - show.length);

      if (isEapMobileLayout() && dayTasks.length > 0) {
        const countEl = document.createElement("span");
        countEl.className = "eap-cal__task-count";
        countEl.textContent =
          dayTasks.length === 1
            ? t("cal_tasks_one")
            : t("cal_tasks_n", { n: dayTasks.length });
        pills.appendChild(countEl);
      }

      show.forEach((task) => {
        const pill = document.createElement("span");
        pill.className = `cal-pill ${calendarCategoryClass(task.category)}`;
        pill.textContent = truncateCalendarLabel(taskDisplayTitle(task), 30);
        pills.appendChild(pill);
      });

      if (more > 0) {
        const moreEl = document.createElement("span");
        moreEl.className = "cal-pill cal-pill--more";
        moreEl.textContent = t("cal_more", { n: more });
        pills.appendChild(moreEl);
      }

      if (personalStudyByDate && slot.iso) {
        const ps = personalStudyByDate[slot.iso];
        if (ps && ps.total > 0) {
          const myPlans = document.createElement("span");
          myPlans.className = "eap-cal__my-plans";
          const n = Number(ps.total);
          myPlans.textContent = Number.isFinite(n) && n === 1 ? t("cal_my_plans_one") : t("cal_my_plans", { n });
          pills.appendChild(myPlans);
        }
      }

      if (classStudyPlanSummaryByDate && slot.iso) {
        const cs = classStudyPlanSummaryByDate[slot.iso];
        if (cs && cs.total > 0) {
          const classPlans = document.createElement("span");
          classPlans.className = "eap-cal__class-student-plans";
          const tot = Number(cs.total);
          const stud = Number(cs.students);
          if (
            Number.isFinite(tot) &&
            tot > 0 &&
            Number.isFinite(stud) &&
            stud > 0
          ) {
            classPlans.textContent = t("cal_student_plans_detail", { students: stud, plans: tot });
          } else {
            classPlans.textContent = Number.isFinite(tot) && tot === 1 ? t("cal_student_plans_one") : t("cal_student_plans", { n: tot });
          }
          pills.appendChild(classPlans);
        }
      }

      btn.appendChild(dayNum);
      btn.appendChild(pills);
      btn.addEventListener("click", () => onSelectDate(slot.iso));
      row.appendChild(btn);
    });

    grid.appendChild(row);
  }

  wrap.appendChild(top);
  wrap.appendChild(grid);
  mountEl.appendChild(wrap);
}

// ---- Login page (index.html) --------------------------------------------------

/**
 * Save the logged-in user for this tab.
 * sessionStorage only stores strings — we JSON.stringify the user object from the API.
 * teacher.html / student.html use getLoggedInUser(); boot also calls validatePageSessionOrFallback() (Phase D2).
 */
function saveUserToSession(user) {
  authStorageGet().setItem(SESSION_USER_KEY, JSON.stringify(user));
}

/**
 * Wire one login card (student or teacher).
 *
 * Why two forms on the page? Students and teachers each get a clear, separate entry point.
 * The backend still has one /api/login; after a successful login we check that the account's
 * role matches the card they used (so teacher1 on the student card shows a friendly error).
 *
 * Flow: POST /api/login → if data.success, compare data.user.role to expectedRole for THIS card.
 */
function setupRoleLoginCard(config) {
  const {
    form,
    errorEl,
    submitBtn,
    usernameInput,
    passwordInput,
    expectedRole,
    wrongRoleMessage,
    successUrl,
    submitLabelIdle,
  } = config;

  if (!form || !errorEl || !submitBtn || !usernameInput || !passwordInput) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorEl.textContent = "";
    errorEl.classList.add("hidden");

    const username = (usernameInput.value || "").trim();
    const password = passwordInput.value || "";

    if (!username || !password) {
      errorEl.textContent = t("login_enter_both");
      errorEl.classList.remove("hidden");
      return;
    }

    const idleLabel = submitLabelIdle || submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = t("signing_in");

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: EAP_FETCH_CREDENTIALS,
      });

      const data = await readJsonOrError(response);

      if (!response.ok) {
        errorEl.textContent =
          (data && (data.message || data.error)) || `Server error (${response.status}).`;
        errorEl.classList.remove("hidden");
        return;
      }

      if (!data || !data.success) {
        errorEl.textContent =
          (data && data.message) || "Invalid username or password.";
        errorEl.classList.remove("hidden");
        return;
      }

      if (data.user.role !== expectedRole) {
        errorEl.textContent = wrongRoleMessage;
        errorEl.classList.remove("hidden");
        return;
      }

      const nextAfterLogin = loginNextRedirectUrl(expectedRole);
      if (nextAfterLogin) {
        saveUserToSession(data.user);
        window.location.href = nextAfterLogin;
        return;
      }

      saveUserToSession(data.user);
      window.location.href = successUrl;
    } catch (err) {
      /*
        fetch() throws if there is no response (Flask stopped, wrong port, firewall, etc.).
        We keep the message beginner-friendly and point at /api/health for a quick check.
      */
      errorEl.textContent =
        `Cannot reach the API at ${API_BASE}. Start Flask from the backend folder ` +
        `(./venv/bin/python app.py). Then open ${API_BASE}/api/health — you should see JSON. ` +
        `Wrong URL or port? Edit frontend/api-config.js (window.EAP_API_BASE) so it matches Flask's startup message.`;
      errorEl.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = idleLabel;
    }
  });
}

function roleHomeUrl(role) {
  if (role === "teacher") return hostedUiPageUrl("teacher.html");
  if (role === "student") return hostedUiPageUrl("student.html");
  if (role === "admin") return hostedUiPageUrl("admin.html");
  return hostedUiPageUrl("index.html");
}

function loginNextRedirectUrl(role) {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || typeof next !== "string") return null;
  const trimmed = next.trim();
  if (!trimmed || trimmed.includes("..")) return null;
  if (role === "student" && !/^student(-live|\.html|-self-study)/i.test(trimmed)) {
    return null;
  }
  if (role === "teacher" && !/^teacher(-live|\.html|-game-builder)/i.test(trimmed)) {
    return null;
  }
  if (typeof hostedUiPageUrl === "function") {
    return trimmed.startsWith("http") ? trimmed : hostedUiPageUrl(trimmed);
  }
  return trimmed;
}

function loginUrlWithNext(nextPath) {
  const next = encodeURIComponent(nextPath || "");
  return hostedUiPageUrl(`index.html?next=${next}`);
}

/**
 * Phase L27: shared role check for student/teacher satellite pages.
 * Returns { ok, user } or { ok: false, reason, redirect?, user? }.
 */
async function ensurePageRole(expectedRole) {
  const serverUser = await fetchCurrentSessionUser();

  if (serverUser) {
    if (serverUser.role !== expectedRole) {
      return {
        ok: false,
        reason: "wrong_role",
        user: serverUser,
        redirect: roleHomeUrl(serverUser.role),
      };
    }
    saveUserToSession(serverUser);
    return { ok: true, user: serverUser };
  }

  if (await isApiReachable()) {
    const path =
      typeof window !== "undefined" && window.location.pathname
        ? `${window.location.pathname.split("/").pop() || ""}${window.location.search || ""}`
        : "";
    return {
      ok: false,
      reason: "login_required",
      redirect: loginUrlWithNext(path),
    };
  }

  const local = getLoggedInUser();
  if (local && local.role === expectedRole) {
    return { ok: true, user: local };
  }

  return { ok: false, reason: "login_required", redirect: hostedUiPageUrl("index.html") };
}

/**
 * Show wrong-role message on satellite pages (student self-study, live join, etc.).
 */
function renderWrongRoleGate(actualRole) {
  const main =
    document.getElementById("main") ||
    document.getElementById("slive-main") ||
    document.querySelector(".ssc-main");
  if (!main) {
    window.location.replace(roleHomeUrl(actualRole));
    return;
  }
  const homeLabel =
    actualRole === "teacher"
      ? t("nav_go_teacher_home")
      : actualRole === "student"
        ? t("nav_go_student_home")
        : t("nav_go_login");
  const homeUrl = roleHomeUrl(actualRole);
  main.innerHTML = `
    <section class="eap-role-gate" role="alert">
      <h1>${escapeHtml(t("role_gate_title"))}</h1>
      <p>${escapeHtml(
        actualRole === "teacher" ? t("role_gate_signed_in_teacher") : t("role_gate_signed_in_other"),
      )}</p>
      <div class="eap-role-gate__actions">
        <a class="btn-primary" href="${escapeHtml(homeUrl)}">${escapeHtml(homeLabel)}</a>
        <button type="button" class="btn-secondary" id="eap-role-gate-logout">${escapeHtml(t("logout"))}</button>
      </div>
    </section>
  `;
  document.getElementById("eap-role-gate-logout")?.addEventListener("click", () => logoutAndGoHome());
  if (window.EAP_I18N) window.EAP_I18N.applyStatic();
}

function initLoginPage() {
  const studentForm = document.getElementById("student-login-form");
  const teacherForm = document.getElementById("teacher-login-form");
  const adminForm = document.getElementById("admin-login-form");
  if (!studentForm || !teacherForm) return;

  if (redirectFilePageToHostedUi()) return;

  /*
    index.html layout/CSS handles hero motion. This file only wires the two forms to
    POST /api/login — do not change IDs without updating setupRoleLoginCard() configs below.
  */

  void (async () => {
    const serverUser = await fetchCurrentSessionUser();
    if (
      serverUser &&
      (serverUser.role === "teacher" || serverUser.role === "student" || serverUser.role === "admin")
    ) {
      saveUserToSession(serverUser);
      const nextUrl = loginNextRedirectUrl(serverUser.role);
      if (nextUrl) {
        window.location.replace(nextUrl);
        return;
      }
      if (serverUser.role === "teacher") {
        window.location.replace(hostedUiPageUrl("teacher.html"));
      } else if (serverUser.role === "student") {
        window.location.replace(hostedUiPageUrl("student.html"));
      } else {
        window.location.replace(hostedUiPageUrl("admin.html"));
      }
      return;
    }

    const existing = getLoggedInUser();
    if (existing && existing.role === "teacher") {
      window.location.replace(hostedUiPageUrl("teacher.html"));
      return;
    }
    if (existing && existing.role === "student") {
      window.location.replace(hostedUiPageUrl("student.html"));
      return;
    }
    if (existing && existing.role === "admin") {
      window.location.replace(hostedUiPageUrl("admin.html"));
      return;
    }

    setupRoleLoginCard({
      form: studentForm,
      errorEl: document.getElementById("student-login-error"),
      submitBtn: document.getElementById("student-login-submit"),
      usernameInput: document.getElementById("student-username"),
      passwordInput: document.getElementById("student-password"),
      expectedRole: "student",
      wrongRoleMessage: "This account is not a student account.",
      successUrl: hostedUiPageUrl("student.html"),
      submitLabelIdle: t("login_student_btn"),
    });

    setupRoleLoginCard({
      form: teacherForm,
      errorEl: document.getElementById("teacher-login-error"),
      submitBtn: document.getElementById("teacher-login-submit"),
      usernameInput: document.getElementById("teacher-username"),
      passwordInput: document.getElementById("teacher-password"),
      expectedRole: "teacher",
      wrongRoleMessage: "This account is not a teacher account.",
      successUrl: hostedUiPageUrl("teacher.html"),
      submitLabelIdle: t("login_teacher_btn"),
    });

    if (adminForm) {
      setupRoleLoginCard({
        form: adminForm,
        errorEl: document.getElementById("admin-login-error"),
        submitBtn: document.getElementById("admin-login-submit"),
        usernameInput: document.getElementById("admin-username"),
        passwordInput: document.getElementById("admin-password"),
        expectedRole: "admin",
        wrongRoleMessage: t("login_wrong_role_admin"),
        successUrl: hostedUiPageUrl("admin.html"),
        submitLabelIdle: t("login_admin_btn"),
      });
    }
  })();
}

// ---- Admin page (admin.html) — Phase E1 --------------------------------------

function setAdminPageMessage(el, text, isError) {
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.classList.add("hidden");
    el.classList.remove("form-message--error", "form-message--success");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("form-message--error", Boolean(isError));
  el.classList.toggle("form-message--success", !isError);
}

function renderAdminTeachersTable(teachers, tbody, emptyEl, onToggle) {
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = Array.isArray(teachers) ? teachers : [];
  if (emptyEl) emptyEl.classList.toggle("hidden", list.length > 0);
  list.forEach((teacher) => {
    const tr = document.createElement("tr");
    const authorized = Boolean(teacher.is_authorized);
    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = authorized ? "admin-badge admin-badge--ok" : "admin-badge admin-badge--pending";
    badge.textContent = authorized ? t("admin_status_authorized") : t("admin_status_pending");
    statusTd.appendChild(badge);

    const actionTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = authorized ? "btn-secondary" : "btn-primary";
    btn.textContent = authorized ? t("admin_revoke_btn") : t("admin_authorize_btn");
    btn.addEventListener("click", () => onToggle(teacher, !authorized, btn));
    actionTd.appendChild(btn);

    const classLabel =
      Array.isArray(teacher.assigned_classes) && teacher.assigned_classes.length
        ? teacher.assigned_classes.join(", ")
        : teacher.class_name || "—";
    tr.innerHTML = "";
    [teacher.username || "—", teacher.full_name || "—", classLabel].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tr.appendChild(statusTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

function renderAdminStudentsTable(students, tbody, emptyEl) {
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = Array.isArray(students) ? students : [];
  if (emptyEl) emptyEl.classList.toggle("hidden", list.length > 0);
  list.forEach((student) => {
    const tr = document.createElement("tr");
    const classLabel =
      Array.isArray(student.assigned_classes) && student.assigned_classes.length
        ? student.assigned_classes.join(", ")
        : student.class_name || "—";
    [student.username || "—", student.full_name || "—", classLabel].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function initAdminPage() {
  if (document.body.getAttribute("data-page") !== "admin") return;
  if (redirectFilePageToHostedUi()) return;

  void (async () => {
    const sessionUser = await validatePageSessionOrFallback("admin");
    if (!sessionUser) return;

    initAppPageHeader();

    const errorEl = document.getElementById("admin-page-error");
    const statusEl = document.getElementById("admin-page-status");
    const teachersTbody = document.getElementById("admin-teachers-tbody");
    const studentsTbody = document.getElementById("admin-students-tbody");
    const teachersEmpty = document.getElementById("admin-teachers-empty");
    const studentsEmpty = document.getElementById("admin-students-empty");

    let teachersCache = [];
    let studentsCache = [];
    let classesCache = [];
    let activeClassId = null;

    const classesTbody = document.getElementById("admin-classes-tbody");
    const classesEmpty = document.getElementById("admin-classes-empty");
    const classCreateForm = document.getElementById("admin-class-create-form");
    const classDetailEl = document.getElementById("admin-class-detail");
    const classDetailTitle = document.getElementById("admin-class-detail-title");
    const classTeachersList = document.getElementById("admin-class-teachers-list");
    const classStudentsList = document.getElementById("admin-class-students-list");
    const classAddTeacherSel = document.getElementById("admin-class-add-teacher");
    const classAddStudentSel = document.getElementById("admin-class-add-student");
    const classAddTeacherBtn = document.getElementById("admin-class-add-teacher-btn");
    const classAddStudentBtn = document.getElementById("admin-class-add-student-btn");

    function formatAssignedClasses(user) {
      if (Array.isArray(user.assigned_classes) && user.assigned_classes.length) {
        return user.assigned_classes.join(", ");
      }
      return user.class_name || "—";
    }

    function populateClassMemberSelects(classDetail, allTeachers, allStudents) {
      if (!classAddTeacherSel || !classAddStudentSel) return;
      const inClassTeacherIds = new Set((classDetail.teachers || []).map((t) => t.id));
      const inClassStudentIds = new Set((classDetail.students || []).map((s) => s.id));

      classAddTeacherSel.innerHTML = "";
      const teacherPlaceholder = document.createElement("option");
      teacherPlaceholder.value = "";
      teacherPlaceholder.textContent = t("admin_add_teacher_btn");
      classAddTeacherSel.appendChild(teacherPlaceholder);
      allTeachers
        .filter((row) => !inClassTeacherIds.has(row.id))
        .forEach((row) => {
          const opt = document.createElement("option");
          opt.value = String(row.id);
          opt.textContent = `${row.username} (${row.full_name || row.username})`;
          classAddTeacherSel.appendChild(opt);
        });

      classAddStudentSel.innerHTML = "";
      const studentPlaceholder = document.createElement("option");
      studentPlaceholder.value = "";
      studentPlaceholder.textContent = t("admin_add_student_btn");
      classAddStudentSel.appendChild(studentPlaceholder);
      allStudents
        .filter((row) => !inClassStudentIds.has(row.id))
        .forEach((row) => {
          const opt = document.createElement("option");
          opt.value = String(row.id);
          opt.textContent = `${row.username} (${row.full_name || row.username})`;
          classAddStudentSel.appendChild(opt);
        });
    }

    function renderClassMemberList(listEl, members, classId, role) {
      if (!listEl) return;
      listEl.innerHTML = "";
      const list = Array.isArray(members) ? members : [];
      if (!list.length) {
        const li = document.createElement("li");
        li.textContent = "—";
        listEl.appendChild(li);
        return;
      }
      list.forEach((member) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${member.username}${member.full_name ? ` · ${member.full_name}` : ""}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-secondary";
        btn.textContent = t("admin_remove_member_btn");
        btn.addEventListener("click", async () => {
          try {
            const path =
              role === "teacher"
                ? `/api/admin/classes/${classId}/teachers/${member.id}`
                : `/api/admin/classes/${classId}/students/${member.id}`;
            const updated = await apiDelete(path);
            showClassDetail(updated);
            setAdminPageMessage(statusEl, t("admin_class_members_updated"), false);
            await reloadAdminLists();
          } catch (err) {
            setAdminPageMessage(errorEl, err.message, true);
          }
        });
        li.appendChild(label);
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    }

    function showClassDetail(classDetail) {
      if (!classDetailEl || !classDetail) return;
      activeClassId = classDetail.id;
      classDetailEl.classList.remove("hidden");
      if (classDetailTitle) {
        classDetailTitle.textContent = `${classDetail.class_code} — ${classDetail.display_name || classDetail.class_code}`;
      }
      renderClassMemberList(classTeachersList, classDetail.teachers, classDetail.id, "teacher");
      renderClassMemberList(classStudentsList, classDetail.students, classDetail.id, "student");
      populateClassMemberSelects(classDetail, teachersCache, studentsCache);
    }

    function renderAdminClassesTable(classes) {
      if (!classesTbody) return;
      classesTbody.innerHTML = "";
      const list = Array.isArray(classes) ? classes : [];
      if (classesEmpty) classesEmpty.classList.toggle("hidden", list.length > 0);
      list.forEach((cls) => {
        const tr = document.createElement("tr");
        [cls.class_code, cls.display_name || cls.class_code, String(cls.teacher_count ?? 0), String(cls.student_count ?? 0)].forEach(
          (val) => {
            const td = document.createElement("td");
            td.textContent = val;
            tr.appendChild(td);
          },
        );
        const actionTd = document.createElement("td");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-secondary";
        btn.textContent = t("admin_class_manage_btn");
        btn.addEventListener("click", async () => {
          try {
            const detail = await apiGet(`/api/admin/classes/${cls.id}`);
            showClassDetail(detail);
          } catch (err) {
            setAdminPageMessage(errorEl, err.message, true);
          }
        });
        actionTd.appendChild(btn);
        tr.appendChild(actionTd);
        classesTbody.appendChild(tr);
      });
    }

    async function reloadAdminLists() {
      setAdminPageMessage(errorEl, "", false);
      try {
        const [teachers, students, classes] = await Promise.all([
          apiGet("/api/admin/teachers"),
          apiGet("/api/admin/students"),
          apiGet("/api/admin/classes"),
        ]);
        teachersCache = Array.isArray(teachers) ? teachers : [];
        studentsCache = Array.isArray(students) ? students : [];
        classesCache = Array.isArray(classes) ? classes : [];
        renderAdminTeachersTable(teachersCache, teachersTbody, teachersEmpty, handleTeacherToggle);
        renderAdminStudentsTable(studentsCache, studentsTbody, studentsEmpty);
        renderAdminClassesTable(classesCache);
        if (activeClassId) {
          try {
            const detail = await apiGet(`/api/admin/classes/${activeClassId}`);
            showClassDetail(detail);
          } catch {
            activeClassId = null;
            if (classDetailEl) classDetailEl.classList.add("hidden");
          }
        }
      } catch (err) {
        setAdminPageMessage(errorEl, err.message || t("admin_load_error"), true);
      }
    }

    async function handleTeacherToggle(teacher, authorized, btn) {
      if (!teacher || teacher.id == null) return;
      if (btn) btn.disabled = true;
      setAdminPageMessage(statusEl, "", false);
      try {
        const updated = await apiPutJson(`/api/admin/teachers/${teacher.id}/authorized`, {
          authorized,
        });
        const idx = teachersCache.findIndex((row) => row.id === teacher.id);
        if (idx >= 0) teachersCache[idx] = updated;
        else teachersCache.push(updated);
        renderAdminTeachersTable(teachersCache, teachersTbody, teachersEmpty, handleTeacherToggle);
        setAdminPageMessage(statusEl, t("admin_updated"), false);
      } catch (err) {
        setAdminPageMessage(errorEl, err.message, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    const calStartEl = document.getElementById("admin-calendar-semester-start");
    const calWeeksEl = document.getElementById("admin-calendar-teaching-weeks");
    const calNotesEl = document.getElementById("admin-calendar-notes");
    const calSaveBtn = document.getElementById("admin-calendar-save-btn");

    async function loadAdminCalendarForm() {
      if (!calStartEl) return;
      try {
        const data = await apiGet("/api/admin/academic-calendar");
        applyAcademicCalendarPayload(data);
        calStartEl.value = data.semester_start_date || "";
        calWeeksEl.value = String(data.teaching_weeks != null ? data.teaching_weeks : 16);
        calNotesEl.value = formatNotableDatesForTextarea(data.notable_dates);
      } catch (err) {
        setAdminPageMessage(errorEl, err.message || t("admin_cal_load_error"), true);
      }
    }

    if (calSaveBtn) {
      calSaveBtn.addEventListener("click", async () => {
        setAdminPageMessage(statusEl, "", false);
        calSaveBtn.disabled = true;
        try {
          const saved = await apiPutJson("/api/admin/academic-calendar", {
            semester_start_date: calStartEl.value,
            teaching_weeks: Number(calWeeksEl.value, 10),
            notable_dates: parseNotableDatesFromTextarea(calNotesEl.value),
          });
          applyAcademicCalendarPayload(saved);
          academicCalendarLoadPromise = null;
          await ensureAcademicCalendarLoaded();
          calNotesEl.value = formatNotableDatesForTextarea(saved.notable_dates);
          setAdminPageMessage(statusEl, t("admin_cal_saved"), false);
        } catch (err) {
          setAdminPageMessage(errorEl, err.message, true);
        } finally {
          calSaveBtn.disabled = false;
        }
      });
    }

    if (classCreateForm) {
      classCreateForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const codeEl = document.getElementById("admin-new-class-code");
        const nameEl = document.getElementById("admin-new-class-name");
        const classCode = (codeEl && codeEl.value ? codeEl.value : "").trim();
        const displayName = (nameEl && nameEl.value ? nameEl.value : "").trim() || classCode;
        if (!classCode) return;
        try {
          const created = await apiPost("/api/admin/classes", {
            class_code: classCode,
            display_name: displayName,
          });
          if (codeEl) codeEl.value = "";
          if (nameEl) nameEl.value = "";
          setAdminPageMessage(statusEl, t("admin_class_created"), false);
          await reloadAdminLists();
          showClassDetail(created);
        } catch (err) {
          setAdminPageMessage(errorEl, err.message, true);
        }
      });
    }

    if (classAddTeacherBtn) {
      classAddTeacherBtn.addEventListener("click", async () => {
        if (!activeClassId || !classAddTeacherSel || !classAddTeacherSel.value) return;
        try {
          const updated = await apiPost(`/api/admin/classes/${activeClassId}/teachers`, {
            teacher_id: Number(classAddTeacherSel.value, 10),
          });
          showClassDetail(updated);
          setAdminPageMessage(statusEl, t("admin_class_members_updated"), false);
          await reloadAdminLists();
        } catch (err) {
          setAdminPageMessage(errorEl, err.message, true);
        }
      });
    }

    if (classAddStudentBtn) {
      classAddStudentBtn.addEventListener("click", async () => {
        if (!activeClassId || !classAddStudentSel || !classAddStudentSel.value) return;
        try {
          const updated = await apiPost(`/api/admin/classes/${activeClassId}/students`, {
            student_id: Number(classAddStudentSel.value, 10),
          });
          showClassDetail(updated);
          setAdminPageMessage(statusEl, t("admin_class_members_updated"), false);
          await reloadAdminLists();
        } catch (err) {
          setAdminPageMessage(errorEl, err.message, true);
        }
      });
    }

    window.__eapAdminLangRefresh = () => {
      renderAdminTeachersTable(teachersCache, teachersTbody, teachersEmpty, handleTeacherToggle);
      renderAdminStudentsTable(studentsCache, studentsTbody, studentsEmpty);
      renderAdminClassesTable(classesCache);
      void reloadAdminLists();
      void loadAdminCalendarForm();
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    };

    await Promise.all([reloadAdminLists(), loadAdminCalendarForm()]);
  })();
}

// ---- Teacher page (teacher.html) ---------------------------------------------

/**
 * Build one row for the teacher task “facts” list (label + value).
 * optionalDdClass: extra CSS on the <dd> (e.g. status styling).
 */
function appendTaskFact(dl, label, value, optionalDdClass) {
  const dt = document.createElement("dt");
  dt.className = "task-card__fact-label";
  dt.textContent = label;
  const dd = document.createElement("dd");
  let ddClass = "task-card__fact-value";
  if (optionalDdClass) ddClass += " " + optionalDdClass;
  dd.className = ddClass;
  dd.textContent = value;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

/**
 * Fill the teacher’s “submissions” panel with one mini-card per homework row from the API.
 *
 * `taskId` lets “Save Feedback” refresh this list via `GET /api/tasks/<id>/submissions`.
 * File downloads use GET /submission-files/<filename>.
 */
function renderTeacherSubmissionsInto(container, submissions, taskId) {
  container.innerHTML = "";

  if (!Array.isArray(submissions) || submissions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-submissions-empty";
    empty.textContent = t("no_submissions");
    container.appendChild(empty);
    return;
  }

  function fact(dl, label, value) {
    const dt = document.createElement("dt");
    dt.className = "task-submission-fact__label";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "task-submission-fact__value";
    const str =
      value != null && String(value).trim() !== "" ? String(value).trim() : "—";
    dd.textContent = str;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  /** One label + value line inside the “Student Revision” block (not the top dl grid). */
  function factLine(container, label, value) {
    const p = document.createElement("p");
    p.className = "task-submission-revision-meta";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(
      document.createTextNode(
        value != null && String(value).trim() !== "" ? String(value).trim() : "—"
      )
    );
    container.appendChild(p);
  }

  submissions.forEach((s) => {
    const submissionId =
      s.id != null && String(s.id).trim() !== "" ? String(s.id).trim() : "";

    const article = document.createElement("article");
    article.className = "task-submission-card";

    const dl = document.createElement("dl");
    dl.className = "task-submission-facts";

    fact(dl, "Student name", s.student_name);
    fact(dl, "Username", s.student_username);
    fact(dl, "Class", s.class_name);
    fact(dl, "Submitted", s.submitted_at);
    fact(dl, "Status", s.status);

    /* --- Original Submission (first homework) --- */
    const originalSection = document.createElement("div");
    originalSection.className = "task-submission-section task-submission-section--original";

    const originalTitle = document.createElement("h5");
    originalTitle.className = "task-submission-section__title";
    originalTitle.textContent = t("original_submission");

    const answerBody = document.createElement("p");
    answerBody.className = "task-submission-answer__text";
    if (s.answer_text && String(s.answer_text).trim()) {
      answerBody.textContent = s.answer_text;
    } else {
      answerBody.textContent = "—";
      answerBody.classList.add("task-submission-answer__text--empty");
    }

    originalSection.appendChild(originalTitle);
    originalSection.appendChild(answerBody);

    const fp = s.file_path && String(s.file_path).trim();
    if (fp) {
      const fileRow = document.createElement("div");
      fileRow.className = "task-submission-file";
      const link = document.createElement("a");
      link.className = "task-submission-file-link";
      link.href = `${API_BASE}/submission-files/${encodeURIComponent(fp)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = s.file_name
        ? `Original attachment: ${s.file_name}`
        : "Download original attachment";
      fileRow.appendChild(link);
      originalSection.appendChild(fileRow);
    }

    /* --- Teacher Feedback: written text, legacy single file, multiple attachment files --- */
    const MAX_TEACHER_FEEDBACK_FILES = 3;
    const feedbackAttachments = Array.isArray(s.feedback_attachments) ? s.feedback_attachments : [];

    const feedbackSection = document.createElement("div");
    feedbackSection.className = "task-submission-section task-submission-section--feedback";

    const feedbackTitle = document.createElement("h5");
    feedbackTitle.className = "task-submission-section__title";
    feedbackTitle.textContent = t("teacher_feedback");

    const writtenSavedLabel = document.createElement("div");
    writtenSavedLabel.className = "task-submission-feedback-sublabel";
    writtenSavedLabel.textContent = t("written_feedback");

    const existingFbBody = document.createElement("p");
    existingFbBody.className = "task-submission-feedback-read__body";
    if (s.teacher_feedback && String(s.teacher_feedback).trim()) {
      existingFbBody.textContent = String(s.teacher_feedback).trim();
    } else {
      existingFbBody.textContent = t("no_written_feedback");
      existingFbBody.classList.add("task-submission-feedback-read__body--empty");
    }

    const fbfp = s.feedback_file_path && String(s.feedback_file_path).trim();
    let existingFbFileRow = null;
    if (fbfp) {
      const wrap = document.createElement("div");
      wrap.className = "task-submission-feedback-file-read";
      const fl = document.createElement("div");
      fl.className = "task-submission-feedback-file-read__label";
      fl.textContent = t("legacy_feedback_download");
      const link = document.createElement("a");
      link.className = "task-submission-file-link task-submission-feedback-file-read__link";
      link.href = `${API_BASE}/submission-files/${encodeURIComponent(fbfp)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("download_commented");
      wrap.appendChild(fl);
      wrap.appendChild(link);
      existingFbFileRow = wrap;
    }

    const feedbackEdit = document.createElement("div");
    feedbackEdit.className = "task-submission-feedback-edit";

    const taLabel = document.createElement("label");
    taLabel.className = "task-submission-feedback-edit__label";
    taLabel.htmlFor = submissionId ? `teacher-fb-draft-${submissionId}` : "";
    taLabel.textContent = t("written_feedback_label");

    const ta = document.createElement("textarea");
    ta.className = "task-submission-feedback-edit__textarea";
    ta.rows = 4;
    ta.id = submissionId ? `teacher-fb-draft-${submissionId}` : "";
    ta.value = s.teacher_feedback != null ? String(s.teacher_feedback) : "";

    /* Legacy single overwrite slot (same PUT /feedback multipart as before). */
    const fileRow = document.createElement("div");
    fileRow.className = "task-submission-feedback-file-row";
    const fileLabel = document.createElement("label");
    fileLabel.className = "task-submission-feedback-file-row__label";
    fileLabel.htmlFor = submissionId ? `teacher-fb-file-${submissionId}` : "";
    fileLabel.textContent = t("legacy_feedback_file");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = submissionId ? `teacher-fb-file-${submissionId}` : "";
    fileInput.className = "task-submission-feedback-file";
    fileInput.accept = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png";
    fileRow.appendChild(fileLabel);
    fileRow.appendChild(fileInput);

    const saveRow = document.createElement("div");
    saveRow.className = "task-submission-feedback-edit__actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-primary task-submission-feedback__save";
    saveBtn.textContent = t("save_feedback");
    saveBtn.setAttribute("data-task-id", String(taskId));
    if (submissionId) saveBtn.setAttribute("data-submission-id", submissionId);

    const rowStatus = document.createElement("p");
    rowStatus.className = "task-submission-feedback__status-msg";
    rowStatus.setAttribute("aria-live", "polite");

    saveRow.appendChild(saveBtn);

    feedbackEdit.appendChild(taLabel);
    feedbackEdit.appendChild(ta);
    feedbackEdit.appendChild(fileRow);
    feedbackEdit.appendChild(saveRow);
    feedbackEdit.appendChild(rowStatus);

    /* Additional files (max 3 rows in submission_attachments). */
    const filesSection = document.createElement("div");
    filesSection.className = "task-submission-feedback-files-section";

    const filesTitle = document.createElement("h6");
    filesTitle.className = "task-submission-feedback-files-section__title";
    filesTitle.textContent = t("teacher_feedback_files");

    const multiList = document.createElement("ul");
    multiList.className = "task-submission-feedback-attach-list";
    if (feedbackAttachments.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "task-submission-feedback-attach-list__empty";
      emptyLi.textContent = t("no_feedback_files_yet");
      multiList.appendChild(emptyLi);
    } else {
      feedbackAttachments.forEach((att) => {
        const li = document.createElement("li");
        li.className = "task-submission-feedback-attach-row";
        const nameSpan = document.createElement("span");
        nameSpan.className = "task-submission-feedback-attach-row__name";
        nameSpan.textContent =
          att.file_name && String(att.file_name).trim()
            ? String(att.file_name).trim()
            : att.file_path || "file";
        const timeSpan = document.createElement("span");
        timeSpan.className = "task-submission-feedback-attach-row__time";
        timeSpan.textContent =
          att.uploaded_at && String(att.uploaded_at).trim()
            ? String(att.uploaded_at).trim()
            : "—";
        const dl = document.createElement("a");
        dl.className = "task-submission-file-link";
        if (att.file_path && String(att.file_path).trim()) {
          dl.href = `${API_BASE}/submission-files/${encodeURIComponent(String(att.file_path).trim())}`;
          dl.target = "_blank";
          dl.rel = "noopener noreferrer";
          dl.textContent = "Download";
        }
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-secondary task-submission-feedback-attach-delete";
        del.textContent = "Remove";
        del.setAttribute("data-attachment-id", String(att.id));
        del.setAttribute("data-submission-id", submissionId);
        del.setAttribute("data-task-id", String(taskId));
        li.appendChild(nameSpan);
        li.appendChild(timeSpan);
        li.appendChild(dl);
        li.appendChild(del);
        multiList.appendChild(li);
      });
    }

    const uploadBlock = document.createElement("div");
    uploadBlock.className = "task-submission-feedback-files-upload";

    const multiLabel = document.createElement("label");
    multiLabel.className = "task-submission-feedback-files-upload__label";
    multiLabel.htmlFor = submissionId ? `teacher-fb-multi-${submissionId}` : "";
    multiLabel.textContent = t("upload_feedback_optional");

    const multiInput = document.createElement("input");
    multiInput.type = "file";
    multiInput.multiple = true;
    multiInput.id = submissionId ? `teacher-fb-multi-${submissionId}` : "";
    multiInput.className = "task-submission-feedback-files-input";
    multiInput.accept = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png";

    const slotsHint = document.createElement("p");
    slotsHint.className = "task-submission-feedback-files-hint";
    const slotsLeft = MAX_TEACHER_FEEDBACK_FILES - feedbackAttachments.length;
    slotsHint.textContent = `${feedbackAttachments.length} of ${MAX_TEACHER_FEEDBACK_FILES} additional file(s). ${slotsLeft <= 0 ? "Maximum reached." : `You can add up to ${slotsLeft} more.`}`;

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "btn-secondary task-submission-feedback-files__upload";
    uploadBtn.textContent = t("upload_feedback_files");
    uploadBtn.setAttribute("data-task-id", String(taskId));
    if (submissionId) {
      uploadBtn.setAttribute("data-submission-id", submissionId);
      uploadBtn.setAttribute("data-existing-count", String(feedbackAttachments.length));
    }
    if (feedbackAttachments.length >= MAX_TEACHER_FEEDBACK_FILES) {
      uploadBtn.disabled = true;
      multiInput.disabled = true;
    }

    const uploadStatus = document.createElement("p");
    uploadStatus.className = "task-submission-feedback-files-upload-status";
    uploadStatus.setAttribute("aria-live", "polite");

    uploadBlock.appendChild(multiLabel);
    uploadBlock.appendChild(multiInput);
    uploadBlock.appendChild(slotsHint);
    uploadBlock.appendChild(uploadBtn);
    uploadBlock.appendChild(uploadStatus);

    filesSection.appendChild(filesTitle);
    filesSection.appendChild(multiList);
    filesSection.appendChild(uploadBlock);

    feedbackSection.appendChild(feedbackTitle);
    feedbackSection.appendChild(writtenSavedLabel);
    feedbackSection.appendChild(existingFbBody);
    if (existingFbFileRow) feedbackSection.appendChild(existingFbFileRow);
    feedbackSection.appendChild(feedbackEdit);
    feedbackSection.appendChild(filesSection);

    /* --- Student Revision (optional; overwrites same DB columns on resubmit) --- */
    const revisionSection = document.createElement("div");
    revisionSection.className = "task-submission-section task-submission-section--revision";

    const revisionTitle = document.createElement("h5");
    revisionTitle.className = "task-submission-section__title";
    revisionTitle.textContent = t("student_revision");

    const hasRevision =
      (s.revision_submitted_at && String(s.revision_submitted_at).trim()) ||
      (s.revision_text && String(s.revision_text).trim()) ||
      (s.revision_file_path && String(s.revision_file_path).trim());

    if (hasRevision) {
      const revBody = document.createElement("p");
      revBody.className = "task-submission-revision__text";
      if (s.revision_text && String(s.revision_text).trim()) {
        revBody.textContent = String(s.revision_text).trim();
      } else {
        revBody.textContent = "—";
        revBody.classList.add("task-submission-revision__text--empty");
      }
      revisionSection.appendChild(revisionTitle);
      revisionSection.appendChild(revBody);

      const rfp =
        s.revision_file_path != null ? String(s.revision_file_path).trim() : "";
      if (rfp) {
        const revFileRow = document.createElement("div");
        revFileRow.className = "task-submission-revision-file";
        const rlink = document.createElement("a");
        rlink.className = "task-submission-file-link";
        rlink.href = `${API_BASE}/submission-files/${encodeURIComponent(rfp)}`;
        rlink.target = "_blank";
        rlink.rel = "noopener noreferrer";
        rlink.textContent = s.revision_file_name
          ? `Revision attachment: ${s.revision_file_name}`
          : "Download revision attachment";
        revFileRow.appendChild(rlink);
        revisionSection.appendChild(revFileRow);
      }

      factLine(revisionSection, "Revision submitted", s.revision_submitted_at);
      factLine(revisionSection, "Revision status", s.revision_status);
    } else {
      const emptyRev = document.createElement("p");
      emptyRev.className = "task-submission-revision__empty";
      emptyRev.textContent = t("no_revision");
      revisionSection.appendChild(revisionTitle);
      revisionSection.appendChild(emptyRev);
    }

    article.appendChild(dl);
    article.appendChild(originalSection);
    article.appendChild(feedbackSection);
    article.appendChild(revisionSection);

    container.appendChild(article);
  });
}

/**
 * After the teacher clicks “View submissions…” in the progress dashboard, we open that day’s view
 * and select this task id once `refreshTaskList` has finished loading the compact list.
 */
let teacherPendingAttentionTaskId = null;
let teacherPendingAttentionOpenSubmissions = false;
let teacherPendingAttentionScrollMaster = false;
/** After copy: select this task id in the daily list once `refreshTaskList` runs (same date/class as copy target). */
let teacherPendingCopySelectTaskId = null;

/** Build a Map task_id → task_summary row from GET /api/teacher/progress (same class + optional date). */
function buildTeacherTaskStatsMapFromProgress(progressPayload) {
  const map = new Map();
  if (!progressPayload || !Array.isArray(progressPayload.task_summary)) return map;
  progressPayload.task_summary.forEach((row) => {
    const id = row.task_id != null ? Number(row.task_id, 10) : NaN;
    if (Number.isFinite(id)) map.set(id, row);
  });
  return map;
}

/**
 * Phase D8: Map task_id → row from GET /api/teacher/task-completions (per-student completion clicks).
 */
async function fetchTeacherTaskCompletionsMap(className, dateIso, teacherUsernameOptional) {
  const qs = new URLSearchParams();
  qs.set("class_name", className);
  if (dateIso != null && String(dateIso).trim().length >= 10) {
    qs.set("date", String(dateIso).trim().slice(0, 10));
  }
  const tu =
    teacherUsernameOptional != null && String(teacherUsernameOptional).trim() !== ""
      ? String(teacherUsernameOptional).trim()
      : "";
  if (tu) qs.set("teacher_username", tu);
  const data = await apiGet(`/api/teacher/task-completions?${qs.toString()}`);
  const map = new Map();
  const rows = data && Array.isArray(data.tasks) ? data.tasks : [];
  rows.forEach((row) => {
    const tid = row.task_id != null ? Number(row.task_id, 10) : NaN;
    if (Number.isFinite(tid)) map.set(tid, row);
  });
  return map;
}

/**
 * Compact master list (Apple-style): one row per task with counts from progress API.
 */
function renderTeacherTaskMasterList(masterEl, tasks, statsMap, completionByTaskId = new Map()) {
  masterEl.innerHTML = "";
  const sorted = [...tasks].sort(compareTasksForSort);
  sorted.forEach((task) => {
    const id = task.id;
    const stats = statsMap.get(Number(id)) || {};
    const li = document.createElement("li");
    li.className = "teacher-task-master-li";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "teacher-task-master-item";
    btn.setAttribute("data-task-id", String(id));

    const titleEl = document.createElement("span");
    titleEl.className = "teacher-task-master-item__title";
    titleEl.textContent = taskDisplayTitle(task);

    const done = isCompleted(task);
    const line2 = document.createElement("span");
    line2.className = "teacher-task-master-item__meta";
    const cat = task.category || task.type || "—";
    line2.textContent = `${cat} · ${done ? "Completed" : "Pending"}`;

    const counts = document.createElement("span");
    counts.className = "teacher-task-master-item__counts";
    const sc = Number(stats.submission_count) || 0;
    const fg = Number(stats.feedback_given_count) || 0;
    const rv = Number(stats.revision_count) || 0;
    counts.textContent = `${sc} submission(s) · ${fg} feedback · ${rv} revision`;

    const cm =
      completionByTaskId instanceof Map ? completionByTaskId.get(Number(id)) : null;
    let lineMarked = null;
    if (cm && typeof cm === "object") {
      lineMarked = document.createElement("span");
      lineMarked.className = "teacher-task-master-item__marked-complete";
      const doneN = Number(cm.completed_students);
      const totN = Number(cm.total_students);
      const dOk = Number.isFinite(doneN) ? doneN : 0;
      const tOk = Number.isFinite(totN) ? totN : 0;
      lineMarked.textContent = `Students marked complete: ${dOk}/${tOk}`;
    }

    const badges = document.createElement("div");
    badges.className = "teacher-task-master-item__badges";
    const nf = Number(stats.needs_feedback_count) || 0;
    if (nf > 0) {
      const b = document.createElement("span");
      b.className = "teacher-badge teacher-badge--needs-feedback";
      b.textContent = t("needs_feedback");
      badges.appendChild(b);
    }
    if (rv > 0) {
      const b = document.createElement("span");
      b.className = "teacher-badge teacher-badge--revision";
      b.textContent = t("revision_submitted");
      badges.appendChild(b);
    }

    btn.appendChild(titleEl);
    btn.appendChild(line2);
    btn.appendChild(counts);
    if (lineMarked) btn.appendChild(lineMarked);
    if (badges.childElementCount) btn.appendChild(badges);
    li.appendChild(btn);
    masterEl.appendChild(li);
  });
}

function setTeacherMasterListSelection(masterEl, selectedId) {
  masterEl.querySelectorAll(".teacher-task-master-item").forEach((row) => {
    const rid = Number(row.getAttribute("data-task-id"), 10);
    const on = Number.isFinite(selectedId) && Number.isFinite(rid) && rid === Number(selectedId);
    row.classList.toggle("teacher-task-master-item--selected", on);
    row.setAttribute("aria-current", on ? "true" : "false");
  });
}

/** Fill the small header chips for the current class + calendar day (from /api/teacher/progress). */
function fillTeacherDailyChips(progressPayload, taskCountFallback) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null && val !== "" ? String(val) : "—";
  };
  if (!progressPayload) {
    set("teacher-chip-tasks", taskCountFallback);
    set("teacher-chip-submissions", "—");
    set("teacher-chip-feedback", "—");
    set("teacher-chip-revisions", "—");
    set("teacher-chip-waiting", "—");
    return;
  }
  set("teacher-chip-tasks", progressPayload.total_tasks ?? taskCountFallback);
  set("teacher-chip-submissions", progressPayload.total_submissions);
  set("teacher-chip-feedback", progressPayload.feedback_given_count);
  set("teacher-chip-revisions", progressPayload.revision_submitted_count);
  set("teacher-chip-waiting", progressPayload.submissions_waiting_for_feedback);
}

/**
 * One full teacher task card (same DOM as the old vertical list) — lives in the right detail panel.
 *
 * @param {object} task — normalized task
 * @param {{ viewDate?: string, viewClass?: string }} [copyContext] — defaults for Copy Task form
 */
function buildTeacherTaskCardElement(task, copyContext) {
  const ctx = copyContext && typeof copyContext === "object" ? copyContext : {};
  const defaultCopyDate =
    ctx.viewDate != null && String(ctx.viewDate).trim().length >= 10
      ? String(ctx.viewDate).trim().slice(0, 10)
      : "";
  const defaultCopyClass =
    ctx.viewClass != null && String(ctx.viewClass).trim()
      ? String(ctx.viewClass).trim()
      : task.class_name && String(task.class_name).trim()
        ? String(task.class_name).trim()
        : teacherDefaultClassFallback();

  const done = isCompleted(task);
  const li = document.createElement("li");
  li.className = done ? "task-card task-card--done task-card--teacher" : "task-card task-card--teacher";
  li.setAttribute("data-task-id", String(task.id));

  const dl = document.createElement("dl");
  dl.className = "task-card__facts";

  appendTaskFact(dl, t("class_label"), task.class_name || "—");
  appendTaskFact(dl, t("date_label"), formatDisplayDate(task.date));
  appendTaskFact(dl, t("title"), taskDisplayTitle(task), "task-card__fact-value--title");
  appendTaskFact(
    dl,
    t("category"),
    translateCategory(task.category || task.type || "—"),
  );
  appendTaskFact(dl, t("period"), task.period && String(task.period).trim() ? task.period : "—");
  appendTaskFact(dl, t("status_label"), done ? t("status_completed") : t("status_pending"), done
    ? "task-card__fact-value--status task-card__fact-value--done"
    : "task-card__fact-value--status");

  const hasFile = task.file_path && String(task.file_path).trim() !== "";

  const desc = document.createElement("p");
  desc.className = "task-card__description";
  const descShown = taskDisplayDescription(task);
  if (descShown) desc.textContent = descShown;

  const copyWrap = document.createElement("div");
  copyWrap.className = "task-card__copy-wrap";
  const copyDetails = document.createElement("details");
  copyDetails.className = "task-card__copy";
  const copySum = document.createElement("summary");
  copySum.className = "task-card__copy-summary";
  copySum.textContent = t("copy_task");
  const copyFields = document.createElement("div");
  copyFields.className = "task-card__copy-fields";

  const dateLab = document.createElement("label");
  dateLab.className = "task-card__copy-label";
  dateLab.htmlFor = `task-copy-date-${task.id}`;
  dateLab.textContent = t("new_date");
  const dateInp = document.createElement("input");
  dateInp.type = "date";
  dateInp.id = `task-copy-date-${task.id}`;
  dateInp.className = "task-copy-date";
  dateInp.required = true;
  if (defaultCopyDate) dateInp.value = defaultCopyDate;

  const classLab = document.createElement("label");
  classLab.className = "task-card__copy-label";
  classLab.htmlFor = `task-copy-class-${task.id}`;
  classLab.textContent = t("new_class");
  const classSel = document.createElement("select");
  classSel.id = `task-copy-class-${task.id}`;
  classSel.className = "task-copy-class";
  getTeacherClassOptions().forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code;
    if (code === defaultCopyClass) opt.selected = true;
    classSel.appendChild(opt);
  });

  const matWrap = document.createElement("label");
  matWrap.className = "task-card__copy-check";
  const matCb = document.createElement("input");
  matCb.type = "checkbox";
  matCb.className = "task-copy-material";
  matCb.checked = !!hasFile;
  matCb.disabled = !hasFile;
  const matSpan = document.createElement("span");
  matSpan.textContent = t("copy_material_same");
  matWrap.appendChild(matCb);
  matWrap.appendChild(matSpan);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn-secondary task-copy-create";
  copyBtn.setAttribute("data-task-id", String(task.id));
  copyBtn.textContent = t("create_copy");

  const copyStatus = document.createElement("p");
  copyStatus.className = "task-copy-status";
  copyStatus.setAttribute("aria-live", "polite");

  copyFields.appendChild(dateLab);
  copyFields.appendChild(dateInp);
  copyFields.appendChild(classLab);
  copyFields.appendChild(classSel);
  copyFields.appendChild(matWrap);
  copyFields.appendChild(copyBtn);
  copyFields.appendChild(copyStatus);

  copyDetails.appendChild(copySum);
  copyDetails.appendChild(copyFields);
  copyWrap.appendChild(copyDetails);

  const templateSaveWrap = document.createElement("div");
  templateSaveWrap.className = "task-card__template-save-wrap";
  const templateDetails = document.createElement("details");
  templateDetails.className = "task-card__template-save";
  const templateSum = document.createElement("summary");
  templateSum.className = "task-card__template-save-summary";
  templateSum.textContent = t("save_template");
  const templateFields = document.createElement("div");
  templateFields.className = "task-card__template-save-fields";

  const tid = String(task.id);

  const nameLab = document.createElement("label");
  nameLab.className = "task-card__template-save-label";
  nameLab.htmlFor = `task-template-save-name-${tid}`;
  nameLab.textContent = t("template_name");
  const nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.id = `task-template-save-name-${tid}`;
  nameInp.className = "task-template-save-name";
  nameInp.required = true;
  nameInp.autocomplete = "off";
  nameInp.placeholder = "e.g. Week 3 — reading homework";

  const titleLab = document.createElement("label");
  titleLab.className = "task-card__template-save-label";
  titleLab.htmlFor = `task-template-save-title-${tid}`;
  titleLab.textContent = t("title");
  const titleInp = document.createElement("input");
  titleInp.type = "text";
  titleInp.id = `task-template-save-title-${tid}`;
  titleInp.className = "task-template-save-title";
  titleInp.required = true;
  titleInp.value = task.title != null ? String(task.title) : "";

  const catLab = document.createElement("label");
  catLab.className = "task-card__template-save-label";
  catLab.htmlFor = `task-template-save-category-${tid}`;
  catLab.textContent = t("category");
  const catInp = document.createElement("input");
  catInp.type = "text";
  catInp.id = `task-template-save-category-${tid}`;
  catInp.className = "task-template-save-category";
  catInp.required = true;
  catInp.value =
    (task.category != null && String(task.category).trim()) ||
    (task.type != null && String(task.type).trim())
      ? String(task.category || task.type).trim()
      : "";

  const perLab = document.createElement("label");
  perLab.className = "task-card__template-save-label";
  perLab.htmlFor = `task-template-save-period-${tid}`;
  perLab.textContent = t("period");
  const perInp = document.createElement("input");
  perInp.type = "text";
  perInp.id = `task-template-save-period-${tid}`;
  perInp.className = "task-template-save-period";
  perInp.value = task.period != null ? String(task.period) : "";

  const descLab = document.createElement("label");
  descLab.className = "task-card__template-save-label";
  descLab.htmlFor = `task-template-save-description-${tid}`;
  descLab.textContent = t("description");
  const descTa = document.createElement("textarea");
  descTa.id = `task-template-save-description-${tid}`;
  descTa.className = "task-template-save-description";
  descTa.rows = 3;
  descTa.value = task.description != null ? String(task.description) : "";

  const tplMatWrap = document.createElement("label");
  tplMatWrap.className = "task-card__template-save-check";
  const tplMatCb = document.createElement("input");
  tplMatCb.type = "checkbox";
  tplMatCb.className = "task-template-save-material";
  tplMatCb.checked = !!hasFile;
  tplMatCb.disabled = !hasFile;
  const tplMatSpan = document.createElement("span");
  tplMatSpan.textContent = t("include_material_ref_short");
  tplMatWrap.appendChild(tplMatCb);
  tplMatWrap.appendChild(tplMatSpan);

  const saveTplBtn = document.createElement("button");
  saveTplBtn.type = "button";
  saveTplBtn.className = "btn-secondary task-save-template";
  saveTplBtn.setAttribute("data-task-id", tid);
  saveTplBtn.textContent = t("save_template_btn");

  const tplStatus = document.createElement("p");
  tplStatus.className = "task-template-save-status";
  tplStatus.setAttribute("aria-live", "polite");

  templateFields.appendChild(nameLab);
  templateFields.appendChild(nameInp);
  templateFields.appendChild(titleLab);
  templateFields.appendChild(titleInp);
  templateFields.appendChild(catLab);
  templateFields.appendChild(catInp);
  templateFields.appendChild(perLab);
  templateFields.appendChild(perInp);
  templateFields.appendChild(descLab);
  templateFields.appendChild(descTa);
  templateFields.appendChild(tplMatWrap);
  templateFields.appendChild(saveTplBtn);
  templateFields.appendChild(tplStatus);

  templateDetails.appendChild(templateSum);
  templateDetails.appendChild(templateFields);
  templateSaveWrap.appendChild(templateDetails);

  const attach = document.createElement("div");
  attach.className = "task-card__attachment";

  const attachedP = document.createElement("p");
  attachedP.className = "task-card__attached-info";
  if (hasFile) {
    const displayName =
      task.file_name && String(task.file_name).trim()
        ? task.file_name
        : task.file_path;
    const label = document.createElement("span");
    label.className = "task-card__attached-label";
    label.textContent = "Teaching material: ";
    const link = document.createElement("a");
    link.className = "task-card__material-link";
    link.href = `${API_BASE}/uploads/${encodeURIComponent(String(task.file_path).trim())}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = displayName;
    attachedP.appendChild(label);
    attachedP.appendChild(link);
  } else {
    attachedP.classList.add("task-card__attached-info--empty");
    attachedP.textContent = t("no_material");
  }

  const controls = document.createElement("div");
  controls.className = "task-upload-controls";

  const fileLabel = document.createElement("label");
  fileLabel.className = "task-upload-choose";

  const chooseSpan = document.createElement("span");
  chooseSpan.className = "task-upload-choose-text";
  chooseSpan.textContent = t("choose_file");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "task-upload-input";
  fileInput.accept =
    ".pdf,.doc,.docx,.ppt,.pptx,.mp3,.mp4,.txt,.jpg,.jpeg,.png";

  fileLabel.appendChild(chooseSpan);
  fileLabel.appendChild(fileInput);

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "btn-secondary task-upload-submit";
  uploadBtn.setAttribute("data-task-id", String(task.id));
  uploadBtn.textContent = t("upload");

  const uploadStatus = document.createElement("p");
  uploadStatus.className = "task-upload-status";
  uploadStatus.setAttribute("aria-live", "polite");

  const selectedFile = document.createElement("p");
  selectedFile.className = "file-selection-summary task-upload-selected-file";
  selectedFile.setAttribute("aria-live", "polite");
  selectedFile.textContent = t("no_file_selected");

  controls.appendChild(fileLabel);
  controls.appendChild(uploadBtn);

  attach.appendChild(attachedP);
  attach.appendChild(controls);
  attach.appendChild(selectedFile);
  attach.appendChild(uploadStatus);

  const submissionsWrap = document.createElement("div");
  submissionsWrap.className = "task-card__submissions";

  const subActions = document.createElement("div");
  subActions.className = "task-submissions-actions";

  const viewSubBtn = document.createElement("button");
  viewSubBtn.type = "button";
  viewSubBtn.className = "btn-secondary task-view-submissions";
  viewSubBtn.setAttribute("data-task-id", String(task.id));
  viewSubBtn.setAttribute("aria-expanded", "false");
  viewSubBtn.textContent = t("view_submissions");

  subActions.appendChild(viewSubBtn);

  const subFetchStatus = document.createElement("p");
  subFetchStatus.className = "task-submissions-fetch-status";
  subFetchStatus.setAttribute("aria-live", "polite");

  const subPanel = document.createElement("div");
  subPanel.className = "task-submissions-panel hidden";
  subPanel.setAttribute("hidden", "");

  const subList = document.createElement("div");
  subList.className = "task-submissions-list";
  subPanel.appendChild(subList);

  submissionsWrap.appendChild(subActions);
  submissionsWrap.appendChild(subFetchStatus);
  submissionsWrap.appendChild(subPanel);

  li.appendChild(dl);
  li.appendChild(desc);
  li.appendChild(copyWrap);
  li.appendChild(templateSaveWrap);
  li.appendChild(attach);
  li.appendChild(submissionsWrap);

  return li;
}

function setTeacherPageError(el, message) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
  el.classList.toggle("form-message--error", !!message);
}

/** Category rollup from GET /api/teacher/progress task_summary rows. */
function computeTeacherCategoryBreakdown(taskSummary) {
  const map = new Map();
  const items = Array.isArray(taskSummary) ? taskSummary : [];
  items.forEach((t) => {
    const cat = String(t.category || "Other").trim() || "Other";
    if (!map.has(cat)) {
      map.set(cat, { category: cat, tasks: 0, completed: 0, attention: 0 });
    }
    const row = map.get(cat);
    row.tasks += 1;
    if (String(t.status || "").trim().toLowerCase() === "completed") {
      row.completed += 1;
    }
    if (Number(t.needs_feedback_count) > 0 || Number(t.revision_count) > 0) {
      row.attention += 1;
    }
  });
  return [...map.values()].sort((a, b) => b.tasks - a.tasks);
}

/** Category rollup from GET /api/student/progress category_summary. */
function normalizeStudentCategoryBreakdown(rows) {
  const items = Array.isArray(rows) ? rows : [];
  return items
    .map((r) => ({
      category: String(r.category || "Other").trim() || "Other",
      tasks: Number(r.total) || 0,
      completed: Number(r.completed) || 0,
      attention: Number(r.needing_action) || 0,
    }))
    .sort((a, b) => b.tasks - a.tasks);
}

function renderEapProgressBar(containerEl, rate, labelText) {
  if (!containerEl) return;
  const pct = Math.max(0, Math.min(100, Number(rate) || 0));
  containerEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "eap-progress-bar";
  const labelRow = document.createElement("div");
  labelRow.className = "eap-progress-bar__label-row";
  const label = document.createElement("span");
  label.className = "eap-progress-bar__label";
  label.textContent = labelText || t("completion_rate");
  const value = document.createElement("span");
  value.className = "eap-progress-bar__value";
  value.textContent = `${pct.toFixed(1)}%`;
  labelRow.appendChild(label);
  labelRow.appendChild(value);
  const track = document.createElement("div");
  track.className = "eap-progress-bar__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.round(pct)));
  const fill = document.createElement("div");
  fill.className = "eap-progress-bar__fill";
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  wrap.appendChild(labelRow);
  wrap.appendChild(track);
  containerEl.appendChild(wrap);
}

function renderEapCategoryBreakdown(containerEl, rows) {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "eap-category-breakdown__empty";
    empty.textContent = t("dashboard_no_categories");
    containerEl.appendChild(empty);
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "eap-category-breakdown__list";
  list.forEach((row) => {
    const li = document.createElement("li");
    li.className = "eap-category-breakdown__item";
    const name = document.createElement("span");
    name.className = "eap-category-breakdown__name";
    name.textContent = translateCategory(row.category);
    const meta = document.createElement("span");
    meta.className = "eap-category-breakdown__meta";
    meta.textContent = t("dashboard_category_meta", {
      tasks: row.tasks,
      completed: row.completed,
      attention: row.attention,
    });
    li.appendChild(name);
    li.appendChild(meta);
    ul.appendChild(li);
  });
  containerEl.appendChild(ul);
}

/**
 * Build the “needs attention” list from GET /api/teacher/progress task_summary.
 * A task appears when needs_feedback_count > 0 or revision_count > 0 (student resubmitted).
 */
function renderTeacherAttentionList(listEl, emptyEl, taskSummary) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const items = Array.isArray(taskSummary) ? taskSummary : [];
  const attention = items.filter(
    (t) => (Number(t.needs_feedback_count) > 0) || (Number(t.revision_count) > 0),
  );

  if (emptyEl) {
    emptyEl.classList.toggle("hidden", attention.length > 0);
  }

  attention.forEach((t) => {
    const li = document.createElement("li");
    li.className = "teacher-attention-item";

    const title = document.createElement("strong");
    title.className = "teacher-attention-item__title";
    title.textContent = taskDisplayTitle(t);

    const meta = document.createElement("div");
    meta.className = "teacher-attention-item__meta";
    const datePart = t.date ? formatDisplayDate(t.date) : "—";
    const sc = Number(t.submission_count) || 0;
    const fg = Number(t.feedback_given_count) || 0;
    const rv = Number(t.revision_count) || 0;
    const nf = Number(t.needs_feedback_count) || 0;
    meta.textContent = `${datePart} · ${sc} submission(s) · ${fg} feedback given · ${rv} revision row(s) · ${nf} waiting for feedback`;

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "btn-secondary attention-open-task";
    openBtn.textContent = t("view_submissions_feedback");

    const rawDate = t.date != null ? String(t.date).trim() : "";
    const isoDate = rawDate.length >= 10 ? rawDate.slice(0, 10) : "";
    if (t.task_id != null && String(t.task_id).trim() !== "" && isoDate.length === 10) {
      openBtn.setAttribute("data-task-id", String(t.task_id).trim());
      openBtn.setAttribute("data-task-date", isoDate);
    } else {
      openBtn.disabled = true;
      openBtn.title = "Missing task id or date for this row.";
    }

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(openBtn);
    listEl.appendChild(li);
  });
}

/** Fills stat cards from GET /api/teacher/progress JSON (task + homework analytics). */
function setDashboardValues(stats) {
  const totalEl = document.getElementById("dash-total");
  const pendingEl = document.getElementById("dash-pending");
  const completedEl = document.getElementById("dash-completed");
  const rateEl = document.getElementById("dash-rate");
  const submissionsEl = document.getElementById("dash-submissions");
  const feedbackGivenEl = document.getElementById("dash-feedback-given");
  const revisionsEl = document.getElementById("dash-revisions");
  const waitingEl = document.getElementById("dash-waiting-feedback");

  if (totalEl) totalEl.textContent = String(stats.total_tasks ?? 0);
  if (pendingEl) pendingEl.textContent = String(stats.pending_tasks ?? 0);
  if (completedEl) completedEl.textContent = String(stats.completed_tasks ?? 0);
  if (rateEl) {
    const r = stats.completion_rate ?? 0;
    rateEl.textContent = `${Number(r).toFixed(1)}%`;
  }
  if (submissionsEl) submissionsEl.textContent = String(stats.total_submissions ?? 0);
  if (feedbackGivenEl) feedbackGivenEl.textContent = String(stats.feedback_given_count ?? 0);
  if (revisionsEl) revisionsEl.textContent = String(stats.revision_submitted_count ?? 0);
  if (waitingEl) waitingEl.textContent = String(stats.submissions_waiting_for_feedback ?? 0);

  renderTeacherAttentionList(
    document.getElementById("teacher-attention-list"),
    document.getElementById("teacher-attention-empty"),
    stats.task_summary,
  );
}

function setTeacherClassOverviewValues(stats, rosterPayload, scopeEl, progressBarEl, categoriesEl) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val ?? "—");
  };
  setText("teacher-overview-total", stats.total_tasks ?? 0);
  setText("teacher-overview-completed", stats.completed_tasks ?? 0);
  setText("teacher-overview-pending", stats.pending_tasks ?? 0);
  setText("teacher-overview-submissions", stats.total_submissions ?? 0);
  setText("teacher-overview-feedback", stats.feedback_given_count ?? 0);
  setText("teacher-overview-waiting", stats.submissions_waiting_for_feedback ?? 0);
  renderEapProgressBar(progressBarEl, stats.completion_rate ?? 0, t("class_task_completion"));
  renderEapCategoryBreakdown(
    categoriesEl,
    computeTeacherCategoryBreakdown(stats.task_summary),
  );
  renderTeacherAttentionList(
    document.getElementById("teacher-overview-attention-list"),
    document.getElementById("teacher-overview-attention-empty"),
    stats.task_summary,
  );
  if (scopeEl && rosterPayload) {
    const month = rosterPayload.month || "";
    const cls = rosterPayload.class_name || stats.class_name || "";
    const monthLabel =
      month.length >= 7
        ? new Date(`${month}-01T12:00:00`).toLocaleDateString(eapLocale(), {
            month: "long",
            year: "numeric",
          })
        : month;
    scopeEl.textContent = t("dashboard_scope_class_month", {
      class: cls,
      month: monthLabel,
    });
  }
}

function populateTeacherTemplateCategoryFilterSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = t("all_categories");
  selectEl.appendChild(all);
  TASK_CATEGORIES.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = translateCategory(label);
    selectEl.appendChild(opt);
  });
}

function syncTeacherTemplateCategoryChipHighlight(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  const val = selectEl.value || "all";
  chipsEl.querySelectorAll(".teacher-category-chip").forEach((chip) => {
    const cat = chip.getAttribute("data-category");
    const on = cat === val;
    chip.classList.toggle("teacher-category-chip--active", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function populateTeacherTemplateCategoryChips(chipsEl, selectEl) {
  if (!chipsEl || !selectEl) return;
  chipsEl.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "teacher-category-chip";
  allBtn.textContent = t("all_categories");
  allBtn.setAttribute("data-category", "all");
  allBtn.addEventListener("click", () => {
    selectEl.value = "all";
    syncTeacherTemplateCategoryChipHighlight(chipsEl, selectEl);
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
  chipsEl.appendChild(allBtn);
  TASK_CATEGORIES.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "teacher-category-chip";
    btn.textContent = translateCategory(label);
    btn.setAttribute("data-category", label);
    btn.addEventListener("click", () => {
      selectEl.value = label;
      syncTeacherTemplateCategoryChipHighlight(chipsEl, selectEl);
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
    chipsEl.appendChild(btn);
  });
  syncTeacherTemplateCategoryChipHighlight(chipsEl, selectEl);
}

function filterTeacherTemplatesByCategory(list, filterValue) {
  const items = Array.isArray(list) ? list : [];
  const f = String(filterValue || "all");
  if (f === "all") return items;
  return items.filter((row) => String(row.category || "").trim() === f);
}

function renderTeacherTemplatePreview(previewInnerEl, template) {
  if (!previewInnerEl) return;
  previewInnerEl.innerHTML = "";
  if (!template || template.id == null) {
    const empty = document.createElement("p");
    empty.className = "teacher-template-preview__empty";
    empty.textContent = t("template_preview_empty");
    previewInnerEl.appendChild(empty);
    return;
  }

  const name = document.createElement("p");
  name.className = "teacher-template-preview__name";
  name.textContent =
    template.name != null && String(template.name).trim()
      ? String(template.name).trim()
      : t("untitled_task");

  const title = document.createElement("h5");
  title.className = "teacher-template-preview__title";
  title.textContent = taskDisplayTitle(template);

  const meta = document.createElement("p");
  meta.className = "teacher-template-preview__meta";
  const cat = translateCategory(template.category || "—");
  const period =
    template.period != null && String(template.period).trim()
      ? String(template.period).trim()
      : "—";
  meta.textContent = `${cat} · ${period}`;

  const desc = document.createElement("p");
  desc.className = "teacher-template-preview__description";
  const descShown = taskDisplayDescription(template);
  desc.textContent = descShown || t("no_description");

  previewInnerEl.appendChild(name);
  previewInnerEl.appendChild(title);
  previewInnerEl.appendChild(meta);
  previewInnerEl.appendChild(desc);

  if (template.file_path && String(template.file_path).trim()) {
    const mat = document.createElement("p");
    mat.className = "teacher-template-preview__material";
    const link = document.createElement("a");
    link.href = `${API_BASE}/uploads/${encodeURIComponent(String(template.file_path).trim())}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent =
      template.file_name && String(template.file_name).trim()
        ? String(template.file_name).trim()
        : t("view_material");
    mat.appendChild(link);
    previewInnerEl.appendChild(mat);
  }
}

function renderTeacherTemplateLibrary(listEl, emptyEl, templates, selectedId) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const items = Array.isArray(templates) ? templates : [];
  if (emptyEl) emptyEl.classList.toggle("hidden", items.length > 0);
  items.forEach((tmpl) => {
    const tid = tmpl.id != null ? Number(tmpl.id) : NaN;
    if (!Number.isFinite(tid)) return;

    const li = document.createElement("li");
    li.className = "teacher-template-library-li";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "teacher-template-library-item";
    btn.setAttribute("data-template-id", String(tid));
    const on = Number.isFinite(selectedId) && tid === Number(selectedId);
    if (on) btn.classList.add("teacher-template-library-item--selected");
    btn.setAttribute("aria-current", on ? "true" : "false");

    const titleEl = document.createElement("span");
    titleEl.className = "teacher-template-library-item__title";
    titleEl.textContent =
      tmpl.name != null && String(tmpl.name).trim()
        ? String(tmpl.name).trim()
        : `Template ${tid}`;

    const metaEl = document.createElement("span");
    metaEl.className = "teacher-template-library-item__meta";
    const cat = translateCategory(tmpl.category || "—");
    const hasMat = !!(tmpl.file_path && String(tmpl.file_path).trim());
    metaEl.textContent = hasMat ? `${cat} · ${t("has_material")}` : cat;

    btn.appendChild(titleEl);
    btn.appendChild(metaEl);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function renderTeacherRosterTable(tbody, wrapEl, emptyEl, students) {
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = Array.isArray(students) ? students : [];
  if (emptyEl) emptyEl.classList.toggle("hidden", list.length > 0);
  if (wrapEl) wrapEl.classList.toggle("hidden", list.length === 0);
  list.forEach((s) => {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    const fn = s.full_name != null && String(s.full_name).trim() ? String(s.full_name).trim() : "";
    const un = s.student_username != null ? String(s.student_username) : "—";
    tdName.textContent = fn ? `${un} (${fn})` : un;
    const tdDone = document.createElement("td");
    tdDone.textContent = `${s.completed_tasks ?? 0} / ${s.total_tasks ?? 0}`;
    const tdHw = document.createElement("td");
    tdHw.textContent = `${s.homework_submitted_count ?? 0} / ${s.total_tasks ?? 0}`;
    const tdRate = document.createElement("td");
    tdRate.textContent = `${Number(s.completion_rate ?? 0).toFixed(1)}%`;
    const tdAct = document.createElement("td");
    tdAct.textContent = String(s.tasks_needing_action_count ?? 0);
    tr.appendChild(tdName);
    tr.appendChild(tdDone);
    tr.appendChild(tdHw);
    tr.appendChild(tdRate);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
}

function initTeacherPage() {
  if (document.body.getAttribute("data-page") !== "teacher") return;

  if (redirectFilePageToHostedUi()) return;

  void (async () => {
    const sessionUser = await validatePageSessionOrFallback("teacher");
    if (!sessionUser) return;

    await ensureAcademicCalendarLoaded();
    initAppPageHeader();
    initTeacherLiveNavLink();

  const form = document.getElementById("teacher-task-form");
  const typeSelect = document.getElementById("task-type");
  const masterListEl = document.getElementById("teacher-task-master-list");
  const taskDetailInner = document.getElementById("teacher-task-detail-inner");
  const taskDetailEmpty = document.getElementById("teacher-task-detail-empty");
  const dailyClassLabelEl = document.getElementById("teacher-daily-class-label");
  const emptyHintEl = document.getElementById("teacher-empty-hint");
  const messageEl = document.getElementById("teacher-form-message");
  const pageErrorEl = document.getElementById("teacher-page-error");
  const dateInput = document.getElementById("task-date");
  const dashboardClassSelect = document.getElementById("teacher-dashboard-class");
  const taskClassSelect = document.getElementById("teacher-task-class");
  const calendarClassSelect = document.getElementById("teacher-calendar-class");
  const viewDateInput = document.getElementById("teacher-task-view-date");
  const viewTasksBtn = document.getElementById("teacher-view-tasks-btn");
  const taskScopeEl = document.getElementById("teacher-task-scope");
  const calendarRoot = document.getElementById("teacher-calendar-root");
  const calendarViewEl = document.getElementById("teacher-calendar-view");
  const dailyViewEl = document.getElementById("teacher-daily-view");
  const teacherDailyWorkspaceEl = document.querySelector(".teacher-daily-workspace");
  const teacherMobileBackBtn = document.getElementById("teacher-mobile-back-to-list");
  const mainEl = document.getElementById("main");
  const dailyTitleEl = document.getElementById("teacher-daily-title");
  const backToCalendarBtn = document.getElementById("teacher-back-to-calendar");
  const templateSelectEl = document.getElementById("teacher-template-select");
  const templateCategoryFilterEl = document.getElementById("teacher-template-category-filter");
  const templateCategoryChipsEl = document.getElementById("teacher-template-category-chips");
  const templateLibraryListEl = document.getElementById("teacher-template-library-list");
  const templateLibraryEmptyEl = document.getElementById("teacher-template-library-empty");
  const templatePreviewInnerEl = document.getElementById("teacher-template-preview-inner");
  const templateApplyContextEl = document.getElementById("teacher-template-apply-context");
  const fromTemplateDetailsEl = document.getElementById("teacher-from-template-details");
  const openTemplatesBtn = document.getElementById("teacher-open-templates-btn");
  const templateApplyDateEl = document.getElementById("teacher-template-apply-date");
  const templateApplyClassEl = document.getElementById("teacher-template-apply-class");
  const templateIncludeMatEl = document.getElementById("teacher-template-include-material");
  const templateApplyBtn = document.getElementById("teacher-template-apply-btn");
  const templateApplyStatusEl = document.getElementById("teacher-template-apply-status");
  const templateManageListEl = document.getElementById("teacher-template-manage-list");
  const templateManageEmptyEl = document.getElementById("teacher-template-manage-empty");
  const templateManageStatusEl = document.getElementById("teacher-template-manage-status");
  let teacherTemplatesCache = [];
  let teacherSelectedTemplateId = null;
  const teacherStudyPlansTbody = document.getElementById("teacher-study-plans-tbody");
  const teacherStudyPlansEmptyEl = document.getElementById("teacher-study-plans-empty");
  const teacherStudyPlansWrapEl = document.getElementById("teacher-study-plans-table-wrap");
  const teacherStudyPlanProgressSubtitleEl = document.getElementById("teacher-study-plan-progress-subtitle");
  const teacherStudyPlanProgressErrorEl = document.getElementById("teacher-study-plan-progress-error");
  const teacherStudyPlanProgressEmptyEl = document.getElementById("teacher-study-plan-progress-empty");
  const teacherStudyPlanProgressBodyEl = document.getElementById("teacher-study-plan-progress-body");
  const teacherStudyPlanProgressSkillsUl = document.getElementById("teacher-study-plan-progress-skills");
  const teacherStudyPlanProgressStatTotal = document.getElementById("teacher-study-plan-progress-stat-total");
  const teacherStudyPlanProgressStatCompleted = document.getElementById("teacher-study-plan-progress-stat-completed");
  const teacherStudyPlanProgressStatPlanned = document.getElementById("teacher-study-plan-progress-stat-planned");
  const teacherStudyPlanProgressStatRate = document.getElementById("teacher-study-plan-progress-stat-rate");
  const teacherStudyPlanProgressStatStudents = document.getElementById("teacher-study-plan-progress-stat-students");
  const teacherStudyPlanProgressStatMinsTotal = document.getElementById("teacher-study-plan-progress-stat-mins-total");
  const teacherStudyPlanProgressStatMinsCompleted = document.getElementById(
    "teacher-study-plan-progress-stat-mins-completed",
  );
  const teacherStudyPlanProgressTopDetails = document.getElementById("teacher-study-plan-progress-top-students");
  const teacherStudyPlanProgressTopHint = document.getElementById("teacher-study-plan-progress-top-hint");
  const teacherStudyPlanProgressTopList = document.getElementById("teacher-study-plan-progress-top-list");

  /** Right panel placeholder when nothing is selected or the day has no tasks yet. */
  function setTeacherTaskDetailEmpty(kind) {
    const title = taskDetailEmpty.querySelector(".teacher-task-detail-empty__title");
    const text = taskDetailEmpty.querySelector(".teacher-task-detail-empty__text");
    if (!title || !text) return;
    if (kind === "no-date") {
      title.textContent = t("pick_teaching_day");
      text.textContent = t("pick_teaching_day_hint");
    } else if (kind === "no-tasks") {
      title.textContent = t("no_tasks_date");
      text.textContent =
        "Use “Create New Task” below to add one, or choose another day on the calendar.";
    } else {
      title.textContent = t("no_task_selected");
      text.textContent =
        "Choose a day from the calendar, then pick a task from the list on the left.";
    }
  }

  if (
    !form ||
    !masterListEl ||
    !taskDetailInner ||
    !taskDetailEmpty ||
    !dailyClassLabelEl ||
    !emptyHintEl ||
    !typeSelect ||
    !dashboardClassSelect ||
    !taskClassSelect ||
    !calendarClassSelect ||
    !viewDateInput ||
    !taskScopeEl ||
    !calendarRoot ||
    !dateInput ||
    !calendarViewEl ||
    !dailyViewEl ||
    !dailyTitleEl ||
    !backToCalendarBtn ||
    !mainEl ||
    !templateSelectEl ||
    !templateApplyDateEl ||
    !templateApplyClassEl ||
    !templateIncludeMatEl ||
    !templateApplyBtn ||
    !templateApplyStatusEl ||
    !templateManageListEl ||
    !templateManageEmptyEl ||
    !templateManageStatusEl ||
    !teacherStudyPlansTbody ||
    !teacherStudyPlansEmptyEl ||
    !teacherStudyPlansWrapEl ||
    !teacherStudyPlanProgressSubtitleEl ||
    !teacherStudyPlanProgressErrorEl ||
    !teacherStudyPlanProgressEmptyEl ||
    !teacherStudyPlanProgressBodyEl ||
    !teacherStudyPlanProgressSkillsUl ||
    !teacherStudyPlanProgressStatTotal ||
    !teacherStudyPlanProgressStatCompleted ||
    !teacherStudyPlanProgressStatPlanned ||
    !teacherStudyPlanProgressStatRate ||
    !teacherStudyPlanProgressStatStudents ||
    !teacherStudyPlanProgressStatMinsTotal ||
    !teacherStudyPlanProgressStatMinsCompleted ||
    !teacherStudyPlanProgressTopDetails ||
    !teacherStudyPlanProgressTopHint ||
    !teacherStudyPlanProgressTopList
  ) {
    return;
  }

  populateCategorySelect(typeSelect, false);

  const categoryChipsEl = document.getElementById("teacher-task-category-chips");
  const createTaskDetailsEl = document.getElementById("teacher-create-task-details");
  const createContextEl = document.getElementById("teacher-task-create-context");
  const newTaskBtn = document.getElementById("teacher-new-task-btn");
  const createMaterialInput = document.getElementById("teacher-task-create-material");
  const createMaterialSummary = document.getElementById("teacher-task-create-material-summary");

  populateTeacherCategoryChips(categoryChipsEl, typeSelect);

  function syncTeacherCreateTaskContext() {
    if (!createContextEl) return;
    const cls = getFilterClass();
    const iso = getTaskListDate().trim().slice(0, 10);
    createContextEl.innerHTML = "";
    const line = document.createElement("p");
    line.className = "teacher-task-create-context__line";
    const classSpan = document.createElement("span");
    classSpan.className = "teacher-task-create-context__class";
    classSpan.textContent = cls;
    const sep = document.createElement("span");
    sep.className = "teacher-task-create-context__sep";
    sep.textContent = " · ";
    const dateSpan = document.createElement("span");
    dateSpan.className = "teacher-task-create-context__date";
    dateSpan.textContent = formatDisplayDate(iso);
    line.appendChild(classSpan);
    line.appendChild(sep);
    line.appendChild(dateSpan);
    createContextEl.appendChild(line);
    const hint = document.createElement("p");
    hint.className = "teacher-task-create-context__hint";
    hint.textContent = t("teacher_create_context_hint");
    createContextEl.appendChild(hint);
    taskClassSelect.value = cls;
    if (iso.length >= 10) dateInput.value = iso;
  }

  function openTeacherCreateTaskPanel(options = {}) {
    const { focusTitle = true, scroll = true } = options;
    syncTeacherCreateTaskContext();
    if (createTaskDetailsEl) createTaskDetailsEl.open = true;
    if (!String(typeSelect.value || "").trim() && TASK_CATEGORIES.length) {
      typeSelect.value = TASK_CATEGORIES.includes("Homework") ? "Homework" : TASK_CATEGORIES[0];
      syncTeacherCategoryChipHighlight(categoryChipsEl, typeSelect);
    }
    if (scroll && createTaskDetailsEl) {
      createTaskDetailsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (focusTitle) {
      const titleEl = document.getElementById("task-title");
      if (titleEl) titleEl.focus();
    }
  }

  if (newTaskBtn) {
    newTaskBtn.addEventListener("click", () => openTeacherCreateTaskPanel());
  }

  if (createMaterialInput && createMaterialSummary) {
    const refreshMaterialSummary = () => {
      updateSelectedFileSummary(createMaterialInput, createMaterialSummary);
    };
    createMaterialInput.addEventListener("change", refreshMaterialSummary);
    refreshMaterialSummary();
  }

  function syncTeacherTemplateFormDefaults() {
    const d = getTaskListDate().trim().slice(0, 10);
    if (templateApplyDateEl && d.length >= 10) templateApplyDateEl.value = d;
    if (templateApplyClassEl) templateApplyClassEl.value = getFilterClass();
    syncTeacherTemplateApplyContext();
  }

  function syncTeacherTemplateApplyContext() {
    if (!templateApplyContextEl) return;
    const cls = getFilterClass();
    const iso = getTaskListDate().trim().slice(0, 10);
    templateApplyContextEl.innerHTML = "";
    const line = document.createElement("p");
    line.className = "teacher-template-apply-context__line";
    const classSpan = document.createElement("span");
    classSpan.className = "teacher-template-apply-context__class";
    classSpan.textContent = cls;
    const sep = document.createElement("span");
    sep.className = "teacher-template-apply-context__sep";
    sep.textContent = " · ";
    const dateSpan = document.createElement("span");
    dateSpan.className = "teacher-template-apply-context__date";
    dateSpan.textContent = iso.length >= 10 ? formatDisplayDate(iso) : "—";
    line.appendChild(classSpan);
    line.appendChild(sep);
    line.appendChild(dateSpan);
    templateApplyContextEl.appendChild(line);
    const hint = document.createElement("p");
    hint.className = "teacher-template-apply-context__hint";
    hint.textContent = t("template_apply_context_hint");
    templateApplyContextEl.appendChild(hint);
  }

  function syncTeacherTemplateMaterialFromSelect() {
    if (!templateIncludeMatEl) return;
    const tid = teacherSelectedTemplateId;
    const tmpl =
      tid != null
        ? teacherTemplatesCache.find((row) => Number(row.id) === Number(tid))
        : null;
    if (!tmpl) {
      templateIncludeMatEl.disabled = true;
      templateIncludeMatEl.checked = false;
      return;
    }
    const has = !!(tmpl.file_path && String(tmpl.file_path).trim());
    templateIncludeMatEl.disabled = !has;
    if (!has) templateIncludeMatEl.checked = false;
  }

  function setTeacherTemplateSelection(templateId) {
    const tid = templateId != null ? Number(templateId) : NaN;
    teacherSelectedTemplateId = Number.isFinite(tid) ? tid : null;
    if (templateSelectEl) {
      templateSelectEl.value =
        teacherSelectedTemplateId != null ? String(teacherSelectedTemplateId) : "";
    }
    const filterVal = templateCategoryFilterEl
      ? templateCategoryFilterEl.value || "all"
      : "all";
    const filtered = filterTeacherTemplatesByCategory(teacherTemplatesCache, filterVal);
    renderTeacherTemplateLibrary(
      templateLibraryListEl,
      templateLibraryEmptyEl,
      filtered,
      teacherSelectedTemplateId,
    );
    const tmpl = Number.isFinite(tid)
      ? teacherTemplatesCache.find((row) => Number(row.id) === tid)
      : null;
    renderTeacherTemplatePreview(templatePreviewInnerEl, tmpl);
    syncTeacherTemplateMaterialFromSelect();
  }

  function refreshTeacherTemplateLibraryView() {
    const filterVal = templateCategoryFilterEl
      ? templateCategoryFilterEl.value || "all"
      : "all";
    const filtered = filterTeacherTemplatesByCategory(teacherTemplatesCache, filterVal);
    let sel = teacherSelectedTemplateId;
    if (sel != null && !filtered.some((row) => Number(row.id) === Number(sel))) {
      sel = filtered.length ? filtered[0].id : null;
    }
    if (sel == null && filtered.length > 0) {
      sel = filtered[0].id;
    }
    setTeacherTemplateSelection(sel);
  }

  function openTeacherTemplatePanel() {
    syncTeacherTemplateFormDefaults();
    if (fromTemplateDetailsEl) fromTemplateDetailsEl.open = true;
    refreshTeacherTemplateLibraryView();
    if (fromTemplateDetailsEl) {
      fromTemplateDetailsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function renderTeacherTemplateManageList(list) {
    templateManageListEl.innerHTML = "";
    const items = Array.isArray(list) ? list : [];
    if (items.length === 0) {
      templateManageEmptyEl.classList.remove("hidden");
      return;
    }
    templateManageEmptyEl.classList.add("hidden");
    items.forEach((t) => {
      const li = document.createElement("li");
      li.className = "teacher-template-manage-list__item";

      const meta = document.createElement("div");
      meta.className = "teacher-template-manage-list__meta";

      const nameEl = document.createElement("span");
      nameEl.className = "teacher-template-manage-list__name";
      nameEl.textContent =
        t.name != null && String(t.name).trim() ? String(t.name).trim() : `Template ${t.id}`;

      const subEl = document.createElement("span");
      subEl.className = "teacher-template-manage-list__sub";
      const cat = t.category != null && String(t.category).trim() ? String(t.category).trim() : "—";
      const ttl = taskDisplayTitle(t);
      subEl.textContent = `${cat} · ${ttl}`;

      meta.appendChild(nameEl);
      meta.appendChild(subEl);

      const actions = document.createElement("div");
      actions.className = "teacher-template-manage-list__actions";

      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "btn-secondary teacher-template-manage-use";
      useBtn.setAttribute("data-template-id", String(t.id));
      useBtn.textContent = t("use_template");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-secondary teacher-template-manage-delete";
      btn.setAttribute("data-template-id", String(t.id));
      btn.textContent = t("delete_btn");

      actions.appendChild(useBtn);
      actions.appendChild(btn);
      li.appendChild(meta);
      li.appendChild(actions);
      templateManageListEl.appendChild(li);
    });
  }

  async function loadTeacherTemplatesForPage() {
    try {
      const rows = await apiGet("/api/task-templates");
      teacherTemplatesCache = Array.isArray(rows) ? rows : [];
      const cur = teacherSelectedTemplateId;
      if (templateSelectEl) {
        templateSelectEl.innerHTML = "";
        teacherTemplatesCache.forEach((row) => {
          const o = document.createElement("option");
          o.value = String(row.id);
          o.textContent =
            row.name != null && String(row.name).trim()
              ? String(row.name).trim()
              : `Template ${row.id}`;
          templateSelectEl.appendChild(o);
        });
      }
      renderTeacherTemplateManageList(teacherTemplatesCache);
      if (
        cur != null &&
        teacherTemplatesCache.some((row) => Number(row.id) === Number(cur))
      ) {
        setTeacherTemplateSelection(cur);
      } else {
        refreshTeacherTemplateLibraryView();
      }
    } catch {
      teacherTemplatesCache = [];
      renderTeacherTemplateManageList([]);
      setTeacherTemplateSelection(null);
    }
  }

  populateTeacherTemplateCategoryFilterSelect(templateCategoryFilterEl);
  populateTeacherTemplateCategoryChips(templateCategoryChipsEl, templateCategoryFilterEl);

  if (templateCategoryFilterEl) {
    templateCategoryFilterEl.addEventListener("change", () => {
      syncTeacherTemplateCategoryChipHighlight(
        templateCategoryChipsEl,
        templateCategoryFilterEl,
      );
      refreshTeacherTemplateLibraryView();
    });
  }

  if (templateLibraryListEl) {
    templateLibraryListEl.addEventListener("click", (ev) => {
      const row = ev.target.closest(".teacher-template-library-item");
      if (!row) return;
      const id = Number(row.getAttribute("data-template-id"), 10);
      if (!Number.isFinite(id)) return;
      setTeacherTemplateSelection(id);
    });
  }

  if (openTemplatesBtn) {
    openTemplatesBtn.addEventListener("click", () => openTeacherTemplatePanel());
  }

  templateManageListEl.addEventListener("click", async (ev) => {
    const useBtn = ev.target.closest(".teacher-template-manage-use");
    if (useBtn) {
      const id = Number(useBtn.getAttribute("data-template-id"), 10);
      if (!Number.isFinite(id)) return;
      setTeacherTemplateSelection(id);
      openTeacherTemplatePanel();
      return;
    }

    const btn = ev.target.closest(".teacher-template-manage-delete");
    if (!btn || btn.disabled) return;
    const idStr = btn.getAttribute("data-template-id");
    const tid = idStr ? Number(idStr, 10) : NaN;
    if (!Number.isFinite(tid)) return;
    if (
      !window.confirm(
        "Delete this template? Existing calendar tasks will not be affected.",
      )
    ) {
      return;
    }
    templateManageStatusEl.textContent = "";
    templateManageStatusEl.classList.remove(
      "teacher-template-manage-status--error",
      "teacher-template-manage-status--ok",
    );
    btn.disabled = true;
    try {
      await apiDelete(`/api/task-templates/${tid}`);
      templateManageStatusEl.textContent = "Template deleted.";
      templateManageStatusEl.classList.add("teacher-template-manage-status--ok");
      await loadTeacherTemplatesForPage();
    } catch (err) {
      templateManageStatusEl.textContent = err.message || "Could not delete template.";
      templateManageStatusEl.classList.add("teacher-template-manage-status--error");
    } finally {
      btn.disabled = false;
    }
  });

  /** True while the daily teaching workspace (not the month grid) is visible. */
  function isTeacherDailyVisible() {
    return dailyViewEl.classList.contains("eap-view-panel--active");
  }

  /** Month planner only — hides task cards and forms until another date click. */
  function showTeacherCalendarView() {
    setMobileMasterDetailOpen(teacherDailyWorkspaceEl, false);
    calendarViewEl.classList.add("eap-view-panel--active");
    calendarViewEl.classList.remove("eap-view-panel--inactive");
    dailyViewEl.classList.remove("eap-view-panel--active");
    dailyViewEl.classList.add("eap-view-panel--inactive");
    calendarViewEl.setAttribute("aria-hidden", "false");
    dailyViewEl.setAttribute("aria-hidden", "true");
    mainEl.classList.remove("app-main--daily-mode");
    void reloadTeacherClassStudyPlanDataForViewMonth().then(() => paintPlannerCalendar());
  }

  /** Slide/fade into the per-day workspace and load tasks for that ISO date (YYYY-MM-DD). */
  async function openTeacherDailyAndLoadTasks(iso) {
    const v = String(iso || "").trim().slice(0, 10);
    if (v.length < 10) return false;

    setMobileMasterDetailOpen(teacherDailyWorkspaceEl, false);
    plannerState.selectedISO = v;
    viewDateInput.value = v;
    dateInput.value = v;
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(5, 7));
    if (Number.isFinite(y) && Number.isFinite(m)) {
      plannerState.viewYear = y;
      plannerState.viewMonth = m - 1;
    }

    dailyTitleEl.textContent = `Teaching Tasks for ${formatDisplayDate(v)}`;
    void reloadTeacherClassStudyPlanDataForViewMonth().then(() => paintPlannerCalendar());
    calendarViewEl.classList.remove("eap-view-panel--active");
    calendarViewEl.classList.add("eap-view-panel--inactive");
    dailyViewEl.classList.add("eap-view-panel--active");
    dailyViewEl.classList.remove("eap-view-panel--inactive");
    calendarViewEl.setAttribute("aria-hidden", "true");
    dailyViewEl.setAttribute("aria-hidden", "false");
    mainEl.classList.add("app-main--daily-mode");

    syncTeacherCreateTaskContext();
    syncTeacherTemplateFormDefaults();
    await refreshTaskList();
    return true;
  }

  function showTeacherDailyView(iso) {
    void openTeacherDailyAndLoadTasks(iso);
  }

  backToCalendarBtn.addEventListener("click", () => {
    showTeacherCalendarView();
  });

  if (teacherMobileBackBtn) {
    teacherMobileBackBtn.addEventListener("click", () => {
      setMobileMasterDetailOpen(teacherDailyWorkspaceEl, false);
    });
  }

  function syncAllClassSelectors(primaryValue) {
    const v =
      primaryValue && String(primaryValue).trim()
        ? String(primaryValue).trim()
        : teacherDefaultClassFallback();
    dashboardClassSelect.value = v;
    calendarClassSelect.value = v;
    taskClassSelect.value = v;
    if (templateApplyClassEl) templateApplyClassEl.value = v;
  }

  const today = new Date();
  const todayISO = getTodayISODateLocal();
  dateInput.value = todayISO;
  viewDateInput.value = todayISO;

  /**
   * Planner state: which month you are browsing, which day is selected, and every task Flask
   * returned for this class (we only draw pills for days inside the visible month).
   */
  const plannerState = {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    selectedISO: todayISO,
    tasksAll: [],
    /** @type {Record<string, { total: number, completed: number, planned: number, students: number }>} */
    classStudyPlanSummaryByDate: {},
    /** Latest GET /api/teacher/study-plans/progress payload for visible class + month, or null. */
    teacherStudyPlanProgress: null,
  };

  function teacherPlannerMonthISO() {
    return `${plannerState.viewYear}-${String(plannerState.viewMonth + 1).padStart(2, "0")}`;
  }

  function formatTeacherStudyPlanProgressMonthLabel() {
    const d = new Date(plannerState.viewYear, plannerState.viewMonth, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  async function reloadTeacherClassStudyPlanSummaryForViewMonth() {
    plannerState.classStudyPlanSummaryByDate = {};
    const cls = String(getFilterClass() || "").trim();
    if (!cls) {
      return;
    }
    const qs = new URLSearchParams();
    qs.set("class_name", cls);
    qs.set("month", teacherPlannerMonthISO());
    try {
      const rows = await apiGet(`/api/teacher/study-plans/summary?${qs.toString()}`);
      const map = {};
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          const d = row.date != null ? String(row.date).slice(0, 10) : "";
          const total = Number(row.total);
          if (d.length >= 10 && Number.isFinite(total) && total > 0) {
            const completed = Number(row.completed);
            const planned = Number(row.planned);
            const students = Number(row.students);
            map[d] = {
              total,
              completed: Number.isFinite(completed) ? completed : 0,
              planned: Number.isFinite(planned)
                ? planned
                : Math.max(0, total - (Number.isFinite(completed) ? completed : 0)),
              students: Number.isFinite(students) ? students : 0,
            };
          }
        });
      }
      plannerState.classStudyPlanSummaryByDate = map;
    } catch {
      plannerState.classStudyPlanSummaryByDate = {};
    }
  }

  const TEACHER_STUDY_PLAN_PROGRESS_TOP_N = 5;

  async function reloadTeacherClassStudyPlanProgressForViewMonth() {
    plannerState.teacherStudyPlanProgress = null;
    const cls = String(getFilterClass() || "").trim();
    teacherStudyPlanProgressSubtitleEl.textContent = cls
      ? `Class: ${cls} · ${formatTeacherStudyPlanProgressMonthLabel()}`
      : `Class: — · ${formatTeacherStudyPlanProgressMonthLabel()}`;
    teacherStudyPlanProgressErrorEl.textContent = "";
    teacherStudyPlanProgressErrorEl.classList.add("hidden");
    teacherStudyPlanProgressEmptyEl.textContent = "";
    teacherStudyPlanProgressEmptyEl.classList.add("hidden");
    teacherStudyPlanProgressBodyEl.classList.add("hidden");
    teacherStudyPlanProgressSkillsUl.innerHTML = "";
    teacherStudyPlanProgressTopList.innerHTML = "";
    teacherStudyPlanProgressTopHint.textContent = "";
    teacherStudyPlanProgressTopDetails.classList.add("hidden");
    teacherStudyPlanProgressTopDetails.removeAttribute("open");

    const clearStat = (el) => {
      if (el) el.textContent = "—";
    };
    clearStat(teacherStudyPlanProgressStatTotal);
    clearStat(teacherStudyPlanProgressStatCompleted);
    clearStat(teacherStudyPlanProgressStatPlanned);
    clearStat(teacherStudyPlanProgressStatRate);
    clearStat(teacherStudyPlanProgressStatStudents);
    clearStat(teacherStudyPlanProgressStatMinsTotal);
    clearStat(teacherStudyPlanProgressStatMinsCompleted);

    if (!cls) {
      teacherStudyPlanProgressEmptyEl.textContent = "Choose a class to see student study plan progress.";
      teacherStudyPlanProgressEmptyEl.classList.remove("hidden");
      return;
    }

    const qs = new URLSearchParams();
    qs.set("class_name", cls);
    qs.set("month", teacherPlannerMonthISO());
    try {
      const data = await apiGet(`/api/teacher/study-plans/progress?${qs.toString()}`);
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response");
      }
      const total = Number(data.total);
      if (!Number.isFinite(total) || total < 0) {
        throw new Error("Invalid response");
      }
      plannerState.teacherStudyPlanProgress = data;

      if (total === 0) {
        teacherStudyPlanProgressEmptyEl.textContent =
          "No student personal study plans for this class this month yet.";
        teacherStudyPlanProgressEmptyEl.classList.remove("hidden");
        teacherStudyPlanProgressBodyEl.classList.add("hidden");
        return;
      }

      teacherStudyPlanProgressEmptyEl.classList.add("hidden");
      teacherStudyPlanProgressBodyEl.classList.remove("hidden");

      const completed = Number(data.completed);
      const planned = Number(data.planned);
      const rate = Number(data.completion_rate);
      const studAct = Number(data.students_active);
      const minsT = Number(data.total_planned_minutes);
      const minsC = Number(data.completed_planned_minutes);

      teacherStudyPlanProgressStatTotal.textContent = String(total);
      teacherStudyPlanProgressStatCompleted.textContent = Number.isFinite(completed) ? String(completed) : "0";
      teacherStudyPlanProgressStatPlanned.textContent = Number.isFinite(planned)
        ? String(planned)
        : String(Math.max(0, total - (Number.isFinite(completed) ? completed : 0)));
      teacherStudyPlanProgressStatRate.textContent = Number.isFinite(rate) ? `${rate}%` : "—";
      teacherStudyPlanProgressStatStudents.textContent = Number.isFinite(studAct) ? String(studAct) : "0";
      teacherStudyPlanProgressStatMinsTotal.textContent = Number.isFinite(minsT) ? String(minsT) : "0";
      teacherStudyPlanProgressStatMinsCompleted.textContent = Number.isFinite(minsC) ? String(minsC) : "0";

      teacherStudyPlanProgressSkillsUl.innerHTML = "";
      const breakdown = Array.isArray(data.skill_breakdown) ? data.skill_breakdown : [];
      breakdown.forEach((row) => {
        const li = document.createElement("li");
        li.className = "teacher-study-plan-progress-skill";
        const sk = row.skill_area != null ? String(row.skill_area) : "—";
        const t = Number(row.total);
        const c = Number(row.completed);
        const tOk = Number.isFinite(t) ? t : 0;
        const cOk = Number.isFinite(c) ? c : 0;
        li.textContent = `${sk}: ${tOk} total, ${cOk} completed`;
        teacherStudyPlanProgressSkillsUl.appendChild(li);
      });

      const students = Array.isArray(data.student_breakdown) ? [...data.student_breakdown] : [];
      if (students.length > 0) {
        teacherStudyPlanProgressTopDetails.classList.remove("hidden");
        const top = students.slice(0, TEACHER_STUDY_PLAN_PROGRESS_TOP_N);
        if (students.length > TEACHER_STUDY_PLAN_PROGRESS_TOP_N) {
          teacherStudyPlanProgressTopHint.textContent = `Showing top ${TEACHER_STUDY_PLAN_PROGRESS_TOP_N} of ${students.length} students (by plan count).`;
        } else {
          teacherStudyPlanProgressTopHint.textContent = "Ranked by total plans this month.";
        }
        top.forEach((row) => {
          const li = document.createElement("li");
          li.className = "teacher-study-plan-progress-top__item";
          const name =
            row.student_name != null && String(row.student_name).trim()
              ? String(row.student_name).trim()
              : row.student_username != null
                ? String(row.student_username)
                : "—";
          const t = Number(row.total);
          const c = Number(row.completed);
          const p = Number(row.planned);
          const tOk = Number.isFinite(t) ? t : 0;
          const cOk = Number.isFinite(c) ? c : 0;
          const pOk = Number.isFinite(p) ? p : Math.max(0, tOk - cOk);
          li.textContent = `${name}: ${tOk} total · ${cOk} completed · ${pOk} planned`;
          teacherStudyPlanProgressTopList.appendChild(li);
        });
      } else {
        teacherStudyPlanProgressTopDetails.classList.add("hidden");
      }
    } catch {
      plannerState.teacherStudyPlanProgress = null;
      teacherStudyPlanProgressBodyEl.classList.add("hidden");
      teacherStudyPlanProgressEmptyEl.classList.add("hidden");
      teacherStudyPlanProgressTopDetails.classList.add("hidden");
      teacherStudyPlanProgressErrorEl.textContent = "Could not load student study plan progress.";
      teacherStudyPlanProgressErrorEl.classList.remove("hidden");
    }
  }

  async function reloadTeacherClassStudyPlanDataForViewMonth() {
    await Promise.all([
      reloadTeacherClassStudyPlanSummaryForViewMonth(),
      reloadTeacherClassStudyPlanProgressForViewMonth(),
    ]);
    void refreshTeacherClassOverview();
  }

  /** Last GET /api/tasks?date= payload for the daily view — drives master list + detail selection. */
  let lastTeacherDailyTasks = [];
  let selectedTeacherTaskId = null;

  /**
   * Paint the right-hand detail panel with one full task card (upload, submissions, feedback).
   * Re-triggers CSS animation on the inner wrapper when switching tasks.
   */
  function selectTeacherTaskById(taskId, options) {
    const { scrollMaster = false, openSubmissions = false } = options || {};
    const task = lastTeacherDailyTasks.find((t) => Number(t.id) === Number(taskId));
    if (!task) return;

    selectedTeacherTaskId = task.id;
    setTeacherMasterListSelection(masterListEl, task.id);

    if (scrollMaster) {
      const row = masterListEl.querySelector(
        `.teacher-task-master-item[data-task-id="${String(task.id)}"]`,
      );
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
        row.classList.add("teacher-task-master-item--flash");
        window.setTimeout(() => row.classList.remove("teacher-task-master-item--flash"), 1600);
      }
    }

    taskDetailInner.classList.remove("teacher-task-detail-inner--enter");
    void taskDetailInner.offsetWidth;
    taskDetailInner.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "teacher-task-detail-ul";
    ul.appendChild(
      buildTeacherTaskCardElement(task, {
        viewDate: getTaskListDate(),
        viewClass: getFilterClass(),
      }),
    );
    taskDetailInner.appendChild(ul);
    taskDetailEmpty.classList.add("hidden");
    taskDetailInner.classList.remove("hidden");
    taskDetailInner.removeAttribute("hidden");
    taskDetailInner.classList.add("teacher-task-detail-inner--enter");

    if (isEapMobileLayout()) {
      setMobileMasterDetailOpen(teacherDailyWorkspaceEl, true);
      taskDetailInner.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (openSubmissions) {
      window.requestAnimationFrame(() => {
        const viewBtn = taskDetailInner.querySelector(".task-view-submissions");
        if (viewBtn && viewBtn.getAttribute("aria-expanded") !== "true") {
          viewBtn.click();
        }
      });
    }
  }

  /** Class used for dashboard API (entire class, all dates). */
  function getFilterClass() {
    return String(dashboardClassSelect.value || teacherDefaultClassFallback()).trim() || "EAP047";
  }

  /** Calendar date used for GET /api/tasks?class_name=&date= */
  function getTaskListDate() {
    return String(viewDateInput.value || "").trim();
  }

  /** Redraw the big month grid using whatever is already inside plannerState.tasksAll. */
  function paintPlannerCalendar() {
    const byDate = bucketTasksByDate(plannerState.tasksAll);
    renderMonthlyCalendarInto(calendarRoot, {
      year: plannerState.viewYear,
      monthIndex: plannerState.viewMonth,
      selectedISO: plannerState.selectedISO,
      todayISO: getTodayISODateLocal(),
      tasksByDate: byDate,
      classStudyPlanSummaryByDate: plannerState.classStudyPlanSummaryByDate,
      onSelectDate(iso) {
        showTeacherDailyView(iso);
      },
      onPrevMonth() {
        if (plannerState.viewMonth === 0) {
          plannerState.viewMonth = 11;
          plannerState.viewYear -= 1;
        } else {
          plannerState.viewMonth -= 1;
        }
        void reloadTeacherClassStudyPlanDataForViewMonth().then(() => paintPlannerCalendar());
      },
      onNextMonth() {
        if (plannerState.viewMonth === 11) {
          plannerState.viewMonth = 0;
          plannerState.viewYear += 1;
        } else {
          plannerState.viewMonth += 1;
        }
        void reloadTeacherClassStudyPlanDataForViewMonth().then(() => paintPlannerCalendar());
      },
    });
  }
  window.__eapTeacherRepaintCalendar = paintPlannerCalendar;

  /** Fetch every task for the current class once, then repaint pills (cheap month hops afterwards). */
  async function reloadPlannerTasksFromApi() {
    try {
      const cls = getFilterClass();
      const raw = await apiGet(`/api/tasks?class_name=${encodeURIComponent(cls)}`);
      plannerState.tasksAll = Array.isArray(raw) ? raw : [];
      setTeacherPageError(pageErrorEl, "");
    } catch (err) {
      plannerState.tasksAll = [];
      setTeacherPageError(pageErrorEl, err.message);
    }
    await reloadTeacherClassStudyPlanDataForViewMonth();
    paintPlannerCalendar();
  }

  function emptyListMsg() {
    return t("no_tasks_class_date");
  }
  const EMPTY_LIST_MSG = emptyListMsg();

  async function refreshDashboard() {
    try {
      const cls = getFilterClass();
      const qs = new URLSearchParams();
      qs.set("class_name", cls);
      const day = getTaskListDate().trim().slice(0, 10);
      if (
        dailyViewEl &&
        dailyViewEl.classList.contains("eap-view-panel--active") &&
        day.length >= 10
      ) {
        qs.set("date", day);
      }
      const stats = await apiGet(`/api/teacher/progress?${qs.toString()}`);
      setDashboardValues(stats);
      setTeacherPageError(pageErrorEl, "");
    } catch (err) {
      setTeacherPageError(pageErrorEl, err.message);
    }
  }

  async function refreshTeacherClassOverview() {
    const scopeEl = document.getElementById("teacher-overview-scope");
    const progressBarEl = document.getElementById("teacher-overview-progress-bar");
    const categoriesEl = document.getElementById("teacher-overview-categories");
    const rosterTbody = document.getElementById("teacher-roster-tbody");
    const rosterWrap = document.getElementById("teacher-roster-table-wrap");
    const rosterEmpty = document.getElementById("teacher-roster-empty");
    if (!scopeEl && !progressBarEl) return;

    try {
      const cls = getFilterClass();
      const month = teacherPlannerMonthISO();
      const qsBase = new URLSearchParams();
      qsBase.set("class_name", cls);
      qsBase.set("month", month);
      const [stats, roster] = await Promise.all([
        apiGet(`/api/teacher/progress?${qsBase.toString()}`),
        apiGet(`/api/teacher/class-roster-progress?${qsBase.toString()}`),
      ]);
      setTeacherClassOverviewValues(stats, roster, scopeEl, progressBarEl, categoriesEl);
      renderTeacherRosterTable(
        rosterTbody,
        rosterWrap,
        rosterEmpty,
        roster && Array.isArray(roster.students) ? roster.students : [],
      );
    } catch (err) {
      if (scopeEl) {
        scopeEl.textContent = err.message || t("could_not_load_progress");
      }
      if (categoriesEl) categoriesEl.innerHTML = "";
      if (progressBarEl) progressBarEl.innerHTML = "";
      renderTeacherAttentionList(
        document.getElementById("teacher-overview-attention-list"),
        document.getElementById("teacher-overview-attention-empty"),
        [],
      );
      renderTeacherRosterTable(rosterTbody, rosterWrap, rosterEmpty, []);
    }
  }

  async function loadTeacherStudyPlans() {
    const day = getTaskListDate().trim().slice(0, 10);
    if (day.length < 10) {
      teacherStudyPlansTbody.innerHTML = "";
      teacherStudyPlansWrapEl.classList.add("hidden");
      teacherStudyPlansEmptyEl.classList.remove("hidden");
      teacherStudyPlansEmptyEl.textContent = "Pick a date to see student plans.";
      return;
    }
    const cls = getFilterClass();
    try {
      const qs = new URLSearchParams();
      qs.set("class_name", cls);
      qs.set("date", day);
      const rows = await apiGet(`/api/teacher/study-plans?${qs.toString()}`);
      const list = Array.isArray(rows) ? rows : [];
      teacherStudyPlansTbody.innerHTML = "";
      if (list.length === 0) {
        teacherStudyPlansWrapEl.classList.add("hidden");
        teacherStudyPlansEmptyEl.classList.remove("hidden");
        teacherStudyPlansEmptyEl.textContent = "No personal study plans for this class and date.";
        return;
      }
      teacherStudyPlansEmptyEl.classList.add("hidden");
      teacherStudyPlansWrapEl.classList.remove("hidden");
      list.forEach((r) => {
        const tr = document.createElement("tr");
        const tdUser = document.createElement("td");
        const fn =
          r.student_full_name != null && String(r.student_full_name).trim()
            ? String(r.student_full_name).trim()
            : "";
        const un = r.student_username != null ? String(r.student_username) : "—";
        tdUser.textContent = fn ? `${un} (${fn})` : un;

        const tdDate = document.createElement("td");
        tdDate.textContent = r.date != null ? String(r.date).slice(0, 10) : "—";

        const tdSkill = document.createElement("td");
        tdSkill.textContent = r.skill_area != null ? String(r.skill_area) : "—";

        const tdTitle = document.createElement("td");
        tdTitle.textContent = r.title != null ? String(r.title) : "—";

        const tdDesc = document.createElement("td");
        tdDesc.className = "teacher-study-plans-table__desc";
        tdDesc.textContent =
          r.description != null && String(r.description).trim()
            ? String(r.description).trim()
            : "—";

        const tdMin = document.createElement("td");
        tdMin.textContent =
          r.planned_minutes != null && Number.isFinite(Number(r.planned_minutes))
            ? String(r.planned_minutes)
            : "—";

        const tdSt = document.createElement("td");
        tdSt.textContent = r.status != null ? String(r.status) : "—";

        const tdSug = document.createElement("td");
        tdSug.className = "teacher-study-plans-table__suggestion-cell";
        const planId = r.id != null ? Number(r.id) : NaN;
        const sugWrap = document.createElement("div");
        sugWrap.className = "teacher-study-plan-suggestion";
        if (Number.isFinite(planId)) {
          sugWrap.setAttribute("data-teacher-suggestion-plan", String(planId));
        }
        const taSug = document.createElement("textarea");
        taSug.className = "teacher-study-plan-suggestion__textarea";
        taSug.rows = 2;
        taSug.setAttribute(
          "aria-label",
          `Teacher suggestion for plan ${r.id != null ? String(r.id) : ""}`,
        );
        taSug.value =
          r.teacher_suggestion != null && String(r.teacher_suggestion)
            ? String(r.teacher_suggestion)
            : "";
        const btnSug = document.createElement("button");
        btnSug.type = "button";
        btnSug.className = "btn-secondary teacher-study-plan-suggestion__save";
        btnSug.textContent = "Save Suggestion";
        const statusSug = document.createElement("span");
        statusSug.className = "teacher-study-plan-suggestion__status";
        statusSug.setAttribute("role", "status");
        statusSug.setAttribute("aria-live", "polite");
        sugWrap.appendChild(taSug);
        sugWrap.appendChild(btnSug);
        sugWrap.appendChild(statusSug);
        tdSug.appendChild(sugWrap);

        btnSug.addEventListener("click", async () => {
          if (!Number.isFinite(planId)) return;
          statusSug.textContent = "";
          statusSug.classList.remove(
            "teacher-study-plan-suggestion__status--error",
            "teacher-study-plan-suggestion__status--ok",
          );
          btnSug.disabled = true;
          try {
            const saved = await apiPutJson(`/api/teacher/study-plans/${planId}/suggestion`, {
              teacher_suggestion: taSug.value,
            });
            if (saved && typeof saved.teacher_suggestion === "string") {
              taSug.value = saved.teacher_suggestion;
            } else if (saved && saved.teacher_suggestion == null) {
              taSug.value = "";
            }
            statusSug.textContent = "Saved just now.";
            statusSug.classList.add("teacher-study-plan-suggestion__status--ok");
          } catch (err) {
            statusSug.textContent = err.message || "Could not save.";
            statusSug.classList.add("teacher-study-plan-suggestion__status--error");
          } finally {
            btnSug.disabled = false;
          }
        });

        tr.appendChild(tdUser);
        tr.appendChild(tdDate);
        tr.appendChild(tdSkill);
        tr.appendChild(tdTitle);
        tr.appendChild(tdDesc);
        tr.appendChild(tdMin);
        tr.appendChild(tdSt);
        tr.appendChild(tdSug);
        teacherStudyPlansTbody.appendChild(tr);
      });
    } catch {
      teacherStudyPlansTbody.innerHTML = "";
      teacherStudyPlansWrapEl.classList.add("hidden");
      teacherStudyPlansEmptyEl.classList.remove("hidden");
      teacherStudyPlansEmptyEl.textContent = "Could not load study plans.";
    }
  }

  async function refreshTaskList() {
    const day = getTaskListDate();
    if (!day) {
      setTeacherPageError(pageErrorEl, "Choose a calendar date to load tasks.");
      masterListEl.innerHTML = "";
      taskDetailInner.innerHTML = "";
      taskDetailInner.classList.add("hidden");
      taskDetailInner.setAttribute("hidden", "");
      taskDetailEmpty.classList.remove("hidden");
      setTeacherTaskDetailEmpty("no-date");
      emptyHintEl.classList.remove("hidden");
      emptyHintEl.textContent =
        "Pick a date on the calendar (or adjust the date field), and tasks appear below.";
      taskScopeEl.textContent = "";
      lastTeacherDailyTasks = [];
      selectedTeacherTaskId = null;
      fillTeacherDailyChips(null, 0);
      await loadTeacherStudyPlans();
      return;
    }

    try {
      const cls = getFilterClass();
      dailyClassLabelEl.textContent = `Class: ${cls}`;
      setTeacherPageError(pageErrorEl, "");
      syncTeacherTemplateFormDefaults();

      masterListEl.innerHTML = "";
      taskDetailInner.innerHTML = "";

      const qsTasks = new URLSearchParams();
      qsTasks.set("class_name", cls);
      qsTasks.set("date", day);

      const qsProgress = new URLSearchParams();
      qsProgress.set("class_name", cls);
      qsProgress.set("date", day);

      const loggedUser = getLoggedInUser();
      const completionPromise = fetchTeacherTaskCompletionsMap(
        cls,
        day,
        loggedUser && loggedUser.username != null ? String(loggedUser.username) : "",
      ).catch(() => new Map());

      const [rawList, progressPayload, completionMap] = await Promise.all([
        apiGet(`/api/tasks?${qsTasks.toString()}`),
        apiGet(`/api/teacher/progress?${qsProgress.toString()}`).catch(() => null),
        completionPromise,
      ]);

      const tasks = Array.isArray(rawList) ? rawList.map(normalizeTask) : [];
      const sorted = [...tasks].sort(compareTasksForSort);
      lastTeacherDailyTasks = sorted;
      const statsMap = buildTeacherTaskStatsMapFromProgress(progressPayload);
      fillTeacherDailyChips(progressPayload, sorted.length);

      const dateLabel = formatDisplayDate(day);
      taskScopeEl.textContent = `${cls} · ${dateLabel}`;

      if (sorted.length === 0) {
        emptyHintEl.classList.remove("hidden");
        emptyHintEl.textContent = emptyListMsg();
        renderTeacherTaskMasterList(masterListEl, [], statsMap, completionMap);
        taskDetailInner.classList.add("hidden");
        taskDetailInner.setAttribute("hidden", "");
        taskDetailEmpty.classList.remove("hidden");
        setTeacherTaskDetailEmpty("no-tasks");
        selectedTeacherTaskId = null;
        openTeacherCreateTaskPanel({ focusTitle: false, scroll: false });
        await loadTeacherStudyPlans();
        return;
      }

      emptyHintEl.classList.add("hidden");

      const pendingId = teacherPendingAttentionTaskId;
      const pendingOpen = teacherPendingAttentionOpenSubmissions;
      const pendingScroll = teacherPendingAttentionScrollMaster;
      teacherPendingAttentionTaskId = null;
      teacherPendingAttentionOpenSubmissions = false;
      teacherPendingAttentionScrollMaster = false;

      const pendingCopyId = teacherPendingCopySelectTaskId;
      teacherPendingCopySelectTaskId = null;

      let selId = null;
      if (pendingId != null) {
        const hit = sorted.find((t) => Number(t.id) === Number(pendingId));
        if (hit) selId = hit.id;
      }
      if (selId == null && pendingCopyId != null) {
        const hitCopy = sorted.find((t) => Number(t.id) === Number(pendingCopyId));
        if (hitCopy) selId = hitCopy.id;
      }
      if (selId == null && selectedTeacherTaskId != null) {
        const keep = sorted.find((t) => Number(t.id) === Number(selectedTeacherTaskId));
        if (keep) selId = keep.id;
      }
      if (selId == null) selId = sorted[0].id;

      renderTeacherTaskMasterList(masterListEl, sorted, statsMap, completionMap);
      selectTeacherTaskById(selId, {
        scrollMaster: pendingScroll && Number(selId) === Number(pendingId),
        openSubmissions: pendingOpen && Number(selId) === Number(pendingId),
      });

      if (pendingId != null && !sorted.some((t) => Number(t.id) === Number(pendingId))) {
        setTeacherPageError(
          pageErrorEl,
          "That task was not found for this date. Check the class filter matches the task’s class.",
        );
      }
      await loadTeacherStudyPlans();
    } catch (err) {
      setTeacherPageError(pageErrorEl, err.message);
      taskScopeEl.textContent = "";
      await loadTeacherStudyPlans();
    }
  }

  /** When the typed `<input type="date">` changes, jump the planner month to match and restyle cells. */
  function syncSelectedDateFromInputs(sourceInput) {
    const v = String(sourceInput.value || "").trim();
    if (!v || v.length < 10) return;
    plannerState.selectedISO = v;
    viewDateInput.value = v;
    dateInput.value = v;
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(5, 7));
    if (Number.isFinite(y) && Number.isFinite(m)) {
      plannerState.viewYear = y;
      plannerState.viewMonth = m - 1;
    }
    void reloadTeacherClassStudyPlanDataForViewMonth().then(() => paintPlannerCalendar());
  }

  dashboardClassSelect.addEventListener("change", () => {
    syncAllClassSelectors(dashboardClassSelect.value);
    reloadPlannerTasksFromApi().then(() => {
      refreshDashboard();
      if (isTeacherDailyVisible()) refreshTaskList();
    });
  });

  calendarClassSelect.addEventListener("change", () => {
    syncAllClassSelectors(calendarClassSelect.value);
    reloadPlannerTasksFromApi().then(() => {
      refreshDashboard();
      if (isTeacherDailyVisible()) {
        syncTeacherCreateTaskContext();
        refreshTaskList();
      }
    });
  });

  if (viewTasksBtn) {
    viewTasksBtn.addEventListener("click", () => {
      refreshTaskList();
    });
  }

  viewDateInput.addEventListener("change", () => {
    syncSelectedDateFromInputs(viewDateInput);
    syncTeacherCreateTaskContext();
    if (isTeacherDailyVisible()) refreshTaskList();
  });

  dateInput.addEventListener("change", () => {
    syncSelectedDateFromInputs(dateInput);
    syncTeacherCreateTaskContext();
    if (isTeacherDailyVisible()) refreshTaskList();
  });

  masterListEl.addEventListener("click", (ev) => {
    const row = ev.target.closest(".teacher-task-master-item");
    if (!row || row.disabled) return;
    const id = Number(row.getAttribute("data-task-id"), 10);
    if (!Number.isFinite(id)) return;
    selectTeacherTaskById(id, { scrollMaster: false, openSubmissions: false });
  });

  taskDetailInner.addEventListener("change", (ev) => {
    const uploadInput = ev.target.closest(".task-upload-input");
    if (!uploadInput) return;
    const card = uploadInput.closest("li.task-card");
    updateSelectedFileSummary(
      uploadInput,
      card ? card.querySelector(".task-upload-selected-file") : null,
    );
  });

  /*
    Progress dashboard → jump to the task’s date; refreshTaskList selects the task + optional submissions.
  */
  function bindTeacherAttentionListClick(listEl) {
    if (!listEl) return;
    listEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".attention-open-task");
      if (!btn || btn.disabled) return;

      const taskIdStr = btn.getAttribute("data-task-id");
      const taskDateStr = btn.getAttribute("data-task-date");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      if (!Number.isFinite(taskId) || !taskDateStr || taskDateStr.length < 10) return;

      teacherPendingAttentionTaskId = taskId;
      teacherPendingAttentionOpenSubmissions = true;
      teacherPendingAttentionScrollMaster = true;

      btn.disabled = true;
      setTeacherPageError(pageErrorEl, "");
      try {
        const ok = await openTeacherDailyAndLoadTasks(taskDateStr);
        if (!ok) return;
      } catch (err) {
        setTeacherPageError(pageErrorEl, err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  bindTeacherAttentionListClick(document.getElementById("teacher-attention-list"));
  bindTeacherAttentionListClick(document.getElementById("teacher-overview-attention-list"));

  /*
    Right detail panel: same delegated handlers as before (View Submissions, Save Feedback, upload).
    The full task card is injected into #teacher-task-detail-inner when the teacher picks a row.
  */
  taskDetailInner.addEventListener("click", async (ev) => {
    const saveTplBtn = ev.target.closest(".task-save-template");
    if (saveTplBtn) {
      const card = saveTplBtn.closest("li.task-card");
      if (!card) return;
      const statusEl = card.querySelector(".task-template-save-status");
      const nameInp = card.querySelector(".task-template-save-name");
      const titleInp = card.querySelector(".task-template-save-title");
      const catInp = card.querySelector(".task-template-save-category");
      const perInp = card.querySelector(".task-template-save-period");
      const descTa = card.querySelector(".task-template-save-description");
      const matCb = card.querySelector(".task-template-save-material");
      const taskIdStr = saveTplBtn.getAttribute("data-task-id");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;

      const nm = nameInp ? String(nameInp.value || "").trim() : "";
      const ttl = titleInp ? String(titleInp.value || "").trim() : "";
      const cat = catInp ? String(catInp.value || "").trim() : "";
      const per = perInp ? String(perInp.value || "").trim() : "";
      const desc = descTa ? String(descTa.value || "").trim() : "";

      if (!nm || !ttl || !cat) {
        if (statusEl) {
          statusEl.textContent = "Template name, title, and category are required.";
          statusEl.classList.add("task-template-save-status--error");
        }
        return;
      }
      if (statusEl) {
        statusEl.classList.remove("task-template-save-status--error");
        statusEl.textContent = "";
      }

      const body = {
        name: nm,
        title: ttl,
        category: cat,
        period: per,
        description: desc,
      };
      if (Number.isFinite(taskId)) {
        const src = lastTeacherDailyTasks.find((t) => Number(t.id) === Number(taskId));
        if (src) {
          if (src.title_zh != null && String(src.title_zh).trim()) {
            body.title_zh = String(src.title_zh).trim();
          }
          if (src.description_zh != null && String(src.description_zh).trim()) {
            body.description_zh = String(src.description_zh).trim();
          }
          if (matCb && matCb.checked && !matCb.disabled && src.file_path && String(src.file_path).trim()) {
            body.file_path = String(src.file_path).trim();
            if (src.file_name != null && String(src.file_name).trim()) {
              body.file_name = String(src.file_name).trim();
            }
          }
        }
      }

      saveTplBtn.disabled = true;
      setTeacherPageError(pageErrorEl, "");
      try {
        await apiPost("/api/task-templates", body);
        if (statusEl) {
          statusEl.textContent = "Template saved.";
          statusEl.classList.remove("task-template-save-status--error");
        }
        await loadTeacherTemplatesForPage();
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message || "Save failed.";
          statusEl.classList.add("task-template-save-status--error");
        }
        setTeacherPageError(pageErrorEl, err.message);
      } finally {
        saveTplBtn.disabled = false;
      }
      return;
    }

    const copyBtn = ev.target.closest(".task-copy-create");
    if (copyBtn) {
      const card = copyBtn.closest("li.task-card");
      if (!card) return;
      const taskIdStr = copyBtn.getAttribute("data-task-id") || card.getAttribute("data-task-id");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      if (!Number.isFinite(taskId)) return;

      const dateInp = card.querySelector(".task-copy-date");
      const classSel = card.querySelector(".task-copy-class");
      const matCb = card.querySelector(".task-copy-material");
      const statusEl = card.querySelector(".task-copy-status");

      const d = dateInp ? String(dateInp.value || "").trim() : "";
      if (!d || d.length < 10) {
        if (statusEl) {
          statusEl.textContent = "Please choose a date.";
          statusEl.classList.add("task-copy-status--error");
        }
        return;
      }
      if (statusEl) {
        statusEl.classList.remove("task-copy-status--error");
        statusEl.textContent = "";
      }

      const cls =
        classSel && String(classSel.value || "").trim()
          ? String(classSel.value).trim()
          : teacherDefaultClassFallback();
      const copyMat = !!(matCb && matCb.checked && !matCb.disabled);

      copyBtn.disabled = true;
      setTeacherPageError(pageErrorEl, "");
      try {
        const created = await apiCopyTask(taskId, {
          date: d.slice(0, 10),
          class_name: cls,
          copy_material: copyMat,
        });
        await reloadPlannerTasksFromApi();
        await refreshDashboard();

        const curDay = getTaskListDate().trim().slice(0, 10);
        const curCls = getFilterClass();
        const newDay = String(created.date || "").trim().slice(0, 10);
        const newCls =
          created.class_name != null && String(created.class_name).trim()
            ? String(created.class_name).trim()
            : teacherDefaultClassFallback();

        if (newDay.length >= 10 && newDay === curDay && newCls === curCls) {
          teacherPendingCopySelectTaskId = Number(created.id);
          await refreshTaskList();
          if (statusEl) statusEl.textContent = "Copy created.";
          messageEl.classList.remove("form-message--error");
          messageEl.textContent = "Task copied.";
          messageEl.classList.add("form-message--success");
        } else {
          if (isTeacherDailyVisible()) await refreshTaskList();
          const when = formatDisplayDate(newDay);
          if (statusEl) statusEl.textContent = "Done.";
          messageEl.classList.remove("form-message--error");
          messageEl.textContent = `Task copied to ${when} for ${newCls}.`;
          messageEl.classList.add("form-message--success");
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message || "Copy failed.";
          statusEl.classList.add("task-copy-status--error");
        }
        setTeacherPageError(pageErrorEl, err.message);
      } finally {
        copyBtn.disabled = false;
      }
      return;
    }

    const viewBtn = ev.target.closest(".task-view-submissions");
    if (viewBtn) {
      const card = viewBtn.closest("li.task-card");
      if (!card) return;

      const panel = card.querySelector(".task-submissions-panel");
      const listContainer = card.querySelector(".task-submissions-list");
      const fetchStatus = card.querySelector(".task-submissions-fetch-status");
      const taskIdStr = viewBtn.getAttribute("data-task-id");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      if (!Number.isFinite(taskId) || !panel || !listContainer) return;

      const expanded = viewBtn.getAttribute("aria-expanded") === "true";

      if (expanded) {
        panel.classList.add("hidden");
        panel.setAttribute("hidden", "");
        viewBtn.setAttribute("aria-expanded", "false");
        viewBtn.textContent = t("view_submissions");
        if (fetchStatus) {
          fetchStatus.textContent = "";
          fetchStatus.classList.remove("task-submissions-fetch-status--error");
        }
        return;
      }

      viewBtn.disabled = true;
      if (fetchStatus) {
        fetchStatus.textContent = t("loading_submissions");
        fetchStatus.classList.remove("task-submissions-fetch-status--error");
      }
      setTeacherPageError(pageErrorEl, "");

      try {
        /* Flask GET /api/tasks/<id>/submissions (JSON array). */
        const rows = await apiGet(`/api/tasks/${taskId}/submissions`);
        renderTeacherSubmissionsInto(listContainer, rows, taskId);

        panel.classList.remove("hidden");
        panel.removeAttribute("hidden");
        viewBtn.setAttribute("aria-expanded", "true");
        viewBtn.textContent = t("hide_submissions");
        if (fetchStatus) fetchStatus.textContent = "";
      } catch (err) {
        if (fetchStatus) {
          fetchStatus.textContent = err.message;
          fetchStatus.classList.add("task-submissions-fetch-status--error");
        }
      } finally {
        viewBtn.disabled = false;
      }
      return;
    }

    const multiUploadBtn = ev.target.closest(".task-submission-feedback-files__upload");
    if (multiUploadBtn) {
      const taskIdStr = multiUploadBtn.getAttribute("data-task-id");
      const submissionIdStr = multiUploadBtn.getAttribute("data-submission-id");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      const submissionId = submissionIdStr ? Number(submissionIdStr, 10) : NaN;
      if (!Number.isFinite(taskId) || !Number.isFinite(submissionId)) return;

      const article = multiUploadBtn.closest(".task-submission-card");
      if (!article) return;
      const multiInput = article.querySelector(".task-submission-feedback-files-input");
      const uploadStatus = article.querySelector(".task-submission-feedback-files-upload-status");
      const card = multiUploadBtn.closest("li.task-card");
      const listContainer = card ? card.querySelector(".task-submissions-list") : null;
      const fetchStatus = card ? card.querySelector(".task-submissions-fetch-status") : null;

      const existingCount = Number(multiUploadBtn.getAttribute("data-existing-count"), 10) || 0;
      const files = multiInput && multiInput.files ? Array.from(multiInput.files) : [];
      const allowedExt = new Set(["pdf", "doc", "docx", "txt", "jpg", "jpeg", "png"]);

      const bad = files.find((f) => {
        const n = (f.name || "").toLowerCase();
        const i = n.lastIndexOf(".");
        const ext = i >= 0 ? n.slice(i + 1) : "";
        return !allowedExt.has(ext);
      });
      if (bad) {
        if (uploadStatus) {
          uploadStatus.textContent =
            "Each file must be pdf, doc, docx, txt, jpg, or png.";
          uploadStatus.classList.add("task-submission-feedback-files-upload-status--error");
        }
        return;
      }

      if (files.length === 0) {
        if (uploadStatus) {
          uploadStatus.textContent = "Choose one or more files first.";
          uploadStatus.classList.add("task-submission-feedback-files-upload-status--error");
        }
        return;
      }

      if (existingCount + files.length > 3) {
        if (uploadStatus) {
          uploadStatus.textContent = `You can store at most 3 additional files (${existingCount} already saved).`;
          uploadStatus.classList.add("task-submission-feedback-files-upload-status--error");
        }
        return;
      }

      multiUploadBtn.disabled = true;
      if (uploadStatus) {
        uploadStatus.textContent = "Uploading…";
        uploadStatus.classList.remove(
          "task-submission-feedback-files-upload-status--error",
          "task-submission-feedback-files-upload-status--ok",
        );
      }
      setTeacherPageError(pageErrorEl, "");

      try {
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));
        const user = getLoggedInUser();
        if (user && user.username != null && String(user.username).trim()) {
          formData.append("uploaded_by_username", String(user.username).trim());
        }
        await apiPostFeedbackFiles(submissionId, formData);
        if (multiInput) multiInput.value = "";
        if (uploadStatus) {
          uploadStatus.textContent = "Files uploaded.";
          uploadStatus.classList.add("task-submission-feedback-files-upload-status--ok");
        }
        if (listContainer) {
          const rows = await apiGet(`/api/tasks/${taskId}/submissions`);
          renderTeacherSubmissionsInto(listContainer, rows, taskId);
        }
        if (fetchStatus) {
          fetchStatus.textContent = "Feedback files updated.";
          fetchStatus.classList.remove("task-submissions-fetch-status--error");
        }
        await refreshDashboard();
      } catch (err) {
        if (uploadStatus) {
          uploadStatus.textContent = err.message;
          uploadStatus.classList.add("task-submission-feedback-files-upload-status--error");
        }
        if (fetchStatus) {
          fetchStatus.textContent = err.message;
          fetchStatus.classList.add("task-submissions-fetch-status--error");
        }
      } finally {
        multiUploadBtn.disabled = false;
      }
      return;
    }

    const attachDelBtn = ev.target.closest(".task-submission-feedback-attach-delete");
    if (attachDelBtn) {
      const aidStr = attachDelBtn.getAttribute("data-attachment-id");
      const taskIdStr = attachDelBtn.getAttribute("data-task-id");
      const submissionIdStr = attachDelBtn.getAttribute("data-submission-id");
      const aid = aidStr ? Number(aidStr, 10) : NaN;
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      const submissionId = submissionIdStr ? Number(submissionIdStr, 10) : NaN;
      if (!Number.isFinite(aid) || !Number.isFinite(taskId)) return;

      const card = attachDelBtn.closest("li.task-card");
      const listContainer = card ? card.querySelector(".task-submissions-list") : null;
      const fetchStatus = card ? card.querySelector(".task-submissions-fetch-status") : null;

      attachDelBtn.disabled = true;
      setTeacherPageError(pageErrorEl, "");
      try {
        await apiDelete(`/api/submission-attachments/${aid}`);
        if (listContainer) {
          const rows = await apiGet(`/api/tasks/${taskId}/submissions`);
          renderTeacherSubmissionsInto(listContainer, rows, taskId);
        }
        if (fetchStatus) {
          fetchStatus.textContent = "Attachment removed.";
          fetchStatus.classList.remove("task-submissions-fetch-status--error");
        }
        await refreshDashboard();
      } catch (err) {
        setTeacherPageError(pageErrorEl, err.message);
        if (fetchStatus) {
          fetchStatus.textContent = err.message;
          fetchStatus.classList.add("task-submissions-fetch-status--error");
        }
      } finally {
        attachDelBtn.disabled = false;
      }
      return;
    }

    const feedbackSaveBtn = ev.target.closest(".task-submission-feedback__save");
    if (feedbackSaveBtn) {
      const taskIdStr = feedbackSaveBtn.getAttribute("data-task-id");
      const submissionIdStr = feedbackSaveBtn.getAttribute("data-submission-id");
      const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
      const submissionId = submissionIdStr ? Number(submissionIdStr, 10) : NaN;
      if (!Number.isFinite(taskId) || !Number.isFinite(submissionId)) return;

      const article = feedbackSaveBtn.closest(".task-submission-card");
      if (!article) return;

      const ta = article.querySelector(".task-submission-feedback-edit__textarea");
      const fileInput = article.querySelector(".task-submission-feedback-file");
      const rowStatus = article.querySelector(".task-submission-feedback__status-msg");
      const card = feedbackSaveBtn.closest("li.task-card");
      const listContainer = card ? card.querySelector(".task-submissions-list") : null;
      const fetchStatus = card ? card.querySelector(".task-submissions-fetch-status") : null;

      const textVal = ta ? String(ta.value || "").trim() : "";
      const hasFile =
        fileInput && fileInput.files && fileInput.files.length > 0;

      if (!textVal && !hasFile) {
        if (rowStatus) {
          rowStatus.textContent =
            "Please enter written feedback and/or choose a legacy single feedback file.";
          rowStatus.classList.remove("task-submission-feedback__status-msg--ok");
          rowStatus.classList.add("task-submission-feedback__status-msg--error");
        }
        return;
      }

      feedbackSaveBtn.disabled = true;
      if (rowStatus) {
        rowStatus.textContent = "";
        rowStatus.classList.remove("task-submission-feedback__status-msg--ok", "task-submission-feedback__status-msg--error");
      }
      setTeacherPageError(pageErrorEl, "");

      try {
        if (hasFile) {
          const formData = new FormData();
          formData.append("teacher_feedback", ta ? String(ta.value || "") : "");
          formData.append("status", "Feedback Given");
          formData.append("file", fileInput.files[0]);
          await apiPutFeedbackFormData(submissionId, formData);
          fileInput.value = "";
        } else {
          await apiPutJson(`/api/submissions/${submissionId}/feedback`, {
            teacher_feedback: ta ? ta.value : "",
            status: "Feedback Given",
          });
        }

        if (rowStatus) {
          rowStatus.textContent = "Feedback saved successfully.";
          rowStatus.classList.add("task-submission-feedback__status-msg--ok");
        }

        if (listContainer) {
          const rows = await apiGet(`/api/tasks/${taskId}/submissions`);
          renderTeacherSubmissionsInto(listContainer, rows, taskId);
        }

        if (fetchStatus) {
          fetchStatus.textContent = "Feedback saved successfully.";
          fetchStatus.classList.remove("task-submissions-fetch-status--error");
        }
        await refreshDashboard();
      } catch (err) {
        if (rowStatus) {
          rowStatus.textContent = err.message;
          rowStatus.classList.add("task-submission-feedback__status-msg--error");
        }
        if (fetchStatus) {
          fetchStatus.textContent = err.message;
          fetchStatus.classList.add("task-submissions-fetch-status--error");
        }
      } finally {
        feedbackSaveBtn.disabled = false;
      }
      return;
    }

    const btn = ev.target.closest(".task-upload-submit");
    if (!btn) return;

    const taskIdStr = btn.getAttribute("data-task-id");
    const taskId = taskIdStr ? Number(taskIdStr, 10) : NaN;
    if (!Number.isFinite(taskId)) return;

    const card = btn.closest("li.task-card");
    if (!card) return;

    const input = card.querySelector(".task-upload-input");
    const statusEl = card.querySelector(".task-upload-status");

    if (!input || !input.files || input.files.length === 0) {
      if (statusEl) {
        statusEl.textContent = "Choose a file first.";
        statusEl.classList.remove("task-upload-status--ok");
        statusEl.classList.add("task-upload-status--error");
      }
      return;
    }

    const file = input.files[0];
    btn.disabled = true;
    if (statusEl) {
      statusEl.textContent = "Uploading…";
      statusEl.classList.remove("task-upload-status--error", "task-upload-status--ok");
    }
    setTeacherPageError(pageErrorEl, "");

    try {
      await apiUploadTaskFile(taskId, file);
      input.value = "";
      updateSelectedFileSummary(input, card.querySelector(".task-upload-selected-file"));
      if (statusEl) {
        statusEl.textContent = "Uploaded.";
        statusEl.classList.add("task-upload-status--ok");
      }
      await refreshTaskList();
      await refreshDashboard();
      await reloadPlannerTasksFromApi();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message;
        statusEl.classList.add("task-upload-status--error");
      }
    } finally {
      btn.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageEl.textContent = "";
    messageEl.classList.remove("form-message--success", "form-message--error");
    setTeacherPageError(pageErrorEl, "");

    const formData = new FormData(form);
    const class_name = String(formData.get("class_name") || "").trim();
    const date = String(formData.get("date") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const title_zh = String(formData.get("title_zh") || "").trim();
    const category = String(formData.get("type") || "").trim();
    const period = String(formData.get("period") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const description_zh = String(formData.get("description_zh") || "").trim();

    if (!date || !title || !category) {
      messageEl.textContent = t("teacher_create_validation");
      messageEl.classList.add("form-message--error");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const created = await apiPost("/api/tasks", {
        date,
        title,
        title_zh: title_zh || null,
        category,
        period,
        description,
        description_zh: description_zh || null,
        class_name: class_name || teacherDefaultClassFallback(),
      });

      let savedMsg = t("task_saved");
      let uploadFailed = false;
      if (
        createMaterialInput &&
        createMaterialInput.files &&
        createMaterialInput.files.length > 0 &&
        created &&
        created.id != null
      ) {
        try {
          await apiUploadTaskFile(Number(created.id, 10), createMaterialInput.files[0]);
          createMaterialInput.value = "";
          if (createMaterialSummary) {
            updateSelectedFileSummary(createMaterialInput, createMaterialSummary);
          }
          savedMsg = t("teacher_task_saved_with_material");
        } catch (uploadErr) {
          uploadFailed = true;
          savedMsg = `${t("task_saved")} ${uploadErr.message}`;
        }
      }

      messageEl.textContent = savedMsg;
      messageEl.classList.toggle("form-message--success", !uploadFailed);
      messageEl.classList.toggle("form-message--error", uploadFailed);

      form.querySelector("#task-title").value = "";
      const titleZhEl = form.querySelector("#task-title-zh");
      if (titleZhEl) titleZhEl.value = "";
      typeSelect.value = TASK_CATEGORIES.includes("Homework") ? "Homework" : TASK_CATEGORIES[0] || "";
      syncTeacherCategoryChipHighlight(categoryChipsEl, typeSelect);
      form.querySelector("#task-period").value = "";
      form.querySelector("#task-description").value = "";
      const descZhEl = form.querySelector("#task-description-zh");
      if (descZhEl) descZhEl.value = "";

      await refreshTaskList();
      await refreshDashboard();
      await reloadPlannerTasksFromApi();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.classList.add("form-message--error");
    } finally {
      const submitBtnDone = form.querySelector('button[type="submit"]');
      if (submitBtnDone) submitBtnDone.disabled = false;
    }
  });

  templateApplyBtn.addEventListener("click", async () => {
    templateApplyStatusEl.textContent = "";
    templateApplyStatusEl.classList.remove("teacher-template-apply-status--error");

    const tid =
      teacherSelectedTemplateId != null
        ? Number(teacherSelectedTemplateId, 10)
        : Number(String(templateSelectEl.value || "").trim(), 10);
    if (!Number.isFinite(tid)) {
      templateApplyStatusEl.textContent = t("choose_template");
      templateApplyStatusEl.classList.add("teacher-template-apply-status--error");
      return;
    }

    const d = String(templateApplyDateEl.value || "").trim().slice(0, 10);
    if (d.length < 10) {
      templateApplyStatusEl.textContent = t("choose_target_date");
      templateApplyStatusEl.classList.add("teacher-template-apply-status--error");
      return;
    }

    const cls = String(templateApplyClassEl.value || "").trim() || teacherDefaultClassFallback();
    const incMat = !!(
      templateIncludeMatEl &&
      templateIncludeMatEl.checked &&
      !templateIncludeMatEl.disabled
    );

    templateApplyBtn.disabled = true;
    setTeacherPageError(pageErrorEl, "");
    try {
      const created = await apiPost(`/api/task-templates/${tid}/apply`, {
        date: d,
        class_name: cls,
        include_material: incMat,
      });
      await reloadPlannerTasksFromApi();
      await refreshDashboard();

      const curDay = getTaskListDate().trim().slice(0, 10);
      const curCls = getFilterClass();
      const newDay = String(created.date || "").trim().slice(0, 10);
      const newCls =
        created.class_name != null && String(created.class_name).trim()
          ? String(created.class_name).trim()
          : teacherDefaultClassFallback();

      if (newDay.length >= 10 && newDay === curDay && newCls === curCls) {
        teacherPendingCopySelectTaskId = Number(created.id);
        await refreshTaskList();
        messageEl.classList.remove("form-message--error");
        messageEl.textContent = t("task_from_template");
        messageEl.classList.add("form-message--success");
        templateApplyStatusEl.textContent = "Task created.";
      } else {
        if (isTeacherDailyVisible()) await refreshTaskList();
        messageEl.classList.remove("form-message--error");
        messageEl.textContent = `Task created from template on ${newDay} for ${newCls}.`;
        messageEl.classList.add("form-message--success");
        templateApplyStatusEl.textContent = "Done.";
      }
    } catch (err) {
      templateApplyStatusEl.textContent = err.message || "Could not create task.";
      templateApplyStatusEl.classList.add("teacher-template-apply-status--error");
      setTeacherPageError(pageErrorEl, err.message);
    } finally {
      templateApplyBtn.disabled = false;
    }
  });

  async function bootTeacherClassScopeAndData() {
    await loadTeacherAssignedClasses();
    const initialClass = defaultTeacherClassFromUser();
    populateAllTeacherClassSelectors(initialClass);
    syncAllClassSelectors(initialClass);
    if (templateApplyDateEl && viewDateInput.value) {
      templateApplyDateEl.value = String(viewDateInput.value).trim().slice(0, 10);
    }
    void loadTeacherTemplatesForPage();
    await reloadPlannerTasksFromApi();
    await refreshDashboard();
  }

  window.__eapTeacherLangRefresh = () => {
    populateCategorySelect(typeSelect, false);
    populateTeacherCategoryChips(categoryChipsEl, typeSelect);
    populateTeacherTemplateCategoryFilterSelect(templateCategoryFilterEl);
    populateTeacherTemplateCategoryChips(templateCategoryChipsEl, templateCategoryFilterEl);
    syncTeacherCreateTaskContext();
    setTeacherTaskDetailEmpty("no-selection");
    void reloadPlannerTasksFromApi();
    void refreshDashboard();
    void refreshTeacherClassOverview();
    void loadTeacherTemplatesForPage();
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    syncTeacherTaskZhFieldsPanel();
  };

  syncTeacherTaskZhFieldsPanel();

  void bootTeacherClassScopeAndData();
  })();
}

// ---- Student page (student.html) ---------------------------------------------

/** True when teacher feedback (text or files) exists on a submission row. */
function studentSubmissionHasFeedback(mySub) {
  if (!mySub || typeof mySub !== "object") return false;
  return !!(
    (mySub.teacher_feedback && String(mySub.teacher_feedback).trim()) ||
    (mySub.feedback_file_path && String(mySub.feedback_file_path).trim()) ||
    (Array.isArray(mySub.feedback_attachments) && mySub.feedback_attachments.length > 0)
  );
}

/** Workflow step for student daily task cards and master list badges. */
function getStudentTaskWorkflowState(task, mySub) {
  if (isStudentTaskCompleted(task)) return "completed";
  const hasSubmission = !!(mySub && mySub.id != null);
  if (studentSubmissionHasFeedback(mySub)) {
    return studentSubmissionHasRevisionRow(mySub) ? "revision_done" : "needs_revision";
  }
  if (hasSubmission) return "awaiting_feedback";
  return "needs_submission";
}

function studentWorkflowStatusLabel(state) {
  const keyByState = {
    completed: "student_wf_completed",
    revision_done: "student_wf_revision_done",
    needs_revision: "student_wf_needs_revision",
    awaiting_feedback: "student_wf_awaiting_feedback",
    needs_submission: "student_wf_needs_submission",
  };
  return t(keyByState[state] || "status_pending");
}

function studentTaskNeedsAction(task, mySub) {
  const state = getStudentTaskWorkflowState(task, mySub);
  return state === "needs_submission" || state === "needs_revision";
}

function findFirstStudentTaskNeedingAction(tasks, subMap) {
  const m = subMap instanceof Map ? subMap : new Map();
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (studentTaskNeedsAction(task, m.get(task.id))) return task;
  }
  return null;
}

function buildStudentWorkflowStrip(state) {
  const wrap = document.createElement("div");
  wrap.className = `student-task-workflow student-task-workflow--${state}`;
  const pill = document.createElement("span");
  pill.className = "student-task-workflow__pill";
  pill.textContent = studentWorkflowStatusLabel(state);
  const hintKey = `student_wf_hint_${state}`;
  const hintText = t(hintKey);
  if (hintText && hintText !== hintKey) {
    const hint = document.createElement("p");
    hint.className = "student-task-workflow__hint";
    hint.textContent = hintText;
    wrap.appendChild(pill);
    wrap.appendChild(hint);
  } else {
    wrap.appendChild(pill);
  }
  return wrap;
}

/** True if my-submission row has any stored revision content (same rule as the full task card). */
function studentSubmissionHasRevisionRow(mySub) {
  if (!mySub || typeof mySub !== "object") return false;
  return !!(
    (mySub.revision_submitted_at && String(mySub.revision_submitted_at).trim()) ||
    (mySub.revision_text && String(mySub.revision_text).trim()) ||
    (mySub.revision_file_path && String(mySub.revision_file_path).trim())
  );
}

/** Header chip counts for the whole loaded day (not affected by category filter). */
function computeStudentDailyChipCounts(tasksNorm, subMap) {
  const map = subMap instanceof Map ? subMap : new Map();
  let completed = 0;
  let submitted = 0;
  let feedbackReceived = 0;
  let revisionsSubmitted = 0;
  for (let i = 0; i < tasksNorm.length; i += 1) {
    const t = tasksNorm[i];
    if (isStudentTaskCompleted(t)) completed += 1;
    const mySub = map.get(t.id);
    if (mySub && mySub.id != null) submitted += 1;
    const hasFb =
      mySub &&
      ((mySub.teacher_feedback && String(mySub.teacher_feedback).trim()) ||
        (mySub.feedback_file_path && String(mySub.feedback_file_path).trim()) ||
        (Array.isArray(mySub.feedback_attachments) && mySub.feedback_attachments.length > 0));
    if (hasFb) feedbackReceived += 1;
    if (studentSubmissionHasRevisionRow(mySub)) revisionsSubmitted += 1;
  }
  const total = tasksNorm.length;
  const pending = total - completed;
  return {
    total,
    completed,
    pending,
    submitted,
    feedbackReceived,
    revisionsSubmitted,
  };
}

/** Fills the six pill chips under the daily title (each span has a stable id for app.js). */
function fillStudentDailyChips(counts) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null && val !== "" ? String(val) : "—";
  };
  if (!counts) {
    set("student-chip-tasks", "—");
    set("student-chip-completed", "—");
    set("student-chip-pending", "—");
    set("student-chip-submitted", "—");
    set("student-chip-feedback", "—");
    set("student-chip-revisions", "—");
    return;
  }
  set("student-chip-tasks", counts.total);
  set("student-chip-completed", counts.completed);
  set("student-chip-pending", counts.pending);
  set("student-chip-submitted", counts.submitted);
  set("student-chip-feedback", counts.feedbackReceived);
  set("student-chip-revisions", counts.revisionsSubmitted);
}

function setStudentMasterListSelection(masterEl, selectedId) {
  masterEl.querySelectorAll(".student-task-master-item").forEach((row) => {
    const rid = Number(row.getAttribute("data-task-id"), 10);
    const on = Number.isFinite(selectedId) && Number.isFinite(rid) && rid === Number(selectedId);
    row.classList.toggle("student-task-master-item--selected", on);
    row.setAttribute("aria-current", on ? "true" : "false");
  });
}

/**
 * Left column: one compact button per filtered task.
 * Badges summarise attachment / submission / feedback / revision / completion at a glance.
 */
function renderStudentTaskMasterList(masterEl, tasksForDay, subMap) {
  const m = subMap instanceof Map ? subMap : new Map();
  masterEl.innerHTML = "";
  const sorted = [...tasksForDay].sort(compareTasksForSort);
  sorted.forEach((task) => {
    const mySub = m.get(task.id);
    const wfState = getStudentTaskWorkflowState(task, mySub);
    const needsAction = studentTaskNeedsAction(task, mySub);
    const hasMaterial = !!(task.file_path && String(task.file_path).trim());
    const hasSubmission = !!(mySub && mySub.id != null);
    const hasFb = studentSubmissionHasFeedback(mySub);
    const hasRev = studentSubmissionHasRevisionRow(mySub);

    const li = document.createElement("li");
    li.className = "student-task-master-li";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "student-task-master-item";
    if (needsAction) btn.classList.add("student-task-master-item--action");
    btn.setAttribute("data-task-id", String(task.id));
    btn.setAttribute("data-workflow-state", wfState);

    const titleEl = document.createElement("span");
    titleEl.className = "student-task-master-item__title";
    titleEl.textContent = taskDisplayTitle(task);

    const line2 = document.createElement("span");
    line2.className = "student-task-master-item__meta";
    const cat = translateCategory(task.category || task.type || "—");
    line2.textContent = `${cat} · ${studentWorkflowStatusLabel(wfState)}`;

    const badges = document.createElement("div");
    badges.className = "student-task-master-item__badges";

    const addBadge = (cls, labelKey) => {
      const sp = document.createElement("span");
      sp.className = `student-learn-badge ${cls}`;
      sp.textContent = t(labelKey);
      badges.appendChild(sp);
    };
    if (hasMaterial) addBadge("student-learn-badge--material", "student_badge_material");
    if (hasSubmission) addBadge("student-learn-badge--submitted", "student_badge_submitted");
    if (hasFb) addBadge("student-learn-badge--feedback", "student_badge_feedback");
    if (hasRev) addBadge("student-learn-badge--revision", "student_badge_revision");
    if (wfState === "completed") addBadge("student-learn-badge--completed", "student_badge_completed");

    btn.appendChild(titleEl);
    btn.appendChild(line2);
    if (badges.childElementCount) btn.appendChild(badges);

    li.appendChild(btn);
    masterEl.appendChild(li);
  });
}

/**
 * Full student task card DOM (right column). Kept identical to the old list item so
 * homework POST and revision PUT stay the same. Task **Complete** uses **PUT …/my-completion** (Phase D7).
 */
function buildStudentTaskCardElement(task, mySub) {
  const done = isStudentTaskCompleted(task);
  const wfState = getStudentTaskWorkflowState(task, mySub);
  const hasSubmissionRow = !!(mySub && typeof mySub === "object" && mySub.id != null);

  const li = document.createElement("li");
  li.className = done ? "task-card task-card--done task-card--student" : "task-card task-card--student";
  li.setAttribute("data-workflow-state", wfState);

  const title = document.createElement("h3");
  title.className = "task-card__title";
  title.textContent = taskDisplayTitle(task);

  const meta = document.createElement("div");
  meta.className = "task-card__meta";

  const catPill = document.createElement("span");
  catPill.className = "task-pill";
  catPill.textContent = translateCategory(task.category || task.type || "—");

  const periodPill = document.createElement("span");
  periodPill.className = "task-pill task-pill--muted";
  periodPill.textContent = task.period && String(task.period).trim() ? task.period : "—";

  meta.appendChild(catPill);
  meta.appendChild(periodPill);

  const workflowStrip = buildStudentWorkflowStrip(wfState);

  const desc = document.createElement("p");
  desc.className = "task-card__description";
  const descShown = taskDisplayDescription(task);
  if (descShown) desc.textContent = descShown;

  const material = document.createElement("div");
  material.className = "task-card__material";
  if (task.file_path) {
    const materialLabel = document.createElement("span");
    materialLabel.className = "task-card__material-label";
    materialLabel.textContent = t("teaching_material_label");
    const link = document.createElement("a");
    link.className = "task-card__material-link";
    link.href = `${API_BASE}/uploads/${encodeURIComponent(task.file_path)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = task.file_name
      ? `View or download: ${task.file_name}`
      : "View or download attachment";
    material.appendChild(materialLabel);
    material.appendChild(link);
  } else {
    material.classList.add("task-card__material--empty");
    material.textContent = t("no_material");
  }

  const homework = document.createElement("div");
  homework.className = "task-card__homework";

  const homeworkHeading = document.createElement("h4");
  homeworkHeading.className = "task-card__homework-heading";
  homeworkHeading.textContent = t("homework_heading");

  const taLabel = document.createElement("label");
  taLabel.className = "task-homework-label";
  taLabel.htmlFor = `student-hw-text-${task.id}`;
  taLabel.textContent = t("your_answer");

  const textArea = document.createElement("textarea");
  textArea.id = `student-hw-text-${task.id}`;
  textArea.className = "task-homework-text";
  textArea.name = "answer_text";
  textArea.rows = 4;
  textArea.placeholder = t("hw_placeholder");

  const fileWrap = document.createElement("div");
  fileWrap.className = "task-homework-file-wrap";

  const fileLabelHint = document.createElement("span");
  fileLabelHint.className = "task-homework-file-hint";
  fileLabelHint.textContent = t("optional_file");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "task-homework-file eap-touch-file";
  fileInput.accept = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png";

  const homeworkSelectedFile = document.createElement("span");
  homeworkSelectedFile.className = "file-selection-summary task-homework-selected-file";
  homeworkSelectedFile.setAttribute("aria-live", "polite");
  homeworkSelectedFile.textContent = t("no_file_selected");

  fileWrap.appendChild(fileLabelHint);
  fileWrap.appendChild(fileInput);
  fileWrap.appendChild(homeworkSelectedFile);

  const submitHwBtn = document.createElement("button");
  submitHwBtn.type = "button";
  submitHwBtn.className = "btn-secondary task-homework-submit";
  submitHwBtn.setAttribute("data-task-id", String(task.id));
  submitHwBtn.textContent = t("submit_homework");

  const hwStatus = document.createElement("p");
  hwStatus.className = "task-homework-status";
  hwStatus.setAttribute("aria-live", "polite");

  homework.appendChild(homeworkHeading);
  homework.appendChild(taLabel);
  homework.appendChild(textArea);
  homework.appendChild(fileWrap);
  homework.appendChild(submitHwBtn);
  homework.appendChild(hwStatus);

  let submissionPanel = null;
  if (hasSubmissionRow) {
    submissionPanel = document.createElement("aside");
    submissionPanel.className = "student-task-submission-panel";
    if (wfState === "needs_revision") {
      submissionPanel.classList.add("student-task-submission-panel--highlight");
    }
    submissionPanel.setAttribute("aria-label", t("submission_feedback"));

    const panelHeading = document.createElement("h4");
    panelHeading.className = "student-task-submission-panel__heading";
    panelHeading.textContent = t("submission_feedback");

    const originalSection = document.createElement("section");
    originalSection.className =
      "student-task-submission-panel__subsection student-task-subsection--original";

    const originalTitle = document.createElement("h5");
    originalTitle.className = "student-task-subsection__title";
    originalTitle.textContent = t("original_submission");

    const answerBody = document.createElement("p");
    answerBody.className = "student-task-submission-panel__answer";
    if (mySub.answer_text && String(mySub.answer_text).trim()) {
      answerBody.textContent = String(mySub.answer_text).trim();
    } else {
      answerBody.textContent = t("no_written_answer");
      answerBody.classList.add("student-task-submission-panel__answer--muted");
    }

    originalSection.appendChild(originalTitle);
    originalSection.appendChild(answerBody);

    if (mySub.file_path && String(mySub.file_path).trim()) {
      const fileRow = document.createElement("p");
      fileRow.className = "student-task-submission-panel__file";
      const link = document.createElement("a");
      link.className = "student-task-submission-panel__file-link";
      link.href = `${API_BASE}/submission-files/${encodeURIComponent(mySub.file_path)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = mySub.file_name
        ? `Original file: ${String(mySub.file_name).trim()}`
        : "Download your original submitted file";
      fileRow.appendChild(link);
      originalSection.appendChild(fileRow);
    }

    const statusSection = document.createElement("section");
    statusSection.className =
      "student-task-submission-panel__subsection student-task-subsection--meta";
    const statusLabel = document.createElement("div");
    statusLabel.className = "student-task-submission-panel__label";
    statusLabel.textContent = t("submission_status_label");
    const statusRow = document.createElement("p");
    statusRow.className = "student-task-submission-panel__row";
    statusRow.appendChild(
      document.createTextNode(
        mySub.status != null && String(mySub.status).trim()
          ? String(mySub.status).trim()
          : "—"
      )
    );
    statusSection.appendChild(statusLabel);
    statusSection.appendChild(statusRow);

    const fbSection = document.createElement("section");
    fbSection.className =
      "student-task-submission-panel__subsection student-task-subsection--feedback";
    const fbLabel = document.createElement("div");
    fbLabel.className = "student-task-submission-panel__label";
    fbLabel.textContent = t("teacher_feedback");
    const fbPara = document.createElement("p");
    fbPara.className = "student-task-submission-panel__feedback-body";
    const hasFbText = !!(mySub.teacher_feedback && String(mySub.teacher_feedback).trim());
    const hasFbFile = !!(mySub.feedback_file_path && String(mySub.feedback_file_path).trim());
    const feedbackAttachList = Array.isArray(mySub.feedback_attachments)
      ? mySub.feedback_attachments
      : [];
    const hasFbAttach = feedbackAttachList.length > 0;
    const hasTeacherFeedback = hasFbText || hasFbFile || hasFbAttach;
    if (hasFbText) {
      fbPara.textContent = String(mySub.teacher_feedback).trim();
    } else if (hasFbFile || hasFbAttach) {
      fbPara.textContent = t("no_written_feedback_files_below");
      fbPara.classList.add("student-task-submission-panel__feedback-body--muted");
    } else {
      fbPara.textContent = t("feedback_not_yet");
      fbPara.classList.add("student-task-submission-panel__feedback-body--muted");
    }
    fbSection.appendChild(fbLabel);
    fbSection.appendChild(fbPara);

    if (hasFbFile) {
      const fbFileLabel = document.createElement("div");
      fbFileLabel.className = "student-task-submission-panel__label";
      fbFileLabel.textContent = t("teacher_feedback_file");
      const fbFileRow = document.createElement("p");
      fbFileRow.className = "student-task-submission-panel__file";
      const fblink = document.createElement("a");
      fblink.className = "student-task-submission-panel__file-link";
      fblink.href = `${API_BASE}/submission-files/${encodeURIComponent(String(mySub.feedback_file_path).trim())}`;
      fblink.target = "_blank";
      fblink.rel = "noopener noreferrer";
      fblink.textContent = "Download teacher commented file";
      fbFileRow.appendChild(fblink);
      fbSection.appendChild(fbFileLabel);
      fbSection.appendChild(fbFileRow);
    }

    if (hasFbAttach) {
      const multiLabel = document.createElement("div");
      multiLabel.className = "student-task-submission-panel__label";
      multiLabel.textContent = t("teacher_feedback_files");
      const ul = document.createElement("ul");
      ul.className = "student-task-feedback-files-list";
      feedbackAttachList.forEach((att) => {
        const li = document.createElement("li");
        li.className = "student-task-feedback-files-list__item";
        const line = document.createElement("div");
        line.className = "student-task-feedback-files-list__line";
        const nameEl = document.createElement("span");
        nameEl.className = "student-task-feedback-files-list__name";
        nameEl.textContent =
          att.file_name && String(att.file_name).trim()
            ? String(att.file_name).trim()
            : att.file_path || "file";
        const timeEl = document.createElement("span");
        timeEl.className = "student-task-feedback-files-list__time";
        timeEl.textContent =
          att.uploaded_at && String(att.uploaded_at).trim()
            ? String(att.uploaded_at).trim()
            : "";
        const fp = att.file_path && String(att.file_path).trim();
        line.appendChild(nameEl);
        if (timeEl.textContent) line.appendChild(timeEl);
        if (fp) {
          const a = document.createElement("a");
          a.className = "student-task-submission-panel__file-link";
          a.href = `${API_BASE}/submission-files/${encodeURIComponent(fp)}`;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Download";
          line.appendChild(a);
        } else {
          const noDl = document.createElement("span");
          noDl.className = "student-task-feedback-files-list__nodl";
          noDl.textContent = "—";
          line.appendChild(noDl);
        }
        li.appendChild(line);
        ul.appendChild(li);
      });
      fbSection.appendChild(multiLabel);
      fbSection.appendChild(ul);
    }

    submissionPanel.appendChild(panelHeading);
    submissionPanel.appendChild(originalSection);
    submissionPanel.appendChild(statusSection);
    submissionPanel.appendChild(fbSection);

    if (hasTeacherFeedback) {
      const hasRevisionRow = studentSubmissionHasRevisionRow(mySub);

      if (hasRevisionRow) {
        const revReadSection = document.createElement("section");
        revReadSection.className =
          "student-task-submission-panel__subsection student-task-subsection--revision-read";

        const revReadTitle = document.createElement("h5");
        revReadTitle.className = "student-task-subsection__title";
        revReadTitle.textContent = t("current_revision");

        const revTextP = document.createElement("p");
        revTextP.className = "student-task-submission-panel__answer";
        if (mySub.revision_text && String(mySub.revision_text).trim()) {
          revTextP.textContent = String(mySub.revision_text).trim();
        } else {
          revTextP.textContent = t("no_revision_text_file_ok");
          revTextP.classList.add("student-task-submission-panel__answer--muted");
        }

        revReadSection.appendChild(revReadTitle);
        revReadSection.appendChild(revTextP);

        if (mySub.revision_file_path && String(mySub.revision_file_path).trim()) {
          const rfp = String(mySub.revision_file_path).trim();
          const revFileRow = document.createElement("p");
          revFileRow.className = "student-task-submission-panel__file";
          const rlink = document.createElement("a");
          rlink.className = "student-task-submission-panel__file-link";
          rlink.href = `${API_BASE}/submission-files/${encodeURIComponent(rfp)}`;
          rlink.target = "_blank";
          rlink.rel = "noopener noreferrer";
          rlink.textContent = mySub.revision_file_name
            ? `Revision file: ${String(mySub.revision_file_name).trim()}`
            : "Download revision file";
          revFileRow.appendChild(rlink);
          revReadSection.appendChild(revFileRow);
        }

        const revTime = document.createElement("p");
        revTime.className = "student-task-submission-panel__row";
        const tStrong = document.createElement("strong");
        tStrong.textContent = `${t("revision_submitted_at")}: `;
        revTime.appendChild(tStrong);
        revTime.appendChild(
          document.createTextNode(
            mySub.revision_submitted_at && String(mySub.revision_submitted_at).trim()
              ? String(mySub.revision_submitted_at).trim()
              : "—"
          )
        );

        const revStat = document.createElement("p");
        revStat.className = "student-task-submission-panel__row";
        const sStrong = document.createElement("strong");
        sStrong.textContent = `${t("revision_status_label")}: `;
        revStat.appendChild(sStrong);
        revStat.appendChild(
          document.createTextNode(
            mySub.revision_status && String(mySub.revision_status).trim()
              ? String(mySub.revision_status).trim()
              : "—"
          )
        );

        revReadSection.appendChild(revTime);
        revReadSection.appendChild(revStat);
        submissionPanel.appendChild(revReadSection);
      }

      const revFormSection = document.createElement("section");
      revFormSection.className =
        "student-task-submission-panel__subsection student-task-subsection--revision-form";

      const revFormTitle = document.createElement("h5");
      revFormTitle.className = "student-task-subsection__title";
      revFormTitle.textContent = t("revision_section_title");

      const revHint = document.createElement("p");
      revHint.className = "student-revision-hint";
      revHint.textContent = t("revision_section_hint");

      const revTaLabel = document.createElement("label");
      revTaLabel.className = "student-revision-label";
      const sid = String(mySub.id);
      revTaLabel.htmlFor = `student-revision-text-${sid}`;
      revTaLabel.textContent = t("revision_text_label");

      const revTextarea = document.createElement("textarea");
      revTextarea.id = `student-revision-text-${sid}`;
      revTextarea.className = "student-revision-text task-revision-text";
      revTextarea.rows = 4;
      revTextarea.placeholder = t("revision_placeholder");

      const revFileWrap = document.createElement("div");
      revFileWrap.className = "student-revision-file-wrap";
      const revFileHint = document.createElement("span");
      revFileHint.className = "student-revision-file-hint";
      revFileHint.textContent = t("optional_revision_file");
      const revFileInput = document.createElement("input");
      revFileInput.type = "file";
      revFileInput.className = "student-revision-file task-revision-file eap-touch-file";
      revFileInput.accept = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png";
      const revSelectedFile = document.createElement("span");
      revSelectedFile.className = "file-selection-summary student-revision-selected-file";
      revSelectedFile.setAttribute("aria-live", "polite");
      revSelectedFile.textContent = t("no_file_selected");
      revFileWrap.appendChild(revFileHint);
      revFileWrap.appendChild(revFileInput);
      revFileWrap.appendChild(revSelectedFile);

      const revSubmitBtn = document.createElement("button");
      revSubmitBtn.type = "button";
      revSubmitBtn.className = "btn-secondary student-revision-submit task-revision-submit";
      revSubmitBtn.textContent = t("submit_revision");
      revSubmitBtn.setAttribute("data-submission-id", sid);
      revSubmitBtn.setAttribute("data-task-id", String(task.id));

      const revStatus = document.createElement("p");
      revStatus.className = "task-revision-status";
      revStatus.setAttribute("aria-live", "polite");

      revFormSection.appendChild(revFormTitle);
      revFormSection.appendChild(revHint);
      revFormSection.appendChild(revTaLabel);
      revFormSection.appendChild(revTextarea);
      revFormSection.appendChild(revFileWrap);
      revFormSection.appendChild(revSubmitBtn);
      if (wfState === "needs_revision") {
        revFormSection.classList.add("student-task-subsection--revision-form--emphasis");
        revFormSection.setAttribute("data-student-revision-focus", "true");
      }

      revFormSection.appendChild(revStatus);
      submissionPanel.appendChild(revFormSection);
    }
  }

  let homeworkNode = homework;
  if (hasSubmissionRow) {
    const hwDetails = document.createElement("details");
    hwDetails.className = "student-homework-resubmit-details";
    const hwSummary = document.createElement("summary");
    hwSummary.className = "student-homework-resubmit-details__summary";
    hwSummary.textContent = t("student_resubmit_homework");
    hwDetails.appendChild(hwSummary);
    hwDetails.appendChild(homework);
    homeworkNode = hwDetails;
  } else if (wfState === "needs_submission") {
    homework.classList.add("task-card__homework--primary");
  }

  const tail = document.createElement("div");
  tail.className = "task-card__student-tail";

  const status = document.createElement("p");
  status.className = done
    ? "task-status task-status--done"
    : `task-status task-status--${wfState}`;
  status.textContent = studentWorkflowStatusLabel(wfState);

  const classLine = document.createElement("p");
  classLine.className = "task-card__student-class-name";
  classLine.textContent = `Class: ${task.class_name != null && task.class_name !== "" ? task.class_name : "—"}`;

  tail.appendChild(status);
  tail.appendChild(classLine);

  const footer = document.createElement("div");
  footer.className = "task-card__footer";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = done ? "btn-secondary btn-secondary--success" : "btn-secondary";

  if (done) {
    btn.disabled = true;
    btn.textContent = t("status_completed");
  } else {
    btn.textContent = t("mark_complete");
    btn.setAttribute("data-task-id", String(task.id));
  }

  footer.appendChild(btn);

  li.appendChild(title);
  li.appendChild(meta);
  li.appendChild(workflowStrip);
  li.appendChild(desc);
  li.appendChild(material);
  if (submissionPanel) li.appendChild(submissionPanel);
  li.appendChild(homeworkNode);
  li.appendChild(tail);
  li.appendChild(footer);

  return li;
}

/** Phase E8: read-only archive card (no homework submit, revision form, or complete button). */
function buildStudentArchiveReadOnlyCard(item) {
  const task = {
    id: item.task_id,
    date: item.date,
    title: item.title,
    title_zh: item.title_zh,
    category: item.category,
    period: item.period,
    description: item.description,
    description_zh: item.description_zh,
    file_path: item.file_path,
    file_name: item.file_name,
    student_completed: !!item.student_completed,
    class_name: item.class_name,
  };
  const mySub = item.submission;
  const card = buildStudentTaskCardElement(task, mySub);
  card.classList.add("student-archive-readonly-card", "task-card--archive");

  card.querySelector(".task-card__homework")?.remove();
  card.querySelector(".student-homework-resubmit-details")?.remove();
  card.querySelector(".task-card__footer")?.remove();
  card.querySelector(".student-task-subsection--revision-form")?.remove();

  const iso = String(item.date || "").slice(0, 10);
  const dateLine = document.createElement("p");
  dateLine.className = "student-archive-readonly-card__date";
  dateLine.textContent = iso.length >= 10 ? formatDisplayDate(iso) : "—";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn-secondary student-archive-open-calendar";
  openBtn.textContent = t("student_archive_open_calendar");
  openBtn.setAttribute("data-task-id", String(item.task_id));
  openBtn.setAttribute("data-task-date", iso);

  const actions = document.createElement("div");
  actions.className = "student-archive-readonly-card__actions";
  actions.appendChild(openBtn);

  card.insertBefore(dateLine, card.firstChild);
  card.appendChild(actions);
  return card;
}

function setStudentArchiveListSelection(listEl, selectedId) {
  if (!listEl) return;
  listEl.querySelectorAll(".student-archive-list-item").forEach((row) => {
    const rid = Number(row.getAttribute("data-task-id"), 10);
    const on = Number.isFinite(selectedId) && Number.isFinite(rid) && rid === Number(selectedId);
    row.classList.toggle("student-archive-list-item--selected", on);
    row.setAttribute("aria-current", on ? "true" : "false");
  });
}

function renderStudentArchiveList(listEl, items, selectedId) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const sorted = [...(items || [])].sort((a, b) => {
    const da = String(a.date || "");
    const db = String(b.date || "");
    if (da !== db) return db.localeCompare(da);
    return Number(b.task_id) - Number(a.task_id);
  });
  sorted.forEach((item) => {
    const wfState = item.workflow_state || "needs_submission";
    const li = document.createElement("li");
    li.className = "student-archive-list-li";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "student-archive-list-item";
    btn.setAttribute("data-task-id", String(item.task_id));
    btn.setAttribute("data-workflow-state", wfState);

    const titleEl = document.createElement("span");
    titleEl.className = "student-archive-list-item__title";
    titleEl.textContent = taskDisplayTitle({
      title: item.title,
      title_zh: item.title_zh,
    });

    const meta = document.createElement("span");
    meta.className = "student-archive-list-item__meta";
    const iso = String(item.date || "").slice(0, 10);
    const dateLabel = iso.length >= 10 ? formatDisplayDate(iso) : "—";
    const cat = translateCategory(item.category || "—");
    meta.textContent = `${dateLabel} · ${cat} · ${studentWorkflowStatusLabel(wfState)}`;

    btn.appendChild(titleEl);
    btn.appendChild(meta);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
  setStudentArchiveListSelection(listEl, selectedId);
}

/** One row in the student progress “Next actions” or “View all” lists (same button shape for navigation). */
function appendStudentProgressActionItem(ul, row) {
  if (!ul || !row) return;
  const li = document.createElement("li");
  li.className = "student-progress-actions-list__item";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "student-progress-action-item";
  btn.setAttribute("data-task-id", String(row.task_id));
  btn.setAttribute("data-task-date", String(row.date || "").slice(0, 10));

  const title = document.createElement("span");
  title.className = "student-progress-action-item__title";
  title.textContent = taskDisplayTitle(row);

  const meta = document.createElement("span");
  meta.className = "student-progress-action-item__meta";
  const d = String(row.date || "").slice(0, 10);
  const cat = row.category != null ? String(row.category) : "—";
  const st = row.status != null && String(row.status).trim() ? String(row.status).trim() : "—";
  const catShow = cat === "—" ? cat : translateCategory(cat);
  meta.textContent = `${d} · ${catShow} · ${translateStatus(st)}`;

  const action = document.createElement("span");
  action.className = "student-progress-action-item__action";
  action.textContent = translateActionNeeded(row.action_needed);

  btn.appendChild(title);
  btn.appendChild(meta);
  btn.appendChild(action);
  li.appendChild(btn);
  ul.appendChild(li);
}

function initStudentPage() {
  if (document.body.getAttribute("data-page") !== "student") return;

  if (redirectFilePageToHostedUi()) return;

  void (async () => {
    const sessionUser = await validatePageSessionOrFallback("student");
    if (!sessionUser) return;

    await ensureAcademicCalendarLoaded();
    initAppPageHeader();
    initStudentSelfStudyNavLink();
    initStudentLiveNavLink();

  /*
    ----- Student class scope (Phase C3) -----

    Primary source: GET /api/student/my-classes?student_username= (class_enrollments), first class_code.
    Fallback: login user.class_name from session (same JSON as login).
    Final fallback: STUDENT_CLASS_FALLBACK ("EAP047"). Permissions are not enforced on the backend yet.

    Stored user JSON: SESSION_USER_KEY via saveUserToSession — see authStorageGet() / getLoggedInUser().
  */
  let studentClassName = STUDENT_CLASS_FALLBACK;
  let studentClassOptions = [];
  let studentClassRows = [];

  const classDisplayEl = document.getElementById("student-class-display");

  async function loadStudentEnrolledClasses() {
    const user = getLoggedInUser();
    const username = user && user.username ? String(user.username).trim() : "";

    const finalizePrimary = () => {
      studentClassName = String(studentClassName || "").trim() || STUDENT_CLASS_FALLBACK;
    };

    if (!username) {
      studentClassOptions = [];
      studentClassRows = [];
      studentClassName = resolveStudentClassNameFromLogin(user);
      finalizePrimary();
      return;
    }

    try {
      const qs = new URLSearchParams({ student_username: username });
      const data = await apiGet(`/api/student/my-classes?${qs.toString()}`);
      const rows = data && Array.isArray(data.classes) ? data.classes : [];
      const codes = rows
        .map((r) => (r.class_code != null ? String(r.class_code).trim() : ""))
        .filter(Boolean);
      const unique = [...new Set(codes)];

      if (unique.length > 0) {
        studentClassOptions = unique;
        studentClassRows = rows;
        studentClassName = unique[0];
        finalizePrimary();
        return;
      }

      console.warn(
        "[EAP] /api/student/my-classes returned no classes; using login class or STUDENT_CLASS_FALLBACK.",
      );
    } catch (err) {
      console.warn(
        "[EAP] Could not load student enrolled classes; using login class or STUDENT_CLASS_FALLBACK.",
        err,
      );
    }

    studentClassOptions = [];
    studentClassRows = [];
    studentClassName = resolveStudentClassNameFromLogin(getLoggedInUser());
    finalizePrimary();
  }

  function updateStudentClassDisplay() {
    if (classDisplayEl) {
      classDisplayEl.textContent = `Class: ${studentClassName}`;
    }
  }

  const masterListEl = document.getElementById("student-task-master-list");
  const taskDetailInner = document.getElementById("student-task-detail-inner");
  const taskDetailEmpty = document.getElementById("student-task-detail-empty");
  const dailyClassLabelEl = document.getElementById("student-daily-class-label");
  const dailyContextEl = document.getElementById("student-daily-context");
  const focusNextBtn = document.getElementById("student-focus-next-btn");
  const categoryChipsEl = document.getElementById("student-category-chips");
  const emptyHintEl = document.getElementById("student-empty-hint");
  const messageEl = document.getElementById("student-form-message");
  const dateInput = document.getElementById("student-date");
  const filterSelect = document.getElementById("student-category-filter");
  const calendarRoot = document.getElementById("student-calendar-root");
  const calendarViewEl = document.getElementById("student-calendar-view");
  const dailyViewEl = document.getElementById("student-daily-view");
  const studentDailyWorkspaceEl = document.querySelector(".student-daily-workspace");
  const studentMobileBackBtn = document.getElementById("student-mobile-back-to-list");
  const mainEl = document.getElementById("main");
  const dailyTitleEl = document.getElementById("student-daily-title");
  const backToCalendarBtn = document.getElementById("student-back-to-calendar");
  const refreshDayBtn = document.getElementById("student-refresh-day-btn");

  const studentStudyPlanDateEl = document.getElementById("student-study-plan-date");
  const studentStudyPlanSkillEl = document.getElementById("student-study-plan-skill");
  const studentStudyPlanTitleEl = document.getElementById("student-study-plan-title");
  const studentStudyPlanDescEl = document.getElementById("student-study-plan-description");
  const studentStudyPlanMinutesEl = document.getElementById("student-study-plan-minutes");
  const studentStudyPlanStatusEl = document.getElementById("student-study-plan-status");
  const studentStudyPlanAddBtn = document.getElementById("student-study-plan-add-btn");
  const studentStudyPlanFormStatusEl = document.getElementById("student-study-plan-form-status");
  const studentStudyPlansListEl = document.getElementById("student-study-plans-list");
  const studentStudyPlansEmptyEl = document.getElementById("student-study-plans-empty");
  const studyPlanProgressMonthEl = document.getElementById("student-study-plan-progress-month");
  const studyPlanProgressEmptyEl = document.getElementById("student-study-plan-progress-empty");
  const studyPlanProgressBodyEl = document.getElementById("student-study-plan-progress-body");
  const studyPlanProgressErrorEl = document.getElementById("student-study-plan-progress-error");
  const studyPlanProgressSkillsUl = document.getElementById("student-study-plan-progress-skills");
  const studyPlanProgressStatTotal = document.getElementById("student-study-plan-progress-stat-total");
  const studyPlanProgressStatCompleted = document.getElementById("student-study-plan-progress-stat-completed");
  const studyPlanProgressStatPlanned = document.getElementById("student-study-plan-progress-stat-planned");
  const studyPlanProgressStatRate = document.getElementById("student-study-plan-progress-stat-rate");
  const studyPlanProgressStatMinsTotal = document.getElementById("student-study-plan-progress-stat-mins-total");
  const studyPlanProgressStatMinsCompleted = document.getElementById(
    "student-study-plan-progress-stat-mins-completed",
  );

  if (
    !masterListEl ||
    !taskDetailInner ||
    !taskDetailEmpty ||
    !dailyClassLabelEl ||
    !emptyHintEl ||
    !filterSelect ||
    !messageEl ||
    !dateInput ||
    !calendarRoot ||
    !calendarViewEl ||
    !dailyViewEl ||
    !dailyTitleEl ||
    !backToCalendarBtn ||
    !refreshDayBtn ||
    !mainEl ||
    !studentStudyPlanDateEl ||
    !studentStudyPlanSkillEl ||
    !studentStudyPlanTitleEl ||
    !studentStudyPlanDescEl ||
    !studentStudyPlanMinutesEl ||
    !studentStudyPlanStatusEl ||
    !studentStudyPlanAddBtn ||
    !studentStudyPlanFormStatusEl ||
    !studentStudyPlansListEl ||
    !studentStudyPlansEmptyEl ||
    !studyPlanProgressMonthEl ||
    !studyPlanProgressEmptyEl ||
    !studyPlanProgressBodyEl ||
    !studyPlanProgressErrorEl ||
    !studyPlanProgressSkillsUl ||
    !studyPlanProgressStatTotal ||
    !studyPlanProgressStatCompleted ||
    !studyPlanProgressStatPlanned ||
    !studyPlanProgressStatRate ||
    !studyPlanProgressStatMinsTotal ||
    !studyPlanProgressStatMinsCompleted
  ) {
    return;
  }

  const progressDash = document.getElementById("student-progress-dashboard");
  const progressScopeEl = document.getElementById("student-progress-scope");
  const progressBarEl = document.getElementById("student-progress-bar");
  const progressCategoriesEl = document.getElementById("student-progress-categories");
  const progressMsg = document.getElementById("student-progress-message");
  const progressStatTotal = document.getElementById("student-progress-stat-total");
  const progressStatCompleted = document.getElementById("student-progress-stat-completed");
  const progressStatPending = document.getElementById("student-progress-stat-pending");
  const progressStatHomework = document.getElementById("student-progress-stat-homework");
  const progressStatFeedback = document.getElementById("student-progress-stat-feedback");
  const progressStatRevisions = document.getElementById("student-progress-stat-revisions");
  const progressStatActions = document.getElementById("student-progress-stat-actions");
  const progressNextListEl = document.getElementById("student-progress-next-list");
  const progressListEl = document.getElementById("student-progress-actions-list");
  const progressEmptyEl = document.getElementById("student-progress-actions-empty");
  const progressHasItemsEl = document.getElementById("student-progress-actions-has-items");
  const progressExpandDetails = document.getElementById("student-progress-actions-expand");
  const progressExpandSummary = document.getElementById("student-progress-actions-expand-summary");
  const progressOpenArchiveBtn = document.getElementById("student-progress-open-archive");
  const archiveSectionEl = document.getElementById("student-learning-archive");
  const archiveScopeEl = document.getElementById("student-archive-scope");
  const archiveAllMonthsEl = document.getElementById("student-archive-all-months");
  const archiveCategoryEl = document.getElementById("student-archive-category");
  const archiveErrorEl = document.getElementById("student-archive-error");
  const archiveEmptyEl = document.getElementById("student-archive-empty");
  const archiveBodyEl = document.getElementById("student-archive-body");
  const archiveListEl = document.getElementById("student-archive-list");
  const archiveDetailEl = document.getElementById("student-archive-detail");
  const archiveDetailEmptyEl = document.getElementById("student-archive-detail-empty");

  /** Right panel copy when nothing is selected or the filtered list is empty. */
  function setStudentTaskDetailEmpty(kind) {
    const title = taskDetailEmpty.querySelector(".student-task-detail-empty__title");
    const text = taskDetailEmpty.querySelector(".student-task-detail-empty__text");
    if (!title || !text) return;
    if (kind === "no-tasks") {
      title.textContent = t("no_tasks_date");
      text.textContent = t("no_tasks_student_day");
    } else if (kind === "filter-empty") {
      title.textContent = t("filter_empty_title");
      text.textContent = t("filter_empty_hint");
    } else {
      title.textContent = t("no_task_selected");
      text.textContent = t("student_pick_task_hint");
    }
  }

  populateStudentFilterSelect(filterSelect);
  populateStudentCategoryChips(categoryChipsEl, filterSelect);

  function syncStudentDailyContext() {
    if (!dailyContextEl) return;
    const iso = String(dateInput.value || "").trim().slice(0, 10);
    dailyContextEl.innerHTML = "";
    const line = document.createElement("p");
    line.className = "student-daily-context__line";
    const classSpan = document.createElement("span");
    classSpan.className = "student-daily-context__class";
    classSpan.textContent = studentClassName || "—";
    const sep = document.createElement("span");
    sep.className = "student-daily-context__sep";
    sep.textContent = " · ";
    const dateSpan = document.createElement("span");
    dateSpan.className = "student-daily-context__date";
    dateSpan.textContent = iso.length >= 10 ? formatDisplayDate(iso) : "—";
    line.appendChild(classSpan);
    line.appendChild(sep);
    line.appendChild(dateSpan);
    dailyContextEl.appendChild(line);
    const hint = document.createElement("p");
    hint.className = "student-daily-context__hint";
    hint.textContent = t("student_daily_context_hint");
    dailyContextEl.appendChild(hint);
  }

  function pulseStudentMasterItem(taskId) {
    const row = masterListEl.querySelector(
      `.student-task-master-item[data-task-id="${String(taskId)}"]`,
    );
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.classList.add("student-task-master-item--pulse");
    window.setTimeout(() => {
      row.classList.remove("student-task-master-item--pulse");
    }, 1400);
  }

  function focusNextStudentTask() {
    const actionTask = findFirstStudentTaskNeedingAction(
      lastStudentFilteredTasks,
      lastSubmissionsByTaskId,
    );
    if (!actionTask) {
      messageEl.textContent = t("student_no_action_tasks");
      messageEl.classList.remove("form-message--error");
      messageEl.classList.add("form-message--success");
      return;
    }
    selectStudentTaskById(actionTask.id);
    pulseStudentMasterItem(actionTask.id);
  }

  const today = new Date();
  const todayISO = getTodayISODateLocal();
  dateInput.value = todayISO;

  /** Same idea as the teacher planner: browse months locally, pills come from one class-wide GET. */
  const plannerState = {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    selectedISO: todayISO,
    tasksAll: [],
    /** @type {Record<string, { total: number, completed: number, planned: number }>} */
    studyPlanSummaryByDate: {},
    /** Latest GET /api/student/study-plans/progress payload for the visible calendar month, or null. */
    studyPlanProgress: null,
  };

  function studentPlannerMonthISO() {
    return `${plannerState.viewYear}-${String(plannerState.viewMonth + 1).padStart(2, "0")}`;
  }

  function formatStudentStudyPlanProgressMonthTitle() {
    const d = new Date(plannerState.viewYear, plannerState.viewMonth, 1);
    return `For ${d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
  }

  async function reloadStudentStudyPlanSummaryForViewMonth() {
    plannerState.studyPlanSummaryByDate = {};
    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname) {
      return;
    }
    const qs = new URLSearchParams();
    qs.set("student_username", uname);
    qs.set("class_name", studentClassName);
    qs.set("month", studentPlannerMonthISO());
    try {
      const rows = await apiGet(`/api/student/study-plans/summary?${qs.toString()}`);
      const map = {};
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          const d = row.date != null ? String(row.date).slice(0, 10) : "";
          const total = Number(row.total);
          if (d.length >= 10 && Number.isFinite(total) && total > 0) {
            const completed = Number(row.completed);
            const planned = Number(row.planned);
            map[d] = {
              total,
              completed: Number.isFinite(completed) ? completed : 0,
              planned: Number.isFinite(planned) ? planned : Math.max(0, total - (Number.isFinite(completed) ? completed : 0)),
            };
          }
        });
      }
      plannerState.studyPlanSummaryByDate = map;
    } catch {
      plannerState.studyPlanSummaryByDate = {};
    }
  }

  async function reloadStudentStudyPlanProgressForViewMonth() {
    plannerState.studyPlanProgress = null;
    studyPlanProgressMonthEl.textContent = formatStudentStudyPlanProgressMonthTitle();
    studyPlanProgressErrorEl.textContent = "";
    studyPlanProgressErrorEl.classList.add("hidden");
    studyPlanProgressEmptyEl.textContent = "";
    studyPlanProgressEmptyEl.classList.add("hidden");
    studyPlanProgressBodyEl.classList.add("hidden");
    studyPlanProgressSkillsUl.innerHTML = "";
    const clearStat = (el) => {
      if (el) el.textContent = "—";
    };
    clearStat(studyPlanProgressStatTotal);
    clearStat(studyPlanProgressStatCompleted);
    clearStat(studyPlanProgressStatPlanned);
    clearStat(studyPlanProgressStatRate);
    clearStat(studyPlanProgressStatMinsTotal);
    clearStat(studyPlanProgressStatMinsCompleted);

    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname) {
      studyPlanProgressEmptyEl.textContent =
        "Log in to track personal study plan progress for the calendar month.";
      studyPlanProgressEmptyEl.classList.remove("hidden");
      return;
    }

    const qs = new URLSearchParams();
    qs.set("student_username", uname);
    qs.set("class_name", studentClassName);
    qs.set("month", studentPlannerMonthISO());
    try {
      const data = await apiGet(`/api/student/study-plans/progress?${qs.toString()}`);
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response");
      }
      const total = Number(data.total);
      if (!Number.isFinite(total) || total < 0) {
        throw new Error("Invalid response");
      }
      plannerState.studyPlanProgress = data;

      if (total === 0) {
        studyPlanProgressEmptyEl.textContent = "No personal study plans for this month yet.";
        studyPlanProgressEmptyEl.classList.remove("hidden");
        studyPlanProgressBodyEl.classList.add("hidden");
        return;
      }

      studyPlanProgressEmptyEl.classList.add("hidden");
      studyPlanProgressBodyEl.classList.remove("hidden");

      const completed = Number(data.completed);
      const planned = Number(data.planned);
      const rate = Number(data.completion_rate);
      const minsT = Number(data.total_planned_minutes);
      const minsC = Number(data.completed_planned_minutes);

      studyPlanProgressStatTotal.textContent = String(total);
      studyPlanProgressStatCompleted.textContent = Number.isFinite(completed) ? String(completed) : "0";
      studyPlanProgressStatPlanned.textContent = Number.isFinite(planned) ? String(planned) : String(Math.max(0, total - (Number.isFinite(completed) ? completed : 0)));
      studyPlanProgressStatRate.textContent = Number.isFinite(rate) ? `${rate}%` : "—";
      studyPlanProgressStatMinsTotal.textContent = Number.isFinite(minsT) ? String(minsT) : "0";
      studyPlanProgressStatMinsCompleted.textContent = Number.isFinite(minsC) ? String(minsC) : "0";

      studyPlanProgressSkillsUl.innerHTML = "";
      const breakdown = Array.isArray(data.skill_breakdown) ? data.skill_breakdown : [];
      breakdown.forEach((row) => {
        const li = document.createElement("li");
        li.className = "student-study-plan-progress-skill";
        const sk = row.skill_area != null ? String(row.skill_area) : "—";
        const t = Number(row.total);
        const c = Number(row.completed);
        const tOk = Number.isFinite(t) ? t : 0;
        const cOk = Number.isFinite(c) ? c : 0;
        li.textContent = `${sk}: ${tOk} total, ${cOk} completed`;
        studyPlanProgressSkillsUl.appendChild(li);
      });
    } catch {
      plannerState.studyPlanProgress = null;
      studyPlanProgressBodyEl.classList.add("hidden");
      studyPlanProgressEmptyEl.classList.add("hidden");
      studyPlanProgressErrorEl.textContent = "Could not load study plan progress.";
      studyPlanProgressErrorEl.classList.remove("hidden");
    }
  }

  async function reloadStudentStudyPlanSummaryAndProgressForViewMonth() {
    await Promise.all([
      reloadStudentStudyPlanSummaryForViewMonth(),
      reloadStudentStudyPlanProgressForViewMonth(),
    ]);
    void refreshStudentProgressDashboard();
    void reloadStudentLearningArchive();
  }

  let lastArchiveItems = [];
  let lastArchiveItemsFiltered = [];
  let selectedArchiveTaskId = null;

  if (archiveCategoryEl) populateStudentFilterSelect(archiveCategoryEl);

  function archiveScopeLabel() {
    if (archiveAllMonthsEl && archiveAllMonthsEl.checked) {
      return t("student_archive_scope_all", { class: studentClassName });
    }
    const month = studentPlannerMonthISO();
    const monthLabel =
      month.length >= 7
        ? new Date(`${month}-01T12:00:00`).toLocaleDateString(eapLocale(), {
            month: "long",
            year: "numeric",
          })
        : month;
    return t("student_dashboard_scope", { class: studentClassName, month: monthLabel });
  }

  function selectStudentArchiveItem(taskId) {
    const item = lastArchiveItemsFiltered.find((it) => Number(it.task_id) === Number(taskId));
    if (!item || !archiveDetailEl) return;
    selectedArchiveTaskId = item.task_id;
    setStudentArchiveListSelection(archiveListEl, selectedArchiveTaskId);
    if (archiveDetailEmptyEl) archiveDetailEmptyEl.classList.add("hidden");
    archiveDetailEl.innerHTML = "";
    archiveDetailEl.appendChild(buildStudentArchiveReadOnlyCard(item));
    archiveDetailEl.classList.remove("hidden");
    archiveDetailEl.removeAttribute("hidden");
  }

  function renderStudentArchiveView() {
    lastArchiveItemsFiltered = lastArchiveItems;
    if (archiveScopeEl) archiveScopeEl.textContent = archiveScopeLabel();

    if (!lastArchiveItemsFiltered.length) {
      if (archiveBodyEl) archiveBodyEl.classList.add("hidden");
      if (archiveEmptyEl) archiveEmptyEl.classList.remove("hidden");
      if (archiveErrorEl) archiveErrorEl.classList.add("hidden");
      if (archiveDetailEl) {
        archiveDetailEl.classList.add("hidden");
        archiveDetailEl.setAttribute("hidden", "");
        archiveDetailEl.innerHTML = "";
      }
      if (archiveDetailEmptyEl) archiveDetailEmptyEl.classList.remove("hidden");
      if (archiveListEl) archiveListEl.innerHTML = "";
      return;
    }

    if (archiveEmptyEl) archiveEmptyEl.classList.add("hidden");
    if (archiveBodyEl) archiveBodyEl.classList.remove("hidden");
    if (archiveErrorEl) archiveErrorEl.classList.add("hidden");

    const stillSelected =
      selectedArchiveTaskId != null &&
      lastArchiveItemsFiltered.some((it) => Number(it.task_id) === Number(selectedArchiveTaskId));
    if (!stillSelected) selectedArchiveTaskId = lastArchiveItemsFiltered[0].task_id;

    renderStudentArchiveList(archiveListEl, lastArchiveItemsFiltered, selectedArchiveTaskId);
    selectStudentArchiveItem(selectedArchiveTaskId);
  }

  async function reloadStudentLearningArchive() {
    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname || !archiveListEl) return;

    const qs = new URLSearchParams();
    qs.set("student_username", uname);
    qs.set("class_name", studentClassName);
    if (!archiveAllMonthsEl || !archiveAllMonthsEl.checked) {
      qs.set("month", studentPlannerMonthISO());
    }
    const cat =
      archiveCategoryEl && archiveCategoryEl.value && archiveCategoryEl.value !== "all"
        ? archiveCategoryEl.value
        : "";
    if (cat) qs.set("category", cat);

    try {
      const data = await apiGet(`/api/student/learning-archive?${qs.toString()}`);
      lastArchiveItems = data && Array.isArray(data.items) ? data.items : [];
      if (archiveErrorEl) {
        archiveErrorEl.textContent = "";
        archiveErrorEl.classList.add("hidden");
      }
      renderStudentArchiveView();
    } catch (err) {
      lastArchiveItems = [];
      if (archiveErrorEl) {
        archiveErrorEl.textContent = err.message || t("student_archive_load_error");
        archiveErrorEl.classList.remove("hidden");
      }
      if (archiveBodyEl) archiveBodyEl.classList.add("hidden");
      if (archiveEmptyEl) archiveEmptyEl.classList.add("hidden");
    }
  }

  function showStudentCalendarView() {
    setMobileMasterDetailOpen(studentDailyWorkspaceEl, false);
    calendarViewEl.classList.add("eap-view-panel--active");
    calendarViewEl.classList.remove("eap-view-panel--inactive");
    dailyViewEl.classList.remove("eap-view-panel--active");
    dailyViewEl.classList.add("eap-view-panel--inactive");
    calendarViewEl.setAttribute("aria-hidden", "false");
    dailyViewEl.setAttribute("aria-hidden", "true");
    mainEl.classList.remove("app-main--daily-mode");
    void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
  }

  async function showStudentDailyView(iso) {
    setMobileMasterDetailOpen(studentDailyWorkspaceEl, false);
    plannerState.selectedISO = iso;
    dateInput.value = iso;
    const iso10 = String(iso || "").trim().slice(0, 10);
    dailyTitleEl.textContent =
      iso10.length >= 10
        ? `Learning Tasks for ${formatDisplayDate(iso10)}`
        : "Learning Tasks";
    paintStudentPlanner();
    calendarViewEl.classList.remove("eap-view-panel--active");
    calendarViewEl.classList.add("eap-view-panel--inactive");
    dailyViewEl.classList.add("eap-view-panel--active");
    dailyViewEl.classList.remove("eap-view-panel--inactive");
    calendarViewEl.setAttribute("aria-hidden", "true");
    dailyViewEl.setAttribute("aria-hidden", "false");
    mainEl.classList.add("app-main--daily-mode");
    await reloadStudentView();
  }

  backToCalendarBtn.addEventListener("click", () => {
    showStudentCalendarView();
  });

  if (studentMobileBackBtn) {
    studentMobileBackBtn.addEventListener("click", () => {
      setMobileMasterDetailOpen(studentDailyWorkspaceEl, false);
    });
  }

  refreshDayBtn.addEventListener("click", async () => {
    await reloadStudentView();
  });

  function paintStudentPlanner() {
    const byDate = bucketTasksByDate(plannerState.tasksAll);
    renderMonthlyCalendarInto(calendarRoot, {
      year: plannerState.viewYear,
      monthIndex: plannerState.viewMonth,
      selectedISO: plannerState.selectedISO,
      todayISO: getTodayISODateLocal(),
      tasksByDate: byDate,
      personalStudyByDate: plannerState.studyPlanSummaryByDate,
      onSelectDate(iso) {
        void showStudentDailyView(iso);
      },
      onPrevMonth() {
        if (plannerState.viewMonth === 0) {
          plannerState.viewMonth = 11;
          plannerState.viewYear -= 1;
        } else {
          plannerState.viewMonth -= 1;
        }
        void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
      },
      onNextMonth() {
        if (plannerState.viewMonth === 11) {
          plannerState.viewMonth = 0;
          plannerState.viewYear += 1;
        } else {
          plannerState.viewMonth += 1;
        }
        void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
      },
    });
  }
  window.__eapStudentRepaintCalendar = paintStudentPlanner;

  /** One GET lists every task for this student’s class — enough to paint every day in the month. */
  async function reloadStudentPlannerTasksFromApi() {
    try {
      const qs = new URLSearchParams();
      qs.set("class_name", studentClassName);
      const rawList = await apiGet(`/api/tasks?${qs.toString()}`);
      plannerState.tasksAll = Array.isArray(rawList) ? rawList : [];
    } catch {
      plannerState.tasksAll = [];
    }
    await reloadStudentStudyPlanSummaryAndProgressForViewMonth();
    paintStudentPlanner();
  }

  /** If the learner edits the `<input type="date">`, scroll the planner to that month too. */
  function syncPlannerFromDateInput() {
    const v = String(dateInput.value || "").trim();
    if (!v || v.length < 10) return;
    plannerState.selectedISO = v;
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(5, 7));
    if (Number.isFinite(y) && Number.isFinite(m)) {
      plannerState.viewYear = y;
      plannerState.viewMonth = m - 1;
    }
    void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
  }

  let studentDailyReloadGeneration = 0;

  dateInput.addEventListener("change", async () => {
    syncPlannerFromDateInput();
    /* Hidden field — if something updates the date while daily view is open, reload cards. */
    if (dailyViewEl.classList.contains("eap-view-panel--active")) {
      await reloadStudentView();
    }
  });

  /** Tasks returned by the API for the last loaded date and class (before category filter). */
  let lastTasksRaw = [];
  /** Normalized tasks for the open day with Phase D7 completion fields merged from /api/tasks/my-completions. */
  let lastStudentTasksNormMerged = [];
  let lastLoadedDay = null;
  /** Latest homework row per task id from GET /api/tasks/<id>/my-submission (scoped to logged-in student). */
  let lastSubmissionsByTaskId = new Map();
  /** Category-filtered tasks for the open day (drives the left list + selection). */
  let lastStudentFilteredTasks = [];
  let selectedStudentTaskId = null;

  async function refreshStudentProgressDashboard() {
    if (!progressDash || !progressStatTotal) return;
    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname) {
      if (progressMsg) {
        progressMsg.textContent = "Log in to see your progress.";
        progressMsg.classList.add("student-progress-dashboard__message--error");
      }
      return;
    }
    if (progressMsg) {
      progressMsg.textContent = "";
      progressMsg.classList.remove("student-progress-dashboard__message--error");
    }
    try {
      const qs = new URLSearchParams();
      qs.set("student_username", uname);
      qs.set("class_name", studentClassName);
      qs.set("month", studentPlannerMonthISO());
      const data = await apiGet(`/api/student/progress?${qs.toString()}`);
      if (!data || typeof data !== "object") return;

      if (progressScopeEl) {
        const month = studentPlannerMonthISO();
        const monthLabel =
          month.length >= 7
            ? new Date(`${month}-01T12:00:00`).toLocaleDateString(eapLocale(), {
                month: "long",
                year: "numeric",
              })
            : month;
        progressScopeEl.textContent = t("student_dashboard_scope", {
          class: studentClassName,
          month: monthLabel,
        });
      }
      renderEapProgressBar(progressBarEl, data.completion_rate ?? 0, t("your_completion_rate"));
      renderEapCategoryBreakdown(
        progressCategoriesEl,
        normalizeStudentCategoryBreakdown(data.category_summary),
      );

      const setNum = (el, v) => {
        if (el) el.textContent = String(v ?? "—");
      };
      setNum(progressStatTotal, data.total_tasks);
      setNum(progressStatCompleted, data.completed_tasks);
      setNum(progressStatPending, data.pending_tasks);
      setNum(progressStatHomework, data.homework_submitted_count);
      setNum(progressStatFeedback, data.feedback_received_count);
      setNum(progressStatRevisions, data.revision_submitted_count);
      setNum(progressStatActions, data.tasks_needing_action_count);

      const items = Array.isArray(data.tasks_needing_action) ? data.tasks_needing_action : [];
      const nextItems = items.slice(0, 3);
      const remainingItems = items.slice(3);

      if (progressNextListEl) progressNextListEl.innerHTML = "";
      if (progressListEl) progressListEl.innerHTML = "";

      if (progressEmptyEl) {
        progressEmptyEl.classList.toggle("hidden", items.length > 0);
      }
      if (progressHasItemsEl) {
        progressHasItemsEl.classList.toggle("hidden", items.length === 0);
      }

      if (items.length > 0) {
        nextItems.forEach((row) => appendStudentProgressActionItem(progressNextListEl, row));
        remainingItems.forEach((row) => appendStudentProgressActionItem(progressListEl, row));
        if (progressExpandDetails) {
          if (remainingItems.length > 0) {
            progressExpandDetails.classList.remove("hidden");
            progressExpandDetails.removeAttribute("open");
            if (progressExpandSummary) {
              progressExpandSummary.textContent = `View all action tasks (${remainingItems.length} more)`;
            }
          } else {
            progressExpandDetails.classList.add("hidden");
            progressExpandDetails.removeAttribute("open");
            if (progressExpandSummary) {
              progressExpandSummary.textContent = "View all action tasks";
            }
          }
        }
      } else if (progressExpandDetails) {
        progressExpandDetails.classList.add("hidden");
        progressExpandDetails.removeAttribute("open");
      }
    } catch (err) {
      if (progressMsg) {
        progressMsg.textContent = err.message || "Could not load progress.";
        progressMsg.classList.add("student-progress-dashboard__message--error");
      }
      if (progressNextListEl) progressNextListEl.innerHTML = "";
      if (progressListEl) progressListEl.innerHTML = "";
      if (progressEmptyEl) progressEmptyEl.classList.add("hidden");
      if (progressHasItemsEl) progressHasItemsEl.classList.add("hidden");
      if (progressExpandDetails) {
        progressExpandDetails.classList.add("hidden");
        progressExpandDetails.removeAttribute("open");
      }
    }
  }

  /** Paint the right column with one full card; re-run CSS enter animation on each change. */
  function selectStudentTaskById(taskId) {
    const task = lastStudentFilteredTasks.find((t) => Number(t.id) === Number(taskId));
    if (!task) return;
    const mySub = lastSubmissionsByTaskId.get(task.id);
    selectedStudentTaskId = task.id;
    setStudentMasterListSelection(masterListEl, task.id);

    taskDetailInner.classList.remove("student-task-detail-inner--enter");
    void taskDetailInner.offsetWidth;
    taskDetailInner.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "student-task-detail-ul";
    ul.appendChild(buildStudentTaskCardElement(task, mySub));
    taskDetailInner.appendChild(ul);
    taskDetailEmpty.classList.add("hidden");
    taskDetailInner.classList.remove("hidden");
    taskDetailInner.removeAttribute("hidden");
    taskDetailInner.classList.add("student-task-detail-inner--enter");

    if (getStudentTaskWorkflowState(task, mySub) === "needs_revision") {
      const revFocus = taskDetailInner.querySelector("[data-student-revision-focus]");
      if (revFocus) {
        window.setTimeout(() => {
          revFocus.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
      }
    }

    if (isEapMobileLayout()) {
      setMobileMasterDetailOpen(studentDailyWorkspaceEl, true);
      taskDetailInner.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function applyFilterAndRender(successFlash) {
    const day = lastLoadedDay;
    const filter = filterSelect.value || "all";

    if (!day) return;

    dailyClassLabelEl.textContent = `Class: ${studentClassName}`;
    syncStudentDailyContext();

    const tasksNormAll =
      lastStudentTasksNormMerged.length > 0
        ? [...lastStudentTasksNormMerged]
        : lastTasksRaw.map(normalizeTask);
    fillStudentDailyChips(computeStudentDailyChipCounts(tasksNormAll, lastSubmissionsByTaskId));

    let filtered = tasksNormAll;
    if (filter !== "all") {
      filtered = filtered.filter((t) => t.category === filter);
    }

    const sorted = [...filtered].sort(compareTasksForSort);
    lastStudentFilteredTasks = sorted;

    if (focusNextBtn) {
      const hasAction = !!findFirstStudentTaskNeedingAction(sorted, lastSubmissionsByTaskId);
      focusNextBtn.disabled = !hasAction;
    }

    let emptyMsg =
      "No tasks for this date for your class yet. Ask your teacher or pick another day.";
    if (lastTasksRaw.length > 0 && sorted.length === 0) {
      emptyMsg = "No tasks in this category for this date. Try “All categories”.";
    }

    if (typeof successFlash === "string" && successFlash.trim() !== "") {
      messageEl.textContent = successFlash.trim();
      messageEl.classList.add("form-message--success");
      messageEl.classList.remove("form-message--error");
    } else if (sorted.length === 0) {
      messageEl.classList.remove("form-message--success");
      if (lastTasksRaw.length === 0) {
        messageEl.textContent = "No tasks for this date for your class.";
      } else {
        messageEl.textContent = "";
      }
    } else {
      messageEl.textContent = `Showing ${sorted.length} task${sorted.length === 1 ? "" : "s"}.`;
      messageEl.classList.add("form-message--success");
    }

    emptyHintEl.classList.toggle("hidden", sorted.length > 0);
    emptyHintEl.textContent = emptyMsg;

    renderStudentTaskMasterList(masterListEl, sorted, lastSubmissionsByTaskId);

    if (sorted.length === 0) {
      selectedStudentTaskId = null;
      taskDetailInner.innerHTML = "";
      taskDetailInner.classList.add("hidden");
      taskDetailInner.setAttribute("hidden", "");
      taskDetailInner.classList.remove("student-task-detail-inner--enter");
      taskDetailEmpty.classList.remove("hidden");
      setStudentTaskDetailEmpty(lastTasksRaw.length === 0 ? "no-tasks" : "filter-empty");
      return;
    }

    let selId = selectedStudentTaskId;
    if (selId == null || !sorted.some((t) => Number(t.id) === Number(selId))) {
      const actionTask = findFirstStudentTaskNeedingAction(sorted, lastSubmissionsByTaskId);
      selId = actionTask ? actionTask.id : sorted[0].id;
    }
    selectStudentTaskById(selId);
  }

  const STUDY_PLAN_SKILLS_FOR_EDIT = [
    "Vocabulary",
    "Listening",
    "Reading",
    "Speaking",
    "Writing",
    "Grammar",
    "Other",
  ];

  async function refreshStudentStudyPlansListAndCalendar() {
    const day = String(dateInput.value || "").trim().slice(0, 10);
    await loadStudentStudyPlansForDay(day.length >= 10 ? day : "");
    void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
  }

  function renderStudentStudyPlans(plans) {
    studentStudyPlansListEl.innerHTML = "";
    const list = Array.isArray(plans) ? plans : [];
    if (list.length === 0) {
      studentStudyPlansEmptyEl.classList.remove("hidden");
      return;
    }
    studentStudyPlansEmptyEl.classList.add("hidden");
    list.forEach((p) => {
      const pid = p.id != null ? Number(p.id) : NaN;
      if (!Number.isFinite(pid)) return;

      const li = document.createElement("li");
      li.className = "student-study-plan-card";
      li.setAttribute("data-plan-id", String(pid));

      const main = document.createElement("div");
      main.className = "student-study-plan-card__main";

      const top = document.createElement("div");
      top.className = "student-study-plan-card__top";
      const skill = document.createElement("span");
      skill.className = "student-study-plan-card__skill";
      skill.textContent = p.skill_area != null ? String(p.skill_area) : "—";
      const st = document.createElement("span");
      st.className = "student-study-plan-card__status";
      st.textContent = p.status != null ? String(p.status) : "—";
      top.appendChild(skill);
      top.appendChild(st);

      const title = document.createElement("h4");
      title.className = "student-study-plan-card__title";
      title.textContent = p.title != null ? String(p.title) : "Untitled";

      const desc = document.createElement("p");
      desc.className = "student-study-plan-card__desc";
      desc.textContent =
        p.description != null && String(p.description).trim()
          ? String(p.description).trim()
          : "—";

      const meta = document.createElement("p");
      meta.className = "student-study-plan-card__meta";
      const mins =
        p.planned_minutes != null && Number.isFinite(Number(p.planned_minutes))
          ? `${p.planned_minutes} min planned`
          : "No minutes set";
      const when =
        p.updated_at != null && String(p.updated_at).trim()
          ? `Updated ${String(p.updated_at).trim()}`
          : p.created_at != null && String(p.created_at).trim()
            ? `Created ${String(p.created_at).trim()}`
            : "";
      meta.textContent = when ? `${mins} · ${when}` : mins;

      main.appendChild(top);
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(meta);

      const sugText =
        p.teacher_suggestion != null && String(p.teacher_suggestion).trim()
          ? String(p.teacher_suggestion).trim()
          : "";
      let sugStrip = null;
      if (sugText) {
        sugStrip = document.createElement("div");
        sugStrip.className = "student-study-plan-card__suggestion-strip";
        const sugInner = document.createElement("div");
        sugInner.className = "student-study-plan-card__teacher-suggestion";
        const sugLbl = document.createElement("div");
        sugLbl.className = "student-study-plan-card__teacher-suggestion-label";
        sugLbl.textContent = "Teacher suggestion";
        const sugBody = document.createElement("p");
        sugBody.className = "student-study-plan-card__teacher-suggestion-text";
        sugBody.textContent = sugText;
        sugInner.appendChild(sugLbl);
        sugInner.appendChild(sugBody);
        sugStrip.appendChild(sugInner);
      }

      const actions = document.createElement("div");
      actions.className = "student-study-plan-card__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-secondary student-study-plan-edit-btn";
      editBtn.textContent = "Edit";
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-secondary student-study-plan-delete-btn";
      deleteBtn.textContent = "Delete";
      actions.appendChild(deleteBtn);

      const statusStr = p.status != null ? String(p.status).trim() : "";
      if (statusStr !== "Completed") {
        const markBtn = document.createElement("button");
        markBtn.type = "button";
        markBtn.className = "btn-secondary student-study-plan-mark-done";
        markBtn.setAttribute("data-plan-id", String(pid));
        markBtn.textContent = "Mark completed";
        actions.appendChild(markBtn);
      }

      const dateIso = p.date != null ? String(p.date).slice(0, 10) : "";
      const skillCur = p.skill_area != null ? String(p.skill_area) : "";
      const titleCur = p.title != null ? String(p.title) : "";
      const descCur = p.description != null ? String(p.description) : "";
      const minsCur =
        p.planned_minutes != null && Number.isFinite(Number(p.planned_minutes))
          ? String(p.planned_minutes)
          : "";
      const statusCur = p.status != null && String(p.status).trim() ? String(p.status).trim() : "Planned";

      const editPanel = document.createElement("div");
      editPanel.className = "student-study-plan-card__edit hidden";

      const mkField = (labelText, inputEl) => {
        const wrap = document.createElement("div");
        wrap.className = "student-study-plan-edit__field";
        const lab = document.createElement("label");
        lab.className = "student-study-plan-edit__label";
        lab.textContent = labelText;
        if (inputEl.id) lab.setAttribute("for", inputEl.id);
        wrap.appendChild(lab);
        wrap.appendChild(inputEl);
        return wrap;
      };

      const dateId = `student-plan-edit-${pid}-date`;
      const dateIn = document.createElement("input");
      dateIn.type = "date";
      dateIn.id = dateId;
      dateIn.className = "student-study-plan-edit__input";
      dateIn.required = true;
      if (dateIso.length >= 10) dateIn.value = dateIso;

      const skillId = `student-plan-edit-${pid}-skill`;
      const skillSel = document.createElement("select");
      skillSel.id = skillId;
      skillSel.className = "student-study-plan-edit__select";
      skillSel.required = true;
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Select skill area…";
      skillSel.appendChild(opt0);
      STUDY_PLAN_SKILLS_FOR_EDIT.forEach((sk) => {
        const o = document.createElement("option");
        o.value = sk;
        o.textContent = sk;
        if (sk === skillCur) o.selected = true;
        skillSel.appendChild(o);
      });

      const titleId = `student-plan-edit-${pid}-title`;
      const titleIn = document.createElement("input");
      titleIn.type = "text";
      titleIn.id = titleId;
      titleIn.className = "student-study-plan-edit__input";
      titleIn.required = true;
      titleIn.autocomplete = "off";
      titleIn.value = titleCur;

      const descId = `student-plan-edit-${pid}-desc`;
      const descIn = document.createElement("textarea");
      descIn.id = descId;
      descIn.className = "student-study-plan-edit__textarea";
      descIn.rows = 2;
      descIn.value = descCur;

      const minsId = `student-plan-edit-${pid}-mins`;
      const minsIn = document.createElement("input");
      minsIn.type = "number";
      minsIn.id = minsId;
      minsIn.className = "student-study-plan-edit__input";
      minsIn.min = "0";
      minsIn.max = "600";
      minsIn.step = "1";
      minsIn.placeholder = "e.g. 30";
      minsIn.value = minsCur;

      const statusId = `student-plan-edit-${pid}-status`;
      const statusSel = document.createElement("select");
      statusSel.id = statusId;
      statusSel.className = "student-study-plan-edit__select";
      ["Planned", "Completed"].forEach((sv) => {
        const o = document.createElement("option");
        o.value = sv;
        o.textContent = sv;
        if (sv === statusCur) o.selected = true;
        statusSel.appendChild(o);
      });

      editPanel.appendChild(mkField("Date", dateIn));
      editPanel.appendChild(mkField("Skill area", skillSel));
      editPanel.appendChild(mkField("Title", titleIn));
      editPanel.appendChild(mkField("Description", descIn));
      editPanel.appendChild(mkField("Planned minutes (optional)", minsIn));
      editPanel.appendChild(mkField("Status", statusSel));

      const editActions = document.createElement("div");
      editActions.className = "student-study-plan-edit__actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-secondary student-study-plan-save-btn";
      saveBtn.textContent = "Save changes";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-secondary student-study-plan-cancel-btn";
      cancelBtn.textContent = "Cancel";
      editActions.appendChild(saveBtn);
      editActions.appendChild(cancelBtn);
      editPanel.appendChild(editActions);

      const editStatus = document.createElement("p");
      editStatus.className = "student-study-plan-edit-status";
      editStatus.setAttribute("role", "status");
      editStatus.setAttribute("aria-live", "polite");
      editPanel.appendChild(editStatus);

      li.appendChild(main);
      if (sugStrip) li.appendChild(sugStrip);
      li.appendChild(actions);
      li.appendChild(editPanel);
      studentStudyPlansListEl.appendChild(li);
    });
  }

  async function loadStudentStudyPlansForDay(dayStr) {
    const d = String(dayStr || "").trim().slice(0, 10);
    if (d.length < 10) {
      renderStudentStudyPlans([]);
      return;
    }
    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname) {
      renderStudentStudyPlans([]);
      return;
    }
    const q = new URLSearchParams();
    q.set("student_username", uname);
    q.set("class_name", studentClassName);
    q.set("date", d);
    try {
      const rows = await apiGet(`/api/student/study-plans?${q.toString()}`);
      renderStudentStudyPlans(Array.isArray(rows) ? rows : []);
    } catch {
      renderStudentStudyPlans([]);
    }
  }

  async function reloadStudentView(successFlash) {
    const gen = ++studentDailyReloadGeneration;
    const day = String(dateInput.value || "").trim();
    if (!day) {
      messageEl.textContent = "Pick a date first.";
      messageEl.classList.add("form-message--error");
      return;
    }

    messageEl.textContent = "";
    messageEl.classList.remove("form-message--success", "form-message--error");

    try {
      studentStudyPlanDateEl.value = day.slice(0, 10);
      studentStudyPlanFormStatusEl.textContent = "";
      studentStudyPlanFormStatusEl.classList.remove("student-study-plan-form-status--error");

      const user = getLoggedInUser();
      const uname = user && user.username != null ? String(user.username).trim() : "";

      const qs = new URLSearchParams();
      qs.set("date", day);
      qs.set("class_name", studentClassName);

      const qsPlans = new URLSearchParams();
      qsPlans.set("student_username", uname);
      qsPlans.set("class_name", studentClassName);
      qsPlans.set("date", day.slice(0, 10));

      const tasksPromise = apiGet(`/api/tasks?${qs.toString()}`);
      const plansPromise =
        uname.length > 0
          ? apiGet(`/api/student/study-plans?${qsPlans.toString()}`).catch(() => [])
          : Promise.resolve([]);

      const [rawList, studyPlansRaw] = await Promise.all([tasksPromise, plansPromise]);

      if (gen !== studentDailyReloadGeneration) {
        return;
      }

      lastLoadedDay = day;
      lastTasksRaw = Array.isArray(rawList) ? rawList : [];

      const tasksNorm = lastTasksRaw.map(normalizeTask);
      await mergeStudentMyCompletionsIntoTasks(tasksNorm, uname, studentClassName);
      lastStudentTasksNormMerged = tasksNorm;
      const nextSubMap = new Map();
      if (uname) {
        await Promise.all(
          tasksNorm.map(async (t) => {
            try {
              const mq = new URLSearchParams();
              mq.set("student_username", uname);
              mq.set("class_name", studentClassName);
              const data = await apiGet(`/api/tasks/${t.id}/my-submission?${mq.toString()}`);
              if (data && typeof data === "object" && data.id != null) {
                nextSubMap.set(t.id, data);
              }
            } catch {
              /* ignore per-task errors so the rest of the day still loads */
            }
          }),
        );
      }
      if (gen !== studentDailyReloadGeneration) {
        return;
      }
      lastSubmissionsByTaskId = nextSubMap;

      const plansList = Array.isArray(studyPlansRaw) ? studyPlansRaw : [];

      applyFilterAndRender(
        typeof successFlash === "string" && successFlash.trim() !== "" ? successFlash : undefined,
      );
      renderStudentStudyPlans(plansList);
    } catch (err) {
      if (gen !== studentDailyReloadGeneration) {
        return;
      }
      messageEl.textContent = err.message;
      messageEl.classList.add("form-message--error");
      masterListEl.innerHTML = "";
      taskDetailInner.innerHTML = "";
      taskDetailInner.classList.add("hidden");
      taskDetailInner.setAttribute("hidden", "");
      taskDetailInner.classList.remove("student-task-detail-inner--enter");
      taskDetailEmpty.classList.remove("hidden");
      setStudentTaskDetailEmpty("no-tasks");
      fillStudentDailyChips(null);
      lastTasksRaw = [];
      lastStudentTasksNormMerged = [];
      lastSubmissionsByTaskId = new Map();
      lastStudentFilteredTasks = [];
      selectedStudentTaskId = null;
      lastLoadedDay = day;
      emptyHintEl.classList.remove("hidden");
      emptyHintEl.textContent = t("could_not_load_tasks");
      renderStudentStudyPlans([]);
    }
  }

  async function openStudentDayAndTask(isoDate, taskId) {
    const iso = String(isoDate || "").trim().slice(0, 10);
    if (iso.length < 10) return;

    filterSelect.value = "all";

    plannerState.selectedISO = iso;
    dateInput.value = iso;
    syncPlannerFromDateInput();

    dailyTitleEl.textContent =
      iso.length >= 10 ? `Learning Tasks for ${formatDisplayDate(iso)}` : "Learning Tasks";
    paintStudentPlanner();

    calendarViewEl.classList.remove("eap-view-panel--active");
    calendarViewEl.classList.add("eap-view-panel--inactive");
    dailyViewEl.classList.add("eap-view-panel--active");
    dailyViewEl.classList.remove("eap-view-panel--inactive");
    calendarViewEl.setAttribute("aria-hidden", "true");
    dailyViewEl.setAttribute("aria-hidden", "false");
    mainEl.classList.add("app-main--daily-mode");

    await reloadStudentView();

    const wantedTid = Number(taskId, 10);
    if (Number.isFinite(wantedTid)) {
      const taskOnDay = lastTasksRaw.some((t) => Number(t.id) === wantedTid);
      if (!taskOnDay) {
        messageEl.textContent = "That task is not on this day.";
        messageEl.classList.remove("form-message--success");
        messageEl.classList.add("form-message--error");
        selectedStudentTaskId = null;
      } else {
        selectedStudentTaskId = wantedTid;
      }
    } else {
      selectedStudentTaskId = null;
    }

    applyFilterAndRender();

    if (selectedStudentTaskId != null && Number.isFinite(Number(selectedStudentTaskId))) {
      const row = masterListEl.querySelector(
        `.student-task-master-item[data-task-id="${String(selectedStudentTaskId)}"]`
      );
      if (row) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        row.classList.add("student-task-master-item--pulse");
        window.setTimeout(() => {
          row.classList.remove("student-task-master-item--pulse");
        }, 1400);
      }
    }
  }

  filterSelect.addEventListener("change", () => {
    syncStudentCategoryChipHighlight(categoryChipsEl, filterSelect);
    if (lastLoadedDay) applyFilterAndRender();
  });

  if (focusNextBtn) {
    focusNextBtn.addEventListener("click", () => {
      focusNextStudentTask();
    });
  }

  masterListEl.addEventListener("click", (ev) => {
    const row = ev.target.closest(".student-task-master-item");
    if (!row || row.disabled) return;
    const id = Number(row.getAttribute("data-task-id"), 10);
    if (!Number.isFinite(id)) return;
    selectStudentTaskById(id);
  });

  studentStudyPlanAddBtn.addEventListener("click", async () => {
    studentStudyPlanFormStatusEl.textContent = "";
    studentStudyPlanFormStatusEl.classList.remove("student-study-plan-form-status--error");
    const user = getLoggedInUser();
    const uname = user && user.username != null ? String(user.username).trim() : "";
    if (!uname) {
      studentStudyPlanFormStatusEl.textContent = "You must be logged in.";
      studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
      return;
    }
    const planDate = String(studentStudyPlanDateEl.value || "").trim().slice(0, 10);
    if (planDate.length < 10) {
      studentStudyPlanFormStatusEl.textContent = "Please choose a plan date.";
      studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
      return;
    }
    const skill = String(studentStudyPlanSkillEl.value || "").trim();
    if (!skill) {
      studentStudyPlanFormStatusEl.textContent = "Please choose a skill area.";
      studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
      return;
    }
    const title = String(studentStudyPlanTitleEl.value || "").trim();
    if (!title) {
      studentStudyPlanFormStatusEl.textContent = "Please enter a title.";
      studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
      return;
    }
    const desc = String(studentStudyPlanDescEl.value || "").trim();
    const minsRaw = String(studentStudyPlanMinutesEl.value || "").trim();
    const body = {
      student_username: uname,
      class_name: studentClassName,
      date: planDate,
      skill_area: skill,
      title,
      description: desc,
      status: String(studentStudyPlanStatusEl.value || "Planned").trim() || "Planned",
    };
    if (minsRaw !== "") {
      const n = Number(minsRaw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 600) {
        studentStudyPlanFormStatusEl.textContent = "Minutes must be between 0 and 600.";
        studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
        return;
      }
      body.planned_minutes = n;
    }
    studentStudyPlanAddBtn.disabled = true;
    try {
      await apiPost("/api/student/study-plans", body);
      studentStudyPlanFormStatusEl.textContent = "Plan added.";
      studentStudyPlanTitleEl.value = "";
      studentStudyPlanDescEl.value = "";
      studentStudyPlanMinutesEl.value = "";
      studentStudyPlanStatusEl.value = "Planned";
      studentStudyPlanSkillEl.value = "";
      const viewDay = String(dateInput.value || "").trim().slice(0, 10);
      await loadStudentStudyPlansForDay(viewDay.length >= 10 ? viewDay : planDate);
      void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
    } catch (err) {
      studentStudyPlanFormStatusEl.textContent = err.message || "Could not save plan.";
      studentStudyPlanFormStatusEl.classList.add("student-study-plan-form-status--error");
    } finally {
      studentStudyPlanAddBtn.disabled = false;
    }
  });

  studentStudyPlansListEl.addEventListener("click", async (ev) => {
    const markBtn = ev.target.closest(".student-study-plan-mark-done");
    if (markBtn) {
      const id = Number(markBtn.getAttribute("data-plan-id"), 10);
      if (!Number.isFinite(id)) return;
      const user = getLoggedInUser();
      const uname = user && user.username != null ? String(user.username).trim() : "";
      if (!uname) return;
      markBtn.disabled = true;
      try {
        await apiPutJson(`/api/student/study-plans/${id}`, {
          student_username: uname,
          status: "Completed",
        });
        await loadStudentStudyPlansForDay(String(dateInput.value || "").trim().slice(0, 10));
        void reloadStudentStudyPlanSummaryAndProgressForViewMonth().then(() => paintStudentPlanner());
      } catch (err) {
        messageEl.textContent = err.message || "Could not update plan.";
        messageEl.classList.remove("form-message--success");
        messageEl.classList.add("form-message--error");
      } finally {
        markBtn.disabled = false;
      }
      return;
    }

    const editBtn = ev.target.closest(".student-study-plan-edit-btn");
    if (editBtn) {
      const li = editBtn.closest(".student-study-plan-card");
      if (!li) return;
      studentStudyPlansListEl.querySelectorAll(".student-study-plan-card--editing").forEach((o) => {
        if (o !== li) {
          o.classList.remove("student-study-plan-card--editing");
          const ep = o.querySelector(".student-study-plan-card__edit");
          if (ep) {
            ep.classList.add("hidden");
            const stEl = ep.querySelector(".student-study-plan-edit-status");
            if (stEl) stEl.textContent = "";
          }
        }
      });
      li.classList.add("student-study-plan-card--editing");
      const editPanel = li.querySelector(".student-study-plan-card__edit");
      if (editPanel) {
        editPanel.classList.remove("hidden");
        const stEl = editPanel.querySelector(".student-study-plan-edit-status");
        if (stEl) stEl.textContent = "";
      }
      return;
    }

    const cancelBtn = ev.target.closest(".student-study-plan-cancel-btn");
    if (cancelBtn) {
      const li = cancelBtn.closest(".student-study-plan-card");
      if (!li) return;
      li.classList.remove("student-study-plan-card--editing");
      const editPanel = li.querySelector(".student-study-plan-card__edit");
      if (editPanel) {
        editPanel.classList.add("hidden");
        const stEl = editPanel.querySelector(".student-study-plan-edit-status");
        if (stEl) stEl.textContent = "";
      }
      return;
    }

    const saveBtn = ev.target.closest(".student-study-plan-save-btn");
    if (saveBtn) {
      const li = saveBtn.closest(".student-study-plan-card");
      if (!li) return;
      const id = Number(li.getAttribute("data-plan-id"), 10);
      if (!Number.isFinite(id)) return;
      const user = getLoggedInUser();
      const uname = user && user.username != null ? String(user.username).trim() : "";
      if (!uname) return;
      const editPanel = li.querySelector(".student-study-plan-card__edit");
      const statusEl = editPanel ? editPanel.querySelector(".student-study-plan-edit-status") : null;
      const dateIn = document.getElementById(`student-plan-edit-${id}-date`);
      const skillSel = document.getElementById(`student-plan-edit-${id}-skill`);
      const titleIn = document.getElementById(`student-plan-edit-${id}-title`);
      const descIn = document.getElementById(`student-plan-edit-${id}-desc`);
      const minsIn = document.getElementById(`student-plan-edit-${id}-mins`);
      const statusSel = document.getElementById(`student-plan-edit-${id}-status`);
      if (!dateIn || !skillSel || !titleIn || !descIn || !minsIn || !statusSel) return;

      const planDate = String(dateIn.value || "").trim().slice(0, 10);
      if (planDate.length < 10) {
        if (statusEl) {
          statusEl.textContent = "Please choose a date.";
          statusEl.classList.add("student-study-plan-edit-status--error");
        }
        return;
      }
      const skill = String(skillSel.value || "").trim();
      if (!skill) {
        if (statusEl) {
          statusEl.textContent = "Please choose a skill area.";
          statusEl.classList.add("student-study-plan-edit-status--error");
        }
        return;
      }
      const title = String(titleIn.value || "").trim();
      if (!title) {
        if (statusEl) {
          statusEl.textContent = "Please enter a title.";
          statusEl.classList.add("student-study-plan-edit-status--error");
        }
        return;
      }
      const desc = String(descIn.value || "").trim();
      const minsRaw = String(minsIn.value || "").trim();
      const statusVal = String(statusSel.value || "Planned").trim() || "Planned";
      const body = {
        student_username: uname,
        date: planDate,
        skill_area: skill,
        title,
        description: desc,
        status: statusVal,
      };
      if (minsRaw !== "") {
        const n = Number(minsRaw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 600) {
          if (statusEl) {
            statusEl.textContent = "Minutes must be between 0 and 600.";
            statusEl.classList.add("student-study-plan-edit-status--error");
          }
          return;
        }
        body.planned_minutes = n;
      }
      if (statusEl) {
        statusEl.classList.remove("student-study-plan-edit-status--error", "student-study-plan-edit-status--ok");
        statusEl.textContent = "";
      }
      saveBtn.disabled = true;
      try {
        await apiPutJson(`/api/student/study-plans/${id}`, body);
        li.classList.remove("student-study-plan-card--editing");
        if (editPanel) editPanel.classList.add("hidden");
        messageEl.textContent = "Study plan updated.";
        messageEl.classList.remove("form-message--error");
        messageEl.classList.add("form-message--success");
        await refreshStudentStudyPlansListAndCalendar();
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message || "Could not save changes.";
          statusEl.classList.add("student-study-plan-edit-status--error");
        }
      } finally {
        saveBtn.disabled = false;
      }
      return;
    }

    const delBtn = ev.target.closest(".student-study-plan-delete-btn");
    if (delBtn) {
      const li = delBtn.closest(".student-study-plan-card");
      if (!li) return;
      const id = Number(li.getAttribute("data-plan-id"), 10);
      if (!Number.isFinite(id)) return;
      if (
        !window.confirm(
          "Delete this personal study plan? Teacher suggestions for this plan will also be removed.",
        )
      ) {
        return;
      }
      const user = getLoggedInUser();
      const uname = user && user.username != null ? String(user.username).trim() : "";
      if (!uname) return;
      delBtn.disabled = true;
      try {
        await apiDelete(
          `/api/student/study-plans/${id}?student_username=${encodeURIComponent(uname)}`,
        );
        messageEl.textContent = "Study plan deleted.";
        messageEl.classList.remove("form-message--error");
        messageEl.classList.add("form-message--success");
        await refreshStudentStudyPlansListAndCalendar();
      } catch (err) {
        messageEl.textContent = err.message || "Could not delete plan.";
        messageEl.classList.remove("form-message--success");
        messageEl.classList.add("form-message--error");
      } finally {
        delBtn.disabled = false;
      }
    }
  });

  if (progressDash) {
    progressDash.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".student-progress-action-item");
      if (!btn) return;
      const d = btn.getAttribute("data-task-date") || "";
      const tid = btn.getAttribute("data-task-id");
      await openStudentDayAndTask(d, tid);
    });
  }

  taskDetailInner.addEventListener("change", (ev) => {
    const homeworkInput = ev.target.closest(".task-homework-file");
    if (homeworkInput) {
      const card = homeworkInput.closest("li.task-card");
      updateSelectedFileSummary(
        homeworkInput,
        card ? card.querySelector(".task-homework-selected-file") : null,
      );
      return;
    }

    const revisionInput = ev.target.closest(".task-revision-file");
    if (revisionInput) {
      const card = revisionInput.closest("li.task-card");
      updateSelectedFileSummary(
        revisionInput,
        card ? card.querySelector(".student-revision-selected-file") : null,
      );
    }
  });

  /*
    Right detail panel: delegated clicks for homework POST, revision PUT, and task complete.
    The card is injected into #student-task-detail-inner (master–detail layout).
  */
  taskDetailInner.addEventListener("click", async (ev) => {
    const hwBtn = ev.target.closest(".task-homework-submit");
    if (hwBtn) {
      const taskIdAttr = hwBtn.getAttribute("data-task-id");
      const taskId = taskIdAttr ? Number(taskIdAttr, 10) : NaN;
      if (!Number.isFinite(taskId)) return;

      const card = hwBtn.closest("li.task-card");
      if (!card) return;

      const textAreaEl = card.querySelector(".task-homework-text");
      const fileEl = card.querySelector(".task-homework-file");
      const statusEl = card.querySelector(".task-homework-status");

      const answerText = textAreaEl ? String(textAreaEl.value || "").trim() : "";
      const file =
        fileEl && fileEl.files && fileEl.files.length > 0 ? fileEl.files[0] : null;

      if (!answerText && !file) {
        if (statusEl) {
          statusEl.textContent = "Please enter an answer and/or choose a file to upload.";
          statusEl.classList.remove("task-homework-status--ok");
          statusEl.classList.add("task-homework-status--error");
        }
        return;
      }

      const user = getLoggedInUser();
      if (!user) {
        if (statusEl) {
          statusEl.textContent = "You are not logged in.";
          statusEl.classList.add("task-homework-status--error");
        }
        return;
      }

      /*
        FormData POST to /api/tasks/<id>/submit on the same host as API_BASE.
        Field names must match what Flask reads with request.form.get("…") / request.files["file"].

        class_name uses the resolved student scope (enrolment API → login → STUDENT_CLASS_FALLBACK)
        so it matches GET .../my-submission and daily task loads.
      */
      const formData = new FormData();
      if (user.id != null && user.id !== "") {
        formData.append("student_id", String(user.id));
      }
      formData.append("student_username", user.username != null ? String(user.username) : "");
      formData.append(
        "student_name",
        user.full_name != null ? String(user.full_name) : ""
      );
      formData.append("class_name", studentClassName);
      formData.append("answer_text", answerText);
      if (file) {
        formData.append("file", file);
      }

      hwBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = "Submitting…";
        statusEl.classList.remove("task-homework-status--error", "task-homework-status--ok");
      }

      try {
        await apiSubmitHomework(taskId, formData);
        if (fileEl) {
          fileEl.value = "";
          updateSelectedFileSummary(fileEl, card.querySelector(".task-homework-selected-file"));
        }
        if (statusEl) {
          statusEl.textContent = "Submitted. Your teacher can review it on their side.";
          statusEl.classList.add("task-homework-status--ok");
        }
        await reloadStudentView();
        await refreshStudentProgressDashboard();
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message;
          statusEl.classList.add("task-homework-status--error");
        }
      } finally {
        hwBtn.disabled = false;
      }
      return;
    }

    const revBtn = ev.target.closest(".task-revision-submit");
    if (revBtn) {
      const submissionIdStr = revBtn.getAttribute("data-submission-id");
      const submissionId = submissionIdStr ? Number(submissionIdStr, 10) : NaN;
      if (!Number.isFinite(submissionId)) return;

      const card = revBtn.closest("li.task-card");
      if (!card) return;

      const revTa = card.querySelector(".task-revision-text");
      const revFileEl = card.querySelector(".task-revision-file");
      const revStatusEl = card.querySelector(".task-revision-status");

      const revisionText = revTa ? String(revTa.value || "").trim() : "";
      const revFile =
        revFileEl && revFileEl.files && revFileEl.files.length > 0 ? revFileEl.files[0] : null;

      if (!revisionText && !revFile) {
        if (revStatusEl) {
          revStatusEl.textContent =
            "Please enter revision text and/or attach a revision file.";
          revStatusEl.classList.remove("task-revision-status--ok");
          revStatusEl.classList.add("task-revision-status--error");
        }
        return;
      }

      const user = getLoggedInUser();
      if (!user) {
        if (revStatusEl) {
          revStatusEl.textContent = "You are not logged in.";
          revStatusEl.classList.add("task-revision-status--error");
        }
        return;
      }

      /*
        Same trust model as homework submit: Flask checks student_username matches this row
        and class_name matches the submission’s class.
      */
      const formData = new FormData();
      formData.append("student_username", user.username != null ? String(user.username) : "");
      formData.append("class_name", studentClassName);
      formData.append("revision_text", revisionText);
      if (revFile) {
        formData.append("file", revFile);
      }

      revBtn.disabled = true;
      if (revStatusEl) {
        revStatusEl.textContent = "Submitting revision…";
        revStatusEl.classList.remove("task-revision-status--error", "task-revision-status--ok");
      }
      messageEl.classList.remove("form-message--error");

      try {
        await apiPutRevisionFormData(submissionId, formData);
        if (revFileEl) {
          revFileEl.value = "";
          updateSelectedFileSummary(revFileEl, card.querySelector(".student-revision-selected-file"));
        }
        await reloadStudentView("Revision submitted successfully.");
        await refreshStudentProgressDashboard();
      } catch (err) {
        if (revStatusEl) {
          revStatusEl.textContent = err.message;
          revStatusEl.classList.add("task-revision-status--error");
          revStatusEl.classList.remove("task-revision-status--ok");
        }
        messageEl.textContent = err.message;
        messageEl.classList.add("form-message--error");
        messageEl.classList.remove("form-message--success");
      } finally {
        revBtn.disabled = false;
      }
      return;
    }

    const btn = ev.target.closest("button");
    if (!btn || btn.textContent !== "Complete" || btn.disabled) return;

    const taskIdAttr = btn.getAttribute("data-task-id");
    const taskId = taskIdAttr ? Number(taskIdAttr, 10) : NaN;
    if (!Number.isFinite(taskId)) return;

    const user = getLoggedInUser();
    if (!user) {
      messageEl.textContent = "You are not logged in.";
      messageEl.classList.add("form-message--error");
      return;
    }

    messageEl.classList.remove("form-message--error");
    try {
      const cls = String(studentClassName || "").trim() || "EAP047";
      await apiPutJson(`/api/tasks/${taskId}/my-completion`, {
        student_username: user.username != null ? String(user.username) : "",
        class_name: cls,
        status: "Completed",
      });
      await reloadStudentView();
      await refreshStudentProgressDashboard();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.classList.add("form-message--error");
    }
  });

  if (progressOpenArchiveBtn && archiveSectionEl) {
    progressOpenArchiveBtn.addEventListener("click", () => {
      archiveSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (archiveAllMonthsEl) {
    archiveAllMonthsEl.addEventListener("change", () => {
      void reloadStudentLearningArchive();
    });
  }

  if (archiveCategoryEl) {
    archiveCategoryEl.addEventListener("change", () => {
      void reloadStudentLearningArchive();
    });
  }

  if (archiveListEl) {
    archiveListEl.addEventListener("click", (ev) => {
      const row = ev.target.closest(".student-archive-list-item");
      if (!row) return;
      const id = Number(row.getAttribute("data-task-id"), 10);
      if (!Number.isFinite(id)) return;
      selectStudentArchiveItem(id);
    });
  }

  if (archiveDetailEl) {
    archiveDetailEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".student-archive-open-calendar");
      if (!btn) return;
      const d = btn.getAttribute("data-task-date");
      const tid = btn.getAttribute("data-task-id");
      await openStudentDayAndTask(d, tid);
    });
  }

  async function bootStudentClassScopeAndData() {
    await loadStudentEnrolledClasses();
    updateStudentClassDisplay();
    await reloadStudentPlannerTasksFromApi();
    void refreshStudentProgressDashboard();
  }

  window.__eapStudentLangRefresh = () => {
    populateStudentFilterSelect(filterSelect);
    populateStudentCategoryChips(categoryChipsEl, filterSelect);
    if (archiveCategoryEl) populateStudentFilterSelect(archiveCategoryEl);
    syncStudentDailyContext();
    if (lastLoadedDay) applyFilterAndRender();
    void refreshStudentProgressDashboard();
    if (lastArchiveItems.length) renderStudentArchiveView();
    if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  };
  void bootStudentClassScopeAndData();
  })();
}

// ---- Boot --------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initLoginPage();
  initAdminPage();
  initTeacherPage();
  initStudentPage();

  if (!window.__eapMobileLayoutBound) {
    window.__eapMobileLayoutBound = true;
    const repaintCalendars = () => {
      if (typeof window.__eapStudentRepaintCalendar === "function") {
        window.__eapStudentRepaintCalendar();
      }
      if (typeof window.__eapTeacherRepaintCalendar === "function") {
        window.__eapTeacherRepaintCalendar();
      }
    };
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(repaintCalendars, 180);
    });
    if (EAP_MOBILE_LAYOUT_MQ && typeof EAP_MOBILE_LAYOUT_MQ.addEventListener === "function") {
      EAP_MOBILE_LAYOUT_MQ.addEventListener("change", repaintCalendars);
    }
  }
});

window.addEventListener("eap:langchange", () => {
  if (typeof window.__eapAdminLangRefresh === "function") window.__eapAdminLangRefresh();
  if (typeof window.__eapTeacherLangRefresh === "function") window.__eapTeacherLangRefresh();
  if (typeof window.__eapStudentLangRefresh === "function") window.__eapStudentLangRefresh();
  if (window.EAP_I18N) window.EAP_I18N.applyStatic();
  syncTeacherTaskZhFieldsPanel();
});
