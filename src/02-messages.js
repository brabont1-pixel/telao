/* ---------------- mensagens ---------------- */
const M = { cid:null, ch:null, list:[], done:false, loading:false, el:null, welcome:'', editing:null, replyTo:null,
            files:[], reacts:new Map(), typing:new Map(), typingCh:null, lastTypingSent:0, detached:false, newWhileAway:0, readAt:null, rec:null };
const READ = ls.get('telao-read', {});
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(0) + ' KB' : (b/1048576).toFixed(1) + ' MB';
const isImg = a => /^image\//.test(a.type || '');
const isVid = a => /^video\//.test(a.type || '');
const isAud = a => /^audio\//.test(a.type || '');
const ytId = u => { const m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };

/* ---------- comandos com / ---------- */
const CMDS = [
  ['dado', '[lados]', 'Rola um dado (padrão: 6 lados)', '🎲'],
  ['moeda', '', 'Cara ou coroa', '🪙'],
  ['sorteio', 'a, b, c', 'Sorteia uma das opções', '🎯'],
  ['enquete', 'Pergunta | opção 1 | opção 2', 'Cria uma enquete com votação', '📊'],
  ['confete', '[mensagem]', 'Solta confete na tela de todo mundo', '🎉'],
  ['eu', 'ação', 'Fala na terceira pessoa', '💬'],
  ['spoiler', 'texto', 'Esconde o texto até clicarem', '🙈'],
  ['shrug', '[texto]', 'Adiciona ¯\\_(ツ)_/¯', '🤷'],
  ['tableflip', '[texto]', 'Vira a mesa (╯°□°)╯︵ ┻━┻', '😤'],
  ['unflip', '[texto]', 'Desvira a mesa ┬─┬ノ( º _ ºノ)', '😌'],
  ['lenny', '[texto]', '( ͡° ͜ʖ ͡°)', '😏'],
];
function runCommand(text){
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/); if(!m) return null;
  const [, cmd, arg] = m, a = arg.trim(), me = S.me.display_name;
  const rnd = n => Math.floor(Math.random() * n);
  switch(cmd.toLowerCase()){
    case 'dado': { const n = Math.max(2, Math.min(1000, parseInt(a) || 6)); return { content: `🎲 **${me}** rolou um d${n} e tirou **${1 + rnd(n)}**` }; }
    case 'moeda': return { content: `🪙 **${me}** jogou a moeda: deu **${rnd(2) ? 'Cara' : 'Coroa'}**!` };
    case 'sorteio': { const ops = a.split(/[,;|]/).map(x => x.trim()).filter(Boolean); if(ops.length < 2) return { error: 'Use: /sorteio opção 1, opção 2, opção 3' }; return { content: `🎯 Sorteio entre ${ops.map(x => '`' + x + '`').join(', ')}…\nO escolhido foi: **${ops[rnd(ops.length)]}**! 🎉` }; }
    case 'enquete': { const parts = a.split('|').map(x => x.trim()).filter(Boolean); if(parts.length < 3) return { error: 'Use: /enquete Pergunta | opção 1 | opção 2' }; return { content: '', attachments: [{ type:'poll', q: parts[0].slice(0, 200), opts: parts.slice(1, 11).map(x => x.slice(0, 80)) }] }; }
    case 'confete': return { content: (a || '🎉🎉🎉') + ' ', fx: 'confete' };
    case 'eu': return a ? { content: `*${me} ${a}*` } : { error: 'Use: /eu está jogando' };
    case 'spoiler': return a ? { content: `||${a}||` } : { error: 'Use: /spoiler texto' };
    case 'shrug': return { content: (a ? a + ' ' : '') + '¯\\_(ツ)_/¯' };
    case 'tableflip': return { content: (a ? a + ' ' : '') + '(╯°□°)╯︵ ┻━┻' };
    case 'unflip': return { content: (a ? a + ' ' : '') + '┬─┬ノ( º _ ºノ)' };
    case 'lenny': return { content: (a ? a + ' ' : '') + '( ͡° ͜ʖ ͡°)' };
  }
  return null;
}

/* ---------- efeitos de mensagem (confete, corações) ---------- */
function msgEffectFor(text){
  if(!text) return null;
  if(/parab[eé]ns|feliz anivers[aá]rio|🎉{2,}|^🎉\s*$/i.test(text)) return 'confete';
  if(/\bte amo\b|❤️{2,}|^❤️\s*$|💖|😍{2,}/i.test(text)) return 'coracoes';
  if(/\bgg\b|ganhamos|vit[oó]ria|🏆/i.test(text)) return 'trofeu';
  return null;
}
function burst(kind){
  const host = $('#msgWrapIn') || $('#mainBody'); if(!host) return;
  const cv = document.createElement('canvas'); cv.className = 'burst'; host.appendChild(cv);
  const r = host.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
  const ctx = cv.getContext('2d'), N = kind === 'confete' ? 140 : 40;
  const colors = ['#ff2e9a','#ffd166','#06d6a0','#4cc9f0','#b388ff','#ff4d8d'];
  const glyph = kind === 'coracoes' ? ['❤️','💖','💗','💕'] : kind === 'trofeu' ? ['🏆','⭐','✨','🥇'] : null;
  const ps = Array.from({ length: N }, () => ({ x: r.width * (0.2 + Math.random() * 0.6), y: glyph ? r.height + 20 : r.height * 0.3, vx: (Math.random() - .5) * (glyph ? 2 : 11), vy: glyph ? -(3 + Math.random() * 4) : -(4 + Math.random() * 9),
    rot: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[Math.floor(Math.random() * colors.length)], s: 6 + Math.random() * 7, g: glyph ? glyph[Math.floor(Math.random() * glyph.length)] : null }));
  const t0 = performance.now();
  const loop = now => {
    const t = now - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += glyph ? -0.02 : 0.25; p.vx *= .99; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t / 2800); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if(p.g){ ctx.font = (p.s * 3) + 'px serif'; ctx.fillText(p.g, 0, 0); } else { ctx.fillStyle = p.c; ctx.fillRect(-p.s/2, -p.s/4, p.s, p.s/2); }
      ctx.restore();
    });
    if(t < 2800) requestAnimationFrame(loop); else cv.remove();
  };
  requestAnimationFrame(loop);
}

/* ---------- enquetes (votos usam as reações "opt:N") ---------- */
function pollHtml(m, a){
  const mm = M.reacts.get(m.id) || new Map();
  const counts = a.opts.map((_, i) => (mm.get('opt:' + i) || new Set()).size);
  const total = counts.reduce((x, y) => x + y, 0);
  const mine = a.opts.findIndex((_, i) => (mm.get('opt:' + i) || new Set()).has(S.me.id));
  return `<div class="poll" data-poll="${m.id}"><div class="pq">${ic('poll',18)} ${esc(a.q)}</div>
    ${a.opts.map((o, i) => { const pct = total ? Math.round(counts[i] / total * 100) : 0;
      return `<button class="popt ${mine===i?'mine':''}" data-vote="${i}" data-mid="${m.id}"><span class="pbar" style="width:${pct}%"></span><span class="ptx">${mine===i?ic('check',15):''}${esc(o)}</span><b>${counts[i] ? pct + '%' : ''}</b></button>`; }).join('')}
    <div class="pfoot">${total} voto${total===1?'':'s'}${mine >= 0 ? ' · clique de novo para tirar seu voto' : ' · clique para votar'}</div></div>`;
}
async function vote(mid, i){
  const mm = M.reacts.get(mid) || new Map();
  const cur = [...mm.keys()].filter(k => k.startsWith('opt:') && mm.get(k).has(S.me.id));
  for(const k of cur){ delReact(mid, k, S.me.id); await App.sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', S.me.id).eq('emoji', k); }
  if(!cur.includes('opt:' + i)){ addReact(mid, 'opt:' + i, S.me.id); await App.sb.from('message_reactions').insert({ message_id: mid, emoji: 'opt:' + i }); }
  patchReacts(mid);
}

/* ---------- markdown ---------- */
function richText(t){
  if(!t) return '';
  const blocks = [];
  let s = String(t).replace(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/gi, (m, code) => { blocks.push(code.replace(/^\n|\n$/g,'')); return '\u0000' + (blocks.length-1) + '\u0000'; });
  const inl = [];
  s = s.replace(/`([^`\n]+)`/g, (m, c) => { inl.push(c); return '\u0001' + (inl.length-1) + '\u0001'; });
  let h = esc(s);
  h = h.split('\n').map(line => {
    if(/^&gt; /.test(line)) return `<span class="bq">${line.slice(5)}</span>`;
    if(/^### /.test(line)) return `<span class="h3">${line.slice(4)}</span>`;
    if(/^## /.test(line)) return `<span class="h2">${line.slice(3)}</span>`;
    if(/^# /.test(line)) return `<span class="h1">${line.slice(2)}</span>`;
    if(/^[-*] /.test(line)) return `<span class="li">• ${line.slice(2)}</span>`;
    return line;
  }).join('\n');
  h = h.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" data-spoiler>$1</span>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/__(.+?)__/g, '<u>$1</u>');
  h = h.replace(/~~(.+?)~~/g, '<s>$1</s>');
  h = h.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url.length > 70 ? url.slice(0, 67) + '…' : url}</a>`);
  h = h.replace(/(^|\s)@([a-z0-9_]{3,24})\b/g, (m, sp, u) => {
    const me = S.me && u === S.me.username;
    const known = [...S.profiles.values()].find(p => p.username === u);
    return known ? `${sp}<span class="mention ${me?'me':''}" data-uprof="${known.id}">@${esc(known.display_name)}</span>` : m;
  });
  h = h.replace(/(^|\s)@(todos|everyone)\b/g, '$1<span class="mention me">@$2</span>');
  h = h.replace(/:([a-z0-9_]{2,30}):/g, (m, k) => EMOJI.BY[k] || m);
  h = h.replace(/\u0001(\d+)\u0001/g, (m, i) => `<code>${esc(inl[+i])}</code>`);
  h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => `<pre class="codeblock"><button class="cpy" data-copycode="${i}">${ic('copy',14)}</button><code>${esc(blocks[+i])}</code></pre>`);
  M._blocks = blocks;
  return h;
}
const onlyEmoji = t => t && t.length <= 30 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^\d+$/.test(t.trim());

