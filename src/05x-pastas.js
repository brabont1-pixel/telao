/* =====================================================================
   v6.14: ORDEM E PASTAS DOS SERVIDORES NA BARRA (só os servidores; o resto da barra não mexe).
   Arrastar no computador (solte em cima de outro servidor para criar uma pasta), segurar no celular
   para abrir o menu, ou usar "Organizar servidores". Fica salvo na conta (tabela user_prefs).
   ===================================================================== */
const RL = { items: null, loaded: false, saving: null };
const FOLD_COLORS = ['#5865f2', '#ff4fa3', '#b6ff2e', '#ffbe3b', '#3ba7ff', '#a36bff', '#ff6b4a', '#2ee6c5'];
const rlKey = () => 'telaoRail:' + (S.me && S.me.id);
const newFid = () => 'f' + Math.random().toString(36).slice(2, 9);

function rlRaw(){
  if(RL.items) return RL.items;
  try{ RL.items = JSON.parse(localStorage.getItem(rlKey()) || '[]'); }catch(e){ RL.items = []; }
  if(!Array.isArray(RL.items)) RL.items = [];
  return RL.items;
}
/* deixa a lista certinha: cada servidor uma vez, novos no fim, pastas vazias somem */
function railItems(){
  const have = new Set(S.servers.map(s => s.id)), seen = new Set(), out = [];
  rlRaw().forEach(it => {
    if(typeof it === 'string'){ if(have.has(it) && !seen.has(it)){ seen.add(it); out.push(it); } return; }
    if(!it || typeof it !== 'object' || !Array.isArray(it.sids)) return;
    const sids = it.sids.filter(x => have.has(x) && !seen.has(x)); sids.forEach(x => seen.add(x));
    if(sids.length) out.push({ id: it.id || newFid(), name: String(it.name || '').slice(0, 32), color: /^#[0-9a-f]{6}$/i.test(it.color || '') ? it.color : FOLD_COLORS[0], open: !!it.open, sids });
  });
  S.servers.forEach(s => { if(!seen.has(s.id)) out.push(s.id); });
  return out;
}
async function loadRail(){
  if(!S.me) return;
  RL.loaded = true;
  const { data, error } = await App.sb.from('user_prefs').select('rail').eq('user_id', S.me.id).maybeSingle();
  if(!error && data && Array.isArray(data.rail)){
    RL.items = data.rail; try{ localStorage.setItem(rlKey(), JSON.stringify(data.rail)); }catch(e){}
    renderRail();
  }
}
function saveRail(items){
  RL.items = items;
  try{ localStorage.setItem(rlKey(), JSON.stringify(items)); }catch(e){}
  renderRail();
  clearTimeout(RL.saving);
  RL.saving = setTimeout(async () => {
    const { error } = await App.sb.from('user_prefs').upsert({ user_id: S.me.id, rail: items, updated_at: new Date().toISOString() });
    if(error && !/user_prefs|does not exist|PGRST20|schema cache/i.test(error.message || '')) App.toast('Não deu para salvar a ordem: ' + error.message, true);
  }, 400);
}
const rlClone = items => items.map(it => typeof it === 'string' ? it : { ...it, sids: it.sids.slice() });
const foldOf = (items, sid) => items.find(it => typeof it !== 'string' && it.sids.includes(sid));
function takeOut(items, sid){
  const i = items.indexOf(sid); if(i >= 0){ items.splice(i, 1); return; }
  const f = foldOf(items, sid); if(f){ f.sids.splice(f.sids.indexOf(sid), 1); if(!f.sids.length) items.splice(items.indexOf(f), 1); }
}
const topIndexOf = (items, sid) => { const i = items.indexOf(sid); if(i >= 0) return i; const f = foldOf(items, sid); return f ? items.indexOf(f) : -1; };
const srvName = sid => (S.servers.find(s => s.id === sid) || {}).name || 'Servidor';
const foldTitle = f => f.name || f.sids.slice(0, 3).map(srvName).join(', ') + (f.sids.length > 3 ? '…' : '');

/* ---------- desenho ---------- */
const _renderRailP = renderRail;
renderRail = function(){
  _renderRailP.apply(this, arguments);
  const rail = $('#rail'), add = $('#rAdd'); if(!rail || !add || !S.me) return;
  if(!RL.loaded) loadRail();
  const btns = new Map([...rail.querySelectorAll('.ricon.srv[data-sid]')].map(b => [b.dataset.sid, b]));
  const frag = document.createDocumentFragment();
  const cur = S.route.kind === 'server' ? S.route.sid : null;
  railItems().forEach(it => {
    if(typeof it === 'string'){ const b = btns.get(it); if(b) frag.appendChild(b); return; }
    const wrap = document.createElement('div');
    const unread = it.sids.some(sid => btns.get(sid) && btns.get(sid).classList.contains('unread'));
    const has = it.sids.includes(cur);
    wrap.className = 'rfold' + (it.open ? ' open' : ''); wrap.dataset.fid = it.id; wrap.style.setProperty('--fc', it.color);
    const minis = it.sids.slice(0, 4).map(sid => { const s = S.servers.find(x => x.id === sid); return s ? `<span class="rmini" style="--sc:${esc(s.icon_color)}">${serverIcon(s)}</span>` : ''; }).join('');
    wrap.innerHTML = `<button class="ricon rfh ${!it.open && has ? 'on' : ''} ${!it.open && unread ? 'unread' : ''}" data-fid="${it.id}" data-tip="${esc(foldTitle(it))}" data-tipsub="${it.sids.length} servidor${it.sids.length === 1 ? '' : 'es'}" data-tipside="r">${it.open ? ic('folder', 22) : `<span class="rminis n${Math.min(4, it.sids.length)}">${minis}</span>`}</button>`;
    it.sids.forEach(sid => { const b = btns.get(sid); if(!b) return; if(it.open) wrap.appendChild(b); else b.remove(); });
    frag.appendChild(wrap);
  });
  rail.insertBefore(frag, add);
  rail.querySelectorAll('.rfh').forEach(b => b.onclick = () => {
    const items = rlClone(railItems()), f = items.find(x => typeof x !== 'string' && x.id === b.dataset.fid);
    if(f){ f.open = !f.open; saveRail(items); }
  });
  rail.querySelectorAll('.ricon.srv[data-sid], .rfh').forEach(el => {
    el.oncontextmenu = e => { e.preventDefault(); if(RD.on) return; el.dataset.fid ? folderMenu(el.dataset.fid, e.clientX, e.clientY) : railSrvMenu(el.dataset.sid, e.clientX, e.clientY); };
    bindRailDrag(el);
  });
};

/* ---------- arrastar (mouse) ---------- */
const RD = { on: false };
function rdClean(){
  document.getElementById('railGhost')?.remove(); document.getElementById('railLine')?.remove();
  document.querySelectorAll('.rdrop,.rdragging').forEach(x => x.classList.remove('rdrop', 'rdragging'));
  RD.on = false; RD.target = null;
}
function bindRailDrag(el){
  el.addEventListener('pointerdown', e => {
    if(e.button !== 0 || e.pointerType !== 'mouse') return;
    const sx = e.clientX, sy = e.clientY; let started = false;
    const mv = ev => {
      if(!started){ if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; started = true; rdStart(el, ev); }
      ev.preventDefault(); rdMove(ev.clientX, ev.clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if(started){
        rdDrop();
        const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
        el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 50);
      }
    };
    window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up);
  });
}
function rdStart(el, ev){
  RD.on = true; RD.sid = el.dataset.sid || null; RD.fid = el.dataset.fid || null; RD.target = null;
  el.classList.add('rdragging');
  const g = el.cloneNode(true); g.id = 'railGhost'; g.classList.remove('on', 'rdragging'); document.body.appendChild(g);
  const l = document.createElement('div'); l.id = 'railLine'; document.body.appendChild(l);
  document.querySelectorAll('.tip, #tip').forEach(t => t.classList && t.classList.add('hidden'));
}
function rdMove(x, y){
  const g = document.getElementById('railGhost'); if(g){ g.style.left = (x - 25) + 'px'; g.style.top = (y - 25) + 'px'; }
  const rail = $('#rail'), line = document.getElementById('railLine'); line.style.display = 'none';
  document.querySelectorAll('.rdrop').forEach(z => z.classList.remove('rdrop'));
  const rr = rail.getBoundingClientRect();
  if(y < rr.top + 24) rail.scrollTop -= 8; else if(y > rr.bottom - 24) rail.scrollTop += 8;
  if(x > rr.right + 40){ RD.target = null; return; }
  const cand = [...rail.querySelectorAll('.ricon.srv[data-sid], .rfh')].filter(b => b.dataset.sid !== RD.sid && b.dataset.fid !== RD.fid && !(RD.fid && b.closest(`.rfold[data-fid="${RD.fid}"]`)));
  if(!cand.length){ RD.target = null; return; }
  // o ícone mais perto na vertical
  let best = null, bd = 1e9;
  cand.forEach(b => { const r = b.getBoundingClientRect(), d = Math.abs(y - (r.top + r.height / 2)); if(d < bd){ bd = d; best = b; } });
  const r = best.getBoundingClientRect(), rel = (y - r.top) / r.height;
  const canJoin = !RD.fid && rel > 0.28 && rel < 0.72;
  if(canJoin){ best.classList.add('rdrop'); RD.target = { join: best.dataset.sid || null, fold: best.dataset.fid || null }; return; }
  const after = rel >= 0.5;
  line.style.display = 'block'; line.style.left = (rr.left + 8) + 'px'; line.style.width = (rr.width - 16) + 'px';
  line.style.top = ((after ? r.bottom + 4 : r.top - 6)) + 'px';
  RD.target = { ref: best.dataset.sid || null, refFold: best.dataset.fid || null, after };
}
function rdDrop(){
  const { sid, fid, target } = RD; rdClean();
  if(!target) return;
  const items = rlClone(railItems());
  if(fid){
    // mover uma pasta inteira (fica sempre no nível de cima)
    const f = items.find(x => typeof x !== 'string' && x.id === fid); if(!f) return;
    items.splice(items.indexOf(f), 1);
    let i = target.refFold ? items.findIndex(x => typeof x !== 'string' && x.id === target.refFold) : topIndexOf(items, target.ref);
    if(i < 0) i = items.length; else if(target.after) i++;
    items.splice(i, 0, f); saveRail(items); return;
  }
  if(target.join || target.fold){
    takeOut(items, sid);
    if(target.fold){ const f = items.find(x => typeof x !== 'string' && x.id === target.fold); if(f){ f.sids.push(sid); saveRail(items); } return; }
    const f = foldOf(items, target.join);
    if(f){ f.sids.splice(f.sids.indexOf(target.join) + 1, 0, sid); }
    else{ const i = items.indexOf(target.join); if(i < 0) return; items.splice(i, 1, { id: newFid(), name: '', color: FOLD_COLORS[items.filter(x => typeof x !== 'string').length % FOLD_COLORS.length], open: true, sids: [target.join, sid] }); }
    saveRail(items); return;
  }
  takeOut(items, sid);
  if(target.refFold){
    let i = items.findIndex(x => typeof x !== 'string' && x.id === target.refFold); if(i < 0) i = items.length; else if(target.after && !items[i].open) i++;
    if(target.after && items[i] && typeof items[i] !== 'string' && items[i].id === target.refFold){ items[i].sids.unshift(sid); }   // pasta aberta: entra no começo dela
    else items.splice(i, 0, sid);
  }else{
    const f = foldOf(items, target.ref);
    if(f){ f.sids.splice(f.sids.indexOf(target.ref) + (target.after ? 1 : 0), 0, sid); }
    else{ let i = items.indexOf(target.ref); if(i < 0) i = items.length; else if(target.after) i++; items.splice(i, 0, sid); }
  }
  saveRail(items);
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && RD.on) rdClean(); });

