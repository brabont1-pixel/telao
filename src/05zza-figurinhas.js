/* =====================================================================
   v6.39: FIGURINHAS DO SERVIDOR, MENSAGEM COM EFEITO e @aqui / @cargo
   - Figurinhas: imagens grandes (PNG, WEBP ou GIF animado) que o servidor sobe
     (quem gerencia emojis). Botão de figurinha no compositor → escolhe → vai na hora.
   - Efeitos: escolha antes de enviar (confete, corações, tremida, letra gigante,
     neon ou segredo — fica embaçada até alguém tocar).
   - @aqui: a mensagem leva junto quem estava online, então só essas pessoas são avisadas.
     @Cargo vira um código do cargo na hora de enviar e avisa só quem tem o cargo.
   ===================================================================== */
const STK_SQL = 'Para as figurinhas, rode o supabase.sql novo (v6.39) no Supabase.';
const STK = { cache: new Map(), at: new Map() };   // sid -> lista
const FX_LIST = [
  ['confete', '🎉', 'Confete', 'Chuva de confete para todo mundo'],
  ['coracoes', '💖', 'Corações', 'Corações subindo na tela'],
  ['tremer', '📳', 'Tremida', 'A conversa treme quando chega'],
  ['gigante', '🔠', 'Letra gigante', 'Texto enorme'],
  ['neon', '✨', 'Neon', 'Texto brilhando'],
  ['segredo', '🙈', 'Segredo', 'Embaçada até alguém tocar'],
];
async function loadStickers(sids, force){
  const need = sids.filter(id => force || !STK.cache.has(id) || Date.now() - (STK.at.get(id) || 0) > 60000);
  if(need.length){
    const { data, error } = await App.sb.from('server_stickers').select('*').in('server_id', need).order('created_at');
    if(error) throw error;
    need.forEach(id => { STK.cache.set(id, []); STK.at.set(id, Date.now()); });
    (data || []).forEach(x => STK.cache.get(x.server_id).push(x));
  }
  return sids.flatMap(id => STK.cache.get(id) || []);
}

