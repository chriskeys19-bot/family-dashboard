import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { dashboardAuthorized } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_CAP = 600;

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!await dashboardAuthorized(req)) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('GEMINI_API_KEY') || '';
  if (!apiKey) return json({ error: 'missing_gemini_key', message: 'Photo estimates are not configured yet.' }, 500);
  const model = (Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const cap = positiveInt(Deno.env.get('PHOTO_MONTHLY_CAP'), DEFAULT_CAP);

  let personId = '';
  let path = '';
  try {
    const body = await req.json();
    personId = String(body?.person_id ?? '');
    path = String(body?.path ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(personId) || !isSafePath(personId, path)) {
    return json({ error: 'bad_request' }, 400);
  }

  const admin = adminClient();
  if (!admin) return json({ error: 'missing_service_role' }, 500);
  const month = pacificMonth();
  const reserved = await reserve(admin, month, cap);
  if (reserved === -1) {
    return json({
      error: 'photo_cap',
      cap,
      message: `Photo estimates are capped at ${cap} this month. Type the meal instead.`,
    }, 429);
  }
  if (reserved == null) return json({ error: 'usage_failed' }, 500);

  try {
    const image = await downloadPhoto(path);
    const estimate = await askGemini(image, model, apiKey);
    return json({ ...estimate, path, estimate: true });
  } catch (error) {
    await release(admin, month);
    const message = error instanceof Error ? error.message : 'estimate_failed';
    const status = message === 'not_food' ? 422 : 502;
    return json({ error: message === 'not_food' ? 'not_food' : 'estimate_failed', message: publicMessage(message) }, status);
  }
});

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function isSafePath(personId: string, path: string) {
  if (!path || path.includes('..') || path.includes('\\')) return false;
  return new RegExp(`^${personId}/[0-9a-f-]{36}\\.jpg$`).test(path);
}

function pacificMonth() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function reserve(admin: ReturnType<typeof createClient>, month: string, cap: number) {
  const { data, error } = await admin.rpc('reserve_photo_credit', { p_month: month, p_cap: cap });
  if (error) return null;
  return Number(data);
}

async function release(admin: ReturnType<typeof createClient>, month: string) {
  await admin.rpc('release_photo_credit', { p_month: month });
}

async function downloadPhoto(path: string) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const res = await fetch(`${url}/storage/v1/object/meal-photos/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('missing_photo');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 32 || bytes.byteLength > 5_000_000) throw new Error('bad_photo');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('bad_photo');
  return bytes;
}

async function askGemini(bytes: Uint8Array, model: string, apiKey: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Estimate this meal for a family food log. Numbers are rough estimates, not lab values. If the picture is not food, set confidence to low and describe what you see. Name each visible food, a household portion, and calories, protein_g, carbs_g, and fat_g for that portion.' },
          { inline_data: { mime_type: 'image/jpeg', data: base64(bytes) } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  portion: { type: 'string' },
                  calories: { type: 'number' },
                  protein_g: { type: 'number' },
                  carbs_g: { type: 'number' },
                  fat_g: { type: 'number' },
                },
                required: ['name', 'portion', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
              },
            },
            calories: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
          },
          required: ['description', 'confidence', 'items', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
        },
      },
    }),
  });
  if (!res.ok) throw new Error('gemini_failed');
  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('bad_estimate');
  }
  const items = Array.isArray(parsed.items) ? parsed.items.map(cleanItem).filter((item) => item.name) : [];
  if (!items.length) throw new Error('not_food');
  const totals = items.reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    protein_g: Math.round((sum.protein_g + item.protein_g) * 10) / 10,
    carbs_g: Math.round((sum.carbs_g + item.carbs_g) * 10) / 10,
    fat_g: Math.round((sum.fat_g + item.fat_g) * 10) / 10,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const confidence = ['low', 'medium', 'high'].includes(String(parsed.confidence)) ? String(parsed.confidence) : 'low';
  return {
    description: String(parsed.description || items.map((item) => item.name).join(', ')).slice(0, 180),
    confidence,
    items,
    ...totals,
  };
}

function cleanItem(raw: unknown) {
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    name: String(item.name || '').trim().slice(0, 80),
    portion: String(item.portion || '').trim().slice(0, 40),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    protein_g: round1(item.protein_g),
    carbs_g: round1(item.carbs_g),
    fat_g: round1(item.fat_g),
  };
}

function round1(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

function base64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function publicMessage(code: string) {
  if (code === 'not_food') return 'That photo does not look like a meal. Try again or type what you ate.';
  if (code === 'missing_photo') return 'The photo did not finish uploading. Try again.';
  return 'Could not estimate that photo. You can type the meal instead.';
}
