import { CONFIG, isDemoMode } from './config.js';
import { el } from './dom.js';
import { getAccessToken } from './store.js';

const NAMES = 'Ben, Sangeetha, Yuvan & Varun';
let cachedUrl = '';

export function resetFamilyBanner() {
  cachedUrl = '';
}

function paintPlaceholder(banner, { missing = false } = {}) {
  banner.dataset.banner = 'placeholder';
  banner.setAttribute('role', 'img');
  banner.setAttribute('aria-label', 'Family banner');
  banner.replaceChildren(
    el('p', { class: 'banner-kicker' }, 'Home Board'),
    el('p', { class: 'banner-names', 'data-testid': 'family-banner-names' }, NAMES),
    missing ? el('p', { class: 'banner-note' }, 'The private family photo isn’t in Storage yet.') : null,
  );
}

function paintPhoto(banner, url) {
  banner.dataset.banner = 'photo';
  banner.removeAttribute('role');
  banner.removeAttribute('aria-label');
  const img = el('img', {
    alt: 'Yuvan and Varun in front of Mount Rushmore',
    'data-testid': 'family-banner-photo',
    referrerpolicy: 'no-referrer',
    decoding: 'async',
  });
  img.src = url;
  banner.replaceChildren(img);
}

/** Signed URL for the private object. Never used in demo mode. Not stored on disk. */
export async function fetchFamilyBannerUrl() {
  if (isDemoMode()) return '';
  const token = getAccessToken();
  if (!token || !CONFIG.SUPABASE_URL) return '';
  const res = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/sign/family-media/family-banner.jpg`, {
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
  cachedUrl = signed.startsWith('http') ? signed : `${CONFIG.SUPABASE_URL}/storage/v1${signed}`;
  return cachedUrl;
}

export function renderFamilyBanner() {
  const banner = el('div', { class: 'family-banner', 'data-testid': 'family-banner' });
  if (isDemoMode() || !getAccessToken()) {
    paintPlaceholder(banner);
    return banner;
  }
  if (cachedUrl) {
    paintPhoto(banner, cachedUrl);
    return banner;
  }
  banner.dataset.banner = 'loading';
  fetchFamilyBannerUrl().then((url) => {
    if (!banner.isConnected) return;
    if (!url) paintPlaceholder(banner, { missing: true });
    else paintPhoto(banner, url);
  }).catch(() => {
    if (banner.isConnected) paintPlaceholder(banner, { missing: true });
  });
  return banner;
}
