import { normFoodName, parseFoodQuery } from './food-parse.js';

/** Approximate values for one regular serving. Not lab measurements. */
const DISHES = [
  dish('pulao', 'Pulao', ['pulao', 'veg pulao', 'vegetable pulao', 'pulav'], {
    small: [250, 5, 40, 6],
    regular: [360, 7, 58, 9],
    large: [500, 10, 80, 13],
  }),
  dish('curd-rice-chicken', 'Curd rice with chicken', [
    'curd rice with chicken', 'curd rice chicken', 'curd rice and chicken', 'yogurt rice with chicken',
  ], {
    small: [300, 20, 30, 10],
    regular: [430, 29, 42, 14],
    large: [580, 38, 55, 20],
  }),
  dish('mcchicken', 'McChicken', ['mcchicken', 'mc chicken', 'mcdonalds mcchicken'], {
    small: [400, 14, 39, 21],
    regular: [400, 14, 39, 21],
    large: [400, 14, 39, 21],
  }),
  dish('snack-wrap', 'McDonald’s snack wrap', [
    'snack wrap', 'snackwrap', 'mcdonalds snack wrap', 'chicken snack wrap', 'mcwrap',
  ], {
    small: [350, 15, 32, 16],
    regular: [350, 15, 32, 16],
    large: [350, 15, 32, 16],
  }),
  dish('chocolate-shake', 'Chocolate shake', [
    'chocolate shake', 'choc shake', 'chocolate milkshake', 'mcdonalds chocolate shake', 'mcflurry chocolate',
  ], {
    small: [510, 13, 82, 15],
    regular: [640, 16, 102, 18],
    large: [830, 21, 135, 24],
  }),
];

function dish(id, label, aliases, sizes) {
  return { id, label, aliases, sizes };
}

function sizeRow(id, label, [calories, protein, carbs, fat]) {
  return { calories, protein_g: protein, carbs_g: carbs, fat_g: fat, id, label };
}

export function typicalMcdonaldsMeal() {
  const sizes = {
    small: [550, 18, 68, 20],
    regular: [780, 20, 95, 30],
    large: [1100, 28, 130, 42],
  };
  return toMatch('chain-mcdonalds-meal', 'Typical McDonald’s meal', sizes, 'One sandwich, small fries, and a small drink. Approximate.');
}

function toMatch(id, label, sizes, note) {
  const regular = sizeRow(id, label, sizes.regular);
  return {
    fdc_id: id,
    label,
    calories: regular.calories,
    protein_g: regular.protein_g,
    carbs_g: regular.carbs_g,
    fat_g: regular.fat_g,
    basis: 'serving',
    basis_grams: 1,
    piece_grams: null,
    rough: false,
    approximate: true,
    note: note || 'Approximate.',
    sizes: {
      small: sizeRow(id, label, sizes.small),
      regular,
      large: sizeRow(id, label, sizes.large),
    },
  };
}

export function isVagueRestaurant(queryNorm) {
  return /^(mcdonalds|mcd)( (dinner|lunch|breakfast|meal|food|snack))?$/.test(queryNorm);
}

export function catalogMatch(name) {
  const queryNorm = normFoodName(name);
  if (!queryNorm) return null;
  if (isVagueRestaurant(queryNorm)) return typicalMcdonaldsMeal();
  const found = DISHES.find((entry) => entry.aliases.includes(queryNorm));
  if (!found) return null;
  return toMatch(`chain-${found.id}`, found.label, found.sizes);
}

/** One approximate regular-portion estimate for a logged description. */
export function estimateLoggedMeal(query) {
  const items = parseFoodQuery(query).map((item) => {
    const match = catalogMatch(item.name);
    const qty = item.qty || 1;
    const calories = match ? match.calories * qty : 0;
    const protein_g = match ? Math.round(match.protein_g * qty * 10) / 10 : 0;
    return {
      query: item.name,
      qty,
      label: match?.label || item.name,
      known: Boolean(match),
      approximate: true,
      calories,
      protein_g,
    };
  });
  return {
    items,
    approximate: true,
    calories: items.reduce((sum, item) => sum + item.calories, 0),
    protein_g: Math.round(items.reduce((sum, item) => sum + item.protein_g, 0) * 10) / 10,
  };
}
