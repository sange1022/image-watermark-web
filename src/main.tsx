import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import {
  Aperture,
  Brain,
  Check,
  Download,
  Eraser,
  FolderOpen,
  ImagePlus,
  LocateFixed,
  Move,
  RotateCcw,
  Trash2,
  Upload,
  Undo2,
  X,
} from 'lucide-react';
import './styles.css';
import { defaultColor, type ColorSettings } from './color';
import { colorCanvas, loadCube } from './color-client';

const builtinLut = { id: 'builtin-qingyu-0065', name: '青鱼表现0065', size: 32 };
const builtinLutUrl = new URL('./presets/qingyu-0065.cube', import.meta.url).href;

type AspectRatio = { label: string; tag: string; width: number; height: number };
type CropRect = { x: number; y: number; width: number; height: number };
type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';
type WatermarkSizeMode = 'percent' | 'pixels';

type PhotoItem = {
  id: string;
  file: File;
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  crop: CropRect;
  status: string;
  color: ColorSettings;
};

type ExportSize = { width: number; height: number };

type WatermarkSettings = {
  enabled: boolean;
  position: WatermarkPosition;
  sizeMode: WatermarkSizeMode;
  sizeValue: number;
  opacity: number;
  margin: number;
  customX: number;
  customY: number;
};

const aspectRatios: AspectRatio[] = [
  { label: '1 : 1（方形）', tag: '1:1', width: 1, height: 1 },
  { label: '2 : 3（竖向）', tag: '2:3', width: 2, height: 3 },
  { label: '3 : 4（竖向）', tag: '3:4', width: 3, height: 4 },
  { label: '4 : 5（竖向）', tag: '4:5', width: 4, height: 5 },
  { label: '9 : 16（竖向）', tag: '9:16', width: 9, height: 16 },
  { label: '3 : 2（横向）', tag: '3:2', width: 3, height: 2 },
  { label: '4 : 3（横向）', tag: '4:3', width: 4, height: 3 },
  { label: '16 : 9（横向）', tag: '16:9', width: 16, height: 9 },
];

const positionOptions: { label: string; value: WatermarkPosition }[] = [
  { label: '左上', value: 'top-left' },
  { label: '上方居中', value: 'top-center' },
  { label: '右上', value: 'top-right' },
  { label: '左侧居中', value: 'middle-left' },
  { label: '正中', value: 'center' },
  { label: '右侧居中', value: 'middle-right' },
  { label: '左下', value: 'bottom-left' },
  { label: '下方居中', value: 'bottom-center' },
  { label: '右下', value: 'bottom-right' },
  { label: '自由位置', value: 'custom' },
];

const defaultWatermark: WatermarkSettings = {
  enabled: false,
  position: 'bottom-right',
  sizeMode: 'percent',
  sizeValue: 20,
  opacity: 100,
  margin: 30,
  customX: 0.78,
  customY: 0.78,
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

const settingsKey = 'watermark-settings-v1';
function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(settingsKey) || 'null');
    if (value?.version !== 1) return null;
    if (!value.aspectRatio || !Number.isFinite(value.aspectRatio.width) || !Number.isFinite(value.aspectRatio.height) || value.aspectRatio.width <= 0 || value.aspectRatio.height <= 0) return null;
    return value;
  } catch { return null; }
}

