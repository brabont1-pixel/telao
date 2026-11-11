/* =====================================================================
   TELÃO — app (contas, servidores, canais, chat, amigos, DMs, chamadas)
   ===================================================================== */
(function(){
const CFG = window.TELAO_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COLORS = ['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#f47b67','#1abc9c','#9b59b6','#e67e22','#607d8b'];
const ls = { get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} } };

const APP_VERSION = '4.1';
const S = {
  me: null, profiles: new Map(), servers: [], channels: new Map(), members: new Map(),
  friends: [], dms: [], dmActivity: ls.get('telao-dmact', {}), online: new Set(),
  route: { kind:'home', dm:null }, lastChannel: ls.get('telao-last', {}),
  unread: new Set(ls.get('telao-unread', [])), friendTab: 'online',
  vp: new Map(), vpCh: new Map(), focus: null, videoEls: new Map(),
  installEvt: null, started: false, ringing: null, pendingInvite: null,
  presence: new Map(), myStatus: 'online', autoIdle: false, showMembers: ls.get('telao-showmembers', true)
};
const App = window.App = { sb: null, get me(){ return S.me; }, S };

/* ---------------- utilidades ---------------- */
App.toast = (t, err, action) => {
  const el = $('#toast'); el.className = 'toast' + (err ? ' err' : '') + (action ? ' act' : '');
  el.innerHTML = `<span>${esc(t)}</span>` + (action ? `<button class="btn sm" id="toastAct">${esc(action.label)}</button>` : '');
  if(action) $('#toastAct').onclick = () => { el.classList.add('hidden'); action.fn(); };
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), action ? 9000 : err ? 6000 : 3200);
};
App.needAudioUnlock = () => $('#unlock').classList.remove('hidden');
$('#unlock').onclick = () => { Voice.unlockAudio(); $('#unlock').classList.add('hidden'); };

let sfxCtx = null;
App.sfx = (type) => {
  const PR = App.prefs || {};
  if(['join','leave','mute','unmute','selfjoin','screen','screenoff','cam'].includes(type) && PR.soundVoice === false) return;
  if(type === 'msg' && PR.soundMsg === false) return;
  try{
    if(!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    const seq = {
      selfjoin:[[523,.07],[659,.07],[784,.07],[1047,.16]], join:[[587,.08],[880,.16]], leave:[[880,.08],[523,.2]],
      mute:[[440,.07]], unmute:[[660,.07]], msg:[[880,.05],[1320,.09]], cam:[[700,.05],[1050,.1]],
      screen:[[784,.06],[988,.06],[1319,.16]], screenoff:[[1319,.06],[988,.06],[659,.16]],
      ring:[[660,.18],[0,.06],[880,.18],[0,.06],[660,.18]] }[type];
    if(!seq) return;
    let t = sfxCtx.currentTime;
    seq.forEach(([f,d]) => {
      if(f){ const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
        o.type = type === 'ring' ? 'sine' : 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t+.01); g.gain.exponentialRampToValueAtTime(.0001, t+d);
        o.connect(g).connect(sfxCtx.destination); o.start(t); o.stop(t+d+.02); }
      t += d;
    });
  }catch(e){}
};

const prof = id => S.profiles.get(id) || { id, display_name:'…', username:'…', avatar_color:'#4e5058' };
const initials = p => (p.display_name || p.username || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
function avatar(p, cls='', status=false){
  const img = p.avatar_url && (!/\.gif($|\?)/i.test(p.avatar_url) || hasPlus(p)) ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy" decoding="async">` : `<span class="ini">${esc(initials(p))}</span>`;
  const ring = p.avatar_ring && hasPlus(p) ? ` avring avring-${esc(p.avatar_ring)}` : '';
  return `<div class="av ${cls}${ring}" style="--avc:${esc(p.avatar_color||'#ff6b4a')}">${img}${status?`<span class="st s-${statusOf(p.id)}"></span>`:''}</div>`;
}
function serverInitials(n){ return n.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?'; }
function fmtTime(d){
  d = new Date(d); const now = new Date(); const y = new Date(now); y.setDate(now.getDate()-1);
  const hm = d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if(d.toDateString() === now.toDateString()) return 'Hoje às '+hm;
  if(d.toDateString() === y.toDateString()) return 'Ontem às '+hm;
  return d.toLocaleDateString('pt-BR')+' '+hm;
}
function fmtDay(d){ return new Date(d).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}); }
function saveUnread(){ ls.set('telao-unread', [...S.unread]); }
const isMobile = () => matchMedia('(max-width:760px)').matches;

/* ---------------- modais e menus ---------------- */
function modal(html, mount){
  const m = $('#modal'); m.innerHTML = `<div class="mbox">${html}</div>`; m.classList.remove('hidden');
  m.onclick = e => { if(e.target === m) closeModal(); };
  const first = m.querySelector('input:not([type=radio]),textarea'); if(first) setTimeout(()=>first.focus(), 30);
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  mount && mount(m);
}
function closeModal(){ $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }
function confirmBox(title, text, label='Confirmar', danger=true){
  return new Promise(res => {
    modal(`<div class="mh"><h2>${esc(title)}</h2><p>${text}</p></div>
      <div class="mf"><button class="btn sec" id="cNo">Cancelar</button><button class="btn ${danger?'red':''}" id="cYes">${esc(label)}</button></div>`, m => {
      m.querySelector('#cNo').onclick = () => { closeModal(); res(false); };
      m.querySelector('#cYes').onclick = () => { closeModal(); res(true); };
    });
  });
}
function menu(x, y, items, cls=''){
  const el = $('#menu'); el.className = 'menu ' + cls;
  el.innerHTML = items.map((it,i) => it === '-' ? '<hr>' : it.raw ? it.raw : it.html ? `<div style="padding:6px 10px">${it.html}</div>` : `<button data-i="${i}" class="${it.danger?'danger':''}">${esc(it.label)}<span>${it.icon||''}</span></button>`).join('');
  el.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  el.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { closeMenu(); items[+b.dataset.i].onClick(); });
  items.forEach(it => it.mount && it.mount(el));
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)){ closeMenu(); } }
  el._outside = outside;
}
function closeMenu(){ const el=$('#menu'); el.classList.add('hidden'); document.removeEventListener('mousedown', el._outside); }
async function copy(text){
  try{ await navigator.clipboard.writeText(text); App.toast('Copiado!'); }
  catch(e){ App.toast('Não deu para copiar automaticamente: '+text); }
}

/* ---------------- boot ---------------- */
function boot(){
  if(!CFG.SUPABASE_URL || /COLE_AQUI/.test(CFG.SUPABASE_URL) || !CFG.SUPABASE_ANON_KEY || /COLE_AQUI/.test(CFG.SUPABASE_ANON_KEY)){
    $('#setup').classList.remove('hidden'); return;
  }
  if(!window.supabase){ document.body.innerHTML = '<p style="padding:30px">Não foi possível carregar o Supabase. Verifique sua internet.</p>'; return; }
  // corrige erros comuns na URL (espaços, barra no final, /rest/v1, sem https)
  let url = CFG.SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/, '');
  if(!/^https?:\/\//.test(url)) url = 'https://' + url;
  const dash = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/);
  if(dash) url = 'https://' + dash[1] + '.supabase.co';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)){
    $('#setup').classList.remove('hidden');
    $('#setup .sub').innerHTML = 'A <b>Project URL</b> no <code>config.js</code> parece errada: <code>' + esc(CFG.SUPABASE_URL) + '</code><br>Ela deve ser assim: <code>https://abcdxyz.supabase.co</code>';
    return;
  }
  if(/^sb_secret_|service_role/.test(CFG.SUPABASE_ANON_KEY) || /"role":"service_role"/.test((()=>{ try{ return atob(CFG.SUPABASE_ANON_KEY.split('.')[1]); }catch(e){ return ''; } })())){
    $('#setup').classList.remove('hidden');
    $('#setup h2').textContent = '⚠️ Chave secreta no site!';
    $('#setup .sub').innerHTML = 'O <code>config.js</code> está com a chave <b>secreta</b>. Ela dá acesso total ao banco e não pode ficar no site.<br><br>1) No Supabase, apague/troque essa chave secreta.<br>2) Use a chave <b>publishable</b> (<code>sb_publishable_…</code>) ou <b>anon public</b>.';
    return;
  }
  App.sb = supabase.createClient(url, CFG.SUPABASE_ANON_KEY.trim(), { auth:{ persistSession:true, autoRefreshToken:true } });
  App.sbUrl = url;
  const hp = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const linkErr = hp.get('error_description');
  if(linkErr){
    history.replaceState(null, '', location.pathname);
    setTimeout(() => authError(/expired|invalid/i.test(linkErr) ? 'Esse link de confirmação expirou ou já foi usado. Entre com e-mail e senha ou peça um novo link.' : linkErr.replace(/\+/g,' ')), 300);
  }
  const pr = location.hash.match(/^#plus-(ok|pendente|erro)/);
  if(pr){ S.plusReturn = pr[1] === 'ok' ? 'ok' : pr[1]; history.replaceState(null, '', location.pathname); }
  const m = location.hash.match(/convite=([a-z0-9]+)/i);
  if(m){ S.pendingInvite = m[1].toLowerCase(); history.replaceState(null, '', location.pathname); }
  App.sb.auth.onAuthStateChange((ev, session) => {
    if(ev === 'SIGNED_OUT'){ location.reload(); return; }
    if(session && !S.started){ S.started = true; setTimeout(() => start(session), 0); }
    else if(!session && ev === 'INITIAL_SESSION') showAuth();
  });
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

/* ---------------- autenticação ---------------- */
let authMode = 'login';
function showAuth(){
  $('#auth').classList.remove('hidden');
  if(S.pendingInvite){ $('#authSub').textContent = 'Entre ou crie uma conta para aceitar o convite.'; }
}
function setAuthMode(mode){
  authMode = mode; $('#authErr').textContent = ''; $('#authErr').classList.remove('ok-msg');
  const reg = mode === 'register';
  $('#regFields').classList.toggle('hidden', !reg);
  $('#authTitle').textContent = reg ? 'Criar uma conta' : 'Boas-vindas de volta!';
  $('#authSub').textContent = reg ? 'Leva 10 segundos.' : 'Que bom te ver de novo.';
  $('#authBtn').textContent = reg ? 'Continuar' : 'Entrar';
  $('#aPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authSwitch').innerHTML = reg ? 'Já tem uma conta? <a id="toLogin">Entrar</a>' : 'Precisa de uma conta? <a id="toReg">Cadastre-se</a>';
  const a = $('#toLogin') || $('#toReg'); a.onclick = () => setAuthMode(reg ? 'login' : 'register');
}
$('#toReg').onclick = () => setAuthMode('register');
$('#googleBtn').onclick = async () => {
  const { error } = await App.sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + '/', queryParams:{ prompt:'select_account' } } });
  if(error) authError(/provider is not enabled|unsupported provider/i.test(error.message) ? 'O login com Google ainda não foi ativado no Supabase (veja o LEIA-ME).' : error.message);
};
$('#resendLink').onclick = async () => {
  const email = $('#aEmail').value.trim();
  if(!email){ authError('Digite seu e-mail no campo acima.'); return; }
  const { error } = await App.sb.auth.resend({ type:'signup', email, options:{ emailRedirectTo: location.origin + '/' } });
  if(error) authError(error.message); else authOk('📧 Enviamos de novo para <b>'+esc(email)+'</b>. Pode levar 1–2 minutos; veja também o spam.');
};
function authOk(html){ const e = $('#authErr'); e.classList.add('ok-msg'); e.innerHTML = html; }
function authError(msg){
  $('#authErr').classList.remove('ok-msg');
  if(/email not confirmed/i.test(msg)) $('#resendBox').classList.remove('hidden');
  if(/rate limit|too many/i.test(msg)){ $('#authErr').textContent = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'; return; }
  if(/error sending|smtp/i.test(msg)){ $('#authErr').textContent = 'O servidor não conseguiu enviar o e-mail de confirmação. (Dono do site: configure o SMTP no Supabase — veja o LEIA-ME.)'; return; }
  const map = { 'Invalid login credentials':'E-mail ou senha incorretos.', 'Email not confirmed':'Confirme seu e-mail antes de entrar (veja sua caixa de entrada e o spam).',
    'User already registered':'Esse e-mail já tem uma conta.', 'Password should be at least 6 characters.':'A senha precisa de pelo menos 6 caracteres.' };
  if(/failed to fetch|networkerror|load failed/i.test(msg)){
    $('#authErr').innerHTML = 'Não consegui falar com o servidor (' + esc(App.sbUrl) + ').<br>Confira: a <b>Project URL</b> no config.js está certa? O projeto no Supabase está ativo (não pausado)? Algum bloqueador de anúncios (Brave, uBlock, AdGuard) está bloqueando o site?';
    return;
  }
  if(/invalid api key|no api key/i.test(msg)){ $('#authErr').innerHTML = 'A chave do <code>config.js</code> está errada. Use a chave <b>anon public</b> (Project Settings → API).'; return; }
  $('#authErr').textContent = map[msg] || msg;
}
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('#aEmail').value.trim(), password = $('#aPass').value;
  const btn = $('#authBtn'); btn.disabled = true; $('#authErr').textContent = '';
  try{
    if(authMode === 'register'){
      const username = $('#aUser').value.trim().toLowerCase();
      const display_name = $('#aDisplay').value.trim() || username;
      if(!/^[a-z0-9_]{3,20}$/.test(username)){ authError('Nome de usuário: 3 a 20 caracteres, só letras minúsculas, números e _'); return; }
      const { data: taken } = await App.sb.from('profiles').select('id').eq('username', username).maybeSingle();
      if(taken){ authError('Esse nome de usuário já está em uso.'); return; }
      const { data, error } = await App.sb.auth.signUp({ email, password, options:{ data:{ username, display_name }, emailRedirectTo: location.origin + '/' } });
      if(error){ authError(error.message); return; }
      if(!data.session){
        setAuthMode('login'); $('#aEmail').value = email;
        authOk('📧 Conta criada! Enviamos um link de confirmação para <b>'+esc(email)+'</b>. Abra o e-mail (veja também o spam), clique no link e você já entra.');
        $('#resendBox').classList.remove('hidden');
      }
    } else {
      const { error } = await App.sb.auth.signInWithPassword({ email, password });
      if(error){ authError(error.message); return; }
    }
  } catch(err){ authError(String(err && err.message || err)); }
  finally { btn.disabled = false; }
};

/* ---------------- início ---------------- */
async function start(session){
  const uid = session.user.id;
  const { data: me, error } = await App.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if(error || !me){
    $('#auth').classList.remove('hidden'); $('#authErr').textContent = 'Seu perfil não foi encontrado. Você rodou o supabase.sql no banco? ' + (error ? error.message : '');
    S.started = false; return;
  }
  S.me = me; S.profiles.set(me.id, me); S.myStatus = me.status || 'online';
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  Voice.onChange = onVoiceChange; Voice.onSpeaking = onSpeaking;
  Object.assign(Voice.screenSettings, clampScreen({ ...Voice.screenSettings, ...ls.get('telao-screen', {}) }));
  App.sb.auth.getUser().then(({ data }) => { S.authUser = data && data.user; });
  Voice.muted = ls.get('telao-muted', false);

  await Promise.all([loadServers(), loadFriends(), loadDms()]);
  subscribeRealtime();

  const saved = ls.get('telao-route', null);
  if(saved && saved.kind === 'server' && S.servers.find(s => s.id === saved.sid)) S.route = saved;
  else if(saved && saved.kind === 'home' && (!saved.dm || S.dms.find(d => d.id === saved.dm))) S.route = saved;
  await go(S.route, true);
  if(S.pendingInvite) inviteJoinPrompt(S.pendingInvite);
  if(S.plusReturn) handlePlusReturn(S.plusReturn);
  checkVersion();
}
async function handlePlusReturn(kind){
  if(kind === 'erro'){ App.toast('O pagamento não foi concluído. Pode tentar de novo quando quiser.', true); return; }
  if(kind === 'pendente'){ App.toast('⏳ Pagamento em processamento. Quando o Pix cair, seu Telão+ ativa sozinho.'); return; }
  App.toast('✅ Pagamento aprovado! Ativando seu Telão+…');
  const before = S.me.plan_until;
  for(let i = 0; i < 12; i++){
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
    if(data && data.plan_until !== before){ S.me = data; S.profiles.set(data.id, data); renderAll(); App.toast('🎉 Telão+ ativado! Aproveite.'); openSettings('user','plus'); return; }
  }
  App.toast('Seu pagamento está sendo confirmado. Em alguns minutos o Telão+ aparece.');
}

/* ---------------- dados ---------------- */
async function ensureProfiles(ids){
  const miss = [...new Set(ids)].filter(id => id && !S.profiles.has(id));
  if(!miss.length) return;
  const { data } = await App.sb.from('profiles').select('*').in('id', miss);
  (data || []).forEach(p => S.profiles.set(p.id, p));
}
async function loadServers(){
  const { data, error } = await App.sb.from('servers').select('*').order('created_at');
  if(error){ App.toast('Erro ao carregar servidores: '+error.message, true); return; }
  S.servers = data || [];
  S.servers.forEach(s => vpChannel('vp:'+s.id));
  await Promise.all(S.servers.map(s => loadChannels(s.id)).concat(S.servers.map(s => loadRoles(s.id))));
}
async function loadChannels(sid){
  const { data } = await App.sb.from('channels').select('*').eq('server_id', sid).order('position').order('created_at');
  S.channels.set(sid, data || []);
}
async function loadMembers(sid){
  const [{ data }] = await Promise.all([App.sb.from('server_members').select('user_id, role').eq('server_id', sid), loadRoles(sid)]);
  S.members.set(sid, data || []);
  await ensureProfiles((data || []).map(m => m.user_id));
}
async function loadFriends(){
  const { data } = await App.sb.from('friendships').select('*');
  const me = S.me.id;
  S.friends = (data || []).map(f => ({ uid: f.requester === me ? f.addressee : f.requester, status: f.status, incoming: f.addressee === me }));
  await ensureProfiles(S.friends.map(f => f.uid));
}
async function loadDms(){
  const { data } = await App.sb.from('channels').select('*').eq('kind', 'dm');
  S.dms = data || [];
  await ensureProfiles(S.dms.map(dmOther));
  S.dms.forEach(d => vpChannel(topicFor(d)));
}
const dmOther = d => d.dm_a === S.me.id ? d.dm_b : d.dm_a;
function findChannel(cid){
  for(const [, list] of S.channels){ const c = list.find(x => x.id === cid); if(c) return c; }
  return S.dms.find(d => d.id === cid) || null;
}
const topicFor = ch => ch.kind === 'dm' ? 'vp:dm:' + ch.id : 'vp:' + ch.server_id;
const curServer = () => S.route.kind === 'server' ? S.servers.find(s => s.id === S.route.sid) : null;

/* ---------------- tempo real ---------------- */
function subscribeRealtime(){
  const sb = App.sb;
  sb.channel('db-'+S.me.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'messages' }, onMsgEvent)
    .on('postgres_changes', { event:'*', schema:'public', table:'message_reactions' }, p => App.onReaction(p))
    .on('postgres_changes', { event:'*', schema:'public', table:'server_roles' }, p => App.onRolesChange && App.onRolesChange(p))
    .on('postgres_changes', { event:'*', schema:'public', table:'member_roles' }, p => App.onRolesChange && App.onRolesChange(p))
    .on('postgres_changes', { event:'*', schema:'public', table:'channels' }, onChannelEvent)
    .on('postgres_changes', { event:'*', schema:'public', table:'friendships' }, async () => { await loadFriends(); renderRail(); if(S.route.kind==='home'){ renderSidebar(); refreshFriends(); } })
    .on('postgres_changes', { event:'*', schema:'public', table:'server_members' }, onMemberEvent)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles' }, p => { S.profiles.set(p.new.id, p.new); if(p.new.id===S.me.id) S.me=p.new; renderLight(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'servers' }, async () => { await loadServers(); renderRail(); renderSidebar(); })
    .subscribe();

  const on = sb.channel('online', { config:{ presence:{ key: S.me.id } } });
  S.onlineCh = on;
  on.on('presence', { event:'sync' }, () => {
    const st = on.presenceState(); S.presence = new Map(); S.online = new Set();
    Object.entries(st).forEach(([uid, metas]) => {
      const sts = metas.map(m => m.status || 'online');
      const best = ['online','dnd','idle'].find(x => sts.includes(x)) || 'invisible';
      if(best !== 'invisible'){ S.presence.set(uid, best); S.online.add(uid); }
    });
    renderLight();
  }).subscribe(stt => { if(stt === 'SUBSCRIBED') trackOnline(); });
  // ausente automático depois de 10 minutos sem mexer
  let lastAct = Date.now();
  ['mousemove','keydown','touchstart','focus'].forEach(ev => window.addEventListener(ev, () => {
    lastAct = Date.now();
    if(S.autoIdle){ S.autoIdle = false; S.myStatus = S.me.status || 'online'; trackOnline(); renderUserPanel(); }
  }, { passive:true }));
  setInterval(() => { if(!S.autoIdle && (S.me.status || 'online') === 'online' && Date.now() - lastAct > 10*60*1000 && !Voice.channel){ S.autoIdle = true; S.myStatus = 'idle'; trackOnline(); renderUserPanel(); } }, 30000);

  // avisos globais do admin
  S.avisoCh = sb.channel('telao-avisos', { config:{ broadcast:{ self:true } } })
    .on('broadcast', { event:'aviso' }, ({ payload }) => showAviso(payload))
    .subscribe();

  sb.channel('user:'+S.me.id)
    .on('broadcast', { event:'ring' }, ({payload}) => onRing(payload))
    .on('broadcast', { event:'ring-cancel' }, ({payload}) => { if(S.ringing && S.ringing.channel_id === payload.channel_id) stopRing(); })
    .on('broadcast', { event:'ring-decline' }, ({payload}) => { App.toast(prof(payload.from).display_name + ' recusou a chamada.'); })
    .subscribe();
}

S.liveSeen = new Set();
function liveWatch(topic, prev, metas){
  const others = l => new Map(l.filter(m => m.voice && m.session !== Voice.SESSION).map(m => [m.session, m]));
  const a = others(prev), b = others(metas);
  const mine = Voice.channel && Voice.topic === topic ? Voice.channel.id : null;
  b.forEach((m, sess) => {
    const was = a.get(sess);
    if(mine && m.voice === mine){
      if(!was || was.voice !== mine) App.sfx('join');
      else if(m.sharing && !was.sharing) App.sfx('screen');
      else if(!m.sharing && was.sharing) App.sfx('screenoff');
    }
    const key = m.voice + ':' + sess + ':' + (m.screen || '');
    if(m.sharing && (!was || !was.sharing) && !S.liveSeen.has(key) && m.user_id !== S.me.id){
      S.liveSeen.add(key);
      if(mine === m.voice || isDnd()) return;
      const ch = findChannel(m.voice); if(!ch) return;
      const where = ch.kind === 'dm' ? 'numa chamada com você' : 'em ' + ch.name;
      App.toast(`🔴 ${prof(m.user_id).display_name} está transmitindo ${where}`, false, { label: 'Assistir', fn: () => watchLive(m.voice, sess) });
    }
  });
  if(mine) a.forEach((m, sess) => { if(m.voice === mine && (!b.has(sess) || b.get(sess).voice !== mine)) App.sfx('leave'); });
}
async function watchLive(cid, sess){
  const ch = findChannel(cid); if(!ch) return;
  if(typeof SET !== 'undefined' && SET) closeSettings();
  openChannel(ch);
  if(!(Voice.channel && Voice.channel.id === cid)) await joinVoice(ch);
  S.focus = 's:' + sess; renderStage();
}
function vpChannel(topic){
  if(S.vpCh.has(topic)) return S.vpCh.get(topic);
  const ch = App.sb.channel(topic, { config:{ presence:{ key: Voice.SESSION } } });
  ch._ready = new Promise(res => {
    ch.on('presence', { event:'sync' }, () => {
      const st = ch.presenceState();
      const metas = Object.values(st).map(a => a[a.length-1]).filter(Boolean);
      const prev = S.vp.get(topic) || [];
      S.vp.set(topic, metas);
      // sons de entrar/sair/transmitir no meu canal + aviso de transmissão em outros canais
      ensureProfiles(metas.map(m => m.user_id)).then(() => liveWatch(topic, prev, metas));
      ensureProfiles(metas.map(m => m.user_id)).then(() => {
        Voice.onPresence(topic, metas);
        renderSidebar(); renderStage();
        if(topic.startsWith('vp:dm:') && S.route.kind === 'home' && S.route.dm && topicFor({kind:'dm', id:S.route.dm}) === topic) renderMain(true);
      });
    });
    ch.subscribe(stt => { if(stt === 'SUBSCRIBED') res(); });
  });
  S.vpCh.set(topic, ch);
  return ch;
}
const voiceUsers = ch => (S.vp.get(topicFor(ch)) || []).filter(m => m.voice === ch.id);

async function onMsgEvent(p){
  if(p.eventType === 'INSERT'){
    const m = p.new;
    await ensureProfiles([m.author_id]);
    const ch = findChannel(m.channel_id);
    if(ch && ch.kind === 'dm'){ S.dmActivity[ch.id] = m.created_at; ls.set('telao-dmact', S.dmActivity); }
    const viewing = M.cid === m.channel_id && !document.hidden;
    if(M.cid === m.channel_id) addMessage(m);
    if(m.author_id !== S.me.id && !viewing){
      S.unread.add(m.channel_id); saveUnread();
      const mention = S.me && (m.content.includes('@'+S.me.username) || /@(todos|everyone)\b/.test(m.content));
      if((ch && ch.kind === 'dm' && P.notifDM) || (mention && P.notifMention)){
        if(!isDnd()) App.sfx('msg');
        notify(prof(m.author_id).display_name + (ch && ch.kind!=='dm' ? ' em #'+ch.name : ''), m.content || '📎 Enviou um anexo', m.channel_id);
      }
      renderRail(); renderSidebar();
    }
    if(ch && ch.kind === 'dm' && S.route.kind === 'home') renderSidebar();
  } else if(p.eventType === 'UPDATE'){
    App.onMsgUpdate(p.new);
  } else if(p.eventType === 'DELETE'){
    App.onMsgDelete(p.old.id);
  }
}
async function onChannelEvent(p){
  const row = p.new && p.new.id ? p.new : p.old;
  if(row.kind === 'dm' || (!row.server_id && S.dms.find(d => d.id === row.id))){ await loadDms(); renderSidebar(); return; }
  let sid = row.server_id;
  if(!sid) for(const [k, list] of S.channels) if(list.find(c => c.id === row.id)) sid = k;
  if(!sid) return;
  await loadChannels(sid);
  if(S.route.kind === 'server' && S.route.sid === sid){
    const list = S.channels.get(sid) || [];
    if(!list.find(c => c.id === S.route.cid)){ go({ kind:'server', sid, cid: (list.find(c=>c.kind==='text')||list[0]||{}).id || null }); }
    else renderSidebar();
  }
}
async function onMemberEvent(p){
  const row = p.new && p.new.server_id ? p.new : p.old;
  if(!row) return;
  if(row.user_id === S.me.id){
    await loadServers(); renderRail();
    if(p.eventType === 'DELETE' && S.route.kind === 'server' && S.route.sid === row.server_id){
      if(Voice.channel && Voice.channel.server_id === row.server_id) Voice.leave();
      App.toast('Você não está mais nesse servidor.'); go({ kind:'home', dm:null });
    } else renderSidebar();
    return;
  }
  if(S.members.has(row.server_id)){ await loadMembers(row.server_id); renderMembers(); }
}

/* ---------------- atualizações e avisos globais ---------------- */
function updateBar(text, reload){
  let bar = $('#updbar');
  if(!bar){ bar = document.createElement('div'); bar.id = 'updbar'; bar.className = 'updbar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span>${ic('sparkles',18)} ${esc(text)}</span>${reload ? `<button class="btn sm" id="updGo">${ic('refresh',15)} Atualizar agora</button>` : ''}<button class="ibtn" id="updX" title="Fechar">${ic('x',16)}</button>`;
  bar.classList.remove('hidden');
  const go = $('#updGo'); if(go) go.onclick = hardReload;
  $('#updX').onclick = () => bar.classList.add('hidden');
}
async function hardReload(){
  try{ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update().catch(()=>{}))); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }catch(e){}
  if(Voice.channel) try{ await Voice.leave(); }catch(e){}
  location.reload();
}
let updShown = false;
async function checkVersion(){
  try{
    const r = await fetch('/version.json?t=' + Date.now(), { cache:'no-store' }); if(!r.ok) return;
    const { v } = await r.json();
    if(v && v !== APP_VERSION && !updShown){ updShown = true; updateBar('Nova atualização do Telão disponível!', true); App.sfx('screen'); }
  }catch(e){}
}
setInterval(checkVersion, 60 * 1000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) checkVersion(); });
function showAviso(pl){
  if(!pl || !pl.text) return;
  const from = pl.from ? prof(pl.from).display_name : 'Telão';
  updateBar(`📢 ${from}: ${pl.text}`, !!pl.reload);
  App.sfx('ring');
  if(pl.from !== S.me?.id) notify('📢 Aviso do Telão', pl.text, null);
}
App.sendAviso = (text, reload) => S.avisoCh && S.avisoCh.send({ type:'broadcast', event:'aviso', payload:{ text, reload, from: S.me.id } });

function trackOnline(){ if(S.onlineCh) S.onlineCh.track({ status: S.myStatus, at: Date.now() }).catch(()=>{}); }
const isDnd = () => S.myStatus === 'dnd';

/* ---------------- notificações ---------------- */
function notify(title, body, cid){
  if(isDnd()) return;
  if(!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try{
    const n = new Notification(title, { body: body.slice(0,140), icon:'/icons/icon-192.png', tag: cid });
    n.onclick = () => { window.focus(); const ch = findChannel(cid); if(ch) openChannel(ch); n.close(); };
  }catch(e){}
}
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && M.cid && S.unread.delete(M.cid)){ saveUnread(); renderRail(); renderSidebar(); }
});

/* ---------------- navegação ---------------- */
async function go(route, first){
  S.route = route; ls.set('telao-route', route);
  if(route.kind === 'server'){
    const list = S.channels.get(route.sid) || [];
    if(!route.cid || !list.find(c => c.id === route.cid)){
      const last = S.lastChannel[route.sid];
      route.cid = (list.find(c => c.id === last) || list.find(c => c.kind === 'text') || list[0] || {}).id || null;
    }
    if(route.cid){ S.lastChannel[route.sid] = route.cid; ls.set('telao-last', S.lastChannel); }
    if(!S.members.has(route.sid)) loadMembers(route.sid).then(() => { renderMembers(); renderSidebar(); });
  }
  const cid = route.kind === 'server' ? route.cid : route.dm;
  if(cid && S.unread.delete(cid)) saveUnread();
  if(!first) document.body.classList.add('m-main');
  closeMenu();
  renderAll();
}
function openChannel(ch){
  if(ch.kind === 'dm') go({ kind:'home', dm: ch.id });
  else go({ kind:'server', sid: ch.server_id, cid: ch.id });
}
function renderAll(){ renderRail(); renderSidebar(); renderUserPanel(); renderVoicePanel(); renderMain(); renderMembers(); }
function renderLight(){ renderRail(); renderSidebar(); renderUserPanel(); renderMembers(); refreshFriends(); }
function refreshFriends(){ if(S.route.kind==='home' && !S.route.dm && S.friendTab !== 'add') renderMain(); }

const LOGO = `<svg viewBox="0 0 32 32" width="26" height="26"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a4c"/><stop offset="1" stop-color="#ff3d7f"/></linearGradient></defs><rect x="2" y="5" width="28" height="19" rx="6" fill="url(#lg1)"/><path d="M13 10.5v8l7-4z" fill="#fff"/><rect x="10" y="26" width="12" height="2.6" rx="1.3" fill="url(#lg1)"/></svg>`;
/* ---------------- barra de servidores ---------------- */
function serverIcon(s, size){
  return s.icon_url ? `<img src="${esc(s.icon_url)}" alt="" loading="lazy" decoding="async">` : esc(serverInitials(s.name));
}
function renderRail(){
  const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
  const dmUnread = S.dms.filter(d => S.unread.has(d.id)).length;
  const homeBadge = pend + dmUnread;
  let h = `<button class="ricon home ${S.route.kind==='home'?'on':''}" id="rHome" data-tip="Início · amigos e conversas" data-tipside="r">${ic('chat',22)}
      ${homeBadge ? `<span class="badge">${homeBadge > 99 ? '99+' : homeBadge}</span>` : ''}</button>`;
  // DMs com mensagem nova aparecem na barra, como no Discord
  S.dms.filter(d => S.unread.has(d.id)).slice(0, 4).forEach(d => {
    const p = prof(dmOther(d));
    h += `<button class="ricon dmr" data-dmr="${d.id}" data-tip="${esc(p.display_name)}" data-tipside="r">${avatar(p)}<span class="badge">●</span></button>`;
  });
  h += `<div class="rsep"></div>`;
  S.servers.forEach(s => {
    const on = S.route.kind === 'server' && S.route.sid === s.id;
    const unread = (S.channels.get(s.id) || []).some(c => S.unread.has(c.id));
    const inVoice = Voice.channel && Voice.channel.server_id === s.id;
    h += `<button class="ricon srv ${on?'on':''} ${unread?'unread':''} ${s.icon_url?'img':''}" data-sid="${s.id}" data-tip="${esc(s.name)}" data-tipside="r" style="--sc:${esc(s.icon_color)}">${serverIcon(s)}${inVoice ? `<span class="rvoice">${ic('volume',12)}</span>` : ''}</button>`;
  });
  h += `<button class="ricon add" id="rAdd" data-tip="Adicionar um servidor" data-tipside="r">${ic('plus',24)}</button>`;
  $('#rail').innerHTML = h;
  $('#rHome').onclick = () => go({ kind:'home', dm: S.route.kind==='home' ? S.route.dm : null }, true);
  $('#rAdd').onclick = addServerModal;
  $$('#rail [data-sid]').forEach(b => b.onclick = () => go({ kind:'server', sid: b.dataset.sid }, true));
  $$('#rail [data-dmr]').forEach(b => b.onclick = () => go({ kind:'home', dm: b.dataset.dmr }));
}

