/**
 * Manager hub — module navigation with horizontal sub-tabs (self-study + school).
 */
(function (global) {
  const MODULES = ["school", "self-study", "teaching", "homework"];
  const SKILLS = ["materials", "vocabulary", "reading", "listening", "writing", "speaking", "ai"];
  const SCHOOL_AREAS = ["calendar", "classes", "teachers", "students", "performance"];
  const MODULE_I18N = {
    school: "admin_hub_module_school",
    "self-study": "admin_hub_module_self_study",
    teaching: "admin_hub_module_teaching",
    homework: "admin_hub_module_homework",
  };
  const SCHOOL_AREA_I18N = {
    calendar: "admin_school_tab_calendar",
    classes: "admin_school_tab_classes",
    teachers: "admin_school_tab_teachers",
    students: "admin_school_tab_students",
    performance: "admin_school_tab_performance",
  };

  let pendingClassId = null;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function parseRoute() {
    const q = new URLSearchParams(global.location.search);
    const module = q.get("module");
    const skill = q.get("skill") || "materials";
    const area = q.get("area") || "calendar";
    const classId = q.get("class_id");
    if (module && MODULES.includes(module)) {
      return {
        view: "module",
        module,
        skill: SKILLS.includes(skill) ? skill : "materials",
        area: SCHOOL_AREAS.includes(area) ? area : "calendar",
        classId: classId ? String(classId) : null,
      };
    }
    return { view: "hub", module: null, skill: "materials", area: "calendar", classId: null };
  }

  function setRoute(module, opts) {
    const options = opts || {};
    const url = new URL(global.location.href);
    if (!module) {
      url.searchParams.delete("module");
      url.searchParams.delete("skill");
      url.searchParams.delete("area");
      url.searchParams.delete("class_id");
    } else {
      url.searchParams.set("module", module);
      if (module === "self-study") {
        url.searchParams.set("skill", options.skill || "materials");
        url.searchParams.delete("area");
      } else if (module === "school") {
        url.searchParams.set("area", options.area || "calendar");
        url.searchParams.delete("skill");
      } else {
        url.searchParams.delete("skill");
        url.searchParams.delete("area");
      }
      if (options.classId) {
        url.searchParams.set("class_id", String(options.classId));
      } else {
        url.searchParams.delete("class_id");
      }
    }
    global.history.replaceState({}, "", url.pathname + url.search);
  }

  function allPanels() {
    return Array.from(document.querySelectorAll("[data-admin-module]"));
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function syncTabButtons(container, attr, activeValue) {
    if (!container) return;
    container.querySelectorAll(`[${attr}]`).forEach((btn) => {
      const val = btn.getAttribute(attr);
      const on = val === activeValue;
      btn.classList.toggle("admin-module-tabs__btn--active", on);
      btn.setAttribute("aria-current", on ? "page" : "false");
    });
  }

  function openClassManage(classId) {
    pendingClassId = classId != null ? String(classId) : null;
    setRoute("school", { area: "classes", classId: pendingClassId });
    applyView(parseRoute());
  }

  function tryOpenPendingClass() {
    if (!pendingClassId) return;
    const classId = pendingClassId;
    pendingClassId = null;
    const btn = document.querySelector(
      `#admin-classes-tbody button[data-class-id="${CSS.escape(classId)}"]`,
    );
    if (btn) {
      btn.click();
      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    global.setTimeout(() => {
      const retry = document.querySelector(
        `#admin-classes-tbody button[data-class-id="${CSS.escape(classId)}"]`,
      );
      if (retry) {
        retry.click();
        retry.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 400);
  }

  function applyView(route) {
    const hub = document.getElementById("admin-hub");
    const breadcrumb = document.getElementById("admin-module-breadcrumb");
    const ssTabs = document.getElementById("admin-ss-tabs");
    const schoolTabs = document.getElementById("admin-school-tabs");
    const hero = document.querySelector(".page-hero");

    if (route.view === "hub") {
      document.body.classList.remove("admin-module-active");
      if (hub) hub.hidden = false;
      if (breadcrumb) breadcrumb.hidden = true;
      if (ssTabs) ssTabs.hidden = true;
      if (schoolTabs) schoolTabs.hidden = true;
      if (hero) hero.hidden = false;
      allPanels().forEach((el) => {
        el.hidden = true;
      });
      return;
    }

    document.body.classList.add("admin-module-active");
    if (hub) hub.hidden = true;
    if (breadcrumb) breadcrumb.hidden = false;
    if (hero) hero.hidden = true;

    const moduleLabel = t(MODULE_I18N[route.module] || route.module);
    let crumbExtra = "";
    if (route.module === "self-study") {
      crumbExtra = ` › ${escapeHtml(t(`admin_hub_skill_${route.skill}`))}`;
    } else if (route.module === "school") {
      crumbExtra = ` › ${escapeHtml(t(SCHOOL_AREA_I18N[route.area] || route.area))}`;
    }

    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <button type="button" class="btn-secondary admin-hub-back" id="admin-hub-back">${t("admin_hub_back")}</button>
        <span class="admin-hub-crumb">${escapeHtml(moduleLabel)}${crumbExtra}</span>
      `;
      document.getElementById("admin-hub-back")?.addEventListener("click", () => {
        setRoute(null);
        applyView(parseRoute());
      });
    }

    if (ssTabs) {
      ssTabs.hidden = route.module !== "self-study";
      syncTabButtons(ssTabs, "data-skill", route.skill);
    }
    if (schoolTabs) {
      schoolTabs.hidden = route.module !== "school";
      syncTabButtons(schoolTabs, "data-school-area", route.area);
    }

    allPanels().forEach((el) => {
      const mod = el.getAttribute("data-admin-module");
      if (mod !== route.module) {
        el.hidden = true;
        return;
      }
      if (route.module === "self-study") {
        const skill = el.getAttribute("data-admin-skill");
        el.hidden = skill !== route.skill;
        return;
      }
      if (route.module === "school") {
        const area = el.getAttribute("data-admin-school-area") || "calendar";
        el.hidden = area !== route.area;
        return;
      }
      el.hidden = false;
    });

    if (route.module === "school" && route.area === "classes" && route.classId) {
      pendingClassId = route.classId;
      tryOpenPendingClass();
    }
  }

  function bindHub() {
    document.querySelectorAll("[data-hub-module]").forEach((card) => {
      card.addEventListener("click", () => {
        const mod = card.getAttribute("data-hub-module");
        if (mod === "self-study") {
          setRoute(mod, { skill: "materials" });
        } else if (mod === "school") {
          setRoute(mod, { area: "calendar" });
        } else {
          setRoute(mod);
        }
        applyView(parseRoute());
      });
    });

    document.getElementById("admin-ss-tabs")?.querySelectorAll("[data-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setRoute("self-study", { skill: btn.getAttribute("data-skill") });
        applyView(parseRoute());
      });
    });

    document
      .getElementById("admin-school-tabs")
      ?.querySelectorAll("[data-school-area]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          setRoute("school", { area: btn.getAttribute("data-school-area") });
          applyView(parseRoute());
        });
      });
  }

  function init() {
    if (document.body.getAttribute("data-page") !== "admin") return;
    bindHub();
    applyView(parseRoute());
    global.addEventListener("popstate", () => applyView(parseRoute()));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.EAP_ADMIN_HUB = { init, applyView, parseRoute, openClassManage, setRoute };
})(typeof window !== "undefined" ? window : globalThis);
