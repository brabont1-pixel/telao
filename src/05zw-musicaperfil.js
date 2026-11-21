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
  if(PS.uid === uid && PS.audio && !PS.audio.paused){ psStop(); return; }
  psStop();
  PS.audio = PS.audio || new Audio(); PS.audio.src = song.preview; PS.uid = uid; PS.audio.loop = true;
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
  const row = `<h6>Música do perfil</h6><div class="psong" data-psu="${p.id}" data-auto="${p.id !== S.me.id ? 1 : 0}">${s.art ? `<img src="${esc(s.art)}" alt="">` : '<span class="psart">🎵</span>'}<div><b>${esc(s.title || '')}</b><small>${esc(s.artist || '')}</small></div><button class="ibtn sm psbtn" data-psplay="${p.id}" data-tip="Tocar / pausar"><span class="pson">${ic('pause', 16)}</span><span class="psoff">${ic('play', 16)}</span></button><span class="pseq"><i></i><i></i><i></i></span></div>`;
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
    <div id="psCur">${cur && cur.preview ? `<div class="psong mine" data-psu="${S.me.id}">${cur.art ? `<img src="${esc(cur.art)}" alt="">` : '<span class="psart">🎵</span>'}<div><b>${esc(cur.title)}</b><small>${esc(cur.artist || '')}</small></div><button class="ibtn sm psbtn" data-psplay="${S.me.id}"><span class="pson">${ic('pause', 16)}</span><span class="psoff">${ic('play', 16)}</span></button><button class="btn sec sm" id="psRm">Tirar</button></div>` : ''}</div>
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
  const search = async () => {
    const q = $b('#psQ').value.trim(); if(!q) return;
    const res = $b('#psRes'); res.innerHTML = '<div class="spin" style="margin:10px 0"></div>';
    try{
      const j = await (await fetch('/api/musica?q=' + encodeURIComponent(q))).json();
      const list = (j && j.tracks) || [];
      res.innerHTML = list.length ? list.slice(0, 10).map((t, i) => `<div class="psong"><img src="${esc(t.art || '')}" alt=""><div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div><button class="ibtn sm" data-psprev="${i}" data-tip="Ouvir">${ic('play', 16)}</button><button class="btn sm" data-pspick="${i}">Escolher</button></div>`).join('') : '<p class="mut small">Não achei nada. Tente outro nome.</p>';
      res.querySelectorAll('[data-psprev]').forEach(b => b.onclick = () => psPlay(list[+b.dataset.psprev], 'prev' + b.dataset.psprev, false));
      res.querySelectorAll('[data-pspick]').forEach(b => b.onclick = () => { const t = list[+b.dataset.pspick]; save({ title: t.title, artist: t.artist, preview: t.preview, art: t.art }); });
    }catch(e){ res.innerHTML = '<p class="err">Não deu para buscar agora.</p>'; }
  };
  $b('#psGo').onclick = search;
  $b('#psQ').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); search(); } };
  SET.cleanups.push(psStop);
};