/* ---------------- status (online, ausente, não perturbe, invisível) ---------------- */
const STATUS = { online:['Online','#23a55a'], idle:['Ausente','#f0b232'], dnd:['Não perturbe','#f23f43'], invisible:['Invisível','#80848e'], offline:['Offline','#80848e'] };
function statusOf(uid){
  if(uid === S.me?.id) return S.myStatus || 'online';
  return S.presence.get(uid) || 'offline';
}
function statusText(p){
  if(p.custom_status) return `${p.custom_emoji ? esc(p.custom_emoji) + ' ' : ''}${esc(p.custom_status)}`;
  return STATUS[statusOf(p.id)][0];
}

/* ---------------- barra lateral ---------------- */
const COLLAPSED = new Set(ls.get('telao-collapsed', []));
function renderSidebar(){
  if(!S.me) return;
  const head = $('#sbHead'), body = $('#sbBody');
  if(S.route.kind === 'home'){
    head.className = 'sbhead home'; head.style.removeProperty('--sc');
    head.innerHTML = `<div class="brandrow"><span class="logo">${LOGO}</span><b>telão</b></div><button class="findbtn" id="sbFind">${ic('search',15)}<span>Buscar ou ir para…</span><kbd>Ctrl K</kbd></button>`; head.onclick = null;
    $('#sbFind').onclick = quickSwitcher;
    const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
    const dms = [...S.dms].sort((a,b) => (S.dmActivity[b.id] || b.created_at).localeCompare(S.dmActivity[a.id] || a.created_at));
    body.innerHTML = `
      <div class="ch big ${!S.route.dm?'on':''}" id="sbFriends"><span class="ic">${ic('users',20)}</span><span class="nm">Amigos</span>${pend?`<span class="pill">${pend}</span>`:''}</div>
      <div class="ch big" id="sbPlus"><span class="ic plusic">${ic('sparkles',20)}</span><span class="nm">Telão+</span></div>
      <div class="cat"><span>Mensagens diretas</span><button id="sbNewDm" data-tip="Nova conversa">${ic('plus',16)}</button></div>
      ${dms.length ? dms.map(d => { const p = prof(dmOther(d)); const call = voiceUsers(d).length;
        return `<div class="dmitem ${S.route.dm===d.id?'on':''} ${S.unread.has(d.id)?'unread':''}" data-dm="${d.id}">${avatar(p,'',true)}<div class="dmt"><span class="nm">${esc(p.display_name)}</span>${p.custom_status ? `<small>${statusText(p)}</small>` : ''}</div>${call?`<span class="incall" data-tip="Em chamada">${ic('volume',16)}</span>`:''}</div>`; }).join('')
        : `<div class="sbempty">${ic('users',32)}<span>Adicione amigos para conversar</span></div>`}`;
    $('#sbFriends').onclick = () => go({ kind:'home', dm:null });
    $('#sbPlus').onclick = () => openSettings('user','plus');
    $('#sbNewDm').onclick = () => { S.friendTab = 'all'; go({ kind:'home', dm:null }); };
    body.querySelectorAll('[data-dm]').forEach(el => {
      el.onclick = () => go({ kind:'home', dm: el.dataset.dm });
      el.oncontextmenu = e => { e.preventDefault(); const d = S.dms.find(x => x.id === el.dataset.dm); userMenu(dmOther(d), e.clientX, e.clientY); };
    });
    return;
  }
  const s = curServer(); if(!s){ go({kind:'home', dm:null}); return; }
  const canCh = App.hasPerm(s.id, 1);
  head.className = 'sbhead hero';
  head.style.setProperty('--sc', s.icon_color);
  const memList = S.members.get(s.id) || [];
  const onl = memList.filter(m => S.online.has(m.user_id) || m.user_id === S.me.id).length;
  head.innerHTML = `<div class="hero-in"><span class="hero-ic">${serverIcon(s)}</span><div class="hero-t"><b>${esc(s.name)}</b><small>${memList.length ? `<i class="odot"></i>${onl} online · ${memList.length} membro${memList.length>1?'s':''}` : '&nbsp;'}</small></div><span class="hero-ch">${ic('chevDown',18)}</span></div>`;
  head.onclick = e => serverMenu(s, e);
  const list = (S.channels.get(s.id) || []).slice().sort((a,b) => a.position - b.position);
  // agrupa por categoria (ou Texto/Voz)
  const groups = new Map();
  list.forEach(c => { const g = c.category || (c.kind === 'text' ? 'Canais de texto' : 'Canais de voz'); if(!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
  let h = s.description ? `<div class="srvdesc">${esc(s.description)}</div>` : '';
  groups.forEach((chs, g) => {
    const key = s.id + ':' + g, col = COLLAPSED.has(key);
    h += `<div class="cat ${col?'col':''}" data-cat="${esc(key)}"><span>${ic('chevDown',12)} ${esc(g)}</span>${canCh?`<button data-new="${chs[0].kind}" data-newcat="${esc(chs[0].category||'')}" data-tip="Criar canal">${ic('plus',16)}</button>`:''}</div>`;
    chs.forEach(c => {
      const on = S.route.cid === c.id, un = S.unread.has(c.id);
      if(col && !on && !un && !(c.kind === 'voice' && voiceUsers(c).length)) return;
      if(c.kind === 'text'){
        h += `<div class="ch ${on?'on':''} ${un?'unread':''}" data-cid="${c.id}"><span class="ic">${ic('hash',20)}</span><span class="nm">${esc(c.name)}</span>${canCh?`<button class="x" data-edch="${c.id}" data-tip="Editar canal">${ic('gear',15)}</button>`:''}</div>`;
      } else {
        const users = voiceUsers(c);
        const live = users.some(u => u.sharing);
        h += `<div class="ch ${on?'on':''} ${Voice.channel && Voice.channel.id === c.id ? 'connected' : ''}" data-cid="${c.id}"><span class="ic">${ic('volume',20)}</span><span class="nm">${esc(c.name)}</span>${live?'<span class="live">AO VIVO</span>':''}${canCh?`<button class="x" data-edch="${c.id}" data-tip="Editar canal">${ic('gear',15)}</button>`:''}</div>
          ${users.length ? `<div class="vusers">${users.map(u => vuRow(u)).join('')}</div>` : ''}`;
      }
    });
  });
  if(!list.length) h += `<div class="sbempty">${ic('hash',32)}<span>Nenhum canal ainda</span></div>`;
  body.innerHTML = h;
  body.querySelectorAll('[data-cid]').forEach(el => el.onclick = e => {
    if(e.target.closest('[data-edch]')) return;
    const c = list.find(x => x.id === el.dataset.cid);
    go({ kind:'server', sid: s.id, cid: c.id });
    if(c.kind === 'voice' && !(Voice.channel && Voice.channel.id === c.id)) joinVoice(c);
  });
  body.querySelectorAll('[data-cat]').forEach(el => el.onclick = e => {
    if(e.target.closest('[data-new]')) return;
    const k = el.dataset.cat; COLLAPSED.has(k) ? COLLAPSED.delete(k) : COLLAPSED.add(k); ls.set('telao-collapsed', [...COLLAPSED]); renderSidebar();
  });
  body.querySelectorAll('[data-new]').forEach(b => b.onclick = () => createChannelModal(s, b.dataset.new, b.dataset.newcat));
  body.querySelectorAll('[data-edch]').forEach(b => b.onclick = e => { e.stopPropagation(); editChannelModal(list.find(c => c.id === b.dataset.edch)); });
  body.querySelectorAll('[data-watch]').forEach(b => b.onclick = e => { e.stopPropagation(); watchLive(b.dataset.watch, b.dataset.wsess); });
  body.querySelectorAll('[data-vuser]').forEach(el => {
    el.onclick = e => { if(e.target.closest('[data-watch]')) return; userMenu(el.dataset.vuser, e.clientX, e.clientY); };
    el.oncontextmenu = e => { e.preventDefault(); userMenu(el.dataset.vuser, e.clientX, e.clientY); };
  });
  onSpeaking();
}
function vuRow(u){
  const p = prof(u.user_id);
  return `<div class="vu" data-vuser="${u.user_id}">${avatar(p,'sm').replace('class="av ', `data-sess="${u.session}" class="av `)}<span class="nm" style="${App.roleColorOf(u.user_id) ? 'color:' + App.roleColorOf(u.user_id) : ''}">${esc(p.display_name)}</span>
    <span class="icons">${u.camera ? `<span class="vi">${ic('video',14)}</span>` : ''}${u.sharing ? `<button class="live" data-watch="${u.voice}" data-wsess="${u.session}" data-tip="Clique para assistir">AO VIVO</button>` : ''}${u.deafened ? `<span class="vi off">${ic('headphonesOff',14)}</span>` : u.muted ? `<span class="vi off">${ic('micOff',14)}</span>` : ''}</span></div>`;
}

/* ---------------- painel do usuário e de voz ---------------- */
function renderUserPanel(){
  const p = S.me; if(!p) return;
  const muted = Voice.muted || Voice.deafened;
  $('#userPanel').innerHTML = `
    <div class="who" id="upWho">${avatar(p,'',true)}<div class="t"><b>${esc(p.display_name)}</b><small>${statusText(p)}</small></div></div>
    <button class="ibtn ${muted?'off':''}" id="upMic" data-tip="${muted?'Ativar microfone':'Silenciar'}">${ic(muted?'micOff':'mic',20)}</button>
    <button class="ibtn ${Voice.deafened?'off':''}" id="upDeaf" data-tip="${Voice.deafened?'Ativar áudio':'Ensurdecer'}">${ic(Voice.deafened?'headphonesOff':'headphones',20)}</button>
    <button class="ibtn" id="upSet" data-tip="Configurações">${ic('gear',20)}</button>`;
  $('#upWho').onclick = e => statusMenu(e);
  $('#upMic').onclick = () => { Voice.toggleMute(); ls.set('telao-muted', Voice.muted); renderUserPanel(); renderStage(); };
  $('#upDeaf').onclick = () => { Voice.toggleDeafen(); renderUserPanel(); renderStage(); };
  $('#upSet').onclick = () => openSettings('user','account');
}
function statusMenu(e){
  const r = $('#userPanel').getBoundingClientRect();
  const p = S.me;
  const items = [{ raw: profileCard(p) }];
  ['online','idle','dnd','invisible'].forEach(st => items.push({ label: STATUS[st][0], icon: `<span class="sdot" style="background:${STATUS[st][1]}"></span>`, onClick: () => setMyStatus(st) }));
  items.push('-', { label: p.custom_status ? 'Editar status personalizado' : 'Definir status personalizado', icon: ic('smile',18), onClick: customStatusModal });
  if(p.custom_status) items.push({ label:'Limpar status personalizado', icon: ic('x',18), onClick: () => saveCustomStatus(null, null) });
  items.push({ label:'Editar perfil', icon: ic('edit',18), onClick: () => openSettings('user','profile') }, { label:'Copiar usuário', icon: ic('copy',18), onClick: () => copy(p.username) });
  menu(r.left + 8, r.top - 520, items, 'pp');
  $('#menu').style.top = Math.max(8, r.top - $('#menu').offsetHeight - 8) + 'px';
}
async function setMyStatus(st){
  S.myStatus = st; S.me.status = st; S.autoIdle = false;
  trackOnline(); renderUserPanel(); renderMembers(); renderSidebar();
  await App.sb.from('profiles').update({ status: st }).eq('id', S.me.id);
}
function customStatusModal(){
  const p = S.me; let emoji = p.custom_emoji || '😀';
  modal(`<form id="csF"><div class="mh"><h2>Definir um status personalizado</h2><p>Todo mundo vê embaixo do seu nome.</p></div>
    <div class="mc"><label class="field"><span>O que está rolando?</span>
      <div class="csrow"><button type="button" class="csemo" id="csE">${esc(emoji)}</button><input class="inp" id="csT" maxlength="80" value="${esc(p.custom_status || '')}" placeholder="Jogando Valorant 🎮"></div></label>
      <div class="chips">${['🎮 Jogando','📚 Estudando','💼 Trabalhando','😴 Dormindo','🎬 Vendo filme','🎧 Ouvindo música'].map(x => `<button type="button" class="chip" data-pre="${x}">${x}</button>`).join('')}</div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    m.querySelector('#csE').onclick = ev => { const r = ev.target.getBoundingClientRect(); emojiPicker(r.left, r.bottom + 430, em => { emoji = em; m.querySelector('#csE').textContent = em; }); };
    m.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { const [e, ...t] = b.dataset.pre.split(' '); emoji = e; m.querySelector('#csE').textContent = e; m.querySelector('#csT').value = t.join(' '); });
    m.querySelector('#csF').onsubmit = e => { e.preventDefault(); const t = m.querySelector('#csT').value.trim(); closeModal(); saveCustomStatus(t || null, t ? emoji : null); };
  });
}
async function saveCustomStatus(text, emoji){
  const { data, error } = await App.sb.from('profiles').update({ custom_status: text, custom_emoji: emoji }).eq('id', S.me.id).select().single();
  if(error){ App.toast(error.message, true); return; }
  S.me = data; S.profiles.set(data.id, data); renderUserPanel(); renderMembers(); App.toast(text ? 'Status atualizado!' : 'Status limpo');
}
function renderVoicePanel(){
  const el = $('#voicePanel');
  if(!Voice.channel){ el.classList.add('hidden'); return; }
  const c = Voice.channel;
  const where = c.kind === 'dm' ? 'Chamada com ' + esc(prof(dmOther(c)).display_name) : esc(c.name) + ' / ' + esc((S.servers.find(s => s.id === c.server_id) || {}).name || '');
  const ping = Voice.quality || 'good';
  el.classList.remove('hidden');
  el.innerHTML = `<div class="vst"><div class="vwhere" id="vpGo"><b class="q-${ping}">${ic('signal',16)} Voz conectada <span class="ctimer" id="cTimer"></span></b><small>${where}</small></div>
      <button class="ibtn hang" id="vpLeave" data-tip="Desconectar">${ic('phoneOff',20)}</button></div>
    <div class="vbtns">
      <button class="vb ${Voice.camStream?'on':''}" id="vpCam" data-tip="${Voice.camStream?'Desligar câmera':'Ligar câmera'}">${ic(Voice.camStream?'video':'videoOff',18)}</button>
      <button class="vb ${Voice.screenStream?'on':''}" id="vpScreen" data-tip="${Voice.screenStream?'Parar de transmitir':'Compartilhar tela'}">${ic('screenUp',18)}</button>
      <button class="vb" id="vpAct" data-tip="Atividades e soundboard">${ic('sparkles',18)}</button>
      <button class="vb" id="vpQual" data-tip="Qualidade e áudio">${ic('sliders',18)}</button>
    </div>`;
  $('#vpGo').onclick = () => openChannel(c);
  clearInterval(S.callTimer);
  const tick = () => { const t = $('#cTimer'); if(!t || !Voice.channel){ clearInterval(S.callTimer); return; } const sec = (Date.now() - (Voice.joinedAt || Date.now())) / 1000; t.textContent = (sec >= 3600 ? Math.floor(sec/3600) + ':' : '') + String(Math.floor(sec/60) % 60).padStart(sec >= 3600 ? 2 : 1, '0') + ':' + String(Math.floor(sec % 60)).padStart(2,'0'); };
  tick(); S.callTimer = setInterval(tick, 1000);
  $('#vpLeave').onclick = leaveVoice;
  $('#vpCam').onclick = () => Voice.camStream ? Voice.stopCamera() : cameraSetup();
  $('#vpScreen').onclick = () => Voice.screenStream ? Voice.stopScreen() : Voice.startScreen();
  $('#vpAct').onclick = e => activitiesMenu(e.currentTarget);
  $('#vpQual').onclick = () => openSettings('user','voice');
}

/* ---------------- área principal ---------------- */
function headBtns(list){ return list.map(([id, icon, tip, cls]) => `<button class="hbtn ${cls||''}" id="${id}" data-tip="${tip}">${ic(icon,22)}</button>`).join(''); }
function renderMain(keepMessages){
  const head = $('#mainHead'), body = $('#mainBody');
  const back = `<button class="back" id="mBack">${ic('arrowLeft',22)}</button>`;
  const r = S.route;

  if(r.kind === 'home' && !r.dm){ unmountMessages(); renderFriends(head, body, back); bindBack(); return; }

  if(r.kind === 'home' && r.dm){
    const d = S.dms.find(x => x.id === r.dm); if(!d){ go({kind:'home', dm:null}); return; }
    const p = prof(dmOther(d));
    const inCall = Voice.channel && Voice.channel.id === d.id;
    head.innerHTML = `${back}<div class="htitle" id="hProf">${avatar(p,'sm',true)}<b>${esc(p.display_name)}</b>${p.custom_status ? `<span class="desc">${statusText(p)}</span>` : ''}</div><span class="grow"></span>
      ${inCall ? '' : headBtns([['dmCall','phone','Iniciar chamada de voz'],['dmVideo','video','Iniciar chamada de vídeo']])}
      ${headBtns([['hPins','pin','Mensagens fixadas'],['hSearch','search','Buscar']])}`;
    $('#hProf').onclick = e => userMenu(p.id, e.clientX, e.clientY + 20);
    const callBtn = $('#dmCall'); if(callBtn) callBtn.onclick = () => joinVoice(d);
    const vBtn = $('#dmVideo'); if(vBtn) vBtn.onclick = async () => { await joinVoice(d); cameraSetup(); };
    $('#hPins').onclick = e => showPins(e.currentTarget); $('#hSearch').onclick = e => showSearch(e.currentTarget);
    bindBack();
    if(keepMessages && M.cid === d.id && body.querySelector('.msgs')){ renderStage(); return; }
    body.innerHTML = `<div id="stageWrap"></div><div id="msgWrap" class="msgcol"></div>`;
    renderStage();
    mountMessages(d, $('#msgWrap'), `<div class="welcome">${avatar(p,'xl')}<h1>${esc(p.display_name)}</h1><p class="un">@${esc(p.username)}</p><p>Este é o começo da sua conversa com <b>${esc(p.display_name)}</b>. Mande um oi! 👋</p></div>`);
    return;
  }

  const s = curServer(); if(!s) return;
  const c = (S.channels.get(s.id) || []).find(x => x.id === r.cid);
  if(!c){
    unmountMessages();
    head.innerHTML = `${back}<div class="htitle"><b>${esc(s.name)}</b></div>`;
    body.innerHTML = `<div class="empty big">${ic('hash',48)}<h3>Esse servidor ainda não tem canais</h3>${App.hasPerm(s.id,1)?'<button class="btn" id="mkCh">Criar canal</button>':''}</div>`;
    const b = $('#mkCh'); if(b) b.onclick = () => createChannelModal(s, 'text');
    bindBack(); return;
  }
  const memBtn = [['hMembers','users','Mostrar/esconder membros', S.showMembers !== false ? 'on' : '']];
  if(c.kind === 'text'){
    head.innerHTML = `${back}<div class="htitle"><span class="hic">${ic('hash',22)}</span><b>${esc(c.name)}</b>${c.topic ? `<span class="hdiv"></span><span class="desc" id="hTopic" title="${esc(c.topic)}">${richText(c.topic)}</span>` : ''}</div><span class="grow"></span>
      ${headBtns([['hPins','pin','Mensagens fixadas'], ...memBtn, ['hSearch','search','Buscar'], ['mInvite','userPlus','Convidar amigos']])}`;
    $('#hPins').onclick = e => showPins(e.currentTarget); $('#hSearch').onclick = e => showSearch(e.currentTarget);
    $('#mInvite').onclick = () => inviteModal(s);
    $('#hMembers').onclick = () => { S.showMembers = S.showMembers === false; renderMain(); renderMembers(); };
    bindBack();
    body.innerHTML = `<div id="msgWrap" class="msgcol"></div>`;
    mountMessages(c, $('#msgWrap'), `<div class="welcome"><div class="big">${ic('hash',40)}</div><h1>Bem-vindo(a) a #${esc(c.name)}!</h1><p>${c.topic ? richText(c.topic) : `Este é o começo do canal #${esc(c.name)}.`}</p></div>`);
  } else {
    unmountMessages();
    head.innerHTML = `${back}<div class="htitle"><span class="hic">${ic('volume',22)}</span><b>${esc(c.name)}</b>${c.topic ? `<span class="hdiv"></span><span class="desc">${esc(c.topic)}</span>` : ''}</div><span class="grow"></span>${headBtns([['mInvite','userPlus','Convidar amigos']])}`;
    $('#mInvite').onclick = () => inviteModal(s);
    bindBack();
    body.innerHTML = `<div id="stageWrap" class="stagefull"></div>`;
    renderStage();
  }
}
function bindBack(){ const b = $('#mBack'); if(b) b.onclick = () => document.body.classList.remove('m-main'); }

/* ---------------- troca rápida (Ctrl+K) ---------------- */
function quickSwitcher(){
  closeMenu();
  const entries = [];
  S.dms.forEach(d => { const p = prof(dmOther(d)); entries.push({ k: p.display_name + ' ' + p.username, html: `${avatar(p,'sm',true)}<b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small>`, go: () => go({ kind:'home', dm: d.id }) }); });
  S.friends.filter(f => f.status === 'accepted' && !S.dms.find(d => dmOther(d) === f.uid)).forEach(f => { const p = prof(f.uid); entries.push({ k: p.display_name + ' ' + p.username, html: `${avatar(p,'sm',true)}<b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small>`, go: () => openDM(f.uid) }); });
  S.servers.forEach(s => {
    (S.channels.get(s.id) || []).forEach(c => entries.push({ k: c.name + ' ' + s.name, html: `<span class="qic">${ic(c.kind === 'text' ? 'hash' : 'volume', 18)}</span><b>${esc(c.name)}</b><small>${esc(s.name)}</small>`, go: () => { go({ kind:'server', sid: s.id, cid: c.id }); if(c.kind === 'voice') joinVoice(c); } }));
    entries.push({ k: s.name, html: `<span class="qsrv" style="background:${esc(s.icon_color)}">${serverIcon(s)}</span><b>${esc(s.name)}</b><small>Servidor</small>`, go: () => go({ kind:'server', sid: s.id }) });
  });
  modal(`<div class="qs"><input class="inp" id="qsQ" placeholder="Para onde você quer ir?" autocomplete="off"><div class="qsl" id="qsL"></div>
    <div class="qsh">Dica: digite o nome de um amigo, canal ou servidor · <kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir</div></div>`, m => {
    m.querySelector('.mbox').classList.add('qsbox');
    const q = m.querySelector('#qsQ'), L = m.querySelector('#qsL'); let sel = 0, res = [];
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const draw = () => {
      const v = norm(q.value.trim());
      res = (v ? entries.filter(e => norm(e.k).includes(v)) : entries).slice(0, 12); sel = Math.min(sel, Math.max(0, res.length - 1));
      L.innerHTML = res.map((e, i) => `<div class="qsi ${i===sel?'on':''}" data-i="${i}">${e.html}</div>`).join('') || '<div class="empty">Nada encontrado</div>';
      L.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { closeModal(); res[+el.dataset.i].go(); });
    };
    q.oninput = () => { sel = 0; draw(); };
    q.onkeydown = e => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(res.length - 1, sel + 1); draw(); }
      if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      if(e.key === 'Enter' && res[sel]){ closeModal(); res[sel].go(); }
    };
    draw();
  });
}
window.addEventListener('keydown', e => { if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me){ e.preventDefault(); quickSwitcher(); } });

/* ---------------- amigos ---------------- */
function renderFriends(head, body, back){
  const pend = S.friends.filter(f => f.status === 'pending');
  const acc = S.friends.filter(f => f.status === 'accepted');
  const tab = S.friendTab;
  const inc = pend.filter(f => f.incoming).length;
  head.innerHTML = `${back}<div class="htitle"><span class="hic">${ic('users',22)}</span><b>Amigos</b></div><span class="hdiv"></span><span class="tabs">
    <button class="tab ${tab==='online'?'on':''}" data-t="online">Online</button>
    <button class="tab ${tab==='all'?'on':''}" data-t="all">Todos</button>
    <button class="tab ${tab==='pending'?'on':''}" data-t="pending">Pendentes${inc?` <span class="pill">${inc}</span>`:''}</button>
    <button class="tab addf ${tab==='add'?'on':''}" data-t="add">Adicionar amigo</button></span>`;
  head.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.friendTab = b.dataset.t; renderMain(); });

  if(tab === 'add'){
    body.innerHTML = `<div class="flist"><div class="addbox"><h2>Adicionar amigo</h2><p>Adicione pelo nome de usuário. O seu é <b>@${esc(S.me.username)}</b> <a style="cursor:pointer" id="cpMe">copiar</a></p>
      <form id="addF"><input id="addU" placeholder="Digite o nome de usuário, ex: lucas_10" autocomplete="off"><button class="btn">Enviar pedido de amizade</button></form>
      <div id="addMsg" class="addmsg"></div></div>
      <div class="addart">${ic('users',64)}<p>Seus amigos aparecem aqui. Mande o seu nome de usuário para eles!</p></div></div>`;
    $('#cpMe').onclick = () => copy(S.me.username);
    $('#addF').onsubmit = async e => {
      e.preventDefault();
      const u = $('#addU').value.trim().replace(/^@/, '').toLowerCase(); if(!u) return;
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: u });
      const msg = $('#addMsg');
      if(error){ msg.className = 'addmsg err'; msg.textContent = error.message.includes('não encontrado') ? 'Ninguém com esse usuário. Confira se digitou certinho.' : error.message; return; }
      msg.className = 'addmsg ok';
      msg.textContent = data === 'accepted' ? '🎉 Agora vocês são amigos!' : `Pedido enviado para @${u}!`;
      $('#addU').value = ''; await loadFriends(); renderRail();
    };
    return;
  }
  let rows = [], title = '';
  if(tab === 'online'){ rows = acc.filter(f => S.online.has(f.uid)); title = 'Online — ' + rows.length; }
  else if(tab === 'all'){ rows = acc; title = 'Todos os amigos — ' + rows.length; }
  else { rows = pend; title = 'Pendentes — ' + rows.length; }
  rows.sort((a,b) => prof(a.uid).display_name.localeCompare(prof(b.uid).display_name));
  const activity = uid => {
    for(const [topic, metas] of S.vp) { const m = metas.find(x => x.user_id === uid && x.voice); if(m){ const ch = findChannel(m.voice); if(ch) return m.sharing ? `<span class="livetag" data-watch="${m.voice}" data-wsess="${m.session}">${ic('screenUp',13)} AO VIVO em ${ch.kind==='dm'?'uma chamada':esc(ch.name)} · Assistir</span>` : `${ic('volume',13)} Em ${ch.kind==='dm'?'uma chamada':esc(ch.name)}`; } }
    return '';
  };
  body.innerHTML = `<div class="flist"><div class="fsearch">${ic('search',16)}<input id="fQ" placeholder="Buscar" autocomplete="off"></div><h4>${title}</h4><div id="fRows">${rows.length ? rows.map(f => {
    const p = prof(f.uid);
    const sub = f.status === 'pending' ? (f.incoming ? 'Pedido de amizade recebido' : 'Pedido enviado') : (activity(f.uid) || statusText(p));
    const btns = f.status === 'pending'
      ? (f.incoming ? `<button class="rb yes" data-acc="${f.uid}" data-tip="Aceitar">${ic('check',18)}</button><button class="rb no" data-rm="${f.uid}" data-tip="Recusar">${ic('x',18)}</button>` : `<button class="rb no" data-rm="${f.uid}" data-tip="Cancelar">${ic('x',18)}</button>`)
      : `<button class="rb" data-dm="${f.uid}" data-tip="Mensagem">${ic('chat',18)}</button><button class="rb" data-call="${f.uid}" data-tip="Ligar">${ic('phone',18)}</button><button class="rb" data-fmore="${f.uid}" data-tip="Mais">${ic('dots',18)}</button>`;
    return `<div class="frow" data-n="${esc((p.display_name + ' ' + p.username).toLowerCase())}" data-fu="${f.uid}">${avatar(p,'',true)}<div class="t"><b>${esc(p.display_name)} <span class="fun">@${esc(p.username)}</span></b><small>${sub}</small></div>${btns}</div>`;
  }).join('') : `<div class="empty big">${ic(tab==='pending'?'inbox':'users',56)}<p>${tab==='online'?'Nenhum amigo online agora. Que tal chamar alguém?':tab==='pending'?'Nenhum pedido pendente.':'Você ainda não tem amigos aqui.'}</p><button class="btn" id="goAdd">Adicionar amigo</button></div>`}</div></div>`;
  const fq = $('#fQ'); if(fq) fq.oninput = () => { const v = fq.value.toLowerCase(); body.querySelectorAll('.frow').forEach(r => r.style.display = r.dataset.n.includes(v) ? '' : 'none'); };
  const ga = $('#goAdd'); if(ga) ga.onclick = () => { S.friendTab = 'add'; renderMain(); };
  body.querySelectorAll('[data-watch]').forEach(b => b.onclick = e => { e.stopPropagation(); watchLive(b.dataset.watch, b.dataset.wsess); });
  body.querySelectorAll('.frow').forEach(r => r.onclick = e => { if(e.target.closest('button,[data-watch]')) return; const f = S.friends.find(x => x.uid === r.dataset.fu); if(f && f.status === 'accepted') openDM(f.uid); });
  body.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => {
    const { error } = await App.sb.from('friendships').update({ status:'accepted' }).eq('requester', b.dataset.acc).eq('addressee', S.me.id);
    if(error) App.toast(error.message, true); else { await loadFriends(); renderLight(); renderMain(); App.sfx('join'); }
  });
  const removeFriend = async uid => {
    const f = S.friends.find(x => x.uid === uid);
    if(f.status === 'accepted' && !(await confirmBox('Desfazer amizade', `Remover <b>${esc(prof(f.uid).display_name)}</b> dos amigos?`, 'Remover'))) return;
    const me = S.me.id, o = f.uid;
    const { error } = await App.sb.from('friendships').delete().or(`and(requester.eq.${me},addressee.eq.${o}),and(requester.eq.${o},addressee.eq.${me})`);
    if(error) App.toast(error.message, true); else { await loadFriends(); renderLight(); renderMain(); }
  };
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => removeFriend(b.dataset.rm));
  body.querySelectorAll('[data-fmore]').forEach(b => b.onclick = e => { const r = b.getBoundingClientRect(); menu(r.left - 160, r.bottom + 4, [
    { label:'Ver perfil', icon: ic('user',18), onClick: () => userMenu(b.dataset.fmore, r.left - 200, r.bottom) },
    { label:'Chamada de vídeo', icon: ic('video',18), onClick: async () => { const d = await openDM(b.dataset.fmore); if(d){ await joinVoice(d); cameraSetup(); } } },
    '-', { label:'Desfazer amizade', icon: ic('x',18), danger:true, onClick: () => removeFriend(b.dataset.fmore) } ]); });
  body.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => openDM(b.dataset.dm));
  body.querySelectorAll('[data-call]').forEach(b => b.onclick = async () => { const d = await openDM(b.dataset.call); if(d) joinVoice(d); });
}

async function openDM(uid){
  const { data: cid, error } = await App.sb.rpc('open_dm', { p_user: uid });
  if(error){ App.toast(error.message, true); return null; }
  if(!S.dms.find(d => d.id === cid)) await loadDms();
  const d = S.dms.find(x => x.id === cid);
  go({ kind:'home', dm: cid });
  return d;
}

/* ---------------- mensagens ---------------- */
const M = { cid:null, ch:null, list:[], done:false, loading:false, el:null, welcome:'', editing:null, replyTo:null,
            files:[], reacts:new Map(), typing:new Map(), typingCh:null, lastTypingSent:0, detached:false, newWhileAway:0, readAt:null, rec:null };
const READ = ls.get('telao-read', {});
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(0) + ' KB' : (b/1048576).toFixed(1) + ' MB';
const isImg = a => /^image\//.test(a.type || '');
const isVid = a => /^video\//.test(a.type || '');
const isAud = a => /^audio\//.test(a.type || '');
const ytId = u => { const m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };

/* ---------- comandos com / ---------- */
const CMDS = [
  ['dado', '[lados]', 'Rola um dado (padrão: 6 lados)', '🎲'],
  ['moeda', '', 'Cara ou coroa', '🪙'],
  ['sorteio', 'a, b, c', 'Sorteia uma das opções', '🎯'],
  ['enquete', 'Pergunta | opção 1 | opção 2', 'Cria uma enquete com votação', '📊'],
  ['confete', '[mensagem]', 'Solta confete na tela de todo mundo', '🎉'],
  ['eu', 'ação', 'Fala na terceira pessoa', '💬'],
  ['spoiler', 'texto', 'Esconde o texto até clicarem', '🙈'],
  ['shrug', '[texto]', 'Adiciona ¯\\_(ツ)_/¯', '🤷'],
  ['tableflip', '[texto]', 'Vira a mesa (╯°□°)╯︵ ┻━┻', '😤'],
  ['unflip', '[texto]', 'Desvira a mesa ┬─┬ノ( º _ ºノ)', '😌'],
  ['lenny', '[texto]', '( ͡° ͜ʖ ͡°)', '😏'],
];
function runCommand(text){
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/); if(!m) return null;
  const [, cmd, arg] = m, a = arg.trim(), me = S.me.display_name;
  const rnd = n => Math.floor(Math.random() * n);
  switch(cmd.toLowerCase()){
    case 'dado': { const n = Math.max(2, Math.min(1000, parseInt(a) || 6)); return { content: `🎲 **${me}** rolou um d${n} e tirou **${1 + rnd(n)}**` }; }
    case 'moeda': return { content: `🪙 **${me}** jogou a moeda: deu **${rnd(2) ? 'Cara' : 'Coroa'}**!` };
    case 'sorteio': { const ops = a.split(/[,;|]/).map(x => x.trim()).filter(Boolean); if(ops.length < 2) return { error: 'Use: /sorteio opção 1, opção 2, opção 3' }; return { content: `🎯 Sorteio entre ${ops.map(x => '`' + x + '`').join(', ')}…\nO escolhido foi: **${ops[rnd(ops.length)]}**! 🎉` }; }
    case 'enquete': { const parts = a.split('|').map(x => x.trim()).filter(Boolean); if(parts.length < 3) return { error: 'Use: /enquete Pergunta | opção 1 | opção 2' }; return { content: '', attachments: [{ type:'poll', q: parts[0].slice(0, 200), opts: parts.slice(1, 11).map(x => x.slice(0, 80)) }] }; }
    case 'confete': return { content: (a || '🎉🎉🎉') + ' ', fx: 'confete' };
    case 'eu': return a ? { content: `*${me} ${a}*` } : { error: 'Use: /eu está jogando' };
    case 'spoiler': return a ? { content: `||${a}||` } : { error: 'Use: /spoiler texto' };
    case 'shrug': return { content: (a ? a + ' ' : '') + '¯\\_(ツ)_/¯' };
    case 'tableflip': return { content: (a ? a + ' ' : '') + '(╯°□°)╯︵ ┻━┻' };
    case 'unflip': return { content: (a ? a + ' ' : '') + '┬─┬ノ( º _ ºノ)' };
    case 'lenny': return { content: (a ? a + ' ' : '') + '( ͡° ͜ʖ ͡°)' };
  }
  return null;
}

