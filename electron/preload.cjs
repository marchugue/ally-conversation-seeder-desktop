const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  request: (payload) => ipcRenderer.invoke('api:request', payload),
});

