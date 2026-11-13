/* =====================================================================
   v6.9: JOGOS DENTRO DA CHAMADA — Rabisco (desenhe e adivinhe), Quiz e Quem é mais provável
   Quem abre o jogo é o anfitrião: o aparelho dele guarda o estado e manda para todos pela chamada.
   Se o anfitrião sair, o próximo jogador assume sozinho, sem perder a partida.
   ===================================================================== */
const GAMES = {
  rabisco: { name: 'Rabisco', icon: '🎨', desc: 'Um desenha, o resto adivinha. Quanto mais rápido, mais pontos.', min: 2 },
  quiz: { name: 'Quiz', icon: '🧠', desc: '10 perguntas de conhecimentos gerais. Acertar rápido vale mais.', min: 1 },
  provavel: { name: 'Quem é mais provável', icon: '👀', desc: 'Todo mundo vota em quem combina mais com a frase. Sem certo nem errado.', min: 3 },
};
const T_PICK = 15000, T_DRAW = 80000, T_REVEAL = 5000, T_Q = 15000, T_ANS = 4500, T_VOTE = 20000, T_RES = 6000;
const WORDS = ('casa,sol,gato,cachorro,árvore,carro,bicicleta,avião,foguete,peixe,pizza,hambúrguer,sorvete,banana,maçã,abacaxi,melancia,uva,bolo,café,xícara,garrafa,celular,computador,teclado,mouse,fone de ouvido,televisão,controle,cadeira,mesa,cama,sofá,janela,porta,chave,cadeado,relógio,óculos,chapéu,sapato,camiseta,guarda-chuva,nuvem,chuva,raio,arco-íris,lua,estrela,montanha,praia,ilha,vulcão,rio,ponte,castelo,coroa,espada,escudo,dragão,fantasma,robô,alienígena,astronauta,pirata,mago,sereia,palhaço,bola,gol,troféu,medalha,violão,bateria,microfone,piano,livro,lápis,tesoura,mochila,presente,balão,vela,fogo,flor,cacto,cogumelo,folha,borboleta,abelha,aranha,cobra,tartaruga,coelho,leão,girafa,elefante,macaco,pinguim,coruja,pato,galinha,vaca,porco,cavalo,polvo,tubarão,baleia,caranguejo,dinossauro,unicórnio,boneco de neve,pipoca,cachorro-quente,ovo,queijo,pão,coxinha,brigadeiro,sanduíche,escova de dente,chuveiro,lâmpada,barco,trem,ônibus,moto,semáforo,roda-gigante,barraca,mapa,bússola,âncora,cometa,planeta,igreja,farol,trator,helicóptero,submarino,skate,patins,pipa,ioiô,dado,baralho,tênis,meia,luva,cachecol,bigode,dente,olho,nariz,orelha,mão,pé,coração,cérebro,esqueleto,múmia,vampiro,zumbi,bruxa,anjo').split(',');
const QUIZ = [
  ['Qual é a capital da Austrália?', ['Canberra', 'Sydney', 'Melbourne', 'Perth']],
  ['Quantos jogadores de cada time ficam em campo numa partida de futebol?', ['11', '10', '12', '9']],
  ['Qual planeta é conhecido como Planeta Vermelho?', ['Marte', 'Júpiter', 'Vênus', 'Saturno']],
  ['Quem pintou a Mona Lisa?', ['Leonardo da Vinci', 'Michelangelo', 'Rafael', 'Van Gogh']],
  ['Qual é o maior oceano do mundo?', ['Pacífico', 'Atlântico', 'Índico', 'Ártico']],
  ['Em que ano o Brasil ganhou a primeira Copa do Mundo?', ['1958', '1962', '1970', '1950']],
  ['Qual é o símbolo químico do ouro?', ['Au', 'Ag', 'Fe', 'Go']],
  ['Quantos lados tem um hexágono?', ['6', '5', '7', '8']],
  ['Qual é o maior país do mundo em área?', ['Rússia', 'Canadá', 'China', 'Estados Unidos']],
  ['Quantos estados tem o Brasil (sem contar o Distrito Federal)?', ['26', '27', '25', '28']],
  ['Qual é o maior mamífero do mundo?', ['Baleia-azul', 'Elefante-africano', 'Girafa', 'Tubarão-baleia']],
  ['Qual é a capital do Canadá?', ['Ottawa', 'Toronto', 'Vancouver', 'Montreal']],
  ['Quanto é 7 × 8?', ['56', '54', '64', '48']],
  ['Qual gás as plantas absorvem na fotossíntese?', ['Gás carbônico', 'Oxigênio', 'Nitrogênio', 'Hélio']],
  ['Quem escreveu "Dom Casmurro"?', ['Machado de Assis', 'José de Alencar', 'Clarice Lispector', 'Jorge Amado']],
  ['Qual é o osso mais longo do corpo humano?', ['Fêmur', 'Tíbia', 'Úmero', 'Rádio']],
  ['Em qual continente fica o Egito?', ['África', 'Ásia', 'Europa', 'Oceania']],
  ['Qual é a velocidade aproximada da luz no vácuo?', ['300 mil km/s', '30 mil km/s', '3 milhões de km/s', '300 km/s']],
  ['Quantos minutos tem um dia?', ['1.440', '1.240', '1.600', '1.340']],
  ['Qual é a moeda do Japão?', ['Iene', 'Yuan', 'Won', 'Rupia']],
  ['Qual instrumento tem 88 teclas no modelo padrão?', ['Piano', 'Violão', 'Bateria', 'Saxofone']],
  ['Qual é o menor planeta do Sistema Solar?', ['Mercúrio', 'Marte', 'Vênus', 'Terra']],
  ['Qual país tem o formato de uma bota no mapa?', ['Itália', 'Portugal', 'Grécia', 'Chile']],
  ['Quantas cordas tem um violão comum?', ['6', '4', '7', '5']],
  ['Qual gás existe em maior quantidade no ar que respiramos?', ['Nitrogênio', 'Oxigênio', 'Gás carbônico', 'Argônio']],
  ['Qual é a capital de Minas Gerais?', ['Belo Horizonte', 'Ouro Preto', 'Uberlândia', 'Juiz de Fora']],
  ['Qual é a capital do Paraná?', ['Curitiba', 'Londrina', 'Maringá', 'Foz do Iguaçu']],
  ['Quem foi o primeiro ser humano a pisar na Lua?', ['Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins']],
  ['Qual é a fórmula química da água?', ['H₂O', 'CO₂', 'O₂', 'H₂O₂']],
  ['Qual esporte Ayrton Senna praticava?', ['Fórmula 1', 'Tênis', 'Futebol', 'Vôlei']],
  ['Qual é o maior deserto quente do mundo?', ['Saara', 'Gobi', 'Atacama', 'Kalahari']],
  ['Qual fruta é a base do guacamole?', ['Abacate', 'Limão', 'Manga', 'Tomate']],
  ['Em que cidade fica o Cristo Redentor?', ['Rio de Janeiro', 'São Paulo', 'Salvador', 'Brasília']],
  ['Quantos segundos tem uma hora?', ['3.600', '360', '6.000', '3.000']],
  ['Qual metal fica líquido em temperatura ambiente?', ['Mercúrio', 'Chumbo', 'Alumínio', 'Estanho']],
  ['Qual órgão bombeia o sangue pelo corpo?', ['Coração', 'Fígado', 'Pulmão', 'Rim']],
  ['Misturando tinta azul com tinta amarela, que cor aparece?', ['Verde', 'Roxo', 'Laranja', 'Marrom']],
  ['Qual é o maior planeta do Sistema Solar?', ['Júpiter', 'Saturno', 'Netuno', 'Urano']],
  ['Quantos graus tem um ângulo reto?', ['90', '180', '45', '360']],
  ['Qual é a capital da Argentina?', ['Buenos Aires', 'Córdoba', 'Rosário', 'Montevidéu']],
  ['Qual animal é o mascote do Linux?', ['Pinguim', 'Raposa', 'Gato', 'Coruja']],
  ['Em qual jogo aparece o Creeper?', ['Minecraft', 'Fortnite', 'Roblox', 'Terraria']],
  ['Quantos bits tem um byte?', ['8', '4', '16', '10']],
  ['Quantos anos tem um século?', ['100', '10', '1.000', '50']],
  ['Qual é o planeta mais próximo do Sol?', ['Mercúrio', 'Vênus', 'Terra', 'Marte']],
  ['Qual é a capital da Bahia?', ['Salvador', 'Feira de Santana', 'Ilhéus', 'Porto Seguro']],
  ['Quantas patas tem uma aranha?', ['8', '6', '10', '4']],
  ['Qual é o maior órgão do corpo humano?', ['Pele', 'Fígado', 'Coração', 'Pulmão']],
];
const PROVAVEL = ['dormir no meio da call', 'virar meme sem querer', 'esquecer o aniversário de alguém', 'ficar rico do nada', 'chegar atrasado até no próprio aniversário',
  'comer a última fatia de pizza sem perguntar', 'largar o jogo no meio de raiva', 'virar streamer famoso', 'mandar um áudio de 5 minutos', 'sumir por uma semana e voltar como se nada tivesse acontecido',
  'ganhar um reality show', 'se perder num shopping', 'rir na hora errada', 'ter 300 abas abertas no navegador', 'zerar um jogo inteiro num fim de semana', 'adotar 10 gatos',
  'mandar mensagem para a pessoa errada', 'esquecer o microfone ligado', 'ficar acordado até as 5 da manhã', 'ser presidente um dia', 'chorar vendo filme de animação', 'dar spoiler sem querer',
  'comprar uma coisa inútil só porque estava na promoção', 'cozinhar o melhor almoço do grupo', 'responder "kkkk" para tudo', 'marcar o rolê e desmarcar em cima da hora',
  'sobreviver a um apocalipse zumbi', 'virar coach de alguma coisa', 'ganhar uma discussão sem ter razão', 'dançar sozinho no meio da rua', 'ler os termos de uso inteiros', 'trocar o dia pela noite nas férias'];

