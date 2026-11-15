/* =====================================================================
   v6.21: MAIS JOGOS NA CHAMADA — Stop (adedonha), Quem sou eu? e Truco paulista
   Usam o mesmo esquema dos outros jogos: quem abre é o anfitrião e manda o estado para todos.
   No Truco, cada um recebe as próprias cartas em particular (ninguém vê a mão dos outros na tela).
   ===================================================================== */
const J = App.G;
const J2 = { drafts: {}, sent: {}, hands: null, handsGid: null, myHand: [], myHandGid: null, shownShout: 0 };
const pres = () => J.presentIds();
const inG = st => st.players.includes(S.me.id);

/* ============================ STOP ============================ */
const STOP_CATS = ['Nome', 'Animal', 'Cor', 'Fruta', 'Comida', 'Cidade, estado ou país', 'Objeto', 'Marca', 'Profissão', 'Filme ou série', 'Parte do corpo', 'Time de futebol', 'Famoso', 'Minha sogra é…', 'Algo que tem na cozinha', 'Verbo', 'Carro', 'Personagem', 'Música ou banda', 'Coisa que se leva na praia', 'Jogo', 'Desculpa para faltar'];
const STOP_LETTERS = 'ABCDEFGILMNOPRSTV'.split('');
const T_STOP_TYPE = 120000, T_STOP_GRACE = 3500, T_STOP_COLLECT = 4500, T_STOP_REVIEW = 45000, T_STOP_SCORE = 8000;
function stopRound(st){
  st.round = (st.round || 0) + 1;
  if(st.round > st.rounds){ J.endGame(); return; }
  const left = STOP_LETTERS.filter(l => !(st.used || []).includes(l));
  st.letter = J.shuffle(left.length ? left : STOP_LETTERS)[0]; st.used = (st.used || []).concat(st.letter);
  st.ans = {}; st.vetos = {}; st.stopper = null; st.roundPts = null; st.phase = 'type'; J.setDeadline(T_STOP_TYPE); J.push();
}
function stopValid(st, uid, ci){
  const a = J.norm(((st.ans[uid] || {})[ci]) || '');
  if(a.length < 2 || a[0] !== J.norm(st.letter)) return false;
  const others = st.players.length - 1, need = Math.max(1, Math.ceil(others / 2));
  return ((st.vetos[uid + '|' + ci] || []).length) < need;
}
function stopScore(st){
  st.roundPts = {};
  st.players.forEach(u => st.roundPts[u] = {});
  st.cats.forEach((c, ci) => {
    const valid = st.players.filter(u => stopValid(st, u, ci));
    const count = {}; valid.forEach(u => { const k = J.norm(st.ans[u][ci]); count[k] = (count[k] || 0) + 1; });
    st.players.forEach(u => { const ok = valid.includes(u); const pts = ok ? (count[J.norm(st.ans[u][ci])] > 1 ? 5 : 10) : 0; st.roundPts[u][ci] = pts; st.scores[u] = (st.scores[u] || 0) + pts; });
  });
  st.phase = 'score'; J.setDeadline(T_STOP_SCORE); J.push();
}
function stopReview(st){ st.phase = 'review'; J.setDeadline(T_STOP_REVIEW); J.push(); }
App.registerGame('stop', { name: 'Stop', icon: '✋', desc: 'Sai uma letra e todo mundo preenche as categorias. Resposta única vale 10, repetida vale 5. A galera vota nas respostas duvidosas.', min: 2 }, {
  start(st){ st.cats = J.shuffle(STOP_CATS).slice(0, 6); st.rounds = 5; st.round = 0; st.used = []; stopRound(st); },
  act(st, uid, a){
    if(a.a === 'stop' && st.phase === 'type' && st.players.includes(uid)){ st.stopper = uid; st.phase = 'stopping'; J.setDeadline(T_STOP_GRACE); J.push(); }
    else if(a.a === 'answers' && (st.phase === 'collect' || st.phase === 'stopping' || st.phase === 'type') && st.players.includes(uid) && a.round === st.round){
      const clean = {}; st.cats.forEach((c, ci) => { const v = String((a.ans || {})[ci] || '').trim().slice(0, 40); if(v) clean[ci] = v; });
      st.ans[uid] = clean;
      if(st.phase === 'collect' && st.players.filter(u => pres().includes(u)).every(u => st.ans[u])) stopReview(st); else J.push();
    }
    else if(a.a === 'veto' && st.phase === 'review' && st.players.includes(uid) && a.u !== uid && st.players.includes(a.u)){
      const k = a.u + '|' + (a.ci | 0), l = st.vetos[k] || [];
      st.vetos[k] = l.includes(uid) ? l.filter(x => x !== uid) : l.concat(uid); J.push();
    }
    else if(a.a === 'next' && uid === st.host && st.phase === 'review') stopScore(st);
  },
  tick(st){
    if(st.phase === 'type' || st.phase === 'stopping'){ st.phase = 'collect'; J.setDeadline(T_STOP_COLLECT); J.push(); }
    else if(st.phase === 'collect') stopReview(st);
    else if(st.phase === 'review') stopScore(st);
    else if(st.phase === 'score') stopRound(st);
  },
  render(st, inGame){
    const d = J2.drafts[st.id + ':' + st.round] || {};
    const head = `<div class="stophead"><div class="stopletter">${esc(st.letter)}</div><div><b>Rodada ${st.round} de ${st.rounds}</b><small>Tudo começando com <b>${esc(st.letter)}</b></small></div></div>`;
    if(st.phase === 'type' || st.phase === 'stopping'){
      const can = inGame;
      return `<div class="gstop">${head}
        ${st.phase === 'stopping' ? `<div class="stopbang">✋ STOP! <small>${J.nm(st.stopper)} parou. Termine em ${Math.max(0, Math.ceil((st.dl - J.now()) / 1000))} s…</small></div>` : ''}
        <div class="stopform">${st.cats.map((c, ci) => `<label class="stopf"><span>${esc(c)}</span><input class="inp" id="stIn${ci}" data-stin="${ci}" maxlength="40" autocomplete="off" value="${esc(d[ci] || '')}" ${can ? '' : 'disabled'} placeholder="${esc(st.letter)}…"></label>`).join('')}</div>
        ${can ? `<div class="gacts"><button class="btn ok big" data-g="ststop" id="stStop" ${st.phase === 'stopping' ? 'disabled' : ''}>✋ STOP!</button><span class="mut small" id="stHint"></span></div>` : '<p class="mut">Você está só olhando esta rodada.</p>'}</div>`;
    }
    if(st.phase === 'collect') return `<div class="gstop">${head}<div class="stopbang">✋ STOP! <small>Recolhendo as respostas da galera…</small></div></div>`;
    const showPts = st.phase === 'score';
    return `<div class="gstop">${head}
      <p class="mut small">${showPts ? 'Pontos da rodada: única = 10, repetida = 5.' : 'Clique numa resposta dos outros para votar que ela <b>não vale</b>. Com metade dos votos ela cai.'}</p>
      <div class="stoptbl"><table><thead><tr><th></th>${st.players.map(u => `<th>${avatar(prof(u), 'xs')}<span>${J.nm(u)}</span></th>`).join('')}</tr></thead><tbody>
      ${st.cats.map((c, ci) => `<tr><th>${esc(c)}</th>${st.players.map(u => {
        const v = (st.ans[u] || {})[ci] || '', ok = stopValid(st, u, ci), vt = (st.vetos[u + '|' + ci] || []), mine = vt.includes(S.me.id);
        const pts = showPts ? `<em>${st.roundPts[u][ci]}</em>` : '';
        return `<td><button class="stcell ${v ? (ok ? 'ok' : 'bad') : 'empty'} ${mine ? 'voted' : ''}" ${!showPts && u !== S.me.id && v && inGame ? `data-g="stveto" data-u="${u}" data-ci="${ci}"` : 'disabled'}>${v ? esc(v) : '—'}${vt.length ? `<small>👎 ${vt.length}</small>` : ''}${pts}</button></td>`;
      }).join('')}</tr>`).join('')}
      ${showPts ? `<tr class="sttot"><th>Rodada</th>${st.players.map(u => `<td><b>+${Object.values(st.roundPts[u]).reduce((a, b) => a + b, 0)}</b></td>`).join('')}</tr>` : ''}
      </tbody></table></div>
      ${!showPts && J.amHost() ? `<div class="gacts"><button class="btn ok" data-g="stnext">Contar os pontos</button></div>` : ''}
      ${showPts ? J.scoreList(st) : ''}</div>`;
  },
  after(st, el){
    const key = st.id + ':' + st.round;
    J2.drafts[key] = J2.drafts[key] || {};
    el.querySelectorAll('[data-stin]').forEach(inp => {
      inp.oninput = () => { J2.drafts[key][inp.dataset.stin] = inp.value; stopHint(st, el); };
      inp.onkeydown = e => { e.stopPropagation(); if(e.key === 'Enter'){ const n = el.querySelector(`#stIn${+inp.dataset.stin + 1}`); if(n) n.focus(); } };
    });
    stopHint(st, el);
    // na hora do STOP, cada um manda as próprias respostas uma vez
    if(st.phase === 'collect' && inG(st) && !J2.sent[key]){ J2.sent[key] = 1; J.act({ a: 'answers', round: st.round, ans: J2.drafts[key] }); }
  },
  click(k, b, st){
    if(k === 'ststop'){ const key = st.id + ':' + st.round; J.act({ a: 'answers', round: st.round, ans: J2.drafts[key] || {} }); J.act({ a: 'stop' }); return true; }
    if(k === 'stveto'){ J.act({ a: 'veto', u: b.dataset.u, ci: +b.dataset.ci }); return true; }
    if(k === 'stnext'){ J.act({ a: 'next' }); return true; }
  },
});
function stopHint(st, el){
  const btn = el.querySelector('#stStop'), hint = el.querySelector('#stHint'); if(!btn) return;
  const d = J2.drafts[st.id + ':' + st.round] || {};
  const filled = st.cats.filter((c, ci) => J.norm(d[ci] || '')[0] === J.norm(st.letter)).length;
  if(st.phase === 'type') btn.disabled = filled < st.cats.length;
  if(hint) hint.textContent = filled < st.cats.length ? `${filled} de ${st.cats.length} preenchidas com ${st.letter}` : 'Tudo pronto! Aperte STOP';
}

