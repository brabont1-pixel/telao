/* =====================================================================
   v6.39: CONTROLE REMOTO (só no app do Windows)
   Quem assiste uma tela pede "Controlar". Quem compartilha recebe uma janela do
   próprio Windows perguntando se deixa (o site sozinho não consegue liberar).
   Liberou: o mouse e o teclado de quem pediu passam a mexer no PC de quem compartilha.
   Para parar: botão Parar (dos dois lados), Ctrl+Shift+F12 no PC controlado,
   parar de compartilhar a tela ou sair da call. Acaba sozinho depois de 1 hora.
   Os comandos vão direto de um para o outro (canal da própria chamada), não passam pelo servidor.
   ===================================================================== */
const RC = { view: null, host: null, lastMove: 0, pend: null, wheel: 0 };
const rcDesk = () => window.telaoDesktop && window.telaoDesktop.rc;
function rcInfo(sess){ return Voice.infos && Voice.infos.get(sess); }

/* ---------- quem pede (assiste) ---------- */
async function rcRequest(sess){
  const info = rcInfo(sess); if(!info) return;
  if(RC.view && RC.view.on){ rcViewStop(true); return; }
  const dc = Voice.openCtl(sess);
  if(!dc){ App.toast('Não deu para falar com o PC dessa pessoa.', true); return; }
  RC.view = { sess, uid: info.user_id, on: false, at: Date.now() };
  const send = () => Voice.sendCtl(sess, { a: 'req' });
  if(dc.readyState === 'open') send();
  else { const t0 = Date.now(); await new Promise(res => { const iv = setInterval(() => { if(dc.readyState === 'open' || Date.now() - t0 > 8000){ clearInterval(iv); res(); } }, 100); }); if(dc.readyState !== 'open'){ App.toast('Não conectou o controle. Tente de novo.', true); RC.view = null; return; } send(); }
  App.toast(`Pedido enviado. Esperando ${prof(info.user_id).display_name} aceitar no PC dele…`);
  renderStage();
}
function rcViewStop(tell){
  const v = RC.view; if(!v) return;
  if(tell) Voice.sendCtl(v.sess, { a: 'stop' });
  RC.view = null; renderStage();
}
function rcMap(e, v){
  const r = v.getBoundingClientRect(), vw = v.videoWidth || r.width, vh = v.videoHeight || r.height;
  const sc = Math.min(r.width / vw, r.height / vh), cw = vw * sc, chh = vh * sc;
  const ox = r.left + (r.width - cw) / 2, oy = r.top + (r.height - chh) / 2;
  return { x: Math.max(0, Math.min(1, (e.clientX - ox) / cw)), y: Math.max(0, Math.min(1, (e.clientY - oy) / chh)) };
}
function rcLayer(box){
  const v = box.querySelector('.vslot video'); if(!v) return;
  const L = document.createElement('div'); L.className = 'rclayer'; L.tabIndex = 0;
  L.innerHTML = `<span class="rchint">${ic('mouse', 14)} Clique aqui para mexer · o teclado vai para o PC de ${esc(prof(RC.view.uid).display_name)} enquanto a tela estiver selecionada</span>`;
  box.appendChild(L);
  const s = RC.view.sess, out = o => Voice.sendCtl(s, Object.assign({ a: 'in' }, o));
  let raf = 0, last = null;
  L.onpointermove = e => { last = rcMap(e, v); if(!raf) raf = requestAnimationFrame(() => { raf = 0; if(Date.now() - RC.lastMove > 25 && last){ RC.lastMove = Date.now(); out({ t: 'm', x: +last.x.toFixed(4), y: +last.y.toFixed(4) }); } }); };
  L.onpointerdown = e => { e.preventDefault(); L.focus({ preventScroll: true }); L.classList.add('active'); const p = rcMap(e, v); out({ t: 'm', x: +p.x.toFixed(4), y: +p.y.toFixed(4) }); out({ t: 'd', b: e.button }); try{ L.setPointerCapture(e.pointerId); }catch(x){} };
  L.onpointerup = e => { e.preventDefault(); out({ t: 'u', b: e.button }); };
  L.oncontextmenu = e => e.preventDefault();
  L.onwheel = e => { e.preventDefault(); RC.wheel += -e.deltaY; if(Math.abs(RC.wheel) >= 40){ const n = Math.max(-1200, Math.min(1200, Math.round(RC.wheel / 100) * 120 || Math.sign(RC.wheel) * 120)); RC.wheel = 0; out({ t: 'w', d: n }); } };
  const key = d => e => { if(e.code === 'MetaLeft' || e.code === 'MetaRight') return; e.preventDefault(); e.stopPropagation(); if(e.repeat && !d) return; out({ t: 'k', d, c: e.code }); };
  L.onkeydown = key(true); L.onkeyup = key(false);
  L.onblur = () => L.classList.remove('active');
  if(RC.view.focus){ setTimeout(() => L.focus({ preventScroll: true }), 0); }
  L.onfocus = () => { RC.view && (RC.view.focus = true); L.classList.add('active'); };
}

