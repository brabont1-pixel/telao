/* =====================================================================
   v6.10: GERENCIAR CANAIS E CATEGORIAS + IMPULSOS ILIMITADOS DO DONO DO TELÃO
   ===================================================================== */
S.cats = new Map(); // server_id -> [{ name, position }]
let catsRt = null;
async function loadCats(sid){
  const { data } = await App.sb.from('server_categories').select('name, position').eq('server_id', sid).order('position');
  S.cats.set(sid, data || []);
  if(!catsRt) catsRt = App.sb.channel('cats-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'server_categories' }, async p => {
    const sid2 = (p.new && p.new.server_id) || (p.old && p.old.server_id) || (S.route.kind === 'server' && S.route.sid);
    if(sid2 && S.channels.has(sid2)){ await loadCats(sid2); if(S.route.kind === 'server' && S.route.sid === sid2) renderSidebar(); }
  }).subscribe();
}
const _loadChannelsG = loadChannels;
loadChannels = async function(sid){ const r = await _loadChannelsG.apply(this, arguments); try{ await loadCats(sid); }catch(e){} return r; };

/* grupos na ordem certa: sem categoria (texto, voz) primeiro, depois as categorias (inclusive vazias) */
function channelGroups(s, list){
  const out = [];
  const t = list.filter(c => !c.category && c.kind === 'text'), v = list.filter(c => !c.category && c.kind === 'voice');
  if(t.length) out.push({ title: 'Canais de texto', cat: null, kind: 'text', chs: t });
  if(v.length) out.push({ title: 'Canais de voz', cat: null, kind: 'voice', chs: v });
  const cats = (S.cats.get(s.id) || []).map(c => c.name);
  list.forEach(c => { if(c.category && !cats.includes(c.category)) cats.push(c.category); });
  cats.forEach(name => out.push({ title: name, cat: name, kind: null, chs: list.filter(c => c.category === name) }));
  return out;
}

