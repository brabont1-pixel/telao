/* =====================================================================
   v6.27: DENÚNCIAS
   Menu da mensagem → Denunciar. A denúncia vai para quem modera o servidor (Gerenciar mensagens
   ou Moderar membros) em Configurações do servidor → Denúncias. Em DM vai para o admin do Telão.
   O banco guarda uma cópia da mensagem na hora, então apagar não some com a prova.
   Quem foi denunciado não vê nada; quem denunciou não aparece para o denunciado.
   ===================================================================== */
const REP_REASONS = [['spam', '📢', 'Spam ou propaganda'], ['ofensa', '🤬', 'Ofensa ou discurso de ódio'], ['assedio', '😠', 'Assédio ou ameaça'], ['nsfw', '🔞', 'Conteúdo adulto ou chocante'], ['golpe', '🎣', 'Golpe, link falso ou phishing'], ['outro', '❓', 'Outra coisa']];
const REP_SQL = 'Para denúncias, rode o supabase.sql novo (v6.27) no Supabase.';
S.repCount = new Map();
App.reportCount = sid => S.repCount.get(sid) || 0;
const canModReports = sid => App.hasPerm(sid, 8) || App.hasPerm(sid, 64);

const _msgMenuExtraRep = App.msgMenuExtra;
App.msgMenuExtra = m => {
  const out = _msgMenuExtraRep ? _msgMenuExtraRep(m) : [];
  if(m.author_id !== S.me.id && m.author_id !== TELAO_BOT_ID && !String(m.id).startsWith('tmp-'))
    out.push({ label: 'Denunciar mensagem', icon: ic('shield', 18), danger: true, onClick: () => reportModal(m) });
  return out;
};
function reportModal(m){
  const ch = findChannel(m.channel_id), dm = !ch || !ch.server_id;
  modal(`<form id="rpF"><div class="mh"><h2>Denunciar mensagem</h2><p>${dm ? 'Vai para a equipe do Telão.' : 'Vai para quem modera este servidor.'} A pessoa não fica sabendo que foi você.</p></div>
    <div class="mc"><div class="rpquote"><b>${esc(prof(m.author_id).display_name)}</b><span>${esc((m.content || '').slice(0, 200)) || '<i>anexo</i>'}</span></div>
      <div class="rpreasons">${REP_REASONS.map(([v, e, l], i) => `<label><input type="radio" name="rpr" value="${v}" ${i === 0 ? 'checked' : ''}><span>${e}</span>${l}</label>`).join('')}</div>
      <label class="field"><span>Detalhes (opcional)</span><textarea class="inp" id="rpD" rows="2" maxlength="500" placeholder="Conte o que aconteceu"></textarea></label>
      <div class="err" id="rpE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn red" id="rpGo">Denunciar</button></div></form>`, el => {
    el.querySelector('#rpF').onsubmit = async e => {
      e.preventDefault();
      const b = el.querySelector('#rpGo'); b.disabled = true;
      const { error } = await App.sb.from('message_reports').insert({ message_id: m.id, reason: el.querySelector('input[name=rpr]:checked').value, details: el.querySelector('#rpD').value.trim() || null });
      if(error){
        b.disabled = false;
        el.querySelector('#rpE').textContent = /duplicate|message_reports_once/i.test(error.message) ? 'Você já denunciou essa mensagem.' : /message_reports|schema cache|does not exist/i.test(error.message) ? REP_SQL : error.message;
        return;
      }
      closeModal(); App.toast('Denúncia enviada. Obrigado por ajudar a manter o lugar legal 💚');
    };
  });
}

/* ---------- aviso para moderadores ----------
   v6.28: antes só contava o servidor aberto e só aparecia dentro das configurações.
   Agora confere TODOS os servidores que você modera (e as denúncias de DM, se for admin) a cada 45 s,
   põe um escudo com o número no ícone do servidor, um item "Denúncias" no menu do servidor
   e avisa quando chega denúncia nova (inclusive as que chegaram enquanto você estava fora). */
