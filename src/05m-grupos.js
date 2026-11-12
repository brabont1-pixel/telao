/* =====================================================================
   v6.8: GRUPOS DE DM — 3 a 10 pessoas, com chamada e transmissão de tela, sem precisar de servidor
   ===================================================================== */
const GROUP_MAX = 10;
const friendIds = () => S.friends.filter(f => f.status === 'accepted').map(f => f.uid);

function friendPicker(m, opts){
  // opts: { pre: [uid], exclude: [uid], max, onChange(sel) }
  const sel = new Set(opts.pre || []);
  const list = friendIds().filter(u => !(opts.exclude || []).includes(u)).map(prof).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const box = m.querySelector('.gpick'), q = m.querySelector('.gq');
  const draw = () => {
    const t = (q.value || '').toLowerCase().trim();
    box.innerHTML = list.filter(p => !t || p.display_name.toLowerCase().includes(t) || p.username.includes(t)).map(p => `
      <label class="gp ${sel.has(p.id) ? 'on' : ''}"><input type="checkbox" value="${p.id}" ${sel.has(p.id) ? 'checked' : ''} ${!sel.has(p.id) && sel.size >= opts.max ? 'disabled' : ''}>
        ${avatar(p, 'sm', true)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span><span class="ck">${ic('check', 14)}</span></label>`).join('')
      || `<div class="empty">${list.length ? 'Ninguém com esse nome.' : 'Você ainda não tem amigos para chamar. Adicione amigos primeiro.'}</div>`;
    box.querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? sel.add(i.value) : sel.delete(i.value); draw(); opts.onChange && opts.onChange(sel); });
  };
  q.oninput = draw; draw(); opts.onChange && opts.onChange(sel);
  return sel;
}

function newGroupModal(pre){
  modal(`<div class="mh"><h2>Novo grupo</h2><p>Escolha de 2 a 9 amigos. O grupo tem conversa, chamada de voz, vídeo e transmissão de tela, sem precisar criar servidor.</p></div>
    <div class="mc">
      <label class="field"><span>Nome do grupo (opcional)</span><input class="inp" id="gName" maxlength="40" placeholder="Ex.: Turma do fim de semana"></label>
      <div class="gsearch">${ic('search', 15)}<input class="gq" placeholder="Buscar amigos"></div>
      <div class="gpick"></div>
    </div>
    <div class="mf"><span class="mut small grow" id="gCount"></span><button class="btn sec" data-close>Cancelar</button><button class="btn" id="gGo" disabled>Criar grupo</button></div>`, m => {
    const sel = friendPicker(m, { pre, max: GROUP_MAX - 1, onChange: s => {
      m.querySelector('#gCount').textContent = `${s.size + 1} de ${GROUP_MAX} pessoas`;
      m.querySelector('#gGo').disabled = s.size < 2;
      m.querySelector('#gGo').textContent = s.size === 1 ? 'Escolha mais 1' : 'Criar grupo';
    } });
    m.querySelector('#gGo').onclick = async () => {
      const name = m.querySelector('#gName').value.trim();
      const users = [...sel];
      const btn = m.querySelector('#gGo'); btn.disabled = true;
      const { data: cid, error } = await App.sb.rpc('create_group', { p_users: users, p_name: name || null });
      if(error){ btn.disabled = false; App.toast(error.message, true); return; }
      closeModal();
      await loadGroups();
      go({ kind: 'home', dm: cid });
      App.toast('Grupo criado!');
    };
  });
}

function groupSettings(g){
  const own = g.owner_id === S.me.id;
  const mem = (g.members || []).map(prof);
  modal(`<div class="mh"><h2>${esc(groupName(g))}</h2><p>${mem.length} de ${GROUP_MAX} pessoas${own ? ' · você é o dono' : ''}</p></div>
    <div class="mc">
      <label class="field"><span>Nome do grupo</span></label>
      <div class="gsrow" style="margin-top:-10px"><input class="inp" id="gsName" maxlength="40" value="${esc(g.name && g.name !== 'Grupo' ? g.name : '')}" placeholder="${esc(groupName(g))}"><button class="btn sm" id="gsSave">Salvar</button></div>
      <div class="gsrow" style="margin-top:8px"><button class="btn sec sm" id="gsIcon">${ic('image', 15)} ${g.icon_url ? 'Trocar foto' : 'Colocar foto'}</button>${g.icon_url ? `<button class="btn sec sm" id="gsIconX">Tirar foto</button>` : ''}</div>
      <h3 style="margin-top:18px">Pessoas</h3>
      <div class="gmem">${mem.map(p => `<div class="gm">${avatar(p, 'sm', true)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}${p.id === g.owner_id ? ' · dono' : ''}</small></span>
        ${own && p.id !== S.me.id ? `<button class="btn sec sm" data-kick="${p.id}">Tirar</button>` : ''}</div>`).join('')}</div>
      ${mem.length < GROUP_MAX ? `<button class="btn sec" id="gsAdd" style="margin-top:10px">${ic('userPlus', 16)} Adicionar amigos</button>` : ''}
    </div>
    <div class="mf"><button class="btn red" id="gsLeave">${ic('logout', 15)} Sair do grupo</button><span class="grow"></span><button class="btn sec" data-close>Fechar</button></div>`, m => {
    m.querySelector('#gsSave').onclick = async () => {
      const { error } = await App.sb.rpc('group_update', { p_channel: g.id, p_name: m.querySelector('#gsName').value.trim() || 'Grupo', p_icon: null });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await onGroupMembersEvent(); App.toast('Nome salvo');
    };
    m.querySelector('#gsIcon').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
      inp.onchange = async () => {
        const f = inp.files[0]; if(!f) return;
        if(f.size > 4 * 1024 * 1024){ App.toast('A foto pode ter até 4 MB.', true); return; }
        try{
          const meta = await uploadOne({ file: f });
          const { error } = await App.sb.rpc('group_update', { p_channel: g.id, p_name: g.name, p_icon: meta.url });
          if(error) throw error;
          closeModal(); await onGroupMembersEvent(); App.toast('Foto do grupo atualizada');
        }catch(e){ App.toast('Não deu para enviar: ' + (e.message || e), true); }
      };
      inp.click();
    };
    const ix = m.querySelector('#gsIconX'); if(ix) ix.onclick = async () => {
      const { error } = await App.sb.rpc('group_update', { p_channel: g.id, p_name: g.name, p_icon: '' });
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await onGroupMembersEvent();
    };
    m.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
      if(!await confirmBox('Tirar do grupo', `${esc(prof(b.dataset.kick).display_name)} vai sair do grupo e não vai ver mais as mensagens.`, 'Tirar')) return;
      const { error } = await App.sb.rpc('group_remove', { p_channel: g.id, p_user: b.dataset.kick });
      if(error){ App.toast(error.message, true); return; }
      await onGroupMembersEvent(); const ng = S.groups.find(x => x.id === g.id); if(ng) groupSettings(ng);
    });
    const add = m.querySelector('#gsAdd'); if(add) add.onclick = () => groupAddModal(g);
    m.querySelector('#gsLeave').onclick = async () => {
      if(!await confirmBox('Sair do grupo', own && mem.length > 1 ? 'Você é o dono: quem entrou primeiro depois de você vira o dono.' : 'Você não vai ver mais as mensagens desse grupo.', 'Sair')) return;
      if(Voice.channel && Voice.channel.id === g.id) await leaveVoice();
      const { error } = await App.sb.rpc('group_remove', { p_channel: g.id, p_user: S.me.id });
      if(error){ App.toast(error.message, true); return; }
      S.groups = S.groups.filter(x => x.id !== g.id);
      go({ kind: 'home', dm: null });
      App.toast('Você saiu do grupo');
    };
  });
}

