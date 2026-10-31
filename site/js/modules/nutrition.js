import { checkoffStack } from '../checkoff.js';
import { analyzeMealPhoto, hydrateMealPhoto, rememberDemoPhoto, resizeImageFile, sumPhotoItems } from '../photo-meal.js';
import { isDemoMode } from '../config.js';
import { lookupFoods, rememberFoods, addNutrition, newId } from '../store.js';
import { registerModule } from '../registry.js';
import { chooseKid } from '../kids.js';
import { openSheet, closeSheet } from '../sheet.js';
import { el, field } from '../dom.js';
import { MEAL_LABELS } from '../labels.js';
import { itemSlug } from '../food-parse.js';
import { defaultPortionMode, portionModesFor, scaleNutrients, sumNutrients } from '../portions.js';
import { listPhotoNutritionSources } from '../nutrition-photo.js';
import { formatISODate, formatTime, formatWeekday, inInstantRange, shiftISODate, zonedDateTimeFromISO } from '../time.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

function weekCard(ctx, person) {
  const today = formatISODate(ctx.now);
  const days = [];
  for (let ago = 6; ago >= 0; ago -= 1) {
    const iso = shiftISODate(today, -ago);
    const meals = (ctx.nutrition || []).filter((row) => row.person_id === person.id
      && formatISODate(row.eaten_at) === iso
      && row.source !== 'note'
      && row.calories != null);
    days.push({ iso, ...sumNutrients(meals) });
  }
  const earlier = days.slice(0, 3).reduce((sum, day) => sum + day.calories, 0);
  const recent = days.slice(4).reduce((sum, day) => sum + day.calories, 0);
  let trend = 'About the same as earlier this week';
  if (earlier === 0 && recent === 0) trend = 'No estimates yet this week';
  else if (recent > earlier * 1.15) trend = 'Higher than earlier this week';
  else if (earlier > 0 && recent < earlier * 0.85) trend = 'Lower than earlier this week';
  const todayTotals = days[days.length - 1];
  return el('article', { class: 'card', 'data-testid': `nutrition-week-${person.id}` },
    el('p', { class: 'log-kicker' }, person.name),
    el('p', { 'data-testid': `today-totals-${person.id}` }, `Today · approximate · ${Math.round(todayTotals.calories)} kcal · ${todayTotals.protein_g} g protein`),
    el('p', { class: 'log-meta', 'data-testid': `week-trend-${person.id}` }, trend),
    el('p', { class: 'week-days' }, days.map((day) => `${day.iso.slice(5)} ~${Math.round(day.calories)}`).join(' · ')));
}

function peopleInScope(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile.id];
  if (ctx.focusPersonId) return [ctx.focusPersonId];
  return ctx.people.filter((person) => pHasFood(ctx, person.id) || person.role === 'kid').map((person) => person.id);
}

function pHasFood(ctx, id) {
  return ctx.nutrition.some((row) => row.person_id === id);
}

function basisLabel(match) {
  if (match.basis === '100g') return '100 g';
  if (match.basis === 'piece') return 'piece';
  if (match.basis === 'cup') return 'cup';
  return 'serving';
}

function macroLine(totals) {
  return `Approximate estimates · ${Math.round(totals.calories)} kcal · ${totals.protein_g} g protein`;
}

