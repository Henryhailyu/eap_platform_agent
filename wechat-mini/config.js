/**
 * API base for the student mini-program.
 *
 * Production (Render pilot): HTTPS — required for real phones after 备案/域名.
 * Local DevTools: set USE_LOCAL_DEV = true and enable 不校验合法域名.
 */
const PRODUCTION_API = 'https://eap-platform-pilot.onrender.com';
const USE_LOCAL_DEV = false;

module.exports = {
  apiBase: USE_LOCAL_DEV ? 'http://localhost:5051' : PRODUCTION_API,
  defaultClass: 'EAP047',
};