/* ---------- categorias ---------- */
createCategoryModal = function(s){
  modal(`<form id="cgF"><div class="mh"><h2>Criar categoria</h2><p>Agrupe os canais (ex.: “Jogos”, “Avisos”). Depois é só arrastar canais para dentro dela ou criar canais pelo + da categoria.</p></div>
    <div class="mc"><label class="field"><span>Nome da categoria</span><input class="inp" id="cgN" maxlength="40" required placeholder="Jogos"></label><div class="err" id="cgE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar categoria</button></div></form>`, m => {
    m.querySelector('#cgF').onsubmit = async e => {
      e.preventDefault();
      const n = m.querySelector('#cgN').value.trim(); if(!n) return;
      const { error } = await App.sb.rpc('category_save', { p_server: s.id, p_old: null, p_new: n, p_kind: null });
      if(error){ m.querySelector('#cgE').textContent = errMsg(error); return; }
      closeModal(); await loadCats(s.id); renderSidebar(); App.toast(`Categoria “${n}” criada`);
    };
  });
};
function renameCategoryModal(s, cat, kind, title){
  modal(`<form id="rcF"><div class="mh"><h2>Renomear categoria</h2>${cat ? '' : `<p>“${esc(title)}” é o grupo automático dos canais sem categoria. Ao dar um nome, ele vira uma categoria de verdade.</p>`}</div>
    <div class="mc"><label class="field"><span>Nome</span><input class="inp" id="rcN" maxlength="40" required value="${esc(cat || '')}" placeholder="${esc(title)}"></label><div class="err" id="rcE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    const inp = m.querySelector('#rcN'); setTimeout(() => { inp.focus(); inp.select(); }, 50);
    m.querySelector('#rcF').onsubmit = async e => {
      e.preventDefault();
      const n = inp.value.trim(); if(!n || n === cat) { closeModal(); return; }
      const { error } = await App.sb.rpc('category_save', { p_server: s.id, p_old: cat || null, p_new: n, p_kind: cat ? null : kind });
      if(error){ m.querySelector('#rcE').textContent = errMsg(error); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); App.toast('Categoria renomeada');
    };
  });
}
function deleteCategoryModal(s, cat){
  const chs = (S.channels.get(s.id) || []).filter(c => c.category === cat);
  modal(`<div class="mh"><h2>Excluir “${esc(cat)}”</h2><p>${chs.length ? `Essa categoria tem ${chs.length} canal${chs.length > 1 ? 'is' : ''}. O que fazer com ${chs.length > 1 ? 'eles' : 'ele'}?` : 'A categoria está vazia.'}</p></div>
    ${chs.length ? `<div class="mc"><label class="radiorow"><input type="radio" name="dcO" value="keep" checked><span><b>Manter os canais</b><small>Eles vão para “sem categoria”, com todas as mensagens.</small></span></label>
      <label class="radiorow danger"><input type="radio" name="dcO" value="del"><span><b>Apagar os canais junto</b><small>Apaga ${chs.map(c => esc(c.name)).slice(0, 5).join(', ')}${chs.length > 5 ? '…' : ''} e as mensagens. Não dá para desfazer.</small></span></label></div>` : ''}
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn red" id="dcGo">Excluir categoria</button></div>`, m => {
    m.querySelector('#dcGo').onclick = async () => {
      const del = !!m.querySelector('input[name="dcO"][value="del"]:checked');
      const { error } = await App.sb.rpc('category_delete', { p_server: s.id, p_name: cat, p_delete_channels: del });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); App.toast('Categoria excluída');
    };
  });
}
async function moveCategory(s, cat, dir){
  const names = channelGroups(s, S.channels.get(s.id) || []).filter(g => g.cat).map(g => g.cat);
  const i = names.indexOf(cat), j = i + dir; if(i < 0 || j < 0 || j >= names.length) return;
  [names[i], names[j]] = [names[j], names[i]];
  S.cats.set(s.id, names.map((name, k) => ({ name, position: k + 1 }))); renderSidebar();
  const { error } = await App.sb.rpc('layout_save', { p_server: s.id, p_cats: names, p_channels: null, p_channel_cats: null });
  if(error){ App.toast(errMsg(error), true); await loadCats(s.id); renderSidebar(); }
}
function categoryMenu(s, el, x, y){
  const cat = el.dataset.catname || null, kind = el.dataset.catkind || null, title = el.querySelector('span').textContent.trim();
  const items = [
    { label: 'Criar canal de texto', icon: ic('hash', 18), onClick: () => createChannelModal(s, 'text', cat || '') },
    { label: 'Criar canal de voz', icon: ic('volume', 18), onClick: () => createChannelModal(s, 'voice', cat || '') },
    '-',
    { label: cat ? 'Renomear categoria' : 'Dar nome (virar categoria)', icon: ic('edit', 18), onClick: () => renameCategoryModal(s, cat, kind, title) },
  ];
  if(cat){
    items.push({ label: 'Mover para cima', icon: ic('chevDown', 18).replace('<svg', '<svg style="transform:rotate(180deg)"'), onClick: () => moveCategory(s, cat, -1) },
      { label: 'Mover para baixo', icon: ic('chevDown', 18), onClick: () => moveCategory(s, cat, 1) },
      '-', { label: 'Excluir categoria', icon: ic('trash', 18), danger: true, onClick: () => deleteCategoryModal(s, cat) });
  }
  menu(x, y, items);
}

