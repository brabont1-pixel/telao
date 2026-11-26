/* =====================================================================
   v6.39: MAIS JOGOS NA CALL — Uno, Dominó, Imagem & Ação e Jogo da Velha (torneio)
   Mesmo esquema dos outros: quem abre é o anfitrião e guarda o que é secreto.
   - Uno e Dominó: as cartas/pedras de cada um ficam só com o anfitrião e cada
     jogador recebe em particular só a própria mão. A tela mostra quantas cada um tem.
   - Imagem & Ação: só quem vai fazer a mímica recebe a palavra (em particular).
   - Jogo da Velha: chaveamento de torneio; a call toda assiste cada partida.
   ===================================================================== */
const K4 = App.G;
const H4 = { gid: null, hands: {}, deck: [], disc: [], my: {} };
const pres4 = () => K4.presentIds();
function p4Send(st, uid, kind, data){
  if(uid === S.me.id){ H4.my[kind] = Object.assign({ gid: st.id }, data); return; }
  sendToUser(uid, 'game-priv', Object.assign({ gid: st.id, k4: kind }, data));
}
const _onGamePriv4 = App.onGamePriv;
App.onGamePriv = pl => {
  if(pl && pl.k4){ const st = K4.st; if(!st || pl.gid !== st.id) return; H4.my[pl.k4] = pl; K4.render(); return; }
  if(_onGamePriv4) _onGamePriv4(pl);
};
const myPriv = (st, kind) => { const x = H4.my[kind]; return x && x.gid === st.id ? x : null; };
function nextIdx(st, n){ const L = st.order.length; return ((st.turn + st.dir * (n || 1)) % L + L) % L; }
const curU = st => st.order[st.turn];