/* ---------- efeitos de mensagem (confete, corações) ---------- */
function msgEffectFor(text){
  if(!text) return null;
  if(/parab[eé]ns|feliz anivers[aá]rio|🎉{2,}|^🎉\s*$/i.test(text)) return 'confete';
  if(/\bte amo\b|❤️{2,}|^❤️\s*$|💖|😍{2,}/i.test(text)) return 'coracoes';
  if(/\bgg\b|ganhamos|vit[oó]ria|🏆/i.test(text)) return 'trofeu';
  return null;
}
function burst(kind){
  const host = $('#msgWrapIn') || $('#mainBody'); if(!host) return;
  const cv = document.createElement('canvas'); cv.className = 'burst'; host.appendChild(cv);
  const r = host.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
  const ctx = cv.getContext('2d'), N = kind === 'confete' ? 140 : 40;
  const colors = ['#ff6b4a','#ffd166','#06d6a0','#4cc9f0','#b388ff','#ff4d8d'];
  const glyph = kind === 'coracoes' ? ['❤️','💖','💗','💕'] : kind === 'trofeu' ? ['🏆','⭐','✨','🥇'] : null;
  const ps = Array.from({ length: N }, () => ({ x: r.width * (0.2 + Math.random() * 0.6), y: glyph ? r.height + 20 : r.height * 0.3, vx: (Math.random() - .5) * (glyph ? 2 : 11), vy: glyph ? -(3 + Math.random() * 4) : -(4 + Math.random() * 9),
    rot: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[Math.floor(Math.random() * colors.length)], s: 6 + Math.random() * 7, g: glyph ? glyph[Math.floor(Math.random() * glyph.length)] : null }));
  const t0 = performance.now();
  const loop = now => {
    const t = now - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += glyph ? -0.02 : 0.25; p.vx *= .99; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / 2800); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if(p.g){ ctx.font = (p.s * 3) + 'px serif'; ctx.fillText(p.g, 0, 0); } else { ctx.fillStyle = p.c; ctx.fillRect(-p.s/2, -p.s/4, p.s, p.s/2); }
      ctx.restore();
    });
    if(t < 2800) requestAnimationFrame(loop); else cv.remove();
  };
  requestAnimationFrame(loop);
}

/* ---------- enquetes (votos usam as reações "opt:N") ---------- */
function pollHtml(m, a){
  const mm = M.reacts.get(m.id) || new Map();
  const counts = a.opts.map((_, i) => (mm.get('opt:' + i) || new Set()).size);
  const total = counts.reduce((x, y) => x + y, 0);
  const mine = a.opts.findIndex((_, i) => (mm.get('opt:' + i) || new Set()).has(S.me.id));
  return `<div class="poll" data-poll="${m.id}"><div class="pq">${ic('poll',18)} ${esc(a.q)}</div>
    ${a.opts.map((o, i) => { const pct = total ? Math.round(counts[i] / total * 100) : 0;
      return `<button class="popt ${mine===i?'mine':''}" data-vote="${i}" data-mid="${m.id}"><span class="pbar" style="width:${pct}%"></span><span class="ptx">${mine===i?ic('check',15):''}${esc(o)}</span><b>${counts[i] ? pct + '%' : ''}</b></button>`; }).join('')}
    <div class="pfoot">${total} voto${total===1?'':'s'}${mine >= 0 ? ' · clique de novo para tirar seu voto' : ' · clique para votar'}</div></div>`;
}
async function vote(mid, i){
  const mm = M.reacts.get(mid) || new Map();
  const cur = [...mm.keys()].filter(k => k.startsWith('opt:') && mm.get(k).has(S.me.id));
  for(const k of cur){ delReact(mid, k, S.me.id); await App.sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', S.me.id).eq('emoji', k); }
  if(!cur.includes('opt:' + i)){ addReact(mid, 'opt:' + i, S.me.id); await App.sb.from('message_reactions').insert({ message_id: mid, emoji: 'opt:' + i }); }
  patchReacts(mid);
}

/* ---------- markdown ---------- */
function richText(t){
  if(!t) return '';
  const blocks = [];
  let s = String(t).replace(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/gi, (m, code) => { blocks.push(code.replace(/^\n|\n$/g,'')); return '\u0000' + (blocks.length-1) + '\u0000'; });
  const inl = [];
  s = s.replace(/`([^`\n]+)`/g, (m, c) => { inl.push(c); return '\u0001' + (inl.length-1) + '\u0001'; });
  let h = esc(s);
  h = h.split('\n').map(line => {
    if(/^&gt; /.test(line)) return `<span class="bq">${line.slice(5)}</span>`;
    if(/^### /.test(line)) return `<span class="h3">${line.slice(4)}</span>`;
    if(/^## /.test(line)) return `<span class="h2">${line.slice(3)}</span>`;
    if(/^# /.test(line)) return `<span class="h1">${line.slice(2)}</span>`;
    if(/^[-*] /.test(line)) return `<span class="li">• ${line.slice(2)}</span>`;
    return line;
  }).join('\n');
  h = h.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" data-spoiler>$1</span>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/__(.+?)__/g, '<u>$1</u>');
  h = h.replace(/~~(.+?)~~/g, '<s>$1</s>');
  h = h.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url.length > 70 ? url.slice(0, 67) + '…' : url}</a>`);
  h = h.replace(/(^|\s)@([a-z0-9_]{3,24})\b/g, (m, sp, u) => {
    const me = S.me && u === S.me.username;
    const known = [...S.profiles.values()].find(p => p.username === u);
    return known ? `${sp}<span class="mention ${me?'me':''}" data-uprof="${known.id}">@${esc(known.display_name)}</span>` : m;
  });
  h = h.replace(/(^|\s)@(todos|everyone)\b/g, '$1<span class="mention me">@$2</span>');
  h = h.replace(/:([a-z0-9_]{2,30}):/g, (m, k) => EMOJI.BY[k] || m);
  h = h.replace(/\u0001(\d+)\u0001/g, (m, i) => `<code>${esc(inl[+i])}</code>`);
  h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => `<pre class="codeblock"><button class="cpy" data-copycode="${i}">${ic('copy',14)}</button><code>${esc(blocks[+i])}</code></pre>`);
  M._blocks = blocks;
  return h;
}
const onlyEmoji = t => t && t.length <= 30 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^\d+$/.test(t.trim());

/* ---------- montar a conversa ---------- */
async function mountMessages(ch, container, welcome){
  unmountMessages();
  Object.assign(M, { cid:ch.id, ch, list:[], done:false, loading:false, welcome, editing:null, replyTo:null, files:[], detached:false, newWhileAway:0 });
  M.reacts = new Map(); M.typing = new Map();
  M.readAt = READ[ch.id] || null;
  const ph = ch.kind === 'dm' ? '@' + prof(dmOther(ch)).display_name : '#' + ch.name;
  container.insertAdjacentHTML('beforeend', `
    <div class="msgwrap" id="msgWrapIn">
      <div class="msgs" id="msgs"><div class="skel">${'<div class="sk"><i></i><div><b></b><span></span></div></div>'.repeat(5)}</div></div>
      <button class="jump hidden" id="jumpBtn">${ic('arrowDown',16)} <span>Ir para o presente</span></button>
      <div class="dropzone hidden" id="dropZone"><div>${ic('clip',40)}<b>Solte para enviar</b><small>em ${esc(ph)}</small></div></div>
    </div>
    <div class="composer">
      <div class="typing" id="typingLine"></div>
      <div class="cbox">
        <div class="replybar hidden" id="replyBar"></div>
        <div class="filestrip hidden" id="fileStrip"></div>
        <div class="recbar hidden" id="recBar"></div>
        <form id="cmpF" class="crow">
          <button type="button" class="cbtn2" id="cAttach" title="Anexar arquivos">${ic('plusCircle',22)}</button>
          <textarea id="cmp" rows="1" maxlength="4000" placeholder="Mensagem para ${esc(ph)} — digite / para comandos"></textarea>
          <button type="button" class="cbtn2" id="cEmoji" title="Emoji">${ic('smile',22)}</button>
          <button type="button" class="cbtn2" id="cVoice" title="Mensagem de voz">${ic('mic',22)}</button>
          <button class="cbtn2 send" id="cSend" title="Enviar">${ic('send',20)}</button>
        </form>
        <div class="acpop hidden" id="acPop"></div>
      </div>
      <input type="file" id="cFile" multiple class="hidden">
    </div>`);
  M.el = $('#msgs');
  bindComposer(ch);
  M.el.onscroll = onMsgScroll;
  M.el.addEventListener('click', onMsgClick);
  M.el.addEventListener('contextmenu', onMsgContext);
  // digitando…
  M.typingCh = App.sb.channel('typing:' + ch.id, { config:{ broadcast:{ self:false } } })
    .on('broadcast', { event:'t' }, ({ payload }) => onTyping(payload)).subscribe();
  await loadLatest();
}
function unmountMessages(){
  if(M.typingCh){ try{ App.sb.removeChannel(M.typingCh); }catch(e){} M.typingCh = null; }
  M.typing.forEach(t => clearTimeout(t)); M.typing.clear();
  if(M.rec) stopRecording(true);
  M.files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
  M.cid = null; M.el = null;
}
async function loadLatest(){
  const cid = M.cid;
  const { data, error } = await App.sb.from('messages').select('*').eq('channel_id', cid).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid) return;
  if(error){ M.el.innerHTML = `<div class="empty">Erro: ${esc(error.message)}</div>`; return; }
  M.list = (data || []).reverse(); M.done = (data || []).length < 50; M.detached = false;
  await hydrate(M.list);
  if(M.cid !== cid) return;
  renderMsgList(true);
  markRead();
}
async function hydrate(list){
  const ids = list.map(m => m.id);
  const replyIds = list.map(m => m.reply_to).filter(id => id && !list.find(x => x.id === id) && !M._replyCache?.has(id));
  M._replyCache = M._replyCache || new Map();
  const [rx, rp] = await Promise.all([
    ids.length ? App.sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids) : { data: [] },
    replyIds.length ? App.sb.from('messages').select('id,author_id,content,attachments').in('id', replyIds) : { data: [] },
  ]);
  (rx.data || []).forEach(r => addReact(r.message_id, r.emoji, r.user_id));
  (rp.data || []).forEach(r => M._replyCache.set(r.id, r));
  await ensureProfiles(list.map(m => m.author_id).concat((rp.data || []).map(r => r.author_id)));
}
async function loadOlder(){
  if(M.done || M.loading || !M.list.length) return;
  M.loading = true; const cid = M.cid;
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', cid).lt('created_at', M.list[0].created_at).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid){ M.loading = false; return; }
  const older = (data || []).reverse(); M.done = older.length < 50;
  await hydrate(older);
  const h0 = M.el.scrollHeight, t0 = M.el.scrollTop;
  M.list = older.concat(M.list);
  renderMsgList(false);
  M.el.scrollTop = M.el.scrollHeight - h0 + t0;
  M.loading = false;
}
async function loadNewer(){
  if(!M.detached || M.loading) return;
  M.loading = true; const cid = M.cid;
  const last = M.list[M.list.length - 1];
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', cid).gt('created_at', last.created_at).order('created_at').limit(50);
  if(M.cid !== cid){ M.loading = false; return; }
  await hydrate(data || []);
  M.list = M.list.concat(data || []);
  if((data || []).length < 50){ M.detached = false; M.newWhileAway = 0; }
  renderMsgList(false); M.loading = false;
}
function markRead(){
  if(!M.cid) return;
  const last = M.list[M.list.length - 1];
  READ[M.cid] = last ? last.created_at : new Date().toISOString();
  ls.set('telao-read', READ);
}

/* ---------- reações ---------- */
function addReact(mid, emoji, uid){
  if(!M.reacts.has(mid)) M.reacts.set(mid, new Map());
  const mm = M.reacts.get(mid); if(!mm.has(emoji)) mm.set(emoji, new Set());
  mm.get(emoji).add(uid);
}
function delReact(mid, emoji, uid){
  const mm = M.reacts.get(mid); if(!mm || !mm.has(emoji)) return;
  mm.get(emoji).delete(uid); if(!mm.get(emoji).size) mm.delete(emoji);
}
function reactsHtml(mid){
  const mm = M.reacts.get(mid); if(!mm || ![...mm.keys()].some(k => !k.startsWith('opt:'))) return '';
  return `<div class="reacts">${[...mm].filter(([e]) => !e.startsWith('opt:')).map(([e, set]) => {
    const names = [...set].slice(0, 6).map(u => prof(u).display_name).join(', ') + (set.size > 6 ? ` e mais ${set.size-6}` : '');
    return `<button class="rx ${set.has(S.me.id)?'mine':''}" data-rx="${esc(e)}" data-mid="${mid}" data-tip="${esc(names)}" data-tipsub="reagiu com ${esc(e)}"><span>${esc(e)}</span><b>${set.size}</b></button>`;
  }).join('')}<button class="rx add" data-addrx="${mid}" title="Adicionar reação">${ic('smilePlus',16)}</button></div>`;
}
async function toggleReact(mid, emoji){
  if(String(mid).startsWith('tmp')) return;
  const mm = M.reacts.get(mid), mine = mm && mm.get(emoji) && mm.get(emoji).has(S.me.id);
  if(mine){ delReact(mid, emoji, S.me.id); patchReacts(mid);
    const { error } = await App.sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', S.me.id).eq('emoji', emoji);
    if(error){ addReact(mid, emoji, S.me.id); patchReacts(mid); App.toast(error.message, true); }
  } else {
    addReact(mid, emoji, S.me.id); patchReacts(mid); pushRecent(emoji);
    const { error } = await App.sb.from('message_reactions').insert({ message_id: mid, emoji });
    if(error && !/duplicate/i.test(error.message)){ delReact(mid, emoji, S.me.id); patchReacts(mid); App.toast(error.message, true); }
  }
}
function patchReacts(mid){
  const pl = M.el && M.el.querySelector(`[data-poll="${mid}"]`);
  if(pl){ const m = M.list.find(x => x.id === mid), a = m && (m.attachments || []).find(x => x.type === 'poll'); if(a) pl.outerHTML = pollHtml(m, a); }
  const node = M.el && M.el.querySelector(`[data-m="${mid}"] .bd`); if(!node) return;
  const old = node.querySelector(':scope > .reacts'); const html = reactsHtml(mid);
  if(old){ if(html) old.outerHTML = html; else old.remove(); } else if(html) node.insertAdjacentHTML('beforeend', html);
}
App.onReaction = p => {
  const r = p.eventType === 'DELETE' ? p.old : p.new;
  if(!r || !M.cid || !M.list.find(m => m.id === r.message_id)) return;
  if(p.eventType === 'INSERT'){ if(r.user_id !== S.me.id || !(M.reacts.get(r.message_id)?.get(r.emoji)?.has(r.user_id))){ addReact(r.message_id, r.emoji, r.user_id); patchReacts(r.message_id); } }
  else if(p.eventType === 'DELETE'){ delReact(r.message_id, r.emoji, r.user_id); patchReacts(r.message_id); }
};

/* ---------- renderização ---------- */
function attHtml(m){
  const at = m.attachments || []; if(!at.length) return '';
  const imgs = at.filter(a => isImg(a) || isVid(a)), others = at.filter(a => !isImg(a) && !isVid(a) && a.type !== 'poll');
  let h = at.filter(a => a.type === 'poll').map(a => pollHtml(m, a)).join('');
  if(imgs.length){
    const n = Math.min(imgs.length, 4);
    h += `<div class="mgrid g${n}">` + imgs.map((a, i) => {
      const ratio = a.w && a.h ? `aspect-ratio:${a.w}/${a.h};` : '';
      const ph = a.thumb ? `background-image:url('${a.thumb}');` : '';
      const single = imgs.length === 1 ? `max-width:${Math.min(a.w || 400, 520)}px;` : '';
      if(isVid(a)) return `<div class="mitem vid" style="${single}${imgs.length===1?ratio:''}"><video src="${esc(a.url)}" preload="metadata" controls playsinline></video></div>`;
      return `<div class="mitem ${m._sending?'sending':''}" style="${single}${imgs.length===1?ratio:''}${ph}" data-lightbox="${m.id}" data-idx="${i}">
        <img src="${esc(a.url)}" ${a.w?`width="${a.w}" height="${a.h}"`:''} loading="lazy" decoding="async" alt="" onload="this.parentNode.classList.add('ok')">
        ${a.spoiler ? '<span class="spoilimg" data-spoiler>SPOILER</span>' : ''}</div>`;
    }).join('') + '</div>';
  }
  others.forEach(a => {
    if(isAud(a) && a.voice) h += voicePlayerHtml(a);
    else if(isAud(a)) h += `<div class="fcard">${ic('music',26)}<div class="t"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name || 'áudio')}</a><small>${fmtSize(a.size||0)}</small><audio src="${esc(a.url)}" controls preload="none"></audio></div></div>`;
    else h += `<div class="fcard">${ic('file',26)}<div class="t"><a href="${esc(a.url)}" target="_blank" rel="noopener" download>${esc(a.name || 'arquivo')}</a><small>${fmtSize(a.size||0)}</small></div><a class="dl" href="${esc(a.url)}" target="_blank" rel="noopener" download title="Baixar">${ic('download',20)}</a></div>`;
  });
  return h;
}
function voicePlayerHtml(a){
  const wave = (a.wave || Array(40).fill(4)).map(v => `<i style="height:${Math.max(3, Math.min(28, v))}px"></i>`).join('');
  return `<div class="vplayer" data-voice="${esc(a.url)}" data-dur="${a.dur||0}"><button class="vplay">${ic('play',16)}</button><div class="vwave">${wave}</div><span class="vtime">${fmtDur(a.dur||0)}</span></div>`;
}
const fmtDur = s => { s = Math.round(s); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };
function embedsHtml(m){
  const urls = (m.content || '').match(/https?:\/\/[^\s<]+/g) || [];
  return urls.map(ytId).filter(Boolean).slice(0, 2).map(id => `<div class="yt" data-yt="${id}"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" loading="lazy" decoding="async" alt=""><span class="ytplay">${ic('play',28)}</span></div>`).join('');
}
function replyHtml(m){
  if(!m.reply_to) return '';
  const r = M.list.find(x => x.id === m.reply_to) || (M._replyCache && M._replyCache.get(m.reply_to));
  if(!r) return `<div class="rquote"><span class="rline"></span><i>Mensagem original apagada</i></div>`;
  const p = prof(r.author_id);
  const snip = r.content ? esc(r.content.slice(0, 120)) : (r.attachments && r.attachments.length ? `${ic('image',14)} Anexo` : '');
  return `<div class="rquote" data-jump="${r.id}"><span class="rline"></span>${avatar(p,'xs')}<b style="color:${roleColor(p.id) || 'var(--txt)'}">${esc(p.display_name)}</b><span class="rsnip">${snip}</span></div>`;
}
function roleColor(uid){ return App.roleColorOf ? App.roleColorOf(uid) : null; }
function msgHtml(m, prev){
  const day = new Date(m.created_at).toDateString();
  let pre = '';
  if(!prev || new Date(prev.created_at).toDateString() !== day) pre += `<div class="daysep"><span>${fmtDay(m.created_at)}</span></div>`;
  if(M.readAt && m.created_at > M.readAt && (!prev || prev.created_at <= M.readAt) && m.author_id !== S.me.id) pre += `<div class="newsep"><span>novas mensagens</span></div>`;
  const grouped = !pre && prev && !m.reply_to && prev.author_id === m.author_id && (new Date(m.created_at) - new Date(prev.created_at)) < 7*60*1000;
  const p = prof(m.author_id), mine = m.author_id === S.me.id;
  const time = new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const mentioned = !mine && S.me && m.content && (m.content.includes('@' + S.me.username) || /@(todos|everyone)\b/.test(m.content));
  const emo = onlyEmoji(m.content) && !(m.attachments || []).length;
  const atts = attHtml(m), emb = embedsHtml(m);
  const onlyMedia = !m.content && (m.attachments || []).some(a => isImg(a) || isVid(a)) && !(m.attachments || []).some(a => a.type === 'poll');
  const meta = `<span class="mtime" title="${new Date(m.created_at).toLocaleString('pt-BR')}">${m.edited_at ? '<span class="edited">editado</span> · ' : ''}${m._sending ? ic('clock',11) : time}${m.pinned ? ' ' + ic('pin',11) : ''}</span>`;
  const content = M.editing === m.id
    ? `<textarea class="editbox" id="edBox" rows="2" maxlength="4000">${esc(m.content)}</textarea><div class="edithint">Esc para <a data-edcancel>cancelar</a> · Enter para <a data-edsave>salvar</a></div>`
    : (m.content ? `<div class="ct ${emo?'jumbo':''}">${richText(m.content)}</div>` : '');
  const bub = `<div class="bub ${emo?'emo':''} ${onlyMedia?'media':''}">${content}${atts}${emb}${meta}</div>`;
  const tools = m._sending ? '' : `<div class="acts">
      ${EMOJI.QUICK.slice(0,3).map(e => `<button data-quick="${e}" data-mid="${m.id}" title="Reagir">${e}</button>`).join('')}
      <button data-addrx="${m.id}" title="Adicionar reação">${ic('smilePlus',17)}</button>
      <button data-reply="${m.id}" title="Responder">${ic('reply',17)}</button>
      ${mine ? `<button data-edit="${m.id}" title="Editar">${ic('edit',17)}</button>` : ''}
      <button data-more="${m.id}" title="Mais">${ic('dots',17)}</button></div>`;
  const cls = `msg ${grouped?'':'first'} ${mine?'mine':''} ${mentioned?'mentioned':''} ${m.pinned?'pinned':''} ${m._sending?'sendingmsg':''}`;
  const color = roleColor(m.author_id);
  const head = mine ? '' : `<div class="hd"><b data-uprof="${p.id}" ${color ? `style="color:${color}"` : ''}>${nameHtml(p)}</b>${hasPlus(p) ? badgeHtml(BADGES[2], p, 'sm') : ''}</div>`;
  const av = mine ? '' : grouped ? '<div class="avsp"></div>' : avatar(p,'lg').replace('class="av lg', `data-uprof="${p.id}" class="av lg`);
  return `${pre}<div class="${cls}" data-m="${m.id}">${grouped ? '' : replyHtml(m)}<div class="mline">${av}<div class="bd">${grouped ? '' : head}${bub}${reactsHtml(m.id)}</div></div>${tools}</div>`;
}
function renderMsgList(stick){
  if(!M.el) return;
  const nearBottom = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 160;
  let h = M.done ? M.welcome : `<div class="loadmore"><div class="spin"></div></div>`;
  let prev = null;
  M.list.forEach(m => { h += msgHtml(m, prev); prev = m; });
  if(M.detached) h += `<div class="loadmore"><div class="spin"></div></div>`;
  M.el.innerHTML = h;
  bindEditor();
  if(stick === true || (stick == null && nearBottom)) toBottom();
  updateJump();
}
function toBottom(){
  if(!M.el) return;
  M.el.scrollTop = M.el.scrollHeight;
  // imagens com tamanho conhecido não pulam; as sem tamanho ajustam quando carregam
  M.el.querySelectorAll('img:not([width])').forEach(img => { if(!img.complete) img.addEventListener('load', () => { if(M.el && M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 400) M.el.scrollTop = M.el.scrollHeight; }, { once:true }); });
}
function appendMessage(m){
  const prev = M.list[M.list.length - 2];
  const nearBottom = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 160;
  M.el.insertAdjacentHTML('beforeend', msgHtml(m, prev));
  if(m.author_id === S.me.id || nearBottom) toBottom(); else { M.newWhileAway++; updateJump(); }
}
function addMessage(m){
  if(M.cid !== m.channel_id) return;
  const tmp = m._tmpOf ? M.list.findIndex(x => x.id === m._tmpOf) : -1;
  if(M.list.find(x => x.id === m.id)) return;
  if(M.detached){ M.newWhileAway++; updateJump(); return; }
  // substitui a mensagem "enviando…" pela de verdade
  const pend = tmp >= 0 ? tmp : M.list.findIndex(x => x._sending && x._sig === sigOf(m));
  if(pend >= 0){
    const old = M.list[pend];
    (old.attachments || []).forEach(a => a._local && URL.revokeObjectURL(a.url));
    M.list[pend] = m;
    const node = M.el.querySelector(`[data-m="${old.id}"]`);
    if(node){ const tmp = document.createElement('div'); tmp.innerHTML = msgHtml(m, M.list[pend - 1]); const nn = tmp.querySelector(`[data-m="${m.id}"]`); if(nn) node.replaceWith(nn); }
    else renderMsgList(null);
  } else {
    M.list.push(m); M.list.sort((a,b) => a.created_at.localeCompare(b.created_at));
    if(M.list[M.list.length - 1] === m) appendMessage(m); else renderMsgList(null);
  }
  M.typing.has(m.author_id) && (clearTimeout(M.typing.get(m.author_id)), M.typing.delete(m.author_id), renderTyping());
  const fx = msgEffectFor(m.content); if(fx && !M._fxDone?.has(m.id)){ (M._fxDone = M._fxDone || new Set()).add(m.id); burst(fx); }
  if(!document.hidden) markRead();
}
const sigOf = m => m.author_id + '|' + (m.content || '') + '|' + (m.attachments || []).length;
App.onMsgUpdate = row => {
  const i = M.list.findIndex(x => x.id === row.id); if(i < 0) return;
  M.list[i] = row;
  const node = M.el && M.el.querySelector(`[data-m="${row.id}"]`);
  if(node && M.editing !== row.id){ const html = msgHtml(row, M.list[i-1]); const tmp = document.createElement('div'); tmp.innerHTML = html; node.replaceWith(tmp.querySelector(`[data-m="${row.id}"]`)); }
};
App.onMsgDelete = id => {
  const i = M.list.findIndex(x => x.id === id); if(i < 0) return;
  M.list.splice(i, 1); renderMsgList(false);
};
function updateJump(){
  const b = $('#jumpBtn'); if(!b || !M.el) return;
  const far = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight > 600;
  b.classList.toggle('hidden', !(far || M.detached));
  b.querySelector('span').textContent = M.newWhileAway ? `${M.newWhileAway} nova${M.newWhileAway>1?'s':''} mensage${M.newWhileAway>1?'ns':'m'}` : M.detached ? 'Ir para o presente' : 'Ir para o fim';
}
function onMsgScroll(){
  if(M.el.scrollTop < 300) loadOlder();
  if(M.detached && M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 300) loadNewer();
  if(M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 80 && M.newWhileAway && !M.detached){ M.newWhileAway = 0; }
  updateJump();
}

/* ---------- cliques dentro das mensagens ---------- */
function onMsgClick(e){
  const t = e.target;
  const sp = t.closest('[data-spoiler]'); if(sp){ sp.classList.add('show'); return; }
  const cc = t.closest('[data-copycode]'); if(cc){ copy(cc.closest('pre').querySelector('code').textContent); return; }
  const up = t.closest('[data-uprof]'); if(up){ userMenu(up.dataset.uprof, e.clientX, e.clientY); return; }
  const q = t.closest('[data-quick]'); if(q){ toggleReact(q.dataset.mid, q.dataset.quick); return; }
  const vt = t.closest('[data-vote]'); if(vt){ vote(vt.dataset.mid, +vt.dataset.vote); return; }
  const rx = t.closest('[data-rx]'); if(rx){ toggleReact(rx.dataset.mid, rx.dataset.rx); return; }
  const ar = t.closest('[data-addrx]'); if(ar){ const r = ar.getBoundingClientRect(); emojiPicker(r.left, r.top, em => toggleReact(ar.dataset.addrx, em)); return; }
  const rp = t.closest('[data-reply]'); if(rp){ startReply(rp.dataset.reply); return; }
  const ed = t.closest('[data-edit]'); if(ed){ M.editing = ed.dataset.edit; rerenderOne(ed.dataset.edit); return; }
  const mo = t.closest('[data-more]'); if(mo){ msgMenu(mo.dataset.more, e.clientX, e.clientY); return; }
  const jp = t.closest('[data-jump]'); if(jp){ jumpTo(jp.dataset.jump); return; }
  const lb = t.closest('[data-lightbox]'); if(lb && !lb.querySelector('.spoilimg:not(.show)')){ lightbox(lb.dataset.lightbox, +lb.dataset.idx); return; }
  const yt = t.closest('[data-yt]'); if(yt){ yt.outerHTML = `<div class="yt on"><iframe src="https://www.youtube-nocookie.com/embed/${yt.dataset.yt}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`; return; }
  const vp = t.closest('.vplay'); if(vp){ playVoice(vp.closest('.vplayer')); return; }
  if(t.closest('[data-edcancel]')){ M.editing = null; rerenderOne(); return; }
  if(t.closest('[data-edsave]')){ saveEdit(); return; }
}
function onMsgContext(e){
  const node = e.target.closest('[data-m]'); if(!node || e.target.closest('a,img.embed,video')) return;
  e.preventDefault(); msgMenu(node.dataset.m, e.clientX, e.clientY);
}
function rerenderOne(id){ renderMsgList(false); }
function canModerate(){
  const ch = M.ch; if(!ch) return false;
  if(ch.kind === 'dm') return true;
  return App.hasPerm ? App.hasPerm(ch.server_id, 8) : (curServer() && curServer().owner_id === S.me.id);
}
function msgMenu(mid, x, y){
  const m = M.list.find(x => x.id === mid); if(!m || m._sending) return;
  const mine = m.author_id === S.me.id, mod = canModerate();
  const items = [
    { raw: `<div class="quickrx">${EMOJI.QUICK.map(e => `<button data-q="${e}">${e}</button>`).join('')}</div>`, mount: el => el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { closeMenu(); toggleReact(mid, b.dataset.q); }) },
    { label:'Adicionar reação', icon: ic('smilePlus',18), onClick: () => emojiPicker(x, y, em => toggleReact(mid, em)) },
    { label:'Responder', icon: ic('reply',18), onClick: () => startReply(mid) },
  ];
  if(mine) items.push({ label:'Editar mensagem', icon: ic('edit',18), onClick: () => { M.editing = mid; rerenderOne(mid); } });
  if(mod) items.push({ label: m.pinned ? 'Desafixar' : 'Fixar mensagem', icon: ic('pin',18), onClick: () => pinMsg(m) });
  if(m.content) items.push({ label:'Copiar texto', icon: ic('copy',18), onClick: () => copy(m.content) });
  (m.attachments || []).filter(isImg).slice(0,1).forEach(a => items.push({ label:'Abrir imagem original', icon: ic('expand',18), onClick: () => window.open(a.url, '_blank', 'noopener') }));
  if(mine || mod) items.push('-', { label:'Apagar mensagem', icon: ic('trash',18), danger:true, onClick: () => deleteMsg(m) });
  menu(x, y, items, 'mmenu');
}
async function deleteMsg(m, skipConfirm){
  if(!skipConfirm && !(await confirmBox('Apagar mensagem', 'Tem certeza? Dica: segure <b>Shift</b> ao clicar na lixeira para apagar sem perguntar.', 'Apagar'))) return;
  const { error } = await App.sb.from('messages').delete().eq('id', m.id);
  if(error){ App.toast(error.message, true); return; }
  App.onMsgDelete(m.id);
}
async function pinMsg(m){
  const { error } = await App.sb.rpc('pin_message', { p_id: m.id, p_pin: !m.pinned });
  if(error){ App.toast(error.message, true); return; }
  m.pinned = !m.pinned; App.onMsgUpdate({ ...m }); App.toast(m.pinned ? 'Mensagem fixada 📌' : 'Mensagem desafixada');
}
function bindEditor(){
  const ed = $('#edBox'); if(!ed) return;
  ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
  ed.style.height = 'auto'; ed.style.height = ed.scrollHeight + 'px';
  ed.oninput = () => { ed.style.height = 'auto'; ed.style.height = ed.scrollHeight + 'px'; };
  ed.onkeydown = e => {
    if(e.key === 'Escape'){ M.editing = null; rerenderOne(); }
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); saveEdit(); }
  };
}
async function saveEdit(){
  const ed = $('#edBox'); if(!ed) return;
  const v = ed.value.trim(), id = M.editing; M.editing = null;
  const old = M.list.find(x => x.id === id);
  if(old && !v && !(old.attachments || []).length){ rerenderOne(); deleteMsg(old); return; }
  if(old && v !== old.content){
    old.content = v; old.edited_at = new Date().toISOString();
    const { error } = await App.sb.from('messages').update({ content: v }).eq('id', id);
    if(error) App.toast(error.message, true);
  }
  rerenderOne();
}
async function jumpTo(mid){
  const node = M.el && M.el.querySelector(`[data-m="${mid}"]`);
  if(node){ node.scrollIntoView({ block:'center', behavior:'smooth' }); node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash'); return; }
  const { data: target } = await App.sb.from('messages').select('*').eq('id', mid).maybeSingle();
  if(!target || target.channel_id !== M.cid){ App.toast('Mensagem não encontrada.', true); return; }
  const [{ data: before }, { data: after }] = await Promise.all([
    App.sb.from('messages').select('*').eq('channel_id', M.cid).lt('created_at', target.created_at).order('created_at', { ascending:false }).limit(25),
    App.sb.from('messages').select('*').eq('channel_id', M.cid).gt('created_at', target.created_at).order('created_at').limit(25),
  ]);
  M.list = (before || []).reverse().concat([target], after || []);
  M.done = (before || []).length < 25; M.detached = (after || []).length >= 25;
  await hydrate(M.list);
  renderMsgList(false);
  const n = M.el.querySelector(`[data-m="${mid}"]`); if(n){ n.scrollIntoView({ block:'center' }); n.classList.add('flash'); }
}

/* ---------- visualizador de imagens ---------- */
function lightbox(mid, idx){
  const m = M.list.find(x => x.id === mid); if(!m) return;
  const imgs = (m.attachments || []).filter(a => isImg(a));
  let i = idx;
  const el = document.createElement('div'); el.className = 'lightbox';
  const draw = () => {
    const a = imgs[i];
    el.innerHTML = `<div class="lbbar"><span>${esc(prof(m.author_id).display_name)} · ${fmtTime(m.created_at)}</span><span class="grow"></span>
      <a href="${esc(a.url)}" target="_blank" rel="noopener" download title="Baixar">${ic('download',20)}</a><a href="${esc(a.url)}" target="_blank" rel="noopener" title="Abrir original">${ic('expand',20)}</a><button data-x title="Fechar">${ic('x',22)}</button></div>
      ${imgs.length > 1 ? `<button class="lbnav l" data-p>${ic('chevLeft',28)}</button><button class="lbnav r" data-n>${ic('chevRight',28)}</button>` : ''}
      <img src="${esc(a.url)}" alt="" ${a.thumb?`style="background-image:url('${a.thumb}')"`:''}>
      ${imgs.length > 1 ? `<div class="lbcount">${i+1} / ${imgs.length}</div>` : ''}`;
  };
  draw(); document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 180); document.removeEventListener('keydown', key); };
  const key = e => { if(e.key === 'Escape') close(); if(e.key === 'ArrowRight' && imgs.length > 1){ i = (i+1) % imgs.length; draw(); } if(e.key === 'ArrowLeft' && imgs.length > 1){ i = (i-1+imgs.length) % imgs.length; draw(); } };
  document.addEventListener('keydown', key);
  el.onclick = e => {
    if(e.target.closest('[data-x]') || e.target === el) close();
    else if(e.target.closest('[data-n]')){ i = (i+1) % imgs.length; draw(); }
    else if(e.target.closest('[data-p]')){ i = (i-1+imgs.length) % imgs.length; draw(); }
  };
}

