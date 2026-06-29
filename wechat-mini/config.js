/**
 * API base for the student mini-program.
 *
 * Production (Tencent Lighthouse): HTTPS — required for real phones after 域名白名单.
 * Local DevTools: set USE_LOCAL_DEV = true and enable 不校验合法域名.
 */
const PRODUCTION_API = 'https://elc-eap-platform.top';
const USE_LOCAL_DEV = false;
/** WeChat mini-program AppID (mp.weixin.qq.com → 开发设置) */
const APP_ID = 'wx1b12474067a43152';

module.exports = {
  apiBase: USE_LOCAL_DEV ? 'http://localhost:5051' : PRODUCTION_API,
  defaultClass: 'EAP047',
  appId: APP_ID,
};
