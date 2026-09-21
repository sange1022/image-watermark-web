import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import piexif from 'piexifjs';
import { pairJpeg, addStillTrack, boxes } from './live-metadata.ts';
const jpg = new Uint8Array(readFileSync(new URL('../public/live-photo/metadata.jpg', import.meta.url)));
const mov = new Uint8Array(readFileSync(new URL('../public/live-photo/metadata.mov', import.meta.url)));
const id = '12345678-1234-4567-8910-123456789012';

test('JPEG replaces the maker identifier without sharing stale image dimensions', () => {
  const result = pairJpeg(jpg, jpg, id);
  const exif = piexif.load(Buffer.from(result).toString('binary'));
  assert.ok(exif.Exif[37500].includes(id));
  assert.ok(!exif.Exif[37500].includes('00000000-0000-0000-0000-000000000000'));
  assert.equal(exif.Exif[40962], undefined);
  assert.throws(() => pairJpeg(jpg, jpg, 'bad'));
});

test('box reader rejects truncation and overflowing atom sizes', () => {
  assert.throws(() => boxes(new Uint8Array([0, 0, 0])));
  assert.throws(() => boxes(new Uint8Array([0, 0, 1, 0, 109, 100, 97, 116])));
});

test('metadata adapter rejects unsupported layouts instead of corrupting output', () => {
  assert.throws(() => addStillTrack(new Uint8Array([1, 2]), mov));
});
