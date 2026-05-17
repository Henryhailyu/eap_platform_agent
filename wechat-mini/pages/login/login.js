const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const i18n = require('../../utils/i18n');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    L: i18n.labels(),
    username: 'student1',
    password: '',
    loading: false,
    error: '',
  },

  onShow() {
    this.setData({ L: i18n.labels() });
    const s = auth.getSession();
    if (s && s.token) {
      wx.reLaunch({ url: '/pages/calendar/calendar' });
    }
  },

  onToggleLang() {
    i18n.toggleLang();
    this.setData({ L: i18n.labels() });
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
    const L = this.data.L;
    if (!username || !password) {
      this.setData({ error: L.login_enter_both });
      return;
    }
    if ((config.apiBase || '').includes('your-pilot-host')) {
      this.setData({ error: L.config_api_base });
      return;
    }

    this.setData({ loading: true, error: '' });
    api
      .login(username, password)
      .then((res) => {
        if (!res.access_token) {
          throw { message: 'No access token' };
        }
        auth.setSession({
          token: res.access_token,
          user: res.user,
          className: (res.user && res.user.class_name) || config.defaultClass,
          classes: [],
        });
        return api.get('/api/student/my-classes');
      })
      .then((mc) => {
        const session = auth.getSession();
        const classes = (mc && mc.classes) || [];
        let className = session.className;
        if (classes.length) {
          const match = classes.find((c) => c.class_code === className);
          if (!match) className = classes[0].class_code;
        }
        auth.setSession(Object.assign({}, session, { classes, className }));
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
