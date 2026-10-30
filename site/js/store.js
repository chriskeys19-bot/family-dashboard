import { CONFIG, isDemoMode } from './config.js';
import { lookupDemoFoods } from './demo-foods.js';

const SESSION_KEY = 'homeboard.session';
const PROFILE_KEY = 'homeboard.profile';
const OVERLAY_KEY = 'homeboard.demo.v1';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

let seed = null;
let overlay = null;
let session = null;
let boostLists = null;
const listeners = new Set();

function emptyOverlay() {
  return {
    categories: null,
    nutrition_entries: [],
    training_entries: [],
    event_requests: [],
    food_memory: [],
    completions: [],
    reflections: [],
    needs: [],
    notes: [],
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function notifyChange() {
  emit();
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isDemo() {
  return isDemoMode() || Boolean(session?.demo);
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readSession() {
  const parsed = readJson(SESSION_KEY);
  if (!parsed?.exp || parsed.exp < Date.now()) {
    localStorage.removeItem(SESSION_KEY);
    session = null;
    return null;
  }
  if (parsed.demo !== isDemoMode()) {
    localStorage.removeItem(SESSION_KEY);
    session = null;
    return null;
  }
  session = parsed;
  return session;
}

export function readProfile() {
  return localStorage.getItem(PROFILE_KEY);
}

export function writeProfile(id) {
  if (id) localStorage.setItem(PROFILE_KEY, id);
  else localStorage.removeItem(PROFILE_KEY);
}

export function lock() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function getAccessToken() {
  return session?.access_token || null;
}

export async function unlock(password) {
  if (isDemoMode()) {
    if (password !== CONFIG.DEMO_PASSWORD) {
      const error = new Error('wrong_password');
      error.code = 'wrong_password';
      throw error;
    }
    session = { demo: true, exp: Date.now() + SESSION_MS, access_token: null };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/auth-gate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    const error = new Error('network');
    error.code = 'network';
    throw error;
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || 'auth_failed');
    error.code = payload.error || 'auth_failed';
    throw error;
  }
  session = {
    demo: false,
    access_token: payload.access_token,
    exp: (payload.expires_at || 0) * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function ensureDemo() {
  if (!seed) {
    const res = await fetch(new URL('../data/seed.json', import.meta.url), { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load the demo schedule.');
    seed = await res.json();
  }
  if (!overlay) overlay = readJson(OVERLAY_KEY) || emptyOverlay();
  if (!overlay.completions) overlay.completions = [];
  if (!overlay.reflections) overlay.reflections = [];
  if (!overlay.needs) overlay.needs = [];
  if (!overlay.notes) overlay.notes = [];
  if (!boostLists) boostLists = await loadBundledBoost();
}

function persistOverlay() {
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
}

function demoBundle() {
  return {
    people: seed.people,
    categories: (overlay.categories || seed.categories).map((row) => ({ ...row })),
    events: seed.events.map((row) => ({ ...row, people: [...row.people] })),
    nutrition_entries: overlay.nutrition_entries.map((row) => ({ ...row })),
    training_entries: overlay.training_entries.map((row) => ({ ...row })),
    event_requests: overlay.event_requests.map((row) => ({ ...row })),
    food_memory: overlay.food_memory.map((row) => ({ ...row })),
    completions: (overlay.completions || []).map((row) => ({ ...row })),
    reflections: (overlay.reflections || []).map((row) => ({ ...row, focus: [...(row.focus || [])] })),
    needs: (overlay.needs || []).map((row) => ({ ...row })),
    notes: (overlay.notes || []).map((row) => ({ ...row })),
    boostLists,
  };
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  else if (method !== 'GET' && method !== 'HEAD') headers.Prefer = 'return=representation';
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text || res.statusText);
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function loadBundle() {
  if (isDemoMode()) {
    await ensureDemo();
    return demoBundle();
  }
  const [people, categories, events, nutrition, training, requests, memory, completions, reflections, needs, notes, boostLists] = await Promise.all([
    rest('people?select=*&order=sort_order.asc'),
    rest('categories?select=*&order=sort_order.asc'),
    rest('events?select=*&order=starts_at.asc'),
    rest('nutrition_entries?select=*&order=eaten_at.asc'),
    rest('training_entries?select=*&order=trained_on.desc,created_at.desc'),
    rest('event_requests?select=*&order=starts_at.asc'),
    rest('food_memory?select=*'),
    rest('completions?select=*'),
    rest('session_reflections?select=*'),
    rest('kid_needs?select=*&order=created_at.desc'),
    rest('kid_notes?select=*&order=created_at.desc'),
    loadLiveBoostLists(),
  ]);
  return {
    people,
    categories,
    events,
    nutrition_entries: nutrition,
    training_entries: training,
    event_requests: requests,
    food_memory: memory,
    completions,
    reflections,
    needs,
    notes,
    boostLists,
  };
}

async function loadBundledBoost() {
  const res = await fetch(new URL('../data/boost.json', import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the daily boost bank.');
  const json = await res.json();
  return json.lists;
}

async function loadLiveBoostLists() {
  try {
    const rows = await rest('daily_content?select=list_key,body,attribution,sort_order&order=sort_order.asc');
    if (rows?.length) {
      const lists = {};
      for (const row of rows) {
        if (!lists[row.list_key]) lists[row.list_key] = [];
        lists[row.list_key].push({ text: row.body, attribution: row.attribution || '' });
      }
      return lists;
    }
  } catch {
    // Table may not be imported yet. The bundled bank still runs the page.
  }
  return loadBundledBoost();
}

function knownPerson(personId) {
  if (!seed?.people?.some((person) => person.id === personId)) {
    throw new Error('Unknown person');
  }
}

export async function saveCategory(category, { create = false, silent = false } = {}) {
  if (isDemoMode()) {
    await ensureDemo();
    const list = (overlay.categories || seed.categories).map((row) => ({ ...row }));
    const index = list.findIndex((row) => row.id === category.id);
    if (index >= 0) list[index] = { ...list[index], ...category };
    else list.push(category);
    list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    overlay.categories = list;
    persistOverlay();
    if (!silent) emit();
    return category;
  }
  if (create) {
    const rows = await rest('categories', { method: 'POST', body: category });
    if (!silent) emit();
    return rows[0];
  }
  const rows = await rest(`categories?id=eq.${encodeURIComponent(category.id)}`, {
    method: 'PATCH',
    body: category,
  });
  if (!silent) emit();
  return rows[0];
}

export async function addRequest(row) {
  const record = { ...row, id: row.id || newId(), status: 'requested', category_id: row.category_id || 'social' };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    overlay.event_requests.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('event_requests', { method: 'POST', body: record });
  emit();
  return rows[0];
}

export async function addNutrition(row) {
  const record = {
    photo_path: null,
    is_estimate: true,
    items: [],
    note: null,
    ...row,
    id: row.id || newId(),
  };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    overlay.nutrition_entries.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('nutrition_entries', { method: 'POST', body: record });
  emit();
  return rows[0];
}

export async function addTraining(row) {
  const record = { ...row, id: row.id || newId(), note: row.note || null };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    overlay.training_entries.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('training_entries', { method: 'POST', body: record });
  emit();
  return rows[0];
}

export async function rememberFoods(personId, picks) {
  if (!picks?.length) return;
  if (isDemoMode()) {
    await ensureDemo();
    for (const pick of picks) {
      const row = { person_id: personId, ...pick };
      const index = overlay.food_memory.findIndex((item) => item.person_id === personId && item.query_norm === pick.query_norm);
      if (index >= 0) overlay.food_memory[index] = row;
      else overlay.food_memory.push(row);
    }
    persistOverlay();
    return;
  }
  await rest('food_memory?on_conflict=person_id,query_norm', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: picks.map((pick) => ({ person_id: personId, ...pick })),
  });
}

export async function lookupFoods(query, personId) {
  if (isDemoMode()) {
    await ensureDemo();
    const memory = overlay.food_memory.filter((row) => row.person_id === personId);
    return lookupDemoFoods(query, memory);
  }
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/fdc-lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ query, person_id: personId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || 'lookup_failed');
    error.code = payload.error || 'lookup_failed';
    throw error;
  }
  return payload;
}

export async function toggleCompletion({ personId, itemType, itemId, occurrenceOn, done, silent = false }) {
  let saved = null;
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(personId);
    const index = overlay.completions.findIndex((row) => row.person_id === personId
      && row.item_type === itemType
      && row.item_id === itemId
      && row.occurrence_on === occurrenceOn);
    if (done) {
      saved = {
        id: index >= 0 ? overlay.completions[index].id : newId(),
        person_id: personId,
        item_type: itemType,
        item_id: itemId,
        occurrence_on: occurrenceOn,
        completed_at: new Date().toISOString(),
      };
      if (index >= 0) overlay.completions[index] = saved;
      else overlay.completions.push(saved);
    } else if (index >= 0) {
      overlay.completions.splice(index, 1);
    }
    persistOverlay();
    if (!silent) emit();
    return saved;
  }
  if (done) {
    const rows = await rest('completions?on_conflict=person_id,item_type,item_id,occurrence_on', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: {
        person_id: personId,
        item_type: itemType,
        item_id: itemId,
        occurrence_on: occurrenceOn,
        completed_at: new Date().toISOString(),
      },
    });
    saved = rows?.[0] || null;
    if (!silent) emit();
    return saved;
  }
  {
    const query = [
      `person_id=eq.${encodeURIComponent(personId)}`,
      `item_type=eq.${encodeURIComponent(itemType)}`,
      `item_id=eq.${encodeURIComponent(itemId)}`,
      `occurrence_on=eq.${encodeURIComponent(occurrenceOn)}`,
    ].join('&');
    await rest(`completions?${query}`, { method: 'DELETE' });
  }
  if (!silent) emit();
  return saved;
}

export async function saveReflection(row) {
  const record = {
    ...row,
    id: row.id || newId(),
    focus: row.focus || [],
  };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    const index = overlay.reflections.findIndex((item) => item.person_id === record.person_id
      && item.event_id === record.event_id
      && item.occurrence_on === record.occurrence_on);
    if (index >= 0) overlay.reflections[index] = { ...overlay.reflections[index], ...record, id: overlay.reflections[index].id };
    else overlay.reflections.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('session_reflections?on_conflict=person_id,event_id,occurrence_on', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: record,
  });
  emit();
  return rows[0];
}

export async function addNeed(row) {
  const now = new Date().toISOString();
  const record = {
    ...row,
    id: row.id || newId(),
    status: row.status || 'open',
    urgency: row.urgency || 'normal',
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
  };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    overlay.needs.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('kid_needs', { method: 'POST', body: record });
  emit();
  return rows[0];
}

export async function updateNeed(id, patch) {
  const updated_at = new Date().toISOString();
  if (isDemoMode()) {
    await ensureDemo();
    const index = overlay.needs.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('That request is gone.');
    overlay.needs[index] = { ...overlay.needs[index], ...patch, updated_at };
    persistOverlay();
    emit();
    return overlay.needs[index];
  }
  const rows = await rest(`kid_needs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...patch, updated_at },
  });
  emit();
  return rows[0];
}

export async function updateNote(id, patch) {
  if (isDemoMode()) {
    await ensureDemo();
    const index = overlay.notes.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('That note is gone.');
    overlay.notes[index] = { ...overlay.notes[index], ...patch };
    persistOverlay();
    emit();
    return overlay.notes[index];
  }
  const rows = await rest(`kid_notes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
  emit();
  return rows[0];
}

export async function addNote(row) {
  const record = {
    ...row,
    id: row.id || newId(),
    created_at: row.created_at || new Date().toISOString(),
  };
  if (isDemoMode()) {
    await ensureDemo();
    knownPerson(record.person_id);
    overlay.notes.push(record);
    persistOverlay();
    emit();
    return record;
  }
  const rows = await rest('kid_notes', { method: 'POST', body: record });
  emit();
  return rows[0];
}

export function saveFailureMessage() {
  return 'Couldn’t save that. Your session may have expired — re-enter the password and try again.';
}

export function gateMessage(code) {
  if (code === 'wrong_password') return 'That password doesn’t match.';
  if (code === 'missing_secret') return 'The sign-in service is missing DASHBOARD_PASSWORD or JWT_SECRET.';
  if (code === 'network') return 'Couldn’t reach the sign-in service.';
  return 'Couldn’t sign in. Try again in a moment.';
}