function groupAddModal(g){
  const room = GROUP_MAX - (g.members || []).length;
  modal(`<div class="mh"><h2>Adicionar ao grupo</h2><p>Cabem mais ${room} pessoa${room > 1 ? 's' : ''}. Quem entrar vê as mensagens antigas também.</p></div>
    <div class="mc"><div class="gsearch">${ic('search', 15)}<input class="gq" placeholder="Buscar amigos"></div><div class="gpick"></div></div>
    <div class="mf"><button class="btn sec" id="gaBack">Voltar</button><button class="btn" id="gaGo" disabled>Adicionar</button></div>`, m => {
    const sel = friendPicker(m, { exclude: g.members || [], max: room, onChange: s => { m.querySelector('#gaGo').disabled = !s.size; } });
    m.querySelector('#gaBack').onclick = () => groupSettings(g);
    m.querySelector('#gaGo').onclick = async () => {
      for(const u of sel){
        const { error } = await App.sb.rpc('group_add', { p_channel: g.id, p_user: u });
        if(error){ App.toast(error.message, true); break; }
      }
      await onGroupMembersEvent();
      const ng = S.groups.find(x => x.id === g.id); if(ng) groupSettings(ng); else closeModal();
    };
  });
}

function renderGroupMain(g, head, body, back, keepMessages){
  const inCall = Voice.channel && Voice.channel.id === g.id;
  const n = (g.members || []).length;
  head.innerHTML = `${back}<div class="htitle" id="hGroup">${groupIcon(g, 'sm')}<b>${esc(groupName(g))}</b><span class="desc">${n} membros</span></div><span class="grow"></span>
    ${inCall ? '' : headBtns([['dmCall', 'phone', 'Iniciar chamada de voz'], ['dmVideo', 'video', 'Iniciar chamada de vídeo']])}
    ${headBtns([['gAdd', 'userPlus', 'Adicionar amigos ao grupo'], ['hPins', 'pin', 'Mensagens fixadas'], ['hSearch', 'search', 'Buscar'], ['gSet', 'gear', 'Configurações do grupo']])}`;
  $('#hGroup').onclick = () => groupSettings(g);
  $('#gSet').onclick = () => groupSettings(g);
  $('#gAdd').onclick = () => n >= GROUP_MAX ? App.toast('O grupo já tem 10 pessoas.', true) : groupAddModal(g);
  const callBtn = $('#dmCall'); if(callBtn) callBtn.onclick = () => joinVoice(g);
  const vBtn = $('#dmVideo'); if(vBtn) vBtn.onclick = async () => { await joinVoice(g); cameraSetup(); };
  $('#hPins').onclick = e => showPins(e.currentTarget); $('#hSearch').onclick = e => showSearch(e.currentTarget);
  bindBack();
  if(keepMessages && M.cid === g.id && body.querySelector('.msgs')){ M.ch = g; renderStage(); return; }
  body.innerHTML = `<div id="stageWrap"></div><div id="msgWrap" class="msgcol"></div>`;
  renderStage();
  const avs = (g.members || []).slice(0, 6).map(u => avatar(prof(u), 'lg')).join('');
  mountMessages(g, $('#msgWrap'), `<div class="welcome"><div class="gwel">${avs}</div><h1>${esc(groupName(g))}</h1><p>Este é o começo do grupo. ${n} pessoas: ${(g.members || []).map(u => '<b>' + esc(prof(u).display_name) + '</b>').join(', ')}.</p><p class="mut">Dá para ligar, abrir a câmera e transmitir a tela aqui mesmo.</p></div>`);
}
App.newGroupModal = newGroupModal;
