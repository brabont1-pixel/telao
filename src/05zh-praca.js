/* =====================================================================
   v6.21: PRAÇA DO SERVIDOR — canal de voz em forma de mapa 2D
   Cada pessoa é um bonequinho; você anda com WASD/setas ou clicando no chão.
   Só ouve quem está perto (o volume cai com a distância). Nas mesas, só quem está na mesma mesa se ouve.
   No coreto, todo mundo da praça ouve você (bom para avisos e karaokê).
   ===================================================================== */
const PZW = 1400, PZH = 900, NEAR = 140, FAR = 420, SPEED = 260;
const PZ_ZONES = [
  { id: 'coreto', name: 'Coreto', x: 600, y: 60, w: 200, h: 150, kind: 'stage' },
  { id: 'mesa1', name: 'Mesa da esquerda', x: 110, y: 330, w: 220, h: 200, kind: 'private' },
  { id: 'mesa2', name: 'Mesa da direita', x: 1070, y: 330, w: 220, h: 200, kind: 'private' },
  { id: 'banco', name: 'Cantinho do banco', x: 560, y: 690, w: 280, h: 150, kind: 'private' },
];
const PZ = { on: false, cid: null, pos: new Map(), me: null, keys: new Set(), target: null, raf: 0, last: 0, sent: 0, wrap: null, cv: null, ctx: null, imgs: new Map(), emo: new Map(), showStage: false, volT: 0 };
const isPlaza = ch => !!(ch && ch.plaza && ch.kind === 'voice' && ch.server_id);
const zoneAt = (x, y) => PZ_ZONES.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) || null;
function pzFactor(sess){
  if(!PZ.on || !PZ.me) return 1;
  const o = PZ.pos.get(sess); if(!o) return 0.35;            // ainda não sabemos onde está: baixinho
  const zs = zoneAt(o.x, o.y), zl = zoneAt(PZ.me.x, PZ.me.y);
  if(zs && zs.kind === 'stage') return 1;                   // coreto: todo mundo ouve
  if((zs && zs.kind === 'private') || (zl && zl.kind === 'private')) return zs && zl && zs.id === zl.id ? 1 : 0;
  const d = Math.hypot(o.x - PZ.me.x, o.y - PZ.me.y);
  return d <= NEAR ? 1 : d >= FAR ? 0 : 1 - (d - NEAR) / (FAR - NEAR);
}
const _applyVolumePz = Voice.applyVolume.bind(Voice);
Voice.applyVolume = function(p){
  _applyVolumePz(p);
  if(!PZ.on) return;
  const info = this.infos.get(p.remote), f = pzFactor(p.remote);
  p.streams.forEach((s, id) => {
    const a = p.audioEls.get(id); if(!a) return;
    const isScreen = s.getVideoTracks().length > 0 || (info && info.screen === id);
    if(!isScreen) a.volume = Math.max(0, Math.min(1, a.volume * f));
  });
};
function pzSend(force){
  if(!PZ.on || !PZ.me) return;
  const t = Date.now(); if(!force && t - PZ.sent < 110) return;
  PZ.sent = t; Voice.sendFx({ t: 'pz', x: Math.round(PZ.me.x), y: Math.round(PZ.me.y), d: PZ.me.d });
}
const _onFxPz = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && (pl.t === 'pz' || pl.t === 'pz-hello' || pl.t === 'pz-emo')){
    if(!PZ.on || mine) return;
    if(pl.t === 'pz'){ const o = PZ.pos.get(pl.from) || { x: pl.x, y: pl.y }; Object.assign(o, { tx: pl.x, ty: pl.y, d: pl.d, uid: pl.uid, seen: Date.now() }); PZ.pos.set(pl.from, o); pzVolumes(); }
    else if(pl.t === 'pz-hello') pzSend(true);
    else if(pl.t === 'pz-emo') PZ.emo.set(pl.from, { e: String(pl.e || '').slice(0, 4), at: Date.now() });
    return;
  }
  _onFxPz(pl, mine);
};
function pzVolumes(){ if(Date.now() - PZ.volT < 150) return; PZ.volT = Date.now(); Voice.peers.forEach(p => Voice.applyVolume(p)); }
function pzStart(ch){
  PZ.on = true; PZ.cid = ch.id; PZ.pos.clear(); PZ.showStage = false;
  PZ.me = { x: 700 + (Math.random() * 160 - 80), y: 470 + (Math.random() * 80 - 40), d: 1 };
  [600, 2000].forEach(t => setTimeout(() => { if(PZ.on){ Voice.sendFx({ t: 'pz-hello' }); pzSend(true); } }, t));
  PZ.hb = setInterval(() => pzSend(true), 3000);
  pzLoop();
}
function pzStop(){
  PZ.on = false; PZ.cid = null; cancelAnimationFrame(PZ.raf); clearInterval(PZ.hb); PZ.pos.clear();
  if(PZ.wrap) PZ.wrap.remove();
  Voice.peers.forEach(p => Voice.applyVolume(p));
}
const _joinVoicePz = joinVoice;
joinVoice = async function(ch){
  if(PZ.on) pzStop();
  const r = await _joinVoicePz.apply(this, arguments);
  const c = Voice.channel && (findChannel(Voice.channel.id) || Voice.channel);
  if(isPlaza(c)) pzStart(c);
  return r;
};
const _leaveVoicePz = leaveVoice;
leaveVoice = async function(){ if(PZ.on) pzStop(); return _leaveVoicePz.apply(this, arguments); };

