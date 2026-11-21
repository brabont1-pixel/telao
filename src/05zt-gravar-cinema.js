/* =====================================================================
   v6.31: GRAVAR A CALL e MODO CINEMA PARA TODOS
   - Gravar: junta a sua voz e o som de todo mundo da call num arquivo de áudio (fica só no seu PC).
     Todo mundo na call vê "🔴 Gravando" enquanto estiver gravando. No fim dá para ouvir, baixar,
     mandar no chat ou transcrever (Whisper, no próprio computador).
   - Cinema: quem está vendo uma tela pode pôr a call toda em modo cinema: a tela ocupa tudo,
     as câmeras ficam pequenas embaixo e tem botões de reação rápida. Esc sai (só para você).
   ===================================================================== */
const CR = { on: false, ac: null, dest: null, rec: null, chunks: [], ids: new Set(), poll: null, beat: null, t0: 0, timer: null, others: new Map() };
const CR_MAX = 2 * 3600 * 1000;
function crAdd(stream){
  if(!stream || CR.ids.has(stream.id) || !stream.getAudioTracks().length) return;
  try{ const src = CR.ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); src.connect(CR.dest); CR.ids.add(stream.id); }catch(e){}
}
function crScan(){
  if(!CR.on) return;
  if(Voice.micStream) crAdd(Voice.micStream);
  Voice.peers.forEach(p => p.streams.forEach(s => crAdd(s)));
}
async function crStart(){
  if(!Voice.channel){ App.toast('Entre numa chamada para gravar.', true); return; }
  if(CR.on) return;
  if(!(await confirmBox('Gravar a call?', 'Grava o áudio de todo mundo nesta chamada (a sua voz e a dos outros). <b>Todos na call vão ver que está gravando.</b> O arquivo fica só com você.', 'Começar a gravar'))) return;
  if(!Voice.channel) return;
  CR.ac = new (window.AudioContext || window.webkitAudioContext)();
  CR.dest = CR.ac.createMediaStreamDestination(); CR.ids = new Set(); CR.chunks = [];
  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => { try{ return MediaRecorder.isTypeSupported(t); }catch(e){ return false; } }) || '';
  try{ CR.rec = new MediaRecorder(CR.dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : {}); }
  catch(e){ App.toast('Não deu para gravar neste navegador: ' + (e.message || e), true); return; }
  CR.on = true; CR.t0 = Date.now(); CR.mime = CR.rec.mimeType || mime || 'audio/webm';
  crScan(); CR.poll = setInterval(crScan, 2000);
  CR.rec.ondataavailable = e => e.data && e.data.size && CR.chunks.push(e.data);
  CR.rec.onstop = crDone;
  CR.rec.start(1000);
  const beat = () => Voice.sendFx({ t: 'callrec', on: true });
  beat(); CR.beat = setInterval(beat, 8000);
  CR.timer = setInterval(() => { crPill(); if(Date.now() - CR.t0 > CR_MAX){ App.toast('A gravação chegou a 2 horas e parou sozinha.'); crStop(); } }, 1000);
  crPill(); App.sfx && App.sfx('screen');
}
function crStop(){
  if(!CR.on) return;
  CR.on = false; clearInterval(CR.poll); clearInterval(CR.beat); clearInterval(CR.timer);
  try{ Voice.sendFx({ t: 'callrec', on: false }); }catch(e){}
  try{ CR.rec.state !== 'inactive' ? CR.rec.stop() : crDone(); }catch(e){ crDone(); }
  crPill();
}
App.callRecToggle = () => CR.on ? crStop() : crStart();
const crFmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };
function crPill(){
  let el = document.getElementById('crPill');
  const others = [...CR.others.entries()].filter(([, t]) => Date.now() - t < 20000).map(([u]) => u);
  if(!CR.on && !others.length){ el && el.remove(); return; }
  if(!el){ el = document.createElement('div'); el.id = 'crPill'; el.className = 'crpill'; document.body.appendChild(el); }
  el.innerHTML = CR.on ? `<span class="dot"></span><b>Gravando a call</b> ${crFmt(Date.now() - CR.t0)}<button class="btn sm red" id="crStopB">${ic('stop', 13)} Parar</button>`
    : `<span class="dot"></span><b>${others.map(u => esc(prof(u).display_name)).join(', ')}</b> ${others.length > 1 ? 'estão' : 'está'} gravando a call`;
  const b = el.querySelector('#crStopB'); if(b) b.onclick = crStop;
}
setInterval(() => { if(CR.others.size){ [...CR.others].forEach(([u, t]) => { if(Date.now() - t > 20000) CR.others.delete(u); }); crPill(); } }, 5000);
async function crDone(){
  try{ CR.ac && CR.ac.close(); }catch(e){}
  const blob = new Blob(CR.chunks, { type: CR.mime.split(';')[0] }); CR.chunks = [];
  if(!blob.size){ App.toast('A gravação saiu vazia.', true); return; }
  const dur = Date.now() - CR.t0, url = URL.createObjectURL(blob);
  const ext = /ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : 'webm';
  const fname = `call-telao-${new Date(CR.t0).toLocaleString('pt-BR').replace(/[/:, ]+/g, '-')}.${ext}`;
  modal(`<div class="mh"><h2>🎙️ Gravação da call</h2><p>${crFmt(dur)} · ${(blob.size / 1048576).toFixed(1)} MB · fica só no seu computador até você mandar.</p></div>
    <div class="mc"><audio controls src="${url}" style="width:100%"></audio>
      <div class="crtx hidden" id="crTx"></div></div>
    <div class="mf wrapf"><button class="btn sec" data-close>Fechar</button><button class="btn sec" id="crTr">${ic('edit', 16)} Transcrever</button><button class="btn sec" id="crSend">${ic('send', 16)} Mandar no chat</button><a class="btn" href="${url}" download="${fname}">${ic('download', 16)} Baixar</a></div>`, m => {
    m.querySelector('#crSend').onclick = async e => {
      const b = e.currentTarget; const cid = M.cid || (Voice.channel && Voice.channel.id);
      if(!cid){ App.toast('Abra uma conversa para mandar.', true); return; }
      b.disabled = true; b.textContent = 'Enviando…';
      try{ const meta = await uploadOne({ file: new File([blob], fname, { type: blob.type }) });
        const { error } = await App.sb.from('messages').insert({ channel_id: cid, content: '🎙️ Gravação da call', attachments: [meta] }); if(error) throw error;
        App.toast('Gravação enviada!'); b.textContent = 'Enviado ✓';
      }catch(x){ b.disabled = false; b.innerHTML = `${ic('send', 16)} Mandar no chat`; App.toast('Não deu para enviar: ' + (x.message || x) + '. Baixe o arquivo e mande de outro jeito se for grande.', true); }
    };
    m.querySelector('#crTr').onclick = e => crTranscribe(blob, m, e.currentTarget);
  });
}
async function crTranscribe(blob, m, btn){
  const box = m.querySelector('#crTx'); box.classList.remove('hidden'); btn.disabled = true;
  const say = t => box.innerHTML = `<div class="spin" style="margin:6px 0"></div><small class="mut">${t}</small>`;
  try{
    say('Preparando o reconhecimento de voz…');
    await whisperPipe(p => say(`Baixando o reconhecimento de voz ${p}% (só na primeira vez)…`));
    say('Lendo o áudio…');
    const ab = await blob.arrayBuffer();
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await tmp.decodeAudioData(ab); tmp.close();
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    say(`Transcrevendo ${crFmt(buf.duration * 1000)} de áudio… (pode levar alguns minutos)`);
    const lang = ({ en: 'english', es: 'spanish' })[P.lang] || 'portuguese';
    const out = await TRX.pipe(pcm, { language: lang, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
    const chunks = (out && out.chunks) || [];
    const text = chunks.length ? chunks.map(c => `[${crFmt(((c.timestamp && c.timestamp[0]) || 0) * 1000)}] ${String(c.text || '').trim()}`).filter(l => l.replace(/^\[[^\]]+\]\s*/, '')).join('\n') : String((out && out.text) || '').trim();
    if(!text){ box.innerHTML = '<small class="mut">Não entendi nada no áudio.</small>'; btn.disabled = false; return; }
    const turl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    box.innerHTML = `<div class="crtxt">${esc(text).replace(/\n/g, '<br>')}</div><div class="gacts"><button class="btn sec sm" id="crCopy">${ic('copy', 14)} Copiar</button><a class="btn sec sm" href="${turl}" download="transcricao-call.txt">${ic('download', 14)} Baixar .txt</a></div>`;
    box.querySelector('#crCopy').onclick = () => copy(text);
  }catch(x){ box.innerHTML = `<small class="err">Não deu para transcrever: ${esc(x.message || String(x))}</small>`; btn.disabled = false; }
}
const _onFxCR = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && pl.t === 'callrec'){
    if(!mine){ if(pl.on){ if(!CR.others.has(pl.uid)) App.toast(`🔴 ${prof(pl.uid).display_name} começou a gravar a call.`); CR.others.set(pl.uid, Date.now()); } else { CR.others.delete(pl.uid); App.toast(`${prof(pl.uid).display_name} parou de gravar a call.`); } crPill(); }
    return;
  }
  if(pl && pl.t === 'cine'){ cineRemote(pl, mine); return; }
  _onFxCR(pl, mine);
};
const _leaveVoiceCR = leaveVoice;
leaveVoice = function(){ if(CR.on) crStop(); CR.others.clear(); crPill(); if(document.body.classList.contains('cinema')) cineExit(); return _leaveVoiceCR.apply(this, arguments); };

