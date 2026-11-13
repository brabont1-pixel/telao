/* =====================================================================
   v6.9: MODO PALCO — canal de voz em que só quem está no palco fala; a plateia escuta e levanta a mão.
   Quem não está no palco fica mudo para todo mundo (os outros aparelhos zeram o volume dele),
   então funciona mesmo se alguém tentar burlar o próprio app.
   ===================================================================== */
S.stage = new Map(); // channel_id -> [{ user_id, status, created_at }]
const isStage = ch => !!(ch && ch.stage && ch.server_id);
const stageRows = cid => S.stage.get(cid) || [];
const isSpeaker = (cid, uid) => stageRows(cid).some(r => r.user_id === uid && r.status === 'speaker');
const handUp = (cid, uid) => stageRows(cid).some(r => r.user_id === uid && r.status === 'hand');
function stageMod(sid){ const s = S.servers.find(x => x.id === sid); return !!s && (s.owner_id === S.me.id || App.hasPerm(sid, 64) || App.hasPerm(sid, 1)); }
const inStageAudience = () => isStage(Voice.channel) && !isSpeaker(Voice.channel.id, S.me.id);

async function loadStage(cid){
  ensureStageRt();
  const { data } = await App.sb.from('stage_queue').select('*').eq('channel_id', cid);
  S.stage.set(cid, data || []);
}
async function stageSet(uid, status){
  const ch = Voice.channel || findChannel(S.route.cid);
  if(!ch) return;
  const { error } = await App.sb.rpc('stage_set', { p_channel: ch.id, p_user: uid, p_status: status });
  if(error){ App.toast(error.message, true); return; }
  await loadStage(ch.id); stageApply(); renderStage();
}

/* quem está na plateia fica mudo para todos */
const _srvVoiceMutedP = App.srvVoiceMuted;
App.srvVoiceMuted = uid => {
  const ch = Voice.channel;
  if(isStage(ch) && !isSpeaker(ch.id, uid)) return true;
  return _srvVoiceMutedP ? _srvVoiceMutedP(uid) : false;
};
let wasSpeaker = null;
function stageApply(){
  const ch = Voice.channel;
  if(!isStage(ch)){ wasSpeaker = null; return; }
  const sid = ch.server_id, m = (S.members.get(sid) || []).find(x => x.user_id === S.me.id) || {};
  const spk = isSpeaker(ch.id, S.me.id);
  Voice.setForced(!!m.voice_muted || !spk, !!m.voice_deafened);
  if(!spk){ if(Voice.screenStream) Voice.stopScreen(); if(Voice.camStream) Voice.stopCamera(); }
  if(wasSpeaker !== null && wasSpeaker !== spk){
    App.toast(spk ? '🎤 Você subiu no palco! Ligue o microfone para falar.' : 'Você voltou para a plateia.');
  }
  wasSpeaker = spk;
  Voice.peers.forEach(p => Voice.applyVolume(p));
  Voice.track && Voice.track();
}
const _toggleMuteP = Voice.toggleMute.bind(Voice);
Voice.toggleMute = function(){
  if(inStageAudience()){ App.toast('Você está na plateia. Levante a mão ✋ para pedir para falar.'); return; }
  return _toggleMuteP();
};
const _startScreenP = Voice.startScreen, _startCameraP = Voice.startCamera;
Voice.startScreen = async function(){ if(inStageAudience()){ App.toast('Só quem está no palco pode transmitir a tela.', true); return; } return _startScreenP.apply(this, arguments); };
Voice.startCamera = async function(){ if(inStageAudience()){ App.toast('Só quem está no palco pode ligar a câmera.', true); return; } return _startCameraP.apply(this, arguments); };
if(App.onModChange){ const _omc = App.onModChange; App.onModChange = row => { _omc(row); stageApply(); }; }

