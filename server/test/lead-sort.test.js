import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LEAD_SORT, LEAD_SORTS, sortLeads } from '../../shared/domain.js';

// One function orders people for the Leads tab and for the leads report PDF, so the two cannot disagree.

const at = (name, firstVisitAt, savedHomeIds = []) => ({ name, firstVisitAt, savedHomeIds });
const names = (list) => list.map((l) => l.name);

test('the sorts are the ones the Leads tab offers, and the default is the newest first', () => {
  assert.deepEqual(Object.keys(LEAD_SORTS), ['recent', 'stars']);
  assert.equal(DEFAULT_LEAD_SORT, 'recent');
  assert.equal(LEAD_SORTS.recent.label, 'Recent');
  assert.equal(LEAD_SORTS.stars.label, 'Most ★');
  assert.equal(LEAD_SORTS.recent.report, 'Newest first');
  assert.equal(LEAD_SORTS.stars.report, 'Most saved homes first');
});

test('recent: the newest sign-up first, however the list came in', () => {
  const list = [at('b', '2026-10-02T10:00:00Z'), at('c', '2026-10-03T10:00:00Z'), at('a', '2026-10-01T10:00:00Z')];
  assert.deepEqual(names(sortLeads(list, 'recent')), ['c', 'b', 'a']);
  assert.deepEqual(names(sortLeads(list)), ['c', 'b', 'a'], 'and that is the default');
  assert.deepEqual(names(sortLeads(list, 'nonsense')), ['c', 'b', 'a'], 'an unknown order is the default too');
});

test('recent: two people who signed up at the same moment keep the later one first (the lists come oldest first)', () => {
  const same = '2026-10-02T10:00:00Z';
  assert.deepEqual(names(sortLeads([at('first', same), at('second', same), at('third', same)])), ['third', 'second', 'first']);
});

test('stars: the most saved homes first, and the newest first among those with the same number', () => {
  const list = [
    at('one-old', '2026-10-01T10:00:00Z', ['h1']), at('none', '2026-10-09T10:00:00Z'), at('three', '2026-10-02T10:00:00Z', ['h1', 'h2', 'h3']),
    at('one-new', '2026-10-05T10:00:00Z', ['h2']), at('two', '2026-10-03T10:00:00Z', ['h1', 'h2']),
  ];
  assert.deepEqual(names(sortLeads(list, 'stars')), ['three', 'two', 'one-new', 'one-old', 'none']);
});

test('a missing or unreadable sign-up time goes last, and nothing throws on odd records', () => {
  const list = [at('nodate', null), at('bad', 'not a date'), at('real', '2026-10-01T10:00:00Z'), { name: 'bare' }];
  assert.equal(sortLeads(list, 'recent')[0].name, 'real');
  assert.equal(sortLeads(list, 'stars').length, 4);
  assert.deepEqual(sortLeads(undefined), []);
  assert.deepEqual(sortLeads([]), []);
});

test('it returns a new list and leaves the one it was given alone', () => {
  const list = [at('a', '2026-10-01T10:00:00Z'), at('b', '2026-10-02T10:00:00Z')];
  const copy = [...list];
  const sorted = sortLeads(list, 'recent');
  assert.notStrictEqual(sorted, list);
  assert.deepEqual(list, copy);
});
