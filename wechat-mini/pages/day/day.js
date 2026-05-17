const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    date: '',
    className: '',
    tasks: [],
    loading: true,
    error: '',
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    this.setData({
      date: options.date || '',
      className: options.class_name || '',
    });
    wx.setNavigationBarTitle({ title: options.date || 'Day' });
    this.loadDay();
  },

  loadDay() {
    const { date, className } = this.data;
    this.setData({ loading: true, error: '' });

    api
      .get('/api/tasks', { class_name: className, date })
      .then((tasks) => {
        const list = tasks || [];
        if (!list.length) {
          this.setData({ tasks: [], loading: false });
          return;
        }
        const ids = list.map((t) => t.id).join(',');
        return api
          .get('/api/tasks/my-completions', {
            class_name: className,
            task_ids: ids,
          })
          .then((comp) => {
            const map = comp.completions || {};
            const enriched = list.map((t) => ({
              ...t,
              completion: map[String(t.id)] || { completed: false, status: 'Pending' },
            }));
            this.setData({ tasks: enriched, loading: false });
          });
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  openTask(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/task/task?id=${id}&class_name=${encodeURIComponent(this.data.className)}&date=${this.data.date}`,
    });
  },
});
