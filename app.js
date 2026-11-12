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

const APP_VERSION = '6.7';
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
  return `<div class="av ${cls}${ring}" style="--avc:${esc(p.avatar_color||'#ff2e9a')}">${img}${status?`<span class="st s-${statusOf(p.id)}"></span>`:''}</div>`;
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
  el.innerHTML = items.map((it,i) => it === '-' ? '<hr>' : it.raw ? it.raw : it.html ? `<div style="padding:6px 10px">${it.html}</div>` : `<button data-i="${i}" class="${it.danger?'danger':''} ${it.cls||''}">${esc(it.label)}<span>${it.icon||''}</span></button>`).join('');
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
  try{ await navigator.clipboard.writeText(text); App.toast('Copiado'); }
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
  // voltou do link de confirmação do e-mail
  if(/[?&]novasenha=1/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
  if(/[?&]confirmado=1/.test(location.search) || hp.get('type') === 'signup'){ S.justConfirmed = !linkErr; history.replaceState(null, '', location.pathname + location.hash); }
  if(linkErr){
    history.replaceState(null, '', location.pathname);
    const le = linkErr.replace(/\+/g,' ');
    setTimeout(() => authError(/expired|invalid/i.test(le) ? 'Esse link de confirmação expirou ou já foi usado. Se você já confirmou, é só entrar com e-mail e senha. Se não, peça um novo link abaixo.'
      : /database error saving new user/i.test(le) ? 'Não deu para criar sua conta agora (erro no banco). Dono do site: rode o supabase.sql de novo no SQL Editor.'
      : /exchange external code|unable to exchange/i.test(le) ? 'O Google recusou o login. Dono do site: confira o Client Secret do Google no Supabase (veja o LEIA-ME, parte "Login com Google").'
      : /access_denied|denied/i.test(le) ? 'Login com Google cancelado.' : le), 300);
  }
  const pr = location.hash.match(/^#plus-(ok|pendente|erro)/);
  if(pr){ S.plusReturn = pr[1] === 'ok' ? 'ok' : pr[1]; history.replaceState(null, '', location.pathname); }
  const m = location.hash.match(/convite=([a-z0-9-]+)/i);
  if(/[?&]desktop=1/.test(location.search)){ history.replaceState(null, '', location.pathname + location.hash); document.documentElement.classList.add('desktop'); }
  if(window.telaoDesktop) document.documentElement.classList.add('desktop');
  if(m){ S.pendingInvite = m[1].toLowerCase(); history.replaceState(null, '', location.pathname); }
  App.sb.auth.onAuthStateChange((ev, session) => {
    if(ev === 'PASSWORD_RECOVERY') setTimeout(newPasswordModal, 800);
    if(ev === 'SIGNED_OUT'){ location.reload(); return; }
    if(session && !S.started){ S.started = true; setTimeout(() => start(session), 0); if(S.justConfirmed) showConfirmed(true); }
    else if(!session && ev === 'INITIAL_SESSION' && S.justConfirmed) showConfirmed(false);
    else if(!session && ev === 'INITIAL_SESSION') showAuth();
  });
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

/* tela "conta confirmada" */
function showConfirmed(logged){
  S.justConfirmed = false;
  const el = document.createElement('div'); el.className = 'confirmed';
  el.innerHTML = `<div class="cbox2"><div class="cicon">✓</div><h1>Conta confirmada!</h1>
    <p>${logged ? 'Tudo certo, seu e-mail foi verificado. Você já pode usar o Telão — chame seus amigos, crie um servidor e bora compartilhar a tela.' : 'Seu e-mail foi verificado. Agora é só entrar com seu e-mail e senha.'}</p>
    <button class="btn" id="cfGo">${logged ? 'Começar a usar o Telão' : 'Entrar'}</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#cfGo').onclick = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
}

/* ---------------- autenticação ---------------- */
let authMode = 'login';
function showAuth(){
  $('#auth').classList.remove('hidden');
  if(S.pendingInvite){ $('#authSub').textContent = 'Entre ou crie uma conta para aceitar o convite.'; }
  if(!window.telaoDesktop) App.sb.from('app_config').select('value').eq('key', 'desktop_url').maybeSingle().then(({ data }) => {
    if(data && data.value && !$('#authDl')) $('#authSwitch').insertAdjacentHTML('afterend', `<div class="switch" id="authDl"><a href="/baixar">Baixar o Telão para Windows</a></div>`);
  });
}
function setAuthMode(mode){
  authMode = mode; $('#authErr').textContent = ''; $('#authErr').classList.remove('ok-msg');
  const reg = mode === 'register';
  $('#regFields').classList.toggle('hidden', !reg);
  $('#forgotBox').classList.toggle('hidden', reg);
  $('#authTitle').textContent = reg ? 'Criar uma conta' : 'Boas-vindas de volta!';
  $('#authSub').textContent = reg ? 'Leva 10 segundos.' : 'Que bom te ver de novo.';
  $('#authBtn').textContent = reg ? 'Continuar' : 'Entrar';
  $('#aPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authSwitch').innerHTML = reg ? 'Já tem uma conta? <a id="toLogin">Entrar</a>' : 'Precisa de uma conta? <a id="toReg">Cadastre-se</a>';
  const a = $('#toLogin') || $('#toReg'); a.onclick = () => setAuthMode(reg ? 'login' : 'register');
}
$('#toReg').onclick = () => setAuthMode('register');
$('#googleBtn').onclick = async () => {
  // confere antes se o Google está ligado no Supabase (senão o usuário cai numa página de erro em inglês)
  try{
    const r = await fetch(App.sbUrl + '/auth/v1/settings', { headers:{ apikey: CFG.SUPABASE_ANON_KEY.trim() } });
    const st = await r.json();
    if(st && st.external && st.external.google === false){ authError('O login com Google ainda não está ligado. Por enquanto, entre com e-mail e senha.'); return; }
  }catch(e){}
  const { error } = await App.sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + '/', queryParams:{ prompt:'select_account' } } });
  if(error) authError(/provider is not enabled|unsupported provider/i.test(error.message) ? 'O login com Google ainda não foi ativado no Supabase (veja o LEIA-ME).' : error.message);
};
$('#resendLink').onclick = async () => {
  const email = $('#aEmail').value.trim();
  if(!email){ authError('Digite seu e-mail no campo acima.'); return; }
  const { error } = await App.sb.auth.resend({ type:'signup', email, options:{ emailRedirectTo: location.origin + '/?confirmado=1' } });
  if(error) authError(error.message); else authOk('Enviamos de novo para <b>'+esc(email)+'</b>. Pode levar 1–2 minutos; veja também o spam.');
};
async function forgotPassword(){
  const email = $('#aEmail').value.trim();
  if(!email){ authError('Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".'); $('#aEmail').focus(); return; }
  const { error } = await App.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/?novasenha=1' });
  if(error) authError(error.message); else authOk('Se existir uma conta com <b>' + esc(email) + '</b>, enviamos um link para criar uma nova senha. Veja também o spam.');
}
$('#forgotLink').onclick = forgotPassword;
/* voltou do link "nova senha" */
function newPasswordModal(){
  modal(`<form id="npF"><div class="mh"><h2>Criar nova senha</h2><p>Escolha a senha nova da sua conta.</p></div>
    <div class="mc"><label class="field"><span>Nova senha</span><input class="inp" type="password" id="npA" minlength="6" autocomplete="new-password" required></label>
    <label class="field"><span>Confirme a nova senha</span><input class="inp" type="password" id="npB" minlength="6" autocomplete="new-password" required></label><div class="err" id="npE"></div></div>
    <div class="mf"><button class="btn">Salvar senha</button></div></form>`, m => {
    m.querySelector('#npF').onsubmit = async e => {
      e.preventDefault();
      const a = m.querySelector('#npA').value, b = m.querySelector('#npB').value;
      if(a !== b){ m.querySelector('#npE').textContent = 'As senhas não são iguais.'; return; }
      const { error } = await App.sb.auth.updateUser({ password: a });
      if(error){ m.querySelector('#npE').textContent = error.message; return; }
      closeModal(); App.toast('Senha nova salva. Você já está dentro.');
    };
  });
}
function authOk(html){ const e = $('#authErr'); e.classList.add('ok-msg'); e.innerHTML = html; }
function authError(msg){
  $('#authErr').classList.remove('ok-msg');
  if(msg === 'EMAIL_EXISTE' || /already registered|already been registered|user already exists/i.test(msg)){
    $('#authErr').innerHTML = '⚠️ Já existe uma conta com esse e-mail. Entre com sua senha abaixo — se você criou a conta pelo Google, use <b>Continuar com Google</b>. Esqueceu a senha? <a id="aeForgot">Criar uma nova</a>.';
    const f = $('#aeForgot'); if(f) f.onclick = forgotPassword;
    $('#aPass').focus(); return;
  }
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
      const { data, error } = await App.sb.auth.signUp({ email, password, options:{ data:{ username, display_name }, emailRedirectTo: location.origin + '/?confirmado=1' } });
      if(error){ authError(error.message); return; }
      // o Supabase não dá erro para e-mail repetido (por segurança): devolve um usuário sem identidades
      if(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
        setAuthMode('login'); $('#aEmail').value = email; $('#aPass').value = '';
        authError('EMAIL_EXISTE');
        return;
      }
      if(!data.session){
        setAuthMode('login'); $('#aEmail').value = email;
        authOk('Conta criada! Enviamos um link de confirmação para <b>'+esc(email)+'</b>. Abra o e-mail (veja também o spam), clique no link e você já entra.');
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
  if(kind === 'pendente'){ App.toast('Pagamento em processamento. Quando o Pix cair, seu Telão+ ativa sozinho.'); return; }
  App.toast('Pagamento aprovado. Ativando seu Telão+…');
  const before = S.me.plan_until;
  for(let i = 0; i < 12; i++){
    await new Promise(r => setTimeout(r, 3000));
    const { data } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
    if(data && data.plan_until !== before){ S.me = data; S.profiles.set(data.id, data); renderAll(); App.toast('Telão+ ativado. Aproveite.'); openSettings('user','plus'); return; }
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
  const [{ data }] = await Promise.all([App.sb.from('server_members').select('*').eq('server_id', sid), loadRoles(sid)]);
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
    .on('broadcast', { event:'mod-disconnect' }, ({payload}) => App.onModDisconnect && App.onModDisconnect(payload))
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
      if(!was || was.voice !== mine){ if(!(App.entrance && App.entrance(m.user_id))) App.sfx('join'); }
      else if(m.sharing && !was.sharing) App.sfx('screen');
      else if(!m.sharing && was.sharing) App.sfx('screenoff');
    }
    const key = m.voice + ':' + sess + ':' + (m.screen || '');
    if(m.sharing && (!was || !was.sharing) && !S.liveSeen.has(key) && m.user_id !== S.me.id){
      S.liveSeen.add(key);
      if(mine === m.voice || isDnd()) return;
      const ch = findChannel(m.voice); if(!ch) return;
      const where = ch.kind === 'dm' ? 'numa chamada com você' : 'em ' + ch.name;
      App.toast(`${prof(m.user_id).display_name} está transmitindo ${where}`, false, { label: 'Assistir', fn: () => watchLive(m.voice, sess) });
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
    ch.on('broadcast', { event:'thumb' }, ({ payload }) => App.onThumb && App.onThumb(topic, payload));
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
  if(row.user_id === S.me.id && p.eventType === 'UPDATE'){
    if(S.members.has(row.server_id)){ await loadMembers(row.server_id); renderMembers(); }
    App.onModChange && App.onModChange(row); return;
  }
  if(row.user_id === S.me.id){
    if(p.eventType === 'DELETE') App.onRemoved && App.onRemoved(row);
    await loadServers(); renderRail();
    if(p.eventType === 'DELETE' && S.route.kind === 'server' && S.route.sid === row.server_id){
      if(Voice.channel && Voice.channel.server_id === row.server_id) Voice.leave();
      App.toast('Você não está mais nesse servidor.'); go({ kind:'home', dm:null });
    } else renderSidebar();
    return;
  }
  if(S.members.has(row.server_id)){ await loadMembers(row.server_id); renderMembers(); renderSidebar(); }
  if(p.eventType === 'UPDATE' && Voice.channel) Voice.peers.forEach(pp => Voice.applyVolume(pp));
}

/* ---------------- atualizações e avisos globais ---------------- */
function updateBar(text, reload){
  let bar = $('#updbar');
  if(!bar){ bar = document.createElement('div'); bar.id = 'updbar'; bar.className = 'updbar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span>${ic('refresh',18)} ${esc(text)}</span>${reload ? `<button class="btn sm" id="updGo">${ic('refresh',15)} Atualizar agora</button>` : ''}<button class="ibtn" id="updX" title="Fechar">${ic('x',16)}</button>`;
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
  updateBar(`${from}: ${pl.text}`, !!pl.reload);
  App.sfx('ring');
  if(pl.from !== S.me?.id) notify('Aviso do Telão', pl.text, null);
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

const LOGO = `<svg class="tlogo" viewBox="0 0 125 135" width="30" height="30" aria-hidden="true"><g transform="translate(5 5)" stroke="#FF2E9A" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 22 L106 18 L102 88 L18 92 Z"/><path d="M30 92 V108"/><path d="M72 90 V116"/><path d="M30 60 C38 44, 50 44, 58 56 S78 70, 90 50"/></g><g stroke="currentColor" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 22 L106 18 L102 88 L18 92 Z"/><path d="M30 92 V108"/><path d="M72 90 V116"/></g><circle cx="30" cy="112" r="6" fill="currentColor"/><circle cx="72" cy="120" r="6" fill="currentColor"/><path d="M30 60 C38 44, 50 44, 58 56 S78 70, 90 50" fill="none" stroke="#B6FF2E" stroke-width="11" stroke-linecap="round"/></svg>`;
/* ---------------- barra de servidores ---------------- */
function serverIcon(s, size){
  return s.icon_url ? `<img src="${esc(s.icon_url)}" alt="" loading="lazy" decoding="async">` : esc(serverInitials(s.name));
}
function renderRail(){
  const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
  const dmUnread = S.dms.filter(d => S.unread.has(d.id)).length;
  const homeBadge = pend + dmUnread;
  if(window.telaoDesktop){ const tot = homeBadge + S.servers.filter(s => (S.channels.get(s.id) || []).some(c => S.unread.has(c.id))).length; if(tot !== S._deskBadge){ S._deskBadge = tot; window.telaoDesktop.badge(tot); } }
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
  h += `<button class="ricon add shopb" id="rShop" data-tip="Loja do Telão" data-tipsub="fichas, itens e presentes" data-tipside="r">${ic('gift',22)}${S.me && S.me.last_daily !== new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}) ? '<span class="badge dotb"></span>' : ''}</button>`;
  $('#rail').innerHTML = h;
  $('#rHome').onclick = () => go({ kind:'home', dm: S.route.kind==='home' ? S.route.dm : null }, true);
  $('#rAdd').onclick = addServerModal;
  $('#rShop').onclick = () => openSettings('user', 'shop');
  $$('#rail [data-sid]').forEach(b => b.onclick = () => go({ kind:'server', sid: b.dataset.sid }, true));
  $$('#rail [data-dmr]').forEach(b => b.onclick = () => go({ kind:'home', dm: b.dataset.dmr }));
}

/* ---------------- status (online, ausente, não perturbe, invisível) ---------------- */
const STATUS = { online:['Online','#b6ff2e'], idle:['Ausente','#f0b232'], dnd:['Não perturbe','#f23f43'], invisible:['Invisível','#80848e'], offline:['Offline','#80848e'] };
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
    head.innerHTML = `<div class="brandrow"><span class="logo">${LOGO}</span><b class="tagw">telão</b></div><button class="findbtn" id="sbFind">${ic('search',15)}<span>Buscar ou ir para…</span><kbd>Ctrl K</kbd></button>`; head.onclick = null;
    $('#sbFind').onclick = quickSwitcher;
    const pend = S.friends.filter(f => f.status === 'pending' && f.incoming).length;
    const dms = [...S.dms].sort((a,b) => (S.dmActivity[b.id] || b.created_at).localeCompare(S.dmActivity[a.id] || a.created_at));
    body.innerHTML = `
      <div class="ch big ${!S.route.dm?'on':''}" id="sbFriends"><span class="ic">${ic('users',20)}</span><span class="nm">Amigos</span>${pend?`<span class="pill">${pend}</span>`:''}</div>
      <div class="ch big" id="sbPlus"><span class="ic plusic">${ic('star',20)}</span><span class="nm">Telão+</span></div>
      <div class="cat"><span>Mensagens diretas</span><button id="sbNewDm" data-tip="Nova conversa">${ic('plus',16)}</button></div>
      ${dms.length ? dms.map(d => { const p = prof(dmOther(d)); const call = voiceUsers(d).length;
        return `<div class="dmitem ${S.route.dm===d.id?'on':''} ${S.unread.has(d.id)?'unread':''}" data-dm="${d.id}">${avatar(p,'',true)}<div class="dmt"><span class="nm">${esc(p.display_name)}</span>${(App.actLine && App.actLine(p)) || p.custom_status ? `<small>${statusText(p)}</small>` : ''}</div>${call?`<span class="incall" data-tip="Em chamada">${ic('volume',16)}</span>`:''}</div>`; }).join('')
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
    <span class="icons">${u.camera ? `<span class="vi">${ic('video',14)}</span>` : ''}${u.sharing ? `<button class="live" data-watch="${u.voice}" data-wsess="${u.session}" data-tip="Clique para assistir">AO VIVO</button>` : ''}${u.smod || (App.srvVoiceMuted && App.srvVoiceMuted(u.user_id)) ? `<span class="vi off smod" data-tip="Silenciado por moderador">${ic('micOff',14)}</span>` : u.deafened ? `<span class="vi off">${ic('headphonesOff',14)}</span>` : u.muted ? `<span class="vi off">${ic('micOff',14)}</span>` : ''}</span></div>`;
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
  items.push({ label: S.manualAct ? 'Mudar atividade' : 'Definir atividade', icon: ic('gamepad',18), onClick: () => App.activityModal() });
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
      <button class="vb" id="vpAct" data-tip="Atividades e soundboard">${ic('gamepad',18)}</button>
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
    mountMessages(d, $('#msgWrap'), `<div class="welcome">${avatar(p,'xl')}<h1>${esc(p.display_name)}</h1><p class="un">@${esc(p.username)}</p><p>Este é o começo da sua conversa com <b>${esc(p.display_name)}</b>. Mande um oi.</p></div>`);
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
  const memBtn = [['hMembers','users','Mostrar/esconder membros', (innerWidth <= 1100 ? S.memOverlay : S.showMembers !== false) ? 'on' : '']];
  if(c.kind === 'text'){
    head.innerHTML = `${back}<div class="htitle"><span class="hic">${ic('hash',22)}</span><b>${esc(c.name)}</b>${c.topic ? `<span class="hdiv"></span><span class="desc" id="hTopic" title="${esc(c.topic)}">${richText(c.topic)}</span>` : ''}</div><span class="grow"></span>
      ${headBtns([['hPins','pin','Mensagens fixadas'], ...memBtn, ['hSearch','search','Buscar'], ['mInvite','userPlus','Convidar amigos']])}`;
    $('#hPins').onclick = e => showPins(e.currentTarget); $('#hSearch').onclick = e => showSearch(e.currentTarget);
    $('#mInvite').onclick = () => inviteModal(s);
    $('#hMembers').onclick = e => {
      // só mostra/esconde a lista: não recarrega as mensagens nem perde a rolagem
      if(innerWidth <= 1100){ S.memOverlay = !S.memOverlay; e.currentTarget.classList.toggle('on', S.memOverlay); }
      else { S.showMembers = S.showMembers === false; ls.set('telao-showmembers', S.showMembers); e.currentTarget.classList.toggle('on', S.showMembers); }
      renderMembers();
    };
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
  const colors = ['#ff2e9a','#ffd166','#06d6a0','#4cc9f0','#b388ff','#ff4d8d'];
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
  const imgs = at.filter(a => isImg(a) || isVid(a)), others = at.filter(a => !isImg(a) && !isVid(a) && a.type !== 'poll' && a.type !== 'gift');
  let h = at.filter(a => a.type === 'poll').map(a => pollHtml(m, a)).join('') + at.filter(a => a.type === 'gift').map(a => App.giftCardHtml(a)).join('');
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
  m.pinned = !m.pinned; App.onMsgUpdate({ ...m }); App.toast(m.pinned ? 'Mensagem fixada' : 'Mensagem desafixada');
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
            ${f.s.mine || !f.s.stream.getAudioTracks().length ? '' : `<span class="svol"><button id="stVolB" data-tip="Volume da tela">${ic((Voice.screenVolumes.get(f.s.user_id) ?? 1) === 0 ? 'micOff' : 'volume',18)}</button><input type="range" id="stVol" min="0" max="100" value="${Math.round((Voice.screenVolumes.get(f.s.user_id) ?? 1)*100)}"></span>`}
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
        <button class="cbtn" id="sbAct" data-tip="Atividades">${ic('gamepad',22)}</button>
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
    $w('#stDraw').onclick = () => { DRAW.on = !DRAW.on; renderStage(); if(DRAW.on) App.toast('Desenhe na tela: todo mundo assistindo vê. Clique de novo para parar.'); };
    $w('#stCine').onclick = toggleCinema;
    const sv = $w('#stVol'); if(sv){
      sv.oninput = () => Voice.setScreenVolume(focused.s.user_id, sv.value / 100);
      $w('#stVolB').onclick = () => { const cur = Voice.screenVolumes.get(focused.s.user_id) ?? 1; const nv = cur > 0 ? 0 : 1; Voice.setScreenVolume(focused.s.user_id, nv); sv.value = nv * 100; $w('#stVolB').innerHTML = ic(nv ? 'volume' : 'micOff', 18); };
    }
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
    try{ await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); App.toast('Print copiado. Cole no chat com Ctrl+V'); }
    catch(e){ App.toast('Print salvo'); }
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
    App.toast(`Gravação salva (${fmtSize(blob.size)})`);
  };
  rec.start(1000);
  Object.assign(REC, { on:true, rec, t0: Date.now() });
  App.toast('Gravando… clique de novo para parar e baixar');
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
    }[id] || (EXTRA_SOUNDS[id] ? () => EXTRA_SOUNDS[id](tone, noise) : ()=>{}))();
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
  el.innerHTML = `<div class="pphead">${ic('gamepad',18)} Atividades</div>
    <button class="actbig" id="acWT"><span class="ai">${ic('tv',26)}</span><div><b>Assistir juntos</b><small>Vídeo do YouTube sincronizado para todo mundo na chamada</small></div></button>
    <button class="actbig" id="acCap"><span class="ai">🗨️</span><div><b>Legendas ao vivo</b><small>Sua fala vira texto para todo mundo da chamada (acessibilidade)</small></div></button>
    <div class="actsec">${ic('music',15)} Soundboard <small>todos ouvem</small></div>
    <div class="sboard">${soundList().map(([id, e, n]) => `<button data-snd="${id}"><span>${e}</span>${n}</button>`).join('')}</div>
    <div class="actsec">${ic('smile',15)} Reações na tela</div>
    <div class="quickrx">${['😂','🔥','👏','❤️','😮','💀','🎉','👀'].map(e => `<button data-fx="${e}">${e}</button>`).join('')}</div>`;
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.left - 140, innerWidth - 380)) + 'px';
  el.style.top = Math.max(8, r.top - el.offsetHeight - 10) + 'px';
  el.querySelector('#acWT').onclick = () => { closeMenu(); wtPrompt(); };
  el.querySelector('#acCap').onclick = () => { closeMenu(); App.toggleCaptions(); };
  el.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => {
    if(Date.now() - lastSound < 1500){ App.toast('Calma. Espere um pouquinho entre os sons'); return; }
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
  if(pl.t === 'wt-load'){ Object.assign(WT, { active:true, channel: Voice.channel.id, id: pl.id, title:'', state:{ time: pl.time, playing: pl.playing, at: Date.now() } }); WT.player = null; S.focus = 'wt'; renderStage(); if(!mine) App.toast(`${prof(pl.uid).display_name} começou um vídeo para assistir juntos`); }
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
      const sharing = voiceUsers(Voice.channel).some(m => m.user_id === uid && m.sharing);
      const svol = Math.round((Voice.screenVolumes.get(uid) ?? 1) * 100);
      items.push({ html:`<div class="uvol">${ic('mic',16)}<span>Volume da voz</span><b id="uvL">${vol}%</b></div><input type="range" id="uvR" min="0" max="100" value="${vol}" class="range">
          ${sharing ? `<div class="uvol" style="margin-top:8px">${ic('monitor',16)}<span>Volume da tela</span><b id="usL">${svol}%</b></div><input type="range" id="usR" min="0" max="100" value="${svol}" class="range">` : ''}`,
        mount: el => {
          const r = el.querySelector('#uvR'); r.oninput = () => { el.querySelector('#uvL').textContent = r.value + '%'; Voice.setUserVolume(uid, r.value / 100); };
          const r2 = el.querySelector('#usR'); if(r2) r2.oninput = () => { el.querySelector('#usL').textContent = r2.value + '%'; Voice.setScreenVolume(uid, r2.value / 100); };
        } });
    }
    if(!(fr && fr.status === 'accepted')) items.push({ label:'Mandar mensagem', icon: ic('chat',18), onClick: () => openDM(uid) });
    if(fr && fr.status === 'accepted') items.push({ label:'Mensagem', icon: ic('chat',18), onClick: () => openDM(uid) }, { label:'Ligar', icon: ic('phone',18), onClick: async () => { const d = await openDM(uid); if(d) joinVoice(d); } }, { label:'Dar presente', icon: '<span style="font-size:16px;width:18px;text-align:center">🎁</span>', onClick: () => giftModal(uid) });
    else if(!fr) items.push({ label:'Adicionar amigo', icon: ic('userPlus',18), onClick: async () => {
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: p.username });
      App.toast(error ? error.message : data === 'accepted' ? 'Agora vocês são amigos!' : 'Pedido enviado!', !!error); loadFriends().then(renderRail);
    }});
    else if(fr.status === 'pending') items.push({ html: `<div style="color:var(--mut);font-size:13px">${fr.incoming ? 'Te mandou pedido de amizade' : 'Pedido de amizade enviado'}</div>` });
    const s = curServer();
    if(s && App.hasPerm(s.id, 16) && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push({ label:'Cargos', icon: ic('shield',18), onClick: () => App.roleAssignMenu(s, uid, x, y) });
    if(s && App.modItems) items.push(...App.modItems(s, uid, x, y));
    if(s && App.hasPerm(s.id, 4) && uid !== s.owner_id && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push('-', { label:'Expulsar do servidor', icon: ic('logout',18), danger:true, onClick: async () => {
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.rpc('kick_member', { p_server: s.id, p_user: uid });
      if(error) App.toast(error.message, true); else App.toast(p.display_name + ' foi expulso.');
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
  if(document.body.classList.contains('cinema')) App.toast('Modo cinema — aperte Esc para sair');
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
  const color = S.me.avatar_color || '#ff2e9a';
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
  [64, 'Moderar membros', 'Dar castigo no chat e silenciar, ensurdecer ou desconectar pessoas da call.'],
  [128, 'Banir membros', 'Tirar do servidor e impedir de voltar.'],
  [256, 'Gerenciar eventos', 'Criar, editar e apagar eventos do servidor.'],
  [512, 'Gerenciar emojis', 'Enviar, renomear e apagar emojis do servidor.'],
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
  const want = innerWidth <= 1100 ? !!S.memOverlay : S.showMembers !== false;
  document.body.classList.toggle('mem-open', !!(s && textView && want));
  if(!s || !S.members.has(s.id) || !want || !textView){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
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
    const sub = activity(m.user_id) || (App.actLine && App.actLine(m.p)) || (m.p.custom_status ? statusText(m.p) : '');
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
  const items = [{ label:'Impulsionar servidor', icon: BOOST_SVG(18), cls:'boostitem', onClick: () => boostServerModal(s) }, { label:'Convidar pessoas', icon: ic('userPlus',18), onClick: () => inviteModal(s) }];
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
      <button class="choice" id="chCreate"><span class="e">${ic('plus',26)}</span><div><b>Criar o meu</b><small>Do zero, do seu jeito</small></div>${ic('chevRight',20)}</button>
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
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Servidor criado. Agora é só convidar a galera.');
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
function parseInvite(v){ v = v.trim(); const m = v.match(/convite=([a-z0-9-]+)/i); return (m ? m[1] : v.split('/').pop()).toLowerCase(); }
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
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Bem-vindo(a) ao servidor');
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
const PDEF = { accent:'#ff2e9a', theme:'dark', fontSize:15, compact:false, inputId:'', outputId:'', echo:true, noise:true, agc:true,
  mode:'vad', sensitivity:4, pttKey:'Backquote', muteKey:'ctrl+shift+KeyM', deafKey:'ctrl+shift+KeyD', screenKey:'',
  notifDM:true, notifMention:true, notifCall:true, soundMsg:true, soundVoice:true, soundPtt:true };
const P = App.prefs = Object.assign({}, PDEF, ls.get('telao-prefs', {}));
if(!P.accent || P.accent.toLowerCase() === '#ff6b4a') P.accent = '#ff2e9a';
function savePrefs(){ ls.set('telao-prefs', P); applyPrefs(); }
function applyPrefs(){
  document.body.classList.remove('theme-dark','theme-amoled','theme-light');
  document.body.classList.add('theme-' + P.theme);
  document.body.classList.toggle('compact', !!P.compact);
  document.documentElement.style.setProperty('--fs', P.fontSize + 'px');
  const a = S._srvAcc || P.accent || '#ff2e9a', rs = document.documentElement.style;
  const [r,g,b] = [1,3,5].map(i => parseInt(a.slice(i, i+2), 16));
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  rs.setProperty('--acc', a);
  rs.setProperty('--acc2', `rgb(${Math.min(255, r+40)},${Math.min(255, g+40)},${Math.min(255, b+40)})`);
  rs.setProperty('--accs', `rgba(${r},${g},${b},.18)`);
  rs.setProperty('--acct', lum > 0.62 ? '#111' : '#fff');
  const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.content = P.theme === 'light' ? '#e3e5e8' : P.theme === 'amoled' ? '#000000' : '#0d0e12';
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
  spotify:['Spotify', u => /^https?:/.test(u) ? u : 'https://open.spotify.com/user/' + u, '#1db954'], github:['GitHub', u => 'https://github.com/' + u, '#e6edf3'], lastfm:['Last.fm', u => 'https://www.last.fm/user/' + encodeURIComponent(u), '#d51007'],
  riot:['Riot ID', null, '#eb0029'], xbox:['Xbox', u => 'https://www.xbox.com/play/user/' + encodeURIComponent(u), '#107c10'], psn:['PlayStation', u => 'https://psnprofiles.com/' + encodeURIComponent(u), '#0070d1'],
  epic:['Epic Games', null, '#c9c9c9'], battlenet:['Battle.net', null, '#148eff'], site:['Site', u => /^https?:/.test(u) ? u : 'https://' + u, '#9aa0aa'],
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
  const banner = plus && p.banner_url ? `background-image:url('${esc(p.banner_url)}')` : `background:${esc(p.banner_color || p.avatar_color || '#ff2e9a')}`;
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
      ${links.length ? `<div class="plinks">${links.map(l => LINKS[l.t][1] ? `<a href="${esc(LINKS[l.t][1](l.u))}" target="_blank" rel="noopener" style="--lc:${LINKS[l.t][2]}"><i></i>${esc(LINKS[l.t][0])}</a>` : `<a data-copytxt="${esc(l.u)}" style="--lc:${LINKS[l.t][2]}" title="Copiar"><i></i>${esc(LINKS[l.t][0])}: ${esc(l.u)}</a>`).join('')}</div>` : ''}
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
      ['h','Configurações de usuário'], ['account','Minha conta'], ['security','Segurança'], ['privacy','Privacidade'], ['profile','Perfis'], ['connections','Conexões'],
      ['plus', `<span style="display:inline-flex;width:18px;height:18px">${badgeSvg('plus', plusTier(me))}</span> Telão+`],
      ['shop', 'Loja e presentes'], ['boosts', `<span style="display:inline-flex">${BOOST_SVG(18)}</span> Impulsos`],
      ['h','Configurações do app'], ['appearance','Aparência'], ['perf','Desempenho'], ['a11y','Acessibilidade'], ['lang','Idioma'], ['voice','Voz e vídeo'], ['notif','Notificações'], ['keys','Teclas de atalho'], ['app','App e instalação'],
    ];
    if(me.is_admin) nav.push(['h','Administração'], ['admin','Painel do admin']);
    nav.push(['hr'], ['logout','Sair', 'danger']);
  } else {
    const s = SET.server;
    nav = [['h', esc(s.name)]];
    if(App.hasPerm(s.id, 2)) nav.push(['overview','Visão geral']);
    if(App.hasPerm(s.id, 16)) nav.push(['roles','Cargos']);
    if(App.hasPerm(s.id, 1)) nav.push(['channels','Canais']);
    nav.push(['emojis','Emojis'], ['tag','Tag do servidor'], ['members','Membros'], ['boost', `<span style="display:inline-flex">${BOOST_SVG(16)}</span> Impulsos`]);
    if(App.hasPerm(s.id, 2)) nav.push(['invites','Convites']);
    if(App.hasPerm(s.id, 128) || App.hasPerm(s.id, 4)) nav.push(['bans','Banimentos']);
    if(App.hasPerm(s.id, 2) || App.hasPerm(s.id, 64)) nav.push(['safety','Segurança']);
    if(App.hasPerm(s.id, 2)) nav.push(['community','Comunidade']);
    if(s.owner_id === S.me.id) nav.push(['hr'], ['delete','Excluir servidor','danger']);
    if(!nav.find(n => n[0] === SET.sec)) SET.sec = (nav[1] || [])[0] || 'members';
  }
  SET.el.className = 'settings' + (SET.mobileOpen ? ' sec-open' : '');
  SET.el.innerHTML = `<nav class="snav"><div class="in">${nav.map(n =>
      n[0] === 'h' ? `<h5>${n[1]}</h5>` : n[0] === 'hr' ? '<hr>' :
      `<button class="si ${SET.sec===n[0]?'on':''} ${n[2]||''}" data-sec="${n[0]}">${n[1]}</button>`).join('')}
      ${SET.kind==='user' ? '<hr><div class="ver">Telão · versão ' + APP_VERSION + '</div>' : ''}</div></nav>
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
    ? { account: secAccount, profile: secProfile, plus: secPlus, shop: secShop, connections: secConnections, security: secSecurity, privacy: secPrivacy, boosts: secMyBoosts, appearance: secAppearance, perf: secPerf, a11y: secA11y, lang: secLang, voice: secVoice, notif: secNotif, keys: secKeys, app: secApp, admin: secAdmin }[SET.sec]
    : { overview: secSrvOverview, roles: secSrvRoles, channels: secSrvChannels, members: secSrvMembers, boost: secSrvBoost, bans: secSrvBans, safety: secSrvSafety, emojis: secSrvEmojis, tag: secSrvTag, community: secSrvCommunity, invites: secSrvInvites }[SET.sec];
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
      S.me.username = data; S.profiles.set(S.me.id, S.me); closeModal(); renderSettings(); renderUserPanel(); App.toast('Nome de usuário alterado');
    };
  });
  box.querySelector('#aEmail').onclick = () => modal(`<form id="eF"><div class="mh"><h2>Mudar e-mail</h2><p>Vamos mandar um link de confirmação para o novo e-mail.</p></div>
      <div class="mc"><label class="field"><span>Novo e-mail</span><input class="inp" type="email" id="eN" required></label><div class="err" id="eE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Enviar confirmação</button></div></form>`, m => {
    m.querySelector('#eF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.updateUser({ email: m.querySelector('#eN').value.trim() }, { emailRedirectTo: location.origin + '/' });
      if(error){ m.querySelector('#eE').textContent = error.message; return; }
      closeModal(); App.toast('Confirme no seu novo e-mail para concluir a troca.');
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
      closeModal(); App.toast('Senha salva');
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
      <h3>Tema do cartão ${plus?'':ic('lock',14)}</h3>
      ${plus ? `<div class="colorrow"><label>Principal <input type="color" id="pfTa"></label><label>Destaque <input type="color" id="pfTb"></label><button class="btn sec sm" id="pfTrm">Sem tema</button></div>` : lockBox('Cores no cartão de perfil são do Telão+.')}
      <h3>Efeito no perfil ${plus?'':ic('lock',14)}</h3>${plus ? chipRow('pfFx', PROFILE_FX, D.profile_fx) : lockBox('Partículas animadas no seu cartão.')}
      <h3>Anel do avatar ${plus?'':ic('lock',14)}</h3>${plus ? chipRow('pfRing', RINGS, D.avatar_ring) : lockBox('Um anel animado em volta do seu avatar.')}
      <h3>Estilo do nome ${plus?'':ic('lock',14)}</h3>${plus ? `<div class="chips" id="pfNs">${NAME_STYLES.map(([v,l]) => `<button type="button" class="chip ${(D.name_style||'')===v?'on':''}" data-v="${v}"><span class="${v?'nst nst-'+v:''}">${l}</span></button>`).join('')}</div>` : lockBox('Nome com gradiente colorido no chat.')}
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
  $b('#pfN').value = D.display_name; $b('#pfBio').value = D.bio; $b('#pfPr').value = D.pronouns; $b('#pfBc').value = D.banner_color || D.avatar_color || '#ff2e9a';
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
    $b('#pfTa').value = D.theme_a || '#3b1d6e'; $b('#pfTb').value = D.theme_b || '#ff2e9a';
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
    App.toast('Pronto. Clique em “Salvar”.');
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
    SET.dirty = false; App.toast('Perfil salvo');
    renderSettings(); renderUserPanel(); renderMembers(); if(M.el) renderMsgList(false);
  }
  drawLinks(); refresh();
}
function upsell(what){
  modal(`<div class="mh"><h2>Isso é do Telão+</h2><p>${esc(what)} faz parte do <b>Telão+</b>, por ${PRICE_TXT}/mês.</p></div>
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
    <div class="accents">${['#ff2e9a','#b6ff2e','#2ee6ff','#ff7a1a','#ffe02e','#8b5cf6','#ff4d4d','#2bd17e','#3b82f6','#e879f9','#f5f5f5','#8a8f98'].map(c => `<button data-acc="${c}" class="${(P.accent||'#ff2e9a')===c?'on':''}" style="background:${c}"></button>`).join('')}<input type="color" id="apAcc" value="${esc(P.accent||'#ff2e9a')}" title="Escolher outra cor"></div>
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
    <div class="srow"><div class="t"><b>Supressão de ruído</b><small>Corta barulho de fundo: ventilador, teclado, rua, cachorro.</small></div></div>
    <div class="nzlv">${[['off','Desligada','Som cru do microfone.'],['padrao','Padrão','Filtro do navegador.'],['forte','Forte','Filtro do navegador + isolamento de voz + portão que fecha o microfone no silêncio. Recomendado.']].map(([v, l, d]) => `<button class="vl ${Voice.noiseLevel() === v ? 'on' : ''}" data-nz="${v}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    ${row('Modo música', 'Desliga todos os filtros e manda o som em estéreo, para tocar instrumento ou mostrar uma música com qualidade. Use fone.', toggle('vMusic', !!P.musicMode))}
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
    ${row('Abaixar o som das telas quando alguém fala', 'Deixa a conversa por cima do som do jogo/filme que estão transmitindo.', toggle('vDuck', P.duck !== false))}
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
  proc('#vEcho','echo'); proc('#vAgc','agc'); proc('#vMusic','musicMode');
  box.querySelectorAll('[data-nz]').forEach(b => b.onclick = () => { P.noiseLevel = b.dataset.nz; P.noise = b.dataset.nz !== 'off'; savePrefs(); Voice.switchMic(); renderSettings(); });
  $b('#vSnd').onchange = e => { P.soundVoice = e.target.checked; savePrefs(); };
  $b('#vDuck').onchange = e => { P.duck = e.target.checked; savePrefs(); };
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
  const desk = window.telaoDesktop, dl = (S.cfg || {}).desktop_url;
  box.innerHTML = `${back}<h2>App e instalação</h2>
    <div class="dlcard"><span class="clogo">${ic('monitor', 24)}</span><div class="t"><b>Telão para Windows</b>
      <small>${desk ? 'Você está usando o app para Windows, versão ' + esc(desk.version) + '. Ele se atualiza sozinho.' : 'Programa de verdade: abre pelo menu Iniciar, fica na bandeja, avisa de mensagens e compartilha a tela com o som do PC.'}</small></div>
      ${desk ? '' : dl ? `<a class="btn" href="${esc(dl)}" download>${ic('download', 16)} Baixar para Windows</a>` : '<span class="mut small">Em breve</span>'}</div>
    ${S.me.is_admin ? `<div class="srow"><div class="t"><b>Link do instalador (só o admin vê)</b><small>Cole o link do Telao-Setup.exe (por exemplo, o da página Releases do GitHub). Veja o LEIA-ME do app para Windows.</small></div></div>
      <div style="display:flex;gap:8px;margin-bottom:8px"><input class="inp" id="apDl" placeholder="https://github.com/…/releases/latest/download/Telao-Setup.exe" value="${esc(dl || '')}"><button class="btn sec" id="apDlOk">Salvar</button></div>` : ''}
    ${desk ? '' : row('Instalar pelo navegador', standalone ? 'Você está usando o app instalado.' : S.installEvt ? 'Instale como app: ícone próprio, janela separada e abre mais rápido.' : ios ? 'No iPhone: Compartilhar → <b>Adicionar à Tela de Início</b>.' : 'No Chrome/Edge: ícone de instalar na barra de endereço, ou menu ⋮ → <b>Instalar Telão</b>.',
          S.installEvt && !standalone ? '<button class="btn sm" id="apInst">Instalar</button>' : '')}
    ${row('Limpar cache do app', 'Use se uma atualização não aparecer.', '<button class="btn sec sm" id="apClr">Limpar e recarregar</button>')}
    <hr class="sdiv"><small style="color:var(--mut)">Telão · versão ${APP_VERSION}</small>`;
  const i = box.querySelector('#apInst'); if(i) i.onclick = doInstall;
  const dk = box.querySelector('#apDlOk'); if(dk) dk.onclick = async () => {
    const v = box.querySelector('#apDl').value.trim();
    const { error } = await App.sb.from('app_config').upsert({ key: 'desktop_url', value: v || null, updated_at: new Date().toISOString() });
    if(error){ App.toast(error.message, true); return; }
    S.cfg.desktop_url = v || null; App.toast('Link salvo. Agora todo mundo vê o botão de baixar.'); renderSettings();
  };
  box.querySelector('#apClr').onclick = async () => {
    try{ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }catch(e){}
    location.reload();
  };
}

/* ---------- Painel do admin ---------- */
function secAdmin(box, back){
  if(!S.me.is_admin){ box.innerHTML = 'Sem acesso.'; return; }
  box.innerHTML = `${back}<h2>Painel do admin</h2>
    <p style="color:var(--txt2);font-size:14px">Dê o Telão+ (ex: quem pagou por Pix) e insígnias para qualquer pessoa.</p>
    <h3>Aviso para todos</h3>
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
    App.toast('Aviso enviado para todos que estão online');
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
      await refetch(uid); App.toast(+b.dataset.days ? 'Telão+ liberado.' : 'Plano removido.'); showUser(uid);
    });
    $b('#adSaveB').onclick = async () => {
      const list = [...box.querySelectorAll('[data-b]')].filter(x => x.checked).map(x => x.dataset.b);
      const { error } = await App.sb.rpc('admin_set_badges', { p_user: uid, p_badges: list });
      if(error){ App.toast(error.message, true); return; }
      await refetch(uid); App.toast('Insígnias salvas'); showUser(uid);
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
      <small class="mut">Mínimo 128×128. GIF animado libera no nível 1 de impulsos.</small></div>
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
    if(f.type === 'image/gif' && serverLevel(s.id) < 1){ App.toast('Ícone animado libera quando o servidor chega no nível 1 de impulsos (2 impulsos).', true); return; }
    App.toast('Enviando…');
    try{ D.icon_url = await uploadSquare(f, 'server', 256); draw(); }catch(err){ App.toast(err.message, true); }
  };
  async function save(){
    const name = D.name.trim(); if(!name) return;
    const { error } = await App.sb.from('servers').update({ name, icon_color: D.icon_color, icon_url: D.icon_url, description: D.description.trim() || null }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    SET.dirty = false; await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s;
    renderRail(); renderSidebar(); renderSettings(); App.toast('Servidor atualizado');
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
    await loadRoles(s.id); renderSettings(); renderMembers(); renderSidebar(); App.toast('Cargo salvo');
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
    s.invite_code = data; renderSettings(); App.toast('Novo convite gerado');
  };
}

/* =====================================================================
   v5: IMPULSOS DE SERVIDOR · FICHAS · LOJA TELÃO · PRESENTES
   ===================================================================== */
S.boosts = [];          // linhas de server_boosts (dos meus servidores + as minhas)
S.shop = [];            // catálogo (shop_items)
S.inv = new Set();      // meus itens
const GIFTS = new Map(); // cache dos presentes

/* ---------- níveis dos servidores ---------- */
const LEVELS = [
  { need:0, nome:'Sem nível', perks:[] },
  { need:2, nome:'Nível 1', perks:[['🎞️','Ícone animado (GIF)'],['🎨','Cor própria do servidor'],['📺','Telas em 1080p 60fps para todos'],['🔊','+ sons no soundboard das calls']] },
  { need:5, nome:'Nível 2', perks:[['🖼️','Banner no topo do servidor'],['📺','Telas em 1440p 60fps para todos'],['🎚️','Todos os pacotes de sons liberados nas calls']] },
  { need:9, nome:'Nível 3', perks:[['🔗','Convite personalizado (telao/seu-nome)'],['📺','Telas em 4K para todos'],['✨','Banner animado (GIF)']] },
];
const boostsOf = sid => S.boosts.filter(b => b.server_id === sid && hasPlus(prof(b.user_id)));
const boostCount = sid => boostsOf(sid).length;
function serverLevel(sid){ const n = boostCount(sid); return n >= 9 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0; }
App.serverLevel = serverLevel;
const isBooster = (uid, sid) => S.boosts.some(b => b.user_id === uid && (!sid || b.server_id === sid)) && hasPlus(prof(uid));
const BOOST_SVG = s => `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><defs><linearGradient id="bstg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ae6"/><stop offset="1" stop-color="#b44dff"/></linearGradient></defs><path d="M12 2.5l6.2 5.2-1.6 9.1L12 21.5l-4.6-4.7-1.6-9.1z" fill="url(#bstg)"/><path d="M12 2.5v19M5.8 7.7L12 11l6.2-3.3" stroke="#fff" stroke-opacity=".6" stroke-width="1" fill="none"/></svg>`;

async function loadBoosts(){
  const ids = S.servers.map(s => s.id);
  const [a, b] = await Promise.all([
    ids.length ? App.sb.from('server_boosts').select('*').in('server_id', ids) : { data: [] },
    App.sb.from('server_boosts').select('*').eq('user_id', S.me.id),
  ]);
  const all = new Map();
  [...(a.data || []), ...(b.data || [])].forEach(r => all.set(r.user_id + ':' + r.slot, r));
  S.boosts = [...all.values()];
  await ensureProfiles(S.boosts.map(r => r.user_id));
}
const _loadServers = loadServers;
loadServers = async function(){
  await _loadServers();
  try{ await loadBoosts(); }catch(e){}
  if(!S._v5init){ S._v5init = true; v5Init(); }
};
function v5Init(){
  App.sb.channel('boosts-rt').on('postgres_changes', { event:'*', schema:'public', table:'server_boosts' }, async () => {
    await loadBoosts(); renderSidebar(); renderMembers(); if(SET) renderSettings();
  }).subscribe();
  loadInventory(); applyPrefs();
  // lembrete das fichas do dia
  setTimeout(() => { if(S.me && S.me.last_daily !== todayBR()) App.toast(`Suas fichas de hoje estão esperando${S.me.streak ? ` · ${S.me.streak} dia(s) seguidos` : ''}!`, false, { label:'Pegar', fn: claimDaily }); }, 4000);
}
const todayBR = () => new Date().toLocaleDateString('en-CA', { timeZone:'America/Sao_Paulo' });

/* marquinha de impulso do lado do nome (dentro do servidor) */
const _nameHtml = nameHtml;
nameHtml = function(p){
  const s = S.route && S.route.kind === 'server' ? curServer() : null;
  const mark = s && p && isBooster(p.id, s.id) ? `<span class="bstmark" data-tip="Impulsionando este servidor">${BOOST_SVG(14)}</span>` : '';
  return _nameHtml(p) + mark;
};
/* insígnia Impulsionador */
BADGES.splice(3, 0, { id:'boost', nome:'Impulsionador de servidor', desc:'Dá impulso nos servidores dos amigos' });
const _badgeSvg = badgeSvg;
badgeSvg = function(id, tier){
  if(id === 'boost') return '<svg viewBox="0 0 24 24"><defs><linearGradient id="bstb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ae6"/><stop offset="1" stop-color="#b44dff"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="#3b1250"/><path d="M12 4.5l5.2 4.3-1.3 7.5L12 20l-3.9-3.7-1.3-7.5z" fill="url(#bstb)"/><path d="M12 4.5V20M6.8 8.8L12 11.6l5.2-2.8" stroke="#fff" stroke-opacity=".6" stroke-width=".9" fill="none"/></svg>';
  return _badgeSvg(id, tier);
};
const _earned = earnedBadges;
earnedBadges = function(p){
  const r = _earned(p);
  if(p && isBooster(p.id) && !r.some(b => b.id === 'boost')){ r.push(BADGES.find(b => b.id === 'boost')); }
  return r;
};
/* qualidade da tela melhora com o nível do servidor da chamada */
const _clamp = clampScreen;
clampScreen = function(st){
  const lv = Voice.channel && Voice.channel.server_id ? serverLevel(Voice.channel.server_id) : 0;
  if(hasPlus(S.me) || lv >= 3) return st;
  const r = { ...st };
  if(lv === 2){ if(r.h > 1440){ r.w = 2560; r.h = 1440; r.fps = 60; } if(r.bitrate > 12000000) r.bitrate = 12000000; return r; }
  if(lv === 1){ if(r.h > 1080){ r.w = 1920; r.h = 1080; r.fps = 60; } if(r.bitrate > 10000000) r.bitrate = 10000000; return r; }
  return _clamp(st);
};
/* cor e banner do servidor */
const _renderSidebar = renderSidebar;
renderSidebar = function(){
  _renderSidebar.apply(this, arguments);
  const s = S.route && S.route.kind === 'server' ? curServer() : null;
  const head = $('#sbHead'), lv = s ? serverLevel(s.id) : 0;
  if(s && head){
    const t = head.querySelector('.hero-t b');
    if(t && boostCount(s.id)) t.insertAdjacentHTML('afterend', `<span class="lvlchip" data-tip="${boostCount(s.id)} impulso(s)" data-tipsub="${LEVELS[lv].nome}">${BOOST_SVG(12)} ${lv ? 'Nv. ' + lv : boostCount(s.id)}</span>`);
    const bn = lv >= 2 && s.banner_url && (!/\.gif($|\?)/i.test(s.banner_url) || lv >= 3) ? s.banner_url : null;
    head.classList.toggle('withbanner', !!bn);
    head.style.backgroundImage = bn ? `linear-gradient(180deg,transparent 30%,rgba(0,0,0,.75)),url('${bn}')` : '';
  }
  const acc = s && lv >= 1 && s.accent ? s.accent : null;
  if(acc !== S._srvAcc){ S._srvAcc = acc; applyPrefs(); }
};

/* ---------- impulsionar ---------- */
function boostSlots(){
  return [1,2,3].map(slot => {
    const b = S.boosts.find(x => x.user_id === S.me.id && x.slot === slot);
    const unlock = b ? new Date(new Date(b.created_at).getTime() + 7 * 864e5) : null;
    return { slot, b, unlock, locked: unlock && unlock > new Date() };
  });
}
async function boostServerModal(s){
  if(!hasPlus(S.me)){ upsell('Impulsionar servidores'); return; }
  const slots = boostSlots();
  const free = slots.find(x => !x.b) || slots.find(x => !x.locked && x.b.server_id !== s.id);
  const mineHere = slots.filter(x => x.b && x.b.server_id === s.id).length;
  modal(`<div class="mh"><h2>${BOOST_SVG(22)} Impulsionar ${esc(s.name)}</h2><p>Você tem 3 impulsos com o Telão+. Depois de usar, ele fica nesse servidor por pelo menos 7 dias.</p></div>
    <div class="mc"><div class="slots">${slots.map(x => {
      const srv = x.b && S.servers.find(z => z.id === x.b.server_id);
      return `<button class="slot ${x.b ? 'used' : ''} ${x.locked ? 'locked' : ''}" data-slot="${x.slot}" ${x.locked && x.b.server_id !== s.id ? 'disabled' : ''}>
        <span class="g">${BOOST_SVG(26)}</span><b>Impulso ${x.slot}</b>
        <small>${!x.b ? 'Livre' : x.b.server_id === s.id ? 'Já neste servidor' : 'Em ' + esc(srv ? srv.name : 'outro servidor')}${x.locked && x.b.server_id !== s.id ? `<br>troca em ${x.unlock.toLocaleDateString('pt-BR')}` : ''}</small></button>`;
    }).join('')}</div>
    <p class="mut small" style="margin-top:12px">Você já deu ${mineHere} impulso(s) aqui. Este servidor tem ${boostCount(s.id)} — ${LEVELS[serverLevel(s.id)].nome}.</p></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button>${free ? `<button class="btn" id="bsGo">${BOOST_SVG(16)} Usar impulso ${free.slot}</button>` : ''}</div>`, m => {
    const go = async slot => {
      const { error } = await App.sb.rpc('boost_server', { p_server: s.id, p_slot: slot });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadBoosts(); renderSidebar(); renderMembers();
      App.toast(`Você impulsionou ${s.name}`); boostCelebrate();
    };
    const g = m.querySelector('#bsGo'); if(g) g.onclick = () => go(free.slot);
    m.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { const x = slots.find(y => y.slot === +b.dataset.slot); if(x.b && x.b.server_id === s.id) return; go(x.slot); });
  });
}
function boostCelebrate(){
  const L = document.createElement('div'); L.className = 'boostburst';
  L.innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="--a:${i * 16}deg;--d:${(0.6 + (i % 5) * 0.12).toFixed(2)}s">${BOOST_SVG(18)}</i>`).join('');
  document.body.appendChild(L); setTimeout(() => L.remove(), 1600);
}

/* ---------- catálogo (visual de cada item) ---------- */
const ITEM_LOOK = {
  deco_neon:['💠','Um anel neon que respira em volta do avatar.'], deco_gato:['🐱','Orelhinhas fofas em cima do avatar.'],
  deco_coroa:['👑','Coroa em pixel art, pra quem manda na call.'], deco_fogo:['🔥','Chamas dançando em volta de você.'],
  deco_chuva:['🌧️','Uma nuvenzinha chovendo em cima de você.'], deco_estrelas:['⭐','Estrelinhas girando como um halo.'],
  deco_folhas:['🌿','Folhas tropicais emoldurando a foto.'], deco_holo:['🪩','Brilho holográfico que muda de cor (Telão+).'],
  ent_samba:['🥁','Quando você entra na call, todo mundo ouve uma batucada.'], ent_plantao:['🚨','A vinheta de plantão urgente anuncia sua chegada.'],
  ent_moeda:['🪙','Plim! O som clássico de moedinha de fliperama.'], ent_cosmico:['🌌','Um whoosh espacial quando você chega.'],
  ent_trombeta:['🎺','Fanfarra real: chegou a realeza (Telão+).'],
  sp_zueira:['🤡','Risada, “não!”, peido e tchan-tchan-tchan no soundboard.'], sp_arcade:['👾','Pulo, power-up, game over e 1-UP.'],
  sp_cinema:['🎬','Tambor de suspense, plateia “ohhh” e vinheta épica.'],
  tt_madrugada:['🌙','Título no seu perfil.'], tt_mute:['🔇','Título no seu perfil.'], tt_cinefilo:['🍿','Título no seu perfil.'],
  tt_lagado:['🐢','Título no seu perfil.'], tt_dj:['🎧','Título no seu perfil.'], tt_fundador:['🏛️','Título raro no seu perfil (Telão+).'],
  cd_por_do_sol:['🌇','Fundo do cartão de perfil com pôr do sol.'], cd_aurora:['🌌','Fundo de aurora boreal no cartão.'],
  cd_vapor:['🌴','Vaporwave rosa e ciano no cartão.'], cd_mata:['🦜','Verde da Mata Atlântica no cartão.'], cd_galaxia:['🪐','Galáxia animada no cartão (Telão+).'],
  plus_7:['💎','Uma semana de Telão+ completo. Dá pra trocar fichas por isso!'],
};
const KINDS = [['all','Tudo'],['deco','Decorações'],['entrance','Entradas na call'],['soundpack','Pacotes de som'],['title','Títulos'],['card','Fundos de perfil'],['plus','Telão+']];
const itemById = id => S.shop.find(i => i.id === id);
async function loadShop(){
  if(S.shop.length) return;
  const { data } = await App.sb.from('shop_items').select('*').eq('active', true).order('price');
  S.shop = data || [];
}
async function loadInventory(){
  const { data } = await App.sb.from('inventory').select('item_id').eq('user_id', S.me.id);
  S.inv = new Set((data || []).map(r => r.item_id));
}
const owns = id => S.inv.has(id) || S.me.is_admin;
const equippedOf = p => (p && p.equipped && typeof p.equipped === 'object') ? p.equipped : {};
const usable = (p, id) => { const it = itemById(id); return !it || !it.plus_only || hasPlus(p); };

/* decoração no avatar */
const _avatar = avatar;
avatar = function(p, cls='', status=false){
  const h = _avatar(p, cls, status);
  const d = p && equippedOf(p).deco;
  if(!d || /\bxs\b/.test(cls) || !usable(p, d)) return h;
  return h.replace(/^<div class="av ([^"]*)"/, '<div class="av $1 hasdeco"').replace(/<\/div>$/, `<i class="deco ${esc(d)}"></i></div>`);
};
/* título e fundo no cartão de perfil */
const _profileCard = profileCard;
profileCard = function(p, extra=''){
  let h = _profileCard(p, extra);
  const eq = equippedOf(p);
  if(eq.card && usable(p, eq.card) && !(hasPlus(p) && p.theme_a)) h = h.replace('class="pcard2 ', `class="pcard2 cardbg ${esc(eq.card)} `);
  if(eq.title && usable(p, eq.title)){ const it = itemById(eq.title); const look = ITEM_LOOK[eq.title]; if(it || look) h = h.replace('<div class="un">', `<div class="ptitle">${look ? look[0] : '🏷️'} ${esc(it ? it.name : eq.title.replace('tt_',''))}</div><div class="un">`); }
  return h;
};

/* ---------- sons: entradas na call e pacotes do soundboard ---------- */
let entCtx = null;
function synth(fn){
  try{
    if(!entCtx) entCtx = new (window.AudioContext || window.webkitAudioContext)();
    const c = entCtx, out = c.createGain(); out.gain.value = 0.3; out.connect(c.destination);
    const t = c.currentTime;
    const tone = (f, s, d, type='sine', v=1, f2) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t+s); if(f2) o.frequency.exponentialRampToValueAtTime(f2, t+s+d); g.gain.setValueAtTime(0.0001, t+s); g.gain.exponentialRampToValueAtTime(v, t+s+0.015); g.gain.exponentialRampToValueAtTime(0.0001, t+s+d); o.connect(g).connect(out); o.start(t+s); o.stop(t+s+d+0.05); };
    const noise = (s, d, v=1, hp=0) => { const b = c.createBuffer(1, Math.max(1, c.sampleRate*d|0), c.sampleRate), x = b.getChannelData(0); for(let i=0;i<x.length;i++) x[i] = (Math.random()*2-1) * (1 - i/x.length); const n = c.createBufferSource(); n.buffer = b; const g = c.createGain(); g.gain.value = v; let node = n; if(hp){ const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); node = f; } node.connect(g).connect(out); n.start(t+s); };
    fn(tone, noise);
  }catch(e){}
}
const ENTRANCES = {
  ent_samba: (tone, noise) => { [0,.15,.3,.38,.45,.6,.75,.83].forEach((s,i) => { tone(i%3 ? 95 : 70, s, .12, 'sine', 1, 45); noise(s, .05, .35, 3000); }); tone(1800, .9, .25, 'square', .12); },
  ent_plantao: tone => { [[659,0],[659,.18],[784,.36],[659,.6],[880,.8]].forEach(([f,s]) => tone(f, s, .2, 'sawtooth', .3)); tone(523, 1, .5, 'sawtooth', .3); },
  ent_moeda: tone => { tone(988, 0, .08, 'square', .3); tone(1319, .08, .4, 'square', .3); },
  ent_cosmico: (tone, noise) => { tone(80, 0, 1.2, 'sine', .9, 900); tone(1200, .5, .8, 'sine', .3, 2400); noise(0, 1, .25, 2000); },
  ent_trombeta: tone => { [[523,0,.15],[523,.17,.15],[523,.34,.15],[659,.5,.5],[784,1.02,.7]].forEach(([f,s,d]) => { tone(f, s, d, 'sawtooth', .35); tone(f*2, s, d, 'square', .08); }); },
};
App.entrance = uid => {
  const p = prof(uid), e = equippedOf(p).entrance;
  if(!e || !ENTRANCES[e] || !usable(p, e) || (App.prefs || {}).soundVoice === false) return false;
  synth(ENTRANCES[e]); return true;
};
const SOUND_PACKS = {
  sp_zueira: [
    ['risada','🤣','Risada', tone => { for(let i=0;i<6;i++) tone(520 - i*25, i*.13, .1, 'square', .25, 380 - i*20); }],
    ['nao','🙅','Nããão', tone => tone(300, 0, 1, 'sawtooth', .35, 120)],
    ['pum','💨','Pum', (tone, noise) => { tone(90, 0, .45, 'sawtooth', .5, 60); noise(0, .4, .2, 0); }],
    ['tchan','🎻','Tchan tchan', tone => { tone(294, 0, .25, 'sawtooth', .35); tone(277, .3, .25, 'sawtooth', .35); tone(262, .6, .9, 'sawtooth', .4); }],
  ],
  sp_arcade: [
    ['pulo','🍄','Pulo', tone => tone(300, 0, .25, 'square', .3, 900)],
    ['power','⭐','Power-up', tone => [523,659,784,1047,1319].forEach((f,i) => tone(f, i*.06, .08, 'square', .25))],
    ['gameover','💀','Game over', tone => [494,466,440,415].forEach((f,i) => tone(f, i*.3, .32, 'triangle', .4))],
    ['oneup','💚','1-UP', tone => [659,784,1319,1047,1175,1568].forEach((f,i) => tone(f, i*.09, .1, 'square', .25))],
  ],
  sp_cinema: [
    ['tambores','🥁','Rufar', (tone, noise) => { for(let i=0;i<18;i++) noise(i*.06, .05, .5, 800); tone(70, 1.15, .6, 'sine', 1, 40); }],
    ['ohhh','😮','Plateia ohhh', tone => [220,277,330].forEach(f => tone(f, 0, 1.2, 'sawtooth', .12, f*.9))],
    ['epico','🎬','Épico', tone => { [131,196,262].forEach(f => tone(f, 0, 1.6, 'sawtooth', .22)); tone(523, .4, 1.2, 'triangle', .25); }],
    ['pipoca','🍿','Pipoca', (tone, noise) => { for(let i=0;i<9;i++) noise(Math.random()*1.2, .03, .9, 2500); }],
  ],
};
const EXTRA_SOUNDS = {};
Object.values(SOUND_PACKS).forEach(list => list.forEach(([id, , , fn]) => EXTRA_SOUNDS[id] = fn));
/* sons que posso tocar nesta chamada: base + pacotes que tenho + liberados pelo nível do servidor */
function soundList(){
  const lv = Voice.channel && Voice.channel.server_id ? serverLevel(Voice.channel.server_id) : 0;
  const list = SOUNDS.slice();
  Object.entries(SOUND_PACKS).forEach(([pack, arr], i) => {
    if(owns(pack) || lv >= 2 || (lv >= 1 && i === 0)) arr.forEach(([id, e, n]) => list.push([id, e, n]));
  });
  return list;
}

