const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  chooseOutput: () => ipcRenderer.invoke('output:choose'),
  openOutput: () => ipcRenderer.invoke('output:open'),
  writeImage: (name, bytes) => ipcRenderer.invoke('output:write', name, bytes),
});
