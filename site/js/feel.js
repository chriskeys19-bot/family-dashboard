import { el } from './dom.js';

export const FEELS = [
  { value: 1, emoji: '😣', label: 'Tough' },
  { value: 2, emoji: '😕', label: 'Rough' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

export function feelMeta(value) {
  return FEELS.find((item) => item.value === Number(value)) || null;
}

export function feelPhrase(value) {
  const meta = feelMeta(value);
  return meta ? `Felt ${meta.label}` : '';
}

export function feelPicker({ selected, onPick, testPrefix = 'feel' }) {
  const row = el('div', { class: 'feel-row', role: 'group', 'aria-label': 'How did it feel?' });
  for (const face of FEELS) {
    const on = Number(selected) === face.value;
    row.append(el('button', {
      type: 'button',
      class: `feel-btn${on ? ' is-on' : ''}`,
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': face.label,
      'data-testid': `${testPrefix}-${face.value}`,
      'data-feel': String(face.value),
      onclick: () => onPick(face.value),
    }, el('span', { class: 'feel-emoji', 'aria-hidden': 'true' }, face.emoji), el('span', { class: 'feel-word' }, face.label)));
  }
  return row;
}

export function formatPace(distanceM, durationSeconds, unit = 'm') {
  const meters = Number(distanceM);
  const seconds = Number(durationSeconds);
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return '';
  const per = unit === 'mi' ? seconds / (meters / 1609.344) : seconds / (meters / 400);
  const rounded = Math.round(per);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  const clock = `${minutes}:${String(secs).padStart(2, '0')}`;
  return unit === 'mi' ? `${clock} /mi` : `${clock} /400m`;
}
