/* =====================================================================
   v6.8: CLIPES — guarda sempre os últimos segundos da call e vira um clipe com um atalho (Alt+C)
   Como funciona: alguns gravadores rodam escalonados (um novo a cada 15 s, cada um vive até 45 s).
   Na hora do clipe sempre existe um que começou há 30–45 s; ele é fechado (arquivo completo e válido)
   e o clipe abre no ponto certo para mostrar só os últimos 30 segundos.
   ===================================================================== */
const CLIP_LEN = 30, CLIP_STEP = 15, CLIP_LIFE = CLIP_LEN + CLIP_STEP + 2;
const CL = { recs: [], key: '', tick: null, ac: null, dest: null, srcNodes: new Map(), stream: null, who: null, busy: false };

function clipSource(){
  const screens = Voice.screens();
  const f = S.focus && S.focus.startsWith('s:') ? screens.find(x => 's:' + x.session === S.focus) : null;
  return f || screens.find(x => x.mine) || screens[0] || null;
}
function clipAudioTracks(src){
  const out = [];
  if(Voice.micStream) Voice.micStream.getAudioTracks().forEach(t => out.push(t));
  Voice.peers.forEach(p => p.streams.forEach(s => s.getAudioTracks().forEach(t => { if(t.readyState === 'live') out.push(t); })));
  if(Voice.screenStream) Voice.screenStream.getAudioTracks().forEach(t => out.push(t));
  return out;
}
function clipMix(tracks){
  if(!CL.ac){
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
    CL.ac = new AC(); CL.dest = CL.ac.createMediaStreamDestination();
  }
  if(CL.ac.state === 'suspended') CL.ac.resume().catch(() => {});
  const want = new Set(tracks.map(t => t.id));
  CL.srcNodes.forEach((n, id) => { if(!want.has(id)){ try{ n.disconnect(); }catch(e){} CL.srcNodes.delete(id); } });
  tracks.forEach(t => {
    if(CL.srcNodes.has(t.id)) return;
    try{ const n = CL.ac.createMediaStreamSource(new MediaStream([t])); n.connect(CL.dest); CL.srcNodes.set(t.id, n); }catch(e){}
  });
  return CL.dest.stream.getAudioTracks()[0] || null;
}
function clipMime(video){
  const list = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm'];
  return list.find(t => MediaRecorder.isTypeSupported(t)) || '';
}
function clipNewRec(){
  if(!CL.stream) return;
  const video = CL.stream.getVideoTracks().length > 0;
  const mime = clipMime(video);
  let mr;
  try{ mr = new MediaRecorder(CL.stream, { mimeType: mime || undefined, videoBitsPerSecond: App.perf === 'game' ? 1500000 : 3000000, audioBitsPerSecond: 128000 }); }catch(e){ return; }
  const rec = { mr, chunks: [], t0: Date.now(), video, mime: mr.mimeType || mime };
  mr.ondataavailable = e => { if(e.data && e.data.size) rec.chunks.push(e.data); };
  try{ mr.start(1000); }catch(e){ return; }
  CL.recs.push(rec);
}
function clipDrop(rec){ rec.dropped = true; try{ if(rec.mr.state !== 'inactive') rec.mr.stop(); }catch(e){} rec.chunks = []; }
function clipReset(){ CL.recs.forEach(clipDrop); CL.recs = []; CL.stream = null; CL.key = ''; }

function clipLoop(){
  const on = P.clipOn !== false && window.MediaRecorder && Voice.channel; // roda mesmo com a janela em segundo plano
  if(!on){ if(CL.recs.length) clipReset(); return; }
  const src = clipSource();
  const vt = src && src.stream.getVideoTracks().find(t => t.readyState === 'live');
  const tracks = clipAudioTracks(src);
  const at = clipMix(tracks);
  // se a fonte de vídeo mudou, recomeça a gravação do zero
  const key = (vt ? vt.id : 'audio') + '|' + (at ? at.id : '');
  if(key !== CL.key){
    clipReset(); CL.key = key; CL.who = src ? src.user_id : null;
    const t = []; if(vt) t.push(vt); if(at) t.push(at);
    if(!t.length) return;
    CL.stream = new MediaStream(t);
    clipNewRec(); return;
  }
  const now = Date.now();
  CL.recs.filter(r => now - r.t0 > CLIP_LIFE * 1000).forEach(r => { clipDrop(r); });
  CL.recs = CL.recs.filter(r => !r.dropped);
  const last = CL.recs[CL.recs.length - 1];
  if(!last || now - last.t0 >= CLIP_STEP * 1000) clipNewRec();
}
function clipRefresh(){
  clearInterval(CL.tick); CL.tick = null;
  if(P.clipOn === false || !window.MediaRecorder){ clipReset(); return; }
  CL.tick = setInterval(clipLoop, 1000); clipLoop();
}
App.clipRefresh = clipRefresh;
clipRefresh();

