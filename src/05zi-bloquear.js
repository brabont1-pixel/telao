/* =====================================================================
   v6.25: BLOQUEAR PESSOAS
   Quem você bloqueia não consegue te mandar DM, ligar ou pedir amizade. As mensagens dela
   nos servidores ficam escondidas (dá para mostrar uma por uma).
   ===================================================================== */
S.blocked = new Set();
const BLK_SQL = 'Para bloquear pessoas, rode o supabase.sql novo (v6.25) no Supabase.';
async function loadBlocks(){
  try{
    const { data, error } = await App.sb.from('user_blocks').select('blocked');
    if(!error) S.blocked = new Set((data || []).map(r => r.blocked));
  }catch(e){}
}
const _loadDmsBlk = loadDms;
loadDms = async function(){ await loadBlocks(); return _loadDmsBlk.apply(this, arguments); };
App.isBlocked = uid => S.blocked.has(uid);

async function blockUser(uid){
  const p = prof(uid);
  if(!(await confirmBox('Bloquear ' + p.display_name + '?', `<b>${esc(p.display_name)}</b> não vai conseguir te mandar mensagem direta, te ligar nem te adicionar. A amizade de vocês é desfeita e as mensagens dela nos servidores ficam escondidas para você. Ela não recebe nenhum aviso.`, 'Bloquear'))) return;
  const { error } = await App.sb.from('user_blocks').insert({ blocked: uid });
  if(error && !/duplicate/i.test(error.message)){ App.toast(/user_blocks|does not exist|schema cache/i.test(error.message) ? BLK_SQL : error.message, true); return; }
  S.blocked.add(uid);
  if(Voice.channel && Voice.channel.kind === 'dm' && dmOther(Voice.channel) === uid) leaveVoice();
  const d = S.dms.find(x => dmOther(x) === uid); if(d){ S.unread.delete(d.id); saveUnread(); }
  await loadFriends();
  App.toast(p.display_name + ' foi bloqueado.');
  renderAll();
}
async function unblockUser(uid){
  const p = prof(uid);
  const { error } = await App.sb.from('user_blocks').delete().eq('blocker', S.me.id).eq('blocked', uid);
  if(error){ App.toast(error.message, true); return; }
  S.blocked.delete(uid);
  App.toast(p.display_name + ' foi desbloqueado.');
  renderAll(); if(SET && SET.sec === 'privacy') renderSettings();
}
App.blockUser = blockUser; App.unblockUser = unblockUser;

// menu do perfil
const _userMenuExtraBlk = App.userMenuExtra;
App.userMenuExtra = uid => {
  const base = _userMenuExtraBlk ? _userMenuExtraBlk(uid) : [];
  if(uid === S.me.id || uid === '7e1a0000-0000-4000-a000-000000000001') return base;
  return base.concat(S.blocked.has(uid)
    ? [{ label: 'Desbloquear', icon: ic('minusCircle', 18), onClick: () => unblockUser(uid) }]
    : [{ label: 'Bloquear', icon: ic('minusCircle', 18), danger: true, onClick: () => blockUser(uid) }]);
};

// conversa com alguém bloqueado: sem caixa de mensagem
const _renderMainBlk = renderMain;
renderMain = function(){
  _renderMainBlk.apply(this, arguments);
  const r = S.route; if(r.kind !== 'home' || !r.dm) return;
  const d = S.dms.find(x => x.id === r.dm); if(!d) return;
  const o = dmOther(d);
  const f = $('#cmpF'); if(!f) return;
  if(!S.blocked.has(o)){ $('#blkBar')?.remove(); f.classList.remove('hidden'); return; }
  f.classList.add('hidden');
  if(!$('#blkBar')) f.insertAdjacentHTML('afterend', `<div class="blkbar" id="blkBar">${ic('minusCircle', 16)}<span>Você bloqueou <b>${esc(prof(o).display_name)}</b>. Vocês não conseguem trocar mensagens nem se ligar.</span><button class="btn sec sm" id="blkUn">Desbloquear</button></div>`);
  $('#blkUn').onclick = () => unblockUser(o);
};
// ligar para alguém bloqueado
const _joinVoiceBlk = joinVoice;
joinVoice = async function(ch){
  if(ch && ch.kind === 'dm' && S.blocked.has(dmOther(ch))){ App.toast('Você bloqueou essa pessoa. Desbloqueie para ligar.', true); return; }
  return _joinVoiceBlk.apply(this, arguments);
};
// "mostrar" mensagem escondida
document.addEventListener('click', e => {
  const a = e.target.closest('[data-showblk]'); if(!a) return;
  e.preventDefault(); (M.showBlk ||= new Set()).add(a.dataset.showblk); renderMsgList(false);
});

// Configurações → Privacidade: lista de bloqueados
const _secPrivacyBlk = secPrivacy;
secPrivacy = function(box, back){
  _secPrivacyBlk(box, back);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>Pessoas bloqueadas</h3><div id="blkList"><div class="spin" style="margin:10px 0"></div></div>`);
  (async () => {
    await loadBlocks();
    const ids = [...S.blocked]; await ensureProfiles(ids);
    const el = box.querySelector('#blkList'); if(!el) return;
    el.innerHTML = ids.length ? ids.map(id => `<div class="blkrow">${avatar(prof(id), 'sm')}<div><b>${esc(prof(id).display_name)}</b><small>@${esc(prof(id).username)}</small></div><button class="btn sec sm" data-unblk="${id}">Desbloquear</button></div>`).join('')
      : '<p class="mut small">Ninguém bloqueado. Para bloquear, clique no nome ou na foto da pessoa e escolha <b>Bloquear</b>.</p>';
    el.querySelectorAll('[data-unblk]').forEach(b => b.onclick = () => unblockUser(b.dataset.unblk));
  })();
};
App.openSettings = openSettings;
