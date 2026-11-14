/* =====================================================================
   v6.20: PASSAR O MOUSE NO SERVIDOR (barra da esquerda) MOSTRA QUEM ESTÁ EM CALL E QUEM ESTÁ TRANSMITINDO
   Funciona também nas pastas de servidores. Atualiza sozinho enquanto o mouse está em cima.
   ===================================================================== */
function srvCallInfo(sid){
  const list = (S.channels.get(sid) || []).filter(c => c.kind === 'voice');
  return list.map(c => ({ c, users: voiceUsers(c) })).filter(x => x.users.length);
}
function railCallHtml(s){
  const info = srvCallInfo(s.id);
  const live = info.flatMap(x => x.users.filter(u => u.sharing));
  let h = `<div class="rtn">${esc(s.name)}</div>`;
  if(!info.length) return h + `<small>Ninguém em call agora</small>`;
  if(live.length) h += `<div class="rtlive"><span class="livepill">AO VIVO</span>${live.slice(0, 2).map(u => esc(prof(u.user_id).display_name)).join(', ')}${live.length > 2 ? ` e mais ${live.length - 2}` : ''} ${live.length > 1 ? 'transmitindo' : 'transmitindo a tela'}</div>`;
  info.slice(0, 4).forEach(({ c, users }) => {
    h += `<div class="rtch">${c.radio ? '📻' : ic('volume', 13)}<span>${esc(c.name)}</span><em>${users.length}</em></div>`;
    h += users.slice(0, 6).map(u => { const p = prof(u.user_id); return `<div class="rtu">${avatar(p, 'xs')}<span>${esc(p.display_name)}</span>${u.sharing ? '<span class="livepill sm">AO VIVO</span>' : ''}${u.camera ? `<span class="rti">${ic('video', 12)}</span>` : ''}${u.deafened ? `<span class="rti off">${ic('headphonesOff', 12)}</span>` : u.muted ? `<span class="rti off">${ic('micOff', 12)}</span>` : ''}</div>`; }).join('');
    if(users.length > 6) h += `<div class="rtmore">e mais ${users.length - 6}</div>`;
  });
  if(info.length > 4) h += `<div class="rtmore">+${info.length - 4} canais com gente</div>`;
  return h;
}
function railTipHtml(el){
  if(el.dataset.sid){ const s = S.servers.find(x => x.id === el.dataset.sid); return s ? railCallHtml(s) : null; }
  if(el.dataset.fid){
    const fold = el.closest('.rfold'); if(!fold) return null;
    const ids = (typeof railItems === 'function' ? railItems() : []).find(x => typeof x !== 'string' && x.id === el.dataset.fid);
    const sids = ids ? ids.sids : [];
    const withCall = sids.map(id => S.servers.find(x => x.id === id)).filter(Boolean).filter(s => srvCallInfo(s.id).length);
    let h = `<div class="rtn">${esc(el.dataset.tip || 'Pasta')}</div><small>${sids.length} servidor${sids.length === 1 ? '' : 'es'}</small>`;
    withCall.slice(0, 3).forEach(s => { h += `<div class="rtsep"></div>` + railCallHtml(s); });
    return h;
  }
  return null;
}
let RT = null;
function railTipShow(el){
  const html = railTipHtml(el); if(html == null) return;
  const tip = document.getElementById('tipEl'); if(!tip) return;
  tip.classList.add('rich'); tip.innerHTML = html;
  const r = el.getBoundingClientRect();
  tip.style.left = (r.right + 12) + 'px';
  tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, r.top + r.height / 2 - tip.offsetHeight / 2)) + 'px';
}
// roda depois do tooltip comum (registrado antes) e troca o conteúdo
document.addEventListener('mouseover', e => {
  const el = e.target.closest('#rail .ricon.srv[data-sid], #rail .rfh[data-fid]');
  const tip = document.getElementById('tipEl');
  if(!el){ if(tip) tip.classList.remove('rich'); if(RT){ clearInterval(RT.t); RT = null; } return; }
  railTipShow(el);
  if(RT && RT.el === el) return;
  if(RT) clearInterval(RT.t);
  RT = { el, t: setInterval(() => { if(!document.body.contains(RT.el) || !RT.el.matches(':hover') || !document.getElementById('tipEl')){ clearInterval(RT.t); RT = null; return; } railTipShow(RT.el); }, 1000) };
});
// o tooltip comum troca o conteúdo ao entrar em outro elemento; garante que o "rich" saia junto
document.addEventListener('mouseout', e => { if(e.target.closest && e.target.closest('#rail') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#rail .ricon.srv, #rail .rfh'))){ const tip = document.getElementById('tipEl'); if(tip) tip.classList.remove('rich'); } });

/* bolinha no ícone do servidor: alguém em call (verde) ou transmitindo (vermelho) */
function railCallBadges(){
  document.querySelectorAll('#rail .ricon.srv[data-sid]').forEach(b => {
    b.querySelector('.rcall')?.remove();
    const info = srvCallInfo(b.dataset.sid); if(!info.length || b.querySelector('.rvoice')) return;
    const live = info.some(x => x.users.some(u => u.sharing));
    b.insertAdjacentHTML('beforeend', `<span class="rcall ${live ? 'live' : ''}">${live ? 'AO VIVO' : ic('volume', 11)}</span>`);
  });
}
const _renderRailCall = renderRail;
renderRail = function(){ _renderRailCall.apply(this, arguments); railCallBadges(); };
const _onPresenceRc = Voice.onPresence.bind(Voice);
Voice.onPresence = function(topic, metas){ const r = _onPresenceRc(topic, metas); if(!String(topic).startsWith('vp:dm:')) railCallBadges(); return r; };
