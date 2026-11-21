/* =====================================================================
   v6.30: FIXAR CONVERSAS — DMs e grupos fixados ficam no topo da lista (até 10).
   Fica salvo na sua conta (tabela dm_pins), então vale no PC e no celular.
   ===================================================================== */
S.dmPins = new Map();   // channel_id -> pinned_at
const PIN_SQL = 'Para fixar conversas, rode o supabase.sql novo (v6.30) no Supabase.';
async function loadDmPins(){
  const { data, error } = await App.sb.from('dm_pins').select('channel_id,pinned_at').eq('user_id', S.me.id);
  if(error){ S.dmPins = new Map(Object.entries(ls.get('telao-dmpins', {}))); return; }
  S.dmPins = new Map((data || []).map(r => [r.channel_id, r.pinned_at]));
}
const _loadDmsPin = loadDms;
loadDms = async function(){ const r = await _loadDmsPin.apply(this, arguments); try{ await loadDmPins(); }catch(e){} return r; };
async function togglePin(id){
  if(S.dmPins.has(id)){
    S.dmPins.delete(id); renderSidebar();
    const { error } = await App.sb.from('dm_pins').delete().eq('user_id', S.me.id).eq('channel_id', id);
    if(error && /dm_pins|schema cache|does not exist/i.test(error.message)) ls.set('telao-dmpins', Object.fromEntries(S.dmPins));
    App.toast('Conversa desafixada.'); return;
  }
  if(S.dmPins.size >= 10){ App.toast('Você já tem 10 conversas fixadas. Desafixe uma antes.', true); return; }
  const at = new Date().toISOString();
  S.dmPins.set(id, at); if(S.closedDms) S.closedDms.delete(id); renderSidebar();
  const { error } = await App.sb.from('dm_pins').insert({ channel_id: id, pinned_at: at });
  if(error){
    if(/dm_pins|schema cache|does not exist/i.test(error.message)){ ls.set('telao-dmpins', Object.fromEntries(S.dmPins)); App.toast('Conversa fixada (só neste aparelho). ' + PIN_SQL); return; }
    if(!/duplicate/i.test(error.message)){ S.dmPins.delete(id); renderSidebar(); App.toast(error.message, true); return; }
  }
  App.toast('📌 Conversa fixada no topo.');
}
App.togglePin = togglePin;
const _renderSidebarPin = renderSidebar;
renderSidebar = function(){
  const r = _renderSidebarPin.apply(this, arguments);
  if(S.route.kind !== 'home') return r;
  const items = [...document.querySelectorAll('#sbBody .dmitem[data-dm], .dmitem[data-dm]')];
  let lastPinned = null;
  items.forEach(el => {
    const id = el.dataset.dm, on = S.dmPins.has(id);
    el.classList.toggle('pinned', on);
    if(on) lastPinned = el;
    if(!el.querySelector('.dmpin')){
      const b = document.createElement('button');
      b.className = 'dmpin'; b.dataset.tip = on ? 'Desafixar' : 'Fixar conversa'; b.innerHTML = ic('pin', 14);
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); togglePin(id); };
      const x = el.querySelector('.dmclose'); x ? el.insertBefore(b, x) : el.appendChild(b);
    }
  });
  document.querySelectorAll('.dmpinsep').forEach(x => x.remove());
  if(lastPinned && lastPinned.nextElementSibling && lastPinned.nextElementSibling.classList.contains('dmitem')) lastPinned.insertAdjacentHTML('afterend', '<div class="dmpinsep"></div>');
  return r;
};
// botão direito na conversa → menu da pessoa ganha "Fixar conversa"
const _userMenuExtraPin = App.userMenuExtra;
App.userMenuExtra = uid => {
  const base = _userMenuExtraPin ? _userMenuExtraPin(uid) : [];
  const d = uid !== S.me.id && S.dms.find(x => dmOther(x) === uid);
  if(!d) return base;
  return [{ label: S.dmPins.has(d.id) ? 'Desafixar conversa' : 'Fixar conversa', icon: ic('pin', 18), onClick: () => togglePin(d.id) }].concat(base);
};
