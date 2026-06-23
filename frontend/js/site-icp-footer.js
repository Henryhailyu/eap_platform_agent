/**
 * ICP 备案号悬挂 — 苏ICP备2026033339号-2 · elc-eap-platform.top
 * https://cloud.tencent.com/document/product/243/61412
 */
(function () {
  var ICP_NUMBER = "苏ICP备2026033339号-2";
  var ICP_URL = "https://beian.miit.gov.cn/";
  var COPYRIGHT_OWNER = "吕海";

  function mount() {
    if (document.getElementById("site-icp-footer")) return;
    var footer = document.createElement("footer");
    footer.id = "site-icp-footer";
    footer.className = "site-icp-footer";
    footer.setAttribute("role", "contentinfo");
    footer.innerHTML =
      '<p class="site-icp-footer__copy">版权所有 © ' +
      COPYRIGHT_OWNER +
      "</p>" +
      '<p class="site-icp-footer__icp">' +
      '<a href="' +
      ICP_URL +
      '" target="_blank" rel="noopener noreferrer">' +
      ICP_NUMBER +
      "</a></p>";
    var shell = document.querySelector("#page-shell > .page-overlay") || document.getElementById("page-shell");
    (shell || document.body).appendChild(footer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