/* ---------- fichas ---------- */
async function claimDaily(){
  const { data, error } = await App.sb.rpc('claim_daily');
  if(error){ App.toast(error.message, true); return; }
  const { data: me } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
  if(me){ S.me = me; S.profiles.set(me.id, me); }
  App.toast(`+${data.gain} fichas! Sequência: ${data.streak} dia(s)${hasPlus(S.me) ? ' · bônus Telão+ em dobro' : ''}`);
  coinRain();
  if(SET && SET.sec === 'shop') renderSettings();
}
function coinRain(){
  const L = document.createElement('div'); L.className = 'coinrain';
  L.innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 53) % 100}%;--d:${(0.9 + (i % 4) * 0.2).toFixed(2)}s;--dl:${(i * 0.05).toFixed(2)}s">🪙</i>`).join('');
  document.body.appendChild(L); setTimeout(() => L.remove(), 2200);
}
const fichasHtml = n => `<span class="fichas">${'🪙'} ${Number(n || 0).toLocaleString('pt-BR')}</span>`;

/* ---------- Loja ---------- */
async function secShop(box, back){
  box.innerHTML = `${back}<div class="spin" style="margin:40px auto"></div>`;
  await Promise.all([loadShop(), loadInventory()]);
  if(!SET || SET.sec !== 'shop') return;
  const me = S.me, tab = SET.shopTab || 'loja', kind = SET.shopKind || 'all';
  const claimed = me.last_daily === todayBR();
  const items = S.shop.filter(i => kind === 'all' || i.kind === kind);
  const eq = equippedOf(me);
  box.innerHTML = `${back}
    <div class="shophero">
      <div><h1>Loja</h1><p>Coisas que só existem aqui: entradas sonoras, molduras, títulos e muito mais. Tudo comprado com <b>fichas</b> — que você ganha só por aparecer.</p></div>
      <div class="wallet">${fichasHtml(me.fichas)}<small>${me.streak ? `🔥 ${me.streak} dia(s) seguidos` : 'Comece sua sequência hoje'}</small>
        <button class="btn ${claimed ? 'sec' : ''}" id="shDaily" ${claimed ? 'disabled' : ''}>${claimed ? 'Volte amanhã ✔' : 'Pegar fichas do dia'}</button></div>
    </div>
    <div class="tabs2"><button data-tab="loja" class="${tab==='loja'?'on':''}">Loja</button><button data-tab="meus" class="${tab==='meus'?'on':''}">Meus itens (${S.inv.size})</button></div>
    ${tab === 'loja' ? `<div class="chips">${KINDS.map(([k,l]) => `<button data-kind="${k}" class="${kind===k?'on':''}">${l}</button>`).join('')}</div>
      <div class="shopgrid">${items.map(it => itemCard(it, eq)).join('') || '<p class="mut">Nada aqui ainda.</p>'}</div>`
    : `<div class="shopgrid">${S.shop.filter(i => S.inv.has(i.id) || (me.is_admin && i.kind !== 'plus')).map(it => itemCard(it, eq, true)).join('') || '<p class="mut">Você ainda não tem itens. Pegue suas fichas do dia e passe na loja!</p>'}</div>`}
    <p class="mut small" style="margin-top:18px">Como ganhar fichas: entre todo dia (+50, e +10 a cada dia seguido, até +150). Assinantes do Telão+ ganham em dobro. Fichas não são dinheiro e não podem ser sacadas.</p>`;
  const $b = q => box.querySelector(q);
  $b('#shDaily').onclick = claimDaily;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { SET.shopTab = b.dataset.tab; renderSettings(); });
  box.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { SET.shopKind = b.dataset.kind; renderSettings(); });
  box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buyItem(b.dataset.buy));
  box.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => giftModal(null, b.dataset.gift));
  box.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => equipItem(b.dataset.kindx, b.dataset.equip === '-' ? null : b.dataset.equip));
  box.querySelectorAll('[data-try]').forEach(b => b.onclick = () => previewItem(b.dataset.try));
}
function itemCard(it, eq, mineTab){
  const look = ITEM_LOOK[it.id] || ['🎁', ''];
  const have = it.kind !== 'plus' && owns(it.id), on = eq[it.kind] === it.id;
  const locked = it.plus_only && !hasPlus(S.me);
  return `<div class="item k-${it.kind} ${on ? 'on' : ''}">
    <div class="ipv" data-try="${it.id}" title="Ver como fica">${itemPreview(it)}</div>
    <b>${esc(it.name)}</b>${it.plus_only ? '<span class="plustag">TELÃO+</span>' : ''}
    <small>${esc(look[1])}</small>
    <div class="ibtns">${have
      ? (it.kind === 'title' || it.kind === 'deco' || it.kind === 'card' || it.kind === 'entrance' || it.kind === 'soundpack'
          ? (it.kind === 'soundpack' ? '<span class="mut small">✔ Liberado nas calls</span>' : on ? `<button class="btn sec sm" data-equip="-" data-kindx="${it.kind}">Tirar</button>` : `<button class="btn sm" data-equip="${it.id}" data-kindx="${it.kind}" ${locked ? 'disabled' : ''}>Usar</button>`) : '')
      : `<button class="btn sm" data-buy="${it.id}" ${locked ? 'disabled' : ''}>${fichasHtml(it.price)}</button>`}
      ${mineTab ? '' : `<button class="btn sec sm" data-gift="${it.id}" data-tip="Dar de presente">🎁</button>`}</div></div>`;
}
function itemPreview(it){
  const me = S.me;
  if(it.kind === 'deco') return _avatar(me, 'xl').replace(/^<div class="av ([^"]*)"/, '<div class="av $1 hasdeco"').replace(/<\/div>$/, `<i class="deco ${it.id}"></i></div>`);
  if(it.kind === 'card') return `<div class="cardmini cardbg ${it.id}"></div>`;
  return `<span class="ie">${(ITEM_LOOK[it.id] || ['🎁'])[0]}</span>`;
}
function previewItem(id){
  const it = itemById(id); if(!it) return;
  if(it.kind === 'entrance') synth(ENTRANCES[id]);
  else if(it.kind === 'soundpack') SOUND_PACKS[id].forEach(([, , , fn], i) => setTimeout(() => synth(fn), i * 1400));
  else if(it.kind === 'title' || it.kind === 'card'){
    const fake = { ...S.me, equipped: { ...equippedOf(S.me), [it.kind]: id } };
    if(it.kind === 'card'){ fake.theme_a = null; }
    modal(`<div class="mc" style="padding:18px">${profileCard(fake)}</div><div class="mf"><button class="btn" data-close>Fechar</button></div>`);
  }
}
async function buyItem(id){
  const it = itemById(id); if(!it) return;
  if(!(await confirmBox('Comprar', `Comprar <b>${esc(it.name)}</b> por ${fichasHtml(it.price)}?`, 'Comprar'))) return;
  const { error } = await App.sb.rpc('buy_item', { p_item: id });
  if(error){ App.toast(error.message, true); return; }
  await refreshMe(); await loadInventory();
  App.toast(it.kind === 'plus' ? 'Telão+ ativado.' : `${it.name} agora é seu.`); coinRain();
  renderAll(); if(SET) renderSettings();
}
async function equipItem(kind, id){
  const { data, error } = await App.sb.rpc('equip_item', { p_kind: kind, p_item: id });
  if(error){ App.toast(error.message, true); return; }
  S.me.equipped = data; S.profiles.set(S.me.id, S.me);
  App.toast(id ? 'Equipado.' : 'Removido.'); renderAll(); if(SET) renderSettings();
}
async function refreshMe(){
  const { data } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
  if(data){ S.me = data; S.profiles.set(data.id, data); }
}

