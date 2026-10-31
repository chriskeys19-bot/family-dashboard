import { catalogMatch, isVagueRestaurant } from './food-catalog.js';
import { normFoodName, parseFoodQuery } from './food-parse.js';

const DEMO_FOODS = [
  food('demo-roti-ww', 'Roti, whole wheat', ['roti', 'rotis', 'chapati', 'chapatis'], 120, 3.5, 18, 3.7, 'piece', 40),
  food('demo-roti-ghee', 'Roti with ghee', ['roti', 'rotis', 'chapati', 'chapatis'], 155, 3.2, 18, 7.5, 'piece', 45),
  food('demo-roti-rumali', 'Rumali roti', ['roti', 'rotis', 'rumali'], 180, 5, 28, 5, 'piece', 70),
  food('demo-dal-tadka', 'Dal tadka', ['dal', 'daal', 'lentil', 'lentils'], 180, 9, 22, 6, 'cup', 240),
  food('demo-dal-yellow', 'Yellow dal', ['dal', 'daal', 'lentil', 'lentils'], 150, 10, 20, 3, 'cup', 230),
  food('demo-dal-makhani', 'Dal makhani', ['dal', 'daal'], 250, 10, 22, 12, 'cup', 250),
  food('demo-rice-white', 'Steamed rice', ['rice'], 205, 4, 45, 0.4, 'cup', 158),
  food('demo-rice-jeera', 'Jeera rice', ['rice'], 240, 4, 42, 6, 'cup', 160),
  food('demo-rice-biryani', 'Chicken biryani', ['biryani', 'rice'], 360, 18, 45, 12, 'cup', 220),
  food('demo-chicken', 'Chicken curry', ['chicken'], 280, 26, 8, 16, 'cup', 240),
  food('demo-chicken-grill', 'Grilled chicken', ['chicken'], 190, 32, 0, 6, 'piece', 120),
  food('demo-chicken-nugget', 'Chicken nuggets', ['chicken', 'nugget', 'nuggets'], 280, 14, 16, 18, 'serving', 100),
  food('demo-milk', 'Whole milk', ['milk'], 150, 8, 12, 8, 'cup', 244),
  food('demo-milk-2', '2% milk', ['milk'], 122, 8, 12, 5, 'cup', 244),
  food('demo-milk-choc', 'Chocolate milk', ['milk', 'chocolate'], 190, 8, 26, 5, 'cup', 250),
  food('demo-egg', 'Egg, boiled', ['egg', 'eggs'], 78, 6, 0.6, 5, 'piece', 50),
  food('demo-egg-fried', 'Egg, fried', ['egg', 'eggs'], 90, 6, 0.4, 7, 'piece', 46),
  food('demo-omelette', 'Omelette', ['egg', 'eggs', 'omelette'], 154, 11, 1, 12, 'piece', 90),
  food('demo-banana', 'Banana', ['banana'], 105, 1.3, 27, 0.4, 'piece', 118),
  food('demo-apple', 'Apple', ['apple'], 95, 0.5, 25, 0.3, 'piece', 182),
  food('demo-dosa', 'Dosa', ['dosa', 'dosai'], 170, 4, 28, 5, 'piece', 90),
  food('demo-idli', 'Idli', ['idli', 'idly'], 70, 2, 14, 0.4, 'piece', 40),
  food('demo-yogurt', 'Plain yogurt', ['yogurt', 'curd', 'dahi'], 150, 8, 11, 8, 'cup', 245),
  food('demo-bread', 'White bread', ['bread', 'toast'], 80, 3, 15, 1, 'piece', 30),
  food('demo-pasta', 'Pasta with sauce', ['pasta', 'noodles'], 280, 9, 42, 8, 'cup', 240),
  food('demo-pizza', 'Cheese pizza', ['pizza'], 285, 12, 36, 10, 'piece', 107),
  food('demo-oats', 'Oatmeal', ['oats', 'oatmeal'], 150, 5, 27, 3, 'cup', 234),
  food('demo-paneer', 'Paneer curry', ['paneer'], 320, 14, 10, 24, 'cup', 240),
];

function food(fdcId, label, keywords, calories, protein, carbs, fat, basis, basisGrams) {
  return {
    fdc_id: fdcId,
    label,
    keywords,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    basis,
    basis_grams: basisGrams,
    piece_grams: basis === 'piece' ? basisGrams : null,
    rough: false,
  };
}

function present(entry) {
  const copy = { ...entry };
  delete copy.keywords;
  return copy;
}

function scoreFood(entry, queryNorm) {
  const tokens = queryNorm.split(' ').filter(Boolean);
  let score = 0;
  for (const keyword of entry.keywords) {
    if (keyword === queryNorm) score += 10;
    else if (queryNorm.includes(keyword) || keyword.includes(queryNorm)) score += 6;
    else if (tokens.some((token) => token.length > 2 && (keyword.includes(token) || token.includes(keyword)))) score += 3;
  }
  return score;
}

function roughFillers(queryNorm) {
  const sizes = [
    ['small', 120, 4, 15, 4],
    ['medium', 220, 8, 28, 8],
    ['large', 380, 12, 45, 14],
  ];
  const slug = queryNorm.replace(/\s+/g, '-') || 'food';
  return sizes.map(([size, calories, protein, carbs, fat]) => ({
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
  }));
}

function matchesFor(queryNorm) {
  const ranked = DEMO_FOODS
    .map((entry) => ({ entry, score: scoreFood(entry, queryNorm) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .map((row) => present(row.entry));
  if (ranked.length >= 3) return ranked.slice(0, 3);
  const fillers = roughFillers(queryNorm).filter((row) => !ranked.some((match) => match.fdc_id === row.fdc_id));
  return ranked.concat(fillers).slice(0, 3);
}

function fromMemory(row) {
  return {
    fdc_id: row.fdc_id,
    label: row.label,
    calories: Number(row.calories) || 0,
    protein_g: Number(row.protein_g) || 0,
    carbs_g: Number(row.carbs_g) || 0,
    fat_g: Number(row.fat_g) || 0,
    basis: row.basis || 'serving',
    basis_grams: Number(row.basis_grams) || 100,
    piece_grams: row.piece_grams == null ? null : Number(row.piece_grams),
    rough: false,
    remembered: true,
  };
}

export function lookupDemoFoods(query, memory = []) {
  const items = parseFoodQuery(query);
  return {
    estimate: true,
    stub: true,
    items: items.map((item) => {
      const queryNorm = normFoodName(item.name);
      const known = catalogMatch(item.name);
      let matches = known ? [known] : matchesFor(queryNorm);
      if (known || isVagueRestaurant(queryNorm)) {
        return {
          query: item.name,
          query_norm: queryNorm,
          qty: item.qty,
          matches,
        };
      }
      const remembered = memory.find((row) => row.query_norm === queryNorm);
      if (remembered) {
        const existing = matches.find((match) => match.fdc_id === remembered.fdc_id);
        const pinned = existing ? { ...existing, remembered: true } : fromMemory(remembered);
        matches = [pinned, ...matches.filter((match) => match.fdc_id !== pinned.fdc_id)].slice(0, 3);
      }
      return {
        query: item.name,
        query_norm: queryNorm,
        qty: item.qty,
        matches: matches.map((match) => ({ ...match, remembered: Boolean(match.remembered) })),
      };
    }),
  };
}
