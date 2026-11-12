/* =====================================================================
   v6.6: TELÃO BOT DE MÚSICA
   Cada pessoa da chamada toca a mesma música no próprio aparelho, sincronizada pelo relógio do servidor.
   Fontes: links do YouTube (busca com chave da API), links diretos de áudio e arquivos enviados.
   ===================================================================== */
S.music = new Map();   // channel_id -> estado (linha de voice_music)
const MU = { cid: null, skew: 0, player: null, audio: null, key: null, kind: null, ready: false, timer: null, open: false, blocked: false };
const muNow = () => Date.now() + MU.skew;
const muPos = cur => Math.max(0, ((cur.paused_at || muNow()) - cur.started_at) / 1000);
const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const BOT_AV = `<span class="botav">${ic('music', 18)}</span>`;

async function muCall(action, arg){
  const cid = MU.cid; if(!cid){ App.toast('Entre numa chamada de voz para usar o Telão Bot.', true); return null; }
  const { data, error } = await App.sb.rpc('music_control', { p_channel: cid, p_action: action, p_arg: arg || null });
  if(error){ App.toast(error.message, true); return null; }
  if(data && data.now) MU.skew = data.now - Date.now();
  if(data && data.state){ S.music.set(cid, data.state); muApply(); renderSidebar(); }
  return data;
}

/* ---------- entrar e sair da chamada ---------- */
function muAttach(){
  const ch = Voice.channel, cid = ch ? ch.id : null;
  if(cid === MU.cid) return;
  muDetach();
  if(!cid) return;
  MU.cid = cid;
  App.sb.from('voice_music').select('*').eq('channel_id', cid).maybeSingle().then(({ data }) => { if(data) S.music.set(cid, data); muCall('sync'); });
}
function muDetach(){
  MU.cid = null; MU.key = null; MU.kind = null;
  try{ MU.player && MU.player.destroy && MU.player.destroy(); }catch(e){}
  MU.player = null;
  if(MU.audio){ MU.audio.pause(); MU.audio.src = ''; MU.audio = null; }
  const d = $('#musicDock'); if(d) d.remove();
}
const _joinVoiceM2 = joinVoice;
joinVoice = async function(){ const r = await _joinVoiceM2.apply(this, arguments); muAttach(); return r; };
const _leaveVoiceM2 = leaveVoice;
leaveVoice = async function(){ muDetach(); return _leaveVoiceM2.apply(this, arguments); };

