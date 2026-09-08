import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustPixels, defaultColor } from './color.ts';

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
