/* =====================================================================
   v6: CONEXÕES (Spotify) e ATIVIDADE ("Ouvindo", "Jogando"…)
   O Spotify usa login PKCE: não precisa de chave secreta no site.
   ===================================================================== */
S.cfg = {};
S.conn = null;          // minha conexão com o Spotify (linha de public.connections)
const SP = { token: null, exp: 0, timer: null, last: null, busy: false };
const SP_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const spRedirect = () => location.origin + '/';
// guarda o retorno do Spotify antes de qualquer coisa mexer na URL
(() => {
  const q = new URLSearchParams(location.search);
  if(q.get('state') === 'telao-spotify' && (q.get('code') || q.get('error'))){
    S.spReturn = { code: q.get('code'), error: q.get('error') };
    history.replaceState(null, '', location.pathname + location.hash);
  }
})();

const ACT_TYPES = {
  playing:  ['Jogando', 'gamepad'], watching: ['Assistindo', 'tv'], listening: ['Ouvindo', 'music'],
  studying: ['Estudando', 'book'], working: ['Trabalhando em', 'code'], streaming: ['Transmitindo', 'screenUp'],
};
const GAME_PRESETS = ['Valorant','Counter-Strike 2','League of Legends','Minecraft','Fortnite','GTA V','Roblox','EA FC','Rocket League','Free Fire','Apex Legends','Dota 2','Rainbow Six Siege','Overwatch 2','Elden Ring','Call of Duty'];

/* atividade válida agora (some sozinha se a música acabou ou a pessoa saiu) */
function actOf(p){
  const a = p && p.activity; if(!a || typeof a !== 'object') return null;
  const online = p.id === (S.me && S.me.id) || S.online.has(p.id);
  if(!online) return null;
  if(a.type === 'spotify' && a.lf){ if(!a.playing || !a.until || Date.now() > a.until) return null; return a; }
  if(a.type === 'spotify'){ if(!a.playing || !a.end || Date.now() > a.end + 20000) return null; return a; }
  if(!ACT_TYPES[a.type] || !a.name) return null;
  if(a.since && Date.now() - a.since > 24 * 3600e3) return null;
  return a;
}
App.actOf = actOf;
const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; };
function actLine(p){
  const a = actOf(p); if(!a) return '';
  if(a.type === 'spotify') return `<span class="actl sp">${ic('spotify', 12)} Ouvindo <b>${esc(a.track)}</b></span>`;
  return `<span class="actl">${ic(ACT_TYPES[a.type][1], 12)} ${ACT_TYPES[a.type][0]} <b>${esc(a.name)}</b></span>`;
}
App.actLine = actLine;
function actCard(p){
  const a = actOf(p); if(!a) return '';
  if(a.type === 'spotify' && a.lf){
    const q = encodeURIComponent(a.track + ' ' + (a.artist || ''));
    return `<h6>Ouvindo no Spotify</h6><div class="actcard sp">
      ${a.art ? `<img src="${esc(a.art)}" alt="" loading="lazy">` : `<span class="nart">${ic('music', 22)}</span>`}
      <div class="at"><b title="${esc(a.track)}">${esc(a.track)}</b><small>${esc(a.artist || '')}</small><small class="mut">${esc(a.album || '')}</small>
        <small class="mut">${a.since ? 'tocando ' + ago(a.since) : 'tocando agora'}</small></div></div>
      <div class="actbtns"><a class="btn sm" href="https://open.spotify.com/search/${q}" target="_blank" rel="noopener">${ic('spotify', 15)} Ouvir no Spotify</a></div>`;
  }
  if(a.type === 'spotify'){
    const pct = Math.min(100, Math.max(0, (Date.now() - a.start) / (a.end - a.start) * 100));
    const mine = p.id === S.me.id;
    return `<h6>Ouvindo no Spotify</h6><div class="actcard sp" data-actuid="${p.id}">
      ${a.art ? `<img src="${esc(a.art)}" alt="" loading="lazy">` : `<span class="nart">${ic('music', 22)}</span>`}
      <div class="at"><b title="${esc(a.track)}">${esc(a.track)}</b><small>${esc(a.artist || '')}</small><small class="mut">${esc(a.album || '')}</small>
        <div class="spbar"><i style="width:${pct.toFixed(1)}%" data-spstart="${a.start}" data-spend="${a.end}"></i></div>
        <div class="sptime"><span data-spcur="${a.start}">${fmtMs(Date.now() - a.start)}</span><span>${fmtMs(a.end - a.start)}</span></div></div></div>
      <div class="actbtns"><a class="btn sec sm" href="${esc(a.url || '#')}" target="_blank" rel="noopener">${ic('spotify', 15)} Abrir no Spotify</a>
        ${mine ? '' : `<button class="btn sm" data-listen="${p.id}">${ic('headphones', 15)} Ouvir junto</button>`}</div>`;
  }
  return `<h6>${ACT_TYPES[a.type][0]}</h6><div class="actcard"><span class="nart">${ic(ACT_TYPES[a.type][1], 24)}</span>
    <div class="at"><b>${esc(a.name)}</b>${a.detail ? `<small>${esc(a.detail)}</small>` : ''}<small class="mut">${a.since ? ago(a.since) : ''}</small></div></div>`;
}
const fmtMs = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
// barra de progresso andando sozinha
setInterval(() => {
  document.querySelectorAll('[data-spstart]').forEach(i => { const s = +i.dataset.spstart, e = +i.dataset.spend; i.style.width = Math.min(100, (Date.now() - s) / (e - s) * 100) + '%'; });
  document.querySelectorAll('[data-spcur]').forEach(i => { i.textContent = fmtMs(Date.now() - +i.dataset.spcur); });
}, 1000);