const _joinVoiceP = joinVoice;
joinVoice = async function(ch){
  if(isStage(ch)) await loadStage(ch.id);
  wasSpeaker = null;
  const r = await _joinVoiceP.apply(this, arguments);
  if(isStage(Voice.channel)){
    stageApply();
    if(!isSpeaker(ch.id, S.me.id)) App.toast(`Você entrou no palco ${ch.name} como ouvinte. Levante a mão ✋ para pedir para falar.`);
  }
  return r;
};
const _leaveVoiceP = leaveVoice;
leaveVoice = async function(){
  const ch = Voice.channel;
  if(isStage(ch) && stageRows(ch.id).some(r => r.user_id === S.me.id)) App.sb.rpc('stage_set', { p_channel: ch.id, p_user: S.me.id, p_status: null }).then(() => {}, () => {});
  wasSpeaker = null;
  return _leaveVoiceP.apply(this, arguments);
};

/* tempo real */
let stageRt = null;
function ensureStageRt(){
  if(stageRt) return;
  stageRt = App.sb.channel('stage-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'stage_queue' }, async p => {
  const cid = (p.new && p.new.channel_id) || (p.old && p.old.channel_id);
  const watching = (Voice.channel && Voice.channel.id === cid) || S.stage.has(cid);
  if(!watching) return;
  const before = Voice.channel && Voice.channel.id === cid && stageRows(cid).filter(r => r.status === 'hand').length;
  await loadStage(cid);
  if(Voice.channel && Voice.channel.id === cid){
    stageApply();
    const hands = stageRows(cid).filter(r => r.status === 'hand').length;
    if(stageMod(Voice.channel.server_id) && hands > before) App.sfx && App.sfx('msg');
  }
  renderStage(); renderSidebar();
}).subscribe();
}