/* ---------- montar a conversa ---------- */
async function mountMessages(ch, container, welcome){
  unmountMessages();
  Object.assign(M, { cid:ch.id, ch, list:[], done:false, loading:false, welcome, editing:null, replyTo:null, files:[], detached:false, newWhileAway:0 });
  M.reacts = new Map(); M.typing = new Map();
  M.readAt = READ[ch.id] || null;
  const ph = ch.kind === 'dm' ? '@' + prof(dmOther(ch)).display_name : ch.kind === 'group' ? groupName(ch) : '#' + ch.name;
  container.insertAdjacentHTML('beforeend', `
    <div class="msgwrap" id="msgWrapIn">
      <div class="msgs" id="msgs"><div class="skel">${'<div class="sk"><i></i><div><b></b><span></span></div></div>'.repeat(5)}</div></div>
      <button class="jump hidden" id="jumpBtn">${ic('arrowDown',16)} <span>Ir para o presente</span></button>
      <div class="dropzone hidden" id="dropZone"><div>${ic('clip',40)}<b>Solte para enviar</b><small>em ${esc(ph)}</small></div></div>
    </div>
    <div class="composer">
      <div class="typing" id="typingLine"></div>
      <div class="cbox">
        <div class="replybar hidden" id="replyBar"></div>
        <div class="filestrip hidden" id="fileStrip"></div>
        <div class="recbar hidden" id="recBar"></div>
        <form id="cmpF" class="crow">
          <button type="button" class="cbtn2" id="cAttach" title="Anexar arquivos">${ic('plusCircle',22)}</button>
          <textarea id="cmp" rows="1" maxlength="4000" placeholder="Mensagem para ${esc(ph)} — digite / para comandos"></textarea>
          <button type="button" class="cbtn2" id="cEmoji" title="Emoji">${ic('smile',22)}</button>
          <button type="button" class="cbtn2" id="cVoice" title="Mensagem de voz">${ic('mic',22)}</button>
          <button class="cbtn2 send" id="cSend" title="Enviar">${ic('send',20)}</button>
        </form>
        <div class="acpop hidden" id="acPop"></div>
      </div>
      <input type="file" id="cFile" multiple class="hidden">
    </div>`);
  M.el = $('#msgs');
  bindComposer(ch);
  M.el.onscroll = onMsgScroll;
  M.el.addEventListener('click', onMsgClick);
  M.el.addEventListener('contextmenu', onMsgContext);
  // digitando…
  M.typingCh = App.sb.channel('typing:' + ch.id, { config:{ broadcast:{ self:false } } })
    .on('broadcast', { event:'t' }, ({ payload }) => onTyping(payload)).subscribe();
  await loadLatest();
}
function unmountMessages(){
  if(M.typingCh){ try{ App.sb.removeChannel(M.typingCh); }catch(e){} M.typingCh = null; }
  M.typing.forEach(t => clearTimeout(t)); M.typing.clear();
  if(M.rec) stopRecording(true);
  M.files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
  M.cid = null; M.el = null;
}
async function loadLatest(){
  const cid = M.cid;
  const { data, error } = await App.sb.from('messages').select('*').eq('channel_id', cid).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid) return;
  if(error){ M.el.innerHTML = `<div class="empty">Erro: ${esc(error.message)}</div>`; return; }
  M.list = (data || []).reverse(); M.done = (data || []).length < 50; M.detached = false;
  await hydrate(M.list);
  if(M.cid !== cid) return;
  renderMsgList(true);
  markRead();
}
async function hydrate(list){
  const ids = list.map(m => m.id);
  const replyIds = list.map(m => m.reply_to).filter(id => id && !list.find(x => x.id === id) && !M._replyCache?.has(id));
  M._replyCache = M._replyCache || new Map();
  const [rx, rp] = await Promise.all([
    ids.length ? App.sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids) : { data: [] },
    replyIds.length ? App.sb.from('messages').select('id,author_id,content,attachments').in('id', replyIds) : { data: [] },
  ]);
  (rx.data || []).forEach(r => addReact(r.message_id, r.emoji, r.user_id));
  (rp.data || []).forEach(r => M._replyCache.set(r.id, r));
  await ensureProfiles(list.map(m => m.author_id).concat((rp.data || []).map(r => r.author_id)));
}
async function loadOlder(){
  if(M.done || M.loading || !M.list.length) return;
  M.loading = true; const cid = M.cid;
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', cid).lt('created_at', M.list[0].created_at).order('created_at', { ascending:false }).limit(50);
  if(M.cid !== cid){ M.loading = false; return; }
  const older = (data || []).reverse(); M.done = older.length < 50;
  await hydrate(older);
  const h0 = M.el.scrollHeight, t0 = M.el.scrollTop;
  M.list = older.concat(M.list);
  renderMsgList(false);
  M.el.scrollTop = M.el.scrollHeight - h0 + t0;
  M.loading = false;
}
async function loadNewer(){
  if(!M.detached || M.loading) return;
  M.loading = true; const cid = M.cid;
  const last = M.list[M.list.length - 1];
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', cid).gt('created_at', last.created_at).order('created_at').limit(50);
  if(M.cid !== cid){ M.loading = false; return; }
  await hydrate(data || []);
  M.list = M.list.concat(data || []);
  if((data || []).length < 50){ M.detached = false; M.newWhileAway = 0; }
  renderMsgList(false); M.loading = false;
}
function markRead(){
  if(!M.cid) return;
  const last = M.list[M.list.length - 1];
  READ[M.cid] = last ? last.created_at : new Date().toISOString();
  ls.set('telao-read', READ);
}

