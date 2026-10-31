import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXED = new Date('2026-10-30T17:00:00Z');
const DEMO_CONFIG = `
export const CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', DEMO_PASSWORD: 'family' };
export function isDemoMode() { return true; }
`;
const LIVE_CONFIG = `
export const CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test', DEMO_PASSWORD: 'family' };
export function isDemoMode() { return false; }
`;
const LIVE_PEOPLE = [
  { id: 'ben', name: 'Ben', role: 'parent', sort_order: 1 },
  { id: 'sangeetha', name: 'Sangeetha', role: 'parent', sort_order: 2 },
  { id: 'yuvan', name: 'Yuvan', role: 'kid', sort_order: 3 },
  { id: 'varun', name: 'Varun', role: 'kid', sort_order: 4 },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/js/config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: DEMO_CONFIG,
  }));
});

async function openBoard(page, profile, time = FIXED) {
  await page.clock.install({ time });
  await page.goto('/');
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

test('monthly check-in sits under the boost, can wait a day, and updates height and weight', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page, 'yuvan');
  const modules = await page.locator('[data-module]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-module')));
  expect(modules[0]).toBe('boost');
  expect(modules[1]).toBe('checkin');
  const card = page.getByTestId('checkin-card-yuvan');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Monthly check-in: enter your height and weight' })).toBeVisible();
  const dismiss = card.getByRole('button', { name: 'Dismiss monthly check-in' });
  const box = await dismiss.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
  const feetBox = await card.getByLabel('Feet').boundingBox();
  expect(feetBox.height).toBeGreaterThanOrEqual(40);

  if (test.info().project.name === 'iphone-14') {
    const dir = join('artifacts', 'screenshots');
    mkdirSync(dir, { recursive: true });
    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await page.evaluate(() => {
      const node = document.querySelector('[data-testid="checkin-card-yuvan"]');
      const bar = document.querySelector('[data-testid="action-bar"]');
      const gap = (bar?.getBoundingClientRect().height || 0) + 12;
      const rect = node.getBoundingClientRect();
      const overflow = rect.bottom - (window.innerHeight - gap);
      if (overflow > 0) window.scrollBy(0, overflow);
    });
    await page.screenshot({ path: join(dir, 'checkin-mobile.png') });
    await page.screenshot({ path: '/opt/cursor/artifacts/checkin-mobile.png' });
    await card.screenshot({ path: '/opt/cursor/artifacts/checkin-card-mobile.png' });
  }

  await card.getByLabel('Feet').fill('5');
  await card.getByLabel('Inches').fill('6');
  await card.getByLabel('Pounds').fill('120');
  await card.getByLabel('Reminder').fill('growing into the season');
  await dismiss.click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('checkin-card-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('measure-yuvan')).toHaveCount(0);

  await page.clock.setSystemTime(new Date('2026-10-31T17:00:00Z'));
  await page.reload();
  const again = page.getByTestId('checkin-card-yuvan');
  await expect(again).toBeVisible();
  await again.getByLabel('Feet').fill('5');
  await again.getByLabel('Inches').fill('6');
  await again.getByLabel('Pounds').fill('120');
  await again.getByLabel('Reminder').fill('growing into the season');
  await again.getByTestId('checkin-save-yuvan').click();
  await expect(page.getByTestId('checkin-card-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('week-weight-yuvan')).toContainText('120 lb');
  await page.getByTestId('toggle-recap').click();
  await expect(page.getByTestId('recap-writeup-yuvan')).toBeVisible();
  await expect(page.getByTestId('measure-varun')).toHaveCount(0);

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.getByTestId('checkin-card-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('measure-yuvan')).toContainText('5 ft 6 in');
  await expect(page.getByTestId('measure-yuvan')).toContainText('120 lb');
  await expect(page.getByTestId('measure-yuvan')).toContainText('Oct 31, 2026');
  await expect(page.getByTestId('measure-yuvan')).toContainText('growing into the season');
  await expect(page.getByTestId('measure-varun')).toContainText('No check-in yet.');
  await expect(page.getByTestId('recap-writeup-yuvan')).toBeVisible();
  await expect(page.getByTestId('recap-writeup-varun')).toBeVisible();

  await page.getByTestId('tab-varun').click();
  await expect(page.getByTestId('checkin-card-varun')).toBeVisible();
  await expect(page.getByTestId('measure-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('recap-writeup-yuvan')).toHaveCount(0);
  await page.getByTestId('tab-yuvan').click();
  await expect(page.getByTestId('checkin-card-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('measure-yuvan')).toContainText('Oct 31, 2026');
});

test('a missing measurements table leaves the rest of the board up', async ({ page }) => {
  await page.route('**/js/config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: LIVE_CONFIG,
  }));
  await page.route('**/functions/v1/auth-gate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'kid-token', role: 'kid', person_id: 'yuvan' }),
    });
  });
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('body_measurements')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.body_measurements' in the schema cache" }),
      });
      return;
    }
    const body = url.includes('/rest/v1/people') ? JSON.stringify(LIVE_PEOPLE) : '[]';
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: '{}',
  }));
  await page.clock.install({ time: FIXED });
  await page.goto('/');
  await page.getByLabel('Password').fill('yuvan-secret');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('module-boost')).toBeVisible();
  await expect(page.getByTestId('module-recap')).toBeVisible();
  await expect(page.getByTestId('checkin-card-yuvan')).toHaveCount(0);
  await expect(page.getByTestId('module-checkin')).toHaveCount(0);
});
