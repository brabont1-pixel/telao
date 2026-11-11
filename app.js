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
  const PR = App.prefs || {};
  if(['join','leave','mute','unmute'].includes(type) && PR.soundVoice === false) return;
  if(type === 'msg' && PR.soundMsg === false) return;
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
  const img = p.avatar_url && (!/\.gif($|\?)/i.test(p.avatar_url) || hasPlus(p)) ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy">` : esc(initials(p));
  return `<div class="av ${cls}" style="background:${esc(p.avatar_color||'#5865f2')}">${img}${status?`<span class="st ${S.online.has(p.id)?'on':''}"></span>`:''}</div>`;
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
  S.me = me; S.profiles.set(me.id, me);
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
      if((ch && ch.kind === 'dm' && P.notifDM) || (mention && P.notifMention)){
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
  $('#upWho').onclick = e => userMenu(p.id, e.clientX, e.clientY - 330);
  $('#upMic').onclick = () => { Voice.toggleMute(); ls.set('telao-muted', Voice.muted); renderUserPanel(); renderStage(); };
  $('#upDeaf').onclick = () => { Voice.toggleDeafen(); renderUserPanel(); renderStage(); };
  $('#upSet').onclick = () => openSettings('user','account');
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
  $('#vpQual').onclick = () => openSettings('user','voice');
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
    else h += `<div class="msg first" data-m="${m.id}">${avatar(p,'lg')}<div class="bd"><div class="hd"><b style="color:${esc(p.avatar_color)}" data-uprof="${p.id}">${esc(p.display_name)}</b>${hasPlus(p) ? badgeHtml(BADGES[2], p, 'sm') : ''}<time>${fmtTime(m.created_at)}</time></div>${content}</div>${acts}</div>`;
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
  M.el.querySelectorAll('.msg.first > .av').forEach(a => { const id = a.parentElement.querySelector('[data-uprof]'); if(id){ a.style.cursor = 'pointer'; a.onclick = e => userMenu(id.dataset.uprof, e.clientX, e.clientY); } });
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
  if(P.notifCall) notify(p.display_name + ' está te ligando', 'Abra o Telão para atender', d.id);
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
  $('#sbQ').onclick = () => openSettings('user','voice');
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
  const items = [{ raw: profileCard(p) }];
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
  if(uid === S.me.id) items.push({ label:'Editar perfil', icon:'✏️', onClick: () => openSettings('user','profile') });
  items.push({ label:'Copiar usuário', icon:'📋', onClick: () => copy(p.username) });
  menu(x, y, items, 'pp');
  // botões ficam com respiro dentro do cartão
  $$('#menu > button, #menu > hr, #menu > div:not(.pcard2)').forEach(b => { b.style.marginLeft = '6px'; b.style.marginRight = '6px'; b.style.width = 'calc(100% - 12px)'; });
  const m = $('#menu'); m.style.paddingBottom = '6px';
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
  if(owner) items.push({ label:'Criar canal', icon:'＋', onClick: () => createChannelModal(s, 'text') }, { label:'Configurações do servidor', icon:'⚙️', onClick: () => openSettings('server','overview', s) });
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
const PDEF = { theme:'dark', fontSize:15, compact:false, inputId:'', outputId:'', echo:true, noise:true, agc:true,
  mode:'vad', sensitivity:4, pttKey:'Backquote', muteKey:'ctrl+shift+KeyM', deafKey:'ctrl+shift+KeyD', screenKey:'',
  notifDM:true, notifMention:true, notifCall:true, soundMsg:true, soundVoice:true, soundPtt:true };
const P = App.prefs = Object.assign({}, PDEF, ls.get('telao-prefs', {}));
function savePrefs(){ ls.set('telao-prefs', P); applyPrefs(); }
function applyPrefs(){
  document.body.classList.remove('theme-dark','theme-amoled','theme-light');
  document.body.classList.add('theme-' + P.theme);
  document.body.classList.toggle('compact', !!P.compact);
  document.documentElement.style.setProperty('--fs', P.fontSize + 'px');
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
function badgesOf(p){
  if(!p) return [];
  const has = new Set(p.is_admin ? BADGES.map(b => b.id) : (p.badges || []));
  if(hasPlus(p)) has.add('plus');
  if(p.created_at && new Date(p.created_at) < new Date('2027-01-01')) has.add('pioneiro');
  if(p.house) has.add(p.house);
  return BADGES.filter(b => has.has(b.id));
}
function badgeHtml(b, p, cls=''){
  const tier = b.id === 'plus' ? plusTier(p) : null;
  const desc = b.id === 'plus' ? (p.is_admin ? 'Vitalício' : 'Nível ' + TIERS[tier][2]) : b.desc;
  return `<span class="badge-i ${cls}" data-tip="${esc(b.nome)}" data-tipsub="${esc(desc)}">${badgeSvg(b.id, tier)}</span>`;
}
// tooltip das insígnias
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]');
  let tip = document.getElementById('tipEl');
  if(!t){ if(tip) tip.remove(); return; }
  if(!tip){ tip = document.createElement('div'); tip.id = 'tipEl'; tip.className = 'tip'; document.body.appendChild(tip); }
  tip.innerHTML = esc(t.dataset.tip) + (t.dataset.tipsub ? `<small>${esc(t.dataset.tipsub)}</small>` : '');
  const r = t.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width/2 - w/2)) + 'px';
  tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
});