/* ---------- movimento ---------- */
const PZ_SOLID = [{ x: 700, y: 380, r: 78 }];   // a fonte no meio
function pzMove(dt){
  if(!PZ.me) return false;
  let vx = 0, vy = 0;
  if(PZ.keys.has('a') || PZ.keys.has('arrowleft')) vx -= 1;
  if(PZ.keys.has('d') || PZ.keys.has('arrowright')) vx += 1;
  if(PZ.keys.has('w') || PZ.keys.has('arrowup')) vy -= 1;
  if(PZ.keys.has('s') || PZ.keys.has('arrowdown')) vy += 1;
  if(vx || vy) PZ.target = null;
  else if(PZ.target){ const dx = PZ.target.x - PZ.me.x, dy = PZ.target.y - PZ.me.y, dd = Math.hypot(dx, dy); if(dd < 6) PZ.target = null; else { vx = dx / dd; vy = dy / dd; } }
  if(!vx && !vy) return false;
  const l = Math.hypot(vx, vy); vx /= l; vy /= l;
  let nx = PZ.me.x + vx * SPEED * dt, ny = PZ.me.y + vy * SPEED * dt;
  nx = Math.max(30, Math.min(PZW - 30, nx)); ny = Math.max(30, Math.min(PZH - 30, ny));
  PZ_SOLID.forEach(s => { const dx = nx - s.x, dy = ny - s.y, d = Math.hypot(dx, dy) || 1; if(d < s.r){ nx = s.x + dx / d * s.r; ny = s.y + dy / d * s.r; } });
  if(vx) PZ.me.d = vx > 0 ? 1 : -1;
  PZ.me.x = nx; PZ.me.y = ny;
  return true;
}
document.addEventListener('keydown', e => {
  if(!PZ.on || !PZ.wrap || !PZ.wrap.isConnected || e.target.closest('input,textarea,[contenteditable]')) return;
  const k = e.key.toLowerCase();
  if(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)){ PZ.keys.add(k); e.preventDefault(); }
  if(['1', '2', '3', '4', '5'].includes(k)) pzEmote(['👋', '😂', '❤️', '🔥', '👏'][+k - 1]);
});
document.addEventListener('keyup', e => PZ.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => PZ.keys.clear());
function pzEmote(e){ if(!PZ.on) return; PZ.emo.set(Voice.SESSION, { e, at: Date.now() }); Voice.sendFx({ t: 'pz-emo', e }); }

