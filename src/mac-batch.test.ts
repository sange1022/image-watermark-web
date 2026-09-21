import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MacImportBatch } from './mac-batch.ts';
test('continuation after failure or cancellation never includes confirmed imports', () => {
  const batch = new MacImportBatch();
  assert.deepEqual(batch.queue(['a','b','c']), ['a','b','c']);
  batch.saved('a');
  assert.deepEqual(batch.queue(['a','b','c']), ['b','c']);
  batch.saved('b');
  assert.deepEqual(batch.queue(['a','b','c']), ['c']);
  batch.saved('c');
  assert.equal(batch.remainingCount, 0);
  assert.deepEqual(batch.queue(['a','b']), ['a','b']);
});
test('removed or disabled unsent items leave the resumed batch', () => {
  const batch = new MacImportBatch(); batch.queue(['a','b','c']); batch.saved('a');
  assert.deepEqual(batch.queue(['a','c']), ['c']); batch.remove('c');
  assert.equal(batch.remainingCount, 0);
});
