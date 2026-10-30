/** Keep parsing rules aligned with site/js/food-parse.js */

export function parseFoodQuery(input: string): Array<{ qty: number; name: string }> {
  return String(input || '')
    .split(/\s*(?:,|&|\+|\/|\band\b|\bwith\b)\s*/i)
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
