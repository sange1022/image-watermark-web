const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  currentOutput: () => ipcRenderer.invoke('output:current'),
  completeExport: result => ipcRenderer.invoke('output:complete', result),
  chooseOutput: () => ipcRenderer.invoke('output:choose'),
  openOutput: () => ipcRenderer.invoke('output:open'),
  writeImage: (name, bytes) => ipcRenderer.invoke('output:write', name, bytes),
  writeLivePair: (name, jpg, mov) => ipcRenderer.invoke('output:live', name, jpg, mov),
});
