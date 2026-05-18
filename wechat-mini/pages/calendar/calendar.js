const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const i18n = require('../../utils/i18n');
const academic = require('../../utils/academic');
const {
  monthKey,
  todayYmd,
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
    this.setData({
      L,
      weekdays: i18n.strings().weekdays,
      className: session.className || config.defaultClass,
      classes: session.classes || [],
      userName: (session.user && session.user.full_name) || session.user.username || '',
    });
    wx.setNavigationBarTitle({ title: L.calendar });
    this.loadAcademicAndTasks();
  },

  onToggleLang() {
    i18n.toggleLang();
    const L = i18n.labels();
    this.setData({ L, weekdays: i18n.strings().weekdays });
    this.buildCells(this.data.monthDate, this.data.tasksByDate);
  },

  loadAcademicAndTasks() {
    api
      .get('/api/academic-calendar')
      .then((cal) => {
        this.setData({ academicCal: cal });
        this.loadTasks();
      })
      .catch(() => {
        this.loadTasks();
      });
  },

  buildCells(monthDate, tasksByDate) {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const dim = daysInMonth(y, m);
    const cells = [];
    const today = todayYmd();
    const cal = this.data.academicCal;
    const L = this.data.L;

    for (let i = 0; i < startPad; i++) {
      cells.push({ day: '', date: '', inMonth: false, count: 0 });
    }
    for (let d = 1; d <= dim; d++) {
      const date = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const holidayLabel = cal ? academic.notableLabel(cal.notable_dates, date) : '';
      cells.push({
        day: d,
        date,
        inMonth: true,
        isToday: date === today,
        isHoliday: !!holidayLabel,
        holidayLabel,
        count: (tasksByDate[date] || []).length,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: '', date: '', inMonth: false, count: 0 });
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

    const monthLabel = formatMonthLabel(monthDate, i18n.getLang());
    this.setData({ cells, monthLabel, monthDate, tasksByDate, weekHint });
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
        try {
          this.buildCells(monthDate, byDate);
          this.setData({ loading: false });
        } catch (e) {
          this.setData({
            loading: false,
            error: (e && e.message) || 'Could not render calendar',
          });
        }
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  prevMonth() {
    const d = this.data.monthDate;
    this.setData({ monthDate: new Date(d.getFullYear(), d.getMonth() - 1, 1) });
    this.loadTasks();
  },

  nextMonth() {
    const d = this.data.monthDate;
    this.setData({ monthDate: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
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
