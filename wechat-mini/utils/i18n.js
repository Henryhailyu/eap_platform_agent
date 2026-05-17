const STORAGE_KEY = 'eap_lang';

const en = {
  lang_toggle: '中文',
  app_name: 'EAP Learning',
  sign_in: 'Sign in',
  student_sign_in: 'Student sign in',
  username: 'Username',
  password: 'Password',
  login_enter_both: 'Enter username and password',
  config_api_base: 'Set apiBase in config.js first',
  signing_in: 'Signing in…',
  calendar: 'Calendar',
  archive: 'Archive',
  logout: 'Log out',
  loading_tasks: 'Loading tasks…',
  retry: 'Retry',
  no_tasks_day: 'No tasks on this day.',
  pending: 'Pending',
  completed: 'Done',
  completion: 'Completion',
  mark_completed: 'Mark completed',
  mark_pending: 'Mark pending',
  your_submission: 'Your submission',
  submit_homework: 'Submit homework',
  answer_placeholder: 'Answer text',
  choose_file: 'Choose file (optional)',
  submit: 'Submit',
  revision: 'Revision',
  revision_placeholder: 'Revision text',
  send_revision: 'Send revision',
  add_text_or_file: 'Add text or a file',
  submitted: 'Submitted',
  revision_sent: 'Revision sent',
  updated: 'Updated',
  feedback: 'Feedback',
  open_material: 'Open material',
  open_file: 'Open file',
  loading: 'Loading…',
  task_not_found: 'Task not found',
  loading_archive: 'Loading archive…',
  archive_empty: 'No items for this month.',
  pick_class: 'Switch class',
  teaching_week: 'Week {n}',
  holiday: 'Holiday',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const zh = {
  lang_toggle: 'EN',
  app_name: 'EAP 学习',
  sign_in: '登录',
  student_sign_in: '学生登录',
  username: '用户名',
  password: '密码',
  login_enter_both: '请输入用户名和密码',
  config_api_base: '请先在 config.js 设置 apiBase',
  signing_in: '登录中…',
  calendar: '日历',
  archive: '学习档案',
  logout: '退出',
  loading_tasks: '加载任务中…',
  retry: '重试',
  no_tasks_day: '本日暂无任务。',
  pending: '待完成',
  completed: '已完成',
  completion: '完成状态',
  mark_completed: '标记已完成',
  mark_pending: '标记待完成',
  your_submission: '我的提交',
  submit_homework: '提交作业',
  answer_placeholder: '作答内容',
  choose_file: '选择文件（可选）',
  submit: '提交',
  revision: '订正',
  revision_placeholder: '订正内容',
  send_revision: '提交订正',
  add_text_or_file: '请填写文字或选择文件',
  submitted: '已提交',
  revision_sent: '订正已提交',
  updated: '已更新',
  feedback: '教师反馈',
  open_material: '打开资料',
  open_file: '打开文件',
  loading: '加载中…',
  task_not_found: '未找到任务',
  loading_archive: '加载档案中…',
  archive_empty: '本月暂无记录。',
  pick_class: '切换班级',
  teaching_week: '第 {n} 周',
  holiday: '假期',
  weekdays: ['日', '一', '二', '三', '四', '五', '六'],
};

function getLang() {
  try {
    const l = wx.getStorageSync(STORAGE_KEY);
    return l === 'zh' ? 'zh' : 'en';
  } catch (e) {
    return 'en';
  }
}

function setLang(lang) {
  wx.setStorageSync(STORAGE_KEY, lang === 'zh' ? 'zh' : 'en');
}

function toggleLang() {
  setLang(getLang() === 'en' ? 'zh' : 'en');
}

function strings() {
  return getLang() === 'zh' ? zh : en;
}

function t(key, vars) {
  let s = strings()[key] || en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
    });
  }
  return s;
}

/** Merge i18n labels into page data object */
function labels(extra) {
  return Object.assign({}, strings(), extra || {});
}

module.exports = {
  getLang,
  setLang,
  toggleLang,
  t,
  labels,
  strings,
};
