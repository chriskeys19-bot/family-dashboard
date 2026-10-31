import { el, field } from '../dom.js';
import { closeSheet, openSheet } from '../sheet.js';
import { saveWeight } from '../store.js';
import { formatISODate, formatISOWeekday } from '../time.js';
import { registerModule } from '../registry.js';
import { kgToLb, lbToKg, previousWeek, summarizeFamily, summarizeWeek, weekRange } from '../week.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso) {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${formatISOWeekday(iso).slice(0, 3)} ${MONTHS[month - 1]} ${day}`;
}

function kidsInScope(ctx) {
  const kids = ctx.people.filter((person) => person.role === 'kid');
  if (ctx.profile.role === 'kid') return kids.filter((person) => person.id === ctx.profile.id);
  if (ctx.focusPersonId) return kids.filter((person) => person.id === ctx.focusPersonId);
  return kids;
}

function summaryFor(ctx, person, range) {
  return summarizeWeek({
    person,
    events: ctx.events,
    completions: ctx.completions,
    reflections: ctx.reflections,
    training: ctx.training,
    nutrition: ctx.nutrition,
    range,
  });
}

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function pretty(n) {
  const value = Number(n) || 0;
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return (Math.round(value * 10) / 10).toFixed(1);
}

function deltaOf(now, last) {
  const diff = Math.round((Number(now) - Number(last)) * 10) / 10;
  if (Math.abs(diff) < 0.05) return { dir: 'flat', text: '– 0 vs last week' };
  const arrow = diff > 0 ? '▲' : '▼';
  return { dir: diff > 0 ? 'up' : 'down', text: `${arrow} ${pretty(Math.abs(diff))} vs last week` };
}

function ringRatio(now, last) {
  const peak = Math.max(Number(now) || 0, Number(last) || 0);
  if (peak <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(now) || 0) / peak));
}

function progressRing(ratio) {
  const radius = 15;
  const turn = 2 * Math.PI * radius;
  const filled = turn * Math.max(0, Math.min(1, ratio));
  const nodes = [
    svg('circle', { cx: 20, cy: 20, r: radius, fill: 'none', stroke: '#e0d3c0', 'stroke-width': 4 }),
  ];
  if (filled > 1) {
    nodes.push(svg('circle', {
      cx: 20,
      cy: 20,
      r: radius,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 4,
      'stroke-linecap': 'round',
      'stroke-dasharray': `${filled.toFixed(2)} ${turn.toFixed(2)}`,
      transform: 'rotate(-90 20 20)',
    }));
  }
  return svg('svg', { class: 'week-ring', viewBox: '0 0 40 40', 'aria-hidden': 'true' }, nodes);
}

function statTile({ testid, value, label, now, last, approx = false }) {
  const delta = deltaOf(now, last);
  return el('div', { class: `week-tile is-${delta.dir}`, 'data-testid': testid },
    el('div', { class: 'week-tile-top' },
      el('p', { class: 'week-num' }, approx ? `~${pretty(value)}` : pretty(value)),
      progressRing(ringRatio(now, last))),
    el('p', { class: 'week-label' }, label),
    approx ? el('p', { class: 'week-approx' }, 'approx') : null,
    el('p', { class: `week-delta is-${delta.dir}` }, delta.text));
}

function legend(items) {
  const row = el('p', { class: 'week-legend' });
  for (const item of items) {
    row.append(el('span', {}, el('i', { style: `background:${item.color}` }), item.label));
  }
  return row;
}

function activityChart(days) {
  const width = 320;
  const height = 118;
  const padBottom = 18;
  const padTop = 6;
  const inner = height - padBottom - padTop;
  const gap = 8;
  const barWidth = (width - gap * 6) / 7;
  const max = Math.max(1, ...days.map((day) => day.cricket + day.run + day.gym));
  const chart = svg('svg', {
    class: 'week-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Cricket, running, and gym by day, Sunday through Saturday',
  });
  chart.append(svg('line', { x1: 0, y1: padTop + inner, x2: width, y2: padTop + inner, stroke: '#e0d3c0', 'stroke-width': 1 }));
  days.forEach((day, index) => {
    const x = index * (barWidth + gap);
    let y = padTop + inner;
    for (const [minutes, color] of [[day.cricket, '#1c5c3b'], [day.run, '#8a6a1f'], [day.gym, '#b85a2a']]) {
      const bar = (minutes / max) * inner;
      y -= bar;
      if (bar > 0.5) chart.append(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: barWidth.toFixed(1), height: bar.toFixed(1), rx: 3, fill: color }));
    }
    chart.append(svg('text', {
      x: (x + barWidth / 2).toFixed(1),
      y: height - 3,
      'text-anchor': 'middle',
      fill: '#5e564c',
      'font-size': 11,
      'font-family': 'Outfit, sans-serif',
    }, day.label));
  });
  return chart;
}

function calorieChart(days) {
  const width = 320;
  const height = 118;
  const padBottom = 18;
  const padTop = 6;
  const inner = height - padBottom - padTop;
  const group = width / 7;
  const barWidth = 8;
  const max = Math.max(1, ...days.flatMap((day) => [day.eaten, day.burned]));
  const chart = svg('svg', {
    class: 'week-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Calories eaten and burned by day, Sunday through Saturday',
  });
  chart.append(svg('line', { x1: 0, y1: padTop + inner, x2: width, y2: padTop + inner, stroke: '#e0d3c0', 'stroke-width': 1 }));
  days.forEach((day, index) => {
    const center = index * group + group / 2;
    for (const [value, color, shift] of [[day.eaten, '#b85a2a', -9], [day.burned, '#1c5c3b', 1]]) {
      const bar = (value / max) * inner;
      chart.append(svg('rect', {
        x: (center + shift).toFixed(1),
        y: (padTop + inner - bar).toFixed(1),
        width: barWidth,
        height: Math.max(bar, value > 0 ? 2 : 0).toFixed(1),
        rx: 2,
        fill: color,
      }));
    }
    chart.append(svg('text', {
      x: center.toFixed(1),
      y: height - 3,
      'text-anchor': 'middle',
      fill: '#5e564c',
      'font-size': 11,
      'font-family': 'Outfit, sans-serif',
    }, day.label));
  });
  return chart;
}

