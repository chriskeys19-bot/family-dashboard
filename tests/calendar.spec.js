import { expect, test } from '@playwright/test';

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

async function openBoard(page, profile, time) {
  await page.clock.install({ time });
  await page.goto('/');
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('calendar')).toBeVisible();
}

test('month grid, dots, and the day card follow the family filter', async ({ page }) => {
  await openBoard(page, 'ben', new Date('2026-11-07T18:00:00Z'));
  await expect(page.getByTestId('calendar-title')).toHaveText('November 2026');
  await expect(page.getByTestId('calendar-grid').getByRole('columnheader').first()).toHaveText('Mon');
  await expect(page.getByTestId('calendar-legend').locator('li')).toHaveText([
    'Cricket Games',
    'Cricket Practice',
    'Gym',
    'Tournament',
    'Academics',
  ]);
  await expect(page.getByTestId('calendar-kid-legend')).toContainText('Yuvan');
  await expect(page.getByTestId('calendar-kid-legend')).toContainText('Varun');

  const today = page.getByTestId('calendar-day-2026-11-07');
  await expect(today).toHaveClass(/is-today/);
  await expect(today).toHaveClass(/is-selected/);
  await expect(today).toHaveAttribute('aria-current', 'date');
  await expect(today.locator('[data-category="cricket-games"]')).toHaveAttribute('data-kids', 'varun');
  await expect(today.locator('[data-category="cricket-practice"]')).toHaveAttribute('data-kids', 'yuvan,varun');

  const outside = page.getByTestId('calendar-day-2026-10-30');
  await expect(outside).toHaveClass(/is-outside/);
  await expect(page.getByTestId('calendar-day-2026-11-01')).not.toHaveClass(/is-outside/);
  await expect(outside.locator('[data-category="cricket-practice"]')).toHaveCount(1);

  const detail = page.getByTestId('calendar-detail');
  await expect(detail.getByTestId('calendar-detail-date')).toHaveText('Saturday, November 7');
  await expect(detail.getByTestId('calendar-event-game-2026-11-07-varun-cheetahs-beta-vs-strikers-blue-2')).toContainText('11:45 AM – 5:15 PM');
  await expect(detail.getByTestId('calendar-event-game-2026-11-07-varun-cheetahs-beta-vs-strikers-blue-2')).toContainText('Potential');
  await expect(detail.getByTestId('calendar-event-game-2026-11-07-varun-cheetahs-beta-vs-strikers-blue-2')).toContainText('Varun');
  await expect(detail.getByTestId('calendar-event-practice-cric-kingdom-2026-11-07')).toContainText('Yuvan · Varun');

  await outside.click();
  await expect(page.getByTestId('calendar-title')).toHaveText('November 2026');
  await expect(detail).toContainText('Blazers Elite Pro/Premium');
  await expect(detail).toContainText('6:00 PM – 9:15 PM');

  await page.getByTestId('tab-yuvan').click();
  await expect(page.getByTestId('calendar-kid-legend')).toHaveCount(0);
  await expect(page.getByTestId('calendar-day-2026-11-07').locator('[data-category="cricket-games"]')).toHaveCount(0);
  await page.getByTestId('calendar-day-2026-11-07').click();
  await expect(detail).not.toContainText('Strikers Blue');
  await expect(detail).toContainText('Cric Kingdom');
  await page.getByTestId('calendar-day-2026-11-05').click();
  await expect(detail).toContainText('RSM class');

  await page.getByTestId('tab-varun').click();
  await page.getByTestId('calendar-day-2026-11-05').click();
  await expect(detail).not.toContainText('RSM class');
  await page.getByTestId('calendar-day-2026-11-07').click();
  await expect(detail).toContainText('Cheetahs Beta vs Strikers Blue 2');

  await page.getByTestId('tab-all').click();
  await page.getByTestId('calendar-prev').click();
  await expect(page.getByTestId('calendar-title')).toHaveText('October 2026');
  await page.getByTestId('calendar-next').click();
  await page.getByTestId('calendar-next').click();
  await expect(page.getByTestId('calendar-title')).toHaveText('December 2026');
  await page.getByTestId('calendar-day-2026-12-05').click();
  const yuvanGame = detail.getByTestId('calendar-event-game-2026-12-05-yuvan-tbd');
  await expect(yuvanGame).toContainText('All day');
  await expect(yuvanGame).toContainText('Game day (details TBD)');
  await expect(yuvanGame).toContainText('Yuvan');
  await expect(yuvanGame).not.toContainText('Varun');
  await page.getByTestId('calendar-day-2026-12-06').click();
  await expect(detail.getByTestId('calendar-event-game-2026-12-05-yuvan-tbd')).toHaveCount(0);
  await expect(detail.getByTestId('calendar-event-game-2026-12-06-varun-tbd')).toBeVisible();

  await page.getByTestId('calendar-prev').click();
  await page.getByTestId('calendar-day-2026-11-22').click();
  await expect(detail).toContainText('6:00 AM – 3:00 PM · Daily');
  await expect(detail.getByTestId('calendar-event-tourn-2026-11-21-yuvan-amlca-u15-top-8-msca-blazers')).toBeVisible();
  await expect(detail.getByTestId('calendar-event-tourn-2026-11-21-varun-amlca-u13-top-8-msca-avengers')).toBeVisible();
  await expect(page.getByTestId('calendar-day-2026-11-22').locator('[data-category="tournament"]')).toHaveCount(1);
  await expect(page.getByTestId('calendar-day-2026-11-23').locator('[data-category="tournament"]')).toHaveCount(1);
  await expect(page.getByTestId('calendar-day-2026-11-25').locator('[data-category="tournament"]')).toHaveCount(0);

  const grid = page.getByTestId('calendar-grid');
  const gridBox = await grid.boundingBox();
  const dayBox = await page.getByTestId('calendar-day-2026-11-15').boundingBox();
  expect(dayBox.width).toBeGreaterThan(28);
  expect(dayBox.width * 7).toBeLessThanOrEqual(gridBox.width + 8);
  const overflows = await page.getByTestId('calendar').evaluate((node) => node.scrollWidth > node.clientWidth + 1);
  expect(overflows).toBe(false);
});

test('Yuvan and Varun each see only their own days', async ({ page }) => {
  await openBoard(page, 'yuvan', new Date('2026-11-07T18:00:00Z'));
  await expect(page.getByTestId('person-tabs')).toHaveCount(0);
  await expect(page.getByTestId('calendar-kid-legend')).toHaveCount(0);
  await expect(page.getByTestId('calendar-day-2026-11-07').locator('[data-category="cricket-games"]')).toHaveCount(0);
  await page.getByTestId('calendar-day-2026-11-05').click();
  await expect(page.getByTestId('calendar-detail')).toContainText('RSM class');
  await expect(page.getByTestId('calendar-detail')).not.toContainText('Cheetahs Beta');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByTestId('calendar-title')).toHaveText('November 2026');
  await page.getByTestId('calendar-day-2026-11-05').click();
  await expect(page.getByTestId('calendar-detail')).not.toContainText('RSM class');
  await page.getByTestId('calendar-day-2026-11-07').click();
  await expect(page.getByTestId('calendar-detail')).toContainText('Strikers Blue');
  await expect(page.getByTestId('calendar-detail')).not.toContainText('RSM class');
});