function App() {
  const [saved] = useState(readSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const lutInputRef = useRef<HTMLInputElement>(null);
  const [luts, setLuts] = useState<{ id: string; name: string; size: number }[]>([builtinLut]);
  const builtinLoaded = useRef(false);
  const [lutLoading, setLutLoading] = useState(false);
  const [colorError, setColorError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const colorPreview = useRef<{ photoId: string; canvas: HTMLCanvasElement } | null>(null);
  const previewGeneration = useRef(0);
  const previewWorking = useRef(false);
  const pendingPreview = useRef<(() => void) | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(saved?.aspectRatio ?? aspectRatios[2]);
  const [cropMode, setCropMode] = useState<'smart' | 'center'>(saved?.cropMode ?? 'smart');
  const [customRatio, setCustomRatio] = useState(saved?.customRatio ?? { width: 5, height: 7 });
  const [customSize, setCustomSize] = useState(saved?.customSize ?? { width: 1200, height: 1600 });
  const [sizeIndex, setSizeIndex] = useState(saved?.sizeIndex ?? 1);
  const [format, setFormat] = useState<'jpg' | 'png' | 'webp'>(saved?.format ?? 'jpg');
  const [watermark, setWatermark] = useState<WatermarkSettings>({ ...defaultWatermark, ...saved?.watermark, enabled: false });
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState('');
  const [watermarkImage, setWatermarkImage] = useState<HTMLImageElement | null>(null);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [status, setStatus] = useState('准备就绪');
  const [exportProgress, setExportProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const cancelled = useRef(false);
  const [failures, setFailures] = useState<{ id: string; name: string; reason: string }[]>([]);
  const [history, setHistory] = useState<{ id: string; crop: CropRect }[]>([]);
  const resources = useRef(new Set<string>());
  const [dragState, setDragState] = useState<
    | { type: 'crop'; startX: number; startY: number; crop: CropRect }
    | { type: 'resize'; corner: number; crop: CropRect }
    | { type: 'watermark'; startX: number; startY: number; settings: WatermarkSettings }
    | null
  >(null);

  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? null;
  const color = selectedPhoto?.color ?? defaultColor;
  const sizePresets = useMemo(() => getPresetSizes(aspectRatio), [aspectRatio]);
  const exportSize = sizeIndex < sizePresets.length ? sizePresets[sizeIndex] : customSize;
  const canUseDirectoryPicker = typeof window.showDirectoryPicker === 'function';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(settingsKey, JSON.stringify({ version: 1, aspectRatio, cropMode, customRatio, customSize, sizeIndex, format, watermark })); } catch { /* Storage may be unavailable in private sessions. */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [aspectRatio, cropMode, customRatio, customSize, sizeIndex, format, watermark]);

  useEffect(() => {
    drawPreview();
  }, [selectedPhoto, watermark, watermarkImage, exportSize, previewRevision]);

  useEffect(() => {
    const generation = ++previewGeneration.current;
    pendingPreview.current = null;
    setColorError('');
    if (!selectedPhoto || !color.enabled) { setPreviewBusy(false); return; }
    const photo = selectedPhoto;
    setPreviewBusy(true);
    const run = async () => {
      previewWorking.current = true;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1000 / Math.max(photo.width, photo.height));
        canvas.width = Math.max(1, Math.round(photo.width * scale));
        canvas.height = Math.max(1, Math.round(photo.height * scale));
        canvas.getContext('2d')!.drawImage(photo.image, 0, 0, canvas.width, canvas.height);
        await colorCanvas(canvas, photo.color);
        if (generation === previewGeneration.current) {
          colorPreview.current = { photoId: photo.id, canvas };
          setPreviewRevision(value => value + 1);
        }
      } catch (error) {
        if (generation === previewGeneration.current) setColorError(error instanceof Error ? error.message : String(error));
      } finally {
        previewWorking.current = false;
        if (generation === previewGeneration.current) setPreviewBusy(false);
        const next = pendingPreview.current;
        pendingPreview.current = null;
        next?.();
      }
    };
    // Keep only the latest slider state while a preview is being processed.
    const frame = requestAnimationFrame(() => {
      if (previewWorking.current) pendingPreview.current = run; else void run();
    });
    return () => { cancelAnimationFrame(frame); previewGeneration.current++; pendingPreview.current = null; };
  }, [selectedPhoto?.id, selectedPhoto?.image, color]);

  useEffect(() => {
    const onResize = () => drawPreview();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  useEffect(() => {
    return () => {
      resources.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedPhoto || exportLock.current || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]'))) return;
      const index = photos.findIndex((photo) => photo.id === selectedPhoto.id);
      if (event.key === 'ArrowLeft' && index > 0) setSelectedId(photos[index - 1].id);
      if (event.key === 'ArrowRight' && index < photos.length - 1) setSelectedId(photos[index + 1].id);
      if (event.key.toLowerCase() === 'r') centerSelectedCrop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photos, selectedPhoto, aspectRatio]);

  const updatePhoto = useCallback((id: string, updater: (photo: PhotoItem) => PhotoItem) => {
    setPhotos((items) => items.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  async function addFiles(fileList: FileList | File[]) {
    if (exportLock.current) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      setStatus('没有找到可读取的图片。');
      return;
    }

    const loaded: PhotoItem[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus(`正在读取 ${index + 1}/${files.length}：${file.name}`);
      const url = URL.createObjectURL(file);
      resources.current.add(url);
      let image: HTMLImageElement;
      try { image = await loadImage(url); } catch { URL.revokeObjectURL(url); resources.current.delete(url); setStatus(`无法读取：${file.name}`); continue; }
      const crop = cropMode === 'smart' ? createSmartCrop(image, aspectRatio) : createCenteredCrop(image.width, image.height, aspectRatio);
      loaded.push({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        name: file.name,
        url,
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        crop,
        status: '已载入',
        color: { ...defaultColor },
      });
    }

    setPhotos((items) => {
      const existing = new Set(items.map((item) => `${item.name}:${item.file.size}`));
      return [...items, ...loaded.filter((item) => !existing.has(`${item.name}:${item.file.size}`))];
    });
    setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    setStatus(`已载入 ${photos.length + loaded.length} 张图片`);
  }

  function removeSelected() {
    if (!selectedPhoto) return;
    const index = photos.findIndex((photo) => photo.id === selectedPhoto.id);
    setPhotos((items) => items.filter((item) => item.id !== selectedPhoto.id));
    URL.revokeObjectURL(selectedPhoto.url);
    const next = photos[index + 1] ?? photos[index - 1] ?? null;
    setSelectedId(next?.id ?? null);
    setHistory((items) => items.filter((item) => item.id !== selectedPhoto.id));
    setFailures((items) => items.filter((item) => item.id !== selectedPhoto.id));
  }

  function clearPhotos() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setSelectedId(null);
    setHistory([]);
    setFailures([]);
    setExportProgress(0);
    setStatus('已清空图片列表');
  }

  function centerSelectedCrop() {
    if (!selectedPhoto) return;
    rememberCrop();
    updatePhoto(selectedPhoto.id, (photo) => ({
      ...photo,
      crop: createCenteredCrop(photo.width, photo.height, aspectRatio),
      status: '已居中',
    }));
    setStatus('裁剪框已居中');
  }

  function smartCropSelected() {
    if (!selectedPhoto) return;
    rememberCrop();
    updatePhoto(selectedPhoto.id, (photo) => ({
      ...photo,
      crop: createSmartCrop(photo.image, aspectRatio),
      status: '已智能定位',
    }));
    setStatus('已完成离线主体定位');
  }

  function applyAspectRatio(next: AspectRatio) {
    if (![next.width, next.height].every((value) => Number.isFinite(value) && value > 0 && value <= 1000)) { setStatus('比例请输入 1 至 1000 之间的有效数值'); return; }
    setAspectRatio(next);
    setSizeIndex(1);
    setCustomSize(getPresetSizes(next)[1]);
    setHistory([]);
    setPhotos((items) =>
      items.map((item) => ({
        ...item,
        crop: cropMode === 'smart' ? createSmartCrop(item.image, next) : createCenteredCrop(item.width, item.height, next),
      })),
    );
    setStatus(`已切换为 ${next.tag} 比例`);
  }

  async function chooseOutputFolder() {
    if (!window.showDirectoryPicker) {
      setStatus('当前浏览器不支持直接选择保存文件夹，将使用 ZIP 下载。');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      setStatus(`保存位置：${handle.name}`);
    } catch {
      setStatus('已取消选择保存位置');
    }
  }

  async function handleWatermarkUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    resources.current.add(url);
    let image: HTMLImageElement;
    try { image = await loadImage(url); } catch { URL.revokeObjectURL(url); setStatus('水印图片无法读取，请重新选择'); return; }
    if (watermarkUrl) URL.revokeObjectURL(watermarkUrl);
    setWatermarkFile(file);
    setWatermarkUrl(url);
    setWatermarkImage(image);
    setWatermark((settings) => ({ ...settings, enabled: true }));
    setStatus(`已选择水印：${file.name}`);
  }

  function updateColor(patch: Partial<ColorSettings>) {
    if (!selectedPhoto || exportLock.current) return;
    updatePhoto(selectedPhoto.id, photo => ({ ...photo, color: { ...photo.color, ...patch }, status: '已调整' }));
  }

  async function selectLut(lutId: string) {
    if (!selectedPhoto || lutLoading || exportLock.current) return;
    const photoId = selectedPhoto.id;
    if (lutId !== builtinLut.id || builtinLoaded.current) {
      updateColor({ lutId, lutEnabled: Boolean(lutId), enabled: Boolean(lutId) || color.enabled });
      return;
    }
    setLutLoading(true);
    setColorError('');
    try {
      const response = await fetch(builtinLutUrl);
      if (!response.ok) throw new Error('内置 LUT 加载失败，请重试');
      await loadCube(new File([await response.blob()], 'qingyu-0065.cube'), builtinLut.id);
      builtinLoaded.current = true;
      updatePhoto(photoId, photo => ({ ...photo, color: { ...photo.color, lutId, lutEnabled: true, enabled: true }, status: '已调整' }));
    } catch (error) { setColorError(error instanceof Error ? error.message : String(error)); }
    finally { setLutLoading(false); }
  }

  async function importLut(file: File | undefined) {
    if (!file || !selectedPhoto || lutLoading) return;
    const photoId = selectedPhoto.id;
    setLutLoading(true);
    setColorError('');
    try {
      const id = crypto.randomUUID();
      const size = await loadCube(file, id);
      setLuts(items => [...items, { id, name: file.name, size }]);
      updatePhoto(photoId, photo => ({ ...photo, color: { ...photo.color, lutId: id, lutEnabled: true, enabled: true }, status: '已调整' }));
      setStatus(`已导入 LUT：${file.name}`);
    } catch (error) { setColorError(error instanceof Error ? error.message : String(error)); }
    finally { setLutLoading(false); }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!selectedPhoto || exporting) return;
    const point = getCanvasPoint(event);
    const layout = getPreviewLayout();
    if (!layout) return;
    const cropDisplay = toDisplayRect(selectedPhoto.crop, layout);
    const corners = [[cropDisplay.x, cropDisplay.y], [cropDisplay.x + cropDisplay.width, cropDisplay.y], [cropDisplay.x, cropDisplay.y + cropDisplay.height], [cropDisplay.x + cropDisplay.width, cropDisplay.y + cropDisplay.height]];
    const corner = corners.findIndex(([x, y]) => Math.hypot(point.x - x, point.y - y) <= 18);
    if (corner >= 0) {
      rememberCrop();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({ type: 'resize', corner, crop: selectedPhoto.crop });
      return;
    }
    const watermarkRect = watermarkImage ? getWatermarkRect(watermark, exportSize, watermarkImage) : null;
    if (watermark.enabled && watermarkRect && pointInDisplayRect(point, toDisplayRect(watermarkRect, { left: cropDisplay.x, top: cropDisplay.y, scale: cropDisplay.width / exportSize.width }))) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({ type: 'watermark', startX: point.x, startY: point.y, settings: watermark });
      return;
    }
    if (pointInDisplayRect(point, toDisplayRect(selectedPhoto.crop, layout))) {
      rememberCrop();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({ type: 'crop', startX: point.x, startY: point.y, crop: selectedPhoto.crop });
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!selectedPhoto || !dragState) return;
    const point = getCanvasPoint(event);
    const layout = getPreviewLayout();
    if (!layout) return;
    if (dragState.type === 'resize') {
      const { crop, corner } = dragState;
      const right = corner % 2 === 1;
      const bottom = corner >= 2;
      const ax = right ? crop.x : crop.x + crop.width;
      const ay = bottom ? crop.y : crop.y + crop.height;
      const target = aspectRatio.width / aspectRatio.height;
      const dx = ((point.x - layout.left) / layout.scale - ax) * (right ? 1 : -1);
      const dy = ((point.y - layout.top) / layout.scale - ay) * (bottom ? 1 : -1);
      const maxWidth = Math.min(right ? selectedPhoto.width - ax : ax, (bottom ? selectedPhoto.height - ay : ay) * target);
      const width = clamp((dx + dy / target) / (1 + 1 / (target * target)), Math.min(30, maxWidth), maxWidth);
      const height = width / target;
      updatePhoto(selectedPhoto.id, (photo) => ({ ...photo, crop: { x: right ? ax : ax - width, y: bottom ? ay : ay - height, width, height }, status: '已调整' }));
      return;
    }
    if (dragState.type === 'crop') {
      const dx = (point.x - dragState.startX) / layout.scale;
      const dy = (point.y - dragState.startY) / layout.scale;
      updatePhoto(selectedPhoto.id, (photo) => ({
        ...photo,
        crop: moveCrop(dragState.crop, dx, dy, photo.width, photo.height),
        status: '已调整',
      }));
      return;
    }
    if (dragState.type === 'watermark' && watermarkImage) {
      const cropDisplay = toDisplayRect(selectedPhoto.crop, layout);
      const dx = ((point.x - dragState.startX) * exportSize.width) / cropDisplay.width;
      const dy = ((point.y - dragState.startY) * exportSize.height) / cropDisplay.height;
      const rect = getWatermarkRect(dragState.settings, exportSize, watermarkImage);
      setWatermark(
        moveWatermarkCustom(dragState.settings, rect.x + dx, rect.y + dy, exportSize, watermarkImage),
      );
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (!selectedPhoto || exporting) return;
    rememberCrop();
    const factor = event.deltaY < 0 ? 0.94 : 1.06;
    updatePhoto(selectedPhoto.id, (photo) => ({
      ...photo,
      crop: resizeCropFromCenter(photo.crop, photo.crop.width * factor, photo.width, photo.height, aspectRatio),
      status: '已缩放',
    }));
  }

  function rememberCrop() {
    if (selectedPhoto) setHistory((items) => [...items.slice(-49), { id: selectedPhoto.id, crop: { ...selectedPhoto.crop } }]);
  }

  function undoCrop() {
    const previous = history.at(-1);
    if (!previous) return;
    updatePhoto(previous.id, (photo) => ({ ...photo, crop: previous.crop, status: '已撤销' }));
    setSelectedId(previous.id);
    setHistory((items) => items.slice(0, -1));
  }

  async function exportAll(retryOnly = false) {
    if (exportLock.current) return;
    if (lutLoading) { setStatus('请等待 LUT 导入完成'); return; }
    const queue = retryOnly ? photos.filter((photo) => failures.some((failure) => failure.id === photo.id)) : photos;
    if (queue.length === 0) {
      setStatus('请先添加图片。');
      return;
    }
    if (![exportSize.width, exportSize.height].every((value) => Number.isInteger(value) && value > 0 && value <= 8192) || exportSize.width * exportSize.height > 40000000) { setStatus('导出尺寸须为 1 至 8192 的整数，且总像素不超过 4000 万'); return; }
    if (watermark.enabled && !watermarkImage) { setStatus('请先选择水印图片'); return; }
    exportLock.current = true;
    cancelled.current = false;
    setExporting(true);
    setExportProgress(0);
    setFailures([]);
    const errors: { id: string; name: string; reason: string }[] = [];
    const zip = new JSZip();
    let completed = 0;
    const usedNames = new Set<string>();
    try {

    for (let index = 0; index < queue.length; index += 1) {
      if (cancelled.current) break;
      const photo = queue[index];
      updatePhoto(photo.id, (item) => ({ ...item, status: '正在导出' }));
      try {
        const blob = await renderExport(photo, exportSize, format, watermark, watermarkImage);
        if (cancelled.current) { updatePhoto(photo.id, (item) => ({ ...item, status: '已取消' })); break; }
        const baseName = createOutputName(photo.name, format, aspectRatio);
        let name = baseName;
        let suffix = 1;
        while (true) {
          let exists = usedNames.has(name.toLowerCase());
          if (directoryHandle && !exists) {
            try { await directoryHandle.getFileHandle(name); exists = true; } catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
          }
          if (!exists) break;
          name = baseName.replace(/\.[^.]+$/, `-${suffix++}.${format}`);
        }
        usedNames.add(name.toLowerCase());
        if (directoryHandle) {
          const writable = await directoryHandle.getFileHandle(name, { create: true }).then((handle) => handle.createWritable());
          await writable.write(blob);
          await writable.close();
        } else zip.file(name, blob);
        completed += 1;
        updatePhoto(photo.id, (item) => ({ ...item, status: '已导出' }));
      } catch (error) {
        errors.push({ id: photo.id, name: photo.name, reason: error instanceof Error ? error.message : String(error) });
        setFailures([...errors]);
        updatePhoto(photo.id, (item) => ({ ...item, status: '失败' }));
      }
      setExportProgress(((index + 1) / queue.length) * (directoryHandle ? 100 : 85));
      setStatus(`正在导出 ${index + 1} / ${queue.length} 张`);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    if (!directoryHandle && completed && !cancelled.current) {
      setStatus('正在打包 ZIP');
      const blob = await zip.generateAsync({ type: 'blob' }, ({ percent }) => {
        if (cancelled.current) throw new Error('已取消导出');
        setExportProgress(85 + percent * 0.15);
      });
      if (cancelled.current) return;
      downloadBlob(blob, `水印导出-${new Date().toISOString().slice(0, 10)}.zip`);
    }

    setStatus(
      cancelled.current ? `已取消${directoryHandle ? `，已保存 ${completed} 张` : '，未下载 ZIP'}` : `导出完成：成功 ${completed} 张，失败 ${errors.length} 张${completed ? directoryHandle ? ` · ${directoryHandle.name}` : ' · ZIP 已下载' : ''}`,
    );
    } catch (error) {
      setStatus(cancelled.current ? '已取消导出' : `导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { exportLock.current = false; setExporting(false); }
  }

  function drawPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = previewRef.current;
    const rect = parent?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect?.width ?? 800));
    const height = Math.max(1, Math.floor(rect?.height ?? 600));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#eceef2';
    context.fillRect(0, 0, width, height);
    if (!selectedPhoto) return;
    const layout = getPreviewLayout(width, height);
    if (!layout) return;
    const previewImage = selectedPhoto.color.enabled && colorPreview.current?.photoId === selectedPhoto.id ? colorPreview.current.canvas : selectedPhoto.image;
    context.drawImage(previewImage, layout.left, layout.top, layout.width, layout.height);
    const crop = toDisplayRect(selectedPhoto.crop, layout);
    context.fillStyle = 'rgba(0, 0, 0, 0.40)';
    context.fillRect(0, 0, width, crop.y);
    context.fillRect(0, crop.y + crop.height, width, Math.max(0, height - crop.y - crop.height));
    context.fillRect(0, crop.y, crop.x, crop.height);
    context.fillRect(crop.x + crop.width, crop.y, Math.max(0, width - crop.x - crop.width), crop.height);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(crop.x, crop.y, crop.width, crop.height);
    context.strokeStyle = 'rgba(255,255,255,0.6)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(crop.x + crop.width / 3, crop.y);
    context.lineTo(crop.x + crop.width / 3, crop.y + crop.height);
    context.moveTo(crop.x + (crop.width * 2) / 3, crop.y);
    context.lineTo(crop.x + (crop.width * 2) / 3, crop.y + crop.height);
    context.moveTo(crop.x, crop.y + crop.height / 3);
    context.lineTo(crop.x + crop.width, crop.y + crop.height / 3);
    context.moveTo(crop.x, crop.y + (crop.height * 2) / 3);
    context.lineTo(crop.x + crop.width, crop.y + (crop.height * 2) / 3);
    context.stroke();
    for (const [x, y] of [[crop.x, crop.y], [crop.x + crop.width, crop.y], [crop.x, crop.y + crop.height], [crop.x + crop.width, crop.y + crop.height]]) {
      context.fillStyle = '#ffffff';
      context.fillRect(x - 5, y - 5, 10, 10);
      context.strokeStyle = '#007aff';
      context.strokeRect(x - 5, y - 5, 10, 10);
    }

    if (watermark.enabled && watermarkImage) {
      const wm = toDisplayRect(getWatermarkRect(watermark, exportSize, watermarkImage), {
        left: crop.x,
        top: crop.y,
        scale: crop.width / exportSize.width,
        width: crop.width,
        height: crop.height,
      });
      context.globalAlpha = watermark.opacity / 100;
      context.drawImage(watermarkImage, wm.x, wm.y, wm.width, wm.height);
      context.globalAlpha = 1;
      context.strokeStyle = '#007aff';
      context.strokeRect(wm.x, wm.y, wm.width, wm.height);
    }
  }

  function getPreviewLayout(width?: number, height?: number) {
    if (!selectedPhoto) return null;
    const canvas = canvasRef.current;
    const canvasWidth = width ?? canvas?.clientWidth ?? 1;
    const canvasHeight = height ?? canvas?.clientHeight ?? 1;
    const availableWidth = Math.max(1, canvasWidth - 52);
    const availableHeight = Math.max(1, canvasHeight - 52);
    const scale = Math.min(availableWidth / selectedPhoto.width, availableHeight / selectedPhoto.height);
    const shownWidth = selectedPhoto.width * scale;
    const shownHeight = selectedPhoto.height * scale;
    return {
      left: (canvasWidth - shownWidth) / 2,
      top: (canvasHeight - shownHeight) / 2,
      width: shownWidth,
      height: shownHeight,
      scale,
    };
  }

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  return (
    <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      addFiles(event.dataTransfer.files);
    }}>
      <header className="toolbar panel">
        <div className="brand">
          <div className="brand-mark">水印</div>
          <div>
            <h1>戌無营造的剃刀</h1>
            <p>离线批量裁剪与水印</p>
          </div>
        </div>
        <fieldset className="toolbar-actions" disabled={exporting}>
          <button onClick={centerSelectedCrop}><LocateFixed size={16} />居中裁剪</button>
          <button onClick={smartCropSelected}><Brain size={16} />智能定位</button>
          <button title="撤销裁剪" aria-label="撤销裁剪" disabled={!history.length} onClick={undoCrop}><Undo2 size={16} /></button>
        </fieldset>
      </header>

      <section className="workspace">
        <aside className="panel photo-rail">
          <fieldset className="photo-actions" disabled={exporting}>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files ?? []); event.target.value = ''; }} />
            <button className="primary" onClick={() => fileInputRef.current?.click()}><ImagePlus size={15} />添加图片</button>
            <button disabled={!selectedPhoto} onClick={removeSelected}><Trash2 size={15} />移除</button>
            <button disabled={!photos.length} onClick={clearPhotos}><Eraser size={15} />清空列表</button>
          </fieldset>
          <div className="panel-head">
            <strong>图片列表 · {photos.length} 张</strong>
            <span>{photos.length ? `${photos.filter((photo) => photo.status === '已导出').length} 张已导出` : '尚未添加图片'}</span>
          </div>
          <div className="photo-list">
            {photos.map((photo) => (
              <button key={photo.id} className={`photo-row ${photo.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(photo.id)}>
                <img src={photo.url} alt="" />
                <span>
                  <strong>{photo.name}</strong>
                  <small>{photo.width} × {photo.height}</small>
                  <em>{photo.status}</em>
                  {photo.color.enabled && <small className="color-badge">调色{photo.color.lutEnabled ? ' + LUT' : ''}</small>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section ref={previewRef} className="preview panel">
          {previewBusy && <span className="preview-busy">调色中…</span>}
          {!selectedPhoto && (
            <div className="empty-hint">
              <strong>添加图片</strong>
              <span>所有处理都在本机完成</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => {
              setDragState(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onWheel={handleWheel}
            onPointerCancel={() => setDragState(null)}
            aria-label="图片裁剪预览"
          />
        </section>

        <aside className="panel inspector">
          <fieldset disabled={exporting}>
          <ControlSection title="裁剪设置">
            <label>初始定位方式</label>
            <select value={cropMode} onChange={(event) => setCropMode(event.target.value as 'smart' | 'center')}>
              <option value="smart">智能主体（离线）</option>
              <option value="center">居中裁剪</option>
            </select>
            <label>比例</label>
            <select aria-label="裁剪比例" value={aspectRatio.tag} onChange={(event) => {
              if (event.target.value === 'custom') { applyAspectRatio({ label: '自定义比例', tag: 'custom', ...customRatio }); return; }
              const next = aspectRatios.find((ratio) => ratio.tag === event.target.value);
              if (next) applyAspectRatio(next);
            }}>
              {aspectRatios.map((ratio) => <option key={ratio.tag} value={ratio.tag}>{ratio.label}</option>)}
              <option value="custom">自定义比例</option>
            </select>
            {aspectRatio.tag === 'custom' && (
              <div className="inline-grid">
                <input aria-label="比例宽" type="number" min="1" max="1000" value={customRatio.width} onChange={(event) => setCustomRatio({ ...customRatio, width: Number(event.target.value) })} />
                <span>:</span>
                <input aria-label="比例高" type="number" min="1" max="1000" value={customRatio.height} onChange={(event) => setCustomRatio({ ...customRatio, height: Number(event.target.value) })} />
                <button onClick={() => applyAspectRatio({ label: '自定义比例', tag: 'custom', width: customRatio.width, height: customRatio.height })}>应用</button>
              </div>
            )}
          </ControlSection>

          <ControlSection title="快速调色">
            <fieldset disabled={!selectedPhoto}>
              <label className="check-row"><input type="checkbox" checked={color.enabled} onChange={event => updateColor({ enabled: event.target.checked })} />启用当前图片调色</label>
              <fieldset disabled={!color.enabled}>
                <div className="color-sliders">
                  {([{ key: 'hue', label: '色相' }, { key: 'saturation', label: '饱和度' }, { key: 'brightness', label: '亮度' }, { key: 'contrast', label: '对比度' }] as const).map(({ key, label }) => (
                    <ColorControl key={key} label={label} value={color[key]} onChange={value => updateColor({ [key]: value })} />
                  ))}
                </div>
                <div className="color-actions"><button title="还原调色数值" aria-label="还原调色数值" onClick={() => updateColor({ hue: 50, saturation: 50, brightness: 50, contrast: 50 })}><RotateCcw size={15} /></button></div>
              </fieldset>
                <div className="lut-controls">
                  <label className="check-row"><input type="checkbox" checked={color.enabled && color.lutEnabled} disabled={lutLoading} onChange={event => { if (event.target.checked) void selectLut(color.lutId || builtinLut.id); else updateColor({ lutEnabled: false }); }} />启用 LUT</label>
                  <input ref={lutInputRef} type="file" accept=".cube" hidden onChange={event => { void importLut(event.target.files?.[0]); event.target.value = ''; }} />
                  <div className="lut-file-row">
                    <select aria-label="当前图片 LUT" disabled={lutLoading} value={color.lutId} onChange={event => void selectLut(event.target.value)}>
                      <option value="">未选择 LUT</option>
                      {luts.map(lut => <option key={lut.id} value={lut.id}>{lut.name} · {lut.size}³</option>)}
                    </select>
                    <button disabled={lutLoading} title="导入 .cube LUT" aria-label="导入 LUT" onClick={() => lutInputRef.current?.click()}><Upload size={15} /></button>
                  </div>
                  <fieldset disabled={!color.enabled || !color.lutEnabled}><ColorControl label="LUT 强度" value={color.intensity} onChange={value => updateColor({ intensity: value })} /></fieldset>
                  {lutLoading && <p className="note">正在读取 LUT…</p>}
                </div>
            </fieldset>
            {colorError && <p className="color-error" role="alert">{colorError}</p>}
          </ControlSection>

          <ControlSection title="水印设置">
            <label className="check-row"><input type="checkbox" checked={watermark.enabled} onChange={(event) => setWatermark({ ...watermark, enabled: event.target.checked })} />启用 PNG 水印</label>
            <input ref={watermarkInputRef} type="file" accept="image/png,image/*" hidden onChange={(event) => handleWatermarkUpload(event.target.files)} />
            <div className="path-row">
              <input readOnly value={watermarkFile?.name ?? ''} placeholder="未选择水印图片" />
              <button onClick={() => watermarkInputRef.current?.click()}><Upload size={16} />选择 PNG</button>
            </div>
            <label>位置</label>
            <select value={watermark.position} onChange={(event) => setWatermark({ ...watermark, position: event.target.value as WatermarkPosition })}>
              {positionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <label>大小模式</label>
            <select value={watermark.sizeMode} onChange={(event) => setWatermark({ ...watermark, sizeMode: event.target.value as WatermarkSizeMode, sizeValue: event.target.value === 'percent' ? 20 : 300 })}>
              <option value="percent">按导出宽度百分比</option>
              <option value="pixels">固定像素宽度</option>
            </select>
            <RangeControl label="大小" value={watermark.sizeValue} min={watermark.sizeMode === 'percent' ? 1 : 50} max={watermark.sizeMode === 'percent' ? 100 : 2000} suffix={watermark.sizeMode === 'percent' ? '%' : 'px'} onChange={(value) => setWatermark({ ...watermark, sizeValue: value })} />
            <RangeControl label="透明度" value={watermark.opacity} min={0} max={100} suffix="%" onChange={(value) => setWatermark({ ...watermark, opacity: value })} />
            <RangeControl label="边距" value={watermark.margin} min={0} max={300} suffix="px" onChange={(value) => setWatermark({ ...watermark, margin: value })} />
          </ControlSection>

          <ControlSection title="导出设置">
            <label>图片尺寸</label>
            <select aria-label="图片尺寸" value={sizeIndex} onChange={(event) => setSizeIndex(Number(event.target.value))}>
              {sizePresets.map((size, index) => <option key={`${size.width}-${size.height}`} value={index}>{size.width} × {size.height}</option>)}
              <option value={sizePresets.length}>自定义</option>
            </select>
            {sizeIndex === sizePresets.length && (
              <div className="size-grid">
                <input aria-label="导出宽度" type="number" min="1" max="8192" value={customSize.width} onChange={(event) => setCustomSize({ ...customSize, width: Number(event.target.value) })} />
                <span>×</span>
                <input aria-label="导出高度" type="number" min="1" max="8192" value={customSize.height} onChange={(event) => setCustomSize({ ...customSize, height: Number(event.target.value) })} />
              </div>
            )}
            <label>输出格式</label>
            <select aria-label="输出格式" value={format} onChange={(event) => setFormat(event.target.value as 'jpg' | 'png' | 'webp')}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
            <label>保存位置</label>
            <div className="path-row">
              <input readOnly value={directoryHandle?.name ?? '浏览器下载 / ZIP'} />
              {canUseDirectoryPicker && <button title="选择保存文件夹" aria-label="选择保存文件夹" onClick={chooseOutputFolder}><FolderOpen size={16} /></button>}
              {directoryHandle && <button title="改为 ZIP 下载" aria-label="改为 ZIP 下载" onClick={() => setDirectoryHandle(null)}><X size={16} /></button>}
            </div>
          </ControlSection>
          </fieldset>
          <div className="export-actions">
            <button className="export primary" disabled={!photos.length || exporting} onClick={() => exportAll()}><Download size={17} />{exporting ? '正在导出' : directoryHandle ? '保存到文件夹' : '下载 ZIP'} {photos.length ? `${photos.length} 张` : ''}</button>
            {exporting && <button className="cancel" onClick={() => { cancelled.current = true; setStatus('正在取消…'); }}><X size={16} />取消导出</button>}
            <progress aria-label="导出进度" value={exportProgress} max={100} />
            <p className="export-status" role="status">{status}</p>
            {failures.length > 0 && <div className="failures"><strong>失败 {failures.length} 张</strong><ul>{failures.map((failure) => <li key={failure.id}>{failure.name}：{failure.reason}</li>)}</ul><button disabled={exporting} onClick={() => exportAll(true)}><RotateCcw size={16} />重试失败项</button></div>}
          </div>
        </aside>
      </section>

      <footer className="status panel">
        <Check size={14} />
        <span>{status}</span>
      </footer>
    </main>
  );
}

function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="control-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function RangeControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div className="range-control">
      <label>{label}</label>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{Math.round(value)}{suffix}</strong>
    </div>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = React.useId();
  return <div className="color-control">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="range" min="0" max="100" step="1" value={value} onChange={event => onChange(Number(event.target.value))} />
    <div className="color-value"><input aria-label={`${label}数值`} type="number" min="0" max="100" step="1" value={value} onChange={event => onChange(clamp(Number(event.target.value), 0, 100))} /><span>%</span></div>
  </div>;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = url;
  });
}

function getPresetSizes(ratio: AspectRatio): ExportSize[] {
  const key = ratio.tag;
  const dimensions: Record<string, ExportSize[]> = {
    '1:1': [{ width: 800, height: 800 }, { width: 1200, height: 1200 }, { width: 1600, height: 1600 }],
    '2:3': [{ width: 800, height: 1200 }, { width: 1200, height: 1800 }, { width: 1600, height: 2400 }],
    '3:4': [{ width: 900, height: 1200 }, { width: 1200, height: 1600 }, { width: 1500, height: 2000 }],
    '4:5': [{ width: 800, height: 1000 }, { width: 1200, height: 1500 }, { width: 1600, height: 2000 }],
    '9:16': [{ width: 720, height: 1280 }, { width: 1080, height: 1920 }, { width: 1440, height: 2560 }],
    '3:2': [{ width: 1200, height: 800 }, { width: 1800, height: 1200 }, { width: 2400, height: 1600 }],
    '4:3': [{ width: 1200, height: 900 }, { width: 1600, height: 1200 }, { width: 2000, height: 1500 }],
    '16:9': [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }],
  };
  return dimensions[key] ?? createCustomPresetDimensions(ratio);
}

function createCustomPresetDimensions(ratio: AspectRatio): ExportSize[] {
  return [1000, 1600, 2400].map((target) => {
    const maxPart = Math.max(ratio.width, ratio.height);
    const multiplier = Math.max(1, Math.round(target / maxPart));
    return { width: ratio.width * multiplier, height: ratio.height * multiplier };
  });
}

function createCenteredCrop(imageWidth: number, imageHeight: number, ratio: AspectRatio): CropRect {
  const target = ratio.width / ratio.height;
  let width = imageWidth;
  let height = width / target;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * target;
  }
  return { x: (imageWidth - width) / 2, y: (imageHeight - height) / 2, width, height };
}

function createSmartCrop(image: HTMLImageElement, ratio: AspectRatio): CropRect {
  const centered = createCenteredCrop(image.naturalWidth || image.width, image.naturalHeight || image.height, ratio);
  const sample = document.createElement('canvas');
  sample.width = 64;
  sample.height = 64;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return centered;
  context.drawImage(image, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  for (let y = 1; y < 63; y += 1) {
    for (let x = 1; x < 63; x += 1) {
      const i = (y * 64 + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const localWeight = Math.max(1, sat * 0.35 + Math.abs(lum - 128) * 0.1);
      sumX += x * localWeight;
      sumY += y * localWeight;
      weight += localWeight;
    }
  }
  if (weight <= 0) return centered;
  const focusX = (sumX / weight / 64) * (image.naturalWidth || image.width);
  const focusY = (sumY / weight / 64) * (image.naturalHeight || image.height);
  return moveCrop(
    centered,
    focusX - (centered.x + centered.width / 2),
    focusY - (centered.y + centered.height / 2),
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );
}

function moveCrop(crop: CropRect, dx: number, dy: number, imageWidth: number, imageHeight: number): CropRect {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, Math.max(0, imageWidth - crop.width)),
    y: clamp(crop.y + dy, 0, Math.max(0, imageHeight - crop.height)),
  };
}

function resizeCropFromCenter(crop: CropRect, nextWidth: number, imageWidth: number, imageHeight: number, ratio: AspectRatio): CropRect {
  const target = ratio.width / ratio.height;
  const minWidth = Math.min(60, imageWidth);
  let width = clamp(nextWidth, minWidth, imageWidth);
  let height = width / target;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * target;
  }
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  return moveCrop({ x: cx - width / 2, y: cy - height / 2, width, height }, 0, 0, imageWidth, imageHeight);
}

function toDisplayRect(rect: CropRect, layout: { left: number; top: number; scale: number }) {
  return {
    x: layout.left + rect.x * layout.scale,
    y: layout.top + rect.y * layout.scale,
    width: rect.width * layout.scale,
    height: rect.height * layout.scale,
  };
}

function pointInDisplayRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function getWatermarkRect(settings: WatermarkSettings, output: ExportSize, watermark: HTMLImageElement): CropRect {
  const width = settings.sizeMode === 'percent' ? output.width * (settings.sizeValue / 100) : settings.sizeValue;
  const height = width * ((watermark.naturalHeight || watermark.height) / (watermark.naturalWidth || watermark.width));
  const margin = settings.margin;
  const positions: Record<WatermarkPosition, { x: number; y: number }> = {
    'top-left': { x: margin, y: margin },
    'top-center': { x: (output.width - width) / 2, y: margin },
    'top-right': { x: output.width - width - margin, y: margin },
    'middle-left': { x: margin, y: (output.height - height) / 2 },
    center: { x: (output.width - width) / 2, y: (output.height - height) / 2 },
    'middle-right': { x: output.width - width - margin, y: (output.height - height) / 2 },
    'bottom-left': { x: margin, y: output.height - height - margin },
    'bottom-center': { x: (output.width - width) / 2, y: output.height - height - margin },
    'bottom-right': { x: output.width - width - margin, y: output.height - height - margin },
    custom: { x: settings.customX * Math.max(1, output.width - width), y: settings.customY * Math.max(1, output.height - height) },
  };
  const p = positions[settings.position];
  return {
    x: clamp(p.x, 0, Math.max(0, output.width - width)),
    y: clamp(p.y, 0, Math.max(0, output.height - height)),
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function moveWatermarkCustom(settings: WatermarkSettings, x: number, y: number, output: ExportSize, watermark: HTMLImageElement): WatermarkSettings {
  const width = settings.sizeMode === 'percent' ? output.width * (settings.sizeValue / 100) : settings.sizeValue;
  const height = width * ((watermark.naturalHeight || watermark.height) / (watermark.naturalWidth || watermark.width));
  return {
    ...settings,
    position: 'custom',
    customX: clamp(x / Math.max(1, output.width - width), 0, 1),
    customY: clamp(y / Math.max(1, output.height - height), 0, 1),
  };
}

async function renderExport(photo: PhotoItem, output: ExportSize, format: string, watermark: WatermarkSettings, watermarkImage: HTMLImageElement | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布');
  context.drawImage(photo.image, photo.crop.x, photo.crop.y, photo.crop.width, photo.crop.height, 0, 0, output.width, output.height);
  await colorCanvas(canvas, photo.color);
  if (watermark.enabled && watermarkImage) {
    const rect = getWatermarkRect(watermark, output, watermarkImage);
    context.globalAlpha = watermark.opacity / 100;
    context.drawImage(watermarkImage, rect.x, rect.y, rect.width, rect.height);
    context.globalAlpha = 1;
  }
  const type = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('导出失败');
  return blob;
}

function createOutputName(name: string, format: string, ratio: AspectRatio) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, '-');
  return `${base}-${ratio.width}x${ratio.height}.${format}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

createRoot(document.getElementById('root')!).render(<App />);