/* ---------- reações ---------- */
function addReact(mid, emoji, uid){
  if(!M.reacts.has(mid)) M.reacts.set(mid, new Map());
  const mm = M.reacts.get(mid); if(!mm.has(emoji)) mm.set(emoji, new Set());
  mm.get(emoji).add(uid);
}
function delReact(mid, emoji, uid){
  const mm = M.reacts.get(mid); if(!mm || !mm.has(emoji)) return;
  mm.get(emoji).delete(uid); if(!mm.get(emoji).size) mm.delete(emoji);
}
function reactsHtml(mid){
  const mm = M.reacts.get(mid); if(!mm || ![...mm.keys()].some(k => !k.startsWith('opt:'))) return '';
  return `<div class="reacts">${[...mm].filter(([e]) => !e.startsWith('opt:')).map(([e, set]) => {
    const names = [...set].slice(0, 6).map(u => prof(u).display_name).join(', ') + (set.size > 6 ? ` e mais ${set.size-6}` : '');
    return `<button class="rx ${set.has(S.me.id)?'mine':''}" data-rx="${esc(e)}" data-mid="${mid}" data-tip="${esc(names)}" data-tipsub="reagiu com ${esc(e)}"><span>${esc(e)}</span><b>${set.size}</b></button>`;
  }).join('')}<button class="rx add" data-addrx="${mid}" title="Adicionar reação">${ic('smilePlus',16)}</button></div>`;
}
async function toggleReact(mid, emoji){
  if(String(mid).startsWith('tmp')) return;
  const mm = M.reacts.get(mid), mine = mm && mm.get(emoji) && mm.get(emoji).has(S.me.id);
  if(mine){ delReact(mid, emoji, S.me.id); patchReacts(mid);
    const { error } = await App.sb.from('message_reactions').delete().eq('message_id', mid).eq('user_id', S.me.id).eq('emoji', emoji);
    if(error){ addReact(mid, emoji, S.me.id); patchReacts(mid); App.toast(error.message, true); }
  } else {
    addReact(mid, emoji, S.me.id); patchReacts(mid); pushRecent(emoji);
    const { error } = await App.sb.from('message_reactions').insert({ message_id: mid, emoji });
    if(error && !/duplicate/i.test(error.message)){ delReact(mid, emoji, S.me.id); patchReacts(mid); App.toast(error.message, true); }
  }
}
function patchReacts(mid){
  const pl = M.el && M.el.querySelector(`[data-poll="${mid}"]`);
  if(pl){ const m = M.list.find(x => x.id === mid), a = m && (m.attachments || []).find(x => x.type === 'poll'); if(a) pl.outerHTML = pollHtml(m, a); }
  const node = M.el && M.el.querySelector(`[data-m="${mid}"] .bd`); if(!node) return;
  const old = node.querySelector(':scope > .reacts'); const html = reactsHtml(mid);
  if(old){ if(html) old.outerHTML = html; else old.remove(); } else if(html) node.insertAdjacentHTML('beforeend', html);
}
App.onReaction = p => {
  const r = p.eventType === 'DELETE' ? p.old : p.new;
  if(!r || !M.cid || !M.list.find(m => m.id === r.message_id)) return;
  if(p.eventType === 'INSERT'){ if(r.user_id !== S.me.id || !(M.reacts.get(r.message_id)?.get(r.emoji)?.has(r.user_id))){ addReact(r.message_id, r.emoji, r.user_id); patchReacts(r.message_id); } }
  else if(p.eventType === 'DELETE'){ delReact(r.message_id, r.emoji, r.user_id); patchReacts(r.message_id); }
};

