const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    username: 'student1',
    password: '',
    loading: false,
    error: '',
  },

  onLoad() {
    const s = auth.getSession();
    if (s && s.token) {
      wx.reLaunch({ url: '/pages/calendar/calendar' });
    }
  },

  onUsername(e) {
    this.setData({ username: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  onLogin() {
    const username = (this.data.username || '').trim();
    const password = (this.data.password || '').trim();
    if (!username || !password) {
      this.setData({ error: 'Enter username and password' });
      return;
    }
    if ((config.apiBase || '').includes('your-pilot-host')) {
      this.setData({ error: 'Set apiBase in config.js first' });
      return;
    }

    this.setData({ loading: true, error: '' });
    api
      .login(username, password)
      .then((res) => {
        if (!res.access_token) {
          throw { message: 'No access token in response' };
        }
        auth.setSession({
          token: res.access_token,
          user: res.user,
          className: (res.user && res.user.class_name) || config.defaultClass,
        });
        wx.reLaunch({ url: '/pages/calendar/calendar' });
      })
      .catch((err) => {
        this.setData({ error: errorMessage(err) });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
});
