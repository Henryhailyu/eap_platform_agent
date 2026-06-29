const i18n = require('../../utils/i18n');

const sections = {
  privacy: {
    en: {
      title: 'Privacy Policy',
      updated: 'Effective: 29 June 2026',
      body: [
        'EAP Companion is for enrolled EAP students: calendar, homework, revision, and learning archive.',
        'We collect: school username and class; homework text and files you upload; completion and feedback records; a login token stored on your device.',
        'Data is sent over HTTPS to elc-eap-platform.top (Tencent Cloud, mainland China) for teaching purposes only. We do not sell your data.',
        'Contact your EAP teacher or school administrator for access, correction, or deletion under school procedures.',
        'Full policy (for review): https://elc-eap-platform.top/ui/privacy.html',
      ],
    },
    zh: {
      title: '隐私政策',
      updated: '生效日期：2026年6月29日',
      body: [
        'EAP伴学助手面向在校 EAP 学生，提供学习日历、作业提交、订正与学习档案。',
        '我们收集：学校用户名与班级；您提交的作业文字与主动上传的文件；完成状态与教师反馈；保存在本机的登录令牌。',
        '数据经 HTTPS 传输至 elc-eap-platform.top（腾讯云），仅用于教学，不出售给第三方。',
        '查询、更正或删除记录请联系任课教师或学校管理员。',
        '完整政策（审核用）：https://elc-eap-platform.top/ui/privacy.html',
      ],
    },
  },
  terms: {
    en: {
      title: 'Terms of Service',
      updated: 'Effective: 29 June 2026',
      body: [
        'Accounts are issued by your school. Keep your password private.',
        'Upload only your own work or school-permitted materials. Do not abuse or disrupt the service.',
        'The school may adjust features or suspend access according to teaching needs.',
        'Full terms: https://elc-eap-platform.top/ui/terms.html',
      ],
    },
    zh: {
      title: '用户服务协议',
      updated: '生效日期：2026年6月29日',
      body: [
        '账号由学校分配，请妥善保管密码，不得与他人共享。',
        '仅上传本人作业或学校允许的材料，不得干扰系统正常运行。',
        '学校可因教学安排调整或暂停服务。',
        '完整协议：https://elc-eap-platform.top/ui/terms.html',
      ],
    },
  },
};

Page({
  data: {
    L: i18n.labels(),
    docType: 'privacy',
    title: '',
    updated: '',
    paragraphs: [],
  },

  onLoad(options) {
    const docType = options.type === 'terms' ? 'terms' : 'privacy';
    this.setData({ docType });
    this.renderDoc();
  },

  onShow() {
    this.setData({ L: i18n.labels() });
    this.renderDoc();
  },

  renderDoc() {
    const lang = i18n.getLang();
    const key = lang === 'zh' ? 'zh' : 'en';
    const doc = sections[this.data.docType][key];
    this.setData({
      title: doc.title,
      updated: doc.updated,
      paragraphs: doc.body,
    });
    wx.setNavigationBarTitle({ title: doc.title });
  },

  copyUrl() {
    const path = this.data.docType === 'terms' ? 'terms.html' : 'privacy.html';
    const url = `https://elc-eap-platform.top/ui/${path}`;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: this.data.L.link_copied, icon: 'success' });
      },
    });
  },
});
