/**
 * ICP + 公安网安备悬挂 — elc-eap-platform.top
 * ICP: 苏ICP备2026033339号-2
 * PS:  苏公网安备32059002008173号
 */
(function () {
  var ICP_NUMBER = "苏ICP备2026033339号-2";
  var ICP_URL = "https://beian.miit.gov.cn/";
  var PS_NUMBER = "苏公网安备32059002008173号";
  var PS_URL =
    "https://beian.mps.gov.cn/#/query/webSearch?code=32059002008173";
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
      "</a></p>" +
      '<p class="site-icp-footer__ps">' +
      '<a href="' +
      PS_URL +
      '" rel="noreferrer" target="_blank">' +
      PS_NUMBER +
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
