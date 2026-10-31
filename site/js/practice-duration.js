export const PRACTICE_DURATIONS = [
  [30, '30 min'],
  [60, '1 hr'],
  [90, '1.5 hr'],
  [120, '2 hr'],
  [150, '2.5 hr'],
  [180, '3 hr+'],
];

export function scheduledMinutes(startsAt, endsAt) {
  if (!startsAt || !endsAt) return null;
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1 || minutes > 24 * 60) return null;
  return minutes;
}

export function formatPracticeDuration(minutes) {
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n) || n <= 0) return '';
  const preset = PRACTICE_DURATIONS.find(([value]) => value === n);
  if (preset) return preset[1];
  if (n % 60 === 0) return `${n / 60} hr`;
  return `${n} min`;
}

export function practiceMentions(reflections) {
  return (reflections || [])
    .filter((row) => row.kind !== 'game' && Number(row.duration_minutes) > 0)
    .map((row) => `Practiced ${formatPracticeDuration(row.duration_minutes)}.`);
}