const REP_SEEN_KEY = 'telao-rep-seen';
let repLoaded = false;
async function repRefreshAll(){
  if(!S.me) return;
  const modSids = S.servers.filter(s => canModReports(s.id)).map(s => s.id);
  if(!modSids.length && !S.me.is_admin) return;
  const { data, error } = await App.sb.from('message_reports').select('id,server_id,reporter,created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(500);
  if(error) return;
  const cnt = new Map(), fresh = [];
  const seen = new Set(ls.get(REP_SEEN_KEY, []));
  (data || []).forEach(r => {
    const k = r.server_id || 'dm';
    const mine = r.server_id ? modSids.includes(r.server_id) : S.me.is_admin;
    if(!mine || r.reporter === S.me.id) return;
    cnt.set(k, (cnt.get(k) || 0) + 1);
    if(!seen.has(r.id)) fresh.push(r);
  });
  const changed = [...cnt].some(([k, v]) => S.repCount.get(k) !== v) || [...S.repCount.keys()].some(k => !cnt.has(k));
  S.repCount = cnt;
  if(fresh.length){
    ls.set(REP_SEEN_KEY, [...seen, ...fresh.map(r => r.id)].slice(-400));
    const r = fresh[0], srv = r.server_id && S.servers.find(x => x.id === r.server_id);
    const where = srv ? srv.name : 'uma DM';
    repToast(fresh.length > 1 ? `🛡️ ${fresh.length} denúncias novas (${where}${fresh.some(x => x.server_id !== r.server_id) ? ' e outros' : ''})` : `🛡️ Nova denúncia em ${where}`, r.server_id);
    if(App.sfx && !isDnd()) App.sfx('msg');
  }
  repLoaded = true;
  if(changed){ renderRail(); }
}
App.repRefresh = repRefreshAll;
const repRefresh = () => repRefreshAll();
function repOpen(sid){
  if(sid){ const s = S.servers.find(x => x.id === sid); if(s) openSettings('server', 'reports', s); }
  else openSettings('user', 'admin');
}
App.repOpen = repOpen;
function repToast(text, sid){
  document.getElementById('repToast')?.remove();
  const t = document.createElement('div'); t.id = 'repToast'; t.className = 'reptoast';
  t.innerHTML = `<span>${esc(text)}</span><button class="btn sm" id="repTGo">Ver denúncias</button><button class="ibtn sm" id="repTX" aria-label="Fechar">${ic('x', 14)}</button>`;
  document.body.appendChild(t);
  t.querySelector('#repTGo').onclick = () => { t.remove(); repOpen(sid); };
  t.querySelector('#repTX').onclick = () => t.remove();
  setTimeout(() => t.isConnected && t.remove(), 20000);
}
setTimeout(repRefreshAll, 4000);
setInterval(repRefreshAll, 45000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) repRefreshAll(); });
// escudo com o número no ícone do servidor
const _renderRailRep = renderRail;
renderRail = function(){
  _renderRailRep.apply(this, arguments);
  S.repCount.forEach((n, k) => {
    if(!n || k === 'dm') return;
    const b = document.querySelector(`#rail [data-sid="${k}"]`);
    if(b && !b.querySelector('.repb')) b.insertAdjacentHTML('beforeend', `<span class="repb" title="${n} ${n === 1 ? 'denúncia aberta' : 'denúncias abertas'}">🛡️${n > 9 ? '9+' : n}</span>`);
  });
};
// item no menu do servidor (aparece para quem modera, mesmo sem acesso às outras configurações)
const _srvMenuExtraRep = App.srvMenuExtra;
App.srvMenuExtra = s => {
  const out = _srvMenuExtraRep ? _srvMenuExtraRep(s) : [];
  if(canModReports(s.id)){ const n = S.repCount.get(s.id) || 0; out.push({ label: n ? `Denúncias (${n})` : 'Denúncias', icon: ic('shield', 18), onClick: () => openSettings('server', 'reports', s) }); }
  return out;
};
// admin: atalho para as denúncias de DM no menu do seu perfil
const _selfMenuExtraRep = App.selfMenuExtra;
App.selfMenuExtra = () => {
  const out = _selfMenuExtraRep ? _selfMenuExtraRep() : [];
  if(S.me && S.me.is_admin){ const n = S.repCount.get('dm') || 0; out.push({ label: n ? `Denúncias em DMs (${n})` : 'Denúncias em DMs', icon: ic('shield', 18), onClick: () => repOpen(null) }); }
  return out;
};

