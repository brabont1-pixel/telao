// Telão para Windows (Electron): abre o Telão como um programa de verdade.
const { app, BrowserWindow, Tray, Menu, shell, session, desktopCapturer, ipcMain, Notification, nativeImage, dialog, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8'));
const APP_URL = CFG.url.replace(/\/+$/, '');
const ORIGIN = new URL(APP_URL).origin;
// hosts que podem abrir dentro do app (login do Google/Supabase e Spotify voltam para o Telão)
const INSIDE = [ORIGIN, 'https://accounts.google.com', 'https://accounts.spotify.com'];
const isInside = u => { try{ const o = new URL(u).origin; return INSIDE.includes(o) || /\.supabase\.co$/.test(new URL(u).hostname); }catch(e){ return false; } };

let win = null, tray = null, quitting = false, lastSource = null, RC = null;

if(!app.requestSingleInstanceLock()){ app.quit(); }
else app.on('second-instance', () => { if(win){ if(win.isMinimized()) win.restore(); win.show(); win.focus(); } });

app.setAppUserModelId('app.telao.desktop');   // nome certo nas notificações do Windows
// deixa o áudio tocar sem precisar clicar antes
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow(){
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 600,
    backgroundColor: '#0d0e12', title: 'Telão', icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: true },
  });
  // o Google não deixa logar se perceber que é um app "embutido": usamos o nome do Chrome normal
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s*(Electron|telao|Telão)\/[\d.]+/gi, ''));
  win.loadURL(APP_URL + '/?desktop=1');
  win.once('ready-to-show', () => win.show());

  // links de fora abrem no navegador
  win.webContents.setWindowOpenHandler(({ url }) => { if(isInside(url)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if(!isInside(url)){ e.preventDefault(); shell.openExternal(url); } });
  // sem internet: tenta de novo
  win.webContents.on('did-fail-load', (e, code) => { if(code !== -3) setTimeout(() => win && win.loadURL(APP_URL + '/?desktop=1'), 4000); });

  // fechar o X deixa o Telão rodando na bandeja (como o Discord)
  win.on('close', e => { if(!quitting){ e.preventDefault(); win.hide(); } });
}

function setupPermissions(){
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'display-capture', 'fullscreen', 'speaker-selection'].includes(perm)));
  ses.setPermissionCheckHandler(() => true);
  // compartilhar tela: mostra um seletor de telas e janelas com miniatura
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try{
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
      const choice = await pickSource(sources);
      if(!choice) return cb({});
      const src = sources.find(s => s.id === choice.id);
      lastSource = src ? { id: src.id, display_id: src.display_id, screen: src.id.startsWith('screen:') } : null;
      if(RC && (!lastSource || !lastSource.screen)) rcStop('trocou o que está compartilhando');
      // no Windows dá para mandar o som do PC junto. 'loopbackWithoutChrome' = todo o som do PC MENOS o do próprio Telão
      // (senão a voz da chamada ia junto com a tela e todo mundo se ouvia de novo, com eco)
      cb(choice.audio && process.platform === 'win32' ? { video: src, audio: 'loopbackWithoutChrome' } : { video: src });
    }catch(e){ cb({}); }
  }, { useSystemPicker: false });
}

function pickSource(sources){
  return new Promise(resolve => {
    const p = new BrowserWindow({
      parent: win, modal: true, width: 760, height: 560, resizable: false, minimizable: false, maximizable: false,
      backgroundColor: '#15151d', title: 'Compartilhar tela', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true },
    });
    let done = false;
    const finish = v => { if(done) return; done = true; ipcMain.removeAllListeners('picker:choose'); resolve(v); if(!p.isDestroyed()) p.close(); };
    ipcMain.once('picker:choose', (e, v) => finish(v));
    p.on('closed', () => finish(null));
    p.loadFile(path.join(__dirname, 'picker.html'));
    p.webContents.once('did-finish-load', () => {
      p.webContents.send('picker:sources', sources.map(s => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen:'), thumb: s.thumbnail.toDataURL(), icon: s.appIcon ? s.appIcon.toDataURL() : null })));
    });
  });
}

function createTray(){
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.setToolTip('Telão');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o Telão', click: () => { win.show(); win.focus(); } },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Parar controle remoto', click: () => rcStop('pelo menu') },
    { label: 'Recarregar', click: () => win.reload() },
    { label: 'Sair do Telão', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.isVisible() && win.isFocused() ? win.hide() : (win.show(), win.focus()); });
}

