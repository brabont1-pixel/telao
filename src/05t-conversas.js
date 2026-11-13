/* =====================================================================
   v6.10: FECHAR CONVERSA — tira a DM/grupo da lista sem apagar nada.
   Volta sozinha quando chega mensagem nova (o banco reabre) ou quando você abre de novo.
   ===================================================================== */
S.closedDms = new Set();
let closedRt = null;
async function loadClosedDms(){
  const { data } = await App.sb.from('dm_closed').select('channel_id').eq('user_id', S.me.id);
  S.closedDms = new Set((data || []).map(r => r.channel_id));
  if(!closedRt) closedRt = App.sb.channel('dmclosed-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'dm_closed' }, async () => {
    await loadClosedDms(); if(S.route.kind === 'home') renderSidebar();
  }).subscribe();
}
async function closeDm(id){
  S.closedDms.add(id);
  if(S.route.kind === 'home' && S.route.dm === id) go({ kind: 'home', dm: null }); else renderSidebar();
  const { error } = await App.sb.from('dm_closed').upsert({ user_id: S.me.id, channel_id: id, closed_at: new Date().toISOString() });
  if(error){ S.closedDms.delete(id); renderSidebar(); App.toast(error.message, true); return; }
  App.toast('Conversa fechada. Ela volta para a lista quando chegar mensagem nova.');
}
function reopenDm(id){
  if(!S.closedDms.has(id)) return;
  S.closedDms.delete(id);
  App.sb.from('dm_closed').delete().eq('user_id', S.me.id).eq('channel_id', id).then(() => {}, () => {});
}
App.closeDm = closeDm;

const _loadDmsDc = loadDms;
loadDms = async function(){ const r = await _loadDmsDc.apply(this, arguments); try{ await loadClosedDms(); }catch(e){} return r; };

const _renderSidebarDc = renderSidebar;
renderSidebar = function(){
  // abriu uma conversa fechada (pelo perfil, amigos, busca…): ela volta para a lista
  if(S.route.kind === 'home' && S.route.dm) reopenDm(S.route.dm);
  const r = _renderSidebarDc.apply(this, arguments);
  document.querySelectorAll('.dmitem[data-dm]').forEach(el => {
    const id = el.dataset.dm;
    if(S.closedDms.has(id)){ el.remove(); return; }
    if(el.querySelector('.dmclose')) return;
    const b = document.createElement('button');
    b.className = 'dmclose'; b.dataset.tip = 'Fechar conversa'; b.innerHTML = ic('x', 14);
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); closeDm(id); };
    el.appendChild(b);
  });
  return r;
};
