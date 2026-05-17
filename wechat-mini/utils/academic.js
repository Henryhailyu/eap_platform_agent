function teachingWeekIndex(semesterStart, teachingWeeks, isoDateStr) {
  if (!semesterStart || !isoDateStr) return null;
  const start = new Date(`${semesterStart}T12:00:00`);
  const d = new Date(`${isoDateStr}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(d.getTime())) return null;
  const diffDays = Math.floor((d - start) / (24 * 60 * 60 * 1000));
  const weekIdx = Math.floor(diffDays / 7) + 1;
  const max = Number(teachingWeeks) || 16;
  if (weekIdx < 1 || weekIdx > max) return null;
  return weekIdx;
}

function notableLabel(notableDates, isoDateStr) {
  if (!notableDates || !isoDateStr) return '';
  return notableDates[isoDateStr] || '';
}

module.exports = {
  teachingWeekIndex,
  notableLabel,
};