function setupUpdates(){
  try{
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', () => {
      if(Notification.isSupported()) new Notification({ title: 'Telão', body: 'Atualização baixada. Ela entra quando você fechar o Telão.' }).show();
    });
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600e3);
  }catch(e){}
}

// ---------- controle remoto (v1.3) ----------
// Quem compartilha a TELA INTEIRA pode deixar um amigo mexer no mouse e no teclado.
// A permissão é pedida AQUI, numa janela do próprio Windows (o site sozinho não consegue liberar).
// Os movimentos vão para um processo do PowerShell que chama a API do Windows (SetCursorPos / mouse_event / keybd_event).
const RC_PS = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class TelaoRC {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
}
"@
[TelaoRC]::SetProcessDPIAware() | Out-Null
[Console]::Out.WriteLine('ok')
while(($l = [Console]::In.ReadLine()) -ne $null){
  $p = $l.Split(' ')
  try {
    switch($p[0]){
      'M' { [TelaoRC]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null }
      'B' { [TelaoRC]::mouse_event([uint32]$p[1], 0, 0, 0, [UIntPtr]::Zero) }
      'W' { [TelaoRC]::mouse_event(0x0800, 0, 0, [int]$p[1], [UIntPtr]::Zero) }
      'K' { $vk = [byte][int]$p[1]; $sc = [byte]([TelaoRC]::MapVirtualKey([uint32]$vk, 0) -band 0xFF); [TelaoRC]::keybd_event($vk, $sc, [uint32]$p[2], [UIntPtr]::Zero) }
      'Q' { exit }
    }
  } catch {}
}
`;
const VK = { Backspace: 8, Tab: 9, Enter: 13, ShiftLeft: 0xA0, ShiftRight: 0xA1, ControlLeft: 0xA2, ControlRight: 0xA3, AltLeft: 0xA4, AltRight: 0xA5, Pause: 0x13, CapsLock: 0x14, Escape: 0x1B, Space: 0x20,
  PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28, PrintScreen: 0x2C, Insert: 0x2D, Delete: 0x2E, ContextMenu: 0x5D,
  NumpadMultiply: 0x6A, NumpadAdd: 0x6B, NumpadSubtract: 0x6D, NumpadDecimal: 0x6E, NumpadDivide: 0x6F, NumpadEnter: 13, NumpadComma: 0xC2, NumLock: 0x90, ScrollLock: 0x91,
  Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE, Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB, Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE, IntlBackslash: 0xE2, IntlRo: 0xC1 };
for(let i = 0; i < 26; i++) VK['Key' + String.fromCharCode(65 + i)] = 65 + i;
for(let i = 0; i < 10; i++){ VK['Digit' + i] = 48 + i; VK['Numpad' + i] = 0x60 + i; }
for(let i = 1; i <= 12; i++) VK['F' + i] = 0x6F + i;
const VK_EXT = new Set(['ControlRight', 'AltRight', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'NumpadDivide', 'NumpadEnter', 'PrintScreen', 'ContextMenu']);
const BTN = [[0x2, 0x4], [0x20, 0x40], [0x8, 0x10]];   // esquerdo, meio, direito: [desce, sobe]
function rcWrite(line){ try{ if(RC && RC.proc && RC.proc.stdin.writable) RC.proc.stdin.write(line + '\n'); }catch(e){} }
function rcStart(name){
  const { spawn } = require('child_process');
  const enc = Buffer.from(RC_PS, 'utf16le').toString('base64');
  const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  RC = { name, proc, keys: new Set(), btns: new Set(), n: 0, sec: 0 };
  proc.on('exit', () => { if(RC && RC.proc === proc) rcStop('o controle fechou'); });
  proc.on('error', () => { if(RC && RC.proc === proc) rcStop('não deu para iniciar o controle'); });
  try{ globalShortcut.register('Control+Shift+F12', () => rcStop('Ctrl+Shift+F12')); }catch(e){}
  RC.timer = setTimeout(() => rcStop('passou 1 hora'), 3600e3);
  if(tray) tray.setToolTip('Telão · ' + name + ' está controlando seu PC (Ctrl+Shift+F12 para parar)');
  if(Notification.isSupported()) new Notification({ title: 'Controle remoto ligado', body: name + ' está controlando seu PC. Ctrl+Shift+F12 para parar.' }).show();
}
function rcStop(why){
  const r = RC; if(!r) return;
  RC = null;
  clearTimeout(r.timer);
  try{ globalShortcut.unregister('Control+Shift+F12'); }catch(e){}
  // solta tudo o que ficou apertado
  try{
    r.keys.forEach(code => { const vk = VK[code]; if(vk) r.proc.stdin.write(`K ${vk} ${2 | (VK_EXT.has(code) ? 1 : 0)}\n`); });
    r.btns.forEach(b => { if(BTN[b]) r.proc.stdin.write(`B ${BTN[b][1]}\n`); });
    r.proc.stdin.write('Q\n'); r.proc.stdin.end();
  }catch(e){}
  setTimeout(() => { try{ r.proc.kill(); }catch(e){} }, 800);
  if(tray) tray.setToolTip('Telão');
  if(win && !win.isDestroyed()) win.webContents.send('rc:stopped', why || '');
}
ipcMain.handle('rc:ask', async (e, name) => {
  if(!win || e.sender !== win.webContents) return { ok: false };
  if(process.platform !== 'win32') return { ok: false, why: 'Controle remoto só funciona no Windows.' };
  if(!lastSource || !lastSource.screen) return { ok: false, why: 'Para deixar controlar, a pessoa precisa compartilhar a TELA INTEIRA (não só uma janela).' };
  if(RC) return { ok: false, why: 'Já tem alguém controlando esse PC.' };
  const nm = String(name || 'Alguém').replace(/[\r\n]+/g, ' ').slice(0, 40);
  if(win.isMinimized()) win.restore();
  win.show(); win.focus();
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Recusar', 'Permitir'], defaultId: 0, cancelId: 0, noLink: true, title: 'Controle remoto',
    message: nm + ' quer controlar seu computador',
    detail: 'Se você permitir, essa pessoa vai poder mexer no seu mouse e digitar no seu teclado enquanto você compartilha a tela.\n\nPara parar a qualquer momento: Ctrl + Shift + F12, ou o botão "Parar" no Telão.\n\nSó permita para quem você confia.',
  });
  if(r.response !== 1) return { ok: false, why: 'recusou' };
  if(RC) return { ok: false, why: 'Já tem alguém controlando esse PC.' };
  rcStart(nm);
  return { ok: true };
});
ipcMain.handle('rc:stop', e => { if(win && e.sender === win.webContents) rcStop('você parou'); });
ipcMain.on('rc:input', (e, ev) => {
  if(!RC || !win || e.sender !== win.webContents || !ev || typeof ev !== 'object') return;
  // limite: no máximo ~200 comandos por segundo
  const sec = Math.floor(Date.now() / 1000); if(sec !== RC.sec){ RC.sec = sec; RC.n = 0; } if(++RC.n > 200) return;
  if(ev.t === 'm'){
    const x = Math.max(0, Math.min(1, +ev.x || 0)), y = Math.max(0, Math.min(1, +ev.y || 0));
    const d = screen.getAllDisplays().find(dd => String(dd.id) === String(lastSource && lastSource.display_id)) || screen.getPrimaryDisplay();
    const dip = { x: Math.round(d.bounds.x + x * (d.bounds.width - 1)), y: Math.round(d.bounds.y + y * (d.bounds.height - 1)) };
    const p = screen.dipToScreenPoint ? screen.dipToScreenPoint(dip) : dip;
    rcWrite(`M ${Math.round(p.x)} ${Math.round(p.y)}`);
  } else if(ev.t === 'd' || ev.t === 'u'){
    const b = ev.b | 0; if(!BTN[b]) return;
    if(ev.t === 'd') RC.btns.add(b); else RC.btns.delete(b);
    rcWrite(`B ${BTN[b][ev.t === 'd' ? 0 : 1]}`);
  } else if(ev.t === 'w'){
    rcWrite(`W ${Math.max(-1200, Math.min(1200, ev.d | 0))}`);
  } else if(ev.t === 'k'){
    const code = String(ev.c || ''), vk = VK[code]; if(!vk) return;
    if(ev.d) RC.keys.add(code); else RC.keys.delete(code);
    rcWrite(`K ${vk} ${(ev.d ? 0 : 2) | (VK_EXT.has(code) ? 1 : 0)}`);
  }
});

ipcMain.handle('telao:badge', (e, n) => { if(win){ win.setOverlayIcon(n ? nativeImage.createFromPath(path.join(__dirname, 'tray.png')) : null, n ? n + ' novas' : ''); if(n && !win.isFocused()) win.flashFrame(true); } });
ipcMain.handle('telao:show', () => { if(win){ win.show(); win.focus(); } });

// ---------- jogo aberto (v1.1): olha a lista de programas a cada 20 s e avisa o site qual jogo conhecido está rodando ----------
const GAMES = {
  'valorant-win64-shipping.exe': 'Valorant', 'cs2.exe': 'Counter-Strike 2', 'csgo.exe': 'Counter-Strike: GO', 'league of legends.exe': 'League of Legends',
  'javaw.exe': null, 'minecraft.windows.exe': 'Minecraft', 'minecraftlauncher.exe': null, 'fortniteclient-win64-shipping.exe': 'Fortnite',
  'gta5.exe': 'GTA V', 'gta5_enhanced.exe': 'GTA V', 'playgtav.exe': 'GTA V', 'robloxplayerbeta.exe': 'Roblox', 'fc25.exe': 'EA FC 25', 'fc26.exe': 'EA FC 26', 'fc24.exe': 'EA FC 24',
  'rocketleague.exe': 'Rocket League', 'r5apex.exe': 'Apex Legends', 'r5apex_dx12.exe': 'Apex Legends', 'dota2.exe': 'Dota 2', 'rainbowsix.exe': 'Rainbow Six Siege', 'rainbowsix_vulkan.exe': 'Rainbow Six Siege',
  'overwatch.exe': 'Overwatch 2', 'eldenring.exe': 'Elden Ring', 'cod.exe': 'Call of Duty', 'blackops6.exe': 'Call of Duty: Black Ops 6', 'modernwarfare.exe': 'Call of Duty: Warzone',
  'hd-player.exe': 'Free Fire (BlueStacks)', 'pubg.exe': 'PUBG', 'tslgame.exe': 'PUBG', 'deadbydaylight-win64-shipping.exe': 'Dead by Daylight', 'rustclient.exe': 'Rust',
  'terraria.exe': 'Terraria', 'stardew valley.exe': 'Stardew Valley', 'among us.exe': 'Among Us', 'fallguys_client_game.exe': 'Fall Guys', 'phasmophobia.exe': 'Phasmophobia',
  'rdr2.exe': 'Red Dead Redemption 2', 'cyberpunk2077.exe': 'Cyberpunk 2077', 'witcher3.exe': 'The Witcher 3', 'bg3.exe': "Baldur's Gate 3", 'bg3_dx11.exe': "Baldur's Gate 3",
  'hogwartslegacy.exe': 'Hogwarts Legacy', 'palworld-win64-shipping.exe': 'Palworld', 'lethal company.exe': 'Lethal Company', 'helldivers2.exe': 'Helldivers 2',
  'marvel-win64-shipping.exe': 'Marvel Rivals', 'deltaforceclient-win64-shipping.exe': 'Delta Force', 'thefinals.exe': 'The Finals', 'eurotrucks2.exe': 'Euro Truck Simulator 2',
  'forzahorizon5.exe': 'Forza Horizon 5', 'forzahorizon4.exe': 'Forza Horizon 4', 'sotgame.exe': 'Sea of Thieves', 'destiny2.exe': 'Destiny 2', 'warframe.x64.exe': 'Warframe',
  'pathofexile_x64.exe': 'Path of Exile', 'pathofexile2.exe': 'Path of Exile 2', 'diablo iv.exe': 'Diablo IV', 'wow.exe': 'World of Warcraft', 'hearthstone.exe': 'Hearthstone',
  'genshinimpact.exe': 'Genshin Impact', 'starrail.exe': 'Honkai: Star Rail', 'zenlesszonezero.exe': 'Zenless Zone Zero', 'wutheringwaves.exe': 'Wuthering Waves',
  'tibia.exe': 'Tibia', 'client.exe': null, 'brawlhalla.exe': 'Brawlhalla', 'smite2.exe': 'Smite 2', 'paladins.exe': 'Paladins', 'osu!.exe': 'osu!', 'geometrydash.exe': 'Geometry Dash',
  'sims4.exe': 'The Sims 4', 'ts4_x64.exe': 'The Sims 4', 'cities2.exe': 'Cities: Skylines II', 'factorio.exe': 'Factorio', 'valheim.exe': 'Valheim', 'satisfactory.exe': 'Satisfactory',
  'projectzomboid64.exe': 'Project Zomboid', 'dayz_x64.exe': 'DayZ', 'arma3_x64.exe': 'Arma 3', 'tarkov.exe': 'Escape from Tarkov', 'escapefromtarkov.exe': 'Escape from Tarkov',
  'nba2k25.exe': 'NBA 2K25', 'fifa23.exe': 'FIFA 23', 'pes2021.exe': 'eFootball PES 2021', 'efootball.exe': 'eFootball', 'mk1.exe': 'Mortal Kombat 1', 'streetfighter6.exe': 'Street Fighter 6',
  'tekken8.exe': 'Tekken 8', 'sekiro.exe': 'Sekiro', 'darksoulsiii.exe': 'Dark Souls III', 'monsterhunterwilds.exe': 'Monster Hunter Wilds', 'repo.exe': 'R.E.P.O.', 'peak.exe': 'PEAK',
};
let curGame = null, gameTimer = null;
function checkGames(){
  if(process.platform !== 'win32') return;
  require('child_process').execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    if(err) return;
    let found = null;
    for(const line of String(out).split(/\r?\n/)){
      const exe = (line.match(/^"([^"]+)"/) || [])[1]; if(!exe) continue;
      const g = GAMES[exe.toLowerCase()]; if(g){ found = g; break; }
    }
    if(found !== curGame){ curGame = found; if(win && !win.isDestroyed()) win.webContents.send('telao:game', curGame); }
  });
}
ipcMain.handle('telao:game', () => curGame);
function startGameWatch(){ checkGames(); gameTimer = setInterval(checkGames, 20000); }

app.whenReady().then(() => {
  setupPermissions(); createWindow(); createTray(); startGameWatch();
  if(process.argv.includes('--hidden')) win.once('ready-to-show', () => win.hide());
  if(app.isPackaged) setupUpdates();
});
app.on('before-quit', () => { quitting = true; rcStop('fechou o Telão'); });
app.on('window-all-closed', () => {});
