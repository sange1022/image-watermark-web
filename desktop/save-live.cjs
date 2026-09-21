const fs = require('node:fs/promises');
const path = require('node:path');

async function writeLivePair(directory, name, jpg, mov) {
  if (typeof name !== 'string' || !name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) throw new Error('实况文件名无效');
  if (![jpg, mov].every(bytes => ArrayBuffer.isView(bytes) && bytes.byteLength > 0 && bytes.byteLength <= 200 * 1024 * 1024)) throw new Error('实况文件无效');
  const stem = name.replace(/_/g, '-').slice(0, 150);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const candidate = `${stem}${suffix ? '-' + suffix : ''}`;
    const created = [];
    const handles = [];
    try {
      for (const ext of ['jpg', 'mov']) {
        const target = path.join(directory, `${candidate}.${ext}`);
        handles.push(await fs.open(target, 'wx'));
        created.push(target);
      }
      for (const [i, bytes] of [jpg, mov].entries()) await handles[i].writeFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      await Promise.all(handles.map(handle => handle.close()));
      return candidate;
    } catch (error) {
      await Promise.all(handles.map(handle => handle.close().catch(() => {})));
      await Promise.all(created.map(target => fs.unlink(target).catch(() => {})));
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('同名文件过多，请更换保存位置');
}
module.exports = { writeLivePair };
