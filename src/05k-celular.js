/* =====================================================================
   v6.6: TELÃO NO CELULAR
   Voltar com o botão do celular, deslizar para voltar, segurar para abrir menus,
   barra de navegação embaixo, janelas como "folhas" de baixo para cima.
   ===================================================================== */
const touchDev = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
if(touchDev) document.documentElement.classList.add('touch');

/* botão "voltar" do celular: volta para a lista em vez de fechar o Telão */
let backGuard = false;
new MutationObserver(() => {
  const inMain = document.body.classList.contains('m-main');
  if(inMain && isMobile() && !(history.state && history.state.telaoMain)){ history.pushState({ telaoMain: true }, ''); }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
function overlayOpen(){
  const md = $('#modal'); if(md && !md.classList.contains('hidden')) return () => closeModal();
  const mn = $('#menu'); if(mn && !mn.classList.contains('hidden')) return () => closeMenu();
  const ex = $('#explore'); if(ex) return () => ex.remove();
  if(typeof SET !== 'undefined' && SET) return () => settingsBack();
  if(document.body.classList.contains('mem-open') && isMobile()) return () => { S.memOverlay = false; renderMembers(); };
  return null;
}
window.addEventListener('popstate', () => {
  if(!isMobile()) return;
  const close = overlayOpen();
  if(close){
    close();
    // ainda tem algo aberto (ex.: voltou da seção para a lista): guarda mais um "voltar"
    if(overlayOpen() || document.body.classList.contains('m-main')) history.pushState({ telaoMain: true }, '');
    mobileNav(); return;
  }
  if(document.body.classList.contains('m-main')) document.body.classList.remove('m-main');
});
// abrir janela também conta como "tela" para o botão voltar fechar ela
const _modalM = modal;
modal = function(){
  const r = _modalM.apply(this, arguments);
  if(isMobile()){
    if(!(history.state && history.state.telaoModal)) history.pushState({ telaoModal: true, telaoMain: document.body.classList.contains('m-main') }, '');
    // não abre o teclado sozinho em cima da janela
    setTimeout(() => { const a = document.activeElement; if(a && a.closest && a.closest('#modal') && !a.matches('.code6, #qsQ, #gName, #cgN, #rcN')) a.blur(); }, 60);
  }
  return r;
};

/* deslizar da borda esquerda para voltar */
let sw = null;
document.addEventListener('touchstart', e => {
  if(!isMobile() || e.touches.length !== 1) return;
  const t = e.touches[0];
  if(t.clientX < 28 && document.body.classList.contains('m-main') && !overlayOpen()) sw = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if(!sw) return; const t = e.touches[0], dx = t.clientX - sw.x, dy = Math.abs(t.clientY - sw.y);
  if(dy > 60) { sw = null; $('#main').style.transform = ''; return; }
  if(dx > 0) $('#main').style.transform = `translateX(${Math.min(dx, innerWidth) * 0.6}px)`;
}, { passive: true });
document.addEventListener('touchend', e => {
  if(!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x;
  const m = $('#main'); m.style.transition = 'transform .18s'; m.style.transform = '';
  setTimeout(() => { m.style.transition = ''; }, 200);
  if(dx > 90) history.back();
  sw = null;
});

/* segurar o dedo = clique com o botão direito (menus de mensagem, membro, canal) */
let lp = null;
document.addEventListener('touchstart', e => {
  if(!touchDev || e.touches.length !== 1) return;
  const el = e.target.closest('.msg, .mem, .vu, .ch[data-cid], .dmitem, .ricon[data-sid], .rfh, .fr, [data-uprof]'); if(!el) return;
  const t = e.touches[0];
  lp = { el, x: t.clientX, y: t.clientY, timer: setTimeout(() => {
    lp.fired = true;
    if(navigator.vibrate) navigator.vibrate(12);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY }));
  }, 480) };
}, { passive: true });
document.addEventListener('touchmove', e => { if(!lp) return; const t = e.touches[0]; if(Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10){ clearTimeout(lp.timer); lp = null; } }, { passive: true });
document.addEventListener('touchend', e => { if(!lp) return; clearTimeout(lp.timer); if(lp.fired){ e.preventDefault(); } lp = null; });
document.addEventListener('contextmenu', e => { if(touchDev && e.isTrusted && e.target.closest('.msg, .mem, .vu, .ch, .dmitem')) e.preventDefault(); }, true);

