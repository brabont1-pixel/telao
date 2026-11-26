/* =====================================================================
   v6.37: REGISTRO DE AUDITORIA
   Configurações do servidor → Registro de auditoria. Tudo é gravado pelo próprio banco
   (gatilhos), então ninguém consegue apagar ou inventar registro. Fica 90 dias.
   Vê: dono, Administrador e quem tem "Ver registro de auditoria".
   ===================================================================== */
const AU_SQL = 'Para o registro de auditoria, rode o supabase.sql novo (v6.37) no Supabase.';
const AU = {
  server_update: ['⚙️', 'mudou as configurações do servidor', 'servidor'], invite_reset: ['🔗', 'trocou o link de convite', 'convites'], owner_transfer: ['👑', 'passou o servidor para', 'servidor'],
  channel_create: ['➕', 'criou o canal', 'canais'], channel_update: ['✏️', 'editou o canal', 'canais'], channel_delete: ['🗑️', 'apagou o canal', 'canais'],
  category_create: ['📁', 'criou a categoria', 'canais'], category_update: ['📁', 'editou a categoria', 'canais'], category_delete: ['📁', 'apagou a categoria', 'canais'],
  role_create: ['🏷️', 'criou o cargo', 'cargos'], role_update: ['🏷️', 'editou o cargo', 'cargos'], role_delete: ['🏷️', 'apagou o cargo', 'cargos'],
  member_role_add: ['🏷️', 'deu um cargo para', 'cargos'], member_role_remove: ['🏷️', 'tirou um cargo de', 'cargos'],
  member_join: ['👋', 'entrou no servidor', 'membros', true], member_leave: ['🚪', 'saiu do servidor', 'membros', true], member_kick: ['👢', 'expulsou', 'moderacao'],
  member_ban: ['⛔', 'baniu', 'moderacao'], member_unban: ['✅', 'tirou o banimento de', 'moderacao'], member_timeout: ['⏳', 'deu castigo para', 'moderacao'], member_timeout_end: ['⌛', 'tirou o castigo de', 'moderacao'],
  member_nick: ['✏️', 'mudou o apelido de', 'membros'],
  voice_mute: ['🔇', 'silenciou na call', 'moderacao'], voice_unmute: ['🎙️', 'tirou o silêncio de', 'moderacao'], voice_deafen: ['🙉', 'ensurdeceu na call', 'moderacao'], voice_undeafen: ['🎧', 'tirou o ensurdecer de', 'moderacao'],
  voice_disconnect: ['📴', 'desconectou da call', 'moderacao'], voice_move: ['↪️', 'moveu na call', 'moderacao'],
  message_delete: ['🗑️', 'apagou uma mensagem de', 'mensagens'], message_pin: ['📌', 'fixou uma mensagem de', 'mensagens'], message_unpin: ['📌', 'desafixou uma mensagem de', 'mensagens'],
  emoji_create: ['😀', 'adicionou o emoji', 'emojis'], emoji_update: ['😀', 'editou o emoji', 'emojis'], emoji_delete: ['😀', 'apagou o emoji', 'emojis'],
  sticker_create: ['🖼️', 'adicionou a figurinha', 'emojis'], sticker_update: ['🖼️', 'editou a figurinha', 'emojis'], sticker_delete: ['🖼️', 'apagou a figurinha', 'emojis'],
  sound_create: ['🔊', 'adicionou o som', 'emojis'], sound_update: ['🔊', 'editou o som', 'emojis'], sound_delete: ['🔊', 'apagou o som', 'emojis'],
  events_create: ['📅', 'criou o evento', 'servidor'], events_update: ['📅', 'editou o evento', 'servidor'], events_delete: ['📅', 'apagou o evento', 'servidor'],
  report_resolved: ['🛡️', 'resolveu uma denúncia contra', 'moderacao'], report_dismissed: ['🛡️', 'ignorou uma denúncia contra', 'moderacao'],
};
const AU_CATS = [['', 'Tudo'], ['moderacao', '🛡️ Moderação'], ['membros', '👋 Membros'], ['mensagens', '💬 Mensagens'], ['canais', '#️⃣ Canais'], ['cargos', '🏷️ Cargos'], ['servidor', '⚙️ Servidor e eventos'], ['emojis', '😀 Emojis e sons'], ['convites', '🔗 Convites']];
const AU_FIELDS = { name: 'nome', description: 'descrição', icon_url: 'ícone', banner_url: 'capa', topic: 'tópico', nsfw: '+18', slowmode: 'modo lento', readonly: 'só leitura', user_limit: 'limite de pessoas',
  bitrate: 'qualidade do áudio', perms: 'permissões', color: 'cor', verify_level: 'nível de verificação', is_public: 'público', rules_on: 'regras', rules_text: 'texto das regras', category: 'categoria',
  allowed_roles: 'quem pode ver', accent: 'cor de destaque', tag: 'tag', bday_on: 'parabéns automático', pet_on: 'bichinho', kind: 'tipo', hoist: 'mostrar separado', mentionable: 'mencionável' };