/* ---------- menus ---------- */
function moveTop(sid, dir){
  const items = rlClone(railItems()), f = foldOf(items, sid);
  const list = f ? f.sids : items, i = list.indexOf(sid), j = i + dir;
  if(j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; saveRail(items);
}
function railSrvMenu(sid, x, y){
  const s = S.servers.find(z => z.id === sid); if(!s) return;
  const items = railItems(), f = foldOf(items, sid), folders = items.filter(z => typeof z !== 'string' && z !== f);
  const up = ic('chevDown', 18).replace('<svg', '<svg style="transform:rotate(180deg)"');
  const list = [
    { label: 'Mover para cima', icon: up, onClick: () => moveTop(sid, -1) },
    { label: 'Mover para baixo', icon: ic('chevDown', 18), onClick: () => moveTop(sid, 1) },
    '-',
    { label: 'Criar pasta com este servidor', icon: ic('folder', 18), onClick: () => {
      const it = rlClone(railItems()), at = topIndexOf(it, sid); takeOut(it, sid);
      const nf = { id: newFid(), name: '', color: FOLD_COLORS[it.filter(z => typeof z !== 'string').length % FOLD_COLORS.length], open: true, sids: [sid] };
      it.splice(Math.min(Math.max(at, 0), it.length), 0, nf); saveRail(it); folderEdit(nf.id);
    } },
    ...folders.slice(0, 8).map(fo => ({ label: 'Pôr na pasta “' + foldTitle(fo).slice(0, 24) + '”', icon: ic('folder', 18), onClick: () => {
      const it = rlClone(railItems()); takeOut(it, sid); const t = it.find(z => typeof z !== 'string' && z.id === fo.id); if(t){ t.sids.push(sid); saveRail(it); }
    } })),
  ];
  if(f) list.push({ label: 'Tirar da pasta', icon: ic('logout', 18), onClick: () => {
    const it = rlClone(railItems()), t = it.find(z => typeof z !== 'string' && z.id === f.id), at = it.indexOf(t);
    takeOut(it, sid); it.splice(it.indexOf(t) >= 0 ? it.indexOf(t) + 1 : at, 0, sid); saveRail(it);
  } });
  list.push('-', { label: 'Organizar servidores', icon: ic('sliders', 18), onClick: railOrderModal });
  menu(x, y, list);
}
function folderMenu(fid, x, y){
  const up = ic('chevDown', 18).replace('<svg', '<svg style="transform:rotate(180deg)"');
  const mv = dir => { const it = rlClone(railItems()), i = it.findIndex(z => typeof z !== 'string' && z.id === fid), j = i + dir; if(i < 0 || j < 0 || j >= it.length) return; [it[i], it[j]] = [it[j], it[i]]; saveRail(it); };
  menu(x, y, [
    { label: 'Nome e cor da pasta', icon: ic('edit', 18), onClick: () => folderEdit(fid) },
    { label: 'Mover para cima', icon: up, onClick: () => mv(-1) },
    { label: 'Mover para baixo', icon: ic('chevDown', 18), onClick: () => mv(1) },
    { label: 'Organizar servidores', icon: ic('sliders', 18), onClick: railOrderModal },
    '-',
    { label: 'Desfazer pasta', icon: ic('trash', 18), danger: true, onClick: () => {
      const it = rlClone(railItems()), i = it.findIndex(z => typeof z !== 'string' && z.id === fid); if(i < 0) return;
      it.splice(i, 1, ...it[i].sids); saveRail(it); App.toast('Pasta desfeita. Os servidores continuam na barra.');
    } },
  ]);
}
function folderEdit(fid){
  const f = railItems().find(z => typeof z !== 'string' && z.id === fid); if(!f) return;
  let color = f.color;
  modal(`<div class="mh"><h2>Pasta de servidores</h2><p>${f.sids.map(srvName).map(esc).join(', ')}</p></div>
    <div class="mc"><label class="field"><span>Nome da pasta</span><input class="inp" id="pfN" maxlength="32" value="${esc(f.name)}" placeholder="${esc(foldTitle({ ...f, name: '' }))}"></label>
      <div class="field"><span>Cor</span><div class="pfcolors">${FOLD_COLORS.map(c => `<button class="pfc ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div></div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="pfGo">Salvar</button></div>`, m => {
    m.querySelectorAll('.pfc').forEach(b => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('.pfc').forEach(z => z.classList.toggle('on', z === b)); });
    const save = () => { const it = rlClone(railItems()), t = it.find(z => typeof z !== 'string' && z.id === fid); if(t){ t.name = m.querySelector('#pfN').value.trim().slice(0, 32); t.color = color; saveRail(it); } closeModal(); };
    m.querySelector('#pfGo').onclick = save;
    m.querySelector('#pfN').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); save(); } };
  });
}

