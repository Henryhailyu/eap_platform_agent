/**
 * Landing page — scroll reveals, stat counters, role tabs.
 * Login forms unchanged (handled by app.js).
 */
(function (global) {
  if (document.body.getAttribute("data-page") !== "landing" && !document.body.classList.contains("page-landing")) {
    return;
  }

  const reducedMotion = global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initScrollReveal() {
    const nodes = document.querySelectorAll(".landing-reveal-on-scroll");
    if (!nodes.length) return;

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    nodes.forEach((el) => io.observe(el));
  }

  function animateCount(el, target, suffix) {
    if (reducedMotion) {
      el.textContent = String(target) + (suffix || "");
      return;
    }
    const duration = 900;
    const start = performance.now();
    const from = 0;

    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (target - from) * eased);
      el.textContent = String(val) + (suffix || "");
      if (t < 1) global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  function initStatCounters() {
    const items = document.querySelectorAll(".landing-stats__n[data-count-target]");
    if (!items.length) return;

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      items.forEach((el) => {
        const target = Number(el.getAttribute("data-count-target"));
        const suffix = el.getAttribute("data-count-suffix") || "";
        if (Number.isFinite(target)) el.textContent = String(target) + suffix;
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el.dataset.counted === "1") return;
          el.dataset.counted = "1";
          const target = Number(el.getAttribute("data-count-target"));
          const suffix = el.getAttribute("data-count-suffix") || "";
          if (Number.isFinite(target)) animateCount(el, target, suffix);
          io.unobserve(el);
        });
      },
      { threshold: 0.4 },
    );

    items.forEach((el) => io.observe(el));
  }

  function initRoleTabs() {
    const tabs = document.querySelectorAll(".landing-roles__tab");
    const panels = {
      student: document.getElementById("landing-role-panel-student"),
      teacher: document.getElementById("landing-role-panel-teacher"),
      manager: document.getElementById("landing-role-panel-manager"),
    };
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const role = tab.getAttribute("data-role");
        if (!role || !panels[role]) return;

        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle("landing-roles__tab--active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });

        Object.keys(panels).forEach((key) => {
          const panel = panels[key];
          if (!panel) return;
          const show = key === role;
          panel.hidden = !show;
          panel.classList.toggle("landing-roles__panel--active", show);
        });
      });
    });
  }

  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (ev) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        ev.preventDefault();
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      });
    });
  }

  function init() {
    initScrollReveal();
    initStatCounters();
    initRoleTabs();
    initSmoothAnchors();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
