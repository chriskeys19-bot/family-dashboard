const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function feetInchesToCm(feet, inches) {
  const ft = Number(feet);
  const inch = Number(inches);
  if (!Number.isFinite(ft) || !Number.isFinite(inch)) return null;
  const total = ft * 12 + inch;
  if (total <= 0) return null;
  return Math.round(total * 2.54 * 10) / 10;
}

export function formatHeight(cm) {
  const inchesTotal = Math.round(Number(cm) / 2.54);
  if (!Number.isFinite(inchesTotal) || inchesTotal <= 0) return '';
  const feet = Math.floor(inchesTotal / 12);
  const inches = inchesTotal % 12;
  return `${feet} ft ${inches} in`;
}

export function formatMeasuredOn(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function hasMeasurementThisMonth(rows, personId, iso) {
  const month = String(iso || '').slice(0, 7);
  if (!month) return false;
  return (rows || []).some((row) => row.person_id === personId && String(row.measured_on || '').startsWith(month));
}

export function latestMeasurement(rows, personId) {
  const mine = (rows || []).filter((row) => row.person_id === personId && row.measured_on);
  mine.sort((a, b) => String(b.measured_on).localeCompare(String(a.measured_on))
    || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return mine[0] || null;
}