/* ---------- renderização ---------- */
function attHtml(m){
  const at = m.attachments || []; if(!at.length) return '';
  const imgs = at.filter(a => isImg(a) || isVid(a)), others = at.filter(a => !isImg(a) && !isVid(a) && a.type !== 'poll' && a.type !== 'gift' && a.type !== 'welcome' && a.type !== 'announce');
  let h = at.filter(a => a.type === 'welcome').map(a => App.welcomeCardHtml ? App.welcomeCardHtml(a) : '').join('') + at.filter(a => a.type === 'announce').map(a => App.announceCardHtml ? App.announceCardHtml(a) : '').join('') + at.filter(a => a.type === 'poll').map(a => pollHtml(m, a)).join('') + at.filter(a => a.type === 'gift').map(a => App.giftCardHtml(a)).join('');
  if(imgs.length){
    const n = Math.min(imgs.length, 4);
    h += `<div class="mgrid g${n}">` + imgs.map((a, i) => {
      const ratio = a.w && a.h ? `aspect-ratio:${a.w}/${a.h};` : '';
      const ph = a.thumb ? `background-image:url('${a.thumb}');` : '';
      const single = imgs.length === 1 ? `max-width:${Math.min(a.w || 400, 520)}px;` : '';
      if(isVid(a)) return `<div class="mitem vid" style="${single}${imgs.length===1?ratio:''}"><video src="${esc(a.url)}${a.start > 0 ? '#t=' + (+a.start).toFixed(1) : ''}" preload="metadata" controls playsinline></video>${a.clip ? `<span class="cliptag">${ic('zap', 12)} Clipe</span>` : ''}</div>`;
      return `<div class="mitem ${m._sending?'sending':''}" style="${single}${imgs.length===1?ratio:''}${ph}" data-lightbox="${m.id}" data-idx="${i}">
        <img src="${esc(a.url)}" ${a.w?`width="${a.w}" height="${a.h}"`:''} loading="lazy" decoding="async" alt="" onload="this.parentNode.classList.add('ok')">
        ${a.spoiler ? '<span class="spoilimg" data-spoiler>SPOILER</span>' : ''}</div>`;
    }).join('') + '</div>';
  }
  others.forEach(a => {
    if(isAud(a) && a.voice) h += voicePlayerHtml(a, m);
    else if(isAud(a)) h += `<div class="fcard">${ic('music',26)}<div class="t"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name || 'áudio')}</a><small>${fmtSize(a.size||0)}</small><audio src="${esc(a.url)}" controls preload="none"></audio></div></div>`;
    else h += `<div class="fcard">${ic('file',26)}<div class="t"><a href="${esc(a.url)}" target="_blank" rel="noopener" download>${esc(a.name || 'arquivo')}</a><small>${fmtSize(a.size||0)}</small></div><a class="dl" href="${esc(a.url)}" target="_blank" rel="noopener" download title="Baixar">${ic('download',20)}</a></div>`;
  });
  return h;
}
function voicePlayerHtml(a, m){
  const wave = (a.wave || Array(40).fill(4)).map(v => `<i style="height:${Math.max(3, Math.min(28, v))}px"></i>`).join('');
  const txt = a.text || (App.trCache && App.trCache(a.url));
  const tr = txt ? `<div class="vtext"><span class="vtl">${ic('chat', 12)} Transcrição</span>${esc(txt)}</div>`
    : m && !m._sending ? `<button class="vtr" data-trans="${m.id}" data-turl="${esc(a.url)}">${ic('pen', 13)} Transcrever</button>` : '';
  return `<div class="vbox"><div class="vplayer" data-voice="${esc(a.url)}" data-dur="${a.dur||0}"><button class="vplay">${ic('play',16)}</button><div class="vwave">${wave}</div><span class="vtime">${fmtDur(a.dur||0)}</span></div>${tr}</div>`;
}
const fmtDur = s => { s = Math.round(s); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };
function embedsHtml(m){
  const urls = (m.content || '').match(/https?:\/\/[^\s<]+/g) || [];
  return urls.map(ytId).filter(Boolean).slice(0, 2).map(id => `<div class="yt" data-yt="${id}"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" loading="lazy" decoding="async" alt=""><span class="ytplay">${ic('play',28)}</span></div>`).join('');
}
function replyHtml(m){
  if(!m.reply_to) return '';
  const r = M.list.find(x => x.id === m.reply_to) || (M._replyCache && M._replyCache.get(m.reply_to));
  if(!r) return `<div class="rquote"><span class="rline"></span><i>Mensagem original apagada</i></div>`;
  const p = prof(r.author_id);
  const snip = r.content ? esc(r.content.slice(0, 120)) : (r.attachments && r.attachments.length ? `${ic('image',14)} Anexo` : '');
  return `<div class="rquote" data-jump="${r.id}"><span class="rline"></span>${avatar(p,'xs')}<b style="color:${roleColor(p.id) || 'var(--txt)'}">${esc(p.display_name)}</b><span class="rsnip">${snip}</span></div>`;
}
function roleColor(uid){ return App.roleColorOf ? App.roleColorOf(uid) : null; }
function msgHtml(m, prev){
  const day = new Date(m.created_at).toDateString();
  let pre = '';
  if(!prev || new Date(prev.created_at).toDateString() !== day) pre += `<div class="daysep"><span>${fmtDay(m.created_at)}</span></div>`;
  if(M.readAt && m.created_at > M.readAt && (!prev || prev.created_at <= M.readAt) && m.author_id !== S.me.id) pre += `<div class="newsep"><span>novas mensagens</span></div>`;
  const grouped = !pre && prev && !m.reply_to && prev.author_id === m.author_id && (new Date(m.created_at) - new Date(prev.created_at)) < 7*60*1000;
  const p = prof(m.author_id), mine = m.author_id === S.me.id;
  const time = new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const mentioned = !mine && S.me && m.content && (m.content.includes('@' + S.me.username) || /@(todos|everyone)\b/.test(m.content));
  const emo = onlyEmoji(m.content) && !(m.attachments || []).length;
  const atts = attHtml(m), emb = embedsHtml(m);
  const onlyMedia = !m.content && (m.attachments || []).some(a => isImg(a) || isVid(a)) && !(m.attachments || []).some(a => a.type === 'poll');
  const meta = `<span class="mtime" title="${new Date(m.created_at).toLocaleString('pt-BR')}">${m.edited_at ? '<span class="edited">editado</span> · ' : ''}${m._sending ? ic('clock',11) : time}${m.pinned ? ' ' + ic('pin',11) : ''}</span>`;
  const content = M.editing === m.id
    ? `<textarea class="editbox" id="edBox" rows="2" maxlength="4000">${esc(m.content)}</textarea><div class="edithint">Esc para <a data-edcancel>cancelar</a> · Enter para <a data-edsave>salvar</a></div>`
    : (m.content && !(m.attachments || []).some(a => a.type === 'welcome' || a.type === 'announce') ? `<div class="ct ${emo?'jumbo':''}">${richText(m.content)}</div>` : '');
  const bub = `<div class="bub ${emo?'emo':''} ${onlyMedia || (m.attachments || []).some(a => a.type === 'welcome' || a.type === 'announce')?'media':''}">${content}${atts}${emb}${meta}</div>`;
  const tools = m._sending ? '' : `<div class="acts">
      ${EMOJI.QUICK.slice(0,3).map(e => `<button data-quick="${e}" data-mid="${m.id}" title="Reagir">${e}</button>`).join('')}
      <button data-addrx="${m.id}" title="Adicionar reação">${ic('smilePlus',17)}</button>
      <button data-reply="${m.id}" title="Responder">${ic('reply',17)}</button>
      ${mine ? `<button data-edit="${m.id}" title="Editar">${ic('edit',17)}</button>` : ''}
      <button data-more="${m.id}" title="Mais">${ic('dots',17)}</button></div>`;
  const cls = `msg ${grouped?'':'first'} ${mine?'mine':''} ${mentioned?'mentioned':''} ${m.pinned?'pinned':''} ${m._sending?'sendingmsg':''}`;
  const color = roleColor(m.author_id);
  const head = mine ? '' : `<div class="hd"><b data-uprof="${p.id}" ${color ? `style="color:${color}"` : ''}>${nameHtml(p)}</b>${hasPlus(p) ? badgeHtml(BADGES[2], p, 'sm') : ''}</div>`;
  const av = mine ? '' : grouped ? '<div class="avsp"></div>' : avatar(p,'lg').replace('class="av lg', `data-uprof="${p.id}" class="av lg`);
  return `${pre}<div class="${cls}" data-m="${m.id}">${grouped ? '' : replyHtml(m)}<div class="mline">${av}<div class="bd">${grouped ? '' : head}${bub}${reactsHtml(m.id)}</div></div>${tools}</div>`;
}
function renderMsgList(stick){
  if(!M.el) return;
  const nearBottom = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 160;
  let h = M.done ? M.welcome : `<div class="loadmore"><div class="spin"></div></div>`;
  let prev = null;
  M.list.forEach(m => { h += msgHtml(m, prev); prev = m; });
  if(M.detached) h += `<div class="loadmore"><div class="spin"></div></div>`;
  M.el.innerHTML = h;
  bindEditor();
  if(stick === true || (stick == null && nearBottom)) toBottom();
  updateJump();
}
function toBottom(){
  if(!M.el) return;
  M.el.scrollTop = M.el.scrollHeight;
  // imagens com tamanho conhecido não pulam; as sem tamanho ajustam quando carregam
  M.el.querySelectorAll('img:not([width])').forEach(img => { if(!img.complete) img.addEventListener('load', () => { if(M.el && M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 400) M.el.scrollTop = M.el.scrollHeight; }, { once:true }); });
}
function appendMessage(m){
  const prev = M.list[M.list.length - 2];
  const nearBottom = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 160;
  M.el.insertAdjacentHTML('beforeend', msgHtml(m, prev));
  if(m.author_id === S.me.id || nearBottom) toBottom(); else { M.newWhileAway++; updateJump(); }
}
function addMessage(m){
  if(M.cid !== m.channel_id) return;
  const tmp = m._tmpOf ? M.list.findIndex(x => x.id === m._tmpOf) : -1;
  if(M.list.find(x => x.id === m.id)) return;
  if(M.detached){ M.newWhileAway++; updateJump(); return; }
  // substitui a mensagem "enviando…" pela de verdade
  const pend = tmp >= 0 ? tmp : M.list.findIndex(x => x._sending && x._sig === sigOf(m));
  if(pend >= 0){
    const old = M.list[pend];
    (old.attachments || []).forEach(a => a._local && URL.revokeObjectURL(a.url));
    M.list[pend] = m;
    const node = M.el.querySelector(`[data-m="${old.id}"]`);
    if(node){ const tmp = document.createElement('div'); tmp.innerHTML = msgHtml(m, M.list[pend - 1]); const nn = tmp.querySelector(`[data-m="${m.id}"]`); if(nn) node.replaceWith(nn); }
    else renderMsgList(null);
  } else {
    M.list.push(m); M.list.sort((a,b) => a.created_at.localeCompare(b.created_at));
    if(M.list[M.list.length - 1] === m) appendMessage(m); else renderMsgList(null);
  }
  M.typing.has(m.author_id) && (clearTimeout(M.typing.get(m.author_id)), M.typing.delete(m.author_id), renderTyping());
  const fx = msgEffectFor(m.content); if(fx && !M._fxDone?.has(m.id)){ (M._fxDone = M._fxDone || new Set()).add(m.id); burst(fx); }
  if(!document.hidden) markRead();
}
const sigOf = m => m.author_id + '|' + (m.content || '') + '|' + (m.attachments || []).length;
App.onMsgUpdate = row => {
  const i = M.list.findIndex(x => x.id === row.id); if(i < 0) return;
  M.list[i] = row;
  const node = M.el && M.el.querySelector(`[data-m="${row.id}"]`);
  if(node && M.editing !== row.id){ const html = msgHtml(row, M.list[i-1]); const tmp = document.createElement('div'); tmp.innerHTML = html; node.replaceWith(tmp.querySelector(`[data-m="${row.id}"]`)); }
};
App.onMsgDelete = id => {
  const i = M.list.findIndex(x => x.id === id); if(i < 0) return;
  M.list.splice(i, 1); renderMsgList(false);
};
function updateJump(){
  const b = $('#jumpBtn'); if(!b || !M.el) return;
  const far = M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight > 600;
  b.classList.toggle('hidden', !(far || M.detached));
  b.querySelector('span').textContent = M.newWhileAway ? `${M.newWhileAway} nova${M.newWhileAway>1?'s':''} mensage${M.newWhileAway>1?'ns':'m'}` : M.detached ? 'Ir para o presente' : 'Ir para o fim';
}
function onMsgScroll(){
  if(M.el.scrollTop < 300) loadOlder();
  if(M.detached && M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 300) loadNewer();
  if(M.el.scrollHeight - M.el.scrollTop - M.el.clientHeight < 80 && M.newWhileAway && !M.detached){ M.newWhileAway = 0; }
  updateJump();
}

