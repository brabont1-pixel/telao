/* ---------------- PWA / app para Windows ----------------
   v6.28: no Windows (navegador), a barrinha embaixo oferece o app de verdade para Windows,
   não a instalação do navegador. Nos outros aparelhos continua a instalação como app. */
const IS_WIN = /Windows/i.test(navigator.userAgent) && !/Mobile|Phone/i.test(navigator.userAgent);
const WIN_DL = 'https://github.com/brabont1-pixel/telao/releases/latest/download/Telao-Setup.exe';
const winDl = () => (S.cfg && S.cfg.desktop_url) || WIN_DL;
function installBarWin(){
  if(window.telaoDesktop || !IS_WIN || ls.get('telao-nowin', false)) return;
  const bar = $('#install');
  bar.innerHTML = `${ic('monitor', 18)}<span style="white-space:nowrap"><b>Telão</b> para Windows</span><a class="btn sm" id="installBtn" href="${esc(winDl())}" download style="margin-left:auto">${ic('download', 14)} Baixar</a><button class="ibtn sm" id="installX" aria-label="Fechar" data-tip="Não mostrar mais">${ic('x', 14)}</button>`;
  bar.classList.remove('hidden'); bar.classList.add('win');
  $('#installBtn').onclick = () => { App.toast('Baixando o instalador… Depois é só abrir o Telao-Setup.exe.'); };
  $('#installX').onclick = () => { ls.set('telao-nowin', true); bar.classList.add('hidden'); };
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); if(window.telaoDesktop) return; S.installEvt = e;
  if(IS_WIN) return;   // no Windows a barra é do app para Windows
  if(!ls.get('telao-noinstall', false)) $('#install').classList.remove('hidden');
});
async function doInstall(){
  if(!S.installEvt) return;
  S.installEvt.prompt();
  await S.installEvt.userChoice.catch(()=>{});
  S.installEvt = null; $('#install').classList.add('hidden'); closeModal();
}
if(IS_WIN && !window.telaoDesktop) setTimeout(installBarWin, 1500);   // depois de carregar o link salvo pelo admin
else $('#installBtn').onclick = doInstall;
$('#install').oncontextmenu = e => { e.preventDefault(); ls.set(IS_WIN ? 'telao-nowin' : 'telao-noinstall', true); $('#install').classList.add('hidden'); };
window.addEventListener('appinstalled', () => { $('#install').classList.add('hidden'); App.toast('Telão instalado'); });

window.addEventListener('beforeunload', () => { try{ Voice.channel && Voice.leave(); }catch(e){} });
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/convite=([a-z0-9-]+)/i);
  if(m && S.me){ history.replaceState(null, '', location.pathname); inviteJoinPrompt(m[1].toLowerCase()); }
});

boot();
})();