/* ---------- presentes ---------- */
async function giftModal(toUid, itemId){
  await loadShop();
  const friends = S.friends.filter(f => f.status === 'accepted').map(f => prof(f.uid));
  if(!friends.length){ App.toast('Adicione amigos para dar presentes', true); return; }
  let to = toUid || friends[0].id, item = itemId || null, plusDays = 0;
  const admin = S.me.is_admin;
  const opts = S.shop.map(i => `<option value="${i.id}" ${i.id===item?'selected':''}>${(ITEM_LOOK[i.id]||['🎁'])[0]} ${esc(i.name)} — ${i.price} fichas</option>`).join('');
  modal(`<form id="gF"><div class="mh"><h2>Dar um presente</h2><p>Chega como um pacote na conversa — a pessoa abre quando quiser.</p></div>
    <div class="mc">
      <label class="field"><span>Para</span><select class="inp" id="gTo">${friends.map(p => `<option value="${p.id}" ${p.id===to?'selected':''}>${esc(p.display_name)} (@${esc(p.username)})</option>`).join('')}</select></label>
      <label class="field"><span>Presente</span><select class="inp" id="gIt">
        ${admin ? '<optgroup label="Admin (grátis)"><option value="plus:30">💎 Telão+ 30 dias</option><option value="plus:90">💎 Telão+ 90 dias</option><option value="plus:365">💎 Telão+ 1 ano</option></optgroup>' : ''}
        <optgroup label="Loja (paga com suas fichas)">${opts}</optgroup></select></label>
      ${!admin ? `<div class="giftplus"><b>💎 Telão+ de presente</b><small>${CFG.PAYMENTS ? 'Pague e a pessoa ganha 1 mês.' : 'Presentear Telão+ com dinheiro chega em breve. Por enquanto dá pra dar 7 dias usando fichas!'}</small></div>` : ''}
      <label class="field"><span>Mensagem (opcional)</span><input class="inp" id="gNote" maxlength="140" placeholder="feliz aniversário!! 🎉"></label>
      <div class="err" id="gE"></div><div id="gCost" class="mut small"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Enviar presente</button></div></form>`, m => {
    const sel = m.querySelector('#gIt'), cost = () => {
      const v = sel.value; if(v.startsWith('plus:')){ m.querySelector('#gCost').textContent = 'De graça (você é o admin).'; return; }
      const it = itemById(v); m.querySelector('#gCost').innerHTML = it ? `Custa ${fichasHtml(it.price)} · você tem ${fichasHtml(S.me.fichas)}` : '';
    };
    if(!item && !admin) sel.value = (S.shop[0] || {}).id; sel.onchange = cost; cost();
    m.querySelector('#gF').onsubmit = async e => {
      e.preventDefault();
      const v = sel.value, isPlus = v.startsWith('plus:');
      const { error } = await App.sb.rpc('send_gift', { p_to: m.querySelector('#gTo').value, p_item: isPlus ? null : v, p_note: m.querySelector('#gNote').value.trim() || null, p_plus_days: isPlus ? +v.split(':')[1] : 0 });
      if(error){ m.querySelector('#gE').textContent = error.message; return; }
      closeModal(); await refreshMe(); App.toast('Presente enviado'); boostCelebrate();
      if(SET) renderSettings();
    };
  });
}
function giftCardHtml(a){ return `<div class="giftcard" data-giftid="${esc(a.gift)}"><div class="gbox">🎁</div><div class="gt"><b>Presente</b><small>Carregando…</small></div></div>`; }
App.giftCardHtml = giftCardHtml;
async function hydrateGift(el){
  const id = el.dataset.giftid; el.dataset.ld = '1';
  let g = GIFTS.get(id);
  if(!g){ const { data } = await App.sb.from('gifts').select('*').eq('id', id).maybeSingle(); g = data; if(g) GIFTS.set(id, g); }
  await loadShop();
  if(!g){ el.querySelector('.gt').innerHTML = '<b>Presente</b><small>Esse presente não é pra você 👀</small>'; return; }
  const it = g.item_id ? itemById(g.item_id) : null;
  const name = g.plus_days ? `Telão+ por ${g.plus_days} dias` : it ? it.name : 'Item';
  const look = g.plus_days ? '💎' : (ITEM_LOOK[g.item_id] || ['🎁'])[0];
  const mine = g.to_user === S.me.id, from = prof(g.from_user);
  el.classList.toggle('opened', !!g.claimed_at);
  el.innerHTML = `<div class="gbox">${g.claimed_at ? look : '🎁'}</div><div class="gt">
      <b>${g.claimed_at || !mine ? esc(name) : 'Você ganhou um presente!'}</b>
      <small>${mine ? `de ${esc(from.display_name)}` : `para ${esc(prof(g.to_user).display_name)}`}${g.note ? ` · “${esc(g.note)}”` : ''}</small></div>
    ${mine && !g.claimed_at ? `<button class="btn sm" data-opengift="${id}">Abrir</button>` : g.claimed_at ? '<span class="mut small">Aberto ✔</span>' : '<span class="mut small">Ainda fechado</span>'}`;
}
new MutationObserver(() => { document.querySelectorAll('.giftcard:not([data-ld])').forEach(hydrateGift); }).observe(document.body, { childList:true, subtree:true });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-opengift]'); if(!b) return;
  b.disabled = true;
  const box = b.closest('.giftcard'); box.classList.add('shake');
  const { error } = await App.sb.rpc('claim_gift', { p_gift: b.dataset.opengift });
  if(error){ App.toast(error.message, true); b.disabled = false; return; }
  GIFTS.delete(b.dataset.opengift);
  await Promise.all([refreshMe(), loadInventory()]);
  setTimeout(() => { box.classList.remove('shake'); boostCelebrate(); coinRain(); hydrateGift(box); renderAll(); App.toast('Presente aberto. Veja em Loja › Meus itens.'); }, 650);
});

