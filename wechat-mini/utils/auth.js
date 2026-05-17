const STORAGE_KEY = 'eap_session';

function getSession() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setSession(session) {
  wx.setStorageSync(STORAGE_KEY, session);
}

function clearSession() {
  wx.removeStorageSync(STORAGE_KEY);
}

function requireLogin() {
  const s = getSession();
  if (!s || !s.token) {
    wx.reLaunch({ url: '/pages/login/login' });
    return null;
  }
  return s;
}

module.exports = {
  STORAGE_KEY,
  getSession,
  setSession,
  clearSession,
  requireLogin,
};
