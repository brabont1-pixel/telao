/* =====================================================================
   v6.15: ASSISTIR JUNTOS, VERSÃO 2
   - fila de vídeos (YouTube, links .mp4/.webm e clipes do Telão), passa sozinho para o próximo
   - quem entra depois na chamada já cai no vídeo, no mesmo ponto (antes não chegava)
   - correção automática de atraso a cada poucos segundos, velocidade sincronizada
   - aviso de quem pausou/pulou, e vídeo que não pode tocar fora do YouTube é pulado
   ===================================================================== */
const VID_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
WT.queue = []; WT.item = null; WT.rate = 1; WT.hb = null;
const wtKey = () => Math.random().toString(36).slice(2, 10);
// quem está há mais tempo… na verdade: a sessão de menor id entre quem está na chamada. Ela avança a fila e manda o "relógio".
function wtLeader(){
  if(!Voice.channel) return false;
  const list = voiceUsers(Voice.channel).map(m => m.session).filter(Boolean).concat(Voice.SESSION).sort();
  return list[0] === Voice.SESSION;
}
async function wtItemFrom(text){
  text = String(text || '').trim(); if(!text) return null;
  const id = ytId(text);
  if(id){
    let title = 'Vídeo do YouTube';
    try{ const j = await (await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id))).json(); if(j && j.title) title = j.title; }catch(e){}
    return { key: wtKey(), kind: 'yt', id, title, by: S.me.id };
  }
  if(/^https?:\/\//.test(text) && VID_EXT.test(text)) return { key: wtKey(), kind: 'file', url: text, title: decodeURIComponent(text.split('/').pop().split('?')[0]).slice(0, 80), by: S.me.id };
  return null;
}
App.wtPlayList = (items, start) => {
  if(!Voice.channel){ App.toast('Entre numa chamada para assistir junto.', true); return false; }
  const list = items.map(x => ({ key: wtKey(), by: S.me.id, ...x }));
  if(!list.length) return false;
  Voice.sendFx({ t: 'wt-load', item: list[0], queue: list.slice(1), time: start || list[0].start || 0, playing: true, rate: 1 });
  return true;
};

wtPrompt = function(){
  const playing = WT.active && WT.channel === (Voice.channel && Voice.channel.id);
  modal(`<form id="wtF"><div class="mh"><h2>${ic('tv',22)} Assistir juntos</h2><p>Cole um link do YouTube ou de um vídeo (.mp4, .webm). Toca sincronizado para todos na chamada: quando alguém pausa ou pula, pula para todo mundo.</p></div>
    <div class="mc"><input class="inp" id="wtU" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off">
      ${playing ? `<p class="mut small" style="margin-top:8px">Já tem um vídeo passando. Escolha se ele entra agora ou depois.</p>` : ''}</div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button>${playing ? `<button type="button" class="btn sec" id="wtQ">${ic('list',16)} Pôr na fila</button>` : ''}<button class="btn">${playing ? 'Tocar agora' : 'Começar'}</button></div></form>`, m => {
    const get = async () => { const it = await wtItemFrom(m.querySelector('#wtU').value); if(!it) App.toast('Esse link não parece ser do YouTube nem de um vídeo.', true); return it; };
    m.querySelector('#wtF').onsubmit = async e => {
      e.preventDefault(); const it = await get(); if(!it) return;
      closeModal(); Voice.sendFx({ t: 'wt-load', item: it, queue: WT.active ? WT.queue : [], time: 0, playing: true, rate: 1 });
    };
    const qb = m.querySelector('#wtQ'); if(qb) qb.onclick = async () => {
      const it = await get(); if(!it) return;
      closeModal(); Voice.sendFx({ t: 'wt-queue', queue: WT.queue.concat(it), note: `colocou “${it.title}” na fila` });
    };
    setTimeout(() => m.querySelector('#wtU').focus(), 50);
  });
};

function wtSetItem(item, time, playing, rate){
  try{ WT.player && WT.player.destroy && WT.player.destroy(); }catch(e){}
  WT.player = null;
  Object.assign(WT, { active: true, channel: Voice.channel.id, item, id: item.kind === 'yt' ? item.id : null, title: item.title || '', rate: rate || 1,
    state: { time: time || 0, playing: playing !== false, at: Date.now() } });
}
function wtAdvance(fromKey){
  if(!WT.item || WT.item.key !== fromKey) return;
  if(WT.queue.length) Voice.sendFx({ t: 'wt-load', item: WT.queue[0], queue: WT.queue.slice(1), time: WT.queue[0].start || 0, playing: true, rate: WT.rate, auto: true });
  else Voice.sendFx({ t: 'wt-stop', auto: true });
}
function wtNow(){ try{ return WT.player && WT.player.getCurrentTime ? WT.player.getCurrentTime() : 0; }catch(e){ return 0; } }
function wtIsPlaying(){ try{ return WT.player && WT.player.getPlayerState ? WT.player.getPlayerState() === 1 : false; }catch(e){ return false; } }
function wtApplyRemote(time, playing, rate){
  if(!WT.player || !WT.player.seekTo) { WT.state = { time, playing, at: Date.now() }; return; }
  WT.apply = true;
  try{
    if(rate && rate !== WT.rate){ WT.rate = rate; WT.player.setPlaybackRate && WT.player.setPlaybackRate(rate); }
    if(Math.abs(wtNow() - time) > 1.5) WT.player.seekTo(time, true);
    if(playing && !wtIsPlaying()) WT.player.playVideo(); else if(!playing && wtIsPlaying()) WT.player.pauseVideo();
  }catch(e){}
  setTimeout(() => WT.apply = false, 800);
}

