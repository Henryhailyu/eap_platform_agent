/**
 * Save / upload buttons — saving spinner, then "Saved" feedback (teacher UX).
 */
(function (global) {
  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  function defaultLabel(btn) {
    return btn.getAttribute("data-eap-default-label") || btn.textContent.trim();
  }

  function setSaving(btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("eap-btn--saving");
    btn.innerHTML = `<span class="eap-save-btn__spinner" aria-hidden="true"></span><span>${escapeHtml(
      t(btn.getAttribute("data-eap-saving-key") || "eap_btn_saving"),
    )}</span>`;
  }

  function setSaved(btn, savedKey) {
    btn.classList.remove("eap-btn--saving");
    btn.classList.add("eap-btn--saved");
    btn.removeAttribute("aria-busy");
    btn.disabled = true;
    btn.textContent = t(savedKey || btn.getAttribute("data-eap-saved-key") || "eap_btn_saved");
  }

  function resetBtn(btn, label) {
    btn.classList.remove("eap-btn--saving", "eap-btn--saved");
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.textContent = label;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Run async save; button shows Saving… then Saved (stays until resetSaveButton).
   */
  async function runSaveButton(btn, fn) {
    if (!btn || btn.classList.contains("eap-btn--saving")) return;
    const label = defaultLabel(btn);
    if (!btn.getAttribute("data-eap-default-label")) {
      btn.setAttribute("data-eap-default-label", label);
    }
    setSaving(btn);
    try {
      await fn();
      setSaved(btn);
    } catch (err) {
      resetBtn(btn, label);
      throw err;
    }
  }

  /**
   * Run async upload; reverts to default label after success.
   */
  async function runUploadButton(btn, fn) {
    if (!btn || btn.classList.contains("eap-btn--saving")) return;
    const label = defaultLabel(btn);
    if (!btn.getAttribute("data-eap-default-label")) {
      btn.setAttribute("data-eap-default-label", label);
    }
    setSaving(btn);
    try {
      await fn();
      resetBtn(btn, label);
      if (global.EAP_I18N && typeof global.EAP_I18N.applyStatic === "function") {
        global.EAP_I18N.applyStatic(btn);
      }
    } catch (err) {
      resetBtn(btn, label);
      throw err;
    }
  }

  function resetSaveButton(btn) {
    if (!btn) return;
    resetBtn(btn, defaultLabel(btn));
  }

  global.EAP_runSaveButton = runSaveButton;
  global.EAP_runUploadButton = runUploadButton;
  global.EAP_resetSaveButton = resetSaveButton;
})(typeof window !== "undefined" ? window : globalThis);
