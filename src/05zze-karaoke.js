/* =====================================================================
   v6.39: KARAOKÊ NA CALL
   Quem abre escolhe o arquivo da música (MP3, M4A, OGG, WAV) e cola a letra.
   A música toca ao mesmo tempo para todo mundo da call (cada um ouve no próprio
   aparelho, então não estoura no microfone de ninguém) e a letra vai rolando na tela.
   - Letra com tempo (formato LRC: "[01:23.45] linha") rola sozinha.
   - Letra sem tempo: quem abriu passa as linhas (botão ou seta ↓ / espaço).
   A letra é sempre a que a pessoa colou; o Telão não busca letra em lugar nenhum.
   ===================================================================== */
const KR = { st: null, audio: null, off: 0, t: null, lastSend: 0, mini: false, ended: false };
const krMine = () => KR.st && KR.st.by === S.me.id;
function krParse(text){
  const raw = String(text || '').replace(/\r/g, '').split('\n');
  const timed = [];
  raw.forEach(l => {
    const tags = [...l.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if(!tags.length) return;
    const s = l.replace(/\[[^\]]*\]/g, '').trim();
    tags.forEach(m => timed.push({ t: (+m[1]) * 60 + (+m[2]) + (m[3] ? +('0.' + m[3]) : 0), s }));
  });
  if(timed.length >= 2) return { timed: true, lines: timed.sort((a, b) => a.t - b.t).slice(0, 400).map(x => ({ t: +x.t.toFixed(2), s: x.s.slice(0, 140) })) };
  return { timed: false, lines: raw.map(x => x.trim()).filter(x => x && !/^\[[a-z]+:.*\]$/i.test(x)).slice(0, 400).map(s => ({ s: s.slice(0, 140) })) };
}
function krSend(extra){
  if(!krMine()) return;
  KR.lastSend = Date.now();
  Voice.sendFx(Object.assign({ t: 'kara', st: KR.st, now: Date.now() }, extra || {}));
}
function krPos(){
  const st = KR.st; if(!st) return 0;
  if(st.paused != null) return st.paused;
  return Math.max(0, (Date.now() + KR.off - st.at) / 1000);
}
function krAudio(){
  if(!KR.audio){ KR.audio = new Audio(); KR.audio.preload = 'auto'; KR.audio.onended = () => { KR.ended = true; krDraw(); setTimeout(() => { if(KR.ended && KR.st){ if(krMine()) Voice.sendFx({ t: 'kara', stop: true, id: KR.st.id }); else krClose(); } }, 6000); }; }
  KR.audio.volume = P.karaVol ?? 0.8;
  return KR.audio;
}
function krSync(){
  const st = KR.st; if(!st) return;
  const a = krAudio();
  if(a.dataset.src !== st.url){ a.dataset.src = st.url; a.src = st.url; KR.ended = false; }
  const pos = krPos();
  if(st.paused != null){ if(!a.paused) a.pause(); if(Math.abs(a.currentTime - pos) > 0.3) try{ a.currentTime = pos; }catch(e){} return; }
  if(a.duration && pos > a.duration + 1){ return; }
  if(Math.abs(a.currentTime - pos) > 0.35) try{ a.currentTime = pos; }catch(e){}
  if(a.paused && !KR.ended) a.play().catch(() => { krDraw(true); });
}
function krLineIdx(){
  const st = KR.st; if(!st) return -1;
  if(!st.timed) return st.line || 0;
  const p = krPos(); let i = -1;
  for(let k = 0; k < st.lines.length; k++){ if(st.lines[k].t <= p + 0.15) i = k; else break; }
  return i;
}
function krDraw(needTap){
  let box = $('#karaBox');
  if(!KR.st){ box && box.remove(); return; }
  if(!box){ document.body.insertAdjacentHTML('beforeend', '<div class="karabox" id="karaBox"></div>'); box = $('#karaBox'); }
  const st = KR.st, i = krLineIdx(), L = st.lines;
  const cur = L[i], prev = L[i - 1], next = L.slice(i + 1, i + 3);
  let frac = 0;
  if(st.timed && cur){ const end = L[i + 1] ? L[i + 1].t : cur.t + 4; frac = Math.max(0, Math.min(1, (krPos() - cur.t) / Math.max(0.5, end - cur.t))); }
  const a = KR.audio, dur = a && a.duration || 0, pos = krPos();
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  box.className = 'karabox' + (KR.mini ? ' mini' : '');
  box.innerHTML = `<div class="krtop"><span class="krt">🎤 <b>${esc(st.title || 'Karaokê')}</b> <small>· ${esc(prof(st.by).display_name)}</small></span><span class="grow"></span>
      <input type="range" min="0" max="100" value="${Math.round((P.karaVol ?? 0.8) * 100)}" id="krVol" title="Volume da música (só para você)">
      <button id="krMini" title="${KR.mini ? 'Mostrar letra' : 'Minimizar'}">${ic(KR.mini ? 'expand' : 'chevDown', 16)}</button>
      ${krMine() ? `<button id="krStop" title="Encerrar karaokê">${ic('x', 16)}</button>` : `<button id="krHide" title="Fechar só para mim">${ic('x', 16)}</button>`}</div>
    ${KR.mini ? '' : `<div class="krlines">
      <div class="krl prev">${prev ? esc(prev.s) : ''}</div>
      <div class="krl cur" style="--kf:${(frac * 100).toFixed(1)}%">${cur ? (esc(cur.s) || '♪') : (KR.ended ? 'Fim! 👏' : st.timed ? '♪ ♪ ♪' : esc((L[0] || {}).s || '♪'))}</div>
      ${next.map(x => `<div class="krl nxt">${esc(x.s) || '♪'}</div>`).join('')}</div>`}
    <div class="krbar"><span>${fmt(pos)}${dur ? ' / ' + fmt(dur) : ''}</span><div class="krprog"><i style="width:${dur ? Math.min(100, pos / dur * 100).toFixed(1) : 0}%"></i></div>
      ${krMine() ? `<button id="krPlay" title="${st.paused != null ? 'Continuar' : 'Pausar'}">${ic(st.paused != null ? 'play' : 'pause', 16)}</button>${st.timed ? '' : `<button id="krNext" class="btn sm" title="Próxima linha (↓ ou espaço)">Próxima linha ${ic('chevDown', 14)}</button>`}` : ''}
      ${needTap ? '<button class="btn sm" id="krTap">▶ Tocar música</button>' : ''}</div>`;
  const $k = q => box.querySelector(q);
  $k('#krVol').oninput = e => { P.karaVol = e.target.value / 100; savePrefs(); if(KR.audio) KR.audio.volume = P.karaVol; };
  $k('#krMini').onclick = () => { KR.mini = !KR.mini; krDraw(); };
  if($k('#krStop')) $k('#krStop').onclick = () => { Voice.sendFx({ t: 'kara', stop: true, id: st.id }); };
  if($k('#krHide')) $k('#krHide').onclick = krHide;
  if($k('#krPlay')) $k('#krPlay').onclick = krToggle;
  if($k('#krNext')) $k('#krNext').onclick = () => krStep(1);
  if($k('#krTap')) $k('#krTap').onclick = () => { krSync(); krDraw(); };
}
function krToggle(){
  const st = KR.st; if(!krMine() || !st) return;
  if(st.paused != null){ st.at = Date.now() - st.paused * 1000; st.paused = null; }
  else st.paused = krPos();
  KR.off = 0; krSend(); krSync(); krDraw();
}
function krStep(d){
  const st = KR.st; if(!krMine() || !st || st.timed) return;
  st.line = Math.max(0, Math.min(st.lines.length - 1, (st.line || 0) + d)); krSend(); krDraw();
}
function krLoop(){
  clearInterval(KR.t);
  KR.t = setInterval(() => {
    if(!KR.st){ clearInterval(KR.t); return; }
    if(KR.hidden === KR.st.id) return;
    if(!document.hidden) krDraw();
    if(KR.audio && !KR.audio.paused && KR.st.paused == null){ const d = Math.abs(KR.audio.currentTime - krPos()); if(d > 0.6) krSync(); }
  }, 200);
  clearInterval(KR.t2);
  KR.t2 = setInterval(() => { if(!KR.st){ clearInterval(KR.t2); return; } if(krMine() && Date.now() - KR.lastSend > 8000) krSend(); }, 2000);   // quem entrou depois também recebe
}
function krClose(){
  if(KR.audio){ try{ KR.audio.pause(); }catch(e){} }
  KR.st = null; KR.ended = false; KR.hidden = null; clearInterval(KR.t); krDraw();
}
function krHide(){ if(!KR.st) return; KR.hidden = KR.st.id; if(KR.audio) try{ KR.audio.pause(); }catch(e){} const b = $('#karaBox'); b && b.remove(); }
function krShow(){ KR.hidden = null; KR.mini = false; krSync(); krDraw(); }
const _onFxKR = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && pl.t === 'kara'){
    if(pl.stop){ if(KR.st && (!pl.id || KR.st.id === pl.id)){ if(!mine) App.toast('O karaokê acabou. 🎤'); krClose(); } return; }
    if(!pl.st || !pl.st.url || !/^(https:|blob:)/.test(pl.st.url)) return;
    const isNew = !KR.st || KR.st.id !== pl.st.id;
    if(mine){ KR.off = 0; } else { KR.off = (pl.now || Date.now()) - Date.now(); }
    if(!mine || isNew) KR.st = pl.st;
    if(isNew){ KR.ended = false; KR.hidden = null; if(!mine) App.toast(`🎤 ${prof(pl.st.by).display_name} começou um karaokê: ${pl.st.title || ''}`); krLoop(); }
    if(KR.hidden === pl.st.id) return;   // fechou só para si: continua sabendo, mas sem tocar
    krSync(); krDraw();
    return;
  }
  _onFxKR(pl, mine);
};
const _leaveVoiceKR = leaveVoice;
leaveVoice = function(){ if(KR.st){ if(krMine()) Voice.sendFx({ t: 'kara', stop: true, id: KR.st.id }); krClose(); } return _leaveVoiceKR.apply(this, arguments); };
document.addEventListener('keydown', e => {
  if(!krMine() || !KR.st || KR.st.timed || /input|textarea|select/i.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable)) return;
  if(e.key === 'ArrowDown' || (e.key === ' ' && $('#karaBox') && $('#karaBox').contains(document.activeElement))){ e.preventDefault(); krStep(1); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); krStep(-1); }
});

