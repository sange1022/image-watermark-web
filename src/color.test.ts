import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustPixels, defaultColor } from './color.ts';
import { adjustDetails } from './detail.ts';

const identity = new Float32Array(32);
for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) identity.set([r, g, b, 1], (r + 2 * g + 4 * b) * 4);
const cube = { size: 2, data: identity, min: [0, 0, 0], max: [1, 1, 1] };
const original = new Uint8ClampedArray([23, 127, 218, 99, 255, 0, 0, 255]);

test('disabled and neutral adjustments preserve every input byte', () => {
  for (const settings of [{ ...defaultColor, brightness: 0 }, { ...defaultColor, enabled: true }]) {
    const pixels = original.slice();
    adjustPixels(pixels, settings);
    assert.deepEqual(pixels, original);
  }
});

test('identity LUT interpolates channels in Cube order without altering alpha', () => {
  const pixels = original.slice();
  adjustPixels(pixels, { ...defaultColor, enabled: true, lutEnabled: true }, cube);
  assert.deepEqual(pixels, original);
});

test('LUT strength interpolates between adjusted image and LUT result', () => {
  const black = { ...cube, data: new Float32Array(32) };
  for (const intensity of [0, 50, 100]) {
    const pixels = new Uint8ClampedArray([200, 100, 40, 128]);
    adjustPixels(pixels, { ...defaultColor, enabled: true, lutEnabled: true, intensity }, black);
    assert.deepEqual([...pixels], [200, 100, 40].map(v => v * (1 - intensity / 100)).concat(128));
  }
});

test('saturation and brightness controls modify RGB while preserving alpha', () => {
  const pixels = original.slice();
  adjustPixels(pixels, { ...defaultColor, enabled: true, saturation: 0 });
  assert.equal(pixels[0], pixels[1]); assert.equal(pixels[1], pixels[2]);
  adjustPixels(pixels, { ...defaultColor, enabled: true, brightness: 0 });
  assert.deepEqual([...pixels], [0, 0, 0, 99, 0, 0, 0, 255]);
});

test('custom input domain is normalized before LUT interpolation', () => {
  const pixels = new Uint8ClampedArray([0, 255, 0, 255]);
  adjustPixels(pixels, { ...defaultColor, enabled: true, lutEnabled: true }, { ...cube, min: [-1, -1, -1], max: [1, 1, 1] });
  assert.deepEqual([...pixels], [128, 255, 128, 255]);
});

test('hue shifts color and zero contrast produces midgray', () => {
  const pixels = original.slice();
  adjustPixels(pixels, { ...defaultColor, enabled: true, hue: 75 });
  assert.notDeepEqual(pixels, original);
  assert.equal(pixels[3], 99);
  adjustPixels(pixels, { ...defaultColor, enabled: true, contrast: 0 });
  assert.deepEqual([...pixels], [128, 128, 128, 99, 128, 128, 128, 255]);
});

test('detail controls start at zero and zero or disabled effects preserve bytes', () => {
  assert.equal(defaultColor.clarity, 0); assert.equal(defaultColor.texture, 0);
  for (const settings of [{ ...defaultColor, enabled: true }, { ...defaultColor, clarity: 100, texture: 100 }]) {
    const pixels = original.slice();
    adjustDetails(pixels, 2, 1, settings);
    assert.deepEqual(pixels, original);
  }
});

test('clarity and texture enhance different spatial scales and preserve alpha', () => {
  const source = new Uint8ClampedArray(64 * 32 * 4);
  for (let i = 0; i < 64 * 32; i++) {
    const x = i % 64;
    const v = 100 + (x > 32 ? 40 : 0) + (x % 3 === 0 ? 10 : -10);
    source.set([v, v, v, 255], i * 4);
  }
  const clarity = source.slice(), texture = source.slice();
  adjustDetails(clarity, 64, 32, { ...defaultColor, enabled: true, clarity: 100 }, 1);
  adjustDetails(texture, 64, 32, { ...defaultColor, enabled: true, texture: 100 }, 1);
  assert.notDeepEqual(clarity, source); assert.notDeepEqual(texture, source); assert.notDeepEqual(clarity, texture);
  for (let i = 3; i < source.length; i += 4) { assert.equal(clarity[i], source[i]); assert.equal(texture[i], source[i]); }
});

test('flat colors and transparent pixels stay unchanged at maximum detail', () => {
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) pixels.set(i < 128 ? [200, 100, 40, 128] : [240, 40, 90, 0], i * 4);
  const before = pixels.slice();
  adjustDetails(pixels, 16, 16, { ...defaultColor, enabled: true, clarity: 100, texture: 100 }, 1);
  assert.deepEqual(pixels, before);
});
