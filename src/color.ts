export type ColorSettings = {
  enabled: boolean;
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
  lutEnabled: boolean;
  lutId: string;
  intensity: number;
};

export const defaultColor: ColorSettings = {
  enabled: false, hue: 50, saturation: 50, brightness: 50, contrast: 50,
  lutEnabled: false, lutId: '', intensity: 100,
};

export type Cube = { size: number; data: Float32Array; min: number[]; max: number[] };
const unit = (value: number) => Math.max(0, Math.min(1, value));

export function adjustPixels(pixels: Uint8ClampedArray, settings: ColorSettings, lut?: Cube) {
  if (!settings.enabled) return;
  const angle = (settings.hue - 50) * Math.PI / 50;
  const c = Math.cos(angle), s = Math.sin(angle);
  // CSS hue-rotation matrix, applied in the same sRGB space as the input canvas.
  const matrix = [
    .213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s,
    .213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s,
    .213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s,
  ];
  const saturation = settings.saturation / 50;
  const brightness = settings.brightness / 50;
  const contrast = settings.contrast / 50;
  const strength = settings.lutEnabled && lut ? settings.intensity / 100 : 0;
  const neutral = settings.hue === 50 && settings.saturation === 50 && settings.brightness === 50 && settings.contrast === 50;
  if (neutral && !strength) return;
  const rgb = new Float64Array(3);
  const result = new Float64Array(3);
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    if (!neutral) {
      const hr = matrix[0] * r + matrix[1] * g + matrix[2] * b;
      const hg = matrix[3] * r + matrix[4] * g + matrix[5] * b;
      const hb = matrix[6] * r + matrix[7] * g + matrix[8] * b;
      const gray = .2126 * hr + .7152 * hg + .0722 * hb;
      r = unit(((gray + (hr - gray) * saturation) * brightness - .5) * contrast + .5);
      g = unit(((gray + (hg - gray) * saturation) * brightness - .5) * contrast + .5);
      b = unit(((gray + (hb - gray) * saturation) * brightness - .5) * contrast + .5);
    }
    if (strength && lut) {
      rgb[0] = r; rgb[1] = g; rgb[2] = b;
      sampleCube(lut, rgb, result);
      r += (result[0] - r) * strength;
      g += (result[1] - g) * strength;
      b += (result[2] - b) * strength;
    }
    pixels[i] = unit(r) * 255;
    pixels[i + 1] = unit(g) * 255;
    pixels[i + 2] = unit(b) * 255;
  }
}

function sampleCube(lut: Cube, rgb: Float64Array, result: Float64Array) {
  const { size, data, min, max } = lut;
  const x = unit((rgb[0] - min[0]) / (max[0] - min[0])) * (size - 1);
  const y = unit((rgb[1] - min[1]) / (max[1] - min[1])) * (size - 1);
  const z = unit((rgb[2] - min[2]) / (max[2] - min[2])) * (size - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const dx = x - x0, dy = y - y0, dz = z - z0;
  result.fill(0);
  // Cube files store red fastest; interpolate the eight surrounding samples.
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const index = (Math.min(x0 + i, size - 1) + size * (Math.min(y0 + j, size - 1) + size * Math.min(z0 + k, size - 1))) * 4;
    const weight = (i ? dx : 1 - dx) * (j ? dy : 1 - dy) * (k ? dz : 1 - dz);
    result[0] += data[index] * weight;
    result[1] += data[index + 1] * weight;
    result[2] += data[index + 2] * weight;
  }
}