/* barra de navegação embaixo (só no celular, na tela de listas) */
/* fecha tudo que estiver por cima (configurações, janelas, menus, explorar, membros) */
function closeOverlays(){
  closeMenu();
  const md = $('#modal'); if(md && !md.classList.contains('hidden')) closeModal();
  const ex = $('#explore'); if(ex) ex.remove();
  if(typeof SET !== 'undefined' && SET){ closeSettings(); if(SET) return false; }   // tem alteração não salva e a pessoa cancelou
  if(S.memOverlay){ S.memOverlay = false; renderMembers(); }
  return true;
}
App.closeOverlays = closeOverlays;
const pushOverlay = () => { if(isMobile()) history.pushState({ telaoOverlay: true, telaoMain: document.body.classList.contains('m-main') }, ''); };
App.onSettingsOpen = () => { pushOverlay(); mobileNav(); };
App.onSettingsSec = () => pushOverlay();
App.onSettingsClose = () => mobileNav();
function mobileNav(){
  if(!isMobile() || !S.me){ const n = $('#mnav'); if(n) n.remove(); return; }
  let n = $('#mnav');
  if(!n){ n = document.createElement('nav'); n.id = 'mnav'; n.className = 'mnav'; document.body.appendChild(n); }
  const setU = typeof SET !== 'undefined' && SET && SET.kind === 'user';
  const home = S.route.kind === 'home' && !setU && !$('#explore');
  const unreadN = (S.dmReq ? S.dmReq.length : 0) + S.dms.filter(d => S.unread.has(d.id)).length;
  n.innerHTML = `<button data-mn="home" class="${home ? 'on' : ''}">${ic('chat', 22)}<span>Início</span>${unreadN ? `<i class="mdot">${unreadN > 9 ? '9+' : unreadN}</i>` : ''}</button>
    <button data-mn="explore" class="${$('#explore') ? 'on' : ''}">${ic('globe', 22)}<span>Explorar</span></button>
    <button data-mn="news">${ic('bell', 22)}<span>Novidades</span>${typeof unreadNotices === 'function' && unreadNotices() ? '<i class="mdot"></i>' : ''}</button>
    <button data-mn="me" class="${setU ? 'on' : ''}">${avatar(S.me, 'xs', true)}<span>Você</span></button>`;
  n.querySelector('[data-mn="home"]').onclick = () => { if(!closeOverlays()) return; go({ kind: 'home', dm: null }); document.body.classList.remove('m-main'); mobileNav(); };
  n.querySelector('[data-mn="explore"]').onclick = () => { if(!closeOverlays()) return; App.openExplore(); pushOverlay(); mobileNav(); };
  n.querySelector('[data-mn="news"]').onclick = () => { if(!closeOverlays()) return; App.noticesPanel(); mobileNav(); };
  n.querySelector('[data-mn="me"]').onclick = () => {
    if(setU){ if(SET.mobileOpen){ SET.mobileOpen = false; SET.direct = false; renderSettings(); } return; }
    if(!closeOverlays()) return; openSettings('user');
  };
}
const _renderRailK = renderRail;
renderRail = function(){ _renderRailK.apply(this, arguments); mobileNav(); };
addEventListener('resize', () => { mobileNav(); });

/* no celular o player do Telão Bot começa pequeno */
new MutationObserver(() => { const d = $('#musicDock'); if(d && isMobile() && !d.dataset.mob){ d.dataset.mob = '1'; d.classList.add('mini'); } }).observe(document.body, { childList: true });

/* teclado aberto: mantém a caixa de mensagem visível (iPhone) */
if(window.visualViewport){
  const vv = window.visualViewport;
  const fit = () => { document.documentElement.style.setProperty('--vvh', vv.height + 'px'); document.body.classList.toggle('kb-open', isMobile() && vv.height < innerHeight * 0.78); };
  vv.addEventListener('resize', fit); fit();
}
/* textos mais curtos no celular */
const _renderMainK = renderMain;
renderMain = function(){
  _renderMainK.apply(this, arguments);
  const ta = $('#cmp'); if(ta && isMobile() && !ta.disabled) ta.placeholder = ta.placeholder.replace(/ — digite \/ para comandos$/, '');
};

/* menus no celular: fundo escuro atrás da gaveta; tocar nele fecha (no iPhone não existe botão voltar) */
(() => {
  const mn = document.getElementById('menu'); if(!mn) return;
  const shade = document.createElement('div'); shade.id = 'menuShade'; shade.className = 'hidden'; document.body.appendChild(shade);
  const close = e => { e.preventDefault(); e.stopPropagation(); closeMenu(); };
  shade.addEventListener('pointerdown', close); shade.addEventListener('click', close);
  new MutationObserver(() => shade.classList.toggle('hidden', !isMobile() || mn.classList.contains('hidden'))).observe(mn, { attributes: true, attributeFilter: ['class'] });
})();