/* ---------- tocar ---------- */
function muVol(){ const P2 = App.prefs; const v = (P2.musicVol ?? 60) / 100; return Voice.ducking ? v * 0.4 : v; }
async function muApply(){
  const st = MU.cid && S.music.get(MU.cid), cur = st && st.current;
  muDock();
  if(!cur){
    if(MU.key){ try{ MU.player && MU.player.stopVideo(); }catch(e){} if(MU.audio) MU.audio.pause(); MU.key = null; }
    return;
  }
  const pos = muPos(cur), paused = !!cur.paused_at;
  if(cur.key !== MU.key){
    MU.key = cur.key; MU.kind = cur.src;
    if(cur.src === 'yt'){
      if(MU.audio){ MU.audio.pause(); }
      await loadYTApi();
      if(MU.key !== cur.key) return;
      if(MU.player && MU.player.loadVideoById){ MU.player.loadVideoById({ videoId: cur.vid, startSeconds: pos }); if(paused) setTimeout(() => MU.player.pauseVideo(), 400); }
      else {
        const box = $('#muPlayer'); if(!box) return;
        MU.player = new YT.Player('muPlayer', { videoId: cur.vid, width: '100%', height: '100%',
          playerVars: { autoplay: 1, start: Math.floor(pos), controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: e => { e.target.setVolume(muVol() * 100); e.target.seekTo(muPos(S.music.get(MU.cid).current || cur), true); if(paused) e.target.pauseVideo(); else e.target.playVideo(); MU.ready = true; muCheckBlocked(); },
            onStateChange: e => { if(e.data === 0) muEnded(); if(e.data === 1){ MU.blocked = false; muDock(); } },
            onError: () => { App.toast('Esse vídeo não pode tocar fora do YouTube. Pulando…', true); muEnded(); },
          } });
      }
    } else {
      try{ MU.player && MU.player.stopVideo && MU.player.stopVideo(); }catch(e){}
      if(!MU.audio){ MU.audio = new Audio(); MU.audio.crossOrigin = 'anonymous'; MU.audio.onended = muEnded; MU.audio.onplaying = () => { MU.blocked = false; muDock(); }; }
      MU.audio.src = cur.url; MU.audio.volume = muVol();
      MU.audio.currentTime = pos;
      if(!paused) MU.audio.play().catch(() => { MU.blocked = true; muDock(); });
    }
    return;
  }
  // mesma música: ajusta pausa e tempo
  if(MU.kind === 'yt' && MU.player && MU.player.getPlayerState){
    const s = MU.player.getPlayerState();
    if(paused && s === 1) MU.player.pauseVideo();
    if(!paused && s !== 1 && s !== 3) MU.player.playVideo();
    if(Math.abs((MU.player.getCurrentTime() || 0) - pos) > 2.5) MU.player.seekTo(pos, true);
  } else if(MU.audio){
    if(paused && !MU.audio.paused) MU.audio.pause();
    if(!paused && MU.audio.paused) MU.audio.play().catch(() => { MU.blocked = true; muDock(); });
    if(Math.abs(MU.audio.currentTime - pos) > 2.5) MU.audio.currentTime = pos;
  }
}
function muCheckBlocked(){ setTimeout(() => { const cur = MU.cid && (S.music.get(MU.cid) || {}).current; if(cur && !cur.paused_at && MU.player && MU.player.getPlayerState && MU.player.getPlayerState() !== 1){ MU.blocked = true; muDock(); } }, 2500); }
function muEnded(){ const cur = MU.cid && (S.music.get(MU.cid) || {}).current; if(cur) muCall('next', { key: cur.key }); }
setInterval(() => {
  if(!MU.cid) return;
  const v = muVol();
  if(MU.player && MU.player.setVolume) try{ MU.player.setVolume(v * 100); }catch(e){}
  if(MU.audio) MU.audio.volume = v;
  muApply(); muTick();
}, 4000);
setInterval(muTick, 1000);
function muTick(){
  const cur = MU.cid && (S.music.get(MU.cid) || {}).current; if(!cur) return;
  const dur = (MU.kind === 'yt' && MU.player && MU.player.getDuration ? MU.player.getDuration() : MU.audio ? MU.audio.duration : 0) || cur.dur || 0;
  const pos = muPos(cur);
  const t = $('#muTime'); if(t) t.textContent = `${fmtT(pos)}${dur ? ' / ' + fmtT(dur) : ''}`;
  const b = $('#muBar'); if(b) b.style.width = dur ? Math.min(100, pos / dur * 100) + '%' : '0';
}

