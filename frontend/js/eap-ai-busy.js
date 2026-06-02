/**
 * Shared “AI is working” state for primary generate buttons.
 * Adds an inline spinner + disables the button until the async task finishes.
 */
(function (global) {
  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  function resolveTarget(btn, opts) {
    if (opts && opts.targetEl) return opts.targetEl;
    const sel = btn && btn.getAttribute("data-eap-ai-target");
    if (!sel) return null;
    return document.querySelector(sel);
  }

  function busyText(btn) {
    const key = btn && btn.getAttribute("data-eap-ai-busy-key");
    if (key) return t(key);
    return t("eap_ai_busy_generating");
  }

  /**
   * @param {HTMLButtonElement} btn
   * @param {() => Promise<unknown>} fn
   * @param {{ targetEl?: Element }} [opts]
   */
  async function runAiButton(btn, fn, opts) {
    if (!btn || btn.classList.contains("eap-ai-btn--busy")) return;
    const target = resolveTarget(btn, opts);
    const originalHtml = btn.innerHTML;
    const originalDisabled = btn.disabled;
    btn.classList.add("eap-ai-btn--busy");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<span class="eap-ai-btn__spinner" aria-hidden="true"></span><span class="eap-ai-btn__text">${busyText(btn)}</span>`;
    if (target) {
      target.classList.add("eap-ai-target--busy");
      target.setAttribute("aria-busy", "true");
    }
    try {
      return await fn();
    } finally {
      btn.classList.remove("eap-ai-btn--busy");
      btn.disabled = originalDisabled;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalHtml;
      if (target) {
        target.classList.remove("eap-ai-target--busy");
        target.removeAttribute("aria-busy");
      }
      if (global.EAP_I18N && typeof global.EAP_I18N.applyStatic === "function") {
        global.EAP_I18N.applyStatic(btn);
      }
    }
  }

  global.EAP_runAiButton = runAiButton;
})(typeof window !== "undefined" ? window : globalThis);
