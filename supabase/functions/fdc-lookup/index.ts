import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { dashboardAuthorized } from '../_shared/auth.ts';
import { catalogMatch, isVagueRestaurant, normFoodName, nutrientValue, parseFoodQuery, plausibleFdcCalories, roughFillers, searchTerm } from '../_shared/food.ts';
import { json, preflight } from '../_shared/http.ts';

type FdcFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  brandName?: string;
  foodNutrients?: Array<{ nutrientId?: number; nutrientName?: string; value?: number }>;
};

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!await dashboardAuthorized(req)) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('FDC_API_KEY') || '';
  if (!apiKey) return json({ error: 'missing_fdc_key' }, 500);

  let query = '';
  let personId = '';
  try {
    const body = await req.json();
    query = String(body?.query ?? '').trim().slice(0, 200);
    personId = String(body?.person_id ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!query || !/^[a-z0-9_-]{1,64}$/.test(personId)) return json({ error: 'bad_request' }, 400);

  const memory = await loadMemory(personId);
  const items = parseFoodQuery(query).slice(0, 8);
  const results = [];
  for (const item of items) {
    const queryNorm = normFoodName(item.name);
    const known = catalogMatch(item.name);
    let matches = known ? [known] : await searchFdc(searchTerm(item.name), apiKey);
    if (!known && !matches.length) matches = roughFillers(queryNorm);
    if (known || isVagueRestaurant(queryNorm)) {
      results.push({ query: item.name, query_norm: queryNorm, qty: item.qty, matches });
      continue;
    }
    const remembered = memory.find((row) => row.query_norm === queryNorm);
    if (remembered) {
      const existing = matches.find((match) => String(match.fdc_id) === String(remembered.fdc_id));
      const pinned = existing
        ? { ...existing, remembered: true }
        : {
          fdc_id: String(remembered.fdc_id),
          label: remembered.label,
          calories: Number(remembered.calories) || 0,
          protein_g: Number(remembered.protein_g) || 0,
          carbs_g: Number(remembered.carbs_g) || 0,
          fat_g: Number(remembered.fat_g) || 0,
          basis: remembered.basis || 'serving',
          basis_grams: Number(remembered.basis_grams) || 100,
          piece_grams: remembered.piece_grams == null ? null : Number(remembered.piece_grams),
          rough: false,
          remembered: true,
        };
      matches = [pinned, ...matches.filter((match) => match.fdc_id !== pinned.fdc_id)].slice(0, 3);
    }
    results.push({
      query: item.name,
      query_norm: queryNorm,
      qty: item.qty,
      matches: matches.slice(0, 3),
    });
  }
  return json({ estimate: true, stub: false, items: results });
});

async function loadMemory(personId: string): Promise<Array<Record<string, unknown>>> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return [];
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin.from('food_memory').select('*').eq('person_id', personId);
  return data || [];
}

async function searchFdc(term: string, apiKey: string) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', term);
  url.searchParams.set('pageSize', '25');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const error = new Error('fdc_failed');
    throw error;
  }
  const payload = await res.json();
  const foods = (payload.foods || []) as FdcFood[];
  const ranked = foods
    .map((food) => ({ food, score: rank(food, term) }))
    .sort((a, b) => b.score - a.score || a.food.description.localeCompare(b.food.description))
    .slice(0, 8)
    .map(({ food }) => toMatch(food))
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .slice(0, 3);
  return ranked;
}

function rank(food: FdcFood, term: string): number {
  const desc = (food.description || '').toLowerCase();
  const q = term.toLowerCase();
  let score = 0;
  if (desc.includes(q)) score += 8;
  const token = q.replace(/s$/, '');
  if (token.length >= 3 && desc.includes(token)) score += 4;
  if (food.dataType === 'Foundation') score += 5;
  else if (food.dataType === 'SR Legacy') score += 4;
  else if ((food.dataType || '').startsWith('Survey')) score += 3;
  else if (food.dataType === 'Branded') score -= 2;
  return score;
}

function toMatch(food: FdcFood) {
  const calories = nutrientValue(food, [1008], /^energy$/i) ?? 0;
  if (!plausibleFdcCalories(calories)) return null;
  return {
    fdc_id: String(food.fdcId),
    label: food.brandName ? `${food.description} (${food.brandName})` : food.description,
    calories,
    protein_g: nutrientValue(food, [1003], /^protein$/i) ?? 0,
    carbs_g: nutrientValue(food, [1005], /carbohydrate/i) ?? 0,
    fat_g: nutrientValue(food, [1004], /lipid|fat/i) ?? 0,
    basis: '100g',
    basis_grams: 100,
    piece_grams: null,
    rough: false,
    remembered: false,
  };
}
