import { useEffect, useRef, useState } from 'react';
import { drawLiveFrame, liveDuration, type LiveEffect } from './live-motion';

export type LiveScene = { source: HTMLCanvasElement; overlay: (context: CanvasRenderingContext2D) => void };
export function LivePreview({ prepare, effect, onError }: { prepare: () => Promise<LiveScene>; effect: LiveEffect; onError: (message: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    setLoading(true);
    void prepare().then(({ source, overlay }) => {
      if (disposed || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext('2d')!;
      setLoading(false);
      const start = performance.now();
      const tick = (now: number) => {
        if (disposed) return;
        drawLiveFrame(context, source, effect, ((now - start) / 1000) % liveDuration, overlay);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }).catch(error => { if (!disposed) onError(error instanceof Error ? error.message : String(error)); });
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, [prepare, effect, onError]);
  return <div className="live-preview">{loading && <span className="preview-busy">实况预览准备中…</span>}<canvas className="live-canvas" ref={canvasRef} aria-label="实况动画预览" /></div>;
}