/* ---------- canais: menu, mover, duplicar ---------- */
let saveLayout = async function(s, groups){
  const ids = [], cats = [];
  groups.forEach(g => g.chs.forEach(c => { ids.push(c.id); cats.push(g.cat || ''); }));
  // aplica na hora (sem esperar o banco)
  const list = S.channels.get(s.id) || [];
  ids.forEach((id, i) => { const c = list.find(x => x.id === id); if(c){ c.position = i + 1; c.category = cats[i] || null; } });
  renderSidebar();
  const { error } = await App.sb.rpc('layout_save', { p_server: s.id, p_cats: null, p_channels: ids, p_channel_cats: cats });
  if(error){ App.toast(error.message, true); await loadChannels(s.id); renderSidebar(); }
};
function currentGroups(s){
  const list = (S.channels.get(s.id) || []).slice().sort((a, b) => a.position - b.position);
  return channelGroups(s, list).map(g => ({ ...g, chs: g.chs.slice() }));
}
function moveChannel(s, cid, targetCat, beforeId, after){
  const groups = currentGroups(s);
  let ch = null;
  groups.forEach(g => { const i = g.chs.findIndex(c => c.id === cid); if(i >= 0) ch = g.chs.splice(i, 1)[0]; });
  if(!ch) return;
  // canal sem categoria vai para o grupo automático do tipo dele
  let g = targetCat ? groups.find(x => x.cat === targetCat) : groups.find(x => !x.cat && x.kind === ch.kind);
  if(!g){ g = { title: '', cat: targetCat || null, kind: ch.kind, chs: [] }; groups.push(g); }
  let idx = beforeId ? g.chs.findIndex(c => c.id === beforeId) : -1;
  if(idx < 0) idx = g.chs.length; else if(after) idx++;
  g.chs.splice(idx, 0, ch);
  saveLayout(s, groups);
}
function stepChannel(s, c, dir){
  const g = currentGroups(s).find(x => x.chs.some(y => y.id === c.id)); if(!g) return;
  const i = g.chs.findIndex(y => y.id === c.id), j = i + dir; if(j < 0 || j >= g.chs.length) return;
  moveChannel(s, c.id, g.cat, g.chs[j].id, dir > 0);
}
function moveToCategoryModal(s, c){
  const cats = channelGroups(s, S.channels.get(s.id) || []).filter(g => g.cat).map(g => g.cat);
  modal(`<div class="mh"><h2>Mover ${c.kind === 'text' ? '#' : ''}${esc(c.name)}</h2><p>Escolha a categoria.</p></div>
    <div class="mc"><div class="catpick"><button data-mv="">${ic('slash', 16)} Sem categoria</button>${cats.map(n => `<button data-mv="${esc(n)}" class="${c.category === n ? 'on' : ''}">${ic('folder', 16)} ${esc(n)}</button>`).join('')}
</div>
      <div class="catnew"><input class="inp" id="mvN" maxlength="40" placeholder="Ou crie uma categoria nova"><button class="btn sm" data-mvnew>Criar e mover</button></div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button></div>`, m => {
    m.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { closeModal(); moveChannel(s, c.id, b.dataset.mv || null); });
    m.querySelector('[data-mvnew]').onclick = () => {
      const n = m.querySelector('#mvN').value; if(!n || !n.trim()) return;
      App.sb.rpc('category_save', { p_server: s.id, p_old: null, p_new: n.trim(), p_kind: null }).then(async ({ error }) => {
        if(error){ App.toast(error.message, true); return; }
        closeModal(); await loadCats(s.id); moveChannel(s, c.id, n.trim());
      });
    };
  });
}
async function duplicateChannel(s, c){
  const { data, error } = await App.sb.rpc('channel_duplicate', { p_channel: c.id });
  if(error){ App.toast(error.message, true); return; }
  await loadChannels(s.id);
  const list = S.channels.get(s.id) || [];
  const nc = list.find(x => x.id === data);
  if(nc) moveChannel(s, nc.id, c.category, c.id, true); else renderSidebar();
  App.toast('Canal duplicado (com as mesmas configurações, sem as mensagens)');
}
function channelMenu(s, c, x, y){
  const items = [
    { label: 'Editar canal', icon: ic('gear', 18), onClick: () => editChannelModal(c) },
    { label: 'Duplicar canal', icon: ic('copy', 18), onClick: () => duplicateChannel(s, c) },
    { label: 'Mover para categoria…', icon: ic('folder', 18), onClick: () => moveToCategoryModal(s, c) },
    { label: 'Mover para cima', icon: ic('chevDown', 18).replace('<svg', '<svg style="transform:rotate(180deg)"'), onClick: () => stepChannel(s, c, -1) },
    { label: 'Mover para baixo', icon: ic('chevDown', 18), onClick: () => stepChannel(s, c, 1) },
    '-',
    { label: 'Apagar canal', icon: ic('trash', 18), danger: true, onClick: async () => {
      if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${c.kind === 'text' ? 'Todas as mensagens serão perdidas.' : ''}`, 'Apagar canal'))) return;
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true); else { await loadChannels(s.id); renderSidebar(); }
    } },
  ];
  menu(x, y, items);
}

/* erro de função que não existe no banco = falta rodar o supabase.sql novo */
const sqlMissing = e => e && (e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message || ''));
const errMsg = e => sqlMissing(e) ? 'Falta rodar o supabase.sql novo no Supabase (projeto do Telão) para isso funcionar.' : (e && e.message) || 'Algo deu errado';

/* salva a nova ordem; se o banco ainda não tem a função nova, salva canal por canal */
async function persistLayout(sid, ids, cats){
  const { error } = await App.sb.rpc('layout_save', { p_server: sid, p_cats: null, p_channels: ids, p_channel_cats: cats });
  if(!error) return null;
  if(!sqlMissing(error)) return error;
  for(let i = 0; i < ids.length; i++){
    const { error: e2 } = await App.sb.from('channels').update({ position: i + 1, category: cats[i] || null }).eq('id', ids[i]);
    if(e2) return e2;
  }
  return null;
}
saveLayout = async function(s, groups){
  const ids = [], cats = [];
  groups.forEach(g => g.chs.forEach(c => { ids.push(c.id); cats.push(g.cat || ''); }));
  const list = S.channels.get(s.id) || [];
  ids.forEach((id, i) => { const c = list.find(x => x.id === id); if(c){ c.position = i + 1; c.category = cats[i] || null; } });
  renderSidebar();
  const error = await persistLayout(s.id, ids, cats);
  if(error){ App.toast(errMsg(error), true); await loadChannels(s.id); renderSidebar(); }
};
async function saveCatOrder(s, names){
  S.cats.set(s.id, names.map((name, k) => ({ name, position: k + 1 }))); renderSidebar();
  const { error } = await App.sb.rpc('layout_save', { p_server: s.id, p_cats: names, p_channels: null, p_channel_cats: null });
  if(error){ App.toast(errMsg(error), true); await loadCats(s.id); renderSidebar(); }
}

/* ---------- arrastar e soltar estilo Discord (mouse e toque) ---------- */
const DR = { on: false };
function dragLine(){ let l = document.getElementById('dragLine'); if(!l){ l = document.createElement('div'); l.id = 'dragLine'; document.body.appendChild(l); } return l; }
function dragCleanup(){
  document.getElementById('dragGhost')?.remove(); document.getElementById('dragLine')?.remove();
  document.querySelectorAll('.dragging,.dropin').forEach(x => x.classList.remove('dragging', 'dropin'));
  document.body.classList.remove('isdragging');
  DR.on = false; DR.target = null;
}
function startDrag(s, el, kind, id, x, y){
  DR.on = true; DR.s = s; DR.kind = kind; DR.id = id; DR.el = el; DR.target = null;
  el.classList.add('dragging'); document.body.classList.add('isdragging');
  const g = el.cloneNode(true); g.id = 'dragGhost'; g.classList.remove('dragging', 'on');
  const rc = el.getBoundingClientRect(); g.style.width = rc.width + 'px'; DR.dx = x - rc.left; DR.dy = y - rc.top;
  document.body.appendChild(g); moveDrag(x, y);
  if(navigator.vibrate && kind) try{ navigator.vibrate(12); }catch(e){}
}
function moveDrag(x, y){
  const g = document.getElementById('dragGhost'); if(g){ g.style.left = (x - DR.dx) + 'px'; g.style.top = (y - DR.dy) + 'px'; }
  const body = document.getElementById('sbBody'); if(!body) return;
  // rola a lista quando chega perto da borda
  const br = body.getBoundingClientRect();
  if(y < br.top + 30) body.scrollTop -= 8; else if(y > br.bottom - 30) body.scrollTop += 8;
  const line = dragLine(); line.style.display = 'none';
  document.querySelectorAll('.dropin').forEach(z => z.classList.remove('dropin'));
  const under = document.elementFromPoint(x, y);
  if(!under || !body.contains(under)){ DR.target = null; return; }
  const place = (rect, after) => { line.style.display = 'block'; line.style.left = (rect.left + 6) + 'px'; line.style.width = (rect.width - 12) + 'px'; line.style.top = ((after ? rect.bottom : rect.top) - 1) + 'px'; };
  if(DR.kind === 'ch'){
    const ch = under.closest('.ch[data-cid]'), cat = under.closest('.cat[data-cat]'), empty = under.closest('.catempty');
    if(ch && ch.dataset.cid !== DR.id){
      const rc = ch.getBoundingClientRect(), after = y > rc.top + rc.height / 2;
      const c = (S.channels.get(DR.s.id) || []).find(z => z.id === ch.dataset.cid);
      DR.target = { cat: c ? c.category || null : null, before: ch.dataset.cid, after }; place(rc, after);
    }else if(cat){
      cat.classList.add('dropin');
      DR.target = { cat: cat.dataset.catname || null, top: true, kindOf: cat.dataset.catkind || null };
    }else if(empty){
      empty.classList.add('dropin'); DR.target = { cat: empty.dataset.dropcat || null };
    }else DR.target = null;
  }else{
    // categorias: a linha aparece entre as categorias
    const heads = [...body.querySelectorAll('.cat.real')].filter(h => h.dataset.catname !== DR.id);
    if(!heads.length){ DR.target = null; return; }
    let idx = heads.findIndex(h => { const r = h.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if(idx < 0) idx = heads.length;
    DR.target = { idx, names: heads.map(h => h.dataset.catname) };
    if(idx < heads.length) place(heads[idx].getBoundingClientRect(), false);
    else { const last = body.lastElementChild; place((last || heads[heads.length - 1]).getBoundingClientRect(), true); }
  }
}
function endDrag(){
  const { s, kind, id, target } = DR; dragCleanup();
  if(!target) return;
  if(kind === 'ch'){
    if(target.top){
      // soltou no nome da categoria: vai para o começo dela
      const g = currentGroups(s).find(x => (target.cat ? x.cat === target.cat : !x.cat && x.kind === target.kindOf));
      const first = g && g.chs.find(c => c.id !== id);
      moveChannel(s, id, target.cat, first ? first.id : null, false);
    }else moveChannel(s, id, target.cat, target.before || null, !!target.after);
  }else{
    const names = target.names.slice(); names.splice(target.idx, 0, id);
    saveCatOrder(s, names);
  }
}
function bindDrag(s, el, kind, id){
  el.addEventListener('pointerdown', e => {
    if(e.button !== 0 || e.target.closest('button,[data-edch],[data-catmenu],[data-new]')) return;
    const sx = e.clientX, sy = e.clientY, touch = e.pointerType !== 'mouse';
    let started = false, timer = null;
    const begin = (x, y) => { started = true; startDrag(s, el, kind, id, x, y); };
    if(touch) timer = setTimeout(() => begin(sx, sy), 380);   // no celular: segurar para arrastar
    const mv = ev => {
      if(started){ ev.preventDefault(); moveDrag(ev.clientX, ev.clientY); return; }
      const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
      if(touch){ if(d > 10){ clearTimeout(timer); cleanup(); } }
      else if(d > 6) begin(ev.clientX, ev.clientY);
    };
    const up = () => {
      clearTimeout(timer); cleanup();
      if(started){ endDrag(); const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 50); }
    };
    const cleanup = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
  if(kind) el.addEventListener('contextmenu', e => { if(DR.on) e.preventDefault(); });
  el.style.touchAction = 'pan-y';
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && DR.on){ dragCleanup(); } });

/* liga menus e arrastar na lista de canais */
const _renderSidebarG = renderSidebar;
renderSidebar = function(){
  const r = _renderSidebarG.apply(this, arguments);
  if(S.route.kind !== 'server' || DR.on) return r;
  const s = S.servers.find(x => x.id === S.route.sid); if(!s || !App.hasPerm(s.id, 1)) return r;
  const body = document.getElementById('sbBody'); if(!body) return r;
  const list = S.channels.get(s.id) || [];
  body.classList.add('canorder');
  body.querySelectorAll('[data-catmenu]').forEach(b => b.onclick = e => { e.stopPropagation(); const rc = b.getBoundingClientRect(); categoryMenu(s, b.closest('.cat'), rc.left, rc.bottom + 4); });
  body.querySelectorAll('.cat[data-cat]').forEach(el => el.oncontextmenu = e => { e.preventDefault(); if(!DR.on) categoryMenu(s, el, e.clientX, e.clientY); });
  body.querySelectorAll('.ch[data-cid]').forEach(el => {
    const c = list.find(x => x.id === el.dataset.cid); if(!c) return;
    el.oncontextmenu = e => { e.preventDefault(); if(!DR.on) channelMenu(s, c, e.clientX, e.clientY); };
    el.draggable = false;
    bindDrag(s, el, 'ch', c.id);
  });
  body.querySelectorAll('.cat.real').forEach(el => bindDrag(s, el, 'cat', el.dataset.catname));
  return r;
};

/* ---------- impulsos ilimitados para o dono do Telão ---------- */
const _boostModalA = boostServerModal;
boostServerModal = async function(s){
  if(!S.me.is_admin) return _boostModalA.apply(this, arguments);
  const mine = () => S.boosts.filter(b => b.user_id === S.me.id && b.server_id === s.id).length;
  const draw = m => {
    const n = boostCount(s.id), lv = serverLevel(s.id), next = LEVELS[lv + 1];
    m.querySelector('#abInfo').innerHTML = `<div class="abbig">${BOOST_SVG(30)}<b>${n}</b><span>impulso${n === 1 ? '' : 's'} no servidor · ${LEVELS[lv].nome}</span></div>
      <p class="mut small">${mine()} deles são seus. ${next ? `Faltam ${next.need - n} para o ${next.nome}.` : 'Nível máximo!'}</p>`;
    m.querySelector('#abMax').disabled = lv >= 3;
    m.querySelector('#abRm').disabled = !mine();
  };
  modal(`<div class="mh"><h2>${BOOST_SVG(22)} Impulsionar ${esc(s.name)}</h2><p>Você é o dono do Telão: seus impulsos são ilimitados e podem ser tirados quando quiser.</p></div>
    <div class="mc"><div id="abInfo"></div>
      <div class="abbtns"><button class="btn" data-ab="1">${BOOST_SVG(16)} +1 impulso</button><button class="btn sec" data-ab="5">+5</button><button class="btn sec" id="abMax">Até o nível 3</button><button class="btn sec" id="abRm">Tirar os meus</button></div><div class="err" id="abErr"></div></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    const run = async delta => {
      if(!delta) return;
      const { error } = await App.sb.rpc('admin_boost', { p_server: s.id, p_delta: delta });
      if(error){ App.toast(errMsg(error), true); m.querySelector('#abErr').textContent = errMsg(error); return; }
      m.querySelector('#abErr').textContent = '';
      await loadBoosts(); draw(m); renderSidebar(); renderMembers();
      if(delta > 0){ boostCelebrate(); App.toast(`+${delta} impulso${delta > 1 ? 's' : ''} em ${s.name}`); }
    };
    m.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => run(+b.dataset.ab));
    m.querySelector('#abMax').onclick = () => run(Math.max(0, 9 - boostCount(s.id)));
    m.querySelector('#abRm').onclick = () => run(-mine());
    draw(m);
  });
};