/* ============================ UNO ============================ */
const T_UNO = 30000;
const U_COL = { r: 'Vermelho', g: 'Verde', b: 'Azul', y: 'Amarelo' };
const uLabel = c => c.v === 's' ? '⊘' : c.v === 'r' ? '⇄' : c.v === 'w' ? '★' : c.v;
const uVal = c => /^\d$/.test(c.v) ? +c.v : c.c === 'w' ? 50 : 20;
const uCard = (c, extra = '') => `<span class="ucard c-${c.c} ${extra}"><b>${esc(uLabel(c))}</b><i>${esc(uLabel(c))}</i></span>`;
function uDeck(){
  let id = 0; const d = [];
  ['r', 'g', 'b', 'y'].forEach(c => {
    d.push({ id: id++, c, v: '0' });
    for(let k = 0; k < 2; k++) ['1', '2', '3', '4', '5', '6', '7', '8', '9', 's', 'r', '+2'].forEach(v => d.push({ id: id++, c, v }));
  });
  for(let k = 0; k < 4; k++){ d.push({ id: id++, c: 'w', v: 'w' }); d.push({ id: id++, c: 'w', v: '+4' }); }
  return K4.shuffle(d);
}
function uDraw(st, uid, n){
  const h = H4.hands[uid]; const got = [];
  for(let i = 0; i < n; i++){
    if(!H4.deck.length){ const top = H4.disc.pop(); H4.deck = K4.shuffle(H4.disc); H4.disc = top ? [top] : []; }
    if(!H4.deck.length) break;
    const c = H4.deck.pop(); h.push(c); got.push(c);
  }
  st.counts[uid] = h.length; st.deckN = H4.deck.length;
  return got;
}
const uCan = (st, c) => c.c === 'w' || c.c === st.color || c.v === st.top.v;
function uSendAll(st){ st.order.forEach(u => p4Send(st, u, 'uno', { hand: H4.hands[u] || [] })); }
function uAdvance(st, n){ st.turn = nextIdx(st, n); st.drawn = null; st.drawnId = null; K4.setDeadline(T_UNO); }
function uFinish(st, winner){
  let pts = 0; st.order.forEach(u => { if(u !== winner) pts += (H4.hands[u] || []).reduce((a, c) => a + uVal(c), 0); });
  st.winner = winner; st.winPts = pts;
  st.players.forEach(u => { st.scores[u] = u === winner ? 100 + pts : Math.max(0, 40 - (H4.hands[u] || []).reduce((a, c) => a + uVal(c), 0)); });
  st.reveal = Object.fromEntries(st.order.map(u => [u, (H4.hands[u] || []).slice(0, 20)]));
  K4.endGame();
}
App.registerGame('uno', { name: 'Uno', icon: '🟥', desc: 'Jogue carta da mesma cor ou do mesmo número. +2, +4, pular e inverter valem. Ficou com uma carta? Grite UNO antes que alguém te pegue! Quem zerar a mão primeiro ganha.', min: 2 }, {
  start(st){
    if(st.players.length > 10){ App.toast('Uno vai até 10 pessoas.', true); st.phase = 'lobby'; K4.push(); return; }
    H4.gid = st.id; H4.deck = uDeck(); H4.disc = []; H4.hands = {};
    st.order = K4.shuffle(st.players); st.dir = 1; st.turn = 0; st.counts = {};
    st.order.forEach(u => { H4.hands[u] = []; uDraw(st, u, 7); });
    let top; do { top = H4.deck.pop(); if(!/^\d$/.test(top.v)){ H4.deck.unshift(top); top = null; } } while(!top);
    H4.disc.push(top); st.top = top; st.color = top.c; st.deckN = H4.deck.length;
    st.unoOpen = null; st.log = 'Começou! Primeira carta: ' + U_COL[top.c] + ' ' + top.v;
    st.phase = 'play'; K4.setDeadline(T_UNO);
    uSendAll(st); K4.push();
    setTimeout(() => { if(K4.st && K4.st.id === st.id && H4.gid === st.id) uSendAll(st); }, 1500);
  },
  act(st, uid, a){
    if(st.phase !== 'play' || H4.gid !== st.id) return;
    const h = H4.hands[uid]; if(!h) return;
    if(a.a === 'ucatch'){
      if(st.unoOpen && st.unoOpen !== uid && st.order.includes(uid) && (H4.hands[st.unoOpen] || []).length === 1){
        const who = st.unoOpen; uDraw(st, who, 2); st.unoOpen = null; st.log = `${prof(uid).display_name} pegou ${prof(who).display_name} sem gritar UNO! +2 cartas`;
        p4Send(st, who, 'uno', { hand: H4.hands[who] }); K4.push();
      }
      return;
    }
    if(a.a === 'uuno'){ if(st.unoOpen === uid){ st.unoOpen = null; st.log = `${prof(uid).display_name} gritou UNO! 🔔`; st.shout = { at: Date.now(), uid }; K4.push(); } return; }
    if(curU(st) !== uid) return;
    if(a.a === 'uplay'){
      const i = h.findIndex(c => c.id === a.id); if(i < 0) return;
      const c = h[i];
      if(st.drawnId != null && c.id !== st.drawnId) return;
      if(!uCan(st, c)) return;
      if(st.unoOpen && st.unoOpen !== uid) st.unoOpen = null;
      h.splice(i, 1); st.counts[uid] = h.length; H4.disc.push(c); st.top = c;
      st.color = c.c === 'w' ? (U_COL[a.color] ? a.color : K4.shuffle(['r', 'g', 'b', 'y'])[0]) : c.c;
      st.log = `${prof(uid).display_name} jogou ${c.c === 'w' ? (c.v === '+4' ? '+4' : 'coringa') + ' e escolheu ' + U_COL[st.color] : U_COL[c.c] + ' ' + uLabel(c)}`;
      if(!h.length){ p4Send(st, uid, 'uno', { hand: h }); uFinish(st, uid); return; }
      if(h.length === 1){ if(a.uno){ st.log += ' · UNO! 🔔'; st.shout = { at: Date.now(), uid }; } else st.unoOpen = uid; }
      p4Send(st, uid, 'uno', { hand: h });
      const two = st.order.length === 2;
      if(c.v === 'r'){ if(two) uAdvance(st, 2); else { st.dir = -st.dir; uAdvance(st, 1); } }
      else if(c.v === 's') uAdvance(st, 2);
      else if(c.v === '+2' || c.v === '+4'){
        const vic = st.order[nextIdx(st, 1)], n = c.v === '+2' ? 2 : 4;
        uDraw(st, vic, n); p4Send(st, vic, 'uno', { hand: H4.hands[vic] }); st.log += ` · ${prof(vic).display_name} comprou ${n} e perdeu a vez`;
        uAdvance(st, 2);
      } else uAdvance(st, 1);
      K4.push();
    } else if(a.a === 'udraw' && st.drawnId == null){
      if(st.unoOpen && st.unoOpen !== uid) st.unoOpen = null;
      const [c] = uDraw(st, uid, 1);
      p4Send(st, uid, 'uno', { hand: h });
      if(c && uCan(st, c)){ st.drawn = uid; st.drawnId = c.id; st.log = `${prof(uid).display_name} comprou uma carta`; K4.setDeadline(12000); }
      else { st.log = `${prof(uid).display_name} comprou e passou`; uAdvance(st, 1); }
      K4.push();
    } else if(a.a === 'upass' && st.drawnId != null){ st.log = `${prof(uid).display_name} passou`; uAdvance(st, 1); K4.push(); }
  },
  tick(st){
    if(st.phase !== 'play') return;
    if(H4.gid !== st.id){ K4.feed({ sys: 'Quem dava as cartas saiu da call, então a partida acabou.' }); uFinish(st, null); return; }
    const here = pres4(), alive = st.order.filter(u => here.includes(u));
    if(alive.length < 2){ uFinish(st, alive[0] || null); return; }
    const u = curU(st);
    if(!here.includes(u)){ st.log = `${prof(u).display_name} não está na call: pulou a vez`; uAdvance(st, 1); K4.push(); return; }
    if(st.drawnId != null){ st.log = `${prof(u).display_name} demorou e passou`; uAdvance(st, 1); K4.push(); return; }
    uDraw(st, u, 1); p4Send(st, u, 'uno', { hand: H4.hands[u] }); st.log = `${prof(u).display_name} demorou: comprou e passou`; uAdvance(st, 1); K4.push();
  },
  render(st){
    const me = S.me.id, mine = st.order.includes(me), my = myPriv(st, 'uno'), hand = my ? my.hand : [];
    const myTurn = st.phase === 'play' && curU(st) === me;
    const seats = st.order.map((u, i) => `<div class="useat ${i === st.turn ? 'turn' : ''} ${u === me ? 'me' : ''}">${avatar(prof(u), 'sm')}<span>${K4.nm(u)}</span><b class="ucnt">${st.counts[u] ?? 0}</b>${(st.counts[u] === 1) ? '<i class="uone">UNO</i>' : ''}</div>`).join(`<span class="udir">${st.dir > 0 ? '→' : '←'}</span>`);
    const pend = U4.wild != null && hand.find(c => c.id === U4.wild);
    const shoutNew = st.shout && Date.now() - st.shout.at < 2200;
    return `<div class="guno">
      <div class="useats">${seats}</div>
      <div class="utable"><div class="udeck"><button class="ucard back" data-g="udraw" ${myTurn && st.drawnId == null ? '' : 'disabled'} title="Comprar"><b>UNO</b></button><small>${st.deckN} no monte</small></div>
        <div class="udisc">${st.top ? uCard(st.top, 'big') : ''}<span class="ucolor c-${st.color}">${U_COL[st.color] || ''}</span></div></div>
      <div class="ulog">${esc(st.log || '')}</div>
      ${shoutNew ? `<div class="ushout">UNO! 🔔<small>${K4.nm(st.shout.uid)}</small></div>` : ''}
      ${st.unoOpen && st.unoOpen !== me && mine ? `<button class="btn red" data-g="ucatch">🫵 ${K4.nm(st.unoOpen)} não gritou UNO! Pegar</button>` : ''}
      ${st.unoOpen === me ? `<button class="btn ubig" data-g="uuno">🔔 Gritar UNO!</button>` : ''}
      ${mine ? `${pend ? `<div class="uwild"><b>Escolha a cor:</b>${['r', 'g', 'b', 'y'].map(c => `<button class="uwc c-${c}" data-g="ucolor" data-c="${c}">${U_COL[c]}</button>`).join('')}<button class="btn sec sm" data-g="uwx">Cancelar</button></div>` : ''}
        <div class="uhand">${hand.map(c => { const ok = myTurn && uCan(st, c) && (st.drawnId == null || st.drawnId === c.id); return `<button class="ucbtn ${ok ? 'ok' : ''}" data-g="uplay" data-id="${c.id}" ${ok ? '' : 'disabled'}>${uCard(c)}</button>`; }).join('') || '<span class="mut small">Esperando as cartas…</span>'}</div>
        <div class="uacts">${myTurn ? `<span class="tyour">Sua vez!</span>${hand.length === 2 ? `<label class="usay"><input type="checkbox" id="uSay" ${U4.say ? 'checked' : ''}> Gritar UNO ao jogar</label>` : ''}${st.drawnId != null ? '<button class="btn sec sm" data-g="upass">Passar</button>' : ''}` : st.phase === 'play' ? `<span class="mut">Vez de ${K4.nm(curU(st))}</span>` : ''}</div>`
        : '<p class="mut small">Você está assistindo.</p>'}
    </div>`;
  },
  endExtra(st){
    if(!st.reveal) return '';
    return `<div class="truend">${st.winner ? `🟥 <b>${K4.nm(st.winner)}</b> zerou a mão e levou <b>${st.winPts}</b> pontos das cartas dos outros!` : 'A partida acabou.'}</div>
      <div class="ureveal">${Object.entries(st.reveal).filter(([, h]) => h.length).map(([u, h]) => `<div><small>${K4.nm(u)}</small>${h.map(c => uCard(c, 'mini')).join('')}</div>`).join('')}</div>`;
  },
  after(st, el){
    const cb = el && el.querySelector('#uSay'); if(cb) cb.onchange = () => { U4.say = cb.checked; };
    if(st.shout && st.shout.at !== U4.shout && Date.now() - st.shout.at < 2200){ U4.shout = st.shout.at; App.sfx && App.sfx('screen'); }
    if(st.phase === 'play' && curU(st) === S.me.id && U4.lastTurn !== st.turn + ':' + st.log){ U4.lastTurn = st.turn + ':' + st.log; if(navigator.vibrate) try{ navigator.vibrate(40); }catch(e){} }
  },
  click(k, b, st){
    const my = myPriv(st, 'uno'), hand = my ? my.hand : [];
    if(k === 'uplay'){
      const id = +b.dataset.id, c = hand.find(x => x.id === id); if(!c) return true;
      if(c.c === 'w'){ U4.wild = id; K4.render(); return true; }
      K4.act({ a: 'uplay', id, uno: hand.length === 2 && U4.say }); U4.say = false; return true;
    }
    if(k === 'ucolor'){ const id = U4.wild; U4.wild = null; K4.act({ a: 'uplay', id, color: b.dataset.c, uno: hand.length === 2 && U4.say }); U4.say = false; return true; }
    if(k === 'uwx'){ U4.wild = null; K4.render(); return true; }
    if(k === 'udraw'){ K4.act({ a: 'udraw' }); return true; }
    if(k === 'upass'){ K4.act({ a: 'upass' }); return true; }
    if(k === 'uuno'){ K4.act({ a: 'uuno' }); return true; }
    if(k === 'ucatch'){ K4.act({ a: 'ucatch' }); return true; }
  },
});
const U4 = { wild: null, say: false };