/* ---------- mensagem de voz: player ---------- */
let voiceAudio = null, voiceEl = null;
function playVoice(el){
  if(voiceEl === el && voiceAudio){ if(voiceAudio.paused) voiceAudio.play(); else voiceAudio.pause(); return; }
  if(voiceAudio){ voiceAudio.pause(); voiceEl && voiceEl.classList.remove('playing'); }
  voiceEl = el; voiceAudio = new Audio(el.dataset.voice);
  const bars = [...el.querySelectorAll('.vwave i')], btn = el.querySelector('.vplay'), tm = el.querySelector('.vtime');
  const dur = +el.dataset.dur || 0;
  voiceAudio.ontimeupdate = () => {
    const d = isFinite(voiceAudio.duration) ? voiceAudio.duration : dur, f = d ? voiceAudio.currentTime / d : 0;
    bars.forEach((b, k) => b.classList.toggle('on', k / bars.length <= f));
    tm.textContent = fmtDur(voiceAudio.currentTime);
  };
  voiceAudio.onplay = () => { btn.innerHTML = ic('pause',16); el.classList.add('playing'); };
  voiceAudio.onpause = () => { btn.innerHTML = ic('play',16); };
  voiceAudio.onended = () => { btn.innerHTML = ic('play',16); bars.forEach(b => b.classList.remove('on')); tm.textContent = fmtDur(dur); el.classList.remove('playing'); };
  voiceAudio.play().catch(() => App.toast('Não deu para tocar esse áudio.', true));
}

/* ---------- compositor ---------- */
function bindComposer(ch){
  const ta = $('#cmp'), form = $('#cmpF');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight) + 'px'; };
  ta.oninput = () => { grow(); sendTyping(); autocomplete(); };
  ta.onkeydown = e => {
    if(acKey(e)) return;
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()){ e.preventDefault(); form.requestSubmit(); }
    if(e.key === 'ArrowUp' && !ta.value){ const last = [...M.list].reverse().find(m => m.author_id === S.me.id && !m._sending); if(last){ e.preventDefault(); M.editing = last.id; rerenderOne(); } }
    if(e.key === 'Escape' && M.replyTo){ cancelReply(); }
  };
  ta.onpaste = e => {
    const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if(files.length){ e.preventDefault(); addFiles(files); }
  };
  form.onsubmit = e => { e.preventDefault(); sendMessage(); };
  $('#cAttach').onclick = () => $('#cFile').click();
  $('#cFile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#cEmoji').onclick = () => { const r = $('#cEmoji').getBoundingClientRect(); emojiPicker(r.right - 340, r.top, em => insertAtCaret(ta, em), true); };
  $('#cVoice').onclick = startRecording;
  // arrastar e soltar
  const zone = $('#mainBody'), dz = $('#dropZone');
  let depth = 0;
  zone.ondragenter = e => { if(!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); depth++; dz.classList.remove('hidden'); };
  zone.ondragover = e => { if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  zone.ondragleave = () => { if(--depth <= 0){ depth = 0; dz.classList.add('hidden'); } };
  zone.ondrop = e => { e.preventDefault(); depth = 0; dz.classList.add('hidden'); if(e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); };
  $('#jumpBtn').onclick = () => { if(M.detached){ M.newWhileAway = 0; loadLatest(); } else { M.newWhileAway = 0; toBottom(); updateJump(); } };
  if(!isMobile()) setTimeout(() => ta.focus(), 30);
}
function insertAtCaret(ta, text){
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus(); ta.dispatchEvent(new Event('input'));
}
function startReply(mid){
  const m = M.list.find(x => x.id === mid); if(!m) return;
  M.replyTo = mid;
  const bar = $('#replyBar'); bar.classList.remove('hidden');
  bar.innerHTML = `<span>Respondendo a <b>${esc(prof(m.author_id).display_name)}</b></span><button id="rbX" title="Cancelar">${ic('x',16)}</button>`;
  $('#rbX').onclick = cancelReply; $('#cmp').focus();
}
function cancelReply(){ M.replyTo = null; const b = $('#replyBar'); if(b){ b.classList.add('hidden'); b.innerHTML = ''; } }

/* ---------- digitando… ---------- */
function sendTyping(){
  if(!M.typingCh || Date.now() - M.lastTypingSent < 2500 || !$('#cmp').value) return;
  M.lastTypingSent = Date.now();
  M.typingCh.send({ type:'broadcast', event:'t', payload:{ u: S.me.id } }).catch(()=>{});
}
function onTyping(pl){
  if(!pl || pl.u === S.me.id) return;
  clearTimeout(M.typing.get(pl.u));
  M.typing.set(pl.u, setTimeout(() => { M.typing.delete(pl.u); renderTyping(); }, 4000));
  ensureProfiles([pl.u]).then(renderTyping);
}
function renderTyping(){
  const el = $('#typingLine'); if(!el) return;
  const names = [...M.typing.keys()].map(u => `<b>${esc(prof(u).display_name)}</b>`);
  el.innerHTML = !names.length ? '' : `<span class="tdots"><i></i><i></i><i></i></span>` + (names.length === 1 ? `${names[0]} está digitando…` : names.length <= 3 ? `${names.slice(0,-1).join(', ')} e ${names[names.length-1]} estão digitando…` : 'Várias pessoas estão digitando…');
}

/* ---------- anexos: comprimir e enviar ---------- */
const maxUpload = () => (hasPlus(S.me) ? 25 : 10) * 1024 * 1024;
function addFiles(files){
  for(const f of files){
    if(M.files.length >= 10){ App.toast('No máximo 10 arquivos por mensagem.', true); break; }
    if(f.size > maxUpload()){ App.toast(`"${f.name}" passa de ${hasPlus(S.me)?25:10} MB.${hasPlus(S.me)?'':' Com o Telão+ vai até 25 MB.'}`, true); continue; }
    M.files.push({ file: f, preview: /^(image|video)\//.test(f.type) ? URL.createObjectURL(f) : null, spoiler: false });
  }
  drawFiles();
  $('#cmp') && $('#cmp').focus();
}
function drawFiles(){
  const el = $('#fileStrip'); if(!el) return;
  el.classList.toggle('hidden', !M.files.length);
  el.innerHTML = M.files.map((f, i) => `<div class="fthumb ${f.spoiler?'sp':''}">
      ${f.preview && /^image/.test(f.file.type) ? `<img src="${f.preview}" alt="">` : f.preview ? `<video src="${f.preview}" muted></video>` : `<div class="fic">${ic('file',30)}</div>`}
      <span class="fname">${esc(f.file.name)}</span>
      <div class="ftools">${/^image/.test(f.file.type) ? `<button data-fsp="${i}" title="Marcar como spoiler">${ic(f.spoiler?'eye':'eyeOff',15)}</button>` : ''}<button data-frm="${i}" title="Remover">${ic('trash',15)}</button></div></div>`).join('');
  el.querySelectorAll('[data-frm]').forEach(b => b.onclick = () => { const f = M.files.splice(+b.dataset.frm, 1)[0]; f.preview && URL.revokeObjectURL(f.preview); drawFiles(); });
  el.querySelectorAll('[data-fsp]').forEach(b => b.onclick = () => { M.files[+b.dataset.fsp].spoiler = !M.files[+b.dataset.fsp].spoiler; drawFiles(); });
}
/* reduz a imagem (máx. 1920px, WebP) e cria uma miniatura minúscula para carregar instantâneo */
async function compressImage(file){
  if(!/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) {
    const dim = await imgDims(file).catch(() => ({}));
    return { blob: file, type: file.type, ...dim, thumb: await tinyThumb(file).catch(() => null) };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.82));
  if(!blob || blob.type !== 'image/webp') blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
  if(blob.size > file.size && scale === 1){ blob = file; }
  const t = document.createElement('canvas'); const tw = 24, th = Math.max(1, Math.round(24 * h / w));
  t.width = tw; t.height = th; t.getContext('2d').drawImage(bmp, 0, 0, tw, th);
  bmp.close && bmp.close();
  return { blob, type: blob.type, w, h, thumb: t.toDataURL('image/jpeg', 0.5) };
}
function imgDims(file){ return new Promise((res, rej) => { const i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(i.src); }; i.onerror = rej; i.src = URL.createObjectURL(file); }); }
async function tinyThumb(file){
  const bmp = await createImageBitmap(file); const t = document.createElement('canvas');
  t.width = 24; t.height = Math.max(1, Math.round(24 * bmp.height / bmp.width)); t.getContext('2d').drawImage(bmp, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.5);
}
function vidDims(file){ return new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(v.src); }; v.onerror = () => res({}); v.src = URL.createObjectURL(file); }); }
async function uploadOne(f){
  let blob = f.file, meta = { name: f.file.name, type: f.file.type || 'application/octet-stream', size: f.file.size };
  if(/^image\//.test(f.file.type)){ try{ const c = await compressImage(f.file); blob = c.blob; Object.assign(meta, { type: c.type, w: c.w, h: c.h, thumb: c.thumb, size: c.blob.size }); }catch(e){} }
  else if(/^video\//.test(f.file.type)){ Object.assign(meta, await vidDims(f.file)); }
  if(f.voice) Object.assign(meta, { voice: true, dur: f.dur, wave: f.wave });
  if(f.spoiler) meta.spoiler = true;
  const ext = (meta.type.split('/')[1] || 'bin').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'').slice(0,5) || 'bin';
  const base = (f.file.name || 'arquivo').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40) || 'arquivo';
  const path = `${S.me.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}-${base}.${ext}`;
  const { error } = await App.sb.storage.from('attachments').upload(path, blob, { contentType: meta.type, cacheControl: '31536000', upsert: false });
  if(error) throw error;
  meta.url = App.sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
  return meta;
}
async function sendMessage(extraFiles){
  const ta = $('#cmp'); if(!ta) return;
  let content = ta.value.trim().replace(/:([a-z0-9_]{2,30}):/g, (m, k) => EMOJI.BY[k] || m);
  let cmdAtt = null;
  if(!extraFiles && content.startsWith('/')){
    const r = runCommand(content);
    if(r && r.error){ App.toast(r.error, true); return; }
    if(r){ content = r.content; cmdAtt = r.attachments || null; if(r.fx){ (M._fxDone = M._fxDone || new Set()); } }
  }
  const files = extraFiles || (cmdAtt ? [] : M.files.splice(0));
  if(!content && !files.length && !cmdAtt) return;
  const reply_to = M.replyTo, ch = M.ch;
  if(!extraFiles){ ta.value = ''; ta.style.height = 'auto'; cancelReply(); drawFiles(); }
  // mensagem otimista: aparece na hora, com as imagens locais
  const tmpId = 'tmp-' + Math.random().toString(36).slice(2);
  const temp = { id: tmpId, _sending: true, channel_id: ch.id, author_id: S.me.id, content, reply_to, created_at: new Date().toISOString(), pinned: false,
                 attachments: cmdAtt ? cmdAtt : files.map(f => ({ url: f.preview || '', name: f.file.name, type: f.file.type, size: f.file.size, _local: !!f.preview, voice: f.voice, dur: f.dur, wave: f.wave })) };
  M.list.push(temp); appendMessage(temp);
  try{
    const attachments = cmdAtt || await Promise.all(files.map(uploadOne));
    const { data, error } = await App.sb.from('messages').insert({ channel_id: ch.id, content, attachments, reply_to }).select().single();
    if(error) throw error;
    data._tmpOf = tmpId; addMessage(data);
    if(ch.kind === 'dm'){ S.dmActivity[ch.id] = data.created_at; ls.set('telao-dmact', S.dmActivity); }
  }catch(err){
    const i = M.list.findIndex(x => x.id === tmpId); if(i >= 0) M.list.splice(i, 1);
    renderMsgList(false);
    App.toast('Não foi enviada: ' + (err.message || err), true);
    if(!extraFiles){ ta.value = content; M.files = files; drawFiles(); }
  }
}

/* ---------- gravação de mensagem de voz ---------- */
async function startRecording(){
  if(M.rec) return;
  if(!window.MediaRecorder){ App.toast('Seu navegador não grava áudio.', true); return; }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } }); }
  catch(e){ App.toast('Sem acesso ao microfone.', true); return; }
  const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {});
  const chunks = [], peaks = [];
  const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
  const t0 = Date.now();
  M.rec = { rec, stream, ctx, chunks, peaks, t0, cancel:false };
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start(250);
  const bar = $('#recBar'); bar.classList.remove('hidden'); $('#cmpF').classList.add('hidden');
  bar.innerHTML = `<button class="cbtn2" id="recX" title="Descartar">${ic('trash',20)}</button><span class="recdot"></span><span id="recT">0:00</span><div class="recwave" id="recW"></div><button class="btn sm" id="recOk">${ic('send',16)} Enviar</button>`;
  $('#recX').onclick = () => stopRecording(true);
  $('#recOk').onclick = () => stopRecording(false);
  M.rec.timer = setInterval(() => {
    an.getByteTimeDomainData(buf); let pk = 0; for(const v of buf) pk = Math.max(pk, Math.abs(v - 128));
    peaks.push(pk);
    const tEl = $('#recT'); if(tEl) tEl.textContent = fmtDur((Date.now() - t0) / 1000);
    const w = $('#recW'); if(w) w.innerHTML = peaks.slice(-60).map(p => `<i style="height:${Math.max(3, Math.min(26, p / 2.5))}px"></i>`).join('');
    if(Date.now() - t0 > 5 * 60 * 1000) stopRecording(false);
  }, 100);
}
function stopRecording(cancel){
  const R = M.rec; if(!R) return; M.rec = null;
  clearInterval(R.timer);
  const bar = $('#recBar'); if(bar){ bar.classList.add('hidden'); bar.innerHTML = ''; } const f = $('#cmpF'); if(f) f.classList.remove('hidden');
  R.rec.onstop = () => {
    R.stream.getTracks().forEach(t => t.stop()); R.ctx.close().catch(()=>{});
    if(cancel) return;
    const dur = (Date.now() - R.t0) / 1000;
    if(dur < 0.7){ App.toast('Áudio muito curto.'); return; }
    const type = (R.rec.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(R.chunks, { type });
    const n = 40, step = Math.max(1, Math.floor(R.peaks.length / n));
    const wave = Array.from({ length: n }, (_, i) => Math.round(Math.max(...R.peaks.slice(i*step, i*step+step).concat([2])) / 2.2));
    const file = new File([blob], 'mensagem-de-voz.' + (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'), { type });
    sendMessage([{ file, preview: null, voice: true, dur, wave }]);
  };
  R.rec.stop();
}

/* ---------- autocompletar @menções e :emojis: ---------- */
let AC = null;
function autocomplete(){
  const ta = $('#cmp'), pop = $('#acPop'); if(!ta || !pop) return;
  const before = ta.value.slice(0, ta.selectionStart);
  let m, items = [];
  if((m = before.match(/^\/(\w*)$/))){
    const q = m[1].toLowerCase();
    items = CMDS.filter(c => c[0].startsWith(q)).map(c => ({ html: `<span class="acem">${c[3]}</span><b>/${c[0]}</b> <small>${esc(c[1])}</small><small class="acd">${esc(c[2])}</small>`, ins: '/' + c[0] + ' ', len: m[1].length + 1, cmd: true }));
  } else if((m = before.match(/(?:^|\s)@([a-z0-9_]{0,24})$/i))){
    const q = m[1].toLowerCase();
    const pool = M.ch.kind === 'dm' ? [S.me.id, dmOther(M.ch)] : (S.members.get(M.ch.server_id) || []).map(x => x.user_id);
    items = pool.map(prof).filter(p => p.username.includes(q) || p.display_name.toLowerCase().includes(q)).slice(0, 8)
      .map(p => ({ html: `${avatar(p,'xs')}<b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small>`, ins: '@' + p.username + ' ', len: m[1].length + 1 }));
    if(M.ch.kind !== 'dm' && 'todos'.startsWith(q)) items.push({ html: `<span class="acic">${ic('at',16)}</span><b>@todos</b><small>Notifica todo mundo</small>`, ins: '@todos ', len: m[1].length + 1 });
  } else if((m = before.match(/:([a-z0-9_]{2,30})$/i))){
    const q = m[1].toLowerCase();
    items = EMOJI.LIST.filter(e => e.names.some(n => n.startsWith(q))).slice(0, 8)
      .map(e => ({ html: `<span class="acem">${e.ch}</span><b>:${esc(e.names.find(n => n.startsWith(q)))}:</b>`, ins: e.ch, len: m[1].length + 1 }));
  }
  if(!items.length){ pop.classList.add('hidden'); AC = null; return; }
  AC = { items, i: 0 };
  drawAC();
}
function drawAC(){
  const pop = $('#acPop');
  pop.innerHTML = `<div class="achead">${AC.items[0].cmd ? 'Comandos' : AC.items[0].ins.startsWith('@') ? 'Membros' : 'Emojis'}</div>` + AC.items.map((it, k) => `<div class="acit ${k===AC.i?'on':''}" data-k="${k}">${it.html}</div>`).join('');
  pop.classList.remove('hidden');
  pop.querySelectorAll('[data-k]').forEach(el => el.onmousedown = e => { e.preventDefault(); AC.i = +el.dataset.k; pickAC(); });
}
function pickAC(){
  const ta = $('#cmp'), it = AC.items[AC.i];
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0, pos - it.len) + it.ins + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos - it.len + it.ins.length;
  AC = null; $('#acPop').classList.add('hidden'); ta.focus();
}
function acKey(e){
  if(!AC) return false;
  if(e.key === 'ArrowDown'){ e.preventDefault(); AC.i = (AC.i + 1) % AC.items.length; drawAC(); return true; }
  if(e.key === 'ArrowUp'){ e.preventDefault(); AC.i = (AC.i - 1 + AC.items.length) % AC.items.length; drawAC(); return true; }
  if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); pickAC(); return true; }
  if(e.key === 'Escape'){ AC = null; $('#acPop').classList.add('hidden'); return true; }
  return false;
}

/* ---------- seletor de emojis ---------- */
function pushRecent(e){ const r = ls.get('telao-recent-emoji', []).filter(x => x !== e); r.unshift(e); ls.set('telao-recent-emoji', r.slice(0, 24)); }
function emojiPicker(x, y, onPick, keepOpen){
  closeMenu();
  const el = $('#menu'); el.className = 'menu epick';
  const recent = ls.get('telao-recent-emoji', []);
  const cats = (recent.length ? ['Recentes'] : []).concat(EMOJI.CATS);
  const catIcon = { 'Recentes':'🕘','Rostos':'😀','Gestos':'👋','Coração':'❤️','Pessoas':'🧑','Animais':'🐶','Comidas':'🍕','Atividades':'⚽','Objetos':'💡','Símbolos':'✅' };
  el.innerHTML = `<div class="ephead"><input id="epQ" placeholder="Procurar emoji" autocomplete="off"></div>
    <div class="epcats">${cats.map(c => `<button data-cat="${c}" title="${c}">${catIcon[c] || '•'}</button>`).join('')}</div>
    <div class="epgrid" id="epGrid"></div><div class="epfoot" id="epFoot">Escolha um emoji</div>`;
  const grid = el.querySelector('#epGrid');
  const draw = q => {
    if(q){ const r = EMOJI.LIST.filter(e => e.names.some(n => n.includes(q))); grid.innerHTML = r.length ? `<div class="epcat">Resultados</div><div class="eps">${r.map(e => `<button data-e="${e.ch}" data-n="${esc(e.names[0])}">${e.ch}</button>`).join('')}</div>` : '<div class="empty" style="padding:30px">Nada encontrado</div>'; return; }
    grid.innerHTML = cats.map(c => {
      const list = c === 'Recentes' ? recent.map(ch => ({ ch, names:[''] })) : EMOJI.LIST.filter(e => e.cat === c);
      return `<div class="epcat" id="ep-${c}">${c}</div><div class="eps">${list.map(e => `<button data-e="${e.ch}" data-n="${esc(e.names[0])}">${e.ch}</button>`).join('')}</div>`;
    }).join('');
  };
  draw('');
  el.classList.remove('hidden');
  const w = 352, h = 420;
  el.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y - h - 8, innerHeight - h - 8)) + 'px';
  const q = el.querySelector('#epQ'); setTimeout(() => q.focus(), 20);
  q.oninput = () => draw(q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { q.value = ''; draw(''); const t = el.querySelector('#ep-' + CSS.escape(b.dataset.cat)); t && grid.scrollTo({ top: t.offsetTop - grid.offsetTop, behavior:'smooth' }); });
  grid.onmouseover = e => { const b = e.target.closest('[data-e]'); if(b) el.querySelector('#epFoot').innerHTML = `<span style="font-size:22px">${b.dataset.e}</span> :${b.dataset.n}:`; };
  grid.onclick = e => {
    const b = e.target.closest('[data-e]'); if(!b) return;
    pushRecent(b.dataset.e); onPick(b.dataset.e);
    if(!(keepOpen && e.shiftKey)) closeMenu();
  };
  q.onkeydown = e => { if(e.key === 'Enter'){ const b = grid.querySelector('[data-e]'); b && b.click(); } if(e.key === 'Escape') closeMenu(); };
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}

/* ---------- fixadas e busca ---------- */
async function showPins(anchor){
  const r = anchor.getBoundingClientRect();
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', M.cid).eq('pinned', true).order('created_at', { ascending:false }).limit(50);
  await ensureProfiles((data || []).map(m => m.author_id));
  const el = $('#menu'); el.className = 'menu panelpop';
  el.innerHTML = `<div class="pphead">${ic('pin',18)} Mensagens fixadas</div><div class="ppbody">${(data || []).length ? data.map(m => `<div class="ppit" data-goto="${m.id}">${avatar(prof(m.author_id),'sm')}<div><b>${esc(prof(m.author_id).display_name)}</b> <small>${fmtTime(m.created_at)}</small><div class="ppct">${m.content ? richText(m.content.slice(0, 300)) : ic('image',14) + ' Anexo'}</div></div></div>`).join('')
    : `<div class="empty">${ic('pin',36)}<br>Nenhuma mensagem fixada ainda.<br><small>Clique com o botão direito numa mensagem → Fixar.</small></div>`}</div>`;
  openPanel(el, r);
}
async function showSearch(anchor){
  const r = anchor.getBoundingClientRect();
  const el = $('#menu'); el.className = 'menu panelpop';
  el.innerHTML = `<div class="pphead"><div class="sbox">${ic('search',16)}<input id="srQ" placeholder="Buscar nesta conversa" autocomplete="off"></div></div><div class="ppbody" id="srR"><div class="empty">Digite para buscar mensagens.</div></div>`;
  openPanel(el, r);
  const q = el.querySelector('#srQ'); setTimeout(() => q.focus(), 20);
  let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const v = q.value.trim().replace(/[%_]/g, ''); const box = el.querySelector('#srR');
    if(v.length < 2){ box.innerHTML = '<div class="empty">Digite pelo menos 2 letras.</div>'; return; }
    box.innerHTML = '<div class="loadmore"><div class="spin"></div></div>';
    const { data } = await App.sb.from('messages').select('*').eq('channel_id', M.cid).ilike('content', `%${v}%`).order('created_at', { ascending:false }).limit(30);
    await ensureProfiles((data || []).map(m => m.author_id));
    const hl = s => esc(s).replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), x => `<mark>${x}</mark>`);
    box.innerHTML = (data || []).length ? `<div class="srcount">${data.length}${data.length===30?'+':''} resultado(s)</div>` + data.map(m => `<div class="ppit" data-goto="${m.id}">${avatar(prof(m.author_id),'sm')}<div><b>${esc(prof(m.author_id).display_name)}</b> <small>${fmtTime(m.created_at)}</small><div class="ppct">${hl(m.content.slice(0, 300))}</div></div></div>`).join('') : '<div class="empty">Nada encontrado.</div>';
    bindGoto(el);
  }, 280); };
}
function openPanel(el, r){
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.right - 420, innerWidth - 428)) + 'px';
  el.style.top = (r.bottom + 8) + 'px';
  bindGoto(el);
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}
function bindGoto(el){ el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { closeMenu(); jumpTo(b.dataset.goto); }); }
/* ---------------- chamadas de voz ---------------- */
async function joinVoice(ch){
  if(Voice.channel && Voice.channel.id === ch.id) return;
  const topic = topicFor(ch);
  const pch = vpChannel(topic);
  await pch._ready;
  if(!navigator.mediaDevices){ App.toast('Seu navegador não suporta chamadas. Use Chrome, Edge ou Safari atualizado.', true); return; }
  await Voice.join(ch, pch, topic);
  Voice.joinedAt = Date.now();
  App.sfx('selfjoin');
  if(ch.kind === 'dm'){
    const other = dmOther(ch);
    const there = voiceUsers(ch).some(m => m.user_id === other);
    if(!there) sendToUser(other, 'ring', { channel_id: ch.id, from: S.me.id });
    if(S.route.kind === 'home' && S.route.dm === ch.id) renderMain(true);
  }
}
async function leaveVoice(){
  const ch = Voice.channel; if(!ch) return;
  if(ch.kind === 'dm') sendToUser(dmOther(ch), 'ring-cancel', { channel_id: ch.id, from: S.me.id });
  await Voice.leave();
  App.sfx('leave');
  S.videoEls.forEach(v => { v.srcObject = null; }); S.videoEls.clear();
  if(S.route.kind === 'home' && S.route.dm === ch.id) renderMain(true);
}
const userChs = new Map();
function sendToUser(uid, event, payload){
  let rec = userChs.get(uid);
  const doSend = ch => ch.send({ type:'broadcast', event, payload }).catch(()=>{});
  if(rec){ rec.ready.then(() => doSend(rec.ch)); clearTimeout(rec.t); rec.t = setTimeout(() => { App.sb.removeChannel(rec.ch); userChs.delete(uid); }, 15000); return; }
  const ch = App.sb.channel('user:'+uid);
  rec = { ch, ready: new Promise(res => ch.subscribe(st => { if(st === 'SUBSCRIBED') res(); })) };
  rec.t = setTimeout(() => { App.sb.removeChannel(ch); userChs.delete(uid); }, 15000);
  userChs.set(uid, rec);
  rec.ready.then(() => doSend(ch));
}

/* toque de chamada */
let ringTimer = null;
async function onRing(pl){
  if(Voice.channel && Voice.channel.id === pl.channel_id) return;
  if(!S.dms.find(d => d.id === pl.channel_id)) await loadDms();
  await ensureProfiles([pl.from]);
  const d = S.dms.find(x => x.id === pl.channel_id); if(!d) return;
  const p = prof(pl.from);
  S.ringing = pl;
  const el = $('#ring');
  el.innerHTML = `${avatar(p,'xl')}<b class="rgname">${esc(p.display_name)}</b><div class="rgsub">está te ligando…</div>
    <div class="bt"><button class="rgb no" id="rgNo" data-tip="Recusar">${ic('phoneOff',24)}</button><button class="rgb yes" id="rgYes" data-tip="Atender">${ic('phone',24)}</button></div>`;
  el.classList.remove('hidden');
  $('#rgYes').onclick = () => { stopRing(); go({ kind:'home', dm: d.id }); joinVoice(d); };
  $('#rgNo').onclick = () => { stopRing(); sendToUser(pl.from, 'ring-decline', { channel_id: d.id, from: S.me.id }); };
  clearInterval(ringTimer); App.sfx('ring'); ringTimer = setInterval(() => App.sfx('ring'), 2200);
  setTimeout(() => { if(S.ringing === pl) stopRing(); }, 35000);
  if(P.notifCall) notify(p.display_name + ' está te ligando', 'Abra o Telão para atender', d.id);
}
function stopRing(){ S.ringing = null; clearInterval(ringTimer); $('#ring').classList.add('hidden'); }

function onVoiceChange(){ renderVoicePanel(); renderUserPanel(); renderStage(); renderRail(); }
function onSpeaking(){
  $$('[data-sess]').forEach(el => el.classList.toggle('speak', Voice.speaking.has(el.dataset.sess)));
}

