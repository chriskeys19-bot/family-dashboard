import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXED = new Date('2026-10-30T17:00:00Z');
const MEAL_PHOTO = new URL('./fixtures/meal.jpg', import.meta.url).pathname;
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

async function shot(page, name) {
  const dir = join('artifacts', 'screenshots', test.info().project.name);
  mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  } catch {
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
  }
}

async function openBoard(page, profile, time = FIXED) {
  await page.clock.install({ time });
  await page.goto('/');
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

test('password gate rejects a miss, then opens profiles', async ({ page }) => {
  await page.clock.install({ time: FIXED });
  await page.goto('/');
  await shot(page, '01-password-gate');
  const password = page.getByLabel('Password');
  const fontSize = await password.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  await expect(page.getByTestId('demo-hint')).toContainText('family');
  await password.fill('nope');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('gate-error')).toBeVisible();
  await password.fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('profile-picker')).toBeVisible();
  await shot(page, '02-profiles');
  const card = page.getByTestId('profile-yuvan');
  const box = await card.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('roles, ranges, categories, overlaps, and the banner', async ({ page }) => {
  const storage = [];
  page.on('request', (req) => {
    if (req.url().includes('/storage/') || req.url().includes('family-banner')) storage.push(req.url());
  });
  await openBoard(page, 'yuvan');
  await expect(page.getByTestId('family-banner')).toHaveAttribute('data-banner', 'placeholder');
  await expect(page.getByTestId('family-banner-names')).toContainText('Yuvan');
  await expect(page.locator('[data-testid=family-banner-photo]')).toHaveCount(0);
  expect(storage).toEqual([]);
  await expect(page.getByTestId('scope-note')).toHaveText('Only Yuvan');
  await expect(page.getByTestId('person-tabs')).toHaveCount(0);
  await expect(page.getByTestId('range-label')).toHaveText('Oct 30 – Nov 1');
  await expect(page.getByRole('heading', { name: 'Indus Conquest vs Strikers White', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cheetahs Beta vs Livermore Monks', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('event-practice-blazers-2026-10-30')).toHaveAttribute('data-overlap', 'true');
  await expect(page.getByTestId('event-gym-toy-soldier-2026-10-30')).toHaveAttribute('data-overlap', 'true');
  await shot(page, '03-kid-3day');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByRole('heading', { name: 'Cheetahs Beta vs Livermore Monks', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Indus Conquest vs Strikers White', exact: true })).toHaveCount(0);

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.getByTestId('person-tabs')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Indus Conquest vs Strikers White', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cheetahs Beta vs Livermore Monks', exact: true })).toBeVisible();
  await page.getByTestId('tab-yuvan').click();
  await expect(page.getByRole('heading', { name: 'Cheetahs Beta vs Livermore Monks', exact: true })).toHaveCount(0);
  await page.getByTestId('tab-all').click();

  await page.getByTestId('range-1w').click();
  await expect(page.getByTestId('range-label')).toHaveText('Oct 30 – Nov 5');
  await expect(page.getByRole('heading', { name: 'RSM class', exact: true })).toBeVisible();
  await expect(page.getByText('Cheetahs practice').first()).toBeVisible();
  await expect(page.getByText('Cheetahs Beta vs Strikers Blue 2')).toHaveCount(0);
  await shot(page, '04-parent-week');

  await page.getByTestId('range-1m').click();
  await expect(page.getByTestId('range-label')).toHaveText('Oct 30 – Nov 29');
  const categories = await page.locator('[data-testid^=category-]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  expect(categories).toEqual([
    'category-cricket-games',
    'category-cricket-practice',
    'category-gym',
    'category-tournament',
    'category-academics',
  ]);
  await expect(page.locator('[data-multiday="true"]')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'AMLCA U15 Top 8, MSCA Blazers', exact: true })).toHaveCount(1);
  await expect(page.getByText('Game day (details TBD)')).toHaveCount(0);
  await shot(page, '05-parent-month');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-sangeetha').click();
  await expect(page.getByTestId('tab-varun')).toBeVisible();
});

