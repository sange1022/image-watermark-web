import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { FloatType } from 'three';
import { adjustPixels, type Cube } from './color';
import { adjustDetails } from './detail';

const cubes = new Map<string, Cube>();
self.onmessage = ({ data: message }) => {
  const { id } = message;
  try {
    if (message.type === 'load') {
      const lines: string[] = message.text.split(/\r?\n/).map((line: string) => line.split('#')[0].trim().replace(/\s+/g, ' ')).filter(Boolean);
      const sizes = lines.filter(line => line.startsWith('LUT_3D_SIZE '));
      const size = Number(sizes[0]?.split(' ')[1]);
      if (sizes.length !== 1 || !Number.isInteger(size) || size < 2 || size > 65 || lines.some(line => line.startsWith('LUT_1D'))) throw new Error('仅支持 2 至 65 阶的 3D .cube LUT');
      const rows = lines.filter(line => !/^(TITLE |LUT_3D_SIZE |DOMAIN_MIN |DOMAIN_MAX )/.test(line));
      if (rows.length !== size ** 3 || rows.some(line => {
        const values = line.split(' ');
        return values.length !== 3 || values.some(value => !Number.isFinite(Number(value)));
      })) throw new Error('LUT 数据不完整或包含无效数值');
      const domain = (key: string, fallback: number[]) => {
        const entries = lines.filter(line => line.startsWith(key + ' '));
        if (entries.length > 1) throw new Error('LUT 输入范围重复');
        return entries.length ? entries[0].split(' ').slice(1).map(Number) : fallback;
      };
      const min = domain('DOMAIN_MIN', [0, 0, 0]), max = domain('DOMAIN_MAX', [1, 1, 1]);
      if (min.length !== 3 || max.length !== 3 || min.some((v, i) => !Number.isFinite(v) || !Number.isFinite(max[i]) || v >= max[i])) throw new Error('LUT 输入范围无效');
      const parsed = new LUTCubeLoader().setType(FloatType).parse(`LUT_3D_SIZE ${size}\n${rows.map(line => line.split(' ').map(Number).join(' ')).join('\n')}`);
      const cube = { size, data: parsed.texture3D.image.data as Float32Array, min, max };
      if (cube.data.some(value => !Number.isFinite(value))) throw new Error('LUT 数值超出范围');
      cubes.set(message.lutId, cube);
      parsed.texture3D.dispose();
      self.postMessage({ id, size });
    } else {
      const lut = cubes.get(message.settings.lutId);
      if (message.settings.enabled && message.settings.lutEnabled && !lut) throw new Error('请先导入 LUT 文件');
      const pixels = new Uint8ClampedArray(message.buffer);
      adjustPixels(pixels, message.settings, lut);
      adjustDetails(pixels, message.width, message.height, message.settings, message.detailScale);
      self.postMessage({ id, buffer: pixels.buffer }, { transfer: [pixels.buffer] });
    }
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