/* ---------- tela "Organizar servidores" (funciona no celular também) ---------- */
function railOrderModal(){
  let items = rlClone(railItems());
  const draw = m => {
    const up = ic('chevDown', 16).replace('<svg', '<svg style="transform:rotate(180deg)"'), dn = ic('chevDown', 16);
    const folders = items.filter(z => typeof z !== 'string');
    const sel = (sid, cur) => `<select class="inp ordsel" data-mv="${sid}"><option value="">Sem pasta</option>${folders.map(f => `<option value="${f.id}" ${cur === f.id ? 'selected' : ''}>${esc(foldTitle(f).slice(0, 22))}</option>`).join('')}</select>`;
    const srow = (sid, inF) => { const s = S.servers.find(z => z.id === sid); return `<div class="ordrow ${inF ? 'in' : ''}"><span class="rmini big" style="--sc:${esc(s ? s.icon_color : '#555')}">${s ? serverIcon(s) : ''}</span><b>${esc(srvName(sid))}</b>${sel(sid, inF)}<button class="ibtn" data-up="${sid}" aria-label="Subir">${up}</button><button class="ibtn" data-dn="${sid}" aria-label="Descer">${dn}</button></div>`; };
    m.querySelector('#roL').innerHTML = items.map(it => typeof it === 'string' ? srow(it, null)
      : `<div class="ordgrp" style="--fc:${it.color}"><div class="ordrow fold"><span class="pfdot"></span>${ic('folder', 16)}<input class="inp ordfn" data-fn="${it.id}" maxlength="32" value="${esc(it.name)}" placeholder="${esc(foldTitle({ ...it, name: '' }).slice(0, 30))}" aria-label="Nome da pasta"><button class="ibtn" data-up="${it.id}" aria-label="Subir">${up}</button><button class="ibtn" data-dn="${it.id}" aria-label="Descer">${dn}</button></div>${it.sids.map(sid => srow(sid, it.id)).join('')}</div>`).join('') || '<p class="mut">Você ainda não está em nenhum servidor.</p>';
    m.querySelectorAll('[data-up],[data-dn]').forEach(b => b.onclick = () => {
      const id = b.dataset.up || b.dataset.dn, dir = b.dataset.up ? -1 : 1;
      const f = items.find(z => typeof z !== 'string' && z.id === id);
      const list = f ? items : (foldOf(items, id) || {}).sids || items, ref = f || id, i = list.indexOf(ref), j = i + dir;
      if(i >= 0 && j >= 0 && j < list.length){ [list[i], list[j]] = [list[j], list[i]]; draw(m); }
    });
    m.querySelectorAll('[data-mv]').forEach(sl => sl.onchange = () => {
      const sid = sl.dataset.mv, at = topIndexOf(items, sid); takeOut(items, sid);
      const t = items.find(z => typeof z !== 'string' && z.id === sl.value);
      if(t) t.sids.push(sid); else items.splice(Math.min(at + 1, items.length), 0, sid);
      draw(m);
    });
    m.querySelectorAll('[data-fn]').forEach(inp => inp.oninput = () => { const f = items.find(z => typeof z !== 'string' && z.id === inp.dataset.fn); if(f) f.name = inp.value.trim().slice(0, 32); });
  };
  modal(`<div class="mh"><h2>Organizar servidores</h2><p>Mude a ordem e junte servidores em pastas. Só você vê assim.</p></div>
    <div class="mc"><div class="ordlist" id="roL"></div><button class="btn sec sm" id="roNew">${ic('folder', 16)} Nova pasta</button></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="roGo">Salvar</button></div>`, m => {
    draw(m);
    m.querySelector('#roNew').onclick = () => {
      const first = items.find(z => typeof z === 'string');
      if(!first){ App.toast('Todos os servidores já estão em pastas.'); return; }
      items.splice(items.indexOf(first), 1, { id: newFid(), name: 'Nova pasta', color: FOLD_COLORS[items.filter(z => typeof z !== 'string').length % FOLD_COLORS.length], open: true, sids: [first] });
      draw(m);
    };
    m.querySelector('#roGo').onclick = () => { saveRail(items.filter(z => typeof z === 'string' || z.sids.length)); closeModal(); App.toast('Ordem dos servidores salva.'); };
  });
}
App.railOrderModal = railOrderModal;
