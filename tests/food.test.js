import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogMatch, parseFoodQuery } from '../supabase/functions/_shared/food.ts';

test("McDonald's MC chicken and snack rap", () => {
  const items = parseFoodQuery("McDonald's MC chicken and snack rap");
  assert.deepEqual(items.map((item) => item.name), ["McDonald's MC chicken", 'snack rap']);
  const chicken = catalogMatch(items[0].name);
  const wrap = catalogMatch(items[1].name);
  assert.equal(chicken.fdc_id, 'chain-mcchicken');
  assert.equal(chicken.calories, 390);
  assert.equal(chicken.protein_g, 14);
  assert.equal(wrap.fdc_id, 'chain-snack-wrap');
  assert.equal(wrap.calories, 400);
  assert.equal(wrap.protein_g, 17);
});

test('RANCH snack rap mcdonalds. MCCHICKEN', () => {
  const items = parseFoodQuery('RANCH snack rap mcdonalds. MCCHICKEN');
  assert.equal(items.length, 2);
  assert.equal(catalogMatch(items[0].name).fdc_id, 'chain-snack-wrap');
  assert.equal(catalogMatch(items[0].name).calories, 400);
  assert.equal(catalogMatch(items[0].name).protein_g, 17);
  assert.equal(catalogMatch(items[1].name).fdc_id, 'chain-mcchicken');
  assert.equal(catalogMatch(items[1].name).calories, 390);
});

test('Mchicken', () => {
  const match = catalogMatch('Mchicken');
  assert.equal(match.fdc_id, 'chain-mcchicken');
  assert.equal(match.calories, 390);
  assert.equal(match.protein_g, 14);
});

test('Chocolate shake', () => {
  const match = catalogMatch('Chocolate shake');
  assert.equal(match.fdc_id, 'chain-chocolate-shake');
  assert.equal(match.calories, 640);
  assert.equal(match.protein_g, 16);
  assert.equal(match.sizes.small.calories, 520);
  assert.equal(match.sizes.small.protein_g, 12);
});

test('Pulao and curd rice with chicken', () => {
  const items = parseFoodQuery('Pulao and curd rice with chicken');
  assert.deepEqual(items.map((item) => item.name), ['Pulao', 'curd rice with chicken']);
  assert.equal(catalogMatch(items[0].name).fdc_id, 'chain-pulao');
  assert.equal(catalogMatch(items[0].name).calories, 360);
  assert.equal(catalogMatch(items[1].name).fdc_id, 'chain-curd-rice-chicken');
  assert.equal(catalogMatch(items[1].name).calories, 430);
  assert.equal(catalogMatch(items[1].name).protein_g, 29);
});

test('a decimal quantity stays one item', () => {
  const items = parseFoodQuery('1.5 rotis');
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 1.5);
  assert.equal(items[0].name, 'rotis');
});
