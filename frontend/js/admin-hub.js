/**
 * Manager hub — Phase A: 5-card navigation + self-study left sidebar.
 * Does not alter panel business logic; visibility / routing only.
 */
(function (global) {
  const MODULES = ["school", "self-study", "teaching", "homework"];
  const SKILLS = ["materials", "vocabulary", "reading", "listening", "writing", "speaking", "ai"];
  const MODULE_I18N = {
    school: "admin_hub_module_school",
    "self-study": "admin_hub_module_self_study",
    teaching: "admin_hub_module_teaching",
    homework: "admin_hub_module_homework",
  };

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function parseRoute() {
    const q = new URLSearchParams(global.location.search);
    const module = q.get("module");
    const skill = q.get("skill") || "materials";
    if (module && MODULES.includes(module)) {
      return { view: "module", module, skill: SKILLS.includes(skill) ? skill : "materials" };
    }
    return { view: "hub", module: null, skill: "materials" };
  }

  function setRoute(module, skill) {
    const url = new URL(global.location.href);
    if (!module) {
      url.searchParams.delete("module");
      url.searchParams.delete("skill");
    } else {
      url.searchParams.set("module", module);
      if (module === "self-study" && skill) {
        url.searchParams.set("skill", skill);
      } else {
        url.searchParams.delete("skill");
      }
    }
    global.history.replaceState({}, "", url.pathname + url.search);
  }

  function allPanels() {
    return Array.from(document.querySelectorAll("[data-admin-module]"));
  }

  function applyView(route) {
    const hub = document.getElementById("admin-hub");
    const breadcrumb = document.getElementById("admin-module-breadcrumb");
    const sidebar = document.getElementById("admin-ss-sidebar");
    const hero = document.querySelector(".page-hero");

    if (route.view === "hub") {
      document.body.classList.remove("admin-module-active", "admin-module-self-study");
      if (hub) hub.hidden = false;
      if (breadcrumb) breadcrumb.hidden = true;
      if (sidebar) sidebar.hidden = true;
      if (hero) hero.hidden = false;
      allPanels().forEach((el) => {
        el.hidden = true;
      });
      return;
    }

    document.body.classList.add("admin-module-active");
    document.body.classList.toggle("admin-module-self-study", route.module === "self-study");
    if (hub) hub.hidden = true;
    if (breadcrumb) breadcrumb.hidden = false;
    if (hero) hero.hidden = true;

    const moduleLabel = t(MODULE_I18N[route.module] || route.module);
    const skillLabel =
      route.module === "self-study" ? t(`admin_hub_skill_${route.skill}`) : "";
    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <button type="button" class="btn-secondary admin-hub-back" id="admin-hub-back">${t("admin_hub_back")}</button>
        <span class="admin-hub-crumb">${escapeHtml(moduleLabel)}${skillLabel ? ` › ${escapeHtml(skillLabel)}` : ""}</span>
      `;
      document.getElementById("admin-hub-back")?.addEventListener("click", () => {
        setRoute(null);
        applyView(parseRoute());
      });
    }

    if (sidebar) {
      sidebar.hidden = route.module !== "self-study";
      sidebar.querySelectorAll("[data-skill]").forEach((btn) => {
        const sk = btn.getAttribute("data-skill");
        const on = route.module === "self-study" && sk === route.skill;
        btn.classList.toggle("admin-ss-sidebar__btn--active", on);
        btn.setAttribute("aria-current", on ? "page" : "false");
      });
    }

    allPanels().forEach((el) => {
      const mod = el.getAttribute("data-admin-module");
      const skill = el.getAttribute("data-admin-skill");
      if (mod !== route.module) {
        el.hidden = true;
        return;
      }
      if (route.module === "self-study") {
        el.hidden = skill !== route.skill;
      } else {
        el.hidden = false;
      }
    });
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function bindHub() {
    document.querySelectorAll("[data-hub-module]").forEach((card) => {
      card.addEventListener("click", () => {
        const mod = card.getAttribute("data-hub-module");
        const skill = mod === "self-study" ? "materials" : null;
        setRoute(mod, skill);
        applyView(parseRoute());
      });
    });

    const sidebar = document.getElementById("admin-ss-sidebar");
    sidebar?.querySelectorAll("[data-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const skill = btn.getAttribute("data-skill");
        setRoute("self-study", skill);
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

  global.EAP_ADMIN_HUB = { init, applyView, parseRoute };
})(typeof window !== "undefined" ? window : globalThis);
