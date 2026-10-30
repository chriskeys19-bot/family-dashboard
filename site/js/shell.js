import { renderFamilyBanner, resetFamilyBanner } from './banner.js';
import { el } from './dom.js';
import { listModules } from './registry.js';
import { bindKeyboardInset, closeSheet } from './sheet.js';
import {
  gateMessage,
  isDemo,
  loadBundle,
  lock,
  readProfile,
  readSession,
  subscribe,
  unlock,
  writeProfile,
  saveCategory,
  addRequest,
  addNutrition,
  addTraining,
  lookupFoods,
  rememberFoods,
} from './store.js';
import { formatLongDate, formatRangeLabel, getRange } from './time.js';
import { CONFIG } from './config.js';

const RANGES = [
  { id: '3d', label: '3 days' },
  { id: '1w', label: 'Week' },
  { id: '1m', label: 'Month' },
];

let bundle = null;
let profileId = null;
let rangeId = '3d';
let tab = 'all';

function appRoot() {
  return document.getElementById('app');
}

function mount(node) {
  const keep = document.querySelector('[data-sheet="keep"]');
  if (!keep) closeSheet();
  appRoot().replaceChildren(node);
}

function profile() {
  return bundle?.people?.find((person) => person.id === profileId) || null;
}

function focusPersonId() {
  const current = profile();
  if (!current) return null;
  if (current.role === 'kid') return current.id;
  return tab === 'all' ? null : tab;
}

function buildCtx() {
  const now = new Date();
  return {
    mode: isDemo() ? 'demo' : 'live',
    profile: profile(),
    focusPersonId: focusPersonId(),
    people: bundle.people,
    categories: bundle.categories,
    events: bundle.events,
    nutrition: bundle.nutrition_entries,
    training: bundle.training_entries,
    requests: bundle.event_requests,
    completions: bundle.completions || [],
    reflections: bundle.reflections || [],
    needs: bundle.needs || [],
    notes: bundle.notes || [],
    boostLists: bundle.boostLists,
    now,
    range: getRange(rangeId, now),
    store: { saveCategory, addRequest, addNutrition, addTraining, lookupFoods, rememberFoods },
  };
}

function renderGate(message = '') {
  const error = el('p', {
    class: 'form-error',
    'data-testid': 'gate-error',
    role: 'alert',
    hidden: !message,
  }, message);
  const input = el('input', {
    type: 'password',
    autocomplete: 'current-password',
    name: 'password',
    'aria-label': 'Password',
  });
  const submit = el('button', { type: 'submit', class: 'btn primary block' }, 'Continue');
  const form = el('form', {
    class: 'stack',
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Checking…';
      try {
        await unlock(input.value);
        bundle = await loadBundle();
        profileId = null;
        tab = 'all';
        renderPicker();
      } catch (err) {
        error.hidden = false;
        error.textContent = gateMessage(err.code);
        submit.disabled = false;
        submit.textContent = 'Continue';
      }
    },
  });
  form.append(
    fieldBlock(input),
    error,
    submit,
  );
  const screen = el('main', { class: 'gate' },
    el('p', { class: 'eyebrow' }, 'Family'),
    el('h1', { class: 'display' }, 'Home Board'),
    el('p', { class: 'lede' }, 'Ben, Sangeetha, Yuvan, and Varun. One shared password, then pick who is looking.'),
    form,
  );
  if (isDemo()) {
    screen.append(el('p', { class: 'demo-hint', 'data-testid': 'demo-hint' }, `Demo mode. Password is ${CONFIG.DEMO_PASSWORD}. Writes stay in this browser.`));
  }
  mount(screen);
  input.focus();
}

function fieldBlock(input) {
  const id = 'gate-password';
  input.id = id;
  return el('div', { class: 'field' },
    el('label', { for: id }, 'Password'),
    input);
}

function renderPicker() {
  const list = el('div', { class: 'profile-list', 'data-testid': 'profile-picker' });
  for (const person of bundle.people) {
    list.append(el('button', {
      type: 'button',
      class: 'profile-card',
      'data-testid': `profile-${person.id}`,
      onclick: () => {
        profileId = person.id;
        writeProfile(person.id);
        tab = 'all';
        renderDashboard();
      },
    },
    el('span', { class: `avatar lg person-${person.id}` }, person.name.slice(0, 1)),
    el('span', {},
      el('span', { class: 'profile-name' }, person.name),
      el('span', { class: 'profile-role' }, person.role === 'parent' ? 'Parent' : 'Kid'))));
  }
  mount(el('main', { class: 'gate' },
    el('p', { class: 'eyebrow' }, 'Home Board'),
    el('h1', { class: 'display' }, 'Who’s looking?'),
    el('p', { class: 'lede' }, 'Parents see the whole family. Each kid sees only their own days.'),
    list,
    el('button', {
      type: 'button',
      class: 'btn ghost block',
      'data-testid': 'lock',
      onclick: () => {
        resetFamilyBanner();
        lock();
        bundle = null;
        profileId = null;
        renderGate();
      },
    }, 'Lock')));
}

