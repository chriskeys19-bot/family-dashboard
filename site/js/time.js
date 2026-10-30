/** America/Los_Angeles calendar math. DST-safe wall-clock conversion. */
export const TZ = 'America/Los_Angeles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedParts(value, timeZone = TZ) {
  const date = value instanceof Date ? value : new Date(value);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    weekday: parts.weekday,
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function zonedYMD(value, timeZone = TZ) {
  const { y, m, d } = zonedParts(value, timeZone);
  return { y, m, d };
}

/** Offset such that local = utc + offset. Pacific offsets are negative. */
export function getTimeZoneOffset(date, timeZone = TZ) {
  const parts = zonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.y, parts.m - 1, parts.d, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

/** Wall-clock time in the zone, including the Nov 1, 2026 fallback. */
export function zonedWallTime(y, m, d, hh, mm, timeZone = TZ) {
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let offset = getTimeZoneOffset(new Date(utcGuess), timeZone);
  let instant = new Date(utcGuess - offset);
  for (let i = 0; i < 2; i += 1) {
    const next = getTimeZoneOffset(instant, timeZone);
    if (next === offset) break;
    offset = next;
    instant = new Date(utcGuess - offset);
  }
  return instant;
}

export function zonedMidnight(y, m, d, timeZone = TZ) {
  return zonedWallTime(y, m, d, 0, 0, timeZone);
}

export function zonedDateTimeFromISO(isoDate, hhmm, timeZone = TZ) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return zonedWallTime(y, m, d, hh || 0, mm || 0, timeZone);
}

function shiftYMD(y, m, d, { days = 0, months = 0 }) {
  const dt = new Date(Date.UTC(y, m - 1 + months, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function formatISODate(value, timeZone = TZ) {
  const { y, m, d } = zonedYMD(value, timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function getRange(rangeId, now = new Date()) {
  const { y, m, d } = zonedYMD(now);
  const start = zonedMidnight(y, m, d);
  const delta = rangeId === '1w' ? { days: 7 } : rangeId === '1m' ? { months: 1 } : { days: 3 };
  const endParts = shiftYMD(y, m, d, delta);
  const end = zonedMidnight(endParts.y, endParts.m, endParts.d);
  return { id: rangeId, start, end };
}

export function formatMonthDay(value) {
  const { m, d } = zonedYMD(value);
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatWeekday(value) {
  const parts = zonedParts(value);
  const short = WEEKDAYS_SHORT.includes(parts.weekday) ? parts.weekday : parts.weekday.slice(0, 3);
  return `${short}, ${MONTHS[parts.m - 1]} ${parts.d}`;
}

export function formatLongDate(value) {
  const parts = zonedParts(value);
  const name = WEEKDAYS.find((day) => day.startsWith(parts.weekday)) || parts.weekday;
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][parts.m - 1];
  return `${name}, ${month} ${parts.d}`;
}

export function formatTime(value) {
  const { hour, minute } = zonedParts(value);
  const h12 = hour % 12 || 12;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatRangeLabel(range) {
  const last = new Date(range.end.getTime() - 1);
  const start = formatMonthDay(range.start);
  const end = formatMonthDay(last);
  return start === end ? start : `${start} – ${end}`;
}

export function formatEventWhen(item) {
  if (item.multi_day) return `${formatMonthDay(item.starts_at)} – ${formatMonthDay(item.ends_at)} · Daily`;
  const day = formatWeekday(item.starts_at);
  if (item.all_day) return `${day} · All day`;
  return `${day} · ${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}`;
}

export function inInstantRange(value, range) {
  const time = new Date(value).getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

export function overlapsRange(startsAt, endsAt, range) {
  return new Date(startsAt).getTime() < range.end.getTime() && new Date(endsAt).getTime() > range.start.getTime();
}

export function ymdInRange(isoDate, range) {
  const start = formatISODate(range.start);
  const end = formatISODate(range.end);
  return isoDate >= start && isoDate < end;
}

export function shiftISODate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = shiftYMD(y, m, d, { days });
  return `${next.y}-${String(next.m).padStart(2, '0')}-${String(next.d).padStart(2, '0')}`;
}

export function formatISOWeekday(isoDate) {
  return formatWeekday(`${isoDate}T12:00:00Z`);
}

export function dayBounds(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = shiftYMD(y, m, d, { days: 1 });
  return {
    start: zonedMidnight(y, m, d),
    end: zonedMidnight(next.y, next.m, next.d),
  };
}

/** True when the event interval overlaps the Pacific calendar day. */
export function eventTouchesDay(startsAt, endsAt, isoDate) {
  const { start, end } = dayBounds(isoDate);
  return new Date(startsAt).getTime() < end.getTime() && new Date(endsAt).getTime() > start.getTime();
}