/* ---------- cliques dentro das mensagens ---------- */
function onMsgClick(e){
  const t = e.target;
  const sp = t.closest('[data-spoiler]'); if(sp){ sp.classList.add('show'); return; }
  const cc = t.closest('[data-copycode]'); if(cc){ copy(cc.closest('pre').querySelector('code').textContent); return; }
  const up = t.closest('[data-uprof]'); if(up){ userMenu(up.dataset.uprof, e.clientX, e.clientY); return; }
  const q = t.closest('[data-quick]'); if(q){ toggleReact(q.dataset.mid, q.dataset.quick); return; }
  const vt = t.closest('[data-vote]'); if(vt){ vote(vt.dataset.mid, +vt.dataset.vote); return; }
  const rx = t.closest('[data-rx]'); if(rx){ toggleReact(rx.dataset.mid, rx.dataset.rx); return; }
  const ar = t.closest('[data-addrx]'); if(ar){ const r = ar.getBoundingClientRect(); emojiPicker(r.left, r.top, em => toggleReact(ar.dataset.addrx, em)); return; }
  const rp = t.closest('[data-reply]'); if(rp){ startReply(rp.dataset.reply); return; }
  const ed = t.closest('[data-edit]'); if(ed){ M.editing = ed.dataset.edit; rerenderOne(ed.dataset.edit); return; }
  const mo = t.closest('[data-more]'); if(mo){ msgMenu(mo.dataset.more, e.clientX, e.clientY); return; }
  const jp = t.closest('[data-jump]'); if(jp){ jumpTo(jp.dataset.jump); return; }
  const lb = t.closest('[data-lightbox]'); if(lb && !lb.querySelector('.spoilimg:not(.show)')){ lightbox(lb.dataset.lightbox, +lb.dataset.idx); return; }
  const yt = t.closest('[data-yt]'); if(yt){ yt.outerHTML = `<div class="yt on"><iframe src="https://www.youtube-nocookie.com/embed/${yt.dataset.yt}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`; return; }
  const vp = t.closest('.vplay'); if(vp){ playVoice(vp.closest('.vplayer')); return; }
  if(t.closest('[data-edcancel]')){ M.editing = null; rerenderOne(); return; }
  if(t.closest('[data-edsave]')){ saveEdit(); return; }
}
function onMsgContext(e){
  const node = e.target.closest('[data-m]'); if(!node || e.target.closest('a,img.embed,video')) return;
  e.preventDefault(); msgMenu(node.dataset.m, e.clientX, e.clientY);
}
function rerenderOne(id){ renderMsgList(false); }
function canModerate(){
  const ch = M.ch; if(!ch) return false;
  if(ch.kind === 'dm') return true;
  if(ch.kind === 'group') return ch.owner_id === S.me.id;
  return App.hasPerm ? App.hasPerm(ch.server_id, 8) : (curServer() && curServer().owner_id === S.me.id);
}
function msgMenu(mid, x, y){
  const m = M.list.find(x => x.id === mid); if(!m || m._sending) return;
  const mine = m.author_id === S.me.id, mod = canModerate();
  const items = [
    { raw: `<div class="quickrx">${EMOJI.QUICK.map(e => `<button data-q="${e}">${e}</button>`).join('')}</div>`, mount: el => el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { closeMenu(); toggleReact(mid, b.dataset.q); }) },
    { label:'Adicionar reação', icon: ic('smilePlus',18), onClick: () => emojiPicker(x, y, em => toggleReact(mid, em)) },
    { label:'Responder', icon: ic('reply',18), onClick: () => startReply(mid) },
  ];
  if(mine) items.push({ label:'Editar mensagem', icon: ic('edit',18), onClick: () => { M.editing = mid; rerenderOne(mid); } });
  if(mod) items.push({ label: m.pinned ? 'Desafixar' : 'Fixar mensagem', icon: ic('pin',18), onClick: () => pinMsg(m) });
  if(m.content) items.push({ label:'Copiar texto', icon: ic('copy',18), onClick: () => copy(m.content) });
  (m.attachments || []).filter(isImg).slice(0,1).forEach(a => items.push({ label:'Abrir imagem original', icon: ic('expand',18), onClick: () => window.open(a.url, '_blank', 'noopener') }));
  if(mine || mod) items.push('-', { label:'Apagar mensagem', icon: ic('trash',18), danger:true, onClick: () => deleteMsg(m) });
  menu(x, y, items, 'mmenu');
}
async function deleteMsg(m, skipConfirm){
  if(!skipConfirm && !(await confirmBox('Apagar mensagem', 'Tem certeza? Dica: segure <b>Shift</b> ao clicar na lixeira para apagar sem perguntar.', 'Apagar'))) return;
  const { error } = await App.sb.from('messages').delete().eq('id', m.id);
  if(error){ App.toast(error.message, true); return; }
  App.onMsgDelete(m.id);
}
async function pinMsg(m){
  const { error } = await App.sb.rpc('pin_message', { p_id: m.id, p_pin: !m.pinned });
  if(error){ App.toast(error.message, true); return; }
  m.pinned = !m.pinned; App.onMsgUpdate({ ...m }); App.toast(m.pinned ? 'Mensagem fixada' : 'Mensagem desafixada');
}
function bindEditor(){
  const ed = $('#edBox'); if(!ed) return;
  ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
  ed.style.height = 'auto'; ed.style.height = ed.scrollHeight + 'px';
  ed.oninput = () => { ed.style.height = 'auto'; ed.style.height = ed.scrollHeight + 'px'; };
  ed.onkeydown = e => {
    if(e.key === 'Escape'){ M.editing = null; rerenderOne(); }
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); saveEdit(); }
  };
}
async function saveEdit(){
  const ed = $('#edBox'); if(!ed) return;
  const v = ed.value.trim(), id = M.editing; M.editing = null;
  const old = M.list.find(x => x.id === id);
  if(old && !v && !(old.attachments || []).length){ rerenderOne(); deleteMsg(old); return; }
  if(old && v !== old.content){
    old.content = v; old.edited_at = new Date().toISOString();
    const { error } = await App.sb.from('messages').update({ content: v }).eq('id', id);
    if(error) App.toast(error.message, true);
  }
  rerenderOne();
}
async function jumpTo(mid){
  const node = M.el && M.el.querySelector(`[data-m="${mid}"]`);
  if(node){ node.scrollIntoView({ block:'center', behavior:'smooth' }); node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash'); return; }
  const { data: target } = await App.sb.from('messages').select('*').eq('id', mid).maybeSingle();
  if(!target || target.channel_id !== M.cid){ App.toast('Mensagem não encontrada.', true); return; }
  const [{ data: before }, { data: after }] = await Promise.all([
    App.sb.from('messages').select('*').eq('channel_id', M.cid).lt('created_at', target.created_at).order('created_at', { ascending:false }).limit(25),
    App.sb.from('messages').select('*').eq('channel_id', M.cid).gt('created_at', target.created_at).order('created_at').limit(25),
  ]);
  M.list = (before || []).reverse().concat([target], after || []);
  M.done = (before || []).length < 25; M.detached = (after || []).length >= 25;
  await hydrate(M.list);
  renderMsgList(false);
  const n = M.el.querySelector(`[data-m="${mid}"]`); if(n){ n.scrollIntoView({ block:'center' }); n.classList.add('flash'); }
}

/* ---------- visualizador de imagens ---------- */
function lightbox(mid, idx){
  const m = M.list.find(x => x.id === mid); if(!m) return;
  const imgs = (m.attachments || []).filter(a => isImg(a));
  let i = idx;
  const el = document.createElement('div'); el.className = 'lightbox';
  const draw = () => {
    const a = imgs[i];
    el.innerHTML = `<div class="lbbar"><span>${esc(prof(m.author_id).display_name)} · ${fmtTime(m.created_at)}</span><span class="grow"></span>
      <a href="${esc(a.url)}" target="_blank" rel="noopener" download title="Baixar">${ic('download',20)}</a><a href="${esc(a.url)}" target="_blank" rel="noopener" title="Abrir original">${ic('expand',20)}</a><button data-x title="Fechar">${ic('x',22)}</button></div>
      ${imgs.length > 1 ? `<button class="lbnav l" data-p>${ic('chevLeft',28)}</button><button class="lbnav r" data-n>${ic('chevRight',28)}</button>` : ''}
      <img src="${esc(a.url)}" alt="" ${a.thumb?`style="background-image:url('${a.thumb}')"`:''}>
      ${imgs.length > 1 ? `<div class="lbcount">${i+1} / ${imgs.length}</div>` : ''}`;
  };
  draw(); document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 180); document.removeEventListener('keydown', key); };
  const key = e => { if(e.key === 'Escape') close(); if(e.key === 'ArrowRight' && imgs.length > 1){ i = (i+1) % imgs.length; draw(); } if(e.key === 'ArrowLeft' && imgs.length > 1){ i = (i-1+imgs.length) % imgs.length; draw(); } };
  document.addEventListener('keydown', key);
  el.onclick = e => {
    if(e.target.closest('[data-x]') || e.target === el) close();
    else if(e.target.closest('[data-n]')){ i = (i+1) % imgs.length; draw(); }
    else if(e.target.closest('[data-p]')){ i = (i-1+imgs.length) % imgs.length; draw(); }
  };
}

/* ---------- mensagem de voz: player ---------- */
let voiceAudio = null, voiceEl = null;
function playVoice(el){
  if(voiceEl === el && voiceAudio){ if(voiceAudio.paused) voiceAudio.play(); else voiceAudio.pause(); return; }
  if(voiceAudio){ voiceAudio.pause(); voiceEl && voiceEl.classList.remove('playing'); }
  voiceEl = el; voiceAudio = new Audio(el.dataset.voice);
  const bars = [...el.querySelectorAll('.vwave i')], btn = el.querySelector('.vplay'), tm = el.querySelector('.vtime');
  const dur = +el.dataset.dur || 0;
  voiceAudio.ontimeupdate = () => {
    const d = isFinite(voiceAudio.duration) ? voiceAudio.duration : dur, f = d ? voiceAudio.currentTime / d : 0;
    bars.forEach((b, k) => b.classList.toggle('on', k / bars.length <= f));
    tm.textContent = fmtDur(voiceAudio.currentTime);
  };
  voiceAudio.onplay = () => { btn.innerHTML = ic('pause',16); el.classList.add('playing'); };
  voiceAudio.onpause = () => { btn.innerHTML = ic('play',16); };
  voiceAudio.onended = () => { btn.innerHTML = ic('play',16); bars.forEach(b => b.classList.remove('on')); tm.textContent = fmtDur(dur); el.classList.remove('playing'); };
  voiceAudio.play().catch(() => App.toast('Não deu para tocar esse áudio.', true));
}

