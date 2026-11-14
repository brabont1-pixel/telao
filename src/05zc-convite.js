/* =====================================================================
   v6.19: CARTÃO DE CONVITE NO CHAT
   Quando alguém manda um link de convite (…/#convite=código), a mensagem mostra um cartão com a cara do Telão:
   banner com linhas de TV, ícone do servidor dentro de uma "telinha" com perninhas, quem está online,
   quantos membros, quem está em call agora (AO VIVO) e o botão Entrar no servidor / Abrir servidor.
   ===================================================================== */
const INV_RE = /[#?&]convite=([a-z0-9-]{4,40})/gi;
const INVC = new Map();   // código → { at, p: Promise }
function invFetch(code, fresh){
  const c = INVC.get(code);
  if(c && !fresh && Date.now() - c.at < 120000) return c.p;
  const p = App.sb.rpc('invite_preview', { p_code: code }).then(({ data, error }) => { if(error) throw error; return data; });
  INVC.set(code, { at: Date.now(), p }); p.catch(() => INVC.delete(code));
  return p;
}
const _embedsHtmlInv = embedsHtml;
embedsHtml = function(m){
  const base = _embedsHtmlInv.apply(this, arguments) || '';
  const codes = [...new Set([...String(m.content || '').matchAll(INV_RE)].map(x => x[1].toLowerCase()))].slice(0, 3);
  return base + codes.map(c => `<div class="invc loading" data-inv="${esc(c)}"><div class="invtop">${ic('tv', 13)} CONVITE PRO TELÃO</div><div class="invban"></div><div class="invbody"><div class="invsk w60"></div><div class="invsk w40"></div><div class="invsk btn"></div></div></div>`).join('');
};
const fmtN = n => Number(n || 0).toLocaleString('pt-BR');
function invCardHtml(d, code){
  if(!d) return `<div class="invtop">${ic('tv', 13)} CONVITE PRO TELÃO</div><div class="invban dead"><div class="invtv dead"><span class="invstatic"></span><i class="l1"></i><i class="l2"></i></div></div>
    <div class="invbody"><div class="invname">Convite inválido</div><p class="invdesc">Esse convite expirou, foi trocado ou o servidor não existe mais. Peça um link novo para quem te mandou.</p></div>`;
  const online = (d.member_ids || []).filter(id => S.online.has(id) || id === S.me.id).length;
  const acc = d.accent || d.icon_color || '#ff2e9a';
  const icon = d.icon_url ? `<img src="${esc(d.icon_url)}" alt="">` : `<span>${esc(serverInitials(d.name))}</span>`;
  const since = new Date(d.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  const btn = d.banned ? `<button class="invbtn" disabled>Você foi banido desse servidor</button>`
    : d.is_member ? `<button class="invbtn open" data-invgo="${esc(code)}" data-invsid="${d.id}">${ic('tv', 18)} Abrir servidor</button>`
    : `<button class="invbtn" data-invgo="${esc(code)}">${ic('plus', 18)} Entrar no servidor</button>`;
  return `<div class="invtop">${ic('tv', 13)} CONVITE PRO TELÃO${d.in_call ? `<span class="invlive"><i></i>AO VIVO</span>` : ''}</div>
    <div class="invban" style="--ia:${esc(acc)};${d.banner_url ? `background-image:url('${esc(d.banner_url)}')` : ''}">
      <div class="invtv" style="--sc:${esc(d.icon_color || '#5865f2')}"><div class="invscr">${icon}</div><i class="l1"></i><i class="l2"></i></div></div>
    <div class="invbody">
      <div class="invname"><span>${esc(d.name)}</span>${d.is_public ? `<span class="invbadge pub" data-tip="Servidor da comunidade">${ic('globe', 13)}</span>` : ''}${d.level ? `<span class="invbadge lvl" data-tip="Nível de impulso">Nv. ${d.level}</span>` : ''}</div>
      <div class="invstats"><span><i class="dot on"></i>${fmtN(online)} online</span><span><i class="dot"></i>${fmtN(d.members)} membro${d.members === 1 ? '' : 's'}</span>${d.in_call ? `<span class="incall">${ic('volume', 13)} ${fmtN(d.in_call)} em call agora</span>` : ''}</div>
      <div class="invsince">No Telão desde ${esc(since)}${d.rules_on ? ' · tem regras para entrar' : ''}</div>
      ${d.description ? `<p class="invdesc">${esc(d.description)}</p>` : ''}
      ${btn}
    </div>`;
}
async function fillInv(el){
  el.dataset.done = '1';
  const code = el.dataset.inv;
  try{ const d = await invFetch(code); el.innerHTML = invCardHtml(d, code); el.classList.toggle('dead', !d); }
  catch(e){ el.innerHTML = invCardHtml(null, code); el.classList.add('dead'); }
  el.classList.remove('loading');
}
new MutationObserver(() => document.querySelectorAll('.invc[data-inv]:not([data-done])').forEach(fillInv))
  .observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-invgo]'); if(!b || b.disabled) return;
  e.preventDefault(); e.stopPropagation();
  const code = b.dataset.invgo;
  if(b.dataset.invsid && S.servers.some(s => s.id === b.dataset.invsid)){ go({ kind: 'server', sid: b.dataset.invsid }); return; }
  b.disabled = true; const old = b.innerHTML; b.innerHTML = '<span class="spin sm"></span> Entrando…';
  const r = await App.joinWithRules('join_server', { p_code: code });
  b.disabled = false; b.innerHTML = old;
  if(r.cancelled) return;
  if(r.error){ App.toast(r.error.message, true); return; }
  await loadServers();
  INVC.delete(code);
  document.querySelectorAll(`.invc[data-inv="${code}"]`).forEach(c => { c.removeAttribute('data-done'); fillInv(c); });
  go({ kind: 'server', sid: r.data });
  App.toast('Você entrou no servidor! 🎉');
}, true);