test('kids differ on the daily boost and parents get calm and a tip', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await expect(page.getByTestId('module-boost')).toBeVisible();
  await expect(page.getByTestId('module-recap')).toBeVisible();
  const modules = await page.locator('[data-testid^=module-]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
  expect(modules.indexOf('module-recap')).toBeLessThan(modules.indexOf('module-schedule'));
  expect(modules.indexOf('module-boost')).toBeLessThan(modules.indexOf('module-schedule'));
  const yuvanJoke = await page.getByTestId('boost-joke').innerText();
  const yuvanQuote = await page.getByTestId('boost-quote').innerText();
  expect(yuvanJoke.length).toBeGreaterThan(10);
  await expect(page.getByTestId('boost-attribution')).not.toBeEmpty();
  await expect(page.getByTestId('recap-yuvan')).toContainText('No meals got logged');
  await shot(page, '06-boost-and-recap');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByTestId('boost-joke')).not.toHaveText(yuvanJoke);
  await expect(page.getByTestId('boost-quote')).not.toContainText(yuvanQuote.slice(0, 40));

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.getByTestId('boost-calm')).toBeVisible();
  await expect(page.getByTestId('boost-tip')).toBeVisible();
  await expect(page.getByTestId('boost-joke')).toHaveCount(0);
  await expect(page.getByTestId('recap-yuvan')).toBeVisible();
  await expect(page.getByTestId('recap-varun')).toBeVisible();
});

test('a kid can check off only their own event, and parents see it', async ({ page }) => {
  await openBoard(page, 'yuvan');
  const yuvanBox = page.getByTestId('check-event-practice-blazers-2026-10-30-yuvan-2026-10-30');
  await expect(yuvanBox).toBeEnabled();
  await yuvanBox.check();
  await page.getByTestId('reflection-skip').click();
  await expect(yuvanBox).toBeChecked();
  await yuvanBox.uncheck();
  await expect(yuvanBox).not.toBeChecked();
  await yuvanBox.check();
  await page.getByTestId('reflection-skip').click();
  await shot(page, '07-checkoff');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  const parentYuvan = page.getByTestId('check-event-practice-blazers-2026-10-30-yuvan-2026-10-30');
  const parentVarun = page.getByTestId('check-event-practice-blazers-2026-10-30-varun-2026-10-30');
  await expect(parentYuvan).toBeChecked();
  await expect(parentYuvan).toBeDisabled();
  await expect(parentVarun).not.toBeChecked();
  await expect(parentVarun).toBeDisabled();

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  const varunBox = page.getByTestId('check-event-practice-blazers-2026-10-30-varun-2026-10-30');
  await expect(varunBox).toBeEnabled();
  await expect(varunBox).not.toBeChecked();
  await expect(page.getByTestId('check-event-practice-blazers-2026-10-30-yuvan-2026-10-30')).toHaveCount(0);
});

test('yesterday recap lists a missed practice and accepts a late check', async ({ page }) => {
  await openBoard(page, 'yuvan', new Date('2026-10-31T18:00:00Z'));
  const recap = page.getByTestId('recap-yuvan');
  await expect(recap).toContainText('Practice was on the list');
  await expect(recap).toContainText('Blazers Elite Pro/Premium');
  await expect(recap).toContainText('Toy Soldier gym');
  const box = page.getByTestId('check-event-practice-blazers-2026-10-30-yuvan-2026-10-30');
  await box.check();
  await page.getByTestId('reflection-skip').click();
  await expect(recap.getByRole('heading', { name: 'Done' })).toBeVisible();
  await expect(recap).toContainText('One thing stayed unchecked');
  await shot(page, '08-yesterday-recap');
});