/* ---------------- palco: participantes, câmeras e telas ---------------- */
let statTimer = null;
function stageChannel(){
  const r = S.route;
  if(r.kind === 'home' && r.dm) return { ch: S.dms.find(d => d.id === r.dm), compact: true };
  if(r.kind === 'server') return { ch: (S.channels.get(r.sid) || []).find(c => c.id === r.cid && c.kind === 'voice'), compact: false };
  return {};
}
function getVideoEl(stream, mirror){
  let v = S.videoEls.get(stream.id);
  if(!v){ v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = true; S.videoEls.set(stream.id, v); }
  if(v.srcObject !== stream) v.srcObject = stream;
  v.classList.toggle('mirror', !!mirror);
  return v;
}
function renderStage(){
  const wrap = $('#stageWrap'); if(!wrap) return;
  const { ch, compact } = stageChannel();
  if(!ch){ wrap.innerHTML = ''; return; }
  const users = voiceUsers(ch);
  const inThis = Voice.channel && Voice.channel.id === ch.id;
  clearInterval(statTimer);
  if(compact && !inThis && !users.length){ wrap.innerHTML = ''; return; }

  if(!inThis){
    wrap.innerHTML = `<div class="stage ${compact?'compact':''}"><div class="joincard">
      <div class="jicon">${ic(ch.kind==='dm'?'phone':'volume',34)}</div>
      <h2>${ch.kind==='dm' ? 'Chamada em andamento' : esc(ch.name)}</h2>
      <div class="avs">${users.map(u => avatar(prof(u.user_id),'lg')).join('')}</div>
      <p>${users.length ? users.map(u => esc(prof(u.user_id).display_name)).join(', ') + (users.length>1?' estão':' está') + ' aqui' : 'Ninguém aqui ainda. Entre e chame a galera!'}</p>
      <div class="jbtns"><button class="btn ok big" id="stJoin">${ic('phone',18)} ${ch.kind==='dm' ? 'Entrar na chamada' : 'Entrar no canal de voz'}</button></div></div></div>`;
    $('#stJoin').onclick = () => joinVoice(ch);
    return;
  }

  const screens = Voice.screens(), cams = Voice.cams();
  const wt = WT.active && WT.channel === ch.id;
  const focusables = (wt ? [{ id:'wt' }] : []).concat(screens.map(s => ({ id:'s:' + s.session, s })));
  let focused = focusables.find(f => f.id === S.focus) || focusables[0] || null;
  if(focused) S.focus = focused.id;
  const camOf = sess => cams.find(c => c.session === sess);
  const tileOf = u => {
    const p = prof(u.user_id), cam = camOf(u.session), me = u.session === Voice.SESSION;
    return `<div class="tile ${cam?'hascam':''}" data-sess="${u.session}" data-vuser="${u.user_id}" style="--avc:${esc(p.avatar_color)}">
      ${cam ? `<div class="vslot" data-stream="${cam.stream.id}" data-mirror="${me?1:0}"></div>` : `<div class="tbg" ${p.banner_url && hasPlus(p) ? `style="background-image:url('${esc(p.banner_url)}')"` : ''}></div>${avatar(p)}`}
      <span class="nm">${u.deafened ? ic('headphonesOff',14) : u.muted ? ic('micOff',14) : ''}${esc(p.display_name)}${me?' (você)':''}</span>
      ${u.sharing ? (me ? '<span class="live tl">AO VIVO</span>' : `<button class="watchbtn" data-focus="s:${u.session}">${ic('eye',15)} Assistir</button>`) : ''}</div>`;
  };
  const scrTile = s => `<div class="tile scr ${focused && focused.id === 's:' + s.session ? 'on' : ''}" data-focus="s:${s.session}"><div class="vslot" data-stream="${s.stream.id}"></div><span class="nm">${ic('monitor',14)} ${esc(s.mine ? 'Sua tela' : prof(s.user_id).display_name)}</span></div>`;

  let area;
  if(focused){
    const f = focused;
    const strip = focusables.filter(x => x !== f).map(x => x.id === 'wt' ? `<div class="tile scr wtt" data-focus="wt">${ic('tv',28)}<span class="nm">Assistir juntos</span></div>` : scrTile(x.s)).join('') + users.map(tileOf).join('');
    const main = f.id === 'wt'
      ? `<div class="focus wtfocus" id="focusBox"><div id="wtPlayer"></div><div class="wtbar"><span>${ic('tv',16)} Assistindo juntos · ${esc(WT.title || 'YouTube')}</span><span class="grow"></span><button id="wtChange">${ic('refresh',16)} Trocar vídeo</button><button id="wtStop">${ic('x',16)} Encerrar</button></div></div>`
      : `<div class="focus" id="focusBox"><div class="vslot" data-stream="${f.s.stream.id}"></div><canvas class="drawlayer ${DRAW.on?'on':''}" id="drawCv"></canvas>
          <span class="stats" id="stStats"></span>
          <span class="lbl">${ic('monitor',14)} ${esc(f.s.mine ? 'Sua tela (prévia)' : 'Tela de ' + prof(f.s.user_id).display_name)} ${f.s.mine ? '' : (f.s.stream.getAudioTracks().length ? ic('volume',14) : `<span class="noaud">${ic('micOff',13)} sem áudio</span>`)}</span>
          <span class="tools">
            <button id="stDraw" data-tip="Desenhar na tela (todos veem)" class="${DRAW.on?'on':''}">${ic('pen',18)}</button>
            <button id="stCine" data-tip="Modo cinema">${ic('film',18)}</button>
            <button id="stShot" data-tip="Tirar print">${ic('camera',18)}</button>
            <button id="stRec" data-tip="${REC.on ? 'Parar gravação' : 'Gravar'}" class="${REC.on?'rec':''}">${ic(REC.on?'stop':'record',18)}${REC.on ? '<span id="recTime">0:00</span>' : ''}</button>
            ${document.pictureInPictureEnabled ? `<button id="stPip" data-tip="Janela flutuante">${ic('pip',18)}</button>` : ''}
            <button id="stFs" data-tip="Tela cheia">${ic('maximize',18)}</button></span></div>`;
    area = `${main}<div class="tiles strip">${strip}</div>`;
  } else {
    area = `<div class="tiles grid n${Math.min(users.length, 9)}">${users.map(tileOf).join('')}</div>`;
  }
  const muted = Voice.muted || Voice.deafened;
  wrap.innerHTML = `<div class="stage ${compact?'compact':''}"><div class="area" id="stArea">${area}</div><div class="fxlayer" id="fxLayer"></div>
    <div class="stagebar">
      <div class="sbg">
        <button class="cbtn ${muted?'off':''}" id="sbMic" data-tip="${muted?'Ativar microfone':'Silenciar'}">${ic(muted?'micOff':'mic',22)}</button>
        <button class="cbtn ${Voice.deafened?'off':''}" id="sbDeaf" data-tip="${Voice.deafened?'Ativar áudio':'Ensurdecer'}">${ic(Voice.deafened?'headphonesOff':'headphones',22)}</button>
      </div>
      <div class="sbg">
        <button class="cbtn ${Voice.camStream?'on':''}" id="sbCam" data-tip="${Voice.camStream?'Desligar câmera':'Ligar câmera'}">${ic(Voice.camStream?'video':'videoOff',22)}</button>
        ${Voice.camStream ? `<button class="cbtn" id="sbCamFx" data-tip="Efeitos da câmera">${ic('wand',22)}</button>` : ''}
        <button class="cbtn ${Voice.screenStream?'on':''}" id="sbScr" data-tip="${Voice.screenStream?'Parar de transmitir':'Compartilhar tela'}">${ic('screenUp',22)}</button>
        <button class="cbtn" id="sbAct" data-tip="Atividades">${ic('sparkles',22)}</button>
        <button class="cbtn" id="sbFx" data-tip="Reagir">${ic('smile',22)}</button>
        <button class="cbtn" id="sbQ" data-tip="Qualidade">${ic('sliders',22)}</button>
      </div>
      <button class="cbtn red wide" id="sbLeave" data-tip="Sair da chamada">${ic('phoneOff',22)}</button>
    </div></div>`;

  wrap.querySelectorAll('.vslot').forEach(slot => {
    const st = screens.concat(cams).find(x => x.stream.id === slot.dataset.stream); if(!st) return;
    const v = getVideoEl(st.stream, slot.dataset.mirror === '1');
    v.className = (slot.closest('.focus') ? 'fit' : 'cover') + (slot.dataset.mirror === '1' ? ' mirror' : '');
    slot.appendChild(v); v.play().catch(()=>{});
  });
  const live = new Set(screens.concat(cams).map(x => x.stream.id));
  S.videoEls.forEach((v, id) => { if(!live.has(id)){ v.srcObject = null; S.videoEls.delete(id); } });

  wrap.querySelectorAll('[data-focus]').forEach(t => t.onclick = () => { S.focus = t.dataset.focus; renderStage(); });
  wrap.querySelectorAll('.tile[data-vuser]').forEach(t => {
    t.oncontextmenu = e => { e.preventDefault(); userMenu(t.dataset.vuser, e.clientX, e.clientY); };
    t.ondblclick = () => { const cam = t.querySelector('video'); if(cam) (cam.requestFullscreen || cam.webkitRequestFullscreen || (()=>{})).call(cam); };
  });
  const $w = q => wrap.querySelector(q);
  $w('#sbMic').onclick = () => { Voice.toggleMute(); ls.set('telao-muted', Voice.muted); };
  $w('#sbDeaf').onclick = () => Voice.toggleDeafen();
  $w('#sbCam').onclick = () => Voice.camStream ? Voice.stopCamera() : cameraSetup();
  const fxb = $w('#sbCamFx'); if(fxb) fxb.onclick = e => camFxMenu(e.currentTarget);
  $w('#sbScr').onclick = () => Voice.screenStream ? Voice.stopScreen() : Voice.startScreen();
  $w('#sbAct').onclick = e => activitiesMenu(e.currentTarget);
  $w('#sbFx').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); emojiPicker(r.left - 150, r.top, em => Voice.sendFx({ t:'react', e: em })); };
  $w('#sbQ').onclick = () => openSettings('user','voice');
  $w('#sbLeave').onclick = leaveVoice;
  if(focused && focused.id !== 'wt'){
    const vid = () => $w('#focusBox video');
    $w('#stFs').onclick = () => { const el = $w('#focusBox'); (el.requestFullscreen || el.webkitRequestFullscreen || (()=>{})).call(el); };
    const pip = $w('#stPip'); if(pip) pip.onclick = () => { const v = vid(); if(!v) return; (document.pictureInPictureElement === v ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(e => App.toast('Não deu: ' + e.message, true)); };
    $w('#stShot').onclick = () => screenshot(vid(), focused.s);
    $w('#stDraw').onclick = () => { DRAW.on = !DRAW.on; renderStage(); if(DRAW.on) App.toast('✏️ Desenhe na tela: todo mundo assistindo vê. Clique de novo para parar.'); };
    $w('#stCine').onclick = toggleCinema;
    mountDraw(focused.s.session);
    $w('#stRec').onclick = () => REC.on ? stopRec() : startRec(focused.s);
    let lastB = 0, lastT = 0;
    statTimer = setInterval(async () => {
      const el = $('#stStats'); if(!el){ clearInterval(statTimer); return; }
      if(REC.on){ const rt = $('#recTime'); if(rt) rt.textContent = fmtDur((Date.now() - REC.t0) / 1000); }
      const f = focused.s;
      if(f.mine){ const st = f.stream.getVideoTracks()[0].getSettings(); el.textContent = `${st.width||'?'}×${st.height||'?'} · ${Math.round(st.frameRate||0)}fps`; return; }
      if(!f.pc) return;
      const rep = await f.pc.getStats(f.stream.getVideoTracks()[0]); let txt = '';
      rep.forEach(x => {
        if(x.type === 'inbound-rtp' && x.kind === 'video'){
          let mb = ''; if(lastT) mb = ' · ' + ((x.bytesReceived - lastB) * 8 / ((x.timestamp - lastT) / 1000) / 1e6).toFixed(1) + ' Mbps';
          lastB = x.bytesReceived; lastT = x.timestamp;
          txt = `${x.frameWidth||'?'}×${x.frameHeight||'?'} · ${Math.round(x.framesPerSecond||0)}fps${mb}`;
        }
      });
      if(txt) el.textContent = txt;
    }, 1000);
  }
  if(wt) mountWT();
  onSpeaking();
}

/* ---------------- print e gravação da transmissão ---------------- */
function screenshot(v, s){
  if(!v || !v.videoWidth){ App.toast('A tela ainda está carregando.', true); return; }
  const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext('2d').drawImage(v, 0, 0);
  cv.toBlob(async blob => {
    try{ await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); App.toast('📸 Print copiado! Cole no chat com Ctrl+V'); }
    catch(e){ App.toast('📸 Print salvo'); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `telao-print-${Date.now()}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
  const fl = document.createElement('div'); fl.className = 'shotflash'; $('#focusBox').appendChild(fl); setTimeout(() => fl.remove(), 400);
}
const REC = { on:false };
function startRec(s){
  if(!window.MediaRecorder){ App.toast('Seu navegador não grava.', true); return; }
  const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(s.stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `telao-gravacao-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    App.toast(`🎬 Gravação salva (${fmtSize(blob.size)})`);
  };
  rec.start(1000);
  Object.assign(REC, { on:true, rec, t0: Date.now() });
  App.toast('⏺ Gravando… clique de novo para parar e baixar');
  renderStage();
}
function stopRec(){ if(!REC.on) return; REC.on = false; try{ REC.rec.stop(); }catch(e){} renderStage(); }

/* ---------------- atividades: soundboard, reações e assistir juntos ---------------- */
const SOUNDS = [
  ['buzina','📯','Buzina'], ['tambor','🥁','Ba dum tss'], ['vitoria','🏆','Vitória'], ['erro','❌','Errou'],
  ['suspense','😱','Suspense'], ['sino','🔔','Sino'], ['palmas','👏','Palmas'], ['boing','🦘','Boing'], ['grilo','🦗','Grilos'], ['laser','🔫','Laser'],
];
let fxCtx = null;
function playSound(id){
  if(Voice.deafened) return;
  try{
    if(!fxCtx) fxCtx = new (window.AudioContext || window.webkitAudioContext)();
    const c = fxCtx, out = c.createGain(); out.gain.value = 0.35; out.connect(c.destination);
    const t = c.currentTime;
    const tone = (f, s, d, type='sine', v=1, f2) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t+s); if(f2) o.frequency.exponentialRampToValueAtTime(f2, t+s+d); g.gain.setValueAtTime(0.0001, t+s); g.gain.exponentialRampToValueAtTime(v, t+s+0.015); g.gain.exponentialRampToValueAtTime(0.0001, t+s+d); o.connect(g).connect(out); o.start(t+s); o.stop(t+s+d+0.05); };
    const noise = (s, d, v=1, hp=0) => { const b = c.createBuffer(1, c.sampleRate*d, c.sampleRate), x = b.getChannelData(0); for(let i=0;i<x.length;i++) x[i] = (Math.random()*2-1) * (1 - i/x.length); const n = c.createBufferSource(); n.buffer = b; const g = c.createGain(); g.gain.value = v; let node = n; if(hp){ const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); node = f; } node.connect(g).connect(out); n.start(t+s); };
    ({
      buzina: () => [0,0.32].forEach(s => [233,294,349].forEach(f => tone(f, s, 0.28, 'sawtooth', 0.35))),
      tambor: () => { tone(120, 0, 0.18, 'sine', 1, 50); tone(160, 0.22, 0.18, 'sine', 1, 60); noise(0.45, 0.6, 0.6, 5000); },
      vitoria: () => [523,659,784,1047].forEach((f,i) => tone(f, i*0.12, i===3?0.5:0.14, 'square', 0.25)),
      erro: () => { tone(330, 0, 0.25, 'square', 0.3); tone(220, 0.28, 0.45, 'square', 0.3); },
      suspense: () => { tone(147, 0, 0.3, 'sawtooth', 0.4); tone(139, 0.35, 0.3, 'sawtooth', 0.4); tone(131, 0.7, 1.1, 'sawtooth', 0.45); },
      sino: () => { tone(1320, 0, 1.4, 'sine', 0.6); tone(2640, 0, 0.8, 'sine', 0.2); },
      palmas: () => { for(let i=0;i<14;i++) noise(i*0.07 + Math.random()*0.03, 0.06, 0.8, 1200); },
      boing: () => tone(180, 0, 0.5, 'sine', 0.9, 620),
      grilo: () => { for(let i=0;i<6;i++) tone(4300, i*0.09 + (i>2?0.3:0), 0.05, 'sine', 0.3); },
      laser: () => tone(1800, 0, 0.35, 'sawtooth', 0.35, 120),
    }[id] || (()=>{}))();
  }catch(e){}
}
function floatReaction(emoji, uid){
  const layer = $('#fxLayer'); if(!layer) return;
  const el = document.createElement('div'); el.className = 'floatfx';
  el.innerHTML = `<span>${esc(emoji)}</span><small>${esc(prof(uid).display_name)}</small>`;
  el.style.left = (10 + Math.random() * 80) + '%';
  el.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
  layer.appendChild(el); setTimeout(() => el.remove(), 3200);
}
Voice.onFx = (pl, mine) => {
  if(!pl) return;
  if(pl.t === 'sound'){ playSound(pl.id); const snd = SOUNDS.find(x => x[0] === pl.id); if(snd) floatReaction(snd[1], pl.uid); }
  else if(pl.t === 'react') floatReaction(pl.e, pl.uid);
  else if(pl.t && pl.t.startsWith('wt')) onWT(pl, mine);
  else if(pl.t === 'draw') onDraw(pl);
};
let lastSound = 0;
function activitiesMenu(anchor){
  if(!Voice.channel){ App.toast('Entre numa chamada para usar atividades.', true); return; }
  const r = anchor.getBoundingClientRect();
  const el = $('#menu'); el.className = 'menu actpop';
  el.innerHTML = `<div class="pphead">${ic('sparkles',18)} Atividades</div>
    <button class="actbig" id="acWT"><span class="ai">${ic('tv',26)}</span><div><b>Assistir juntos</b><small>Vídeo do YouTube sincronizado para todo mundo na chamada</small></div></button>
    <div class="actsec">${ic('music',15)} Soundboard <small>todos ouvem</small></div>
    <div class="sboard">${SOUNDS.map(([id, e, n]) => `<button data-snd="${id}"><span>${e}</span>${n}</button>`).join('')}</div>
    <div class="actsec">${ic('smile',15)} Reações na tela</div>
    <div class="quickrx">${['😂','🔥','👏','❤️','😮','💀','🎉','👀'].map(e => `<button data-fx="${e}">${e}</button>`).join('')}</div>`;
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.left - 140, innerWidth - 380)) + 'px';
  el.style.top = Math.max(8, r.top - el.offsetHeight - 10) + 'px';
  el.querySelector('#acWT').onclick = () => { closeMenu(); wtPrompt(); };
  el.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => {
    if(Date.now() - lastSound < 1500){ App.toast('Calma! Espere um pouquinho entre os sons 😅'); return; }
    lastSound = Date.now(); Voice.sendFx({ t:'sound', id: b.dataset.snd });
  });
  el.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => Voice.sendFx({ t:'react', e: b.dataset.fx }));
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}

/* ---------- assistir juntos (YouTube sincronizado) ---------- */
const WT = { active:false, channel:null, id:null, title:'', player:null, apply:false, state:null };
function wtPrompt(){
  modal(`<form id="wtF"><div class="mh"><h2>${ic('tv',22)} Assistir juntos</h2><p>Cole o link de um vídeo do YouTube. Ele toca sincronizado para todos na chamada: quando alguém pausa ou pula, pula para todo mundo.</p></div>
    <div class="mc"><input class="inp" id="wtU" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off"></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Começar</button></div></form>`, m => {
    m.querySelector('#wtF').onsubmit = e => {
      e.preventDefault();
      const id = ytId(m.querySelector('#wtU').value.trim());
      if(!id){ App.toast('Esse link não parece ser do YouTube.', true); return; }
      closeModal(); Voice.sendFx({ t:'wt-load', id, time: 0, playing: true });
    };
  });
}
function onWT(pl, mine){
  if(!Voice.channel) return;
  if(pl.t === 'wt-load'){ Object.assign(WT, { active:true, channel: Voice.channel.id, id: pl.id, title:'', state:{ time: pl.time, playing: pl.playing, at: Date.now() } }); WT.player = null; S.focus = 'wt'; renderStage(); if(!mine) App.toast(`${prof(pl.uid).display_name} começou um vídeo para assistir juntos 📺`); }
  else if(pl.t === 'wt-stop'){ WT.active = false; if(WT.player){ try{ WT.player.destroy(); }catch(e){} } WT.player = null; if(S.focus === 'wt') S.focus = null; renderStage(); }
  else if(pl.t === 'wt-sync' && !mine && WT.player && WT.player.seekTo){
    WT.apply = true;
    if(Math.abs(WT.player.getCurrentTime() - pl.time) > 1.5) WT.player.seekTo(pl.time, true);
    pl.playing ? WT.player.playVideo() : WT.player.pauseVideo();
    setTimeout(() => WT.apply = false, 700);
  }
  else if(pl.t === 'wt-hello' && !mine && WT.active && WT.player && WT.player.getCurrentTime){
    Voice.sendFx({ t:'wt-load-for', to: pl.from, id: WT.id, time: WT.player.getCurrentTime(), playing: WT.player.getPlayerState() === 1 });
  }
  else if(pl.t === 'wt-load-for' && pl.to === Voice.SESSION && !WT.active){ onWT({ ...pl, t:'wt-load' }, true); }
}
function loadYTApi(){
  if(window.YT && window.YT.Player) return Promise.resolve();
  return new Promise(res => {
    const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
    if(!document.getElementById('ytapi')){ const s = document.createElement('script'); s.id = 'ytapi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); }
  });
}
async function mountWT(){
  const box = $('#wtPlayer'); if(!box) return;
  $('#wtStop').onclick = () => Voice.sendFx({ t:'wt-stop' });
  $('#wtChange').onclick = wtPrompt;
  if(WT.player && WT.player.getIframe && WT.player.getIframe()){ box.replaceWith(WT.player.getIframe()); return; }
  await loadYTApi();
  if(!$('#wtPlayer')) return;
  const st = WT.state || { time:0, playing:true, at:Date.now() };
  const start = st.time + (st.playing ? (Date.now() - st.at) / 1000 : 0);
  WT.player = new YT.Player('wtPlayer', { videoId: WT.id, width:'100%', height:'100%',
    playerVars: { autoplay: 1, start: Math.floor(start), rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady: e => { if(start) e.target.seekTo(start, true); if(!st.playing) e.target.pauseVideo(); try{ WT.title = e.target.getVideoData().title; const b = $('.wtbar span'); if(b) b.innerHTML = `${ic('tv',16)} Assistindo juntos · ${esc(WT.title)}`; }catch(_){} },
      onStateChange: e => {
        if(WT.apply) return;
        if(e.data === 1 || e.data === 2) Voice.sendFx({ t:'wt-sync', time: e.target.getCurrentTime(), playing: e.data === 1 });
      },
    } });
}

/* ---------------- cartão de usuário (popover) ---------------- */
function userMenu(uid, x, y){
  const p = prof(uid);
  const items = [{ raw: profileCard(p, App.rolesHtml ? App.rolesHtml(uid) : '') }];
  if(uid !== S.me.id){
    const fr = S.friends.find(f => f.uid === uid);
    if(Voice.channel && voiceUsers(Voice.channel).some(m => m.user_id === uid)){
      const vol = Math.round((Voice.userVolumes.get(uid) ?? 1) * 100);
      items.push({ html:`<div class="uvol">${ic('volume',16)}<span>Volume</span><b id="uvL">${vol}%</b></div><input type="range" id="uvR" min="0" max="100" value="${vol}" class="range">`,
        mount: el => { const r = el.querySelector('#uvR'); r.oninput = () => { el.querySelector('#uvL').textContent = r.value + '%'; Voice.setUserVolume(uid, r.value / 100); }; } });
    }
    if(fr && fr.status === 'accepted') items.push({ label:'Mensagem', icon: ic('chat',18), onClick: () => openDM(uid) }, { label:'Ligar', icon: ic('phone',18), onClick: async () => { const d = await openDM(uid); if(d) joinVoice(d); } });
    else if(!fr) items.push({ label:'Adicionar amigo', icon: ic('userPlus',18), onClick: async () => {
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: p.username });
      App.toast(error ? error.message : data === 'accepted' ? 'Agora vocês são amigos!' : 'Pedido enviado!', !!error); loadFriends().then(renderRail);
    }});
    else if(fr.status === 'pending') items.push({ html: `<div style="color:var(--mut);font-size:13px">${fr.incoming ? 'Te mandou pedido de amizade' : 'Pedido de amizade enviado'}</div>` });
    const s = curServer();
    if(s && App.hasPerm(s.id, 16) && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push({ label:'Cargos', icon: ic('shield',18), onClick: () => App.roleAssignMenu(s, uid, x, y) });
    if(s && App.hasPerm(s.id, 4) && uid !== s.owner_id && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push('-', { label:'Expulsar do servidor', icon: ic('logout',18), danger:true, onClick: async () => {
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', uid);
      if(error) App.toast(error.message, true);
    }});
  }
  if(uid === S.me.id) items.push({ label:'Editar perfil', icon: ic('edit',18), onClick: () => openSettings('user','profile') });
  items.push({ label:'Copiar usuário', icon: ic('copy',18), onClick: () => copy(p.username) });
  menu(x, y, items, 'pp');
}


/* ---------------- prévia da câmera com efeitos ---------------- */
async function cameraSetup(){
  if(!Voice.channel){ App.toast('Entre numa chamada primeiro', true); return; }
  let fx;
  try{ fx = await Voice.openCamFx(); }
  catch(e){ App.toast('Não consegui abrir a câmera: ' + (e.name === 'NotAllowedError' ? 'permissão negada' : e.message), true); return; }
  let started = false;
  modal(`<div class="mh"><h2>${ic('video',22)} Sua câmera</h2><p>Escolha um efeito antes de aparecer. Dá para trocar durante a chamada também.</p></div>
    <div class="mc"><div class="campv"><video id="camPv" autoplay playsinline muted></video><span class="camst" id="camSt"></span></div>
      <div class="fxgrid" id="fxGrid">${CamFX.EFFECTS.map(e => `<button data-fx="${e.id}" class="${(P.camFx||'none')===e.id?'on':''}"><span>${e.ic}</span>${esc(e.nome)}${e.tag?`<i>${e.tag}</i>`:''}</button>`).join('')}</div></div>
    <div class="mf"><button class="btn sec" id="camNo">Cancelar</button><button class="btn" id="camGo">${ic('video',16)} Ligar câmera</button></div>`, m => {
    m.querySelector('.mbox').classList.add('wide');
    const v = m.querySelector('#camPv'); v.srcObject = fx.stream; v.play().catch(()=>{});
    fx.onStatus(t => { const el = m.querySelector('#camSt'); if(el){ el.textContent = t; el.classList.toggle('hidden', !t); } });
    m.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
      P.camFx = b.dataset.fx; savePrefs(); fx.setEffect(P.camFx);
      m.querySelectorAll('[data-fx]').forEach(x => x.classList.toggle('on', x === b));
    });
    m.querySelector('#camNo').onclick = () => { closeModal(); };
    m.querySelector('#camGo').onclick = () => { started = true; closeModal(); Voice.startCamera(fx); };
    const obs = new MutationObserver(() => { if($('#modal').classList.contains('hidden')){ obs.disconnect(); if(!started) fx.stop(); } });
    obs.observe($('#modal'), { attributes:true, attributeFilter:['class'] });
  });
}
function camFxMenu(anchor){
  const r = anchor.getBoundingClientRect();
  const el = $('#menu'); el.className = 'menu fxpop';
  el.innerHTML = `<div class="pphead">${ic('wand',18)} Efeitos da câmera</div><div class="fxgrid sm">${CamFX.EFFECTS.map(e => `<button data-fx="${e.id}" class="${(P.camFx||'none')===e.id?'on':''}"><span>${e.ic}</span>${esc(e.nome)}${e.tag?`<i>${e.tag}</i>`:''}</button>`).join('')}</div><div class="fxst" id="fxSt"></div>`;
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.left - 160, innerWidth - 400)) + 'px';
  el.style.top = Math.max(8, r.top - el.offsetHeight - 10) + 'px';
  if(Voice.camFx) Voice.camFx.onStatus(t => { const s = $('#fxSt'); if(s) s.textContent = t; });
  el.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
    P.camFx = b.dataset.fx; savePrefs(); Voice.setCamEffect(P.camFx);
    el.querySelectorAll('[data-fx]').forEach(x => x.classList.toggle('on', x === b));
  });
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}

/* ---------------- modo cinema ---------------- */
function toggleCinema(){
  document.body.classList.toggle('cinema');
  if(document.body.classList.contains('cinema')) App.toast('🎬 Modo cinema — aperte Esc para sair');
}
window.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('cinema')) document.body.classList.remove('cinema'); });

/* ---------------- desenhar na tela compartilhada ---------------- */
const DRAW = { on:false, strokes:[], raf:0, cur:null, sess:null, lastSend:0 };
function videoRect(cv){
  const v = cv.parentElement.querySelector('video'); const W = cv.width, H = cv.height;
  const vw = (v && v.videoWidth) || 16, vh = (v && v.videoHeight) || 9, s = Math.min(W / vw, H / vh);
  return { x:(W - vw*s)/2, y:(H - vh*s)/2, w:vw*s, h:vh*s };
}
function mountDraw(sess){
  const cv = $('#drawCv'); if(!cv) return;
  DRAW.sess = sess;
  const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; };
  fit();
  const ctx = cv.getContext('2d');
  cancelAnimationFrame(DRAW.raf);
  const loop = () => {
    if(!document.body.contains(cv)) return;
    const r = cv.getBoundingClientRect(); if(Math.abs(r.width * devicePixelRatio - cv.width) > 2) fit();
    ctx.clearRect(0, 0, cv.width, cv.height);
    const vr = videoRect(cv), now = Date.now();
    DRAW.strokes = DRAW.strokes.filter(s => now - s.t < 5000);
    DRAW.strokes.filter(s => s.sess === DRAW.sess).forEach(s => {
      const age = now - s.t; ctx.globalAlpha = age < 3500 ? 1 : 1 - (age - 3500) / 1500;
      ctx.strokeStyle = s.c; ctx.lineWidth = 4 * devicePixelRatio; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.shadowColor = s.c; ctx.shadowBlur = 8;
      ctx.beginPath(); s.pts.forEach(([x, y], i) => { const px = vr.x + x * vr.w, py = vr.y + y * vr.h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    DRAW.raf = requestAnimationFrame(loop);
  };
  loop();
  if(!DRAW.on) return;
  const pt = e => { const r = cv.getBoundingClientRect(), vr = videoRect(cv); const x = ((e.clientX - r.left) * devicePixelRatio - vr.x) / vr.w, y = ((e.clientY - r.top) * devicePixelRatio - vr.y) / vr.h; return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]; };
  const color = S.me.avatar_color || '#ff6b4a';
  const flush = (final) => {
    const c = DRAW.cur; if(!c || c.pts.length < 2) return;
    if(!final && Date.now() - DRAW.lastSend < 60) return;
    DRAW.lastSend = Date.now();
    Voice.sendFx({ t:'draw', s: sess, id: c.id, pts: c.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]), c: color });
  };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); DRAW.cur = { id: Math.random().toString(36).slice(2), pts:[pt(e)] }; };
  cv.onpointermove = e => { if(!DRAW.cur) return; DRAW.cur.pts.push(pt(e)); flush(false); };
  cv.onpointerup = cv.onpointercancel = () => { flush(true); DRAW.cur = null; };
}
function onDraw(pl){
  const ex = DRAW.strokes.find(s => s.id === pl.id);
  if(ex){ ex.pts = pl.pts; ex.t = Date.now(); }
  else DRAW.strokes.push({ id: pl.id, sess: pl.s, pts: pl.pts, c: pl.c, t: Date.now() });
}
/* ---------------- cargos e permissões ---------------- */
const PERMS = [
  [32, 'Administrador', 'Pode tudo (menos excluir o servidor). Cuidado!'],
  [2, 'Gerenciar servidor', 'Mudar nome, ícone, descrição e convites.'],
  [1, 'Gerenciar canais', 'Criar, editar, organizar e apagar canais.'],
  [16, 'Gerenciar cargos', 'Criar cargos e dar cargos para as pessoas.'],
  [4, 'Expulsar membros', 'Tirar pessoas do servidor.'],
  [8, 'Gerenciar mensagens', 'Apagar e fixar mensagens de qualquer pessoa.'],
];
S.roles = new Map();        // sid -> [roles]
S.memberRoles = new Map();  // sid -> Map(uid -> Set(roleId))
async function loadRoles(sid){
  const [{ data: roles }, { data: mr }] = await Promise.all([
    App.sb.from('server_roles').select('*').eq('server_id', sid).order('position', { ascending:false }),
    App.sb.from('member_roles').select('*').eq('server_id', sid),
  ]);
  S.roles.set(sid, roles || []);
  const map = new Map(); (mr || []).forEach(r => { if(!map.has(r.user_id)) map.set(r.user_id, new Set()); map.get(r.user_id).add(r.role_id); });
  S.memberRoles.set(sid, map);
}
const rolesOf = (sid, uid) => { const ids = S.memberRoles.get(sid)?.get(uid); return ids ? (S.roles.get(sid) || []).filter(r => ids.has(r.id)) : []; };
App.hasPerm = (sid, bit) => {
  const s = S.servers.find(x => x.id === sid); if(!s || !S.me) return false;
  if(s.owner_id === S.me.id) return true;
  return rolesOf(sid, S.me.id).some(r => (r.perms & bit) || (r.perms & 32));
};
App.roleColorOf = uid => {
  const s = curServer(); if(!s) return null;
  const r = rolesOf(s.id, uid).find(r => r.color && r.color !== '#99aab5');
  return r ? r.color : null;
};
App.rolesHtml = uid => {
  const s = curServer(); if(!s || !(S.members.get(s.id) || []).some(m => m.user_id === uid)) return '';
  const rs = rolesOf(s.id, uid);
  const owner = s.owner_id === uid;
  if(!rs.length && !owner) return '';
  return `<h6>Cargos em ${esc(s.name)}</h6><div class="rpills">${owner ? `<span class="rpill"><i style="background:#f0b232"></i>Dono</span>` : ''}${rs.map(r => `<span class="rpill"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>`).join('')}</div>`;
};
App.onRolesChange = async p => {
  const row = p.new && p.new.server_id ? p.new : p.old;
  const sids = row && row.server_id ? [row.server_id] : [...S.roles.keys()];
  for(const sid of sids) if(S.roles.has(sid)) await loadRoles(sid);
  renderMembers(); renderSidebar(); if(M.el) renderMsgList(false);
  if(SET && SET.kind === 'server' && SET.sec === 'roles') renderSettings();
};
App.roleAssignMenu = (s, uid, x, y) => {
  const all = S.roles.get(s.id) || [];
  if(!all.length){ App.toast('Esse servidor ainda não tem cargos. Crie em Configurações do servidor → Cargos.'); return; }
  const mine = new Set((S.memberRoles.get(s.id)?.get(uid)) || []);
  const isOwner = s.owner_id === S.me.id;
  menu(x, y, [{ raw: `<div class="pphead">${ic('shield',16)} Cargos de ${esc(prof(uid).display_name)}</div>` }].concat(all.map(r => ({
    raw: `<label class="rolechk ${(r.perms & 48) && !isOwner ? 'dis' : ''}"><input type="checkbox" data-role="${r.id}" ${mine.has(r.id)?'checked':''} ${(r.perms & 48) && !isOwner ? 'disabled' : ''}><i style="background:${esc(r.color)}"></i>${esc(r.name)}</label>`,
  }))), 'rolemenu');
  $$('#menu [data-role]').forEach(cb => cb.onchange = async () => {
    const q = cb.checked ? App.sb.from('member_roles').insert({ server_id: s.id, user_id: uid, role_id: cb.dataset.role })
                         : App.sb.from('member_roles').delete().eq('user_id', uid).eq('role_id', cb.dataset.role);
    const { error } = await q;
    if(error){ App.toast(error.message, true); cb.checked = !cb.checked; return; }
    await loadRoles(s.id); renderMembers();
  });
};

