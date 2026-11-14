const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  onSources: fn => ipcRenderer.on('picker:sources', (e, list) => fn(list)),
  choose: v => ipcRenderer.send('picker:choose', v),
});
