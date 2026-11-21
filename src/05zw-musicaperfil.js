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
  if(cur && cur.preview && $b('#psTrim')){
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
  $b('#psQ').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); search(); } };
  SET.cleanups.push(psStop);
};