/* ---------------- membros (agrupados por cargo) ---------------- */
function renderMembers(){
  const el = $('#members');
  const s = curServer();
  const textView = S.route.kind === 'server' && (S.channels.get(s?.id) || []).find(c => c.id === S.route.cid)?.kind === 'text';
  if(!s || !S.members.has(s.id) || S.showMembers === false || !textView){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  ls.set('telao-showmembers', S.showMembers !== false);
  const roles = (S.roles.get(s.id) || []).filter(r => r.hoist);
  const mem = S.members.get(s.id).map(m => ({ ...m, p: prof(m.user_id) })).sort((a,b) => a.p.display_name.localeCompare(b.p.display_name));
  const groups = new Map(); roles.forEach(r => groups.set(r.id, { name: r.name, list: [] }));
  const online = [], off = [];
  mem.forEach(m => {
    if(!S.online.has(m.user_id) && m.user_id !== S.me.id){ off.push(m); return; }
    const top = rolesOf(s.id, m.user_id).find(r => r.hoist);
    if(top) groups.get(top.id).list.push(m); else online.push(m);
  });
  const activity = uid => { for(const metas of S.vp.values()){ const m = metas.find(x => x.user_id === uid && x.voice); if(m) return m.sharing ? `<span class="livetag" data-watch="${m.voice}" data-wsess="${m.session}">${ic('screenUp',12)} AO VIVO · Assistir</span>` : `${ic('volume',12)} Em chamada`; } return ''; };
  const row = m => {
    const color = App.roleColorOf(m.user_id);
    const sub = activity(m.user_id) || (m.p.custom_status ? statusText(m.p) : '');
    return `<div class="mem ${S.online.has(m.user_id) || m.user_id === S.me.id ? '' : 'off'}" data-u="${m.user_id}">${avatar(m.p,'',true)}<div class="mt"><span class="nm" style="${color?`color:${color}`:''}">${nameHtml(m.p)}${m.user_id===s.owner_id?`<span class="crown" data-tip="Dono do servidor">${ic('crown',14)}</span>`:''}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  };
  let h = '';
  groups.forEach(g => { if(g.list.length) h += `<h4>${esc(g.name)} — ${g.list.length}</h4>${g.list.map(row).join('')}`; });
  if(online.length) h += `<h4>Online — ${online.length}</h4>${online.map(row).join('')}`;
  if(off.length) h += `<h4>Offline — ${off.length}</h4>${off.map(row).join('')}`;
  el.innerHTML = h;
  el.querySelectorAll('[data-watch]').forEach(b => b.onclick = e => { e.stopPropagation(); watchLive(b.dataset.watch, b.dataset.wsess); });
  el.querySelectorAll('[data-u]').forEach(r => r.onclick = e => { if(e.target.closest('[data-watch]')) return; const b = r.getBoundingClientRect(); userMenu(r.dataset.u, b.left - 330, b.top); });
}

/* ---------------- servidores: menus e modais ---------------- */
function serverMenu(s, e){
  const owner = s.owner_id === S.me.id;
  const r = $('#sbHead').getBoundingClientRect();
  const items = [{ label:'Convidar pessoas', icon: ic('userPlus',18), onClick: () => inviteModal(s) }];
  if(App.hasPerm(s.id, 2) || App.hasPerm(s.id, 16)) items.push({ label:'Configurações do servidor', icon: ic('gear',18), onClick: () => openSettings('server','overview', s) });
  if(App.hasPerm(s.id, 1)) items.push({ label:'Criar canal', icon: ic('plusCircle',18), onClick: () => createChannelModal(s, 'text') }, { label:'Criar categoria', icon: ic('folder',18), onClick: () => createCategoryModal(s) });
  items.push('-');
  if(owner) items.push({ label:'Excluir servidor', danger:true, icon: ic('trash',18), onClick: () => deleteServer(s) });
  else items.push({ label:'Sair do servidor', danger:true, icon: ic('logout',18), onClick: () => leaveServer(s) });
  menu(r.left + 8, r.bottom + 6, items, 'srvmenu');
}
function addServerModal(){
  modal(`<div class="mh"><h2>Adicionar um servidor</h2><p>Um servidor é onde você e seus amigos conversam, jogam e assistem juntos.</p></div>
    <div class="mc">
      <button class="choice" id="chCreate"><span class="e">${ic('sparkles',26)}</span><div><b>Criar o meu</b><small>Do zero, do seu jeito</small></div>${ic('chevRight',20)}</button>
      <div class="tpls">${[['🎮','Jogos'],['👥','Amigos'],['📚','Estudos'],['🎬','Filmes']].map(([e,n]) => `<button class="tpl" data-tpl="${n}"><span>${e}</span>${n}</button>`).join('')}</div>
      <button class="choice" id="chJoin"><span class="e">${ic('link',26)}</span><div><b>Entrar com um convite</b><small>Tem um link ou código? Cole aqui</small></div>${ic('chevRight',20)}</button>
    </div>`, m => {
    m.querySelector('#chCreate').onclick = () => createServerModal();
    m.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => createServerModal(b.dataset.tpl));
    m.querySelector('#chJoin').onclick = () => joinServerModal();
  });
}
const TEMPLATES = {
  'Jogos': { text: ['geral','clipes-e-prints','procurando-time'], voice: ['Partida 1','Partida 2','Telão'] },
  'Amigos': { text: ['geral','memes','fotos'], voice: ['Resenha','Telão'] },
  'Estudos': { text: ['geral','duvidas','materiais'], voice: ['Sala de estudo','Telão'] },
  'Filmes': { text: ['geral','indicacoes','spoilers'], voice: ['Cinema','Telão'] },
};
function createServerModal(tpl){
  let iconFile = null;
  modal(`<form id="csF"><div class="mh"><h2>Personalize seu servidor</h2><p>Dê uma cara para ele com um nome e um ícone. Dá para mudar depois.</p></div>
    <div class="mc"><label class="upicon" id="csIc">${ic('camera',26)}<span>ÍCONE</span><input type="file" accept="image/*" id="csFile" hidden></label>
      <label class="field"><span>Nome do servidor</span><input class="inp" id="csN" maxlength="40" value="${tpl ? esc(tpl) + ' de ' : 'Servidor de '}${esc(S.me.display_name)}" required></label></div>
    <div class="mf"><button type="button" class="btn sec" id="csBack">Voltar</button><button class="btn" id="csGo">Criar</button></div></form>`, m => {
    m.querySelector('#csN').select();
    m.querySelector('#csBack').onclick = addServerModal;
    m.querySelector('#csFile').onchange = e => {
      iconFile = e.target.files[0]; if(!iconFile) return;
      m.querySelector('#csIc').innerHTML = `<img src="${URL.createObjectURL(iconFile)}" alt="">`;
    };
    m.querySelector('#csF').onsubmit = async e => {
      e.preventDefault(); m.querySelector('#csGo').disabled = true;
      const { data: sid, error } = await App.sb.rpc('create_server', { p_name: m.querySelector('#csN').value.trim() });
      if(error){ App.toast(error.message, true); m.querySelector('#csGo').disabled = false; return; }
      if(iconFile){ const url = await uploadSquare(iconFile, 'servers', 256).catch(() => null); if(url) await App.sb.from('servers').update({ icon_url: url }).eq('id', sid); }
      if(tpl && TEMPLATES[tpl]){
        const { data: chs } = await App.sb.from('channels').select('*').eq('server_id', sid);
        await Promise.all((chs || []).map(c => App.sb.from('channels').delete().eq('id', c.id)));
        const t = TEMPLATES[tpl]; let pos = 0;
        await App.sb.from('channels').insert(t.text.map(n => ({ server_id: sid, name: n, kind:'text', position: pos++ })).concat(t.voice.map(n => ({ server_id: sid, name: n, kind:'voice', position: pos++ }))));
      }
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Servidor criado! 🎉 Convide a galera.');
    };
  });
}
/* reduz imagem quadrada (ícones, avatares) — GIF passa direto */
async function uploadSquare(file, folder, size, bucket='media'){
  let blob = file, type = file.type;
  if(/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)){
    const bmp = await createImageBitmap(file); const s = Math.min(bmp.width, bmp.height);
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.min(size, s);
    cv.getContext('2d').drawImage(bmp, (bmp.width - s)/2, (bmp.height - s)/2, s, s, 0, 0, cv.width, cv.height);
    blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.88)); type = blob.type;
    if(type !== 'image/webp'){ blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); type = 'image/jpeg'; }
  }
  const ext = type.split('/')[1].replace('jpeg','jpg');
  const path = `${S.me.id}/${folder}-${Date.now().toString(36)}.${ext}`;
  const { error } = await App.sb.storage.from(bucket).upload(path, blob, { contentType: type, cacheControl:'31536000' });
  if(error) throw error;
  return App.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function parseInvite(v){ v = v.trim(); const m = v.match(/convite=([a-z0-9]+)/i); return (m ? m[1] : v.split('/').pop()).toLowerCase(); }
function joinServerModal(prefill){
  modal(`<form id="jsF"><div class="mh"><h2>Entrar num servidor</h2><p>Cole o link ou o código de convite que te mandaram.</p></div>
    <div class="mc"><label class="field"><span>Link ou código do convite</span><input class="inp" id="jsC" value="${esc(typeof prefill==='string'?prefill:'')}" placeholder="https://.../#convite=a1b2c3d4" required></label>
      <small style="color:var(--mut)">Os convites são assim: <code>a1b2c3d4</code> ou <code>${esc(location.origin)}/#convite=a1b2c3d4</code></small></div>
    <div class="mf"><button type="button" class="btn sec" id="jsBack">Voltar</button><button class="btn">Entrar no servidor</button></div></form>`, m => {
    m.querySelector('#jsBack').onclick = addServerModal;
    m.querySelector('#jsF').onsubmit = async e => {
      e.preventDefault();
      const { data: sid, error } = await App.sb.rpc('join_server', { p_code: parseInvite(m.querySelector('#jsC').value) });
      if(error){ App.toast(error.message.includes('Convite') ? 'Convite inválido ou expirado.' : error.message, true); return; }
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Bem-vindo(a) ao servidor! 🎉');
    };
  });
}
function inviteJoinPrompt(code){ S.pendingInvite = null; joinServerModal(code); }
function inviteModal(s){
  const link = location.origin + '/#convite=' + s.invite_code;
  modal(`<div class="mh"><h2>Convide amigos para ${esc(s.name)}</h2><p>Mande o link. Quem abrir entra direto no servidor.</p></div>
    <div class="mc">
      ${S.friends.filter(f => f.status === 'accepted').length ? `<div class="invfriends">${S.friends.filter(f => f.status === 'accepted').slice(0, 20).map(f => { const p = prof(f.uid); const inS = (S.members.get(s.id) || []).some(m => m.user_id === f.uid);
        return `<div class="invf">${avatar(p,'sm',true)}<b>${esc(p.display_name)}</b><span class="grow"></span>${inS ? '<small>Já está aqui</small>' : `<button class="btn sm sec" data-inv="${f.uid}">Convidar</button>`}</div>`; }).join('')}</div>` : ''}
      <label class="field" style="margin-top:12px"><span>Ou mande o link de convite</span></label>
      <div class="copyrow"><input class="inp" readonly value="${esc(link)}" id="ivL"><button class="btn" id="ivC">Copiar</button></div>
      ${App.hasPerm(s.id, 2) ? '<p class="small mut" style="margin-top:12px">Vazou o link? <a id="ivR">Gerar um novo</a> (o antigo para de funcionar).</p>' : ''}</div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelector('#ivC').onclick = () => { copy(link); m.querySelector('#ivC').textContent = 'Copiado!'; };
    m.querySelectorAll('[data-inv]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const { data: cid, error } = await App.sb.rpc('open_dm', { p_user: b.dataset.inv });
      if(error){ App.toast(error.message, true); b.disabled = false; return; }
      await App.sb.from('messages').insert({ channel_id: cid, content: `Entra no meu servidor **${s.name}** no Telão! 🎉\n${link}` });
      b.textContent = 'Enviado ✓';
    });
    const rg = m.querySelector('#ivR');
    if(rg) rg.onclick = async () => {
      const { data, error } = await App.sb.rpc('regenerate_invite', { p_server: s.id });
      if(error){ App.toast(error.message, true); return; }
      s.invite_code = data; inviteModal(s);
    };
  });
}
function createChannelModal(s, kind, category){
  const cats = [...new Set((S.channels.get(s.id) || []).map(c => c.category).filter(Boolean))];
  modal(`<form id="ccF"><div class="mh"><h2>Criar canal</h2></div>
    <div class="mc">
      <div class="ctype"><label><input type="radio" name="k" value="text" ${kind!=='voice'?'checked':''}><span class="ci">${ic('hash',22)}</span><div><b>Texto</b><small>Mensagens, imagens, GIFs, emojis e opiniões</small></div></label>
        <label><input type="radio" name="k" value="voice" ${kind==='voice'?'checked':''}><span class="ci">${ic('volume',22)}</span><div><b>Voz</b><small>Chamada, câmera e compartilhar tela</small></div></label></div>
      <label class="field"><span>Nome do canal</span><div class="inpic"><span id="ccIc">${ic(kind==='voice'?'volume':'hash',18)}</span><input class="inp" id="ccN" maxlength="40" placeholder="novo-canal" required></div></label>
      <label class="field"><span>Categoria (opcional)</span><input class="inp" id="ccC" maxlength="40" list="ccCats" value="${esc(category||'')}" placeholder="Ex: Jogos"><datalist id="ccCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar canal</button></div></form>`, m => {
    m.querySelectorAll('input[name=k]').forEach(r => r.onchange = () => m.querySelector('#ccIc').innerHTML = ic(r.value === 'voice' ? 'volume' : 'hash', 18));
    m.querySelector('#ccF').onsubmit = async e => {
      e.preventDefault();
      const k = m.querySelector('input[name=k]:checked').value;
      let name = m.querySelector('#ccN').value.trim();
      if(k === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
      if(!name) return;
      const list = S.channels.get(s.id) || [];
      const position = list.reduce((a,c) => Math.max(a, c.position), 0) + 1;
      const { data, error } = await App.sb.from('channels').insert({ server_id: s.id, name, kind: k, position, category: m.querySelector('#ccC').value.trim() || null }).select().single();
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); go({ kind:'server', sid: s.id, cid: data.id });
    };
  });
}
function createCategoryModal(s){
  modal(`<form id="cgF"><div class="mh"><h2>Criar categoria</h2><p>Organize os canais em grupos (ex: “Jogos”, “Avisos”). Depois escolha a categoria ao criar ou editar um canal.</p></div>
    <div class="mc"><label class="field"><span>Nome da categoria</span><input class="inp" id="cgN" maxlength="40" required></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar e adicionar canal</button></div></form>`, m => {
    m.querySelector('#cgF').onsubmit = e => { e.preventDefault(); const n = m.querySelector('#cgN').value.trim(); if(n) createChannelModal(s, 'text', n); };
  });
}
function editChannelModal(c){
  const s = S.servers.find(x => x.id === c.server_id);
  const cats = [...new Set((S.channels.get(s.id) || []).map(x => x.category).filter(Boolean))];
  modal(`<form id="ecF"><div class="mh"><h2>${ic(c.kind==='text'?'hash':'volume',22)} Editar canal</h2></div>
    <div class="mc"><label class="field"><span>Nome</span><input class="inp" id="ecN" maxlength="40" value="${esc(c.name)}" required></label>
      <label class="field"><span>Tópico</span><textarea class="inp" id="ecT" maxlength="300" rows="3" placeholder="Diga para que serve este canal">${esc(c.topic || '')}</textarea></label>
      <label class="field"><span>Categoria</span><input class="inp" id="ecC" maxlength="40" list="ecCats" value="${esc(c.category || '')}" placeholder="Sem categoria"><datalist id="ecCats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
    <div class="mf" style="justify-content:space-between"><button type="button" class="btn red" id="ecDel">${ic('trash',16)} Apagar</button><span style="display:flex;gap:10px"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></span></div></form>`, m => {
    m.querySelector('#ecDel').onclick = async () => {
      if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${c.kind==='text'?'Todas as mensagens serão perdidas.':''}`, 'Apagar canal'))) return;
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true);
    };
    m.querySelector('#ecF').onsubmit = async e => {
      e.preventDefault();
      let name = m.querySelector('#ecN').value.trim(); if(c.kind === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
      const { error } = await App.sb.from('channels').update({ name, topic: m.querySelector('#ecT').value.trim() || null, category: m.querySelector('#ecC').value.trim() || null }).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); renderMain(); App.toast('Canal atualizado');
    };
  });
}
async function deleteServer(s){
  if(!(await confirmBox('Excluir servidor', `Excluir <b>${esc(s.name)}</b> para sempre? Todos os canais e mensagens serão apagados.`, 'Excluir servidor'))) return false;
  if(Voice.channel && Voice.channel.server_id === s.id) await leaveVoice();
  const { error } = await App.sb.from('servers').delete().eq('id', s.id);
  if(error){ App.toast(error.message, true); return; }
  await loadServers(); go({ kind:'home', dm:null });
}
async function leaveServer(s){
  if(!(await confirmBox('Sair do servidor', `Sair de <b>${esc(s.name)}</b>? Você só volta com um novo convite.`, 'Sair'))) return;
  if(Voice.channel && Voice.channel.server_id === s.id) await leaveVoice();
  const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', S.me.id);
  if(error){ App.toast(error.message, true); return; }
  await loadServers(); go({ kind:'home', dm:null });
}
/* =====================================================================
   PREFERÊNCIAS, INSÍGNIAS, PERFIL, TELÃO+ E PAINÉIS DE CONFIGURAÇÕES
   ===================================================================== */
const PRICE_TXT = 'R$ 9,90';
const PDEF = { accent:'#ff6b4a', theme:'dark', fontSize:15, compact:false, inputId:'', outputId:'', echo:true, noise:true, agc:true,
  mode:'vad', sensitivity:4, pttKey:'Backquote', muteKey:'ctrl+shift+KeyM', deafKey:'ctrl+shift+KeyD', screenKey:'',
  notifDM:true, notifMention:true, notifCall:true, soundMsg:true, soundVoice:true, soundPtt:true };
const P = App.prefs = Object.assign({}, PDEF, ls.get('telao-prefs', {}));
function savePrefs(){ ls.set('telao-prefs', P); applyPrefs(); }
function applyPrefs(){
  document.body.classList.remove('theme-dark','theme-amoled','theme-light');
  document.body.classList.add('theme-' + P.theme);
  document.body.classList.toggle('compact', !!P.compact);
  document.documentElement.style.setProperty('--fs', P.fontSize + 'px');
  const a = P.accent || '#ff6b4a', rs = document.documentElement.style;
  const [r,g,b] = [1,3,5].map(i => parseInt(a.slice(i, i+2), 16));
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  rs.setProperty('--acc', a);
  rs.setProperty('--acc2', `rgb(${Math.min(255, r+40)},${Math.min(255, g+40)},${Math.min(255, b+40)})`);
  rs.setProperty('--accs', `rgba(${r},${g},${b},.18)`);
  rs.setProperty('--acct', lum > 0.62 ? '#111' : '#fff');
  const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.content = P.theme === 'light' ? '#e3e5e8' : P.theme === 'amoled' ? '#000000' : '#1e1f22';
}
applyPrefs();

/* ---------- Telão+ ---------- */
const hasPlus = p => !!p && (p.is_admin || (p.plan_until && new Date(p.plan_until) > new Date()));
function plusTier(p){
  if(!p) return 'bronze';
  if(p.is_admin) return 'diamante';
  const m = p.plus_months || 1;
  return m >= 12 ? 'diamante' : m >= 6 ? 'ouro' : m >= 3 ? 'prata' : 'bronze';
}
const TIERS = { bronze:['#cd7f32','#f0b27a','Bronze (1 mês)'], prata:['#9aa4b1','#e8edf3','Prata (3 meses)'], ouro:['#d9a400','#ffe27a','Ouro (6 meses)'], diamante:['#33b8ff','#b8f0ff','Diamante (1 ano)'] };
function clampScreen(st){
  if(hasPlus(S.me)) return st;
  const r = { ...st };
  if(r.h > 1080 || (r.h === 1080 && r.fps > 30)){ r.w = 1920; r.h = 1080; r.fps = 30; }
  if(r.bitrate > 8000000) r.bitrate = 8000000;
  return r;
}

/* ---------- insígnias (desenhos originais) ---------- */
const BADGES = [
  { id:'fundador', nome:'Fundador do Telão', desc:'Criou o Telão' },
  { id:'staff', nome:'Equipe Telão', desc:'Faz parte da equipe' },
  { id:'plus', nome:'Assinante Telão+', desc:'' },
  { id:'mod', nome:'Moderador certificado', desc:'Ajuda a manter a paz' },
  { id:'dev', nome:'Desenvolvedor ativo', desc:'Cria coisas para o Telão' },
  { id:'bug2', nome:'Caçador de bugs ouro', desc:'Achou bugs graves' },
  { id:'bug1', nome:'Caçador de bugs', desc:'Ajudou a achar bugs' },
  { id:'evento', nome:'Participante de evento', desc:'Esteve num evento do Telão' },
  { id:'apoiador', nome:'Apoiador inicial', desc:'Apoiou o Telão no começo' },
  { id:'pioneiro', nome:'Membro pioneiro', desc:'Entrou no Telão em 2026' },
  { id:'chama', nome:'Casa Chama', desc:'Coragem acima de tudo' },
  { id:'raio', nome:'Casa Raio', desc:'Rápido e brilhante' },
  { id:'onda', nome:'Casa Onda', desc:'Calma e equilíbrio' },
];
const GRANTABLE = ['staff','mod','dev','bug2','bug1','evento','apoiador'];
function badgeSvg(id, tier){
  const t = TIERS[tier || 'bronze'];
  const S2 = (body, bg) => `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="${bg}"/>${body}</svg>`;
  switch(id){
    case 'fundador': return S2('<path d="M5 16l1.5-8 3.5 3.5L12 6l2 5.5L17.5 8 19 16z" fill="#ffd54a" stroke="#b8860b" stroke-width=".8"/><rect x="5" y="16.5" width="14" height="2.2" rx="1" fill="#ffd54a"/>', '#3a2a00');
    case 'staff': return S2('<path d="M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" fill="#7c6cff"/><path d="M12 8.2l1.2 2.5 2.7.3-2 1.9.5 2.7L12 14.3l-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill="#fff"/>', '#211a5c');
    case 'plus': return `<svg viewBox="0 0 24 24"><defs><linearGradient id="pg${tier}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t[1]}"/><stop offset="1" stop-color="${t[0]}"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="#2b1650"/><path d="M12 3.8l6.5 6.2L12 20.2 5.5 10z" fill="url(#pg${tier})"/><path d="M5.5 10h13M12 3.8L9.4 10 12 20.2 14.6 10z" stroke="#fff" stroke-opacity=".55" stroke-width=".8" fill="none"/></svg>`;
    case 'mod': return S2('<path d="M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" fill="#ff8a3d"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', '#4a2200');
    case 'dev': return S2('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke="#5ec8ff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.2 6.5l-2.4 11" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>', '#0d2c44');
    case 'bug1': case 'bug2': { const c = id === 'bug2' ? '#ffcc33' : '#4ade80';
      return S2(`<ellipse cx="12" cy="13.5" rx="4.2" ry="5.2" fill="${c}"/><circle cx="12" cy="7.6" r="2.4" fill="${c}"/><path d="M12 9v9.5M7.8 11.5H4.5M7.8 15H4.5M16.2 11.5h3.3M16.2 15h3.3M10.5 6l-1.6-1.8M13.5 6l1.6-1.8" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9v9.5" stroke="#00000055" stroke-width="1.2"/>`, id === 'bug2' ? '#3d3000' : '#0b3a1e'); }
    case 'evento': return S2('<path d="M4.5 8.5h15v2.2a1.8 1.8 0 000 3.6v2.2h-15v-2.2a1.8 1.8 0 000-3.6z" fill="#ff5cc8"/><path d="M14.5 8.8v7.4" stroke="#fff" stroke-dasharray="1.4 1.2" stroke-width="1.2"/>', '#4a0d36');
    case 'apoiador': return S2('<path d="M12 19s-6.5-4-6.5-8.6A3.6 3.6 0 0112 8.3a3.6 3.6 0 016.5 2.1C18.5 15 12 19 12 19z" fill="#ff4d6d"/>', '#4a0d18');
    case 'pioneiro': return S2('<path d="M14.5 4.5c2.8.3 4.7 2.2 5 5l-6.3 6.3-5-5z" fill="#e8ecf5"/><circle cx="15.3" cy="8.7" r="1.4" fill="#3b82f6"/><path d="M8.2 10.8l-3 .6 2-3 3.3-.4M13.2 15.8l-.6 3 3-2 .4-3.3" fill="#93a4c3"/><path d="M8.6 15.4c-1.4.2-2.6 1.4-2.8 3.4 2-.2 3.2-1.4 3.4-2.8z" fill="#ff8a3d"/>', '#14233f');
    case 'chama': return S2('<path d="M12 3.8c.6 3-2.6 4.2-2.6 7.2 0 .9.4 1.6 1 2-.1-1.6 1-2.4 1.6-3.6 1.6 1.8 3.5 3.7 3.5 6.2a3.5 3.5 0 01-7 0c0-4.6 4.5-6.4 3.5-11.8z" fill="#ff5a3c"/><path d="M12 19.6a2 2 0 01-2-2c0-1.5 1.3-2.3 2-3.6.8 1.2 2 2.1 2 3.6a2 2 0 01-2 2z" fill="#ffd166"/>', '#3d0f08');
    case 'raio': return S2('<path d="M13.5 3.5L6.5 13h4.6l-1.6 7.5 7-9.6h-4.6z" fill="#ffd43b"/>', '#3a3000');
    case 'onda': return S2('<path d="M4 13.5c2.2 0 2.2-2.2 4.4-2.2s2.2 2.2 4.4 2.2 2.2-2.2 4.4-2.2c1.3 0 1.9.8 2.8 1.4M4 17.2c2.2 0 2.2-2.2 4.4-2.2s2.2 2.2 4.4 2.2 2.2-2.2 4.4-2.2c1.3 0 1.9.8 2.8 1.4" stroke="#4dabf7" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="7.5" r="2.3" fill="#a5d8ff"/>', '#0b2742');
  }
  return '';
}
function earnedBadges(p){
  if(!p) return [];
  const has = new Set(p.is_admin ? BADGES.map(b => b.id) : (p.badges || []));
  if(hasPlus(p)) has.add('plus');
  if(p.created_at && new Date(p.created_at) < new Date('2027-01-01')) has.add('pioneiro');
  if(p.house) has.add(p.house);
  return BADGES.filter(b => has.has(b.id));
}
/* insígnias que a pessoa escolheu mostrar (padrão: todas as conquistadas) */
function badgesOf(p){
  const all = earnedBadges(p);
  if(!p || !Array.isArray(p.shown_badges)) return all;
  return p.shown_badges.map(id => all.find(b => b.id === id)).filter(Boolean);
}
function badgeHtml(b, p, cls=''){
  const tier = b.id === 'plus' ? plusTier(p) : null;
  const desc = b.id === 'plus' ? (p.is_admin ? 'Vitalício' : 'Nível ' + TIERS[tier][2]) : b.desc;
  return `<span class="badge-i ${cls}" data-tip="${esc(b.nome)}" data-tipsub="${esc(desc)}">${badgeSvg(b.id, tier)}</span>`;
}
// tooltip das insígnias
document.addEventListener('mousedown', () => { const t = document.getElementById('tipEl'); if(t) t.remove(); });
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]');
  let tip = document.getElementById('tipEl');
  if(!t){ if(tip) tip.remove(); return; }
  if(!tip){ tip = document.createElement('div'); tip.id = 'tipEl'; tip.className = 'tip'; document.body.appendChild(tip); }
  tip.innerHTML = esc(t.dataset.tip) + (t.dataset.tipsub ? `<small>${esc(t.dataset.tipsub)}</small>` : '');
  const r = t.getBoundingClientRect(), w = tip.offsetWidth;
  if(t.dataset.tipside === 'r'){ tip.style.left = (r.right + 12) + 'px'; tip.style.top = (r.top + r.height/2 - tip.offsetHeight/2) + 'px'; return; }
  let top = r.top - tip.offsetHeight - 8; if(top < 4) top = r.bottom + 8;
  tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width/2 - w/2)) + 'px';
  tip.style.top = top + 'px';
});