/* ---------- compositor ---------- */
function bindComposer(ch){
  const ta = $('#cmp'), form = $('#cmpF');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight) + 'px'; };
  ta.oninput = () => { grow(); sendTyping(); autocomplete(); };
  ta.onkeydown = e => {
    if(acKey(e)) return;
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()){ e.preventDefault(); form.requestSubmit(); }
    if(e.key === 'ArrowUp' && !ta.value){ const last = [...M.list].reverse().find(m => m.author_id === S.me.id && !m._sending); if(last){ e.preventDefault(); M.editing = last.id; rerenderOne(); } }
    if(e.key === 'Escape' && M.replyTo){ cancelReply(); }
  };
  ta.onpaste = e => {
    const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if(files.length){ e.preventDefault(); addFiles(files); }
  };
  form.onsubmit = e => { e.preventDefault(); sendMessage(); };
  $('#cAttach').onclick = () => $('#cFile').click();
  $('#cFile').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#cEmoji').onclick = () => { const r = $('#cEmoji').getBoundingClientRect(); emojiPicker(r.right - 340, r.top, em => insertAtCaret(ta, em), true); };
  $('#cVoice').onclick = startRecording;
  // arrastar e soltar
  const zone = $('#mainBody'), dz = $('#dropZone');
  let depth = 0;
  zone.ondragenter = e => { if(!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); depth++; dz.classList.remove('hidden'); };
  zone.ondragover = e => { if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  zone.ondragleave = () => { if(--depth <= 0){ depth = 0; dz.classList.add('hidden'); } };
  zone.ondrop = e => { e.preventDefault(); depth = 0; dz.classList.add('hidden'); if(e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); };
  $('#jumpBtn').onclick = () => { if(M.detached){ M.newWhileAway = 0; loadLatest(); } else { M.newWhileAway = 0; toBottom(); updateJump(); } };
  if(!isMobile()) setTimeout(() => ta.focus(), 30);
}
function insertAtCaret(ta, text){
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus(); ta.dispatchEvent(new Event('input'));
}
function startReply(mid){
  const m = M.list.find(x => x.id === mid); if(!m) return;
  M.replyTo = mid;
  const bar = $('#replyBar'); bar.classList.remove('hidden');
  bar.innerHTML = `<span>Respondendo a <b>${esc(prof(m.author_id).display_name)}</b></span><button id="rbX" title="Cancelar">${ic('x',16)}</button>`;
  $('#rbX').onclick = cancelReply; $('#cmp').focus();
}
function cancelReply(){ M.replyTo = null; const b = $('#replyBar'); if(b){ b.classList.add('hidden'); b.innerHTML = ''; } }

/* ---------- digitando… ---------- */
function sendTyping(){
  if(!M.typingCh || Date.now() - M.lastTypingSent < 2500 || !$('#cmp').value) return;
  M.lastTypingSent = Date.now();
  M.typingCh.send({ type:'broadcast', event:'t', payload:{ u: S.me.id } }).catch(()=>{});
}
function onTyping(pl){
  if(!pl || pl.u === S.me.id) return;
  clearTimeout(M.typing.get(pl.u));
  M.typing.set(pl.u, setTimeout(() => { M.typing.delete(pl.u); renderTyping(); }, 4000));
  ensureProfiles([pl.u]).then(renderTyping);
}
function renderTyping(){
  const el = $('#typingLine'); if(!el) return;
  const names = [...M.typing.keys()].map(u => `<b>${esc(prof(u).display_name)}</b>`);
  el.innerHTML = !names.length ? '' : `<span class="tdots"><i></i><i></i><i></i></span>` + (names.length === 1 ? `${names[0]} está digitando…` : names.length <= 3 ? `${names.slice(0,-1).join(', ')} e ${names[names.length-1]} estão digitando…` : 'Várias pessoas estão digitando…');
}

/* ---------- anexos: comprimir e enviar ---------- */
const maxUpload = () => (hasPlus(S.me) ? 25 : 10) * 1024 * 1024;
function addFiles(files){
  for(const f of files){
    if(M.files.length >= 10){ App.toast('No máximo 10 arquivos por mensagem.', true); break; }
    if(f.size > maxUpload()){ App.toast(`"${f.name}" passa de ${hasPlus(S.me)?25:10} MB.${hasPlus(S.me)?'':' Com o Telão+ vai até 25 MB.'}`, true); continue; }
    M.files.push({ file: f, preview: /^(image|video)\//.test(f.type) ? URL.createObjectURL(f) : null, spoiler: false });
  }
  drawFiles();
  $('#cmp') && $('#cmp').focus();
}
function drawFiles(){
  const el = $('#fileStrip'); if(!el) return;
  el.classList.toggle('hidden', !M.files.length);
  el.innerHTML = M.files.map((f, i) => `<div class="fthumb ${f.spoiler?'sp':''}">
      ${f.preview && /^image/.test(f.file.type) ? `<img src="${f.preview}" alt="">` : f.preview ? `<video src="${f.preview}" muted></video>` : `<div class="fic">${ic('file',30)}</div>`}
      <span class="fname">${esc(f.file.name)}</span>
      <div class="ftools">${/^image/.test(f.file.type) ? `<button data-fsp="${i}" title="Marcar como spoiler">${ic(f.spoiler?'eye':'eyeOff',15)}</button>` : ''}<button data-frm="${i}" title="Remover">${ic('trash',15)}</button></div></div>`).join('');
  el.querySelectorAll('[data-frm]').forEach(b => b.onclick = () => { const f = M.files.splice(+b.dataset.frm, 1)[0]; f.preview && URL.revokeObjectURL(f.preview); drawFiles(); });
  el.querySelectorAll('[data-fsp]').forEach(b => b.onclick = () => { M.files[+b.dataset.fsp].spoiler = !M.files[+b.dataset.fsp].spoiler; drawFiles(); });
}
/* reduz a imagem (máx. 1920px, WebP) e cria uma miniatura minúscula para carregar instantâneo */
async function compressImage(file){
  if(!/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) {
    const dim = await imgDims(file).catch(() => ({}));
    return { blob: file, type: file.type, ...dim, thumb: await tinyThumb(file).catch(() => null) };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.82));
  if(!blob || blob.type !== 'image/webp') blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
  if(blob.size > file.size && scale === 1){ blob = file; }
  const t = document.createElement('canvas'); const tw = 24, th = Math.max(1, Math.round(24 * h / w));
  t.width = tw; t.height = th; t.getContext('2d').drawImage(bmp, 0, 0, tw, th);
  bmp.close && bmp.close();
  return { blob, type: blob.type, w, h, thumb: t.toDataURL('image/jpeg', 0.5) };
}
function imgDims(file){ return new Promise((res, rej) => { const i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(i.src); }; i.onerror = rej; i.src = URL.createObjectURL(file); }); }
async function tinyThumb(file){
  const bmp = await createImageBitmap(file); const t = document.createElement('canvas');
  t.width = 24; t.height = Math.max(1, Math.round(24 * bmp.height / bmp.width)); t.getContext('2d').drawImage(bmp, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.5);
}
function vidDims(file){ return new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(v.src); }; v.onerror = () => res({}); v.src = URL.createObjectURL(file); }); }
async function uploadOne(f){
  let blob = f.file, meta = { name: f.file.name, type: f.file.type || 'application/octet-stream', size: f.file.size };
  if(/^image\//.test(f.file.type)){ try{ const c = await compressImage(f.file); blob = c.blob; Object.assign(meta, { type: c.type, w: c.w, h: c.h, thumb: c.thumb, size: c.blob.size }); }catch(e){} }
  else if(/^video\//.test(f.file.type)){ Object.assign(meta, await vidDims(f.file)); }
  if(f.voice) Object.assign(meta, { voice: true, dur: f.dur, wave: f.wave }, f.text ? { text: f.text.slice(0, 4000) } : {});
  if(f.spoiler) meta.spoiler = true;
  const ext = (meta.type.split('/')[1] || 'bin').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'').slice(0,5) || 'bin';
  const base = (f.file.name || 'arquivo').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40) || 'arquivo';
  const path = `${S.me.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}-${base}.${ext}`;
  const { error } = await App.sb.storage.from('attachments').upload(path, blob, { contentType: meta.type, cacheControl: '31536000', upsert: false });
  if(error) throw error;
  meta.url = App.sb.storage.from('attachments').getPublicUrl(path).data.publicUrl;
  return meta;
}
async function sendMessage(extraFiles){
  const ta = $('#cmp'); if(!ta) return;
  let content = ta.value.trim().replace(/:([a-z0-9_]{2,30}):/g, (m, k) => EMOJI.BY[k] || m);
  let cmdAtt = null;
  if(!extraFiles && content.startsWith('/')){
    const r = runCommand(content);
    if(r && r.error){ App.toast(r.error, true); return; }
    if(r){ content = r.content; cmdAtt = r.attachments || null; if(r.fx){ (M._fxDone = M._fxDone || new Set()); } }
  }
  const files = extraFiles || (cmdAtt ? [] : M.files.splice(0));
  if(!content && !files.length && !cmdAtt) return;
  const reply_to = M.replyTo, ch = M.ch;
  if(!extraFiles){ ta.value = ''; ta.style.height = 'auto'; cancelReply(); drawFiles(); }
  // mensagem otimista: aparece na hora, com as imagens locais
  const tmpId = 'tmp-' + Math.random().toString(36).slice(2);
  const temp = { id: tmpId, _sending: true, channel_id: ch.id, author_id: S.me.id, content, reply_to, created_at: new Date().toISOString(), pinned: false,
                 attachments: cmdAtt ? cmdAtt : files.map(f => ({ url: f.preview || '', name: f.file.name, type: f.file.type, size: f.file.size, _local: !!f.preview, voice: f.voice, dur: f.dur, wave: f.wave })) };
  M.list.push(temp); appendMessage(temp);
  try{
    const attachments = cmdAtt || await Promise.all(files.map(uploadOne));
    const { data, error } = await App.sb.from('messages').insert({ channel_id: ch.id, content, attachments, reply_to }).select().single();
    if(error) throw error;
    data._tmpOf = tmpId; addMessage(data);
    if(isPriv(ch)){ S.dmActivity[ch.id] = data.created_at; ls.set('telao-dmact', S.dmActivity); }
  }catch(err){
    const i = M.list.findIndex(x => x.id === tmpId); if(i >= 0) M.list.splice(i, 1);
    renderMsgList(false);
    App.toast('Não foi enviada: ' + (err.message || err), true);
    if(!extraFiles){ ta.value = content; M.files = files; drawFiles(); }
  }
}

