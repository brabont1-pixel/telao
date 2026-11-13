/* =====================================================================
   v6.14: BACKUP DE SERVIDOR — baixar, copiar para outro servidor, restaurar ou criar a partir de um arquivo.
   Só administradores do servidor (dono ou cargo com Administrador).
   ===================================================================== */
const isSrvAdmin = s => !!s && (s.owner_id === S.me.id || App.hasPerm(s.id, 32));
const bkName = s => `telao-backup-${(s.name || 'servidor').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toLocaleDateString('en-CA')}.json`;
function bkSummary(bk){
  const n = k => Array.isArray(bk[k]) ? bk[k].length : 0;
  const msgs = bk.messages ? Object.values(bk.messages).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0) : 0;
  return { name: (bk.server && bk.server.name) || 'Servidor', channels: n('channels'), text: (bk.channels || []).filter(c => c.kind === 'text').length, voice: (bk.channels || []).filter(c => c.kind === 'voice').length,
    roles: n('roles'), cats: n('categories'), emojis: n('emojis'), msgs, at: bk.exported_at };
}
const bkLine = sm => `${sm.text} canais de texto, ${sm.voice} de voz, ${sm.cats} categoria${sm.cats === 1 ? '' : 's'}, ${sm.roles} cargo${sm.roles === 1 ? '' : 's'}, ${sm.emojis} emoji${sm.emojis === 1 ? '' : 's'}${sm.msgs ? `, ${sm.msgs.toLocaleString('pt-BR')} mensagens` : ''}`;
const bkErr = e => /could not find the function|PGRST202/i.test((e && (e.message || e.code)) || '') ? 'Falta rodar o supabase.sql novo no Supabase para o backup funcionar.' : (e && e.message) || String(e);

