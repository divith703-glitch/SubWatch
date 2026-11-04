import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCycles,
  daysBetween,
  monthlyCost,
  rollForward,
  yearlyCost,
  todayISO,
} from './util.js';
import { findCatalogEntry } from './catalog.js';

test('addCycles clamps the day when the next month is shorter', () => {
  assert.equal(addCycles('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addCycles('2024-01-31', 'monthly'), '2024-02-29'); // leap year
  assert.equal(addCycles('2026-03-15', 'quarterly'), '2026-06-15');
  assert.equal(addCycles('2026-03-15', 'yearly'), '2027-03-15');
  assert.equal(addCycles('2026-11-02', 'monthly', 3), '2027-02-02');
});

test('addCycles handles weekly billing with day arithmetic', () => {
  assert.equal(addCycles('2026-11-02', 'weekly'), '2026-11-09');
  assert.equal(addCycles('2026-11-02', 'weekly', 4), '2026-11-30');
  assert.equal(addCycles('2026-12-29', 'weekly', 1), '2027-01-05');
});

test('rollForward never returns a date in the past', () => {
  const next = rollForward('2020-01-15', 'monthly');
  assert.ok(next >= todayISO(), `${next} should be today or later`);
  assert.equal(daysBetween(todayISO(), next) >= 0, true);
});

test('monthly and yearly normalisation across cycles', () => {
  assert.equal(monthlyCost(12, 'monthly'), 12);
  assert.equal(Math.round(monthlyCost(120, 'yearly')), 10);
  assert.equal(Math.round(monthlyCost(30, 'quarterly')), 10);
  assert.equal(Math.round(monthlyCost(60, 'semiannual')), 10);
  assert.equal(Math.round(monthlyCost(10, 'weekly') * 100) / 100, 43.33);
  assert.equal(Math.round(yearlyCost(9.99, 'monthly')), 120);
});

test('catalog matching resolves aliases and partial names', () => {
  assert.equal(findCatalogEntry('Netflix')?.key, 'netflix');
  assert.equal(findCatalogEntry('netflix premium')?.key, 'netflix');
  assert.equal(findCatalogEntry('Spotify Family')?.key, 'spotify');
  assert.equal(findCatalogEntry('JioHotstar')?.key, 'hotstar');
  assert.equal(findCatalogEntry('Totally Unknown Service'), undefined);
});
