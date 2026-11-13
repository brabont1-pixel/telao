/* =====================================================================
   v6.14: TEMPLATES DO DISCORD E DO XENON — cola o link (discord.new/…, discord.com/template/… ou
   xenon.bot/templates/…) e o Telão monta canais, categorias e cargos iguais. Usa o mesmo caminho do backup.
   ===================================================================== */
const TPL_RE = /(?:discord\.new|discord(?:app)?\.com\/template|xenon\.bot\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?templates?)\/([A-Za-z0-9-]{2,40})/i;
function tplCode(txt){
  const t = String(txt || '').trim();
  const m = t.match(TPL_RE); if(m) return m[1];
  return /^[A-Za-z0-9]{6,40}$/.test(t) ? t : null;
}
// permissões do Discord → bits do Telão
const DPERM = [[8n, 32], [16n, 1], [32n, 2], [2n, 4], [4n, 128], [8192n, 8], [268435456n, 16], [1n << 40n, 64], [1n << 33n, 256], [1n << 30n, 512]];
const dBig = v => { try{ return BigInt(String(v == null ? 0 : v)); }catch(e){ return 0n; } };
function dPerms(v){ const p = dBig(v); return DPERM.reduce((a, [d, t]) => (p & d) ? a | t : a, 0); }
const dColor = n => { n = Number(n) || 0; return n ? '#' + n.toString(16).padStart(6, '0') : '#99aab5'; };
const VIEW = 1024n, SEND = 2048n;

/* converte o template do Discord no formato de backup do Telão */
function tplToBackup(t){
  const g = (t && t.serialized_source_guild) || {};
  const roles = (Array.isArray(g.roles) ? g.roles : []).map((r, i) => ({ ...r, _i: i }));
  const everyone = roles.find(r => String(r.id) === '0' || r.name === '@everyone');
  const realRoles = roles.filter(r => r !== everyone && !r.managed).slice(0, 150);
  const adminIds = realRoles.filter(r => dBig(r.permissions) & 8n).map(r => String(r.id));
  const chs = Array.isArray(g.channels) ? g.channels : [];
  // categorias (nomes repetidos ganham um número, porque no Telão o nome é a chave)
  const catName = new Map(), used = new Set();
  chs.filter(c => c.type === 4).sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(c => {
    let n = String(c.name || 'categoria').slice(0, 36).trim() || 'categoria', k = n, i = 2;
    while(used.has(k.toLowerCase())) k = `${n} ${i++}`;
    used.add(k.toLowerCase()); catName.set(String(c.id), k);
  });
  const catPos = new Map([...catName.keys()].map((id, i) => [id, i + 1]));
  const kindOf = c => [0, 5, 15, 16].includes(c.type) ? 'text' : [2, 13].includes(c.type) ? 'voice' : null;
  const list = chs.filter(c => kindOf(c)).slice(0, 300).sort((a, b) => {
    const pa = a.parent_id != null ? (catPos.get(String(a.parent_id)) || 0) : 0, pb = b.parent_id != null ? (catPos.get(String(b.parent_id)) || 0) : 0;
    if(pa !== pb) return pa - pb;
    const ka = kindOf(a) === 'voice' ? 1 : 0, kb = kindOf(b) === 'voice' ? 1 : 0;
    return ka - kb || (a.position || 0) - (b.position || 0) || Number(a.id) - Number(b.id);
  });
  const channels = list.map((c, i) => {
    const kind = kindOf(c), ow = Array.isArray(c.permission_overwrites) ? c.permission_overwrites : [];
    const ev = ow.find(o => everyone && String(o.id) === String(everyone.id));
    const hidden = ev && (dBig(ev.deny) & VIEW);
    let allowed = null;
    if(hidden){
      allowed = [...new Set(ow.filter(o => o !== ev && (dBig(o.allow) & VIEW) && realRoles.some(r => String(r.id) === String(o.id))).map(o => String(o.id)).concat(adminIds))];
      if(!allowed.length) allowed = null;
    }
    const out = { id: String(c.id), kind, name: String(c.name || 'canal').slice(0, 40), position: i,
      category: c.parent_id != null ? catName.get(String(c.parent_id)) || null : null,
      topic: c.topic ? String(c.topic).slice(0, 300) : null, nsfw: !!c.nsfw,
      slowmode: Math.min(21600, Math.max(0, Number(c.rate_limit_per_user) || 0)),
      readonly: kind === 'text' && !!(ev && (dBig(ev.deny) & SEND)), allowed_roles: allowed };
    if(kind === 'voice'){
      out.user_limit = Math.min(99, Math.max(0, Number(c.user_limit) || 0));
      out.bitrate = Math.min(510, Math.max(32, Math.round((Number(c.bitrate) || 64000) / 1000)));
      if(c.type === 13) out.stage = true;
    }
    return out;
  });
  return {
    telao_backup: 1, source: 'discord-template', template_code: t.code || null, exported_at: t.updated_at || new Date().toISOString(),
    server: { name: String(t.name || g.name || 'Servidor').slice(0, 40), ...(g.description || t.description ? { description: String(g.description || t.description).slice(0, 200) } : {}),
      verify_level: Math.min(3, Math.max(0, Number(g.verification_level) || 0)) },
    roles: realRoles.map(r => ({ id: String(r.id), name: String(r.name || 'cargo').slice(0, 32), color: dColor(r.color), position: r._i, perms: dPerms(r.permissions), hoist: !!r.hoist })),
    categories: [...catName.values()].map((name, i) => ({ name, position: i + 1 })),
    channels, emojis: [], messages: null
  };
}

