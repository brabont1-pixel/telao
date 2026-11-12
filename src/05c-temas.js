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
