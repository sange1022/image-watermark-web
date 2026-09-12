const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'watermark', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let mainWindow;
let outputDirectory;
const origin = 'watermark://app';

function trusted(event) {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(origin + '/')) throw new Error('无效请求');
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.xuwuyingzao.watermark');
  const root = path.join(__dirname, '..', 'dist');
  protocol.handle('watermark', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1000, minHeight: 700,
    title: '戌無营造的剃刀 · 水印', backgroundColor: '#f5f5f7',
    icon: path.join(__dirname, 'app.ico'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({
    responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'"] },
  }));

  ipcMain.handle('output:choose', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(mainWindow, { title: '选择保存位置', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    outputDirectory = result.filePaths[0];
    return { name: path.basename(outputDirectory) };
  });
  ipcMain.handle('output:open', async (event) => {
    trusted(event);
    if (!outputDirectory) throw new Error('请先选择保存位置');
    const error = await shell.openPath(outputDirectory);
    if (error) throw new Error(error);
  });
  ipcMain.handle('output:write', async (event, name, bytes) => {
    trusted(event);
    if (!outputDirectory) throw new Error('请先选择保存位置');
    if (typeof name !== 'string' || !/\.(png|jpg|webp)$/i.test(name) || !ArrayBuffer.isView(bytes) || bytes.byteLength > 200 * 1024 * 1024) throw new Error('导出文件无效');
    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '');
    const extension = path.extname(safeName);
    const stem = path.basename(safeName, extension).slice(0, 160) || 'image';
    for (let suffix = 0; suffix < 10000; suffix++) {
      const candidate = `${stem}${suffix ? '-' + suffix : ''}${extension}`;
      const target = path.join(outputDirectory, candidate);
      let handle;
      try { handle = await fs.open(target, 'wx'); }
      catch (error) { if (error.code === 'EEXIST') continue; throw error; }
      try { await handle.writeFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); }
      catch (error) { await handle.close(); await fs.unlink(target).catch(() => {}); throw error; }
      await handle.close();
      return candidate;
    }
    throw new Error('同名文件过多，请更换保存位置');
  });
  mainWindow.loadURL(origin + '/index.html');
});
app.on('window-all-closed', () => app.quit());
