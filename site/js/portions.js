export const PORTION_MODES = [
  { id: 'small', label: 'Small' },
  { id: 'regular', label: 'Regular' },
  { id: 'large', label: 'Large' },
  { id: 'cup', label: '1 cup' },
  { id: 'piece', label: '1 piece' },
  { id: 'grams', label: 'Grams' },
];

export function portionModesFor(match) {
  if (match?.sizes) return PORTION_MODES.filter((mode) => ['small', 'regular', 'large'].includes(mode.id));
  if (match?.basis === 'piece') return PORTION_MODES.filter((mode) => mode.id !== 'cup');
  if (match?.basis === 'cup') return PORTION_MODES.filter((mode) => mode.id !== 'piece');
  return PORTION_MODES;
}

export function defaultPortionMode(match) {
  if (match?.sizes) return 'regular';
  if (match.basis === 'piece') return 'piece';
  if (match.basis === 'cup') return 'cup';
  return 'regular';
}

export function scaleNutrients(match, portion) {
  const qty = Number(portion.qty);
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const grams = Number(portion.grams);
  const sized = match.sizes?.[portion.mode];
  if (sized) {
    const round1 = (n) => Math.round((Number(n) || 0) * safeQty * 10) / 10;
    return {
      calories: Math.round((Number(sized.calories) || 0) * safeQty),
      protein_g: round1(sized.protein_g),
      carbs_g: round1(sized.carbs_g),
      fat_g: round1(sized.fat_g),
    };
  }
  const basisGrams = match.basis === '100g' ? 100 : (Number(match.basis_grams) || 100);
  let factor = 0;
  if (portion.mode === 'grams') {
    const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
    factor = g / basisGrams;
  } else if (portion.mode === 'cup') {
    factor = match.basis === 'cup' ? safeQty : (safeQty * 240) / basisGrams;
  } else if (portion.mode === 'piece') {
    if (match.basis === 'piece') factor = safeQty;
    else factor = (safeQty * (Number(match.piece_grams) || 50)) / basisGrams;
  } else {
    const size = portion.mode === 'small' ? 0.75 : portion.mode === 'large' ? 1.35 : 1;
    factor = safeQty * size;
  }
  const round1 = (n) => Math.round((Number(n) || 0) * factor * 10) / 10;
  return {
    calories: Math.round((Number(match.calories) || 0) * factor),
    protein_g: round1(match.protein_g),
    carbs_g: round1(match.carbs_g),
    fat_g: round1(match.fat_g),
  };
}

export function sumNutrients(rows) {
  return rows.reduce((total, row) => ({
    calories: total.calories + (Number(row.calories) || 0),
    protein_g: Math.round((total.protein_g + (Number(row.protein_g) || 0)) * 10) / 10,
    carbs_g: Math.round((total.carbs_g + (Number(row.carbs_g) || 0)) * 10) / 10,
    fat_g: Math.round((total.fat_g + (Number(row.fat_g) || 0)) * 10) / 10,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}
