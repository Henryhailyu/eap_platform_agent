/**
 * Automated checks for role-guarded live nav (student + teacher).
 * Run: node scripts/test-role-nav-guards.mjs
 * Requires Flask on http://127.0.0.1:5051
 */
const BASE = "http://127.0.0.1:5051";
const UI = `${BASE}/ui`;

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function login(username, password, jar) {
  const { res, data } = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    headers: { Cookie: jar.cookieHeader },
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const part = c.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.cookies[part.slice(0, eq)] = part.slice(eq + 1);
  }
  jar.cookieHeader = Object.entries(jar.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return { ok: res.ok && data.success, data };
}

async function me(jar) {
  const { res, data } = await api("/api/me", {
    headers: { Cookie: jar.cookieHeader },
  });
  return { status: res.status, role: data.user?.role };
}

async function fetchUi(path, jar) {
  const res = await fetch(`${UI}/${path}`, {
    headers: { Cookie: jar.cookieHeader },
  });
  return res.text();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const jar = { cookies: {}, cookieHeader: "" };

  // --- API: role switch via login clears previous session ---
  let r = await login("teacher1", "123456", jar);
  assert(r.ok, "teacher login failed");
  let m = await me(jar);
  assert(m.role === "teacher", `expected teacher after login, got ${m.role}`);

  r = await login("student1", "123456", jar);
  assert(r.ok, "student login failed");
  m = await me(jar);
  assert(m.role === "student", `expected student after switch login, got ${m.role}`);

  r = await login("teacher1", "123456", jar);
  assert(r.ok, "teacher re-login failed");
  m = await me(jar);
  assert(m.role === "teacher", `expected teacher after re-login, got ${m.role}`);

  // --- UI bundles include role-guard helpers ---
  const appText = await fetch(`${UI}/app.js`).then((x) => x.text());
  assert(appText.includes("bindRoleGuardedNavLink"), "app.js missing bindRoleGuardedNavLink");
  assert(appText.includes("bindTeacherLiveNavLink"), "app.js missing bindTeacherLiveNavLink");
  assert(appText.includes("bindStudentLiveNavLink"), "app.js missing bindStudentLiveNavLink");
  assert(appText.includes("clearAuthBeforeRoleLogin"), "app.js missing clearAuthBeforeRoleLogin");

  const teacherLiveJs = await fetch(`${UI}/js/teacher-live.js`).then((x) => x.text());
  assert(
    teacherLiveJs.includes("Live API requires a valid Flask teacher session"),
    "teacher-live.js should not trust local-only teacher for launch",
  );
  assert(
    !/getLoggedInUser\(\)[\s\S]{0,80}local\.role === "teacher"\)[\s\S]{0,40}return local/.test(
      teacherLiveJs,
    ),
    "teacher-live.js still has local teacher fallback in liveTeacherContext",
  );

  console.log("PASS: role-nav-guards (API session switch + frontend guards present)");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