/* ---------- quem compartilha (é controlado) ---------- */
function rcBanner(){
  let b = $('#rcBanner');
  if(!RC.host){ b && b.remove(); return; }
  if(!b){ document.body.insertAdjacentHTML('beforeend', '<div class="rcbanner" id="rcBanner"></div>'); b = $('#rcBanner'); }
  b.innerHTML = `${ic('mouse', 18)} <span><b>${esc(prof(RC.host.uid).display_name)}</b> está controlando seu PC · Ctrl+Shift+F12 para parar</span><button class="btn red sm" id="rcStop">Parar</button>`;
  b.querySelector('#rcStop').onclick = () => rcHostStop('você parou');
}
function rcHostStop(why, silent){
  const h = RC.host; if(!h) return;
  RC.host = null;
  try{ rcDesk() && rcDesk().stop(); }catch(e){}
  Voice.sendCtl(h.sess, { a: 'stop', why });
  rcBanner();
  if(!silent) App.toast('Controle remoto encerrado.');
}
async function rcOnReq(remote){
  const info = rcInfo(remote), uid = info && info.user_id; if(!uid) return;
  const no = why => Voice.sendCtl(remote, { a: 'no', why });
  if(!rcDesk()) return no('Ela não está no app do Telão para Windows (atualizado).');
  if(!Voice.screenStream) return no('Ela não está compartilhando a tela.');
  if(RC.host) return no(RC.host.sess === remote ? 'Você já está controlando.' : 'Já tem alguém controlando esse PC.');
  if(RC.pend) return no('Já tem um pedido esperando resposta.');
  if(S.blocked && S.blocked.has(uid)) return no('Recusado.');
  RC.pend = remote;
  App.toast(`🖱️ ${prof(uid).display_name} pediu para controlar seu PC. Responda na janela do Windows.`);
  let r;
  try{ r = await rcDesk().ask(prof(uid).display_name); }catch(e){ r = { ok: false, why: 'erro' }; }
  RC.pend = null;
  if(!r || !r.ok) return no(r && r.why && r.why !== 'recusou' ? r.why : `${S.me.display_name || 'A pessoa'} recusou.`);
  if(!Voice.screenStream || !Voice.peers.has(remote)){ try{ rcDesk().stop(); }catch(e){} return; }
  RC.host = { sess: remote, uid, at: Date.now() };
  Voice.sendCtl(remote, { a: 'ok' });
  rcBanner();
}
Voice.onCtl = (remote, m) => {
  if(!m || typeof m !== 'object') return;
  // lado controlado
  if(m.a === 'req'){ rcOnReq(remote); return; }
  if(m.a === 'in'){ if(RC.host && RC.host.sess === remote && rcDesk()) rcDesk().input({ t: m.t, x: m.x, y: m.y, b: m.b, d: m.d, c: m.c }); return; }
  if(m.a === 'stop' && RC.host && RC.host.sess === remote){ rcHostStop('a outra pessoa parou'); return; }
  if(m.a === 'closed' && RC.host && RC.host.sess === remote){ rcHostStop('caiu a conexão', true); }
  // lado que controla
  const v = RC.view; if(!v || v.sess !== remote) return;
  if(m.a === 'ok'){ v.on = true; v.focus = true; App.toast(`Você está controlando o PC de ${prof(v.uid).display_name}. Clique na tela para mexer.`); renderStage(); }
  else if(m.a === 'no'){ App.toast(String(m.why || 'Recusado.').slice(0, 140), true); RC.view = null; renderStage(); }
  else if(m.a === 'stop' || m.a === 'closed'){ if(v.on) App.toast('O controle remoto acabou.'); RC.view = null; renderStage(); }
};
if(rcDesk() && rcDesk().onStop) rcDesk().onStop(why => { if(RC.host){ const h = RC.host; RC.host = null; Voice.sendCtl(h.sess, { a: 'stop', why }); rcBanner(); App.toast('Controle remoto encerrado' + (why ? ` (${why})` : '') + '.'); } });
// parou de compartilhar, a pessoa saiu da call… acaba
setInterval(() => {
  if(RC.host && (!Voice.screenStream || !Voice.peers.has(RC.host.sess))) rcHostStop('a tela parou', true);
  if(RC.view && (!Voice.peers.has(RC.view.sess) || !(rcInfo(RC.view.sess) || {}).sharing)){ RC.view = null; renderStage(); }
  if(RC.view && !RC.view.on && Date.now() - RC.view.at > 60000){ App.toast('Ninguém respondeu o pedido de controle.', true); RC.view = null; renderStage(); }
}, 1000);
const _leaveVoiceRC = leaveVoice;
leaveVoice = function(){ if(RC.host) rcHostStop('saiu da call', true); if(RC.view) rcViewStop(true); return _leaveVoiceRC.apply(this, arguments); };

/* ---------- botão na tela em foco ---------- */
const _renderStageRC = renderStage;
renderStage = function(){
  _renderStageRC.apply(this, arguments);
  const box = document.querySelector('#stageWrap #focusBox'); if(!box || box.classList.contains('wtfocus') || box.classList.contains('hidden')) return;
  const sess = S.focus && S.focus.startsWith('s:') ? S.focus.slice(2) : null;
  if(!sess || sess === Voice.SESSION) return;
  const info = rcInfo(sess), tools = box.querySelector('.tools');
  const mineView = RC.view && RC.view.sess === sess;
  if(tools && (info && info.rc || mineView) && !tools.querySelector('#stRc')){
    tools.insertAdjacentHTML('afterbegin', `<button id="stRc" class="${mineView && RC.view.on ? 'rec' : mineView ? 'on' : ''}" data-tip="${mineView && RC.view.on ? 'Parar de controlar' : mineView ? 'Esperando aceitar… (clique para cancelar)' : 'Pedir para controlar este PC'}">${ic('mouse', 18)}</button>`);
    tools.querySelector('#stRc').onclick = e => { e.stopPropagation(); if(mineView){ rcViewStop(true); } else rcRequest(sess); };
  }
  if(mineView && RC.view.on){ box.classList.add('rcon'); rcLayer(box); }
};
App.rc = { get view(){ return RC.view; }, get host(){ return RC.host; }, request: rcRequest, stopHost: rcHostStop, stopView: rcViewStop, onReqTest: rcOnReq };
