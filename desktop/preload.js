// Ponte segura entre o Telão (site) e o Windows
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('telaoDesktop', {
  isDesktop: true,
  version: require('./package.json').version,
  badge: n => ipcRenderer.invoke('telao:badge', n | 0),
  show: () => ipcRenderer.invoke('telao:show'),
  // v1.1: jogo aberto no PC (nome do jogo ou null)
  getGame: () => ipcRenderer.invoke('telao:game'),
  onGame: fn => ipcRenderer.on('telao:game', (e, g) => fn(g)),
});
