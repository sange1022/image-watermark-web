import { Output, MovOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from 'mediabunny';
import { drawLiveFrame, liveDuration, liveFps, type LiveEffect } from './live-motion';
import { addStillTrack, pairJpeg } from './live-metadata';

let fixturePromise: Promise<Uint8Array[]> | undefined;
function fixtures() {
  if (!fixturePromise) fixturePromise = Promise.all(['metadata.jpg', 'metadata.mov'].map(async name => {
    const response = await fetch(`${import.meta.env.BASE_URL}live-photo/${name}`);
    if (!response.ok) throw new Error('实况资源加载失败，请重试');
    return new Uint8Array(await response.arrayBuffer());
  })).catch(error => { fixturePromise = undefined; throw error; });
  return fixturePromise;
}

export async function encodeLivePhoto(source: HTMLCanvasElement, effect: LiveEffect, overlay: (context: CanvasRenderingContext2D) => void, isCancelled: () => boolean, progress: (value: number) => void) {
  const { width, height } = source;
  if (!await canEncodeVideo('avc', { width, height, bitrate: 8_000_000, frameRate: liveFps })) throw new Error('当前环境不支持 H.264 实况编码，请使用最新版 Chrome、Edge 或桌面版');
  const [jpegFixture, movieFixture] = await fixtures();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const output = new Output({ format: new MovOutputFormat({ fastStart: false }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: 8_000_000, keyFrameInterval: 1 });
  output.addVideoTrack(video, { frameRate: liveFps });
  let cover: Blob | null = null;
  const checkCancel = () => { if (isCancelled()) throw new DOMException('已取消', 'AbortError'); };
  try {
    checkCancel();
    await output.start();
    for (let frame = 0; frame < liveDuration * liveFps; frame++) {
      checkCancel();
      drawLiveFrame(context, source, effect, frame / liveFps, overlay);
      if (frame === 45) cover = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      await video.add(frame / liveFps, 1 / liveFps);
      progress((frame + 1) / (liveDuration * liveFps));
      if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    await output.finalize();
    checkCancel();
    if (!cover || !output.target.buffer) throw new Error('实况编码失败');
    const id = crypto.randomUUID();
    return {
      jpg: pairJpeg(new Uint8Array(await cover.arrayBuffer()), jpegFixture, id),
      mov: addStillTrack(new Uint8Array(output.target.buffer), movieFixture, id),
    };
  } finally {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
  }
}
