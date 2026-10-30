import { el } from './dom.js';

let current = null;
let scrim = null;

export function closeSheet() {
  current?.remove();
  scrim?.remove();
  current = null;
  scrim = null;
  document.body.classList.remove('sheet-open');
}

export function openSheet({ title, render, testid = 'sheet', placement = 'full' }) {
  closeSheet();
  document.body.classList.add('sheet-open');
  const root = el('div', {
    class: placement === 'bottom' ? 'sheet sheet-bottom' : 'sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
    'data-testid': testid,
    'data-sheet': placement === 'bottom' ? 'keep' : 'replace',
  });
  if (placement === 'bottom') {
    scrim = el('div', { class: 'sheet-scrim', 'data-testid': 'reflection-scrim', onclick: closeSheet });
    document.body.append(scrim);
  }
  const body = el('div', { class: 'sheet-body' });
  root.append(
    el('div', { class: 'sheet-bar' },
      el('h2', { class: 'sheet-title' }, title),
      el('button', { type: 'button', class: 'btn ghost', 'data-testid': 'sheet-close', onclick: closeSheet }, 'Close')),
    body,
  );
  document.body.append(root);
  current = root;
  render(body);
  const first = root.querySelector('input, textarea, select');
  (first || root.querySelector('button'))?.focus();
  return root;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

export function bindKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const apply = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
  };
  viewport.addEventListener('resize', apply);
  viewport.addEventListener('scroll', apply);
  apply();
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('input, textarea, select')) return;
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 80);
  });
}
