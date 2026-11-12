/* =====================================================================
   v5: MODERAÇÃO — castigo no chat, silenciar/ensurdecer/desconectar na call, banir
   ===================================================================== */
const memberRow = (sid, uid) => (S.members.get(sid) || []).find(m => m.user_id === uid);
const timedOut = (sid, uid) => { const m = memberRow(sid, uid); return m && m.timeout_until && new Date(m.timeout_until) > new Date() ? new Date(m.timeout_until) : null; };
// a voz de alguém silenciado por moderador fica muda para todos da chamada
App.srvVoiceMuted = uid => {
  const sid = Voice.channel && Voice.channel.server_id; if(!sid) return false;
  const m = memberRow(sid, uid); return !!(m && (m.voice_muted));
};
function canModUser(s, uid){
  if(uid === S.me.id || uid === s.owner_id) return false;
  if(s.owner_id === S.me.id) return true;
  return !rolesOf(s.id, uid).some(r => r.perms & 32);
}
async function modCall(s, uid, args, okMsg){
  const { error } = await App.sb.rpc('moderate_member', { p_server: s.id, p_user: uid, ...args });
  if(error){ App.toast(error.message, true); return; }
  await loadMembers(s.id); renderMembers(); renderSidebar(); Voice.peers.forEach(p => Voice.applyVolume(p));
  if(okMsg) App.toast(okMsg);
}
App.modItems = (s, uid, x, y) => {
  if(!(S.members.get(s.id) || []).some(m => m.user_id === uid) || !canModUser(s, uid)) return [];
  const out = [], p = prof(uid), m = memberRow(s.id, uid) || {}, to = timedOut(s.id, uid);
  const inCall = Voice.channel && Voice.channel.server_id === s.id && voiceUsers(Voice.channel).some(v => v.user_id === uid);
  const anyCall = [...S.vp.values()].flat().find(v => v.user_id === uid && v.voice && (findChannel(v.voice) || {}).server_id === s.id);
  if(App.hasPerm(s.id, 64)){
    out.push('-', { html: `<div class="modh">${ic('shield',14)} Moderação</div>` });
    out.push({ label: m.voice_muted ? 'Tirar silêncio da call' : 'Silenciar na call', icon: ic(m.voice_muted ? 'mic' : 'micOff', 18), cls:'moditem',
      onClick: () => modCall(s, uid, { p_vmute: !m.voice_muted }, m.voice_muted ? `${p.display_name} pode falar de novo.` : `🔇 ${p.display_name} foi silenciado na call.`) });
    out.push({ label: m.voice_deafened ? 'Tirar ensurdecer' : 'Ensurdecer na call', icon: ic('headphonesOff', 18), cls:'moditem',
      onClick: () => modCall(s, uid, { p_vdeaf: !m.voice_deafened }, m.voice_deafened ? `${p.display_name} voltou a ouvir.` : `${p.display_name} foi ensurdecido.`) });
    if(anyCall || inCall) out.push({ label:'Desconectar da call', icon: ic('phoneOff', 18), cls:'moditem', onClick: () => {
      sendToUser(uid, 'mod-disconnect', { server_id: s.id, by: S.me.id });
      App.toast(`${p.display_name} foi desconectado da call.`);
    }});
    out.push(to
      ? { label: `Tirar castigo (até ${to.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})})`, icon: ic('clock', 18), cls:'moditem', onClick: () => modCall(s, uid, { p_timeout_minutes: 0 }, `${p.display_name} saiu do castigo.`) }
      : { label:'Castigo no chat…', icon: ic('clock', 18), cls:'moditem', onClick: () => timeoutModal(s, uid) });
  }
  if(App.hasPerm(s.id, 128)) out.push({ label:'Banir do servidor', icon: ic('slash', 18), danger:true, onClick: () => banModal(s, uid) });
  return out;
};
function timeoutModal(s, uid){
  const p = prof(uid);
  const opts = [[1,'1 minuto'],[5,'5 minutos'],[10,'10 minutos'],[60,'1 hora'],[1440,'1 dia'],[10080,'1 semana']];
  modal(`<div class="mh"><h2>Castigo para ${esc(p.display_name)}</h2><p>Durante o castigo a pessoa continua no servidor, mas não consegue mandar mensagens nem reagir.</p></div>
    <div class="mc"><div class="tochips">${opts.map(([v, l]) => `<button data-to="${v}">${l}</button>`).join('')}</div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button></div>`, m => {
    m.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { closeModal(); modCall(s, uid, { p_timeout_minutes: +b.dataset.to }, `⏳ ${p.display_name} está de castigo por ${b.textContent}.`); });
  });
}
function banModal(s, uid){
  const p = prof(uid);
  modal(`<form id="bnF"><div class="mh"><h2>Banir ${esc(p.display_name)}?</h2><p>A pessoa sai de <b>${esc(s.name)}</b> e não consegue entrar de novo, nem com convite.</p></div>
    <div class="mc"><label class="field"><span>Motivo (opcional)</span><input class="inp" id="bnR" maxlength="200" placeholder="spam, ofensa…"></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn red">Banir</button></div></form>`, m => {
    m.querySelector('#bnF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.rpc('ban_member', { p_server: s.id, p_user: uid, p_reason: m.querySelector('#bnR').value.trim() || null });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); App.toast(`${p.display_name} foi banido.`); await loadMembers(s.id); renderMembers();
    };
  });
}
/* do lado de quem foi moderado */
App.onModChange = row => {
  const s = S.servers.find(x => x.id === row.server_id); if(!s) return;
  if(Voice.channel && Voice.channel.server_id === row.server_id){
    const was = [Voice.forceMuted, Voice.forceDeaf];
    Voice.setForced(row.voice_muted, row.voice_deafened);
    if(!was[0] && row.voice_muted) App.toast(`Um moderador silenciou você em ${s.name}.`, true);
    if(!was[1] && row.voice_deafened) App.toast(`Um moderador ensurdeceu você em ${s.name}.`, true);
    renderUserPanel(); renderStage();
  }
  const to = row.timeout_until && new Date(row.timeout_until) > new Date();
  if(to) App.toast(`Você está de castigo em ${s.name} até ${new Date(row.timeout_until).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`, true);
  composerTimeout();
};
App.onModDisconnect = pl => {
  if(!pl || !Voice.channel || Voice.channel.server_id !== pl.server_id) return;
  const s = S.servers.find(x => x.id === pl.server_id);
  if(!s || !(s.owner_id === pl.by || (S.roles.get(s.id) || []).some(r => (r.perms & (64|32)) && (S.memberRoles.get(s.id)?.get(pl.by) || new Set()).has(r.id)))) return;
  leaveVoice(); App.toast('Um moderador desconectou você da chamada.', true);
};
App.onRemoved = row => { /* expulso ou banido: o aviso padrão já aparece */ };
/* ao entrar numa call, aplica silêncio do moderador */
const _joinVoiceM = joinVoice;
joinVoice = async function(ch){
  const r = await _joinVoiceM.apply(this, arguments);
  if(Voice.channel && Voice.channel.server_id){ const m = memberRow(Voice.channel.server_id, S.me.id) || {}; Voice.setForced(m.voice_muted, m.voice_deafened); }
  return r;
};
const _leaveVoiceM = leaveVoice;
leaveVoice = async function(){ Voice.forceMuted = Voice.forceDeaf = false; return _leaveVoiceM.apply(this, arguments); };
/* caixa de mensagem em castigo */
function composerTimeout(){
  const c = $('#cmp'); if(!c) return;
  const ch = findChannel(M.cid), sid = ch && ch.server_id, to = sid && timedOut(sid, S.me.id);
  const form = $('#cmpF');
  c.disabled = !!to; form && form.classList.toggle('timedout', !!to);
  if(to){ c.dataset.ph = c.dataset.ph || c.placeholder; c.placeholder = `⏳ Você está de castigo até ${to.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`; c.value = ''; }
  else if(c.dataset.ph){ c.placeholder = c.dataset.ph; delete c.dataset.ph; }
}
new MutationObserver(() => { const c = $('#cmp'); if(c && !c._toChecked){ c._toChecked = true; composerTimeout(); } }).observe(document.body, { childList:true, subtree:true });
setInterval(composerTimeout, 15000);

