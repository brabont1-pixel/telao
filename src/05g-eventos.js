/* =====================================================================
   v6: EVENTOS DO SERVIDOR (agendar noite de jogo, sessão de filme…)
   ===================================================================== */
S.events = new Map();   // sid -> [eventos]
S.rsvps = new Map();    // eventId -> Set(uid)
const EV_COLORS = ['#ff2e9a','#3b82f6','#22c55e','#eab308','#a855f7','#ec4899','#14b8a6','#64748b'];
const evLive = e => new Date(e.starts_at) <= new Date() && new Date() <= new Date(e.ends_at || (new Date(e.starts_at).getTime() + 3 * 3600e3));
const evOver = e => new Date() > new Date(e.ends_at || (new Date(e.starts_at).getTime() + 3 * 3600e3));
const canEvents = sid => App.hasPerm(sid, 256) || App.hasPerm(sid, 2);
function fmtEv(d){
  d = new Date(d); const now = new Date(), tm = new Date(now); tm.setDate(now.getDate() + 1);
  const hm = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  if(d.toDateString() === now.toDateString()) return 'Hoje às ' + hm;
  if(d.toDateString() === tm.toDateString()) return 'Amanhã às ' + hm;
  return d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' }).replace('.', '') + ' às ' + hm;
}
async function loadEvents(sid){
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data } = await App.sb.from('server_events').select('*').eq('server_id', sid).gt('starts_at', since).order('starts_at');
  const list = (data || []).filter(e => !evOver(e));
  S.events.set(sid, list);
  if(list.length){
    const { data: rs } = await App.sb.from('event_rsvps').select('*').in('event_id', list.map(e => e.id));
    list.forEach(e => S.rsvps.set(e.id, new Set()));
    (rs || []).forEach(r => { if(S.rsvps.has(r.event_id)) S.rsvps.get(r.event_id).add(r.user_id); });
  }
}
const _loadServersE = loadServers;
loadServers = async function(){
  await _loadServersE();
  await Promise.all(S.servers.map(s => loadEvents(s.id).catch(() => {})));
  if(!S._evRt){ S._evRt = true;
    const re = async p => { const r = p.new && p.new.id ? p.new : p.old; const sid = (r && r.server_id) || [...S.events].find(([, l]) => l.some(e => e.id === (r && r.event_id)))?.[0];
      if(sid) await loadEvents(sid); else await Promise.all(S.servers.map(s => loadEvents(s.id))); renderSidebar(); refreshEvModal(); };
    App.sb.channel('events-rt').on('postgres_changes', { event:'*', schema:'public', table:'server_events' }, re)
      .on('postgres_changes', { event:'*', schema:'public', table:'event_rsvps' }, re).subscribe();
  }
};
/* linha "Eventos" na lista de canais */
const _renderSidebarE = renderSidebar;
renderSidebar = function(){
  _renderSidebarE.apply(this, arguments);
  const s = S.route && S.route.kind === 'server' ? curServer() : null; if(!s) return;
  const body = $('#sbBody'); if(!body || body.querySelector('.evrow')) return;
  const list = S.events.get(s.id) || [], live = list.find(evLive), next = list[0];
  if(!list.length && !canEvents(s.id)) return;
  body.insertAdjacentHTML('afterbegin', `<button class="evrow ${live ? 'live' : ''}" id="sbEvents">${ic('calendar', 18)}<span class="t"><b>${live ? 'Acontecendo agora' : list.length ? list.length + (list.length > 1 ? ' eventos' : ' evento') : 'Eventos'}</b>${live ? `<small>${esc(live.title)}</small>` : next ? `<small>${esc(next.title)} · ${fmtEv(next.starts_at)}</small>` : '<small>Agendar uma noite de jogo</small>'}</span></button>`);
  body.querySelector('#sbEvents').onclick = () => eventsModal(s);
};
let evModalSid = null;
function refreshEvModal(){ if(evModalSid && document.querySelector('#evList')) eventsModal(S.servers.find(s => s.id === evModalSid), true); }
function eventsModal(s, keep){
  evModalSid = s.id;
  const list = S.events.get(s.id) || [];
  const html = `<div class="mh"><h2>Eventos de ${esc(s.name)}</h2><p>Marque “Tenho interesse” e o Telão te avisa 10 minutos antes.</p></div>
    <div class="mc"><div id="evList" class="evlist">${list.map(e => evCard(s, e)).join('') || '<div class="empty">Nenhum evento marcado.</div>'}</div></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button>${canEvents(s.id) ? `<button class="btn" id="evNew">${ic('plus', 16)} Criar evento</button>` : ''}</div>`;
  const bind = m => {
    const n = m.querySelector('#evNew'); if(n) n.onclick = () => eventForm(s);
    m.querySelectorAll('[data-rsvp]').forEach(b => b.onclick = async () => {
      const id = b.dataset.rsvp, set = S.rsvps.get(id) || new Set();
      const { error } = set.has(S.me.id) ? await App.sb.from('event_rsvps').delete().eq('event_id', id).eq('user_id', S.me.id) : await App.sb.from('event_rsvps').insert({ event_id: id, user_id: S.me.id });
      if(error){ App.toast(error.message, true); return; }
      await loadEvents(s.id); eventsModal(s, true); renderSidebar();
    });
    m.querySelectorAll('[data-evjoin]').forEach(b => b.onclick = () => { const ch = findChannel(b.dataset.evjoin); if(ch){ closeModal(); joinVoice(ch); } });
    m.querySelectorAll('[data-evedit]').forEach(b => b.onclick = () => eventForm(s, list.find(e => e.id === b.dataset.evedit)));
    m.querySelectorAll('[data-evdel]').forEach(b => b.onclick = async () => {
      if(!(await confirmBox('Apagar evento', 'Apagar este evento?', 'Apagar'))) return;
      await App.sb.from('server_events').delete().eq('id', b.dataset.evdel); await loadEvents(s.id); eventsModal(s); renderSidebar();
    });
  };
  modal(html, bind);
}
function evCard(s, e){
  const ch = e.channel_id && findChannel(e.channel_id), set = S.rsvps.get(e.id) || new Set(), going = set.has(S.me.id), live = evLive(e);
  const mine = canEvents(s.id) || e.created_by === S.me.id, d = new Date(e.starts_at);
  return `<div class="evcard ${live ? 'live' : ''}" style="--evc:${esc(e.cover_color || '#ff2e9a')}">
    <div class="evdate"><b>${d.getDate()}</b><small>${d.toLocaleDateString('pt-BR', { month:'short' }).replace('.', '')}</small></div>
    <div class="evb"><div class="evwhen">${live ? '<span class="evlive">AO VIVO</span>' : fmtEv(e.starts_at)}${ch ? ` · ${ic('volume', 12)} ${esc(ch.name)}` : ''}</div>
      <b class="evt">${esc(e.title)}</b>${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <div class="evf"><span class="evppl">${[...set].slice(0, 5).map(u => avatar(prof(u), 'xs')).join('')} ${set.size ? set.size + ' com interesse' : 'Ninguém marcou ainda'}</span>
        <span class="grow"></span>
        ${mine ? `<button class="ibtn sm" data-evedit="${e.id}" data-tip="Editar">${ic('edit', 15)}</button><button class="ibtn sm" data-evdel="${e.id}" data-tip="Apagar">${ic('trash', 15)}</button>` : ''}
        ${live && ch ? `<button class="btn sm" data-evjoin="${ch.id}">Entrar</button>` : `<button class="btn sm ${going ? 'sec' : ''}" data-rsvp="${e.id}">${going ? ic('check', 14) + ' Interessado' : ic('bell', 14) + ' Tenho interesse'}</button>`}</div></div></div>`;
}
function eventForm(s, e){
  const voice = (S.channels.get(s.id) || []).filter(c => c.kind === 'voice');
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const def = e ? new Date(e.starts_at) : (() => { const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); return d; })();
  let color = (e && e.cover_color) || EV_COLORS[0];
  modal(`<form id="evF"><div class="mh"><h2>${e ? 'Editar evento' : 'Novo evento'}</h2></div>
    <div class="mc">
      <label class="field"><span>Nome</span><input class="inp" id="evT" maxlength="80" required value="${esc(e ? e.title : '')}" placeholder="Noite do CS"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field"><span>Começa</span><input class="inp" type="datetime-local" id="evS" required value="${local(def)}"></label>
        <label class="field"><span>Duração</span><select class="inp" id="evDur">${[[60,'1 hora'],[120,'2 horas'],[180,'3 horas'],[300,'5 horas'],[720,'12 horas']].map(([v, l]) => `<option value="${v}" ${e && e.ends_at && Math.round((new Date(e.ends_at) - new Date(e.starts_at)) / 6e4) === v ? 'selected' : v === 180 && !e ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Onde</span><select class="inp" id="evC"><option value="">Sem canal de voz</option>${voice.map(c => `<option value="${c.id}" ${e && e.channel_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Descrição</span><textarea class="inp" id="evD" rows="3" maxlength="600" placeholder="Quem chegar primeiro escolhe o mapa">${esc(e && e.description || '')}</textarea></label>
      <div class="colors" id="evCol">${EV_COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('')}</div>
      <div class="err" id="evE"></div></div>
    <div class="mf"><button type="button" class="btn sec" id="evBack">Voltar</button><button class="btn">${e ? 'Salvar' : 'Criar evento'}</button></div></form>`, m => {
    m.querySelectorAll('#evCol [data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('#evCol [data-c]').forEach(x => x.classList.toggle('on', x === b)); });
    m.querySelector('#evBack').onclick = () => eventsModal(s);
    m.querySelector('#evF').onsubmit = async ev => {
      ev.preventDefault();
      const st = new Date(m.querySelector('#evS').value);
      if(isNaN(st)) return;
      const row = { server_id: s.id, title: m.querySelector('#evT').value.trim(), description: m.querySelector('#evD').value.trim() || null, starts_at: st.toISOString(),
        ends_at: new Date(st.getTime() + (+m.querySelector('#evDur').value) * 6e4).toISOString(), channel_id: m.querySelector('#evC').value || null, cover_color: color };
      const { error } = e ? await App.sb.from('server_events').update(row).eq('id', e.id) : await App.sb.from('server_events').insert(row);
      if(error){ m.querySelector('#evE').textContent = error.message; return; }
      await loadEvents(s.id); renderSidebar(); eventsModal(s);
      if(!e) App.toast('Evento criado.');
    };
  });
}
/* avisos: 10 min antes e na hora, para quem marcou interesse */
const evSeen = new Set(ls.get('telao-evseen', []));
setInterval(() => {
  if(!S.me) return;
  S.events.forEach((list, sid) => list.forEach(e => {
    if(!(S.rsvps.get(e.id) || new Set()).has(S.me.id)) return;
    const t = new Date(e.starts_at).getTime(), now = Date.now(), ch = e.channel_id && findChannel(e.channel_id);
    const fire = (k, msg) => { if(evSeen.has(e.id + k)) return; evSeen.add(e.id + k); ls.set('telao-evseen', [...evSeen].slice(-200)); App.sfx('screen');
      App.toast(msg, false, ch ? { label: 'Entrar', fn: () => joinVoice(ch) } : null); notify('Evento: ' + e.title, msg, null); };
    if(now >= t - 10 * 60e3 && now < t) fire(':10', `“${e.title}” começa em ${Math.max(1, Math.round((t - now) / 60e3))} min.`);
    if(now >= t && now < t + 30 * 60e3) fire(':0', `“${e.title}” começou agora.`);
  }));
}, 30000);
