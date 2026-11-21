/* =====================================================================
   v6.31: ANIVERSÁRIOS DO SERVIDOR
   - Calendário com todo mundo que ativou "Mostrar meu aniversário" (só dia e mês, nunca o ano).
   - No dia, a conta oficial do Telão posta um parabéns no servidor (uma vez por pessoa por ano),
     com o botão "Dar parabéns". Quem gerencia o servidor escolhe o canal ou desliga.
   ===================================================================== */
const BD_SQL = 'Para os aniversários do servidor, rode o supabase.sql novo (v6.31) no Supabase.';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
App.bdayCardHtml = (a, m) => {
  const p = prof(a.user_id);
  return `<div class="bdcard"><div class="bdconf">🎉</div>${avatar(p, 'lg')}<div class="bdt"><small>ANIVERSÁRIO</small><b>Hoje é aniversário de ${esc(p.display_name || a.name || '')}!</b><span>🎂 Manda um parabéns aí</span></div>
    ${a.user_id !== S.me.id ? `<button class="btn sm" data-bdgo="${esc(p.username || '')}">🎉 Dar parabéns</button>` : '<span class="bdme">É você! 🥳</span>'}</div>`;
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-bdgo]'); if(!b) return;
  const ta = document.getElementById('cmp'); if(!ta) return;
  ta.value = `Parabéns @${b.dataset.bdgo}! 🎂🎉 ${['Muitos anos de vida!', 'Tudo de bom pra você!', 'Feliz aniversário!'][Math.floor(Math.random() * 3)]}`;
  ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
});
// ao abrir um servidor (uma vez por dia por servidor), confere se tem aniversariante
const _goBd = go;
go = async function(route){
  const r = await _goBd.apply(this, arguments);
  if(route && route.kind === 'server'){
    const k = 'telao-bdann-' + route.sid, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    if(ls.get(k, '') !== today){ ls.set(k, today); App.sb.rpc('server_bday_announce', { p_server: route.sid }).then(() => {}, () => {}); }
  }
  return r;
};
async function bdCalendar(s){
  modal(`<div class="mh"><h2>🎂 Aniversários · ${esc(s.name)}</h2><p>Só aparece quem ativou "Mostrar meu aniversário" no perfil. O ano nunca aparece.</p></div><div class="mc" id="bdBody"><div class="spin" style="margin:20px auto"></div></div>
    <div class="mf"><button class="btn sec" id="bdMine">${ic('cake', 16)} Mostrar o meu</button><button class="btn" data-close>Fechar</button></div>`, async m => {
    m.querySelector('#bdMine').onclick = () => { closeModal(); openSettings('user', 'profile'); };
    const { data, error } = await App.sb.rpc('server_bday_calendar', { p_server: s.id });
    const body = m.querySelector('#bdBody'); if(!body) return;
    if(error){ body.innerHTML = `<div class="locked">${/server_bday_calendar|schema cache|does not exist/i.test(error.message) ? BD_SQL : esc(error.message)}</div>`; return; }
    const rows = data || []; await ensureProfiles(rows.map(r => r.user_id));
    if(!rows.length){ body.innerHTML = `<div class="empty">${ic('cake', 36)}<br>Ninguém mostrou o aniversário ainda.<br><small>Ative em Configurações → Perfil → Mostrar meu aniversário.</small></div>`; return; }
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const nextOf = r => { let d = new Date(now.getFullYear(), r.month - 1, r.day); if(d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear() + 1, r.month - 1, r.day); return d; };
    const daysTo = r => Math.round((nextOf(r) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const soon = rows.map(r => ({ ...r, dt: daysTo(r) })).filter(r => r.dt <= 30).sort((a, b) => a.dt - b.dt);
    const person = r => `<div class="bdp ${r.dt === 0 ? 'today' : ''}">${avatar(prof(r.user_id), 'sm')}<span>${esc(prof(r.user_id).display_name)}</span><small>${r.day}/${String(r.month).padStart(2, '0')}${r.dt === 0 ? ' · hoje! 🎉' : r.dt === 1 ? ' · amanhã' : r.dt != null && r.dt <= 30 ? ` · em ${r.dt} dias` : ''}</small></div>`;
    body.innerHTML = `${soon.length ? `<h3>Próximos 30 dias</h3><div class="bdlist">${soon.map(person).join('')}</div>` : ''}
      <h3>O ano todo</h3><div class="bdmonths">${MESES.map((mn, i) => { const ps = rows.filter(r => r.month === i + 1).map(r => ({ ...r, dt: daysTo(r) }));
        return `<div class="bdm ${i === now.getMonth() ? 'cur' : ''}"><b>${mn}</b>${ps.length ? ps.map(person).join('') : '<small class="mut">—</small>'}</div>`; }).join('')}</div>`;
  });
}
App.bdCalendar = bdCalendar;
const _srvMenuExtraBd = App.srvMenuExtra;
App.srvMenuExtra = s => (_srvMenuExtraBd ? _srvMenuExtraBd(s) : []).concat([{ label: 'Aniversários', icon: ic('cake', 18), onClick: () => bdCalendar(s) }]);
// Visão geral do servidor: parabéns automático
const _secSrvOverviewBd = secSrvOverview;
secSrvOverview = function(box, back){
  _secSrvOverviewBd.apply(this, arguments);
  const s = SET.server; if(!App.hasPerm(s.id, 2)) return;
  const texts = (S.channels.get(s.id) || []).filter(c => c.kind === 'text').sort((a, b) => a.position - b.position);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>🎂 Aniversários</h3>
    ${row('Parabéns automático no dia', 'A conta do Telão posta um parabéns quando é aniversário de alguém do servidor (de quem ativou mostrar o aniversário).', toggle('bdOn', s.bday_on !== false))}
    <div class="srow"><div class="t"><b>Canal do parabéns</b><small>Se não escolher, vai no primeiro canal de texto.</small></div><select class="inp" id="bdCh" style="max-width:220px"><option value="">Primeiro canal de texto</option>${texts.map(c => `<option value="${c.id}" ${s.bday_channel === c.id ? 'selected' : ''}>#${esc(c.name)}</option>`).join('')}</select></div>`);
  const save = async patch => {
    const { error } = await App.sb.from('servers').update(patch).eq('id', s.id);
    if(error){ App.toast(/bday_|schema cache/i.test(error.message) ? BD_SQL : error.message, true); return; }
    Object.assign(s, patch); App.toast('Salvo.');
  };
  box.querySelector('#bdOn').onchange = e => save({ bday_on: e.target.checked });
  box.querySelector('#bdCh').onchange = e => save({ bday_channel: e.target.value || null });
};
