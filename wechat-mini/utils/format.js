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
  errorMessage,
};
