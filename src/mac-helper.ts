import type { LivePair } from './live-save';

const helperURL = 'http://127.0.0.1:47831';
export function helperTokenFromFragment(fragment: string) {
  const value = new URLSearchParams(fragment.replace(/^#/, '')).get('mac-helper');
  return value && /^[0-9a-f-]{72}$/i.test(value) ? value : null;
}

export function readHelperToken() {
  const token = helperTokenFromFragment(location.hash);
  try {
    if (token) {
      sessionStorage.setItem('watermark-mac-session', token);
      history.replaceState(null, '', location.pathname + location.search);
    }
    return token ?? sessionStorage.getItem('watermark-mac-session') ?? '';
  } catch { return token ?? ''; }
}

function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function makeImportPayload(requestId: string, name: string, pair: LivePair) {
  if (pair.jpg.length > 24 * 1024 * 1024 || pair.mov.length > 24 * 1024 * 1024) throw new Error('单张实况过大，请减小导出尺寸，或使用 ZIP 导出');
  return { requestId, name, jpg: base64(pair.jpg), mov: base64(pair.mov) };
}

export class HelperRequestError extends Error {
  readonly uncertain: boolean;
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; }
}

export async function helperRequest(token: string, path: '/status' | '/import' | '/open-photos', payload: object = {}) {
  if (!token) throw new HelperRequestError('请先打开 Mac 助手，并从助手打开试用网页');
  let response: Response;
  try {
    response = await fetch(helperURL + path, {
      method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(path === '/import' ? 120000 : 10000),
    });
  } catch {
    throw new HelperRequestError(path === '/import' ? '连接中断，保存结果尚未确认。重试失败项会使用原导入编号，避免重复添加' : '无法连接 Mac 助手。请从助手重新打开试用网页，并允许浏览器的本地网络访问', path === '/import');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new HelperRequestError(error.error || '助手连接已失效，请从 Mac 助手重新打开试用网页');
  }
  return response.json();
}
