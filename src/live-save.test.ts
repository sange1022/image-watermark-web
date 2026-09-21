import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveStem, saveLiveToDirectory } from './live-save.ts';

test('browser exports use collision-resistant pair names even when directory listings are stale', async () => {
  const files = new Map<string, Blob>();
  const directory = {
    async *keys() { /* Simulate two tabs seeing the same old directory listing. */ },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create) throw new DOMException('Not found', 'NotFoundError');
      if (!files.has(name)) files.set(name, new Blob());
      return { async createWritable() { return { async write(blob: Blob) { files.set(name, blob); }, async close() {}, async abort() {} }; } };
    },
    async removeEntry(name: string) { files.delete(name); },
  };
  const pair = { jpg: new Uint8Array([1]), mov: new Uint8Array([2]) };
  const results = await Promise.all([saveLiveToDirectory(directory as any, 'test', pair), saveLiveToDirectory(directory as any, 'test', pair)]);
  assert.notEqual(results[0], results[1]);
  assert.equal(files.size, 4);
  for (const stem of results) {
    assert.deepEqual(new Uint8Array(await files.get(`${stem}.jpg`)!.arrayBuffer()), pair.jpg);
    assert.deepEqual(new Uint8Array(await files.get(`${stem}.mov`)!.arrayBuffer()), pair.mov);
  }
});

test('Live Photo names omit underscores and path characters', () => {
  assert.equal(liveStem('a_b/test.jpg', 3, 4), 'a-b-test-3x4-实况');
});
