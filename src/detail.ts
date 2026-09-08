import { imageDataRGB } from 'stackblur-canvas';
import type { ColorSettings } from './color.ts';

export function adjustDetails(pixels: Uint8ClampedArray, width: number, height: number, settings: ColorSettings, scale = Math.min(width, height) / 1000) {
  if (!settings.enabled || (!settings.clarity && !settings.texture)) return;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = pixels[i * 4] * .2126 + pixels[i * 4 + 1] * .7152 + pixels[i * 4 + 2] * .0722;
  const delta = new Float32Array(luma.length);
  for (const [amount, radius, broad] of [[settings.clarity / 100, 16, true], [settings.texture / 100, 2, false]] as const) {
    if (!amount) continue;
    const blurred = new Uint8ClampedArray(pixels.length);
    // Blur premultiplied luminance and coverage together to avoid transparent-edge halos.
    for (let i = 0; i < luma.length; i++) {
      blurred[i * 4] = luma[i] * pixels[i * 4 + 3] / 255;
      blurred[i * 4 + 1] = pixels[i * 4 + 3];
    }
    imageDataRGB({ data: blurred, width, height } as ImageData, 0, 0, width, height, Math.min(128, Math.max(1, Math.round(radius * scale))));
    for (let i = 0; i < luma.length; i++) {
      const coverage = blurred[i * 4 + 1];
      if (!coverage || !pixels[i * 4 + 3]) continue;
      const raw = luma[i] - blurred[i * 4] * 255 / coverage;
      const difference = Math.sign(raw) * Math.max(0, Math.abs(raw) - 255 / coverage);
      const detail = broad ? difference * (1 - Math.abs(luma[i] - 127.5) / 127.5) : difference * Math.abs(difference) / (Math.abs(difference) + 3);
      delta[i] += Math.max(-32, Math.min(32, detail)) * amount;
    }
  }
  for (let i = 0; i < luma.length; i++) {
    if (!pixels[i * 4 + 3]) continue;
    // The same luminance offset preserves chroma; the original alpha is untouched.
    for (let channel = 0; channel < 3; channel++) pixels[i * 4 + channel] += delta[i];
  }
}
