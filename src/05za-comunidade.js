/* =====================================================================
   v6.15: COMUNIDADE
   - Regras para entrar (servidor da comunidade): quem é novo lê e aceita ou cancela
   - Clipes da semana (votação com 🔥, ranking, assistir todos juntos na call)
   - Mural do servidor (mensagens com ⭐)
   - Conquistas no perfil
   - Aniversários (selo 🎂 por 24 h, aviso no servidor e parabéns da conta oficial)
   - Retrospectiva do ano
   - Jogo aberto no PC vira "Jogando…" sozinho (app do Windows 1.1)
   ===================================================================== */
const sqlMiss = e => /could not find the function|PGRST202|does not exist|schema cache/i.test((e && (e.message || e.code)) || '');
const needSql = 'Falta rodar o supabase.sql novo no Supabase para isso funcionar.';
const mdLite = t => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function modalClosed(cb){
  const obs = new MutationObserver(() => { if($('#modal').classList.contains('hidden')){ obs.disconnect(); cb(); } });
  obs.observe($('#modal'), { attributes: true, attributeFilter: ['class'] });
}

/* ================= REGRAS PARA ENTRAR ================= */
function rulesModal(pv){
  return new Promise(res => {
    let done = false; const fin = v => { if(done) return; done = true; res(v); };
    const icon = pv.icon_url ? `<img src="${esc(pv.icon_url)}" alt="">` : `<span>${esc(serverInitials(pv.name || 'S'))}</span>`;
    modal(`<div class="mh rulesh"><div class="rulesic" style="--sc:${esc(pv.icon_color || '#5865f2')}">${icon}</div><h2>Antes de entrar em ${esc(pv.name || 'servidor')}</h2>
        <p>Leia as regras da comunidade. Para entrar, você precisa aceitar.</p></div>
      <div class="mc"><div class="rulesbox">${mdLite(pv.rules_text || 'Respeite todo mundo.')}</div>
        <label class="rulesok"><input type="checkbox" id="ruOk"> <span>Li e concordo com as regras de <b>${esc(pv.name || 'servidor')}</b></span></label></div>
      <div class="mf"><button class="btn sec" id="ruNo">Cancelar</button><button class="btn" id="ruGo" disabled>Aceitar e entrar</button></div>`, m => {
      const ok = m.querySelector('#ruOk'), go_ = m.querySelector('#ruGo');
      ok.onchange = () => go_.disabled = !ok.checked;
      m.querySelector('#ruNo').onclick = () => { fin(false); closeModal(); };
      go_.onclick = () => { fin(true); closeModal(); };
      modalClosed(() => { $('#modal').classList.remove('ontop'); fin(false); });
    });
    $('#modal').classList.add('ontop');   // fica por cima do Explorar
  });
}
App.joinWithRules = async (fn, args) => {
  let r = await App.sb.rpc(fn, args);
  if(r.error && /RULES_REQUIRED/.test(r.error.message || '')){
    const pv = await App.sb.rpc('server_rules_preview', fn === 'join_server' ? { p_code: args.p_code } : { p_server: args.p_server });
    const ok = await rulesModal(pv.data || {});
    if(!ok){ App.toast('Você não entrou no servidor.'); return { cancelled: true }; }
    r = await App.sb.rpc(fn, { ...args, p_accept: true });
  }
  return r;
};
function rulesView(s){
  modal(`<div class="mh"><h2>${ic('book', 20)} Regras de ${esc(s.name)}</h2></div><div class="mc"><div class="rulesbox">${mdLite(s.rules_text)}</div></div>
    <div class="mf"><button class="btn" data-close>Fechar</button></div>`);
}
/* configurações: seção Comunidade ganha "Regras para entrar" */
const _secSrvCommunityR = secSrvCommunity;
secSrvCommunity = function(box, back){
  _secSrvCommunityR.apply(this, arguments);
  const s = SET.server, can = App.hasPerm(s.id, 2);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>${ic('book', 18)} Regras para entrar</h3>
    <p class="mut small">Quem for entrar no servidor (pelo Explorar ou por convite) lê as regras e precisa aceitar. Se cancelar, não entra. Quem já é membro não precisa aceitar de novo.</p>
    ${row('Pedir para aceitar as regras', '', toggle('ruOn', !!s.rules_on))}
    <label class="field"><span>Regras</span><textarea class="inp" id="ruT" rows="7" maxlength="4000" placeholder="1. Respeite todo mundo&#10;2. Sem spam nem divulgação&#10;3. Conteúdo +18 só nos canais marcados&#10;4. Siga o que a moderação pedir">${esc(s.rules_text || '')}</textarea></label>
    <div class="bkacts"><button class="btn" id="ruSave" ${can ? '' : 'disabled'}>Salvar regras</button><button class="btn sec" id="ruPrev">Ver como fica</button></div>`);
  box.querySelector('#ruPrev').onclick = () => rulesModal({ name: s.name, icon_url: s.icon_url, icon_color: s.icon_color, rules_text: box.querySelector('#ruT').value.trim() });
  box.querySelector('#ruSave').onclick = async () => {
    const on = box.querySelector('#ruOn').checked, txt = box.querySelector('#ruT').value.trim();
    if(on && !txt){ App.toast('Escreva as regras antes de ligar.', true); return; }
    const { error } = await App.sb.from('servers').update({ rules_on: on, rules_text: txt || null }).eq('id', s.id);
    if(error){ App.toast(/rules_/.test(error.message) ? needSql : error.message, true); return; }
    await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; App.toast(on ? 'Regras salvas. Quem entrar agora precisa aceitar.' : 'Regras salvas.');
  };
};

/* ================= CLIPES DA SEMANA ================= */
const isClipAtt = a => a && (a.clip || /^video\//.test(a.type || ''));
async function topClips(s, week){
  const { data, error } = await App.sb.rpc('server_top_clips', { p_server: s.id, p_week: week });
  if(error) throw error;
  await ensureProfiles((data || []).map(x => x.author_id));
  return data || [];
}
function clipsModal(s){
  let week = 0, list = [];
  const draw = async m => {
    const box = m.querySelector('#cwL'); box.innerHTML = '<div class="spin" style="margin:30px auto"></div>';
    try{ list = await topClips(s, week); }catch(e){ box.innerHTML = `<p class="mut">${esc(sqlMiss(e) ? needSql : e.message)}</p>`; return; }
    m.querySelectorAll('#cwTabs [data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === week));
    m.querySelector('#cwAll').disabled = !list.length;
    box.innerHTML = list.length ? list.map((c, i) => {
      const a = (c.attachments || []).find(isClipAtt), p = prof(c.author_id), ch = findChannel(c.channel_id);
      const crown = i === 0 && c.votes > 0 ? (week === 0 ? '<span class="cwbadge">👑 Liderando</span>' : '<span class="cwbadge win">🏆 Clipe da semana</span>') : '';
      return `<div class="cwitem ${i === 0 && c.votes > 0 ? 'top' : ''}"><div class="cwrank">${i + 1}</div>
        <div class="cwvid"><video src="${esc(a.url)}${a.start > 0 ? '#t=' + (+a.start).toFixed(1) : ''}" preload="metadata" controls playsinline></video></div>
        <div class="cwinfo">${crown}<div class="cwwho">${avatar(p, 'sm')}<b>${esc(p.display_name)}</b></div>
          ${c.content ? `<p>${esc(c.content.slice(0, 140))}</p>` : ''}<small class="mut">${ch ? '#' + esc(ch.name) + ' · ' : ''}${new Date(c.created_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
          <div class="cwacts"><button class="btn sm ${c.mine ? '' : 'sec'}" data-cwv="${c.message_id}">🔥 ${c.votes}</button><button class="btn sec sm" data-cwgo="${c.message_id}">Ver no chat</button></div></div></div>`;
    }).join('') : `<div class="empty">${week === 0 ? 'Nenhum clipe esta semana ainda. Na call, aperte <b>Alt+C</b> para clipar os últimos 30 segundos e mande aqui no servidor.' : 'Nenhum clipe nessa semana.'}</div>`;
    box.querySelectorAll('[data-cwv]').forEach(b => b.onclick = async () => {
      const c = list.find(x => x.message_id === b.dataset.cwv); if(!c) return;
      b.disabled = true;
      const { error } = c.mine ? await App.sb.from('message_reactions').delete().eq('message_id', c.message_id).eq('user_id', S.me.id).eq('emoji', '🔥')
        : await App.sb.from('message_reactions').insert({ message_id: c.message_id, emoji: '🔥' });
      if(error && !/duplicate/i.test(error.message)) App.toast(error.message, true);
      draw(m);
    });
    box.querySelectorAll('[data-cwgo]').forEach(b => b.onclick = () => { const c = list.find(x => x.message_id === b.dataset.cwgo); closeModal(); go({ kind: 'server', sid: s.id, cid: c.channel_id }).then(() => setTimeout(() => jumpTo(c.message_id), 400)); });
  };
  modal(`<div class="mh"><h2>🎬 Clipes da semana</h2><p>Os clipes mais curtidos de ${esc(s.name)}. Vote com 🔥. O mais votado de cada semana vira o <b>Clipe da semana</b>.</p></div>
    <div class="mc"><div class="tabs2" id="cwTabs"><button data-w="0" class="on">Esta semana</button><button data-w="1">Semana passada</button><button data-w="2">Há 2 semanas</button></div>
      <div class="cwlist" id="cwL"></div></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button><button class="btn" id="cwAll">${ic('tv', 16)} Assistir todos juntos na call</button></div>`, m => {
    m.querySelector('.mbox').classList.add('wide');
    m.querySelectorAll('#cwTabs [data-w]').forEach(b => b.onclick = () => { week = +b.dataset.w; draw(m); });
    m.querySelector('#cwAll').onclick = () => {
      if(!Voice.channel){ App.toast('Entre numa chamada para assistir com a galera.', true); return; }
      const items = list.slice(0, 10).map((c, i) => { const a = (c.attachments || []).find(isClipAtt); return { kind: 'file', url: a.url, start: +a.start || 0, title: `#${i + 1} · clipe de ${prof(c.author_id).display_name} (🔥 ${c.votes})`, by: c.author_id }; });
      if(App.wtPlayList(items)){ closeModal(); App.toast('Começou a sessão de clipes da semana.'); }
    };
    draw(m);
  });
}
App.clipsModal = clipsModal;

