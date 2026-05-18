function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * WeChat setData serializes Date → string; always normalize before .getFullYear().
 */
function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return parseYmd(s.slice(0, 10));
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function monthKey(d) {
  const date = toDate(d);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
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
function formatMonthLabel(dateInput, lang) {
  const date = toDate(dateInput);
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
  toDate,
  monthKey,
  parseYmd,
  daysInMonth,
  pad2,
  formatMonthLabel,
  errorMessage,
};
