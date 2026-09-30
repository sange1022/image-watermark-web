const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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
    assert.equal(await page.locator('details[open]').count(), 0);
    await page.locator('summary').filter({ hasText: '快速调色' }).click();
    await page.getByLabel('启用 LUT', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('select[aria-label="当前图片 LUT"]').value === 'builtin-qingyu-0065');
    assert.equal(await page.getByLabel('启用 LUT', { exact: true }).isChecked(), true);
    await page.getByLabel('清晰度数值').fill('25');
    await page.getByLabel('纹理数值').fill('20');
    await page.waitForFunction(() => !document.querySelector('.preview-busy'));
    await page.locator('summary').filter({ hasText: '导出设置' }).click();
    await page.getByLabel('输出格式').selectOption('png');
    await page.getByLabel('图片尺寸', { exact: true }).selectOption('3');
    await page.getByLabel('导出宽度').fill('240');
    await page.getByLabel('导出高度').fill('320');
    await application.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, output);
    await page.getByRole('button', { name: '选择保存文件夹', exact: true }).click();
    await page.getByRole('button', { name: '打开保存位置', exact: true }).waitFor();
    await application.evaluate(({ shell }) => { global.openedOutput = null; shell.openPath = async folder => { global.openedOutput = folder; return ''; }; });
    await page.getByRole('button', { name: '打开保存位置', exact: true }).click();
    assert.equal(await application.evaluate(() => global.openedOutput), output);
    await page.getByRole('button', { name: /保存到文件夹/ }).click();
    await page.waitForFunction(() => document.querySelector('.export-status').textContent.includes('成功 1 张'));
    const original = await fs.readFile(path.join(output, 'test-3x4.png'));
    assert.equal(original.readUInt32BE(16), 240);
    assert.equal(original.readUInt32BE(20), 320);
    await page.getByRole('button', { name: /保存到文件夹/ }).click();
    await page.waitForFunction(() => !document.querySelector('fieldset.toolbar-actions').disabled);
    assert.deepEqual(await fs.readFile(path.join(output, 'test-3x4.png')), original);
    assert.ok((await fs.stat(path.join(output, 'test-3x4-1.png'))).size > 0);
    await page.locator('summary').filter({ hasText: '实况照片' }).click();
    await page.getByLabel('启用当前图片实况').check();
    await page.getByLabel('实况动画').selectOption('zoom-out');
    await page.getByRole('button', { name: '导出实况照片 1 张', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.export-status').textContent.includes('实况导出完成'), undefined, { timeout: 120000 });
    assert.ok((await fs.stat(path.join(output, 'test-3x4-实况.mov'))).size > 1000);
    assert.ok((await fs.stat(path.join(output, 'test-3x4-实况.jpg'))).size > 1000);
    const liveJpg = await fs.readFile(path.join(output, 'test-3x4-实况.jpg'));
    const liveMov = await fs.readFile(path.join(output, 'test-3x4-实况.mov'));
    const identifier = liveJpg.toString('binary').match(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
    assert.ok(identifier && liveMov.includes(Buffer.from(identifier)));
    assert.ok(liveMov.includes(Buffer.from('com.apple.quicktime.still-image-time')));
    // Preserve real Windows-generated pairs for independent Apple Photos validation.
    if (process.env.DESKTOP_SCREENSHOT) {
      await fs.copyFile(path.join(output, 'test-3x4-实况.jpg'), path.join(path.dirname(screenshot), 'windows-live.jpg'));
      await fs.copyFile(path.join(output, 'test-3x4-实况.mov'), path.join(path.dirname(screenshot), 'windows-live.mov'));
    }
    await page.getByRole('button', { name: '导出实况照片 1 张', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('fieldset.toolbar-actions').disabled);
    assert.deepEqual(await fs.readFile(path.join(output, 'test-3x4-实况.jpg')), liveJpg);
    assert.ok((await fs.stat(path.join(output, 'test-3x4-实况-1.mov'))).size > 1000);
    assert.ok((await fs.stat(path.join(output, 'test-3x4-实况-1.jpg'))).size > 1000);
    const downloadPath = path.join(output, 'direct-download.png');
    await application.evaluate(({ BrowserWindow }, target) => { BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => item.setSavePath(target)); }, downloadPath);
    await page.getByRole('button', { name: '改为浏览器下载', exact: true }).click();
    await page.getByRole('button', { name: /导出图片/ }).click();
    await page.waitForFunction(() => document.querySelector('.export-status').textContent.includes('已发起图片下载 1 张'));
    let downloaded;
    for (let i = 0; i < 50; i++) {
      try { downloaded = await fs.readFile(downloadPath); if (downloaded.length > 24) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(downloaded);
    assert.equal(downloaded.readUInt32BE(16), 240);
    assert.equal(downloaded.readUInt32BE(20), 320);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.locator('.inspector').evaluate(element => { element.scrollTop = 200; });
    await page.screenshot({ path: screenshot, fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: collapsed settings, folder-open IPC, offline LUT, PNG folder and direct export, paired Live Photo saving without overwrites, isolated renderer. Screenshot:', screenshot);
  } catch (error) {
    const page = await application.firstWindow();
    console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'));
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    throw error;
  } finally { await application.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
