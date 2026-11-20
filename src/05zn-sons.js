/* =====================================================================
   v6.27: SONS DO SERVIDOR (soundboard próprio de cada servidor)
   Quem gerencia emojis sobe sons curtos (até 7 s / 1 MB). Na call, todo mundo toca pelo
   painel de atividades. Cada um escolhe o volume (ou desliga) em Configurações → Voz e vídeo.
   Proteção contra bagunça: cada pessoa só toca 1 som a cada 3 s, e quem recebe ignora se vier mais rápido.
   ===================================================================== */
S.ssounds = new Map();       // server_id -> [sons]
const SSN_SQL = 'Para os sons do servidor, rode o supabase.sql novo (v6.27) no Supabase.';
const ssnLast = new Map();   // uid -> último som recebido
let ssnMine = 0;
async function loadServerSounds(sid, force){
  if(!sid) return [];
  if(S.ssounds.has(sid) && !force) return S.ssounds.get(sid);
  const { data, error } = await App.sb.from('server_sounds').select('*').eq('server_id', sid).order('created_at');
  const list = error ? [] : (data || []);
  S.ssounds.set(sid, list); return list;
}
App.loadServerSounds = loadServerSounds;
function ssnPlay(snd){
  if(Voice.deafened || P.sbOff) return;
  const a = new Audio(snd.url); a.crossOrigin = 'anonymous';
  a.volume = Math.max(0, Math.min(1, (P.sbVol ?? 0.6) * (snd.volume || 1)));
  if(P.outputId && a.setSinkId) a.setSinkId(P.outputId).catch(() => {});
  a.play().catch(() => {});
  setTimeout(() => { try{ a.pause(); }catch(e){} }, 7500);
}
const _onFxSS = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && pl.t === 'ssnd'){
    const now = Date.now();
    if(!mine && now - (ssnLast.get(pl.uid) || 0) < 2500) return;
    ssnLast.set(pl.uid, now);
    const sid = Voice.channel && Voice.channel.server_id; if(!sid) return;
    loadServerSounds(sid).then(list => {
      const snd = list.find(x => x.id === pl.id) || (S.ssounds.has(sid) ? null : undefined);
      if(snd === null) return loadServerSounds(sid, true).then(l2 => { const s2 = l2.find(x => x.id === pl.id); if(s2){ ssnPlay(s2); floatReaction(s2.emoji || '🔊', pl.uid); } });
      if(snd){ ssnPlay(snd); floatReaction(snd.emoji || '🔊', pl.uid); }
    });
    return;
  }
  // os sons de sempre também respeitam o "desligar soundboard"
  if(pl && pl.t === 'sound' && P.sbOff) return;
  _onFxSS(pl, mine);
};
// no painel de atividades, os sons deste servidor aparecem junto
const _activitiesMenuSS = activitiesMenu;
activitiesMenu = function(anchor){
  _activitiesMenuSS(anchor);
  const el = $('#menu'), sid = Voice.channel && Voice.channel.server_id;
  if(!sid || !el.classList.contains('actpop')) return;
  const sb = el.querySelector('.sboard'); if(!sb) return;
  const box = document.createElement('div'); box.className = 'ssnwrap'; sb.after(box);
  const draw = list => {
    const can = App.hasPerm(sid, 512) || App.hasPerm(sid, 2);
    box.innerHTML = list.length || can ? `<div class="actsec">🔊 Sons do servidor ${can ? `<button class="lnk" id="ssnAdd">+ adicionar</button>` : ''}</div>
      <div class="sboard">${list.map(s => `<button data-ssn="${s.id}" title="${esc(s.name)}"><span>${esc(s.emoji || '🔊')}</span>${esc(s.name)}</button>`).join('') || '<small class="mut">Nenhum som ainda.</small>'}</div>` : '';
    box.querySelectorAll('[data-ssn]').forEach(b => b.onclick = () => {
      if(Date.now() - ssnMine < 3000){ App.toast('Calma. Espere um pouquinho entre os sons'); return; }
      ssnMine = Date.now(); Voice.sendFx({ t: 'ssnd', id: b.dataset.ssn });
    });
    const add = box.querySelector('#ssnAdd'); if(add) add.onclick = () => { closeMenu(); const s = S.servers.find(x => x.id === sid); if(s){ openSettings('server', 'sounds', s); } };
  };
  draw(S.ssounds.get(sid) || []);
  loadServerSounds(sid, true).then(l => { if(box.isConnected) draw(l); });
};

