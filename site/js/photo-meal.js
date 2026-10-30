import { CONFIG, isDemoMode } from './config.js';
import { getAccessToken } from './store.js';

const demoPhotos = new Map();
const signedUrls = new Map();

/** Demo stand-in for Gemini. Not a real photo read. */
export function stubPhotoEstimate() {
  const items = [
    { name: 'Rice', portion: '1 cup', calories: 200, protein_g: 4, carbs_g: 45, fat_g: 0.4 },
    { name: 'Dal', portion: '1 cup', calories: 180, protein_g: 9, carbs_g: 22, fat_g: 6 },
    { name: 'Vegetables', portion: '1/2 cup', calories: 40, protein_g: 2, carbs_g: 8, fat_g: 0.3 },
  ];
  return {
    description: 'Rice, dal, and vegetables',
    items,
    ...sumPhotoItems(items),
    confidence: 'medium',
    estimate: true,
    stub: true,
  };
}

export function sumPhotoItems(items) {
  return items.reduce((total, item) => ({
    calories: total.calories + (Number(item.calories) || 0),
    protein_g: Math.round((total.protein_g + (Number(item.protein_g) || 0)) * 10) / 10,
    carbs_g: Math.round((total.carbs_g + (Number(item.carbs_g) || 0)) * 10) / 10,
    fat_g: Math.round((total.fat_g + (Number(item.fat_g) || 0)) * 10) / 10,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

export async function resizeImageFile(file, maxEdge = 1024, quality = 0.82) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Choose a photo of the meal.');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare that photo.');
  return blob;
}

function photoError(payload, status) {
  if (payload?.error === 'photo_cap') {
    return payload.message || 'This month’s photo estimates are used up. Type the meal instead.';
  }
  if (payload?.error === 'missing_gemini_key') return 'Photo estimates are not configured yet. Type the meal instead.';
  if (status === 401) return 'Sign in again, then retake the photo.';
  return payload?.message || 'Could not estimate that photo. You can type the meal instead.';
}

export async function analyzeMealPhoto(blob, personId) {
  if (isDemoMode()) return stubPhotoEstimate();
  const token = getAccessToken();
  if (!token) throw new Error('Sign in again, then retake the photo.');
  const path = `${personId}/${crypto.randomUUID()}.jpg`;
  const upload = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/meal-photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });
  if (!upload.ok) throw new Error('Could not store that photo.');
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/photo-meal`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ person_id: personId, path }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(photoError(payload, res.status));
  return { ...payload, path, estimate: true, stub: false };
}

export function rememberDemoPhoto(path, blob) {
  demoPhotos.set(path, URL.createObjectURL(blob));
}

export function hydrateMealPhoto(img, path) {
  if (!path || !img) return;
  if (path.startsWith('demo/')) {
    const url = demoPhotos.get(path);
    if (url) img.src = url;
    return;
  }
  const cached = signedUrls.get(path);
  if (cached && cached.exp > Date.now()) {
    img.src = cached.url;
    return;
  }
  signMealPhoto(path).then((url) => {
    if (url && img.isConnected) img.src = url;
  }).catch(() => {});
}

async function signMealPhoto(path) {
  const token = getAccessToken();
  if (!token || isDemoMode()) return '';
  const res = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/sign/meal-photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 60 * 60 }),
  });
  if (!res.ok) return '';
  const payload = await res.json().catch(() => ({}));
  const signed = payload.signedURL || payload.signedUrl || '';
  if (!signed) return '';
  const url = signed.startsWith('http') ? signed : `${CONFIG.SUPABASE_URL}/storage/v1${signed}`;
  signedUrls.set(path, { url, exp: Date.now() + 50 * 60 * 1000 });
  return url;
}