/* ============================ DOMINÓ ============================ */
const T_DOM = 35000, T_DOM_END = 7000, DOM_TARGET = 50, DOM_ROUNDS = 3;
const dPip = n => { const P = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n] || []; return `<span class="dhalf">${[...Array(9)].map((_, i) => `<i class="${P.includes(i) ? 'on' : ''}"></i>`).join('')}</span>`; };
const dTile = (t, extra = '') => `<span class="dtile ${t[0] === t[1] ? 'dbl' : ''} ${extra}">${dPip(t[0])}<span class="dsep"></span>${dPip(t[1])}</span>`;
const dSum = h => (h || []).reduce((a, t) => a + t[0] + t[1], 0);
function dFits(st, t){
  if(!st.chain.length) return ['L'];
  const s = []; if(t[0] === st.L || t[1] === st.L) s.push('L'); if(t[0] === st.R || t[1] === st.R) s.push('R'); return s;
}
function dDeal(st){
  const all = []; for(let a = 0; a <= 6; a++) for(let b = a; b <= 6; b++) all.push([a, b]);
  const d = K4.shuffle(all); H4.hands = {}; H4.gid = st.id;
  st.order.forEach(u => { H4.hands[u] = d.splice(0, 7); st.counts[u] = 7; });
  H4.deck = d; st.bone = d.length; st.chain = []; st.L = null; st.R = null; st.passes = 0; st.handNo = (st.handNo || 0) + 1;
  // começa quem tem a maior carroça (pedra dobrada); senão, quem ganhou a última
  let best = -1, who = st.lastWin && st.order.includes(st.lastWin) ? st.order.indexOf(st.lastWin) : 0;
  if(!st.lastWin) st.order.forEach((u, i) => H4.hands[u].forEach(t => { if(t[0] === t[1] && t[0] > best){ best = t[0]; who = i; } }));
  st.turn = who; st.dir = 1; st.log = `Rodada ${st.handNo}. Começa ${prof(st.order[who]).display_name}.`;
  st.phase = 'play'; K4.setDeadline(T_DOM);
  st.order.forEach(u => p4Send(st, u, 'dom', { hand: H4.hands[u], handNo: st.handNo }));
  setTimeout(() => { if(K4.st && K4.st.id === st.id && H4.gid === st.id && K4.st.handNo === st.handNo) st.order.forEach(u => u !== S.me.id && p4Send(st, u, 'dom', { hand: H4.hands[u], handNo: st.handNo })); }, 1500);
}
function dPlace(st, uid, i, side){
  const h = H4.hands[uid], t = h[i]; if(!t) return false;
  const fits = dFits(st, t); if(!fits.length) return false;
  if(!fits.includes(side)) side = fits[0];
  let tile = t.slice();
  if(!st.chain.length){ st.chain = [tile]; st.L = tile[0]; st.R = tile[1]; }
  else if(side === 'L'){ if(tile[1] !== st.L) tile = [tile[1], tile[0]]; st.chain.unshift(tile); st.L = tile[0]; }
  else { if(tile[0] !== st.R) tile = [tile[1], tile[0]]; st.chain.push(tile); st.R = tile[1]; }
  h.splice(i, 1); st.counts[uid] = h.length; st.passes = 0;
  st.log = `${prof(uid).display_name} jogou ${t[0]}|${t[1]}`;
  p4Send(st, uid, 'dom', { hand: h, handNo: st.handNo });
  if(!h.length){ dRoundEnd(st, uid, 'bateu'); return true; }
  st.turn = nextIdx(st, 1); K4.setDeadline(T_DOM); K4.push();
  return true;
}
function dRoundEnd(st, winner, why){
  if(!winner){
    // trancou: ganha quem tem menos pontos na mão
    let low = 1e9; st.order.forEach(u => { const s = dSum(H4.hands[u]); if(s < low){ low = s; winner = u; } });
  }
  const pts = st.order.reduce((a, u) => a + (u === winner ? 0 : dSum(H4.hands[u])), 0);
  st.tot[winner] = (st.tot[winner] || 0) + pts; st.scores[winner] = (st.scores[winner] || 0) + pts + 10; st.lastWin = winner;
  st.rend = { winner, why, pts, hands: Object.fromEntries(st.order.map(u => [u, H4.hands[u] || []])) };
  st.phase = 'rend'; K4.setDeadline(T_DOM_END); K4.push();
}
App.registerGame('domino', { name: 'Dominó', icon: '🁫', desc: 'De 2 a 4 pessoas, 7 pedras cada. Encaixe pelo número da ponta. Sem pedra que sirva: compre do monte (ou passe, se acabou). Quem bater leva os pontos das mãos dos outros. Ganha quem chegar a 50 (ou mais pontos em 3 rodadas).', min: 2 }, {
  start(st){
    if(st.players.length > 4){ App.toast('Dominó vai até 4 pessoas.', true); st.phase = 'lobby'; K4.push(); return; }
    st.order = K4.shuffle(st.players); st.counts = {}; st.tot = {}; st.handNo = 0; st.lastWin = null;
    dDeal(st); K4.push();
  },
  act(st, uid, a){
    if(st.phase !== 'play' || H4.gid !== st.id || curU(st) !== uid) return;
    const h = H4.hands[uid]; if(!h) return;
    const can = h.some(t => dFits(st, t).length);
    if(a.a === 'dplay') dPlace(st, uid, a.i | 0, a.side === 'L' ? 'L' : 'R');
    else if(a.a === 'dbuy' && !can && H4.deck.length){ h.push(H4.deck.pop()); st.counts[uid] = h.length; st.bone = H4.deck.length; st.log = `${prof(uid).display_name} comprou do monte`; p4Send(st, uid, 'dom', { hand: h, handNo: st.handNo }); K4.setDeadline(T_DOM); K4.push(); }
    else if(a.a === 'dpass' && !can && !H4.deck.length){
      st.passes++; st.log = `${prof(uid).display_name} passou`;
      if(st.passes >= st.order.length){ dRoundEnd(st, null, 'trancou'); return; }
      st.turn = nextIdx(st, 1); K4.setDeadline(T_DOM); K4.push();
    }
  },
  tick(st){
    if(st.phase === 'rend'){
      const top = Math.max(0, ...Object.values(st.tot));
      if(top >= DOM_TARGET || st.handNo >= DOM_ROUNDS){ st.winner = Object.keys(st.tot).find(u => st.tot[u] === top) || null; if(st.winner) st.scores[st.winner] = (st.scores[st.winner] || 0) + 50; K4.endGame(); return; }
      dDeal(st); K4.push(); return;
    }
    if(st.phase !== 'play') return;
    if(H4.gid !== st.id){ K4.feed({ sys: 'Quem estava com as pedras saiu da call, então a partida acabou.' }); K4.endGame(); return; }
    const here = pres4(); if(st.order.filter(u => here.includes(u)).length < 2){ K4.feed({ sys: 'Saiu gente da call, então a partida acabou.' }); K4.endGame(); return; }
    const u = curU(st), h = H4.hands[u] || [];
    // demorou: joga a primeira que serve, ou compra, ou passa
    const i = h.findIndex(t => dFits(st, t).length);
    if(i >= 0){ dPlace(st, u, i, dFits(st, h[i])[0]); return; }
    if(H4.deck.length){ h.push(H4.deck.pop()); st.counts[u] = h.length; st.bone = H4.deck.length; p4Send(st, u, 'dom', { hand: h, handNo: st.handNo }); st.log = `${prof(u).display_name} demorou: comprou`; K4.setDeadline(5000); K4.push(); return; }
    st.passes++; st.log = `${prof(u).display_name} demorou e passou`;
    if(st.passes >= st.order.length){ dRoundEnd(st, null, 'trancou'); return; }
    st.turn = nextIdx(st, 1); K4.setDeadline(T_DOM); K4.push();
  },
  render(st){
    const me = S.me.id, mine = st.order.includes(me), my = myPriv(st, 'dom'), hand = my && my.handNo === st.handNo ? my.hand : [];
    const myTurn = st.phase === 'play' && curU(st) === me;
    const can = hand.some(t => dFits(st, t).length);
    const seats = st.order.map((u, i) => `<div class="useat ${st.phase === 'play' && i === st.turn ? 'turn' : ''} ${u === me ? 'me' : ''}">${avatar(prof(u), 'sm')}<span>${K4.nm(u)}</span><b class="ucnt">${st.counts[u] ?? 0}</b><small class="dtot">${st.tot[u] || 0} pts</small></div>`).join('');
    const sel = D4.sel != null && hand[D4.sel] && myTurn ? D4.sel : null;
    const fitsSel = sel != null ? dFits(st, hand[sel]) : [];
    const chain = st.chain.length ? st.chain.map((t, i) => dTile(t, (i === 0 ? 'endl ' : '') + (i === st.chain.length - 1 ? 'endr' : ''))).join('') : '<span class="mut">Mesa vazia: qualquer pedra começa.</span>';
    if(st.phase === 'rend'){
      const r = st.rend;
      return `<div class="gdom"><div class="useats">${seats}</div><div class="thandend">${r.why === 'trancou' ? '🔒 Trancou! ' : '💥 Bateu! '}<b>${K4.nm(r.winner)}</b> levou <b>+${r.pts}</b></div>
        <div class="ureveal">${Object.entries(r.hands).filter(([, h]) => h.length).map(([u, h]) => `<div><small>${K4.nm(u)} · ${dSum(h)}</small>${h.map(t => dTile(t, 'mini')).join('')}</div>`).join('')}</div></div>`;
    }
    return `<div class="gdom"><div class="useats">${seats}</div>
      <div class="dtable">${sel != null && fitsSel.includes('L') && st.chain.length ? '<button class="btn sm dside" data-g="dside" data-s="L">◀ Aqui</button>' : ''}<div class="dchain">${chain}</div>${sel != null && fitsSel.includes('R') && st.chain.length ? '<button class="btn sm dside" data-g="dside" data-s="R">Aqui ▶</button>' : ''}</div>
      <div class="ulog">${esc(st.log || '')} · <small>${st.bone} no monte · rodada ${st.handNo}/${DOM_ROUNDS} · até ${DOM_TARGET} pts</small></div>
      ${mine ? `<div class="dhand">${hand.map((t, i) => { const ok = myTurn && dFits(st, t).length; return `<button class="dbtn ${ok ? 'ok' : ''} ${sel === i ? 'sel' : ''}" data-g="dplay" data-i="${i}" ${ok ? '' : 'disabled'}>${dTile(t)}</button>`; }).join('') || '<span class="mut small">Esperando as pedras…</span>'}</div>
        <div class="uacts">${myTurn ? (can ? '<span class="tyour">Sua vez! Escolha uma pedra</span>' : st.bone ? '<button class="btn" data-g="dbuy">Comprar do monte</button>' : '<button class="btn sec" data-g="dpass">Passar a vez</button>') : st.phase === 'play' ? `<span class="mut">Vez de ${K4.nm(curU(st))}</span>` : ''}</div>`
        : '<p class="mut small">Você está assistindo.</p>'}</div>`;
  },
  endExtra(st){ return st.winner ? `<div class="truend">🁫 <b>${K4.nm(st.winner)}</b> ganhou o dominó com <b>${st.tot[st.winner]}</b> pontos!</div>` : ''; },
  click(k, b, st){
    const my = myPriv(st, 'dom'), hand = my ? my.hand : [];
    if(k === 'dplay'){
      const i = +b.dataset.i, f = dFits(st, hand[i] || [-1, -1]);
      if(f.length === 1 || !st.chain.length){ D4.sel = null; K4.act({ a: 'dplay', i, side: f[0] || 'R' }); }
      else if(f.length === 2 && hand[i][0] === hand[i][1] && st.L === st.R){ D4.sel = null; K4.act({ a: 'dplay', i, side: 'R' }); }
      else { D4.sel = i; K4.render(); }
      return true;
    }
    if(k === 'dside'){ const i = D4.sel; D4.sel = null; K4.act({ a: 'dplay', i, side: b.dataset.s }); return true; }
    if(k === 'dbuy'){ K4.act({ a: 'dbuy' }); return true; }
    if(k === 'dpass'){ K4.act({ a: 'dpass' }); return true; }
  },
});
const D4 = { sel: null };

