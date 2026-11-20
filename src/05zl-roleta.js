/* =====================================================================
   v6.27: ROLETA / SORTEIO NA CALL
   Quem gira escolhe o resultado (sorteio no PC dele) e manda para a call; todo mundo vê
   a mesma roda girando e parando no mesmo lugar. Também sorteia times.
   ===================================================================== */
const RL_COLORS = ['#ff2e9a', '#b6ff2e', '#2ee6ff', '#a970ff', '#ffb02e', '#ff5c5c', '#2effa8', '#ffe14d', '#5c8cff', '#ff7ae0'];
let rlLast = 0;
function rlCallNames(){
  if(!Voice.channel) return [];
  return [...new Set(voiceUsers(Voice.channel).map(u => u.user_id))].map(id => prof(id).display_name);
}
function rlModal(){
  if(!Voice.channel){ App.toast('Entre numa chamada para usar a roleta.', true); return; }
  const presets = {
    call: () => rlCallNames().join('\n'),
    simnao: () => 'Sim\nNão',
    moeda: () => 'Cara\nCoroa',
    dez: () => Array.from({ length: 10 }, (_, i) => i + 1).join('\n'),
    jogos: () => 'Valorant\nCS2\nMinecraft\nLoL\nFortnite\nRoblox',
  };
  modal(`<form id="rlF"><div class="mh"><h2>🎡 Roleta</h2><p>Gire e todo mundo na chamada vê o resultado ao mesmo tempo.</p></div>
    <div class="mc">
      <div class="rltabs"><button type="button" class="on" data-rlm="wheel">🎡 Roleta</button><button type="button" data-rlm="teams">👥 Sortear times</button></div>
      <div id="rlWheel">
        <div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-rlp="call">Quem está na call</button><button type="button" class="chip" data-rlp="simnao">Sim ou não</button><button type="button" class="chip" data-rlp="moeda">Cara ou coroa</button><button type="button" class="chip" data-rlp="dez">1 a 10</button><button type="button" class="chip" data-rlp="jogos">Jogos</button></div>
        <label class="field"><span>Opções (uma por linha, até 24)</span><textarea class="inp" id="rlO" rows="6" maxlength="1200">${esc(presets.call())}</textarea></label>
        <label class="field"><span>Pergunta (opcional)</span><input class="inp" id="rlQ" maxlength="80" placeholder="Quem paga a pizza?"></label>
      </div>
      <div id="rlTeams" class="hidden">
        <p class="mut small">Divide quem está na call em times aleatórios.</p>
        <label class="field"><span>Quantos times</span><select class="inp" id="rlN"><option>2</option><option>3</option><option>4</option></select></label>
      </div>
      <div class="err" id="rlE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">🎡 Girar</button></div></form>`, m => {
    let mode = 'wheel';
    m.querySelectorAll('[data-rlm]').forEach(b => b.onclick = () => {
      mode = b.dataset.rlm; m.querySelectorAll('[data-rlm]').forEach(x => x.classList.toggle('on', x === b));
      m.querySelector('#rlWheel').classList.toggle('hidden', mode !== 'wheel'); m.querySelector('#rlTeams').classList.toggle('hidden', mode !== 'teams');
    });
    m.querySelectorAll('[data-rlp]').forEach(b => b.onclick = () => { m.querySelector('#rlO').value = presets[b.dataset.rlp](); });
    m.querySelector('#rlF').onsubmit = e => {
      e.preventDefault();
      if(Date.now() - rlLast < 6000){ m.querySelector('#rlE').textContent = 'Espere a roda parar antes de girar de novo.'; return; }
      if(mode === 'teams'){
        const names = rlCallNames(), n = +m.querySelector('#rlN').value;
        if(names.length < 2){ m.querySelector('#rlE').textContent = 'Precisa de pelo menos 2 pessoas na call.'; return; }
        const sh = names.slice().sort(() => Math.random() - 0.5), teams = Array.from({ length: Math.min(n, names.length) }, () => []);
        sh.forEach((x, i) => teams[i % teams.length].push(x));
        closeModal(); rlLast = Date.now(); Voice.sendFx({ t: 'roleta', mode: 'teams', teams }); return;
      }
      const opts = m.querySelector('#rlO').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 24).map(x => x.slice(0, 40));
      if(opts.length < 2){ m.querySelector('#rlE').textContent = 'Coloque pelo menos 2 opções.'; return; }
      const idx = Math.floor(Math.random() * opts.length), turns = 5 + Math.floor(Math.random() * 3), jitter = 0.15 + Math.random() * 0.7;
      const q = m.querySelector('#rlQ').value.trim().slice(0, 80);
      closeModal(); rlLast = Date.now();
      Voice.sendFx({ t: 'roleta', mode: 'wheel', opts, idx, turns, jitter, q });
    };
  });
}
App.roleta = rlModal;
function rlShow(pl){
  document.getElementById('rlOv')?.remove();
  const ov = document.createElement('div'); ov.id = 'rlOv'; ov.className = 'rlov';
  const who = esc(prof(pl.uid).display_name);
  if(pl.mode === 'teams'){
    const teams = (pl.teams || []).slice(0, 4);
    ov.innerHTML = `<div class="rlbox"><div class="rlhead">👥 <b>${who}</b> sorteou os times</div><div class="rlteams">${teams.map((t, i) => `<div class="rlteam" style="--tc:${RL_COLORS[i]};animation-delay:${i * 0.25}s"><h4>Time ${i + 1}</h4>${(t || []).slice(0, 20).map(n => `<span>${esc(String(n))}</span>`).join('')}</div>`).join('')}</div><button class="btn sec sm" id="rlX">Fechar</button></div>`;
    document.body.appendChild(ov); ov.querySelector('#rlX').onclick = () => ov.remove();
    if(App.sfx) App.sfx('ring');
    setTimeout(() => ov.remove(), 15000); return;
  }
  const opts = (pl.opts || []).slice(0, 24).map(x => String(x).slice(0, 40)), n = opts.length;
  if(n < 2) return;
  const idx = Math.max(0, Math.min(n - 1, pl.idx | 0));
  ov.innerHTML = `<div class="rlbox"><div class="rlhead">🎡 <b>${who}</b> girou a roleta${pl.q ? `: <i>${esc(String(pl.q))}</i>` : ''}</div>
    <div class="rlwheel"><canvas width="560" height="560"></canvas><span class="rlptr"></span><span class="rlhub">🎲</span></div>
    <div class="rlres" id="rlRes"></div><button class="btn sec sm" id="rlX">Fechar</button></div>`;
  document.body.appendChild(ov); ov.querySelector('#rlX').onclick = () => ov.remove();
  const cv = ov.querySelector('canvas'), x = cv.getContext('2d'), R = 270, C = 280, seg = Math.PI * 2 / n;
  const draw = rot => {
    x.clearRect(0, 0, 560, 560);
    for(let i = 0; i < n; i++){
      const a0 = rot + i * seg - Math.PI / 2;
      x.beginPath(); x.moveTo(C, C); x.arc(C, C, R, a0, a0 + seg); x.closePath();
      x.fillStyle = RL_COLORS[i % RL_COLORS.length]; if(n % RL_COLORS.length === 1 && i === n - 1) x.fillStyle = RL_COLORS[3]; x.fill();
      x.strokeStyle = '#16121c'; x.lineWidth = 3; x.stroke();
      x.save(); x.translate(C, C); x.rotate(a0 + seg / 2); x.textAlign = 'right'; x.fillStyle = '#16121c';
      x.font = `800 ${n > 14 ? 16 : n > 8 ? 20 : 26}px system-ui,sans-serif`;
      const t = opts[i].length > 18 ? opts[i].slice(0, 17) + '…' : opts[i];
      x.fillText(t, R - 18, 8); x.restore();
    }
    x.beginPath(); x.arc(C, C, R, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 6; x.stroke();
  };
  // ponteiro no topo: o centro da fatia idx tem que parar em -90°  → rot = -(idx + jitter) * seg
  const target = Math.PI * 2 * (pl.turns || 6) - (idx + (pl.jitter ?? 0.5)) * seg;
  const dur = 4800, t0 = performance.now(); let lastSeg = -1;
  const step = now => {
    if(!ov.isConnected) return;
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4), rot = target * e;
    draw(rot);
    const cur = Math.floor(((-rot % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2) / seg);
    if(cur !== lastSeg){ lastSeg = cur; rlTick(); }
    if(k < 1) requestAnimationFrame(step);
    else { const r = ov.querySelector('#rlRes'); r.innerHTML = `🎉 <b>${esc(opts[idx])}</b>`; r.classList.add('on'); if(App.sfx) App.sfx('ring'); setTimeout(() => ov.isConnected && ov.remove(), 9000); }
  };
  requestAnimationFrame(step);
}
let rlCtx = null;
function rlTick(){
  if(Voice.deafened) return;
  try{ rlCtx = rlCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = rlCtx.createOscillator(), g = rlCtx.createGain(), t = rlCtx.currentTime;
    o.type = 'square'; o.frequency.value = 900; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g).connect(rlCtx.destination); o.start(t); o.stop(t + 0.05); }catch(e){}
}
const _onFxRL = Voice.onFx;
Voice.onFx = (pl, mine) => {
  if(pl && pl.t === 'roleta'){ rlShow(pl); return; }
  _onFxRL(pl, mine);
};