function karaStart(){
  if(!Voice.channel){ App.toast('Entre numa chamada para o karaokê.', true); return; }
  modal(`<form id="krF"><div class="mh"><h2>🎤 Karaokê</h2><p>A música toca para todo mundo da call ao mesmo tempo e a letra vai aparecendo na tela.</p></div>
    <div class="mc">
      <label class="field"><span>Música (arquivo do seu PC ou celular)</span><input type="file" id="krFile" accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.ogg,.opus,.wav,.aac,.flac" class="inp"></label>
      <label class="field"><span>Nome da música</span><input class="inp" id="krTitle" maxlength="80" placeholder="Ex.: Evidências — Chitãozinho & Xororó"></label>
      <label class="field"><span>Letra</span><textarea class="inp" id="krLyr" rows="8" maxlength="12000" placeholder="Cole a letra aqui.\n\nCom tempo (formato LRC) ela rola sozinha:\n[00:12.50] primeira linha\n[00:16.80] segunda linha\n\nSem tempo, você passa as linhas com a seta ↓."></textarea></label>
      <small class="mut">Dica: arquivos .lrc (letra com tempo) dá para abrir no Bloco de Notas e colar aqui.</small>
      <div class="err" id="krErr"></div>
    </div>
    <div class="mf wrapf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn" id="krGo">${ic('play', 16)} Começar</button></div></form>`, m => {
    const f = m.querySelector('#krFile'), t = m.querySelector('#krTitle');
    f.onchange = () => { const x = f.files[0]; if(x && !t.value) t.value = x.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').slice(0, 80); };
    m.querySelector('#krF').onsubmit = async e => {
      e.preventDefault();
      const err = m.querySelector('#krErr'), go = m.querySelector('#krGo'), file = f.files[0];
      const lyr = m.querySelector('#krLyr').value;
      if(!file){ err.textContent = 'Escolha o arquivo da música.'; return; }
      if(!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|ogg|opus|wav|aac|flac|webm|mp4)$/i.test(file.name)){ err.textContent = 'Esse arquivo não é de música.'; return; }
      if(file.size > 25 * 1048576){ err.textContent = 'Arquivo grande demais (máx. 25 MB).'; return; }
      const parsed = krParse(lyr);
      if(!parsed.lines.length){ err.textContent = 'Cole a letra da música.'; return; }
      go.disabled = true; go.innerHTML = '<span class="spin sm"></span> Enviando a música…';
      try{
        const meta = await uploadOne({ file });
        KR.st = { id: Math.random().toString(36).slice(2, 10), url: meta.url, title: t.value.trim().slice(0, 80), by: S.me.id, timed: parsed.timed, lines: parsed.lines, line: 0, at: Date.now() + 2500, paused: null };
        KR.off = 0; KR.hidden = null; closeModal();
        krSend(); krLoop(); krSync(); krDraw();
        App.toast(parsed.timed ? 'Começa em 2 segundos! A letra rola sozinha.' : 'Começa em 2 segundos! Passe as linhas com a seta ↓.');
      }catch(x){ err.textContent = 'Não deu para enviar: ' + (x.message || x); go.disabled = false; go.innerHTML = `${ic('play', 16)} Começar`; }
    };
  });
}
const _activitiesMenuKR = activitiesMenu;
activitiesMenu = function(anchor){
  _activitiesMenuKR(anchor);
  const el = $('#menu'); if(!el.classList.contains('actpop')) return;
  const rl = el.querySelector('#acRl'); if(!rl || el.querySelector('#acKara')) return;
  rl.insertAdjacentHTML('afterend', `<button class="actbig" id="acKara"><span class="ai">🎤</span><div><b>Karaokê</b><small>${KR.st ? 'Tem um tocando agora · clique para ver a letra' : 'Música pra todo mundo e a letra rolando na tela'}</small></div></button>`);
  el.querySelector('#acKara').onclick = () => { closeMenu(); if(KR.st) krShow(); else karaStart(); };
};
App.kara = { start: karaStart, get st(){ return KR.st; }, parse: krParse, toggle: krToggle, step: krStep };
