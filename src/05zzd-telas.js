/* =====================================================================
   v6.39: VÁRIAS TELAS LADO A LADO
   Quando 2 ou mais pessoas transmitem, o botão "Ver várias telas" mostra até 4 telas
   numa grade, cada uma com o próprio volume (e botão de mudo). Clicar em "Focar"
   volta para uma tela só, grande.
   ===================================================================== */
S.multiView = ls.get('telao-multiview', false);
const _renderStageMV = renderStage;
renderStage = function(){
  _renderStageMV.apply(this, arguments);
  const wrap = $('#stageWrap'), area = wrap && wrap.querySelector('#stArea');
  if(!area || !Voice.channel) return;
  const screens = Voice.screens();
  const fb = area.querySelector('#focusBox');
  const normal = fb && !fb.classList.contains('wtfocus') && !document.body.classList.contains('cinema');
  if(!normal || area.classList.contains('withgame') || screens.length < 2){ return; }
  if(!S.multiView){
    const tools = fb.querySelector('.tools');
    if(tools && !tools.querySelector('#stGrid')){
      tools.insertAdjacentHTML('afterbegin', `<button id="stGrid" data-tip="Ver várias telas (${Math.min(4, screens.length)})">${ic('grid', 18)}</button>`);
      tools.querySelector('#stGrid').onclick = e => { e.stopPropagation(); S.multiView = true; ls.set('telao-multiview', true); renderStage(); };
    }
    return;
  }
  // grade: os outros primeiro, a sua por último
  const list = screens.filter(s => !s.mine).concat(screens.filter(s => s.mine)).slice(0, 4);
  const strip = area.querySelector('.tiles.strip');
  const vol = s => Math.round((Voice.screenVolumes.get(s.user_id) ?? 1) * 100);
  const cell = s => {
    const aud = !s.mine && s.stream.getAudioTracks().length;
    return `<div class="mvcell" data-mvs="${s.session}"><div class="vslot" data-stream="${s.stream.id}"></div>
      <span class="lbl">${ic('monitor', 13)} ${esc(s.mine ? 'Sua tela' : prof(s.user_id).display_name)}</span>
      <div class="mvbar">${aud ? `<button class="mvmute" data-mvm="${s.user_id}" title="Mudo">${ic(vol(s) === 0 ? 'micOff' : 'volume', 16)}</button><input type="range" min="0" max="100" value="${vol(s)}" data-mvv="${s.user_id}" title="Volume desta tela">` : s.mine ? '' : `<span class="noaud">${ic('micOff', 12)} sem áudio</span>`}
        <span class="grow"></span><button data-mvf="${s.session}" title="Focar nesta tela">${ic('maximize', 16)}</button></div></div>`;
  };
  area.innerHTML = `<div class="mvwrap"><div class="mvtop"><span>${ic('grid', 15)} ${list.length} telas</span><span class="grow"></span><button class="btn sec sm" id="mvOne">${ic('monitor', 14)} Uma tela só</button></div>
    <div class="mvgrid n${list.length}">${list.map(cell).join('')}</div></div>`;
  if(strip){ strip.querySelectorAll('.tile.scr').forEach(x => x.remove()); area.appendChild(strip); }
  area.querySelectorAll('.mvcell .vslot').forEach(slot => {
    const st = list.find(x => x.stream.id === slot.dataset.stream); if(!st) return;
    const v = getVideoEl(st.stream, false); v.className = 'fit'; slot.appendChild(v); v.play().catch(() => {});
  });
  area.querySelectorAll('[data-mvv]').forEach(r => r.oninput = () => {
    Voice.setScreenVolume(r.dataset.mvv, r.value / 100);
    const b = area.querySelector(`[data-mvm="${r.dataset.mvv}"]`); if(b) b.innerHTML = ic(+r.value === 0 ? 'micOff' : 'volume', 16);
  });
  area.querySelectorAll('[data-mvm]').forEach(b => b.onclick = () => {
    const u = b.dataset.mvm, cur = Voice.screenVolumes.get(u) ?? 1, nv = cur > 0 ? 0 : 1;
    if(cur > 0) (S.mvLast = S.mvLast || {})[u] = cur;
    const val = nv ? ((S.mvLast && S.mvLast[u]) || 1) : 0;
    Voice.setScreenVolume(u, val); const r = area.querySelector(`[data-mvv="${u}"]`); if(r) r.value = Math.round(val * 100);
    b.innerHTML = ic(val === 0 ? 'micOff' : 'volume', 16);
  });
  const one = sess => { S.multiView = false; ls.set('telao-multiview', false); if(sess) S.focus = 's:' + sess; renderStage(); };
  area.querySelectorAll('[data-mvf]').forEach(b => b.onclick = e => { e.stopPropagation(); one(b.dataset.mvf); });
  area.querySelectorAll('.mvcell').forEach(c => c.ondblclick = () => { const v = c.querySelector('video'); v && (v.requestFullscreen || v.webkitRequestFullscreen || (() => {})).call(v); });
  area.querySelector('#mvOne').onclick = () => one(null);
  area.querySelectorAll('.tiles.strip [data-focus]').forEach(t => t.onclick = () => { S.focus = t.dataset.focus; one(null); });
};
