/** Keep in sync with supabase/functions/_shared/food.ts */

export function parseFoodQuery(input) {
  return String(input || '')
    .split(/\s*(?:,|\.(?!\d)|&|\+|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (match) return { qty: Number(match[1]), name: match[2].trim() };
      return { qty: 1, name: part };
    })
    .filter((item) => item.name);
}

export function normFoodName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function itemSlug(name) {
  return normFoodName(name).replace(/\s+/g, '-') || 'item';
}
