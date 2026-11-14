// Telão para Windows (Electron): abre o Telão como um programa de verdade.
const { app, BrowserWindow, Tray, Menu, shell, session, desktopCapturer, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'app-config.json'), 'utf8'));
const APP_URL = CFG.url.replace(/\/+$/, '');
const ORIGIN = new URL(APP_URL).origin;
// hosts que podem abrir dentro do app (login do Google/Supabase e Spotify voltam para o Telão)
const INSIDE = [ORIGIN, 'https://accounts.google.com', 'https://accounts.spotify.com'];
const isInside = u => { try{ const o = new URL(u).origin; return INSIDE.includes(o) || /\.supabase\.co$/.test(new URL(u).hostname); }catch(e){ return false; } };

let win = null, tray = null, quitting = false;

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
      // no Windows dá para mandar o som do PC junto (loopback)
      cb(choice.audio && process.platform === 'win32' ? { video: src, audio: 'loopback' } : { video: src });
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
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});
