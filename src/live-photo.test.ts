import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSize, motionAt, liveEffects } from './live-motion.ts';

test('live video has even dimensions, never upscales, caps long edge at 1920', () => {
  assert.deepEqual(liveSize(3000, 4000), { width: 1440, height: 1920 });
  assert.deepEqual(liveSize(301, 401), { width: 300, height: 400 });
  assert.throws(() => liveSize(0, 100));
});

test('every motion covers the frame throughout three seconds', () => {
  for (const effect of liveEffects) {
    for (let frame = 0; frame < 90; frame++) {
      const { scale, x, y } = motionAt(effect.id, frame / 30);
      assert.ok(scale >= 1);
      assert.ok(Math.abs(x) <= (scale - 1) / 2 + 1e-8);
      assert.ok(Math.abs(y) <= (scale - 1) / 2 + 1e-8);
    }
    assert.notDeepEqual(motionAt(effect.id, 0), motionAt(effect.id, 0.7));
  }
});
