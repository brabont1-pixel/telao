/* =====================================================================
   v6.31: MÚSICA DO PERFIL
   Escolha uma música (trecho de 30 s da busca do iTunes). Quando alguém abre o seu perfil, ela
   toca baixinho, com botão para pausar. Cada um pode desligar a música dos outros em
   Configurações → Perfil.
   ===================================================================== */
const PS_SQL = 'Para a música do perfil, rode o supabase.sql novo (v6.31) no Supabase.';
const PS = { audio: null, uid: null, fade: null };
function psStop(){ if(PS.audio){ try{ PS.audio.pause(); }catch(e){} } PS.uid = null; clearInterval(PS.fade); document.querySelectorAll('.psong').forEach(x => x.classList.remove('playing')); }
function psPlay(song, uid, auto){
  if(!song || !song.preview) return;
  if(PS.uid === uid && PS.audio && !PS.audio.paused && PS.song && PS.song.start === song.start && PS.song.len === song.len){ psStop(); return; }
  psStop();
  if(!PS.audio){
    PS.audio = new Audio();
    // v6.32: toca só o trecho escolhido, em loop
    PS.audio.addEventListener('timeupdate', () => { const z = PS.song; if(!z) return; const a = +z.start || 0, b = a + (+z.len || 30); if(PS.audio.currentTime >= b - 0.05 || PS.audio.currentTime < a - 0.5) PS.audio.currentTime = a; });
    PS.audio.addEventListener('ended', () => { if(PS.song){ PS.audio.currentTime = +PS.song.start || 0; PS.audio.play().catch(() => {}); } });
  }
  PS.song = song; PS.audio.src = song.preview; PS.uid = uid; PS.audio.loop = false;
  PS.audio.addEventListener('loadedmetadata', () => { try{ PS.audio.currentTime = +song.start || 0; }catch(e){} }, { once: true });
  const target = Math.max(0.05, Math.min(1, P.psVol ?? 0.25));
  PS.audio.volume = auto ? 0 : target;
  if(P.outputId && PS.audio.setSinkId) PS.audio.setSinkId(P.outputId).catch(() => {});
  PS.audio.play().then(() => {
    document.querySelectorAll(`.psong[data-psu="${uid}"]`).forEach(x => x.classList.add('playing'));
    if(auto){ let v = 0; PS.fade = setInterval(() => { v = Math.min(target, v + target / 12); PS.audio.volume = v; if(v >= target) clearInterval(PS.fade); }, 100); }
  }).catch(() => {});
}
// cartão do perfil
const _profileCardPS2 = profileCard;
profileCard = function(p, extra = ''){
  const h = _profileCardPS2(p, extra);
  const s = p && p.theme_song;
  if(!s || !s.preview) return h;
  const row = `<h6>Música do perfil</h6><div class="psong" data-psu="${p.id}" data-auto="${p.id !== S.me.id ? 1 : 0}">${s.art ? `<img src="${esc(s.art)}" alt="">` : '<span class="psart">🎵</span>'}<div><b>${esc(s.title || '')}</b><small>${esc(s.artist || '')}${s.len ? ` · trecho de ${s.len}s` : ''}</small></div><button class="ibtn sm psbtn" data-psplay="${p.id}" data-tip="Tocar / pausar"><span class="pson">${ic('pause', 16)}</span><span class="psoff">${ic('play', 16)}</span></button><span class="pseq"><i></i><i></i><i></i></span></div>`;
  return h.replace(/<\/div><\/div>$/, row + '</div></div>');
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-psplay]'); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const p = prof(b.dataset.psplay); psPlay(p.theme_song, p.id, false);
}, true);
// toca sozinho quando o cartão de alguém aparece; para quando fecha
const psMenu = document.getElementById('menu');
if(psMenu) new MutationObserver(() => {
  const vis = !psMenu.classList.contains('hidden');
  const card = vis && psMenu.querySelector('.psong[data-auto="1"]');
  if(!card){ if(PS.uid && !document.querySelector(`.psong[data-psu="${PS.uid}"]`)) psStop(); return; }
  const uid = card.dataset.psu;
  if(PS.uid === uid) return;
  if(P.psAuto === false || Voice.deafened) return;
  psPlay(prof(uid).theme_song, uid, true);
}).observe(psMenu, { attributes: true, attributeFilter: ['class'], childList: true });
// Configurações → Perfil
const _secProfilePS = secProfile;
secProfile = function(box, back){
  _secProfilePS.apply(this, arguments);
  const cur = S.me.theme_song;
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>🎵 Música do perfil</h3><p class="mut small">Toca baixinho quando alguém abre o seu perfil (um trecho de 30 s).</p>
    <div id="psCur">${cur && cur.preview ? `<div class="psong mine" data-psu="${S.me.id}">${cur.art ? `<img src="${esc(cur.art)}" alt="">` : '<span class="psart">🎵</span>'}<div><b>${esc(cur.title)}</b><small>${esc(cur.artist || '')}</small></div><button class="ibtn sm psbtn" data-psplay="${S.me.id}"><span class="pson">${ic('pause', 16)}</span><span class="psoff">${ic('play', 16)}</span></button><button class="btn sec sm" id="psRm">Tirar</button></div>
      <div class="pstrim" id="psTrim"><b>✂️ Escolha o trecho que toca</b>
        <div class="pswave" id="psWave"><div class="pswin" id="psWin"></div><div class="psplayhead" id="psHead"></div></div>
        <div class="pstimes"><span>Começa em <b id="psSt">0s</b></span><span>Duração:</span>${[5, 10, 15, 20, 30].map(n => `<button type="button" class="chip ${(cur.len || 15) === n ? 'on' : ''}" data-pslen="${n}">${n}s</button>`).join('')}</div>
        <input type="range" class="range" id="psStart" min="0" max="25" step="0.5" value="${+cur.start || 0}">
        <div class="gacts"><button class="btn sec sm" id="psTry">${ic('play', 14)} Ouvir o trecho</button><button class="btn sm" id="psTrimSave">Salvar trecho</button></div></div>` : ''}</div>
    <div class="psearch"><input class="inp" id="psQ" maxlength="80" placeholder="Buscar música ou artista"><button class="btn sec" id="psGo">${ic('search', 16)} Buscar</button></div>
    <div class="psfile"><label class="btn sec"><input type="file" id="psFile" accept="audio/*" hidden>${ic('upload', 16)} Usar uma música do meu computador</label><small class="mut">A busca só traz 30 s de cada música. Com um arquivo seu (MP3, M4A, WAV…) você escolhe o trecho em qualquer parte da música inteira.</small></div>
    <div class="psres" id="psRes"></div>
    ${row('Tocar a música do perfil dos outros', 'Quando você abre o perfil de alguém que escolheu uma música.', toggle('psAuto', P.psAuto !== false))}
    <div class="srow"><div class="t"><b>Volume da música dos perfis</b></div><input type="range" class="range" id="psVol" min="5" max="100" value="${Math.round((P.psVol ?? 0.25) * 100)}" style="max-width:200px"></div>`);
  const $b = q => box.querySelector(q);
  $b('#psAuto').onchange = e => { P.psAuto = e.target.checked; savePrefs(); };
  $b('#psVol').onchange = e => { P.psVol = +e.target.value / 100; savePrefs(); if(PS.audio) PS.audio.volume = P.psVol; };
  const save = async song => {
    const { data, error } = await App.sb.from('profiles').update({ theme_song: song }).eq('id', S.me.id).select().single();
    if(error){ App.toast(/theme_song|schema cache/i.test(error.message) ? PS_SQL : error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data); psStop(); renderSettings(); App.toast(song ? '🎵 Música do perfil escolhida!' : 'Música do perfil tirada.');
  };
  const rm = $b('#psRm'); if(rm) rm.onclick = () => save(null);
  if(cur && cur.own && $b('#psTrim')) $b('#psTrim').innerHTML = `<small class="mut">✂️ Trecho escolhido da música inteira (${cur.len || ''} s). Para trocar o pedaço, use "Usar uma música do meu computador" de novo.</small>`;
  else if(cur && cur.preview && $b('#psTrim')){
    let st = +cur.start || 0, len = +cur.len || 15, dur = 30;
    const draw = () => {
      const maxSt = Math.max(0, dur - len); if(st > maxSt) st = maxSt;
      $b('#psStart').max = maxSt; $b('#psStart').value = st;
      $b('#psSt').textContent = st.toFixed(st % 1 ? 1 : 0) + 's';
      const w = $b('#psWin'); w.style.left = (st / dur * 100) + '%'; w.style.width = (len / dur * 100) + '%';
      $b('#psWave').style.setProperty('--n', Math.round(dur));
    };
    // barrinhas de "onda" decorativas
    $b('#psWave').insertAdjacentHTML('afterbegin', Array.from({ length: 60 }, (_, i) => `<i style="height:${20 + Math.abs(Math.sin(i * 1.7) * 60 + Math.sin(i * .4) * 20)}%"></i>`).join(''));
    const probe = new Audio(); probe.preload = 'metadata'; probe.src = cur.preview; probe.onloadedmetadata = () => { if(isFinite(probe.duration) && probe.duration > 5){ dur = Math.min(30, probe.duration); draw(); } };
    $b('#psStart').oninput = e => { st = +e.target.value; draw(); };
    box.querySelectorAll('[data-pslen]').forEach(b => b.onclick = () => { len = +b.dataset.pslen; box.querySelectorAll('[data-pslen]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $b('#psTry').onclick = () => { psStop(); psPlay({ ...cur, start: st, len }, 'trim', false); };
    $b('#psTrimSave').onclick = () => save({ ...cur, start: st, len });
    // cabeça de leitura
    const head = $b('#psHead'); const tick = setInterval(() => { if(!head.isConnected){ clearInterval(tick); return; } if(PS.audio && !PS.audio.paused && (PS.uid === 'trim' || PS.uid === S.me.id)){ head.style.display = 'block'; head.style.left = (PS.audio.currentTime / dur * 100) + '%'; } else head.style.display = 'none'; }, 100);
    draw();
  }
  const search = async () => {
    const q = $b('#psQ').value.trim(); if(!q) return;
    const res = $b('#psRes'); res.innerHTML = '<div class="spin" style="margin:10px 0"></div>';
    try{
      const j = await (await fetch('/api/musica?q=' + encodeURIComponent(q))).json();
      const list = (j && j.tracks) || [];
      res.innerHTML = list.length ? list.slice(0, 10).map((t, i) => `<div class="psong"><img src="${esc(t.art || '')}" alt=""><div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div><button class="ibtn sm" data-psprev="${i}" data-tip="Ouvir">${ic('play', 16)}</button><button class="btn sm" data-pspick="${i}">Escolher</button></div>`).join('') : '<p class="mut small">Não achei nada. Tente outro nome.</p>';
      res.querySelectorAll('[data-psprev]').forEach(b => b.onclick = () => psPlay(list[+b.dataset.psprev], 'prev' + b.dataset.psprev, false));
      res.querySelectorAll('[data-pspick]').forEach(b => b.onclick = () => { const t = list[+b.dataset.pspick]; save({ title: t.title, artist: t.artist, preview: t.preview, art: t.art, start: 0, len: 15 }).then(() => setTimeout(() => { const tr = document.getElementById('psTrim'); if(tr) tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200)); });
    }catch(e){ res.innerHTML = '<p class="err">Não deu para buscar agora.</p>'; }
  };
  $b('#psGo').onclick = search;
  $b('#psFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) psFileTrim(f, save); };
  $b('#psQ').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); search(); } };
  SET.cleanups.push(psStop);
};

/* v6.33: escolher o trecho na música INTEIRA (arquivo do computador).
   A música inteira não sai do seu computador: só o pedaço escolhido (até 30 s) é enviado. */
function psWav(buf, a, b, rate = 32000){
  const len = Math.max(1, Math.floor((b - a) * rate)), out = new Int16Array(len), chs = buf.numberOfChannels, src = [...Array(chs)].map((_, i) => buf.getChannelData(i)), ratio = buf.sampleRate / rate, off = Math.floor(a * buf.sampleRate);
  const fade = Math.floor(rate * 0.25);
  for(let i = 0; i < len; i++){
    const j = off + Math.floor(i * ratio); let v = 0; for(let c = 0; c < chs; c++) v += src[c][j] || 0; v /= chs;
    const g = Math.min(1, i / fade, (len - i) / fade); out[i] = Math.max(-32768, Math.min(32767, v * g * 32767));
  }
  const h = new DataView(new ArrayBuffer(44)), w = (o, str) => [...str].forEach((ch, k) => h.setUint8(o + k, ch.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, len * 2, true);
  return new Blob([h.buffer, out.buffer], { type: 'audio/wav' });
}
async function psFileTrim(file, save){
  if(!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|opus|flac|aac|webm)$/i.test(file.name)){ App.toast('Escolha um arquivo de áudio.', true); return; }
  if(file.size > 40 * 1048576){ App.toast('Arquivo muito grande (máximo 40 MB).', true); return; }
  modal(`<div class="mh"><h2>✂️ Escolha o trecho</h2><p>Arraste para escolher qualquer parte da música. Só o pedaço escolhido vai para o seu perfil.</p></div>
    <div class="mc" id="pfBody"><div class="spin" style="margin:20px auto"></div><p class="mut small" style="text-align:center">Lendo a música…</p></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="pfSave" disabled>Usar este trecho</button></div>`, async m => {
    let buf;
    try{ const ac = new (window.AudioContext || window.webkitAudioContext)(); buf = await ac.decodeAudioData(await file.arrayBuffer()); ac.close(); }
    catch(e){ m.querySelector('#pfBody').innerHTML = '<p class="err">Não consegui ler esse arquivo. Tente um MP3 ou M4A.</p>'; return; }
    const dur = buf.duration, url = URL.createObjectURL(file);
    let st = Math.min(Math.max(0, dur * 0.3), Math.max(0, dur - 15)), len = Math.min(15, dur);
    // forma de onda de verdade
    const N = 160, d0 = buf.getChannelData(0), step = Math.floor(d0.length / N), peaks = [];
    for(let i = 0; i < N; i++){ let mx = 0; for(let k = i * step; k < (i + 1) * step; k += 64) mx = Math.max(mx, Math.abs(d0[k] || 0)); peaks.push(mx); }
    const top = Math.max(...peaks) || 1;
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const body = m.querySelector('#pfBody');
    body.innerHTML = `<label class="field"><span>Nome da música</span><input class="inp" id="pfT" maxlength="80" value="${esc(file.name.replace(/\.[^.]+$/, '').slice(0, 80))}"></label>
      <label class="field"><span>Artista (opcional)</span><input class="inp" id="pfA" maxlength="80"></label>
      <div class="pswave big" id="pfWave">${peaks.map(p => `<i style="height:${8 + p / top * 88}%"></i>`).join('')}<div class="pswin" id="pfWin"></div><div class="psplayhead" id="pfHead"></div></div>
      <div class="pstimes"><span>De <b id="pfFrom"></b> até <b id="pfTo"></b> <small class="mut">(música tem ${fmt(dur)})</small></span><span>Duração:</span>${[5, 10, 15, 20, 30].filter(n => n <= Math.ceil(dur)).map(n => `<button type="button" class="chip ${n === 15 ? 'on' : ''}" data-pflen="${n}">${n}s</button>`).join('')}</div>
      <input type="range" class="range" id="pfStart" min="0" step="0.25">
      <div class="gacts"><button class="btn sec sm" id="pfTry">${ic('play', 14)} Ouvir o trecho</button><small class="mut">Dica: clique ou arraste na onda para escolher a parte.</small></div>`;
    const au = new Audio(url);
    const draw = () => {
      const mx = Math.max(0, dur - len); st = Math.min(st, mx);
      const r = m.querySelector('#pfStart'); r.max = mx; r.value = st;
      m.querySelector('#pfFrom').textContent = fmt(st); m.querySelector('#pfTo').textContent = fmt(st + len);
      const w = m.querySelector('#pfWin'); w.style.left = (st / dur * 100) + '%'; w.style.width = (len / dur * 100) + '%';
    };
    m.querySelector('#pfStart').oninput = e => { st = +e.target.value; draw(); if(!au.paused) au.currentTime = st; };
    const wv = m.querySelector('#pfWave');
    const seek = e => { const r = wv.getBoundingClientRect(); st = Math.max(0, (e.clientX - r.left) / r.width * dur - len / 2); draw(); if(!au.paused) au.currentTime = st; };
    wv.onpointerdown = e => { wv.setPointerCapture(e.pointerId); seek(e); };
    wv.onpointermove = e => { if(e.buttons) seek(e); };
    m.querySelectorAll('[data-pflen]').forEach(b => b.onclick = () => { len = Math.min(+b.dataset.pflen, dur); m.querySelectorAll('[data-pflen]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    const head = m.querySelector('#pfHead');
    au.ontimeupdate = () => { if(au.currentTime >= st + len) au.currentTime = st; head.style.display = 'block'; head.style.left = (au.currentTime / dur * 100) + '%'; };
    m.querySelector('#pfTry').onclick = () => { psStop(); if(au.paused){ au.currentTime = st; au.volume = P.psVol ?? 0.5; au.play().catch(() => {}); } else { au.pause(); head.style.display = 'none'; } };
    SET.cleanups && SET.cleanups.push(() => au.pause());
    const sv = m.querySelector('#pfSave'); sv.disabled = false;
    sv.onclick = async () => {
      sv.disabled = true; sv.textContent = 'Enviando o trecho…'; au.pause();
      try{
        const wav = psWav(buf, st, st + len);
        const meta = await uploadOne({ file: new File([wav], 'musica-perfil.wav', { type: 'audio/wav' }) });
        const title = m.querySelector('#pfT').value.trim() || 'Minha música', artist = m.querySelector('#pfA').value.trim();
        closeModal(); URL.revokeObjectURL(url);
        await save({ title: title.slice(0, 80), artist: artist.slice(0, 80), preview: meta.url, art: null, start: 0, len: Math.round(len), own: true });
      }catch(x){ sv.disabled = false; sv.textContent = 'Usar este trecho'; App.toast('Não deu para enviar: ' + (x.message || x), true); }
    };
    draw();
  });
}
