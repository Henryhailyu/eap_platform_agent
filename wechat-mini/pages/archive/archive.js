const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config');
const { monthKey, pad2, errorMessage } = require('../../utils/format');

Page({
  data: {
    className: config.defaultClass,
    monthDate: new Date(),
    monthLabel: '',
    items: [],
    loading: true,
    error: '',
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    const session = auth.getSession();
    this.setData({
      className: options.class_name || (session && session.className) || config.defaultClass,
    });
    this.updateMonthLabel();
    this.loadArchive();
  },

  updateMonthLabel() {
    const label = this.data.monthDate.toLocaleString('en', { month: 'long', year: 'numeric' });
    this.setData({ monthLabel: label });
  },

  monthParam() {
    const d = this.data.monthDate;
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
    const d = this.data.monthDate;
    this.setData({ monthDate: new Date(d.getFullYear(), d.getMonth() - 1, 1) });
    this.updateMonthLabel();
    this.loadArchive();
  },

  nextMonth() {
    const d = this.data.monthDate;
    this.setData({ monthDate: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
    this.updateMonthLabel();
    this.loadArchive();
  },
});
