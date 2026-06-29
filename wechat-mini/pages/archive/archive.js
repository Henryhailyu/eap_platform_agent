const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const i18n = require('../../utils/i18n');
const { pad2, toDate, formatMonthLabel, errorMessage } = require('../../utils/format');

function currentMonthAnchor() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

Page({
  data: {
    L: i18n.labels(),
    className: config.defaultClass,
    monthDate: currentMonthAnchor(),
    monthLabel: '',
    items: [],
    loading: true,
    error: '',
  },

  onShow() {
    const L = i18n.labels();
    this.setData({ L });
    wx.setNavigationBarTitle({ title: L.archive });
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    const session = auth.getSession();
    const anchor = options.month
      ? `${options.month}-01`
      : currentMonthAnchor();
    this.setData({
      className: options.class_name || (session && session.className) || config.defaultClass,
      monthDate: anchor,
      monthLabel: formatMonthLabel(anchor, i18n.getLang()),
    });
    this.loadArchive();
  },

  monthParam() {
    const d = toDate(this.data.monthDate);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  },

  loadArchive() {
    const { className } = this.data;
    this.setData({ loading: true, error: '' });
    api
      .get('/api/student/learning-archive', {
        class_name: className,
        month: this.monthParam(),
      })
      .then((res) => {
        this.setData({
          items: res.items || [],
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  prevMonth() {
    const d = toDate(this.data.monthDate);
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const anchor = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-01`;
    this.setData({
      monthDate: anchor,
      monthLabel: formatMonthLabel(anchor, i18n.getLang()),
    });
    this.loadArchive();
  },

  nextMonth() {
    const d = toDate(this.data.monthDate);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const anchor = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`;
    this.setData({
      monthDate: anchor,
      monthLabel: formatMonthLabel(anchor, i18n.getLang()),
    });
    this.loadArchive();
  },

  openItem(e) {
    const taskId = e.currentTarget.dataset.id;
    const date = e.currentTarget.dataset.date || '';
    if (!taskId) return;
    wx.navigateTo({
      url: `/pages/task/task?id=${taskId}&class_name=${encodeURIComponent(this.data.className)}&date=${date}`,
    });
  },
});