/* ---------- o painel do botão de figurinha: Figurinhas | Efeitos ---------- */
function stkPanel(anchor, tab){
  closeMenu();
  const el = $('#menu'); el.className = 'menu stkpop';
  const ch = M.ch; if(!ch) return;
  const here = ch.server_id || null;
  const sids = [...new Set([here].concat(S.servers.map(s => s.id)).filter(Boolean))];
  tab = tab || ls.get('telao-stktab', 'stk');
  el.innerHTML = `<div class="stktabs"><button data-st="stk" class="${tab === 'stk' ? 'on' : ''}">${ic('sticker', 16)} Figurinhas</button><button data-st="fx" class="${tab === 'fx' ? 'on' : ''}">${ic('sparkles', 16)} Efeitos</button></div><div class="stkbody" id="stkBody"></div>`;
  const r = anchor.getBoundingClientRect(), w = Math.min(360, innerWidth - 16), h = 400;
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  el.style.top = Math.max(8, r.top - h - 8) + 'px';
  el.style.width = w + 'px';
  const body = el.querySelector('#stkBody');
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { ls.set('telao-stktab', b.dataset.st); stkPanel(anchor, b.dataset.st); });
  if(tab === 'fx'){
    body.innerHTML = `<p class="mut small" style="margin:4px 4px 10px">Escolha e mande a mensagem: o efeito vai junto.</p><div class="fxgrid">${FX_LIST.map(([k, e, n, d]) => `<button data-fxk="${k}" class="${M.nextFx === k ? 'on' : ''}"><span>${e}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      ${M.nextFx ? `<button class="btn sec sm" id="fxOff" style="margin-top:10px">Tirar o efeito</button>` : ''}`;
    body.querySelectorAll('[data-fxk]').forEach(b => b.onclick = () => { setNextFx(b.dataset.fxk); closeMenu(); $('#cmp') && $('#cmp').focus(); });
    const off = body.querySelector('#fxOff'); if(off) off.onclick = () => { setNextFx(null); closeMenu(); };
  } else {
    body.innerHTML = '<div class="spin" style="margin:30px auto"></div>';
    loadStickers(sids).then(list => {
      if(!el.isConnected || !el.classList.contains('stkpop')) return;
      const recent = ls.get('telao-stkrec', []).map(id => list.find(x => x.id === id)).filter(Boolean).slice(0, 8);
      const groups = sids.map(id => [id, list.filter(x => x.server_id === id)]).filter(([, l]) => l.length);
      const canAdd = here && (App.hasPerm(here, 512) || App.hasPerm(here, 2));
      body.innerHTML = (groups.length ? `<input class="inp stkq" id="stkQ" placeholder="Procurar figurinha" autocomplete="off">
        ${recent.length ? `<div class="epcat">Recentes</div><div class="stkgrid">${recent.map(stkBtn).join('')}</div>` : ''}
        ${groups.map(([id, l]) => `<div class="epcat">${esc((S.servers.find(s => s.id === id) || {}).name || 'Servidor')}</div><div class="stkgrid">${l.map(stkBtn).join('')}</div>`).join('')}`
        : `<div class="empty">${ic('sticker', 34)}<br>${here ? 'Este servidor ainda não tem figurinhas.' : 'Seus servidores ainda não têm figurinhas.'}</div>`)
        + (canAdd ? `<button class="btn sec sm" id="stkAdd" style="margin-top:10px">${ic('plus', 14)} Adicionar figurinhas</button>` : '');
      const q = body.querySelector('#stkQ');
      if(q){ if(!isMobile()) setTimeout(() => q.focus(), 20); q.oninput = () => { const v = q.value.trim().toLowerCase(); body.querySelectorAll('[data-stk]').forEach(b => b.style.display = !v || b.dataset.n.includes(v) ? '' : 'none'); }; }
      body.querySelectorAll('[data-stk]').forEach(b => b.onclick = () => { const s = list.find(x => x.id === b.dataset.stk); if(s){ closeMenu(); sendSticker(s); } });
      const add = body.querySelector('#stkAdd'); if(add) add.onclick = () => { closeMenu(); const s = S.servers.find(x => x.id === here); s && openSettings('server', 'stickers', s); };
    }).catch(e => { body.innerHTML = `<div class="empty">${/server_stickers|schema cache|does not exist/i.test(e.message || '') ? STK_SQL : esc(e.message || String(e))}</div>`; });
  }
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}
const stkBtn = s => `<button data-stk="${s.id}" data-n="${esc(s.name.toLowerCase())}" title="${esc(s.name)}"><img src="${esc(s.url)}" alt="" loading="lazy" decoding="async"></button>`;
function sendSticker(s){
  const rec = ls.get('telao-stkrec', []).filter(id => id !== s.id); rec.unshift(s.id); ls.set('telao-stkrec', rec.slice(0, 12));
  sendMessage(null, [{ type: 'sticker', id: s.id, sid: s.server_id, name: s.name, url: s.url, animated: !!s.animated }]);
}
function setNextFx(k){
  M.nextFx = k || null;
  const b = $('#cStk'); if(b) b.classList.toggle('fxon', !!k);
  let chip = $('#fxChip');
  if(!k){ chip && chip.remove(); return; }
  const f = FX_LIST.find(x => x[0] === k);
  if(!chip){ const box = $('.cbox'); if(!box) return; box.insertAdjacentHTML('afterbegin', '<div class="fxchip" id="fxChip"></div>'); chip = $('#fxChip'); }
  chip.innerHTML = `<span>${f[1]} Efeito: <b>${f[2]}</b></span><button title="Tirar o efeito">${ic('x', 14)}</button>`;
  chip.querySelector('button').onclick = () => setNextFx(null);
}

/* ---------- antes de enviar: @Cargo vira código; @aqui leva quem está online ---------- */
App.preSend = (content, ch) => {
  if(!ch || !ch.server_id || content.indexOf('@') < 0) return content;
  const roles = (S.roles.get(ch.server_id) || []).filter(r => r.name).slice().sort((a, b) => b.name.length - a.name.length);
  roles.forEach(r => {
    const re = new RegExp('(^|\\s)@' + r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s.,!?;:])', 'g');
    content = content.replace(re, (x, sp) => sp + '<@&' + r.id + '>');
  });
  return content;
};
App.sendExtras = (content, ch, raw) => {
  const out = [];
  if(!raw && M.nextFx && content){ out.push({ type: 'fx', k: M.nextFx }); setNextFx(null); }
  if(content && ch && ch.server_id && /(^|\s)@(aqui|here)\b/.test(content)){
    const ids = (S.members.get(ch.server_id) || []).map(x => x.user_id).filter(u => S.online.has(u) && u !== S.me.id);
    out.push({ type: 'here', ids: ids.slice(0, 500) });
  }
  return out;
};

/* ---------- efeito ao chegar ---------- */
const FXN = { seen: new Set() };
function fxPlay(m){
  const a = (m.attachments || []).find(x => x.type === 'fx'); if(!a || FXN.seen.has(m.id)) return;
  FXN.seen.add(m.id);
  if(a.k === 'confete' || a.k === 'coracoes') burst(a.k);
  const node = M.el && M.el.querySelector(`[data-m="${m.id}"]`);
  if(node){ node.classList.add('fxnew'); setTimeout(() => node.classList.remove('fxnew'), 2500); }
  if(a.k === 'tremer'){ const w = $('#msgWrapIn'); if(w){ w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); setTimeout(() => w.classList.remove('shake'), 900); } if(navigator.vibrate) try{ navigator.vibrate([80, 40, 80]); }catch(e){} }
}
const _addMessageFX = addMessage;
addMessage = function(m){
  const had = M.list.some(x => x.id === m.id);
  const r = _addMessageFX.apply(this, arguments);
  if(!had && M.cid === m.channel_id && Date.now() - new Date(m.created_at).getTime() < 60000) fxPlay(m);
  return r;
};
// segredo: toca para revelar
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.msg.fx-segredo:not(.fxo) .bub');
  if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const msg = b.closest('.msg'); msg.classList.add('fxo');
  (M.fxOpen = M.fxOpen || new Set()).add(msg.dataset.m);
}, true);

/* ---------- liga o botão no compositor ---------- */
const _bindComposerSTK = bindComposer;
bindComposer = function(ch){
  const r = _bindComposerSTK.apply(this, arguments);
  const b = $('#cStk'); if(b) b.onclick = () => stkPanel(b);
  if(M.nextFx) setNextFx(M.nextFx);
  return r;
};

/* ---------- Configurações do servidor → Figurinhas ---------- */
async function secSrvStickers(box, back){
  const s = SET.server, can = App.hasPerm(s.id, 512) || App.hasPerm(s.id, 2);
  box.innerHTML = `${back}<h2>Figurinhas</h2><div class="spin" style="margin:20px 0"></div>`;
  let list;
  try{ list = await loadStickers([s.id], true); }
  catch(e){ box.innerHTML = `${back}<h2>Figurinhas</h2><div class="locked">${/server_stickers|schema cache|does not exist/i.test(e.message || '') ? STK_SQL : esc(e.message || String(e))}</div>`; return; }
  box.innerHTML = `${back}<h2>Figurinhas</h2><p class="mut">Imagens grandes que todo mundo do servidor pode mandar no chat (botão ${ic('sticker', 14)} ao lado do emoji). Até 60.</p>
    <div class="emlim"><span>Figurinhas <b>${list.length}/60</b></span></div>
    ${can ? `<div class="emup"><button class="btn" id="stkUp">${ic('plus', 16)} Enviar figurinha</button><input type="file" id="stkF" accept="image/png,image/webp,image/gif,image/jpeg" multiple hidden>
      <small class="mut">PNG, WEBP ou GIF animado, até 512 KB. Fundo transparente fica mais bonito. A imagem é reduzida para 320 px.</small></div>` : ''}
    <div class="stkadm">${list.map(x => `<div class="stkcard"><img src="${esc(x.url)}" alt="" loading="lazy"><b>${esc(x.name)}</b>${x.animated ? '<span class="extag">animada</span>' : ''}
      ${can ? `<div class="stkcbt"><button class="ibtn sm" data-stkren="${x.id}" data-tip="Renomear">${ic('edit', 15)}</button><button class="ibtn sm" data-stkdel="${x.id}" data-tip="Apagar">${ic('trash', 15)}</button></div>` : ''}</div>`).join('') || '<div class="empty">Nenhuma figurinha ainda.</div>'}</div>`;
  if(!can) return;
  const $b = q => box.querySelector(q);
  $b('#stkUp').onclick = () => $b('#stkF').click();
  $b('#stkF').onchange = async ev => {
    for(const f of [...ev.target.files]){
      try{
        const gif = f.type === 'image/gif';
        if(f.size > 524288 && gif){ App.toast(`${f.name}: GIF grande demais (máx. 512 KB).`, true); continue; }
        if(f.size > 8 * 1048576){ App.toast(`${f.name}: arquivo grande demais.`, true); continue; }
        let blob = f, type = f.type;
        if(!gif){
          const bmp = await createImageBitmap(f), sc = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)); type = 'image/webp';
          if(!blob || blob.size > 524288){ App.toast(`${f.name}: ficou grande demais mesmo reduzida.`, true); continue; }
        }
        const name = (f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'figurinha').slice(0, 30);
        const path = `${S.me.id}/sticker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${type.split('/')[1]}`;
        const { error: ue } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if(ue) throw ue;
        const url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
        const { error } = await App.sb.from('server_stickers').insert({ server_id: s.id, name, url, animated: gif });
        if(error) throw error;
      }catch(err){ App.toast(`${f.name}: ${err.message || err}`, true); }
    }
    STK.at.delete(s.id); renderSettings();
  };
  box.querySelectorAll('[data-stkdel]').forEach(b => b.onclick = async () => {
    if(!(await confirmBox('Apagar figurinha', 'Mensagens antigas com ela continuam mostrando a imagem.', 'Apagar'))) return;
    const { error } = await App.sb.from('server_stickers').delete().eq('id', b.dataset.stkdel);
    if(error){ App.toast(error.message, true); return; }
    STK.at.delete(s.id); renderSettings();
  });
  box.querySelectorAll('[data-stkren]').forEach(b => b.onclick = async () => {
    const x = list.find(y => y.id === b.dataset.stkren); if(!x) return;
    const nv = await promptBox('Renomear figurinha', 'Nome', x.name, 30); if(!nv || nv === x.name) return;
    const { error } = await App.sb.from('server_stickers').update({ name: nv.slice(0, 30) }).eq('id', x.id);
    if(error){ App.toast(error.message, true); return; }
    STK.at.delete(s.id); renderSettings();
  });
}
App.stk = { panel: stkPanel, send: sendSticker, setFx: setNextFx };