/* ---------- tela do palco ---------- */
const _renderStageP = renderStage;
renderStage = function(){
  _renderStageP.apply(this, arguments);
  const wrap = $('#stageWrap'); if(!wrap) return;
  const { ch } = stageChannel(); if(!isStage(ch)) return;
  const inThis = Voice.channel && Voice.channel.id === ch.id;
  const users = voiceUsers(ch);
  if(!inThis){
    const j = wrap.querySelector('#stJoin'); if(j) j.innerHTML = `${ic('headphones', 18)} Entrar como ouvinte`;
    const h = wrap.querySelector('.joincard h2'); if(h) h.insertAdjacentHTML('afterend', `<div class="stgtopic">${ic('signal', 14)} Palco${ch.stage_topic ? ' · ' + esc(ch.stage_topic) : ''}</div>`);
    return;
  }
  const stg = wrap.querySelector('.stage'); if(!stg) return;
  const mod = stageMod(ch.server_id), me = S.me.id;
  const present = new Set(users.map(u => u.user_id));
  const speakers = [...new Set(users.filter(u => isSpeaker(ch.id, u.user_id)).map(u => u.user_id))];
  const audience = [...new Set(users.map(u => u.user_id))].filter(u => !speakers.includes(u));
  const hands = stageRows(ch.id).filter(r => r.status === 'hand' && present.has(r.user_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  // só quem está no palco aparece em destaque
  const grid = stg.querySelector('.tiles.grid');
  stg.querySelectorAll('.tile[data-vuser]').forEach(t => { if(!speakers.includes(t.dataset.vuser)) t.remove(); });
  if(grid){
    grid.className = `tiles grid n${Math.max(1, Math.min(speakers.length, 9))}`;
    if(!speakers.length) grid.innerHTML = `<div class="stgempty">${ic('signal', 34)}<b>Ninguém no palco ainda</b><span>${mod ? 'Suba no palco ou chame alguém que levantou a mão.' : 'Levante a mão para pedir para falar.'}</span></div>`;
  }
  const chip = (uid, extra = '') => `<span class="stgchip">${avatar(prof(uid), 'xs')}<span>${esc(prof(uid).display_name)}${uid === me ? ' (você)' : ''}</span>${extra}</span>`;
  const panel = document.createElement('div'); panel.className = 'stgpanel';
  panel.innerHTML = `
    <div class="stgh"><span class="stglive">${ic('signal', 13)} PALCO</span><b>${esc(ch.stage_topic || ch.name)}</b><span class="mut small">${speakers.length} no palco · ${audience.length} ouvindo</span></div>
    ${mod && hands.length ? `<div class="stghands"><span class="stgl">${ic('hand', 14)} Mãos levantadas (${hands.length})</span>${hands.map(r => chip(r.user_id, `<button class="btn sm" data-stup="${r.user_id}">Chamar</button><button class="ibtn sm" data-stdown="${r.user_id}" data-tip="Recusar">${ic('x', 14)}</button>`)).join('')}</div>` : ''}
    ${speakers.length && mod ? `<div class="stgrow"><span class="stgl">No palco</span>${speakers.map(u => chip(u, u === me ? '' : `<button class="ibtn sm" data-stdown="${u}" data-tip="Tirar do palco">${ic('x', 14)}</button>`)).join('')}</div>` : ''}
    <div class="stgrow"><span class="stgl">Plateia</span>${audience.length ? `<span class="stgavs">${audience.slice(0, 18).map(u => `<span class="stgav" data-tip="${esc(prof(u).display_name)}${handUp(ch.id, u) ? ' levantou a mão' : ''}">${avatar(prof(u), 'sm')}${handUp(ch.id, u) ? '<i>✋</i>' : ''}</span>`).join('')}${audience.length > 18 ? `<span class="mut small">+${audience.length - 18}</span>` : ''}</span>` : '<span class="mut small">ninguém só ouvindo</span>'}</div>`;
  stg.insertBefore(panel, stg.firstChild);
  // botão de ação no lugar certo da barra
  const bar = stg.querySelector('.stagebar .sbg');
  const spk = isSpeaker(ch.id, me);
  const act = spk ? `<button class="cbtn" id="sbStage" data-tip="Descer para a plateia">${ic('arrowDown', 22)}</button>`
    : mod ? `<button class="cbtn on" id="sbStage" data-tip="Subir no palco">${ic('signal', 22)}</button>`
    : `<button class="cbtn ${handUp(ch.id, me) ? 'on' : ''}" id="sbStage" data-tip="${handUp(ch.id, me) ? 'Baixar a mão' : 'Levantar a mão'}"><span class="handic">✋</span></button>`;
  if(bar) bar.insertAdjacentHTML('beforeend', act);
  const mic = stg.querySelector('#sbMic'); if(mic && !spk){ mic.classList.add('off', 'locked'); mic.dataset.tip = 'Você está na plateia'; }
  const sb = stg.querySelector('#sbStage');
  if(sb) sb.onclick = () => spk ? stageSet(me, null) : mod ? stageSet(me, 'speaker') : stageSet(me, handUp(ch.id, me) ? null : 'hand');
  panel.querySelectorAll('[data-stup]').forEach(b => b.onclick = () => stageSet(b.dataset.stup, 'speaker'));
  panel.querySelectorAll('[data-stdown]').forEach(b => b.onclick = () => stageSet(b.dataset.stdown, null));
};

/* lista de canais: etiqueta de palco */
const _renderSidebarP = renderSidebar;
renderSidebar = function(){
  _renderSidebarP.apply(this, arguments);
  document.querySelectorAll('#sbBody .ch[data-cid]').forEach(el => {
    const c = findChannel(el.dataset.cid); if(!isStage(c) || el.querySelector('.stgtag')) return;
    const nm = el.querySelector('.nm'); if(nm) nm.insertAdjacentHTML('afterend', `<span class="stgtag" data-tip="Palco: só quem está no palco fala">PALCO</span>`);
  });
};
App.loadStage = loadStage;
