/* =====================================================================
   v6.18: MOVER MEMBROS ENTRE CANAIS DE VOZ (igual ao Discord)
   - Arraste a pessoa (na lista da call, na barra de canais) para outro canal de voz.
   - Você sempre pode se arrastar. Para mover os outros: dono, Administrador ou Moderar membros.
   - No celular (ou clique com o botão direito): menu da pessoa → "Mover para…".
   ===================================================================== */
const canMoveOthers = s => !!s && (s.owner_id === S.me.id || App.hasPerm(s.id, 32) || App.hasPerm(s.id, 64));
function canMoveUser(s, uid){ return uid === S.me.id || (canMoveOthers(s) && canModUser(s, uid)); }
function voiceList(s){ return (S.channels.get(s.id) || []).filter(c => c.kind === 'voice'); }
async function moveUserTo(s, uid, ch){
  if(!ch || ch.kind !== 'voice') return;
  if(uid === S.me.id){ if(!(Voice.channel && Voice.channel.id === ch.id)) await joinVoice(ch); return; }
  const n = voiceUsers(ch).length;
  if(ch.user_limit && n >= ch.user_limit && !canMoveOthers(s)){ App.toast(`#${ch.name} está cheio.`, true); return; }
  sendToUser(uid, 'mod-move', { server_id: s.id, by: S.me.id, to: ch.id });
  App.toast(`${prof(uid).display_name} foi movido para 🔊 ${ch.name}.`);
}
// quem recebe confere se quem moveu pode mesmo fazer isso e se o canal existe para ele
App.onModMove = pl => {
  if(!pl || !Voice.channel || Voice.channel.server_id !== pl.server_id) return;
  const s = S.servers.find(x => x.id === pl.server_id); if(!s) return;
  const roles = S.roles.get(s.id) || [], mine = S.memberRoles.get(s.id)?.get(pl.by) || new Set();
  const ok = s.owner_id === pl.by || roles.some(r => (r.perms & (64 | 32)) && mine.has(r.id));
  if(!ok) return;
  const ch = findChannel(pl.to);
  if(!ch || ch.kind !== 'voice' || ch.server_id !== s.id || Voice.channel.id === ch.id) return;
  joinVoice(ch).then(() => App.toast(`${prof(pl.by).display_name} moveu você para 🔊 ${ch.name}.`));
};

/* menu da pessoa: "Mover para…" */
function moveModal(s, uid){
  const from = [...S.vp.values()].flat().find(v => v.user_id === uid && v.voice);
  const list = voiceList(s).filter(c => !from || c.id !== from.voice);
  modal(`<div class="mh"><h2>Mover ${esc(prof(uid).display_name)}</h2><p>Escolha o canal de voz.</p></div>
    <div class="mc"><div class="mvlist">${list.map(c => { const n = voiceUsers(c).length; return `<button class="mvch" data-mvto="${c.id}">${ic('volume', 18)}<b>${esc(c.name)}</b><span class="grow"></span><small>${n}${c.user_limit ? '/' + c.user_limit : ''} na call</small></button>`; }).join('') || '<p class="mut">Não tem outro canal de voz neste servidor.</p>'}</div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button></div>`, m => {
    m.querySelectorAll('[data-mvto]').forEach(b => b.onclick = () => { closeModal(); moveUserTo(s, uid, findChannel(b.dataset.mvto)); });
  });
}
const _modItemsMv = App.modItems;
App.modItems = (s, uid, x, y) => {
  const out = _modItemsMv(s, uid, x, y);
  const inCall = [...S.vp.values()].flat().some(v => v.user_id === uid && v.voice && (findChannel(v.voice) || {}).server_id === s.id);
  if(inCall && canMoveUser(s, uid) && uid !== S.me.id){
    const i = out.findIndex(o => o && o.label === 'Desconectar da call');
    out.splice(i >= 0 ? i : out.length, 0, { label: 'Mover para…', icon: ic('volume', 18), cls: 'moditem', onClick: () => moveModal(s, uid) });
  }
  return out;
};

/* arrastar na barra de canais (mouse) */
const MV = { on: false };
function mvClean(){
  document.getElementById('mvGhost')?.remove();
  document.querySelectorAll('.vdrop,.vdragging').forEach(x => x.classList.remove('vdrop', 'vdragging'));
  MV.on = false; MV.to = null;
}
function mvTargetAt(x, y){
  const el = document.elementFromPoint(x, y); if(!el) return null;
  const vu = el.closest('#sbBody .vu[data-vch]');
  const id = vu ? vu.dataset.vch : (el.closest('#sbBody .ch[data-cid]') || {}).dataset?.cid;
  const ch = id && findChannel(id);
  return ch && ch.kind === 'voice' ? ch : null;
}
function bindMoveDrag(el, s){
  const uid = el.dataset.vuser;
  if(!canMoveUser(s, uid)) return;
  el.addEventListener('pointerdown', e => {
    if(e.button !== 0 || e.pointerType !== 'mouse' || e.target.closest('[data-watch]')) return;
    const sx = e.clientX, sy = e.clientY; let started = false;
    const mv = ev => {
      if(!started){
        if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        started = true; MV.on = true; MV.uid = uid; MV.from = el.dataset.vch;
        el.classList.add('vdragging');
        const g = el.cloneNode(true); g.id = 'mvGhost'; g.classList.remove('vdragging'); document.body.appendChild(g);
      }
      ev.preventDefault();
      const g = document.getElementById('mvGhost'); if(g){ g.style.left = (ev.clientX + 10) + 'px'; g.style.top = (ev.clientY - 14) + 'px'; }
      document.querySelectorAll('.vdrop').forEach(z => z.classList.remove('vdrop'));
      const ch = mvTargetAt(ev.clientX, ev.clientY);
      MV.to = ch && ch.id !== MV.from ? ch : null;
      if(MV.to){ const row = document.querySelector(`#sbBody .ch[data-cid="${MV.to.id}"]`); if(row) row.classList.add('vdrop'); }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if(!started) return;
      const to = MV.to; mvClean();
      const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 60);
      if(to) moveUserTo(s, uid, to);
    };
    window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up);
  });
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && MV.on) mvClean(); });
const _renderSidebarMv = renderSidebar;
renderSidebar = function(){
  _renderSidebarMv.apply(this, arguments);
  const s = S.route.kind === 'server' && curServer(); if(!s) return;
  document.querySelectorAll('#sbBody .vu[data-vuser]').forEach(el => {
    bindMoveDrag(el, s);
    if(canMoveUser(s, el.dataset.vuser)) el.classList.add('canmove');
  });
};