onWT = function(pl, mine){
  if(!Voice.channel) return;
  const who = pl.uid && pl.uid !== S.me.id ? prof(pl.uid).display_name : null;
  if(pl.t === 'wt-load' || (pl.t === 'wt-load-for' && pl.to === Voice.SESSION)){
    if(pl.t === 'wt-load-for' && WT.active && WT.item) return;
    const item = pl.item || (pl.id ? { key: pl.id, kind: 'yt', id: pl.id, title: '' } : null); if(!item) return;
    wtSetItem(item, pl.time, pl.playing, pl.rate); WT.queue = Array.isArray(pl.queue) ? pl.queue.slice(0, 50) : [];
    S.focus = 'wt'; renderStage();
    if(who && pl.t === 'wt-load') App.toast(pl.auto ? `Próximo vídeo: ${item.title || 'vídeo'}` : `${who} colocou um vídeo para assistir juntos`);
  }
  else if(pl.t === 'wt-stop'){
    WT.active = false; WT.item = null; WT.queue = [];
    try{ WT.player && WT.player.destroy && WT.player.destroy(); }catch(e){}
    WT.player = null; if(S.focus === 'wt') S.focus = null; renderStage();
    if(who && !pl.auto) App.toast(`${who} encerrou o assistir juntos`);
  }
  else if(pl.t === 'wt-queue'){
    WT.queue = Array.isArray(pl.queue) ? pl.queue.slice(0, 50) : [];
    wtBar(); if(who && pl.note) App.toast(`${who} ${pl.note}`);
  }
  else if(pl.t === 'wt-sync' && !mine && WT.active){
    const was = wtIsPlaying();
    wtApplyRemote(pl.time, pl.playing, pl.rate);
    if(who && !pl.hb){
      if(was && !pl.playing) App.toast(`${who} pausou`);
      else if(pl.rate && pl.rate !== 1 && pl.rateChanged) App.toast(`${who} mudou a velocidade para ${pl.rate}x`);
    }
  }
  else if(pl.t === 'wt-hello' && !mine && WT.active && WT.item){
    // quem já está assistindo responde (quem chega fica com a primeira resposta)
    setTimeout(() => { if(WT.active && WT.item) Voice.sendFx({ t: 'wt-load-for', to: pl.from, item: WT.item, queue: WT.queue, time: wtNow() || (WT.state ? WT.state.time : 0), playing: WT.player ? wtIsPlaying() : WT.state.playing, rate: WT.rate }); }, Math.random() * 400);
  }
};

/* quem entra na chamada pergunta se tem vídeo passando */
const _joinVoiceWT = joinVoice;
joinVoice = async function(){
  const r = await _joinVoiceWT.apply(this, arguments);
  WT.active = false; WT.item = null; WT.queue = [];
  if(Voice.channel){ [1500, 4000].forEach(t => setTimeout(() => { if(Voice.channel && !WT.active) Voice.sendFx({ t: 'wt-hello' }); }, t)); }
  return r;
};
/* "relógio" do líder: corrige quem atrasou */
setInterval(() => {
  if(!WT.active || !WT.player || !Voice.channel || WT.channel !== Voice.channel.id || !wtLeader()) return;
  Voice.sendFx({ t: 'wt-sync', time: wtNow(), playing: wtIsPlaying(), rate: WT.rate, hb: true });
}, 8000);

/* player de arquivo com a mesma "cara" do player do YouTube */
function fileWTPlayer(box, url, start, playing, rate, onState){
  const v = document.createElement('video'); v.src = url; v.playsInline = true; v.controls = true; v.className = 'wtvideo'; v.crossOrigin = 'anonymous';
  box.replaceWith(v); v.id = 'wtPlayer';
  v.addEventListener('loadedmetadata', () => { try{ v.currentTime = start || 0; }catch(e){} v.playbackRate = rate || 1; if(playing) v.play().catch(() => App.toast('Toque no vídeo para começar.')); }, { once: true });
  v.onplay = () => onState(1); v.onpause = () => { if(!v.ended) onState(2); }; v.onended = () => onState(0); v.onseeked = () => onState(v.paused ? 2 : 1);
  v.onerror = () => onState(-2);
  return { getCurrentTime: () => v.currentTime, seekTo: t => { v.currentTime = t; }, playVideo: () => v.play().catch(() => {}), pauseVideo: () => v.pause(),
    getPlayerState: () => v.ended ? 0 : v.paused ? 2 : 1, setPlaybackRate: r => { v.playbackRate = r; }, destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); }, getIframe: () => v, isFile: true };
}

