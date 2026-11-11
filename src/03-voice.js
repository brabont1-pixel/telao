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
        <button class="cbtn" id="sbAct" data-tip="Atividades">${ic('sparkles',22)}</button>
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
    $w('#stDraw').onclick = () => { DRAW.on = !DRAW.on; renderStage(); if(DRAW.on) App.toast('✏️ Desenhe na tela: todo mundo assistindo vê. Clique de novo para parar.'); };
    $w('#stCine').onclick = toggleCinema;
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
    try{ await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); App.toast('📸 Print copiado! Cole no chat com Ctrl+V'); }
    catch(e){ App.toast('📸 Print salvo'); }
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
    App.toast(`🎬 Gravação salva (${fmtSize(blob.size)})`);
  };
  rec.start(1000);
  Object.assign(REC, { on:true, rec, t0: Date.now() });
  App.toast('⏺ Gravando… clique de novo para parar e baixar');
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
    }[id] || (()=>{}))();
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
  el.innerHTML = `<div class="pphead">${ic('sparkles',18)} Atividades</div>
    <button class="actbig" id="acWT"><span class="ai">${ic('tv',26)}</span><div><b>Assistir juntos</b><small>Vídeo do YouTube sincronizado para todo mundo na chamada</small></div></button>
    <div class="actsec">${ic('music',15)} Soundboard <small>todos ouvem</small></div>
    <div class="sboard">${SOUNDS.map(([id, e, n]) => `<button data-snd="${id}"><span>${e}</span>${n}</button>`).join('')}</div>
    <div class="actsec">${ic('smile',15)} Reações na tela</div>
    <div class="quickrx">${['😂','🔥','👏','❤️','😮','💀','🎉','👀'].map(e => `<button data-fx="${e}">${e}</button>`).join('')}</div>`;
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.left - 140, innerWidth - 380)) + 'px';
  el.style.top = Math.max(8, r.top - el.offsetHeight - 10) + 'px';
  el.querySelector('#acWT').onclick = () => { closeMenu(); wtPrompt(); };
  el.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => {
    if(Date.now() - lastSound < 1500){ App.toast('Calma! Espere um pouquinho entre os sons 😅'); return; }
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
  if(pl.t === 'wt-load'){ Object.assign(WT, { active:true, channel: Voice.channel.id, id: pl.id, title:'', state:{ time: pl.time, playing: pl.playing, at: Date.now() } }); WT.player = null; S.focus = 'wt'; renderStage(); if(!mine) App.toast(`${prof(pl.uid).display_name} começou um vídeo para assistir juntos 📺`); }
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
      items.push({ html:`<div class="uvol">${ic('volume',16)}<span>Volume</span><b id="uvL">${vol}%</b></div><input type="range" id="uvR" min="0" max="100" value="${vol}" class="range">`,
        mount: el => { const r = el.querySelector('#uvR'); r.oninput = () => { el.querySelector('#uvL').textContent = r.value + '%'; Voice.setUserVolume(uid, r.value / 100); }; } });
    }
    if(fr && fr.status === 'accepted') items.push({ label:'Mensagem', icon: ic('chat',18), onClick: () => openDM(uid) }, { label:'Ligar', icon: ic('phone',18), onClick: async () => { const d = await openDM(uid); if(d) joinVoice(d); } });
    else if(!fr) items.push({ label:'Adicionar amigo', icon: ic('userPlus',18), onClick: async () => {
      const { data, error } = await App.sb.rpc('send_friend_request', { p_username: p.username });
      App.toast(error ? error.message : data === 'accepted' ? 'Agora vocês são amigos!' : 'Pedido enviado!', !!error); loadFriends().then(renderRail);
    }});
    else if(fr.status === 'pending') items.push({ html: `<div style="color:var(--mut);font-size:13px">${fr.incoming ? 'Te mandou pedido de amizade' : 'Pedido de amizade enviado'}</div>` });
    const s = curServer();
    if(s && App.hasPerm(s.id, 16) && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push({ label:'Cargos', icon: ic('shield',18), onClick: () => App.roleAssignMenu(s, uid, x, y) });
    if(s && App.hasPerm(s.id, 4) && uid !== s.owner_id && (S.members.get(s.id) || []).some(m => m.user_id === uid)) items.push('-', { label:'Expulsar do servidor', icon: ic('logout',18), danger:true, onClick: async () => {
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', uid);
      if(error) App.toast(error.message, true);
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
  if(document.body.classList.contains('cinema')) App.toast('🎬 Modo cinema — aperte Esc para sair');
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
  const color = S.me.avatar_color || '#ff6b4a';
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