/* ============================ QUEM SOU EU ============================ */
const QSE = ('Neymar,Pelé,Anitta,Xuxa,Silvio Santos,Faustão,Ronaldinho Gaúcho,Ayrton Senna,Ivete Sangalo,Gusttavo Lima,Luan Santana,Casimiro,Gaules,Felipe Neto,Whindersson Nunes,Galvão Bueno,Marta,Rebeca Andrade,Vini Jr.,Gisele Bündchen,Messi,Cristiano Ronaldo,Taylor Swift,Beyoncé,Michael Jackson,Albert Einstein,Leonardo da Vinci,Napoleão,Cleópatra,Papai Noel,Coelhinho da Páscoa,Fada do Dente,Saci,Curupira,Mula sem cabeça,Iara,Chaves,Seu Madruga,Chapolin,Mônica,Cebolinha,Cascão,Magali,Bob Esponja,Patrick Estrela,Mickey,Pato Donald,Shrek,Homem-Aranha,Batman,Superman,Mulher-Maravilha,Hulk,Thor,Homer Simpson,Pikachu,Mario,Sonic,Kratos,Lara Croft,Harry Potter,Darth Vader,Yoda,Frodo,Gandalf,Elsa,Simba,Buzz Lightyear,Woody,Pinóquio,Cinderela,Branca de Neve,Peter Pan,Capitão Gancho,Drácula,Frankenstein,Múmia,Lobisomem,Zumbi,Alienígena,Astronauta,Bombeiro,Policial,Médico,Professor,Palhaço,Pirata,Ninja,Samurai,Cowboy,Mágico,Cozinheiro,Jogador de futebol,Youtuber,Streamer,Pinguim,Girafa,Elefante,Tubarão,Polvo,Capivara,Bicho-preguiça,Tucano,Arara,Jacaré,Gato,Cachorro,Galinha,Vaca,Abelha,Formiga,Dinossauro,Dragão,Unicórnio,Sereia,Robô,Fantasma,Vampiro,Bruxa').split(',');
const T_QS_TURN = 75000, T_QS_RIGHT = 4500, QS_MAX_TURNS = 12;
function qsNext(st){
  const order = st.order, n = order.length;
  for(let k = 1; k <= n; k++){
    const i = ((st.turn < 0 ? -1 : st.turn) + k) % n, u = order[i];
    if(!st.guessed[u] && pres().includes(u) && (st.turns[u] || 0) < QS_MAX_TURNS){
      st.turn = i; st.asker = u; st.turns[u] = (st.turns[u] || 0) + 1; st.answers = {}; st.phase = 'ask'; J.setDeadline(T_QS_TURN); J.push(); return;
    }
  }
  J.endGame();
}
function qsMatch(guess, target){
  const g = J.norm(guess), t = J.norm(target); if(!g) return false;
  if(g === t) return true;
  if(t.length > 5 && J.lev(g, t) <= 2) return true;
  if(t.length <= 5 && J.lev(g, t) <= 1 && g.length === t.length) return true;
  return g.length >= 4 && t.split(' ').some(w => w.length >= 4 && (w === g || J.lev(w, g) <= 1));
}
App.registerGame('quemsou', { name: 'Quem sou eu?', icon: '🤔', desc: 'Cada um recebe um personagem que todo mundo vê, menos você. Na sua vez, pergunte em voz alta (só sim ou não) e tente adivinhar quem você é.', min: 2 }, {
  start(st){
    const names = J.shuffle(QSE); st.who = {}; st.players.forEach((u, i) => st.who[u] = names[i]);
    st.order = J.shuffle(st.players); st.turn = -1; st.turns = {}; st.guessed = {}; st.answers = {};
    qsNext(st);
  },
  act(st, uid, a){
    if(a.a === 'qsans' && st.phase === 'ask' && uid !== st.asker && st.players.includes(uid) && ['sim', 'nao', 'talvez'].includes(a.v)){ st.answers[uid] = a.v; J.push(); }
    else if(a.a === 'qsguess' && st.phase === 'ask' && uid === st.asker){
      const text = String(a.text || '').slice(0, 60);
      if(qsMatch(text, st.who[uid])){
        const pts = Math.max(200, 1100 - 100 * (st.turns[uid] || 1));
        st.guessed[uid] = st.turns[uid]; st.scores[uid] = (st.scores[uid] || 0) + pts;
        J.feed({ uid, ok: true, pts, text: st.who[uid] }); st.phase = 'right'; J.setDeadline(T_QS_RIGHT); J.push();
      }else{ J.feed({ uid, text }); qsNext(st); }
    }
    else if(a.a === 'qspass' && st.phase === 'ask' && uid === st.asker) qsNext(st);
  },
  tick(st){ if(st.phase === 'ask' || st.phase === 'right') qsNext(st); },
  render(st, inGame){
    const me = S.me.id, asking = st.asker === me, my = (st.answers || {})[me];
    const cnt = { sim: 0, nao: 0, talvez: 0 }; Object.values(st.answers || {}).forEach(v => cnt[v]++);
    const cards = st.order.map(u => {
      const hidden = u === me && !st.guessed[me];
      return `<div class="qscard ${u === st.asker ? 'turn' : ''} ${st.guessed[u] ? 'done' : ''}">${avatar(prof(u), 'lg')}<b>${J.nm(u)}</b>
        <div class="qsname ${hidden ? 'hid' : ''}">${hidden ? '???' : esc(st.who[u])}</div>${st.guessed[u] ? `<small>✓ em ${st.guessed[u]} vez${st.guessed[u] > 1 ? 'es' : ''}</small>` : u === st.asker ? '<small>🎤 perguntando</small>' : ''}</div>`;
    }).join('');
    let panel = '';
    if(st.phase === 'right'){ const f = (st.feed || []).slice(-1)[0]; panel = `<div class="qsright">🎉 <b>${J.nm(st.asker)}</b> descobriu: era <b>${esc(st.who[st.asker])}</b>! ${f && f.pts ? `+${f.pts}` : ''}</div>`; }
    else if(asking) panel = `<div class="qsask"><b>Sua vez!</b> Pergunte em voz alta algo que dê para responder com sim ou não (ex.: “Eu sou uma pessoa de verdade?”). A galera responde aqui embaixo.
        <div class="qsres"><span class="y">Sim ${cnt.sim}</span><span class="n">Não ${cnt.nao}</span><span class="t">Talvez ${cnt.talvez}</span></div>
        <div class="qsgform"><input class="inp" id="qsG" maxlength="60" placeholder="Já sabe? Chute quem você é" autocomplete="off"><button class="btn ok" data-g="qsguess">Chutar</button><button class="btn sec" data-g="qspass">Passar a vez</button></div></div>`;
    else if(inGame) panel = `<div class="qsvote"><span>${J.nm(st.asker)} perguntou… a resposta é:</span><div class="qsbtns">${[['sim', 'Sim'], ['nao', 'Não'], ['talvez', 'Talvez / não sei']].map(([v, l]) => `<button class="btn ${my === v ? 'on' : 'sec'} qb-${v}" data-g="qsans" data-v="${v}">${l}</button>`).join('')}</div><small class="mut">${J.nm(st.asker)} é <b>${esc(st.who[st.asker])}</b> 🤫</small></div>`;
    return `<div class="gqs"><div class="qsgrid">${cards}</div>${panel}
      <div class="gfeed qsfeed">${(st.feed || []).slice(-6).map(f => f.ok ? `<div class="gf ok"><b>${J.nm(f.uid)}</b> acertou: ${esc(f.text)} (+${f.pts})</div>` : `<div class="gf"><b>${J.nm(f.uid)}</b> chutou “${esc(f.text)}” ❌</div>`).join('')}</div></div>`;
  },
  endExtra(st){ return `<div class="gtitles">${st.players.map(u => `<div class="gtt"><span>${J.nm(u)} era</span><b>${esc(st.who[u])}</b></div>`).join('')}</div>`; },
  after(st, el){ const i = el.querySelector('#qsG'); if(i) i.onkeydown = e => { e.stopPropagation(); if(e.key === 'Enter' && i.value.trim()){ J.act({ a: 'qsguess', text: i.value.trim() }); i.value = ''; } }; },
  click(k, b, st){
    if(k === 'qsans'){ J.act({ a: 'qsans', v: b.dataset.v }); return true; }
    if(k === 'qsguess'){ const i = J.el && J.el.querySelector('#qsG'); if(i && i.value.trim()){ J.act({ a: 'qsguess', text: i.value.trim() }); i.value = ''; } return true; }
    if(k === 'qspass'){ J.act({ a: 'qspass' }); return true; }
  },
});

