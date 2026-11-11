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

const S = {
  me: null, profiles: new Map(), servers: [], channels: new Map(), members: new Map(),
  friends: [], dms: [], dmActivity: ls.get('telao-dmact', {}), online: new Set(),
  route: { kind:'home', dm:null }, lastChannel: ls.get('telao-last', {}),
  unread: new Set(ls.get('telao-unread', [])), friendTab: 'online',
  vp: new Map(), vpCh: new Map(), focus: null, videoEls: new Map(),
  installEvt: null, started: false, ringing: null, pendingInvite: null
};
const App = window.App = { sb: null, get me(){ return S.me; }, S };

/* ---------------- utilidades ---------------- */
App.toast = (t, err) => {
  const el = $('#toast'); el.textContent = t; el.className = 'toast' + (err ? ' err' : '');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), err ? 6000 : 3200);
};
App.needAudioUnlock = () => $('#unlock').classList.remove('hidden');
$('#unlock').onclick = () => { Voice.unlockAudio(); $('#unlock').classList.add('hidden'); };

let sfxCtx = null;
App.sfx = (type) => {
  try{
    if(!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    const seq = { join:[[523,.08],[784,.12]], leave:[[784,.08],[523,.12]], mute:[[392,.08]], unmute:[[587,.08]],
                  msg:[[880,.06],[1175,.08]], ring:[[660,.18],[0,.06],[880,.18],[0,.06],[660,.18]] }[type];
    if(!seq) return;
    let t = sfxCtx.currentTime;
    seq.forEach(([f,d]) => {
      if(f){ const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t+.01); g.gain.exponentialRampToValueAtTime(.0001, t+d);
        o.connect(g).connect(sfxCtx.destination); o.start(t); o.stop(t+d+.02); }
      t += d;
    });
  }catch(e){}
};

