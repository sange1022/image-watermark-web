import type { ColorSettings } from './color';

let worker: Worker | null = null;
let sequence = 0;
const jobs = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
function request(message: object, transfer: Transferable[] = []): Promise<any> {
  if (!worker) {
    worker = new Worker(new URL('./color.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      jobs.delete(data.id);
      if (data.error) job?.reject(new Error(data.error)); else job?.resolve(data);
    };
    worker.onerror = () => {
      jobs.forEach(job => job.reject(new Error('调色处理失败，请重新打开网页')));
      jobs.clear(); worker?.terminate(); worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    jobs.set(id, { resolve, reject });
    worker!.postMessage({ ...message, id }, transfer);
  });
}

export async function loadCube(file: File, lutId: string): Promise<number> {
  if (!/\.cube$/i.test(file.name)) throw new Error('请选择 .cube 格式的 LUT 文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('LUT 文件不能超过 20 MB');
  const result = await request({ type: 'load', text: await file.text(), lutId });
  return result.size;
}

export async function colorCanvas(canvas: HTMLCanvasElement, settings: ColorSettings) {
  if (!settings.enabled) return;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建调色画布');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { buffer } = await request({ type: 'apply', buffer: pixels.data.buffer, settings }, [pixels.data.buffer]);
  context.putImageData(new ImageData(new Uint8ClampedArray(buffer), canvas.width, canvas.height), 0, 0);
}