/* ============================ TRUCO PAULISTA ============================ */
const T_RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const T_SUITS = ['♦', '♠', '♥', '♣'];   // força da manilha: ouros < espadas < copas < paus (zap)
const T_PLAY = 40000, T_RAISE = 30000, T_HANDEND = 3800;
const RAISE_NAME = { 3: 'TRUCO!', 6: 'SEIS!', 9: 'NOVE!', 12: 'DOZE!' };
const cardStr = c => T_RANKS[c.r] + T_SUITS[c.s];
const manilhaOf = vira => (vira.r + 1) % 10;
const power = (c, man) => c.r === man ? 100 + c.s : c.r;
const teamOf = (st, seat) => seat % 2;
const seatOf = (st, uid) => st.seats.indexOf(uid);
function tSend(uid, hand, st){
  if(uid === S.me.id){ J2.myHand = hand.slice(); J2.myHandGid = st.id + ':' + st.handNo; return; }
  sendToUser(uid, 'game-priv', { gid: st.id, handNo: st.handNo, hand });
}
App.onGamePriv = pl => {
  const st = J.st; if(!st || !pl || pl.gid !== st.id) return;
  J2.myHand = pl.hand || []; J2.myHandGid = st.id + ':' + pl.handNo; J.render();
};
function tNewHand(st){
  if(st.pts[0] >= 12 || st.pts[1] >= 12){ tFinish(st); return; }
  const n = st.seats.length;
  st.handNo = (st.handNo || 0) + 1;
  st.dealer = ((st.dealer ?? -1) + 1) % n;
  const deck = J.shuffle(T_RANKS.flatMap((r, ri) => T_SUITS.map((s, si) => ({ r: ri, s: si }))));
  st.vira = deck.pop(); st.man = manilhaOf(st.vira);
  J2.hands = {}; J2.handsGid = st.id;
  st.seats.forEach((u, i) => { J2.hands[i] = [deck.pop(), deck.pop(), deck.pop()]; });
  st.counts = st.seats.map(() => 3);
  st.vazas = []; st.table = []; st.lastTable = null; st.lead = (st.dealer + 1) % n; st.turnSeat = st.lead;
  st.onze = st.pts[0] === 11 || st.pts[1] === 11;
  st.value = st.onze ? 3 : 1; st.raise = null; st.lastRaiseTeam = -1; st.handWin = null;
  st.phase = 'play'; J.setDeadline(T_PLAY);
  st.seats.forEach((u, i) => tSend(u, J2.hands[i], st));
  J.push();
  // quem entrar atrasado no canal privado recebe de novo
  setTimeout(() => { if(J.st && J.st.id === st.id && J.st.handNo === st.handNo && J2.hands) st.seats.forEach((u, i) => u !== S.me.id && tSend(u, J2.hands[i], st)); }, 1500);
}
function tHandWinner(v){
  const w = [0, 0]; v.forEach(x => { if(x >= 0) w[x]++; });
  if(w[0] >= 2) return 0; if(w[1] >= 2) return 1;
  if(v.length >= 2){
    if(v[0] === -1){ if(v[1] !== -1) return v[1]; if(v.length === 3) return v[2] === -1 ? -2 : v[2]; return null; }
    if(v[1] === -1) return v[0];
  }
  if(v.length === 3) return v[2] === -1 ? v[0] : v[2];
  return null;
}
function tEndHand(st, team, why){
  st.handWin = { team, value: st.value, why };
  if(team >= 0) st.pts[team] = Math.min(12, st.pts[team] + st.value);
  st.raise = null; st.phase = 'handEnd'; J.setDeadline(T_HANDEND); J.push();
}
function tFinish(st){
  const win = st.pts[0] >= 12 ? 0 : 1;
  st.winTeam = win;
  st.players.forEach(u => { const t = teamOf(st, seatOf(st, u)); st.scores[u] = t === win ? 1000 + st.pts[t] * 20 : st.pts[t] * 40; });
  J.endGame();
}
function tShout(st, text, uid){ st.shout = { text, uid, at: Date.now() }; }
function tPlay(st, seat, idx){
  const hand = J2.hands[seat] || []; const card = hand[idx]; if(!card) return;
  hand.splice(idx, 1); st.counts[seat] = hand.length;
  st.table.push({ seat, c: card });
  tSend(st.seats[seat], hand, st);
  const n = st.seats.length;
  if(st.table.length < n){ st.turnSeat = (seat + 1) % n; J.setDeadline(T_PLAY); J.push(); return; }
  // fecha a vaza
  let best = null, bestP = -1, tie = false;
  st.table.forEach(t => { const p = power(t.c, st.man); if(p > bestP){ bestP = p; best = t; tie = false; } else if(p === bestP && teamOf(st, t.seat) !== teamOf(st, best.seat)) tie = true; });
  const res = tie ? -1 : teamOf(st, best.seat);
  st.vazas.push(res); st.lastTable = { cards: st.table, win: tie ? null : best.seat };
  st.table = [];
  const hw = tHandWinner(st.vazas);
  if(hw === -2){ tEndHand(st, -1, 'empate'); return; }
  if(hw !== null){ tEndHand(st, hw, 'vazas'); return; }
  st.lead = tie ? st.lead : best.seat; st.turnSeat = st.lead;
  J.setDeadline(T_PLAY); J.push();
}
App.registerGame('truco', { name: 'Truco', icon: '🃏', desc: 'Truco paulista com vira e manilha. 2 pessoas (um contra um) ou 4 (duplas: quem senta na frente é seu parceiro). Quem fizer 12 tentos ganha.', min: 2 }, {
  start(st){
    if(st.players.length !== 2 && st.players.length !== 4){ App.toast('Truco precisa de 2 ou 4 jogadores. Tire ou chame alguém.', true); st.phase = 'lobby'; J.push(); return; }
    st.seats = J.shuffle(st.players); st.pts = [0, 0]; st.dealer = -1; st.handNo = 0;
    tNewHand(st);
  },
  act(st, uid, a){
    const seat = seatOf(st, uid); if(seat < 0) return;
    const team = teamOf(st, seat);
    if(a.a === 'tplay' && st.phase === 'play' && !st.raise && st.turnSeat === seat) tPlay(st, seat, a.i | 0);
    else if(a.a === 'truco' && st.phase === 'play' && !st.raise && !st.onze && st.turnSeat === seat && st.value < 12 && st.lastRaiseTeam !== team){
      const to = st.value === 1 ? 3 : st.value + 3;
      st.raise = { team, to, by: uid }; tShout(st, RAISE_NAME[to], uid); J.setDeadline(T_RAISE); J.push();
    }
    else if(a.a === 'tresp' && st.phase === 'play' && st.raise && team !== st.raise.team){
      if(a.r === 'accept'){ st.value = st.raise.to; st.lastRaiseTeam = st.raise.team; st.raise = null; tShout(st, 'DESCE! 👊', uid); J.setDeadline(T_PLAY); J.push(); }
      else if(a.r === 'run'){ tShout(st, 'CORREU! 🏃', uid); tEndHand(st, st.raise.team, 'correu'); }
      else if(a.r === 'raise' && st.raise.to < 12){
        st.value = st.raise.to; st.lastRaiseTeam = st.raise.team;
        const to = st.value + 3; st.raise = { team, to, by: uid }; tShout(st, RAISE_NAME[to], uid); J.setDeadline(T_RAISE); J.push();
      }
    }
  },
  tick(st){
    if(st.phase === 'handEnd'){ tNewHand(st); return; }
    if(st.phase !== 'play') return;
    if(!J2.hands || J2.handsGid !== st.id){ J.feed({ sys: 'Quem dava as cartas saiu da call, então a partida acabou.' }); tFinish(st); return; }
    if(!st.seats.every(u => pres().includes(u))){ J.feed({ sys: 'Alguém saiu da call, então a partida acabou.' }); tFinish(st); return; }
    if(st.raise){ st.value = st.raise.to; st.lastRaiseTeam = st.raise.team; st.raise = null; tShout(st, 'Aceito (tempo) 👊'); J.setDeadline(T_PLAY); J.push(); return; }
    // demorou para jogar: joga a carta mais fraca
    const h = J2.hands[st.turnSeat] || []; if(!h.length) return;
    let wi = 0; h.forEach((c, i) => { if(power(c, st.man) < power(h[wi], st.man)) wi = i; });
    tPlay(st, st.turnSeat, wi);
  },
  render(st, inGame){
    const me = seatOf(st, S.me.id), n = st.seats.length, myTeam = me >= 0 ? teamOf(st, me) : 0;
    const teamName = t => st.seats.filter((u, i) => teamOf(st, i) === t).map(u => J.nm(u)).join(' e ');
    const card = (c, extra = '') => `<span class="tcard ${c.s === 0 || c.s === 2 ? 'red' : ''} ${c.r === st.man ? 'man' : ''} ${extra}"><b>${T_RANKS[c.r]}</b><i>${T_SUITS[c.s]}</i></span>`;
    // posições na mesa a partir de mim: eu embaixo, frente em cima, lados
    const pos = i => { const rel = ((i - (me >= 0 ? me : 0)) % n + n) % n; return n === 2 ? (rel === 0 ? 'b' : 't') : ['b', 'r', 't', 'l'][rel]; };
    const shown = st.phase === 'handEnd' || !st.table.length ? (st.lastTable ? st.lastTable.cards : []) : st.table;
    const seatsHtml = st.seats.map((u, i) => {
      const p = pos(i), turn = st.phase === 'play' && st.turnSeat === i && !st.raise;
      const played = shown.find(t => t.seat === i);
      return `<div class="tseat ${p} ${turn ? 'turn' : ''} t${teamOf(st, i)}">${avatar(prof(u), 'sm')}<span>${J.nm(u)}</span>${i !== me ? `<div class="tbacks">${'<span class="tback"></span>'.repeat(st.counts ? st.counts[i] : 0)}</div>` : ''}
        ${played ? `<div class="tplayed ${p}">${card(played.c, st.lastTable && st.lastTable.win === i && shown === st.lastTable.cards ? 'win' : '')}</div>` : ''}</div>`;
    }).join('');
    const myHand = J2.myHandGid === st.id + ':' + st.handNo ? J2.myHand : [];
    const myTurn = st.phase === 'play' && st.turnSeat === me && !st.raise;
    const canTruco = myTurn && !st.onze && st.value < 12 && st.lastRaiseTeam !== myTeam;
    const facing = st.phase === 'play' && st.raise && me >= 0 && teamOf(st, me) !== st.raise.team;
    const shoutNew = st.shout && Date.now() - st.shout.at < 2600;
    return `<div class="gtruco">
      <div class="tscore"><div class="tteam ${myTeam === 0 ? 'mine' : ''}"><small>${myTeam === 0 && me >= 0 ? 'Nós' : 'Time 1'}</small><b>${st.pts[0]}</b><span>${teamName(0)}</span></div>
        <div class="tmid"><span>Mão vale</span><b>${st.value}</b>${st.onze ? '<small>Mão de onze: sem truco</small>' : ''}<div class="tvazas">${[0, 1, 2].map(k => `<i class="${st.vazas[k] === undefined ? '' : st.vazas[k] === -1 ? 'tie' : 'v' + st.vazas[k]}"></i>`).join('')}</div></div>
        <div class="tteam ${myTeam === 1 ? 'mine' : ''}"><small>${myTeam === 1 ? 'Nós' : me >= 0 ? 'Eles' : 'Time 2'}</small><b>${st.pts[1]}</b><span>${teamName(1)}</span></div></div>
      <div class="tfelt n${n}">${seatsHtml}
        <div class="tcenter"><div class="tvira"><small>Vira</small>${st.vira ? card(st.vira) : ''}<small>Manilha: <b>${T_RANKS[st.man]}</b></small></div></div>
        ${shoutNew ? `<div class="tshout" data-at="${st.shout.at}">${esc(st.shout.text)}<small>${st.shout.uid ? J.nm(st.shout.uid) : ''}</small></div>` : ''}
        ${st.phase === 'handEnd' && st.handWin ? `<div class="thandend">${st.handWin.team < 0 ? 'Empatou tudo, ninguém marcou' : `${st.handWin.team === myTeam && me >= 0 ? 'Vocês' : teamName(st.handWin.team)} ${st.handWin.team === myTeam && me >= 0 ? 'levaram' : 'levou'} <b>+${st.handWin.value}</b>${st.handWin.why === 'correu' ? ' (o outro time correu)' : ''}`}</div>` : ''}
      </div>
      ${me >= 0 ? `<div class="thand">${myHand.map((c, i) => `<button class="tcardbtn" data-g="tplay" data-i="${i}" ${myTurn ? '' : 'disabled'}>${card(c)}</button>`).join('') || '<span class="mut small">Esperando as cartas…</span>'}</div>
        <div class="tacts">${facing ? `<b>${J.nm(st.raise.by)} pediu ${RAISE_NAME[st.raise.to].replace('!', '')}!</b><button class="btn ok" data-g="tresp" data-r="accept">Aceitar</button><button class="btn sec" data-g="tresp" data-r="run">Correr</button>${st.raise.to < 12 ? `<button class="btn tbig" data-g="tresp" data-r="raise">${RAISE_NAME[st.raise.to + 3]}</button>` : ''}`
          : st.raise ? `<span class="mut">Esperando a resposta do ${RAISE_NAME[st.raise.to].replace('!', '')}…</span>`
          : myTurn ? `<span class="tyour">Sua vez de jogar</span>${canTruco ? `<button class="btn tbig" data-g="truco">${RAISE_NAME[st.value === 1 ? 3 : st.value + 3]}</button>` : ''}`
          : st.phase === 'play' ? `<span class="mut">Vez de ${J.nm(st.seats[st.turnSeat])}</span>` : ''}</div>` : '<p class="mut small">Você está assistindo.</p>'}
      ${(st.feed || []).filter(f => f.sys).slice(-1).map(f => `<p class="mut small">${esc(f.sys)}</p>`).join('')}</div>`;
  },
  endExtra(st){ const tn = t => st.seats.filter((u, i) => i % 2 === t).map(u => J.nm(u)).join(' e '); return st.winTeam === undefined ? '' : `<div class="truend">🃏 <b>${tn(st.winTeam)}</b> ganhou de <b>${st.pts[st.winTeam]}</b> a <b>${st.pts[1 - st.winTeam]}</b></div>`; },
  after(st){
    if(st.shout && st.shout.at !== J2.shownShout && Date.now() - st.shout.at < 2600){ J2.shownShout = st.shout.at; App.sfx && App.sfx('screen'); if(navigator.vibrate) try{ navigator.vibrate(60); }catch(e){} }
  },
  click(k, b){
    if(k === 'tplay'){ J.act({ a: 'tplay', i: +b.dataset.i }); return true; }
    if(k === 'truco'){ J.act({ a: 'truco' }); return true; }
    if(k === 'tresp'){ J.act({ a: 'tresp', r: b.dataset.r }); return true; }
  },
});
