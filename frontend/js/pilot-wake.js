/**
 * Render Starter cold start: retry /api/health before login/API calls fail with 502.
 * Only runs on *.onrender.com (production pilot).
 */
(function pilotWake() {
  var host = window.location.hostname || "";
  if (host.indexOf("onrender.com") === -1) return;

  var overlay = document.createElement("div");
  overlay.id = "pilot-wake-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML =
    '<div class="pilot-wake__card">' +
    '<p class="pilot-wake__title">Starting EAP server…</p>' +
    '<p class="pilot-wake__hint">Render wakes the app after sleep. This usually takes under a minute.</p>' +
    '<p class="pilot-wake__status" id="pilot-wake-status">Checking…</p>' +
    "</div>";

  var style = document.createElement("style");
  style.textContent =
    "#pilot-wake-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(248,246,242,.92);font-family:system-ui,-apple-system,sans-serif}" +
    ".pilot-wake__card{max-width:22rem;padding:1.5rem 1.75rem;border-radius:12px;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.08);text-align:center}" +
    ".pilot-wake__title{margin:0 0 .5rem;font-size:1.1rem;font-weight:600;color:#1a1a1a}" +
    ".pilot-wake__hint,.pilot-wake__status{margin:0;font-size:.9rem;color:#555;line-height:1.45}" +
    ".pilot-wake__status{margin-top:.75rem}";
  document.head.appendChild(style);

  function showOverlay() {
    if (!overlay.parentNode) document.body.appendChild(overlay);
  }

  function hideOverlay() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function setStatus(text) {
    var el = document.getElementById("pilot-wake-status");
    if (el) el.textContent = text;
  }

  function healthUrl() {
    var base = window.EAP_API_BASE;
    if (base && String(base).replace(/\/$/, "")) {
      return String(base).replace(/\/$/, "") + "/api/health";
    }
    return "/api/health";
  }

  function checkHealth() {
    return fetch(healthUrl(), { cache: "no-store", credentials: "same-origin" }).then(function (r) {
      return r.ok;
    });
  }

  var maxAttempts = 24;
  var delayMs = 3000;

  function attempt(n) {
    return checkHealth()
      .then(function (ok) {
        if (ok) {
          hideOverlay();
          return;
        }
        if (n >= maxAttempts) {
          setStatus("Still starting. Wait 30s, then refresh this page.");
          return;
        }
        setStatus("Waiting for server… (" + n + "/" + maxAttempts + ")");
        showOverlay();
        return new Promise(function (resolve) {
          setTimeout(resolve, delayMs);
        }).then(function () {
          return attempt(n + 1);
        });
      })
      .catch(function () {
        if (n >= maxAttempts) {
          setStatus("Still starting. Wait 30s, then refresh this page.");
          showOverlay();
          return;
        }
        setStatus("Waking server… (" + n + "/" + maxAttempts + ")");
        showOverlay();
        return new Promise(function (resolve) {
          setTimeout(resolve, delayMs);
        }).then(function () {
          return attempt(n + 1);
        });
      });
  }

  checkHealth().then(function (ok) {
    if (!ok) {
      showOverlay();
      return attempt(1);
    }
  });
})();
