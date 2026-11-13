/* ---------------- cargos e permissões ---------------- */
const PERMS = [
  [32, 'Administrador', 'Pode tudo (menos excluir o servidor). Cuidado!'],
  [2, 'Gerenciar servidor', 'Mudar nome, ícone, descrição e convites.'],
  [1, 'Gerenciar canais', 'Criar, editar, organizar e apagar canais.'],
  [16, 'Gerenciar cargos', 'Criar cargos e dar cargos para as pessoas.'],
  [4, 'Expulsar membros', 'Tirar pessoas do servidor.'],
  [8, 'Gerenciar mensagens', 'Apagar e fixar mensagens de qualquer pessoa.'],
  [64, 'Moderar membros', 'Dar castigo no chat e silenciar, ensurdecer ou desconectar pessoas da call.'],
  [128, 'Banir membros', 'Tirar do servidor e impedir de voltar.'],
  [256, 'Gerenciar eventos', 'Criar, editar e apagar eventos do servidor.'],
  [512, 'Gerenciar emojis', 'Enviar, renomear e apagar emojis do servidor.'],
];
S.roles = new Map();        // sid -> [roles]
S.memberRoles = new Map();  // sid -> Map(uid -> Set(roleId))
async function loadRoles(sid){
  const [{ data: roles }, { data: mr }] = await Promise.all([
    App.sb.from('server_roles').select('*').eq('server_id', sid).order('position', { ascending:false }),
    App.sb.from('member_roles').select('*').eq('server_id', sid),
  ]);
  S.roles.set(sid, roles || []);
  const map = new Map(); (mr || []).forEach(r => { if(!map.has(r.user_id)) map.set(r.user_id, new Set()); map.get(r.user_id).add(r.role_id); });
  S.memberRoles.set(sid, map);
}
const rolesOf = (sid, uid) => { const ids = S.memberRoles.get(sid)?.get(uid); return ids ? (S.roles.get(sid) || []).filter(r => ids.has(r.id)) : []; };
App.hasPerm = (sid, bit) => {
  const s = S.servers.find(x => x.id === sid); if(!s || !S.me) return false;
  if(s.owner_id === S.me.id) return true;
  return rolesOf(sid, S.me.id).some(r => (r.perms & bit) || (r.perms & 32));
};
App.roleColorOf = uid => {
  const s = curServer(); if(!s) return null;
  const r = rolesOf(s.id, uid).find(r => r.color && r.color !== '#99aab5');
  return r ? r.color : null;
};
App.rolesHtml = uid => {
  const s = curServer(); if(!s || !(S.members.get(s.id) || []).some(m => m.user_id === uid)) return '';
  const rs = rolesOf(s.id, uid);
  const owner = s.owner_id === uid;
  if(!rs.length && !owner) return '';
  return `<h6>Cargos em ${esc(s.name)}</h6><div class="rpills">${owner ? `<span class="rpill"><i style="background:#f0b232"></i>Dono</span>` : ''}${rs.map(r => `<span class="rpill"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>`).join('')}</div>`;
};
App.onRolesChange = async p => {
  const row = p.new && p.new.server_id ? p.new : p.old;
  const sids = row && row.server_id ? [row.server_id] : [...S.roles.keys()];
  for(const sid of sids) if(S.roles.has(sid)) await loadRoles(sid);
  renderMembers(); renderSidebar(); if(M.el) renderMsgList(false);
  if(SET && SET.kind === 'server' && SET.sec === 'roles') renderSettings();
};
App.roleAssignMenu = (s, uid, x, y) => {
  const all = S.roles.get(s.id) || [];
  if(!all.length){ App.toast('Esse servidor ainda não tem cargos. Crie em Configurações do servidor → Cargos.'); return; }
  const mine = new Set((S.memberRoles.get(s.id)?.get(uid)) || []);
  const isOwner = s.owner_id === S.me.id;
  menu(x, y, [{ raw: `<div class="pphead">${ic('shield',16)} Cargos de ${esc(prof(uid).display_name)}</div>` }].concat(all.map(r => ({
    raw: `<label class="rolechk ${(r.perms & 48) && !isOwner ? 'dis' : ''}"><input type="checkbox" data-role="${r.id}" ${mine.has(r.id)?'checked':''} ${(r.perms & 48) && !isOwner ? 'disabled' : ''}><i style="background:${esc(r.color)}"></i>${esc(r.name)}</label>`,
  }))), 'rolemenu');
  $$('#menu [data-role]').forEach(cb => cb.onchange = async () => {
    const q = cb.checked ? App.sb.from('member_roles').insert({ server_id: s.id, user_id: uid, role_id: cb.dataset.role })
                         : App.sb.from('member_roles').delete().eq('user_id', uid).eq('role_id', cb.dataset.role);
    const { error } = await q;
    if(error){ App.toast(error.message, true); cb.checked = !cb.checked; return; }
    await loadRoles(s.id); renderMembers();
  });
};