function counterCard(summary, last, { family = false } = {}) {
  const id = family ? 'family' : summary.person_id;
  const days = summary.days || [];
  return el('article', { class: `card week-card${family ? ' is-wide' : ''}`, 'data-testid': `week-${id}` },
    el('div', { class: 'week-head' },
      el('p', { class: 'week-name' }, family ? 'Both boys' : summary.name),
      family ? null : el('p', { class: 'log-meta', 'data-testid': `week-weight-${id}` }, `${summary.weight_lb} lb`)),
    el('div', { class: 'week-tiles' },
      statTile({ testid: `week-cricket-${id}`, value: summary.cricket_hours, label: 'Cricket hours', now: summary.cricket_hours, last: last.cricket_hours }),
      statTile({ testid: `week-run-${id}`, value: summary.miles_run, label: 'Miles run', now: summary.miles_run, last: last.miles_run }),
      statTile({ testid: `week-gym-${id}`, value: summary.gym_sessions, label: 'Gym sessions', now: summary.gym_sessions, last: last.gym_sessions }),
      statTile({ testid: `week-eaten-${id}`, value: summary.calories_eaten, label: 'Calories eaten', now: summary.calories_eaten, last: last.calories_eaten, approx: true }),
      statTile({ testid: `week-protein-${id}`, value: summary.protein_g, label: 'Protein g', now: summary.protein_g, last: last.protein_g }),
      statTile({ testid: `week-burned-${id}`, value: summary.calories_burned, label: 'Calories burned', now: summary.calories_burned, last: last.calories_burned, approx: true })),
    el('div', { class: 'week-chart-block', 'data-testid': `week-activity-${id}` },
      el('p', { class: 'week-chart-title' }, 'Sun–Sat activity'),
      legend([
        { color: '#1c5c3b', label: 'Cricket' },
        { color: '#8a6a1f', label: 'Run' },
        { color: '#b85a2a', label: 'Gym' },
      ]),
      activityChart(days)),
    el('div', { class: 'week-chart-block', 'data-testid': `week-calories-${id}` },
      el('p', { class: 'week-chart-title' }, 'Calories, approx'),
      legend([
        { color: '#b85a2a', label: 'Eaten' },
        { color: '#1c5c3b', label: 'Burned' },
      ]),
      calorieChart(days)));
}

function openWeights(ctx) {
  const kids = ctx.people.filter((person) => person.role === 'kid');
  openSheet({
    title: 'Body weight',
    render(body) {
      const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
      const inputs = new Map();
      const stack = el('div', { class: 'stack' });
      stack.append(el('p', { class: 'lede' }, 'Used to estimate calories burned. Approximate.'));
      for (const kid of kids) {
        const input = el('input', {
          type: 'text',
          inputmode: 'decimal',
          value: String(kgToLb(kid.weight_kg)),
          'data-testid': `weight-${kid.id}`,
          'aria-label': `${kid.name} weight in pounds`,
        });
        inputs.set(kid.id, input);
        stack.append(field(`${kid.name} (lb)`, input));
      }
      stack.append(error, el('button', {
        type: 'button',
        class: 'btn primary block',
        'data-testid': 'save-weights',
        onclick: async () => {
          error.hidden = true;
          try {
            for (const kid of kids) {
              const lb = Number(inputs.get(kid.id).value);
              if (!Number.isFinite(lb) || lb < 30 || lb > 250) {
                throw new Error('Enter a weight between 30 and 250 lb.');
              }
              await saveWeight(kid.id, lbToKg(lb));
            }
            closeSheet();
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message || 'Could not save weights.';
          }
        },
      }, 'Save'));
      body.replaceChildren(stack);
    },
  });
}

registerModule({
  id: 'week',
  label: 'This week',
  dataTable: 'person_settings',
  placement: 'day',
  sortOrder: 0,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const today = formatISODate(ctx.now);
    const range = weekRange(today);
    const prior = previousWeek(range);
    const kids = kidsInScope(ctx);
    host.append(el('p', { class: 'range-label', 'data-testid': 'week-span' }, `${shortDate(range.start)} – ${shortDate(range.end)}`));
    const cards = kids.map((kid) => counterCard(summaryFor(ctx, kid, range), summaryFor(ctx, kid, prior)));
    if (ctx.profile.role === 'parent' && !ctx.focusPersonId) {
      const boys = ctx.people.filter((person) => person.role === 'kid').map((person) => summaryFor(ctx, person, range));
      const lastBoys = ctx.people.filter((person) => person.role === 'kid').map((person) => summaryFor(ctx, person, prior));
      host.append(counterCard(summarizeFamily(boys), summarizeFamily(lastBoys), { family: true }));
      host.append(el('div', { class: 'week-pair', 'data-testid': 'week-pair' }, cards));
    } else {
      host.append(...cards);
    }
    if (ctx.profile.role === 'parent') {
      host.append(el('button', {
        type: 'button',
        class: 'btn ghost',
        'data-testid': 'edit-weights',
        onclick: () => openWeights(ctx),
      }, 'Weights'));
    }
  },
});
