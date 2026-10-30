/**
 * Built-in photo meals live in photo-meal.js and the nutrition module:
 * Snap meal → resize → private meal-photos bucket → photo-meal Edge Function (Gemini).
 * Demo mode stubs that response. API keys stay in Supabase secrets.
 *
 * registerPhotoNutritionSource remains for any extra estimator. It is not required
 * for the Snap meal button.
 *
 * A source registered here gets a button on the food form. Its estimate() result
 * is confirmed by the kid and then written to nutrition_entries through the
 * same store path as typed meals (demo localStorage or Supabase).
 *
 * estimate() should resolve to:
 * {
 *   description: string,
 *   items: Array<{ label, calories, protein_g, carbs_g, fat_g, qty?, portion? }>,
 *   calories: number,
 *   protein_g: number,
 *   carbs_g: number,
 *   fat_g: number,
 *   note?: string
 * }
 *
 * Direct writes can call FamilyDashboard.nutrition.saveEntry(entry) with the
 * fields listed in NUTRITION_ENTRY_FIELDS. Set source to "photo" and pass
 * photo_path if a file was stored elsewhere. Do not put API keys in the page.
 */
const sources = [];

export const NUTRITION_ENTRY_FIELDS = [
  'person_id',
  'eaten_at',
  'meal',
  'description',
  'items',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'is_estimate',
  'note',
  'source',
  'photo_path',
];

export function registerPhotoNutritionSource(source) {
  if (!source?.id || typeof source.estimate !== 'function') {
    throw new Error('Photo nutrition source needs an id and estimate()');
  }
  const existing = sources.findIndex((item) => item.id === source.id);
  if (existing >= 0) sources.splice(existing, 1, source);
  else sources.push(source);
}

export function listPhotoNutritionSources() {
  return sources.slice();
}