/* ---------- configurações: meus impulsos (usuário) e impulsos do servidor ---------- */
function secMyBoosts(box, back){
  const slots = boostSlots(), plus = hasPlus(S.me);
  box.innerHTML = `${back}<h2>${BOOST_SVG(22)} Impulsos de servidor</h2>
    <p class="mut">Com o Telão+ você tem <b>3 impulsos</b> para dar nos servidores que curte. Cada impulso fica no mínimo <b>7 dias</b> antes de poder trocar. Quem impulsiona ganha a insígnia <b>Impulsionador</b> e um ícone ao lado do nome.</p>
    ${plus ? '' : `<div class="upsellbox">Os impulsos fazem parte do Telão+. <button class="btn sm" id="mbPlus">Ver Telão+</button></div>`}
    <div class="slots big">${slots.map(x => {
      const srv = x.b && S.servers.find(z => z.id === x.b.server_id);
      return `<div class="slot ${x.b ? 'used' : ''} ${x.locked ? 'locked' : ''}"><span class="g">${BOOST_SVG(30)}</span><b>Impulso ${x.slot}</b>
        <small>${!x.b ? 'Livre — abra um servidor e escolha “Impulsionar”' : 'Em ' + esc(srv ? srv.name : 'um servidor')}${x.b ? (x.locked ? `<br>🔒 troca liberada em ${x.unlock.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : '<br>✔ pode trocar ou retirar') : ''}</small>
        ${x.b && !x.locked ? `<button class="btn sec sm" data-unb="${x.slot}">Retirar</button>` : ''}</div>`;
    }).join('')}</div>
    <h3>O que os impulsos liberam</h3>${levelsHtml(-1)}`;
  const p = box.querySelector('#mbPlus'); if(p) p.onclick = () => setSec('plus');
  box.querySelectorAll('[data-unb]').forEach(b => b.onclick = async () => {
    const { error } = await App.sb.rpc('unboost_server', { p_slot: +b.dataset.unb });
    if(error){ App.toast(error.message, true); return; }
    await loadBoosts(); renderSettings(); renderSidebar();
  });
}
function levelsHtml(cur){
  return `<div class="levels">${LEVELS.slice(1).map((L, i) => `<div class="lvl ${cur >= i+1 ? 'got' : ''}"><div class="lh"><b>${L.nome}</b><small>${L.need} impulsos</small>${cur >= i+1 ? '<span class="ok">✔ liberado</span>' : ''}</div>
    ${L.perks.map(([e, t]) => `<div class="perkrow"><span>${e}</span>${t}</div>`).join('')}</div>`).join('')}</div>`;
}
function secSrvBoost(box, back){
  const s = SET.server, n = boostCount(s.id), lv = serverLevel(s.id), next = LEVELS[lv + 1];
  const pct = next ? Math.round((n - LEVELS[lv].need) / (next.need - LEVELS[lv].need) * 100) : 100;
  const boosters = [...new Set(boostsOf(s.id).map(b => b.user_id))];
  const canEdit = App.hasPerm(s.id, 2);
  box.innerHTML = `${back}<h2>${BOOST_SVG(22)} Impulsos do servidor</h2>
    <div class="boostbar"><div class="bt"><b>${LEVELS[lv].nome}</b><span>${n} impulso(s)${next ? ` · faltam ${next.need - n} para o ${next.nome}` : ' · nível máximo!'}</span></div>
      <div class="track"><i style="width:${Math.max(4, pct)}%"></i></div>
      <button class="btn" id="sbB">${BOOST_SVG(16)} Impulsionar este servidor</button></div>
    ${canEdit ? `<h3>Personalização liberada</h3>
      ${row('Cor do servidor' + (lv < 1 ? ' 🔒' : ''), lv < 1 ? 'Libera no nível 1.' : 'Muda a cor de destaque para todo mundo dentro do servidor.', `<input type="color" id="sbAcc" value="${esc(s.accent || '#ff2e9a')}" ${lv < 1 ? 'disabled' : ''}>${s.accent ? ' <button class="btn sec sm" id="sbAccX">Tirar</button>' : ''}`)}
      ${row('Banner do servidor' + (lv < 2 ? ' 🔒' : ''), lv < 2 ? 'Libera no nível 2 (GIF no nível 3).' : 'Aparece no topo da lista de canais.', `<button class="btn sm" id="sbBan" ${lv < 2 ? 'disabled' : ''}>Enviar imagem</button>${s.banner_url ? ' <button class="btn sec sm" id="sbBanX">Tirar</button>' : ''}<input type="file" id="sbBanF" accept="image/*" hidden>`)}
      ${row('Convite personalizado' + (lv < 3 ? ' 🔒' : ''), lv < 3 ? 'Libera no nível 3.' : 'Ex.: telao…/?convite=galera', `<input class="inp" id="sbVan" style="width:160px" placeholder="galera" value="${/^[0-9a-f]{8}$/.test(s.invite_code) ? '' : esc(s.invite_code)}" ${lv < 3 ? 'disabled' : ''}> <button class="btn sm" id="sbVanOk" ${lv < 3 ? 'disabled' : ''}>Salvar</button>`)}` : ''}
    <h3>Níveis</h3>${levelsHtml(lv)}
    <h3>Quem está impulsionando (${boosters.length})</h3>
    <div class="boosters">${boosters.map(u => `<div class="mem">${avatar(prof(u),'',false)}<span>${nameHtml(prof(u))}</span><small class="mut">${boostsOf(s.id).filter(b => b.user_id === u).length}×</small></div>`).join('') || '<p class="mut">Ninguém ainda — seja o primeiro!</p>'}</div>`;
  const $b = q => box.querySelector(q);
  $b('#sbB').onclick = () => boostServerModal(s);
  const upd = async v => { const { error } = await App.sb.from('servers').update(v).eq('id', s.id); if(error){ App.toast(error.message, true); return false; } await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; renderSidebar(); renderSettings(); return true; };
  if(!canEdit) return;
  const acc = $b('#sbAcc'); if(acc && lv >= 1) acc.onchange = () => upd({ accent: acc.value });
  const ax = $b('#sbAccX'); if(ax) ax.onclick = () => upd({ accent: null });
  const ban = $b('#sbBan'); if(ban && lv >= 2){ ban.onclick = () => $b('#sbBanF').click(); $b('#sbBanF').onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    if(f.type === 'image/gif' && lv < 3){ App.toast('Banner animado libera no nível 3.', true); return; }
    App.toast('Enviando…');
    try{ const url = await uploadBanner(f); await upd({ banner_url: url }); }catch(err){ App.toast(err.message, true); }
  }; }
  const bx = $b('#sbBanX'); if(bx) bx.onclick = () => upd({ banner_url: null });
  const vo = $b('#sbVanOk'); if(vo && lv >= 3) vo.onclick = async () => {
    const { error } = await App.sb.rpc('set_vanity', { p_server: s.id, p_code: $b('#sbVan').value });
    if(error){ App.toast(error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; App.toast('Convite personalizado salvo'); renderSettings();
  };
}
async function uploadBanner(file){
  let blob = file, type = file.type;
  if(type !== 'image/gif'){
    const bmp = await createImageBitmap(file), W = Math.min(960, bmp.width), H = Math.round(W * 0.38);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const sh = Math.min(bmp.height, bmp.width * 0.38), sw = sh / 0.38;
    cv.getContext('2d').drawImage(bmp, (bmp.width - sw)/2, (bmp.height - sh)/2, sw, sh, 0, 0, W, H);
    blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.85)); type = blob.type || 'image/webp';
  }
  const path = `${S.me.id}/srvbanner-${Date.now().toString(36)}.${type.split('/')[1]}`;
  const { error } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl:'31536000' });
  if(error) throw error;
  return App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
/* =====================================================================
   v5: TEMAS COLORIDOS (Telão+) · PRÉVIA AO VIVO DAS TELAS E CÂMERAS · ACESSIBILIDADE
   ===================================================================== */

/* ---------- temas coloridos ---------- */
const BASE_THEMES = [['dark','Escuro','#15151d','#22222c'],['amoled','Preto (AMOLED)','#000','#17171d'],['light','Claro','#fff','#ebe7e4']];
const PLUS_THEMES = [
  ['oceano','Oceano','#0b2238','#0f3b5c','#38bdf8'], ['floresta','Floresta','#0e1f17','#173a29','#2bd17e'],
  ['synth','Synthwave','#1a0b2e','#3b1060','#ff3df0'], ['lava','Lava','#1f0a07','#4a140b','#ff6a2b'],
  ['meianoite','Meia-noite dourada','#0b0f24','#1b2147','#ffc94a'], ['cafe','Café','#1f1712','#3a2b21','#e0a96d'],
  ['sakura','Sakura','#fff1f5','#ffd6e3','#ff5c8a'], ['menta','Menta','#effcf6','#c9f2df','#14b87a'],
  ['algodao','Algodão-doce','#f6efff','#ffd9f1','#a855f7'], ['aurora','Aurora (animado)','#071a1f','#2a0f3d','#5eead4'],
];
const ALL_THEMES = BASE_THEMES.map(t => t[0]).concat(PLUS_THEMES.map(t => t[0]));
const _applyPrefs = applyPrefs;
applyPrefs = function(){
  const want = P.theme, wantAcc = P.accent;
  if(PLUS_THEMES.some(t => t[0] === want) && S.me && !hasPlus(S.me)) P.theme = 'dark';
  const pt = PLUS_THEMES.find(t => t[0] === P.theme);
  if(pt && !P.accentSet) P.accent = pt[4];
  document.body.classList.remove(...ALL_THEMES.map(t => 'theme-' + t));
  _applyPrefs();
  document.body.classList.toggle('lighttheme', ['light','sakura','menta','algodao'].includes(P.theme));
  P.theme = want; P.accent = wantAcc;
  applyA11y();
};
const _secAppearance = secAppearance;
secAppearance = function(box, back){
  _secAppearance(box, back);
  const plus = hasPlus(S.me);
  const themes = box.querySelector('.themes');
  themes.insertAdjacentHTML('afterend', `<h3 style="display:flex;align-items:center;gap:8px">Temas coloridos <span class="plustag">TELÃO+</span></h3>
    <div class="themes colorful">${PLUS_THEMES.map(([v, l, a, b, c]) => `<button data-pt="${v}" class="${P.theme === v ? 'on' : ''} ${plus ? '' : 'locked'}">
      <span class="tprev" style="background:linear-gradient(135deg,${a} 0 55%,${b} 55%)"><i style="background:${c}"></i>${plus ? '' : '<em>🔒</em>'}</span>${l}</button>`).join('')}</div>
    ${plus ? '' : '<p class="mut small">Assine o Telão+ para pintar o app inteiro do seu jeito.</p>'}`);
  box.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => {
    if(!plus){ upsell('Temas coloridos'); return; }
    P.theme = b.dataset.pt; P.accentSet = false; savePrefs(); renderSettings();
  });
  box.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => { P.accentSet = true; savePrefs(); }));
  box.querySelector('#apAcc').addEventListener('input', () => { P.accentSet = true; ls.set('telao-prefs', P); });
};

/* ---------- prévia ao vivo (miniatura) de quem está transmitindo ou com câmera ---------- */
S.thumbs = new Map();    // session -> { screen, cam, at }
const THUMB = { vids: new Map(), timer: null };
function grabThumb(stream, key){
  if(!stream) return null;
  let v = THUMB.vids.get(key);
  if(!v || v.srcObject !== stream){ v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; v.play().catch(() => {}); THUMB.vids.set(key, v); return null; }
  if(!v.videoWidth) return null;
  const W = 320, H = Math.round(W * v.videoHeight / v.videoWidth) || 180;
  const c = grabThumb.c || (grabThumb.c = document.createElement('canvas')); c.width = W; c.height = Math.min(H, 240);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}
function thumbTick(){
  if(App.perf === 'game'){ THUMB.skip = (THUMB.skip || 0) + 1; if(THUMB.skip % 3) return; }
  if(!Voice.channel || (!Voice.screenStream && !Voice.camStream)){ THUMB.vids.clear(); return; }
  const screen = grabThumb(Voice.screenStream, 'screen'), cam = grabThumb(Voice.camStream, 'cam');
  if(!screen && !cam) return;
  const ch = S.vpCh.get(Voice.topic); if(!ch) return;
  const pl = { sess: Voice.SESSION, uid: S.me.id, screen, cam, voice: Voice.channel.id };
  ch.send({ type:'broadcast', event:'thumb', payload: pl });
  App.onThumb(Voice.topic, pl);
}
THUMB.timer = setInterval(thumbTick, 6000);
setInterval(() => { const now = Date.now(); S.thumbs.forEach((t, k) => { if(now - t.at > 30000) S.thumbs.delete(k); }); }, 10000);
App.onThumb = (topic, pl) => {
  if(!pl || !pl.sess) return;
  S.thumbs.set(pl.sess, { screen: pl.screen, cam: pl.cam, uid: pl.uid, voice: pl.voice, at: Date.now() });
  const pop = document.getElementById('livePop');
  if(pop && pop.dataset.sess === pl.sess){ const img = pop.querySelector('img'); const src = pop.dataset.kind === 'cam' ? pl.cam : (pl.screen || pl.cam); if(img && src) img.src = src; }
};
function livePop(row){
  const av = row.querySelector('[data-sess]'); if(!av) return;
  const sess = av.dataset.sess, meta = [...S.vp.values()].flat().find(m => m.session === sess);
  if(!meta || (!meta.sharing && !meta.camera)) return;
  const t = S.thumbs.get(sess), kind = meta.sharing ? 'screen' : 'cam', src = t && (kind === 'cam' ? t.cam : (t.screen || t.cam));
  let pop = document.getElementById('livePop');
  if(!pop){ pop = document.createElement('div'); pop.id = 'livePop'; pop.className = 'livepop'; document.body.appendChild(pop);
    pop.addEventListener('mouseleave', () => pop.remove()); }
  pop.dataset.sess = sess; pop.dataset.kind = kind;
  const p = prof(meta.user_id);
  pop.innerHTML = `<div class="lpimg">${src ? `<img src="${src}" alt="">` : `<div class="lpwait">${ic(kind === 'cam' ? 'video' : 'screenUp', 28)}<small>prévia chegando…</small></div>`}<span class="lptag">${kind === 'cam' ? '📷 CÂMERA' : '🔴 AO VIVO'}</span></div>
    <div class="lpb"><b>${esc(p.display_name)}</b><small>${kind === 'cam' ? 'está com a câmera ligada' : 'está compartilhando a tela'}</small>
    <button class="btn sm" data-watch="${meta.voice}" data-wsess="${sess}">${Voice.channel && Voice.channel.id === meta.voice ? 'Assistir' : 'Entrar e assistir'}</button></div>`;
  const r = row.getBoundingClientRect();
  pop.style.left = Math.min(innerWidth - 300, r.right + 10) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - 260, r.top - 60)) + 'px';
  pop.querySelector('[data-watch]').onclick = () => { pop.remove(); watchLive(meta.voice, sess); };
}
let lpTimer = null;
document.addEventListener('mouseover', e => {
  const row = e.target.closest('.vu');
  if(row){ clearTimeout(lpTimer); lpTimer = setTimeout(() => livePop(row), 250); return; }
  if(e.target.closest('#livePop')){ clearTimeout(lpTimer); return; }
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { const p = document.getElementById('livePop'); if(p && !p.matches(':hover')) p.remove(); }, 300);
});
/* no celular: segurar o nome mostra a prévia */
document.addEventListener('contextmenu', e => { const row = e.target.closest('.vu'); if(row && isMobile()){ e.preventDefault(); livePop(row); } });

/* ---------- acessibilidade ---------- */
const A11Y_DEF = { a11yMotion:false, a11yContrast:false, a11yFont:false, a11yLinks:false, a11yBig:false, a11ySat:100, a11yTTS:false, a11yCaps:false, a11yCapsShow:true, a11yFocus:true, a11yAltWarn:false };
Object.keys(A11Y_DEF).forEach(k => { if(P[k] === undefined) P[k] = A11Y_DEF[k]; });
function applyA11y(){
  const b = document.body.classList, sysMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  b.toggle('a11y-motion', !!P.a11yMotion || sysMotion);
  b.toggle('a11y-contrast', !!P.a11yContrast);
  b.toggle('a11y-links', !!P.a11yLinks);
  b.toggle('a11y-big', !!P.a11yBig);
  b.toggle('a11y-focus', P.a11yFocus !== false);
  b.toggle('a11y-font', !!P.a11yFont);
  if(P.a11yFont && !document.getElementById('a11yFontCss')){
    const l = document.createElement('link'); l.id = 'a11yFontCss'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap'; document.head.appendChild(l);
  }
  document.documentElement.style.filter = P.a11ySat !== 100 ? `saturate(${P.a11ySat / 100})` : '';
}
applyA11y();
/* rótulos para leitor de tela: botões só com ícone ganham o texto da dica */
function ariaFix(root){
  (root || document).querySelectorAll('button[data-tip]:not([aria-label]), [data-tip][role="button"]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.dataset.tip));
  (root || document).querySelectorAll('button[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.title));
}
new MutationObserver(muts => { for(const m of muts) m.addedNodes.forEach(n => n.nodeType === 1 && ariaFix(n)); }).observe(document.body, { childList:true, subtree:true });

/* ler mensagens em voz alta */
const _addMessage = addMessage;
addMessage = function(m){
  const isNew = m && M.cid === m.channel_id && !M.list.find(x => x.id === m.id);
  _addMessage.apply(this, arguments);
  if(isNew && P.a11yTTS && m.author_id !== S.me.id && 'speechSynthesis' in window){
    const txt = (m.content || '').replace(/https?:\/\/\S+/g, 'link').replace(/<[^>]+>/g, '').slice(0, 300) || 'enviou um anexo';
    speak(`${prof(m.author_id).display_name}: ${txt}`);
  }
};
function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang = ({ en:'en-US', es:'es-ES' })[P.lang] || 'pt-BR'; u.rate = P.ttsRate || 1;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* legendas ao vivo nas chamadas (reconhecimento de voz do navegador) */
const CAP = { rec: null, on: false, lines: new Map() };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function startCaptions(){
  if(!SR){ App.toast('Seu navegador não tem reconhecimento de voz. Use o Chrome ou o Edge para legendas.', true); return false; }
  if(CAP.on) return true;
  const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = ({ en:'en-US', es:'es-ES' })[P.lang] || 'pt-BR';
  let last = 0;
  r.onresult = e => {
    const res = e.results[e.results.length - 1], text = res[0].transcript.trim();
    if(!text || Voice.muted || Voice.deafened || !Voice.micEnabled()) return;
    if(!res.isFinal && Date.now() - last < 700) return;
    last = Date.now();
    Voice.sendFx({ t:'cap', uid: S.me.id, text: text.slice(-160), fin: res.isFinal });
  };
  r.onend = () => { if(CAP.on && Voice.channel) try{ r.start(); }catch(e){} };
  r.onerror = ev => { if(ev.error === 'not-allowed'){ CAP.on = false; App.toast('Permita o microfone para as legendas funcionarem.', true); } };
  try{ r.start(); }catch(e){}
  CAP.rec = r; CAP.on = true; return true;
}
function stopCaptions(){ CAP.on = false; try{ CAP.rec && CAP.rec.stop(); }catch(e){} CAP.rec = null; }
const _onFx = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && pl.t === 'cap'){ showCaption(pl); return; }
  if(pl && pl.t === 'sound' && !SOUNDS.find(x => x[0] === pl.id)){
    playSound(pl.id);
    const meta = Object.values(SOUND_PACKS).flat().find(x => x[0] === pl.id); if(meta) floatReaction(meta[1], pl.uid);
    return;
  }
  _onFx(pl, mine);
};
function showCaption(pl){
  if(P.a11yCapsShow === false && !CAP.on) return;
  let box = document.getElementById('capBox');
  if(!box){ box = document.createElement('div'); box.id = 'capBox'; box.className = 'capbox'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const prev = CAP.lines.get(pl.uid); if(prev) clearTimeout(prev.t);
  let line = box.querySelector(`[data-cu="${pl.uid}"]`);
  if(!line){ line = document.createElement('div'); line.dataset.cu = pl.uid; box.appendChild(line); }
  line.innerHTML = `<b>${esc(prof(pl.uid).display_name)}</b> ${esc(pl.text)}`;
  CAP.lines.set(pl.uid, { t: setTimeout(() => { line.remove(); CAP.lines.delete(pl.uid); if(!box.children.length) box.remove(); }, pl.fin ? 5000 : 7000) });
}
/* liga sozinho ao entrar na chamada, se escolhido */
const _joinVoice = joinVoice;
joinVoice = async function(){ const r = await _joinVoice.apply(this, arguments); if(P.a11yCaps && Voice.channel) startCaptions(); return r; };
const _leaveVoice = leaveVoice;
leaveVoice = async function(){ stopCaptions(); const b = document.getElementById('capBox'); if(b) b.remove(); return _leaveVoice.apply(this, arguments); };
App.toggleCaptions = () => { if(CAP.on){ stopCaptions(); App.toast('Legendas desligadas'); } else if(startCaptions()) App.toast('Legendas ligadas — o que você fala aparece para todos na chamada'); };

function secA11y(box, back){
  box.innerHTML = `${back}<h2>Acessibilidade</h2>
    <h3>Visão</h3>
    ${row('Alto contraste', 'Textos e bordas mais fortes, mais fácil de ler.', toggle('aCon', P.a11yContrast))}
    ${row('Fonte mais legível', 'Usa a Atkinson Hyperlegible, feita para baixa visão e dislexia.', toggle('aFont', P.a11yFont))}
    ${row('Sublinhar links', '', toggle('aLnk', P.a11yLinks))}
    ${row('Botões e áreas de toque maiores', '', toggle('aBig', P.a11yBig))}
    ${row('Contorno de foco bem visível', 'Ajuda quem navega pelo teclado (Tab).', toggle('aFoc', P.a11yFocus !== false))}
    <div class="srow"><div class="t"><b>Saturação das cores · <span id="aSatL">${P.a11ySat}%</span></b><small>Diminua se as cores incomodam; 0% deixa tudo em tons de cinza.</small></div></div>
    <input type="range" class="range" id="aSat" min="0" max="100" step="5" value="${P.a11ySat}">
    <hr class="sdiv"><h3>Movimento</h3>
    ${row('Reduzir animações', 'Desliga partículas, brilhos e transições. Também segue a configuração do seu sistema.', toggle('aMot', P.a11yMotion))}
    <hr class="sdiv"><h3>Leitura e audição</h3>
    ${row('Ler mensagens novas em voz alta', 'Lê as mensagens que chegam na conversa aberta.', toggle('aTTS', P.a11yTTS))}
    <div class="srow"><div class="t"><b>Velocidade da leitura · <span id="aRateL">${(P.ttsRate || 1).toFixed(1)}×</span></b></div><button class="btn sec sm" id="aTest">Testar</button></div>
    <input type="range" class="range" id="aRate" min="0.6" max="1.8" step="0.1" value="${P.ttsRate || 1}">
    ${row('Legendas ao vivo nas chamadas', SR ? 'Transforma sua fala em texto e mostra para todo mundo da chamada. Liga sozinho quando você entra.' : 'Seu navegador não suporta. Use Chrome ou Edge.', toggle('aCaps', P.a11yCaps))}
    ${row('Mostrar legendas dos outros', 'Exibe o que as pessoas com legenda ligada estão falando.', toggle('aCapsS', P.a11yCapsShow !== false))}
    <hr class="sdiv"><h3>Leitor de tela</h3>
    <p class="mut small">Todos os botões com ícone têm nome para leitores de tela (NVDA, VoiceOver, TalkBack), e as legendas são anunciadas automaticamente.</p>`;
  const $b = q => box.querySelector(q);
  const bind = (id, key, after) => $b(id).onchange = e => { P[key] = e.target.checked; savePrefs(); after && after(e.target.checked); };
  bind('#aCon', 'a11yContrast'); bind('#aFont', 'a11yFont'); bind('#aLnk', 'a11yLinks'); bind('#aBig', 'a11yBig'); bind('#aFoc', 'a11yFocus'); bind('#aMot', 'a11yMotion');
  bind('#aTTS', 'a11yTTS', on => on && speak('Leitura de mensagens ligada'));
  bind('#aCaps', 'a11yCaps', on => { if(Voice.channel) on ? startCaptions() : stopCaptions(); });
  bind('#aCapsS', 'a11yCapsShow');
  $b('#aSat').oninput = e => { P.a11ySat = +e.target.value; $b('#aSatL').textContent = P.a11ySat + '%'; savePrefs(); };
  $b('#aRate').oninput = e => { P.ttsRate = +e.target.value; $b('#aRateL').textContent = P.ttsRate.toFixed(1) + '×'; savePrefs(); };
  $b('#aTest').onclick = () => speak('Oi! Assim eu leio as mensagens do Telão.');
}
/* =====================================================================
   v5: IDIOMAS — Português · English · Español
   Traduz a interface (nunca o que as pessoas escrevem).
   ===================================================================== */
const LANGS = [['pt','Português (Brasil)','🇧🇷'],['en','English','🇺🇸'],['es','Español','🇪🇸']];
if(!P.lang){ const n = (navigator.language || 'pt').slice(0, 2); P.lang = ['en','es'].includes(n) ? n : 'pt'; }
// [português, inglês, espanhol]
const DICT_RAW = [
  ['Início · amigos e conversas','Home · friends and chats','Inicio · amigos y chats'],['Adicionar um servidor','Add a server','Añadir un servidor'],
  ['Loja do Telão','Telão Shop','Tienda de Telão'],['Amigos','Friends','Amigos'],['Mensagens diretas','Direct messages','Mensajes directos'],
  ['Online','Online','En línea'],['Todos','All','Todos'],['Pendentes','Pending','Pendientes'],['Adicionar amigo','Add friend','Añadir amigo'],
  ['Mensagem','Message','Mensaje'],['Ligar','Call','Llamar'],['Dar presente','Send a gift','Regalar'],['Copiar usuário','Copy username','Copiar usuario'],
  ['Editar perfil','Edit profile','Editar perfil'],['Desfazer amizade','Remove friend','Eliminar amigo'],['Aceitar','Accept','Aceptar'],['Recusar','Decline','Rechazar'],
  ['Canais de texto','Text channels','Canales de texto'],['Canais de voz','Voice channels','Canales de voz'],['Convidar pessoas','Invite people','Invitar personas'],
  ['Impulsionar servidor','Boost server','Impulsar servidor'],['Configurações do servidor','Server settings','Ajustes del servidor'],['Criar canal','Create channel','Crear canal'],
  ['Criar categoria','Create category','Crear categoría'],['Sair do servidor','Leave server','Salir del servidor'],['Excluir servidor','Delete server','Eliminar servidor'],
  ['Membros','Members','Miembros'],['Dono do servidor','Server owner','Dueño del servidor'],['Em chamada','In a call','En llamada'],['AO VIVO','LIVE','EN VIVO'],
  ['Clique para assistir','Click to watch','Haz clic para ver'],['Assistir','Watch','Ver'],['Entrar e assistir','Join and watch','Entrar y ver'],
  ['Sair da chamada','Leave call','Salir de la llamada'],['Silenciar','Mute','Silenciar'],['Ativar microfone','Unmute','Activar micrófono'],
  ['Ensurdecer','Deafen','Ensordecer'],['Configurações','Settings','Ajustes'],['Compartilhar tela','Share screen','Compartir pantalla'],['Parar de compartilhar','Stop sharing','Dejar de compartir'],
  ['Câmera','Camera','Cámara'],['Atividades','Activities','Actividades'],['Atividades e soundboard','Activities and soundboard','Actividades y soundboard'],
  ['Assistir juntos','Watch together','Ver juntos'],['Legendas ao vivo','Live captions','Subtítulos en vivo'],['Reações na tela','On-screen reactions','Reacciones en pantalla'],
  ['Efeitos da câmera','Camera effects','Efectos de cámara'],['Tela cheia','Fullscreen','Pantalla completa'],['Modo cinema','Cinema mode','Modo cine'],['Tirar print','Screenshot','Captura'],
  ['Janela flutuante','Picture-in-picture','Ventana flotante'],['Desenhar na tela (todos veem)','Draw on screen (everyone sees)','Dibujar en pantalla (todos lo ven)'],
  ['Volume da tela','Screen volume','Volumen de la pantalla'],['Volume da voz','Voice volume','Volumen de la voz'],
  ['Responder','Reply','Responder'],['Editar','Edit','Editar'],['Mais','More','Más'],['Reagir','React','Reaccionar'],['Adicionar reação','Add reaction','Añadir reacción'],
  ['Apagar mensagem','Delete message','Eliminar mensaje'],['Copiar texto','Copy text','Copiar texto'],['Copiar link','Copy link','Copiar enlace'],['Fixar','Pin','Fijar'],
  ['Anexar arquivos','Attach files','Adjuntar archivos'],['Emoji','Emoji','Emoji'],['Mensagem de voz','Voice message','Mensaje de voz'],['Buscar','Search','Buscar'],
  ['Buscar nesta conversa','Search this chat','Buscar en este chat'],['Buscar ou ir para…','Search or jump to…','Buscar o ir a…'],['Para onde você quer ir?','Where do you want to go?','¿A dónde quieres ir?'],
  ['Mensagens fixadas','Pinned messages','Mensajes fijados'],['Nenhuma mensagem fixada ainda.','No pinned messages yet.','Aún no hay mensajes fijados.'],
  ['novas mensagens','new messages','mensajes nuevos'],['editado','edited','editado'],['Solte para enviar','Drop to send','Suelta para enviar'],['Respondendo a','Replying to','Respondiendo a'],
  ['Carregando…','Loading…','Cargando…'],['Cancelar','Cancel','Cancelar'],['Salvar','Save','Guardar'],['Salvar alterações','Save changes','Guardar cambios'],['Fechar','Close','Cerrar'],
  ['Fechar (Esc)','Close (Esc)','Cerrar (Esc)'],['Confirmar','Confirm','Confirmar'],['Remover','Remove','Quitar'],['Redefinir','Reset','Restablecer'],['Enviar','Send','Enviar'],
  ['Criar','Create','Crear'],['Copiar','Copy','Copiar'],['Apagar','Delete','Eliminar'],['Abrir','Open','Abrir'],['Baixar','Download','Descargar'],['Mostrar','Show','Mostrar'],
  ['Em breve','Coming soon','Próximamente'],['Padrão','Default','Predeterminado'],['Nenhum','None','Ninguno'],['Usar','Use','Usar'],['Tirar','Take off','Quitar'],['Retirar','Withdraw','Retirar'],
  ['Cuidado — você tem alterações não salvas!','Careful — you have unsaved changes!','¡Cuidado, tienes cambios sin guardar!'],
  ['Configurações de usuário','User settings','Ajustes de usuario'],['Minha conta','My account','Mi cuenta'],['Perfis','Profiles','Perfiles'],['Perfil','Profile','Perfil'],
  ['Loja e presentes','Shop and gifts','Tienda y regalos'],['Impulsos','Boosts','Impulsos'],['Configurações do app','App settings','Ajustes de la app'],['Aparência','Appearance','Apariencia'],
  ['Acessibilidade','Accessibility','Accesibilidad'],['Idioma','Language','Idioma'],['Voz e vídeo','Voice and video','Voz y video'],['Notificações','Notifications','Notificaciones'],
  ['Teclas de atalho','Keybinds','Atajos de teclado'],['App e instalação','App and install','App e instalación'],['Administração','Administration','Administración'],
  ['Painel do admin','Admin panel','Panel de admin'],['Sair','Log out','Cerrar sesión'],['Visão geral','Overview','Vista general'],['Cargos','Roles','Roles'],['Canais','Channels','Canales'],
  ['Convites','Invites','Invitaciones'],['Nome de exibição','Display name','Nombre visible'],['Nome de usuário','Username','Nombre de usuario'],['E-mail','Email','Correo'],
  ['Senha','Password','Contraseña'],['Mudar senha','Change password','Cambiar contraseña'],['Excluir conta','Delete account','Eliminar cuenta'],['Remoção de conta','Account removal','Eliminación de cuenta'],
  ['Entrar com','Sign-in method','Inicio de sesión con'],['Sobre mim','About me','Sobre mí'],['Membro desde','Member since','Miembro desde'],['Pronomes','Pronouns','Pronombres'],
  ['Insígnias','Badges','Insignias'],['Links','Links','Enlaces'],['Banner','Banner','Banner'],['Avatar','Avatar','Avatar'],['Cor do avatar','Avatar color','Color del avatar'],
  ['Cor do banner','Banner color','Color del banner'],['Prévia','Preview','Vista previa'],['Tema','Theme','Tema'],['Temas coloridos','Colorful themes','Temas de colores'],
  ['Escuro','Dark','Oscuro'],['Claro','Light','Claro'],['Preto (AMOLED)','Black (AMOLED)','Negro (AMOLED)'],['Cor de destaque','Accent color','Color de acento'],
  ['Escolher outra cor','Pick another color','Elegir otro color'],['Modo compacto','Compact mode','Modo compacto'],['Tamanho da fonte das conversas','Chat font size','Tamaño de letra del chat'],
  ['Configurações de voz','Voice settings','Ajustes de voz'],['Dispositivo de entrada','Input device','Dispositivo de entrada'],['Dispositivo de saída','Output device','Dispositivo de salida'],
  ['Testar microfone','Test microphone','Probar micrófono'],['Modo de entrada','Input mode','Modo de entrada'],['Processamento de voz','Voice processing','Procesamiento de voz'],
  ['Qualidade','Quality','Calidad'],['Resolução','Resolution','Resolución'],['Bitrate máximo','Max bitrate','Bitrate máximo'],
  ['Abaixar o som das telas quando alguém fala','Lower screen audio when someone talks','Bajar el audio de las pantallas cuando alguien habla'],
  ['Sons de entrar, sair e mutar','Join, leave and mute sounds','Sonidos de entrar, salir y silenciar'],
  ['Telão+','Telão+','Telão+'],['Turbine seu perfil e suas transmissões.','Supercharge your profile and your streams.','Potencia tu perfil y tus transmisiones.'],
  ['Compare','Compare','Comparar'],['Grátis','Free','Gratis'],['Seus pagamentos','Your payments','Tus pagos'],
  ['Loja','Shop','Tienda'],['Meus itens','My items','Mis artículos'],['Tudo','All','Todo'],['Decorações','Decorations','Decoraciones'],['Entradas na call','Call entrances','Entradas a la llamada'],
  ['Pacotes de som','Sound packs','Paquetes de sonido'],['Títulos','Titles','Títulos'],['Fundos de perfil','Profile backgrounds','Fondos de perfil'],
  ['Pegar fichas do dia','Claim daily coins','Reclamar fichas del día'],['Volte amanhã ✔','Come back tomorrow ✔','Vuelve mañana ✔'],['Pegar','Claim','Reclamar'],
  ['Dar um presente','Send a gift','Hacer un regalo'],['Para','To','Para'],['Presente','Gift','Regalo'],['Mensagem (opcional)','Message (optional)','Mensaje (opcional)'],
  ['Enviar presente','Send gift','Enviar regalo'],['Você ganhou um presente!','You got a gift!','¡Recibiste un regalo!'],['Aberto ✔','Opened ✔','Abierto ✔'],['Ainda fechado','Still wrapped','Aún cerrado'],
  ['Impulsos de servidor','Server boosts','Impulsos de servidor'],['Impulsos do servidor','Server boosts','Impulsos del servidor'],['Impulsionar este servidor','Boost this server','Impulsar este servidor'],
  ['O que os impulsos liberam','What boosts unlock','Lo que desbloquean los impulsos'],['Níveis','Levels','Niveles'],['Personalização liberada','Unlocked customization','Personalización desbloqueada'],
  ['Ninguém ainda — seja o primeiro!','Nobody yet — be the first!','Nadie aún, ¡sé el primero!'],['Impulsionando este servidor','Boosting this server','Impulsando este servidor'],
  ['Visão','Vision','Visión'],['Movimento','Motion','Movimiento'],['Leitura e audição','Reading and hearing','Lectura y audición'],['Leitor de tela','Screen reader','Lector de pantalla'],
  ['Alto contraste','High contrast','Alto contraste'],['Fonte mais legível','More legible font','Fuente más legible'],['Sublinhar links','Underline links','Subrayar enlaces'],
  ['Botões e áreas de toque maiores','Bigger buttons and touch areas','Botones y áreas táctiles más grandes'],['Contorno de foco bem visível','Clearly visible focus outline','Contorno de foco bien visible'],
  ['Reduzir animações','Reduce motion','Reducir animaciones'],['Ler mensagens novas em voz alta','Read new messages aloud','Leer mensajes nuevos en voz alta'],
  ['Legendas ao vivo nas chamadas','Live captions in calls','Subtítulos en vivo en llamadas'],['Mostrar legendas dos outros','Show other people\'s captions','Mostrar subtítulos de otros'],['Testar','Test','Probar'],
  ['Entrar','Log in','Entrar'],['Cadastre-se','Sign up','Regístrate'],['Continuar com Google','Continue with Google','Continuar con Google'],['Boas-vindas de volta!','Welcome back!','¡Bienvenido de nuevo!'],
  ['Que bom te ver de novo.','Great to see you again.','Qué bueno verte otra vez.'],['Precisa de uma conta?','Need an account?','¿Necesitas una cuenta?'],['Não chegou o e-mail?','Didn\'t get the email?','¿No te llegó el correo?'],
  ['Reenviar confirmação','Resend confirmation','Reenviar confirmación'],['Adicione amigos para conversar','Add friends to chat','Añade amigos para chatear'],
  ['Enviar pedido de amizade','Send friend request','Enviar solicitud de amistad'],['Nova conversa','New chat','Nuevo chat'],['Definir um status personalizado','Set a custom status','Definir un estado personalizado'],
  ['Disponível','Online','Disponible'],['Ausente','Idle','Ausente'],['Não perturbe','Do not disturb','No molestar'],['Invisível','Invisible','Invisible'],
  ['Entrar num servidor','Join a server','Unirse a un servidor'],['Criar o meu','Create my own','Crear el mío'],['Entrar no servidor','Join server','Unirse al servidor'],
  ['Nome do servidor','Server name','Nombre del servidor'],['Nome do canal','Channel name','Nombre del canal'],['Descrição','Description','Descripción'],['Texto','Text','Texto'],
  ['Atender','Answer','Contestar'],['Desconectar','Disconnect','Desconectar'],['Instalar','Install','Instalar'],['Instalar Telão','Install Telão','Instalar Telão'],
  ['Nova atualização do Telão disponível!','A new Telão update is available!','¡Hay una nueva actualización de Telão!'],['Atualizar agora','Update now','Actualizar ahora'],
  ['Clique aqui para ativar o som da chamada','Click here to enable call audio','Haz clic aquí para activar el audio de la llamada'],
  ['Esse servidor ainda não tem canais','This server has no channels yet','Este servidor aún no tiene canales'],['Nada encontrado','Nothing found','No se encontró nada'],
  ['Nada encontrado.','Nothing found.','No se encontró nada.'],['Digite para buscar mensagens.','Type to search messages.','Escribe para buscar mensajes.'],
  ['Procurar membro','Search member','Buscar miembro'],['Procurar emoji','Search emoji','Buscar emoji'],['O que está rolando?','What\'s up?','¿Qué pasa?'],
];
const DICT = new Map(DICT_RAW.map(([pt, en, es]) => [pt, { en, es }]));
// textos com partes que mudam
const RULES = [
  [/^Hoje às (.+)$/, { en:'Today at $1', es:'Hoy a las $1' }], [/^Ontem às (.+)$/, { en:'Yesterday at $1', es:'Ayer a las $1' }],
  [/^(\d+) online · (\d+) membros?$/, { en:'$1 online · $2 members', es:'$1 en línea · $2 miembros' }],
  [/^Online — (\d+)$/, { en:'Online — $1', es:'En línea — $1' }], [/^Offline — (\d+)$/, { en:'Offline — $1', es:'Desconectado — $1' }],
  [/^Todos os amigos — (\d+)$/, { en:'All friends — $1', es:'Todos los amigos — $1' }], [/^Pendentes — (\d+)$/, { en:'Pending — $1', es:'Pendientes — $1' }],
  [/^Conversar em (.+)$/, { en:'Message $1', es:'Escribir en $1' }], [/^Mensagem para (.+)$/, { en:'Message $1', es:'Mensaje para $1' }],
  [/^Meus itens \((\d+)\)$/, { en:'My items ($1)', es:'Mis artículos ($1)' }], [/^Impulso (\d)$/, { en:'Boost $1', es:'Impulso $1' }],
  [/^Nível (\d)$/, { en:'Level $1', es:'Nivel $1' }], [/^(\d+) impulsos$/, { en:'$1 boosts', es:'$1 impulsos' }],
  [/^(.+) está digitando…$/, { en:'$1 is typing…', es:'$1 está escribiendo…' }],
];
function tr(text){
  if(P.lang === 'pt' || !text) return null;
  const t = text.trim(); if(!t || t.length > 120) return null;
  const d = DICT.get(t); if(d) return text.replace(t, d[P.lang]);
  for(const [re, o] of RULES) if(re.test(t)) return text.replace(t, t.replace(re, o[P.lang]));
  return null;
}
// nunca traduz o que é conteúdo dos usuários
const SKIP = '.ct, .bub .ct, .editbox, .dn, .un, .cst, .pcard2 p, .plinks, .nm, .hd b, .mt .nm, .vu .nm, .rpl, .emb, .poll, .gt small, input, textarea, [contenteditable], [data-noi18n], script, style, code, pre';
function trNode(n){
  if(n.nodeType === 3){
    const p = n.parentElement; if(!p || p.closest(SKIP) || n.nodeValue === n._trOut) return;
    const out = tr(n.nodeValue); if(out != null && out !== n.nodeValue){ n._trOut = out; n.nodeValue = out; }
    return;
  }
  if(n.nodeType !== 1 || n.matches(SKIP)) return;
  for(const a of ['placeholder','data-tip','data-tipsub','title','aria-label']){
    const v = n.getAttribute(a); if(!v || v === (n._trA || {})[a]) continue;
    const out = tr(v); if(out != null && out !== v){ (n._trA ||= {})[a] = out; n.setAttribute(a, out); }
  }
  for(const c of n.childNodes) trNode(c);
}
let i18nObs = null;
function applyLang(){
  document.documentElement.lang = ({ pt:'pt-BR', en:'en', es:'es' })[P.lang] || 'pt-BR';
  if(P.lang === 'pt'){ if(i18nObs){ i18nObs.disconnect(); i18nObs = null; } return; }
  trNode(document.body);
  if(!i18nObs){
    i18nObs = new MutationObserver(muts => {
      for(const m of muts){
        if(m.type === 'characterData') trNode(m.target);
        else if(m.type === 'attributes') trNode(m.target);
        else m.addedNodes.forEach(trNode);
      }
    });
    i18nObs.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['placeholder','data-tip','title','aria-label'] });
  }
}
applyLang();
// toasts e confirmações também
const _toast = App.toast;
App.toast = (t, err, action) => _toast(tr(t) ?? t, err, action);

function secLang(box, back){
  box.innerHTML = `${back}<h2>Idioma</h2>
    <p class="mut">Muda os textos do Telão. As mensagens das pessoas continuam como foram escritas.</p>
    <div class="langs">${LANGS.map(([v, l, f]) => `<button data-lang="${v}" class="${P.lang === v ? 'on' : ''}"><span class="fl">${f}</span><b>${l}</b>${P.lang === v ? '<span class="ok">✔</span>' : ''}</button>`).join('')}</div>
    <p class="mut small" style="margin-top:14px">Algumas partes novas podem aparecer em português até a próxima atualização.</p>`;
  box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    const was = P.lang; P.lang = b.dataset.lang; savePrefs();
    if(was !== 'pt' && P.lang !== was){ location.reload(); return; }   // volta os textos originais
    applyLang(); renderAll(); renderSettings();
  });
}
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
/* =====================================================================
   v6: EVENTOS DO SERVIDOR (agendar noite de jogo, sessão de filme…)
   ===================================================================== */
S.events = new Map();   // sid -> [eventos]
S.rsvps = new Map();    // eventId -> Set(uid)
const EV_COLORS = ['#ff2e9a','#3b82f6','#22c55e','#eab308','#a855f7','#ec4899','#14b8a6','#64748b'];
const evLive = e => new Date(e.starts_at) <= new Date() && new Date() <= new Date(e.ends_at || (new Date(e.starts_at).getTime() + 3 * 3600e3));
const evOver = e => new Date() > new Date(e.ends_at || (new Date(e.starts_at).getTime() + 3 * 3600e3));
const canEvents = sid => App.hasPerm(sid, 256) || App.hasPerm(sid, 2);
function fmtEv(d){
  d = new Date(d); const now = new Date(), tm = new Date(now); tm.setDate(now.getDate() + 1);
  const hm = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  if(d.toDateString() === now.toDateString()) return 'Hoje às ' + hm;
  if(d.toDateString() === tm.toDateString()) return 'Amanhã às ' + hm;
  return d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' }).replace('.', '') + ' às ' + hm;
}
async function loadEvents(sid){
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data } = await App.sb.from('server_events').select('*').eq('server_id', sid).gt('starts_at', since).order('starts_at');
  const list = (data || []).filter(e => !evOver(e));
  S.events.set(sid, list);
  if(list.length){
    const { data: rs } = await App.sb.from('event_rsvps').select('*').in('event_id', list.map(e => e.id));
    list.forEach(e => S.rsvps.set(e.id, new Set()));
    (rs || []).forEach(r => { if(S.rsvps.has(r.event_id)) S.rsvps.get(r.event_id).add(r.user_id); });
  }
}
const _loadServersE = loadServers;
loadServers = async function(){
  await _loadServersE();
  await Promise.all(S.servers.map(s => loadEvents(s.id).catch(() => {})));
  if(!S._evRt){ S._evRt = true;
    const re = async p => { const r = p.new && p.new.id ? p.new : p.old; const sid = (r && r.server_id) || [...S.events].find(([, l]) => l.some(e => e.id === (r && r.event_id)))?.[0];
      if(sid) await loadEvents(sid); else await Promise.all(S.servers.map(s => loadEvents(s.id))); renderSidebar(); refreshEvModal(); };
    App.sb.channel('events-rt').on('postgres_changes', { event:'*', schema:'public', table:'server_events' }, re)
      .on('postgres_changes', { event:'*', schema:'public', table:'event_rsvps' }, re).subscribe();
  }
};
/* linha "Eventos" na lista de canais */
const _renderSidebarE = renderSidebar;
renderSidebar = function(){
  _renderSidebarE.apply(this, arguments);
  const s = S.route && S.route.kind === 'server' ? curServer() : null; if(!s) return;
  const body = $('#sbBody'); if(!body || body.querySelector('.evrow')) return;
  const list = S.events.get(s.id) || [], live = list.find(evLive), next = list[0];
  if(!list.length && !canEvents(s.id)) return;
  body.insertAdjacentHTML('afterbegin', `<button class="evrow ${live ? 'live' : ''}" id="sbEvents">${ic('calendar', 18)}<span class="t"><b>${live ? 'Acontecendo agora' : list.length ? list.length + (list.length > 1 ? ' eventos' : ' evento') : 'Eventos'}</b>${live ? `<small>${esc(live.title)}</small>` : next ? `<small>${esc(next.title)} · ${fmtEv(next.starts_at)}</small>` : '<small>Agendar uma noite de jogo</small>'}</span></button>`);
  body.querySelector('#sbEvents').onclick = () => eventsModal(s);
};
let evModalSid = null;
function refreshEvModal(){ if(evModalSid && document.querySelector('#evList')) eventsModal(S.servers.find(s => s.id === evModalSid), true); }
function eventsModal(s, keep){
  evModalSid = s.id;
  const list = S.events.get(s.id) || [];
  const html = `<div class="mh"><h2>Eventos de ${esc(s.name)}</h2><p>Marque “Tenho interesse” e o Telão te avisa 10 minutos antes.</p></div>
    <div class="mc"><div id="evList" class="evlist">${list.map(e => evCard(s, e)).join('') || '<div class="empty">Nenhum evento marcado.</div>'}</div></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button>${canEvents(s.id) ? `<button class="btn" id="evNew">${ic('plus', 16)} Criar evento</button>` : ''}</div>`;
  const bind = m => {
    const n = m.querySelector('#evNew'); if(n) n.onclick = () => eventForm(s);
    m.querySelectorAll('[data-rsvp]').forEach(b => b.onclick = async () => {
      const id = b.dataset.rsvp, set = S.rsvps.get(id) || new Set();
      const { error } = set.has(S.me.id) ? await App.sb.from('event_rsvps').delete().eq('event_id', id).eq('user_id', S.me.id) : await App.sb.from('event_rsvps').insert({ event_id: id, user_id: S.me.id });
      if(error){ App.toast(error.message, true); return; }
      await loadEvents(s.id); eventsModal(s, true); renderSidebar();
    });
    m.querySelectorAll('[data-evjoin]').forEach(b => b.onclick = () => { const ch = findChannel(b.dataset.evjoin); if(ch){ closeModal(); joinVoice(ch); } });
    m.querySelectorAll('[data-evedit]').forEach(b => b.onclick = () => eventForm(s, list.find(e => e.id === b.dataset.evedit)));
    m.querySelectorAll('[data-evdel]').forEach(b => b.onclick = async () => {
      if(!(await confirmBox('Apagar evento', 'Apagar este evento?', 'Apagar'))) return;
      await App.sb.from('server_events').delete().eq('id', b.dataset.evdel); await loadEvents(s.id); eventsModal(s); renderSidebar();
    });
  };
  modal(html, bind);
}
function evCard(s, e){
  const ch = e.channel_id && findChannel(e.channel_id), set = S.rsvps.get(e.id) || new Set(), going = set.has(S.me.id), live = evLive(e);
  const mine = canEvents(s.id) || e.created_by === S.me.id, d = new Date(e.starts_at);
  return `<div class="evcard ${live ? 'live' : ''}" style="--evc:${esc(e.cover_color || '#ff2e9a')}">
    <div class="evdate"><b>${d.getDate()}</b><small>${d.toLocaleDateString('pt-BR', { month:'short' }).replace('.', '')}</small></div>
    <div class="evb"><div class="evwhen">${live ? '<span class="evlive">AO VIVO</span>' : fmtEv(e.starts_at)}${ch ? ` · ${ic('volume', 12)} ${esc(ch.name)}` : ''}</div>
      <b class="evt">${esc(e.title)}</b>${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <div class="evf"><span class="evppl">${[...set].slice(0, 5).map(u => avatar(prof(u), 'xs')).join('')} ${set.size ? set.size + ' com interesse' : 'Ninguém marcou ainda'}</span>
        <span class="grow"></span>
        ${mine ? `<button class="ibtn sm" data-evedit="${e.id}" data-tip="Editar">${ic('edit', 15)}</button><button class="ibtn sm" data-evdel="${e.id}" data-tip="Apagar">${ic('trash', 15)}</button>` : ''}
        ${live && ch ? `<button class="btn sm" data-evjoin="${ch.id}">Entrar</button>` : `<button class="btn sm ${going ? 'sec' : ''}" data-rsvp="${e.id}">${going ? ic('check', 14) + ' Interessado' : ic('bell', 14) + ' Tenho interesse'}</button>`}</div></div></div>`;
}
function eventForm(s, e){
  const voice = (S.channels.get(s.id) || []).filter(c => c.kind === 'voice');
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const def = e ? new Date(e.starts_at) : (() => { const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); return d; })();
  let color = (e && e.cover_color) || EV_COLORS[0];
  modal(`<form id="evF"><div class="mh"><h2>${e ? 'Editar evento' : 'Novo evento'}</h2></div>
    <div class="mc">
      <label class="field"><span>Nome</span><input class="inp" id="evT" maxlength="80" required value="${esc(e ? e.title : '')}" placeholder="Noite do CS"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>Começa</span><input class="inp" type="datetime-local" id="evS" required value="${local(def)}"></label>
        <label class="field"><span>Duração</span><select class="inp" id="evDur">${[[60,'1 hora'],[120,'2 horas'],[180,'3 horas'],[300,'5 horas'],[720,'12 horas']].map(([v, l]) => `<option value="${v}" ${e && e.ends_at && Math.round((new Date(e.ends_at) - new Date(e.starts_at)) / 6e4) === v ? 'selected' : v === 180 && !e ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Onde</span><select class="inp" id="evC"><option value="">Sem canal de voz</option>${voice.map(c => `<option value="${c.id}" ${e && e.channel_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Descrição</span><textarea class="inp" id="evD" rows="3" maxlength="600" placeholder="Quem chegar primeiro escolhe o mapa">${esc(e && e.description || '')}</textarea></label>
      <div class="colors" id="evCol">${EV_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('')}</div>
      <div class="err" id="evE"></div></div>
    <div class="mf"><button type="button" class="btn sec" id="evBack">Voltar</button><button class="btn">${e ? 'Salvar' : 'Criar evento'}</button></div></form>`, m => {
    m.querySelectorAll('#evCol [data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('#evCol [data-c]').forEach(x => x.classList.toggle('on', x === b)); });
    m.querySelector('#evBack').onclick = () => eventsModal(s);
    m.querySelector('#evF').onsubmit = async ev => {
      ev.preventDefault();
      const st = new Date(m.querySelector('#evS').value);
      if(isNaN(st)) return;
      const row = { server_id: s.id, title: m.querySelector('#evT').value.trim(), description: m.querySelector('#evD').value.trim() || null, starts_at: st.toISOString(),
        ends_at: new Date(st.getTime() + (+m.querySelector('#evDur').value) * 6e4).toISOString(), channel_id: m.querySelector('#evC').value || null, cover_color: color };
      const { error } = e ? await App.sb.from('server_events').update(row).eq('id', e.id) : await App.sb.from('server_events').insert(row);
      if(error){ m.querySelector('#evE').textContent = error.message; return; }
      await loadEvents(s.id); renderSidebar(); eventsModal(s);
      if(!e) App.toast('Evento criado.');
    };
  });
}
/* avisos: 10 min antes e na hora, para quem marcou interesse */
const evSeen = new Set(ls.get('telao-evseen', []));
setInterval(() => {
  if(!S.me) return;
  S.events.forEach((list, sid) => list.forEach(e => {
    if(!(S.rsvps.get(e.id) || new Set()).has(S.me.id)) return;
    const t = new Date(e.starts_at).getTime(), now = Date.now(), ch = e.channel_id && findChannel(e.channel_id);
    const fire = (k, msg) => { if(evSeen.has(e.id + k)) return; evSeen.add(e.id + k); ls.set('telao-evseen', [...evSeen].slice(-200)); App.sfx('screen');
      App.toast(msg, false, ch ? { label: 'Entrar', fn: () => joinVoice(ch) } : null); notify('Evento: ' + e.title, msg, null); };
    if(now >= t - 10 * 60e3 && now < t) fire(':10', `“${e.title}” começa em ${Math.max(1, Math.round((t - now) / 60e3))} min.`);
    if(now >= t && now < t + 30 * 60e3) fire(':0', `“${e.title}” começou agora.`);
  }));
}, 30000);
/* =====================================================================
   v6.4: SEGURANÇA · IDADE · CANAIS CONFIGURÁVEIS · FILTRO AUTOMÁTICO DE NUDEZ NA TELA
   ===================================================================== */
const isAdult = p => { if(!p || !p.birthdate) return false; const d = new Date(p.birthdate + 'T00:00:00'), t = new Date(); t.setFullYear(t.getFullYear() - 18); return d <= t; };
const isMod = sid => App.hasPerm(sid, 1) || App.hasPerm(sid, 8) || App.hasPerm(sid, 64);
const chNsfw = c => !!c && (c.nsfw || !!(S.servers.find(s => s.id === c.server_id) || {}).nsfw);

/* ---------- idade ---------- */
// cadastro: data de nascimento obrigatória (fica guardada até a pessoa entrar pela primeira vez)
(() => {
  const reg = $('#regFields'); if(!reg || $('#aBirth')) return;
  reg.insertAdjacentHTML('beforeend', `<label class="field"><span>Data de nascimento</span><input class="inp" id="aBirth" type="date" max="${new Date().toISOString().slice(0, 10)}"></label>`);
  const form = $('#authForm') || reg.closest('form');
  if(form) form.addEventListener('submit', e => {
    if(reg.classList.contains('hidden')) return;
    const v = $('#aBirth').value;
    const min = new Date(); min.setFullYear(min.getFullYear() - 13);
    if(!v){ e.preventDefault(); e.stopImmediatePropagation(); authError('Coloque sua data de nascimento.'); return; }
    if(new Date(v) > min){ e.preventDefault(); e.stopImmediatePropagation(); authError('O Telão é para maiores de 13 anos.'); return; }
    ls.set('telao-birth', v);
  }, true);
})();
async function saveBirthdate(v){
  const { data, error } = await App.sb.rpc('set_birthdate', { p_date: v });
  if(error){ App.toast(error.message, true); return null; }
  const { data: me } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
  if(me){ S.me = me; S.profiles.set(me.id, me); }
  return data;
}
function ageModal(after){
  const max = new Date(); max.setFullYear(max.getFullYear() - 13);
  modal(`<form id="agF"><div class="mh"><h2>Confirme sua idade</h2><p>Precisamos da sua data de nascimento para liberar canais com restrição de idade. Ela não aparece para ninguém e não pode ser trocada depois.</p></div>
    <div class="mc"><label class="field"><span>Data de nascimento</span><input class="inp" type="date" id="agD" required max="${max.toISOString().slice(0, 10)}"></label><div class="err" id="agE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Agora não</button><button class="btn">Confirmar</button></div></form>`, m => {
    m.querySelector('#agF').onsubmit = async e => {
      e.preventDefault();
      const v = m.querySelector('#agD').value; if(!v) return;
      if(!(await confirmBox('Confirmar data', `Sua data de nascimento é <b>${new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')}</b>? Não dá para mudar depois.`, 'Confirmar'))) return;
      const r = await saveBirthdate(v); if(r === null) return;
      closeModal(); after && after(r);
    };
  });
}
App.ageModal = ageModal;

/* canal +18: mostra o aviso no lugar do conteúdo */
const _renderMain = renderMain;
renderMain = function(){
  const r = S.route, c = r.kind === 'server' && r.cid ? findChannel(r.cid) : null;
  if(c && c.kind === 'text' && chNsfw(c) && !(isAdult(S.me) && ls.get('telao-18ok-' + c.id, false))){
    unmountMessages();
    const head = $('#mainHead'), body = $('#mainBody');
    head.innerHTML = `<div class="htitle">${ic('hash', 22)}<b>${esc(c.name)}</b><span class="tag18">+18</span></div>`;
    const adult = isAdult(S.me), known = !!S.me.birthdate;
    body.innerHTML = `<div class="gate18"><div class="g18i">18+</div><h2>Canal com restrição de idade</h2>
      <p>${known && !adult ? 'Você não tem idade para ver este canal.' : 'Este canal pode ter conteúdo para maiores de 18 anos. Para entrar, você precisa ter 18 anos ou mais.'}</p>
      <div class="g18b"><button class="btn sec" id="g18No">Voltar</button>${known && !adult ? '' : `<button class="btn" id="g18Ok">${known ? 'Entendi, continuar' : 'Confirmar minha idade'}</button>`}</div></div>`;
    $('#g18No').onclick = () => { const s = curServer(); const first = (S.channels.get(s.id) || []).find(x => x.kind === 'text' && !chNsfw(x)); go(first ? { kind:'server', sid: s.id, cid: first.id } : { kind:'home', dm:null }); };
    const ok = $('#g18Ok'); if(ok) ok.onclick = () => {
      if(known){ ls.set('telao-18ok-' + c.id, true); renderMain(); }
      else ageModal(adult => { if(adult){ ls.set('telao-18ok-' + c.id, true); } renderMain(); });
    };
    return;
  }
  _renderMain.apply(this, arguments);
  applyComposerRules();
};
/* etiquetas na lista de canais: +18, privado, modo lento, só leitura, limite */
const _renderSidebarS = renderSidebar;
renderSidebar = function(){
  _renderSidebarS.apply(this, arguments);
  document.querySelectorAll('#sbBody .ch[data-cid]').forEach(el => {
    const c = findChannel(el.dataset.cid); if(!c || el.querySelector('.chtags')) return;
    const t = [];
    if(c.nsfw) t.push('<span class="tag18">+18</span>');
    if(c.allowed_roles && c.allowed_roles.length) t.push(`<span class="cht" data-tip="Canal privado">${ic('lock', 13)}</span>`);
    if(c.readonly) t.push(`<span class="cht" data-tip="Só leitura">${ic('eye', 13)}</span>`);
    if(c.slowmode) t.push(`<span class="cht" data-tip="Modo lento: ${fmtSlow(c.slowmode)}">${ic('clock', 13)}</span>`);
    if(c.kind === 'voice' && c.user_limit){ const n = voiceUsers(c).length; t.push(`<span class="chlim">${n}/${c.user_limit}</span>`); }
    if(t.length) el.querySelector('.nm').insertAdjacentHTML('afterend', `<span class="chtags">${t.join('')}</span>`);
  });
};
const fmtSlow = s => s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h';

/* ---------- caixa de mensagem: só leitura, modo lento, sem arquivos ---------- */
const lastSent = new Map();
function applyComposerRules(){
  const ta = $('#cmp'); if(!ta) return;
  const c = findChannel(M.cid); if(!c || !c.server_id) return;
  const mod = isMod(c.server_id), form = $('#cmpF');
  const info = $('#cmpRule') || (() => { const d = document.createElement('div'); d.id = 'cmpRule'; d.className = 'cmprule'; form && form.parentNode.insertBefore(d, form); return d; })();
  const bits = [];
  if(c.readonly && !mod){ ta.disabled = true; ta.placeholder = 'Este canal é só para leitura.'; bits.push(`${ic('eye', 13)} Só leitura`); }
  if(c.slowmode) bits.push(`${ic('clock', 13)} Modo lento: ${fmtSlow(c.slowmode)}${mod ? ' (moderadores não têm limite)' : ''}`);
  if(c.no_links) bits.push('Sem links');
  if(c.no_media){ bits.push('Sem arquivos'); const at = form && form.querySelector('#attBtn, [data-attach], .attbtn'); if(at && !mod) at.style.display = 'none'; }
  info.innerHTML = bits.join('<span class="dotsep">·</span>');
  info.classList.toggle('hidden', !bits.length);
}
// contagem regressiva do modo lento depois de enviar
document.addEventListener('submit', e => {
  if(e.target.id !== 'cmpF') return;
  const c = findChannel(M.cid); if(!c || !c.slowmode || isMod(c.server_id)) return;
  const until = Date.now() + c.slowmode * 1000; lastSent.set(c.id, until);
  const ta = $('#cmp');
  const tick = () => { const left = Math.ceil((until - Date.now()) / 1000); if(!$('#cmp') || M.cid !== c.id) return;
    if(left > 0){ ta.disabled = true; ta.placeholder = `Modo lento: espere ${left} s`; setTimeout(tick, 500); } else { ta.disabled = false; ta.placeholder = `Mensagem para #${c.name}`; } };
  setTimeout(tick, 400);
}, true);

/* ---------- configurações do canal (texto e voz) ---------- */
editChannelModal = function(c){
  const s = S.servers.find(x => x.id === c.server_id);
  const cats = [...new Set((S.channels.get(s.id) || []).map(x => x.category).filter(Boolean))];
  const roles = (S.roles.get(s.id) || []).filter(r => r.name !== '@everyone');
  const allowed = new Set(c.allowed_roles || []);
  const voice = c.kind === 'voice';
  const sel = (id, opts, v) => `<select class="inp" id="${id}">${opts.map(([val, l]) => `<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  modal(`<form id="ecF" class="chset"><div class="mh"><h2>${ic(voice ? 'volume' : 'hash', 22)} Configurar canal</h2></div>
    <div class="mc">
      <div class="tabs2" id="ecTabs"><button type="button" data-t="geral" class="on">Geral</button><button type="button" data-t="regras">${voice ? 'Chamada' : 'Regras'}</button><button type="button" data-t="acesso">Acesso</button></div>
      <div data-p="geral">
        <label class="field"><span>Nome</span><input class="inp" id="ecN" maxlength="40" value="${esc(c.name)}" required></label>
        ${voice ? '' : `<label class="field"><span>Tópico</span><textarea class="inp" id="ecT" maxlength="300" rows="3" placeholder="Diga para que serve este canal">${esc(c.topic || '')}</textarea></label>`}
        <label class="field"><span>Categoria</span><input class="inp" id="ecC" maxlength="40" list="ecCats" value="${esc(c.category || '')}" placeholder="Sem categoria"><datalist id="ecCats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        ${row('Restrição de idade (+18)', 'Só quem confirmou ter 18 anos ou mais pode entrar. Quem não tem idade vê um aviso.', toggle('ecNs', c.nsfw))}
      </div>
      <div data-p="regras" class="hidden">
        ${voice ? `
          <div class="grid2">
            <label class="field"><span>Limite de pessoas</span>${sel('ecLim', [[0, 'Sem limite'], ...[2,3,4,5,6,8,10,15,20,25,50,99].map(n => [n, n + ' pessoas'])], c.user_limit || 0)}</label>
            <label class="field"><span>Qualidade do áudio</span>${sel('ecBr', [[64,'64 kbps (economia)'],[96,'96 kbps (padrão)'],[128,'128 kbps (alta)'],[256,'256 kbps (música)'],[384,'384 kbps (estúdio)']], c.bitrate || 96)}</label>
          </div>
          <label class="field"><span>Qualidade das câmeras e telas</span>${sel('ecVq', [['auto','Automática'],['720p','Até 720p (economiza internet)'],['1080p','Até 1080p']], c.video_quality || 'auto')}</label>
          ${row('Só “pressionar para falar”', 'Todo mundo precisa segurar a tecla para falar. Bom para canais cheios.', toggle('ecPtt', c.ptt_only))}
          ${row('Bloquear câmera', 'Ninguém liga a câmera neste canal (moderadores sim).', toggle('ecNoCam', c.no_camera))}
          ${row('Bloquear compartilhar tela', 'Ninguém compartilha a tela neste canal (moderadores sim).', toggle('ecNoScr', c.no_screen))}`
        : `
          <label class="field"><span>Modo lento</span>${sel('ecSlow', [[0,'Desligado'],[5,'5 segundos'],[10,'10 segundos'],[30,'30 segundos'],[60,'1 minuto'],[300,'5 minutos'],[900,'15 minutos'],[3600,'1 hora'],[21600,'6 horas']], c.slowmode || 0)}</label>
          <small class="mut" style="display:block;margin:-6px 0 12px">Cada pessoa espera esse tempo entre uma mensagem e outra. Moderadores não têm limite.</small>
          ${row('Só leitura (avisos)', 'Só quem gerencia canais ou mensagens pode escrever.', toggle('ecRo', c.readonly))}
          ${row('Bloquear links', 'Mensagens com links são recusadas.', toggle('ecNoL', c.no_links))}
          ${row('Bloquear arquivos e imagens', '', toggle('ecNoM', c.no_media))}`}
      </div>
      <div data-p="acesso" class="hidden">
        ${row('Canal privado', 'Só os cargos escolhidos (e quem administra) veem e entram neste canal.', toggle('ecPriv', allowed.size > 0))}
        <div id="ecRoles" class="rolepick ${allowed.size ? '' : 'hidden'}">${roles.length ? roles.map(r => `<label class="rp"><input type="checkbox" value="${r.id}" ${allowed.has(r.id) ? 'checked' : ''}><i style="background:${esc(r.color || '#888')}"></i>${esc(r.name)}</label>`).join('') : '<p class="mut small">Crie cargos em Configurações do servidor → Cargos.</p>'}</div>
      </div>
    </div>
    <div class="mf" style="justify-content:space-between"><button type="button" class="btn red" id="ecDel">${ic('trash',16)} Apagar</button><span style="display:flex;gap:10px"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></span></div></form>`, m => {
    const q = x => m.querySelector(x);
    m.querySelectorAll('#ecTabs [data-t]').forEach(b => b.onclick = () => {
      m.querySelectorAll('#ecTabs [data-t]').forEach(x => x.classList.toggle('on', x === b));
      m.querySelectorAll('[data-p]').forEach(p => p.classList.toggle('hidden', p.dataset.p !== b.dataset.t));
    });
    q('#ecPriv').onchange = e => q('#ecRoles').classList.toggle('hidden', !e.target.checked);
    q('#ecDel').onclick = async () => {
      if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${voice ? '' : 'Todas as mensagens serão perdidas.'}`, 'Apagar canal'))) return;
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true); else closeModal();
    };
    q('#ecF').onsubmit = async e => {
      e.preventDefault();
      let name = q('#ecN').value.trim(); if(!voice) name = name.toLowerCase().replace(/\s+/g, '-');
      const roleIds = q('#ecPriv').checked ? [...m.querySelectorAll('#ecRoles input:checked')].map(x => x.value) : [];
      if(q('#ecPriv').checked && !roleIds.length){ App.toast('Escolha pelo menos um cargo para o canal privado.', true); return; }
      const up = { name, category: q('#ecC').value.trim() || null, nsfw: q('#ecNs').checked, allowed_roles: roleIds.length ? roleIds : null };
      if(voice) Object.assign(up, { user_limit: +q('#ecLim').value, bitrate: +q('#ecBr').value, video_quality: q('#ecVq').value, ptt_only: q('#ecPtt').checked, no_camera: q('#ecNoCam').checked, no_screen: q('#ecNoScr').checked });
      else Object.assign(up, { topic: q('#ecT').value.trim() || null, slowmode: +q('#ecSlow').value, readonly: q('#ecRo').checked, no_links: q('#ecNoL').checked, no_media: q('#ecNoM').checked });
      const { error } = await App.sb.from('channels').update(up).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); renderMain(); App.toast('Canal atualizado');
    };
  });
};

/* ---------- regras da chamada ---------- */
const _joinVoiceS = joinVoice;
joinVoice = async function(ch){
  if(ch && ch.server_id){
    const mod = isMod(ch.server_id);
    if(chNsfw(ch) && !isAdult(S.me)){
      if(!S.me.birthdate) ageModal(ok => ok ? joinVoice(ch) : App.toast('Esta chamada é só para maiores de 18 anos.', true));
      else App.toast('Esta chamada é só para maiores de 18 anos.', true);
      return;
    }
    if(ch.user_limit && !mod && !(Voice.channel && Voice.channel.id === ch.id) && voiceUsers(ch).length >= ch.user_limit){ App.toast(`A chamada está cheia (${ch.user_limit} pessoas).`, true); return; }
  }
  const r = await _joinVoiceS.apply(this, arguments);
  applyCallRules();
  return r;
};
function applyCallRules(){
  const ch = Voice.channel; if(!ch) return;
  const P = App.prefs;
  if(ch.ptt_only && !isMod(ch.server_id) && P.mode !== 'ptt'){ S._modeBefore = P.mode; P.mode = 'ptt'; Voice.applyMicState(); App.toast(`Neste canal é preciso segurar ${keyLabel(P.pttKey)} para falar.`); }
}
const _leaveVoiceS = leaveVoice;
leaveVoice = async function(){ if(S._modeBefore){ App.prefs.mode = S._modeBefore; S._modeBefore = null; } return _leaveVoiceS.apply(this, arguments); };
const _startScreen = Voice.startScreen.bind(Voice), _startCamera = Voice.startCamera.bind(Voice);
const blockedNow = () => S.me.share_block_until && new Date(S.me.share_block_until) > new Date();
Voice.startScreen = async function(){
  const ch = this.channel;
  if(blockedNow()){ App.toast(`Você não pode compartilhar a tela até ${new Date(S.me.share_block_until).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}, por causa de conteúdo impróprio detectado.`, true); return; }
  if(ch && ch.no_screen && ch.server_id && !isMod(ch.server_id)){ App.toast('Compartilhar a tela está bloqueado neste canal.', true); return; }
  const r = await _startScreen(...arguments);
  if(this.screenStream) Guard.watch('screen');
  return r;
};
Voice.startCamera = async function(){
  const ch = this.channel;
  if(blockedNow()){ App.toast('Sua câmera e sua tela estão bloqueadas por 24 h por conteúdo impróprio.', true); return; }
  if(ch && ch.no_camera && ch.server_id && !isMod(ch.server_id)){ App.toast('A câmera está bloqueada neste canal.', true); return; }
  const r = await _startCamera(...arguments);
  if(this.camStream) Guard.watch('cam');
  return r;
};
/* qualidade de vídeo do canal */
const _clampS = clampScreen;
clampScreen = function(st){
  const r = _clampS(st), q = Voice.channel && Voice.channel.video_quality;
  if(q === '720p' && r.h > 720) return { ...r, w: 1280, h: 720, bitrate: Math.min(r.bitrate, 3500000) };
  if(q === '1080p' && r.h > 1080) return { ...r, w: 1920, h: 1080, bitrate: Math.min(r.bitrate, 8000000) };
  return r;
};

/* ---------- filtro automático: nudez/pornografia na tela ou na câmera ----------
   Roda no próprio aparelho de quem transmite (nada é enviado para fora). Modelo aberto NSFWJS (MobileNetV2). */
const Guard = {
  model: null, loading: null, timers: {}, hits: {},
  async load(){
    if(this.model) return this.model;
    if(!this.loading) this.loading = (async () => {
      if(!window.tf){
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      }
      try{ await tf.setBackend('webgl'); }catch(e){}
      await tf.ready(); tf.enableProdMode();
      this.model = await tf.loadLayersModel('/models/nsfw/model.json');
      tf.tidy(() => this.model.predict(tf.zeros([1, 224, 224, 3])));
      return this.model;
    })().catch(e => { this.loading = null; throw e; });
    return this.loading;
  },
  async score(video){
    const m = await this.load();
    if(!video.videoWidth) return null;
    const c = this._c || (this._c = document.createElement('canvas')); c.width = 224; c.height = 224;
    const g = c.getContext('2d', { willReadFrequently: true });
    // olha a imagem inteira e também o centro (onde costuma estar o conteúdo)
    const out = [];
    for(const crop of [[0, 0, 1], [0.2, 0.15, 0.6]]){
      const [x, y, s] = crop, w = video.videoWidth, h = video.videoHeight, side = Math.min(w, h) * (s === 1 ? 1 : s * 1.4);
      if(s === 1) g.drawImage(video, 0, 0, 224, 224); else g.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 224, 224);
      const p = tf.tidy(() => m.predict(tf.browser.fromPixels(c).toFloat().div(255).reshape([1, 224, 224, 3])).dataSync());
      out.push(p);
    }
    // classes: 0 desenho · 1 hentai · 2 neutro · 3 pornô · 4 sensual
    const worst = out.reduce((a, p) => Math.max(a, p[3] + p[1] * 0.9), 0);
    return worst;
  },
  watch(kind){
    clearInterval(this.timers[kind]); this.hits[kind] = 0;
    const stream = kind === 'screen' ? Voice.screenStream : Voice.camStream;
    if(!stream) return;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; v.play().catch(() => {});
    const check = async () => {
      if(App.perf === 'game' && (this._skip = !this._skip)) return;   // modo jogo: confere a cada 5 s
      const cur = kind === 'screen' ? Voice.screenStream : Voice.camStream;
      if(!cur || cur !== stream){ clearInterval(this.timers[kind]); v.srcObject = null; return; }
      let sc = null;
      try{ sc = await this.score(v); }catch(e){ return; }
      if(sc == null) return;
      this.hits[kind] = sc > 0.82 ? this.hits[kind] + 1 : sc > 0.6 ? this.hits[kind] : 0;
      if(sc > 0.95 || this.hits[kind] >= 2) this.trip(kind, sc);
    };
    this.load().then(() => { check(); this.timers[kind] = setInterval(check, 2500); }).catch(() => {});
  },
  async trip(kind, sc){
    clearInterval(this.timers[kind]);
    if(kind === 'screen') Voice.stopScreen(); else Voice.stopCamera();
    renderStage && renderStage(); renderSidebar();
    let until = null;
    try{ const { data } = await App.sb.rpc('report_nsfw', { p_kind: kind === 'screen' ? 'screen_nsfw' : 'camera_nsfw', p_channel: Voice.channel ? Voice.channel.id : null, p_score: Math.round(sc * 100) / 100 }); until = data; }catch(e){}
    if(until){ S.me.share_block_until = until; }
    modal(`<div class="mh"><h2>${kind === 'screen' ? 'Compartilhamento de tela parado' : 'Câmera desligada'}</h2>
      <p>O Telão detectou possível nudez ou pornografia na sua ${kind === 'screen' ? 'tela' : 'câmera'} e parou a transmissão automaticamente.</p></div>
      <div class="mc"><div class="warnbox">${until ? `Como isso aconteceu de novo, você fica <b>sem compartilhar tela e câmera até ${new Date(until).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b>.` : 'Este é um aviso. Se acontecer de novo nas próximas 24 horas, você fica 24 horas sem poder compartilhar tela e câmera.'}</div>
      <p class="mut small" style="margin-top:10px">A análise é automática e acontece só no seu aparelho. Se foi um engano, é só compartilhar de novo.</p></div>
      <div class="mf"><button class="btn" data-close>Entendi</button></div>`);
  },
};
App.Guard = Guard;

/* ---------- segurança da conta: verificação em duas etapas, sair de tudo ---------- */
async function secSecurity(box, back){
  box.innerHTML = `${back}<h2>Segurança</h2><div class="spin" style="margin:30px auto"></div>`;
  let factors = [];
  try{ const { data } = await App.sb.auth.mfa.listFactors(); factors = (data && data.totp || []).filter(f => f.status === 'verified'); }catch(e){}
  if(!SET || SET.sec !== 'security') return;
  const bd = S.me.birthdate;
  box.innerHTML = `${back}<h2>Segurança</h2>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('shield', 24)}</span><div class="t"><b>Verificação em duas etapas</b>
      <small>${factors.length ? 'Ativada. Ao entrar, além da senha, o Telão pede o código do seu app autenticador.' : 'Proteja sua conta: além da senha, pede um código de 6 números do Google Authenticator, Microsoft Authenticator ou Authy.'}</small></div>
      ${factors.length ? '<button class="btn sec sm" id="mfaOff">Desativar</button>' : '<button class="btn sm" id="mfaOn">Ativar</button>'}</div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('logout', 22)}</span><div class="t"><b>Sair de todos os aparelhos</b><small>Desconecta sua conta em todos os navegadores, celulares e no app do Windows. Use se emprestou o PC ou acha que alguém entrou.</small></div><button class="btn sec sm" id="outAll">Sair de tudo</button></div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('calendar', 22)}</span><div class="t"><b>Idade</b><small>${bd ? `Data de nascimento confirmada${isAdult(S.me) ? ' · pode entrar em canais +18' : ' · canais +18 ficam bloqueados'}. Não aparece para ninguém.` : 'Ainda não confirmada. Ela é pedida para entrar em canais com restrição de idade.'}</small></div>${bd ? '' : '<button class="btn sec sm" id="ageSet">Confirmar</button>'}</div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('link', 22)}</span><div class="t"><b>Aviso antes de abrir links</b><small>Mostra para qual site o link leva antes de sair do Telão, e alerta sobre links suspeitos.</small></div>${toggle('linkWarn', P.linkWarn !== false)}</div></div>
    <p class="mut small" style="margin-top:14px">Dicas: nunca passe seu código de 6 números para ninguém (nem para “admin do Telão”). O Telão nunca pede sua senha por mensagem.</p>`;
  const $b = q => box.querySelector(q);
  const on = $b('#mfaOn'); if(on) on.onclick = mfaEnroll;
  const off = $b('#mfaOff'); if(off) off.onclick = async () => {
    if(!(await confirmBox('Desativar verificação', 'Sua conta volta a pedir só a senha. Desativar mesmo?', 'Desativar'))) return;
    for(const f of factors){ const { error } = await App.sb.auth.mfa.unenroll({ factorId: f.id }); if(error){ App.toast(error.message, true); return; } }
    App.toast('Verificação em duas etapas desativada.'); renderSettings();
  };
  $b('#outAll').onclick = async () => { if(!(await confirmBox('Sair de tudo', 'Desconectar sua conta de todos os aparelhos, inclusive este?', 'Sair de tudo'))) return; await App.sb.auth.signOut({ scope: 'global' }); location.reload(); };
  const ag = $b('#ageSet'); if(ag) ag.onclick = () => ageModal(() => renderSettings());
  $b('#linkWarn').onchange = e => { P.linkWarn = e.target.checked; savePrefs(); };
}
async function mfaEnroll(){
  const { data, error } = await App.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Telão ' + new Date().toLocaleDateString('pt-BR') });
  if(error){ App.toast(/disabled|not enabled/i.test(error.message) ? 'A verificação em duas etapas está desligada no Supabase (Authentication → Multi-Factor). Peça para o admin ligar.' : error.message, true); return; }
  const qr = data.totp.qr_code, secret = data.totp.secret, fid = data.id;
  modal(`<form id="mfF"><div class="mh"><h2>Ativar verificação em duas etapas</h2><p>1. Abra seu app autenticador e leia o QR code. 2. Digite o código de 6 números que aparecer.</p></div>
    <div class="mc" style="text-align:center"><img src="${qr.startsWith('data:') ? qr : 'data:image/svg+xml;utf8,' + encodeURIComponent(qr)}" alt="QR code" style="width:190px;height:190px;background:#fff;border-radius:10px;padding:8px">
      <p class="mut small" style="margin:8px 0 14px">Não consegue ler? Digite a chave: <code data-noi18n>${esc(secret)}</code></p>
      <input class="inp code6" id="mfC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required><div class="err" id="mfE"></div></div>
    <div class="mf"><button type="button" class="btn sec" id="mfX">Cancelar</button><button class="btn">Ativar</button></div></form>`, m => {
    m.querySelector('#mfX').onclick = async () => { await App.sb.auth.mfa.unenroll({ factorId: fid }).catch(() => {}); closeModal(); };
    m.querySelector('#mfC').focus();
    m.querySelector('#mfF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.mfa.challengeAndVerify({ factorId: fid, code: m.querySelector('#mfC').value.trim() });
      if(error){ m.querySelector('#mfE').textContent = 'Código errado. Confira a hora do celular e tente de novo.'; return; }
      closeModal(); App.toast('Verificação em duas etapas ativada.'); renderSettings();
    };
  });
}
/* ao entrar: se a conta tem verificação, pede o código antes de abrir o Telão */
const _start = start;
start = async function(session){
  try{
    const { data } = await App.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'){
      const ok = await mfaPrompt();
      if(!ok){ await App.sb.auth.signOut(); location.reload(); return; }
    }
  }catch(e){}
  await _start.apply(this, arguments);
  const b = ls.get('telao-birth', null);
  if(b && S.me && !S.me.birthdate){ await saveBirthdate(b); }
  ls.set('telao-birth', null);
};
function mfaPrompt(){
  return new Promise(async res => {
    const { data } = await App.sb.auth.mfa.listFactors();
    const f = data && (data.totp || []).find(x => x.status === 'verified');
    if(!f) return res(true);
    const el = document.createElement('div'); el.className = 'confirmed';
    el.innerHTML = `<form class="cbox2" id="mpF"><div class="cicon">${ic('shield', 40)}</div><h1 style="font-family:var(--hf);text-shadow:none;color:var(--txt)">Código de verificação</h1>
      <p>Abra seu app autenticador e digite o código de 6 números do Telão.</p>
      <input class="inp code6" id="mpC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
      <div class="err" id="mpE" style="margin:8px 0"></div><button class="btn" style="width:100%">Entrar</button><button type="button" class="btn sec" id="mpX" style="width:100%;margin-top:8px">Sair</button></form>`;
    document.body.appendChild(el); el.querySelector('#mpC').focus();
    el.querySelector('#mpX').onclick = () => { el.remove(); res(false); };
    el.querySelector('#mpF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: el.querySelector('#mpC').value.trim() });
      if(error){ el.querySelector('#mpE').textContent = 'Código errado. Tente de novo.'; return; }
      el.remove(); res(true);
    };
  });
}

/* ---------- aviso antes de abrir links de fora ---------- */
const trusted = new Set(ls.get('telao-trusted', ['youtube.com','youtu.be','spotify.com','open.spotify.com','twitch.tv','github.com','google.com','instagram.com','x.com','twitter.com','tiktok.com','last.fm','steamcommunity.com','store.steampowered.com']));
function suspicious(u){
  const h = u.hostname;
  return /xn--/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /(bit\.ly|tinyurl|cutt\.ly|is\.gd|t\.co|shorturl)/.test(h)
    || /(disc[o0]rd|nitro|steam|free|gift|premium).*(gift|free|nitro|claim|promo)|(gift|nitro)-?(free|claim)/i.test(h) || /@/.test(u.href.split('?')[0].replace(/^https?:\/\//, ''));
}
document.addEventListener('click', async e => {
  const a = e.target.closest('.ct a[href], .emb a[href], .bub a[href]'); if(!a || P.linkWarn === false) return;
  let u; try{ u = new URL(a.href, location.href); }catch(_){ return; }
  if(u.origin === location.origin || !/^https?:$/.test(u.protocol)) return;
  const host = u.hostname.replace(/^www\./, ''), sus = suspicious(u);
  if(!sus && [...trusted].some(t => host === t || host.endsWith('.' + t))) return;
  e.preventDefault(); e.stopPropagation();
  modal(`<div class="mh"><h2>${sus ? 'Cuidado com este link' : 'Saindo do Telão'}</h2><p>${sus ? 'Este link parece suspeito (pode ser golpe de “presente grátis”, link encurtado ou site disfarçado). Só abra se você confia em quem mandou.' : 'Este link leva para um site fora do Telão:'}</p></div>
    <div class="mc"><div class="linkbox ${sus ? 'sus' : ''}">${esc(u.href.length > 140 ? u.href.slice(0, 140) + '…' : u.href)}</div>
    ${sus ? '' : `<label class="rp" style="margin-top:12px"><input type="checkbox" id="lkT"> Confiar em <b>${esc(host)}</b> daqui pra frente</label>`}</div>
    <div class="mf"><button class="btn sec" data-close>Voltar</button><button class="btn ${sus ? 'red' : ''}" id="lkGo">Abrir mesmo assim</button></div>`, m => {
    m.querySelector('#lkGo').onclick = () => {
      const t = m.querySelector('#lkT'); if(t && t.checked){ trusted.add(host); ls.set('telao-trusted', [...trusted]); }
      closeModal(); window.open(u.href, '_blank', 'noopener');
    };
  });
}, true);

/* ---------- configurações do servidor: segurança ---------- */
async function secSrvSafety(box, back){
  const s = SET.server, admin = App.hasPerm(s.id, 2);
  box.innerHTML = `${back}<h2>Segurança do servidor</h2>
    ${row('Servidor +18', 'Todos os canais exigem ter 18 anos ou mais. Quem não tem idade vê um aviso ao entrar.', toggle('ssNs', s.nsfw, !admin))}
    <h3>Nível de verificação</h3><p class="mut small">Quem não cumprir o nível consegue ler, mas não consegue mandar mensagem.</p>
    <div class="vlevels">${[[0,'Nenhum','Qualquer membro pode falar.'],[1,'Baixo','A conta precisa existir há mais de 5 minutos.'],[2,'Médio','Também precisa estar no servidor há mais de 10 minutos.'],[3,'Alto','Também precisa ter a verificação em duas etapas ligada.']].map(([v, l, d]) => `<button class="vl ${(s.verify_level || 0) === v ? 'on' : ''}" data-vl="${v}" ${admin ? '' : 'disabled'}><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    <h3>Filtro automático de conteúdo</h3>
    <p class="mut small">Telas e câmeras com nudez ou pornografia são paradas automaticamente, em qualquer canal. Quem for pego duas vezes em 24 horas fica 24 horas sem transmitir.</p>
    <div id="ssEv" class="mut small">Carregando ocorrências…</div>`;
  const $b = q => box.querySelector(q);
  const upd = async v => { const { error } = await App.sb.from('servers').update(v).eq('id', s.id); if(error){ App.toast(error.message, true); return; } await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; renderSettings(); renderSidebar(); };
  $b('#ssNs').onchange = e => upd({ nsfw: e.target.checked });
  box.querySelectorAll('[data-vl]').forEach(b => b.onclick = () => upd({ verify_level: +b.dataset.vl }));
  const { data } = await App.sb.from('safety_events').select('*').eq('server_id', s.id).order('created_at', { ascending: false }).limit(20);
  await ensureProfiles((data || []).map(x => x.user_id));
  const el = $b('#ssEv'); if(!el) return;
  el.innerHTML = (data || []).length ? `<div class="evlog">${data.map(x => `<div>${avatar(prof(x.user_id), 'xs')} <b>${esc(prof(x.user_id).display_name)}</b> · ${x.kind === 'screen_nsfw' ? 'tela parada' : 'câmera desligada'} · ${new Date(x.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>`).join('')}</div>` : 'Nenhuma ocorrência.';
}
/* =====================================================================
   v6.5: SOLICITAÇÕES DE MENSAGEM · COMUNIDADES · TAGS DE SERVIDOR · AVISOS DO TELÃO · EMOJIS DE SERVIDOR
   ===================================================================== */

/* ---------- solicitações de mensagem ---------- */
S.dmReq = [];
const _loadDms = loadDms;
loadDms = async function(){
  await _loadDms.apply(this, arguments);
  const all = S.dms;
  const before = new Set(S.dmReq.map(d => d.id));
  S.dmReq = all.filter(d => d.dm_status === 'pending' && d.dm_requester && d.dm_requester !== S.me.id);
  S.dms = all.filter(d => !(d.dm_status === 'pending' && d.dm_requester && d.dm_requester !== S.me.id));
  const novo = S.dmReq.find(d => !before.has(d.id));
  if(novo && S._dmReqInit) App.toast(`${prof(novo.dm_requester).display_name} quer conversar com você.`, false, { label: 'Ver', fn: requestsModal });
  S._dmReqInit = true;
};
const _renderSidebarR = renderSidebar;
renderSidebar = function(){
  _renderSidebarR.apply(this, arguments);
  if(S.route.kind !== 'home') return;
  const fr = $('#sbFriends'); if(!fr || $('#sbReq')) return;
  if(!S.dmReq.length) return;
  fr.insertAdjacentHTML('afterend', `<div class="ch big" id="sbReq"><span class="ic">${ic('inbox', 20)}</span><span class="nm">Solicitações</span><span class="pill">${S.dmReq.length}</span></div>`);
  $('#sbReq').onclick = requestsModal;
};
async function requestsModal(){
  const list = S.dmReq;
  const prev = {};
  await Promise.all(list.map(async d => {
    const { data } = await App.sb.from('messages').select('content, attachments, created_at').eq('channel_id', d.id).order('created_at', { ascending: false }).limit(3);
    prev[d.id] = (data || []).reverse();
  }));
  modal(`<div class="mh"><h2>Solicitações de mensagem</h2><p>Pessoas que não são suas amigas e querem conversar. Elas não sabem se você viu até você aceitar.</p></div>
    <div class="mc"><div class="reqlist">${list.map(d => { const p = prof(d.dm_requester); return `<div class="reqc">
      <div class="reqh">${avatar(p, '', true)}<div class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></div>
      <div class="reqm">${(prev[d.id] || []).map(m => `<div>${m.content ? richText(m.content) : '<i>enviou um anexo</i>'}</div>`).join('') || '<i class="mut">Ainda não mandou nada.</i>'}</div>
      <div class="reqb"><button class="btn sec sm" data-rq="${d.id}" data-ok="0">Ignorar</button><button class="btn sm" data-rq="${d.id}" data-ok="1">Aceitar</button></div></div>`; }).join('') || '<div class="empty">Nenhuma solicitação.</div>'}</div>
      <p class="mut small" style="margin-top:12px">Quer receber menos? Configurações → Privacidade → Quem pode me mandar mensagem.</p></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelectorAll('[data-rq]').forEach(b => b.onclick = async () => {
      const accept = b.dataset.ok === '1';
      const { error } = await App.sb.rpc('answer_dm_request', { p_channel: b.dataset.rq, p_accept: accept });
      if(error){ App.toast(error.message, true); return; }
      await loadDms(); renderSidebar();
      if(accept){ closeModal(); go({ kind: 'home', dm: b.dataset.rq }); } else if(S.dmReq.length) requestsModal(); else closeModal();
    });
  });
}
App.requestsModal = requestsModal;
// quem mandou vê um aviso no topo da conversa
const _renderMainR = renderMain;
renderMain = function(){
  _renderMainR.apply(this, arguments);
  const r = S.route; if(r.kind !== 'home' || !r.dm) return;
  const d = S.dms.find(x => x.id === r.dm);
  if(d && d.dm_status === 'pending' && d.dm_requester === S.me.id && !$('#reqBanner')){
    const body = $('#mainBody'); if(body) body.insertAdjacentHTML('afterbegin', `<div class="reqbanner" id="reqBanner">${ic('clock', 15)} Esta conversa está como <b>solicitação</b>: ${esc(prof(dmOther(d)).display_name)} vê suas mensagens quando aceitar.</div>`);
  }
};

/* ---------- privacidade ---------- */
function secPrivacy(box, back){
  const v = S.me.dm_privacy || 'servers';
  box.innerHTML = `${back}<h2>Privacidade</h2>
    <h3>Quem pode me mandar mensagem</h3>
    <div class="vlevels">${[['all','Qualquer pessoa','Quem não é amigo cai em Solicitações de mensagem.'],['servers','Quem está num servidor comigo','O padrão. Quem não é amigo cai em Solicitações.'],['friends','Só amigos','Ninguém mais consegue começar uma conversa com você.']].map(([k, l, d]) => `<button class="vl ${v === k ? 'on' : ''}" data-dmp="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    <p class="mut small">Amigos sempre conseguem te mandar mensagem. Mensagens de quem não é amigo não tocam notificação.</p>`;
  box.querySelectorAll('[data-dmp]').forEach(b => b.onclick = async () => {
    const { data, error } = await App.sb.from('profiles').update({ dm_privacy: b.dataset.dmp }).eq('id', S.me.id).select().single();
    if(error){ App.toast(error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data); renderSettings();
  });
}

/* ---------- comunidades ---------- */
const COMMUNITY_TAGS = ['Jogos','Música','Anime','Estudos','Tecnologia','Memes','Arte','Esportes','Filmes e séries','Amizade','Programação','Brasil'];
const COMMUNITY_SVG = s => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" class="commi"><circle cx="12" cy="12" r="11" fill="var(--lime)"/><path d="M8.2 11.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm7.6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4.8 16.5c.6-2.1 1.9-3.3 3.4-3.3s2.8 1.2 3.4 3.3M12.4 16.5c.6-2.1 1.9-3.3 3.4-3.3s2.8 1.2 3.4 3.3" stroke="#111" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
App.COMMUNITY_SVG = COMMUNITY_SVG;
// selo de comunidade no topo do servidor e no ícone da barra
const _renderSidebarC = renderSidebar;
renderSidebar = function(){
  _renderSidebarC.apply(this, arguments);
  const s = S.route.kind === 'server' ? curServer() : null;
  const t = s && s.is_public && $('#sbHead .hero-t b');
  if(t && !t.querySelector('.commi')) t.insertAdjacentHTML('beforeend', ` <span data-tip="Servidor da comunidade" data-tipsub="aparece em Explorar">${COMMUNITY_SVG(15)}</span>`);
};
const _renderRailC = renderRail;
renderRail = function(){
  _renderRailC.apply(this, arguments);
  S.servers.filter(s => s.is_public).forEach(s => { const el = document.querySelector(`#rail [data-sid="${s.id}"]`); if(el && !el.querySelector('.railcomm')) el.insertAdjacentHTML('beforeend', `<span class="railcomm">${COMMUNITY_SVG(14)}</span>`); });
  const add = $('#rAdd');
  if(add && !$('#rExplore')){
    add.insertAdjacentHTML('afterend', `<button class="ricon add" id="rExplore" data-tip="Explorar comunidades" data-tipside="r">${ic('globe', 22)}</button>`);
    $('#rExplore').onclick = openExplore;
  }
  const home = $('#rHome');
  if(home && !$('#rBell')){
    home.insertAdjacentHTML('afterend', `<button class="ricon" id="rBell" data-tip="Novidades do Telão" data-tipside="r">${ic('bell', 21)}<span class="badge dotb hidden" id="rBellDot"></span></button>`);
    $('#rBell').onclick = noticesPanel;
    updateBellDot();
  }
};
async function openExplore(){
  let q = '', tag = null;
  const el = document.createElement('div'); el.className = 'explore'; el.id = 'explore';
  el.innerHTML = `<div class="exbox"><div class="exhead"><div><h1>Explorar comunidades</h1><p>Servidores abertos para qualquer pessoa do Telão entrar.</p></div><button class="ibtn" id="exX" data-tip="Fechar">${ic('x', 20)}</button></div>
    <div class="exsearch">${ic('search', 18)}<input id="exQ" placeholder="Procurar comunidade" autocomplete="off"></div>
    <div class="chips" id="exTags"><button data-tag="" class="on">Todas</button>${COMMUNITY_TAGS.map(t => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div class="exgrid" id="exGrid"><div class="spin" style="margin:40px auto"></div></div></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#exX').onclick = close; el.onclick = e => { if(e.target === el) close(); };
  document.addEventListener('keydown', function esc_(e){ if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc_); } });
  const load = async () => {
    const { data, error } = await App.sb.rpc('discover_servers', { p_q: q || null, p_tag: tag });
    const g = el.querySelector('#exGrid'); if(!g) return;
    if(error){ g.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
    g.innerHTML = (data || []).map(s => `<div class="excard" style="--sc:${esc(s.accent || s.icon_color || '#2a2b34')}">
      <div class="exban" ${s.banner_url ? `style="background-image:url('${esc(s.banner_url)}')"` : ''}></div>
      <div class="exic">${s.icon_url ? `<img src="${esc(s.icon_url)}" alt="">` : `<span>${esc(initials({ display_name: s.name }))}</span>`}</div>
      <div class="exb"><b>${esc(s.name)} ${COMMUNITY_SVG(14)}${s.nsfw ? '<span class="tag18">+18</span>' : ''}</b>
        <p>${esc(s.description || 'Sem descrição.')}</p>
        <div class="exmeta"><span>${ic('users', 13)} ${s.members} ${s.members == 1 ? 'membro' : 'membros'}</span>${s.boosts ? `<span>${BOOST_SVG(12)} ${s.boosts}</span>` : ''}${(s.topic_tags || []).slice(0, 3).map(t => `<span class="extag">${esc(t)}</span>`).join('')}</div>
        <button class="btn sm ${s.is_member ? 'sec' : ''}" data-exjoin="${s.id}" data-mem="${s.is_member ? 1 : 0}">${s.is_member ? 'Abrir' : 'Entrar'}</button></div></div>`).join('') || '<div class="empty">Nenhuma comunidade encontrada. Que tal abrir a sua? Configurações do servidor → Comunidade.</div>';
    g.querySelectorAll('[data-exjoin]').forEach(b => b.onclick = async () => {
      const sid = b.dataset.exjoin;
      if(b.dataset.mem !== '1'){
        const { error } = await App.sb.rpc('join_public_server', { p_server: sid });
        if(error){ App.toast(error.message, true); return; }
        await loadServers(); App.toast('Você entrou na comunidade.');
      }
      close(); go({ kind: 'server', sid });
    });
  };
  let tm; el.querySelector('#exQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  el.querySelectorAll('#exTags [data-tag]').forEach(b => b.onclick = () => { tag = b.dataset.tag || null; el.querySelectorAll('#exTags [data-tag]').forEach(x => x.classList.toggle('on', x === b)); load(); });
  load();
}
App.openExplore = openExplore;

function secSrvCommunity(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 2), tags = new Set(s.topic_tags || []);
  box.innerHTML = `${back}<h2>Comunidade ${COMMUNITY_SVG(20)}</h2>
    <p class="mut">Abra o servidor para a comunidade e ele aparece em <b>Explorar comunidades</b>. Qualquer pessoa do Telão pode entrar sem convite, e o servidor ganha o selo de comunidade ao lado do nome.</p>
    ${row('Servidor da comunidade', 'Banidos continuam sem conseguir entrar.', toggle('cmOn', s.is_public))}
    <label class="field"><span>Descrição que aparece em Explorar</span><textarea class="inp" id="cmD" rows="3" maxlength="300" placeholder="Do que é o servidor, quem pode entrar…">${esc(s.description || '')}</textarea></label>
    <div class="field"><span>Assuntos (até 3)</span><div class="chips" id="cmT">${COMMUNITY_TAGS.map(t => `<button data-t="${esc(t)}" class="${tags.has(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
    <p class="mut small">Dica: antes de abrir, configure o nível de verificação e o modo lento em Segurança e nas regras dos canais.</p>
    <button class="btn" id="cmSave" ${can ? '' : 'disabled'}>Salvar</button>`;
  box.querySelectorAll('#cmT [data-t]').forEach(b => b.onclick = () => {
    if(tags.has(b.dataset.t)) tags.delete(b.dataset.t); else { if(tags.size >= 3) return App.toast('Escolha até 3 assuntos.', true); tags.add(b.dataset.t); }
    b.classList.toggle('on', tags.has(b.dataset.t));
  });
  box.querySelector('#cmSave').onclick = async () => {
    const { error } = await App.sb.from('servers').update({ is_public: box.querySelector('#cmOn').checked, description: box.querySelector('#cmD').value.trim() || null, topic_tags: [...tags] }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; renderSettings(); renderSidebar(); renderRail(); App.toast('Salvo.');
  };
}

/* ---------- tag do servidor ---------- */
const TAG_BADGES = ['🔥','⚡','💎','🎮','🌙','⭐','🍀','👑','💀','🎧','🚀','❤️','🐺','🦊','🌸','☠️','🎯','🧃'];
const tagChip = t => t && t.tag ? `<span class="gtag" data-tip="Tag de ${esc(t.name || 'servidor')}">${t.badge ? `<i>${esc(t.badge)}</i>` : ''}${esc(t.tag)}</span>` : '';
App.tagChip = tagChip;
const _nameHtmlT = nameHtml;
nameHtml = function(p){ return _nameHtmlT(p) + (p && p.guild_tag ? tagChip(p.guild_tag) : ''); };
function secSrvTag(box, back){
  const s = SET.server, lv = serverLevel(s.id), can = App.hasPerm(s.id, 2) && lv >= 2;
  let badge = s.tag_badge || TAG_BADGES[0];
  const using = S.me.guild_tag && S.me.guild_tag.sid === s.id;
  box.innerHTML = `${back}<h2>Tag do servidor</h2>
    <p class="mut">Uma etiqueta curta que os membros podem mostrar ao lado do nome, em todo o Telão. Libera no <b>nível 2</b> de impulsos.${lv < 2 ? ` Este servidor está no nível ${lv}.` : ''}</p>
    <div class="tagprev"><b>${esc(S.me.display_name)}</b> <span id="tgPrev">${tagChip({ tag: s.tag || 'TAG', badge, name: s.name })}</span></div>
    <div class="grid2" style="display:grid;grid-template-columns:1fr 2fr;gap:12px">
      <label class="field"><span>Tag (2 a 4 letras)</span><input class="inp" id="tgT" maxlength="4" value="${esc(s.tag || '')}" placeholder="GAL" ${can ? '' : 'disabled'} style="text-transform:uppercase"></label>
      <div class="field"><span>Símbolo</span><div class="tagbadges">${TAG_BADGES.map(b => `<button data-b="${b}" class="${b === badge ? 'on' : ''}" ${can ? '' : 'disabled'}>${b}</button>`).join('')}</div></div>
    </div>
    ${can ? `<button class="btn" id="tgSave">Salvar tag</button> ${s.tag ? '<button class="btn sec" id="tgDel">Remover tag</button>' : ''}` : ''}
    <hr class="sdiv"><h3>Usar no meu perfil</h3>
    ${s.tag && lv >= 2 ? `<p class="mut small">${using ? 'Você está mostrando esta tag.' : 'Mostre a tag deste servidor ao lado do seu nome.'}</p><button class="btn ${using ? 'sec' : ''}" id="tgUse">${using ? 'Parar de usar' : 'Usar esta tag'}</button>` : '<p class="mut small">O servidor ainda não tem tag.</p>'}`;
  const $b = q => box.querySelector(q);
  const prev = () => { $b('#tgPrev').innerHTML = tagChip({ tag: ($b('#tgT').value.trim().toUpperCase() || 'TAG'), badge, name: s.name }); };
  box.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { badge = b.dataset.b; box.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  $b('#tgT').oninput = prev;
  const sv = $b('#tgSave'); if(sv) sv.onclick = async () => {
    const t = $b('#tgT').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{2,4}$/.test(t)){ App.toast('Use de 2 a 4 letras ou números.', true); return; }
    const { error } = await App.sb.from('servers').update({ tag: t, tag_badge: badge }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; await refreshMe(); renderSettings(); App.toast('Tag salva.');
  };
  const dl = $b('#tgDel'); if(dl) dl.onclick = async () => { await App.sb.from('servers').update({ tag: null, tag_badge: null }).eq('id', s.id); await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; await refreshMe(); renderSettings(); };
  const us = $b('#tgUse'); if(us) us.onclick = async () => {
    const { error } = await App.sb.rpc('use_server_tag', { p_server: using ? null : s.id });
    if(error){ App.toast(error.message, true); return; }
    await refreshMe(); renderAll(); renderSettings();
  };
}

/* ---------- avisos do Telão (novidades e anúncios) ---------- */
S.notices = [];
async function loadNotices(){
  const { data } = await App.sb.from('app_notices').select('*').order('created_at', { ascending: false }).limit(30);
  S.notices = data || []; updateBellDot();
}
function unreadNotices(){ const r = S.me && S.me.notices_read_at ? new Date(S.me.notices_read_at) : new Date(0); return S.notices.filter(n => new Date(n.created_at) > r).length; }
function updateBellDot(){ const d = $('#rBellDot'); if(d) d.classList.toggle('hidden', !unreadNotices()); }
const NOTICE_KIND = { update: ['Atualização', 'refresh'], announce: ['Anúncio', 'bell'], event: ['Evento', 'calendar'] };
async function noticesPanel(){
  const unread = new Date(S.me.notices_read_at || 0);
  modal(`<div class="mh"><h2>Novidades do Telão</h2><p>Atualizações e anúncios do time do Telão.</p></div>
    <div class="mc"><div class="nlist">${S.notices.map(n => `<div class="nitem ${new Date(n.created_at) > unread ? 'new' : ''}">
      <div class="nk">${ic(NOTICE_KIND[n.kind][1], 14)} ${NOTICE_KIND[n.kind][0]}${n.version ? ' ' + esc(n.version) : ''}<span>${new Date(n.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}</span></div>
      <b>${esc(n.title)}</b>${n.body ? `<div class="nb">${richText(n.body)}</div>` : ''}${n.link ? `<a class="btn sec sm" href="${esc(n.link)}" target="_blank" rel="noopener">Saiba mais</a>` : ''}</div>`).join('') || '<div class="empty">Nada por aqui ainda.</div>'}</div></div>
    <div class="mf">${S.me.is_admin ? `<button class="btn sec" id="nNew">${ic('plus', 15)} Publicar aviso</button>` : ''}<span class="grow"></span><button class="btn" data-close>Fechar</button></div>`, m => {
    const n = m.querySelector('#nNew'); if(n) n.onclick = noticeForm;
  });
  const { data } = await App.sb.from('profiles').update({ notices_read_at: new Date().toISOString() }).eq('id', S.me.id).select().single();
  if(data){ S.me = data; S.profiles.set(data.id, data); } updateBellDot();
}
function noticeForm(){
  modal(`<form id="nF"><div class="mh"><h2>Publicar para todo o Telão</h2><p>Aparece em Novidades para todas as contas, inclusive quem entrar depois.</p></div>
    <div class="mc"><label class="field"><span>Tipo</span><select class="inp" id="nK"><option value="announce">Anúncio</option><option value="update">Atualização (o que mudou)</option><option value="event">Evento</option></select></label>
      <label class="field"><span>Título</span><input class="inp" id="nT" maxlength="120" required placeholder="Chegou a versão 6.5"></label>
      <label class="field"><span>Texto</span><textarea class="inp" id="nB" rows="6" maxlength="4000" placeholder="- Solicitações de mensagem&#10;- Comunidades&#10;- Emojis de servidor"></textarea></label>
      <label class="field"><span>Link (opcional)</span><input class="inp" id="nL" placeholder="https://"></label>
      ${row('Mostrar agora na tela de quem está online', 'Além de ficar em Novidades.', toggle('nNow', true))}<div class="err" id="nE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Publicar</button></div></form>`, m => {
    m.querySelector('#nF').onsubmit = async e => {
      e.preventDefault();
      const row_ = { kind: m.querySelector('#nK').value, title: m.querySelector('#nT').value.trim(), body: m.querySelector('#nB').value.trim() || null, link: m.querySelector('#nL').value.trim() || null, version: m.querySelector('#nK').value === 'update' ? APP_VERSION : null };
      const now = m.querySelector('#nNow').checked;
      const { error } = await App.sb.from('app_notices').insert(row_);
      if(error){ m.querySelector('#nE').textContent = error.message; return; }
      closeModal(); App.toast('Publicado para todo mundo.');
      if(now && App.sendAviso) App.sendAviso(row_.title, false);
      loadNotices();
    };
  });
}
App.noticesPanel = noticesPanel;

/* ---------- emojis do servidor ---------- */
S.cemoji = new Map();   // id -> linha
const CE_RE = /&lt;(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})&gt;/g;
async function loadServerEmojis(){
  const ids = S.servers.map(s => s.id); if(!ids.length) return;
  const { data } = await App.sb.from('server_emojis').select('*').in('server_id', ids).order('name');
  (data || []).forEach(e => S.cemoji.set(e.id, e));
}
const ceImg = (id, name, big) => { const e = S.cemoji.get(id); return `<img class="cemoji ${big ? 'big' : ''}" ${e ? `src="${esc(e.url)}"` : `data-ceid="${id}"`} alt=":${esc(name)}:" data-tip=":${esc(name)}:" loading="lazy" draggable="false">`; };
App.ceHtml = h => String(h).replace(CE_RE, (m, a, n, id) => ceImg(id, n));
const _richText = richText;
const RAW_CE = /<(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})>/g;
richText = function(t){
  if(!t || !String(t).includes('<')) return _richText(t);
  const toks = [], only = /^(\s*<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>\s*){1,6}$/.test(t);
  const h = _richText(String(t).replace(RAW_CE, (m, a, n, id) => { toks.push([n, id]); return '\u0002' + (toks.length - 1) + '\u0002'; }));
  return h.replace(/\u0002(\d+)\u0002/g, (m, i) => ceImg(toks[+i][1], toks[+i][0], only));
};
const _reactsHtml = reactsHtml;
reactsHtml = function(mid){ return App.ceHtml(_reactsHtml(mid)); };
// emoji de servidor que ainda não está no cache (ex.: Telão+ usando de outro servidor)
const ceWait = new Set();
new MutationObserver(() => {
  const miss = [...document.querySelectorAll('img.cemoji[data-ceid]')].map(i => i.dataset.ceid).filter(id => !ceWait.has(id));
  if(!miss.length) return;
  miss.forEach(id => ceWait.add(id));
  App.sb.from('server_emojis').select('*').in('id', [...new Set(miss)]).then(({ data }) => {
    (data || []).forEach(e => S.cemoji.set(e.id, e));
    document.querySelectorAll('img.cemoji[data-ceid]').forEach(i => { const e = S.cemoji.get(i.dataset.ceid); if(e){ i.src = e.url; i.removeAttribute('data-ceid'); } else i.replaceWith(document.createTextNode(i.alt)); });
  });
}).observe(document.body, { childList: true, subtree: true });
// recentes guardam só emojis comuns
const _pushRecent = pushRecent;
pushRecent = function(e){ if(!String(e).startsWith('<')) _pushRecent(e); };
// o seletor ganha os emojis dos servidores
const _emojiPicker = emojiPicker;
emojiPicker = function(x, y, onPick, keepOpen){
  _emojiPicker(x, y, onPick, keepOpen);
  const grid = document.querySelector('#menu #epGrid'); if(!grid) return;
  const cur = S.route.kind === 'server' ? S.route.sid : null, plus = hasPlus(S.me);
  const groups = S.servers.map(s => ({ s, list: [...S.cemoji.values()].filter(e => e.server_id === s.id) })).filter(g => g.list.length)
    .sort((a, b) => (b.s.id === cur) - (a.s.id === cur));
  if(!groups.length) return;
  const html = groups.map(g => {
    const usable = plus || g.s.id === cur;
    return `<div class="epcat">${esc(g.s.name)}${usable ? '' : ' <span class="plustag">TELÃO+</span>'}</div><div class="eps ceps">${g.list.map(e => usable
      ? `<button data-e="&lt;${e.animated ? 'a' : ''}:${e.name}:${e.id}&gt;" data-n="${esc(e.name)}"><img src="${esc(e.url)}" alt=":${esc(e.name)}:"></button>`
      : `<button class="celock" data-celock="1" title="Usar fora do servidor é do Telão+"><img src="${esc(e.url)}" alt=":${esc(e.name)}:"></button>`).join('')}</div>`;
  }).join('');
  grid.insertAdjacentHTML('afterbegin', html);
  grid.addEventListener('click', e => { if(e.target.closest('[data-celock]')){ e.stopImmediatePropagation(); upsell('Usar emojis de qualquer servidor'); } }, true);
  grid.addEventListener('mouseover', e => { const b = e.target.closest('.ceps [data-e]'); if(b){ e.stopImmediatePropagation(); document.querySelector('#epFoot').innerHTML = `${b.innerHTML.replace('<img', '<img style="width:24px;height:24px;vertical-align:middle"')} :${esc(b.dataset.n)}:`; } }, true);
};
// :nome: digitado vira o emoji do servidor ao enviar
document.addEventListener('submit', e => {
  if(e.target.id !== 'cmpF') return;
  const ta = $('#cmp'); if(!ta || !ta.value.includes(':')) return;
  const cur = S.route.kind === 'server' ? S.route.sid : null, plus = hasPlus(S.me);
  ta.value = ta.value.replace(/(^|[^<a-z0-9_]):([a-z0-9_]{2,32}):(?![0-9a-f-]{36}>)/g, (m, pre, n) => {
    if(EMOJI.BY[n]) return m;
    const e = [...S.cemoji.values()].find(x => x.name === n && (x.server_id === cur || plus));
    return e ? `${pre}<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : m;
  });
}, true);

function secSrvEmojis(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 512) || App.hasPerm(s.id, 2), lv = serverLevel(s.id), lim = 50 + 25 * lv;
  const list = [...S.cemoji.values()].filter(e => e.server_id === s.id);
  const st = list.filter(e => !e.animated), an = list.filter(e => e.animated);
  box.innerHTML = `${back}<h2>Emojis</h2>
    <p class="mut">Todo mundo no servidor pode usar estes emojis aqui dentro. Com o Telão+ dá para usar em qualquer servidor e nas DMs (desde que a pessoa esteja neste servidor).</p>
    <div class="emlim"><span>Estáticos <b>${st.length}/${lim}</b></span><span>Animados <b>${an.length}/${lim}</b></span>${lv < 3 ? `<span class="mut small">+25 vagas por nível de impulso</span>` : ''}</div>
    ${can ? `<div class="emup"><button class="btn" id="emUp">${ic('plus', 16)} Enviar emoji</button><input type="file" id="emF" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <small class="mut">PNG, JPG, WEBP ou GIF animado. Quadrado fica melhor. Até 512 KB (GIF até 1 MB).</small></div>` : ''}
    <div class="emlist">${list.map(e => `<div class="emrow"><img src="${esc(e.url)}" alt=""><code>:${esc(e.name)}:</code>${e.animated ? '<span class="extag">animado</span>' : ''}<small class="mut">por ${esc(prof(e.created_by).display_name)}</small><span class="grow"></span>
      ${can ? `<button class="ibtn sm" data-emren="${e.id}" data-tip="Renomear">${ic('edit', 15)}</button><button class="ibtn sm" data-emdel="${e.id}" data-tip="Apagar">${ic('trash', 15)}</button>` : ''}</div>`).join('') || '<div class="empty">Nenhum emoji ainda.</div>'}</div>`;
  const $b = q => box.querySelector(q);
  if(!can) return;
  $b('#emUp').onclick = () => $b('#emF').click();
  $b('#emF').onchange = async ev => {
    for(const f of ev.target.files){
      try{
        const gif = f.type === 'image/gif';
        if(f.size > (gif ? 1048576 : 524288)){ App.toast(`${f.name}: arquivo grande demais.`, true); continue; }
        let blob = f, type = f.type;
        if(!gif){
          const bmp = await createImageBitmap(f), c = document.createElement('canvas'), sz = 128; c.width = sz; c.height = sz;
          const sc = Math.min(sz / bmp.width, sz / bmp.height), w = bmp.width * sc, h = bmp.height * sc;
          c.getContext('2d').drawImage(bmp, (sz - w) / 2, (sz - h) / 2, w, h);
          blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.92)); type = 'image/webp';
        }
        const name = (f.name.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'emoji').slice(0, 32).padEnd(2, '_');
        const path = `${S.me.id}/emoji-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${type.split('/')[1]}`;
        const { error: ue } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if(ue) throw ue;
        const url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
        let nm = name, i = 2; while([...S.cemoji.values()].some(e => e.server_id === s.id && e.name === nm)) nm = (name.slice(0, 29) + '_' + i++);
        const { data, error } = await App.sb.from('server_emojis').insert({ server_id: s.id, name: nm, url, animated: gif }).select().single();
        if(error) throw error;
        S.cemoji.set(data.id, data);
      }catch(err){ App.toast(`${f.name}: ${err.message}`, true); }
    }
    renderSettings();
  };
  box.querySelectorAll('[data-emdel]').forEach(b => b.onclick = async () => {
    if(!(await confirmBox('Apagar emoji', 'Mensagens antigas com ele vão mostrar só o nome.', 'Apagar'))) return;
    const { error } = await App.sb.from('server_emojis').delete().eq('id', b.dataset.emdel);
    if(error){ App.toast(error.message, true); return; }
    S.cemoji.delete(b.dataset.emdel); renderSettings();
  });
  box.querySelectorAll('[data-emren]').forEach(b => b.onclick = async () => {
    const e = S.cemoji.get(b.dataset.emren);
    const nv = (prompt('Novo nome (letras minúsculas, números e _):', e.name) || '').trim().toLowerCase();
    if(!nv || nv === e.name) return;
    if(!/^[a-z0-9_]{2,32}$/.test(nv)){ App.toast('Use de 2 a 32 letras minúsculas, números ou _.', true); return; }
    const { data, error } = await App.sb.from('server_emojis').update({ name: nv }).eq('id', e.id).select().single();
    if(error){ App.toast(/duplicate|unique/i.test(error.message) ? 'Já existe um emoji com esse nome.' : error.message, true); return; }
    S.cemoji.set(data.id, data); renderSettings();
  });
}

/* ---------- inicialização ---------- */
const _loadServersS = loadServers;
loadServers = async function(){
  await _loadServersS.apply(this, arguments);
  loadServerEmojis().catch(() => {});
  if(!S._v65){ S._v65 = true;
    loadNotices().catch(() => {});
    App.sb.channel('notices-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notices' }, p => {
      S.notices.unshift(p.new); updateBellDot();
      App.toast(`${NOTICE_KIND[p.new.kind][0]}: ${p.new.title}`, false, { label: 'Ver', fn: noticesPanel });
    }).on('postgres_changes', { event: '*', schema: 'public', table: 'server_emojis' }, p => {
      if(p.eventType === 'DELETE') S.cemoji.delete(p.old.id); else S.cemoji.set(p.new.id, p.new);
    }).subscribe();
  }
};
App.openDM = openDM;
/* =====================================================================
   v6.6: TELÃO NO CELULAR
   Voltar com o botão do celular, deslizar para voltar, segurar para abrir menus,
   barra de navegação embaixo, janelas como "folhas" de baixo para cima.
   ===================================================================== */
const touchDev = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
if(touchDev) document.documentElement.classList.add('touch');

/* botão "voltar" do celular: volta para a lista em vez de fechar o Telão */
let backGuard = false;
new MutationObserver(() => {
  const inMain = document.body.classList.contains('m-main');
  if(inMain && isMobile() && !(history.state && history.state.telaoMain)){ history.pushState({ telaoMain: true }, ''); }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
function overlayOpen(){
  const md = $('#modal'); if(md && !md.classList.contains('hidden')) return () => closeModal();
  const mn = $('#menu'); if(mn && !mn.classList.contains('hidden')) return () => closeMenu();
  const ex = $('#explore'); if(ex) return () => ex.remove();
  if(document.querySelector('.settings:not(.hidden)') || (typeof SET !== 'undefined' && SET)) return () => closeSettings();
  if(document.body.classList.contains('mem-open') && isMobile()) return () => { S.memOverlay = false; renderMembers(); };
  return null;
}
window.addEventListener('popstate', () => {
  if(!isMobile()) return;
  const close = overlayOpen();
  if(close){ close(); if(document.body.classList.contains('m-main')) history.pushState({ telaoMain: true }, ''); return; }
  if(document.body.classList.contains('m-main')) document.body.classList.remove('m-main');
});
// abrir janela também conta como "tela" para o botão voltar fechar ela
const _modalM = modal;
modal = function(){
  const r = _modalM.apply(this, arguments);
  if(isMobile()){
    if(!(history.state && history.state.telaoModal)) history.pushState({ telaoModal: true, telaoMain: document.body.classList.contains('m-main') }, '');
    // não abre o teclado sozinho em cima da janela
    setTimeout(() => { const a = document.activeElement; if(a && a.closest && a.closest('#modal') && !a.matches('.code6')) a.blur(); }, 60);
  }
  return r;
};

/* deslizar da borda esquerda para voltar */
let sw = null;
document.addEventListener('touchstart', e => {
  if(!isMobile() || e.touches.length !== 1) return;
  const t = e.touches[0];
  if(t.clientX < 28 && document.body.classList.contains('m-main') && !overlayOpen()) sw = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if(!sw) return; const t = e.touches[0], dx = t.clientX - sw.x, dy = Math.abs(t.clientY - sw.y);
  if(dy > 60) { sw = null; $('#main').style.transform = ''; return; }
  if(dx > 0) $('#main').style.transform = `translateX(${Math.min(dx, innerWidth) * 0.6}px)`;
}, { passive: true });
document.addEventListener('touchend', e => {
  if(!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x;
  const m = $('#main'); m.style.transition = 'transform .18s'; m.style.transform = '';
  setTimeout(() => { m.style.transition = ''; }, 200);
  if(dx > 90) history.back();
  sw = null;
});

/* segurar o dedo = clique com o botão direito (menus de mensagem, membro, canal) */
let lp = null;
document.addEventListener('touchstart', e => {
  if(!touchDev || e.touches.length !== 1) return;
  const el = e.target.closest('.msg, .mem, .vu, .ch[data-cid], .dmitem, .ricon[data-sid], .fr, [data-uprof]'); if(!el) return;
  const t = e.touches[0];
  lp = { el, x: t.clientX, y: t.clientY, timer: setTimeout(() => {
    lp.fired = true;
    if(navigator.vibrate) navigator.vibrate(12);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY }));
  }, 480) };
}, { passive: true });
document.addEventListener('touchmove', e => { if(!lp) return; const t = e.touches[0]; if(Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10){ clearTimeout(lp.timer); lp = null; } }, { passive: true });
document.addEventListener('touchend', e => { if(!lp) return; clearTimeout(lp.timer); if(lp.fired){ e.preventDefault(); } lp = null; });
document.addEventListener('contextmenu', e => { if(touchDev && e.isTrusted && e.target.closest('.msg, .mem, .vu, .ch, .dmitem')) e.preventDefault(); }, true);

/* barra de navegação embaixo (só no celular, na tela de listas) */
function mobileNav(){
  if(!isMobile() || !S.me){ const n = $('#mnav'); if(n) n.remove(); return; }
  let n = $('#mnav');
  if(!n){ n = document.createElement('nav'); n.id = 'mnav'; n.className = 'mnav'; document.body.appendChild(n); }
  const home = S.route.kind === 'home';
  const unreadN = (S.dmReq ? S.dmReq.length : 0) + S.dms.filter(d => S.unread.has(d.id)).length;
  n.innerHTML = `<button data-mn="home" class="${home ? 'on' : ''}">${ic('chat', 22)}<span>Início</span>${unreadN ? `<i class="mdot">${unreadN > 9 ? '9+' : unreadN}</i>` : ''}</button>
    <button data-mn="explore">${ic('globe', 22)}<span>Explorar</span></button>
    <button data-mn="news">${ic('bell', 22)}<span>Novidades</span>${typeof unreadNotices === 'function' && unreadNotices() ? '<i class="mdot"></i>' : ''}</button>
    <button data-mn="me">${avatar(S.me, 'xs', true)}<span>Você</span></button>`;
  n.querySelector('[data-mn="home"]').onclick = () => { go({ kind: 'home', dm: null }); document.body.classList.remove('m-main'); };
  n.querySelector('[data-mn="explore"]').onclick = () => App.openExplore();
  n.querySelector('[data-mn="news"]').onclick = () => App.noticesPanel();
  n.querySelector('[data-mn="me"]').onclick = () => openSettings('user', 'account');
}
const _renderRailK = renderRail;
renderRail = function(){ _renderRailK.apply(this, arguments); mobileNav(); };
addEventListener('resize', () => { mobileNav(); });

/* no celular o player do Telão Bot começa pequeno */
new MutationObserver(() => { const d = $('#musicDock'); if(d && isMobile() && !d.dataset.mob){ d.dataset.mob = '1'; d.classList.add('mini'); } }).observe(document.body, { childList: true });

/* teclado aberto: mantém a caixa de mensagem visível (iPhone) */
if(window.visualViewport){
  const vv = window.visualViewport;
  const fit = () => { document.documentElement.style.setProperty('--vvh', vv.height + 'px'); document.body.classList.toggle('kb-open', isMobile() && vv.height < innerHeight * 0.78); };
  vv.addEventListener('resize', fit); fit();
}
/* textos mais curtos no celular */
const _renderMainK = renderMain;
renderMain = function(){
  _renderMainK.apply(this, arguments);
  const ta = $('#cmp'); if(ta && isMobile() && !ta.disabled) ta.placeholder = ta.placeholder.replace(/ — digite \/ para comandos$/, '');
};
/* =====================================================================
   v6.7: DESEMPENHO — Qualidade · Equilibrado · Modo jogo (máximo de FPS)
   ===================================================================== */
const PERF = {
  quality:  { nome: 'Qualidade', desc: 'Tudo ligado: animações, brilhos, partículas, efeitos de vidro e transições suaves.', icon: 'star' },
  balanced: { nome: 'Equilibrado', desc: 'Corta o que mais pesa (vidro desfocado, partículas, sombras grandes) e deixa as animações mais curtas.', icon: 'sliders' },
  game:     { nome: 'Modo jogo', desc: 'O mais leve possível para sobrar FPS no jogo: sem animações nem efeitos, e o Telão trabalha menos em segundo plano. Chamada e tela continuam iguais.', icon: 'gamepad' },
};
if(!P.perf) P.perf = 'quality';
if(P.perfAuto === undefined) P.perfAuto = true;
if(P.perfShare === undefined) P.perfShare = false;
let perfTemp = null;   // modo jogo automático (janela em segundo plano / compartilhando)
function perfNow(){ return perfTemp && P.perf !== 'game' ? 'game' : P.perf; }
function applyPerf(){
  const lv = perfNow(); App.perf = lv;
  document.body.classList.toggle('perf-balanced', lv === 'balanced');
  document.body.classList.toggle('perf-game', lv === 'game');
  const ms = lv === 'game' ? 260 : lv === 'balanced' ? 160 : 120;
  if(Voice.speakMs !== ms){ Voice.speakMs = ms; if(Voice._speakTimer) Voice.startSpeakLoop(); }
  const chip = $('#perfChip');
  if(chip) chip.classList.toggle('hidden', lv !== 'game');
}
App.applyPerf = applyPerf;
applyPerf();
// automático: quando o Telão fica em segundo plano (você está no jogo) ou quando você compartilha a tela
function perfAutoCheck(){
  const bg = P.perfAuto && (document.hidden || !document.hasFocus());
  const share = P.perfShare && !!Voice.screenStream;
  const want = bg || share ? 'auto' : null;
  if(want !== perfTemp){ perfTemp = want; applyPerf(); }
}
document.addEventListener('visibilitychange', perfAutoCheck);
addEventListener('blur', () => setTimeout(perfAutoCheck, 50));
addEventListener('focus', perfAutoCheck);
setInterval(perfAutoCheck, 3000);
// atalho: Ctrl+Shift+G liga e desliga o modo jogo
document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.shiftKey && (e.key === 'G' || e.key === 'g')){
    e.preventDefault();
    P.perfBefore = P.perf === 'game' ? P.perfBefore : P.perf;
    P.perf = P.perf === 'game' ? (P.perfBefore || 'quality') : 'game'; savePrefs(); applyPerf();
    App.toast(P.perf === 'game' ? 'Modo jogo ligado: o Telão fica o mais leve possível.' : `Voltou para ${PERF[P.perf].nome}.`);
    if(SET && SET.sec === 'perf') renderSettings();
  }
});
// aviso discreto "modo jogo" no canto do painel do usuário
const _renderUserPanelP = renderUserPanel;
renderUserPanel = function(){
  _renderUserPanelP.apply(this, arguments);
  const up = $('#userPanel'); if(!up || $('#perfChip')) return;
  up.insertAdjacentHTML('afterbegin', `<button class="perfchip ${App.perf === 'game' ? '' : 'hidden'}" id="perfChip" data-tip="Modo jogo ligado" data-tipsub="Ctrl+Shift+G para desligar">${ic('gamepad', 13)} Modo jogo</button>`);
  $('#perfChip').onclick = () => openSettings('user', 'perf');
};

function secPerf(box, back){
  box.innerHTML = `${back}<h2>Desempenho</h2>
    <p class="mut">Escolha quanto o Telão pode usar do seu PC ou celular. No modo jogo ele fica o mais leve possível para não roubar FPS.</p>
    <div class="perfgrid">${Object.entries(PERF).map(([k, v]) => `<button class="perfc ${P.perf === k ? 'on' : ''}" data-perf="${k}">
      <span class="pi">${ic(v.icon, 22)}</span><b>${v.nome}</b><small>${v.desc}</small>${P.perf === k ? '<span class="ok">✓ Em uso</span>' : ''}</button>`).join('')}</div>
    <h3>Automático</h3>
    ${row('Ficar no modo jogo quando o Telão estiver em segundo plano', 'Enquanto você está no jogo (o Telão minimizado ou atrás), ele economiza sozinho. Volta ao normal quando você abre o Telão de novo.', toggle('pfAuto', P.perfAuto))}
    ${row('Ficar no modo jogo enquanto eu compartilho a tela', 'Bom para transmitir jogo: sobra mais placa de vídeo para o jogo e para a transmissão.', toggle('pfShare', P.perfShare))}
    <p class="mut small" style="margin-top:12px">Atalho: <span class="keycap">Ctrl</span> + <span class="keycap">Shift</span> + <span class="keycap">G</span> liga e desliga o modo jogo de qualquer lugar do Telão.</p>
    <hr class="sdiv"><h3>O que o modo jogo muda</h3>
    <ul class="perflist"><li>Desliga animações, transições, partículas, molduras animadas e o fundo animado dos temas</li><li>Tira o efeito de vidro desfocado e as sombras (os que mais pesam na placa de vídeo)</li><li>Mensagens fora da tela não são desenhadas até você rolar até elas</li><li>Detecção de quem está falando, prévia ao vivo da tela e filtro de conteúdo rodam com menos frequência</li><li>Não muda a qualidade da voz, da câmera nem da tela que você transmite</li></ul>`;
  box.querySelectorAll('[data-perf]').forEach(b => b.onclick = () => { P.perf = b.dataset.perf; savePrefs(); applyPerf(); renderSettings(); });
  box.querySelector('#pfAuto').onchange = e => { P.perfAuto = e.target.checked; savePrefs(); perfAutoCheck(); };
  box.querySelector('#pfShare').onchange = e => { P.perfShare = e.target.checked; savePrefs(); perfAutoCheck(); };
}
/* ---------------- PWA ---------------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); if(window.telaoDesktop) return; S.installEvt = e;
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
window.addEventListener('appinstalled', () => { $('#install').classList.add('hidden'); App.toast('Telão instalado'); });

window.addEventListener('beforeunload', () => { try{ Voice.channel && Voice.leave(); }catch(e){} });
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/convite=([a-z0-9-]+)/i);
  if(m && S.me){ history.replaceState(null, '', location.pathname); inviteJoinPrompt(m[1].toLowerCase()); }
});

boot();
})();

