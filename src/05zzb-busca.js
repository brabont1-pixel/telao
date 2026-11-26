/* =====================================================================
   v6.39: BUSCA AVANÇADA
   Tudo numa tela: texto + quem mandou + onde (este canal / servidor inteiro) +
   tem imagem, vídeo, link, arquivo, áudio ou figurinha + período + fixadas + "me mencionou".
   O banco faz o filtro (search_messages), e a permissão de ler continua a mesma.
   ===================================================================== */
const BS = { f: null };
const BS_HAS = [['', 'Qualquer coisa'], ['image', '🖼️ Imagem'], ['video', '🎬 Vídeo'], ['link', '🔗 Link'], ['file', '📎 Arquivo'], ['audio', '🎵 Áudio'], ['sticker', '🧸 Figurinha']];
const BS_WHEN = [['', 'Qualquer data'], ['1', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['365', 'Último ano'], ['c', 'Escolher datas…']];
function bsPool(ch){
  return ch.kind === 'dm' ? [S.me.id, dmOther(ch)] : ch.kind === 'group' ? (ch.members || []) : (S.members.get(ch.server_id) || []).map(x => x.user_id);
}
showSearch = async function(anchor){
  const ch = M.ch; if(!ch) return;
  const r = anchor.getBoundingClientRect();
  const el = $('#menu'); el.className = 'menu panelpop bspop';
  const srv = !!ch.server_id;
  const f = BS.f && BS.f.cid === ch.id ? BS.f : (BS.f = { cid: ch.id, q: '', who: '', where: 'ch', has: '', when: '', from: '', to: '', pinned: false, me: false });
  const pool = bsPool(ch).map(prof).sort((a, b) => a.display_name.localeCompare(b.display_name));
  el.innerHTML = `<div class="pphead bshead"><div class="sbox">${ic('search', 16)}<input id="srQ" placeholder="Buscar mensagens" autocomplete="off" value="${esc(f.q)}"></div>
    <div class="bsf">
      <label><span>De</span><select id="bsWho"><option value="">Qualquer pessoa</option>${pool.map(p => `<option value="${p.id}" ${f.who === p.id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></label>
      ${srv ? `<label><span>Onde</span><select id="bsWhere"><option value="ch" ${f.where === 'ch' ? 'selected' : ''}>Neste canal</option><option value="srv" ${f.where === 'srv' ? 'selected' : ''}>No servidor todo</option></select></label>` : ''}
      <label><span>Tem</span><select id="bsHas">${BS_HAS.map(([k, n]) => `<option value="${k}" ${f.has === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label><span>Quando</span><select id="bsWhen">${BS_WHEN.map(([k, n]) => `<option value="${k}" ${f.when === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="bsdates ${f.when === 'c' ? '' : 'hidden'}" id="bsDates"><input type="date" id="bsFrom" value="${esc(f.from)}"><span>até</span><input type="date" id="bsTo" value="${esc(f.to)}"></div>
      <div class="bschips"><button class="chip ${f.pinned ? 'on' : ''}" id="bsPin">${ic('pin', 13)} Fixadas</button><button class="chip ${f.me ? 'on' : ''}" id="bsMe">${ic('at', 13)} Me mencionaram</button><button class="lnk" id="bsClr">limpar</button></div>
    </div></div><div class="ppbody" id="srR"><div class="empty">Digite ou escolha um filtro.</div></div>`;
  openPanel(el, r);
  const $e = q => el.querySelector(q), q = $e('#srQ');
  if(!isMobile()) setTimeout(() => q.focus(), 20);
  let t, seq = 0;
  const run = async (more) => {
    f.q = q.value.trim(); f.who = $e('#bsWho').value; f.where = $e('#bsWhere') ? $e('#bsWhere').value : 'ch';
    f.has = $e('#bsHas').value; f.when = $e('#bsWhen').value; f.from = $e('#bsFrom').value; f.to = $e('#bsTo').value;
    $e('#bsDates').classList.toggle('hidden', f.when !== 'c');
    const box = $e('#srR');
    const any = f.q.length >= 2 || f.who || f.has || (f.when && (f.when !== 'c' || f.from || f.to)) || f.pinned || f.me;
    if(!any){ box.innerHTML = `<div class="empty">${f.q.length === 1 ? 'Digite pelo menos 2 letras.' : 'Digite ou escolha um filtro.'}</div>`; return; }
    const my = ++seq;
    if(!more){ box.innerHTML = '<div class="loadmore"><div class="spin"></div></div>'; f.rows = []; }
    let from = null, to = null;
    if(f.when === 'c'){ if(f.from) from = new Date(f.from + 'T00:00:00').toISOString(); if(f.to){ const d = new Date(f.to + 'T00:00:00'); d.setDate(d.getDate() + 1); to = d.toISOString(); } }
    else if(f.when){ const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (+f.when - 1)); from = d.toISOString(); }
    const args = { p_server: f.where === 'srv' ? ch.server_id : null, p_channel: f.where === 'srv' ? null : ch.id, p_q: f.q.length >= 2 ? f.q.replace(/[%_]/g, '') : null,
      p_author: f.who || null, p_from: from, p_to: to, p_has: f.has || null, p_mention: f.me ? S.me.username : null, p_pinned: f.pinned, p_off: more ? f.rows.length : 0 };
    let { data, error } = await App.sb.rpc('search_messages', args);
    if(error && /search_messages|schema cache|does not exist|function/i.test(error.message)){
      // banco antigo: só texto neste canal
      if(!args.p_q){ box.innerHTML = '<div class="empty">Para os filtros, rode o supabase.sql novo (v6.39) no Supabase.</div>'; return; }
      ({ data, error } = await App.sb.from('messages').select('*').eq('channel_id', ch.id).ilike('content', `%${args.p_q}%`).order('created_at', { ascending: false }).limit(30));
    }
    if(my !== seq) return;
    if(error){ box.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
    data = (data || []).filter(m => !(S.blocked && S.blocked.has(m.author_id)));
    f.rows = (f.rows || []).concat(data);
    await ensureProfiles(f.rows.map(m => m.author_id));
    if(my !== seq) return;
    const hlre = args.p_q ? new RegExp(args.p_q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
    const hl = s => { const e = esc(s); return hlre ? e.replace(hlre, x => `<mark>${x}</mark>`) : e; };
    const attTxt = m => { const a = m.attachments || []; if(a.some(x => x.type === 'sticker')) return '🧸 Figurinha'; if(a.some(x => /^image\//.test(x.type || ''))) return '🖼️ Imagem'; if(a.some(x => /^video\//.test(x.type || ''))) return '🎬 Vídeo'; if(a.some(x => x.voice)) return '🎤 Áudio'; if(a.some(x => x.url)) return '📎 Arquivo'; return ''; };
    const chName = id => { const c = findChannel(id); return c && c.name ? '#' + c.name : ''; };
    box.innerHTML = f.rows.length ? `<div class="srcount">${f.rows.length}${data.length === 40 ? '+' : ''} resultado(s)</div>` + f.rows.map(m => {
      const thumb = (m.attachments || []).find(x => /^image\//.test(x.type || '') || x.type === 'sticker');
      return `<div class="ppit" data-bsgo="${m.id}" data-bsch="${m.channel_id}">${avatar(prof(m.author_id), 'sm')}<div class="grow"><b>${esc(prof(m.author_id).display_name)}</b> <small>${fmtTime(m.created_at)}${f.where === 'srv' ? ' · ' + esc(chName(m.channel_id)) : ''}</small>
        <div class="ppct">${m.content ? hl(mentionPlain(m.content).slice(0, 300)) : `<i>${attTxt(m)}</i>`}</div></div>${thumb ? `<img class="bsth" src="${esc(thumb.url)}" alt="" loading="lazy">` : ''}</div>`;
    }).join('') + (data.length === 40 ? '<button class="btn sec sm" id="bsMore" style="margin:8px auto;display:block">Carregar mais</button>' : '') : '<div class="empty">Nada encontrado.</div>';
    box.querySelectorAll('[data-bsgo]').forEach(b => b.onclick = () => bsGo(b.dataset.bsgo, b.dataset.bsch));
    const mo = box.querySelector('#bsMore'); if(mo) mo.onclick = () => run(true);
  };
  const later = () => { clearTimeout(t); t = setTimeout(() => run(false), 300); };
  q.oninput = later;
  ['#bsWho', '#bsWhere', '#bsHas', '#bsWhen', '#bsFrom', '#bsTo'].forEach(id => { const x = $e(id); if(x) x.onchange = () => run(false); });
  $e('#bsPin').onclick = () => { f.pinned = !f.pinned; $e('#bsPin').classList.toggle('on', f.pinned); run(false); };
  $e('#bsMe').onclick = () => { f.me = !f.me; $e('#bsMe').classList.toggle('on', f.me); run(false); };
  $e('#bsClr').onclick = () => { BS.f = null; showSearch(anchor); };
  run(false);
};
async function bsGo(mid, cid){
  closeMenu();
  if(cid === M.cid){ jumpTo(mid); return; }
  const c = findChannel(cid); if(!c || !c.server_id) return;
  go({ kind: 'server', sid: c.server_id, cid });
  for(let i = 0; i < 40; i++){ await new Promise(r => setTimeout(r, 150)); if(M.cid === cid && M.el && M.done !== undefined && !M.el.querySelector('.skel')) break; }
  if(M.cid === cid) jumpTo(mid);
}
