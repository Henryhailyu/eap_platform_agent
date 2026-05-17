const auth = require('./utils/auth');

App({
  onLaunch() {
    const session = auth.getSession();
    if (session && session.token) {
      wx.reLaunch({ url: '/pages/calendar/calendar' });
    }
  },
});