/* ---------- painel do bot (canto da tela) ---------- */
function muDock(){
  const st = MU.cid && S.music.get(MU.cid), cur = st && st.current, q = (st && st.queue) || [];
  let d = $('#musicDock');
  if(!MU.cid){ if(d) d.remove(); return; }
  if(!d){
    d = document.createElement('div'); d.id = 'musicDock'; d.className = 'mudock';
    d.innerHTML = `<div class="muvid"><div id="muPlayer"></div><div class="mucover" id="muCover"></div><button class="mublock hidden" id="muUnblock">${ic('play', 22)} Toque para ouvir</button></div>
      <div class="mubody"><div class="muhead">${BOT_AV}<div class="t"><b>Telão Bot</b><small id="muNow">Nada tocando</small></div>
        <button class="ibtn sm" id="muMin" data-tip="Minimizar">${ic('chevronDown', 16)}</button></div>
        <div class="muprog"><i id="muBar"></i></div><div class="mutime" id="muTime"></div>
        <div class="muctl"><button class="ibtn sm" id="muLoop" data-tip="Repetir">${ic('refresh', 16)}</button><button class="ibtn sm" id="muPP" data-tip="Pausar">${ic('pause', 18)}</button><button class="ibtn sm" id="muSkip" data-tip="Pular">${ic('skip', 18)}</button><button class="ibtn sm" id="muShuf" data-tip="Embaralhar">${ic('shuffle', 16)}</button><button class="ibtn sm" id="muQ" data-tip="Fila">${ic('list', 16)}<span class="muqn" id="muQn"></span></button><button class="btn sm" id="muAdd">${ic('plus', 14)} Tocar</button></div>
        <div class="muvol">${ic('volume', 15)}<input type="range" id="muVolR" min="0" max="100" value="${App.prefs.musicVol ?? 60}"></div>
        <div class="muqueue hidden" id="muQueue"></div></div>`;
    document.body.appendChild(d);
    const $d = x => d.querySelector(x);
    $d('#muPP').onclick = () => { const c = (S.music.get(MU.cid) || {}).current; if(!c) return muAddModal(); muCall(c.paused_at ? 'resume' : 'pause'); };
    $d('#muSkip').onclick = () => muCall('skip');
    $d('#muShuf').onclick = () => muCall('shuffle');
    $d('#muLoop').onclick = () => { const m = (S.music.get(MU.cid) || {}).repeat_mode || 'off'; const nx = { off: 'all', all: 'one', one: 'off' }[m]; muCall('loop', { mode: nx }); App.toast({ off: 'Repetir desligado', all: 'Repetindo a fila', one: 'Repetindo esta música' }[nx]); };
    $d('#muQ').onclick = () => { MU.open = !MU.open; muDock(); };
    $d('#muAdd').onclick = muAddModal;
    $d('#muMin').onclick = () => { d.classList.toggle('mini'); };
    $d('#muVolR').oninput = e => { App.prefs.musicVol = +e.target.value; savePrefs(); const v = muVol(); if(MU.player && MU.player.setVolume) MU.player.setVolume(v * 100); if(MU.audio) MU.audio.volume = v; };
    $d('#muUnblock').onclick = () => { MU.blocked = false; if(MU.player && MU.player.playVideo) MU.player.playVideo(); if(MU.audio) MU.audio.play().catch(() => {}); muDock(); };
    $d('.muprog').onclick = e => { const c = (S.music.get(MU.cid) || {}).current; const dur = MU.player && MU.player.getDuration ? MU.player.getDuration() : MU.audio ? MU.audio.duration : 0; if(!c || !dur) return; const r = e.currentTarget.getBoundingClientRect(); muCall('seek', { sec: (e.clientX - r.left) / r.width * dur }); };
  }
  d.classList.toggle('idle', !cur);
  const $d = x => d.querySelector(x);
  $d('#muNow').innerHTML = cur ? `<span title="${esc(cur.title || '')}">${esc(cur.title || 'Música')}</span>` : 'Nada tocando · clique em Tocar';
  $d('#muCover').style.backgroundImage = cur && cur.src !== 'yt' ? '' : '';
  $d('#muCover').classList.toggle('hidden', !!(cur && cur.src === 'yt'));
  $d('#muCover').innerHTML = cur && cur.src !== 'yt' ? `${ic('music', 34)}<small>${esc(cur.title || '')}</small>` : (cur ? '' : `${ic('music', 34)}<small>Fila vazia</small>`);
  $d('#muPP').innerHTML = ic(cur && !cur.paused_at ? 'pause' : 'play', 18);
  $d('#muPP').dataset.tip = cur && !cur.paused_at ? 'Pausar' : 'Continuar';
  $d('#muLoop').classList.toggle('on', !!(st && st.repeat_mode && st.repeat_mode !== 'off'));
  $d('#muLoop').dataset.tip = { off: 'Repetir', all: 'Repetindo a fila', one: 'Repetindo esta música' }[(st && st.repeat_mode) || 'off'];
  $d('#muQn').textContent = q.length ? q.length : '';
  $d('#muUnblock').classList.toggle('hidden', !MU.blocked);
  const qe = $d('#muQueue'); qe.classList.toggle('hidden', !MU.open);
  if(MU.open) qe.innerHTML = `<div class="muqh">A seguir</div>${q.map((t, i) => `<div class="muqi"><span class="n">${i + 1}</span><div class="t"><b>${esc(t.title || 'Música')}</b><small>pedida por ${esc(prof(t.by).display_name)}</small></div><button class="ibtn sm" data-murm="${esc(t.key)}" data-tip="Tirar da fila">${ic('x', 14)}</button></div>`).join('') || '<div class="mut small" style="padding:8px">A fila está vazia.</div>'}${cur || q.length ? `<button class="btn sec sm" id="muStop" style="margin-top:6px">${ic('stop', 14)} Parar e limpar</button>` : ''}`;
  qe.querySelectorAll('[data-murm]').forEach(b => b.onclick = () => muCall('remove', { key: b.dataset.murm }));
  const sp = $d('#muStop'); if(sp) sp.onclick = () => muCall('stop');
  muTick();
}