function openNutritionForm(ctx, kid) {
  const state = {
    meal: '',
    query: '',
    time: '',
    lookup: null,
    picks: new Map(),
  };

  openSheet({
    title: 'Log food',
    render(body) {
      paintEntry(body);
    },
  });

  function hostBody() {
    return document.querySelector('[data-testid="sheet"] .sheet-body');
  }

  function paintEntry(body) {
    const query = el('input', {
      type: 'text',
      autocomplete: 'off',
      maxlength: '200',
      placeholder: '2 rotis and dal',
      value: state.query,
      'data-testid': 'food-query',
    });
    const time = el('input', { type: 'time', step: '60', value: state.time });
    query.addEventListener('input', () => { state.query = query.value; });
    time.addEventListener('input', () => { state.time = time.value; });
    const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
    const meals = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'Meal' });
    for (const meal of MEALS) {
      meals.append(el('button', {
        type: 'button',
        class: `btn choice${state.meal === meal ? ' is-on' : ''}`,
        'aria-pressed': state.meal === meal ? 'true' : 'false',
        'data-meal': meal,
        onclick: () => {
          state.meal = meal;
          paintEntry(hostBody());
        },
      }, MEAL_LABELS[meal]));
    }
    const form = el('form', {
      class: 'stack',
      'data-photo-sources': String(listPhotoNutritionSources().length),
      onsubmit: async (event) => {
        event.preventDefault();
        state.query = query.value;
        state.time = time.value;
        await runLookup(error);
      },
    });
    form.append(
      el('p', { class: 'lede' }, `${kid.name} · type a meal or snap a photo. Numbers are estimates.`),
      field('What did you eat?', query),
      el('div', { class: 'field' }, el('span', { class: 'field-label', id: 'meal-label' }, 'Meal'), meals),
      field('Time', time, 'Optional. Blank uses now.'),
      error,
      el('button', { type: 'submit', class: 'btn primary block', 'data-testid': 'lookup-foods' }, 'Look up foods'),
      snapControl(error),
      el('button', {
        type: 'button',
        class: 'btn secondary block',
        'data-testid': 'save-note',
        onclick: async () => {
          state.query = query.value;
          state.time = time.value;
          if (!state.query.trim() || !state.meal) {
            error.hidden = false;
            error.textContent = 'Add what was eaten and pick a meal.';
            return;
          }
          await saveNote(error);
        },
      }, 'Save as a note'),
    );
    const sources = listPhotoNutritionSources();
    for (const source of sources) {
      form.append(el('button', {
        type: 'button',
        class: 'btn ghost block',
        'data-testid': `photo-source-${source.id}`,
        onclick: () => runPhoto(source, error),
      }, source.label || 'Photo'));
    }
    body.replaceChildren(form);
    query.focus();
  }

  function snapControl(error) {
    const input = el('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      class: 'snap-input',
      'data-testid': 'snap-input',
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) onSnap(file, error);
    });
    return el('label', { class: 'btn secondary block', 'data-testid': 'snap-meal' }, 'Snap meal', input);
  }

  async function onSnap(file, error) {
    error.hidden = true;
    error.textContent = 'Reading the photo…';
    error.hidden = false;
    try {
      const blob = await resizeImageFile(file);
      const estimate = await analyzeMealPhoto(blob, kid.id);
      state.photo = {
        blob,
        path: estimate.path || '',
        estimate: {
          ...estimate,
          items: (estimate.items || []).map((item) => ({
            name: item.name || item.label || 'Food',
            portion: item.portion || '',
            calories: Number(item.calories) || 0,
            protein_g: Number(item.protein_g) || 0,
            carbs_g: Number(item.carbs_g) || 0,
            fat_g: Number(item.fat_g) || 0,
          })),
        },
      };
      Object.assign(state.photo.estimate, sumPhotoItems(state.photo.estimate.items));
      error.hidden = true;
      paintPhotoReview();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Could not estimate that photo.';
    }
  }

  function paintPhotoReview() {
    const body = hostBody();
    if (!body || !state.photo) return;
    const estimate = state.photo.estimate;
    const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
    const totals = el('p', { class: 'macro-calories', 'data-testid': 'photo-totals' }, '');
    const meals = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'Meal' });
    for (const meal of MEALS) {
      meals.append(el('button', {
        type: 'button',
        class: `btn choice${state.meal === meal ? ' is-on' : ''}`,
        'aria-pressed': state.meal === meal ? 'true' : 'false',
        onclick: () => {
          state.meal = meal;
          paintPhotoReview();
        },
      }, MEAL_LABELS[meal]));
    }
    const refreshTotals = () => {
      const summed = sumPhotoItems(estimate.items);
      Object.assign(estimate, summed);
      totals.textContent = `Estimates · ${Math.round(summed.calories)} kcal · P ${summed.protein_g} g · C ${summed.carbs_g} g · F ${summed.fat_g} g`;
    };
    const stack = el('div', { class: 'stack', 'data-testid': 'photo-review' });
    stack.append(
      el('p', { class: 'estimate-banner', 'data-testid': 'estimate-banner' }, 'Approximate estimates, not lab values.'),
      el('p', { class: 'log-meta', 'data-testid': 'photo-confidence' }, `Confidence ${estimate.confidence || 'medium'} · estimate`),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Meal'), meals),
    );
    estimate.items.forEach((item, index) => {
      const name = el('input', { type: 'text', value: item.name, 'aria-label': `Food ${index + 1}` });
      const portion = el('input', { type: 'text', value: item.portion, 'aria-label': `Portion ${index + 1}` });
      const calories = el('input', { type: 'text', inputmode: 'decimal', value: String(item.calories), 'data-testid': `photo-calories-${index}`, 'aria-label': `Calories ${index + 1}` });
      const protein = el('input', { type: 'text', inputmode: 'decimal', value: String(item.protein_g), 'aria-label': `Protein ${index + 1}` });
      const carbs = el('input', { type: 'text', inputmode: 'decimal', value: String(item.carbs_g), 'aria-label': `Carbs ${index + 1}` });
      const fat = el('input', { type: 'text', inputmode: 'decimal', value: String(item.fat_g), 'aria-label': `Fat ${index + 1}` });
      const bind = (input, key, numeric) => {
        input.addEventListener('input', () => {
          item[key] = numeric ? Number(input.value) : input.value;
          refreshTotals();
        });
      };
      bind(name, 'name', false);
      bind(portion, 'portion', false);
      bind(calories, 'calories', true);
      bind(protein, 'protein_g', true);
      bind(carbs, 'carbs_g', true);
      bind(fat, 'fat_g', true);
      stack.append(el('div', { class: 'photo-edit', 'data-testid': `photo-item-${index}` },
        field('Food', name),
        field('Portion', portion),
        field('Calories', calories),
        el('div', { class: 'time-pair' }, field('Protein g', protein), field('Carbs g', carbs)),
        field('Fat g', fat)));
    });
    stack.append(
      totals,
      error,
      el('button', {
        type: 'button',
        class: 'btn primary block',
        'data-testid': 'save-photo-meal',
        onclick: () => savePhoto(error),
      }, 'Save'),
      el('button', { type: 'button', class: 'btn ghost block', onclick: () => paintEntry(hostBody()) }, 'Back'),
    );
    refreshTotals();
    body.replaceChildren(stack);
  }

  async function savePhoto(error) {
    error.hidden = true;
    if (!state.meal) {
      error.hidden = false;
      error.textContent = 'Pick a meal.';
      return;
    }
    const estimate = state.photo.estimate;
    const summed = sumPhotoItems(estimate.items);
    const id = newId();
    const photoPath = state.photo.path || `demo/${id}`;
    if (isDemoMode()) rememberDemoPhoto(photoPath, state.photo.blob);
    try {
      await addNutrition(entryFrom({
        id,
        description: estimate.description || estimate.items.map((item) => item.name).filter(Boolean).join(', '),
        items: estimate.items,
        calories: summed.calories,
        protein_g: summed.protein_g,
        carbs_g: summed.carbs_g,
        fat_g: summed.fat_g,
        source: 'photo',
        photo_path: photoPath,
        note: `Photo estimate · confidence ${estimate.confidence || 'medium'}`,
      }));
      closeSheet();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Could not save that photo meal.';
    }
  }

  async function saveNote(error) {
    try {
      await addNutrition(entryFrom({
        description: state.query.trim(),
        items: [],
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        source: 'note',
        note: 'Saved without a macro estimate.',
      }));
      closeSheet();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Could not save that note.';
    }
  }

  function eatenAt() {
    if (!state.time) return ctx.now;
    return zonedDateTimeFromISO(formatISODate(ctx.now), state.time);
  }

  function entryFrom(extra) {
    return {
      person_id: kid.id,
      eaten_at: eatenAt().toISOString(),
      meal: state.meal,
      is_estimate: true,
      photo_path: null,
      ...extra,
    };
  }

  async function runLookup(error) {
    error.hidden = true;
    if (!state.query.trim() || !state.meal) {
      error.hidden = false;
      error.textContent = 'Add what was eaten and pick a meal.';
      return;
    }
    try {
      state.lookup = await lookupFoods(state.query.trim(), kid.id);
      if (!state.lookup.items?.length) {
        error.hidden = false;
        error.textContent = 'Could not read that. Try “2 rotis and dal”, or save as a note.';
        return;
      }
      state.picks = new Map();
      for (const item of state.lookup.items || []) {
        const match = item.matches?.[0];
        if (!match) continue;
        state.picks.set(item.query_norm, {
          match,
          mode: defaultPortionMode(match),
          qty: item.qty || 1,
          grams: 100,
        });
      }
      paintPicks();
    } catch {
      error.hidden = false;
      error.textContent = 'Lookup is unavailable. Save as a note, or try again.';
    }
  }

  function paintPicks() {
    const body = hostBody();
    if (!body) return;
    const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
    const stack = el('div', { class: 'stack' });
    stack.append(el('p', { class: 'lede' }, 'Pick the closest match for each food. These are estimates.'));
    for (const item of state.lookup.items || []) {
      const slug = itemSlug(item.query_norm);
      const block = el('section', { class: 'food-item', 'data-testid': `item-${slug}` });
      block.append(el('h3', { class: 'food-query' }, `${item.qty > 1 ? `${item.qty} ` : ''}${item.query}`));
      const pick = state.picks.get(item.query_norm);
      for (const match of item.matches || []) {
        const on = pick?.match?.fdc_id === match.fdc_id;
        block.append(el('button', {
          type: 'button',
          class: `match${on ? ' is-on' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          'data-testid': `match-${slug}-${match.fdc_id}`,
          'data-fdc-id': match.fdc_id,
          'data-remembered': match.remembered ? 'true' : 'false',
          onclick: () => {
            state.picks.set(item.query_norm, {
              match,
              mode: pick?.mode || defaultPortionMode(match),
              qty: pick?.qty || item.qty || 1,
              grams: pick?.grams || 100,
            });
            paintPicks();
          },
        }, el('span', { class: 'match-label' }, match.remembered ? `${match.label} · Your usual` : match.label),
          el('span', { class: 'match-meta' }, `~${match.calories} kcal · ${match.protein_g} g protein / ${basisLabel(match)} · approximate`)));
      }
      const current = state.picks.get(item.query_norm);
      const portions = el('div', { class: 'choice-row', role: 'group', 'aria-label': `Portion for ${item.query}` });
      for (const mode of portionModesFor(current?.match)) {
        portions.append(el('button', {
          type: 'button',
          class: `btn choice${current?.mode === mode.id ? ' is-on' : ''}`,
          'aria-pressed': current?.mode === mode.id ? 'true' : 'false',
          'data-testid': `portion-${slug}-${mode.id}`,
          onclick: () => {
            const next = state.picks.get(item.query_norm);
            if (!next) return;
            next.mode = mode.id;
            state.picks.set(item.query_norm, next);
            paintPicks();
          },
        }, mode.label));
      }
      block.append(portions);
      if (current?.mode === 'grams') {
        const grams = el('input', {
          type: 'text',
          inputmode: 'decimal',
          value: String(current.grams ?? 100),
          'data-testid': `grams-${slug}`,
          'aria-label': `Grams for ${item.query}`,
        });
        grams.addEventListener('input', () => {
          const next = state.picks.get(item.query_norm);
          next.grams = Number(grams.value);
          state.picks.set(item.query_norm, next);
        });
        block.append(field('Grams', grams));
      } else if (current) {
        const qty = el('input', {
          type: 'text',
          inputmode: 'decimal',
          value: String(current.qty ?? item.qty ?? 1),
          'data-testid': `qty-${slug}`,
          'aria-label': `Quantity for ${item.query}`,
        });
        qty.addEventListener('input', () => {
          const next = state.picks.get(item.query_norm);
          next.qty = Number(qty.value);
          state.picks.set(item.query_norm, next);
        });
        block.append(field('Quantity', qty));
      }
      stack.append(block);
    }
    stack.append(
      error,
      el('button', {
        type: 'button',
        class: 'btn primary block',
        'data-testid': 'confirm-estimates',
        onclick: () => paintConfirm(error),
      }, 'Confirm estimates'),
      el('button', { type: 'button', class: 'btn ghost block', onclick: () => paintEntry(hostBody()) }, 'Back'),
    );
    body.replaceChildren(stack);
  }

  function scaledRows() {
    const rows = [];
    for (const item of state.lookup.items || []) {
      const pick = state.picks.get(item.query_norm);
      if (!pick?.match) continue;
      const scaled = scaleNutrients(pick.match, pick);
      rows.push({
        query: item.query,
        query_norm: item.query_norm,
        qty: pick.qty,
        portion: pick.mode,
        grams: pick.mode === 'grams' ? pick.grams : null,
        fdc_id: pick.match.fdc_id,
        label: pick.match.label,
        basis: pick.match.basis,
        basis_grams: pick.match.basis_grams,
        piece_grams: pick.match.piece_grams ?? null,
        ...scaled,
        catalog: {
          calories: pick.match.calories,
          protein_g: pick.match.protein_g,
          carbs_g: pick.match.carbs_g,
          fat_g: pick.match.fat_g,
        },
      });
    }
    return rows;
  }

  function paintConfirm(previousError) {
    if (previousError) previousError.hidden = true;
    const rows = scaledRows();
    if (!rows.length) {
      if (previousError) {
        previousError.hidden = false;
        previousError.textContent = 'Pick a match for each food.';
      }
      return;
    }
    const totals = sumNutrients(rows);
    const body = hostBody();
    const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
    const list = el('ul', { class: 'confirm-list' });
    for (const row of rows) {
      list.append(el('li', {}, `${row.qty} × ${row.label} · ~${row.calories} kcal · ${row.protein_g} g protein · approximate`));
    }
    body.replaceChildren(el('div', { class: 'stack' },
      el('p', { class: 'estimate-banner', 'data-testid': 'estimate-banner' }, 'Approximate estimates, not lab values.'),
      el('p', { class: 'macro-calories', 'data-testid': 'macro-calories' }, `${totals.calories} kcal`),
      el('p', { class: 'macro-split' }, `P ${totals.protein_g} g · C ${totals.carbs_g} g · F ${totals.fat_g} g`),
      list,
      error,
      el('button', {
        type: 'button',
        class: 'btn primary block',
        'data-testid': 'save-meal',
        onclick: () => saveEstimate(rows, totals, error),
      }, 'Save meal'),
      el('button', { type: 'button', class: 'btn ghost block', onclick: () => paintPicks() }, 'Back')));
  }

  async function saveEstimate(rows, totals, error) {
    try {
      await rememberFoods(kid.id, rows.map((row) => ({
        query_norm: row.query_norm,
        fdc_id: row.fdc_id,
        label: row.label,
        calories: row.catalog.calories,
        protein_g: row.catalog.protein_g,
        carbs_g: row.catalog.carbs_g,
        fat_g: row.catalog.fat_g,
        basis: row.basis,
        basis_grams: row.basis_grams,
        piece_grams: row.piece_grams,
      })));
      await addNutrition(entryFrom({
        description: state.query.trim(),
        items: rows.map(({ catalog, ...row }) => row),
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        source: 'fdc',
        note: null,
      }));
      closeSheet();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Could not save that meal.';
    }
  }

  async function runPhoto(source, error) {
    if (!state.meal) {
      error.hidden = false;
      error.textContent = 'Pick a meal first.';
      return;
    }
    try {
      const estimate = await source.estimate({ personId: kid.id, meal: state.meal });
      await addNutrition(entryFrom({
        description: estimate.description,
        items: estimate.items || [],
        calories: estimate.calories,
        protein_g: estimate.protein_g,
        carbs_g: estimate.carbs_g,
        fat_g: estimate.fat_g,
        source: 'photo',
        note: estimate.note || 'Estimate from a photo.',
        photo_path: estimate.photo_path || null,
      }));
      closeSheet();
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message || 'Photo estimate failed.';
    }
  }
}

registerModule({
  id: 'nutrition',
  label: 'Nutrition',
  dataTable: 'nutrition_entries',
  placement: 'day',
  sortOrder: 20,
  renderEntryForm(ctx) {
    return el('button', {
      type: 'button',
      class: 'btn primary',
      'data-testid': 'add-nutrition',
      onclick: () => chooseKid(ctx, (kid) => openNutritionForm(ctx, kid)),
    }, 'Log food');
  },
  render(ctx, host) {
    const ids = new Set(peopleInScope(ctx));
    const kids = ctx.people.filter((person) => person.role === 'kid' && ids.has(person.id));
    if (kids.length) {
      const weeks = el('div', { class: 'stack', 'data-testid': 'nutrition-weeks' });
      for (const kid of kids) weeks.append(weekCard(ctx, kid));
      host.append(weeks);
    }
    const rows = ctx.nutrition
      .filter((row) => ids.has(row.person_id))
      .filter((row) => inInstantRange(row.eaten_at, ctx.range))
      .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
    if (!rows.length) {
      host.append(el('p', { class: 'empty' }, 'No meals logged in this range.'));
      return;
    }
    const byDay = new Map();
    for (const row of rows) {
      const key = formatISODate(row.eaten_at);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(row);
    }
    for (const [day, entries] of byDay) {
      const section = el('section', { class: 'day-block', 'data-testid': `nutrition-day-${day}` });
      const estimated = entries.filter((row) => row.source !== 'note' && row.calories != null);
      section.append(el('h3', { class: 'day-title' }, formatWeekday(entries[0].eaten_at)));
      if (estimated.length) {
        section.append(el('p', { class: 'day-totals', 'data-testid': `day-totals-${day}` }, macroLine(sumNutrients(estimated))));
      }
      for (const entry of entries) {
        const person = ctx.people.find((item) => item.id === entry.person_id);
        const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
        const who = showName ? `${person?.name || entry.person_id} · ` : '';
        const kcal = entry.source === 'note' || entry.calories == null
          ? 'No macro estimate'
          : `~${Math.round(Number(entry.calories))} kcal · ${Number(entry.protein_g) || 0} g protein · approximate`;
        const card = el('article', {
          class: 'card log-card',
          'data-testid': `nutrition-${entry.id}`,
          'data-source': entry.source,
          'data-person': entry.person_id,
        },
        el('p', { class: 'log-kicker' }, `${who}${MEAL_LABELS[entry.meal] || entry.meal} · ${formatTime(entry.eaten_at)}`),
        el('h3', { class: 'log-title' }, entry.description),
        el('p', { class: 'log-meta' }, kcal));
        if (entry.source === 'photo') {
          if (entry.photo_path) {
            const img = el('img', {
              class: 'meal-thumb',
              alt: 'Meal photo, estimate',
              'data-testid': `meal-photo-${entry.id}`,
            });
            hydrateMealPhoto(img, entry.photo_path);
            card.append(img);
          }
          if (entry.items?.length) {
            const list = el('ul', { class: 'photo-breakdown', 'data-testid': `photo-breakdown-${entry.id}` });
            for (const item of entry.items) {
              const name = item.name || item.label || 'Food';
              list.append(el('li', {}, `${name} · ${item.portion || 'portion'} · ${Math.round(Number(item.calories) || 0)} kcal · estimate`));
            }
            card.append(list);
          }
        }
        const boxes = checkoffStack(ctx, [{
          personId: entry.person_id,
          itemType: 'nutrition',
          itemId: entry.id,
          occurrenceOn: formatISODate(entry.eaten_at),
          label: entry.description,
        }]);
        if (boxes) card.append(boxes);
        section.append(card);
      }
      host.append(section);
    }
  },
});