const auVal = v => v == null ? '—' : typeof v === 'boolean' ? (v ? 'sim' : 'não') : typeof v === 'string' ? (/^https?:\/\//.test(v) ? 'imagem' : v.slice(0, 80)) : Array.isArray(v) ? `${v.length} itens` : JSON.stringify(v).slice(0, 60);
function auPerms(de, para){
  const a = +de || 0, b = +para || 0, out = [];
  PERMS.forEach(([bit, nome]) => { if((a & bit) !== (b & bit)) out.push(`${b & bit ? '+' : '−'} ${nome}`); });
  return out.join(', ');
}
function auDetails(r){
  const d = r.details || {};
  if(r.action.endsWith('_update') || r.action === 'server_update'){
    return Object.entries(d).filter(([k]) => !['updated_at'].includes(k)).map(([k, v]) => `<li><b>${esc(AU_FIELDS[k] || k)}</b>: ${k === 'perms' ? esc(auPerms(v.de, v.para)) : `${esc(auVal(v.de))} → ${esc(auVal(v.para))}`}</li>`).join('');
  }
  const bits = [];
  if(d.cargo) bits.push(`cargo <b>${esc(d.cargo)}</b>`);
  if(d.canal) bits.push(`em <b>#${esc(d.canal)}</b>`);
  if(d.texto) bits.push(`“${esc(d.texto)}”`);
  if(d.motivo) bits.push(`motivo: ${esc(d.motivo)}`);
  if(d.acao) bits.push(`ação: ${esc(d.acao)}`);
  if(d.ate) bits.push(`até ${new Date(d.ate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
  if(d.de !== undefined || d.para !== undefined) bits.push(`${esc(auVal(d.de))} → ${esc(auVal(d.para))}`);
  if(d.tipo) bits.push(d.tipo === 'voice' ? 'canal de voz' : 'canal de texto');
  return bits.map(b => `<li>${b}</li>`).join('');
}
function auRow(r){
  const [e, verb, , self] = AU[r.action] || ['•', r.action];
  const actor = r.actor ? prof(r.actor) : null;
  const tgt = r.target_type === 'member' && r.target_id ? `<b class="auu" data-uprof="${r.target_id}">${esc(r.target_name || prof(r.target_id).display_name)}</b>`
    : r.target_name ? `<b>${r.target_type === 'channel' ? '#' : ''}${esc(r.target_name)}</b>` : '';
  const who = actor ? `<b class="auu" data-uprof="${r.actor}">${esc(actor.display_name)}</b>` : '<b>Telão</b>';
  const det = auDetails(r);
  const when = new Date(r.created_at);
  return `<div class="aurow ${det ? 'has' : ''}">${actor ? avatar(actor, 'sm') : '<span class="auic">⚙️</span>'}<span class="aue">${e}</span>
    <div class="aut"><div>${self ? `${tgt || who} ${esc(verb)}` : `${who} ${esc(verb)} ${tgt}`}</div><small>${when.toLocaleDateString('pt-BR')} às ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
    ${det ? `<ul class="aud">${det}</ul>` : ''}</div>${det ? `<span class="auchev">${ic('chevDown', 16)}</span>` : ''}</div>`;
}
async function secSrvAudit(box, back){
  const s = SET.server;
  const st = box._au || (box._au = { cat: '', actor: '', q: '', rows: [], done: false });
  const load = async (more) => {
    let q = App.sb.from('server_audit').select('*').eq('server_id', s.id).order('created_at', { ascending: false }).range(more ? st.rows.length : 0, (more ? st.rows.length : 0) + 59);
    if(st.cat) q = q.in('action', Object.keys(AU).filter(k => AU[k][2] === st.cat));
    if(st.actor) q = q.eq('actor', st.actor);
    const { data, error } = await q;
    if(error) return error;
    const rows = data || [];
    await ensureProfiles([...new Set(rows.flatMap(r => [r.actor, r.target_type === 'member' ? r.target_id : null]).filter(Boolean))]);
    st.rows = more ? st.rows.concat(rows) : rows; st.done = rows.length < 60;
    return null;
  };
  box.innerHTML = `${back}<h2>Registro de auditoria</h2><div class="spin" style="margin:20px 0"></div>`;
  const err = await load(false);
  if(err){ box.innerHTML = `${back}<h2>Registro de auditoria</h2><div class="locked">${/server_audit|schema cache|does not exist/i.test(err.message) ? AU_SQL : esc(err.message)}</div>`; return; }
  const members = (S.members.get(s.id) || []).map(m => m.user_id);
  const draw = () => {
    const ql = st.q.trim().toLowerCase();
    const rows = ql ? st.rows.filter(r => [r.target_name, prof(r.actor).display_name, JSON.stringify(r.details || {}), (AU[r.action] || [])[1]].join(' ').toLowerCase().includes(ql)) : st.rows;
    box.innerHTML = `${back}<h2>Registro de auditoria</h2><p class="mut">Tudo o que mudou em <b>${esc(s.name)}</b> e quem fez. Gravado pelo próprio servidor do Telão: ninguém consegue apagar. Fica 90 dias.</p>
      <div class="aufilt"><select class="inp" id="auCat">${AU_CATS.map(([v, l]) => `<option value="${v}" ${st.cat === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="inp" id="auWho"><option value="">Qualquer pessoa</option>${members.map(u => `<option value="${u}" ${st.actor === u ? 'selected' : ''}>${esc(prof(u).display_name)}</option>`).join('')}</select>
        <input class="inp" id="auQ" placeholder="Buscar (nome, canal, texto…)" value="${esc(st.q)}"><button class="ibtn" id="auR" data-tip="Atualizar">${ic('refresh', 16)}</button></div>
      <div class="aulist">${rows.map(auRow).join('') || `<div class="empty">${st.cat || st.actor || ql ? 'Nada com esse filtro.' : 'Nada registrado ainda. As próximas mudanças vão aparecer aqui.'}</div>`}</div>
      ${!st.done && !ql ? `<div style="text-align:center;margin-top:10px"><button class="btn sec" id="auMore">Carregar mais</button></div>` : ''}`;
    box.querySelector('#auCat').onchange = async e => { st.cat = e.target.value; await load(false); draw(); };
    box.querySelector('#auWho').onchange = async e => { st.actor = e.target.value; await load(false); draw(); };
    const qi = box.querySelector('#auQ'); qi.oninput = () => { st.q = qi.value; const p = qi.selectionStart; draw(); const n = box.querySelector('#auQ'); n.focus(); n.setSelectionRange(p, p); };
    box.querySelector('#auR').onclick = async () => { await load(false); draw(); };
    const mo = box.querySelector('#auMore'); if(mo) mo.onclick = async () => { mo.disabled = true; await load(true); draw(); };
    box.querySelectorAll('.aurow.has').forEach(r => r.onclick = e => { if(!e.target.closest('[data-uprof]')) r.classList.toggle('open'); });
  };
  draw();
}
// contadores de render (para os testes de desempenho)
App._rc = { stage: 0, sidebar: 0, rail: 0, main: 0, list: 0 };
{ const a = renderStage, b = renderSidebar, c = renderRail, d = renderMain, e = renderMsgList;
  renderStage = function(){ App._rc.stage++; return a.apply(this, arguments); };
  renderSidebar = function(){ App._rc.sidebar++; return b.apply(this, arguments); };
  renderRail = function(){ App._rc.rail++; return c.apply(this, arguments); };
  renderMain = function(){ App._rc.main++; return d.apply(this, arguments); };
  renderMsgList = function(){ App._rc.list++; return e.apply(this, arguments); }; }
