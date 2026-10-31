import { practiceMentions } from './practice-duration.js';
import { buildRecap } from './recap.js';
import { dayBounds, shiftISODate } from './time.js';

function inDay(iso, bounds) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= bounds.start.getTime() && time < bounds.end.getTime();
}

function sumMeals(meals) {
  const estimated = meals.filter((row) => row.source !== 'note' && row.calories != null);
  return {
    calories: estimated.reduce((sum, row) => sum + (Number(row.calories) || 0), 0),
    protein_g: Math.round(estimated.reduce((sum, row) => sum + (Number(row.protein_g) || 0), 0) * 10) / 10,
    carbs_g: Math.round(estimated.reduce((sum, row) => sum + (Number(row.carbs_g) || 0), 0) * 10) / 10,
    fat_g: Math.round(estimated.reduce((sum, row) => sum + (Number(row.fat_g) || 0), 0) * 10) / 10,
    estimated_meals: estimated.length,
    logged_meals: meals.length,
  };
}

/** One Pacific day of a kid’s journal, including the recap of that day. */
export function assembleJournal({
  person,
  date,
  events = [],
  completions = [],
  reflections = [],
  training = [],
  nutrition = [],
  notes = [],
  needs = [],
}) {
  const bounds = dayBounds(date);
  const id = person.id;
  const runs = training.filter((row) => row.person_id === id && row.trained_on === date);
  const meals = nutrition.filter((row) => row.person_id === id && inDay(row.eaten_at, bounds));
  const dayNotes = notes.filter((row) => row.person_id === id && inDay(row.created_at, bounds));
  const dayNeeds = needs.filter((row) => row.person_id === id && (inDay(row.created_at, bounds) || inDay(row.updated_at, bounds)));
  const dayCompletions = completions.filter((row) => row.person_id === id && (row.occurrence_on === date || inDay(row.completed_at, bounds)));
  const dayReflections = reflections.filter((row) => row.person_id === id && (row.occurrence_on === date || inDay(row.updated_at, bounds)));
  const recap = buildRecap({
    person,
    events,
    nutrition,
    training,
    completions,
    todayISO: shiftISODate(date, 1),
  });
  return {
    person_id: id,
    person_name: person.name,
    date,
    timezone: 'America/Los_Angeles',
    completions: dayCompletions,
    reflections: dayReflections,
    practice_mentions: practiceMentions(dayReflections),
    runs,
    meals,
    meal_totals: { ...sumMeals(meals), approximate: true },
    daily_totals: { ...sumMeals(meals), approximate: true },
    notes: dayNotes,
    needs: dayNeeds,
    recap,
  };
}
