function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseYmd(ymd) {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ZH = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

/** WeChat JS runtime may throw on toLocaleString(locale, options) — use this instead. */
function formatMonthLabel(date, lang) {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (lang === 'zh') {
    return `${y}年${MONTHS_ZH[m]}`;
  }
  return `${MONTHS_EN[m]} ${y}`;
}

function errorMessage(err) {
  if (!err) return 'Request failed';
  if (typeof err === 'string') return err;
  if (err.error) return err.error;
  if (err.message) return err.message;
  return 'Request failed';
}

module.exports = {
  todayYmd,
  monthKey,
  parseYmd,
  daysInMonth,
  pad2,
  formatMonthLabel,
  errorMessage,
};