/* ---------- cartão de perfil ---------- */
function profileCard(p, extra=''){
  const plus = hasPlus(p);
  const themed = plus && p.theme_a;
  const banner = plus && p.banner_url ? `background-image:url('${esc(p.banner_url)}')` : `background:${esc(p.banner_color || p.avatar_color || '#5865f2')}`;
  const style = themed ? `background:linear-gradient(180deg,${esc(p.theme_a)},${esc(p.theme_b || p.theme_a)});--pc-bg:${esc(p.theme_a)}` : '';
  const bs = badgesOf(p);
  return `<div class="pcard2 ${themed?'themed':''}" style="${style}">
    <div class="bn" style="${banner}"></div>
    <div class="avwrap">${avatar(p,'',true)}</div>
    <div class="bdg">${bs.length ? `<div class="badges">${bs.map(b => badgeHtml(b, p)).join('')}</div>` : ''}</div>
    <div class="inner">
      <b class="dn">${esc(p.display_name)}${plus ? '<span class="plustag">TELÃO+</span>' : ''}</b>
      <div class="un">@${esc(p.username)}</div>
      ${p.bio ? `<h6>Sobre mim</h6><p>${esc(p.bio)}</p>` : ''}
      ${p.created_at ? `<h6>Membro desde</h6><p>${new Date(p.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}</p>` : ''}
      ${extra}
    </div></div>`;
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
    nav = [['h', esc(s.name)], ['overview','Visão geral'], ['channels','Canais'], ['members','Membros'], ['invites','Convites'], ['hr'], ['delete','Excluir servidor','danger']];
  }
  SET.el.className = 'settings' + (SET.mobileOpen ? ' sec-open' : '');
  SET.el.innerHTML = `<nav class="snav"><div class="in">${nav.map(n =>
      n[0] === 'h' ? `<h5>${n[1]}</h5>` : n[0] === 'hr' ? '<hr>' :
      `<button class="si ${SET.sec===n[0]?'on':''} ${n[2]||''}" data-sec="${n[0]}">${n[1]}</button>`).join('')}
      ${SET.kind==='user' ? '<hr><div class="ver">Telão · versão 2.0</div>' : ''}</div></nav>
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
    : { overview: secSrvOverview, channels: secSrvChannels, members: secSrvMembers, invites: secSrvInvites }[SET.sec];
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
  const D = { display_name: me.display_name, bio: me.bio || '', avatar_url: me.avatar_url || null, banner_url: me.banner_url || null,
              banner_color: me.banner_color || me.avatar_color, avatar_color: me.avatar_color, theme_a: me.theme_a || null, theme_b: me.theme_b || null, house: me.house || null };
  const lockBox = what => `<div class="locked">🔒 ${what} <button class="btn sm" data-plus>Conhecer o Telão+</button></div>`;
  box.innerHTML = `${back}<h2>Perfis</h2><div class="profgrid"><div>
    <label class="field"><span>Nome de exibição</span><input class="inp" id="pfN" maxlength="32"></label>
    <hr class="sdiv">
    <h3>Avatar</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfAv">Mudar avatar</button><button class="btn sec sm" id="pfAvRm">Remover</button></div>
    <small style="color:var(--mut);display:block;margin-top:6px">PNG, JPG ou WEBP até ${plus?'8':'2'} MB. ${plus ? '<b style="color:#c9a6ff">GIF animado liberado ✨</b>' : 'GIF animado é do <a data-plus style="cursor:pointer">Telão+</a>.'}</small>
    <h3>Cor do avatar</h3><div class="colors" id="pfAc">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    <hr class="sdiv">
    <h3>Banner do perfil</h3>
    ${plus ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfBn">Mudar banner (imagem ou GIF)</button><button class="btn sec sm" id="pfBnRm">Remover</button></div>` : lockBox('Banner com imagem ou GIF é do Telão+.')}
    <h3>Cor do banner</h3><div class="colorrow"><input type="color" id="pfBc"><small style="color:var(--mut)">Aparece quando não tem imagem.</small></div>
    <hr class="sdiv">
    <h3>Tema do perfil ${plus?'':'🔒'}</h3>
    ${plus ? `<div class="colorrow"><label>Principal <input type="color" id="pfTa"></label><label>Destaque <input type="color" id="pfTb"></label><button class="btn sec sm" id="pfTrm">Sem tema</button></div>` : lockBox('Cores personalizadas no cartão de perfil são do Telão+.')}
    <hr class="sdiv">
    <h3>Casa (insígnia grátis)</h3>
    <div class="chips" id="pfH">${[['', 'Nenhuma'], ['chama','Chama'], ['raio','Raio'], ['onda','Onda']].map(([v,l]) => `<button class="chip" data-h="${v}">${v ? `<span class="badge-i sm" style="margin:0">${badgeSvg(v)}</span>` : ''}${l}</button>`).join('')}</div>
    <hr class="sdiv">
    <label class="field"><span>Sobre mim</span><textarea class="inp" id="pfBio" maxlength="190" placeholder="Conte um pouco sobre você"></textarea><div class="counter" id="pfCnt"></div></label>
    <input type="file" id="pfFile" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
    <div id="pfSave"></div>
  </div><div><h3 style="margin-top:0">Prévia</h3><div class="pcard" style="background:none;box-shadow:0 6px 24px rgba(0,0,0,.35)" id="pfPrev"></div></div></div>`;
  const $b = s => box.querySelector(s);
  const draft = () => ({ ...me, ...D });
  const setDirty = () => {
    const changed = Object.keys(D).some(k => (D[k] || null) !== ((k === 'banner_color' ? (me.banner_color || me.avatar_color) : me[k]) || null) && !(k==='bio' && D.bio === (me.bio||'')));
    SET.dirty = changed;
    $b('#pfSave').innerHTML = changed ? `<div class="savebar"><span>Cuidado — você tem alterações não salvas!</span><button class="btn sec sm" id="pfReset">Redefinir</button><button class="btn ok sm" id="pfOk">Salvar alterações</button></div>` : '';
    if(changed){ $b('#pfReset').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#pfOk').onclick = save; }
  };
  const refresh = () => {
    $b('#pfPrev').innerHTML = profileCard(draft());
    box.querySelectorAll('#pfAc [data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === D.avatar_color));
    box.querySelectorAll('#pfH [data-h]').forEach(x => x.classList.toggle('on', (x.dataset.h || null) === (D.house || null)));
    $b('#pfCnt').textContent = (190 - D.bio.length) + ' restantes';
    setDirty();
  };
  $b('#pfN').value = D.display_name; $b('#pfBio').value = D.bio; $b('#pfBc').value = D.banner_color;
  $b('#pfN').oninput = e => { D.display_name = e.target.value; refresh(); };
  $b('#pfBio').oninput = e => { D.bio = e.target.value; refresh(); };
  $b('#pfBc').oninput = e => { D.banner_color = e.target.value; refresh(); };
  box.querySelectorAll('#pfAc [data-c]').forEach(x => x.onclick = () => { D.avatar_color = x.dataset.c; refresh(); });
  box.querySelectorAll('#pfH [data-h]').forEach(x => x.onclick = () => { D.house = x.dataset.h || null; refresh(); });
  box.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => setSec('plus'));
  if(plus){
    $b('#pfTa').value = D.theme_a || '#5b3fd6'; $b('#pfTb').value = D.theme_b || '#c43a9b';
    $b('#pfTa').oninput = e => { D.theme_a = e.target.value; D.theme_b = D.theme_b || $b('#pfTb').value; refresh(); };
    $b('#pfTb').oninput = e => { D.theme_b = e.target.value; D.theme_a = D.theme_a || $b('#pfTa').value; refresh(); };
    $b('#pfTrm').onclick = () => { D.theme_a = D.theme_b = null; refresh(); };
    $b('#pfBnRm').onclick = () => { D.banner_url = null; refresh(); };
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
    const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `${me.id}/${target}-${Date.now()}.${ext}`;
    const { error } = await App.sb.storage.from('media').upload(path, f, { contentType: f.type, cacheControl: '31536000', upsert: false });
    if(error){ App.toast('Não deu para enviar: ' + error.message, true); return; }
    const url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    if(target === 'avatar') D.avatar_url = url; else D.banner_url = url;
    App.toast('Imagem pronta! Clique em “Salvar alterações”.');
    refresh();
  };
  async function save(){
    const upd = { display_name: D.display_name.trim() || me.username, bio: D.bio.trim(), avatar_url: D.avatar_url, banner_url: D.banner_url,
                  banner_color: D.banner_color, avatar_color: D.avatar_color, theme_a: D.theme_a, theme_b: D.theme_b, house: D.house };
    const { data, error } = await App.sb.from('profiles').update(upd).eq('id', me.id).select().single();
    if(error){ App.toast(error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data);
    SET.dirty = false; App.toast('Perfil salvo! ✨');
    renderSettings(); renderUserPanel(); renderMembers(); if(M.el) renderMsgList(false);
  }
  refresh();
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
      if(!('setSinkId' in HTMLMediaElement.prototype)){ $b('#vOut').disabled = true; $b('#vOut').innerHTML = '<option>Seu navegador não permite escolher</option>'; }
      $b('#vPerm').innerHTML = noLabels ? `<div class="locked" style="border-color:var(--line)">Para ver os nomes dos dispositivos, permita o microfone. <button class="btn sm" id="vAllow">Permitir</button></div>` : '';
      const al = $b('#vAllow'); if(al) al.onclick = async () => { try{ (await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop()); }catch(e){} fillDevices(); };
    }catch(e){}
  }
  fillDevices();
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
    <hr class="sdiv"><small style="color:var(--mut)">Telão · versão 2.0</small>`;
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
    <h3>Procurar usuário</h3>
    <input class="inp" id="adQ" placeholder="nome de usuário ou nome" autocomplete="off">
    <div class="slist adminres" id="adRes" style="margin-top:10px"></div>
    <div id="adUser"></div>
    <hr class="sdiv"><h3>Últimos pagamentos</h3><div id="adPays" style="font-size:14px;color:var(--mut)">Carregando…</div>`;
  const $b = s => box.querySelector(s);
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
  box.innerHTML = `${back}<h2>Visão geral do servidor</h2>
    <div style="display:flex;gap:20px;align-items:center;margin-bottom:20px"><div class="ricon on" id="soIcon" style="width:80px;height:80px;font-size:26px;border-radius:24px;background:${esc(s.icon_color)}">${esc(serverInitials(s.name))}</div>
    <div style="flex:1"><label class="field"><span>Nome do servidor</span><input class="inp" id="soN" maxlength="40" value="${esc(s.name)}"></label></div></div>
    <h3>Cor do ícone</h3><div class="colors" id="soC">${COLORS.map(c => `<button type="button" data-c="${c}" class="${c===s.icon_color?'on':''}" style="background:${c}"></button>`).join('')}</div>
    <div id="soSave"></div>`;
  let color = s.icon_color;
  const $b = q => box.querySelector(q);
  const upd = () => {
    $b('#soIcon').style.background = color; $b('#soIcon').textContent = serverInitials($b('#soN').value || '?');
    const dirty = $b('#soN').value.trim() !== s.name || color !== s.icon_color; SET.dirty = dirty;
    $b('#soSave').innerHTML = dirty ? `<div class="savebar"><span>Cuidado — você tem alterações não salvas!</span><button class="btn sec sm" id="soR">Redefinir</button><button class="btn ok sm" id="soOk">Salvar alterações</button></div>` : '';
    if(dirty){ $b('#soR').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#soOk').onclick = save; }
  };
  $b('#soN').oninput = upd;
  box.querySelectorAll('#soC [data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; box.querySelectorAll('#soC [data-c]').forEach(x => x.classList.toggle('on', x === b)); upd(); });
  async function save(){
    const name = $b('#soN').value.trim(); if(!name) return;
    const { error } = await App.sb.from('servers').update({ name, icon_color: color }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    s.name = name; s.icon_color = color; SET.dirty = false; await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s;
    renderRail(); renderSidebar(); renderSettings(); App.toast('Servidor atualizado!');
  }
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
      ${m.user_id === s.owner_id ? '<span class="crown">👑 Dono</span>' : `<button class="btn red sm" data-kick="${m.user_id}">Expulsar</button>`}</div>`).join('');
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
