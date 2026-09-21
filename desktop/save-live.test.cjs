const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeLivePair } = require('./save-live.cjs');
test('pair collision reserves matching names without overwriting either resource', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-pair-'));
  try {
    await fs.writeFile(path.join(dir, 'test.mov'), 'original');
    const jpg = new Uint8Array([255, 216, 255, 217]);
    const mov = new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]);
    const stem = await writeLivePair(dir, 'test', jpg, mov);
    assert.equal(stem, 'test-1');
    assert.equal(await fs.readFile(path.join(dir, 'test.mov'), 'utf8'), 'original');
    assert.deepEqual((await fs.readdir(dir)).sort(), ['test-1.jpg', 'test-1.mov', 'test.mov']);
    await assert.rejects(writeLivePair(dir, '../escape', jpg, mov));
    await assert.rejects(writeLivePair(dir, 'bad', new Uint8Array(), mov));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