async function tplFetch(code){
  let r;
  try{ r = await fetch('/api/template?code=' + encodeURIComponent(code), { cache: 'no-store' }); }catch(e){ r = null; }
  if(r && (r.headers.get('content-type') || '').includes('json')){
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || 'Não deu para buscar o template.');
    return j;
  }
  // sem a função do servidor (ex.: rodando local): tenta direto no Discord
  const d = await fetch('https://discord.com/api/v10/guilds/templates/' + encodeURIComponent(code)).catch(() => null);
  if(!d) throw new Error('Não deu para falar com o Discord agora. Tente de novo daqui a pouco.');
  if(d.status === 404) throw new Error('Esse template não existe ou foi apagado.');
  if(!d.ok) throw new Error('O Discord não respondeu (' + d.status + ').');
  return d.json();
}

/* tela: colar o link, ver o que vem e usar */
function templateModal(target){
  const canReplace = target && isSrvAdmin(target);
  modal(`<div class="mh"><h2>Usar um template</h2><p>Templates do Discord e da galeria do Xenon. Cole o link do template.</p></div>
    <div class="mc"><label class="field"><span>Link ou código do template</span><div class="tpin"><input class="inp" id="tpL" placeholder="https://discord.new/… ou https://xenon.bot/templates/…" autocomplete="off"><button class="btn" id="tpGo">Buscar</button></div></label>
      <p class="mut small">Não tem um? <a href="https://xenon.bot/templates" target="_blank" rel="noopener">Abra a galeria do Xenon</a>, escolha um e copie o link da página (ou o link discord.new).</p>
      <div class="err" id="tpE"></div><div id="tpP"></div></div>
    <div class="mf" id="tpF"><button class="btn sec" data-close>Cancelar</button></div>`, m => {
    const inp = m.querySelector('#tpL'), err = t => m.querySelector('#tpE').textContent = t || '';
    const search = async () => {
      err(); const code = tplCode(inp.value);
      if(!code){ err('Esse link não parece de um template. Ele deve ser como discord.new/CODIGO ou xenon.bot/templates/CODIGO.'); return; }
      const b = m.querySelector('#tpGo'); b.disabled = true; b.textContent = 'Buscando…';
      try{
        const t = await tplFetch(code), bk = tplToBackup(t), sm = bkSummary(bk);
        if(!bk.channels.length && !bk.roles.length) throw new Error('Esse template está vazio.');
        const groups = new Map([[null, []]]); bk.categories.forEach(c => groups.set(c.name, []));
        bk.channels.forEach(c => (groups.get(c.category) || groups.get(null)).push(c));
        m.querySelector('#tpP').innerHTML = `<div class="tpprev"><div class="tphead"><b>${esc(bk.server.name)}</b>${t.usage_count ? `<small>usado ${Number(t.usage_count).toLocaleString('pt-BR')} vezes</small>` : ''}${t.description ? `<p>${esc(String(t.description).slice(0, 200))}</p>` : ''}</div>
          <div class="bkbox">${ic('download', 18)}<span>${bkLine(sm)}</span></div>
          <div class="tplist">${[...groups].filter(([, l]) => l.length).map(([cat, l]) => `${cat ? `<div class="tpcat">${esc(cat)}</div>` : ''}${l.map(c => `<div class="tpch">${ic(c.kind === 'voice' ? 'volume' : 'hash', 14)}${esc(c.name)}${c.allowed_roles ? ic('lock', 12) : ''}</div>`).join('')}`).join('')}</div>
          ${bk.roles.length ? `<div class="rpills tproles">${bk.roles.slice().reverse().slice(0, 30).map(r => `<span class="rpill sm"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>`).join('')}</div>` : ''}
          <p class="mut small">Vêm canais, categorias, cargos e quem pode ver cada canal. Bots e mensagens não vêm (o Discord não coloca isso nos templates).</p></div>`;
        m.querySelector('#tpF').innerHTML = `<button class="btn sec" data-close>Cancelar</button>${canReplace ? `<button class="btn sec" id="tpR">Usar neste servidor</button>` : ''}<button class="btn" id="tpN">Criar servidor novo</button>`;
        m.querySelector('#tpF [data-close]').onclick = closeModal;
        m.querySelector('#tpN').onclick = () => backupNewServer(bk);
        const rb = m.querySelector('#tpR');
        if(rb) rb.onclick = () => bkConfirmReplace(target, sm, async (msgs, sett) => {
          const r = await bkRestore(target.id, bk, false, sett);
          closeModal(); closeSettings(); go({ kind: 'server', sid: target.id }); App.toast('Template aplicado. ' + restoredMsg(r));
        });
      }catch(e){ err(e.message + (/não existe/.test(e.message) ? ' Os templates antigos do Xenon que só têm nome (tipo “starter”) só funcionam dentro dele.' : '')); m.querySelector('#tpP').innerHTML = ''; }
      b.disabled = false; b.textContent = 'Buscar';
    };
    m.querySelector('#tpGo').onclick = search;
    inp.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); search(); } };
    setTimeout(() => inp.focus(), 50);
  });
}
App.templateModal = templateModal;
App.tplToBackup = tplToBackup;

/* entrada na seção Backup */
const _secSrvBackupT = secSrvBackup;
secSrvBackup = async function(box, back){
  await _secSrvBackupT.apply(this, arguments);
  const s = SET.server; if(!isSrvAdmin(s) || !box.querySelector('#bkE')) return;
  box.querySelector('#bkE').insertAdjacentHTML('beforebegin', `<div class="bkcard"><h3>${ic('folder', 18)} Usar um template do Discord ou do Xenon</h3><p class="mut small">Cole o link de um template e monte os canais, categorias e cargos dele aqui ou num servidor novo.</p>
    <button class="btn sec" id="bkTpl">${ic('link', 16)} Colar link do template</button></div>`);
  box.querySelector('#bkTpl').onclick = () => templateModal(s);
};