/* aparece no cartão de perfil, na lista de membros e nas DMs */
const _statusText = statusText;
statusText = function(p){ return actLine(p) || _statusText(p); };
const _profileCard2 = profileCard;
profileCard = function(p, extra=''){
  const h = _profileCard2(p, extra), card = actCard(p);
  if(!card) return h;
  return h.includes('<h6>') ? h.replace('<h6>', card + '<h6>') : h.replace(/<\/div><\/div>$/, card + '</div></div>');
};

/* ---------- carregar config e conexão ---------- */
async function loadAppConfig(){
  const { data } = await App.sb.from('app_config').select('*');
  S.cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
}
async function loadConnection(){
  const { data } = await App.sb.from('connections').select('*').eq('user_id', S.me.id).eq('provider', 'spotify').maybeSingle();
  S.conn = data || null;
}
const _loadServersC = loadServers;
loadServers = async function(){
  await _loadServersC();
  if(!S._v6init){ S._v6init = true; v6Init(); }
};
async function v6Init(){
  try{ await Promise.all([loadAppConfig(), loadConnection()]); }catch(e){}
  if(S.spReturn) await finishSpotify(S.spReturn);
  S.manualAct = ls.get('telao-act', null);
  if(S.conn && S.conn.refresh_token) startSpotifyPoll();
  else if(lfUser()) startLastfm();
  else if(S.manualAct && !actOf(S.me)) setActivity(S.manualAct);
}

/* ---------- Spotify pelo Last.fm: funciona para qualquer pessoa, sem lista de liberação ----------
   A pessoa liga o Spotify ao Last.fm uma vez (no site do Last.fm) e coloca o usuário dela aqui. */