/* ---------- modo cinema ---------- */
function cineEnter(){ document.body.classList.add('cinema'); cineIdle(); renderStage(); }
function cineExit(){ document.body.classList.remove('cinema', 'cineidle'); renderStage(); }
function cineRemote(pl, mine){
  if(pl.on){
    if(pl.session) S.focus = 's:' + pl.session;
    if(!mine) App.toast(`🎬 ${prof(pl.uid).display_name} ligou o modo cinema. Esc para sair.`);
    cineEnter();
  } else if(!mine && document.body.classList.contains('cinema')){ cineExit(); }
}
let cineT = null;
function cineIdle(){
  document.body.classList.remove('cineidle'); clearTimeout(cineT);
  if(document.body.classList.contains('cinema')) cineT = setTimeout(() => document.body.classList.add('cineidle'), 3000);
}
document.addEventListener('mousemove', () => { if(document.body.classList.contains('cinema')) cineIdle(); }, { passive: true });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('cinema')) setTimeout(() => { document.body.classList.remove('cineidle'); renderStage(); }, 0); });
function cineMenu(btn){
  const r = btn.getBoundingClientRect(), on = document.body.classList.contains('cinema');
  const f = S.focus && S.focus.startsWith('s:') ? S.focus.slice(2) : null;
  menu(r.left - 160, r.bottom + 6, on ? [{ label: 'Sair do modo cinema', icon: ic('x', 18), onClick: cineExit }]
    : [{ label: 'Modo cinema só para mim', icon: ic('film', 18), onClick: cineEnter },
       ...(f ? [{ label: 'Modo cinema para a call toda', icon: ic('users', 18), onClick: () => Voice.sendFx({ t: 'cine', on: true, session: f }) }] : [])]);
}
const _renderStageCR = renderStage;
renderStage = function(){
  _renderStageCR.apply(this, arguments);
  const cb = document.getElementById('stCine'); if(cb) cb.onclick = e => { e.stopPropagation(); cineMenu(cb); };
  const stage = document.querySelector('#stageWrap .stage');
  if(!stage) return;
  // gravação: botão no painel da call
  const bar = stage.querySelector('.stagebar .sbg:nth-child(2)');
  if(bar && !bar.querySelector('#sbCallRec') && window.MediaRecorder){
    bar.insertAdjacentHTML('beforeend', `<button class="cbtn ${CR.on ? 'rec' : ''}" id="sbCallRec" data-tip="${CR.on ? 'Parar de gravar a call' : 'Gravar a call'}" data-tipsub="áudio de todo mundo">${ic('record', 22)}</button>`);
    bar.querySelector('#sbCallRec').onclick = () => { App.callRecToggle(); setTimeout(renderStage, 300); };
  }
  if(document.body.classList.contains('cinema') && stage.querySelector('#focusBox') && !stage.querySelector('#cineRx')){
    // a tela que estava em foco sumiu (parou de transmitir): sai do cinema
    stage.insertAdjacentHTML('beforeend', `<div class="cinerx" id="cineRx">${['😂', '🔥', '😮', '👏', '❤️', '💀'].map(e => `<button data-cfx="${e}">${e}</button>`).join('')}<button class="cinex" id="cineX" data-tip="Sair do cinema (Esc)">${ic('x', 16)}</button></div>`);
    stage.querySelectorAll('[data-cfx]').forEach(b => b.onclick = () => Voice.sendFx({ t: 'react', e: b.dataset.cfx }));
    stage.querySelector('#cineX').onclick = cineExit;
  }
  if(document.body.classList.contains('cinema') && !stage.querySelector('#focusBox') && S._cineWasFocus) cineExit();
  S._cineWasFocus = !!stage.querySelector('#focusBox');
};