/* ============================ IMAGEM & AÇÃO ============================ */
const T_MIM = 60000, T_MIM_SHOW = 5000;
const MIM_WORDS = ('escovar os dentes,andar de bicicleta,pescar,dirigir,nadar,cozinhar,tocar violão,jogar futebol,surfar,pular corda,tirar selfie,dançar funk,lavar louça,trocar fralda,passar roupa,pintar parede,fazer churrasco,jogar boliche,escalar,remar,tomar banho,acordar atrasado,perder o ônibus,levar choque,pisar no lego,ver um fantasma,abrir um presente,soprar velas,andar de skate,patinar no gelo,jogar videogame,assistir filme de terror,montar barraca,ordenhar vaca,cortar cabelo,fazer as unhas,maquiar,costurar,carregar peso,correr maratona,gol,pênalti,pipoca,sorvete,espaguete,melancia,abacaxi,cachorro,gato,galinha,macaco,elefante,canguru,pinguim,cobra,borboleta,polvo,tubarão,dinossauro,girafa,aranha,palhaço,mágico,bombeiro,policial,médico,dentista,professor,garçom,astronauta,pirata,zumbi,vampiro,super-herói,ninja,princesa,robô,motoboy,DJ,youtuber,goleiro,juiz de futebol,salva-vidas,piloto de avião,celular,guarda-chuva,micro-ondas,liquidificador,aspirador de pó,secador de cabelo,ventilador,controle remoto,fone de ouvido,geladeira,chuveiro,escada rolante,elevador,roda-gigante,montanha-russa,carrinho de supermercado,avião,helicóptero,trem,barco,foguete,moto,semáforo,chuva,raio,terremoto,vulcão,tornado,neve,arco-íris,praia,acampamento,casamento,aniversário,formatura,Carnaval,Natal,Ano-Novo,Festa Junina,show de rock,velório,mudança,entrevista de emprego,primeiro encontro,ressaca,ataque de riso,soluço,espirro,cócegas,sonâmbulo,ronco,medo de altura,dor de dente,queimar a língua').split(',');
const MIM_MODES = [['🤐', 'Mímica', 'Sem falar nada! Ligue a câmera e use o corpo.'], ['🗣️', 'Explicar', 'Pode falar, mas não pode dizer a palavra (nem pedaços dela).'], ['🎵', 'Só sons', 'Sem palavras: só barulhos, sons e cantarolar.']];
function mimTurn(st){
  st.turnNo = (st.turnNo || 0) + 1;
  if(st.turnNo > st.turns){ const w = st.tpts[0] === st.tpts[1] ? -1 : st.tpts[0] > st.tpts[1] ? 0 : 1; st.winTeam = w; st.teams.forEach((t, i) => t.forEach(u => { if(i === w || w === -1) st.scores[u] = (st.scores[u] || 0) + (w === -1 ? 20 : 50); })); K4.endGame(); return; }
  const team = (st.turnNo - 1) % 2, members = st.teams[team].filter(u => pres4().includes(u));
  const list = members.length ? members : st.teams[team];
  st.ptr[team] = ((st.ptr[team] ?? -1) + 1) % list.length;
  st.actor = list[st.ptr[team]]; st.team = team;
  const used = H4.used || (H4.used = []);
  const w = K4.shuffle(MIM_WORDS.filter(x => !used.includes(x)))[0] || K4.shuffle(MIM_WORDS)[0]; used.push(w);
  H4.word = w; H4.gid = st.id; st.mode = Math.floor(Math.random() * MIM_MODES.length);
  st.word = null; st.got = null; st.skips = 0; st.phase = 'act'; K4.setDeadline(T_MIM);
  p4Send(st, st.actor, 'mim', { word: w, turnNo: st.turnNo });
  K4.feed({ sys: `Vez de ${prof(st.actor).display_name} (Time ${team + 1}) · ${MIM_MODES[st.mode][1]}` });
  K4.push();
}
const mimGuessers = st => { const mates = st.teams[st.team].filter(u => u !== st.actor && pres4().includes(u)); return mates.length ? mates : st.players.filter(u => u !== st.actor); };
App.registerGame('mimica', { name: 'Imagem & Ação', icon: '🎭', desc: 'Dois times. Na sua vez você recebe uma palavra secreta e tem 60 s para o seu time adivinhar — às vezes só com mímica (ligue a câmera!), às vezes explicando sem dizer a palavra, às vezes só com sons.', min: 2 }, {
  start(st){
    const sh = K4.shuffle(st.players); st.teams = [[], []]; sh.forEach((u, i) => st.teams[i % 2].push(u));
    st.tpts = [0, 0]; st.ptr = {}; st.turns = Math.min(16, Math.max(6, st.players.length * 2)); st.turnNo = 0; H4.used = [];
    mimTurn(st);
  },
  act(st, uid, a){
    if(st.phase !== 'act' || H4.gid !== st.id) return;
    if(a.a === 'mskip' && uid === st.actor && st.skips < 1){
      st.skips++; const used = H4.used; const w = K4.shuffle(MIM_WORDS.filter(x => !used.includes(x)))[0]; used.push(w); H4.word = w;
      p4Send(st, st.actor, 'mim', { word: w, turnNo: st.turnNo }); K4.feed({ sys: `${prof(uid).display_name} pulou a palavra` }); K4.push(); return;
    }
    if(a.a === 'mguess' && uid !== st.actor && mimGuessers(st).includes(uid)){
      const g = K4.norm(String(a.text || '').slice(0, 60)), w = K4.norm(H4.word);
      if(!g) return;
      const ok = g === w || (w.length > 5 && K4.lev(g, w) <= 1) || g.replace(/ /g, '') === w.replace(/ /g, '');
      if(ok){
        const team = st.teams[0].includes(uid) ? 0 : 1;
        st.tpts[team]++; st.scores[uid] = (st.scores[uid] || 0) + 10; st.scores[st.actor] = (st.scores[st.actor] || 0) + (team === st.team ? 10 : 0);
        st.got = uid; st.word = H4.word; st.phase = 'show'; K4.feed({ uid, text: '✅ ' + H4.word, ok: true }); K4.setDeadline(T_MIM_SHOW); K4.push();
      } else { K4.feed({ uid, text: String(a.text).slice(0, 60) }); K4.push(); }
    }
  },
  tick(st){
    if(st.phase === 'act'){ st.word = H4.gid === st.id ? H4.word : '???'; st.got = null; st.phase = 'show'; K4.feed({ sys: `Ninguém acertou: era "${st.word}"` }); K4.setDeadline(T_MIM_SHOW); K4.push(); }
    else if(st.phase === 'show') mimTurn(st);
  },
  render(st){
    const me = S.me.id, actor = st.actor === me, my = myPriv(st, 'mim');
    const word = actor && my && my.turnNo === st.turnNo ? my.word : null;
    const md = MIM_MODES[st.mode] || MIM_MODES[0];
    const canGuess = st.phase === 'act' && !actor && mimGuessers(st).includes(me);
    const teamBox = i => `<div class="mteam ${st.team === i ? 'on' : ''} ${st.teams[i].includes(me) ? 'mine' : ''}"><small>Time ${i + 1}</small><b>${st.tpts[i]}</b><span>${st.teams[i].map(u => K4.nm(u)).join(', ')}</span></div>`;
    const feed = (st.feed || []).slice(-6).map(f => f.sys ? `<div class="mf1 sys">${esc(f.sys)}</div>` : `<div class="mf1 ${f.ok ? 'ok' : ''}"><b>${K4.nm(f.uid)}:</b> ${esc(f.text)}</div>`).join('');
    return `<div class="gmim"><div class="mteams">${teamBox(0)}<div class="mvs">vez ${st.turnNo}/${st.turns}</div>${teamBox(1)}</div>
      <div class="mstage"><div class="mmode">${md[0]} <b>${md[1]}</b><small>${md[2]}</small></div>
        <div class="mactor">${avatar(prof(st.actor), 'lg')}<span>${actor ? 'É você!' : K4.nm(st.actor)}</span></div>
        ${st.phase === 'show' ? `<div class="mword">${st.got ? `✅ <b>${K4.nm(st.got)}</b> acertou:` : '⏰ Era:'} <em>${esc(st.word || '')}</em></div>`
          : actor ? `<div class="mword secret">Sua palavra: <em>${esc(word || '…')}</em>${st.skips < 1 ? '<button class="btn sec sm" data-g="mskip">Pular (1x)</button>' : ''}</div>${md[1] === 'Mímica' && !Voice.camStream ? '<small class="mut">Dica: ligue a câmera para a galera ver a mímica.</small>' : ''}`
          : `<div class="mword">${canGuess ? 'Adivinhe! Digite o palpite.' : 'O outro time está tentando… assista!'}</div>`}
      </div>
      <div class="mfeed">${feed}</div>
      ${canGuess ? '<form class="mguess" id="mgF"><input class="inp" id="mgIn" maxlength="60" placeholder="Seu palpite (Enter)" autocomplete="off"><button class="btn">Chutar</button></form>' : ''}</div>`;
  },
  endExtra(st){ return st.winTeam === undefined ? '' : `<div class="truend">🎭 ${st.winTeam === -1 ? `Empate! <b>${st.tpts[0]}</b> a <b>${st.tpts[1]}</b>` : `<b>Time ${st.winTeam + 1}</b> ganhou de <b>${st.tpts[st.winTeam]}</b> a <b>${st.tpts[1 - st.winTeam]}</b>`}</div>`; },
  after(st, el){
    const f = el && el.querySelector('#mgF');
    if(f){ const i = f.querySelector('#mgIn'); i.onkeydown = e => e.stopPropagation(); f.onsubmit = e => { e.preventDefault(); const v = i.value.trim(); if(v){ K4.act({ a: 'mguess', text: v }); i.value = ''; } i.focus(); }; }
  },
  click(k){ if(k === 'mskip'){ K4.act({ a: 'mskip' }); return true; } },
});

