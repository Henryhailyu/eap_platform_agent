const config = require('../config');
const auth = require('./auth');
const { errorMessage } = require('./format');

function apiUrl(path) {
  const base = (config.apiBase || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function request(method, path, options = {}) {
  const session = auth.getSession();
  const header = Object.assign({}, options.header || {});
  if (session && session.token) {
    header.Authorization = `Bearer ${session.token}`;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const timer = setTimeout(() => {
      finish(reject, {
        error: 'Request timed out — is Flask running on config.js apiBase?',
      });
    }, 20000);

    wx.request({
      url: apiUrl(path),
      method,
      data: options.data,
      header,
      timeout: 15000,
      success(res) {
        if (res.statusCode === 401) {
          auth.clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('Session expired — please log in again'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          finish(resolve, res.data);
          return;
        }
        finish(reject, res.data || { error: `HTTP ${res.statusCode}` });
      },
      fail(err) {
        const detail = (err && err.errMsg) ? err.errMsg : 'request:fail';
        finish(reject, {
          error: `Network error — ${detail}. Try apiBase http://localhost:5051, keep Flask running, 不校验合法域名 on.`,
        });
      },
    });
  });
}

function get(path, data) {
  let url = path;
  if (data && Object.keys(data).length) {
    const q = Object.keys(data)
      .filter((k) => data[k] != null && data[k] !== '')
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
      .join('&');
    url = `${path}${path.includes('?') ? '&' : '?'}${q}`;
  }
  return request('GET', url);
}

function post(path, data) {
  return request('POST', path, { data, header: { 'Content-Type': 'application/json' } });
}

function put(path, data) {
  return request('PUT', path, { data, header: { 'Content-Type': 'application/json' } });
}

function login(username, password) {
  return post('/api/v1/auth/login', { username, password });
}

function fileUrl(storedPath) {
  if (!storedPath) return '';
  const base = storedPath.includes('/') ? storedPath.split('/').pop() : storedPath;
  const session = auth.getSession();
  const url = apiUrl(`/submission-files/${base}`);
  return session && session.token ? `${url}?_bearer=1` : url;
}

function writeTempTextFile(text) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/eap_answer_${Date.now()}.txt`;
    fs.writeFile({
      filePath: path,
      data: text,
      encoding: 'utf8',
      success: () => resolve(path),
      fail: () => reject({ error: 'Could not prepare answer file' }),
    });
  });
}

function uploadMultipart(url, formData, filePath) {
  const session = auth.getSession();
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject({ error: 'filePath required for upload' });
      return;
    }
    wx.uploadFile({
      url: apiUrl(url),
      filePath,
      name: 'file',
      formData,
      header: session && session.token ? { Authorization: `Bearer ${session.token}` } : {},
      success(res) {
        if (res.statusCode === 401) {
          auth.clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('Session expired'));
          return;
        }
        let body = res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            body = { error: body };
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        reject(body || { error: `HTTP ${res.statusCode}` });
      },
      fail() {
        reject({ error: 'Upload failed' });
      },
    });
  });
}

function uploadSubmission(taskId, formData, filePath) {
  const pathPromise = filePath
    ? Promise.resolve(filePath)
    : formData.answer_text
      ? writeTempTextFile(formData.answer_text)
      : Promise.reject({ error: 'Add answer text or choose a file' });
  return pathPromise.then((path) =>
    uploadMultipart(`/api/tasks/${taskId}/submit`, formData, path)
  );
}

function uploadRevision(submissionId, formData, filePath) {
  const pathPromise = filePath
    ? Promise.resolve(filePath)
    : formData.revision_text
      ? writeTempTextFile(formData.revision_text)
      : Promise.reject({ error: 'Add revision text or choose a file' });
  return pathPromise.then((path) =>
    uploadMultipart(`/api/submissions/${submissionId}/revision`, formData, path)
  );
}

module.exports = {
  apiUrl,
  request,
  get,
  post,
  put,
  login,
  fileUrl,
  uploadSubmission,
  uploadRevision,
  errorMessage,
};
