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
