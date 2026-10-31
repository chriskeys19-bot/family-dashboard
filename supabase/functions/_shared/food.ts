/** Keep parsing rules aligned with site/js/food-parse.js */

export function parseFoodQuery(input: string): Array<{ qty: number; name: string }> {
  return String(input || '')
    .split(/\s*(?:,|&|\+|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (match) return { qty: Number(match[1]), name: match[2].trim() };
      return { qty: 1, name: part };
    })
    .filter((item) => item.name);
}

export function normFoodName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchTerm(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length > 3 && /s$/i.test(trimmed) && !/ss$/i.test(trimmed)) return trimmed.slice(0, -1);
  return trimmed;
}

type NutrientRow = {
  nutrientId?: number;
  nutrientName?: string;
  value?: number;
  amount?: number;
  nutrient?: { id?: number; name?: string };
};

export function nutrientValue(food: { foodNutrients?: NutrientRow[] }, ids: number[], nameRe: RegExp): number | null {
  for (const row of food.foodNutrients || []) {
    const id = row.nutrientId ?? row.nutrient?.id;
    const name = row.nutrientName ?? row.nutrient?.name ?? '';
    const raw = row.value ?? row.amount;
    if ((id != null && ids.includes(id)) || nameRe.test(name)) {
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

type SizeMacros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

function sized(id: string, label: string, values: [number, number, number, number]): SizeMacros & { id: string; label: string } {
  const [calories, protein_g, carbs_g, fat_g] = values;
  return { id, label, calories, protein_g, carbs_g, fat_g };
}

function catalogItem(id: string, label: string, sizes: { small: [number, number, number, number]; regular: [number, number, number, number]; large: [number, number, number, number] }, note = 'Approximate.') {
  const regular = sized(id, label, sizes.regular);
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
    remembered: false,
    note,
    sizes: {
      small: sized(id, label, sizes.small),
      regular,
      large: sized(id, label, sizes.large),
    },
  };
}

const CATALOG: Array<{ aliases: string[]; match: ReturnType<typeof catalogItem> }> = [
  { aliases: ['pulao', 'veg pulao', 'vegetable pulao', 'pulav'], match: catalogItem('chain-pulao', 'Pulao', { small: [250, 5, 40, 6], regular: [360, 7, 58, 9], large: [500, 10, 80, 13] }) },
  { aliases: ['curd rice with chicken', 'curd rice chicken', 'curd rice and chicken', 'yogurt rice with chicken'], match: catalogItem('chain-curd-rice-chicken', 'Curd rice with chicken', { small: [300, 20, 30, 10], regular: [430, 29, 42, 14], large: [580, 38, 55, 20] }) },
  { aliases: ['mcchicken', 'mc chicken', 'mcdonalds mcchicken'], match: catalogItem('chain-mcchicken', 'McChicken', { small: [400, 14, 39, 21], regular: [400, 14, 39, 21], large: [400, 14, 39, 21] }) },
  { aliases: ['snack wrap', 'snackwrap', 'mcdonalds snack wrap', 'chicken snack wrap', 'mcwrap'], match: catalogItem('chain-snack-wrap', 'McDonald’s snack wrap', { small: [350, 15, 32, 16], regular: [350, 15, 32, 16], large: [350, 15, 32, 16] }) },
  { aliases: ['chocolate shake', 'choc shake', 'chocolate milkshake', 'mcdonalds chocolate shake'], match: catalogItem('chain-chocolate-shake', 'Chocolate shake', { small: [510, 13, 82, 15], regular: [640, 16, 102, 18], large: [830, 21, 135, 24] }) },
];

export function isVagueRestaurant(queryNorm: string) {
  return /^(mcdonalds|mcd)( (dinner|lunch|breakfast|meal|food|snack))?$/.test(queryNorm);
}

export function catalogMatch(name: string) {
  const queryNorm = normFoodName(name);
  if (!queryNorm) return null;
  if (isVagueRestaurant(queryNorm)) {
    return catalogItem('chain-mcdonalds-meal', 'Typical McDonald’s meal', {
      small: [550, 18, 68, 20],
      regular: [780, 20, 95, 30],
      large: [1100, 28, 130, 42],
    }, 'One sandwich, small fries, and a small drink. Approximate.');
  }
  return CATALOG.find((entry) => entry.aliases.includes(queryNorm))?.match ?? null;
}

export function plausibleFdcCalories(calories: number) {
  return calories > 0 && calories <= 900;
}

export function roughFillers(queryNorm: string) {
  const slug = queryNorm.replace(/\s+/g, '-') || 'food';
  return [
    ['small', 120, 4, 15, 4],
    ['medium', 220, 8, 28, 8],
    ['large', 380, 12, 45, 14],
  ].map(([size, calories, protein, carbs, fat]) => ({
    fdc_id: `rough-${slug}-${size}`,
    label: `${queryNorm} (${size} home serving, rough)`,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    basis: 'serving',
    basis_grams: 200,
    piece_grams: null,
    rough: true,
    remembered: false,
  }));
}
