export const liveEffects = [
  { id: 'zoom-in', label: '缓慢放大' },
  { id: 'zoom-out', label: '缓慢缩小' },
  { id: 'pan', label: '左右轻移' },
  { id: 'shake', label: '轻微摇晃' },
] as const;
export type LiveEffect = typeof liveEffects[number]['id'];
export type LiveSettings = { enabled: boolean; effect: LiveEffect };
export const defaultLive: LiveSettings = { enabled: false, effect: 'zoom-in' };
export const liveDuration = 3;
export const liveFps = 30;

export function liveSize(width: number, height: number) {
  if (![width, height].every(n => Number.isFinite(n) && n >= 2)) throw new Error('实况照片宽高至少为 2 像素');
  const factor = Math.min(1, 1920 / Math.max(width, height));
  const result = { width: Math.floor(width * factor / 2) * 2, height: Math.floor(height * factor / 2) * 2 };
  if (!result.width || !result.height) throw new Error('图片比例过于狭长，无法导出实况');
  return result;
}

export function motionAt(effect: LiveEffect, seconds: number) {
  const t = Math.max(0, Math.min(1, seconds / liveDuration));
  const ease = t * t * (3 - 2 * t);
  if (effect === 'zoom-in') return { scale: 1 + 0.08 * ease, x: 0, y: 0 };
  if (effect === 'zoom-out') return { scale: 1.08 - 0.08 * ease, x: 0, y: 0 };
  if (effect === 'pan') return { scale: 1.08, x: (ease - 0.5) * 0.07, y: 0 };
  return { scale: 1.06, x: Math.sin(t * Math.PI * 4) * 0.012, y: Math.sin(t * Math.PI * 6) * 0.008 };
}

export function drawLiveFrame(context: CanvasRenderingContext2D, source: HTMLCanvasElement, effect: LiveEffect, time: number, overlay?: (context: CanvasRenderingContext2D) => void) {
  const { width, height } = context.canvas;
  const { scale, x, y } = motionAt(effect, time);
  context.clearRect(0, 0, width, height);
  context.drawImage(source, width * (1 - scale) / 2 + width * x, height * (1 - scale) / 2 + height * y, width * scale, height * scale);
  overlay?.(context);
}