const prof = id => S.profiles.get(id) || { id, display_name:'…', username:'…', avatar_color:'#4e5058' };
const initials = p => (p.display_name || p.username || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
function avatar(p, cls='', status=false){
  return `<div class="av ${cls}" style="background:${esc(p.avatar_color||'#5865f2')}">${esc(initials(p))}${status?`<span class="st ${S.online.has(p.id)?'on':''}"></span>`:''}</div>`;
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
function richText(t){
  let h = esc(t);
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1<i>$2</i>');
  h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, url => {
    const img = /\.(png|jpe?g|gif|webp)(\?[^\s]*)?$/i.test(url);
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>` + (img ? `<img class="embed" src="${url}" loading="lazy" alt="">` : '');
  });
  if(S.me) h = h.replace(new RegExp('@'+S.me.username+'\\b','g'), m => `<b style="background:#4b4280;padding:0 3px;border-radius:3px">${m}</b>`);
  return h;
}
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
function menu(x, y, items){
  const el = $('#menu');
  el.innerHTML = items.map((it,i) => it === '-' ? '<hr>' : it.html ? `<div style="padding:6px 10px">${it.html}</div>` : `<button data-i="${i}" class="${it.danger?'danger':''}">${esc(it.label)}<span>${it.icon||''}</span></button>`).join('');
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
  App.sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true } });
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
  authMode = mode; $('#authErr').textContent = '';
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
function authError(msg){
  const map = { 'Invalid login credentials':'E-mail ou senha incorretos.', 'Email not confirmed':'Confirme seu e-mail antes de entrar (veja sua caixa de entrada e o spam).',
    'User already registered':'Esse e-mail já tem uma conta.', 'Password should be at least 6 characters.':'A senha precisa de pelo menos 6 caracteres.' };
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
      const { data, error } = await App.sb.auth.signUp({ email, password, options:{ data:{ username, display_name }, emailRedirectTo: location.origin } });
      if(error){ authError(error.message); return; }
      if(!data.session){ $('#authErr').style.color = '#7ee2a8'; $('#authErr').textContent = 'Conta criada! Enviamos um link para '+email+'. Confirme e depois entre aqui.'; setAuthMode('login'); }
    } else {
      const { error } = await App.sb.auth.signInWithPassword({ email, password });
      if(error){ authError(error.message); return; }
    }
  } finally { btn.disabled = false; }
};

/* ---------------- início ---------------- */
async function start(session){
  const uid = session.user.id;
  const { data: me, error } = await App.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if(error || !me){
    $('#auth').classList.remove('hidden'); $('#authErr').textContent = 'Seu perfil não foi encontrado. Você rodou o supabase.sql no banco? ' + (error ? error.message : '');
    S.started = false; return;
  }
  S.me = me; S.profiles.set(me.id, me);
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  Voice.onChange = onVoiceChange; Voice.onSpeaking = onSpeaking;
  Object.assign(Voice.screenSettings, ls.get('telao-screen', {}));
  Voice.muted = ls.get('telao-muted', false);

  await Promise.all([loadServers(), loadFriends(), loadDms()]);
  subscribeRealtime();

  const saved = ls.get('telao-route', null);
  if(saved && saved.kind === 'server' && S.servers.find(s => s.id === saved.sid)) S.route = saved;
  else if(saved && saved.kind === 'home' && (!saved.dm || S.dms.find(d => d.id === saved.dm))) S.route = saved;
  await go(S.route, true);
  if(S.pendingInvite) inviteJoinPrompt(S.pendingInvite);
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
  await Promise.all(S.servers.map(s => loadChannels(s.id)));
}
async function loadChannels(sid){
  const { data } = await App.sb.from('channels').select('*').eq('server_id', sid).order('position').order('created_at');
  S.channels.set(sid, data || []);
}
async function loadMembers(sid){
  const { data } = await App.sb.from('server_members').select('user_id, role').eq('server_id', sid);
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
    .on('postgres_changes', { event:'*', schema:'public', table:'channels' }, onChannelEvent)
    .on('postgres_changes', { event:'*', schema:'public', table:'friendships' }, async () => { await loadFriends(); renderRail(); if(S.route.kind==='home'){ renderSidebar(); refreshFriends(); } })
    .on('postgres_changes', { event:'*', schema:'public', table:'server_members' }, onMemberEvent)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles' }, p => { S.profiles.set(p.new.id, p.new); if(p.new.id===S.me.id) S.me=p.new; renderLight(); })
    .on('postgres_changes', { event:'*', schema:'public', table:'servers' }, async () => { await loadServers(); renderRail(); renderSidebar(); })
    .subscribe();

  const on = sb.channel('online', { config:{ presence:{ key: S.me.id } } });
  on.on('presence', { event:'sync' }, () => { S.online = new Set(Object.keys(on.presenceState())); renderLight(); })
    .subscribe(st => { if(st === 'SUBSCRIBED') on.track({ at: Date.now() }); });

  sb.channel('user:'+S.me.id)
    .on('broadcast', { event:'ring' }, ({payload}) => onRing(payload))
    .on('broadcast', { event:'ring-cancel' }, ({payload}) => { if(S.ringing && S.ringing.channel_id === payload.channel_id) stopRing(); })
    .on('broadcast', { event:'ring-decline' }, ({payload}) => { App.toast(prof(payload.from).display_name + ' recusou a chamada.'); })
    .subscribe();
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
      // sons de entrar/sair no meu canal
      if(Voice.channel && Voice.topic === topic){
        const mine = l => new Set(l.filter(m => m.voice === Voice.channel.id && m.session !== Voice.SESSION).map(m => m.session));
        const a = mine(prev), b = mine(metas);
        if([...b].some(x => !a.has(x))) App.sfx('join');
        else if([...a].some(x => !b.has(x))) App.sfx('leave');
      }
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
      const mention = S.me && m.content.includes('@'+S.me.username);
      if((ch && ch.kind === 'dm') || mention){
        App.sfx('msg');
        notify(prof(m.author_id).display_name + (ch && ch.kind!=='dm' ? ' em #'+ch.name : ''), m.content, m.channel_id);
      }
      renderRail(); renderSidebar();
    }
    if(ch && ch.kind === 'dm' && S.route.kind === 'home') renderSidebar();
  } else if(p.eventType === 'UPDATE'){
    const i = M.list.findIndex(x => x.id === p.new.id);
    if(i >= 0){ M.list[i] = p.new; renderMsgList(false); }
  } else if(p.eventType === 'DELETE'){
    const i = M.list.findIndex(x => x.id === p.old.id);
    if(i >= 0){ M.list.splice(i, 1); renderMsgList(false); }
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

/* ---------------- notificações ---------------- */
function notify(title, body, cid){
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
    if(!S.members.has(route.sid)) loadMembers(route.sid).then(renderMembers);
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

/* ---------------- barra de servidores ---------------- */
function renderRail(){
  const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
  const dmUnread = S.dms.filter(d => S.unread.has(d.id)).length;
  const homeBadge = pend + dmUnread;
  let h = `<button class="ricon home ${S.route.kind==='home'?'on':''}" id="rHome" title="Mensagens diretas">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M4 5h16v11H8l-4 4z" opacity=".95"/><circle cx="9" cy="10.5" r="1.3" fill="#6c5cff"/><circle cx="15" cy="10.5" r="1.3" fill="#6c5cff"/></svg>
      ${homeBadge ? `<span class="badge">${homeBadge}</span>` : ''}</button><div class="rsep"></div>`;
  S.servers.forEach(s => {
    const on = S.route.kind === 'server' && S.route.sid === s.id;
    const unread = (S.channels.get(s.id) || []).some(c => S.unread.has(c.id));
    h += `<button class="ricon ${on?'on':''}" data-sid="${s.id}" title="${esc(s.name)}" style="${on?`background:${esc(s.icon_color)}`:''}">${esc(serverInitials(s.name))}${unread && !on ? '<span class="dotu"></span>' : ''}</button>`;
  });
  h += `<button class="ricon add" id="rAdd" title="Criar ou entrar num servidor">+</button>`;
  $('#rail').innerHTML = h;
  $('#rHome').onclick = () => go({ kind:'home', dm: S.route.kind==='home' ? S.route.dm : null }, true);
  $('#rAdd').onclick = addServerModal;
  $$('#rail [data-sid]').forEach(b => {
    b.onclick = () => go({ kind:'server', sid: b.dataset.sid }, true);
    b.onmouseenter = () => { const s = S.servers.find(x => x.id === b.dataset.sid); if(s && !b.classList.contains('on')) b.style.background = s.icon_color; };
    b.onmouseleave = () => { if(!b.classList.contains('on')) b.style.background = ''; };
  });
}

/* ---------------- barra lateral ---------------- */
function renderSidebar(){
  if(!S.me) return;
  const head = $('#sbHead'), body = $('#sbBody');
  if(S.route.kind === 'home'){
    head.innerHTML = `<span class="nm">Mensagens</span>`; head.onclick = null;
    const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
    const dms = [...S.dms].sort((a,b) => (S.dmActivity[b.id] || b.created_at).localeCompare(S.dmActivity[a.id] || a.created_at));
    body.innerHTML = `
      <div class="ch ${!S.route.dm?'on':''}" id="sbFriends"><span class="ic">👥</span><span class="nm">Amigos</span>${pend?`<span class="live" style="background:var(--bad)">${pend}</span>`:''}</div>
      <div class="cat"><span>Mensagens diretas</span><button id="sbNewDm" title="Nova conversa">+</button></div>
      ${dms.length ? dms.map(d => { const p = prof(dmOther(d)); const call = voiceUsers(d).length;
        return `<div class="dmitem ${S.route.dm===d.id?'on':''} ${S.unread.has(d.id)?'unread':''}" data-dm="${d.id}">${avatar(p,'',true)}<span class="nm">${esc(p.display_name)}</span>${call?'<span title="Em chamada">🔊</span>':''}</div>`; }).join('')
        : '<div class="empty" style="padding:20px 8px">Adicione amigos para conversar 👋</div>'}`;
    $('#sbFriends').onclick = () => go({ kind:'home', dm:null });
    $('#sbNewDm').onclick = () => { S.friendTab = 'all'; go({ kind:'home', dm:null }); };
    body.querySelectorAll('[data-dm]').forEach(el => el.onclick = () => go({ kind:'home', dm: el.dataset.dm }));
    return;
  }
  const s = curServer(); if(!s){ go({kind:'home', dm:null}); return; }
  const owner = s.owner_id === S.me.id;
  head.innerHTML = `<span class="nm">${esc(s.name)}</span><span>▾</span>`;
  head.onclick = e => serverMenu(s, e);
  const list = S.channels.get(s.id) || [];
  const text = list.filter(c => c.kind === 'text'), voice = list.filter(c => c.kind === 'voice');
  let h = `<div class="cat"><span>Canais de texto</span>${owner?'<button data-new="text" title="Criar canal">+</button>':''}</div>`;
  h += text.map(c => `<div class="ch ${S.route.cid===c.id?'on':''} ${S.unread.has(c.id)?'unread':''}" data-cid="${c.id}"><span class="ic">#</span><span class="nm">${esc(c.name)}</span>${owner?`<button class="x" data-del="${c.id}" title="Apagar canal">✕</button>`:''}</div>`).join('');
  h += `<div class="cat"><span>Canais de voz</span>${owner?'<button data-new="voice" title="Criar canal">+</button>':''}</div>`;
  h += voice.map(c => {
    const users = voiceUsers(c);
    return `<div class="ch ${S.route.cid===c.id?'on':''}" data-cid="${c.id}"><span class="ic">🔊</span><span class="nm">${esc(c.name)}</span>${owner?`<button class="x" data-del="${c.id}" title="Apagar canal">✕</button>`:''}</div>
      ${users.length ? `<div class="vusers">${users.map(u => vuRow(u)).join('')}</div>` : ''}`;
  }).join('');
  body.innerHTML = h;
  body.querySelectorAll('[data-cid]').forEach(el => el.onclick = e => {
    if(e.target.closest('[data-del]')) return;
    const c = list.find(x => x.id === el.dataset.cid);
    go({ kind:'server', sid: s.id, cid: c.id });
    if(c.kind === 'voice' && !(Voice.channel && Voice.channel.id === c.id)) joinVoice(c);
  });
  body.querySelectorAll('[data-new]').forEach(b => b.onclick = () => createChannelModal(s, b.dataset.new));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const c = list.find(x => x.id === b.dataset.del);
    if(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${c.kind==='text'?'Todas as mensagens serão perdidas.':''}`, 'Apagar canal')){
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true);
    }
  });
  body.querySelectorAll('[data-vuser]').forEach(el => el.oncontextmenu = e => { e.preventDefault(); userMenu(el.dataset.vuser, e.clientX, e.clientY); });
  onSpeaking();
}
function vuRow(u){
  const p = prof(u.user_id);
  return `<div class="vu" data-vuser="${u.user_id}">${avatar(p).replace('class="av ', `data-sess="${u.session}" class="av `)}<span>${esc(p.display_name)}</span>
    <span class="icons">${u.sharing?'<span class="live">AO VIVO</span>':''}${u.deafened?'🎧̸':u.muted?'🔇':''}</span></div>`;
}

/* ---------------- painel do usuário e de voz ---------------- */
function renderUserPanel(){
  const p = S.me; if(!p) return;
  const muted = Voice.muted || Voice.deafened;
  $('#userPanel').innerHTML = `
    <div class="who" id="upWho">${avatar(p,'',true)}<div class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></div>
    <button class="ibtn ${muted?'off':''}" id="upMic" title="${muted?'Ativar microfone':'Silenciar'}">${muted?'🔇':'🎤'}</button>
    <button class="ibtn ${Voice.deafened?'off':''}" id="upDeaf" title="${Voice.deafened?'Ativar áudio':'Ensurdecer'}">${Voice.deafened?'🔕':'🎧'}</button>
    <button class="ibtn" id="upSet" title="Configurações">⚙️</button>`;
  $('#upWho').onclick = e => { copy('@'+p.username); };
  $('#upMic').onclick = () => { Voice.toggleMute(); ls.set('telao-muted', Voice.muted); renderUserPanel(); renderStage(); };
  $('#upDeaf').onclick = () => { Voice.toggleDeafen(); renderUserPanel(); renderStage(); };
  $('#upSet').onclick = settingsModal;
}
function renderVoicePanel(){
  const el = $('#voicePanel');
  if(!Voice.channel){ el.classList.add('hidden'); return; }
  const c = Voice.channel;
  const where = c.kind === 'dm' ? 'Chamada com ' + prof(dmOther(c)).display_name : esc(c.name) + ' / ' + esc((S.servers.find(s => s.id === c.server_id) || {}).name || '');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="vst"><div style="min-width:0;cursor:pointer" id="vpGo"><b>📶 Voz conectada</b><small>${where}</small></div>
      <button class="ibtn hang" id="vpLeave" title="Desconectar">📞</button></div>
    <div class="vbtns">
      <button class="btn sm ${Voice.screenStream?'red':'sec'}" id="vpScreen">${Voice.screenStream?'■ Parar tela':'🖥️ Tela'}</button>
      <button class="btn sm sec" id="vpQual">⚙️ Qualidade</button>
    </div>`;
  $('#vpGo').onclick = () => openChannel(c);
  $('#vpLeave').onclick = leaveVoice;
  $('#vpScreen').onclick = () => Voice.screenStream ? Voice.stopScreen() : Voice.startScreen();
  $('#vpQual').onclick = screenSettingsModal;
}

/* ---------------- área principal ---------------- */
function renderMain(keepMessages){
  const head = $('#mainHead'), body = $('#mainBody');
  const back = `<button class="back" id="mBack">←</button>`;
  const r = S.route;

  if(r.kind === 'home' && !r.dm){ M.cid = null; renderFriends(head, body, back); bindBack(); return; }

  if(r.kind === 'home' && r.dm){
    const d = S.dms.find(x => x.id === r.dm); if(!d){ go({kind:'home', dm:null}); return; }
    const p = prof(dmOther(d));
    const inCall = Voice.channel && Voice.channel.id === d.id;
    head.innerHTML = `${back}${avatar(p,'',true)}<span>${esc(p.display_name)}</span><span class="desc">@${esc(p.username)}</span><span class="grow"></span>
      ${inCall ? '' : `<button class="ibtn" id="dmCall" title="Iniciar chamada de voz">📞</button><button class="ibtn" id="dmScreen" title="Ligar e compartilhar tela">🖥️</button>`}`;
    const callBtn = $('#dmCall'); if(callBtn) callBtn.onclick = () => joinVoice(d);
    const scrBtn = $('#dmScreen'); if(scrBtn) scrBtn.onclick = async () => { await joinVoice(d); Voice.startScreen(); };
    bindBack();
    if(keepMessages && M.cid === d.id && body.querySelector('.msgs')){ renderStage(); return; }
    body.innerHTML = `<div id="stageWrap"></div><div id="msgWrap" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
    renderStage();
    mountMessages(d, $('#msgWrap'), `<div class="welcome">${avatar(p,'lg').replace('class="av lg"','class="av lg" style="width:80px;height:80px;font-size:32px;background:'+esc(p.avatar_color)+'"')}<h1 style="margin-top:10px">${esc(p.display_name)}</h1><p>Este é o começo da sua conversa com <b>@${esc(p.username)}</b>.</p></div>`);
    return;
  }

  const s = curServer(); if(!s) return;
  const c = (S.channels.get(s.id) || []).find(x => x.id === r.cid);
  if(!c){
    M.cid = null;
    head.innerHTML = `${back}<span>${esc(s.name)}</span>`;
    body.innerHTML = `<div class="empty">Esse servidor ainda não tem canais.${s.owner_id===S.me.id?'<br><br><button class="btn" id="mkCh">Criar canal</button>':''}</div>`;
    const b = $('#mkCh'); if(b) b.onclick = () => createChannelModal(s, 'text');
    bindBack(); return;
  }
  if(c.kind === 'text'){
    head.innerHTML = `${back}<span class="ic">#</span><span>${esc(c.name)}</span><span class="grow"></span><button class="ibtn" id="mInvite" title="Convidar amigos">👤+</button>`;
    $('#mInvite').onclick = () => inviteModal(s);
    bindBack();
    body.innerHTML = '';
    mountMessages(c, body, `<div class="welcome"><div class="big">#</div><h1>Bem-vindo(a) a #${esc(c.name)}!</h1><p>Este é o começo do canal #${esc(c.name)}.</p></div>`);
  } else {
    M.cid = null;
    head.innerHTML = `${back}<span class="ic">🔊</span><span>${esc(c.name)}</span><span class="grow"></span><button class="ibtn" id="mInvite" title="Convidar amigos">👤+</button>`;
    $('#mInvite').onclick = () => inviteModal(s);
    bindBack();
    body.innerHTML = `<div id="stageWrap" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
    renderStage();
  }
}
function bindBack(){ const b = $('#mBack'); if(b) b.onclick = () => document.body.classList.remove('m-main'); }

/* ---------------- amigos ---------------- */
function renderFriends(head, body, back){
  const pend = S.friends.filter(f => f.status === 'pending');
  const acc = S.friends.filter(f => f.status === 'accepted');
  const tab = S.friendTab;
  head.innerHTML = `${back}<span>👥 Amigos</span><span class="tabs" style="margin-left:12px">
    <button class="tab ${tab==='online'?'on':''}" data-t="online">Online</button>
    <button class="tab ${tab==='all'?'on':''}" data-t="all">Todos</button>
    <button class="tab ${tab==='pending'?'on':''}" data-t="pending">Pendentes${pend.filter(f=>f.incoming).length?` (${pend.filter(f=>f.incoming).length})`:''}</button>
    <button class="tab addf ${tab==='add'?'on':''}" data-t="add">Adicionar</button></span>`;
  head.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.friendTab = b.dataset.t; renderMain(); });
  if(isMobile()) head.querySelector('.tabs').style.overflowX = 'auto';

  if(tab === 'add'){
    body.innerHTML = `<div class="flist"><div class="addbox"><h3>ADICIONAR AMIGO</h3><p>Adicione pelo nome de usuário. Seu usuário é <b>@${esc(S.me.username)}</b> <a style="cursor:pointer" id="cpMe">copiar</a></p>
      <form id="addF"><input id="addU" placeholder="nome de usuário, ex: lucas_10" autocomplete="off"><button class="btn sm">Enviar pedido</button></form>
      <div id="addMsg" style="margin-top:10px;font-size:14px"></div></div></div>`;
    $('#cpMe').onclick = () => copy(S.me.username);
    $('#addF').onsubmit = async e => {
      e.preventDefault();
      const u = $('#addU').value.trim().replace(/^@/, '').toLowerCase(); if(!u) return;
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: u });
      const msg = $('#addMsg');
      if(error){ msg.style.color = '#ff8a8c'; msg.textContent = error.message.includes('não encontrado') ? 'Ninguém com esse usuário. Confira se digitou certinho.' : error.message; return; }
      msg.style.color = '#7ee2a8';
      msg.textContent = data === 'accepted' ? '🎉 Agora vocês são amigos!' : 'Pedido enviado para @' + u + '!';
      $('#addU').value = ''; await loadFriends(); renderRail();
    };
    return;
  }
  let rows = [], title = '';
  if(tab === 'online'){ rows = acc.filter(f => S.online.has(f.uid)); title = 'Online — ' + rows.length; }
  else if(tab === 'all'){ rows = acc; title = 'Todos os amigos — ' + rows.length; }
  else { rows = pend; title = 'Pendentes — ' + rows.length; }
  rows.sort((a,b) => prof(a.uid).display_name.localeCompare(prof(b.uid).display_name));
  body.innerHTML = `<div class="flist"><h4>${title}</h4>${rows.length ? rows.map(f => {
    const p = prof(f.uid);
    const sub = f.status === 'pending' ? (f.incoming ? 'Pedido de amizade recebido' : 'Pedido enviado') : (S.online.has(f.uid) ? 'Online' : 'Offline');
    const btns = f.status === 'pending'
      ? (f.incoming ? `<button class="rb yes" data-acc="${f.uid}" title="Aceitar">✓</button><button class="rb no" data-rm="${f.uid}" title="Recusar">✕</button>` : `<button class="rb no" data-rm="${f.uid}" title="Cancelar">✕</button>`)
      : `<button class="rb" data-dm="${f.uid}" title="Mensagem">💬</button><button class="rb" data-call="${f.uid}" title="Ligar">📞</button><button class="rb no" data-rm="${f.uid}" title="Desfazer amizade">✕</button>`;
    return `<div class="frow">${avatar(p,'',true)}<div class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)} · ${sub}</small></div>${btns}</div>`;
  }).join('') : `<div class="empty">${tab==='online'?'Nenhum amigo online agora.':tab==='pending'?'Nenhum pedido pendente.':'Você ainda não tem amigos aqui.'}<br><br><button class="btn" id="goAdd">Adicionar amigo</button></div>`}</div>`;
  const ga = $('#goAdd'); if(ga) ga.onclick = () => { S.friendTab = 'add'; renderMain(); };
  body.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => {
    const { error } = await App.sb.from('friendships').update({ status:'accepted' }).eq('requester', b.dataset.acc).eq('addressee', S.me.id);
    if(error) App.toast(error.message, true); else { await loadFriends(); renderLight(); renderMain(); }
  });
  body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const f = S.friends.find(x => x.uid === b.dataset.rm);
    if(f.status === 'accepted' && !(await confirmBox('Desfazer amizade', `Remover <b>${esc(prof(f.uid).display_name)}</b> dos amigos?`, 'Remover'))) return;
    const me = S.me.id, o = f.uid;
    const { error } = await App.sb.from('friendships').delete().or(`and(requester.eq.${me},addressee.eq.${o}),and(requester.eq.${o},addressee.eq.${me})`);
    if(error) App.toast(error.message, true); else { await loadFriends(); renderLight(); renderMain(); }
  });
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
const M = { cid:null, list:[], done:false, loading:false, el:null, welcome:'', editing:null };
async function mountMessages(ch, container, welcome){
  M.cid = ch.id; M.list = []; M.done = false; M.loading = false; M.welcome = welcome; M.editing = null;
  container.insertAdjacentHTML('beforeend', `<div class="msgs" id="msgs"><div class="empty">Carregando…</div></div>
    <div class="composer"><form id="cmpF"><textarea id="cmp" rows="1" maxlength="2000" placeholder="Conversar em ${ch.kind==='dm' ? '@'+esc(prof(dmOther(ch)).display_name) : '#'+esc(ch.name)}"></textarea><button class="send" title="Enviar">➤</button></form></div>`);
  M.el = $('#msgs');
  const ta = $('#cmp');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; };
  ta.oninput = grow;
  ta.onkeydown = e => { if(e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()){ e.preventDefault(); $('#cmpF').requestSubmit(); } };
  $('#cmpF').onsubmit = async e => {
    e.preventDefault();
    const content = ta.value.trim(); if(!content) return;
    ta.value = ''; grow();
    const { data, error } = await App.sb.from('messages').insert({ channel_id: ch.id, content }).select().single();
    if(error){ App.toast('Não foi enviada: '+error.message, true); ta.value = content; return; }
    addMessage(data);
    if(ch.kind === 'dm'){ S.dmActivity[ch.id] = data.created_at; ls.set('telao-dmact', S.dmActivity); }
  };
  if(!isMobile()) setTimeout(() => ta.focus(), 30);
  M.el.onscroll = () => { if(M.el.scrollTop < 80) loadOlder(); };
  const cid = ch.id;
  const { data, error } = await App.sb.from('messages').select('*').eq('channel_id', cid).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid) return;
  if(error){ M.el.innerHTML = `<div class="empty">Erro: ${esc(error.message)}</div>`; return; }
  M.list = (data || []).reverse(); M.done = (data || []).length < 50;
  await ensureProfiles(M.list.map(m => m.author_id));
  if(M.cid !== cid) return;
  renderMsgList(true);
}
async function loadOlder(){
  if(M.done || M.loading || !M.list.length) return;
  M.loading = true; const cid = M.cid;
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', cid).lt('created_at', M.list[0].created_at).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid){ M.loading = false; return; }
  const older = (data || []).reverse(); M.done = older.length < 50;
  await ensureProfiles(older.map(m => m.author_id));
  const h0 = M.el.scrollHeight, t0 = M.el.scrollTop;
  M.list = older.concat(M.list);
  renderMsgList(false);
  M.el.scrollTop = M.el.scrollHeight - h0 + t0;
  M.loading = false;
}
function addMessage(m){
  if(M.cid !== m.channel_id || M.list.find(x => x.id === m.id)) return;
  M.list.push(m); M.list.sort((a,b) => a.created_at.localeCompare(b.created_at));
  renderMsgList(m.author_id === S.me.id ? true : null);
}
function renderMsgList(stick){
  if(!M.el) return;
  const nearBottom = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 150;
  const ch = findChannel(M.cid);
  const sv = ch && ch.server_id ? S.servers.find(s => s.id === ch.server_id) : null;
  const iAmOwner = sv && sv.owner_id === S.me.id;
  let h = M.done ? M.welcome : `<button class="loadmore" id="lm">Carregar mensagens antigas</button>`;
  let prev = null, prevDay = '';
  M.list.forEach(m => {
    const day = new Date(m.created_at).toDateString();
    if(day !== prevDay){ h += `<div class="daysep">${fmtDay(m.created_at)}</div>`; prevDay = day; prev = null; }
    const grouped = prev && prev.author_id === m.author_id && (new Date(m.created_at) - new Date(prev.created_at)) < 5*60*1000;
    const p = prof(m.author_id);
    const mine = m.author_id === S.me.id;
    const acts = (mine || iAmOwner) ? `<div class="acts">${mine?`<button data-edit="${m.id}" title="Editar">✏️</button>`:''}<button data-delm="${m.id}" title="Apagar">🗑️</button></div>` : '';
    const content = M.editing === m.id
      ? `<textarea class="editbox" id="edBox" rows="2" maxlength="2000">${esc(m.content)}</textarea><div class="edithint">Enter para salvar · Esc para cancelar</div>`
      : `<div class="ct">${richText(m.content)}${m.edited_at?' <span class="edited">(editado)</span>':''}</div>`;
    if(grouped) h += `<div class="msg" data-m="${m.id}"><div class="gap">${new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div><div class="bd">${content}</div>${acts}</div>`;
    else h += `<div class="msg first" data-m="${m.id}">${avatar(p,'lg')}<div class="bd"><div class="hd"><b style="color:${esc(p.avatar_color)}" data-uprof="${p.id}">${esc(p.display_name)}</b><time>${fmtTime(m.created_at)}</time></div>${content}</div>${acts}</div>`;
    prev = m;
  });
  M.el.innerHTML = h;
  const lm = $('#lm'); if(lm) lm.onclick = loadOlder;
  M.el.querySelectorAll('[data-delm]').forEach(b => b.onclick = async () => {
    if(!(await confirmBox('Apagar mensagem', 'Tem certeza que quer apagar esta mensagem?', 'Apagar'))) return;
    const { error } = await App.sb.from('messages').delete().eq('id', b.dataset.delm);
    if(error) App.toast(error.message, true);
    else { const i = M.list.findIndex(x => x.id === b.dataset.delm); if(i >= 0){ M.list.splice(i,1); renderMsgList(false); } }
  });
  M.el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { M.editing = b.dataset.edit; renderMsgList(false); });
  M.el.querySelectorAll('[data-uprof]').forEach(b => { b.style.cursor = 'pointer'; b.onclick = e => userMenu(b.dataset.uprof, e.clientX, e.clientY); });
  const ed = $('#edBox');
  if(ed){
    ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
    ed.onkeydown = async e => {
      if(e.key === 'Escape'){ M.editing = null; renderMsgList(false); }
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        const v = ed.value.trim(), id = M.editing; M.editing = null;
        const old = M.list.find(x => x.id === id);
        if(v && old && v !== old.content){
          const { data, error } = await App.sb.from('messages').update({ content: v }).eq('id', id).select().single();
          if(error) App.toast(error.message, true); else { Object.assign(old, data); }
        }
        renderMsgList(false);
      }
    };
  }
  if(stick === true || (stick === null && nearBottom) || (stick === undefined)) M.el.scrollTop = M.el.scrollHeight;
  M.el.querySelectorAll('img.embed').forEach(img => img.onload = () => { if(stick !== false && nearBottom) M.el.scrollTop = M.el.scrollHeight; });
}

/* ---------------- chamadas de voz ---------------- */
async function joinVoice(ch){
  if(Voice.channel && Voice.channel.id === ch.id) return;
  const topic = topicFor(ch);
  const pch = vpChannel(topic);
  await pch._ready;
  if(!navigator.mediaDevices){ App.toast('Seu navegador não suporta chamadas. Use Chrome, Edge ou Safari atualizado.', true); return; }
  await Voice.join(ch, pch, topic);
  App.sfx('join');
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
  el.innerHTML = `${avatar(p)}<b style="font-size:17px">${esc(p.display_name)}</b><div style="color:var(--txt2);font-size:14px;margin-top:3px">está te ligando…</div>
    <div class="bt"><button class="btn red" id="rgNo">Recusar</button><button class="btn ok" id="rgYes">Atender</button></div>`;
  el.classList.remove('hidden');
  $('#rgYes').onclick = () => { stopRing(); go({ kind:'home', dm: d.id }); joinVoice(d); };
  $('#rgNo').onclick = () => { stopRing(); sendToUser(pl.from, 'ring-decline', { channel_id: d.id, from: S.me.id }); };
  clearInterval(ringTimer); App.sfx('ring'); ringTimer = setInterval(() => App.sfx('ring'), 2200);
  setTimeout(() => { if(S.ringing === pl) stopRing(); }, 35000);
  notify(p.display_name + ' está te ligando', 'Abra o Telão para atender', d.id);
}
function stopRing(){ S.ringing = null; clearInterval(ringTimer); $('#ring').classList.add('hidden'); }

function onVoiceChange(){ renderVoicePanel(); renderUserPanel(); renderStage(); }
function onSpeaking(){
  $$('[data-sess]').forEach(el => {
    const sess = el.dataset.sess;
    el.classList.toggle('speak', Voice.speaking.has(sess));
  });
}

/* palco: participantes + telas */
let statTimer = null;
function renderStage(){
  const wrap = $('#stageWrap'); if(!wrap) return;
  const r = S.route;
  let ch = null, compact = false;
  if(r.kind === 'home' && r.dm){ ch = S.dms.find(d => d.id === r.dm); compact = true; }
  else if(r.kind === 'server'){ ch = (S.channels.get(r.sid) || []).find(c => c.id === r.cid && c.kind === 'voice'); }
  if(!ch){ wrap.innerHTML = ''; return; }
  const users = voiceUsers(ch);
  const inThis = Voice.channel && Voice.channel.id === ch.id;
  clearInterval(statTimer);

  if(compact && !inThis && !users.length){ wrap.innerHTML = ''; return; }

  if(!inThis){
    wrap.innerHTML = `<div class="stage ${compact?'compact':''}"><div class="joincard">
      <h2>${ch.kind==='dm' ? 'Chamada em andamento' : '🔊 ' + esc(ch.name)}</h2>
      <div class="avs">${users.map(u => avatar(prof(u.user_id),'lg')).join('')}</div>
      <div>${users.length ? users.map(u => esc(prof(u.user_id).display_name)).join(', ') + (users.length>1?' estão':' está') + ' aqui' : 'Ninguém aqui ainda.'}</div>
      <button class="btn ok" id="stJoin">${ch.kind==='dm' ? '📞 Entrar na chamada' : 'Entrar no canal de voz'}</button></div></div>`;
    $('#stJoin').onclick = () => joinVoice(ch);
    return;
  }

  const screens = Voice.screens();
  let focused = screens.find(s => s.session === S.focus) || screens[0] || null;
  if(focused) S.focus = focused.session;
  const tileOf = u => {
    const p = prof(u.user_id);
    return `<div class="tile" data-sess="${u.session}" data-vuser="${u.user_id}">${avatar(p)}<span class="nm">${u.deafened?'🔕':u.muted?'🔇':''} ${esc(p.display_name)}${u.session===Voice.SESSION?' (você)':''} ${u.sharing?'<span class="live">AO VIVO</span>':''}</span></div>`;
  };
  const scrTile = s => `<div class="tile scr ${focused && s.stream.id===focused.stream.id?'on':''}" data-focus="${s.session}"><div class="vslot" data-stream="${s.stream.id}" style="width:100%;height:100%"></div><span class="nm">🖥️ ${esc(s.mine?'Sua tela':prof(s.user_id).display_name)}</span></div>`;

  let area;
  if(focused){
    const others = screens.filter(s => s !== focused);
    area = `<div class="focus" id="focusBox"><div class="vslot" data-stream="${focused.stream.id}" style="width:100%;height:100%"></div>
        <span class="stats" id="stStats"></span>
        <span class="lbl">🖥️ ${esc(focused.mine ? 'Sua tela (prévia)' : 'Tela de ' + prof(focused.user_id).display_name)} ${focused.mine?'':(focused.stream.getAudioTracks().length?'· 🔊':'· 🔇 sem áudio')}</span>
        <span class="tools"><button id="stFs" title="Tela cheia">⛶</button></span></div>
      <div class="tiles strip">${others.map(scrTile).join('')}${users.map(tileOf).join('')}</div>`;
  } else {
    area = `<div class="tiles grid">${users.map(tileOf).join('')}</div>`;
  }
  const muted = Voice.muted || Voice.deafened;
  wrap.innerHTML = `<div class="stage ${compact?'compact':''}"><div class="area">${area}</div>
    <div class="stagebar">
      <button class="cbtn ${muted?'off':''}" id="sbMic" title="Microfone">${muted?'🔇':'🎤'}</button>
      <button class="cbtn ${Voice.deafened?'off':''}" id="sbDeaf" title="Áudio">${Voice.deafened?'🔕':'🎧'}</button>
      <button class="cbtn ${Voice.screenStream?'live':''}" id="sbScr" title="${Voice.screenStream?'Parar de compartilhar':'Compartilhar tela'}">🖥️</button>
      <button class="cbtn" id="sbQ" title="Qualidade da tela">⚙️</button>
      <button class="cbtn red" id="sbLeave" title="Sair da chamada">📞</button>
    </div>
    ${Voice.screenStream || compact ? '' : '<div class="audiohint">🎧 Para mandar o som da tela: escolha “Tela inteira” + “Compartilhar áudio do sistema”, ou uma aba + “Compartilhar áudio da aba”. “Janela” vai sem som.</div>'}</div>`;

  wrap.querySelectorAll('.vslot').forEach(slot => {
    const s = screens.find(x => x.stream.id === slot.dataset.stream); if(!s) return;
    let v = S.videoEls.get(s.stream.id);
    if(!v){ v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = true; S.videoEls.set(s.stream.id, v); }
    if(v.srcObject !== s.stream) v.srcObject = s.stream;
    v.style.cssText = 'width:100%;height:100%;object-fit:' + (slot.closest('.focus') ? 'contain' : 'cover') + ';display:block;background:#000';
    slot.appendChild(v); v.play().catch(()=>{});
  });
  // limpa vídeos de telas que sumiram
  S.videoEls.forEach((v, id) => { if(!screens.find(s => s.stream.id === id)){ v.srcObject = null; S.videoEls.delete(id); } });

  wrap.querySelectorAll('[data-focus]').forEach(t => t.onclick = () => { S.focus = t.dataset.focus; renderStage(); });
  wrap.querySelectorAll('.tile[data-vuser]').forEach(t => t.oncontextmenu = e => { e.preventDefault(); userMenu(t.dataset.vuser, e.clientX, e.clientY); });
  const fs = $('#stFs'); if(fs) fs.onclick = () => { const el = $('#focusBox'); (el.requestFullscreen || el.webkitRequestFullscreen || (()=>{})).call(el); };
  $('#sbMic').onclick = () => { Voice.toggleMute(); ls.set('telao-muted', Voice.muted); };
  $('#sbDeaf').onclick = () => Voice.toggleDeafen();
  $('#sbScr').onclick = () => Voice.screenStream ? Voice.stopScreen() : Voice.startScreen();
  $('#sbQ').onclick = screenSettingsModal;
  $('#sbLeave').onclick = leaveVoice;
  onSpeaking();

  if(focused){
    let lastB = 0, lastT = 0;
    statTimer = setInterval(async () => {
      const el = $('#stStats'); if(!el){ clearInterval(statTimer); return; }
      if(focused.mine){
        const st = focused.stream.getVideoTracks()[0].getSettings();
        el.textContent = `${st.width||'?'}×${st.height||'?'} · ${Math.round(st.frameRate||0)}fps · ${(Voice.screenSettings.bitrate/1e6)} Mbps máx`;
        return;
      }
      if(!focused.pc) return;
      const vt = focused.stream.getVideoTracks()[0];
      const rep = await focused.pc.getStats(vt); let txt = '';
      rep.forEach(x => {
        if(x.type === 'inbound-rtp' && x.kind === 'video'){
          let mb = '';
          if(lastT) mb = ' · ' + ((x.bytesReceived - lastB) * 8 / ((x.timestamp - lastT) / 1000) / 1e6).toFixed(1) + ' Mbps';
          lastB = x.bytesReceived; lastT = x.timestamp;
          txt = `${x.frameWidth||'?'}×${x.frameHeight||'?'} · ${Math.round(x.framesPerSecond||0)}fps${mb}`;
        }
      });
      if(txt) el.textContent = txt;
    }, 1000);
  }
}

function userMenu(uid, x, y){
  const p = prof(uid);
  const items = [{ html:`<b>${esc(p.display_name)}</b><div style="color:var(--mut);font-size:12px">@${esc(p.username)}</div>` }];
  if(uid !== S.me.id){
    const fr = S.friends.find(f => f.uid === uid);
    if(Voice.channel && voiceUsers(Voice.channel).some(m => m.user_id === uid)){
      const vol = Math.round((Voice.userVolumes.get(uid) ?? 1) * 100);
      items.push({ html:`<div style="font-size:12px;color:var(--txt2);margin-bottom:4px">Volume do usuário: <span id="uvL">${vol}%</span></div><input type="range" id="uvR" min="0" max="100" value="${vol}" style="width:100%;accent-color:var(--acc)">`,
        mount: el => { const r = el.querySelector('#uvR'); r.oninput = () => { el.querySelector('#uvL').textContent = r.value + '%'; Voice.setUserVolume(uid, r.value / 100); }; } });
    }
    if(fr && fr.status === 'accepted') items.push({ label:'Mensagem', icon:'💬', onClick: () => openDM(uid) });
    else if(!fr) items.push({ label:'Adicionar amigo', icon:'👤', onClick: async () => {
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: p.username });
      App.toast(error ? error.message : data === 'accepted' ? 'Agora vocês são amigos!' : 'Pedido enviado!', !!error); loadFriends().then(renderRail);
    }});
    const s = curServer();
    if(s && s.owner_id === S.me.id && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push('-', { label:'Expulsar do servidor', danger:true, onClick: async () => {
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', uid);
      if(error) App.toast(error.message, true);
    }});
  }
  items.push({ label:'Copiar usuário', icon:'📋', onClick: () => copy(p.username) });
  menu(x, y, items);
}

/* ---------------- membros ---------------- */
function renderMembers(){
  const el = $('#members');
  const s = curServer();
  if(!s || !S.members.has(s.id)){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const mem = S.members.get(s.id).map(m => ({ ...m, p: prof(m.user_id) })).sort((a,b) => a.p.display_name.localeCompare(b.p.display_name));
  const on = mem.filter(m => S.online.has(m.user_id)), off = mem.filter(m => !S.online.has(m.user_id));
  const row = m => `<div class="mem ${S.online.has(m.user_id)?'':'off'}" data-u="${m.user_id}">${avatar(m.p,'',true)}<span class="nm">${esc(m.p.display_name)}</span>${m.user_id===s.owner_id?'<span class="crown" title="Dono">👑</span>':''}</div>`;
  el.innerHTML = `<h4>Online — ${on.length}</h4>${on.map(row).join('')}${off.length?`<h4 style="margin-top:12px">Offline — ${off.length}</h4>${off.map(row).join('')}`:''}`;
  el.querySelectorAll('[data-u]').forEach(r => r.onclick = e => userMenu(r.dataset.u, e.clientX, e.clientY));
}

/* ---------------- servidores: menus e modais ---------------- */
function serverMenu(s, e){
  const owner = s.owner_id === S.me.id;
  const r = $('#sbHead').getBoundingClientRect();
  const items = [{ label:'Convidar pessoas', icon:'👤+', onClick: () => inviteModal(s) }];
  if(owner) items.push({ label:'Criar canal', icon:'＋', onClick: () => createChannelModal(s, 'text') }, { label:'Configurações do servidor', icon:'⚙️', onClick: () => serverSettingsModal(s) });
  items.push('-');
  if(owner) items.push({ label:'Excluir servidor', danger:true, icon:'🗑️', onClick: () => deleteServer(s) });
  else items.push({ label:'Sair do servidor', danger:true, icon:'🚪', onClick: () => leaveServer(s) });
  menu(r.left + 8, r.bottom + 4, items);
}
function addServerModal(){
  modal(`<div class="mh"><h2>Adicionar um servidor</h2><p>Crie o seu ou entre no de um amigo.</p></div>
    <div class="mc"><button class="choice" id="chCreate"><span class="e">🏠</span>Criar meu servidor</button><button class="choice" id="chJoin"><span class="e">🎟️</span>Entrar com um convite</button></div>`, m => {
    m.querySelector('#chCreate').onclick = createServerModal;
    m.querySelector('#chJoin').onclick = joinServerModal;
  });
}
function createServerModal(){
  modal(`<form id="csF"><div class="mh"><h2>Crie seu servidor</h2><p>Dê um nome. Você pode mudar depois.</p></div>
    <div class="mc"><label class="field"><span>Nome do servidor</span><input class="inp" id="csN" maxlength="40" value="Servidor de ${esc(S.me.display_name)}" required></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Voltar</button><button class="btn">Criar</button></div></form>`, m => {
    m.querySelector('#csN').select();
    m.querySelector('#csF').onsubmit = async e => {
      e.preventDefault();
      const { data: sid, error } = await App.sb.rpc('create_server', { p_name: m.querySelector('#csN').value.trim() });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadServers(); go({ kind:'server', sid });
    };
  });
}
function parseInvite(v){ v = v.trim(); const m = v.match(/convite=([a-z0-9]+)/i); return (m ? m[1] : v.split('/').pop()).toLowerCase(); }
function joinServerModal(prefill){
  modal(`<form id="jsF"><div class="mh"><h2>Entrar num servidor</h2><p>Cole o link ou o código de convite.</p></div>
    <div class="mc"><label class="field"><span>Link ou código</span><input class="inp" id="jsC" value="${esc(typeof prefill==='string'?prefill:'')}" placeholder="ex: a1b2c3d4" required></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Voltar</button><button class="btn">Entrar</button></div></form>`, m => {
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
  const owner = s.owner_id === S.me.id;
  modal(`<div class="mh"><h2>Convide amigos para ${esc(s.name)}</h2><p>Mande o link. Quem abrir entra no servidor.</p></div>
    <div class="mc"><div class="codebig">${esc(s.invite_code)}</div>
      <div class="copyrow"><input class="inp" readonly value="${esc(link)}" id="ivL"><button class="btn" id="ivC">Copiar</button></div>
      ${owner ? '<p style="margin-top:12px;font-size:13px;color:var(--mut)">Vazou o link? <a style="cursor:pointer" id="ivR">Gerar um novo</a> (o antigo para de funcionar).</p>' : ''}</div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelector('#ivC').onclick = () => copy(link);
    const rg = m.querySelector('#ivR');
    if(rg) rg.onclick = async () => {
      const { data, error } = await App.sb.rpc('regenerate_invite', { p_server: s.id });
      if(error){ App.toast(error.message, true); return; }
      s.invite_code = data; inviteModal(s);
    };
  });
}
function createChannelModal(s, kind){
  modal(`<form id="ccF"><div class="mh"><h2>Criar canal</h2></div>
    <div class="mc"><div class="radio"><label><input type="radio" name="k" value="text" ${kind!=='voice'?'checked':''}> # Texto</label><label><input type="radio" name="k" value="voice" ${kind==='voice'?'checked':''}> 🔊 Voz</label></div>
      <label class="field"><span>Nome do canal</span><input class="inp" id="ccN" maxlength="40" placeholder="novo-canal" required></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar canal</button></div></form>`, m => {
    m.querySelector('#ccF').onsubmit = async e => {
      e.preventDefault();
      const k = m.querySelector('input[name=k]:checked').value;
      let name = m.querySelector('#ccN').value.trim();
      if(k === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
      if(!name) return;
      const list = S.channels.get(s.id) || [];
      const position = list.reduce((a,c) => Math.max(a, c.position), 0) + 1;
      const { data, error } = await App.sb.from('channels').insert({ server_id: s.id, name, kind: k, position }).select().single();
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); go({ kind:'server', sid: s.id, cid: data.id });
    };
  });
}
function serverSettingsModal(s){
  modal(`<form id="ssF"><div class="mh"><h2>Configurações do servidor</h2></div>
    <div class="mc"><label class="field"><span>Nome</span><input class="inp" id="ssN" maxlength="40" value="${esc(s.name)}" required></label>
      <label class="field"><span>Cor do ícone</span><div class="colors" id="ssC">${COLORS.map(c => `<button type="button" data-c="${c}" class="${c===s.icon_color?'on':''}" style="background:${c}"></button>`).join('')}</div></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    let color = s.icon_color;
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
    m.querySelector('#ssF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.from('servers').update({ name: m.querySelector('#ssN').value.trim(), icon_color: color }).eq('id', s.id);
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadServers(); renderAll();
    };
  });
}
async function deleteServer(s){
  if(!(await confirmBox('Excluir servidor', `Excluir <b>${esc(s.name)}</b> para sempre? Todos os canais e mensagens serão apagados.`, 'Excluir servidor'))) return;
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

/* ---------------- configurações ---------------- */
function settingsModal(){
  const p = S.me;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  modal(`<form id="stF"><div class="mh"><h2>Minha conta</h2><p>@${esc(p.username)}</p></div>
    <div class="mc">
      <label class="field"><span>Nome de exibição</span><input class="inp" id="stN" maxlength="32" value="${esc(p.display_name)}" required></label>
      <label class="field"><span>Cor do avatar</span><div class="colors">${COLORS.map(c => `<button type="button" data-c="${c}" class="${c===p.avatar_color?'on':''}" style="background:${c}"></button>`).join('')}</div></label>
      <label class="field"><span>Notificações</span>
        ${'Notification' in window ? (Notification.permission === 'granted' ? '<div style="color:var(--txt2);font-size:14px">✅ Ativadas (mensagens diretas, menções e chamadas)</div>' : '<button type="button" class="btn sec sm" id="stNot">🔔 Ativar notificações</button>') : '<div style="color:var(--mut);font-size:14px">Não suportado neste navegador</div>'}</label>
      <label class="field"><span>App</span>
        ${standalone ? '<div style="color:var(--txt2);font-size:14px">✅ Você está usando o app instalado</div>'
          : S.installEvt ? '<button type="button" class="btn sec sm" id="stInst">📲 Instalar o Telão</button>'
          : ios ? '<div style="color:var(--txt2);font-size:14px">No iPhone: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</div>'
          : '<div style="color:var(--txt2);font-size:14px">No Chrome/Edge: ícone de instalar na barra de endereço, ou menu ⋮ → <b>Instalar Telão</b>.</div>'}</label>
    </div>
    <div class="mf" style="justify-content:space-between"><button type="button" class="btn red" id="stOut">Sair da conta</button><span style="display:flex;gap:10px"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></span></div></form>`, m => {
    let color = p.avatar_color;
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); });
    const nb = m.querySelector('#stNot'); if(nb) nb.onclick = async () => { await Notification.requestPermission(); settingsModal(); };
    const ib = m.querySelector('#stInst'); if(ib) ib.onclick = doInstall;
    m.querySelector('#stOut').onclick = async () => { if(Voice.channel) await leaveVoice(); await App.sb.auth.signOut(); };
    m.querySelector('#stF').onsubmit = async e => {
      e.preventDefault();
      const { data, error } = await App.sb.from('profiles').update({ display_name: m.querySelector('#stN').value.trim(), avatar_color: color }).eq('id', p.id).select().single();
      if(error){ App.toast(error.message, true); return; }
      S.me = data; S.profiles.set(data.id, data); closeModal(); renderAll();
    };
  });
}
function screenSettingsModal(){
  const st = Voice.screenSettings;
  const q = `${st.w}x${st.h}x${st.fps}`;
  modal(`<form id="qF"><div class="mh"><h2>Qualidade da transmissão</h2><p>Mais qualidade usa mais internet (upload) de quem transmite.</p></div>
    <div class="mc">
      <label class="field"><span>Resolução</span><select class="inp" id="qR">
        ${[['1280x720x30','720p · 30fps'],['1920x1080x30','1080p · 30fps'],['1920x1080x60','1080p · 60fps'],['2560x1440x60','1440p · 60fps'],['3840x2160x30','4K · 30fps']].map(([v,l]) => `<option value="${v}" ${v===q?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Bitrate máximo (por pessoa assistindo)</span><select class="inp" id="qB">
        ${[[2500000,'2,5 Mbps'],[5000000,'5 Mbps'],[8000000,'8 Mbps'],[12000000,'12 Mbps'],[20000000,'20 Mbps']].map(([v,l]) => `<option value="${v}" ${v===st.bitrate?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Otimizar para</span><select class="inp" id="qM">
        <option value="motion" ${st.mode==='motion'?'selected':''}>🎮 Fluidez (jogos, filmes)</option><option value="detail" ${st.mode==='detail'?'selected':''}>📝 Nitidez (texto, código)</option></select></label>
    </div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Aplicar</button></div></form>`, m => {
    m.querySelector('#qF').onsubmit = e => {
      e.preventDefault();
      const [w,h,fps] = m.querySelector('#qR').value.split('x').map(Number);
      const ns = { w, h, fps, bitrate: +m.querySelector('#qB').value, mode: m.querySelector('#qM').value };
      Voice.updateScreenSettings(ns); ls.set('telao-screen', ns); closeModal(); App.toast('Qualidade atualizada');
    };
  });
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