function renderDashboard() {
  const ctx = buildCtx();
  const current = ctx.profile;
  const kids = ctx.people.filter((person) => person.role === 'kid');
  const header = el('header', { class: 'topbar' },
    el('div', { class: 'topbar-row' },
      el('div', {},
        el('p', { class: 'eyebrow' }, 'Home Board'),
        el('h1', { class: 'who' }, current.name)),
      el('div', { class: 'top-actions' },
        el('button', { type: 'button', class: 'btn ghost', 'data-testid': 'switch-profile', onclick: () => renderPicker() }, 'Switch'),
        el('button', {
          type: 'button',
          class: 'btn ghost',
          'data-testid': 'lock',
          onclick: () => {
            resetFamilyBanner();
            lock();
            bundle = null;
            profileId = null;
            renderGate();
          },
        }, 'Lock'))),
    el('p', { class: 'today' }, formatLongDate(ctx.now)));

  const ranges = el('div', { class: 'segment', role: 'group', 'aria-label': 'Time range' });
  for (const range of RANGES) {
    ranges.append(el('button', {
      type: 'button',
      class: range.id === rangeId ? 'is-on' : '',
      'aria-pressed': range.id === rangeId ? 'true' : 'false',
      'data-testid': `range-${range.id}`,
      onclick: () => {
        rangeId = range.id;
        renderDashboard();
      },
    }, range.label));
  }

  const scope = current.role === 'kid'
    ? `Only ${current.name}`
    : ctx.focusPersonId
      ? (ctx.people.find((person) => person.id === ctx.focusPersonId)?.name || '')
      : 'Whole family';

  const screen = el('div', { class: 'dashboard', 'data-testid': 'dashboard' });
  screen.append(header, renderFamilyBanner(), ranges, el('p', { class: 'range-label', 'data-testid': 'range-label' }, formatRangeLabel(ctx.range)));
  screen.append(el('p', { class: 'scope-note', 'data-testid': 'scope-note' }, scope));

  if (current.role === 'parent') {
    const tabs = el('div', { class: 'segment tabs', role: 'group', 'aria-label': 'Who', 'data-testid': 'person-tabs' });
    const options = [{ id: 'all', label: 'Family' }, ...kids.map((kid) => ({ id: kid.id, label: kid.name }))];
    for (const option of options) {
      const on = (option.id === 'all' && tab === 'all') || option.id === tab;
      tabs.append(el('button', {
        type: 'button',
        class: on ? 'is-on' : '',
        'aria-pressed': on ? 'true' : 'false',
        'data-testid': `tab-${option.id}`,
        onclick: () => {
          tab = option.id;
          renderDashboard();
        },
      }, option.label));
    }
    screen.append(tabs);
  }

  const modules = el('div', { class: 'modules' });
  for (const mod of listModules()) {
    const section = el('section', {
      class: 'module',
      'data-module': mod.id,
      'data-table': mod.dataTable,
      'data-testid': `module-${mod.id}`,
    });
    section.append(el('h2', { class: 'module-title' }, mod.label));
    const body = el('div', { class: 'module-body' });
    mod.render(ctx, body);
    section.append(body);
    modules.append(section);
  }
  screen.append(modules);

  const actions = el('div', { class: 'action-bar', 'data-testid': 'action-bar' });
  for (const mod of listModules()) {
    const node = mod.renderEntryForm(ctx);
    if (node) actions.append(node);
  }
  if (actions.childElementCount) screen.append(actions);

  screen.append(el('p', {
    class: 'mode-banner',
    'data-testid': 'mode-banner',
  }, ctx.mode === 'demo' ? 'Demo · this browser only' : 'Connected'));

  mount(screen);
}

let refreshToken = 0;

async function refresh() {
  const token = ++refreshToken;
  const data = await loadBundle();
  if (token !== refreshToken) return;
  bundle = data;
  if (!profile()) {
    renderPicker();
    return;
  }
  renderDashboard();
}

export function boot() {
  bindKeyboardInset();
  subscribe(() => {
    if (document.querySelector('[data-testid="dashboard"]')) {
      refresh().catch((error) => {
        const note = document.querySelector('[data-testid="mode-banner"]');
        if (note) note.textContent = error.message || 'Could not refresh.';
      });
    }
  });
  const session = readSession();
  if (!session) {
    renderGate();
    return;
  }
  loadBundle().then((data) => {
    bundle = data;
    profileId = readProfile();
    if (!profile()) renderPicker();
    else renderDashboard();
  }).catch((error) => {
    renderGate(error.message || 'Could not load the board.');
  });
}