function wtBar(){
  const bar = document.querySelector('.wtbar'); if(!bar) return;
  bar.innerHTML = `<span class="wtt">${ic('tv',16)} ${esc(WT.title || 'Assistindo juntos')}</span><span class="grow"></span>
    <select id="wtRate" class="wtrate" data-tip="Velocidade">${[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => `<option value="${r}" ${r === WT.rate ? 'selected' : ''}>${r}x</option>`).join('')}</select>
    <button id="wtQueue">${ic('list',16)} Fila${WT.queue.length ? ` (${WT.queue.length})` : ''}</button>
    ${WT.queue.length ? `<button id="wtNext">${ic('skip',16)} Próximo</button>` : ''}
    <button id="wtChange">${ic('plus',16)} Adicionar</button><button id="wtStop">${ic('x',16)} Encerrar</button>`;
  const $b = q => bar.querySelector(q);
  $b('#wtStop').onclick = () => Voice.sendFx({ t: 'wt-stop' });
  $b('#wtChange').onclick = wtPrompt;
  const nx = $b('#wtNext'); if(nx) nx.onclick = () => WT.item && wtAdvance(WT.item.key);
  $b('#wtRate').onchange = e => { const r = +e.target.value; WT.rate = r; try{ WT.player.setPlaybackRate(r); }catch(x){} Voice.sendFx({ t: 'wt-sync', time: wtNow(), playing: wtIsPlaying(), rate: r, rateChanged: true }); };
  $b('#wtQueue').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.left, r.bottom + 6, [{ html: `<b>A seguir</b>` }].concat(WT.queue.length ? WT.queue.map((it, i) => ({ raw: `<div class="wtqi"><span class="n">${i + 1}</span><div class="t"><b>${esc(it.title || 'vídeo')}</b><small>por ${esc(prof(it.by).display_name)}</small></div><button class="ibtn sm" data-wtplay="${i}" data-tip="Tocar agora">${ic('play',14)}</button><button class="ibtn sm" data-wtrm="${i}" data-tip="Tirar da fila">${ic('x',14)}</button></div>` })) : [{ html: '<span class="mut small">A fila está vazia. Use “Adicionar”.</span>' }]));
    const mm = $('#menu');
    mm.querySelectorAll('[data-wtrm]').forEach(b => b.onclick = () => { const q = WT.queue.slice(); const [it] = q.splice(+b.dataset.wtrm, 1); closeMenu(); Voice.sendFx({ t: 'wt-queue', queue: q, note: `tirou “${it.title}” da fila` }); });
    mm.querySelectorAll('[data-wtplay]').forEach(b => b.onclick = () => { const q = WT.queue.slice(); const [it] = q.splice(+b.dataset.wtplay, 1); closeMenu(); Voice.sendFx({ t: 'wt-load', item: it, queue: q, time: it.start || 0, playing: true, rate: WT.rate }); });
  };
}

mountWT = async function(){
  const box = $('#wtPlayer'); if(!box || !WT.item) return;
  wtBar();
  if(WT.player && WT.player.getIframe && WT.player.getIframe()){ box.replaceWith(WT.player.getIframe()); return; }
  const st = WT.state || { time: 0, playing: true, at: Date.now() };
  const start = st.time + (st.playing ? (Date.now() - st.at) / 1000 * (WT.rate || 1) : 0);
  const item = WT.item;
  const onState = s => {
    if(s === 0){ if(wtLeader()) wtAdvance(item.key); return; }
    if(s === -2){ App.toast('Esse vídeo não abriu. Pulando…', true); if(wtLeader()) wtAdvance(item.key); return; }
    if(WT.apply) return;
    if(s === 1 || s === 2) Voice.sendFx({ t: 'wt-sync', time: wtNow(), playing: s === 1, rate: WT.rate });
  };
  if(item.kind === 'file'){ WT.player = fileWTPlayer(box, item.url, start, st.playing, WT.rate, onState); return; }
  await loadYTApi();
  if(!$('#wtPlayer') || WT.item !== item) return;
  WT.player = new YT.Player('wtPlayer', { videoId: item.id, width: '100%', height: '100%',
    playerVars: { autoplay: 1, start: Math.floor(start), rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady: e => { try{ if(start) e.target.seekTo(start, true); if(WT.rate !== 1) e.target.setPlaybackRate(WT.rate); if(!st.playing) e.target.pauseVideo();
        const t = e.target.getVideoData().title; if(t){ WT.title = t; const b = $('.wtbar .wtt'); if(b) b.innerHTML = `${ic('tv',16)} ${esc(t)}`; } }catch(_){} },
      onStateChange: e => onState(e.data === 0 ? 0 : e.data),
      onError: () => onState(-2),
    } });
};
