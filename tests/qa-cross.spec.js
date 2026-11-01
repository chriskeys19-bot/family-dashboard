import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXED = new Date('2026-10-30T17:00:00Z');
const DEMO_CONFIG = `
export const CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', DEMO_PASSWORD: 'family' };
export function isDemoMode() { return true; }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/js/config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: DEMO_CONFIG,
  }));
});

async function openBoard(page, profile, { expand = true } = {}) {
  await page.clock.install({ time: FIXED });
  await page.goto('/');
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
  if (!expand) return;
  for (const id of ['recap', 'schedule', 'nutrition', 'training', 'needs', 'notes']) {
    const toggle = page.getByTestId(`toggle-${id}`);
    if (await toggle.count() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

test('mobile safeguards: 16px inputs, dvh, sheet scroll, and keyboard resize', async ({ page }) => {
  await openBoard(page, 'yuvan', { expand: false });
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('interactive-widget=resizes-content');
  expect(viewport).toContain('viewport-fit=cover');

  const css = await (await page.request.get('/css/app.css')).text();
  expect(css).toContain('min-height: 100vh');
  expect(css).toContain('min-height: 100dvh');
  expect(css).toContain('--keyboard-inset');
  expect(css).toContain('safe-area-inset-bottom');
  expect(css).toContain('touch-action: manipulation');
  const hoverAt = css.indexOf(':hover');
  const mediaAt = css.indexOf('@media (hover: hover)');
  expect(mediaAt).toBeGreaterThan(-1);
  expect(hoverAt).toBeGreaterThan(mediaAt);

  await page.getByTestId('toggle-needs').click();
  const date = page.getByTestId('need-date');
  await expect(date).toBeVisible();
  const dateFont = await date.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(dateFont).toBeGreaterThanOrEqual(16);
  const dateBox = await date.boundingBox();
  expect(dateBox.height).toBeGreaterThanOrEqual(40);
  const dateTouch = await date.evaluate((el) => getComputedStyle(el).touchAction);
  expect(dateTouch).toBe('manipulation');

  await page.getByTestId('add-nutrition').click();
  const sheet = page.getByTestId('sheet');
  await expect(page.locator('body')).toHaveClass(/sheet-open/);
  const time = sheet.locator('input[type="time"]');
  await expect(time).toBeVisible();
  const timeFont = await time.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(timeFont).toBeGreaterThanOrEqual(16);
  const timeBox = await time.boundingBox();
  expect(timeBox.height).toBeGreaterThanOrEqual(40);
  const sheetStyle = await sheet.evaluate((el) => {
    const style = getComputedStyle(el);
    return { overflowY: style.overflowY, touchAction: style.touchAction };
  });
  expect(sheetStyle.overflowY).toBe('auto');
  expect(sheetStyle.touchAction).toBe('pan-y');
  const locked = await page.evaluate(() => getComputedStyle(document.body).position);
  expect(locked).toBe('fixed');
  await page.getByTestId('sheet-close').click();
  await expect(page.locator('body')).not.toHaveClass(/sheet-open/);
});

test('collapse toggles respond to tap and keyboard and survive a range change', async ({ page }) => {
  await openBoard(page, 'yuvan', { expand: false });
  await expect(page.getByTestId('checkin-card-yuvan')).toBeVisible();
  await expect(page.getByTestId('toggle-week')).toHaveCount(0);
  await expect(page.getByTestId('toggle-boost')).toHaveCount(0);
  for (const id of ['recap', 'schedule', 'nutrition', 'training', 'needs', 'notes']) {
    await expect(page.getByTestId(`toggle-${id}`)).toHaveAttribute('aria-expanded', 'false');
  }
  await page.getByTestId('toggle-nutrition').click();
  await expect(page.getByTestId('toggle-nutrition')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('toggle-schedule').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toggle-schedule')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('range-1w').click();
  await expect(page.getByTestId('toggle-nutrition')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('toggle-schedule')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('toggle-notes')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('toggle-schedule').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('toggle-schedule')).toHaveAttribute('aria-expanded', 'false');
});

test('meal edit opens prefilled, keeps chip text, saves once, and delete confirms', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('add-nutrition').click();
  await page.getByTestId('food-query').fill('2 rotis and dal');
  await page.getByRole('button', { name: 'Breakfast' }).click();
  await expect(page.getByTestId('food-query')).toHaveValue('2 rotis and dal');
  await page.getByTestId('lookup-foods').click();
  await page.getByTestId('portion-rotis-piece').click();
  await page.getByTestId('portion-dal-cup').click();
  await page.getByTestId('confirm-estimates').click();
  await page.getByTestId('save-meal').click();

  await page.locator('[data-testid^=edit-meal-]').click();
  const sheet = page.getByRole('dialog', { name: 'Edit meal' });
  const query = sheet.getByTestId('food-query');
  await expect(query).toHaveValue('2 rotis and dal');
  await expect(sheet.getByLabel('Time')).toHaveValue('10:00');
  await expect(sheet.getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true');
  const shotName = {
    'iphone-14': 'meal-edit-iphone',
    'pixel-7': 'meal-edit-pixel',
    'desktop-chrome': 'meal-edit-desktop',
  }[test.info().project.name];
  if (shotName) {
    mkdirSync('artifacts/screenshots', { recursive: true });
    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await sheet.screenshot({ path: join('artifacts', 'screenshots', `${shotName}.png`) });
    await sheet.screenshot({ path: `/opt/cursor/artifacts/${shotName}.png` });
  }
  await query.fill('2 rotis and dal plus');
  await sheet.getByRole('button', { name: 'Lunch' }).click();
  await expect(query).toHaveValue('2 rotis and dal plus');
  await query.fill("McDonald's");
  await sheet.getByRole('button', { name: 'Dinner' }).click();
  await sheet.getByTestId('lookup-foods').click();
  await sheet.getByTestId('confirm-estimates').click();
  await sheet.getByTestId('save-meal').click();
  await expect(page.locator('[data-testid^=meal-row-]')).toHaveCount(1);
  await expect(page.getByTestId('nutrition-today-yuvan')).toHaveText('1 meal logged today: dinner');
  await expect(page.getByTestId('week-eaten-yuvan')).toContainText('780');
  await expect(page.getByTestId('module-nutrition')).not.toContainText(/kcal|protein/i);

  await page.locator('[data-testid^=delete-meal-]').click();
  await page.locator('[data-testid^=cancel-delete-meal-]').click();
  await expect(page.locator('[data-testid^=meal-row-]')).toHaveCount(1);
  await page.locator('[data-testid^=delete-meal-]').click();
  await page.locator('[data-testid^=confirm-delete-meal-]').click();
  await expect(page.getByTestId('nutrition-today-yuvan')).toHaveText('Nothing logged yet today');
  await expect(page.locator('[data-testid^=meal-row-]')).toHaveCount(0);
});