/* o arquivo do MediaRecorder sai sem duração (e aí não dá para pular no vídeo): escreve a duração no cabeçalho */
async function webmFixDuration(blob, ms){
  try{
    const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 8192)).arrayBuffer());
    const vint = i => { const b = head[i]; let len = 1, m = 0x80; while(len <= 8 && !(b & m)){ len++; m >>= 1; } let v = b & (m - 1); for(let k = 1; k < len; k++) v = v * 256 + head[i + k]; return { len, v, unknown: v === Math.pow(2, 7 * len) - 1 }; };
    const id = i => { const b = head[i]; const len = b & 0x80 ? 1 : b & 0x40 ? 2 : b & 0x20 ? 3 : 4; let v = 0; for(let k = 0; k < len; k++) v = v * 256 + head[i + k]; return { len, v }; };
    let i = 0; const e1 = id(i); if(e1.v !== 0x1A45DFA3) return blob;
    const s1 = vint(i + e1.len); i += e1.len + s1.len + s1.v;
    const seg = id(i); if(seg.v !== 0x18538067) return blob;
    const segSize = vint(i + seg.len); if(!segSize.unknown) return blob;
    i += seg.len + segSize.len;
    while(i < head.length - 12){
      const el = id(i), sz = vint(i + el.len);
      if(el.v === 0x1549A966){ // Info
        const dStart = i + el.len + sz.len, dEnd = dStart + sz.v;
        if(dEnd > head.length) return blob;
        for(let k = dStart; k < dEnd - 1; k++) if(head[k] === 0x44 && head[k + 1] === 0x89) return blob; // já tem duração
        const dur = new Uint8Array(11); dur.set([0x44, 0x89, 0x88]); new DataView(dur.buffer).setFloat64(3, ms);
        const ns = sz.v + 11, size = new Uint8Array(8); size[0] = 0x01; let x = ns; for(let k = 7; k >= 1; k--){ size[k] = x & 0xff; x = Math.floor(x / 256); }
        const idBytes = head.slice(i, i + el.len);
        return new Blob([head.slice(0, i), idBytes, size, head.slice(dStart, dEnd), dur, blob.slice(dEnd)], { type: blob.type });
      }
      if(sz.unknown) return blob;
      i += el.len + sz.len + sz.v;
    }
  }catch(e){}
  return blob;
}

async function takeClip(){
  if(P.clipOn === false){ App.toast('Clipes estão desligados. Ligue em Configurações → Teclas de atalho → Clipes.', true); return; }
  if(!window.MediaRecorder){ App.toast('Seu navegador não consegue gravar clipes.', true); return; }
  if(!Voice.channel){ App.toast('Entre numa call para gravar clipes.', true); return; }
  if(CL.busy) return;
  const now = Date.now();
  const ready = CL.recs.filter(r => now - r.t0 >= CLIP_LEN * 1000);
  const rec = ready.length ? ready[ready.length - 1] : CL.recs[0];
  if(!rec){ App.toast('Ainda não deu tempo de gravar nada. Tente de novo em alguns segundos.', true); return; }
  CL.busy = true;
  App.sfx && App.sfx('screen');
  App.toast('Clipe salvo! Preparando…');
  const age = now - rec.t0;
  CL.recs = CL.recs.filter(r => r !== rec);
  if(!CL.recs.length) clipNewRec(); // continua guardando
  const blob = await new Promise(res => {
    rec.mr.onstop = () => res(new Blob(rec.chunks, { type: (rec.mime || 'video/webm').split(';')[0] }));
    try{ rec.mr.requestData(); rec.mr.stop(); }catch(e){ res(new Blob(rec.chunks, { type: 'video/webm' })); }
  });
  const fixed = await webmFixDuration(blob, age);
  CL.busy = false;
  if(!fixed.size){ App.toast('Não deu para gravar o clipe.', true); return; }
  const start = Math.max(0, age / 1000 - CLIP_LEN);
  clipModal(fixed, start, Math.min(CLIP_LEN, age / 1000), rec.video, CL.who);
}
App.takeClip = takeClip;

