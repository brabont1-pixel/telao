/* =====================================================================
   v6.27: MAIS JOGOS NA CALL — Forca, Batalha naval, Quiz de música e Telefone sem fio
   Mesmo esquema dos outros: quem abre é o anfitrião, guarda o estado e manda para a call.
   - Batalha naval: os navios de cada capitão ficam só com o anfitrião (a tela mostra só os tiros).
   - Telefone sem fio: cada um recebe em particular só o que tem que desenhar/adivinhar;
     a sequência inteira só aparece no final.
   - Quiz de música: trechos de 30 s da busca pública do iTunes (pelo /api/musica).
   ===================================================================== */
const K3 = App.G;
const pres3 = () => K3.presentIds();
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const plain = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/* ============================ FORCA ============================ */
const FORCA_WORDS = {
  'Animal': ['Capivara', 'Jacaré', 'Tamanduá', 'Hipopótamo', 'Ornitorrinco', 'Borboleta', 'Tartaruga', 'Golfinho', 'Pinguim', 'Camaleão', 'Escorpião', 'Gafanhoto', 'Rinoceronte', 'Lagartixa', 'Papagaio'],
  'Comida': ['Brigadeiro', 'Feijoada', 'Coxinha', 'Pastel', 'Tapioca', 'Lasanha', 'Churrasco', 'Pamonha', 'Acarajé', 'Moqueca', 'Esfirra', 'Hambúrguer', 'Panqueca', 'Pipoca', 'Cuscuz'],
  'Objeto': ['Guarda-chuva', 'Liquidificador', 'Ventilador', 'Travesseiro', 'Calculadora', 'Microfone', 'Geladeira', 'Escorregador', 'Abajur', 'Tesoura', 'Mochila', 'Controle remoto', 'Fone de ouvido', 'Teclado', 'Chinelo'],
  'Profissão': ['Astronauta', 'Bombeiro', 'Veterinário', 'Encanador', 'Jornalista', 'Arquiteto', 'Programador', 'Cabeleireiro', 'Engenheiro', 'Motorista', 'Fotógrafo', 'Padeiro', 'Dentista', 'Eletricista', 'Professor'],
  'Lugar': ['Biblioteca', 'Aeroporto', 'Rodoviária', 'Cachoeira', 'Shopping', 'Hospital', 'Academia', 'Supermercado', 'Floresta', 'Deserto', 'Fazenda', 'Padaria', 'Estádio', 'Cinema', 'Praia'],
  'Jogo': ['Minecraft', 'Valorant', 'Fortnite', 'Roblox', 'Counter-Strike', 'League of Legends', 'Free Fire', 'Among Us', 'Rocket League', 'Pokémon', 'Tetris', 'Xadrez', 'Dominó', 'Truco', 'Uno'],
  'Esporte': ['Futebol', 'Basquete', 'Vôlei', 'Natação', 'Skate', 'Surfe', 'Ciclismo', 'Handebol', 'Judô', 'Capoeira', 'Atletismo', 'Tênis de mesa', 'Ginástica', 'Boxe', 'Xadrez'],
};
const T_FORCA = 100000, T_FORCA_SHOW = 5500, FORCA_LIVES = 6;
const forcaCd = new Map(), FCK = { on: false };
const forcaDone = st => [...plain(st.word)].every(c => !/[A-Z]/.test(c) || st.guessed.includes(c));
function forcaRound(st){
  st.round = (st.round || 0) + 1;
  if(st.round > st.rounds){ K3.endGame(); return; }
  const cats = Object.keys(FORCA_WORDS), cat = K3.shuffle(cats)[0];
  const used = st.usedW || [];
  const w = K3.shuffle(FORCA_WORDS[cat].filter(x => !used.includes(x)))[0] || FORCA_WORDS[cat][0];
  st.usedW = used.concat(w); st.cat = cat; st.word = w; st.guessed = []; st.wrong = []; st.lives = FORCA_LIVES; st.solver = null;
  st.phase = 'play'; K3.setDeadline(T_FORCA); K3.push();
}
function forcaEnd(st, solver){ st.solver = solver || null; st.phase = 'show'; K3.setDeadline(T_FORCA_SHOW); K3.push(); }
App.registerGame('forca', { name: 'Forca', icon: '🪢', desc: 'Todo mundo chuta letras na mesma palavra. Letra certa dá pontos para quem chutou; letra errada tira uma vida do grupo. Quem souber a palavra inteira ganha bônus.', min: 1 }, {
  start(st){ st.rounds = 5; st.round = 0; st.usedW = []; forcaRound(st); },
  act(st, uid, a){
    if(st.phase !== 'play' || !st.players.includes(uid)) return;
    const t = Date.now(), ck = uid + a.a;
    if(t - (forcaCd.get(ck) || 0) < (a.a === 'fw' ? 2000 : 700)) return;
    forcaCd.set(ck, t);
    if(a.a === 'fl'){
      const l = plain(a.l).slice(0, 1); if(!/[A-Z]/.test(l) || st.guessed.includes(l) || st.wrong.includes(l)) return;
      const n = [...plain(st.word)].filter(c => c === l).length;
      if(n){ st.guessed.push(l); st.scores[uid] = (st.scores[uid] || 0) + 10 * n; K3.feed({ uid, l, ok: true, n }); if(forcaDone(st)){ st.scores[uid] += 20; forcaEnd(st, uid); return; } }
      else { st.wrong.push(l); st.lives--; st.scores[uid] = Math.max(0, (st.scores[uid] || 0) - 5); K3.feed({ uid, l }); if(st.lives <= 0){ forcaEnd(st); return; } }
      K3.push();
    } else if(a.a === 'fw'){
      const g = plain(String(a.text || '').slice(0, 40)).replace(/[^A-Z]/g, ''), w = plain(st.word).replace(/[^A-Z]/g, '');
      if(!g) return;
      if(g === w){
        const hidden = [...new Set([...w].filter(c => !st.guessed.includes(c)))].length;
        st.scores[uid] = (st.scores[uid] || 0) + 30 + 10 * hidden; st.guessed = [...new Set(st.guessed.concat([...w]))];
        K3.feed({ uid, w: st.word, ok: true }); forcaEnd(st, uid);
      } else { st.lives--; st.scores[uid] = Math.max(0, (st.scores[uid] || 0) - 10); K3.feed({ uid, w: String(a.text).slice(0, 40) }); if(st.lives <= 0) forcaEnd(st); else K3.push(); }
    }
  },
  tick(st){ if(st.phase === 'play') forcaEnd(st); else if(st.phase === 'show') forcaRound(st); },
  render(st, inGame){
    const show = st.phase === 'show', W = plain(st.word);
    const masked = [...st.word].map((c, i) => /[A-Za-zÀ-ÿ]/.test(c) ? `<span class="fcl ${show || st.guessed.includes(W[i]) ? 'on' : ''}">${show || st.guessed.includes(W[i]) ? esc(c.toUpperCase()) : ''}</span>` : c === ' ' ? '<span class="fcsp"></span>' : `<span class="fcl on">${esc(c)}</span>`).join('');
    const wr = FORCA_LIVES - st.lives;
    const parts = ['<circle cx="140" cy="62" r="16"/>', '<line x1="140" y1="78" x2="140" y2="130"/>', '<line x1="140" y1="92" x2="118" y2="112"/>', '<line x1="140" y1="92" x2="162" y2="112"/>', '<line x1="140" y1="130" x2="122" y2="160"/>', '<line x1="140" y1="130" x2="158" y2="160"/>'];
    const svg = `<svg viewBox="0 0 200 190" class="fcgal"><g stroke="#8a8798" stroke-width="5" stroke-linecap="round" fill="none"><line x1="30" y1="180" x2="120" y2="180"/><line x1="60" y1="180" x2="60" y2="20"/><line x1="60" y1="20" x2="140" y2="20"/><line x1="140" y1="20" x2="140" y2="46"/></g><g stroke="${st.lives <= 1 ? '#ff5c5c' : '#fff'}" stroke-width="5" stroke-linecap="round" fill="none">${parts.slice(0, wr).join('')}</g></svg>`;
    const last = (st.feed || []).slice(-5).reverse();
    return `<div class="gforca"><div class="gqn">Palavra ${st.round} de ${st.rounds} · categoria <b>${esc(st.cat)}</b></div>
      <div class="fcwrap">${svg}<div class="fcright"><div class="fcword">${masked}</div>
        <div class="fclives">${'❤️'.repeat(Math.max(0, st.lives))}${'🖤'.repeat(Math.max(0, wr))}</div>
        ${show ? `<div class="fcres">${st.solver ? `🎉 <b>${K3.nm(st.solver)}</b> fechou a palavra!` : st.lives <= 0 ? '💀 Acabaram as vidas!' : '⏰ Acabou o tempo!'}</div>` : ''}</div></div>
      ${!show && inGame ? `<div class="fckeys">${LETRAS.map(l => `<button class="fck ${st.guessed.includes(l) ? 'ok' : st.wrong.includes(l) ? 'no' : ''}" data-g="fl" data-l="${l}" ${st.guessed.includes(l) || st.wrong.includes(l) ? 'disabled' : ''}>${l}</button>`).join('')}</div>
        <div class="qsgform"><input class="inp" id="fcW" maxlength="40" placeholder="Sabe a palavra? Chute inteira (errar custa 1 vida)" autocomplete="off"><button class="btn ok" data-g="fw">Chutar</button></div>` : ''}
      <div class="gfeed">${last.map(f => f.w ? `<div class="gf ${f.ok ? 'ok' : ''}"><b>${K3.nm(f.uid)}</b> chutou “${esc(f.w)}” ${f.ok ? '✅' : '❌'}</div>` : `<div class="gf ${f.ok ? 'ok' : ''}"><b>${K3.nm(f.uid)}</b> ${f.ok ? `acertou o ${esc(f.l)} (${f.n}×)` : `errou o ${esc(f.l)}`}</div>`).join('')}</div>
      ${K3.scoreList(st)}</div>`;
  },
  endExtra(st){ return st.word ? `<p class="mut">A última palavra era <b>${esc(st.word)}</b>.</p>` : ''; },
  after(st, el){
    const i = el.querySelector('#fcW'); if(i) i.onkeydown = e => { e.stopPropagation(); if(e.key === 'Enter' && i.value.trim()){ K3.act({ a: 'fw', text: i.value.trim() }); i.value = ''; } };
    if(!FCK.on){ FCK.on = true; document.addEventListener('keydown', e => {
      const s = K3.st; if(!s || s.game !== 'forca' || s.phase !== 'play' || !s.players.includes(S.me.id)) return;
      if(e.target.closest('input,textarea,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const l = e.key.length === 1 ? plain(e.key) : ''; if(/^[A-Z]$/.test(l) && !s.guessed.includes(l) && !s.wrong.includes(l)){ K3.act({ a: 'fl', l }); }
    }); }
  },
  click(k, b){
    if(k === 'fl'){ K3.act({ a: 'fl', l: b.dataset.l }); return true; }
    if(k === 'fw'){ const i = K3.el && K3.el.querySelector('#fcW'); if(i && i.value.trim()){ K3.act({ a: 'fw', text: i.value.trim() }); i.value = ''; } return true; }
  },
});

/* ============================ BATALHA NAVAL ============================ */
const NV_N = 8, NV_SHIPS = [4, 3, 3, 2, 2], T_NV_PLACE = 60000, T_NV_SHOT = 30000;
const NV = { boards: {}, gid: null, layout: null, layoutGid: null, ready: {}, sentTo: null };
function nvRandom(){
  for(let tries = 0; tries < 500; tries++){
    const occ = new Set(), ships = [];
    let ok = true;
    for(const len of NV_SHIPS){
      let placed = false;
      for(let k = 0; k < 200 && !placed; k++){
        const h = Math.random() < 0.5, r = Math.floor(Math.random() * (h ? NV_N : NV_N - len + 1)), c = Math.floor(Math.random() * (h ? NV_N - len + 1 : NV_N));
        const cells = Array.from({ length: len }, (_, i) => h ? [r, c + i] : [r + i, c]);
        // sem encostar em outro navio (nem na diagonal)
        if(cells.some(([y, x]) => { for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++) if(occ.has((y + dy) + ',' + (x + dx))) return true; return false; })) continue;
        cells.forEach(([y, x]) => occ.add(y + ',' + x)); ships.push([r, c, len, h ? 1 : 0]); placed = true;
      }
      if(!placed){ ok = false; break; }
    }
    if(ok) return ships;
  }
  return [[0, 0, 4, 1], [2, 0, 3, 1], [4, 0, 3, 1], [6, 0, 2, 1], [6, 4, 2, 1]];
}
const nvCells = s => Array.from({ length: s[2] }, (_, i) => s[3] ? [s[0], s[1] + i] : [s[0] + i, s[1]]);
function nvValid(ships){
  if(!Array.isArray(ships) || ships.length !== NV_SHIPS.length) return false;
  const lens = ships.map(s => s && s[2]).sort().join(), want = NV_SHIPS.slice().sort().join(); if(lens !== want) return false;
  const occ = new Set();
  for(const s of ships){ for(const [y, x] of nvCells(s)){ if(!(y >= 0 && y < NV_N && x >= 0 && x < NV_N)) return false; const k = y + ',' + x; if(occ.has(k)) return false; occ.add(k); } }
  return true;
}
const nvOpp = (st, uid) => st.cap[0] === uid ? st.cap[1] : st.cap[0];
function nvFire(st, uid, r, c){
  const tgt = nvOpp(st, uid), shots = st.shots[uid], k = r + ',' + c;
  if(shots[k] || !(r >= 0 && r < NV_N && c >= 0 && c < NV_N)) return;
  const board = NV.boards[tgt]; if(!board){ return; }
  const ship = board.find(s => nvCells(s).some(([y, x]) => y === r && x === c));
  shots[k] = ship ? 'h' : 'm';
  if(ship){
    const sunk = nvCells(ship).every(([y, x]) => shots[y + ',' + x] === 'h');
    if(sunk){ st.sunk[tgt] = (st.sunk[tgt] || []).concat([ship]); K3.feed({ uid, sunk: ship[2] }); }
    st.scores[uid] = (st.scores[uid] || 0) + (sunk ? 30 : 10);
    if((st.sunk[tgt] || []).length === NV_SHIPS.length){ st.scores[uid] += 100; st.winner = uid; K3.endGame(); return; }
  } else st.turn = tgt;
  K3.setDeadline(T_NV_SHOT); K3.push();
}
function nvStartFire(st){
  st.cap.forEach(u => { if(!NV.boards[u]) NV.boards[u] = nvRandom(); });
  st.phase = 'fire'; st.turn = st.cap[Math.random() < 0.5 ? 0 : 1]; K3.setDeadline(T_NV_SHOT); K3.push();
}
App.registerGame('naval', { name: 'Batalha naval', icon: '🚢', desc: 'Dois capitães, cada um com 5 navios escondidos. Acertou, atira de novo. Quem afundar a frota inteira primeiro ganha. O resto da call assiste e torce.', min: 2 }, {
  start(st){
    st.cap = st.players.slice(0, 2); st.shots = { [st.cap[0]]: {}, [st.cap[1]]: {} }; st.sunk = {}; st.ready = {};
    NV.boards = {}; NV.gid = st.id; st.phase = 'place'; K3.setDeadline(T_NV_PLACE); K3.push();
  },
  act(st, uid, a){
    if(a.a === 'nvships' && st.cap.includes(uid) && nvValid(a.ships)){
      if(NV.gid !== st.id){ NV.boards = {}; NV.gid = st.id; }
      if(st.phase === 'place'){ NV.boards[uid] = a.ships.map(s => s.slice(0, 4).map(Number)); st.ready[uid] = true; if(st.cap.every(u => st.ready[u])) nvStartFire(st); else K3.push(); }
      else if(st.phase === 'fire' && !NV.boards[uid]) NV.boards[uid] = a.ships.map(s => s.slice(0, 4).map(Number));   // anfitrião novo recebendo os navios de volta
    } else if(a.a === 'nvfire' && st.phase === 'fire' && uid === st.turn) nvFire(st, uid, a.r | 0, a.c | 0);
  },
  tick(st){
    if(st.phase === 'place') nvStartFire(st);
    else if(st.phase === 'fire'){
      if(!pres3().includes(st.turn)){ st.winner = nvOpp(st, st.turn); st.scores[st.winner] = (st.scores[st.winner] || 0) + 50; K3.endGame(); return; }
      const free = []; for(let r = 0; r < NV_N; r++) for(let c = 0; c < NV_N; c++) if(!st.shots[st.turn][r + ',' + c]) free.push([r, c]);
      const [r, c] = free[Math.floor(Math.random() * free.length)]; nvFire(st, st.turn, r, c);
    }
  },
  render(st, inGame){
    const me = S.me.id, cap = st.cap.includes(me);
    if(cap && NV.layoutGid !== st.id){ NV.layout = nvRandom(); NV.layoutGid = st.id; NV.sentTo = null; }
    const head = 'ABCDEFGH';
    const grid = (opts) => {
      let h = `<div class="nvgrid"><span></span>${[...Array(NV_N)].map((_, i) => `<span class="nvh">${i + 1}</span>`).join('')}`;
      for(let r = 0; r < NV_N; r++){
        h += `<span class="nvh">${head[r]}</span>`;
        for(let c = 0; c < NV_N; c++) h += opts.cell(r, c);
      }
      return h + '</div>';
    };
    if(st.phase === 'place'){
      if(!cap) return `<div class="gnaval"><h3>Os capitães estão posicionando os navios…</h3><div class="nvcaps">${st.cap.map(u => `<span>${avatar(prof(u), 'sm')} ${K3.nm(u)} ${st.ready[u] ? '✅' : '⏳'}</span>`).join('<b>vs</b>')}</div></div>`;
      const occ = new Set(NV.layout.flatMap(s => nvCells(s).map(([y, x]) => y + ',' + x)));
      return `<div class="gnaval"><h3>Posicione sua frota</h3><p class="mut small">5 navios (4, 3, 3, 2 e 2 casas). Sorteie até gostar e aperte Pronto.</p>
        ${grid({ cell: (r, c) => `<span class="nvc ${occ.has(r + ',' + c) ? 'ship' : ''}"></span>` })}
        <div class="gacts">${st.ready[me] ? '<span class="okc">Pronto! Esperando o outro capitão…</span>' : `<button class="btn sec" data-g="nvshuf">🎲 Sortear de novo</button><button class="btn ok" data-g="nvready">Pronto</button>`}</div></div>`;
    }
    // fogo
    const myTurn = st.turn === me;
    const shotGrid = (shooter, mine) => {
      const target = nvOpp(st, shooter), sunkCells = new Set((st.sunk[target] || []).flatMap(s => nvCells(s).map(([y, x]) => y + ',' + x)));
      const myShips = mine && NV.layout ? new Set(NV.layout.flatMap(s => nvCells(s).map(([y, x]) => y + ',' + x))) : null;
      return grid({ cell: (r, c) => {
        const k = r + ',' + c, s = st.shots[shooter][k];
        const cls = `nvc ${myShips && myShips.has(k) ? 'ship' : ''} ${s === 'h' ? 'hit' : s === 'm' ? 'miss' : ''} ${sunkCells.has(k) ? 'sunk' : ''}`;
        const can = !mine && myTurn && shooter === me && !s;
        return `<button class="${cls}" ${can ? `data-g="nvfire" data-r="${r}" data-c="${c}"` : 'disabled'}>${s === 'h' ? '💥' : s === 'm' ? '•' : ''}</button>`;
      } });
    };
    const left = (u) => NV_SHIPS.length - (st.sunk[u] || []).length;
    const banner = `<div class="nvturn ${myTurn ? 'me' : ''}">${myTurn ? '🎯 Sua vez! Atire no mar inimigo' : `Vez de <b>${K3.nm(st.turn)}</b>`}</div>`;
    if(cap){
      const opp = nvOpp(st, me);
      return `<div class="gnaval">${banner}<div class="nvboards">
        <div><h4>Mar inimigo · ${K3.nm(opp)} <small>${left(opp)} navios</small></h4>${shotGrid(me, false)}</div>
        <div><h4>Seu mar <small>${left(me)} navios</small></h4>${shotGrid(opp, true)}</div></div>${K3.scoreList({ ...st, players: st.cap })}</div>`;
    }
    return `<div class="gnaval">${banner}<div class="nvboards">${st.cap.map(u => `<div><h4>Tiros de ${K3.nm(u)} <small>${left(nvOpp(st, u))} navios inimigos</small></h4>${shotGrid(u, false)}</div>`).join('')}</div>${K3.scoreList({ ...st, players: st.cap })}</div>`;
  },
  endExtra(st){ return st.winner ? `<div class="qsright">🏆 <b>${K3.nm(st.winner)}</b> afundou a frota inteira!</div>` : ''; },
  after(st){
    // se o anfitrião mudou no meio da batalha, o capitão manda os navios de novo para ele
    if(st.phase === 'fire' && st.cap.includes(S.me.id) && NV.layoutGid === st.id && NV.sentTo !== st.host){ NV.sentTo = st.host; K3.act({ a: 'nvships', ships: NV.layout }); }
  },
  click(k, b, st){
    if(k === 'nvshuf'){ NV.layout = nvRandom(); K3.render(); return true; }
    if(k === 'nvready'){ NV.sentTo = st.host; K3.act({ a: 'nvships', ships: NV.layout }); return true; }
    if(k === 'nvfire'){ K3.act({ a: 'nvfire', r: +b.dataset.r, c: +b.dataset.c }); return true; }
  },
});

/* ============================ QUIZ DE MÚSICA ============================ */
const MQ_GENRES = [['pop', 'Pop gringo'], ['sertanejo', 'Sertanejo'], ['funk', 'Funk'], ['trap', 'Trap BR'], ['rap', 'Rap'], ['pagode', 'Pagode'], ['mpb', 'MPB'], ['rock', 'Rock'], ['anos2000', 'Anos 2000']];
const T_MQ_LISTEN = 20000, T_MQ_SHOW = 6000, MQ_ROUNDS = 10;
const MQ = { audio: null, playing: null, answers: null, picks: {} };
function mqStop(){ if(MQ.audio){ try{ MQ.audio.pause(); }catch(e){} } MQ.playing = null; }
function mqNext(st){
  st.round = (st.round || 0) + 1;
  if(st.round > st.rounds){ mqStop(); K3.endGame(); return; }
  const pool = st.pool, t = pool[st.round - 1];
  const others = K3.shuffle(pool.filter(x => K3.norm(x.title) !== K3.norm(t.title))).slice(0, 3);
  const opts = K3.shuffle([t, ...others]);
  st.q = { preview: t.preview, art: t.art, opts: opts.map(o => ({ t: o.title, a: o.artist })) };
  MQ.answers = MQ.answers || {}; MQ.answers[st.id + ':' + st.round] = opts.indexOf(t);
  st.q.k = (opts.indexOf(t) + st.round * 3) % 4;   // reserva, se o anfitrião mudar no meio
  st.picks = {}; st.ci = null; st.phase = 'listen'; st.startAt = Date.now(); K3.setDeadline(T_MQ_LISTEN); K3.push();
}
const mqAns = st => { const v = MQ.answers && MQ.answers[st.id + ':' + st.round]; return v ?? ((st.q.k - st.round * 3) % 4 + 4) % 4; };
function mqShow(st){ st.ci = mqAns(st); st.phase = 'show'; K3.setDeadline(T_MQ_SHOW); K3.push(); }
App.registerGame('musica', { name: 'Quiz de música', icon: '🎵', desc: 'Toca um trecho e a galera adivinha a música. Quanto mais rápido, mais pontos.', min: 1 }, {
  lobby(st){
    const g = st.genre || 'pop';
    return K3.amHost() ? `<div class="mqgen">${MQ_GENRES.map(([v, l]) => `<button class="chip ${g === v ? 'on' : ''}" data-g="mqgen" data-v="${v}">${l}</button>`).join('')}</div>`
      : `<p class="mut small">Estilo: <b>${esc((MQ_GENRES.find(x => x[0] === g) || [0, 'Pop'])[1])}</b></p>`;
  },
  start(st){
    st.genre = st.genre || 'pop'; st.phase = 'loading'; st.rounds = MQ_ROUNDS; st.round = 0; K3.push();
    fetch('/api/musica?g=' + encodeURIComponent(st.genre)).then(r => r.json()).then(j => {
      if(K3.st !== st || st.phase !== 'loading') return;
      const tr = (j && j.tracks) || [];
      if(tr.length < 8){ App.toast((j && j.error) || 'Não achei músicas agora. Tente outro estilo.', true); K3.endGame(); return; }
      st.pool = K3.shuffle(tr).slice(0, 40); st.rounds = Math.min(MQ_ROUNDS, st.pool.length); mqNext(st);
    }).catch(() => { if(K3.st === st){ App.toast('Não deu para buscar as músicas agora.', true); K3.endGame(); } });
  },
  act(st, uid, a){
    if(a.a === 'mqpick' && st.phase === 'listen' && st.players.includes(uid) && !st.picks[uid] && a.round === st.round){
      const i = a.i | 0, ok = i === mqAns(st);
      const left = Math.max(0, st.dl - Date.now());
      const pts = ok ? Math.max(100, Math.round(1000 * left / T_MQ_LISTEN)) : 0;
      st.picks[uid] = { i, pts }; st.scores[uid] = (st.scores[uid] || 0) + pts;
      if(st.players.filter(u => pres3().includes(u)).every(u => st.picks[u])) mqShow(st); else K3.push();
    }
  },
  tick(st){ if(st.phase === 'listen') mqShow(st); else if(st.phase === 'show') mqNext(st); },
  render(st, inGame){
    if(st.phase === 'loading') return `<div class="gquiz"><div class="spin"></div><p class="mut">Escolhendo as músicas…</p></div>`;
    const my = (st.picks || {})[S.me.id], show = st.phase === 'show';
    return `<div class="gquiz gmus"><div class="gqn">Música ${st.round} de ${st.rounds}</div>
      <div class="mqdisc ${show ? 'show' : 'spin2'}">${show && st.q.art ? `<img src="${esc(st.q.art)}" alt="">` : '🎵'}</div>
      <h2>${show ? `${esc(st.q.opts[st.ci].t)} <small>${esc(st.q.opts[st.ci].a)}</small>` : 'Que música é essa?'}</h2>
      <div class="gopts">${st.q.opts.map((o, i) => `<button class="gopt o${i} ${show && i === st.ci ? 'right' : ''} ${show && my && my.i === i && i !== st.ci ? 'wrong' : ''} ${my && my.i === i ? 'mine' : ''}" data-g="mqpick" data-i="${i}" ${my || show || !inGame ? 'disabled' : ''}><span class="gshape">${['▲', '◆', '●', '■'][i]}</span><span>${esc(o.t)}<small class="mqa">${esc(o.a)}</small></span></button>`).join('')}</div>
      <div class="gqfoot">${show ? (my ? (my.pts ? `<b class="okc">Acertou! +${my.pts}</b>` : '<b class="nok">Errou</b>') : '<span class="mut">Você não respondeu</span>') : my ? '<span class="mut">Resposta enviada…</span>' : `<span class="mut">${Object.keys(st.picks || {}).length} de ${st.players.length} responderam · <a data-g="mqvol">volume</a></span>`}</div>
      ${K3.scoreList(st)}</div>`;
  },
  after(st){
    const key = st.id + ':' + st.round;
    if(st.phase === 'listen' && st.q && MQ.playing !== key){
      MQ.playing = key; MQ.audio = MQ.audio || new Audio(); MQ.audio.src = st.q.preview;
      MQ.audio.volume = Math.max(0.05, Math.min(1, App.prefs.mqVol ?? 0.7));
      if(App.prefs.outputId && MQ.audio.setSinkId) MQ.audio.setSinkId(App.prefs.outputId).catch(() => {});
      const off = Math.max(0, (Date.now() - (st.startAt || Date.now())) / 1000);
      MQ.audio.currentTime = Math.min(20, off); if(!Voice.deafened) MQ.audio.play().catch(() => {});
    }
    if(st.phase === 'end' || st.phase === 'lobby') mqStop();
  },
  click(k, b, st){
    if(k === 'mqgen' && K3.amHost()){ st.genre = b.dataset.v; K3.push(); return true; }
    if(k === 'mqpick'){ K3.act({ a: 'mqpick', i: +b.dataset.i, round: st.round }); return true; }
    if(k === 'mqvol'){ const v = Math.round(((App.prefs.mqVol ?? 0.7) >= 0.9 ? 0.3 : (App.prefs.mqVol ?? 0.7) + 0.2) * 10) / 10; App.prefs.mqVol = v; savePrefs(); if(MQ.audio) MQ.audio.volume = v; App.toast(`Volume da música: ${Math.round(v * 100)}%`); return true; }
  },
});
// sair da call ou fechar o jogo para a música
const _leaveVoiceMQ = leaveVoice;
leaveVoice = function(){ mqStop(); return _leaveVoiceMQ.apply(this, arguments); };
setInterval(() => { const s = K3.st; if(MQ.playing && (!s || s.game !== 'musica' || s.phase === 'end')) mqStop(); }, 1000);

/* ============================ TELEFONE SEM FIO ============================ */
const T_TEL = { w: 50000, d: 90000, g: 45000 };
const TEL = { chains: null, gid: null, prompt: null, promptKey: null, draft: {}, sent: {}, cv: null, cvKey: null, strokes: [], color: '#111111', size: 5, autoT: null };
const telKind = k => k === 0 ? 'w' : k % 2 ? 'd' : 'g';
function telHandler(st, c, k){ return st.tord[(c + k) % st.tord.length]; }
function telChainOf(st, uid, k){ const j = st.tord.indexOf(uid); return j < 0 ? -1 : ((j - k) % st.tord.length + st.tord.length) % st.tord.length; }
function telStep(st, k){
  st.step = k; st.kind = telKind(k); st.done = []; st.phase = 'play';
  K3.setDeadline(T_TEL[st.kind]); K3.push();
  if(k > 0) telSendPrompts(st);
  clearTimeout(TEL.resend); TEL.resend = setTimeout(() => { if(K3.st === st && st.step === k && st.phase === 'play') telSendPrompts(st, true); }, 2000);
}
function telSendPrompts(st, onlyMissing){
  const k = st.step; if(k === 0) return;
  st.tord.forEach((u, j) => {
    if(onlyMissing && st.done.includes(u)) return;
    const c = telChainOf(st, u, k), prev = TEL.chains[c][k - 1];
    const pl = { gid: st.id, tel: { step: k, kind: st.kind, prompt: prev ? prev.v : null, by: prev ? prev.u : null } };
    if(u === S.me.id) App.onGamePriv(pl); else sendToUser(u, 'game-priv', pl);
  });
}
function telAdvance(st){
  // quem não mandou: entra em branco
  st.tord.forEach(u => {
    const c = telChainOf(st, u, st.step);
    if(!TEL.chains[c][st.step]) TEL.chains[c][st.step] = { u, k: st.kind, v: null };
  });
  if(st.step + 1 >= st.steps){ st.phase = 'reveal'; st.rc = 0; st.ri = 0; telShow(st); return; }
  telStep(st, st.step + 1);
}
function telShow(st){ st.show = TEL.chains[st.rc].slice(0, st.ri + 1); st.dl = 0; K3.push(); }
const _onGamePrivTel = App.onGamePriv;
App.onGamePriv = pl => {
  if(pl && pl.tel){
    const st = K3.st; if(!st || pl.gid !== st.id) return;
    TEL.prompt = pl.tel; TEL.promptKey = st.id + ':' + pl.tel.step; K3.render(); return;
  }
  if(_onGamePrivTel) _onGamePrivTel(pl);
};
function telCanvas(key){
  if(TEL.cv && TEL.cvKey === key) return TEL.cv;
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 440; cv.className = 'telcv';
  TEL.cv = cv; TEL.cvKey = key; TEL.strokes = [];
  const x = cv.getContext('2d');
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
  let cur = null;
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { c: TEL.color, w: TEL.size, pts: [pos(e)] }; TEL.strokes.push(cur); telRedraw(); };
  cv.onpointermove = e => { if(!cur) return; cur.pts.push(pos(e)); telRedraw(); };
  cv.onpointerup = cv.onpointercancel = () => { cur = null; };
  telRedraw();
  return cv;
}
function telRedraw(){
  const cv = TEL.cv; if(!cv) return; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.lineCap = x.lineJoin = 'round';
  TEL.strokes.forEach(s => { x.strokeStyle = s.c; x.lineWidth = s.w * 2; x.beginPath(); s.pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); if(s.pts.length === 1) x.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); x.stroke(); });
}
function telExport(){
  if(!TEL.cv) return null;
  const small = document.createElement('canvas'); small.width = 400; small.height = 275;
  small.getContext('2d').drawImage(TEL.cv, 0, 0, 400, 275);
  let d = small.toDataURL('image/webp', 0.6); if(!/^data:image\/webp/.test(d)) d = small.toDataURL('image/jpeg', 0.6);
  return d;
}
function telSubmit(st){
  const key = st.id + ':' + st.step; if(TEL.sent[key]) return;
  let v;
  if(st.kind === 'd') v = TEL.strokes.length ? telExport() : null;
  else v = String(TEL.draft[key] || '').trim().slice(0, 120) || null;
  TEL.sent[key] = 1; K3.act({ a: 'tel', step: st.step, v });
}
App.registerGame('telefone', { name: 'Telefone sem fio', icon: '📞', desc: 'Cada um escreve uma frase, o próximo desenha, o outro adivinha o desenho, e assim vai. No fim todo mundo vê como a frase virou outra coisa.', min: 3 }, {
  start(st){
    st.tord = K3.shuffle(st.players); st.steps = Math.min(st.tord.length, 8);
    TEL.chains = st.tord.map(() => []); TEL.gid = st.id; telStep(st, 0);
  },
  act(st, uid, a){
    if(a.a === 'tel' && st.phase === 'play' && a.step === st.step && st.tord.includes(uid) && !st.done.includes(uid)){
      if(TEL.gid !== st.id){ App.toast('Quem abriu o Telefone sem fio saiu, e a partida acabou.', true); K3.endGame(); return; }
      let v = a.v;
      if(st.kind === 'd'){ if(v && !(typeof v === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(v) && v.length < 120000)) v = null; }
      else v = v ? String(v).slice(0, 120) : null;
      const c = telChainOf(st, uid, st.step);
      TEL.chains[c][st.step] = { u: uid, k: st.kind, v };
      st.done.push(uid);
      if(st.tord.filter(u => pres3().includes(u)).every(u => st.done.includes(u))) telAdvance(st); else K3.push();
    } else if(a.a === 'telnext' && uid === st.host && st.phase === 'reveal'){
      const ch = TEL.chains[st.rc];
      if(st.ri < ch.length - 1){ st.ri++; telShow(st); }
      else if(st.rc < TEL.chains.length - 1){ st.rc++; st.ri = 0; telShow(st); }
      else { st.tord.forEach(u => st.scores[u] = (st.scores[u] || 0) + 10 * TEL.chains.flat().filter(x => x.u === u && x.v).length); K3.endGame(); }
    }
  },
  tick(st){ if(st.phase === 'play'){ if(TEL.gid !== st.id){ App.toast('Quem abriu o Telefone sem fio saiu, e a partida acabou.', true); K3.endGame(); return; } telAdvance(st); } },
  render(st, inGame){
    const me = S.me.id, inT = (st.tord || []).includes(me);
    if(st.phase === 'reveal'){
      const owner = st.tord[st.rc];
      return `<div class="gtel"><h3>A frase de <b>${K3.nm(owner)}</b> <small class="mut">(${st.rc + 1} de ${st.tord.length})</small></h3>
        <div class="telchain">${(st.show || []).map((it, i) => `<div class="telit ${i === st.ri ? 'new' : ''}"><div class="telwho">${avatar(prof(it.u), 'xs')} <b>${K3.nm(it.u)}</b> ${it.k === 'w' ? 'escreveu' : it.k === 'd' ? 'desenhou' : 'achou que era'}</div>
          ${it.k === 'd' ? (it.v ? `<img src="${esc(it.v)}" alt="desenho">` : '<div class="telblank">não desenhou 🙈</div>') : `<div class="teltxt">${it.v ? esc(it.v) : '<i>não respondeu</i>'}</div>`}</div>`).join('')}</div>
        ${K3.amHost() ? `<div class="gacts"><button class="btn ok" data-g="telnext">${st.ri < TEL.chains[st.rc].length - 1 ? 'Mostrar o próximo ▶' : st.rc < st.tord.length - 1 ? 'Próxima frase ▶' : 'Terminar 🏁'}</button></div>` : `<p class="mut small">${K3.nm(st.host)} vai passando…</p>`}</div>`;
    }
    const key = st.id + ':' + st.step, sent = TEL.sent[key] || st.done.includes(me);
    const prog = `<div class="telprog">${st.tord.map(u => `<span class="${st.done.includes(u) ? 'ok' : ''}" title="${esc(prof(u).display_name)}">${avatar(prof(u), 'xs')}</span>`).join('')}</div>`;
    const stepTxt = `<div class="gqn">Etapa ${st.step + 1} de ${st.steps}</div>`;
    if(!inT) return `<div class="gtel">${stepTxt}<h3>${st.kind === 'w' ? 'Todo mundo está escrevendo uma frase…' : st.kind === 'd' ? 'Todo mundo está desenhando…' : 'Todo mundo está adivinhando os desenhos…'}</h3>${prog}<p class="mut small">Você entrou depois; espere a próxima partida.</p></div>`;
    if(sent) return `<div class="gtel">${stepTxt}<h3>Pronto! Esperando a galera…</h3>${prog}</div>`;
    const pr = TEL.promptKey === key ? TEL.prompt : null;
    if(st.kind === 'w') return `<div class="gtel">${stepTxt}<h3>✍️ Escreva uma frase para alguém desenhar</h3><p class="mut small">Algo engraçado ou difícil: “um gato pilotando um avião”, “o Gabriel perdendo no truco”…</p>
      <div class="qsgform"><input class="inp" id="telW" maxlength="120" autocomplete="off" placeholder="Sua frase" value="${esc(TEL.draft[key] || '')}"><button class="btn ok" data-g="telok">Pronto</button></div>${prog}</div>`;
    if(!pr) return `<div class="gtel">${stepTxt}<div class="spin"></div><p class="mut">Recebendo a sua vez…</p>${prog}</div>`;
    if(st.kind === 'd') return `<div class="gtel">${stepTxt}<h3>🎨 Desenhe: <span class="telp">${pr.prompt ? esc(pr.prompt) : '(a pessoa não escreveu nada: desenhe o que quiser!)'}</span></h3>
      <div id="telCvHost" class="telcvhost"></div>
      <div class="gtools">${['#111111', '#ffffff', '#ff2e9a', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41'].map(c => `<button class="gcol ${TEL.color === c ? 'on' : ''}" data-g="telcol" data-c="${c}" style="--c:${c}" title="${c === '#ffffff' ? 'Borracha' : ''}"></button>`).join('')}
        ${[3, 6, 12].map(z => `<button class="gsz ${TEL.size === z ? 'on' : ''}" data-g="telsz" data-s="${z}"><i style="width:${z + 2}px;height:${z + 2}px"></i></button>`).join('')}
        <button class="btn sec sm" data-g="telundo">Desfazer</button><button class="btn sec sm" data-g="telclr">Limpar</button><span class="grow"></span><button class="btn ok" data-g="telok">Pronto</button></div>${prog}</div>`;
    return `<div class="gtel">${stepTxt}<h3>🤔 O que é esse desenho?</h3>
      ${pr.prompt ? `<img class="telimg" src="${esc(pr.prompt)}" alt="desenho">` : '<div class="telblank">a pessoa não desenhou 🙈 invente algo!</div>'}
      <div class="qsgform"><input class="inp" id="telG" maxlength="120" autocomplete="off" placeholder="Descreva o desenho" value="${esc(TEL.draft[key] || '')}"><button class="btn ok" data-g="telok">Pronto</button></div>${prog}</div>`;
  },
  endExtra(){ return '<p class="mut">Pontos: 10 por cada etapa que você fez.</p>'; },
  after(st, el){
    if(st.phase !== 'play') return;
    const key = st.id + ':' + st.step;
    const host = el.querySelector('#telCvHost'); if(host){ host.appendChild(telCanvas(key)); }
    el.querySelectorAll('#telW,#telG').forEach(i => {
      i.oninput = () => { TEL.draft[key] = i.value; };
      i.onkeydown = e => { e.stopPropagation(); if(e.key === 'Enter' && i.value.trim()){ TEL.draft[key] = i.value; telSubmit(st); } };
    });
    // manda sozinho o que tiver quando o tempo estiver acabando
    if(TEL.autoKey !== key && st.tord.includes(S.me.id)){
      TEL.autoKey = key; clearTimeout(TEL.autoT);
      const ms = Math.max(0, (st.dl || Date.now()) - Date.now() - 1500);
      TEL.autoT = setTimeout(() => { const s = K3.st; if(s && s.id === st.id && s.step === st.step && s.phase === 'play') telSubmit(s); }, ms);
    }
  },
  click(k, b, st){
    if(k === 'telok'){ const key = st.id + ':' + st.step; const i = K3.el && K3.el.querySelector('#telW,#telG'); if(i) TEL.draft[key] = i.value;
      if(st.kind !== 'd' && !String(TEL.draft[key] || '').trim()){ App.toast('Escreva alguma coisa antes.', true); return true; }
      if(st.kind === 'd' && !TEL.strokes.length){ App.toast('Desenhe alguma coisa antes.', true); return true; }
      telSubmit(st); return true; }
    if(k === 'telcol'){ TEL.color = b.dataset.c; K3.el.querySelectorAll('[data-g=telcol]').forEach(x => x.classList.toggle('on', x === b)); return true; }
    if(k === 'telsz'){ TEL.size = +b.dataset.s; K3.el.querySelectorAll('[data-g=telsz]').forEach(x => x.classList.toggle('on', x === b)); return true; }
    if(k === 'telundo'){ TEL.strokes.pop(); telRedraw(); return true; }
    if(k === 'telclr'){ TEL.strokes = []; telRedraw(); return true; }
    if(k === 'telnext'){ K3.act({ a: 'telnext' }); return true; }
  },
});
