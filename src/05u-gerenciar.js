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
      if(error){ m.querySelector('#cgE').textContent = error.message; return; }
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
      if(error){ m.querySelector('#rcE').textContent = error.message; return; }
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
  if(error){ App.toast(error.message, true); await loadCats(s.id); renderSidebar(); }
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
async function saveLayout(s, groups){
  const ids = [], cats = [];
  groups.forEach(g => g.chs.forEach(c => { ids.push(c.id); cats.push(g.cat || ''); }));
  // aplica na hora (sem esperar o banco)
  const list = S.channels.get(s.id) || [];
  ids.forEach((id, i) => { const c = list.find(x => x.id === id); if(c){ c.position = i + 1; c.category = cats[i] || null; } });
  renderSidebar();
  const { error } = await App.sb.rpc('layout_save', { p_server: s.id, p_cats: null, p_channels: ids, p_channel_cats: cats });
  if(error){ App.toast(error.message, true); await loadChannels(s.id); renderSidebar(); }
}
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

/* liga menus e arrastar-e-soltar na lista de canais */
const _renderSidebarG = renderSidebar;
renderSidebar = function(){
  const r = _renderSidebarG.apply(this, arguments);
  if(S.route.kind !== 'server') return r;
  const s = S.servers.find(x => x.id === S.route.sid); if(!s || !App.hasPerm(s.id, 1)) return r;
  const body = document.getElementById('sbBody'); if(!body) return r;
  const list = S.channels.get(s.id) || [];
  body.querySelectorAll('[data-catmenu]').forEach(b => b.onclick = e => { e.stopPropagation(); const rc = b.getBoundingClientRect(); categoryMenu(s, b.closest('.cat'), rc.left, rc.bottom + 4); });
  body.querySelectorAll('.cat[data-cat]').forEach(el => el.oncontextmenu = e => { e.preventDefault(); categoryMenu(s, el, e.clientX, e.clientY); });
  body.querySelectorAll('.ch[data-cid]').forEach(el => {
    const c = list.find(x => x.id === el.dataset.cid); if(!c) return;
    el.oncontextmenu = e => { e.preventDefault(); channelMenu(s, c, e.clientX, e.clientY); };
    if(isMobile()) return;
    el.draggable = true;
    el.ondragstart = e => { e.dataTransfer.setData('text/telao-ch', c.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); body.classList.add('dragging-ch'); };
    el.ondragend = () => { el.classList.remove('dragging'); body.classList.remove('dragging-ch'); body.querySelectorAll('.dropbefore,.dropafter,.dropin').forEach(x => x.classList.remove('dropbefore', 'dropafter', 'dropin')); };
    el.ondragover = e => {
      if(!e.dataTransfer.types.includes('text/telao-ch')) return; e.preventDefault();
      const rc = el.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2;
      el.classList.toggle('dropafter', after); el.classList.toggle('dropbefore', !after);
    };
    el.ondragleave = () => el.classList.remove('dropbefore', 'dropafter');
    el.ondrop = e => {
      const id = e.dataTransfer.getData('text/telao-ch'); if(!id || id === c.id) return; e.preventDefault();
      const rc = el.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2;
      moveChannel(s, id, c.category || null, c.id, after);
    };
  });
  // soltar em cima da categoria (ou da área vazia dela) põe o canal no fim dela
  body.querySelectorAll('.cat[data-cat], .catempty').forEach(el => {
    const cat = el.dataset.catname !== undefined ? el.dataset.catname : el.dataset.dropcat;
    el.ondragover = e => {
      if(e.dataTransfer.types.includes('text/telao-ch') || (e.dataTransfer.types.includes('text/telao-cat') && el.classList.contains('real'))){ e.preventDefault(); el.classList.add('dropin'); }
    };
    el.ondragleave = () => el.classList.remove('dropin');
    el.ondrop = e => {
      el.classList.remove('dropin');
      const id = e.dataTransfer.getData('text/telao-ch');
      if(id){ e.preventDefault(); moveChannel(s, id, cat || null); return; }
      const from = e.dataTransfer.getData('text/telao-cat');
      if(from && cat && from !== cat){
        e.preventDefault();
        const names = channelGroups(s, list).filter(g => g.cat).map(g => g.cat).filter(n => n !== from);
        names.splice(names.indexOf(cat), 0, from);
        S.cats.set(s.id, names.map((name, k) => ({ name, position: k + 1 }))); renderSidebar();
        App.sb.rpc('layout_save', { p_server: s.id, p_cats: names, p_channels: null, p_channel_cats: null }).then(({ error }) => { if(error) App.toast(error.message, true); });
      }
    };
  });
  if(!isMobile()) body.querySelectorAll('.cat.real').forEach(el => {
    el.draggable = true;
    el.ondragstart = e => { e.dataTransfer.setData('text/telao-cat', el.dataset.catname); el.classList.add('dragging'); };
    el.ondragend = () => el.classList.remove('dragging');
  });
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
      <div class="abbtns"><button class="btn" data-ab="1">${BOOST_SVG(16)} +1 impulso</button><button class="btn sec" data-ab="5">+5</button><button class="btn sec" id="abMax">Até o nível 3</button><button class="btn sec" id="abRm">Tirar os meus</button></div></div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    const run = async delta => {
      if(!delta) return;
      const { error } = await App.sb.rpc('admin_boost', { p_server: s.id, p_delta: delta });
      if(error){ App.toast(error.message, true); return; }
      await loadBoosts(); draw(m); renderSidebar(); renderMembers();
      if(delta > 0){ boostCelebrate(); App.toast(`+${delta} impulso${delta > 1 ? 's' : ''} em ${s.name}`); }
    };
    m.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => run(+b.dataset.ab));
    m.querySelector('#abMax').onclick = () => run(Math.max(0, 9 - boostCount(s.id)));
    m.querySelector('#abRm').onclick = () => run(-mine());
    draw(m);
  });
};