/* ---------- colocar música ---------- */
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)(\?|#|$)/i;
function ytIdOf(u){
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i);
  return m ? m[1] : null;
}
const ytKey = () => (S.cfg && S.cfg.youtube_api_key) || '';
async function ytTitle(vid){
  try{ const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid)); const j = await r.json(); if(j && j.title) return { title: j.title, thumb: j.thumbnail_url }; }catch(e){}
  return { title: 'Vídeo do YouTube', thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` };
}
async function ytSearch(q){
  const k = ytKey(); if(!k) return null;
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '8', q, key: k, videoEmbeddable: 'true', safeSearch: 'moderate' });
  const r = await fetch(u); const j = await r.json();
  if(j.error) throw new Error(j.error.message);
  const tmp = document.createElement('textarea');
  return (j.items || []).map(it => { tmp.innerHTML = it.snippet.title; return { vid: it.id.videoId, title: tmp.value, ch: it.snippet.channelTitle, thumb: it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default).url }; });
}
async function ytPlaylist(list){
  const k = ytKey(); if(!k) return null;
  const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  u.search = new URLSearchParams({ part: 'snippet', maxResults: '50', playlistId: list, key: k });
  const j = await (await fetch(u)).json(); if(j.error) throw new Error(j.error.message);
  return (j.items || []).filter(it => it.snippet.resourceId && it.snippet.resourceId.videoId).map(it => ({ vid: it.snippet.resourceId.videoId, title: it.snippet.title }));
}
async function spotifyTitle(url){
  try{ const j = await (await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url))).json(); return j && j.title; }catch(e){ return null; }
}
/* recebe um link ou um nome e coloca na fila; devolve o título */
async function muQueueFrom(text, announce){
  text = (text || '').trim(); if(!text) return null;
  if(!MU.cid){ App.toast('Entre numa chamada de voz para usar o Telão Bot.', true); return null; }
  let tracks = [];
  const list = (text.match(/[?&]list=([\w-]+)/) || [])[1];
  const vid = ytIdOf(text);
  if(list && !vid && ytKey()){
    const items = await ytPlaylist(list).catch(e => { App.toast(e.message, true); return []; });
    tracks = items.slice(0, 50).map(it => ({ src: 'yt', vid: it.vid, title: it.title }));
  } else if(vid){
    const t = await ytTitle(vid); tracks = [{ src: 'yt', vid, title: t.title, thumb: t.thumb }];
  } else if(/^https?:\/\//.test(text) && AUDIO_EXT.test(text)){
    tracks = [{ src: 'url', url: text, title: decodeURIComponent(text.split('/').pop().split('?')[0]).replace(AUDIO_EXT, '') }];
  } else if(/open\.spotify\.com\/track/.test(text)){
    const t = await spotifyTitle(text);
    if(!t){ App.toast('Não consegui ler esse link do Spotify. Cole um link do YouTube ou o nome da música.', true); return null; }
    if(!ytKey()){ App.toast(`Achei “${t}”, mas para buscar no YouTube o admin precisa ativar a busca (Conexões). Cole um link do YouTube.`, true); return null; }
    const r = await ytSearch(t + ' audio'); if(!r || !r.length){ App.toast('Não achei essa música no YouTube.', true); return null; }
    tracks = [{ src: 'yt', vid: r[0].vid, title: r[0].title, thumb: r[0].thumb }];
  } else if(/^https?:\/\//.test(text)){
    App.toast('Esse link não dá para tocar. Use YouTube, um link de .mp3 ou envie o arquivo.', true); return null;
  } else {
    if(!ytKey()){ App.toast('Para buscar pelo nome, o admin precisa ativar a busca do YouTube (Configurações → Conexões). Por enquanto, cole o link do YouTube.', true); return null; }
    const r = await ytSearch(text).catch(e => { App.toast('Busca do YouTube: ' + e.message, true); return null; });
    if(!r || !r.length){ App.toast('Não achei nada com esse nome.', true); return null; }
    tracks = [{ src: 'yt', vid: r[0].vid, title: r[0].title, thumb: r[0].thumb }];
  }
  for(const t of tracks) await muCall('add', t);
  const title = tracks.length > 1 ? `${tracks.length} músicas da playlist` : tracks[0] && tracks[0].title;
  if(title) App.toast('Na fila: ' + title);
  if(announce && title && M.cid){ App.sb.from('messages').insert({ channel_id: M.cid, author_id: S.me.id, content: `🎵 Coloquei na fila do Telão Bot: **${title}**` }).then(() => {}); }
  return title;
}
function muAddModal(){
  if(!MU.cid){ App.toast('Entre numa chamada de voz para usar o Telão Bot.', true); return; }
  const hasKey = !!ytKey();
  modal(`<form id="muF"><div class="mh"><h2>${BOT_AV} Tocar no Telão Bot</h2><p>Todo mundo na chamada ouve junto, no mesmo ponto.</p></div>
    <div class="mc"><div class="musearch">${ic(hasKey ? 'search' : 'link', 18)}<input id="muI" placeholder="${hasKey ? 'Nome da música ou link do YouTube' : 'Cole o link do YouTube ou de um .mp3'}" autocomplete="off"></div>
      <div id="muRes" class="mures"></div>
      <div class="muup"><button type="button" class="btn sec sm" id="muFileB">${ic('upload', 15)} Enviar arquivo de música</button><input type="file" id="muFile" accept="audio/*" multiple hidden><small class="mut">MP3, M4A, OGG, WAV… até 25 MB</small></div>
      ${hasKey ? '' : '<p class="mut small" style="margin-top:10px">Busca pelo nome fica disponível quando o admin ativar a busca do YouTube em Configurações → Conexões.</p>'}</div>
    <div class="mf"><button type="button" class="btn sec" data-close>Fechar</button><button class="btn">Tocar</button></div></form>`, m => {
    const inp = m.querySelector('#muI'); inp.focus();
    let tm;
    if(hasKey) inp.oninput = () => {
      clearTimeout(tm); const v = inp.value.trim();
      if(!v || /^https?:/.test(v)){ m.querySelector('#muRes').innerHTML = ''; return; }
      tm = setTimeout(async () => {
        const r = await ytSearch(v).catch(() => null); const box = m.querySelector('#muRes'); if(!box) return;
        box.innerHTML = (r || []).map(x => `<button type="button" class="mur" data-vid="${x.vid}" data-title="${esc(x.title)}"><img src="${esc(x.thumb || '')}" alt=""><div class="t"><b>${esc(x.title)}</b><small>${esc(x.ch || '')}</small></div>${ic('plus', 16)}</button>`).join('');
        box.querySelectorAll('[data-vid]').forEach(b => b.onclick = async () => { b.disabled = true; await muCall('add', { src: 'yt', vid: b.dataset.vid, title: b.dataset.title }); App.toast('Na fila: ' + b.dataset.title); b.classList.add('added'); });
      }, 350);
    };
    m.querySelector('#muF').onsubmit = async e => { e.preventDefault(); const v = inp.value; if(!v.trim()) return; const t = await muQueueFrom(v); if(t){ inp.value = ''; m.querySelector('#muRes').innerHTML = ''; } };
    m.querySelector('#muFileB').onclick = () => m.querySelector('#muFile').click();
    m.querySelector('#muFile').onchange = async e => {
      for(const f of e.target.files){
        if(f.size > 25 * 1048576){ App.toast(f.name + ': maior que 25 MB.', true); continue; }
        App.toast('Enviando ' + f.name + '…');
        const path = `${S.me.id}/musica-${Date.now().toString(36)}-${f.name.replace(/[^\w.-]+/g, '_').slice(-60)}`;
        const { error } = await App.sb.storage.from('attachments').upload(path, f, { contentType: f.type || 'audio/mpeg' });
        if(error){ App.toast(error.message, true); continue; }
        const url = App.sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
        await muCall('add', { src: 'url', url, title: f.name.replace(/\.[^.]+$/, '') });
      }
      App.toast('Música enviada para a fila.');
    };
  });
}
App.muAddModal = muAddModal;

/* ---------- comandos no chat ---------- */
['tocar', 'pular', 'pausar', 'continuar', 'parar', 'fila', 'repetir', 'embaralhar'].forEach((c, i) => CMDS.push([c, ['nome ou link', '', '', '', '', '', 'fila | música | desligar', ''][i],
  ['Telão Bot toca música na call', 'Pula a música', 'Pausa a música', 'Continua a música', 'Para e limpa a fila', 'Mostra a fila', 'Repete a fila ou a música', 'Embaralha a fila'][i], '🎵']));
const _runCommand = runCommand;
runCommand = function(text){
  const m = String(text).match(/^\/(\w+)\s*([\s\S]*)$/);
  const cmd = m && m[1].toLowerCase(), a = m ? m[2].trim() : '';
  const map = { tocar: 1, play: 1, p: 1, pular: 1, skip: 1, pausar: 1, pause: 1, continuar: 1, resume: 1, parar: 1, stop: 1, fila: 1, queue: 1, repetir: 1, loop: 1, embaralhar: 1, shuffle: 1 };
  if(!cmd || !map[cmd]) return _runCommand.apply(this, arguments);
  const ta = $('#cmp'); if(ta){ ta.value = ''; ta.style.height = 'auto'; }
  if(!MU.cid) return { error: 'Entre numa chamada de voz para usar o Telão Bot.' };
  if(['tocar','play','p'].includes(cmd)){ if(a) muQueueFrom(a, true); else muAddModal(); }
  else if(['pular','skip'].includes(cmd)) muCall('skip');
  else if(['pausar','pause'].includes(cmd)) muCall('pause');
  else if(['continuar','resume'].includes(cmd)) muCall('resume');
  else if(['parar','stop'].includes(cmd)) muCall('stop');
  else if(['fila','queue'].includes(cmd)){ MU.open = true; muDock(); }
  else if(['repetir','loop'].includes(cmd)) muCall('loop', { mode: /música|musica|one|esta/.test(a) ? 'one' : /deslig|off|não|nao/.test(a) ? 'off' : 'all' });
  else if(['embaralhar','shuffle'].includes(cmd)) muCall('shuffle');
  return { error: '' };
};

/* ---------- o bot aparece na lista da chamada ---------- */
const _renderSidebarMu = renderSidebar;
renderSidebar = function(){
  _renderSidebarMu.apply(this, arguments);
  S.music.forEach((st, cid) => {
    if(!st || !st.current) return;
    const row = document.querySelector(`#sbBody .ch[data-cid="${cid}"]`); if(!row || document.querySelector(`.vu.bot[data-botch="${cid}"]`)) return;
    let after = row; while(after.nextElementSibling && after.nextElementSibling.classList.contains('vu')) after = after.nextElementSibling;
    after.insertAdjacentHTML('afterend', `<div class="vu bot" data-botch="${cid}">${BOT_AV}<span class="nm">Telão Bot</span><small class="bnow">${st.current.paused_at ? 'pausado' : esc(st.current.title || '')}</small></div>`);
  });
  document.querySelectorAll('.vu.bot').forEach(el => el.onclick = () => { if(MU.cid === el.dataset.botch){ const d = $('#musicDock'); if(d) d.classList.remove('mini'); } });
};

