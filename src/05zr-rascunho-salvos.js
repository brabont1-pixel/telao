/* =====================================================================
   v6.31: RASCUNHO SALVO e MENSAGENS SALVAS
   - O que você começou a escrever fica guardado por conversa (neste aparelho) e a conversa
     ganha um ✏️ na lista até você mandar ou apagar.
   - Menu da mensagem → Salvar mensagem. Ficam na aba "Salvos" (botão 🔖 no topo da conversa
     e no menu do seu perfil). O banco guarda uma cópia: se apagarem a original, a sua fica.
   ===================================================================== */
const DRAFTS = ls.get('telao-drafts', {});
const draftSave = () => ls.set('telao-drafts', DRAFTS);
function draftSync(){
  const ta = document.getElementById('cmp'); if(!ta || !ta.dataset.dcid) return;
  const id = ta.dataset.dcid, v = ta.value;
  if(v.trim()) DRAFTS[id] = { t: v.slice(0, 4000), at: Date.now() }; else delete DRAFTS[id];
  draftSave();
}
App.hasDraft = id => !!DRAFTS[id];
document.addEventListener('input', e => { if(e.target && e.target.id === 'cmp'){ const had = !!DRAFTS[e.target.dataset.dcid]; draftSync(); if(had !== !!DRAFTS[e.target.dataset.dcid]) draftMarks(); } });
window.addEventListener('beforeunload', draftSync);
document.addEventListener('visibilitychange', () => { if(document.hidden) draftSync(); });
const _renderMainDr = renderMain;
renderMain = function(){
  draftSync();   // guarda o que estava escrito na conversa que você está deixando
  const r = _renderMainDr.apply(this, arguments);
  const ta = document.getElementById('cmp');
  if(ta && M.cid && ta.dataset.dcid !== M.cid){
    ta.dataset.dcid = M.cid;
    const d = DRAFTS[M.cid];
    if(d && !ta.value){ ta.value = d.t; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  savedHeadBtn();
  draftMarks();
  return r;
};
// depois de mandar, o campo fica vazio: apaga o rascunho
document.addEventListener('keyup', e => { if(e.target && e.target.id === 'cmp' && e.key === 'Enter' && !e.shiftKey) setTimeout(() => { draftSync(); draftMarks(); }, 50); });
document.addEventListener('click', e => { if(e.target.closest && e.target.closest('#cSend')) setTimeout(() => { draftSync(); draftMarks(); }, 80); }, true);
function draftMarks(){
  document.querySelectorAll('.drafti').forEach(x => x.remove());
  document.querySelectorAll('.ch[data-cid], .dmitem[data-dm]').forEach(el => {
    const id = el.dataset.cid || el.dataset.dm;
    if(!DRAFTS[id] || id === M.cid) return;
    const nm = el.querySelector('.nm'); if(nm) nm.insertAdjacentHTML('afterend', `<span class="drafti" data-tip="Rascunho: ${esc(DRAFTS[id].t.slice(0, 60))}">✏️</span>`);
  });
}
const _renderSidebarDr = renderSidebar;
renderSidebar = function(){ const r = _renderSidebarDr.apply(this, arguments); draftMarks(); return r; };

/* ---------- mensagens salvas ---------- */
S.saved = new Set();
const SAVED_SQL = 'Para salvar mensagens, rode o supabase.sql novo (v6.31) no Supabase.';
async function loadSaved(){
  const { data, error } = await App.sb.from('saved_messages').select('message_id').eq('user_id', S.me.id);
  if(!error) S.saved = new Set((data || []).map(r => r.message_id));
}
const _loadDmsSv = loadDms;
loadDms = async function(){ const r = await _loadDmsSv.apply(this, arguments); try{ await loadSaved(); }catch(e){} return r; };
async function toggleSaved(m){
  if(S.saved.has(m.id)){
    const { error } = await App.sb.from('saved_messages').delete().eq('user_id', S.me.id).eq('message_id', m.id);
    if(error){ App.toast(error.message, true); return; }
    S.saved.delete(m.id); App.toast('Tirada dos salvos.'); return;
  }
  const { error } = await App.sb.from('saved_messages').insert({ message_id: m.id });
  if(error && !/duplicate/i.test(error.message)){ App.toast(/saved_messages|schema cache|does not exist/i.test(error.message) ? SAVED_SQL : error.message, true); return; }
  S.saved.add(m.id); App.toast('🔖 Mensagem salva. Veja em Salvos (🔖 no topo da conversa).');
}
const _msgMenuExtraSv = App.msgMenuExtra;
App.msgMenuExtra = m => {
  const out = _msgMenuExtraSv ? _msgMenuExtraSv(m) : [];
  if(!String(m.id).startsWith('tmp-')) out.unshift({ label: S.saved.has(m.id) ? 'Tirar dos salvos' : 'Salvar mensagem', icon: ic('bookmark', 18), onClick: () => toggleSaved(m) });
  return out;
};
function savedHeadBtn(){
  const pins = document.getElementById('hPins');
  if(!pins || document.getElementById('hSaved')) return;
  pins.insertAdjacentHTML('afterend', headBtns([['hSaved', 'bookmark', 'Mensagens salvas']]));
  document.getElementById('hSaved').onclick = e => savedPanel(e.currentTarget);
}
async function savedPanel(anchor){
  const r = anchor ? anchor.getBoundingClientRect() : { right: innerWidth - 20, bottom: 70 };
  const el = $('#menu'); el.className = 'menu panelpop';
  el.innerHTML = `<div class="pphead">${ic('bookmark', 18)} Mensagens salvas <span class="mut small" style="margin-left:auto">só você vê</span></div><div class="ppbody"><div class="spin" style="margin:20px auto"></div></div>`;
  openPanel(el, r);
  const { data, error } = await App.sb.from('saved_messages').select('*').eq('user_id', S.me.id).order('saved_at', { ascending: false }).limit(200);
  const body = el.querySelector('.ppbody'); if(!body) return;
  if(error){ body.innerHTML = `<div class="empty">${/saved_messages|schema cache|does not exist/i.test(error.message) ? SAVED_SQL : esc(error.message)}</div>`; return; }
  await ensureProfiles([...new Set((data || []).map(x => x.author_id).filter(Boolean))]);
  const where = cid => { const c = findChannel(cid); if(!c) return ''; if(c.kind === 'dm') return 'DM com ' + esc(prof(dmOther(c)).display_name); if(c.kind === 'group') return esc(groupName(c)); const s = S.servers.find(x => x.id === c.server_id); return `#${esc(c.name)}${s ? ' · ' + esc(s.name) : ''}`; };
  body.innerHTML = (data || []).length ? data.map(m => `<div class="ppit svit" data-svgo="${m.message_id}" data-svc="${m.channel_id || ''}">${avatar(prof(m.author_id), 'sm')}<div><b>${esc(prof(m.author_id).display_name)}</b> <small>${m.msg_at ? fmtTime(m.msg_at) : ''} · ${where(m.channel_id)}</small>
      <div class="ppct">${m.content ? richText(m.content.slice(0, 400)) : ''}${(m.attachments || []).filter(a => a && a.url && /^image\//.test(a.type || '')).slice(0, 2).map(a => `<img class="svimg" src="${esc(a.url)}" alt="">`).join('')}${!m.content && !(m.attachments || []).length ? '<i class="mut">sem texto</i>' : ''}</div></div>
      <button class="ibtn sm svx" data-svdel="${m.message_id}" data-tip="Tirar dos salvos">${ic('x', 14)}</button></div>`).join('')
    : `<div class="empty">${ic('bookmark', 36)}<br>Nada salvo ainda.<br><small>Clique com o botão direito numa mensagem → Salvar mensagem.</small></div>`;
  body.querySelectorAll('[data-svdel]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const { error } = await App.sb.from('saved_messages').delete().eq('user_id', S.me.id).eq('message_id', b.dataset.svdel);
    if(error){ App.toast(error.message, true); return; }
    S.saved.delete(b.dataset.svdel); b.closest('.svit').remove();
  });
  body.querySelectorAll('[data-svgo]').forEach(it => it.onclick = async () => {
    const c = findChannel(it.dataset.svc); closeMenu();
    if(!c){ App.toast('Você não tem mais acesso a essa conversa, mas a cópia continua aqui.', true); return; }
    if(c.kind === 'dm' || c.kind === 'group') await go({ kind: 'home', dm: c.id }); else await go({ kind: 'server', sid: c.server_id, cid: c.id });
    setTimeout(() => jumpTo(it.dataset.svgo), 500);
  });
}
App.savedPanel = savedPanel;
const _selfMenuExtraSv = App.selfMenuExtra;
App.selfMenuExtra = () => (_selfMenuExtraSv ? _selfMenuExtraSv() : []).concat([{ label: 'Mensagens salvas', icon: ic('bookmark', 18), onClick: () => savedPanel(null) }]);