/* ---------- desenho ---------- */
function pzImg(p){
  if(!p.avatar_url) return null;
  let im = PZ.imgs.get(p.avatar_url);
  if(!im){ im = new Image(); im.crossOrigin = 'anonymous'; im.src = p.avatar_url; PZ.imgs.set(p.avatar_url, im); }
  return im.complete && im.naturalWidth ? im : null;
}
function pzDrawMap(g){
  // grama
  g.fillStyle = '#2f8f4e'; g.fillRect(0, 0, PZW, PZH);
  g.fillStyle = '#3aa05a'; for(let i = 0; i < 140; i++){ const x = (i * 97) % PZW, y = (i * 211) % PZH; g.fillRect(x, y, 4, 4); }
  // caminhos
  g.fillStyle = '#d8c39a'; g.fillRect(0, 410, PZW, 80); g.fillRect(660, 0, 80, PZH);
  g.beginPath(); g.arc(700, 450, 150, 0, Math.PI * 2); g.fill();
  // fonte
  g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(700, 380, 72, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4fc3f7'; g.beginPath(); g.arc(700, 380, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b3e5fc'; g.beginPath(); g.arc(700, 380, 14 + Math.sin(Date.now() / 300) * 3, 0, Math.PI * 2); g.fill();
  // árvores
  [[80, 90], [250, 120], [1150, 100], [1300, 200], [90, 760], [300, 820], [1100, 800], [1310, 700], [470, 250], [930, 260], [470, 640], [930, 640]].forEach(([x, y]) => {
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x + 6, y + 30, 34, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6d4c2f'; g.fillRect(x - 6, y + 4, 12, 26);
    g.fillStyle = '#1f6b37'; g.beginPath(); g.arc(x, y - 6, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b8a48'; g.beginPath(); g.arc(x - 10, y - 14, 18, 0, Math.PI * 2); g.fill();
  });
  // zonas
  PZ_ZONES.forEach(z => {
    if(z.kind === 'stage'){
      g.fillStyle = '#7a4a2a'; g.fillRect(z.x, z.y + 20, z.w, z.h - 20);
      g.fillStyle = '#ff2e9a'; g.beginPath(); g.moveTo(z.x - 14, z.y + 26); g.lineTo(z.x + z.w / 2, z.y - 16); g.lineTo(z.x + z.w + 14, z.y + 26); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; for(let i = 0; i < 5; i++) g.fillRect(z.x + 14 + i * 43, z.y + 26, 6, z.h - 26);
    }else{
      g.fillStyle = 'rgba(255,255,255,.10)'; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.setLineDash([10, 8]);
      g.beginPath(); g.roundRect ? g.roundRect(z.x, z.y, z.w, z.h, 24) : g.rect(z.x, z.y, z.w, z.h); g.fill(); g.stroke(); g.setLineDash([]);
      if(z.id === 'banco'){ g.fillStyle = '#8d5a33'; g.fillRect(z.x + 30, z.y + 50, z.w - 60, 20); g.fillRect(z.x + 30, z.y + 90, z.w - 60, 20); }
      else { g.fillStyle = '#a0683d'; g.beginPath(); g.arc(z.x + z.w / 2, z.y + z.h / 2, 46, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText(z.name).width + 20; g.font = '700 15px system-ui, sans-serif';
    g.fillRect(z.x + z.w / 2 - tw / 2, z.y + z.h - (z.kind === 'stage' ? 26 : 30), tw, 22);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText((z.kind === 'stage' ? '📣 ' : '🔒 ') + z.name, z.x + z.w / 2, z.y + z.h - (z.kind === 'stage' ? 10 : 14)); g.textAlign = 'left';
  });
  // flores
  ['#ff6b9a', '#ffd166', '#c084fc'].forEach((c, k) => { g.fillStyle = c; for(let i = 0; i < 18; i++){ const x = 120 + ((i * 131 + k * 47) % 1160), y = 560 + ((i * 53 + k * 29) % 100); g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); } });
}
function pzDrawAvatar(g, sess, o, uid, now){
  const p = prof(uid), x = o.x, y = o.y, talking = Voice.speaking.has(sess) || (sess === Voice.SESSION && Voice.speaking.has(sess));
  const meta = voiceUsers(findChannel(PZ.cid) || { id: PZ.cid, server_id: null }).find(m => m.session === sess) || {};
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 26, 20, 7, 0, 0, Math.PI * 2); g.fill();
  if(talking){ g.strokeStyle = '#b6ff2e'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 27 + Math.sin(now / 90) * 2, 0, Math.PI * 2); g.stroke(); }
  g.save(); g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.closePath(); g.clip();
  const im = pzImg(p);
  if(im) g.drawImage(im, x - 22, y - 22, 44, 44);
  else { g.fillStyle = p.color || '#5865f2'; g.fillRect(x - 22, y - 22, 44, 44); g.fillStyle = '#fff'; g.font = '800 16px system-ui'; g.textAlign = 'center'; g.fillText((p.display_name || '?').slice(0, 2).toUpperCase(), x, y + 6); g.textAlign = 'left'; }
  g.restore();
  g.strokeStyle = sess === Voice.SESSION ? '#ff2e9a' : '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.stroke();
  // nome
  g.font = '700 13px system-ui, sans-serif'; g.textAlign = 'center';
  const nm = (p.display_name || '').slice(0, 16) + (meta.muted || meta.deafened ? ' 🔇' : '') + (meta.sharing ? ' 📺' : '');
  const w = g.measureText(nm).width + 12;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2, y + 30, w, 18);
  g.fillStyle = '#fff'; g.fillText(nm, x, y + 43);
  const em = PZ.emo.get(sess);
  if(em && now - em.at < 2500){ const k = (now - em.at) / 2500; g.font = '30px system-ui'; g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4; g.fillText(em.e, x, y - 34 - k * 20); g.globalAlpha = 1; }
  g.textAlign = 'left';
}
function pzLoop(){
  cancelAnimationFrame(PZ.raf);
  const step = t => {
    if(!PZ.on){ return; }
    const dt = Math.min(0.05, (t - (PZ.last || t)) / 1000); PZ.last = t;
    if(pzMove(dt)){ pzSend(); pzVolumes(); }
    // os outros andam suave até a posição recebida
    PZ.pos.forEach(o => { if(o.tx == null) return; o.x += (o.tx - o.x) * Math.min(1, dt * 10); o.y += (o.ty - o.y) * Math.min(1, dt * 10); });
    // quem saiu da call some
    const here = new Set(voiceUsers(findChannel(PZ.cid) || { id: PZ.cid }).map(m => m.session));
    PZ.pos.forEach((o, s) => { if(!here.has(s)) PZ.pos.delete(s); });
    if(PZ.cv && PZ.cv.isConnected){
      const g = PZ.ctx, now = Date.now();
      pzDrawMap(g);
      // quem está ouvindo bem: um círculo leve mostra seu alcance
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.arc(PZ.me.x, PZ.me.y, FAR, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      if(PZ.target){ g.strokeStyle = '#ff2e9a'; g.lineWidth = 3; g.beginPath(); g.arc(PZ.target.x, PZ.target.y, 10, 0, Math.PI * 2); g.stroke(); }
      const all = [...PZ.pos.entries()].map(([s, o]) => [s, o, o.uid]).concat([[Voice.SESSION, PZ.me, S.me.id]]).sort((a, b) => a[1].y - b[1].y);
      all.forEach(([s, o, u]) => u && pzDrawAvatar(g, s, o, u, now));
      pzHud();
    }
    PZ.raf = requestAnimationFrame(step);
  };
  PZ.raf = requestAnimationFrame(step);
}
function pzHud(){
  const h = PZ.wrap && PZ.wrap.querySelector('#pzHud'); if(!h) return;
  const z = zoneAt(PZ.me.x, PZ.me.y);
  const near = [...PZ.pos.entries()].filter(([s]) => pzFactor(s) > 0.05).map(([s, o]) => o.uid).filter(Boolean);
  const txt = (z ? (z.kind === 'stage' ? '📣 Você está no coreto: a praça toda te ouve' : `🔒 ${z.name}: só quem está aqui ouve vocês`) : '🌳 Na praça') + ' · ' + (near.length ? 'ouvindo ' + [...new Set(near)].slice(0, 4).map(u => prof(u).display_name).join(', ') + (near.length > 4 ? '…' : '') : 'ninguém por perto');
  if(h.textContent !== txt) h.textContent = txt;
}
function pzMount(area){
  if(!PZ.wrap){
    PZ.wrap = document.createElement('div'); PZ.wrap.className = 'pzwrap';
    PZ.wrap.innerHTML = `<div class="pzbar"><b>🌳 Praça</b><span class="pzhud" id="pzHud"></span><span class="grow"></span>
        <div class="pzemo">${['👋', '😂', '❤️', '🔥', '👏'].map((e, i) => `<button data-pze="${e}" data-tip="Tecla ${i + 1}">${e}</button>`).join('')}</div>
        <button class="btn sec sm" id="pzStage">${ic('monitor', 15)} Ver telas</button></div>
      <div class="pzcv"><canvas width="${PZW}" height="${PZH}"></canvas><div class="pzhelp">Ande com <b>WASD</b> ou as setas, ou clique no chão · Só quem está perto te ouve</div></div>`;
    PZ.cv = PZ.wrap.querySelector('canvas'); PZ.ctx = PZ.cv.getContext('2d');
    const toWorld = e => { const r = PZ.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * PZW / r.width, y: (e.clientY - r.top) * PZH / r.height }; };
    PZ.cv.addEventListener('pointerdown', e => { PZ.target = toWorld(e); PZ.wrap.focus(); });
    PZ.wrap.querySelectorAll('[data-pze]').forEach(b => b.onclick = () => pzEmote(b.dataset.pze));
    PZ.wrap.querySelector('#pzStage').onclick = () => { PZ.showStage = true; renderStage(); };
    PZ.wrap.tabIndex = -1;
  }
  area.innerHTML = ''; area.classList.add('plaza'); area.appendChild(PZ.wrap);
}
const _renderStagePz = renderStage;
renderStage = function(){
  _renderStagePz.apply(this, arguments);
  if(!PZ.on || !Voice.channel || Voice.channel.id !== PZ.cid) return;
  const { ch } = stageChannel(); if(!ch || ch.id !== PZ.cid) return;
  const wrap = $('#stageWrap'), area = wrap && wrap.querySelector('.stage .area'); if(!area) return;
  if(PZ.showStage){
    if(!area.querySelector('#pzBack')){ area.insertAdjacentHTML('afterbegin', `<button class="gback" id="pzBack">🌳 Voltar para a praça</button>`); area.querySelector('#pzBack').onclick = () => { PZ.showStage = false; renderStage(); }; }
    return;
  }
  if(area.querySelector('.gpanel')) return;   // jogo aberto tem prioridade
  pzMount(area);
};

/* ---------- criar / configurar canal como praça ---------- */
const _renderSidebarPz = renderSidebar;
renderSidebar = function(){
  _renderSidebarPz.apply(this, arguments);
  S.channels.forEach(list => list.forEach(c => { if(!isPlaza(c)) return; const row = document.querySelector(`#sbBody .ch[data-cid="${c.id}"]`); if(row && !row.querySelector('.plazaic')){ const svg = row.querySelector('svg'); if(svg) svg.outerHTML = '<span class="plazaic radioic" data-tip="Praça (mapa 2D)">🌳</span>'; } }));
};
App.isPlaza = isPlaza;
// usados nos testes
App._pzN = () => PZ.pos.size;
App._pzF = () => { const [s] = [...PZ.pos.keys()]; return s ? pzFactor(s) : null; };
