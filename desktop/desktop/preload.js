const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  hasUpdater: true,
  sources: () => ipcRenderer.invoke('sources'),
  version: () => ipcRenderer.invoke('app-version'),
  retry: () => ipcRenderer.send('retry'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdate: cb => ipcRenderer.on('update', (e, d) => cb(d))
});
