export type LivePair = { jpg: Uint8Array; mov: Uint8Array };
export const liveInstructions = `实况照片导入说明

1. 如果下载的是 ZIP，请先解压。
2. 同时选中同名的 JPG 和 MOV 文件，一起导入 Mac「照片」。不要分开导入或只选其中一个。
3. 在「照片」中确认 LIVE 标识和播放效果，再从「照片」的分享菜单隔空投送到 iPhone。

每对文件对应一张 3 秒实况照片。请保留两份文件，不要分别改名。
QQ、微信或文件夹中直接发送 JPG/MOV，不保证接收为实况照片。
本导出不是专用锁屏壁纸格式。
`;

export function liveStem(name: string, width: number, height: number) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f_]/g, '-').replace(/[. ]+$/, '').slice(0, 100) || 'image';
  return `${base}-${width}x${height}-实况`;
}

export async function saveLiveToDirectory(directory: FileSystemDirectoryHandle, stem: string, pair: LivePair) {
  // The browser has no exclusive-create API. Each save owns a UUID namespace,
  // including across tabs/origins; rollback cannot target another export's stem.
  const existing = new Set<string>();
  for await (const name of directory.keys()) existing.add(name.toLowerCase());
  let candidate: string;
  do { candidate = `${stem}-${crypto.randomUUID()}`; }
  while (existing.has(`${candidate}.jpg`.toLowerCase()) || existing.has(`${candidate}.mov`.toLowerCase()));
  const created: string[] = [];
  try {
    for (const extension of ['jpg', 'mov'] as const) {
      const name = `${candidate}.${extension}`;
      const file = await directory.getFileHandle(name, { create: true });
      created.push(name);
      const writer = await file.createWritable();
      try { await writer.write(new Blob([pair[extension]])); await writer.close(); }
      catch (error) { await writer.abort().catch(() => {}); throw error; }
    }
    return candidate;
  } catch (error) {
    await Promise.all(created.map(name => directory.removeEntry(name).catch(() => {})));
    throw error;
  }
}
