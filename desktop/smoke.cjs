const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');

(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'watermark-smoke-'));
  const screenshot = process.env.DESKTOP_SCREENSHOT || path.join(output, 'desktop.png');
  const application = await _electron.launch(process.env.DESKTOP_EXE ? { executablePath: process.env.DESKTOP_EXE } : { args: [path.join(__dirname, 'main.cjs')] });
  try {
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('watermark://app/index.html');
    await page.getByRole('heading', { name: '戌無营造的剃刀', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.desktop.chooseOutput), 'function');
    const rects = Array.from({ length: 30 }, (_, i) => `<rect x="${i * 10}" width="10" height="300" fill="rgb(${80 + i * 3},120,140)"/>`).join('');
    await page.locator('input[type=file][multiple]').setInputFiles({ name: 'test.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">${rects}</svg>`) });
    await page.locator('.photo-row').waitFor();
    await page.getByLabel('启用 LUT', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('select[aria-label="当前图片 LUT"]').value === 'builtin-qingyu-0065');
    assert.equal(await page.getByLabel('启用 LUT', { exact: true }).isChecked(), true);
    await page.getByLabel('清晰度数值').fill('25');
    await page.getByLabel('纹理数值').fill('20');
    await page.waitForFunction(() => !document.querySelector('.preview-busy'));
    await page.getByLabel('输出格式').selectOption('png');
    await page.getByLabel('图片尺寸', { exact: true }).selectOption('3');
    await page.getByLabel('导出宽度').fill('240');
    await page.getByLabel('导出高度').fill('320');
    await application.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, output);
    await page.getByRole('button', { name: '选择保存文件夹', exact: true }).click();
    await page.getByRole('button', { name: '打开保存位置', exact: true }).waitFor();
    await page.getByRole('button', { name: /保存到文件夹/ }).click();
    await page.waitForFunction(() => document.querySelector('.export-status').textContent.includes('成功 1 张'));
    const original = await fs.readFile(path.join(output, 'test-3x4.png'));
    assert.equal(original.readUInt32BE(16), 240);
    assert.equal(original.readUInt32BE(20), 320);
    await page.getByRole('button', { name: /保存到文件夹/ }).click();
    await page.waitForFunction(() => !document.querySelector('fieldset.toolbar-actions').disabled);
    assert.deepEqual(await fs.readFile(path.join(output, 'test-3x4.png')), original);
    assert.ok((await fs.stat(path.join(output, 'test-3x4-1.png'))).size > 0);
    const zipPath = path.join(output, 'export.zip');
    await application.evaluate(({ BrowserWindow }, target) => { BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => item.setSavePath(target)); }, zipPath);
    await page.getByRole('button', { name: '改为 ZIP 下载', exact: true }).click();
    await page.getByRole('button', { name: /下载 ZIP/ }).click();
    await page.waitForFunction(() => document.querySelector('.export-status').textContent.includes('ZIP 已下载'));
    let zip;
    for (let i = 0; i < 50; i++) {
      try { zip = await JSZip.loadAsync(await fs.readFile(zipPath)); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(zip?.file('test-3x4.png'));
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.locator('.inspector').evaluate(element => { element.scrollTop = 200; });
    await page.screenshot({ path: screenshot, fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: installed desktop opens offline assets, imports images, applies built-in LUT and details, saves PNG without overwriting, exports ZIP, isolated renderer. Screenshot:', screenshot);
  } catch (error) {
    const page = await application.firstWindow();
    console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    throw error;
  } finally { await application.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