test('social request shows as Requested for that kid only', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('add-social').click();
  await page.getByLabel('Title').fill('Movie with friends');
  await page.getByLabel('Date').fill('2026-10-31');
  await page.getByLabel('Start').fill('14:00');
  await page.getByLabel('End').fill('16:00');
  await page.getByLabel('Where').fill('AMC NewPark');
  const note = page.getByLabel('Note');
  await note.fill('after practice');
  await note.focus();
  const visible = await note.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport ? viewport.offsetTop : 0;
    const height = viewport ? viewport.height : window.innerHeight;
    return rect.top >= top - 1 && rect.bottom <= top + height + 1;
  });
  expect(visible).toBe(true);
  await page.getByRole('button', { name: 'Save request' }).click();
  const card = page.locator('[data-testid^=request-]');
  await expect(card).toContainText('Movie with friends');
  await expect(card).toHaveAttribute('data-status', 'requested');
  await expect(page.getByTestId('category-social')).toBeVisible();
  await shot(page, '09-social-requested');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByText('Movie with friends')).toHaveCount(0);
  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.getByText('Movie with friends')).toBeVisible();
});

test('nutrition lookup disambiguates, remembers, and can fall back to a note', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('add-nutrition').click();
  await page.getByTestId('food-query').fill('2 rotis and dal');
  await page.getByRole('button', { name: 'Breakfast' }).click();
  await page.getByTestId('lookup-foods').click();
  await expect(page.getByTestId('item-rotis').locator('[data-testid^=match-]')).toHaveCount(3);
  await expect(page.getByTestId('item-dal').locator('[data-testid^=match-]')).toHaveCount(3);
  await expect(page.locator('[data-remembered="true"]')).toHaveCount(0);
  await page.getByTestId('match-rotis-demo-roti-ww').click();
  await page.getByTestId('portion-rotis-piece').click();
  await page.getByTestId('portion-dal-cup').click();
  await shot(page, '10-nutrition-matches');
  await page.getByTestId('confirm-estimates').click();
  await expect(page.getByTestId('estimate-banner')).toContainText(/estimate/i);
  await expect(page.getByTestId('macro-calories')).toContainText(/\d+/);
  await page.getByTestId('save-meal').click();
  await expect(page.getByText('2 rotis and dal')).toBeVisible();
  await expect(page.getByTestId('day-totals-2026-10-30')).toContainText('Estimates');

  await page.getByTestId('add-nutrition').click();
  await page.getByTestId('food-query').fill('rotis');
  await page.getByRole('button', { name: 'Snack' }).click();
  await page.getByTestId('lookup-foods').click();
  await expect(page.getByTestId('item-rotis').locator('[data-testid^=match-]').first()).toHaveAttribute('data-fdc-id', 'demo-roti-ww');
  await expect(page.getByTestId('item-rotis').locator('[data-testid^=match-]').first()).toHaveAttribute('data-remembered', 'true');
  await page.getByTestId('sheet-close').click();

  await page.getByTestId('add-nutrition').click();
  await page.getByTestId('food-query').fill('orange slices');
  await page.getByRole('button', { name: 'Snack' }).click();
  await page.getByTestId('save-note').click();
  await expect(page.getByText('orange slices')).toBeVisible();
  await expect(page.getByText('No macro estimate').first()).toBeVisible();
});

test('snap meal stubs an estimate, lets the kid edit, and parents see the thumbnail', async ({ page }) => {
  const calls = [];
  page.on('request', (req) => {
    if (req.url().includes('generativelanguage') || req.url().includes('/storage/') || req.url().includes('/functions/v1/photo-meal')) {
      calls.push(req.url());
    }
  });
  await openBoard(page, 'yuvan');
  await page.getByTestId('add-nutrition').click();
  const input = page.getByTestId('snap-input');
  await expect(input).toHaveAttribute('accept', 'image/*');
  await expect(input).toHaveAttribute('capture', 'environment');
  await input.setInputFiles(MEAL_PHOTO);
  await expect(page.getByTestId('photo-review')).toBeVisible();
  await expect(page.getByTestId('estimate-banner')).toContainText(/estimate/i);
  await expect(page.getByTestId('photo-confidence')).toContainText('medium');
  await page.getByRole('button', { name: 'Breakfast' }).click();
  await page.getByTestId('photo-calories-0').fill('250');
  await expect(page.getByTestId('photo-totals')).toContainText('470');
  await shot(page, '11-photo-review');
  await page.getByTestId('save-photo-meal').click();
  const card = page.locator('[data-source="photo"]');
  await expect(card).toContainText('Rice, dal, and vegetables');
  await expect(card).toContainText('250 kcal');
  await expect(card).toContainText('estimate');
  const thumb = page.locator('[data-testid^=meal-photo-]');
  await expect(thumb).toBeVisible();
  await expect(thumb).toHaveAttribute('src', /^blob:/);
  expect(calls).toEqual([]);
  await shot(page, '12-photo-saved');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.locator('[data-testid^=meal-photo-]')).toBeVisible();
  await expect(page.locator('[data-testid^=photo-breakdown-]')).toContainText('Rice');
  await page.getByTestId('tab-varun').click();
  await expect(page.getByText('Rice, dal, and vegetables')).toHaveCount(0);
});

