import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/rota-import-core.js', import.meta.url), 'utf8');
const context = {
  XLSX: {
    SSF: { parse_date_code(value) {
      const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
    } },
    utils: { sheet_to_json(sheet) { return sheet; } }
  },
  Date, Map, Set, String, Math, Number, RegExp, TextDecoder
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
const api = context.RotaImportCore;

test('name matching is explicit and exact after case and whitespace normalisation only', () => {
  const sheet = { matches: [{ name: 'A.O Oguntuase', assignments: [] }] };
  assert.equal(api.matchPerson(sheet, '  a.o   oguntuase ').status, 'matched');
  assert.equal(api.matchPerson(sheet, 'AO Oguntuase').status, 'no-match');
  assert.equal(api.matchPerson(sheet, 'Afolabi Oguntuase').status, 'no-match');
});

test('parses a conventional staff/date/shift table', () => {
  const grid = [
    ['Staff Name', 'Date', 'Shift Type', 'Start Time', 'End Time', 'Ward'],
    ['A.O Oguntuase', '15/11/2026', 'Long Day', '08:00', '20:00', 'Ward 4'],
    ['Jane Smith', '16/11/2026', 'Night', '20:00', '08:00', 'Ward 2']
  ];
  const sheet = api.inspectGrid('Rota', grid);
  assert.equal(sheet.layout, 'staff-in-rows');
  const match = api.matchPerson(sheet, 'A.O Oguntuase');
  assert.equal(match.status, 'matched');
  assert.deepEqual(JSON.parse(JSON.stringify(match.person.assignments[0])), {
    shift_date: '2026-11-15', shift_type: 'Long Day', start_time: '08:00:00',
    end_time: '20:00:00', ward: 'Ward 4'
  });
});

test('parses dates across columns and extracts only the explicitly matched staff row', () => {
  const grid = [
    ['Staff Name', '15/11/2026', '16/11/2026', '17/11/2026'],
    ['A.O Oguntuase', 'LD', 'N', 'OFF'],
    ['Jane Smith', 'N', 'LD', 'LD']
  ];
  const sheet = api.inspectGrid('November', grid);
  assert.equal(sheet.layout, 'dates-across-columns');
  const match = api.matchPerson(sheet, 'A.O Oguntuase');
  assert.equal(match.status, 'matched');
  assert.deepEqual(match.person.assignments.map(item => item.shift_type), ['LD', 'N']);
  assert.deepEqual(match.person.assignments.map(item => item.shift_date), ['2026-11-15', '2026-11-16']);
});

test('parses staff names in columns against dates down rows', () => {
  const grid = [
    ['Date', 'A.O Oguntuase', 'Jane Smith'],
    ['15/11/2026', 'LD', 'N'],
    ['16/11/2026', 'N', 'OFF'],
    ['17/11/2026', 'OFF', 'LD']
  ];
  const sheet = api.inspectGrid('Team', grid);
  assert.equal(sheet.layout, 'staff-in-columns');
  const match = api.matchPerson(sheet, 'A.O Oguntuase');
  assert.equal(match.status, 'matched');
  assert.deepEqual(match.person.assignments.map(item => item.shift_type), ['LD', 'N']);
});

test('deduplicates exact duplicate assignments without merging different shifts', () => {
  const a = { shift_date: '2026-11-15', shift_type: 'LD', start_time: '08:00', end_time: '20:00', ward: 'Ward 4' };
  const b = { ...a };
  const c = { ...a, shift_type: 'Night' };
  const result = api.deduplicate([a, b, c]);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.duplicateCount, 1);
});

test('validates calendar dates and parses time ranges', () => {
  assert.equal(api.validDate('2026-11-15'), true);
  assert.equal(api.validDate('2026-02-30'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(api.clockRange('7am to 7pm'))),
    { start: '07:00:00', end: '19:00:00' });
});