/* ================= MURAL ================= */
async function wallOpen(s){
  const el = document.createElement('div'); el.className = 'explore wall'; el.id = 'wallBox';
  el.innerHTML = `<div class="exbox"><div class="exhead"><div><h1>⭐ Mural de ${esc(s.name)}</h1><p>Os melhores prints, memes, clipes e frases. Para colocar uma mensagem aqui, abra o menu dela e escolha <b>Pôr no mural</b>.</p></div><button class="ibtn" id="wlX" data-tip="Fechar">${ic('x', 20)}</button></div>
    <div class="wallgrid" id="wlG"><div class="spin" style="margin:40px auto"></div></div><div style="text-align:center;padding:10px"><button class="btn sec hidden" id="wlMore">Ver mais</button></div></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#wlX').onclick = close; el.onclick = e => { if(e.target === el) close(); };
  const kd = e => { if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', kd); } }; document.addEventListener('keydown', kd);
  let last = null; const g = el.querySelector('#wlG');
  const load = async more => {
    const { data, error } = await App.sb.rpc('server_wall', { p_server: s.id, p_before: more ? last : null });
    if(error){ g.innerHTML = `<div class="empty">${esc(sqlMiss(error) ? needSql : error.message)}</div>`; return; }
    const rows = data || []; await ensureProfiles(rows.map(r => r.author_id));
    if(!more) g.innerHTML = '';
    if(!rows.length && !more){ g.innerHTML = '<div class="empty">O mural ainda está vazio. Abra o menu de uma mensagem (clique com o botão direito ou segure no celular) e escolha <b>⭐ Pôr no mural</b>.</div>'; return; }
    rows.forEach(r => {
      const p = prof(r.author_id), ch = findChannel(r.channel_id), atts = Array.isArray(r.attachments) ? r.attachments : [];
      const img = atts.find(a => /^image\//.test(a.type || '')), vid = atts.find(a => /^video\//.test(a.type || ''));
      g.insertAdjacentHTML('beforeend', `<div class="wcardm ${img || vid ? 'media' : 'quote'}">
        ${img ? `<img src="${esc(img.url)}" alt="" loading="lazy">` : vid ? `<video src="${esc(vid.url)}${vid.start > 0 ? '#t=' + (+vid.start).toFixed(1) : ''}" controls preload="metadata" playsinline></video>` : ''}
        ${r.content ? `<div class="wtxt">${richText(r.content.slice(0, 600))}</div>` : ''}
        <div class="wfoot">${avatar(p, 'sm')}<span><b>${esc(p.display_name)}</b><small>${ch ? '#' + esc(ch.name) + ' · ' : ''}${new Date(r.created_at).toLocaleDateString('pt-BR')}</small></span><span class="grow"></span><button class="wstar ${r.mine ? 'on' : ''}" data-wst="${r.message_id}">⭐ ${r.stars}</button><button class="ibtn sm" data-wgo="${r.message_id}" data-wch="${r.channel_id}" data-tip="Ver no chat">${ic('chevRight', 16)}</button></div></div>`);
    });
    last = rows.length ? rows[rows.length - 1].starred_at : last;
    el.querySelector('#wlMore').classList.toggle('hidden', rows.length < 40);
    g.querySelectorAll('[data-wgo]').forEach(b => b.onclick = () => { close(); go({ kind: 'server', sid: s.id, cid: b.dataset.wch }).then(() => setTimeout(() => jumpTo(b.dataset.wgo), 400)); });
    g.querySelectorAll('[data-wst]').forEach(b => b.onclick = async () => {
      const on = b.classList.contains('on'), mid = b.dataset.wst, n = parseInt(b.textContent.replace(/\D/g, '')) || 0;
      const { error } = on ? await App.sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', S.me.id).eq('emoji', '⭐') : await App.sb.from('message_reactions').insert({ message_id: mid, emoji: '⭐' });
      if(error && !/duplicate/i.test(error.message)){ App.toast(error.message, true); return; }
      b.classList.toggle('on', !on); b.textContent = '⭐ ' + Math.max(0, n + (on ? -1 : 1));
    });
  };
  el.querySelector('#wlMore').onclick = () => load(true);
  load(false);
}
App.wallOpen = wallOpen;
App.msgMenuExtra = m => {
  const ch = findChannel(m.channel_id); if(!ch || !ch.server_id) return [];
  const starred = M.reacts.get(m.id) && M.reacts.get(m.id).get('⭐') && M.reacts.get(m.id).get('⭐').has(S.me.id);
  return [{ label: starred ? 'Tirar do mural' : 'Pôr no mural', icon: '<span style="font-size:16px;width:18px;text-align:center">⭐</span>', onClick: () => { toggleReact(m.id, '⭐'); if(!starred) App.toast('Foi para o mural do servidor ⭐'); } }];
};
App.srvMenuExtra = s => [
  { label: 'Mural do servidor', icon: '<span style="font-size:16px;width:18px;text-align:center">⭐</span>', onClick: () => wallOpen(s) },
  { label: 'Clipes da semana', icon: '<span style="font-size:16px;width:18px;text-align:center">🎬</span>', onClick: () => clipsModal(s) },
  ...(s.rules_on && s.rules_text ? [{ label: 'Regras do servidor', icon: ic('book', 18), onClick: () => rulesView(s) }] : []),
];

/* ================= CONQUISTAS ================= */
const ACH = [
  ['voice', '🎙️', 'Voz da galera', 'horas em call', x => x.voice_min / 60, [1, 10, 50, 200, 500]],
  ['msgs', '💬', 'Tagarela', 'mensagens', x => x.messages, [100, 1000, 5000, 20000, 50000]],
  ['friends', '🤝', 'Enturmado', 'amigos', x => x.friends, [3, 10, 25, 50, 100]],
  ['owner', '🏰', 'Fundador', 'servidor criado', x => x.servers_owned, [1]],
  ['travel', '🌍', 'Viajante', 'servidores', x => x.servers, [3, 10, 25]],
  ['wins', '🏆', 'Campeão', 'vitórias nos jogos', x => x.game_wins, [1, 10, 50, 200]],
  ['clips', '🎬', 'Clipador', 'clipes', x => x.clips, [1, 10, 50, 200]],
  ['loved', '❤️', 'Querido', 'reações recebidas', x => x.reacts_got, [25, 250, 1000, 5000]],
  ['wall', '⭐', 'Lenda do mural', 'estrelas no mural', x => x.stars_got, [1, 10, 50, 200]],
  ['streak', '🔥', 'Fiel', 'dias seguidos pegando fichas', x => x.streak, [7, 30, 100, 365]],
  ['first', '🥇', 'Primeiro a chegar', 'servidor em que foi o 1º membro', x => x.first_in, [1, 5]],
  ['boost', '🚀', 'Impulsionador', 'impulso dado', x => x.boosts, [1, 5]],
  ['gamer', '🎮', 'Gamer', 'horas jogando (app do Windows)', x => x.game_min / 60, [5, 50, 200, 1000]],
  ['vet', '🕰️', 'Veterano', 'dias no Telão', x => x.since ? (Date.now() - new Date(x.since)) / 864e5 : 0, [30, 180, 365, 730]],
];
const ACH_TIERS = [['Bronze', '#cd7f32'], ['Prata', '#c0c6d0'], ['Ouro', '#ffcc33'], ['Diamante', '#6fe3ff'], ['Lendário', '#ff4fa3']];
const ACHC = new Map();
async function achData(uid){
  const c = ACHC.get(uid); if(c && Date.now() - c.at < 300000) return c.d;
  const { data, error } = await App.sb.rpc('user_achievements', { p_user: uid });
  if(error) throw error;
  ACHC.set(uid, { at: Date.now(), d: data }); return data;
}
function achList(d){
  return ACH.map(([id, e, name, unit, fn, steps]) => {
    const v = Math.floor(fn(d) || 0), lv = steps.filter(s => v >= s).length, next = steps[lv];
    return { id, e, name, unit, v, lv, next, max: steps.length, tier: lv ? ACH_TIERS[Math.min(lv - 1, ACH_TIERS.length - 1)] : null };
  });
}
const achMedal = a => `<span class="achm" style="--tc:${a.tier[1]}" data-tip="${esc(a.name)} · ${a.tier[0]}" data-tipsub="${a.v.toLocaleString('pt-BR')} ${esc(a.unit)}">${a.e}</span>`;
function achModal(uid){
  const p = prof(uid);
  modal(`<div class="mh"><h2>🏅 Conquistas de ${esc(p.display_name)}</h2><p>Cada conquista tem níveis: Bronze, Prata, Ouro, Diamante e Lendário.</p></div><div class="mc"><div class="achgrid" id="acG"><div class="spin" style="margin:30px auto"></div></div></div>
    <div class="mf"><button class="btn" data-close>Fechar</button></div>`, async m => {
    m.querySelector('.mbox').classList.add('wide');
    try{
      const l = achList(await achData(uid));
      m.querySelector('#acG').innerHTML = l.sort((a, b) => b.lv - a.lv).map(a => `<div class="achc ${a.lv ? '' : 'off'}" style="--tc:${a.tier ? a.tier[1] : '#555'}">
        <span class="ae">${a.e}</span><div class="at"><b>${esc(a.name)}</b><small>${a.tier ? a.tier[0] : 'Bloqueada'} · ${a.v.toLocaleString('pt-BR')} ${esc(a.unit)}</small>
        ${a.next ? `<div class="abar"><i style="width:${Math.min(100, a.v / a.next * 100).toFixed(0)}%"></i></div><small class="mut">Próximo nível: ${a.next.toLocaleString('pt-BR')}</small>` : '<small class="mut">Nível máximo! 🎉</small>'}</div></div>`).join('');
    }catch(e){ m.querySelector('#acG').innerHTML = `<p class="mut">${esc(sqlMiss(e) ? needSql : e.message)}</p>`; }
  });
}
App.achModal = achModal;
// cartão de perfil: espaço das conquistas (preenchido depois)
const _profileCardA = profileCard;
profileCard = function(p, extra){
  const html = _profileCardA.apply(this, arguments);
  if(!p || !p.id || p.id === TELAO_BOT_ID) return html;
  const bday = S.bdays && S.bdays.has(p.id) ? `<div class="bdaytag">🎂 Aniversariante do dia</div>` : '';
  return html.replace(/<\/div><\/div>$/, `${bday}<div class="achrow" data-achu="${p.id}"></div></div></div>`);
};
const TELAO_BOT_ID = '7e1a0000-0000-4000-a000-000000000001';
new MutationObserver(() => {
  document.querySelectorAll('.achrow[data-achu]:not([data-done])').forEach(async el => {
    el.dataset.done = '1'; const uid = el.dataset.achu;
    try{
      const l = achList(await achData(uid)).filter(a => a.lv).sort((a, b) => b.lv - a.lv);
      el.innerHTML = l.length ? `<h6>Conquistas</h6><div class="achms">${l.slice(0, 8).map(achMedal).join('')}${l.length > 8 ? `<span class="achmore">+${l.length - 8}</span>` : ''}<button class="achall" data-achall="${uid}">Ver todas</button></div>`
        : `<h6>Conquistas</h6><div class="achms"><button class="achall" data-achall="${uid}">Ver conquistas</button></div>`;
      el.querySelector('[data-achall]').onclick = e => { e.stopPropagation(); closeMenu(); achModal(uid); };
    }catch(e){ el.remove(); }
  });
}).observe(document.body, { childList: true, subtree: true });

/* ================= ANIVERSÁRIOS ================= */
S.bdays = new Set();
async function loadBdays(){
  if(!S.me) return;
  const ids = new Set();
  const calls = S.servers.slice(0, 30).map(s => App.sb.rpc('server_birthdays', { p_server: s.id })).concat([App.sb.rpc('friends_birthdays')]);
  const res = await Promise.all(calls);
  res.forEach(r => (r.data || []).forEach(x => ids.add(typeof x === 'string' ? x : (x.server_birthdays || x.friends_birthdays || Object.values(x)[0]))));
  if(S.me.bday_show && App.isBdayToday && App.isBdayToday(S.me.birthdate)) ids.add(S.me.id);
  const changed = ids.size !== S.bdays.size || [...ids].some(x => !S.bdays.has(x));
  S.bdays = ids;
  if(changed){ await ensureProfiles([...ids]); renderSidebar(); renderMembers(); }
}
App.isBdayToday = d => { if(!d) return false; const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(5); return d.slice(5) === t; };
const _nameHtmlBd = nameHtml;
nameHtml = function(p){ return _nameHtmlBd.apply(this, arguments) + (p && S.bdays && S.bdays.has(p.id) ? '<span class="bdayc" data-tip="Aniversariante do dia">🎂</span>' : ''); };
// aviso no topo do servidor
const _renderSidebarBd = renderSidebar;
renderSidebar = function(){
  _renderSidebarBd.apply(this, arguments);
  const s = S.route.kind === 'server' && curServer(); if(!s || !S.bdays.size) return;
  const mem = new Set((S.members.get(s.id) || []).map(m => m.user_id));
  const who = [...S.bdays].filter(id => mem.has(id) && id !== S.me.id);
  const body = $('#sbBody'); if(!body || !who.length || body.querySelector('.bdaybar')) return;
  const names = who.slice(0, 3).map(id => esc(prof(id).display_name)).join(', ') + (who.length > 3 ? ` e mais ${who.length - 3}` : '');
  body.insertAdjacentHTML('afterbegin', `<div class="bdaybar"><span>🎉</span><div><b>Hoje é aniversário de ${names}!</b><button class="btn sm" id="bdGo">Dar parabéns</button></div></div>`);
  $('#bdGo').onclick = async () => {
    if(who.length === 1){ const d = await openDM(who[0]); setTimeout(() => { const ta = $('#cmp'); if(ta && !ta.value){ ta.value = 'Feliz aniversário! 🎂🎉'; ta.focus(); } }, 300); }
    else menu(innerWidth / 2 - 120, 140, who.map(id => ({ label: prof(id).display_name, icon: '🎂', onClick: async () => { await openDM(id); setTimeout(() => { const ta = $('#cmp'); if(ta && !ta.value){ ta.value = 'Feliz aniversário! 🎂🎉'; ta.focus(); } }, 300); } })));
  };
};
// perfil: mostrar meu aniversário
const _secProfileB = secProfile;
secProfile = function(box, back){
  _secProfileB.apply(this, arguments);
  const hasDate = !!S.me.birthdate;
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>🎂 Aniversário</h3>
    ${row('Mostrar meu aniversário', hasDate ? 'No dia, você ganha o selo 🎂 de aniversariante e a galera dos seus servidores e amigos fica sabendo. A idade e o ano nunca aparecem.' : 'Primeiro confirme sua data de nascimento em Privacidade (é a mesma da verificação de idade).', toggle('bdShow', !!S.me.bday_show))}`);
  const t = box.querySelector('#bdShow'); if(!hasDate) t.disabled = true;
  t.onchange = async () => {
    const { data, error } = await App.sb.from('profiles').update({ bday_show: t.checked }).eq('id', S.me.id).select().single();
    if(error){ App.toast(/bday_show/.test(error.message) ? needSql : error.message, true); t.checked = !t.checked; return; }
    S.me = data; S.profiles.set(data.id, data); loadBdays(); App.toast(t.checked ? 'Seu aniversário vai aparecer no dia. 🎂' : 'Seu aniversário não aparece mais.');
  };
};
function confettiBurst(){
  const layer = document.createElement('div'); layer.className = 'confetti'; document.body.appendChild(layer);
  const cols = ['#ff4fa3', '#b6ff2e', '#ffcc33', '#6fe3ff', '#a36bff', '#fff'];
  for(let i = 0; i < 90; i++){ const c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = cols[i % cols.length]; c.style.animationDelay = Math.random() * .8 + 's'; c.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px'); c.style.setProperty('--r', (Math.random() * 720) + 'deg'); layer.appendChild(c); }
  setTimeout(() => layer.remove(), 4500);
}
App.confetti = confettiBurst;

/* ================= RETROSPECTIVA ================= */
const fmtH = min => { const h = Math.floor((min || 0) / 60), m = (min || 0) % 60; return h ? `${h.toLocaleString('pt-BR')} h${m ? ' ' + m + ' min' : ''}` : `${m} min`; };
async function wrappedOpen(year){
  year = year || new Date().getFullYear();
  const { data: w, error } = await App.sb.rpc('my_wrapped', { p_year: year });
  if(error){ App.toast(sqlMiss(error) ? needSql : error.message, true); return; }
  if(w.top_friend) await ensureProfiles([w.top_friend.id]);
  const me = S.me, fr = w.top_friend && prof(w.top_friend.id);
  const hourTxt = w.hour == null ? null : w.hour < 5 ? 'de madrugada 🦉' : w.hour < 12 ? 'de manhã ☀️' : w.hour < 18 ? 'de tarde 🌤️' : 'de noite 🌙';
  const slides = [
    { bg: 'linear-gradient(160deg,#ff2e9a,#5b2bff)', html: `<small>Telão</small><h1>Sua retrospectiva ${year}</h1><p>Bora ver como foi o seu ano, ${esc(me.display_name)}?</p><div class="wbig">🎬</div>` },
    { bg: 'linear-gradient(160deg,#00c6ff,#0072ff)', html: `<small>Em call</small><h1>${fmtH(w.voice_min)}</h1><p>foi o tempo que você passou em chamada com a galera.</p>${w.longest_call ? `<p class="wsub">A call mais longa durou <b>${fmtH(w.longest_call)}</b>.</p>` : ''}` },
    { bg: 'linear-gradient(160deg,#b6ff2e,#0a8f3c)', html: `<small>Mensagens</small><h1>${(w.messages || 0).toLocaleString('pt-BR')}</h1><p>mensagens mandadas em <b>${w.days || 0}</b> dias diferentes.</p>${hourTxt ? `<p class="wsub">Você é da turma que fala mais <b>${hourTxt}</b> (por volta das ${w.hour}h).</p>` : ''}` },
    w.top_server && { bg: 'linear-gradient(160deg,#a36bff,#2b1055)', html: `<small>Seu lugar favorito</small><div class="wsrv" style="--sc:${esc(w.top_server.icon_color || '#5865f2')}">${w.top_server.icon_url ? `<img src="${esc(w.top_server.icon_url)}" alt="">` : esc(serverInitials(w.top_server.name))}</div><h1 class="m">${esc(w.top_server.name)}</h1><p><b>${w.top_server.n.toLocaleString('pt-BR')}</b> mensagens suas foram lá.${w.top_channel ? ` O canal mais movimentado: <b>#${esc(w.top_channel.name)}</b>.` : ''}</p>` },
    fr && { bg: 'linear-gradient(160deg,#ff9a3c,#ff2e63)', html: `<small>Sua dupla do ano</small><div class="wav">${avatar(fr, 'xl')}</div><h1 class="m">${esc(fr.display_name)}</h1><p>vocês trocaram <b>${w.top_friend.n.toLocaleString('pt-BR')}</b> mensagens no privado.</p>${w.new_friends ? `<p class="wsub">E você fez <b>${w.new_friends}</b> amizade${w.new_friends > 1 ? 's' : ''} nova${w.new_friends > 1 ? 's' : ''} no Telão.</p>` : ''}` },
    (w.top_emoji || w.reacts_got) && { bg: 'linear-gradient(160deg,#ffcc33,#ff6b00)', html: `<small>Reações</small>${w.top_emoji ? `<div class="wbig">${esc(w.top_emoji.e)}</div><p>foi o emoji que você mais usou para reagir (<b>${w.top_emoji.n}</b> vezes).</p>` : ''}${w.reacts_got ? `<p class="wsub">E suas mensagens receberam <b>${w.reacts_got.toLocaleString('pt-BR')}</b> reações.</p>` : ''}` },
    (w.top_game || w.game_wins || w.clips) && { bg: 'linear-gradient(160deg,#2ee6c5,#0b4f6c)', html: `<small>Jogos e clipes</small>${w.top_game ? `<h1 class="m">${esc(w.top_game.name)}</h1><p>foi o jogo que você mais jogou: <b>${fmtH(w.top_game.min)}</b>.</p>` : ''}${w.game_wins ? `<p class="wsub">🏆 <b>${w.game_wins}</b> vitórias nos jogos da call.</p>` : ''}${w.clips ? `<p class="wsub">🎬 <b>${w.clips}</b> clipe${w.clips > 1 ? 's' : ''} gravado${w.clips > 1 ? 's' : ''}.</p>` : ''}` },
    { bg: 'linear-gradient(160deg,#ff2e9a,#ff7a00)', final: true, html: `<small>Resumo</small><h1 class="m">${esc(me.display_name)} em ${year}</h1>
      <div class="wsum"><div><b>${fmtH(w.voice_min)}</b><span>em call</span></div><div><b>${(w.messages || 0).toLocaleString('pt-BR')}</b><span>mensagens</span></div>
        <div><b>${w.days || 0}</b><span>dias ativo</span></div><div><b>${w.top_server ? esc(w.top_server.name) : '—'}</b><span>servidor favorito</span></div>
        ${fr ? `<div><b>${esc(fr.display_name)}</b><span>dupla do ano</span></div>` : ''}${w.top_emoji ? `<div><b>${esc(w.top_emoji.e)}</b><span>emoji do ano</span></div>` : ''}</div>
      <div class="wbtns"><button class="btn sec" id="wrAgain">${ic('refresh', 16)} Ver de novo</button><button class="btn" id="wrDl">${ic('download', 16)} Baixar imagem</button>${M.cid ? `<button class="btn sec" id="wrSend">${ic('send', 16)} Mandar no chat aberto</button>` : ''}</div>` },
  ].filter(Boolean);
  const el = document.createElement('div'); el.className = 'wrapped'; el.id = 'wrapped';
  el.innerHTML = `<div class="wrbox"><div class="wrprog">${slides.map(() => '<i><b></b></i>').join('')}</div><button class="wrx" id="wrX">${ic('x', 22)}</button><div class="wrslide" id="wrS"></div>
    <button class="wrnav l" id="wrL" aria-label="Voltar"></button><button class="wrnav r" id="wrR" aria-label="Próximo"></button></div>`;
  document.body.appendChild(el);
  let i = 0, timer = null;
  const show = n => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    const sl = slides[i], box = el.querySelector('#wrS');
    el.querySelector('.wrbox').style.background = sl.bg; el.querySelector('.wrbox').classList.toggle('fin', !!sl.final);
    box.innerHTML = sl.html; box.classList.remove('in'); void box.offsetWidth; box.classList.add('in');
    el.querySelectorAll('.wrprog i').forEach((x, k) => { x.className = k < i ? 'done' : k === i ? 'cur' : ''; });
    clearTimeout(timer); if(!sl.final) timer = setTimeout(() => show(i + 1), 6000);
    if(sl.final){ confettiBurst(); el.querySelector('#wrAgain').onclick = () => show(0); el.querySelector('#wrDl').onclick = () => wrappedImage(w, fr).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `retrospectiva-telao-${year}.png`; a.click(); });
      const sd = el.querySelector('#wrSend'); if(sd) sd.onclick = async () => { sd.disabled = true; try{ const b = await wrappedImage(w, fr); const meta = await uploadOne({ file: new File([b], `retrospectiva-${year}.png`, { type: 'image/png' }) }); const { error } = await App.sb.from('messages').insert({ channel_id: M.cid, content: `Minha retrospectiva ${year} no Telão 🎬`, attachments: [meta] }); if(error) throw error; App.toast('Enviado!'); }catch(e){ App.toast(e.message || String(e), true); sd.disabled = false; } };
    }
  };
  const close = () => { clearTimeout(timer); el.remove(); document.removeEventListener('keydown', kd); };
  const kd = e => { if(e.key === 'Escape') close(); else if(e.key === 'ArrowRight') show(i + 1); else if(e.key === 'ArrowLeft') show(i - 1); };
  document.addEventListener('keydown', kd);
  el.querySelector('#wrX').onclick = close;
  el.querySelector('#wrL').onclick = () => show(i - 1); el.querySelector('#wrR').onclick = () => show(i + 1);
  show(0);
}
App.wrappedOpen = wrappedOpen;
async function wrappedImage(w, fr){
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#ff2e9a'); gr.addColorStop(1, '#5b2bff'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 40px system-ui, sans-serif'; g.fillText('TELÃO · RETROSPECTIVA ' + w.year, 80, 120);
  g.fillStyle = '#fff'; g.font = '800 88px system-ui, sans-serif'; g.fillText(S.me.display_name.slice(0, 18), 80, 230);
  const rows = [['em call', fmtH(w.voice_min)], ['mensagens', (w.messages || 0).toLocaleString('pt-BR')], ['dias ativo', String(w.days || 0)],
    ['servidor favorito', w.top_server ? w.top_server.name : '—'], ['dupla do ano', fr ? fr.display_name : '—'], ['emoji do ano', w.top_emoji ? w.top_emoji.e : '—'], ['jogo do ano', w.top_game ? w.top_game.name : '—']];
  rows.forEach(([k, v], n) => {
    const y = 360 + n * 130;
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect ? g.roundRect(70, y - 80, W - 140, 110, 24) : g.rect(70, y - 80, W - 140, 110); g.fill();
    g.fillStyle = '#fff'; g.font = '800 54px system-ui, sans-serif'; g.fillText(String(v).slice(0, 22), 110, y);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '500 32px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(k, W - 110, y - 8); g.textAlign = 'left';
  });
  g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '500 30px system-ui, sans-serif'; g.fillText(location.host, 80, H - 70);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
App.selfMenuExtra = () => [{ label: `Retrospectiva ${new Date().getFullYear()}`, icon: '<span style="font-size:16px;width:18px;text-align:center">🎬</span>', onClick: () => wrappedOpen() },
  { label: 'Minhas conquistas', icon: '<span style="font-size:16px;width:18px;text-align:center">🏅</span>', onClick: () => achModal(S.me.id) }];
App.userMenuExtra = uid => uid === S.me.id || uid === TELAO_BOT_ID ? [] : [{ label: 'Conquistas', icon: '<span style="font-size:16px;width:18px;text-align:center">🏅</span>', onClick: () => achModal(uid) }];

/* ================= JOGO ABERTO NO PC (app do Windows) ================= */
const GM = { name: null, prev: undefined, sess: null, timer: null };
async function onDesktopGame(name){
  if(!S.me) return;
  if(App.prefs.autoGame === false) name = null;
  if(name === GM.name) return;
  const cur = S.me.activity;
  if(name){
    if(GM.prev === undefined) GM.prev = S.manualAct || null;
    GM.name = name; GM.sess = null;
    if(!(cur && cur.type === 'spotify' && App.actOf(S.me))) await setActivity({ type: 'playing', name, since: Date.now(), auto: true }, true);
    const ping = async () => { const { data } = await App.sb.rpc('game_ping', { p_session: GM.sess, p_game: GM.name }); if(data) GM.sess = data; };
    ping(); clearInterval(GM.timer); GM.timer = setInterval(ping, 60000);
  } else {
    GM.name = null; clearInterval(GM.timer); GM.timer = null; GM.sess = null;
    if(S.me.activity && S.me.activity.auto) await setActivity(GM.prev || null, true);
    GM.prev = undefined;
  }
}
if(window.telaoDesktop && window.telaoDesktop.onGame) window.telaoDesktop.onGame(g => onDesktopGame(g));
const _secConnG = secConnections;
secConnections = function(box, back){
  _secConnG.apply(this, arguments);
  const desk = !!(window.telaoDesktop && window.telaoDesktop.onGame);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>🎮 Jogo que estou jogando</h3>
    ${row('Mostrar o jogo automaticamente', desk ? 'Quando você abre um jogo conhecido no PC, seu perfil mostra “Jogando …” e o tempo de jogo. Some quando você fecha o jogo.' : 'Funciona no app do Telão para Windows (versão 1.1 ou mais nova). No navegador, use “Atividade” acima para dizer o que está jogando.', toggle('agOn', App.prefs.autoGame !== false))}
    ${desk && GM.name ? `<p class="mut small">Agora: jogando <b>${esc(GM.name)}</b>.</p>` : ''}`);
  const t = box.querySelector('#agOn'); if(!desk) t.disabled = true;
  t.onchange = () => { App.prefs.autoGame = t.checked; savePrefs(); if(window.telaoDesktop.getGame) window.telaoDesktop.getGame().then(g => { GM.name = undefined; onDesktopGame(t.checked ? g : null); }); };
};

/* ================= início: aniversários, parabéns e aviso da retrospectiva ================= */
const _startC = start;
start = async function(){
  const r = await _startC.apply(this, arguments);
  if(!S.me) return r;
  loadBdays().catch(() => {});
  setInterval(() => loadBdays().catch(() => {}), 30 * 60000);
  App.sb.rpc('birthday_greet').then(({ data }) => { if(data){ confettiBurst(); App.toast('🎂 Feliz aniversário! Hoje você tem o selo de aniversariante.'); } }, () => {});
  if(window.telaoDesktop && window.telaoDesktop.getGame) window.telaoDesktop.getGame().then(g => g && onDesktopGame(g)).catch(() => {});
  const now = new Date(), key = 'telao-wr-' + now.getFullYear() + '-' + now.toLocaleDateString('en-CA');
  if(now.getMonth() === 11 && !ls.get(key, false)){ ls.set(key, true); setTimeout(() => App.toast(`Sua retrospectiva ${now.getFullYear()} chegou 🎬`, false, { label: 'Ver agora', fn: () => wrappedOpen() }), 4000); }
  return r;
};