const LASTFM_KEY = '';   // chave pública da API do Last.fm (o admin também pode colar em Conexões)
const lfKey = () => (S.cfg && S.cfg.lastfm_api_key) || LASTFM_KEY;
const lfUser = () => { const l = (Array.isArray(S.me.links) ? S.me.links : []).find(x => x.t === 'lastfm'); return l ? l.u : null; };
const LF = { timer: null, busy: false };
async function lfApi(method, params){
  const u = new URL('https://ws.audioscrobbler.com/2.0/');
  u.search = new URLSearchParams({ method, api_key: lfKey(), format: 'json', ...params });
  const r = await fetch(u); const j = await r.json().catch(() => ({}));
  if(j.error) { const e = new Error(j.message || 'Last.fm'); e.code = j.error; throw e; }
  return j;
}
function startLastfm(){ clearInterval(LF.timer); if(!lfKey()) return; lfPoll(); LF.timer = setInterval(lfPoll, 20000); }
async function lfPoll(){
  const user = lfUser(); if(LF.busy || !user || !lfKey()) return; LF.busy = true;
  try{
    const j = await lfApi('user.getrecenttracks', { user, limit: 1, extended: 0 });
    const t = ((j.recenttracks || {}).track || [])[0];
    const playing = t && t['@attr'] && t['@attr'].nowplaying === 'true';
    const cur = S.me.activity && S.me.activity.lf ? S.me.activity : null;
    if(playing){
      const id = (t.artist && (t.artist['#text'] || t.artist.name) || '') + '|' + t.name;
      const art = (t.image || []).map(i => i['#text']).filter(Boolean).slice(-2)[0] || null;
      const same = cur && cur.id === id;
      // só grava de novo quando muda a música, ou para avisar que continua tocando
      if(!same || cur.until - Date.now() < 2.5 * 60e3)
        await setActivity({ type: 'spotify', lf: true, id, track: t.name, artist: t.artist && (t.artist['#text'] || t.artist.name), album: t.album && t.album['#text'],
          art: art && !/2a96cbd8b46e442fc41c2b86b821562f/.test(art) ? art : null, url: t.url, playing: true, since: same ? cur.since : Date.now(), until: Date.now() + 5 * 60e3 }, true);
    } else if(cur) await setActivity(S.manualAct || null, true);
  }catch(e){
    if(e.code === 6) { clearInterval(LF.timer); App.toast('Não achei esse usuário do Last.fm. Confira em Configurações → Conexões.', true); }
  }finally{ LF.busy = false; }
}
async function connectLastfm(name){
  name = (name || '').trim().replace(/^https?:\/\/(www\.)?last\.fm\/(pt\/)?user\//i, '').replace(/\/.*$/, '');
  if(!name) return false;
  try{ await lfApi('user.getinfo', { user: name }); }
  catch(e){ App.toast(e.code === 6 ? 'Esse usuário do Last.fm não existe.' : 'Last.fm: ' + e.message, true); return false; }
  const links = (Array.isArray(S.me.links) ? S.me.links : []).filter(l => l.t !== 'lastfm').concat([{ t: 'lastfm', u: name }]).slice(-6);
  const { data, error } = await App.sb.from('profiles').update({ links }).eq('id', S.me.id).select().single();
  if(error){ App.toast(error.message, true); return false; }
  S.me = data; S.profiles.set(data.id, data);
  startLastfm(); App.toast('Pronto. Quando você der play no Spotify, aparece no seu perfil em até 30 segundos.');
  return true;
}
async function disconnectLastfm(){
  clearInterval(LF.timer);
  const links = (Array.isArray(S.me.links) ? S.me.links : []).filter(l => l.t !== 'lastfm');
  const { data } = await App.sb.from('profiles').update({ links, activity: S.manualAct || null }).eq('id', S.me.id).select().single();
  if(data){ S.me = data; S.profiles.set(data.id, data); }
  renderSettings(); renderUserPanel();
}

/* ---------- Spotify: conectar (PKCE) ---------- */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function connectSpotify(){
  const cid = S.cfg.spotify_client_id;
  if(!cid){ App.toast('O Spotify ainda não foi configurado pelo admin do Telão.', true); return; }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('telao-sp-verifier', verifier);
  const u = new URL('https://accounts.spotify.com/authorize');
  u.search = new URLSearchParams({ client_id: cid, response_type: 'code', redirect_uri: spRedirect(), scope: SP_SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, state: 'telao-spotify' });
  location.href = u.toString();
}
async function spTokenRequest(body){
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.error_description || j.error || 'Spotify recusou');
  return j;
}
async function finishSpotify(ret){
  S.spReturn = null;
  if(ret.error){ App.toast(ret.error === 'access_denied' ? 'Conexão com o Spotify cancelada.' : 'O Spotify recusou: ' + ret.error, true); return; }
  const verifier = sessionStorage.getItem('telao-sp-verifier'); sessionStorage.removeItem('telao-sp-verifier');
  if(!verifier){ App.toast('Não deu para terminar a conexão com o Spotify. Tente de novo.', true); return; }
  try{
    const t = await spTokenRequest({ grant_type: 'authorization_code', code: ret.code, redirect_uri: spRedirect(), client_id: S.cfg.spotify_client_id, code_verifier: verifier });
    SP.token = t.access_token; SP.exp = Date.now() + (t.expires_in - 60) * 1000;
    const me = await spApi('/v1/me');
    const row = { user_id: S.me.id, provider: 'spotify', account_name: (me && (me.display_name || me.id)) || 'Spotify', refresh_token: t.refresh_token, show_activity: true };
    const { error } = await App.sb.from('connections').upsert(row);
    if(error) throw error;
    S.conn = row; App.toast('Spotify conectado. O que você ouvir aparece no seu perfil.');
    startSpotifyPoll(); openSettings('user', 'connections');
  }catch(e){
    App.toast(/user not registered|not registered in the developer/i.test(e.message)
      ? 'Sua conta do Spotify ainda não foi liberada no app do Telão. Peça para o admin te adicionar (Spotify for Developers → User Management).'
      : 'Erro ao conectar o Spotify: ' + e.message, true);
  }
}
async function spRefresh(){
  if(!S.conn || !S.conn.refresh_token) throw new Error('sem conexão');
  try{
    const t = await spTokenRequest({ grant_type: 'refresh_token', refresh_token: S.conn.refresh_token, client_id: S.cfg.spotify_client_id });
    SP.token = t.access_token; SP.exp = Date.now() + (t.expires_in - 60) * 1000;
    if(t.refresh_token && t.refresh_token !== S.conn.refresh_token){
      S.conn.refresh_token = t.refresh_token;
      await App.sb.from('connections').update({ refresh_token: t.refresh_token }).eq('user_id', S.me.id).eq('provider', 'spotify');
    }
  }catch(e){
    // outro aparelho pode ter renovado o token: pega o mais novo do banco e tenta de novo
    const old = S.conn.refresh_token; await loadConnection();
    if(S.conn && S.conn.refresh_token && S.conn.refresh_token !== old) return spRefresh();
    throw e;
  }
}
async function spApi(path, opt={}){
  if(!SP.token || Date.now() > SP.exp) await spRefresh();
  let r = await fetch('https://api.spotify.com' + path, { ...opt, headers: { Authorization: 'Bearer ' + SP.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if(r.status === 401){ await spRefresh(); r = await fetch('https://api.spotify.com' + path, { ...opt, headers: { Authorization: 'Bearer ' + SP.token, 'Content-Type': 'application/json' } }); }
  if(r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if(!r.ok){ const err = new Error((j && j.error && (j.error.message || j.error.reason)) || ('HTTP ' + r.status)); err.status = r.status; err.reason = j && j.error && j.error.reason; throw err; }
  return j;
}
function startSpotifyPoll(){ clearInterval(SP.timer); spPoll(); SP.timer = setInterval(spPoll, 15000); }
async function spPoll(){
  if(SP.busy || !S.conn) return; SP.busy = true;
  try{
    const j = await spApi('/v1/me/player/currently-playing?additional_types=episode');
    const it = j && j.item;
    let act = null;
    if(it && j.is_playing && S.conn.show_activity !== false){
      const start = Date.now() - (j.progress_ms || 0);
      const art = it.album ? (it.album.images || []).slice(-2)[0] : (it.images || [])[0];
      act = { type: 'spotify', id: it.id, uri: it.uri, track: it.name, artist: it.artists ? it.artists.map(a => a.name).join(', ') : (it.show && it.show.name) || '',
        album: it.album ? it.album.name : '', art: art ? art.url : null, url: it.external_urls && it.external_urls.spotify, start, end: start + (it.duration_ms || 0), playing: true };
    }
    const cur = S.me.activity && S.me.activity.type === 'spotify' ? S.me.activity : null;
    const changed = act ? (!cur || cur.id !== act.id || Math.abs(cur.start - act.start) > 6000) : !!cur;
    if(changed) await setActivity(act || S.manualAct || null, true);
  }catch(e){
    if(e.status === 429) return;
    if(/invalid_grant|revoked|sem conexão/i.test(e.message)){ clearInterval(SP.timer); App.toast('A conexão com o Spotify expirou. Conecte de novo em Configurações → Conexões.', true); }
  }finally{ SP.busy = false; }
}
async function setActivity(act, fromSpotify){
  if(!fromSpotify){ S.manualAct = act; ls.set('telao-act', act); }
  const cur = S.me.activity && S.me.activity.type === 'spotify' && actOf(S.me);
  const value = !fromSpotify && cur ? S.me.activity : act;   // música tocando tem prioridade
  const { data, error } = await App.sb.from('profiles').update({ activity: value }).eq('id', S.me.id).select().single();
  if(error){ App.toast(error.message, true); return; }
  S.me = data; S.profiles.set(data.id, data); renderUserPanel(); renderMembers(); renderSidebar();
  if(SET && SET.sec === 'connections') renderSettings();
}
async function disconnectSpotify(){
  if(!(await confirmBox('Desconectar Spotify', 'Parar de mostrar o que você ouve e remover a conexão?', 'Desconectar'))) return;
  clearInterval(SP.timer); SP.token = null;
  await App.sb.from('connections').delete().eq('user_id', S.me.id).eq('provider', 'spotify');
  S.conn = null;
  if(S.me.activity && S.me.activity.type === 'spotify') await setActivity(S.manualAct || null, true);
  renderSettings();
}
/* ouvir junto: toca a mesma música no seu Spotify, no mesmo ponto (precisa de Premium) */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-listen]'); if(!b) return;
  const a = actOf(prof(b.dataset.listen)); if(!a) return;
  if(!S.conn){ App.toast('Conecte seu Spotify em Configurações → Conexões para ouvir junto.', false, { label: 'Conectar', fn: () => openSettings('user', 'connections') }); return; }
  try{
    await spApi('/v1/me/player/play', { method: 'PUT', body: JSON.stringify({ uris: [a.uri], position_ms: Math.max(0, Date.now() - a.start) }) });
    App.toast(`Tocando “${a.track}” junto com ${prof(b.dataset.listen).display_name}.`);
  }catch(err){
    if(err.reason === 'NO_ACTIVE_DEVICE' || err.status === 404) App.toast('Abra o Spotify em algum aparelho (celular ou PC) e tente de novo.', true);
    else if(err.reason === 'PREMIUM_REQUIRED' || err.status === 403) App.toast('Ouvir junto precisa do Spotify Premium. Você ainda pode abrir a música.', true, { label: 'Abrir', fn: () => window.open(a.url, '_blank') });
    else App.toast('Spotify: ' + err.message, true);
  }
});
/* copiar Riot ID / Epic / Battle.net do perfil */
document.addEventListener('click', e => { const c = e.target.closest('[data-copytxt]'); if(c){ e.preventDefault(); copy(c.dataset.copytxt); } });

/* ---------- atividade manual ---------- */
function activityModal(){
  const cur = S.manualAct || {};
  let type = cur.type && ACT_TYPES[cur.type] ? cur.type : 'playing';
  modal(`<form id="acF"><div class="mh"><h2>O que você está fazendo?</h2><p>Aparece embaixo do seu nome para os amigos, com o tempo que você está nisso.</p></div>
    <div class="mc">
      <div class="acttypes">${Object.entries(ACT_TYPES).filter(([k]) => k !== 'streaming').map(([k, [l, i]]) => `<button type="button" data-at="${k}" class="${k === type ? 'on' : ''}">${ic(i, 18)}<span>${l.replace(' em', '')}</span></button>`).join('')}</div>
      <label class="field"><span id="acL">Nome</span><input class="inp" id="acN" maxlength="60" list="acList" value="${esc(cur.name || '')}" placeholder="Valorant"></label>
      <datalist id="acList">${GAME_PRESETS.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label class="field"><span>Detalhe (opcional)</span><input class="inp" id="acD" maxlength="60" value="${esc(cur.detail || '')}" placeholder="Ranqueada com a galera"></label>
    </div>
    <div class="mf">${S.manualAct ? '<button type="button" class="btn sec" id="acX">Limpar</button>' : ''}<span class="grow"></span><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    const ph = { playing:'Valorant', watching:'One Piece', listening:'Podcast do Flow', studying:'Termodinâmica', working:'meu TCC' };
    const upd = () => { m.querySelectorAll('[data-at]').forEach(x => x.classList.toggle('on', x.dataset.at === type)); m.querySelector('#acN').placeholder = ph[type] || ''; m.querySelector('#acN').setAttribute('list', type === 'playing' ? 'acList' : ''); };
    m.querySelectorAll('[data-at]').forEach(b => b.onclick = () => { type = b.dataset.at; upd(); });
    upd();
    const x = m.querySelector('#acX'); if(x) x.onclick = () => { closeModal(); setActivity(null); };
    m.querySelector('#acF').onsubmit = e => {
      e.preventDefault(); const name = m.querySelector('#acN').value.trim(); if(!name) return;
      const detail = m.querySelector('#acD').value.trim() || null;
      closeModal(); setActivity({ type, name, detail, since: Date.now() });
    };
  });
}
App.activityModal = activityModal;

/* ---------- Configurações → Conexões ---------- */
function secConnections(box, back){
  const cid = S.cfg.spotify_client_id, c = S.conn, a = actOf(S.me);
  box.innerHTML = `${back}<h2>Conexões</h2>
    <p class="mut">Vincule suas contas para mostrar no perfil o que você está ouvindo e jogando.</p>
    <div class="conncard">
      <div class="ch2"><span class="clogo sp">${ic('spotify', 26)}</span><div class="t"><b>Spotify</b><small>${lfUser() ? 'Ligado pelo Last.fm como <b>' + esc(lfUser()) + '</b>' : 'Funciona para qualquer conta do Spotify, grátis ou Premium.'}</small></div>
        ${lfUser() ? '<button class="btn sec sm" id="lfOff">Desligar</button>' : ''}</div>
      ${!lfKey() ? `<div class="mut small" style="margin-top:8px">${S.me.is_admin ? 'Cole a chave da API do Last.fm logo abaixo para liberar para todo mundo.' : 'O admin do Telão ainda precisa ativar.'}</div>`
      : lfUser() ? `<div class="mut small" style="margin-top:8px">${a && a.lf ? `Tocando agora: <b>${esc(a.track)}</b> — ${esc(a.artist || '')}` : 'Nada tocando agora. Dê play no Spotify e espere até 30 segundos.'}</div>`
      : `<ol class="steps" style="margin-top:10px">
          <li>Crie uma conta grátis em <a href="https://www.last.fm/join" target="_blank" rel="noopener">last.fm/join</a> (ou entre na sua).</li>
          <li>Abra <a href="https://www.last.fm/settings/applications" target="_blank" rel="noopener">last.fm/settings/applications</a> e clique em <b>Conectar</b> no Spotify. É só uma vez.</li>
          <li>Digite aqui seu nome de usuário do Last.fm:</li></ol>
        <div style="display:flex;gap:8px"><input class="inp" id="lfName" placeholder="seu usuário do Last.fm" autocomplete="off"><button class="btn" id="lfGo">Ligar</button></div>`}
    </div>
    ${cid || c ? `<div class="conncard">
      <div class="ch2"><span class="clogo sp">${ic('spotify', 26)}</span><div class="t"><b>Spotify direto + Ouvir junto</b><small>${c ? 'Conectado como <b>' + esc(c.account_name || '') + '</b>' : 'Mostre a música que está tocando e deixe os amigos ouvirem junto.'}</small></div>
        ${c ? `<button class="btn sec sm" id="spOff">Desconectar</button>` : `<button class="btn sm" id="spOn" ${cid ? '' : 'disabled'}>Conectar</button>`}</div>
      ${c ? `${row('Mostrar no perfil o que estou ouvindo', '', toggle('spShow', c.show_activity !== false))}
        <div class="mut small">${a && a.type === 'spotify' ? `Tocando agora: <b>${esc(a.track)}</b> — ${esc(a.artist)}` : 'Nada tocando agora. Quando você der play no Spotify, aparece aqui em alguns segundos.'}</div>` : ''}
      ${!cid ? `<div class="mut small" style="margin-top:8px">${S.me.is_admin ? 'Configure o Client ID logo abaixo para liberar para todo mundo.' : 'O admin do Telão ainda precisa ativar o Spotify.'}</div>` : ''}
    </div>` : ''}
    <div class="conncard">
      <div class="ch2"><span class="clogo">${ic('gamepad', 24)}</span><div class="t"><b>Contas de jogo e redes</b><small>Steam, Xbox, PlayStation, Riot ID, Epic, Battle.net, Twitch, GitHub…</small></div><button class="btn sec sm" id="gLinks">Editar no perfil</button></div>
    </div>
    <div class="conncard">
      <div class="ch2"><span class="clogo">${ic('play', 22)}</span><div class="t"><b>Atividade</b><small>${S.manualAct ? `${ACT_TYPES[S.manualAct.type][0]} ${esc(S.manualAct.name)}` : 'Diga o que você está jogando, assistindo ou estudando.'}</small></div><button class="btn sec sm" id="acSet">${S.manualAct ? 'Mudar' : 'Definir'}</button></div>
    </div>
    ${S.me.is_admin ? `<hr class="sdiv"><h3>Ativar o Spotify pelo Last.fm (só o admin vê)</h3>
      <ol class="steps">
        <li>Entre em <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api/account/create</a> (com a sua conta do Last.fm).</li>
        <li>Em <b>Application name</b> coloque Telão e clique em <b>Submit</b>. Os outros campos podem ficar vazios.</li>
        <li>Copie a <b>API key</b> (o "Shared secret" não é usado) e cole aqui:</li>
      </ol>
      <div style="display:flex;gap:8px"><input class="inp" id="lfKey" placeholder="API key do Last.fm" value="${esc((S.cfg && S.cfg.lastfm_api_key) || '')}"><button class="btn" id="lfKeyOk">Salvar</button></div>` : ''}
    ${S.me.is_admin ? `<hr class="sdiv"><h3>Spotify direto (opcional, até 25 pessoas)</h3>
      <ol class="steps">
        <li>Entre em <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> e clique em <b>Create app</b>.</li>
        <li>Em <b>Redirect URIs</b> coloque exatamente: <code>${esc(spRedirect())}</code> e marque <b>Web API</b>.</li>
        <li>Copie o <b>Client ID</b> (o Client Secret não é usado) e cole aqui:</li>
      </ol>
      <div style="display:flex;gap:8px"><input class="inp" id="spCid" placeholder="Client ID" value="${esc(cid || '')}"><button class="btn" id="spCidOk">Salvar</button></div>
      <p class="mut small" style="margin-top:8px">No modo de desenvolvimento o Spotify libera até 25 pessoas: adicione o e-mail do Spotify de cada amigo em <b>User Management</b> no painel do app.</p>` : ''}`;
  const $b = q => box.querySelector(q);
  const on = $b('#spOn'); if(on) on.onclick = connectSpotify;
  const off = $b('#spOff'); if(off) off.onclick = disconnectSpotify;
  const sh = $b('#spShow'); if(sh) sh.onchange = async e => {
    S.conn.show_activity = e.target.checked;
    await App.sb.from('connections').update({ show_activity: e.target.checked }).eq('user_id', S.me.id).eq('provider', 'spotify');
    spPoll();
  };
  $b('#gLinks').onclick = () => setSec('profile');
  const lg = $b('#lfGo'); if(lg){ const go = async () => { lg.disabled = true; if(await connectLastfm($b('#lfName').value)) renderSettings(); else lg.disabled = false; }; lg.onclick = go; $b('#lfName').onkeydown = e => { if(e.key === 'Enter') go(); }; }
  const lo = $b('#lfOff'); if(lo) lo.onclick = disconnectLastfm;
  const lk = $b('#lfKeyOk'); if(lk) lk.onclick = async () => {
    const v = $b('#lfKey').value.trim();
    const { error } = await App.sb.from('app_config').upsert({ key: 'lastfm_api_key', value: v || null, updated_at: new Date().toISOString() });
    if(error){ App.toast(error.message, true); return; }
    S.cfg.lastfm_api_key = v; App.toast('Chave do Last.fm salva. Agora todo mundo pode ligar o Spotify.'); renderSettings();
  };
  $b('#acSet').onclick = activityModal;
  const ok = $b('#spCidOk'); if(ok) ok.onclick = async () => {
    const v = $b('#spCid').value.trim();
    const { error } = await App.sb.from('app_config').upsert({ key: 'spotify_client_id', value: v || null, updated_at: new Date().toISOString() });
    if(error){ App.toast(error.message, true); return; }
    S.cfg.spotify_client_id = v; App.toast('Client ID salvo.'); renderSettings();
  };
}
