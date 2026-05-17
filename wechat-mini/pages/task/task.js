const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { errorMessage } = require('../../utils/format');

Page({
  data: {
    taskId: null,
    className: '',
    task: null,
    completion: { completed: false, status: 'Pending' },
    submission: null,
    answerText: '',
    filePath: '',
    fileName: '',
    revisionText: '',
    revisionFilePath: '',
    revisionFileName: '',
    loading: true,
    submitting: false,
    error: '',
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    this.setData({
      taskId: Number(options.id),
      className: options.class_name || '',
    });
    this.loadTask();
  },

  onShow() {
    if (this.data.taskId) this.loadTask();
  },

  loadTask() {
    const { taskId, className } = this.data;
    this.setData({ loading: true, error: '' });

    Promise.all([
      api.get('/api/tasks', { class_name: className }).then((list) =>
        (list || []).find((t) => t.id === taskId)
      ),
      api.get(`/api/tasks/${taskId}/my-completion`, { class_name: className }),
      api.get(`/api/tasks/${taskId}/my-submission`, { class_name: className }),
    ])
      .then(([task, completion, submission]) => {
        if (!task) {
          this.setData({ loading: false, error: 'Task not found' });
          return;
        }
        this.setData({
          task,
          completion: completion || { completed: false, status: 'Pending' },
          submission: submission || null,
          loading: false,
        });
        wx.setNavigationBarTitle({ title: task.title || 'Task' });
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      });
  },

  toggleComplete() {
    const { taskId, className, completion } = this.data;
    const next = completion.completed ? 'Pending' : 'Completed';
    api
      .put(`/api/tasks/${taskId}/my-completion`, {
        class_name: className,
        status: next,
      })
      .then((res) => {
        this.setData({
          completion: {
            completed: res.completed,
            status: res.status,
          },
        });
        wx.showToast({ title: 'Updated', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      });
  },

  onAnswer(e) {
    this.setData({ answerText: e.detail.value });
  },

  onRevision(e) {
    this.setData({ revisionText: e.detail.value });
  },

  pickFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles[0];
        this.setData({ filePath: f.path, fileName: f.name });
      },
    });
  },

  pickRevisionFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles[0];
        this.setData({ revisionFilePath: f.path, revisionFileName: f.name });
      },
    });
  },

  onSubmit() {
    const { taskId, className, answerText, filePath, submitting } = this.data;
    if (submitting) return;
    const text = (answerText || '').trim();
    if (!text && !filePath) {
      wx.showToast({ title: 'Add text or a file', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const session = auth.getSession();
    api
      .uploadSubmission(
        taskId,
        {
          class_name: className,
          answer_text: text,
          student_name: (session.user && session.user.full_name) || '',
        },
        filePath
      )
      .then((sub) => {
        this.setData({ submission: sub, answerText: '', filePath: '', fileName: '' });
        wx.showToast({ title: 'Submitted', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  onRevision() {
    const { submission, className, revisionText, revisionFilePath, submitting } = this.data;
    if (!submission || submitting) return;
    const text = (revisionText || '').trim();
    if (!text && !revisionFilePath) {
      wx.showToast({ title: 'Add text or a file', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api
      .uploadRevision(
        submission.id,
        {
          class_name: className,
          revision_text: text,
        },
        revisionFilePath
      )
      .then((sub) => {
        this.setData({
          submission: sub,
          revisionText: '',
          revisionFilePath: '',
          revisionFileName: '',
        });
        wx.showToast({ title: 'Revision sent', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },
});