/* ---------- tempo real + chave da busca do YouTube (admin) ---------- */
const _loadServersMu = loadServers;
loadServers = async function(){
  await _loadServersMu.apply(this, arguments);
  if(!S._muRt){ S._muRt = true;
    App.sb.channel('music-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'voice_music' }, p => {
      const r = p.new && p.new.channel_id ? p.new : null; if(!r) return;
      S.music.set(r.channel_id, r); if(r.channel_id === MU.cid) muApply(); renderSidebar();
    }).subscribe();
    const ids = S.servers.flatMap(s => (S.channels.get(s.id) || []).filter(c => c.kind === 'voice').map(c => c.id));
    if(ids.length) App.sb.from('voice_music').select('*').in('channel_id', ids).then(({ data }) => { (data || []).forEach(r => S.music.set(r.channel_id, r)); renderSidebar(); });
  }
};
const _secConnMu = secConnections;
secConnections = function(box, back){
  _secConnMu(box, back);
  if(!S.me.is_admin) return;
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>Busca do YouTube para o Telão Bot (só o admin vê)</h3>
    <ol class="steps"><li>No <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud</a> (o mesmo do login com Google), ative a <b>YouTube Data API v3</b>.</li>
      <li>Em <b>Credenciais → Criar credenciais → Chave de API</b>. Em "Restrições de aplicativo" escolha <b>Sites</b> e coloque <code>${esc(location.origin)}/*</code>; em "Restrições de API" deixe só a YouTube Data API v3.</li>
      <li>Cole a chave aqui:</li></ol>
    <div style="display:flex;gap:8px"><input class="inp" id="ytKey" placeholder="Chave da API do YouTube" value="${esc(ytKey())}"><button class="btn" id="ytKeyOk">Salvar</button></div>
    <p class="mut small" style="margin-top:6px">Sem a chave o bot continua tocando links do YouTube, de .mp3 e arquivos enviados; só a busca pelo nome que não funciona.</p>`);
  box.querySelector('#ytKeyOk').onclick = async () => {
    const v = box.querySelector('#ytKey').value.trim();
    const { error } = await App.sb.from('app_config').upsert({ key: 'youtube_api_key', value: v || null, updated_at: new Date().toISOString() });
    if(error){ App.toast(error.message, true); return; }
    S.cfg.youtube_api_key = v; App.toast('Busca do YouTube ativada para o Telão Bot.');
  };
};
// botão do bot nas atividades da chamada
App.musicBot = muAddModal;
