const api = require('../../utils/api');
const auth = require('../../utils/auth');
const i18n = require('../../utils/i18n');
const files = require('../../utils/files');
const { errorMessage } = require('../../utils/format');

function needsRevision(submission, completion) {
  if (!submission) return false;
  if (submission.teacher_feedback && String(submission.teacher_feedback).trim()) {
    return true;
  }
  const subSt = String(submission.status || '').toLowerCase();
  const compSt = String((completion && completion.status) || '').toLowerCase();
  if (subSt.includes('revision needed') || compSt.includes('revision needed')) return true;
  if (subSt.includes('revision') && !subSt.includes('revision submitted')) return true;
  return false;
}

Page({
  data: {
    L: i18n.labels(),
    taskId: null,
    className: '',
    date: '',
    task: null,
    completion: { completed: false, status: 'Pending' },
    submission: null,
    showRevision: false,
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

  onShow() {
    this.setData({ L: i18n.labels() });
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    this.setData({
      taskId: Number(options.id),
      className: options.class_name || '',
      date: options.date || '',
    });
    this.loadTask();
  },

  onPullDownRefresh() {
    this.loadTask(true);
  },

  applyTaskState(task, completion, submission) {
    this.setData({
      task,
      completion: completion || { completed: false, status: 'Pending' },
      submission: submission || null,
      showRevision: needsRevision(submission, completion),
      loading: false,
    });
    wx.setNavigationBarTitle({ title: task.title || i18n.t('task_detail') });
  },

  loadTask(fromPull) {
    const { taskId, className, L } = this.data;
    if (!fromPull) {
      this.setData({ loading: true, error: '' });
    }

    Promise.all([
      api.get('/api/tasks', { class_name: className }).then((list) =>
        (list || []).find((t) => t.id === taskId)
      ),
      api.get(`/api/tasks/${taskId}/my-completion`, { class_name: className }),
      api.get(`/api/tasks/${taskId}/my-submission`, { class_name: className }),
    ])
      .then(([task, completion, submission]) => {
        if (!task) {
          this.setData({ loading: false, error: L.task_not_found });
          return;
        }
        this.applyTaskState(task, completion, submission);
      })
      .catch((err) => {
        this.setData({ loading: false, error: errorMessage(err) });
      })
      .finally(() => {
        if (fromPull) wx.stopPullDownRefresh();
      });
  },

  openMaterial() {
    const task = this.data.task;
    const fp = task && (task.file_path || task.file_name);
    if (fp) files.downloadAndOpen(fp, true);
  },

  openSubmissionFile() {
    const sub = this.data.submission;
    const fp = sub && (sub.file_path || sub.file_name);
    if (fp) files.downloadAndOpen(fp, false);
  },

  openRevisionFile() {
    const sub = this.data.submission;
    const fp = sub && (sub.revision_file_path || sub.revision_file_name);
    if (fp) files.downloadAndOpen(fp, false);
  },

  toggleComplete() {
    const { taskId, className, completion, L } = this.data;
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
        wx.showToast({ title: L.updated, icon: 'success' });
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

  clearFile() {
    this.setData({ filePath: '', fileName: '' });
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

  clearRevisionFile() {
    this.setData({ revisionFilePath: '', revisionFileName: '' });
  },

  onSubmit() {
    const { taskId, className, answerText, filePath, submitting, L } = this.data;
    if (submitting) return;
    const text = (answerText || '').trim();
    if (!text && !filePath) {
      wx.showToast({ title: L.add_text_or_file, icon: 'none' });
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
        this.setData({
          submission: sub,
          showRevision: needsRevision(sub, this.data.completion),
          answerText: '',
          filePath: '',
          fileName: '',
        });
        wx.showToast({ title: L.submitted, icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  onRevision() {
    const { submission, className, revisionText, revisionFilePath, submitting, L } = this.data;
    if (!submission || submitting) return;
    const text = (revisionText || '').trim();
    if (!text && !revisionFilePath) {
      wx.showToast({ title: L.add_text_or_file, icon: 'none' });
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
          showRevision: needsRevision(sub, this.data.completion),
          revisionText: '',
          revisionFilePath: '',
          revisionFileName: '',
        });
        wx.showToast({ title: L.revision_sent, icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },
});