/* configurações do servidor: lista de banidos */
async function secSrvBans(box, back){
  const s = SET.server;
  box.innerHTML = `${back}<h2>Banimentos</h2><p class="mut">Pessoas banidas não conseguem voltar, nem com convite.</p><div id="bnL" class="mut">Carregando…</div>`;
  const { data, error } = await App.sb.from('server_bans').select('*').eq('server_id', s.id).order('created_at', { ascending:false });
  const el = box.querySelector('#bnL'); if(!el) return;
  if(error){ el.textContent = error.message; return; }
  await ensureProfiles((data || []).flatMap(b => [b.user_id, b.banned_by]));
  el.innerHTML = (data || []).length ? (data || []).map(b => `<div class="banrow">${avatar(prof(b.user_id))}<div class="t"><b>${esc(prof(b.user_id).display_name)}</b><small>${b.reason ? esc(b.reason) + ' · ' : ''}por ${esc(prof(b.banned_by).display_name)} em ${new Date(b.created_at).toLocaleDateString('pt-BR')}</small></div>
    ${App.hasPerm(s.id, 128) ? `<button class="btn sec sm" data-unban="${b.user_id}">Desbanir</button>` : ''}</div>`).join('') : 'Ninguém banido.';
  el.querySelectorAll('[data-unban]').forEach(b => b.onclick = async () => {
    const { error } = await App.sb.rpc('unban_member', { p_server: s.id, p_user: b.dataset.unban });
    if(error){ App.toast(error.message, true); return; } renderSettings();
  });
}
