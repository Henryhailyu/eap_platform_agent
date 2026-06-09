/**
 * Student AI Self-Study Centre — boots calendar-first hub (SS-V3).
 */
(function () {
  const PAGE = "student-self-study";

  function redirectIfDisabled() {
    if (window.EAP_SELF_STUDY_ENABLED === false) {
      window.location.replace("student.html");
      return true;
    }
    return false;
  }

  async function boot() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (redirectIfDisabled()) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;

    const ready = await bootStudentSatellitePage(PAGE, () => {});
    if (!ready) return;

    const hub = window.EAP_SELF_STUDY_HUB;
    if (hub && typeof hub.bootHub === "function") {
      await hub.bootHub();
    }

    window.addEventListener("eap:langchange", () => {
      if (hub && typeof hub.bootHub === "function") void hub.bootHub();
      if (window.EAP_I18N) window.EAP_I18N.applyStatic();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
})();
