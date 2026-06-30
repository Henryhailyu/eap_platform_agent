/**
 * API base — edit THIS file (utils/config.js).
 *
 * Production (Tencent): USE_LOCAL_DEV = false → https://elc-eap-platform.top
 * Mac local backend:     USE_LOCAL_DEV = true  → http://localhost:5051
 *   + DevTools: Details → Local Settings → "Do not verify valid domain names…"
 */
const PRODUCTION_API = 'https://elc-eap-platform.top';
const USE_LOCAL_DEV = false;
const APP_ID = 'wx1b12474067a43152';

module.exports = {
  apiBase: USE_LOCAL_DEV ? 'http://localhost:5051' : PRODUCTION_API,
  defaultClass: 'EAP047',
  appId: APP_ID,
};