test('log my run asks simple questions, shows pace and feel, and stays after lock', async ({ page }) => {
  await openBoard(page, 'varun');
  await page.getByTestId('add-training').click();
  await expect(page.getByRole('dialog', { name: 'Log my run' })).toBeVisible();
  await expect(page.getByLabel('When?')).toHaveValue('2026-10-30');
  await expect(page.getByLabel('How far?')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.getByLabel('Minutes')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.getByLabel('Seconds')).toHaveAttribute('inputmode', 'numeric');
  await page.getByRole('button', { name: 'Intervals' }).click();
  await page.getByRole('button', { name: 'Meters' }).click();
  await page.getByLabel('How far?').fill('800');
  await page.getByLabel('Minutes').fill('2');
  await page.getByLabel('Seconds').fill('45');
  await expect(page.getByTestId('run-pace')).toContainText('/400m');
  await page.getByTestId('feel-5').click();
  await page.getByLabel('Anything else?').fill('felt good');
  await page.getByRole('button', { name: 'Save run' }).click();
  await expect(page.getByTestId('recent-training')).toContainText('Intervals');
  await expect(page.getByTestId('recent-training')).toContainText('800 m');
  await expect(page.getByTestId('recent-training')).toContainText('2:45');
  await expect(page.getByTestId('recent-training')).toContainText('Felt Great');
  await expect(page.getByTestId('training-day-2026-10-30')).toContainText('felt good');
  const check = page.locator('[data-testid^=check-training-]');
  await expect(check).toBeEnabled();
  await shot(page, '13-training');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  await expect(page.getByTestId('recent-training')).toContainText('Felt Great');
  await page.getByTestId('lock').click();
  await expect(page.getByLabel('Password')).toBeVisible();
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByTestId('recent-training')).toContainText('800 m');
});

test('needs and notes stay with that kid and their parents', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('need-item').fill('New bat grips');
  await page.getByTestId('need-why').fill('The old ones are smooth');
  await page.getByTestId('need-date').fill('2026-11-07');
  await page.getByTestId('urgency-soon').click();
  await page.getByRole('button', { name: 'Add to the list' }).click();
  const yuvanNeed = page.locator('[data-testid^=need-]').filter({ hasText: 'New bat grips' });
  await expect(yuvanNeed).toContainText('Asked');
  await expect(yuvanNeed).toContainText('Soon');

  await page.getByTestId('note-body').fill('Tired after practice');
  await page.getByTestId('mood-🙂').click();
  await page.getByTestId('save-kid-note').click();
  await expect(page.getByText('Tired after practice')).toBeVisible();
  await shot(page, '15-needs-and-notes');

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-varun').click();
  await expect(page.getByText('New bat grips')).toHaveCount(0);
  await expect(page.getByText('Tired after practice')).toHaveCount(0);

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  const parentNeed = page.locator('[data-testid^=need-]').filter({ hasText: 'New bat grips' });
  await expect(parentNeed).toBeVisible();
  await expect(page.getByText('Tired after practice')).toBeVisible();
  await parentNeed.getByLabel('Reply about New bat grips').fill('This weekend');
  await parentNeed.getByRole('button', { name: 'Approved' }).click();
  await expect(parentNeed).toHaveAttribute('data-status', 'approved');

  await page.getByTestId('tab-varun').click();
  await expect(page.getByText('New bat grips')).toHaveCount(0);

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-yuvan').click();
  await expect(page.locator('[data-status="approved"]')).toContainText('New bat grips');
  await expect(page.getByText('This weekend')).toBeVisible();
});