async function bkMake(s, withMsgs){
  const { data, error } = await App.sb.rpc('server_backup', { p_server: s.id, p_messages: !!withMsgs });
  if(error) throw error;
  return data;
}
function bkDownload(s, bk){
  const blob = new Blob([JSON.stringify(bk, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = bkName(s);
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function backupPick(cb){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if(!f) return;
    if(f.size > 40 * 1048576){ App.toast('Arquivo grande demais (máximo 40 MB).', true); return; }
    try{
      const bk = JSON.parse(await f.text());
      if(!bk || bk.telao_backup !== 1) throw new Error('Esse arquivo não é um backup do Telão.');
      cb(bk);
    }catch(e){ App.toast(e.message && e.message.startsWith('Esse') ? e.message : 'Não deu para ler esse arquivo. Ele precisa ser um backup .json do Telão.', true); }
  };
  inp.click();
}
App.backupPick = backupPick;

async function bkRestore(sid, bk, withMsgs, withSettings){
  const { data, error } = await App.sb.rpc('server_restore', { p_server: sid, p_backup: bk, p_messages: !!withMsgs, p_settings: withSettings !== false });
  if(error) throw error;
  await loadServers(); await loadChannels(sid);
  return data || {};
}
const restoredMsg = r => `Pronto: ${r.channels || 0} canais, ${r.roles || 0} cargos, ${r.emojis || 0} emojis${r.messages ? `, ${r.messages} mensagens` : ''}.`;

/* criar servidor novo a partir de um arquivo */
function backupNewServer(bk){
  const sm = bkSummary(bk);
  modal(`<div class="mh"><h2>Criar servidor do backup</h2><p>${esc(sm.name)}${sm.at ? ` · backup de ${new Date(sm.at).toLocaleDateString('pt-BR')}` : ''}</p></div>
    <div class="mc"><div class="bkbox">${ic('download', 18)}<span>${bkLine(sm)}</span></div>
      <label class="field"><span>Nome do servidor novo</span><input class="inp" id="bnN" maxlength="40" value="${esc(sm.name)}"></label>
      ${sm.msgs ? row('Trazer as mensagens', 'Elas entram pela conta oficial do Telão, com o nome de quem escreveu e a data.', toggle('bnM', true)) : ''}
      <div class="err" id="bnE"></div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="bnGo">Criar servidor</button></div>`, m => {
    m.querySelector('#bnGo').onclick = async () => {
      const b = m.querySelector('#bnGo'); b.disabled = true; b.textContent = 'Criando…';
      try{
        const name = m.querySelector('#bnN').value.trim() || sm.name;
        const { data: sid, error } = await App.sb.rpc('create_server', { p_name: name.slice(0, 40) });
        if(error) throw error;
        const bk2 = { ...bk, server: { ...(bk.server || {}), name } };
        const r = await bkRestore(sid, bk2, m.querySelector('#bnM') ? m.querySelector('#bnM').checked : false, true);
        closeModal(); go({ kind: 'server', sid }); App.toast(restoredMsg(r));
      }catch(e){ m.querySelector('#bnE').textContent = bkErr(e); b.disabled = false; b.textContent = 'Criar servidor'; }
    };
  });
}
App.backupNewServer = backupNewServer;

/* confirmação para substituir um servidor */
function bkConfirmReplace(target, sm, onGo){
  modal(`<div class="mh"><h2>Substituir “${esc(target.name)}”?</h2><p>Todos os canais, categorias, cargos e emojis de <b>${esc(target.name)}</b> serão apagados e trocados pelos do backup. As mensagens que estão lá hoje são perdidas. Os membros continuam no servidor (mas perdem os cargos).</p></div>
    <div class="mc"><div class="bkbox">${ic('download', 18)}<span>Do backup: ${bkLine(sm)}</span></div>
      ${sm.msgs ? row('Trazer as mensagens do backup', 'Entram pela conta oficial do Telão, com o nome de quem escreveu e a data.', toggle('bcM', true)) : ''}
      ${row('Trazer nome, ícone, banner e descrição', '', toggle('bcS', true))}
      <label class="field"><span>Para confirmar, digite o nome do servidor: <b>${esc(target.name)}</b></span><input class="inp" id="bcN" autocomplete="off"></label><div class="err" id="bcE"></div></div>
    <div class="mf"><button class="btn sec" data-close>Cancelar</button><button class="btn red" id="bcGo" disabled>Substituir tudo</button></div>`, m => {
    const inp = m.querySelector('#bcN'), go_ = m.querySelector('#bcGo');
    inp.oninput = () => go_.disabled = inp.value.trim().toLowerCase() !== target.name.trim().toLowerCase();
    go_.onclick = async () => {
      go_.disabled = true; go_.textContent = 'Restaurando…';
      try{ await onGo(m.querySelector('#bcM') ? m.querySelector('#bcM').checked : false, m.querySelector('#bcS').checked); }
      catch(e){ m.querySelector('#bcE').textContent = bkErr(e); go_.disabled = false; go_.textContent = 'Substituir tudo'; }
    };
  });
}

/* seção "Backup" nas configurações do servidor */
async function secSrvBackup(box, back){
  const s = SET.server;
  if(!isSrvAdmin(s)){ box.innerHTML = `${back}<h2>Backup</h2><p class="mut">Só administradores do servidor podem fazer e restaurar backup.</p>`; return; }
  const others = S.servers.filter(x => x.id !== s.id && isSrvAdmin(x));
  box.innerHTML = `${back}<h2>Backup do servidor</h2><p class="mut">Guarde uma cópia de tudo do servidor (canais, categorias, configurações dos canais, cargos e permissões, emojis e, se quiser, as mensagens) e use em outro servidor quando quiser.</p>
    <div class="bkcard"><h3>${ic('download', 18)} Baixar backup</h3><p class="mut small">Um arquivo .json que fica no seu computador ou celular.</p>
      ${row('Incluir as mensagens', 'As últimas 500 de cada canal de texto. O arquivo fica maior.', toggle('bkM', false))}
      <button class="btn" id="bkDl">${ic('download', 16)} Baixar backup</button></div>
    <div class="bkcard"><h3>${ic('copy', 18)} Copiar para outro servidor</h3><p class="mut small">Coloca tudo deste servidor em outro servidor seu (ele é substituído).</p>
      ${others.length ? `<label class="field"><span>Servidor de destino</span><select class="inp" id="bkTo">${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      ${row('Levar as mensagens', 'Últimas 500 de cada canal, pela conta oficial do Telão.', toggle('bkTM', false))}
      <button class="btn sec" id="bkCopy">${ic('copy', 16)} Copiar para o servidor escolhido</button>` : '<p class="mut small">Você não é administrador de nenhum outro servidor. Crie um servidor novo e volte aqui, ou baixe o backup.</p>'}</div>
    <div class="bkcard"><h3>${ic('upload', 18)} Restaurar de um arquivo</h3><p class="mut small">Use um backup baixado (seu ou de alguém que te mandou).</p>
      <div class="bkacts"><button class="btn sec" id="bkUpR">Substituir este servidor</button><button class="btn sec" id="bkUpN">Criar um servidor novo com ele</button></div></div>
    <div class="err" id="bkE"></div>`;
  const err = t => box.querySelector('#bkE').textContent = t || '';
  box.querySelector('#bkDl').onclick = async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Preparando…'; err();
    try{ const bk = await bkMake(s, box.querySelector('#bkM').checked); bkDownload(s, bk); App.toast('Backup baixado: ' + bkLine(bkSummary(bk))); }
    catch(x){ err(bkErr(x)); }
    b.disabled = false; b.innerHTML = `${ic('download', 16)} Baixar backup`;
  };
  const cp = box.querySelector('#bkCopy'); if(cp) cp.onclick = async () => {
    err();
    const target = S.servers.find(x => x.id === box.querySelector('#bkTo').value); if(!target) return;
    let bk; try{ bk = await bkMake(s, box.querySelector('#bkTM').checked); }catch(x){ err(bkErr(x)); return; }
    bkConfirmReplace(target, bkSummary(bk), async (msgs, sett) => {
      const r = await bkRestore(target.id, bk, msgs, sett);
      closeModal(); App.toast(`Copiado para ${target.name}. ` + restoredMsg(r));
    });
  };
  box.querySelector('#bkUpR').onclick = () => backupPick(bk => bkConfirmReplace(s, bkSummary(bk), async (msgs, sett) => {
    const r = await bkRestore(s.id, bk, msgs, sett);
    closeModal(); closeSettings(); go({ kind: 'server', sid: s.id }); App.toast('Backup restaurado. ' + restoredMsg(r));
  }));
  box.querySelector('#bkUpN').onclick = () => backupPick(bk => backupNewServer(bk));
}
