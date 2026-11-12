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

const APP_VERSION = '6.6';
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