/* ---------- fila de denúncias ---------- */
function repGroup(rows){
  const g = new Map();
  rows.forEach(r => { const k = r.message_id || r.id; if(!g.has(k)) g.set(k, []); g.get(k).push(r); });
  return [...g.values()];
}
function repCard(list, sid){
  const r = list[0], a = prof(r.author_id), ch = findChannel(r.channel_id);
  const reasons = [...new Set(list.map(x => x.reason))].map(v => { const x = REP_REASONS.find(y => y[0] === v); return x ? `<span class="rptag">${x[1]} ${x[2]}</span>` : ''; }).join('');
  const atts = (Array.isArray(r.attachments) ? r.attachments : []).slice(0, 4);
  const open = r.status === 'open';
  const can8 = sid ? App.hasPerm(sid, 8) : S.me.is_admin, can64 = sid && App.hasPerm(sid, 64), can128 = sid && App.hasPerm(sid, 128);
  return `<div class="rpcard ${open ? '' : 'done'}" data-rpid="${r.id}">
    <div class="rptop">${avatar(a, 'sm')}<div><b>${esc(a.display_name)}</b><small>@${esc(a.username || '')}${ch && ch.server_id ? ' · #' + esc(ch.name) : ' · DM'} · ${new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div><span class="grow"></span><span class="rpn">${list.length} ${list.length === 1 ? 'denúncia' : 'denúncias'}</span></div>
    <div class="rpmsg">${esc(r.content || '') || '<i class="mut">sem texto</i>'}${atts.length ? `<div class="rpatt">${atts.map(x => /^image\//.test(x.type || '') ? `<img src="${esc(x.url)}" alt="">` : `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name || 'anexo')}</a>`).join('')}</div>` : ''}</div>
    <div class="rpreas">${reasons}</div>
    ${list.filter(x => x.details).map(x => `<div class="rpdet">“${esc(x.details)}”</div>`).join('')}
    ${open ? `<div class="rpact">
      ${r.message_id && ch ? `<button class="btn sec sm" data-rpgo="${r.id}">${ic('arrowLeft', 14)} Ver no chat</button>` : ''}
      ${r.message_id && can8 ? `<button class="btn red sm" data-rpdel="${r.id}">${ic('trash', 14)} Apagar mensagem</button>` : ''}
      ${can64 && r.author_id ? `<button class="btn sec sm" data-rpto="${r.id}">${ic('clock', 14)} Castigo</button>` : ''}
      ${can128 && r.author_id ? `<button class="btn sec sm" data-rpban="${r.id}">${ic('slash', 14)} Banir</button>` : ''}
      <span class="grow"></span>
      <button class="btn sec sm" data-rpok="${r.id}">${ic('check', 14)} Resolvida</button><button class="btn sec sm" data-rpno="${r.id}">Ignorar</button></div>`
    : `<div class="rpdone">${r.status === 'resolved' ? '✅ Resolvida' : '🙈 Ignorada'}${r.action ? ' · ' + esc(r.action) : ''}${r.resolved_by ? ' por ' + esc(prof(r.resolved_by).display_name) : ''}</div>`}
  </div>`;
}
async function repRender(box, back, sid, title){
  const tab = box.dataset.rptab || 'open';
  let q = App.sb.from('message_reports').select('*').order('created_at', { ascending: false }).limit(150);
  q = sid ? q.eq('server_id', sid) : q.is('server_id', null);
  q = tab === 'open' ? q.eq('status', 'open') : q.neq('status', 'open');
  const { data, error } = await q;
  if(error){ box.innerHTML = `${back}<h2>${title}</h2><div class="locked">${/message_reports|schema cache|does not exist/i.test(error.message) ? REP_SQL : esc(error.message)}</div>`; return; }
  const rows = data || [];
  await ensureProfiles([...new Set(rows.flatMap(r => [r.author_id, r.resolved_by]).filter(Boolean))]);
  const groups = repGroup(rows);
  if(tab === 'open'){ S.repCount.set(sid || 'dm', groups.reduce((a, g) => a + g.length, 0)); renderRail(); }
  box.innerHTML = `${back}<h2>${title}</h2><p class="mut">Mensagens que a galera denunciou. Quem denunciou fica em segredo; a cópia da mensagem fica guardada mesmo se ela for apagada.</p>
    <div class="rltabs" style="max-width:360px"><button class="${tab === 'open' ? 'on' : ''}" data-rpt="open">Abertas</button><button class="${tab !== 'open' ? 'on' : ''}" data-rpt="done">Resolvidas</button></div>
    <div class="rplist">${groups.map(g => repCard(g, sid)).join('') || `<div class="empty">${tab === 'open' ? 'Nenhuma denúncia aberta. 🎉' : 'Nada por aqui ainda.'}</div>`}</div>`;
  box.querySelectorAll('[data-rpt]').forEach(b => b.onclick = () => { box.dataset.rptab = b.dataset.rpt; repRender(box, back, sid, title); });
  const find = id => rows.find(r => r.id === id);
  const resolve = async (id, st, act) => {
    const { error } = await App.sb.rpc('resolve_report', { p_id: id, p_status: st, p_action: act || null });
    if(error){ App.toast(error.message, true); return false; }
    return true;
  };
  const again = () => { repRender(box, back, sid, title); repRefreshAll(); };
  box.querySelectorAll('[data-rpok]').forEach(b => b.onclick = async () => { if(await resolve(b.dataset.rpok, 'resolved', 'resolvida')) again(); });
  box.querySelectorAll('[data-rpno]').forEach(b => b.onclick = async () => { if(await resolve(b.dataset.rpno, 'dismissed', 'ignorada')) again(); });
  box.querySelectorAll('[data-rpdel]').forEach(b => b.onclick = async () => {
    const r = find(b.dataset.rpdel);
    if(!(await confirmBox('Apagar mensagem', 'Apagar a mensagem denunciada do chat? A cópia continua aqui na denúncia.', 'Apagar'))) return;
    if(!(await resolve(r.id, 'resolved', 'mensagem apagada'))) return;
    const { error } = await App.sb.from('messages').delete().eq('id', r.message_id);
    if(error) App.toast(error.message, true); else { App.onMsgDelete && App.onMsgDelete(r.message_id); App.toast('Mensagem apagada.'); }
    again();
  });
  box.querySelectorAll('[data-rpgo]').forEach(b => b.onclick = () => {
    const r = find(b.dataset.rpgo); closeSettings();
    go({ kind: 'server', sid: r.server_id, cid: r.channel_id }).then(() => setTimeout(() => jumpTo(r.message_id), 400));
  });
  const srv = sid && S.servers.find(x => x.id === sid);
  box.querySelectorAll('[data-rpto]').forEach(b => b.onclick = async () => { const r = find(b.dataset.rpto); await resolve(r.id, 'resolved', 'castigo'); timeoutModal(srv, r.author_id); again(); });
  box.querySelectorAll('[data-rpban]').forEach(b => b.onclick = async () => { const r = find(b.dataset.rpban); await resolve(r.id, 'resolved', 'banido'); banModal(srv, r.author_id); again(); });
}
function secSrvReports(box, back){
  box.innerHTML = `${back}<h2>Denúncias</h2><div class="spin" style="margin:20px 0"></div>`;
  repRender(box, back, SET.server.id, 'Denúncias');
}
// admin do Telão: denúncias feitas em DMs
const _secAdminRep = secAdmin;
secAdmin = function(box, back){
  _secAdminRep.apply(this, arguments);
  if(!S.me.is_admin) return;
  const wrap = document.createElement('div'); wrap.className = 'rpadmin'; wrap.id = 'rpAdmin';
  const h2 = box.querySelector('h2');
  if(h2) h2.after(wrap); else box.prepend(wrap);
  wrap.insertAdjacentHTML('afterend', '<hr class="sdiv">');
  repRender(wrap, '', null, 'Denúncias em DMs');
};
// ganchos para os testes automáticos
App._t = { get S(){ return S; }, get go(){ return go; }, get joinVoice(){ return joinVoice; }, get findChannel(){ return findChannel; }, get prof(){ return prof; }, get profileCard(){ return profileCard; },
  get openSettings(){ return openSettings; }, get closeSettings(){ return closeSettings; }, get activitiesMenu(){ return activitiesMenu; }, get closeMenu(){ return closeMenu; } };
