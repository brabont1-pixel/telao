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
  // v1.3: controle remoto (quem compartilha a tela inteira deixa um amigo mexer). A permissão é pedida numa janela do Windows.
  rc: process.platform === 'win32' ? {
    ask: name => ipcRenderer.invoke('rc:ask', String(name || '')),
    input: ev => ipcRenderer.send('rc:input', ev),
    stop: () => ipcRenderer.invoke('rc:stop'),
    onStop: fn => ipcRenderer.on('rc:stopped', (e, why) => fn(why)),
  } : null,
});