const G = { st: null, el: null, cv: null, ctx: null, strokes: [], cur: null, buf: [], color: '#111111', size: 6, tick: null, reported: new Set(), lb: {}, leftAt: 0, inp: null, closeHint: 0 };
const now = () => Date.now();
const shuffle = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b){ if(Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for(let j = 1; j <= b.length; j++) d[0][j] = j;
  for(let i = 1; i <= a.length; i++) for(let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
const gameCh = () => Voice.channel;
const presentIds = () => { const ch = gameCh(); return ch ? [...new Set(voiceUsers(ch).map(u => u.user_id))] : []; };
const amHost = () => G.st && G.st.host === S.me.id;
const send = (k, extra) => Voice.sendFx({ t: 'game', k, cid: gameCh() && gameCh().id, ...extra });

/* ---------- anfitrião: muda o estado e manda para todos ---------- */
function setDeadline(ms){ G.st.dl = now() + ms; G.st.dur = ms; }
function pushState(){ if(!amHost()) return; G.st.v = (G.st.v || 0) + 1; const left = G.st.dl ? Math.max(0, G.st.dl - now()) : 0; send('st', { st: G.st, left }); renderGame(); if(G.el && !G.el.isConnected && !G.hidden) renderStage(); }
function feed(item){ G.st.feed = (G.st.feed || []).concat([item]).slice(-30); }

function gameNew(game){
  if(!Voice.channel){ App.toast('Entre numa chamada para jogar.', true); return; }
  if(G.st && G.st.phase !== 'end'){ App.toast('Já tem um jogo rolando nesta chamada.', true); return; }
  G.st = { id: Math.random().toString(36).slice(2, 10), game, host: S.me.id, phase: 'lobby', players: [S.me.id], scores: {}, feed: [], round: 0 };
  G.strokes = []; clearCanvas();
  pushState(); loadLeaderboard(game);
}
function hostStart(){
  const st = G.st, here = new Set(presentIds());
  st.players = st.players.filter(u => here.has(u));
  if(st.players.length < GAMES[st.game].min){ App.toast(`${GAMES[st.game].name} precisa de pelo menos ${GAMES[st.game].min} pessoas no jogo.`, true); return; }
  st.scores = Object.fromEntries(st.players.map(u => [u, 0])); st.feed = [];
  if(st.game === 'rabisco'){ st.order = shuffle(st.players); st.rounds = st.players.length <= 3 ? 3 : 2; st.turn = -1; rabNextTurn(); }
  else if(st.game === 'quiz'){ st.qs = shuffle(QUIZ.map((q, i) => i)).slice(0, 10); st.qi = -1; quizNext(); }
  else { st.ps = shuffle(PROVAVEL.map((q, i) => i)).slice(0, 8); st.pi = -1; st.titles = []; provNext(); }
}
function endGame(){ const st = G.st; st.phase = 'end'; st.dl = 0; delete st.word; delete st.opts; pushState(); }
// Rabisco
function rabNextTurn(){
  const st = G.st; st.turn++;
  const n = st.order.length;
  if(st.turn >= n * st.rounds){ endGame(); return; }
  st.round = Math.floor(st.turn / n) + 1;
  st.drawer = st.order[st.turn % n];
  if(!presentIds().includes(st.drawer)){ rabNextTurn(); return; }
  st.phase = 'pick'; st.opts = shuffle(WORDS).slice(0, 3); st.word = null; st.reveal = []; st.guessed = [];
  G.strokes = []; clearCanvas(); send('clear');
  setDeadline(T_PICK); pushState();
}
function rabPick(i){
  const st = G.st; if(st.phase !== 'pick') return;
  st.word = st.opts[Math.max(0, Math.min(2, i | 0))]; st.opts = null; st.phase = 'draw'; st.reveal = [];
  setDeadline(T_DRAW); pushState();
}
function rabReveal(){ const st = G.st; st.phase = 'reveal'; setDeadline(T_REVEAL); pushState(); }
function rabGuess(uid, text){
  const st = G.st; if(st.phase !== 'draw' || uid === st.drawer || st.guessed.includes(uid) || !st.players.includes(uid)) return;
  const g = norm(text), w = norm(st.word);
  if(!g) return;
  if(g === w){
    const left = Math.max(0, st.dl - now());
    const pts = Math.max(60, Math.round(320 * left / T_DRAW));
    st.scores[uid] = (st.scores[uid] || 0) + pts; st.scores[st.drawer] = (st.scores[st.drawer] || 0) + 60;
    st.guessed.push(uid); feed({ uid, ok: true, pts });
    const others = st.players.filter(u => u !== st.drawer && presentIds().includes(u));
    if(others.every(u => st.guessed.includes(u))){ rabReveal(); return; }
    pushState(); return;
  }
  if(w.length > 3 && lev(g, w) <= 1) send('close', { to: uid });
  feed({ uid, text: String(text).slice(0, 60) }); pushState();
}
// Quiz
function quizNext(){
  const st = G.st; st.qi++;
  if(st.qi >= st.qs.length){ endGame(); return; }
  const [q, opts] = QUIZ[st.qs[st.qi]];
  const order = shuffle([0, 1, 2, 3]);
  st.q = { text: q, opts: order.map(i => opts[i]) }; st.ci = order.indexOf(0); st.answers = {};
  st.phase = 'question'; setDeadline(T_Q); pushState();
}
function quizAnswer(uid, i){
  const st = G.st; if(st.phase !== 'question' || st.answers[uid] || !st.players.includes(uid)) return;
  const left = Math.max(0, st.dl - now());
  st.answers[uid] = { i: i | 0 };
  if((i | 0) === st.ci) st.scores[uid] = (st.scores[uid] || 0) + 500 + Math.round(500 * left / T_Q);
  if(st.players.filter(u => presentIds().includes(u)).every(u => st.answers[u])){ st.phase = 'answer'; setDeadline(T_ANS); }
  pushState();
}
// Quem é mais provável
function provNext(){
  const st = G.st; st.pi++;
  if(st.pi >= st.ps.length){ endGame(); return; }
  st.prompt = PROVAVEL[st.ps[st.pi]]; st.votes = {}; st.phase = 'vote'; setDeadline(T_VOTE); pushState();
}
function provVote(uid, who){
  const st = G.st; if(st.phase !== 'vote' || !st.players.includes(uid) || !st.players.includes(who)) return;
  st.votes[uid] = who;
  if(st.players.filter(u => presentIds().includes(u)).every(u => st.votes[u])) provResult(); else pushState();
}
function provResult(){
  const st = G.st; const tally = {};
  Object.values(st.votes).forEach(u => { tally[u] = (tally[u] || 0) + 1; st.scores[u] = (st.scores[u] || 0) + 100; });
  const max = Math.max(0, ...Object.values(tally));
  st.top = max ? Object.keys(tally).filter(u => tally[u] === max) : [];
  if(st.top.length) st.titles.push({ prompt: st.prompt, uids: st.top });
  st.tally = tally; st.phase = 'result'; setDeadline(T_RES); pushState();
}
function hostAct(uid, a){
  const st = G.st; if(!st) return;
  if(a.a === 'join' && st.phase === 'lobby' && !st.players.includes(uid)){ st.players.push(uid); pushState(); }
  else if(a.a === 'join' && st.phase !== 'lobby' && st.phase !== 'end' && !st.players.includes(uid)){ st.players.push(uid); st.scores[uid] = 0; if(st.order) st.order.push(uid); pushState(); }
  else if(a.a === 'leave'){ st.players = st.players.filter(u => u !== uid); pushState(); }
  else if(a.a === 'guess') rabGuess(uid, a.text);
  else if(a.a === 'pick' && uid === st.drawer) rabPick(a.i);
  else if(a.a === 'answer') quizAnswer(uid, a.i);
  else if(a.a === 'vote') provVote(uid, a.who);
}
function hostTick(){
  const st = G.st; if(!st || !amHost() || !st.dl || now() < st.dl) return;
  st.dl = 0;
  if(st.game === 'rabisco'){
    if(st.phase === 'pick') rabPick(Math.floor(Math.random() * 3));
    else if(st.phase === 'draw') rabReveal();
    else if(st.phase === 'reveal') rabNextTurn();
  }else if(st.game === 'quiz'){
    if(st.phase === 'question'){ st.phase = 'answer'; setDeadline(T_ANS); pushState(); }
    else if(st.phase === 'answer') quizNext();
  }else{
    if(st.phase === 'vote') provResult();
    else if(st.phase === 'result') provNext();
  }
}
function hostHints(){
  const st = G.st; if(!st || !amHost() || st.game !== 'rabisco' || st.phase !== 'draw' || !st.word) return;
  const frac = 1 - (st.dl - now()) / T_DRAW;
  const letters = [...st.word].map((c, i) => /[^\s-]/.test(c) ? i : -1).filter(i => i >= 0);
  const want = frac > 0.75 ? Math.ceil(letters.length * 0.4) : frac > 0.5 ? Math.ceil(letters.length * 0.2) : 0;
  if(want > (st.reveal || []).length && letters.length > 2){
    const rest = shuffle(letters.filter(i => !st.reveal.includes(i)));
    st.reveal = st.reveal.concat(rest.slice(0, want - st.reveal.length)); pushState();
  }
  // o desenhista saiu da chamada: pula a vez
  if(!presentIds().includes(st.drawer)) rabReveal();
}
// se o anfitrião sair, o próximo jogador presente assume
function checkHost(){
  const st = G.st; if(!st || st.phase === 'end' || !Voice.channel) return;
  const here = presentIds(); if(here.includes(st.host) || !here.length) return;
  const next = st.players.filter(u => here.includes(u)).sort()[0] || here.sort()[0];
  if(next === S.me.id){ st.host = S.me.id; if(st.dl && !G.leftAt) st.dl = now() + 3000; pushState(); App.toast('Você virou o anfitrião do jogo.'); }
}

/* ---------- recebendo da chamada ---------- */
function onGame(pl, mine){
  if(!Voice.channel || (pl.cid && pl.cid !== Voice.channel.id)) return;
  const k = pl.k;
  if(k === 'st'){
    if(mine) return;
    const old = G.st;
    if(old && old.id === pl.st.id && (pl.st.v || 0) < (old.v || 0)) return;
    G.st = pl.st; if(G.st.dl) G.st.dl = now() + (pl.left || 0);
    if(!old || old.id !== G.st.id) loadLeaderboard(G.st.game);
    if(!G.el || !G.el.isConnected) renderStage(); else renderGame();
  }else if(k === 'act'){
    if(amHost()) hostAct(pl.uid, pl);
  }else if(k === 'hello'){
    if(amHost() && !mine){ pushState(); if(G.strokes.length) send('strokes', { list: G.strokes.slice(-400) }); }
  }else if(k === 'strokes'){
    if(mine) return; G.strokes = pl.list || []; redraw();
  }else if(k === 'draw'){
    if(mine) return;
    let s = G.strokes.find(x => x.id === pl.id);
    if(!s){ s = { id: pl.id, c: pl.c, w: pl.w, pts: [] }; G.strokes.push(s); }
    const from = s.pts.length; s.pts.push(...pl.pts); drawSeg(s, Math.max(0, from - 1));
  }else if(k === 'clear'){ if(!mine){ G.strokes = []; clearCanvas(); } }
  else if(k === 'undo'){ if(!mine){ G.strokes = G.strokes.filter(x => x.id !== pl.id); redraw(); } }
  else if(k === 'close'){ if(pl.to === S.me.id){ G.closeHint = now(); renderGame(); } }
  else if(k === 'quit'){ if(G.st && pl.uid === G.st.host && !mine){ G.st = null; renderGame(); renderStage(); } }
}
const _onFxG = Voice.onFx;
Voice.onFx = (pl, mine) => { if(pl && pl.t === 'game'){ onGame(pl, mine); return; } _onFxG(pl, mine); };
function act(a){ if(amHost()) hostAct(S.me.id, a); else send('act', a); }

/* ---------- desenho ---------- */
function ensureCanvas(){
  if(G.cv) return;
  G.cv = document.createElement('canvas'); G.cv.width = 960; G.cv.height = 600; G.cv.className = 'gcanvas';
  G.ctx = G.cv.getContext('2d'); clearCanvas();
  const pos = e => { const r = G.cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  G.cv.addEventListener('pointerdown', e => {
    if(!canDraw()) return; e.preventDefault(); G.cv.setPointerCapture(e.pointerId);
    G.cur = { id: Math.random().toString(36).slice(2, 9), c: G.color, w: G.size, pts: [pos(e)] }; G.strokes.push(G.cur); G.buf = [pos(e)];
    drawSeg(G.cur, 0);
  });
  G.cv.addEventListener('pointermove', e => {
    if(!G.cur) return; const p = pos(e); const s = G.cur; s.pts.push(p); G.buf.push(p); drawSeg(s, s.pts.length - 2);
  });
  const up = () => { if(!G.cur) return; flushStroke(); G.cur = null; };
  G.cv.addEventListener('pointerup', up); G.cv.addEventListener('pointercancel', up);
  setInterval(() => { if(G.cur) flushStroke(); }, 80);
}
function flushStroke(){
  if(!G.cur || !G.buf.length) return;
  send('draw', { id: G.cur.id, c: G.cur.c, w: G.cur.w, pts: G.buf.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
  G.buf = [];
}
const canDraw = () => G.st && G.st.game === 'rabisco' && G.st.phase === 'draw' && G.st.drawer === S.me.id;
function clearCanvas(){ if(!G.ctx) return; G.ctx.fillStyle = '#ffffff'; G.ctx.fillRect(0, 0, G.cv.width, G.cv.height); }
function drawSeg(s, from){
  if(!G.ctx || !s.pts.length) return;
  const c = G.ctx, W = G.cv.width, H = G.cv.height;
  c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = s.w * W / 960; c.lineCap = 'round'; c.lineJoin = 'round';
  if(s.pts.length === 1){ c.beginPath(); c.arc(s.pts[0][0] * W, s.pts[0][1] * H, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
  c.beginPath(); c.moveTo(s.pts[from][0] * W, s.pts[from][1] * H);
  for(let i = from + 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0] * W, s.pts[i][1] * H);
  c.stroke();
}
function redraw(){ clearCanvas(); G.strokes.forEach(s => drawSeg(s, 0)); }

/* ---------- ranking do servidor ---------- */
async function loadLeaderboard(game){
  const ch = gameCh(); if(!ch || !ch.server_id) return;
  const { data } = await App.sb.from('game_scores').select('*').eq('server_id', ch.server_id).eq('game', game).order('points', { ascending: false }).limit(5);
  await ensureProfiles((data || []).map(r => r.user_id));
  G.lb[game] = data || []; renderGame();
}
function reportEnd(){
  const st = G.st; if(!st || st.phase !== 'end' || G.reported.has(st.id) || !st.players.includes(S.me.id)) return;
  G.reported.add(st.id);
  const ch = gameCh(); if(!ch || !ch.server_id) return;
  const mine = st.scores[S.me.id] || 0, max = Math.max(0, ...Object.values(st.scores));
  App.sb.rpc('game_report', { p_channel: ch.id, p_game: st.game, p_points: mine, p_won: mine > 0 && mine === max }).then(() => setTimeout(() => loadLeaderboard(st.game), 800), () => {});
}

/* ---------- tela do jogo ---------- */
const nm = uid => esc(prof(uid).display_name);
function scoreList(st, mark){
  const rows = st.players.slice().sort((a, b) => (st.scores[b] || 0) - (st.scores[a] || 0));
  return `<div class="gscores">${rows.map((u, i) => `<div class="gsr ${u === S.me.id ? 'me' : ''}"><span class="gpos">${i + 1}</span>${avatar(prof(u), 'xs')}<span class="gname">${nm(u)}</span>${mark ? mark(u) : ''}<b>${st.scores[u] || 0}</b></div>`).join('')}</div>`;
}
function timerHtml(){ return G.st && G.st.dl ? `<span class="gtimer" id="gTimer">${Math.max(0, Math.ceil((G.st.dl - now()) / 1000))}</span>` : ''; }
function maskWord(st){
  const show = st.phase === 'reveal' || st.drawer === S.me.id || (st.guessed || []).includes(S.me.id);
  if(!st.word) return '';
  return [...st.word].map((c, i) => c === ' ' ? '<span class="gsp"></span>' : c === '-' ? '<span class="gl">-</span>' : `<span class="gl ${show || (st.reveal || []).includes(i) ? 'on' : ''}">${show || (st.reveal || []).includes(i) ? esc(c.toUpperCase()) : ''}</span>`).join('') + `<small>${[...st.word].filter(c => /[^\s-]/.test(c)).length} letras</small>`;
}
function renderGame(){
  const st = G.st;
  if(!st){ if(G.el) G.el.remove(); return; }
  if(!G.el){ G.el = document.createElement('div'); G.el.className = 'gpanel'; G.el.addEventListener('click', onPanelClick); }
  const info = GAMES[st.game], here = presentIds(), inGame = st.players.includes(S.me.id);
  let body = '';
  if(st.phase === 'lobby'){
    const lb = G.lb[st.game] || [];
    body = `<div class="globby"><div class="gicon">${info.icon}</div><h2>${info.name}</h2><p>${info.desc}</p>
      <div class="gplayers">${st.players.map(u => `<span class="gpl">${avatar(prof(u), 'sm')}<span>${nm(u)}${u === st.host ? ' 👑' : ''}</span></span>`).join('')}</div>
      <div class="gacts">${inGame ? '' : `<button class="btn" data-g="join">Entrar no jogo</button>`}
        ${amHost() ? `<button class="btn ok big" data-g="start" ${st.players.length < info.min ? 'disabled' : ''}>Começar (${st.players.length})</button><button class="btn sec" data-g="invite">Chamar todo mundo da call</button>` : `<span class="mut small">Esperando ${nm(st.host)} começar…</span>`}</div>
      ${st.players.length < info.min ? `<p class="mut small">Precisa de pelo menos ${info.min} pessoas.</p>` : ''}
      ${lb.length ? `<div class="glb"><span class="gsec">${ic('crown', 14)} Ranking do servidor</span>${lb.map((r, i) => `<div class="gsr"><span class="gpos">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatar(prof(r.user_id), 'xs')}<span class="gname">${nm(r.user_id)}</span><small class="mut">${r.wins} vitória${r.wins === 1 ? '' : 's'}</small><b>${Number(r.points).toLocaleString('pt-BR')}</b></div>`).join('')}</div>` : ''}</div>`;
  }else if(st.phase === 'end'){
    const rows = st.players.slice().sort((a, b) => (st.scores[b] || 0) - (st.scores[a] || 0));
    const pod = rows.slice(0, 3);
    body = `<div class="gend"><h2>Fim de jogo!</h2>
      ${st.game === 'provavel' && st.titles.length ? `<div class="gtitles">${st.titles.map(t => `<div class="gtt"><span>Mais provável de ${esc(t.prompt)}</span><b>${t.uids.map(nm).join(' e ')}</b></div>`).join('')}</div>` : ''}
      <div class="gpod">${[1, 0, 2].map(i => pod[i] ? `<div class="gpd p${i + 1}">${avatar(prof(pod[i]), i === 0 ? 'xl' : 'lg')}<b>${nm(pod[i])}</b><span>${st.scores[pod[i]] || 0} pts</span><div class="gstep">${i + 1}º</div></div>` : '').join('')}</div>
      ${rows.length > 3 ? scoreList({ ...st, players: rows.slice(3) }) : ''}
      <div class="gacts">${amHost() ? `<button class="btn ok" data-g="again">Jogar de novo</button>` : ''}<button class="btn sec" data-g="close">Fechar</button></div></div>`;
    reportEnd();
  }else if(st.game === 'rabisco'){
    const drawer = st.drawer === S.me.id;
    const top = st.phase === 'pick' ? (drawer ? `<b>Escolha o que você vai desenhar</b>` : `<b>${nm(st.drawer)} está escolhendo a palavra…</b>`)
      : st.phase === 'reveal' ? `<b>A palavra era</b> <span class="gword">${maskWord(st)}</span>` : `<span class="gword">${maskWord(st)}</span>`;
    body = `<div class="grab"><div class="gmain"><div class="ghint">${top}</div><div class="gcvwrap" id="gCv">
        ${st.phase === 'pick' && drawer ? `<div class="gpick">${(st.opts || []).map((w, i) => `<button class="btn big" data-g="pick" data-i="${i}">${esc(w)}</button>`).join('')}</div>` : ''}
        ${st.phase === 'reveal' ? `<div class="greveal">${(st.guessed || []).length ? `${st.guessed.length} acert${st.guessed.length > 1 ? 'aram' : 'ou'}!` : 'Ninguém acertou 😅'}</div>` : ''}</div>
        ${drawer && st.phase === 'draw' ? `<div class="gtools">${['#111111', '#ffffff', '#ff2e9a', '#e53935', '#fb8c00', '#fdd835', '#b6ff2e', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#9e9e9e'].map(c => `<button class="gcol ${G.color === c ? 'on' : ''}" data-g="color" data-c="${c}" style="--c:${c}" title="${c === '#ffffff' ? 'Borracha' : ''}"></button>`).join('')}
          <span class="gsep"></span>${[[3, 'fino'], [6, 'médio'], [14, 'grosso'], [32, 'balde']].map(([s, l]) => `<button class="gsize ${G.size === s ? 'on' : ''}" data-g="size" data-s="${s}" title="${l}"><i style="width:${Math.min(18, 4 + s / 2)}px;height:${Math.min(18, 4 + s / 2)}px"></i></button>`).join('')}
          <span class="gsep"></span><button class="btn sec sm" data-g="undo">Desfazer</button><button class="btn sec sm" data-g="clear">Limpar</button></div>` : ''}
      </div>
      <div class="gside">${scoreList(st, u => u === st.drawer ? '<span class="gmk" title="Desenhando">✏️</span>' : (st.guessed || []).includes(u) ? '<span class="gmk ok">✓</span>' : '')}
        <div class="gfeed" id="gFeed">${(st.feed || []).map(f => f.ok ? `<div class="gf ok"><b>${nm(f.uid)}</b> acertou! +${f.pts}</div>` : `<div class="gf"><b>${nm(f.uid)}:</b> ${esc(f.text)}</div>`).join('')}
          ${now() - G.closeHint < 4000 ? '<div class="gf close">Quase! Você está perto 👀</div>' : ''}</div>
        <div class="gguess" id="gGuess"></div></div></div>`;
  }else if(st.game === 'quiz'){
    const my = (st.answers || {})[S.me.id], show = st.phase === 'answer';
    const counts = [0, 0, 0, 0]; Object.values(st.answers || {}).forEach(a => counts[a.i]++);
    body = `<div class="gquiz"><div class="gqn">Pergunta ${st.qi + 1} de ${st.qs.length}</div><h2>${esc(st.q.text)}</h2>
      <div class="gopts">${st.q.opts.map((o, i) => `<button class="gopt o${i} ${show && i === st.ci ? 'right' : ''} ${show && my && my.i === i && i !== st.ci ? 'wrong' : ''} ${my && my.i === i ? 'mine' : ''}" data-g="answer" data-i="${i}" ${my || show || !inGame ? 'disabled' : ''}><span class="gshape">${['▲', '◆', '●', '■'][i]}</span><span>${esc(o)}</span>${show ? `<small>${counts[i]}</small>` : ''}</button>`).join('')}</div>
      <div class="gqfoot">${show ? (my ? (my.i === st.ci ? '<b class="okc">Acertou!</b>' : '<b class="nok">Errou</b>') : '<span class="mut">Você não respondeu</span>') : my ? '<span class="mut">Resposta enviada. Esperando a galera…</span>' : `<span class="mut">${Object.keys(st.answers || {}).length} de ${st.players.length} responderam</span>`}</div>
      ${scoreList(st)}</div>`;
  }else{
    const my = (st.votes || {})[S.me.id], show = st.phase === 'result';
    body = `<div class="gprov"><div class="gqn">Rodada ${st.pi + 1} de ${st.ps.length}</div><h2>Quem é mais provável de <em>${esc(st.prompt)}</em>?</h2>
      <div class="gvotes">${st.players.map(u => { const n = (st.tally || {})[u] || 0; return `<button class="gvote ${my === u ? 'mine' : ''} ${show && (st.top || []).includes(u) ? 'win' : ''}" data-g="vote" data-u="${u}" ${show || !inGame ? 'disabled' : ''}>${avatar(prof(u), 'lg')}<b>${nm(u)}</b>${show ? `<span class="gvn">${n} voto${n === 1 ? '' : 's'}</span>` : ''}${show && (st.top || []).includes(u) ? '<span class="gcrown">👑</span>' : ''}</button>`; }).join('')}</div>
      <div class="gqfoot">${show ? '' : my ? '<span class="mut">Voto enviado. Ninguém sabe em quem você votou.</span>' : `<span class="mut">${Object.keys(st.votes || {}).length} de ${st.players.length} votaram</span>`}</div></div>`;
  }
  G.el.innerHTML = `<div class="gtop"><span class="gtt2">${info.icon} ${info.name}${st.round && st.game === 'rabisco' && st.phase !== 'end' && st.phase !== 'lobby' ? ` · rodada ${st.round} de ${st.rounds}` : ''}</span>${timerHtml()}<span class="grow"></span>
    ${inGame && st.phase !== 'lobby' && st.phase !== 'end' && !amHost() ? `<button class="btn sec sm" data-g="leave">Sair do jogo</button>` : ''}${amHost() && st.phase !== 'end' ? `<button class="btn sec sm" data-g="end">Encerrar</button>` : ''}
    <button class="ibtn" data-g="close" data-tip="Esconder o jogo">${ic('x', 16)}</button></div><div class="gbody">${body}</div>`;
  if(st.game === 'rabisco' && ['pick', 'draw', 'reveal'].includes(st.phase)){
    ensureCanvas(); const w = G.el.querySelector('#gCv'); if(w) w.prepend(G.cv);
    G.cv.classList.toggle('candraw', canDraw());
    const gg = G.el.querySelector('#gGuess');
    if(gg && st.phase === 'draw' && st.drawer !== S.me.id && inGame && !(st.guessed || []).includes(S.me.id)){
      if(!G.inp){ G.inp = document.createElement('input'); G.inp.className = 'inp'; G.inp.maxLength = 60; G.inp.placeholder = 'Seu palpite (Enter)'; G.inp.onkeydown = e => { if(e.key === 'Enter' && G.inp.value.trim()){ act({ a: 'guess', text: G.inp.value.trim() }); G.inp.value = ''; } e.stopPropagation(); }; }
      gg.appendChild(G.inp);
    }else if(gg) gg.innerHTML = st.drawer === S.me.id && st.phase === 'draw' ? '<span class="mut small">Desenhe! Sem letras nem números 😉</span>' : (st.guessed || []).includes(S.me.id) ? '<span class="okc small">Você acertou! Espere a galera.</span>' : '';
    const fd = G.el.querySelector('#gFeed'); if(fd) fd.scrollTop = fd.scrollHeight;
  }
  G.hidden = false;
}
async function onPanelClick(e){
  const b = e.target.closest('[data-g]'); if(!b || b.disabled) return;
  const k = b.dataset.g, st = G.st;
  if(k === 'join') act({ a: 'join' });
  else if(k === 'start' && amHost()) hostStart();
  else if(k === 'invite'){ presentIds().forEach(u => { if(!st.players.includes(u)) st.players.push(u); }); pushState(); }
  else if(k === 'pick') act({ a: 'pick', i: +b.dataset.i });
  else if(k === 'answer') act({ a: 'answer', i: +b.dataset.i });
  else if(k === 'vote') act({ a: 'vote', who: b.dataset.u });
  else if(k === 'color'){ G.color = b.dataset.c; renderGame(); }
  else if(k === 'size'){ G.size = +b.dataset.s; renderGame(); }
  else if(k === 'clear'){ G.strokes = []; clearCanvas(); send('clear'); }
  else if(k === 'undo'){ const s = G.strokes.pop(); if(s){ redraw(); send('undo', { id: s.id }); } }
  else if(k === 'leave'){ act({ a: 'leave' }); }
  else if(k === 'end' && amHost()){ if(await confirmBox('Encerrar o jogo', 'O jogo acaba para todo mundo agora.', 'Encerrar')) endGame(); }
  else if(k === 'again' && amHost()){ const g = st.game, pl = st.players; G.st = null; gameNew(g); G.st.players = pl.filter(u => presentIds().includes(u)); pushState(); }
  else if(k === 'close'){
    if(st.phase === 'end' || st.phase === 'lobby' && amHost()){ if(amHost()) send('quit'); G.st = null; }
    else G.hidden = true;
    renderStage();
  }
}

/* mostra o jogo dentro da área da chamada */
const _renderStageG = renderStage;
renderStage = function(){
  _renderStageG.apply(this, arguments);
  const st = G.st, wrap = $('#stageWrap');
  if(!st || !wrap || !Voice.channel) return;
  const { ch } = stageChannel(); if(!ch || ch.id !== Voice.channel.id) return;
  const area = wrap.querySelector('.stage .area'); if(!area) return;
  if(G.hidden){
    area.insertAdjacentHTML('afterbegin', `<button class="gback" id="gBack">${GAMES[st.game].icon} ${GAMES[st.game].name} está rolando · <b>voltar para o jogo</b></button>`);
    wrap.querySelector('#gBack').onclick = () => { G.hidden = false; renderStage(); };
    return;
  }
  area.classList.add('withgame');
  area.querySelectorAll('.focus').forEach(f => f.classList.add('hidden'));
  const t = area.querySelector('.tiles'); if(t){ t.classList.remove('grid'); t.classList.add('strip'); }
  if(!G.el) renderGame();
  area.prepend(G.el);
};
setInterval(() => {
  if(!G.st) return;
  hostTick(); hostHints(); checkHost();
  const t = document.getElementById('gTimer'); if(t && G.st.dl) t.textContent = Math.max(0, Math.ceil((G.st.dl - now()) / 1000));
}, 250);
const _joinVoiceG = joinVoice;
joinVoice = async function(){ const r = await _joinVoiceG.apply(this, arguments); G.st = null; G.strokes = []; setTimeout(() => Voice.channel && send('hello'), 1500); return r; };
const _leaveVoiceG = leaveVoice;
leaveVoice = async function(){ if(G.st && G.st.players.includes(S.me.id) && !amHost()) send('act', { a: 'leave' }); G.st = null; if(G.el) G.el.remove(); return _leaveVoiceG.apply(this, arguments); };
App.gameNew = gameNew;
App.gameState = () => G.st;
