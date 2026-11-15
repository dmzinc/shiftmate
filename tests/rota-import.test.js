import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/rota-import.js', import.meta.url), 'utf8');
const context = {
  XLSX: { SSF: { parse_date_code(value) {
    // Excel serial date base: 1899-12-30 (UTC).
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  } } },
  Date, Map, Set, String, Math, Number, RegExp
};
vm.createContext(context);
vm.runInContext(source + `
globalThis.__test = { norm, cellDate, timeVal, parseClockRange, dateFromCell, normalName, validRotaDate, rotaNameScore, rotaPersonMatch };
`, context);
const api = context.__test;

test('normalises names without case or whitespace sensitivity', () => {
  assert.equal(api.normalName('  Jane   Smith DOE '), 'jane smith doe');
  assert.equal(api.normalName(null), '');
});

test('matches profile core name when rota includes a middle name', () => {
  assert.equal(api.rotaNameScore('Jane Smith Doe', 'Jane Doe'), 90);
  assert.equal(api.rotaPersonMatch('Jane Smith Doe', 'Jane Doe'), true);
  assert.equal(api.rotaPersonMatch('Jane Smith', 'Jane Doe'), false);
  assert.equal(api.rotaPersonMatch('Janet Doe', 'Jane Doe'), false);
});

test('parses supported clock ranges and meridiem', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseClockRange('07:30 - 19:30'))),
    { start: '07:30:00', end: '19:30:00' });
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseClockRange('7am to 7pm'))),
    { start: '07:00:00', end: '19:00:00' });
  assert.equal(api.parseClockRange('not a shift'), null);
});

test('normalises time values and rejects invalid values', () => {
  assert.equal(api.timeVal('7:05'), '07:05:00');
  assert.equal(api.timeVal('19:45:00'), '19:45:00');
  assert.equal(api.timeVal('25:90'), '');
});

test('parses ISO, day-first and Excel serial dates', () => {
  assert.equal(api.cellDate('2026-11-15T00:00:00'), '2026-11-15');
  assert.equal(api.cellDate('5/11/2026'), '2026-11-05');
  assert.equal(api.cellDate(46341), '2026-11-15');
});

test('validates rota dates and rejects impossible or out-of-range dates', () => {
  assert.equal(api.validRotaDate('2026-11-15'), '2026-11-15');
  assert.equal(api.validRotaDate('2026-02-30'), '');
  assert.equal(api.validRotaDate('not a date'), '');
  assert.equal(api.validRotaDate(100), '');
});