/* ---------- gravação de mensagem de voz ---------- */
async function startRecording(){
  if(M.rec) return;
  if(!window.MediaRecorder){ App.toast('Seu navegador não grava áudio.', true); return; }
  let stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } }); }
  catch(e){ App.toast('Sem acesso ao microfone.', true); return; }
  const mime = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {});
  const chunks = [], peaks = [];
  const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
  const t0 = Date.now();
  M.rec = { rec, stream, ctx, chunks, peaks, t0, cancel:false };
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start(250);
  // transcrição ao vivo (reconhecimento de voz do navegador, quando existe)
  const R0 = M.rec, SRc = window.SpeechRecognition || window.webkitSpeechRecognition;
  R0.fin = ''; R0.inter = '';
  if(SRc && P.voiceText !== false){
    try{
      const sr = new SRc(); sr.continuous = true; sr.interimResults = true; sr.lang = ({ en:'en-US', es:'es-ES' })[P.lang] || 'pt-BR';
      sr.onresult = e => {
        let fin = '', inter = '';
        for(let i = 0; i < e.results.length; i++){ const x = e.results[i]; if(x.isFinal) fin += x[0].transcript + ' '; else inter += x[0].transcript; }
        R0.fin = (R0.base || '') + fin; R0.inter = inter;
        const tx = $('#recTx'); if(tx && M.rec === R0) tx.textContent = (R0.fin + R0.inter).trim().slice(-90);
      };
      sr.onend = () => { if(M.rec === R0){ R0.base = R0.fin; try{ sr.start(); }catch(e){} } else if(R0.srDone) R0.srDone(); };
      sr.onerror = () => {};
      sr.start(); R0.sr = sr;
    }catch(e){}
  }
  const bar = $('#recBar'); bar.classList.remove('hidden'); $('#cmpF').classList.add('hidden');
  bar.innerHTML = `<button class="cbtn2" id="recX" title="Descartar">${ic('trash',20)}</button><span class="recdot"></span><span id="recT">0:00</span><div class="recwave" id="recW"></div><span class="rectx" id="recTx"></span><button class="btn sm" id="recOk">${ic('send',16)} Enviar</button>`;
  $('#recX').onclick = () => stopRecording(true);
  $('#recOk').onclick = () => stopRecording(false);
  M.rec.timer = setInterval(() => {
    an.getByteTimeDomainData(buf); let pk = 0; for(const v of buf) pk = Math.max(pk, Math.abs(v - 128));
    peaks.push(pk);
    const tEl = $('#recT'); if(tEl) tEl.textContent = fmtDur((Date.now() - t0) / 1000);
    const w = $('#recW'); if(w) w.innerHTML = peaks.slice(-60).map(p => `<i style="height:${Math.max(3, Math.min(26, p / 2.5))}px"></i>`).join('');
    if(Date.now() - t0 > 5 * 60 * 1000) stopRecording(false);
  }, 100);
}
function stopRecording(cancel){
  const R = M.rec; if(!R) return; M.rec = null;
  clearInterval(R.timer);
  const bar = $('#recBar'); if(bar){ bar.classList.add('hidden'); bar.innerHTML = ''; } const f = $('#cmpF'); if(f) f.classList.remove('hidden');
  const srEnd = R.sr ? new Promise(res => { R.srDone = res; try{ R.sr.stop(); }catch(e){ res(); } setTimeout(res, 1500); }) : Promise.resolve();
  R.rec.onstop = async () => {
    R.stream.getTracks().forEach(t => t.stop()); R.ctx.close().catch(()=>{});
    if(cancel){ try{ R.sr && R.sr.abort(); }catch(e){} return; }
    await srEnd;
    const text = ((R.fin || '') + ' ' + (R.inter || '')).replace(/\s+/g, ' ').trim();
    const dur = (Date.now() - R.t0) / 1000;
    if(dur < 0.7){ App.toast('Áudio muito curto.'); return; }
    const type = (R.rec.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(R.chunks, { type });
    const n = 40, step = Math.max(1, Math.floor(R.peaks.length / n));
    const wave = Array.from({ length: n }, (_, i) => Math.round(Math.max(...R.peaks.slice(i*step, i*step+step).concat([2])) / 2.2));
    const file = new File([blob], 'mensagem-de-voz.' + (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'), { type });
    sendMessage([{ file, preview: null, voice: true, dur, wave, text }]);
  };
  R.rec.stop();
}

/* ---------- autocompletar @menções e :emojis: ---------- */
let AC = null;
function autocomplete(){
  const ta = $('#cmp'), pop = $('#acPop'); if(!ta || !pop) return;
  const before = ta.value.slice(0, ta.selectionStart);
  let m, items = [];
  if((m = before.match(/^\/(\w*)$/))){
    const q = m[1].toLowerCase();
    items = CMDS.filter(c => c[0].startsWith(q)).map(c => ({ html: `<span class="acem">${c[3]}</span><b>/${c[0]}</b> <small>${esc(c[1])}</small><small class="acd">${esc(c[2])}</small>`, ins: '/' + c[0] + ' ', len: m[1].length + 1, cmd: true }));
  } else if((m = before.match(/(?:^|\s)@([a-z0-9_]{0,24})$/i))){
    const q = m[1].toLowerCase();
    const pool = M.ch.kind === 'dm' ? [S.me.id, dmOther(M.ch)] : M.ch.kind === 'group' ? (M.ch.members || []) : (S.members.get(M.ch.server_id) || []).map(x => x.user_id);
    items = pool.map(prof).filter(p => p.username.includes(q) || p.display_name.toLowerCase().includes(q)).slice(0, 8)
      .map(p => ({ html: `${avatar(p,'xs')}<b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small>`, ins: '@' + p.username + ' ', len: m[1].length + 1 }));
    if(M.ch.kind !== 'dm' && M.ch.kind !== 'group' && 'todos'.startsWith(q)) items.push({ html: `<span class="acic">${ic('at',16)}</span><b>@todos</b><small>Notifica todo mundo</small>`, ins: '@todos ', len: m[1].length + 1 });
  } else if((m = before.match(/:([a-z0-9_]{2,30})$/i))){
    const q = m[1].toLowerCase();
    items = EMOJI.LIST.filter(e => e.names.some(n => n.startsWith(q))).slice(0, 8)
      .map(e => ({ html: `<span class="acem">${e.ch}</span><b>:${esc(e.names.find(n => n.startsWith(q)))}:</b>`, ins: e.ch, len: m[1].length + 1 }));
  }
  if(!items.length){ pop.classList.add('hidden'); AC = null; return; }
  AC = { items, i: 0 };
  drawAC();
}
function drawAC(){
  const pop = $('#acPop');
  pop.innerHTML = `<div class="achead">${AC.items[0].cmd ? 'Comandos' : AC.items[0].ins.startsWith('@') ? 'Membros' : 'Emojis'}</div>` + AC.items.map((it, k) => `<div class="acit ${k===AC.i?'on':''}" data-k="${k}">${it.html}</div>`).join('');
  pop.classList.remove('hidden');
  pop.querySelectorAll('[data-k]').forEach(el => el.onmousedown = e => { e.preventDefault(); AC.i = +el.dataset.k; pickAC(); });
}
function pickAC(){
  const ta = $('#cmp'), it = AC.items[AC.i];
  const pos = ta.selectionStart;
  ta.value = ta.value.slice(0, pos - it.len) + it.ins + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos - it.len + it.ins.length;
  AC = null; $('#acPop').classList.add('hidden'); ta.focus();
}
function acKey(e){
  if(!AC) return false;
  if(e.key === 'ArrowDown'){ e.preventDefault(); AC.i = (AC.i + 1) % AC.items.length; drawAC(); return true; }
  if(e.key === 'ArrowUp'){ e.preventDefault(); AC.i = (AC.i - 1 + AC.items.length) % AC.items.length; drawAC(); return true; }
  if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); pickAC(); return true; }
  if(e.key === 'Escape'){ AC = null; $('#acPop').classList.add('hidden'); return true; }
  return false;
}

/* ---------- seletor de emojis ---------- */
function pushRecent(e){ const r = ls.get('telao-recent-emoji', []).filter(x => x !== e); r.unshift(e); ls.set('telao-recent-emoji', r.slice(0, 24)); }
function emojiPicker(x, y, onPick, keepOpen){
  closeMenu();
  const el = $('#menu'); el.className = 'menu epick';
  const recent = ls.get('telao-recent-emoji', []);
  const cats = (recent.length ? ['Recentes'] : []).concat(EMOJI.CATS);
  const catIcon = { 'Recentes':'🕘','Rostos':'😀','Gestos':'👋','Coração':'❤️','Pessoas':'🧑','Animais':'🐶','Comidas':'🍕','Atividades':'⚽','Objetos':'💡','Símbolos':'✅' };
  el.innerHTML = `<div class="ephead"><input id="epQ" placeholder="Procurar emoji" autocomplete="off"></div>
    <div class="epcats">${cats.map(c => `<button data-cat="${c}" title="${c}">${catIcon[c] || '•'}</button>`).join('')}</div>
    <div class="epgrid" id="epGrid"></div><div class="epfoot" id="epFoot">Escolha um emoji</div>`;
  const grid = el.querySelector('#epGrid');
  const draw = q => {
    if(q){ const r = EMOJI.LIST.filter(e => e.names.some(n => n.includes(q))); grid.innerHTML = r.length ? `<div class="epcat">Resultados</div><div class="eps">${r.map(e => `<button data-e="${e.ch}" data-n="${esc(e.names[0])}">${e.ch}</button>`).join('')}</div>` : '<div class="empty" style="padding:30px">Nada encontrado</div>'; return; }
    grid.innerHTML = cats.map(c => {
      const list = c === 'Recentes' ? recent.map(ch => ({ ch, names:[''] })) : EMOJI.LIST.filter(e => e.cat === c);
      return `<div class="epcat" id="ep-${c}">${c}</div><div class="eps">${list.map(e => `<button data-e="${e.ch}" data-n="${esc(e.names[0])}">${e.ch}</button>`).join('')}</div>`;
    }).join('');
  };
  draw('');
  el.classList.remove('hidden');
  const w = 352, h = 420;
  el.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y - h - 8, innerHeight - h - 8)) + 'px';
  const q = el.querySelector('#epQ'); setTimeout(() => q.focus(), 20);
  q.oninput = () => draw(q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { q.value = ''; draw(''); const t = el.querySelector('#ep-' + CSS.escape(b.dataset.cat)); t && grid.scrollTo({ top: t.offsetTop - grid.offsetTop, behavior:'smooth' }); });
  grid.onmouseover = e => { const b = e.target.closest('[data-e]'); if(b) el.querySelector('#epFoot').innerHTML = `<span style="font-size:22px">${b.dataset.e}</span> :${b.dataset.n}:`; };
  grid.onclick = e => {
    const b = e.target.closest('[data-e]'); if(!b) return;
    pushRecent(b.dataset.e); onPick(b.dataset.e);
    if(!(keepOpen && e.shiftKey)) closeMenu();
  };
  q.onkeydown = e => { if(e.key === 'Enter'){ const b = grid.querySelector('[data-e]'); b && b.click(); } if(e.key === 'Escape') closeMenu(); };
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}

