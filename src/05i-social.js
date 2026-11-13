/* =====================================================================
   v6.5: SOLICITAÇÕES DE MENSAGEM · COMUNIDADES · TAGS DE SERVIDOR · AVISOS DO TELÃO · EMOJIS DE SERVIDOR
   ===================================================================== */

/* ---------- solicitações de mensagem ---------- */
S.dmReq = [];
const _loadDms = loadDms;
loadDms = async function(){
  await _loadDms.apply(this, arguments);
  const all = S.dms;
  const before = new Set(S.dmReq.map(d => d.id));
  S.dmReq = all.filter(d => d.dm_status === 'pending' && d.dm_requester && d.dm_requester !== S.me.id);
  S.dms = all.filter(d => !(d.dm_status === 'pending' && d.dm_requester && d.dm_requester !== S.me.id));
  const novo = S.dmReq.find(d => !before.has(d.id));
  if(novo && S._dmReqInit) App.toast(`${prof(novo.dm_requester).display_name} quer conversar com você.`, false, { label: 'Ver', fn: requestsModal });
  S._dmReqInit = true;
};
const _renderSidebarR = renderSidebar;
renderSidebar = function(){
  _renderSidebarR.apply(this, arguments);
  if(S.route.kind !== 'home') return;
  const fr = $('#sbFriends'); if(!fr || $('#sbReq')) return;
  if(!S.dmReq.length) return;
  fr.insertAdjacentHTML('afterend', `<div class="ch big" id="sbReq"><span class="ic">${ic('inbox', 20)}</span><span class="nm">Solicitações</span><span class="pill">${S.dmReq.length}</span></div>`);
  $('#sbReq').onclick = requestsModal;
};
async function requestsModal(){
  const list = S.dmReq;
  const prev = {};
  await Promise.all(list.map(async d => {
    const { data } = await App.sb.from('messages').select('content, attachments, created_at').eq('channel_id', d.id).order('created_at', { ascending: false }).limit(3);
    prev[d.id] = (data || []).reverse();
  }));
  modal(`<div class="mh"><h2>Solicitações de mensagem</h2><p>Pessoas que não são suas amigas e querem conversar. Elas não sabem se você viu até você aceitar.</p></div>
    <div class="mc"><div class="reqlist">${list.map(d => { const p = prof(d.dm_requester); return `<div class="reqc">
      <div class="reqh">${avatar(p, '', true)}<div class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></div>
      <div class="reqm">${(prev[d.id] || []).map(m => `<div>${m.content ? richText(m.content) : '<i>enviou um anexo</i>'}</div>`).join('') || '<i class="mut">Ainda não mandou nada.</i>'}</div>
      <div class="reqb"><button class="btn sec sm" data-rq="${d.id}" data-ok="0">Ignorar</button><button class="btn sm" data-rq="${d.id}" data-ok="1">Aceitar</button></div></div>`; }).join('') || '<div class="empty">Nenhuma solicitação.</div>'}</div>
      <p class="mut small" style="margin-top:12px">Quer receber menos? Configurações → Privacidade → Quem pode me mandar mensagem.</p></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelectorAll('[data-rq]').forEach(b => b.onclick = async () => {
      const accept = b.dataset.ok === '1';
      const { error } = await App.sb.rpc('answer_dm_request', { p_channel: b.dataset.rq, p_accept: accept });
      if(error){ App.toast(error.message, true); return; }
      await loadDms(); renderSidebar();
      if(accept){ closeModal(); go({ kind: 'home', dm: b.dataset.rq }); } else if(S.dmReq.length) requestsModal(); else closeModal();
    });
  });
}
App.requestsModal = requestsModal;
// quem mandou vê um aviso no topo da conversa
const _renderMainR = renderMain;
renderMain = function(){
  _renderMainR.apply(this, arguments);
  const r = S.route; if(r.kind !== 'home' || !r.dm) return;
  const d = S.dms.find(x => x.id === r.dm);
  if(d && d.dm_status === 'pending' && d.dm_requester === S.me.id && !$('#reqBanner')){
    const body = $('#mainBody'); if(body) body.insertAdjacentHTML('afterbegin', `<div class="reqbanner" id="reqBanner">${ic('clock', 15)} Esta conversa está como <b>solicitação</b>: ${esc(prof(dmOther(d)).display_name)} vê suas mensagens quando aceitar.</div>`);
  }
};

/* ---------- privacidade ---------- */
function secPrivacy(box, back){
  const v = S.me.dm_privacy || 'servers';
  box.innerHTML = `${back}<h2>Privacidade</h2>
    <h3>Quem pode me mandar mensagem</h3>
    <div class="vlevels">${[['all','Qualquer pessoa','Quem não é amigo cai em Solicitações de mensagem.'],['servers','Quem está num servidor comigo','O padrão. Quem não é amigo cai em Solicitações.'],['friends','Só amigos','Ninguém mais consegue começar uma conversa com você.']].map(([k, l, d]) => `<button class="vl ${v === k ? 'on' : ''}" data-dmp="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    <p class="mut small">Amigos sempre conseguem te mandar mensagem. Mensagens de quem não é amigo não tocam notificação.</p>`;
  box.querySelectorAll('[data-dmp]').forEach(b => b.onclick = async () => {
    const { data, error } = await App.sb.from('profiles').update({ dm_privacy: b.dataset.dmp }).eq('id', S.me.id).select().single();
    if(error){ App.toast(error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data); renderSettings();
  });
}

/* ---------- comunidades ---------- */
const COMMUNITY_TAGS = ['Jogos','Música','Anime','Estudos','Tecnologia','Memes','Arte','Esportes','Filmes e séries','Amizade','Programação','Brasil'];
const COMMUNITY_SVG = s => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" class="commi"><circle cx="12" cy="12" r="11" fill="var(--lime)"/><path d="M8.2 11.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm7.6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4.8 16.5c.6-2.1 1.9-3.3 3.4-3.3s2.8 1.2 3.4 3.3M12.4 16.5c.6-2.1 1.9-3.3 3.4-3.3s2.8 1.2 3.4 3.3" stroke="#111" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
App.COMMUNITY_SVG = COMMUNITY_SVG;
// selo de comunidade no topo do servidor e no ícone da barra
const _renderSidebarC = renderSidebar;
renderSidebar = function(){
  _renderSidebarC.apply(this, arguments);
  const s = S.route.kind === 'server' ? curServer() : null;
  const t = s && s.is_public && $('#sbHead .hero-t b');
  if(t && !t.querySelector('.commi')) t.insertAdjacentHTML('beforeend', ` <span data-tip="Servidor da comunidade" data-tipsub="aparece em Explorar">${COMMUNITY_SVG(15)}</span>`);
};
const _renderRailC = renderRail;
renderRail = function(){
  _renderRailC.apply(this, arguments);
  S.servers.filter(s => s.is_public).forEach(s => { const el = document.querySelector(`#rail [data-sid="${s.id}"]`); if(el && !el.querySelector('.railcomm')) el.insertAdjacentHTML('beforeend', `<span class="railcomm">${COMMUNITY_SVG(14)}</span>`); });
  const add = $('#rAdd');
  if(add && !$('#rExplore')){
    add.insertAdjacentHTML('afterend', `<button class="ricon add" id="rExplore" data-tip="Explorar comunidades" data-tipside="r">${ic('globe', 22)}</button>`);
    $('#rExplore').onclick = openExplore;
  }
  const home = $('#rHome');
  if(home && !$('#rBell')){
    home.insertAdjacentHTML('afterend', `<button class="ricon" id="rBell" data-tip="Novidades do Telão" data-tipside="r">${ic('bell', 21)}<span class="badge dotb hidden" id="rBellDot"></span></button>`);
    $('#rBell').onclick = noticesPanel;
    updateBellDot();
  }
};
async function openExplore(){
  let q = '', tag = null;
  const el = document.createElement('div'); el.className = 'explore'; el.id = 'explore';
  el.innerHTML = `<div class="exbox"><div class="exhead"><div><h1>Explorar comunidades</h1><p>Servidores abertos para qualquer pessoa do Telão entrar.</p></div><button class="ibtn" id="exX" data-tip="Fechar">${ic('x', 20)}</button></div>
    <div class="exsearch">${ic('search', 18)}<input id="exQ" placeholder="Procurar comunidade" autocomplete="off"></div>
    <div class="chips" id="exTags"><button data-tag="" class="on">Todas</button>${COMMUNITY_TAGS.map(t => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <div class="exgrid" id="exGrid"><div class="spin" style="margin:40px auto"></div></div></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#exX').onclick = close; el.onclick = e => { if(e.target === el) close(); };
  document.addEventListener('keydown', function esc_(e){ if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc_); } });
  const load = async () => {
    const { data, error } = await App.sb.rpc('discover_servers', { p_q: q || null, p_tag: tag });
    const g = el.querySelector('#exGrid'); if(!g) return;
    if(error){ g.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
    g.innerHTML = (data || []).map(s => `<div class="excard" style="--sc:${esc(s.accent || s.icon_color || '#2a2b34')}">
      <div class="exban" ${s.banner_url ? `style="background-image:url('${esc(s.banner_url)}')"` : ''}></div>
      <div class="exic">${s.icon_url ? `<img src="${esc(s.icon_url)}" alt="">` : `<span>${esc(initials({ display_name: s.name }))}</span>`}</div>
      <div class="exb"><b>${esc(s.name)} ${COMMUNITY_SVG(14)}${s.nsfw ? '<span class="tag18">+18</span>' : ''}</b>
        <p>${esc(s.description || 'Sem descrição.')}</p>
        <div class="exmeta"><span>${ic('users', 13)} ${s.members} ${s.members == 1 ? 'membro' : 'membros'}</span>${s.boosts ? `<span>${BOOST_SVG(12)} ${s.boosts}</span>` : ''}${(s.topic_tags || []).slice(0, 3).map(t => `<span class="extag">${esc(t)}</span>`).join('')}</div>
        <button class="btn sm ${s.is_member ? 'sec' : ''}" data-exjoin="${s.id}" data-mem="${s.is_member ? 1 : 0}">${s.is_member ? 'Abrir' : 'Entrar'}</button></div></div>`).join('') || '<div class="empty">Nenhuma comunidade encontrada. Que tal abrir a sua? Configurações do servidor → Comunidade.</div>';
    g.querySelectorAll('[data-exjoin]').forEach(b => b.onclick = async () => {
      const sid = b.dataset.exjoin;
      if(b.dataset.mem !== '1'){
        const r = await App.joinWithRules('join_public_server', { p_server: sid });
        if(r.cancelled) return;
        if(r.error){ App.toast(r.error.message, true); return; }
        await loadServers(); App.toast('Você entrou na comunidade.');
      }
      close(); go({ kind: 'server', sid });
    });
  };
  let tm; el.querySelector('#exQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  el.querySelectorAll('#exTags [data-tag]').forEach(b => b.onclick = () => { tag = b.dataset.tag || null; el.querySelectorAll('#exTags [data-tag]').forEach(x => x.classList.toggle('on', x === b)); load(); });
  load();
}
App.openExplore = openExplore;

function secSrvCommunity(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 2), tags = new Set(s.topic_tags || []);
  box.innerHTML = `${back}<h2>Comunidade ${COMMUNITY_SVG(20)}</h2>
    <p class="mut">Abra o servidor para a comunidade e ele aparece em <b>Explorar comunidades</b>. Qualquer pessoa do Telão pode entrar sem convite, e o servidor ganha o selo de comunidade ao lado do nome.</p>
    ${row('Servidor da comunidade', 'Banidos continuam sem conseguir entrar.', toggle('cmOn', s.is_public))}
    <label class="field"><span>Descrição que aparece em Explorar</span><textarea class="inp" id="cmD" rows="3" maxlength="300" placeholder="Do que é o servidor, quem pode entrar…">${esc(s.description || '')}</textarea></label>
    <div class="field"><span>Assuntos (até 3)</span><div class="chips" id="cmT">${COMMUNITY_TAGS.map(t => `<button data-t="${esc(t)}" class="${tags.has(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
    <p class="mut small">Dica: antes de abrir, configure o nível de verificação e o modo lento em Segurança e nas regras dos canais.</p>
    <button class="btn" id="cmSave" ${can ? '' : 'disabled'}>Salvar</button>`;
  box.querySelectorAll('#cmT [data-t]').forEach(b => b.onclick = () => {
    if(tags.has(b.dataset.t)) tags.delete(b.dataset.t); else { if(tags.size >= 3) return App.toast('Escolha até 3 assuntos.', true); tags.add(b.dataset.t); }
    b.classList.toggle('on', tags.has(b.dataset.t));
  });
  box.querySelector('#cmSave').onclick = async () => {
    const { error } = await App.sb.from('servers').update({ is_public: box.querySelector('#cmOn').checked, description: box.querySelector('#cmD').value.trim() || null, topic_tags: [...tags] }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; renderSettings(); renderSidebar(); renderRail(); App.toast('Salvo.');
  };
}

/* ---------- tag do servidor ---------- */
const TAG_BADGES = ['🔥','⚡','💎','🎮','🌙','⭐','🍀','👑','💀','🎧','🚀','❤️','🐺','🦊','🌸','☠️','🎯','🧃'];
const tagChip = t => t && t.tag ? `<span class="gtag" data-tip="Tag de ${esc(t.name || 'servidor')}">${t.badge ? `<i>${esc(t.badge)}</i>` : ''}${esc(t.tag)}</span>` : '';
App.tagChip = tagChip;
const _nameHtmlT = nameHtml;
nameHtml = function(p){ return _nameHtmlT(p) + (p && p.guild_tag ? tagChip(p.guild_tag) : ''); };
function secSrvTag(box, back){
  const s = SET.server, lv = serverLevel(s.id), can = App.hasPerm(s.id, 2) && lv >= 2;
  let badge = s.tag_badge || TAG_BADGES[0];
  const using = S.me.guild_tag && S.me.guild_tag.sid === s.id;
  box.innerHTML = `${back}<h2>Tag do servidor</h2>
    <p class="mut">Uma etiqueta curta que os membros podem mostrar ao lado do nome, em todo o Telão. Libera no <b>nível 2</b> de impulsos.${lv < 2 ? ` Este servidor está no nível ${lv}.` : ''}</p>
    <div class="tagprev"><b>${esc(S.me.display_name)}</b> <span id="tgPrev">${tagChip({ tag: s.tag || 'TAG', badge, name: s.name })}</span></div>
    <div class="grid2" style="display:grid;grid-template-columns:1fr 2fr;gap:12px">
      <label class="field"><span>Tag (2 a 4 letras)</span><input class="inp" id="tgT" maxlength="4" value="${esc(s.tag || '')}" placeholder="GAL" ${can ? '' : 'disabled'} style="text-transform:uppercase"></label>
      <div class="field"><span>Símbolo</span><div class="tagbadges">${TAG_BADGES.map(b => `<button data-b="${b}" class="${b === badge ? 'on' : ''}" ${can ? '' : 'disabled'}>${b}</button>`).join('')}</div></div>
    </div>
    ${can ? `<button class="btn" id="tgSave">Salvar tag</button> ${s.tag ? '<button class="btn sec" id="tgDel">Remover tag</button>' : ''}` : ''}
    <hr class="sdiv"><h3>Usar no meu perfil</h3>
    ${s.tag && lv >= 2 ? `<p class="mut small">${using ? 'Você está mostrando esta tag.' : 'Mostre a tag deste servidor ao lado do seu nome.'}</p><button class="btn ${using ? 'sec' : ''}" id="tgUse">${using ? 'Parar de usar' : 'Usar esta tag'}</button>` : '<p class="mut small">O servidor ainda não tem tag.</p>'}`;
  const $b = q => box.querySelector(q);
  const prev = () => { $b('#tgPrev').innerHTML = tagChip({ tag: ($b('#tgT').value.trim().toUpperCase() || 'TAG'), badge, name: s.name }); };
  box.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { badge = b.dataset.b; box.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  $b('#tgT').oninput = prev;
  const sv = $b('#tgSave'); if(sv) sv.onclick = async () => {
    const t = $b('#tgT').value.trim().toUpperCase();
    if(!/^[A-Z0-9]{2,4}$/.test(t)){ App.toast('Use de 2 a 4 letras ou números.', true); return; }
    const { error } = await App.sb.from('servers').update({ tag: t, tag_badge: badge }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; await refreshMe(); renderSettings(); App.toast('Tag salva.');
  };
  const dl = $b('#tgDel'); if(dl) dl.onclick = async () => { await App.sb.from('servers').update({ tag: null, tag_badge: null }).eq('id', s.id); await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; await refreshMe(); renderSettings(); };
  const us = $b('#tgUse'); if(us) us.onclick = async () => {
    const { error } = await App.sb.rpc('use_server_tag', { p_server: using ? null : s.id });
    if(error){ App.toast(error.message, true); return; }
    await refreshMe(); renderAll(); renderSettings();
  };
}

/* ---------- avisos do Telão (novidades e anúncios) ---------- */
S.notices = [];
async function loadNotices(){
  const { data } = await App.sb.from('app_notices').select('*').order('created_at', { ascending: false }).limit(30);
  S.notices = data || []; updateBellDot();
}
function unreadNotices(){ const r = S.me && S.me.notices_read_at ? new Date(S.me.notices_read_at) : new Date(0); return S.notices.filter(n => new Date(n.created_at) > r).length; }
function updateBellDot(){ const d = $('#rBellDot'); if(d) d.classList.toggle('hidden', !unreadNotices()); }
const NOTICE_KIND = { update: ['Atualização', 'refresh'], announce: ['Anúncio', 'bell'], event: ['Evento', 'calendar'] };
async function noticesPanel(){
  const unread = new Date(S.me.notices_read_at || 0);
  modal(`<div class="mh"><h2>Novidades do Telão</h2><p>Atualizações e anúncios do time do Telão.</p></div>
    <div class="mc"><div class="nlist">${S.notices.map(n => `<div class="nitem ${new Date(n.created_at) > unread ? 'new' : ''}">
      <div class="nk">${ic(NOTICE_KIND[n.kind][1], 14)} ${NOTICE_KIND[n.kind][0]}${n.version ? ' ' + esc(n.version) : ''}<span>${new Date(n.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}</span></div>
      <b>${esc(n.title)}</b>${n.body ? `<div class="nb">${richText(n.body)}</div>` : ''}${n.link ? `<a class="btn sec sm" href="${esc(n.link)}" target="_blank" rel="noopener">Saiba mais</a>` : ''}</div>`).join('') || '<div class="empty">Nada por aqui ainda.</div>'}</div></div>
    <div class="mf">${S.me.is_admin ? `<button class="btn sec" id="nNew">${ic('plus', 15)} Publicar aviso</button>` : ''}<span class="grow"></span><button class="btn" data-close>Fechar</button></div>`, m => {
    const n = m.querySelector('#nNew'); if(n) n.onclick = noticeForm;
  });
  const { data } = await App.sb.from('profiles').update({ notices_read_at: new Date().toISOString() }).eq('id', S.me.id).select().single();
  if(data){ S.me = data; S.profiles.set(data.id, data); } updateBellDot();
}
function noticeForm(){
  modal(`<form id="nF"><div class="mh"><h2>Aviso para todo o Telão</h2><p>Escolha onde ele aparece: em Novidades, na DM da conta oficial, ou nos dois.</p></div>
    <div class="mc"><label class="field"><span>Tipo</span><select class="inp" id="nK"><option value="announce">Anúncio</option><option value="update">Atualização (o que mudou)</option><option value="event">Evento</option></select></label>
      <label class="field"><span>Título</span><input class="inp" id="nT" maxlength="120" required placeholder="Chegou a versão 6.5"></label>
      <label class="field"><span>Texto</span><textarea class="inp" id="nB" rows="6" maxlength="4000" placeholder="- Solicitações de mensagem&#10;- Comunidades&#10;- Emojis de servidor"></textarea></label>
      <label class="field"><span>Link (opcional)</span><input class="inp" id="nL" placeholder="https://"></label>
      ${row('Publicar em Novidades', 'Fica no sininho para todas as contas, inclusive quem entrar depois.', toggle('nPub', true))}
      ${row('Mandar na DM da conta oficial', 'Chega como mensagem da conta Telão para todo mundo (com notificação).', toggle('nDm', true))}
      ${row('Mostrar agora na tela de quem está online', '', toggle('nNow', true))}<div class="err" id="nE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Publicar</button></div></form>`, m => {
    m.querySelector('#nF').onsubmit = async e => {
      e.preventDefault();
      const row_ = { kind: m.querySelector('#nK').value, title: m.querySelector('#nT').value.trim(), body: m.querySelector('#nB').value.trim() || null, link: m.querySelector('#nL').value.trim() || null, version: m.querySelector('#nK').value === 'update' ? APP_VERSION : null };
      const now = m.querySelector('#nNow').checked, pub = m.querySelector('#nPub').checked, dm = m.querySelector('#nDm').checked;
      if(!pub && !dm){ m.querySelector('#nE').textContent = 'Escolha pelo menos um lugar para publicar.'; return; }
      const btn = m.querySelector('#nF button:not([type])'); if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
      if(pub){ const { error } = await App.sb.from('app_notices').insert(row_); if(error){ m.querySelector('#nE').textContent = error.message; if(btn){ btn.disabled = false; btn.textContent = 'Publicar'; } return; } }
      let sent = 0;
      if(dm){ const { data, error } = await App.sb.rpc('admin_broadcast', { p_title: row_.title, p_body: row_.body, p_link: row_.link }); if(error){ m.querySelector('#nE').textContent = error.message; if(btn){ btn.disabled = false; btn.textContent = 'Publicar'; } return; } sent = data || 0; }
      closeModal(); App.toast(dm ? `Aviso enviado na DM de ${sent} pessoa${sent === 1 ? '' : 's'}.` : 'Publicado para todo mundo.');
      if(now && App.sendAviso) App.sendAviso(row_.title, false);
      loadNotices();
    };
  });
}
App.noticesPanel = noticesPanel;

/* ---------- emojis do servidor ---------- */
S.cemoji = new Map();   // id -> linha
const CE_RE = /&lt;(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})&gt;/g;
async function loadServerEmojis(){
  const ids = S.servers.map(s => s.id); if(!ids.length) return;
  const { data } = await App.sb.from('server_emojis').select('*').in('server_id', ids).order('name');
  (data || []).forEach(e => S.cemoji.set(e.id, e));
}
const ceImg = (id, name, big) => { const e = S.cemoji.get(id); return `<img class="cemoji ${big ? 'big' : ''}" ${e ? `src="${esc(e.url)}"` : `data-ceid="${id}"`} alt=":${esc(name)}:" data-tip=":${esc(name)}:" loading="lazy" draggable="false">`; };
App.ceHtml = h => String(h).replace(CE_RE, (m, a, n, id) => ceImg(id, n));
const _richText = richText;
const RAW_CE = /<(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})>/g;
richText = function(t){
  if(!t || !String(t).includes('<')) return _richText(t);
  const toks = [], only = /^(\s*<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>\s*){1,6}$/.test(t);
  const h = _richText(String(t).replace(RAW_CE, (m, a, n, id) => { toks.push([n, id]); return '\u0002' + (toks.length - 1) + '\u0002'; }));
  return h.replace(/\u0002(\d+)\u0002/g, (m, i) => ceImg(toks[+i][1], toks[+i][0], only));
};
const _reactsHtml = reactsHtml;
// só o emoji visível vira imagem; dentro dos atributos (data-rx, dica) o código fica como texto, senão o botão quebra
reactsHtml = function(mid){
  return _reactsHtml(mid).replace(/(<span>)([^<]*)(<\/span>)|data-tipsub="([^"]*)"/g, (m, a, t, b, sub) =>
    a ? a + t.replace(CE_RE, (x, an, n, id) => ceImg(id, n)) + b : `data-tipsub="${sub.replace(CE_RE, (x, an, n) => ':' + n + ':')}"`);
};
// emoji de servidor que ainda não está no cache (ex.: Telão+ usando de outro servidor)
const ceWait = new Set();
new MutationObserver(() => {
  const miss = [...document.querySelectorAll('img.cemoji[data-ceid]')].map(i => i.dataset.ceid).filter(id => !ceWait.has(id));
  if(!miss.length) return;
  miss.forEach(id => ceWait.add(id));
  App.sb.from('server_emojis').select('*').in('id', [...new Set(miss)]).then(({ data }) => {
    (data || []).forEach(e => S.cemoji.set(e.id, e));
    document.querySelectorAll('img.cemoji[data-ceid]').forEach(i => { const e = S.cemoji.get(i.dataset.ceid); if(e){ i.src = e.url; i.removeAttribute('data-ceid'); } else i.replaceWith(document.createTextNode(i.alt)); });
  });
}).observe(document.body, { childList: true, subtree: true });
// recentes guardam só emojis comuns
const _pushRecent = pushRecent;
pushRecent = function(e){ if(!String(e).startsWith('<')) _pushRecent(e); };
// o seletor ganha os emojis dos servidores
const _emojiPicker = emojiPicker;
emojiPicker = function(x, y, onPick, keepOpen){
  _emojiPicker(x, y, onPick, keepOpen);
  const grid = document.querySelector('#menu #epGrid'); if(!grid) return;
  const cur = S.route.kind === 'server' ? S.route.sid : null, plus = hasPlus(S.me);
  const groups = S.servers.map(s => ({ s, list: [...S.cemoji.values()].filter(e => e.server_id === s.id) })).filter(g => g.list.length)
    .sort((a, b) => (b.s.id === cur) - (a.s.id === cur));
  if(!groups.length) return;
  const html = groups.map(g => {
    const usable = plus || g.s.id === cur;
    return `<div class="epcat">${esc(g.s.name)}${usable ? '' : ' <span class="plustag">TELÃO+</span>'}</div><div class="eps ceps">${g.list.map(e => usable
      ? `<button data-e="&lt;${e.animated ? 'a' : ''}:${e.name}:${e.id}&gt;" data-n="${esc(e.name)}"><img src="${esc(e.url)}" alt=":${esc(e.name)}:"></button>`
      : `<button class="celock" data-celock="1" title="Usar fora do servidor é do Telão+"><img src="${esc(e.url)}" alt=":${esc(e.name)}:"></button>`).join('')}</div>`;
  }).join('');
  grid.insertAdjacentHTML('afterbegin', html);
  grid.addEventListener('click', e => { if(e.target.closest('[data-celock]')){ e.stopImmediatePropagation(); upsell('Usar emojis de qualquer servidor'); } }, true);
  grid.addEventListener('mouseover', e => { const b = e.target.closest('.ceps [data-e]'); if(b){ e.stopImmediatePropagation(); document.querySelector('#epFoot').innerHTML = `${b.innerHTML.replace('<img', '<img style="width:24px;height:24px;vertical-align:middle"')} :${esc(b.dataset.n)}:`; } }, true);
};
// :nome: digitado vira o emoji do servidor ao enviar
document.addEventListener('submit', e => {
  if(e.target.id !== 'cmpF') return;
  const ta = $('#cmp'); if(!ta || !ta.value.includes(':')) return;
  const cur = S.route.kind === 'server' ? S.route.sid : null, plus = hasPlus(S.me);
  ta.value = ta.value.replace(/(^|[^<a-z0-9_]):([a-z0-9_]{2,32}):(?![0-9a-f-]{36}>)/g, (m, pre, n) => {
    if(EMOJI.BY[n]) return m;
    const e = [...S.cemoji.values()].find(x => x.name === n && (x.server_id === cur || plus));
    return e ? `${pre}<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : m;
  });
}, true);

function secSrvEmojis(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 512) || App.hasPerm(s.id, 2), lv = serverLevel(s.id), lim = 50 + 25 * lv;
  const list = [...S.cemoji.values()].filter(e => e.server_id === s.id);
  const st = list.filter(e => !e.animated), an = list.filter(e => e.animated);
  box.innerHTML = `${back}<h2>Emojis</h2>
    <p class="mut">Todo mundo no servidor pode usar estes emojis aqui dentro. Com o Telão+ dá para usar em qualquer servidor e nas DMs (desde que a pessoa esteja neste servidor).</p>
    <div class="emlim"><span>Estáticos <b>${st.length}/${lim}</b></span><span>Animados <b>${an.length}/${lim}</b></span>${lv < 3 ? `<span class="mut small">+25 vagas por nível de impulso</span>` : ''}</div>
    ${can ? `<div class="emup"><button class="btn" id="emUp">${ic('plus', 16)} Enviar emoji</button><input type="file" id="emF" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <small class="mut">PNG, JPG, WEBP ou GIF animado. Quadrado fica melhor. Até 512 KB (GIF até 1 MB).</small></div>` : ''}
    <div class="emlist">${list.map(e => `<div class="emrow"><img src="${esc(e.url)}" alt=""><code>:${esc(e.name)}:</code>${e.animated ? '<span class="extag">animado</span>' : ''}<small class="mut">por ${esc(prof(e.created_by).display_name)}</small><span class="grow"></span>
      ${can ? `<button class="ibtn sm" data-emren="${e.id}" data-tip="Renomear">${ic('edit', 15)}</button><button class="ibtn sm" data-emdel="${e.id}" data-tip="Apagar">${ic('trash', 15)}</button>` : ''}</div>`).join('') || '<div class="empty">Nenhum emoji ainda.</div>'}</div>`;
  const $b = q => box.querySelector(q);
  if(!can) return;
  $b('#emUp').onclick = () => $b('#emF').click();
  $b('#emF').onchange = async ev => {
    for(const f of ev.target.files){
      try{
        const gif = f.type === 'image/gif';
        if(f.size > (gif ? 1048576 : 524288)){ App.toast(`${f.name}: arquivo grande demais.`, true); continue; }
        let blob = f, type = f.type;
        if(!gif){
          const bmp = await createImageBitmap(f), c = document.createElement('canvas'), sz = 128; c.width = sz; c.height = sz;
          const sc = Math.min(sz / bmp.width, sz / bmp.height), w = bmp.width * sc, h = bmp.height * sc;
          c.getContext('2d').drawImage(bmp, (sz - w) / 2, (sz - h) / 2, w, h);
          blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.92)); type = 'image/webp';
        }
        const name = (f.name.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'emoji').slice(0, 32).padEnd(2, '_');
        const path = `${S.me.id}/emoji-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${type.split('/')[1]}`;
        const { error: ue } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if(ue) throw ue;
        const url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
        let nm = name, i = 2; while([...S.cemoji.values()].some(e => e.server_id === s.id && e.name === nm)) nm = (name.slice(0, 29) + '_' + i++);
        const { data, error } = await App.sb.from('server_emojis').insert({ server_id: s.id, name: nm, url, animated: gif }).select().single();
        if(error) throw error;
        S.cemoji.set(data.id, data);
      }catch(err){ App.toast(`${f.name}: ${err.message}`, true); }
    }
    renderSettings();
  };
  box.querySelectorAll('[data-emdel]').forEach(b => b.onclick = async () => {
    if(!(await confirmBox('Apagar emoji', 'Mensagens antigas com ele vão mostrar só o nome.', 'Apagar'))) return;
    const { error } = await App.sb.from('server_emojis').delete().eq('id', b.dataset.emdel);
    if(error){ App.toast(error.message, true); return; }
    S.cemoji.delete(b.dataset.emdel); renderSettings();
  });
  box.querySelectorAll('[data-emren]').forEach(b => b.onclick = async () => {
    const e = S.cemoji.get(b.dataset.emren);
    const nv = (prompt('Novo nome (letras minúsculas, números e _):', e.name) || '').trim().toLowerCase();
    if(!nv || nv === e.name) return;
    if(!/^[a-z0-9_]{2,32}$/.test(nv)){ App.toast('Use de 2 a 32 letras minúsculas, números ou _.', true); return; }
    const { data, error } = await App.sb.from('server_emojis').update({ name: nv }).eq('id', e.id).select().single();
    if(error){ App.toast(/duplicate|unique/i.test(error.message) ? 'Já existe um emoji com esse nome.' : error.message, true); return; }
    S.cemoji.set(data.id, data); renderSettings();
  });
}

/* ---------- inicialização ---------- */
const _loadServersS = loadServers;
loadServers = async function(){
  await _loadServersS.apply(this, arguments);
  loadServerEmojis().catch(() => {});
  if(!S._v65){ S._v65 = true;
    loadNotices().catch(() => {});
    App.sb.channel('notices-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_notices' }, p => {
      S.notices.unshift(p.new); updateBellDot();
      App.toast(`${NOTICE_KIND[p.new.kind][0]}: ${p.new.title}`, false, { label: 'Ver', fn: noticesPanel });
    }).on('postgres_changes', { event: '*', schema: 'public', table: 'server_emojis' }, p => {
      if(p.eventType === 'DELETE') S.cemoji.delete(p.old.id); else S.cemoji.set(p.new.id, p.new);
    }).subscribe();
  }
};
App.openDM = openDM;
