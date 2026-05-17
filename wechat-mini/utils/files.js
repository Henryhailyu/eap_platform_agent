const api = require('./api');
const auth = require('./auth');

function downloadAndOpen(pathOrUrl, isUpload) {
  const session = auth.getSession();
  if (!session || !session.token) {
    wx.showToast({ title: 'Not logged in', icon: 'none' });
    return Promise.reject();
  }
  let url = pathOrUrl;
  if (!pathOrUrl.startsWith('http')) {
    const base = pathOrUrl.split('/').pop();
    url = isUpload ? api.apiUrl(`/uploads/${base}`) : api.apiUrl(`/submission-files/${base}`);
  }
  wx.showLoading({ title: 'Opening…' });
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      header: { Authorization: `Bearer ${session.token}` },
      success(res) {
        wx.hideLoading();
        if (res.statusCode !== 200) {
          wx.showToast({ title: `Download failed (${res.statusCode})`, icon: 'none' });
          reject();
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail() {
            wx.showToast({ title: 'Cannot open this file type', icon: 'none' });
            reject();
          },
          success: resolve,
        });
      },
      fail() {
        wx.hideLoading();
        wx.showToast({ title: 'Download failed', icon: 'none' });
        reject();
      },
    });
  });
}

module.exports = {
  downloadAndOpen,
};