/* ---------- fixadas e busca ---------- */
async function showPins(anchor){
  const r = anchor.getBoundingClientRect();
  const { data } = await App.sb.from('messages').select('*').eq('channel_id', M.cid).eq('pinned', true).order('created_at', { ascending:false }).limit(50);
  await ensureProfiles((data || []).map(m => m.author_id));
  const el = $('#menu'); el.className = 'menu panelpop';
  el.innerHTML = `<div class="pphead">${ic('pin',18)} Mensagens fixadas</div><div class="ppbody">${(data || []).length ? data.map(m => `<div class="ppit" data-goto="${m.id}">${avatar(prof(m.author_id),'sm')}<div><b>${esc(prof(m.author_id).display_name)}</b> <small>${fmtTime(m.created_at)}</small><div class="ppct">${m.content ? richText(m.content.slice(0, 300)) : ic('image',14) + ' Anexo'}</div></div></div>`).join('')
    : `<div class="empty">${ic('pin',36)}<br>Nenhuma mensagem fixada ainda.<br><small>Clique com o botão direito numa mensagem → Fixar.</small></div>`}</div>`;
  openPanel(el, r);
}
async function showSearch(anchor){
  const r = anchor.getBoundingClientRect();
  const el = $('#menu'); el.className = 'menu panelpop';
  el.innerHTML = `<div class="pphead"><div class="sbox">${ic('search',16)}<input id="srQ" placeholder="Buscar nesta conversa" autocomplete="off"></div></div><div class="ppbody" id="srR"><div class="empty">Digite para buscar mensagens.</div></div>`;
  openPanel(el, r);
  const q = el.querySelector('#srQ'); setTimeout(() => q.focus(), 20);
  let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const v = q.value.trim().replace(/[%_]/g, ''); const box = el.querySelector('#srR');
    if(v.length < 2){ box.innerHTML = '<div class="empty">Digite pelo menos 2 letras.</div>'; return; }
    box.innerHTML = '<div class="loadmore"><div class="spin"></div></div>';
    const { data } = await App.sb.from('messages').select('*').eq('channel_id', M.cid).ilike('content', `%${v}%`).order('created_at', { ascending:false }).limit(30);
    await ensureProfiles((data || []).map(m => m.author_id));
    const hl = s => esc(s).replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), x => `<mark>${x}</mark>`);
    box.innerHTML = (data || []).length ? `<div class="srcount">${data.length}${data.length===30?'+':''} resultado(s)</div>` + data.map(m => `<div class="ppit" data-goto="${m.id}">${avatar(prof(m.author_id),'sm')}<div><b>${esc(prof(m.author_id).display_name)}</b> <small>${fmtTime(m.created_at)}</small><div class="ppct">${hl(m.content.slice(0, 300))}</div></div></div>`).join('') : '<div class="empty">Nada encontrado.</div>';
    bindGoto(el);
  }, 280); };
}
function openPanel(el, r){
  el.classList.remove('hidden');
  el.style.left = Math.max(8, Math.min(r.right - 420, innerWidth - 428)) + 'px';
  el.style.top = (r.bottom + 8) + 'px';
  bindGoto(el);
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e){ if(!el.contains(e.target)) closeMenu(); }
  el._outside = outside;
}
function bindGoto(el){ el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { closeMenu(); jumpTo(b.dataset.goto); }); }