/* ---------- cartão de perfil ---------- */
const LINKS = {
  instagram:['Instagram', u => 'https://instagram.com/' + u, '#e1306c'], tiktok:['TikTok', u => 'https://tiktok.com/@' + u, '#25f4ee'],
  youtube:['YouTube', u => 'https://youtube.com/@' + u, '#ff0000'], twitch:['Twitch', u => 'https://twitch.tv/' + u, '#9146ff'],
  x:['X', u => 'https://x.com/' + u, '#e7e9ea'], steam:['Steam', u => 'https://steamcommunity.com/id/' + u, '#66c0f4'],
  spotify:['Spotify', u => /^https?:/.test(u) ? u : 'https://open.spotify.com/user/' + u, '#1db954'], site:['Site', u => /^https?:/.test(u) ? u : 'https://' + u, '#9aa0aa'],
};
const PROFILE_FX = [['', 'Nenhum'], ['estrelas','✨ Estrelas'], ['coracoes','💗 Corações'], ['neve','❄️ Neve'], ['fogo','🔥 Brasas'], ['confete','🎉 Confete'], ['aurora','🌌 Aurora']];
const RINGS = [['', 'Nenhum'], ['arco','🌈 Arco-íris'], ['ouro','🥇 Ouro'], ['neon','💜 Neon'], ['fogo','🔥 Fogo'], ['gelo','🧊 Gelo']];
const NAME_STYLES = [['', 'Normal'], ['fogo','Fogo'], ['oceano','Oceano'], ['neon','Neon'], ['ouro','Ouro'], ['arco','Arco-íris']];
function nameHtml(p){
  const st = hasPlus(p) && p.name_style ? ` class="nst nst-${esc(p.name_style)}"` : '';
  return `<span${st}>${esc(p.display_name)}</span>`;
}
function fxLayerHtml(fx){
  if(!fx) return '';
  const glyph = { estrelas:'✦', coracoes:'♥', neve:'❄', fogo:'•', confete:'■' }[fx];
  if(fx === 'aurora') return '<div class="pfx aurora"></div>';
  return `<div class="pfx ${esc(fx)}">${Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(3 + (i % 5) * 0.7).toFixed(1)}s;--dl:-${(i * 0.53).toFixed(2)}s;--s:${0.7 + (i % 4) * 0.25}">${glyph}</i>`).join('')}</div>`;
}
function profileCard(p, extra=''){
  const plus = hasPlus(p);
  const themed = plus && p.theme_a;
  const banner = plus && p.banner_url ? `background-image:url('${esc(p.banner_url)}')` : `background:${esc(p.banner_color || p.avatar_color || '#ff6b4a')}`;
  const style = themed ? `background:linear-gradient(180deg,${esc(p.theme_a)},${esc(p.theme_b || p.theme_a)});--pc-bg:${esc(p.theme_a)}` : '';
  const bs = badgesOf(p);
  const links = (Array.isArray(p.links) ? p.links : []).filter(l => LINKS[l.t] && l.u);
  return `<div class="pcard2 ${themed?'themed':''}" style="${style}">
    ${plus ? fxLayerHtml(p.profile_fx) : ''}
    <div class="bn" style="${banner}"></div>
    <div class="avwrap">${avatar(p,'',true)}</div>
    <div class="bdg">${bs.length ? `<div class="badges">${bs.map(b => badgeHtml(b, p)).join('')}</div>` : ''}</div>
    <div class="inner">
      <b class="dn">${nameHtml(p)}${plus ? '<span class="plustag">TELÃO+</span>' : ''}</b>
      <div class="un">@${esc(p.username)}${p.pronouns ? ` · ${esc(p.pronouns)}` : ''}</div>
      ${p.custom_status ? `<div class="cst">${p.custom_emoji ? esc(p.custom_emoji) + ' ' : ''}${esc(p.custom_status)}</div>` : ''}
      ${p.bio ? `<h6>Sobre mim</h6><p>${esc(p.bio)}</p>` : ''}
      ${links.length ? `<div class="plinks">${links.map(l => `<a href="${esc(LINKS[l.t][1](l.u))}" target="_blank" rel="noopener" style="--lc:${LINKS[l.t][2]}"><i></i>${esc(LINKS[l.t][0])}</a>`).join('')}</div>` : ''}
      ${p.created_at ? `<h6>Membro desde</h6><p>${new Date(p.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}</p>` : ''}
      ${extra}
    </div></div>`;
}
/* cor média de uma imagem (para o fundo do avatar combinar com a foto) */
async function avgColor(file){
  try{
    const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0; for(let i = 0; i < d.length; i += 4){ r += d[i]; g += d[i+1]; b += d[i+2]; }
    const n = d.length / 4, h = v => Math.round(v / n * 0.8).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }catch(e){ return null; }
}

/* ---------- atalhos de teclado ---------- */
const KEYNAMES = { Backquote:'`', Space:'Espaço', Escape:'Esc', Enter:'Enter', Tab:'Tab', CapsLock:'Caps Lock', Backslash:'\\', Slash:'/', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']', Semicolon:'Ç', Quote:"'", Comma:',', Period:'.', IntlBackslash:'\\' };
function keyLabel(code){
  if(!code) return '';
  return code.split('+').map(k => ({ctrl:'Ctrl',shift:'Shift',alt:'Alt',meta:'⌘'}[k] || KEYNAMES[k] || k.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ').replace(/^Arrow/,'Seta '))).map(k => `<kbd>${esc(k)}</kbd>`).join(' + ');
}
const comboOf = e => [e.ctrlKey&&'ctrl', e.altKey&&'alt', e.shiftKey&&'shift', e.metaKey&&'meta'].filter(Boolean).concat(e.code).join('+');
let recordingKey = null;
window.addEventListener('keydown', e => {
  if(recordingKey){
    if(['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    const r = recordingKey; recordingKey = null;
    if(e.code === 'Escape'){ r.done(null); return; }
    r.done(r.single ? e.code : comboOf(e));
    return;
  }
  if(e.key === 'Escape'){
    if(!$('#modal').classList.contains('hidden')) return;
    if(SET){ closeSettings(); return; }
  }
  if(!S.me) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const combo = comboOf(e), hasMod = e.ctrlKey || e.altKey || e.metaKey;
  if(P.muteKey && combo === P.muteKey && (!typing || hasMod)){ e.preventDefault(); Voice.toggleMute(); ls.set('telao-muted', Voice.muted); renderUserPanel(); renderStage(); return; }
  if(P.deafKey && combo === P.deafKey && (!typing || hasMod)){ e.preventDefault(); Voice.toggleDeafen(); renderUserPanel(); renderStage(); return; }
  if(P.screenKey && combo === P.screenKey && (!typing || hasMod) && Voice.channel){ e.preventDefault(); Voice.screenStream ? Voice.stopScreen() : Voice.startScreen(); return; }
  if(P.mode === 'ptt' && !typing && e.code === P.pttKey && !e.repeat){ e.preventDefault(); Voice.setPtt(true); }
}, true);
window.addEventListener('keyup', e => { if(P.mode === 'ptt' && e.code === P.pttKey) Voice.setPtt(false); });
window.addEventListener('blur', () => Voice.setPtt(false));

/* ---------- moldura do painel ---------- */
let SET = null;
function openSettings(kind, sec, server){
  closeMenu(); closeModal();
  if(SET) closeSettings();
  const el = document.createElement('div'); el.className = 'settings'; document.body.appendChild(el);
  SET = { kind, sec: sec || (kind === 'user' ? 'account' : 'overview'), server, el, cleanups: [], mobileOpen: !!sec };
  renderSettings();
}
function closeSettings(){
  if(!SET) return;
  if(SET.dirty && !confirm('Você tem alterações não salvas. Sair mesmo assim?')) return;
  SET.cleanups.forEach(f => { try{ f(); }catch(e){} });
  SET.el.remove(); SET = null; recordingKey = null;
}
function setSec(sec){
  if(SET.dirty && !confirm('Você tem alterações não salvas. Descartar?')) return;
  SET.dirty = false; SET.sec = sec; SET.mobileOpen = true; renderSettings();
}
function renderSettings(){
  if(!SET) return;
  SET.cleanups.forEach(f => { try{ f(); }catch(e){} }); SET.cleanups = [];
  const me = S.me, plus = hasPlus(me);
  let nav;
  if(SET.kind === 'user'){
    nav = [
      ['h','Configurações de usuário'], ['account','Minha conta'], ['profile','Perfis'],
      ['plus', `<span style="display:inline-flex;width:18px;height:18px">${badgeSvg('plus', plusTier(me))}</span> Telão+`],
      ['h','Configurações do app'], ['appearance','Aparência'], ['voice','Voz e vídeo'], ['notif','Notificações'], ['keys','Teclas de atalho'], ['app','App e instalação'],
    ];
    if(me.is_admin) nav.push(['h','Administração'], ['admin','👑 Painel do admin']);
    nav.push(['hr'], ['logout','Sair', 'danger']);
  } else {
    const s = SET.server;
    nav = [['h', esc(s.name)]];
    if(App.hasPerm(s.id, 2)) nav.push(['overview','Visão geral']);
    if(App.hasPerm(s.id, 16)) nav.push(['roles','Cargos']);
    if(App.hasPerm(s.id, 1)) nav.push(['channels','Canais']);
    nav.push(['members','Membros']);
    if(App.hasPerm(s.id, 2)) nav.push(['invites','Convites']);
    if(s.owner_id === S.me.id) nav.push(['hr'], ['delete','Excluir servidor','danger']);
    if(!nav.find(n => n[0] === SET.sec)) SET.sec = (nav[1] || [])[0] || 'members';
  }
  SET.el.className = 'settings' + (SET.mobileOpen ? ' sec-open' : '');
  SET.el.innerHTML = `<nav class="snav"><div class="in">${nav.map(n =>
      n[0] === 'h' ? `<h5>${n[1]}</h5>` : n[0] === 'hr' ? '<hr>' :
      `<button class="si ${SET.sec===n[0]?'on':''} ${n[2]||''}" data-sec="${n[0]}">${n[1]}</button>`).join('')}
      ${SET.kind==='user' ? '<hr><div class="ver">Telão · versão 4.1</div>' : ''}</div></nav>
    <div class="scontent"><div class="sclose"><button id="sClose" title="Fechar (Esc)">✕</button><span>ESC</span></div><div class="in" id="sIn"></div></div>`;
  SET.el.querySelector('#sClose').onclick = () => { if(isMobile() && SET.mobileOpen){ SET.mobileOpen = false; renderSettings(); } else closeSettings(); };
  SET.el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => {
    const sec = b.dataset.sec;
    if(sec === 'logout') return doLogout();
    if(sec === 'delete') return deleteServer(SET.server).then(ok => ok !== false && SET && closeSettings());
    setSec(sec);
  });
  const box = SET.el.querySelector('#sIn');
  const back = isMobile() ? `<button class="btn sec sm mobileback" id="sBack">← Voltar</button>` : '';
  const fn = SET.kind === 'user'
    ? { account: secAccount, profile: secProfile, plus: secPlus, appearance: secAppearance, voice: secVoice, notif: secNotif, keys: secKeys, app: secApp, admin: secAdmin }[SET.sec]
    : { overview: secSrvOverview, roles: secSrvRoles, channels: secSrvChannels, members: secSrvMembers, invites: secSrvInvites }[SET.sec];
  if(fn) fn(box, back);
  const b = box.querySelector('#sBack'); if(b) b.onclick = () => { SET.mobileOpen = false; renderSettings(); };
}
const toggle = (id, on) => `<label class="sw"><input type="checkbox" id="${id}" ${on?'checked':''}><span></span></label>`;
const row = (title, desc, ctrl) => `<div class="srow"><div class="t"><b>${title}</b>${desc?`<small>${desc}</small>`:''}</div>${ctrl}</div>`;
async function doLogout(){
  if(!(await confirmBox('Sair', 'Tem certeza que quer sair da conta?', 'Sair'))) return;
  if(Voice.channel) await leaveVoice();
  await App.sb.auth.signOut();
}

/* ---------- Minha conta ---------- */
function secAccount(box, back){
  const p = S.me, u = S.authUser || {};
  const email = u.email || '';
  const masked = email.replace(/^(.)(.*)(@.*)$/, (m,a,b,c) => a + '*'.repeat(Math.min(b.length, 8)) + c);
  const provs = (u.app_metadata && u.app_metadata.providers) || [];
  box.innerHTML = `${back}<h2>Minha conta</h2>
    <div class="accard"><div class="banner" style="${hasPlus(p) && p.banner_url ? `background:url('${esc(p.banner_url)}') center/cover` : `background:${esc(p.banner_color || p.avatar_color)}`}"></div>
      <div class="top">${avatar(p,'',true)}<div class="nm"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div>
        <div class="badges" style="margin-bottom:12px">${badgesOf(p).map(b => badgeHtml(b,p)).join('')}</div>
        <button class="btn sm" id="aEdit" style="margin-bottom:12px">Editar perfil</button></div>
      <div class="body">
        <div class="kv"><div class="t"><small>Nome de exibição</small><span>${esc(p.display_name)}</span></div><button class="btn sec sm" data-go="profile">Editar</button></div>
        <div class="kv"><div class="t"><small>Nome de usuário</small><span>@${esc(p.username)}</span></div><button class="btn sec sm" id="aUser">Editar</button></div>
        <div class="kv"><div class="t"><small>E-mail</small><span id="aMail">${esc(masked)}</span> <a style="cursor:pointer;font-size:13px" id="aShow">Mostrar</a></div><button class="btn sec sm" id="aEmail">Editar</button></div>
        <div class="kv"><div class="t"><small>Entrar com</small><span>${provs.includes('google') ? 'Google' : ''}${provs.includes('google') && provs.includes('email') ? ' e ' : ''}${provs.includes('email') || !provs.length ? 'E-mail e senha' : ''}</span></div></div>
      </div></div>
    <hr class="sdiv"><h3>Senha</h3>
    ${row('Mudar senha', provs.includes('email') ? 'Recomendado trocar de vez em quando.' : 'Você entra com o Google. Crie uma senha para também entrar com e-mail.', `<button class="btn sm" id="aPass">${provs.includes('email') ? 'Mudar senha' : 'Criar senha'}</button>`)}
    <hr class="sdiv"><h3>Remoção de conta</h3>
    <div class="dangerbox"><div><b>Excluir conta</b><br><small>Apaga seu perfil, mensagens e servidores que você criou. Não tem volta.</small></div><button class="btn red sm" id="aDel">Excluir conta</button></div>`;
  box.querySelector('#aEdit').onclick = () => setSec('profile');
  box.querySelector('[data-go]').onclick = () => setSec('profile');
  box.querySelector('#aShow').onclick = e => { box.querySelector('#aMail').textContent = email; e.target.remove(); };
  box.querySelector('#aUser').onclick = () => modal(`<form id="uF"><div class="mh"><h2>Mudar nome de usuário</h2><p>Seus amigos usam ele para te adicionar.</p></div>
      <div class="mc"><label class="field"><span>Nome de usuário</span><input class="inp" id="uN" value="${esc(p.username)}" maxlength="24"></label><div class="err" id="uE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    m.querySelector('#uF').onsubmit = async e => {
      e.preventDefault();
      const { data, error } = await App.sb.rpc('set_username', { p_username: m.querySelector('#uN').value.replace(/^@/,'') });
      if(error){ m.querySelector('#uE').textContent = error.message; return; }
      S.me.username = data; S.profiles.set(S.me.id, S.me); closeModal(); renderSettings(); renderUserPanel(); App.toast('Nome de usuário alterado!');
    };
  });
  box.querySelector('#aEmail').onclick = () => modal(`<form id="eF"><div class="mh"><h2>Mudar e-mail</h2><p>Vamos mandar um link de confirmação para o novo e-mail.</p></div>
      <div class="mc"><label class="field"><span>Novo e-mail</span><input class="inp" type="email" id="eN" required></label><div class="err" id="eE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Enviar confirmação</button></div></form>`, m => {
    m.querySelector('#eF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.updateUser({ email: m.querySelector('#eN').value.trim() }, { emailRedirectTo: location.origin + '/' });
      if(error){ m.querySelector('#eE').textContent = error.message; return; }
      closeModal(); App.toast('📧 Confirme no seu novo e-mail para concluir a troca.');
    };
  });
  box.querySelector('#aPass').onclick = () => modal(`<form id="pF"><div class="mh"><h2>${provs.includes('email') ? 'Mudar senha' : 'Criar senha'}</h2></div>
      <div class="mc"><label class="field"><span>Nova senha</span><input class="inp" type="password" id="p1" minlength="6" required autocomplete="new-password"></label>
      <label class="field"><span>Confirme a nova senha</span><input class="inp" type="password" id="p2" minlength="6" required autocomplete="new-password"></label><div class="err" id="pE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    m.querySelector('#pF').onsubmit = async e => {
      e.preventDefault();
      const a = m.querySelector('#p1').value, b = m.querySelector('#p2').value;
      if(a !== b){ m.querySelector('#pE').textContent = 'As senhas não são iguais.'; return; }
      const { error } = await App.sb.auth.updateUser({ password: a });
      if(error){ m.querySelector('#pE').textContent = /reauth|recent/i.test(error.message) ? 'Por segurança, saia e entre de novo antes de trocar a senha.' : error.message; return; }
      closeModal(); App.toast('Senha salva! 🔒');
    };
  });
  box.querySelector('#aDel').onclick = () => modal(`<form id="dF"><div class="mh"><h2>Excluir conta</h2><p>Isso apaga tudo e não tem volta. Digite <b>${esc(p.username)}</b> para confirmar.</p></div>
      <div class="mc"><input class="inp" id="dN" autocomplete="off"></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn red">Excluir para sempre</button></div></form>`, m => {
    m.querySelector('#dF').onsubmit = async e => {
      e.preventDefault();
      if(m.querySelector('#dN').value.trim().toLowerCase() !== p.username){ App.toast('O nome não confere.', true); return; }
      if(Voice.channel) await leaveVoice();
      const { error } = await App.sb.rpc('delete_my_account');
      if(error){ App.toast(error.message, true); return; }
      await App.sb.auth.signOut();
    };
  });
}

/* ---------- Perfis ---------- */
function secProfile(box, back){
  const me = S.me, plus = hasPlus(me);
  const earned = earnedBadges(me);
  const D = { display_name: me.display_name, bio: me.bio || '', avatar_url: me.avatar_url || null, banner_url: me.banner_url || null,
              banner_color: me.banner_color || null, avatar_color: me.avatar_color, theme_a: me.theme_a || null, theme_b: me.theme_b || null,
              house: me.house || null, pronouns: me.pronouns || '', links: (Array.isArray(me.links) ? me.links : []).map(l => ({ ...l })),
              shown_badges: Array.isArray(me.shown_badges) ? [...me.shown_badges] : earned.map(b => b.id),
              profile_fx: me.profile_fx || null, avatar_ring: me.avatar_ring || null, name_style: me.name_style || null };
  const orig = JSON.stringify(D);
  const lockBox = what => `<div class="locked">${ic('lock',18)} ${what} <button class="btn sm" data-plus>Conhecer o Telão+</button></div>`;
  const chipRow = (id, list, cur) => `<div class="chips" id="${id}">${list.map(([v,l]) => `<button type="button" class="chip ${(cur||'')===v?'on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  box.innerHTML = `${back}<h2>Perfil</h2><div class="profgrid"><div>
    <div class="ptabs"><button class="on" data-pt="basico">Básico</button><button data-pt="visual">Visual</button><button data-pt="insignias">Insígnias</button><button data-pt="links">Links</button></div>

    <div data-pane="basico">
      <label class="field"><span>Nome de exibição</span><input class="inp" id="pfN" maxlength="32"></label>
      <label class="field"><span>Pronomes</span><input class="inp" id="pfPr" maxlength="30" placeholder="ex: ele/dele, ela/dela"></label>
      <label class="field"><span>Sobre mim</span><textarea class="inp" id="pfBio" maxlength="190" placeholder="Conte um pouco sobre você"></textarea><div class="counter" id="pfCnt"></div></label>
      <h3>Casa (insígnia grátis)</h3>
      <div class="chips" id="pfH">${[['', 'Nenhuma'], ['chama','Chama'], ['raio','Raio'], ['onda','Onda']].map(([v,l]) => `<button class="chip" data-h="${v}">${v ? `<span class="badge-i sm" style="margin:0">${badgeSvg(v)}</span>` : ''}${l}</button>`).join('')}</div>
    </div>

    <div data-pane="visual" class="hidden">
      <h3 style="margin-top:0">Avatar</h3>
      <div class="avedit"><div id="pfAvPrev"></div><div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfAv">${ic('image',16)} Enviar foto</button><button class="btn sec sm" id="pfAvRm">Remover foto</button></div>
        <small class="mut" style="display:block;margin-top:6px">PNG, JPG ou WEBP até ${plus?'8':'2'} MB. ${plus ? '<b style="color:#ffb39c">GIF animado liberado ✨</b>' : 'GIF animado é do <a data-plus style="cursor:pointer">Telão+</a>.'}</small>
      </div></div>
      <div id="pfAcBox"><h3>Cor do avatar <small class="mut" style="text-transform:none;font-weight:500">(só aparece quando não tem foto)</small></h3><div class="colors" id="pfAc">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
      <hr class="sdiv">
      <h3>Banner</h3>
      ${plus ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfBn">${ic('image',16)} Imagem ou GIF</button><button class="btn sec sm" id="pfBnRm">Remover</button></div>` : lockBox('Banner com imagem ou GIF é do Telão+.')}
      <h3>Cor do banner</h3><div class="colorrow"><input type="color" id="pfBc"><button class="btn sec sm" id="pfBcAuto">Automática</button></div>
      <hr class="sdiv">
      <h3>Tema do cartão ${plus?'':'🔒'}</h3>
      ${plus ? `<div class="colorrow"><label>Principal <input type="color" id="pfTa"></label><label>Destaque <input type="color" id="pfTb"></label><button class="btn sec sm" id="pfTrm">Sem tema</button></div>` : lockBox('Cores no cartão de perfil são do Telão+.')}
      <h3>Efeito no perfil ${plus?'':'🔒'}</h3>${plus ? chipRow('pfFx', PROFILE_FX, D.profile_fx) : lockBox('Partículas animadas no seu cartão.')}
      <h3>Anel do avatar ${plus?'':'🔒'}</h3>${plus ? chipRow('pfRing', RINGS, D.avatar_ring) : lockBox('Um anel animado em volta do seu avatar.')}
      <h3>Estilo do nome ${plus?'':'🔒'}</h3>${plus ? `<div class="chips" id="pfNs">${NAME_STYLES.map(([v,l]) => `<button type="button" class="chip ${(D.name_style||'')===v?'on':''}" data-v="${v}"><span class="${v?'nst nst-'+v:''}">${l}</span></button>`).join('')}</div>` : lockBox('Nome com gradiente colorido no chat.')}
    </div>

    <div data-pane="insignias" class="hidden">
      <p class="mut small" style="margin-bottom:12px">Escolha quais das suas insígnias aparecem no seu perfil. Você conquistou <b>${earned.length}</b>.</p>
      <div class="bpick" id="pfBp">${earned.map(b => `<label class="bpi"><input type="checkbox" data-b="${b.id}"><span class="badge-i">${badgeSvg(b.id, b.id==='plus'?plusTier(me):null)}</span><div><b>${esc(b.nome)}</b><small>${esc(b.id==='plus' ? (me.is_admin?'Vitalício':TIERS[plusTier(me)][2]) : b.desc)}</small></div></label>`).join('') || '<div class="empty">Você ainda não tem insígnias. Escolha uma Casa na aba Básico para ganhar a primeira!</div>'}</div>
      ${earned.length ? '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn sec sm" id="pfBAll">Mostrar todas</button><button class="btn sec sm" id="pfBNone">Esconder todas</button></div>' : ''}
    </div>

    <div data-pane="links" class="hidden">
      <p class="mut small" style="margin-bottom:12px">Até 5 links que aparecem no seu cartão.</p>
      <div id="pfLinks"></div>
      <button class="btn sec sm" id="pfLAdd">${ic('plus',16)} Adicionar link</button>
    </div>

    <input type="file" id="pfFile" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
    <div id="pfSave"></div>
  </div><div><h3 style="margin-top:0">Prévia</h3><div class="pcard" id="pfPrev"></div></div></div>`;
  const $b = q => box.querySelector(q);
  box.querySelectorAll('[data-pt]').forEach(t => t.onclick = () => {
    box.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x === t));
    box.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.pt));
  });
  const draft = () => ({ ...me, ...D, banner_color: D.banner_color || null });
  const setDirty = () => {
    const changed = JSON.stringify(D) !== orig;
    SET.dirty = changed;
    $b('#pfSave').innerHTML = changed ? `<div class="savebar"><span>Você tem alterações não salvas</span><button class="btn sec sm" id="pfReset">Desfazer</button><button class="btn ok sm" id="pfOk">Salvar</button></div>` : '';
    if(changed){ $b('#pfReset').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#pfOk').onclick = save; }
  };
  const drawLinks = () => {
    $b('#pfLinks').innerHTML = D.links.map((l, i) => `<div class="lrow"><select class="inp" data-lt="${i}">${Object.entries(LINKS).map(([k, v]) => `<option value="${k}" ${l.t===k?'selected':''}>${v[0]}</option>`).join('')}</select>
      <input class="inp" data-lu="${i}" value="${esc(l.u||'')}" placeholder="${l.t==='site'?'seusite.com':'seu usuário'}" maxlength="100"><button class="ibtn" data-lx="${i}">${ic('trash',16)}</button></div>`).join('');
    $b('#pfLAdd').disabled = D.links.length >= 5;
    box.querySelectorAll('[data-lt]').forEach(x => x.onchange = () => { D.links[+x.dataset.lt].t = x.value; refresh(); });
    box.querySelectorAll('[data-lu]').forEach(x => x.oninput = () => { D.links[+x.dataset.lu].u = x.value.trim().replace(/^@/, ''); refresh(true); });
    box.querySelectorAll('[data-lx]').forEach(x => x.onclick = () => { D.links.splice(+x.dataset.lx, 1); drawLinks(); refresh(); });
  };
  const refresh = (noLinks) => {
    const d = draft();
    $b('#pfPrev').innerHTML = profileCard(d);
    $b('#pfAvPrev').innerHTML = avatar(d, 'xl');
    $b('#pfAcBox').classList.toggle('hidden', !!D.avatar_url);
    box.querySelectorAll('#pfAc [data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === D.avatar_color));
    box.querySelectorAll('#pfH [data-h]').forEach(x => x.classList.toggle('on', (x.dataset.h || null) === (D.house || null)));
    box.querySelectorAll('#pfBp [data-b]').forEach(x => x.checked = D.shown_badges.includes(x.dataset.b));
    $b('#pfCnt').textContent = (190 - D.bio.length) + ' restantes';
    setDirty();
  };
  $b('#pfN').value = D.display_name; $b('#pfBio').value = D.bio; $b('#pfPr').value = D.pronouns; $b('#pfBc').value = D.banner_color || D.avatar_color || '#ff6b4a';
  $b('#pfN').oninput = e => { D.display_name = e.target.value; refresh(); };
  $b('#pfBio').oninput = e => { D.bio = e.target.value; refresh(); };
  $b('#pfPr').oninput = e => { D.pronouns = e.target.value; refresh(); };
  $b('#pfBc').oninput = e => { D.banner_color = e.target.value; refresh(); };
  $b('#pfBcAuto').onclick = () => { D.banner_color = null; $b('#pfBc').value = D.avatar_color; refresh(); };
  box.querySelectorAll('#pfAc [data-c]').forEach(x => x.onclick = () => { D.avatar_color = x.dataset.c; refresh(); });
  box.querySelectorAll('#pfH [data-h]').forEach(x => x.onclick = () => {
    const old = D.house; D.house = x.dataset.h || null;
    D.shown_badges = D.shown_badges.filter(b => b !== old); if(D.house && !D.shown_badges.includes(D.house)) D.shown_badges.push(D.house);
    refresh();
  });
  box.querySelectorAll('#pfBp [data-b]').forEach(x => x.onchange = () => {
    const id = x.dataset.b;
    D.shown_badges = x.checked ? earned.map(b => b.id).filter(b => b === id || D.shown_badges.includes(b)) : D.shown_badges.filter(b => b !== id);
    refresh();
  });
  if($b('#pfBAll')){ $b('#pfBAll').onclick = () => { D.shown_badges = earned.map(b => b.id); refresh(); }; $b('#pfBNone').onclick = () => { D.shown_badges = []; refresh(); }; }
  $b('#pfLAdd').onclick = () => { if(D.links.length < 5){ D.links.push({ t:'instagram', u:'' }); drawLinks(); refresh(); } };
  box.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => setSec('plus'));
  if(plus){
    $b('#pfTa').value = D.theme_a || '#3b1d6e'; $b('#pfTb').value = D.theme_b || '#ff6b4a';
    $b('#pfTa').oninput = e => { D.theme_a = e.target.value; D.theme_b = D.theme_b || $b('#pfTb').value; refresh(); };
    $b('#pfTb').oninput = e => { D.theme_b = e.target.value; D.theme_a = D.theme_a || $b('#pfTa').value; refresh(); };
    $b('#pfTrm').onclick = () => { D.theme_a = D.theme_b = null; refresh(); };
    $b('#pfBnRm').onclick = () => { D.banner_url = null; refresh(); };
    [['#pfFx','profile_fx'],['#pfRing','avatar_ring'],['#pfNs','name_style']].forEach(([id, key]) => box.querySelectorAll(id + ' [data-v]').forEach(c => c.onclick = () => {
      D[key] = c.dataset.v || null; box.querySelectorAll(id + ' [data-v]').forEach(x => x.classList.toggle('on', x === c)); refresh();
    }));
  }
  let target = 'avatar';
  $b('#pfAv').onclick = () => { target = 'avatar'; $b('#pfFile').click(); };
  if(plus) $b('#pfBn').onclick = () => { target = 'banner'; $b('#pfFile').click(); };
  $b('#pfAvRm').onclick = () => { D.avatar_url = null; refresh(); };
  $b('#pfFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    const gif = f.type === 'image/gif';
    if(gif && !plus){ upsell('GIF animado no avatar'); return; }
    const max = (plus ? 8 : 2) * 1024 * 1024;
    if(f.size > max){ App.toast(`Arquivo muito grande (máx. ${plus?8:2} MB).${plus?'':' Com o Telão+ vai até 8 MB.'}`, true); return; }
    App.toast('Enviando…');
    let url;
    try{
      if(target === 'avatar') url = await uploadSquare(f, 'avatar', 256);
      else {
        let blob = f, type = f.type;
        if(!gif){ const c = await compressImage(f); blob = c.blob; type = c.type; }
        const path = `${me.id}/banner-${Date.now().toString(36)}.${type.split('/')[1].replace('jpeg','jpg')}`;
        const { error } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if(error) throw error;
        url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
      }
    }catch(err){ App.toast('Não deu para enviar: ' + err.message, true); return; }
    if(target === 'avatar'){ D.avatar_url = url; const c = await avgColor(f); if(c) D.avatar_color = c; }
    else D.banner_url = url;
    App.toast('Pronto! Clique em “Salvar”.');
    refresh();
  };
  async function save(){
    const all = earned.map(b => b.id);
    const shown = D.shown_badges.length === all.length && all.every(b => D.shown_badges.includes(b)) ? null : D.shown_badges;
    const upd = { display_name: D.display_name.trim() || me.username, bio: D.bio.trim(), pronouns: D.pronouns.trim() || null,
                  avatar_url: D.avatar_url, banner_url: D.banner_url, banner_color: D.banner_color, avatar_color: D.avatar_color,
                  theme_a: D.theme_a, theme_b: D.theme_b, house: D.house, shown_badges: shown,
                  links: D.links.filter(l => l.u).slice(0, 5), profile_fx: D.profile_fx, avatar_ring: D.avatar_ring, name_style: D.name_style };
    const { data, error } = await App.sb.from('profiles').update(upd).eq('id', me.id).select().single();
    if(error){ App.toast(error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data);
    SET.dirty = false; App.toast('Perfil salvo! ✨');
    renderSettings(); renderUserPanel(); renderMembers(); if(M.el) renderMsgList(false);
  }
  drawLinks(); refresh();
}
function upsell(what){
  modal(`<div class="mh"><h2>✨ Isso é do Telão+</h2><p>${esc(what)} faz parte do <b>Telão+</b>, por ${PRICE_TXT}/mês.</p></div>
    <div class="mc" style="text-align:center"><div style="display:inline-flex;width:64px;height:64px">${badgeSvg('plus','diamante')}</div></div>
    <div class="mf"><button class="btn sec" data-close>Agora não</button><button class="btn" id="upGo">Conhecer o Telão+</button></div>`, m => {
    m.querySelector('#upGo').onclick = () => { closeModal(); if(SET) setSec('plus'); else openSettings('user','plus'); };
  });
}

/* ---------- Telão+ ---------- */
function secPlus(box, back){
  const me = S.me, plus = hasPlus(me), tier = plusTier(me);
  const until = me.plan_until ? new Date(me.plan_until).toLocaleDateString('pt-BR') : '';
  box.innerHTML = `${back}
    <div class="plushero">
      <h1><span style="display:inline-flex;width:44px;height:44px">${badgeSvg('plus', plus ? tier : 'diamante')}</span>Telão+</h1>
      <p>Turbine seu perfil e suas transmissões.</p>
      ${plus ? `<div class="status">✅ ${me.is_admin ? 'Vitalício — você é o admin 👑' : 'Ativo até ' + until} · Insígnia ${TIERS[tier][2].split(' ')[0]}</div><br>` : ''}
      <div class="price"><b>${PRICE_TXT}</b> / mês · Pix ou cartão</div>
      ${me.is_admin ? '' : CFG.PAYMENTS ? `<button class="btn" id="plBuy">${plus ? 'Renovar +30 dias' : 'Assinar o Telão+'}</button>`
        : `<button class="btn" disabled style="opacity:.75">Em breve</button><div style="margin-top:10px;font-size:14px;opacity:.95">O pagamento online ainda não está disponível. Quer o Telão+ agora? Fale com o admin do Telão para ativar pelo Pix.</div>`}
      <div id="plMsg" style="margin-top:12px;font-size:14px"></div>
    </div>
    <div class="perks">
      <div class="perk"><div class="e">🎞️</div><b>Avatar animado</b><small>Use GIF no seu avatar.</small></div>
      <div class="perk"><div class="e">🖼️</div><b>Banner personalizado</b><small>Imagem ou GIF no topo do seu perfil.</small></div>
      <div class="perk"><div class="e">🎨</div><b>Tema do perfil</b><small>Escolha as cores do seu cartão de perfil.</small></div>
      <div class="perk"><div class="e">💎</div><b>Insígnia que evolui</b><small>Bronze → Prata → Ouro → Diamante com o tempo de assinatura.</small></div>
      <div class="perk"><div class="e">📺</div><b>Tela em alta</b><small>Transmita em 1080p 60fps, 1440p e até 4K, com até 20 Mbps.</small></div>
      <div class="perk"><div class="e">📦</div><b>Uploads maiores</b><small>Imagens de até 8 MB (grátis: 2 MB).</small></div>
    </div>
    <h3>Compare</h3>
    <table class="cmp"><tr><th></th><th>Grátis</th><th>Telão+</th></tr>
      <tr><td>Chat, voz e amigos</td><td>✅</td><td>✅</td></tr>
      <tr><td>Compartilhar tela com som</td><td>Até 1080p 30fps</td><td>Até 4K · 1440p 60fps</td></tr>
      <tr><td>Avatar</td><td>Imagem</td><td>Imagem ou GIF</td></tr>
      <tr><td>Banner do perfil</td><td>Cor</td><td>Imagem ou GIF</td></tr>
      <tr><td>Tema do perfil</td><td>—</td><td>✅</td></tr>
      <tr><td>Insígnia Telão+</td><td>—</td><td>✅</td></tr>
      <tr><td>Tamanho de upload</td><td>2 MB</td><td>8 MB</td></tr></table>
    <h3>Seus pagamentos</h3><div id="plPays" style="color:var(--mut);font-size:14px">Carregando…</div>`;
  const buy = box.querySelector('#plBuy');
  if(buy) buy.onclick = async () => {
    buy.disabled = true; const msg = box.querySelector('#plMsg'); msg.textContent = 'Abrindo o pagamento…';
    try{
      const { data, error } = await App.sb.functions.invoke('telao-checkout', { body: {} });
      if(error || !data || !data.url){
        let m = (data && data.error) || '';
        try{ if(!m && error && error.context && error.context.json) m = (await error.context.json()).error; }catch(e){}
        msg.innerHTML = '⚠️ ' + esc(m || 'O pagamento automático ainda não foi ativado.') + '<br>Fale com o admin do Telão para ativar seu plano pelo Pix.';
        buy.disabled = false; return;
      }
      location.href = data.url;
    }catch(e){ msg.textContent = '⚠️ ' + e.message; buy.disabled = false; }
  };
  App.sb.from('payments').select('*').eq('user_id', me.id).order('created_at', { ascending:false }).limit(20).then(({ data }) => {
    const el = box.querySelector('#plPays'); if(!el) return;
    const rows = (data || []).filter(x => !String(x.id).endsWith(':liberado'));
    const st = { approved:'✅ Aprovado', pending:'⏳ Pendente', in_process:'⏳ Em análise', rejected:'❌ Recusado', cancelled:'❌ Cancelado', refunded:'↩️ Devolvido' };
    el.innerHTML = rows.length ? `<table class="paytable">${rows.map(x => `<tr><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>R$ ${Number(x.amount||0).toFixed(2).replace('.',',')}</td><td>${st[x.status] || esc(x.status)}</td></tr>`).join('')}</table>` : 'Nenhum pagamento ainda.';
  });
}

/* ---------- Aparência ---------- */
function secAppearance(box, back){
  box.innerHTML = `${back}<h2>Aparência</h2>
    <h3>Tema</h3>
    <div class="themes">${[['dark','Escuro','#313338'],['amoled','Preto (AMOLED)','#000'],['light','Claro','#fff']].map(([v,l,c]) => `<button data-t="${v}" class="${P.theme===v?'on':''}"><span class="sw2" style="background:${c}"></span>${l}</button>`).join('')}</div>
    <h3>Cor de destaque</h3>
    <div class="accents">${['#ff6b4a','#ff3d7f','#ffb020','#2bd17e','#14b8a6','#38bdf8','#6366f1','#a855f7','#e879f9','#f43f5e','#84cc16','#a3a3a3'].map(c => `<button data-acc="${c}" class="${(P.accent||'#ff6b4a')===c?'on':''}" style="background:${c}"></button>`).join('')}<input type="color" id="apAcc" value="${esc(P.accent||'#ff6b4a')}" title="Escolher outra cor"></div>
    <hr class="sdiv"><h3>Tamanho da fonte das conversas · <span id="apFs">${P.fontSize}px</span></h3>
    <input type="range" class="range" id="apR" min="12" max="20" step="1" value="${P.fontSize}">
    <hr class="sdiv">
    ${row('Modo compacto', 'Mostra mais mensagens na tela, com avatares menores.', toggle('apC', P.compact))}
    <h3>Prévia</h3>
    <div style="background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:6px 0">
      <div class="msg first">${avatar(S.me,'lg')}<div class="bd"><div class="hd"><b style="color:${esc(S.me.avatar_color)}">${esc(S.me.display_name)}</b><time>Hoje às 21:00</time></div><div class="ct">bora jogar? vou compartilhar a tela 🎮</div></div></div>
      <div class="msg"><div class="gap">21:00</div><div class="bd"><div class="ct">entra no canal Telão!</div></div></div>
    </div>`;
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { P.theme = b.dataset.t; savePrefs(); renderSettings(); });
  box.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { P.accent = b.dataset.acc; savePrefs(); renderSettings(); });
  box.querySelector('#apAcc').oninput = e => { P.accent = e.target.value; savePrefs(); };
  box.querySelector('#apR').oninput = e => { P.fontSize = +e.target.value; box.querySelector('#apFs').textContent = P.fontSize + 'px'; savePrefs(); };
  box.querySelector('#apC').onchange = e => { P.compact = e.target.checked; savePrefs(); };
}

/* ---------- Voz e vídeo ---------- */
function secVoice(box, back){
  const plus = hasPlus(S.me), st = Voice.screenSettings, q = `${st.w}x${st.h}x${st.fps}`;
  const resOpts = [['1280x720x30','720p · 30fps',0],['1920x1080x30','1080p · 30fps',0],['1920x1080x60','1080p · 60fps',1],['2560x1440x60','1440p · 60fps',1],['3840x2160x30','4K · 30fps',1]];
  const brOpts = [[2500000,'2,5 Mbps',0],[5000000,'5 Mbps',0],[8000000,'8 Mbps',0],[12000000,'12 Mbps',1],[20000000,'20 Mbps',1]];
  box.innerHTML = `${back}<h2>Voz e vídeo</h2>
    <h3>Configurações de voz</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <label class="field"><span>Dispositivo de entrada</span><select class="inp" id="vIn"><option value="">Padrão</option></select></label>
      <label class="field"><span>Dispositivo de saída</span><select class="inp" id="vOut"><option value="">Padrão</option></select></label>
    </div>
    <label class="field"><span>Câmera</span><select class="inp" id="vCam"><option value="">Padrão</option></select></label>
    <div id="vPerm"></div>
    <h3>Testar microfone</h3>
    <div style="display:flex;gap:12px;align-items:center"><button class="btn sm" id="vTest">Vamos verificar</button><div class="meter"><i id="vLvl"></i><span class="th" id="vTh"></span></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:14px;color:var(--txt2)">${toggle('vLoop', false)} Ouvir minha própria voz durante o teste (use fone!)</label>
    <hr class="sdiv"><h3>Modo de entrada</h3>
    <div class="chips"><button class="chip ${P.mode==='vad'?'on':''}" data-m="vad">🎙️ Detecção de voz</button><button class="chip ${P.mode==='ptt'?'on':''}" data-m="ptt">⌨️ Pressionar para falar</button></div>
    <div id="vPttInfo" style="margin-top:10px;font-size:14px;color:var(--txt2)">${P.mode==='ptt' ? `Segure <span class="keycap">${keyLabel(P.pttKey)}</span> para falar. <a style="cursor:pointer" data-go="keys">Trocar tecla</a>` : ''}</div>
    <h3>Sensibilidade do indicador de fala</h3>
    <input type="range" class="range" id="vSens" min="1" max="30" value="${P.sensitivity}">
    <small style="color:var(--mut)">A linha amarela no medidor é o limite: acima dela, seu avatar acende de verde.</small>
    <hr class="sdiv"><h3>Processamento de voz</h3>
    ${row('Supressão de ruído', 'Corta barulhos de fundo (ventilador, teclado).', toggle('vNoise', P.noise))}
    ${row('Cancelamento de eco', 'Evita que seus amigos ouçam o próprio eco.', toggle('vEcho', P.echo))}
    ${row('Controle automático de ganho', 'Ajusta o volume do seu microfone sozinho.', toggle('vAgc', P.agc))}
    <hr class="sdiv"><h3>Transmissão de tela ${plus ? '<span class="plustag">TELÃO+</span>' : ''}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <label class="field"><span>Resolução</span><select class="inp" id="vRes">${resOpts.map(([v,l,pl]) => `<option value="${v}" ${v===q?'selected':''} ${pl&&!plus?'disabled':''}>${l}${pl&&!plus?' 🔒':''}</option>`).join('')}</select></label>
      <label class="field"><span>Bitrate máximo</span><select class="inp" id="vBr">${brOpts.map(([v,l,pl]) => `<option value="${v}" ${v===st.bitrate?'selected':''} ${pl&&!plus?'disabled':''}>${l}${pl&&!plus?' 🔒':''}</option>`).join('')}</select></label>
      <label class="field"><span>Otimizar para</span><select class="inp" id="vMode"><option value="motion" ${st.mode==='motion'?'selected':''}>🎮 Fluidez</option><option value="detail" ${st.mode==='detail'?'selected':''}>📝 Nitidez</option></select></label>
    </div>
    ${plus ? '' : `<div class="locked">🔒 1080p 60fps, 1440p, 4K e até 20 Mbps são do Telão+. <button class="btn sm" data-plus>Conhecer</button></div>`}
    <small style="color:var(--mut);display:block;margin-top:8px">O bitrate vale para cada pessoa assistindo e usa a internet (upload) de quem transmite.</small>
    <hr class="sdiv"><h3>Sons</h3>
    ${row('Sons de entrar, sair e mutar', '', toggle('vSnd', P.soundVoice))}
    ${row('Bipe ao apertar o botão de falar', 'Só no modo “Pressionar para falar”.', toggle('vSndP', P.soundPtt))}`;
  const $b = s => box.querySelector(s);
  box.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => setSec('plus'));
  box.querySelectorAll('[data-go]').forEach(x => x.onclick = () => setSec(x.dataset.go));
  async function fillDevices(){
    try{
      const devs = await navigator.mediaDevices.enumerateDevices();
      const ins = devs.filter(d => d.kind === 'audioinput'), outs = devs.filter(d => d.kind === 'audiooutput');
      const noLabels = ins.length && !ins[0].label;
      $b('#vIn').innerHTML = '<option value="">Padrão</option>' + ins.filter(d => d.deviceId !== 'default').map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.inputId?'selected':''}>${esc(d.label || 'Microfone ' + (i+1))}</option>`).join('');
      $b('#vOut').innerHTML = '<option value="">Padrão</option>' + outs.filter(d => d.deviceId !== 'default').map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.outputId?'selected':''}>${esc(d.label || 'Saída ' + (i+1))}</option>`).join('');
      const cams = devs.filter(d => d.kind === 'videoinput');
      $b('#vCam').innerHTML = '<option value="">Padrão</option>' + cams.map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.camId?'selected':''}>${esc(d.label || 'Câmera ' + (i+1))}</option>`).join('');
      if(!('setSinkId' in HTMLMediaElement.prototype)){ $b('#vOut').disabled = true; $b('#vOut').innerHTML = '<option>Seu navegador não permite escolher</option>'; }
      $b('#vPerm').innerHTML = noLabels ? `<div class="locked" style="border-color:var(--line)">Para ver os nomes dos dispositivos, permita o microfone. <button class="btn sm" id="vAllow">Permitir</button></div>` : '';
      const al = $b('#vAllow'); if(al) al.onclick = async () => { try{ (await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop()); }catch(e){} fillDevices(); };
    }catch(e){}
  }
  fillDevices();
  $b('#vCam').onchange = e => { P.camId = e.target.value; savePrefs(); if(Voice.camStream){ Voice.stopCamera(true); Voice.startCamera(); } };
  $b('#vIn').onchange = e => { P.inputId = e.target.value; savePrefs(); Voice.switchMic(); if(test) startTest(); };
  $b('#vOut').onchange = e => { P.outputId = e.target.value; savePrefs(); Voice.applySink(); if(loopEl && loopEl.setSinkId) loopEl.setSinkId(P.outputId).catch(()=>{}); };
  box.querySelectorAll('[data-m]').forEach(c => c.onclick = () => { P.mode = c.dataset.m; savePrefs(); Voice.applyMicState(); renderSettings(); });
  const th = () => { $b('#vTh').style.left = Math.min(100, P.sensitivity / 30 * 100 * 0.6) + '%'; };
  th();
  $b('#vSens').oninput = e => { P.sensitivity = +e.target.value; savePrefs(); th(); };
  const proc = (id, key) => $b(id).onchange = e => { P[key] = e.target.checked; savePrefs(); Voice.switchMic(); if(test) startTest(); };
  proc('#vNoise','noise'); proc('#vEcho','echo'); proc('#vAgc','agc');
  $b('#vSnd').onchange = e => { P.soundVoice = e.target.checked; savePrefs(); };
  $b('#vSndP').onchange = e => { P.soundPtt = e.target.checked; savePrefs(); };
  const scr = () => {
    const [w,h,fps] = $b('#vRes').value.split('x').map(Number);
    const ns = clampScreen({ w, h, fps, bitrate: +$b('#vBr').value, mode: $b('#vMode').value });
    Voice.updateScreenSettings(ns); ls.set('telao-screen', ns); App.toast('Qualidade da tela atualizada');
  };
  ['#vRes','#vBr','#vMode'].forEach(s => $b(s).onchange = scr);
  // teste de microfone
  let test = null, raf = 0, ctx = null, loopEl = null;
  function stopTest(){
    cancelAnimationFrame(raf); if(test) test.getTracks().forEach(t => t.stop()); test = null;
    if(loopEl){ loopEl.srcObject = null; loopEl.remove(); loopEl = null; }
    if(ctx){ ctx.close().catch(()=>{}); ctx = null; }
    const b = $b('#vTest'); if(b) b.textContent = 'Vamos verificar';
    const l = $b('#vLvl'); if(l) l.style.width = '0';
  }
  async function startTest(){
    stopTest();
    try{ test = await Voice.getMic(); }catch(e){ App.toast('Sem acesso ao microfone: ' + e.message, true); return; }
    $b('#vTest').textContent = 'Parar teste';
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(test).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf); let sum = 0; for(const x of buf){ const d = x - 128; sum += d*d; }
      const rms = Math.sqrt(sum / buf.length);
      const l = $b('#vLvl'); if(!l) return;
      l.style.width = Math.min(100, rms / 30 * 100 * 0.6 * 1) + '%';
      l.style.background = rms > P.sensitivity ? 'var(--ok)' : 'var(--mut)';
      raf = requestAnimationFrame(loop);
    };
    loop();
    if($b('#vLoop').checked) startLoop();
    fillDevices();
  }
  function startLoop(){
    if(!test) return;
    loopEl = document.createElement('audio'); loopEl.autoplay = true; loopEl.srcObject = test; document.body.appendChild(loopEl);
    if(P.outputId && loopEl.setSinkId) loopEl.setSinkId(P.outputId).catch(()=>{});
  }
  $b('#vTest').onclick = () => test ? stopTest() : startTest();
  $b('#vLoop').onchange = e => { if(e.target.checked) startLoop(); else if(loopEl){ loopEl.srcObject = null; loopEl.remove(); loopEl = null; } };
  SET.cleanups.push(stopTest);
}