function clipTargets(){
  const out = [];
  if(M.ch && M.cid) out.push(M.ch);
  const v = Voice.channel;
  if(v && isPriv(v) && !out.find(c => c.id === v.id)) out.push(v);
  if(v && v.server_id){
    const texts = (S.channels.get(v.server_id) || []).filter(c => c.kind === 'text').sort((a, b) => a.position - b.position);
    const last = texts.find(c => c.id === S.lastChannel[v.server_id]) || texts[0];
    [last, ...texts].forEach(c => { if(c && !out.find(x => x.id === c.id)) out.push(c); });
  }
  return out.slice(0, 12);
}
const chLabel = c => c.kind === 'dm' ? '@' + prof(dmOther(c)).display_name : c.kind === 'group' ? groupName(c) : '#' + c.name;

function clipModal(blob, start, len, video, who){
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16);
  const fname = `clipe-telao-${stamp}.webm`;
  const targets = clipTargets();
  const mb = (blob.size / 1048576).toFixed(1);
  const whoTxt = who && who !== S.me.id ? ' da tela de ' + esc(prof(who).display_name) : who === S.me.id ? ' da sua tela' : ' do áudio da call';
  modal(`<div class="mh"><h2>${ic('zap', 20)} Clipe dos últimos ${Math.round(len)} s</h2><p>Gravado${whoTxt}, com o som da chamada. ${mb} MB.</p></div>
    <div class="mc">
      ${video ? `<video class="clipv" src="${url}#t=${start.toFixed(1)}" controls autoplay playsinline></video>` : `<audio class="clipa" src="${url}#t=${start.toFixed(1)}" controls autoplay></audio>`}
      ${targets.length ? `<label class="field" style="margin-top:12px"><span>Enviar em</span><select class="inp" id="clTo">${targets.map(c => `<option value="${c.id}">${esc(chLabel(c))}</option>`).join('')}</select></label>
        <label class="field"><span>Mensagem (opcional)</span><input class="inp" id="clTxt" maxlength="500" placeholder="olha isso 😂"></label>` : '<p class="mut small" style="margin-top:10px">Abra uma conversa para enviar o clipe no chat, ou baixe o arquivo.</p>'}
    </div>
    <div class="mf"><button class="btn sec" id="clDl">${ic('download', 16)} Baixar</button><span class="grow"></span><button class="btn sec" id="clX">Descartar</button>${targets.length ? `<button class="btn" id="clSend">${ic('send', 16)} Enviar no chat</button>` : ''}</div>`, m => {
    const done = () => { closeModal(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
    m.querySelector('#clX').onclick = done;
    m.onclick = e => { if(e.target === m) done(); };
    m.querySelector('#clDl').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); };
    const sb = m.querySelector('#clSend'); if(sb) sb.onclick = async () => {
      const cid = m.querySelector('#clTo').value, txt = m.querySelector('#clTxt').value.trim();
      if(blob.size > 25 * 1048576){ App.toast('O clipe passou de 25 MB. Baixe e envie de outro jeito.', true); return; }
      sb.disabled = true; sb.textContent = 'Enviando…';
      try{
        const meta = await uploadOne({ file: new File([blob], fname, { type: blob.type }) });
        Object.assign(meta, { clip: true, start: +start.toFixed(1), dur: Math.round(len) });
        const { error } = await App.sb.from('messages').insert({ channel_id: cid, content: txt, attachments: [meta] });
        if(error) throw error;
        done(); App.toast('Clipe enviado!');
      }catch(e){ sb.disabled = false; sb.innerHTML = `${ic('send', 16)} Enviar no chat`; App.toast('Não foi enviado: ' + (e.message || e), true); }
    };
  });
}