/* ---------- Configurações do servidor → Sons ---------- */
function audioDur(file){
  return new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(NaN); a.src = URL.createObjectURL(file); setTimeout(() => res(NaN), 5000); });
}
async function secSrvSounds(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 512) || App.hasPerm(s.id, 2);
  box.innerHTML = `${back}<h2>Sons</h2><p class="mut">Sons curtos que qualquer pessoa na call pode tocar para todo mundo (painel de <b>Atividades</b> na chamada). Até 24 por servidor.</p><div class="spin" style="margin:20px 0"></div>`;
  const { data, error } = await App.sb.from('server_sounds').select('*').eq('server_id', s.id).order('created_at');
  if(error){ box.innerHTML = `${back}<h2>Sons</h2><div class="locked">${/server_sounds|schema cache|does not exist/i.test(error.message) ? SSN_SQL : esc(error.message)}</div>`; return; }
  const list = data || []; S.ssounds.set(s.id, list);
  box.innerHTML = `${back}<h2>Sons</h2><p class="mut">Sons curtos que qualquer pessoa na call pode tocar para todo mundo (painel de <b>Atividades</b> na chamada). <b>${list.length}/24</b></p>
    ${can ? `<form class="ssnform" id="ssnF"><label class="btn sec"><input type="file" id="ssnFile" accept="audio/*" hidden>${ic('upload', 16)} <span id="ssnFn">Escolher áudio</span></label>
      <input class="inp" id="ssnE" maxlength="8" placeholder="😂" style="width:64px;text-align:center">
      <input class="inp" id="ssnN" maxlength="24" placeholder="Nome do som" style="flex:1;min-width:140px">
      <button class="btn" id="ssnGo">${ic('plus', 16)} Adicionar</button></form><small class="mut">MP3, OGG, WAV ou M4A. Até 7 segundos e 1 MB.</small><div class="err" id="ssnErr"></div>` : '<p class="mut small">Só quem pode gerenciar emojis adiciona sons.</p>'}
    <div class="ssnlist">${list.map(x => `<div class="ssnrow"><button class="ibtn" data-ssprev="${x.id}" data-tip="Ouvir">${ic('play', 16)}</button><span class="sse">${esc(x.emoji || '🔊')}</span><b>${esc(x.name)}</b><small class="mut">por ${esc(prof(x.created_by).display_name)}</small><span class="grow"></span>
      ${can ? `<input type="range" class="range sm" min="10" max="100" value="${Math.round((x.volume || 1) * 100)}" data-ssvol="${x.id}" title="Volume do som"><button class="ibtn sm" data-ssdel="${x.id}" data-tip="Apagar">${ic('trash', 15)}</button>` : ''}</div>`).join('') || '<div class="empty">Nenhum som ainda.</div>'}</div>`;
  box.querySelectorAll('[data-ssprev]').forEach(b => b.onclick = () => { const x = list.find(y => y.id === b.dataset.ssprev); if(x){ const a = new Audio(x.url); a.volume = (P.sbVol ?? 0.6) * (x.volume || 1); a.play().catch(() => {}); } });
  if(!can) return;
  let file = null;
  box.querySelector('#ssnFile').onchange = async e => {
    const f = e.target.files[0]; const err = box.querySelector('#ssnErr'); err.textContent = ''; file = null;
    if(!f) return;
    if(!/^audio\//.test(f.type)){ err.textContent = 'Escolha um arquivo de áudio.'; return; }
    if(f.size > 1048576){ err.textContent = 'Passou de 1 MB. Corte o áudio ou use MP3.'; return; }
    const d = await audioDur(f);
    if(d > 7.5){ err.textContent = `O som tem ${Math.round(d)} s. O máximo é 7 s.`; return; }
    file = f; box.querySelector('#ssnFn').textContent = f.name.slice(0, 28);
    const n = box.querySelector('#ssnN'); if(!n.value) n.value = f.name.replace(/\.[^.]+$/, '').slice(0, 24);
  };
  box.querySelector('#ssnF').onsubmit = async e => {
    e.preventDefault(); const err = box.querySelector('#ssnErr');
    const name = box.querySelector('#ssnN').value.trim(), emoji = box.querySelector('#ssnE').value.trim() || null;
    if(!file){ err.textContent = 'Escolha o áudio primeiro.'; return; }
    if(!name){ err.textContent = 'Dê um nome.'; return; }
    const b = box.querySelector('#ssnGo'); b.disabled = true; b.textContent = 'Enviando…';
    try{
      const meta = await uploadOne({ file });
      const { error } = await App.sb.from('server_sounds').insert({ server_id: s.id, name, emoji, url: meta.url });
      if(error) throw error;
      App.toast('Som adicionado! 🔊'); renderSettings();
    }catch(x){ b.disabled = false; b.innerHTML = `${ic('plus', 16)} Adicionar`; err.textContent = /schema cache|does not exist/i.test(x.message || '') ? SSN_SQL : (x.message || String(x)); }
  };
  box.querySelectorAll('[data-ssvol]').forEach(r => r.onchange = async () => {
    await App.sb.from('server_sounds').update({ volume: +r.value / 100 }).eq('id', r.dataset.ssvol); loadServerSounds(s.id, true);
  });
  box.querySelectorAll('[data-ssdel]').forEach(b => b.onclick = async () => {
    if(!(await confirmBox('Apagar som', 'Apagar este som do servidor?', 'Apagar'))) return;
    const { error } = await App.sb.from('server_sounds').delete().eq('id', b.dataset.ssdel);
    if(error){ App.toast(error.message, true); return; }
    renderSettings();
  });
}
// Configurações → Voz e vídeo: volume e desligar
const _secVoiceSS = secVoice;
secVoice = function(box, back){
  _secVoiceSS.apply(this, arguments);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>Soundboard</h3>
    ${row('Ouvir os sons da soundboard', 'Os sons que a galera toca na call (buzina, palmas e os sons do servidor).', toggle('sbOn', !P.sbOff))}
    <div class="srow"><div class="t"><b>Volume da soundboard</b></div><input type="range" class="range" id="sbVol" min="0" max="100" value="${Math.round((P.sbVol ?? 0.6) * 100)}" style="max-width:220px"></div>`);
  box.querySelector('#sbOn').onchange = e => { P.sbOff = !e.target.checked; savePrefs(); };
  box.querySelector('#sbVol').onchange = e => { P.sbVol = +e.target.value / 100; savePrefs(); };
};
