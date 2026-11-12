/* ---------------- PWA ---------------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); if(window.telaoDesktop) return; S.installEvt = e;
  if(!ls.get('telao-noinstall', false)) $('#install').classList.remove('hidden');
});
async function doInstall(){
  if(!S.installEvt) return;
  S.installEvt.prompt();
  await S.installEvt.userChoice.catch(()=>{});
  S.installEvt = null; $('#install').classList.add('hidden'); closeModal();
}
$('#installBtn').onclick = doInstall;
$('#install').oncontextmenu = e => { e.preventDefault(); ls.set('telao-noinstall', true); $('#install').classList.add('hidden'); };
window.addEventListener('appinstalled', () => { $('#install').classList.add('hidden'); App.toast('Telão instalado'); });

window.addEventListener('beforeunload', () => { try{ Voice.channel && Voice.leave(); }catch(e){} });
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/convite=([a-z0-9-]+)/i);
  if(m && S.me){ history.replaceState(null, '', location.pathname); inviteJoinPrompt(m[1].toLowerCase()); }
});

boot();
})();

