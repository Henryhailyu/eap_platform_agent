/**
 * EAP i18n + background shell (Agent build).
 * Loads dictionaries from js/i18n/en.js and zh.js (sync globals).
 */
(function () {
  /** Background pool — image-7 and image-8 removed (too dark for hero text). */
  const BG_POOL = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12];
  const LANG_KEY = "eap_lang";
  const DEFAULT_LANG = "en";

  let currentLang = DEFAULT_LANG;

  function getDict(lang) {
    if (lang === "zh") return window.EAP_STRINGS_ZH || {};
    return window.EAP_STRINGS_EN || {};
  }

  function uiBase() {
    const p = window.location.pathname || "";
    if (p.includes("/ui/")) {
      return p.slice(0, p.lastIndexOf("/") + 1);
    }
    return "";
  }

  function assetUrl(relative) {
    return `${uiBase()}${relative.replace(/^\//, "")}`;
  }

  function pickBackground() {
    const n = BG_POOL[Math.floor(Math.random() * BG_POOL.length)];
    const shell = document.getElementById("page-shell");
    const url = assetUrl(`assets/backgrounds/image-${n}.jpg`);
    if (shell) {
      shell.style.setProperty("--eap-bg-image", `url("${url}")`);
    }
    document.documentElement.style.setProperty("--eap-bg-image", `url("${url}")`);
  }

  function t(key, params) {
    const dict = getDict(currentLang);
    let s = dict[key];
    if (s == null) {
      const en = getDict("en")[key];
      s = en != null ? en : key;
    }
    if (params && typeof s === "string") {
      Object.keys(params).forEach((k) => {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(params[k]));
      });
    }
    return s;
  }

  function getLang() {
    return currentLang;
  }

  function localeTag() {
    return currentLang === "zh" ? "zh-CN" : "en";
  }

  function applyStatic() {
    const dict = getDict(currentLang);
    document.documentElement.lang = currentLang === "zh" ? "zh-Hans" : "en";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      let params = null;
      const rawParams = el.getAttribute("data-i18n-params");
      if (rawParams) {
        try {
          params = JSON.parse(rawParams);
        } catch (_) {
          /* ignore malformed params */
        }
      }
      const value = t(key, params);
      if (value == null || value === key) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (el.hasAttribute("placeholder")) el.placeholder = value;
      } else {
        el.textContent = value;
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const value = dict[key];
      if (value != null) el.placeholder = value;
    });

    document.querySelectorAll("[data-i18n-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-label");
      const value = dict[key];
      if (value != null && el.tagName === "LABEL") el.textContent = value;
    });

    const toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.textContent =
        currentLang === "en" ? dict.lang_toggle_to_zh || "中文" : dict.lang_toggle_to_en || "EN";
      toggle.setAttribute(
        "aria-label",
        currentLang === "en" ? "Switch to Chinese" : "Switch to English"
      );
    }
  }

  function setLang(lang) {
    if (lang !== "en" && lang !== "zh") return;
    currentLang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (_) {
      /* ignore */
    }
    applyStatic();
    window.dispatchEvent(new CustomEvent("eap:langchange", { detail: { lang } }));
  }

  function toggleLang() {
    setLang(currentLang === "en" ? "zh" : "en");
  }

  function init() {
    document.body.classList.add("eap-shell-active", "eap-wix");
    let lang = DEFAULT_LANG;
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "zh" || saved === "en") lang = saved;
    } catch (_) {
      /* ignore */
    }
    currentLang = lang;
    pickBackground();
    applyStatic();
    const toggle = document.getElementById("lang-toggle");
    if (toggle) toggle.addEventListener("click", toggleLang);
  }

  window.EAP_I18N = {
    t,
    getLang,
    localeTag,
    setLang,
    toggleLang,
    applyStatic,
    pickBackground,
    assetUrl,
  };

  window.t = t;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