/* ---------- Notificações ---------- */
function secNotif(box, back){
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  box.innerHTML = `${back}<h2>Notificações</h2>
    ${row('Notificações no computador/celular', perm === 'granted' ? '✅ Ativadas neste aparelho.' : perm === 'denied' ? '❌ Bloqueadas. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço).' : perm === 'unsupported' ? 'Não suportado neste navegador.' : 'Receba avisos mesmo com o Telão em segundo plano.',
          perm === 'default' ? '<button class="btn sm" id="nAsk">Ativar</button>' : '')}
    <h3>Me avise sobre</h3>
    ${row('Mensagens diretas', '', toggle('nDM', P.notifDM))}
    ${row('Menções (@' + esc(S.me.username) + ')', 'Quando alguém te marca num canal.', toggle('nMen', P.notifMention))}
    ${row('Chamadas recebidas', '', toggle('nCall', P.notifCall))}
    <h3>Sons</h3>
    ${row('Som de nova mensagem', '', toggle('nSnd', P.soundMsg))}`;
  const a = box.querySelector('#nAsk'); if(a) a.onclick = async () => { await Notification.requestPermission(); renderSettings(); };
  [['#nDM','notifDM'],['#nMen','notifMention'],['#nCall','notifCall'],['#nSnd','soundMsg']].forEach(([s,k]) => box.querySelector(s).onchange = e => { P[k] = e.target.checked; savePrefs(); });
}

/* ---------- Teclas de atalho ---------- */
function secKeys(box, back){
  const items = [['muteKey','Silenciar / ativar microfone',false],['deafKey','Ensurdecer / ativar áudio',false],['screenKey','Compartilhar / parar tela',false],['pttKey','Pressionar para falar',true]];
  box.innerHTML = `${back}<h2>Teclas de atalho</h2>
    <p style="color:var(--txt2);font-size:14px;margin-bottom:10px">Os atalhos funcionam com o Telão aberto e em foco (é uma limitação dos navegadores). Use Ctrl/Alt nos atalhos para funcionarem até enquanto você digita.</p>
    ${items.map(([k,l,single]) => row(l, single ? (P.mode==='ptt' ? 'Segure a tecla para falar.' : 'Ative o modo “Pressionar para falar” em Voz e vídeo.') : '',
      `<div style="display:flex;gap:8px;align-items:center"><span class="keycap">${P[k] ? keyLabel(P[k]) : '<span style="color:var(--mut);font-size:13px">Nenhum</span>'}</span>
       <button class="btn sec sm keybtn" data-k="${k}" data-s="${single?1:0}">Editar atalho</button>${P[k] ? `<button class="ibtn" data-clr="${k}" title="Remover">✕</button>` : ''}</div>`)).join('')}
    <hr class="sdiv">${row('Restaurar padrões', '', '<button class="btn sec sm" id="kRst">Restaurar</button>')}`;
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    box.querySelectorAll('.keybtn').forEach(x => x.classList.remove('rec'));
    b.classList.add('rec'); b.textContent = 'Aperte as teclas… (Esc cancela)';
    recordingKey = { single: b.dataset.s === '1', done: code => { if(code){ P[b.dataset.k] = code; savePrefs(); } renderSettings(); } };
  });
  box.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => { P[b.dataset.clr] = ''; savePrefs(); renderSettings(); });
  box.querySelector('#kRst').onclick = () => { ['muteKey','deafKey','screenKey','pttKey'].forEach(k => P[k] = PDEF[k]); savePrefs(); renderSettings(); };
  SET.cleanups.push(() => { recordingKey = null; });
}

/* ---------- App ---------- */
function secApp(box, back){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  box.innerHTML = `${back}<h2>App e instalação</h2>
    ${row('Instalar o Telão', standalone ? '✅ Você está usando o app instalado.' : S.installEvt ? 'Instale como app: ícone próprio, janela separada e abre mais rápido.' : ios ? 'No iPhone: Compartilhar → <b>Adicionar à Tela de Início</b>.' : 'No Chrome/Edge: ícone de instalar na barra de endereço, ou menu ⋮ → <b>Instalar Telão</b>.',
          S.installEvt && !standalone ? '<button class="btn sm" id="apInst">📲 Instalar</button>' : '')}
    ${row('Limpar cache do app', 'Use se uma atualização não aparecer.', '<button class="btn sec sm" id="apClr">Limpar e recarregar</button>')}
    <hr class="sdiv"><small style="color:var(--mut)">Telão · versão 4.1</small>`;
  const i = box.querySelector('#apInst'); if(i) i.onclick = doInstall;
  box.querySelector('#apClr').onclick = async () => {
    try{ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }catch(e){}
    location.reload();
  };
}

/* ---------- Painel do admin ---------- */
function secAdmin(box, back){
  if(!S.me.is_admin){ box.innerHTML = 'Sem acesso.'; return; }
  box.innerHTML = `${back}<h2>👑 Painel do admin</h2>
    <p style="color:var(--txt2);font-size:14px">Dê o Telão+ (ex: quem pagou por Pix) e insígnias para qualquer pessoa.</p>
    <h3>📢 Aviso para todos</h3>
    <p class="mut small" style="margin-bottom:8px">Aparece na hora para todo mundo que está com o Telão aberto (no topo da tela, com som).</p>
    <textarea class="inp" id="avT" maxlength="200" rows="2">Saiu uma atualização nova do Telão! Clique em "Atualizar agora" para ver as novidades 🎉</textarea>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap"><label style="display:flex;gap:8px;align-items:center;font-size:14px">${toggle('avR', true)} Mostrar botão “Atualizar agora”</label><span class="grow"></span><button class="btn" id="avGo">${ic('send',16)} Enviar para todos</button></div>
    <hr class="sdiv">
    <h3>Procurar usuário</h3>
    <input class="inp" id="adQ" placeholder="nome de usuário ou nome" autocomplete="off">
    <div class="slist adminres" id="adRes" style="margin-top:10px"></div>
    <div id="adUser"></div>
    <hr class="sdiv"><h3>Últimos pagamentos</h3><div id="adPays" style="font-size:14px;color:var(--mut)">Carregando…</div>`;
  const $b = s => box.querySelector(s);
  $b('#avGo').onclick = async () => {
    const t = $b('#avT').value.trim(); if(!t){ App.toast('Escreva o aviso.', true); return; }
    if(!(await confirmBox('Enviar aviso', `Mandar para todo mundo que está online agora?<br><br><i>“${esc(t)}”</i>`, 'Enviar', false))) return;
    await App.sendAviso(t, $b('#avR').checked);
    App.toast('📢 Aviso enviado para todos que estão online!');
  };
  let tmr;
  $b('#adQ').oninput = e => { clearTimeout(tmr); const q = e.target.value.trim().replace(/[%,()]/g,''); tmr = setTimeout(async () => {
    if(q.length < 2){ $b('#adRes').innerHTML = ''; return; }
    const { data } = await App.sb.from('profiles').select('*').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(10);
    (data || []).forEach(p => S.profiles.set(p.id, p));
    $b('#adRes').innerHTML = (data || []).map(p => `<div class="item" data-u="${p.id}">${avatar(p)}<b>${esc(p.display_name)}</b><span style="color:var(--mut)">@${esc(p.username)}</span><span class="grow"></span>${hasPlus(p)?'<span class="plustag">TELÃO+</span>':''}</div>`).join('') || '<div style="color:var(--mut)">Ninguém encontrado.</div>';
    box.querySelectorAll('[data-u]').forEach(r => r.onclick = () => showUser(r.dataset.u));
  }, 250); };
  function showUser(uid){
    const p = S.profiles.get(uid);
    const until = p.plan_until && new Date(p.plan_until) > new Date() ? 'Ativo até ' + new Date(p.plan_until).toLocaleDateString('pt-BR') : 'Sem plano';
    $b('#adUser').innerHTML = `<hr class="sdiv"><div class="profgrid"><div>
        <h3 style="margin-top:0">Telão+ · ${p.is_admin ? 'Admin (vitalício)' : until}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-days="30">+30 dias</button><button class="btn sm" data-days="90">+90 dias</button><button class="btn sm" data-days="365">+1 ano</button><button class="btn red sm" data-days="0">Remover plano</button></div>
        <h3>Insígnias</h3>
        ${GRANTABLE.map(id => { const b = BADGES.find(x => x.id === id); return `<label style="display:flex;align-items:center;gap:10px;padding:6px 0"><input type="checkbox" data-b="${id}" ${(p.badges||[]).includes(id)?'checked':''} style="accent-color:var(--acc);width:18px;height:18px"><span class="badge-i">${badgeSvg(id)}</span>${b.nome}</label>`; }).join('')}
        <button class="btn ok sm" id="adSaveB" style="margin-top:8px">Salvar insígnias</button>
      </div><div>${profileCard(p)}</div></div>`;
    box.querySelectorAll('[data-days]').forEach(b => b.onclick = async () => {
      const { error } = await App.sb.rpc('admin_set_plus', { p_user: uid, p_days: +b.dataset.days });
      if(error){ App.toast(error.message, true); return; }
      await refetch(uid); App.toast(+b.dataset.days ? 'Telão+ liberado! 💎' : 'Plano removido.'); showUser(uid);
    });
    $b('#adSaveB').onclick = async () => {
      const list = [...box.querySelectorAll('[data-b]')].filter(x => x.checked).map(x => x.dataset.b);
      const { error } = await App.sb.rpc('admin_set_badges', { p_user: uid, p_badges: list });
      if(error){ App.toast(error.message, true); return; }
      await refetch(uid); App.toast('Insígnias salvas!'); showUser(uid);
    };
  }
  async function refetch(uid){ const { data } = await App.sb.from('profiles').select('*').eq('id', uid).single(); if(data){ S.profiles.set(uid, data); if(uid === S.me.id) S.me = data; } }
  App.sb.from('payments').select('*').order('created_at', { ascending:false }).limit(30).then(async ({ data }) => {
    const rows = (data || []).filter(x => !String(x.id).endsWith(':liberado'));
    await ensureProfiles(rows.map(x => x.user_id));
    const el = $b('#adPays'); if(!el) return;
    el.innerHTML = rows.length ? `<table class="paytable">${rows.map(x => `<tr><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(prof(x.user_id).display_name)}</td><td>R$ ${Number(x.amount||0).toFixed(2).replace('.',',')}</td><td>${esc(x.status)}</td></tr>`).join('')}</table>` : 'Nenhum pagamento ainda.';
  });
}

/* ---------- Configurações do servidor ---------- */
function secSrvOverview(box, back){
  const s = SET.server;
  const D = { name: s.name, icon_color: s.icon_color, icon_url: s.icon_url || null, description: s.description || '' };
  box.innerHTML = `${back}<h2>Visão geral do servidor</h2>
    <div class="ovrow"><div><label class="upicon big" id="soIcon" style="--sc:${esc(s.icon_color)}"></label>
      <div class="ovbtns"><button class="btn sm" id="soUp">Enviar imagem</button>${'<button class="btn sm sec" id="soRm">Remover</button>'}</div><input type="file" id="soFile" accept="image/*" hidden>
      <small class="mut">Mínimo 128×128. GIF animado só com Telão+.</small></div>
    <div style="flex:1"><label class="field"><span>Nome do servidor</span><input class="inp" id="soN" maxlength="40"></label>
      <label class="field"><span>Descrição</span><textarea class="inp" id="soD" maxlength="200" rows="3" placeholder="Sobre o que é este servidor?"></textarea></label></div></div>
    <h3>Cor do ícone</h3><div class="colors" id="soC">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    <div id="soSave"></div>`;
  const $b = q => box.querySelector(q);
  $b('#soN').value = D.name; $b('#soD').value = D.description;
  const draw = () => {
    $b('#soIcon').style.setProperty('--sc', D.icon_color);
    $b('#soIcon').innerHTML = D.icon_url ? `<img src="${esc(D.icon_url)}" alt="">` : `<span>${esc(serverInitials(D.name || '?'))}</span>`;
    box.querySelectorAll('#soC [data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === D.icon_color));
    const dirty = D.name.trim() !== s.name || D.icon_color !== s.icon_color || (D.icon_url||null) !== (s.icon_url||null) || D.description.trim() !== (s.description || ''); SET.dirty = dirty;
    $b('#soSave').innerHTML = dirty ? `<div class="savebar"><span>Cuidado — você tem alterações não salvas!</span><button class="btn sec sm" id="soR">Redefinir</button><button class="btn ok sm" id="soOk">Salvar alterações</button></div>` : '';
    if(dirty){ $b('#soR').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#soOk').onclick = save; }
  };
  $b('#soN').oninput = e => { D.name = e.target.value; draw(); };
  $b('#soD').oninput = e => { D.description = e.target.value; draw(); };
  box.querySelectorAll('#soC [data-c]').forEach(b => b.onclick = () => { D.icon_color = b.dataset.c; draw(); });
  $b('#soUp').onclick = () => $b('#soFile').click();
  $b('#soRm').onclick = () => { D.icon_url = null; draw(); };
  $b('#soFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    if(f.type === 'image/gif' && !hasPlus(S.me)){ upsell('Ícone de servidor animado'); return; }
    App.toast('Enviando…');
    try{ D.icon_url = await uploadSquare(f, 'server', 256); draw(); }catch(err){ App.toast(err.message, true); }
  };
  async function save(){
    const name = D.name.trim(); if(!name) return;
    const { error } = await App.sb.from('servers').update({ name, icon_color: D.icon_color, icon_url: D.icon_url, description: D.description.trim() || null }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    SET.dirty = false; await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s;
    renderRail(); renderSidebar(); renderSettings(); App.toast('Servidor atualizado!');
  }
  draw();
}
function secSrvRoles(box, back){
  const s = SET.server, isOwner = s.owner_id === S.me.id;
  const roles = S.roles.get(s.id) || [];
  let sel = SET.roleSel && roles.find(r => r.id === SET.roleSel) ? SET.roleSel : (roles[0] || {}).id;
  box.innerHTML = `${back}<h2>Cargos</h2><p class="mut" style="margin:-8px 0 16px;font-size:14px">Use cargos para organizar a galera e dar poderes. A cor do cargo pinta o nome da pessoa.</p>
    <div class="rolegrid"><div class="rolelist">${roles.map(r => `<button class="ritem ${r.id===sel?'on':''}" data-r="${r.id}"><i style="background:${esc(r.color)}"></i>${esc(r.name)}<small>${[...(S.memberRoles.get(s.id)||new Map()).values()].filter(x => x.has(r.id)).length}</small></button>`).join('')}
      <button class="btn sm" id="rNew">${ic('plus',16)} Criar cargo</button></div>
    <div id="rEdit">${roles.length ? '' : `<div class="empty">${ic('shield',44)}<p>Nenhum cargo ainda. Crie o primeiro, por exemplo “Moderador”.</p></div>`}</div></div>`;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { SET.roleSel = b.dataset.r; renderSettings(); });
  box.querySelector('#rNew').onclick = async () => {
    const { data, error } = await App.sb.from('server_roles').insert({ server_id: s.id, name: 'novo cargo', color: COLORS[Math.floor(Math.random()*COLORS.length)], position: roles.length + 1, perms: 0 }).select().single();
    if(error){ App.toast(error.message, true); return; }
    await loadRoles(s.id); SET.roleSel = data.id; renderSettings();
  };
  const r = roles.find(x => x.id === sel); if(!r) return;
  const locked = !isOwner && (r.perms & 48);
  const D = { name: r.name, color: r.color, perms: r.perms, hoist: r.hoist };
  const ed = box.querySelector('#rEdit');
  ed.innerHTML = `${locked ? `<div class="locked" style="border-color:var(--warn)">${ic('lock',18)} Só o dono do servidor pode editar este cargo.</div>` : ''}
    <label class="field"><span>Nome do cargo</span><input class="inp" id="rN" maxlength="32" value="${esc(r.name)}" ${locked?'disabled':''}></label>
    <label class="field"><span>Cor</span><div class="colors" id="rC">${COLORS.concat(['#99aab5']).map(c => `<button type="button" data-c="${c}" class="${c===r.color?'on':''}" style="background:${c}" ${locked?'disabled':''}></button>`).join('')}<input type="color" id="rCC" value="${esc(r.color)}" ${locked?'disabled':''}></div></label>
    ${row('Mostrar separado na lista de membros', 'Quem tem este cargo aparece num grupo próprio.', toggle('rH', r.hoist))}
    <h3>Permissões</h3>
    ${PERMS.map(([bit, n, d]) => row(n + (bit & 48 && !isOwner ? ' 🔒' : ''), d, toggle('rp' + bit, r.perms & bit))).join('')}
    <div class="rolefoot"><button class="btn red sm" id="rDel" ${locked?'disabled':''}>${ic('trash',16)} Apagar cargo</button><span class="grow"></span><button class="btn ok" id="rSave" ${locked?'disabled':''}>Salvar cargo</button></div>`;
  if(locked) ed.querySelectorAll('input').forEach(i => i.disabled = true);
  PERMS.forEach(([bit]) => { if(bit & 48 && !isOwner){ const cb = ed.querySelector('#rp' + bit); if(cb) cb.disabled = true; } });
  ed.querySelectorAll('#rC [data-c]').forEach(b => b.onclick = () => { D.color = b.dataset.c; ed.querySelectorAll('#rC [data-c]').forEach(x => x.classList.toggle('on', x === b)); ed.querySelector('#rCC').value = D.color; });
  ed.querySelector('#rCC').oninput = e => { D.color = e.target.value; ed.querySelectorAll('#rC [data-c]').forEach(x => x.classList.remove('on')); };
  ed.querySelector('#rSave').onclick = async () => {
    let perms = 0; PERMS.forEach(([bit]) => { if(ed.querySelector('#rp' + bit).checked) perms |= bit; });
    const { error } = await App.sb.from('server_roles').update({ name: ed.querySelector('#rN').value.trim() || 'cargo', color: D.color, perms, hoist: ed.querySelector('#rH').checked }).eq('id', r.id);
    if(error){ App.toast(error.message, true); return; }
    await loadRoles(s.id); renderSettings(); renderMembers(); renderSidebar(); App.toast('Cargo salvo!');
  };
  ed.querySelector('#rDel').onclick = async () => {
    if(!(await confirmBox('Apagar cargo', `Apagar o cargo <b>${esc(r.name)}</b>? Quem tem ele perde as permissões.`, 'Apagar'))) return;
    const { error } = await App.sb.from('server_roles').delete().eq('id', r.id);
    if(error){ App.toast(error.message, true); return; }
    SET.roleSel = null; await loadRoles(s.id); renderSettings(); renderMembers();
  };
}
function secSrvChannels(box, back){
  const s = SET.server;
  const list = (S.channels.get(s.id) || []).slice().sort((a,b) => a.position - b.position);
  const group = kind => list.filter(c => c.kind === kind).map(c => `<div class="item" data-id="${c.id}"><span class="ic">${kind==='text'?'#':'🔊'}</span>
      <input value="${esc(c.name)}" maxlength="40" data-rn="${c.id}"><button class="ibtn" data-up="${c.id}" title="Subir">↑</button><button class="ibtn" data-dn="${c.id}" title="Descer">↓</button><button class="ibtn" data-del="${c.id}" title="Apagar">🗑️</button></div>`).join('') || '<div style="color:var(--mut);font-size:14px">Nenhum.</div>';
  box.innerHTML = `${back}<h2>Canais</h2>
    <h3>Canais de texto</h3><div class="slist">${group('text')}</div><button class="btn sec sm" data-new="text" style="margin-top:6px">+ Canal de texto</button>
    <h3>Canais de voz</h3><div class="slist">${group('voice')}</div><button class="btn sec sm" data-new="voice" style="margin-top:6px">+ Canal de voz</button>`;
  const reload = async () => { await loadChannels(s.id); renderSidebar(); if(SET) renderSettings(); };
  box.querySelectorAll('[data-rn]').forEach(inp => {
    const save = async () => {
      const c = list.find(x => x.id === inp.dataset.rn); let v = inp.value.trim();
      if(c.kind === 'text') v = v.toLowerCase().replace(/\s+/g,'-');
      if(!v || v === c.name){ inp.value = c.name; return; }
      const { error } = await App.sb.from('channels').update({ name: v }).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      App.toast('Canal renomeado'); reload();
    };
    inp.onblur = save; inp.onkeydown = e => { if(e.key === 'Enter') inp.blur(); };
  });
  const move = async (id, dir) => {
    const c = list.find(x => x.id === id); const same = list.filter(x => x.kind === c.kind);
    const i = same.indexOf(c), j = i + dir; if(j < 0 || j >= same.length) return;
    const o = same[j];
    const a = c.position === o.position ? i : c.position, b = c.position === o.position ? j : o.position;
    await App.sb.from('channels').update({ position: b }).eq('id', c.id);
    await App.sb.from('channels').update({ position: a }).eq('id', o.id);
    reload();
  };
  box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
  box.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => move(b.dataset.dn, 1));
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const c = list.find(x => x.id === b.dataset.del);
    if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>?`, 'Apagar'))) return;
    const { error } = await App.sb.from('channels').delete().eq('id', c.id);
    if(error) App.toast(error.message, true); else reload();
  });
  box.querySelectorAll('[data-new]').forEach(b => b.onclick = () => createChannelModal(s, b.dataset.new));
}
async function secSrvMembers(box, back){
  const s = SET.server;
  box.innerHTML = `${back}<h2>Membros</h2><input class="inp" id="smQ" placeholder="Procurar membro"><div class="slist" id="smL" style="margin-top:12px">Carregando…</div>`;
  await loadMembers(s.id);
  const draw = () => {
    const q = box.querySelector('#smQ').value.toLowerCase();
    const mem = (S.members.get(s.id) || []).map(m => ({ ...m, p: prof(m.user_id) }))
      .filter(m => !q || m.p.display_name.toLowerCase().includes(q) || m.p.username.includes(q))
      .sort((a,b) => (b.user_id === s.owner_id) - (a.user_id === s.owner_id) || a.p.display_name.localeCompare(b.p.display_name));
    box.querySelector('#smL').innerHTML = `<div style="color:var(--mut);font-size:13px;margin-bottom:8px">${mem.length} membro(s)</div>` + mem.map(m => `<div class="item">${avatar(m.p,'',true)}<b>${esc(m.p.display_name)}</b><span style="color:var(--mut)">@${esc(m.p.username)}</span>
      ${badgesOf(m.p).slice(0,4).map(b => badgeHtml(b, m.p, 'sm')).join('')}<span class="grow"></span>
      ${rolesOf(s.id, m.user_id).map(r => `<span class="rpill sm"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>`).join('')}
      ${App.hasPerm(s.id, 16) ? `<button class="btn sec sm" data-roles="${m.user_id}">${ic('shield',14)} Cargos</button>` : ''}
      ${m.user_id === s.owner_id ? `<span class="crown">${ic('crown',14)} Dono</span>` : App.hasPerm(s.id, 4) ? `<button class="btn red sm" data-kick="${m.user_id}">Expulsar</button>` : ''}</div>`).join('');
    box.querySelectorAll('[data-roles]').forEach(b => b.onclick = e => App.roleAssignMenu(s, b.dataset.roles, e.clientX, e.clientY));
    box.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
      const p = prof(b.dataset.kick);
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', p.id);
      if(error){ App.toast(error.message, true); return; }
      await loadMembers(s.id); draw(); renderMembers();
    });
  };
  box.querySelector('#smQ').oninput = draw; draw();
}
function secSrvInvites(box, back){
  const s = SET.server, link = location.origin + '/#convite=' + s.invite_code;
  box.innerHTML = `${back}<h2>Convites</h2>
    <p style="color:var(--txt2);font-size:14px;margin-bottom:14px">Quem abrir o link (ou digitar o código) entra no servidor.</p>
    <div class="codebig">${esc(s.invite_code)}</div>
    <div class="copyrow"><input class="inp" readonly value="${esc(link)}"><button class="btn" id="siC">Copiar link</button></div>
    <hr class="sdiv">${row('Gerar novo convite', 'O link antigo para de funcionar na hora. Use se ele vazou.', '<button class="btn red sm" id="siR">Gerar novo</button>')}`;
  box.querySelector('#siC').onclick = () => copy(link);
  box.querySelector('#siR').onclick = async () => {
    const { data, error } = await App.sb.rpc('regenerate_invite', { p_server: s.id });
    if(error){ App.toast(error.message, true); return; }
    s.invite_code = data; renderSettings(); App.toast('Novo convite gerado!');
  };
}

/* ---------------- PWA ---------------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); S.installEvt = e;
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
window.addEventListener('appinstalled', () => { $('#install').classList.add('hidden'); App.toast('Telão instalado! 🎉'); });

window.addEventListener('beforeunload', () => { try{ Voice.channel && Voice.leave(); }catch(e){} });
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/convite=([a-z0-9]+)/i);
  if(m && S.me){ history.replaceState(null, '', location.pathname); inviteJoinPrompt(m[1].toLowerCase()); }
});

boot();
})();

