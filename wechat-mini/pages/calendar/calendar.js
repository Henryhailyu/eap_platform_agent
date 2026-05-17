const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const { monthKey, todayYmd, daysInMonth, pad2, errorMessage } = require('../../utils/format');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

Page({
  data: {
    className: config.defaultClass,
    userName: '',
    monthDate: new Date(),
    monthLabel: '',
    weekdays: WEEKDAYS,
    cells: [],
    tasksByDate: {},
    loading: true,
    error: '',
  },

  onShow() {
    const session = auth.requireLogin();
    if (!session) return;
    this.setData({
      className: session.className || config.defaultClass,
      userName: (session.user && session.user.full_name) || session.user.username || '',
    });
    this.loadTasks();
  },

  buildCells(monthDate, tasksByDate) {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const dim = daysInMonth(y, m);
    const cells = [];
    const today = todayYmd();
    const prefix = monthKey(monthDate);

    for (let i = 0; i < startPad; i++) {
      cells.push({ day: '', date: '', inMonth: false, count: 0 });
    }
    for (let d = 1; d <= dim; d++) {
      const date = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      cells.push({
        day: d,
        date,
        inMonth: true,
        isToday: date === today,
        count: (tasksByDate[date] || []).length,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: '', date: '', inMonth: false, count: 0 });
    }
    const monthLabel = monthDate.toLocaleString('en', { month: 'long', year: 'numeric' });
    this.setData({ cells, monthLabel, monthDate, tasksByDate });
  },

  loadTasks() {
    const { className, monthDate } = this.data;
    const prefix = monthKey(monthDate);
    this.setData({ loading: true, error: '' });

    api
      .get('/api/tasks', { class_name: className })
      .then((tasks) => {
        const byDate = {};
        (tasks || []).forEach((t) => {
          const d = t.date;
          if (d && d.startsWith(prefix)) {
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(t);
          }
        });
        this.buildCells(monthDate, byDate);
        this.setData({ loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  prevMonth() {
    const d = this.data.monthDate;
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.setData({ monthDate: next });
    this.loadTasks();
  },

  nextMonth() {
    const d = this.data.monthDate;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.setData({ monthDate: next });
    this.loadTasks();
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({
      url: `/pages/day/day?date=${date}&class_name=${encodeURIComponent(this.data.className)}`,
    });
  },

  goArchive() {
    wx.navigateTo({
      url: `/pages/archive/archive?class_name=${encodeURIComponent(this.data.className)}`,
    });
  },

  onLogout() {
    auth.clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
