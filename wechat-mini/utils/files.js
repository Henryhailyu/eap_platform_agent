const api = require('./api');
const auth = require('./auth');
const i18n = require('./i18n');

function basenameFromPath(pathOrUrl) {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl);
  const noQuery = raw.split('?')[0];
  const parts = noQuery.split('/');
  return parts[parts.length - 1] || raw;
}

function downloadAndOpen(pathOrUrl, isUpload) {
  const session = auth.getSession();
  if (!session || !session.token) {
    wx.showToast({ title: i18n.t('not_logged_in'), icon: 'none' });
    return Promise.reject();
  }
  let url = pathOrUrl;
  if (!pathOrUrl.startsWith('http')) {
    const base = basenameFromPath(pathOrUrl);
    url = isUpload ? api.apiUrl(`/uploads/${base}`) : api.apiUrl(`/submission-files/${base}`);
  }
  wx.showLoading({ title: i18n.t('opening_file') });
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      header: { Authorization: `Bearer ${session.token}` },
      success(res) {
        wx.hideLoading();
        if (res.statusCode !== 200) {
          wx.showToast({
            title: `${i18n.t('download_failed')} (${res.statusCode})`,
            icon: 'none',
          });
          reject();
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail() {
            wx.showToast({ title: i18n.t('cannot_open_file'), icon: 'none' });
            reject();
          },
          success: resolve,
        });
      },
      fail() {
        wx.hideLoading();
        wx.showToast({ title: i18n.t('download_failed'), icon: 'none' });
        reject();
      },
    });
  });
}

module.exports = {
  downloadAndOpen,
  basenameFromPath,
};
