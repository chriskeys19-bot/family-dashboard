import { expect, test } from '@playwright/test';

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

async function openBoard(page, profile) {
  await page.clock.install({ time: FIXED });
  await page.goto('/');
  await page.getByLabel('Password').fill('family');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId(`profile-${profile}`).click();
  await expect(page.getByTestId('dashboard')).toBeVisible();
  for (const id of ['recap', 'schedule', 'nutrition', 'training', 'needs', 'notes']) {
    const toggle = page.getByTestId(`toggle-${id}`);
    if (await toggle.count() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
}

async function clickEach(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) await locator.nth(i).click();
}

test('practice reflection keeps typed text when chips change', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('check-event-practice-blazers-2026-10-30-yuvan-2026-10-30').check();
  const sheet = page.getByTestId('reflection-sheet');
  const learned = sheet.getByLabel('Key things you learned');
  const focus = sheet.getByLabel('Other focus');
  const extra = sheet.getByLabel('Anything else?');
  await learned.fill('kept my head still');
  await focus.fill('front foot');
  await extra.fill('tired legs');
  await clickEach(sheet.locator('[data-testid^=session-type-]'));
  await clickEach(sheet.locator('[data-testid^=duration-]').filter({ hasNot: page.locator('[data-testid="duration-custom"]') }));
  await clickEach(sheet.locator('[data-testid^=focus-]'));
  await clickEach(sheet.locator('[data-testid^=feel-]'));
  await expect(learned).toHaveValue('kept my head still');
  await expect(focus).toHaveValue('front foot');
  await expect(extra).toHaveValue('tired legs');
});

test('game reflection keeps typed text when stats and feel change', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('check-event-game-2026-11-01-yuvan-indus-conquest-vs-strikers-white-yuvan-2026-11-01').check();
  const sheet = page.getByTestId('reflection-sheet');
  const learned = sheet.getByLabel('Key things you learned');
  const extra = sheet.getByLabel('Anything else?');
  await learned.fill('watched the ball');
  await extra.fill('good warm up');
  await sheet.getByTestId('game-batted').click();
  await sheet.getByLabel('Runs').fill('24');
  await sheet.getByLabel('Balls').fill('18');
  await sheet.getByTestId('game-bowled').click();
  await sheet.getByLabel('Overs').fill('3');
  await clickEach(sheet.locator('[data-testid^=focus-]'));
  await clickEach(sheet.locator('[data-testid^=feel-]'));
  await sheet.getByTestId('game-batted').click();
  await sheet.getByTestId('game-batted').click();
  await expect(learned).toHaveValue('watched the ball');
  await expect(extra).toHaveValue('good warm up');
  await expect(sheet.getByLabel('Runs')).toHaveValue('24');
  await expect(sheet.getByLabel('Balls')).toHaveValue('18');
  await expect(sheet.getByLabel('Overs')).toHaveValue('3');
});

test('meal log, run log, notes, and needs keep text when a choice is tapped', async ({ page }) => {
  await openBoard(page, 'yuvan');

  await page.getByTestId('add-nutrition').click();
  const food = page.getByTestId('food-query');
  await food.fill('pulao and curd rice');
  await clickEach(page.locator('[data-meal]'));
  await expect(food).toHaveValue('pulao and curd rice');
  await page.getByTestId('sheet-close').click();

  await page.getByTestId('add-training').click();
  const far = page.getByLabel('How far?');
  const note = page.getByLabel('Anything else?');
  await far.fill('1600');
  await note.fill('felt smooth');
  await clickEach(page.locator('[data-session-type]'));
  await clickEach(page.locator('[data-unit]'));
  await clickEach(page.locator('[data-testid^=feel-]'));
  await expect(far).toHaveValue('1600');
  await expect(note).toHaveValue('felt smooth');
  await page.getByTestId('sheet-close').click();

  const thought = page.getByTestId('note-body');
  await thought.fill('park was quiet');
  await clickEach(page.locator('[data-testid^=mood-]'));
  await expect(thought).toHaveValue('park was quiet');

  const item = page.getByTestId('need-item');
  const why = page.getByTestId('need-why');
  await item.fill('new grips');
  await why.fill('old ones slip');
  await clickEach(page.locator('[data-testid^=urgency-]'));
  await expect(item).toHaveValue('new grips');
  await expect(why).toHaveValue('old ones slip');
});

test('photo meal names survive a meal choice, and parent category labels survive a new row', async ({ page }) => {
  await openBoard(page, 'yuvan');
  await page.getByTestId('add-nutrition').click();
  await page.getByTestId('snap-input').setInputFiles(MEAL_PHOTO);
  const name = page.getByLabel('Food 1');
  await name.fill('lemon rice');
  await clickEach(page.getByRole('group', { name: 'Meal' }).getByRole('button'));
  await expect(name).toHaveValue('lemon rice');
  await page.getByTestId('sheet-close').click();

  await page.getByTestId('switch-profile').click();
  await page.getByTestId('profile-ben').click();
  const reply = page.locator('[data-testid^=need-reply-]').first();
  if (await reply.count()) {
    await reply.fill('On the list');
    const card = reply.locator('xpath=ancestor::article[1]');
    await card.getByRole('button', { name: 'Approved' }).click();
    await expect(card).toContainText('On the list');
  }
  await page.getByTestId('edit-categories').click();
  const label = page.getByLabel(/Label for /).first();
  await label.fill('Cricket games renamed');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByLabel(/Label for /).first()).toHaveValue('Cricket games renamed');
});
