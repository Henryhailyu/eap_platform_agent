/**
 * Local simulator: use localhost (WeChat DevTools often fails on 127.0.0.1).
 * Production: HTTPS pilot URL after whitelisting in mp.weixin.qq.com.
 */
module.exports = {
  apiBase: 'http://localhost:5051',
  defaultClass: 'EAP047',
};
