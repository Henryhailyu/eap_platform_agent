/**
 * EAP Agent shell — random background per navigation + EN/中文 i18n toggle.
 */
(function () {
  const BG_COUNT = 12;
  const LANG_KEY = "eap_lang";
  const DEFAULT_LANG = "en";

  let strings = { en: {}, zh: {} };
  let currentLang = DEFAULT_LANG;

  function pickBackground() {
    const n = Math.floor(Math.random() * BG_COUNT) + 1;
    const shell = document.getElementById("page-shell");
    if (shell) {
      shell.style.setProperty(
        "--eap-bg-image",
        `url('assets/backgrounds/image-${n}.jpg')`
      );
    }
  }

  async function loadLocale(lang) {
    const res = await fetch(`js/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`Missing locale: ${lang}`);
    return res.json();
  }

  function applyTranslations(lang) {
    const dict = strings[lang] || {};
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const value = dict[key];
      if (value == null) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (el.getAttribute("placeholder") != null) el.placeholder = value;
      } else {
        el.textContent = value;
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const value = dict[key];
      if (value != null) el.placeholder = value;
    });
    const toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.textContent = lang === "en" ? dict.lang_toggle_to_zh || "中文" : dict.lang_toggle_to_en || "EN";
      toggle.setAttribute(
        "aria-label",
        lang === "en" ? "Switch to Chinese" : "Switch to English"
      );
    }
    currentLang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (_) {
      /* ignore */
    }
  }

  async function setLanguage(lang) {
    if (!strings[lang]) {
      strings[lang] = await loadLocale(lang);
    }
    applyTranslations(lang);
  }

  async function initI18n() {
    let lang = DEFAULT_LANG;
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "zh" || saved === "en") lang = saved;
    } catch (_) {
      /* ignore */
    }
    strings.en = await loadLocale("en");
    strings.zh = await loadLocale("zh");
    await setLanguage(lang);
    const toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const next = currentLang === "en" ? "zh" : "en";
        setLanguage(next);
      });
    }
  }

  function init() {
    document.body.classList.add("eap-shell-active");
    pickBackground();
    initI18n().catch((err) => console.warn("EAP i18n:", err));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