/* ---------------- membros (agrupados por cargo) ---------------- */
function renderMembers(){
  const el = $('#members');
  const s = curServer();
  const textView = S.route.kind === 'server' && (S.channels.get(s?.id) || []).find(c => c.id === S.route.cid)?.kind === 'text';
  const want = innerWidth <= 1100 ? !!S.memOverlay : S.showMembers !== false;
  document.body.classList.toggle('mem-open', !!(s && textView && want));
  if(!s || !S.members.has(s.id) || !want || !textView){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const roles = (S.roles.get(s.id) || []).filter(r => r.hoist);
  const mem = S.members.get(s.id).map(m => ({ ...m, p: prof(m.user_id) })).sort((a,b) => a.p.display_name.localeCompare(b.p.display_name));
  const groups = new Map(); roles.forEach(r => groups.set(r.id, { name: r.name, list: [] }));
  const online = [], off = [];
  mem.forEach(m => {
    if(!S.online.has(m.user_id) && m.user_id !== S.me.id){ off.push(m); return; }
    const top = rolesOf(s.id, m.user_id).find(r => r.hoist);
    if(top) groups.get(top.id).list.push(m); else online.push(m);
  });
  const activity = uid => { for(const metas of S.vp.values()){ const m = metas.find(x => x.user_id === uid && x.voice); if(m) return m.sharing ? `<span class="livetag" data-watch="${m.voice}" data-wsess="${m.session}">${ic('screenUp',12)} AO VIVO · Assistir</span>` : `${ic('volume',12)} Em chamada`; } return ''; };
  const row = m => {
    const color = App.roleColorOf(m.user_id);
    const sub = activity(m.user_id) || (App.actLine && App.actLine(m.p)) || (m.p.custom_status ? statusText(m.p) : '');
    return `<div class="mem ${S.online.has(m.user_id) || m.user_id === S.me.id ? '' : 'off'}" data-u="${m.user_id}">${avatar(m.p,'',true)}<div class="mt"><span class="nm" style="${color?`color:${color}`:''}">${nameHtml(m.p)}${m.user_id===s.owner_id?`<span class="crown" data-tip="Dono do servidor">${ic('crown',14)}</span>`:''}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  };
  let h = '';
  groups.forEach(g => { if(g.list.length) h += `<h4>${esc(g.name)} — ${g.list.length}</h4>${g.list.map(row).join('')}`; });
  if(online.length) h += `<h4>Online — ${online.length}</h4>${online.map(row).join('')}`;
  if(off.length) h += `<h4>Offline — ${off.length}</h4>${off.map(row).join('')}`;
  // como painel por cima (celular e telas menores): cabeçalho com botão de fechar
  if(innerWidth <= 1100) h = `<div class="memhead"><b>Membros <span>${mem.length}</span></b><button class="ibtn" id="memX" aria-label="Fechar membros">${ic('x', 20)}</button></div>` + h;
  el.innerHTML = h;
  const mx = el.querySelector('#memX'); if(mx) mx.onclick = () => { S.memOverlay = false; renderMembers(); const hb = document.getElementById('hMembers'); if(hb) hb.classList.remove('on'); };
  el.querySelectorAll('[data-watch]').forEach(b => b.onclick = e => { e.stopPropagation(); watchLive(b.dataset.watch, b.dataset.wsess); });
  el.querySelectorAll('[data-u]').forEach(r => r.onclick = e => { if(e.target.closest('[data-watch]')) return; const b = r.getBoundingClientRect(); userMenu(r.dataset.u, b.left - 330, b.top); });
}

/* ---------------- servidores: menus e modais ---------------- */
function serverMenu(s, e){
  const owner = s.owner_id === S.me.id;
  const r = $('#sbHead').getBoundingClientRect();
  const items = [{ label:'Impulsionar servidor', icon: BOOST_SVG(18), cls:'boostitem', onClick: () => boostServerModal(s) }, { label:'Convidar pessoas', icon: ic('userPlus',18), onClick: () => inviteModal(s) }, { label:'Estatísticas do servidor', icon: ic('poll',18), onClick: () => openSettings('server','stats', s) }];
  if(App.hasPerm(s.id, 2) || App.hasPerm(s.id, 16)) items.push({ label:'Configurações do servidor', icon: ic('gear',18), onClick: () => openSettings('server','overview', s) });
  if(App.hasPerm(s.id, 1)) items.push({ label:'Criar canal', icon: ic('plusCircle',18), onClick: () => createChannelModal(s, 'text') }, { label:'Criar categoria', icon: ic('folder',18), onClick: () => createCategoryModal(s) }, { label:'Ordenar canais e categorias', icon: ic('sliders',18), onClick: () => App.orderModal(s) });
  if(App.srvMenuExtra) items.push(...App.srvMenuExtra(s));
  items.push('-');
  if(owner) items.push({ label:'Excluir servidor', danger:true, icon: ic('trash',18), onClick: () => deleteServer(s) });
  else items.push({ label:'Sair do servidor', danger:true, icon: ic('logout',18), onClick: () => leaveServer(s) });
  menu(r.left + 8, r.bottom + 6, items, 'srvmenu');
}
function addServerModal(){
  modal(`<div class="mh"><h2>Adicionar um servidor</h2><p>Um servidor é onde você e seus amigos conversam, jogam e assistem juntos.</p></div>
    <div class="mc">
      <button class="choice" id="chCreate"><span class="e">${ic('plus',26)}</span><div><b>Criar o meu</b><small>Do zero, do seu jeito</small></div>${ic('chevRight',20)}</button>
      <div class="tpls">${[['🎮','Jogos'],['👥','Amigos'],['📚','Estudos'],['🎬','Filmes']].map(([e,n]) => `<button class="tpl" data-tpl="${n}"><span>${e}</span>${n}</button>`).join('')}</div>
      <button class="choice" id="chBackup"><span class="e">${ic('download',26)}</span><div><b>Criar a partir de um backup</b><small>Use um arquivo .json de backup do Telão</small></div>${ic('chevRight',20)}</button>
      <button class="choice" id="chTplD"><span class="e">${ic('folder',26)}</span><div><b>Usar um template do Discord ou Xenon</b><small>Cole o link (discord.new ou xenon.bot/templates)</small></div>${ic('chevRight',20)}</button>
      <button class="choice" id="chJoin"><span class="e">${ic('link',26)}</span><div><b>Entrar com um convite</b><small>Tem um link ou código? Cole aqui</small></div>${ic('chevRight',20)}</button>
    </div>`, m => {
    m.querySelector('#chCreate').onclick = () => createServerModal();
    m.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => createServerModal(b.dataset.tpl));
    m.querySelector('#chJoin').onclick = () => joinServerModal();
    m.querySelector('#chBackup').onclick = () => App.backupPick(bk => App.backupNewServer(bk));
    m.querySelector('#chTplD').onclick = () => App.templateModal(null);
  });
}
const TEMPLATES = {
  'Jogos': { text: ['geral','clipes-e-prints','procurando-time'], voice: ['Partida 1','Partida 2','Telão'] },
  'Amigos': { text: ['geral','memes','fotos'], voice: ['Resenha','Telão'] },
  'Estudos': { text: ['geral','duvidas','materiais'], voice: ['Sala de estudo','Telão'] },
  'Filmes': { text: ['geral','indicacoes','spoilers'], voice: ['Cinema','Telão'] },
};
function createServerModal(tpl){
  let iconFile = null;
  modal(`<form id="csF"><div class="mh"><h2>Personalize seu servidor</h2><p>Dê uma cara para ele com um nome e um ícone. Dá para mudar depois.</p></div>
    <div class="mc"><label class="upicon" id="csIc">${ic('camera',26)}<span>ÍCONE</span><input type="file" accept="image/*" id="csFile" hidden></label>
      <label class="field"><span>Nome do servidor</span><input class="inp" id="csN" maxlength="40" value="${tpl ? esc(tpl) + ' de ' : 'Servidor de '}${esc(S.me.display_name)}" required></label></div>
    <div class="mf"><button type="button" class="btn sec" id="csBack">Voltar</button><button class="btn" id="csGo">Criar</button></div></form>`, m => {
    m.querySelector('#csN').select();
    m.querySelector('#csBack').onclick = addServerModal;
    m.querySelector('#csFile').onchange = e => {
      iconFile = e.target.files[0]; if(!iconFile) return;
      m.querySelector('#csIc').innerHTML = `<img src="${URL.createObjectURL(iconFile)}" alt="">`;
    };
    m.querySelector('#csF').onsubmit = async e => {
      e.preventDefault(); m.querySelector('#csGo').disabled = true;
      const { data: sid, error } = await App.sb.rpc('create_server', { p_name: m.querySelector('#csN').value.trim() });
      if(error){ App.toast(error.message, true); m.querySelector('#csGo').disabled = false; return; }
      if(iconFile){ const url = await uploadSquare(iconFile, 'servers', 256).catch(() => null); if(url) await App.sb.from('servers').update({ icon_url: url }).eq('id', sid); }
      if(tpl && TEMPLATES[tpl]){
        const { data: chs } = await App.sb.from('channels').select('*').eq('server_id', sid);
        await Promise.all((chs || []).map(c => App.sb.from('channels').delete().eq('id', c.id)));
        const t = TEMPLATES[tpl]; let pos = 0;
        await App.sb.from('channels').insert(t.text.map(n => ({ server_id: sid, name: n, kind:'text', position: pos++ })).concat(t.voice.map(n => ({ server_id: sid, name: n, kind:'voice', position: pos++ }))));
      }
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Servidor criado. Agora é só convidar a galera.');
    };
  });
}
/* reduz imagem quadrada (ícones, avatares) — GIF passa direto */
async function uploadSquare(file, folder, size, bucket='media'){
  let blob = file, type = file.type;
  if(/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)){
    const bmp = await createImageBitmap(file); const s = Math.min(bmp.width, bmp.height);
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.min(size, s);
    cv.getContext('2d').drawImage(bmp, (bmp.width - s)/2, (bmp.height - s)/2, s, s, 0, 0, cv.width, cv.height);
    blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.88)); type = blob.type;
    if(type !== 'image/webp'){ blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); type = 'image/jpeg'; }
  }
  const ext = type.split('/')[1].replace('jpeg','jpg');
  const path = `${S.me.id}/${folder}-${Date.now().toString(36)}.${ext}`;
  const { error } = await App.sb.storage.from(bucket).upload(path, blob, { contentType: type, cacheControl:'31536000' });
  if(error) throw error;
  return App.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function parseInvite(v){ v = v.trim(); const m = v.match(/convite=([a-z0-9-]+)/i); return (m ? m[1] : v.split('/').pop()).toLowerCase(); }
function joinServerModal(prefill){
  modal(`<form id="jsF"><div class="mh"><h2>Entrar num servidor</h2><p>Cole o link ou o código de convite que te mandaram.</p></div>
    <div class="mc"><label class="field"><span>Link ou código do convite</span><input class="inp" id="jsC" value="${esc(typeof prefill==='string'?prefill:'')}" placeholder="https://.../#convite=a1b2c3d4" required></label>
      <small style="color:var(--mut)">Os convites são assim: <code>a1b2c3d4</code> ou <code>${esc(location.origin)}/#convite=a1b2c3d4</code></small></div>
    <div class="mf"><button type="button" class="btn sec" id="jsBack">Voltar</button><button class="btn">Entrar no servidor</button></div></form>`, m => {
    m.querySelector('#jsBack').onclick = addServerModal;
    m.querySelector('#jsF').onsubmit = async e => {
      e.preventDefault();
      const r = await App.joinWithRules('join_server', { p_code: parseInvite(m.querySelector('#jsC').value) });
      if(r.cancelled) return;
      const { data: sid, error } = r;
      if(error){ App.toast(error.message.includes('Convite') ? 'Convite inválido ou expirado.' : error.message, true); return; }
      closeModal(); await loadServers(); go({ kind:'server', sid }); App.toast('Bem-vindo(a) ao servidor');
    };
  });
}
function inviteJoinPrompt(code){ S.pendingInvite = null; joinServerModal(code); }
function inviteModal(s){
  const link = location.origin + '/#convite=' + s.invite_code;
  modal(`<div class="mh"><h2>Convide amigos para ${esc(s.name)}</h2><p>Mande o link. Quem abrir entra direto no servidor.</p></div>
    <div class="mc">
      ${S.friends.filter(f => f.status === 'accepted').length ? `<div class="invfriends">${S.friends.filter(f => f.status === 'accepted').slice(0, 20).map(f => { const p = prof(f.uid); const inS = (S.members.get(s.id) || []).some(m => m.user_id === f.uid);
        return `<div class="invf">${avatar(p,'sm',true)}<b>${esc(p.display_name)}</b><span class="grow"></span>${inS ? '<small>Já está aqui</small>' : `<button class="btn sm sec" data-inv="${f.uid}">Convidar</button>`}</div>`; }).join('')}</div>` : ''}
      <label class="field" style="margin-top:12px"><span>Ou mande o link de convite</span></label>
      <div class="copyrow"><input class="inp" readonly value="${esc(link)}" id="ivL"><button class="btn" id="ivC">Copiar</button></div>
      ${App.hasPerm(s.id, 2) ? '<p class="small mut" style="margin-top:12px">Vazou o link? <a id="ivR">Gerar um novo</a> (o antigo para de funcionar).</p>' : ''}</div>
    <div class="mf"><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelector('#ivC').onclick = () => { copy(link); m.querySelector('#ivC').textContent = 'Copiado!'; };
    m.querySelectorAll('[data-inv]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const { data: cid, error } = await App.sb.rpc('open_dm', { p_user: b.dataset.inv });
      if(error){ App.toast(error.message, true); b.disabled = false; return; }
      await App.sb.from('messages').insert({ channel_id: cid, content: `Entra no meu servidor **${s.name}** no Telão! 🎉\n${link}` });
      b.textContent = 'Enviado ✓';
    });
    const rg = m.querySelector('#ivR');
    if(rg) rg.onclick = async () => {
      const { data, error } = await App.sb.rpc('regenerate_invite', { p_server: s.id });
      if(error){ App.toast(error.message, true); return; }
      s.invite_code = data; inviteModal(s);
    };
  });
}
function createChannelModal(s, kind, category){
  const cats = [...new Set((S.channels.get(s.id) || []).map(c => c.category).filter(Boolean))];
  modal(`<form id="ccF"><div class="mh"><h2>Criar canal</h2></div>
    <div class="mc">
      <div class="ctype"><label><input type="radio" name="k" value="text" ${kind!=='voice'?'checked':''}><span class="ci">${ic('hash',22)}</span><div><b>Texto</b><small>Mensagens, imagens, GIFs, emojis e opiniões</small></div></label>
        <label><input type="radio" name="k" value="voice" ${kind==='voice'?'checked':''}><span class="ci">${ic('volume',22)}</span><div><b>Voz</b><small>Chamada, câmera e compartilhar tela</small></div></label>
        <label><input type="radio" name="k" value="radio" ${kind==='radio'?'checked':''}><span class="ci">📻</span><div><b>Rádio</b><small>Canal de voz com música que todo mundo pede e ouve junto</small></div></label></div>
      <label class="field"><span>Nome do canal</span><div class="inpic"><span id="ccIc">${ic(kind==='voice'?'volume':'hash',18)}</span><input class="inp" id="ccN" maxlength="40" placeholder="novo-canal" required></div></label>
      <label class="field"><span>Categoria (opcional)</span><input class="inp" id="ccC" maxlength="40" list="ccCats" value="${esc(category||'')}" placeholder="Ex: Jogos"><datalist id="ccCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar canal</button></div></form>`, m => {
    m.querySelectorAll('input[name=k]').forEach(r => r.onchange = () => m.querySelector('#ccIc').innerHTML = r.value === 'radio' ? '📻' : ic(r.value === 'voice' ? 'volume' : 'hash', 18));
    m.querySelector('#ccF').onsubmit = async e => {
      e.preventDefault();
      const k0 = m.querySelector('input[name=k]:checked').value, k = k0 === 'radio' ? 'voice' : k0;
      let name = m.querySelector('#ccN').value.trim();
      if(k === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
      if(!name) return;
      const list = S.channels.get(s.id) || [];
      const position = list.reduce((a,c) => Math.max(a, c.position), 0) + 1;
      const { data, error } = await App.sb.from('channels').insert({ server_id: s.id, name, kind: k, position, category: m.querySelector('#ccC').value.trim() || null, ...(k0 === 'radio' ? { radio: true } : {}) }).select().single();
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); go({ kind:'server', sid: s.id, cid: data.id });
    };
  });
}
function createCategoryModal(s){
  modal(`<form id="cgF"><div class="mh"><h2>Criar categoria</h2><p>Organize os canais em grupos (ex: “Jogos”, “Avisos”). Depois escolha a categoria ao criar ou editar um canal.</p></div>
    <div class="mc"><label class="field"><span>Nome da categoria</span><input class="inp" id="cgN" maxlength="40" required></label></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Criar e adicionar canal</button></div></form>`, m => {
    m.querySelector('#cgF').onsubmit = e => { e.preventDefault(); const n = m.querySelector('#cgN').value.trim(); if(n) createChannelModal(s, 'text', n); };
  });
}
function editChannelModal(c){
  const s = S.servers.find(x => x.id === c.server_id);
  const cats = [...new Set((S.channels.get(s.id) || []).map(x => x.category).filter(Boolean))];
  modal(`<form id="ecF"><div class="mh"><h2>${ic(c.kind==='text'?'hash':'volume',22)} Editar canal</h2></div>
    <div class="mc"><label class="field"><span>Nome</span><input class="inp" id="ecN" maxlength="40" value="${esc(c.name)}" required></label>
      <label class="field"><span>Tópico</span><textarea class="inp" id="ecT" maxlength="300" rows="3" placeholder="Diga para que serve este canal">${esc(c.topic || '')}</textarea></label>
      <label class="field"><span>Categoria</span><input class="inp" id="ecC" maxlength="40" list="ecCats" value="${esc(c.category || '')}" placeholder="Sem categoria"><datalist id="ecCats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
    <div class="mf" style="justify-content:space-between"><button type="button" class="btn red" id="ecDel">${ic('trash',16)} Apagar</button><span style="display:flex;gap:10px"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></span></div></form>`, m => {
    m.querySelector('#ecDel').onclick = async () => {
      if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${c.kind==='text'?'Todas as mensagens serão perdidas.':''}`, 'Apagar canal'))) return;
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true);
    };
    m.querySelector('#ecF').onsubmit = async e => {
      e.preventDefault();
      let name = m.querySelector('#ecN').value.trim(); if(c.kind === 'text') name = name.toLowerCase().replace(/\s+/g, '-');
      const { error } = await App.sb.from('channels').update({ name, topic: m.querySelector('#ecT').value.trim() || null, category: m.querySelector('#ecC').value.trim() || null }).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); renderMain(); App.toast('Canal atualizado');
    };
  });
}
async function deleteServer(s){
  if(!(await confirmBox('Excluir servidor', `Excluir <b>${esc(s.name)}</b> para sempre? Todos os canais e mensagens serão apagados.`, 'Excluir servidor'))) return false;
  if(Voice.channel && Voice.channel.server_id === s.id) await leaveVoice();
  const { error } = await App.sb.from('servers').delete().eq('id', s.id);
  if(error){ App.toast(error.message, true); return; }
  await loadServers(); go({ kind:'home', dm:null });
}
async function leaveServer(s){
  if(!(await confirmBox('Sair do servidor', `Sair de <b>${esc(s.name)}</b>? Você só volta com um novo convite.`, 'Sair'))) return;
  if(Voice.channel && Voice.channel.server_id === s.id) await leaveVoice();
  const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', S.me.id);
  if(error){ App.toast(error.message, true); return; }
  await loadServers(); go({ kind:'home', dm:null });
}
