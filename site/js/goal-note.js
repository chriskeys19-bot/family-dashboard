import { shiftISODate } from './time.js';
import { summarizeWeek } from './week.js';

/** Height and birth are not columns. Weight comes from person_settings when set. */
export const KID_BODIES = {
  yuvan: { birth: '2012-01-15', heightCm: 176.5, weightKg: 59 },
  varun: { birth: '2013-06-15', heightCm: 163.8, weightKg: 52.2 },
};

export function defaultWeightKg(personId) {
  return KID_BODIES[personId]?.weightKg ?? null;
}

export function ageOn(birth, iso) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** Mifflin-St Jeor, male. kcal/day at rest. */
export function mifflinMale(kg, cm, age) {
  return 10 * kg + 6.25 * cm - 5 * age + 5;
}

export function activityFactor(burnedKcal) {
  const burn = Number(burnedKcal) || 0;
  if (burn >= 700) return 1.85;
  if (burn >= 400) return 1.7;
  if (burn >= 200) return 1.55;
  if (burn > 0) return 1.45;
  return 1.4;
}

function movedPhrase(day) {
  const bits = [];
  if (day.cricket_minutes > 0) bits.push('cricket');
  if (day.gym_minutes > 0) bits.push('gym');
  if (day.miles_run > 0) bits.push('a run');
  return bits.join(' and ');
}

/**
 * Two to four encouraging sentences. No weight, size, or weight-loss talk.
 */
export function goalWriteup({ person, events, completions, reflections, training, nutrition, todayISO }) {
  const body = KID_BODIES[person?.id];
  if (!body) return null;
  const yesterday = shiftISODate(todayISO, -1);
  const kg = Number(person.weight_kg) > 0 ? Number(person.weight_kg) : body.weightKg;
  const age = ageOn(body.birth, yesterday);
  const bmr = mifflinMale(kg, body.heightCm, age);
  const day = summarizeWeek({
    person: { ...person, weight_kg: kg },
    events,
    completions,
    reflections,
    training,
    nutrition,
    range: { start: yesterday, end: yesterday },
  });
  const factor = activityFactor(day.calories_burned);
  const need = Math.round(bmr * factor);
  const proteinLow = Math.round(kg * 1.2);
  const proteinHigh = Math.round(kg * 1.6);
  const logged = day.calories_eaten > 0 || day.protein_g > 0;
  const eaten = day.calories_eaten;
  const protein = day.protein_g;
  const sentences = [];
  if (!logged) {
    sentences.push('No meals were logged yesterday, so calories and protein are still a blank page.');
    sentences.push(`A rough fuel target for cricket and running is about ${need} kcal, with protein around ${proteinLow}–${proteinHigh} g.`);
  } else if (eaten < need - 250) {
    sentences.push(`Logged food was about ${eaten} kcal and ${protein} g of protein, a bit under a rough ${need} kcal target for a cricket-and-running day.`);
  } else if (eaten > need + 400) {
    sentences.push(`Logged food was about ${eaten} kcal and ${protein} g of protein, above a rough ${need} kcal target. That number is only a guide.`);
  } else {
    sentences.push(`Logged food was about ${eaten} kcal and ${protein} g of protein, close to a rough ${need} kcal target for cricket and running.`);
  }
  if (logged && protein < proteinLow) {
    sentences.push(`Protein was under the ${proteinLow}–${proteinHigh} g range that supports practice and running.`);
  } else if (logged) {
    sentences.push(`Protein was in or above the ${proteinLow}–${proteinHigh} g range that supports practice and running.`);
  }
  const moved = movedPhrase(day);
  if (day.calories_burned > 0) {
    sentences.push(`Movement added about ${day.calories_burned} kcal${moved ? ` from ${moved}` : ''}, which is the cricket and running goal in action.`);
  } else {
    sentences.push('No cricket check-off or run was logged, so the work side is quiet. A short easy run, or marking practice, keeps both goals moving.');
  }
  if (!logged) sentences.push('A rough note of what was eaten is enough next time.');
  else if (protein < proteinLow) sentences.push('Milk, eggs, yogurt, or dal is an easy add at the next meal.');
  else if (eaten < need - 250) sentences.push('A snack after practice, like milk and a banana, can top the day up.');
  else sentences.push('Keep logging the plate and the session so the week shows the pattern.');
  return {
    text: sentences.slice(0, 4).join(' '),
    needKcal: need,
    proteinLow,
    proteinHigh,
    eatenKcal: eaten,
    proteinG: protein,
    burnedKcal: day.calories_burned,
  };
}