/* ============================ JOGO DA VELHA (torneio) ============================ */
const T_VEL = 20000, T_VEL_SHOW = 3500;
const VL = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const vWin = b => { for(const l of VL) if(b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { s: b[l[0]], l }; return null; };
function vPairs(list){ const out = []; for(let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1] || null]); return out; }
function vNextMatch(st){
  // pula os "passou direto" (sem adversário)
  while(true){
    const round = st.br[st.ri];
    if(st.mi >= round.length){
      const winners = st.wins[st.ri];
      if(winners.length <= 1){ st.champ = winners[0] || null; if(st.champ) st.scores[st.champ] = (st.scores[st.champ] || 0) + 100; K4.endGame(); return; }
      st.ri++; st.mi = 0; st.br.push(vPairs(winners)); st.wins.push([]); continue;
    }
    const [a, b] = round[st.mi];
    if(!b){ st.wins[st.ri].push(a); st.mi++; K4.feed({ sys: `${prof(a).display_name} passou direto para a próxima fase` }); continue; }
    const here = pres4();
    if(!here.includes(a) || !here.includes(b)){ const w = here.includes(a) ? a : b; st.wins[st.ri].push(w); st.mi++; K4.feed({ sys: `${prof(w).display_name} avançou (o outro saiu da call)` }); continue; }
    break;
  }
  const [a, b] = st.br[st.ri][st.mi];
  st.draws = 0; vNewBoard(st, [a, b]);
}
function vNewBoard(st, pair){
  const flip = st.draws % 2 === 1;
  st.px = flip ? pair[1] : pair[0]; st.po = flip ? pair[0] : pair[1];
  st.board = Array(9).fill(''); st.vturn = 'X'; st.vres = null; st.phase = 'play'; K4.setDeadline(T_VEL); K4.push();
}
function vMove(st, i){
  if(st.board[i]) return;
  st.board[i] = st.vturn;
  const w = vWin(st.board);
  if(w){ const uid = w.s === 'X' ? st.px : st.po; st.vres = { w: uid, line: w.l }; st.scores[uid] = (st.scores[uid] || 0) + 20; st.wins[st.ri].push(uid); st.mi++; st.phase = 'show'; K4.setDeadline(T_VEL_SHOW); K4.push(); return; }
  if(st.board.every(Boolean)){
    st.draws++;
    if(st.draws >= 3){ const uid = Math.random() < 0.5 ? st.px : st.po; st.vres = { w: uid, coin: true }; st.wins[st.ri].push(uid); st.mi++; st.phase = 'show'; K4.feed({ sys: `3 empates seguidos: a moeda escolheu ${prof(uid).display_name} 🪙` }); K4.setDeadline(T_VEL_SHOW); K4.push(); return; }
    st.vres = { draw: true }; st.phase = 'show'; K4.setDeadline(2500); K4.push(); return;
  }
  st.vturn = st.vturn === 'X' ? 'O' : 'X'; K4.setDeadline(T_VEL); K4.push();
}
App.registerGame('velha', { name: 'Jogo da Velha', icon: '⭕', desc: 'Torneio com chaveamento: cada partida é um contra um e a call toda assiste. Quem ganha avança até sobrar o campeão. Empatou? Joga de novo (na terceira, a moeda decide).', min: 2 }, {
  start(st){ st.br = [vPairs(K4.shuffle(st.players))]; st.wins = [[]]; st.ri = 0; st.mi = 0; st.champ = null; vNextMatch(st); },
  act(st, uid, a){
    if(st.phase !== 'play' || a.a !== 'vmove') return;
    const who = st.vturn === 'X' ? st.px : st.po; if(uid !== who) return;
    const i = a.i | 0; if(i < 0 || i > 8) return; vMove(st, i);
  },
  tick(st){
    if(st.phase === 'show'){ if(st.vres && st.vres.draw) vNewBoard(st, st.br[st.ri][st.mi]); else vNextMatch(st); return; }
    if(st.phase !== 'play') return;
    const who = st.vturn === 'X' ? st.px : st.po;
    if(!pres4().includes(who)){ const other = who === st.px ? st.po : st.px; st.vres = { w: other }; st.wins[st.ri].push(other); st.mi++; st.phase = 'show'; K4.setDeadline(T_VEL_SHOW); K4.push(); return; }
    const free = st.board.map((v, i) => v ? -1 : i).filter(i => i >= 0); vMove(st, free[Math.floor(Math.random() * free.length)]);
  },
  render(st){
    const me = S.me.id, who = st.vturn === 'X' ? st.px : st.po, myTurn = st.phase === 'play' && who === me;
    const line = st.vres && st.vres.line || [];
    const names = r => st.br[r].map(([a, b]) => { const w = st.wins[r] || []; return `<div class="vbm">${[a, b].map(u => u ? `<span class="${w.includes(u) ? 'won' : (w.includes(a === u ? b : a) ? 'lost' : '')}">${K4.nm(u)}</span>` : '<span class="bye">—</span>').join('<i>x</i>')}</div>`; }).join('');
    const title = r => { const left = st.br[r].length * 2; return left <= 2 ? 'Final' : left <= 4 ? 'Semifinal' : left <= 8 ? 'Quartas' : `Fase ${r + 1}`; };
    return `<div class="gvelha"><div class="vbr">${st.br.map((_, r) => `<div class="vbr1 ${r === st.ri ? 'on' : ''}"><small>${title(r)}</small>${names(r)}</div>`).join('')}</div>
      <div class="vmatch"><span class="vpl x ${st.vturn === 'X' && st.phase === 'play' ? 'turn' : ''}">❌ ${K4.nm(st.px)}</span><b>vs</b><span class="vpl o ${st.vturn === 'O' && st.phase === 'play' ? 'turn' : ''}">⭕ ${K4.nm(st.po)}</span>${st.draws ? `<small class="mut">${st.draws} empate(s)</small>` : ''}</div>
      <div class="vboard">${st.board.map((v, i) => `<button class="vc ${v ? 'v' + v : ''} ${line.includes(i) ? 'win' : ''}" ${myTurn && !v ? `data-g="vmove" data-i="${i}"` : 'disabled'}>${v === 'X' ? '✕' : v === 'O' ? '◯' : ''}</button>`).join('')}</div>
      <div class="uacts">${st.phase === 'show' ? (st.vres && st.vres.draw ? '<b>Deu velha! Joga de novo…</b>' : `<b>🏆 ${K4.nm(st.vres && st.vres.w)} venceu${st.vres && st.vres.coin ? ' na moeda' : ''}!</b>`) : myTurn ? '<span class="tyour">Sua vez!</span>' : `<span class="mut">Vez de ${K4.nm(who)}</span>`}</div></div>`;
  },
  endExtra(st){ return st.champ ? `<div class="truend">⭕ <b>${K4.nm(st.champ)}</b> é campeão do torneio de Jogo da Velha! 🏆</div>` : ''; },
  click(k, b){ if(k === 'vmove'){ K4.act({ a: 'vmove', i: +b.dataset.i }); return true; } },
});
App._g4 = { H4, uCan, dFits };
