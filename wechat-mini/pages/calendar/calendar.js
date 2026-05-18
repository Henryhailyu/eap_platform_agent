const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const i18n = require('../../utils/i18n');
const academic = require('../../utils/academic');
const {
  monthKey,
  todayYmd,
  toDate,
  daysInMonth,
  pad2,
  formatMonthLabel,
  errorMessage,
} = require('../../utils/format');

Page({
  data: {
    L: i18n.labels(),
    className: config.defaultClass,
    classes: [],
    userName: '',
    monthDate: new Date(),
    monthLabel: '',
    weekHint: '',
    weekdays: i18n.strings().weekdays,
    cells: [],
    tasksByDate: {},
    academicCal: null,
    loading: true,
    error: '',
  },

  onShow() {
    const session = auth.requireLogin();
    if (!session) return;
    const L = i18n.labels();
    const monthDate = toDate(this.data.monthDate);
    this.setData({
      L,
      weekdays: i18n.strings().weekdays,
      className: session.className || config.defaultClass,
      classes: session.classes || [],
      userName: (session.user && session.user.full_name) || session.user.username || '',
      monthDate,
      monthLabel: formatMonthLabel(monthDate, i18n.getLang()),
    });
    wx.setNavigationBarTitle({ title: L.calendar });
    this.loadAcademicInBackground();
    this.loadTasks();
  },

  onToggleLang() {
    i18n.toggleLang();
    const L = i18n.labels();
    this.setData({
      L,
      weekdays: i18n.strings().weekdays,
      monthLabel: formatMonthLabel(this.data.monthDate, i18n.getLang()),
    });
    this.buildCells(this.data.monthDate, this.data.tasksByDate || {});
  },

  loadAcademicInBackground() {
    api
      .get('/api/academic-calendar')
      .then((cal) => {
        this.setData({ academicCal: cal });
        this.buildCells(this.data.monthDate, this.data.tasksByDate || {});
      })
      .catch(() => {});
  },

  buildCells(monthDateInput, tasksByDate) {
    const monthDate = toDate(monthDateInput);
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const dim = daysInMonth(y, m);
    const cells = [];
    const today = todayYmd();
    const cal = this.data.academicCal;

    for (let i = 0; i < startPad; i++) {
      cells.push({
        key: `pad-before-${i}`,
        day: '',
        date: '',
        inMonth: false,
        count: 0,
      });
    }
    for (let d = 1; d <= dim; d++) {
      const date = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const holidayLabel = cal ? academic.notableLabel(cal.notable_dates, date) : '';
      cells.push({
        key: date,
        day: d,
        date,
        inMonth: true,
        isToday: date === today,
        isHoliday: !!holidayLabel,
        holidayLabel,
        count: (tasksByDate[date] || []).length,
      });
    }
    let tail = 0;
    while (cells.length % 7 !== 0) {
      cells.push({
        key: `pad-after-${tail}`,
        day: '',
        date: '',
        inMonth: false,
        count: 0,
      });
      tail += 1;
    }

    let weekHint = '';
    if (cal && cal.semester_start_date) {
      const tw = academic.teachingWeekIndex(
        cal.semester_start_date,
        cal.teaching_weeks,
        `${y}-${pad2(m + 1)}-01`
      );
      if (tw) weekHint = i18n.t('teaching_week', { n: tw });
    }

    this.setData({
      cells,
      monthLabel: formatMonthLabel(monthDate, i18n.getLang()),
      monthDate,
      tasksByDate,
      weekHint,
    });
  },

  loadTasks() {
    const { className } = this.data;
    const monthDate = toDate(this.data.monthDate);
    const prefix = monthKey(monthDate);
    this.setData({ loading: true, error: '' });

    api
      .get('/api/tasks', { class_name: className })
      .then((tasks) => {
        const list = Array.isArray(tasks) ? tasks : [];
        const byDate = {};
        list.forEach((t) => {
          const d = t.date;
          if (d && String(d).startsWith(prefix)) {
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(t);
          }
        });
        this.buildCells(monthDate, byDate);
        this.setData({ loading: false });
      })
      .catch((err) => {
        this.buildCells(monthDate, {});
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  prevMonth() {
    const d = toDate(this.data.monthDate);
    const monthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.setData({
      monthDate,
      monthLabel: formatMonthLabel(monthDate, i18n.getLang()),
    });
    this.loadTasks();
  },

  nextMonth() {
    const d = toDate(this.data.monthDate);
    const monthDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.setData({
      monthDate,
      monthLabel: formatMonthLabel(monthDate, i18n.getLang()),
    });
    this.loadTasks();
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({
      url: `/pages/day/day?date=${date}&class_name=${encodeURIComponent(this.data.className)}`,
    });
  },

  onPickClass() {
    const { classes, className } = this.data;
    if (!classes || classes.length < 2) return;
    const names = classes.map((c) => c.display_name || c.class_code);
    wx.showActionSheet({
      itemList: names,
      success: (res) => {
        const picked = classes[res.tapIndex];
        if (!picked || picked.class_code === className) return;
        const session = auth.getSession();
        auth.setSession(Object.assign({}, session, { className: picked.class_code }));
        this.setData({ className: picked.class_code });
        this.loadTasks();
      },
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
