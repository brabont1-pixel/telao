/* =====================================================================
   v6.21: FEED DE CLIPES (estilo Medal)
   - Botão "Feed" na barra da esquerda: Em alta · Seguindo · Recentes, filtro por jogo
   - Postar: direto depois de gravar um clipe (Alt+C), de um clipe/vídeo seu já mandado no chat, ou de um arquivo
   - Curtir, comentar, seguir quem posta, contar visualizações, compartilhar link (#clipe=…) e mandar no chat
   - Perfil de clipes de cada pessoa (seguidores, curtidas, todos os clipes)
   ===================================================================== */
const FD = { tab: 'top', game: null, user: null, items: [], offset: 0, done: false, loading: false };
const fdMiss = e => /feed_|follows|could not find|PGRST20|schema cache|does not exist/i.test((e && (e.message || e.code)) || '');
const FD_SQL = 'Falta rodar o supabase.sql novo no Supabase para o Feed funcionar.';
const fdAgo = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'agora' : s < 3600 ? Math.floor(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h' : s < 2592000 ? Math.floor(s / 86400) + ' d' : new Date(d).toLocaleDateString('pt-BR'); };
const fdK = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' mi' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + ' mil' : String(n || 0);
const fdDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const GAME_SUGG = ['Valorant', 'Counter-Strike 2', 'League of Legends', 'Fortnite', 'Minecraft', 'GTA V', 'Roblox', 'EA FC 26', 'Free Fire', 'Rocket League', 'Apex Legends', 'Call of Duty', 'Rainbow Six Siege', 'Dota 2', 'Overwatch 2', 'Marvel Rivals', 'PUBG', 'Brawlhalla', 'Dead by Daylight', 'R.E.P.O.', 'PEAK', 'Lethal Company', 'Sea of Thieves', 'Rust', 'Outro'];

/* ---------- miniatura: pega um quadro do vídeo ---------- */
function videoThumb(src, at){
  return new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    let done = false; const fin = r => { if(done) return; done = true; res(r); };
    v.onloadedmetadata = () => { try{ v.currentTime = Math.min((at || 0) + 1, Math.max(0, (isFinite(v.duration) ? v.duration : 2) - 0.1)); }catch(e){ fin(null); } };
    v.onseeked = () => {
      try{
        const W = 480, H = Math.round(W * (v.videoHeight || 270) / (v.videoWidth || 480));
        const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(v, 0, 0, W, H);
        c.toBlob(b => fin(b ? { blob: b, w: v.videoWidth, h: v.videoHeight, dur: isFinite(v.duration) ? v.duration : null } : null), 'image/jpeg', 0.8);
      }catch(e){ fin(null); }
    };
    v.onerror = () => fin(null);
    setTimeout(() => fin(null), 8000);
    v.src = src;
  });
}

/* ---------- postar ---------- */
App.feedPostModal = function(src){
  // src: { blob, start, len, fname } (clipe gravado) | { url, start, dur, w, h } (já enviado) | {} (escolher)
  // v6.23: até 5 vídeos por post
  const MAX = 5, items = [];
  if(src && src.blob) items.push({ file: new File([src.blob], src.fname || 'clipe.webm', { type: src.blob.type || 'video/webm' }), start: src.start || 0, dur: src.len, local: URL.createObjectURL(src.blob) });
  else if(src && src.url) items.push({ url: src.url, start: src.start || 0, dur: src.dur, w: src.w, h: src.h, local: src.url });
  modal(`<form id="fpF"><div class="mh"><h2>${ic('film', 20)} Postar no Feed</h2><p>Até ${MAX} clipes no mesmo post. Todo mundo do Telão pode ver (ou só seus amigos).</p></div>
    <div class="mc">
      <div class="fpitems" id="fpItems"></div>
      <div class="fpadd" id="fpAdd"><label class="btn sec sm"><input type="file" accept="video/*" id="fpFile" multiple hidden>${ic('upload', 15)} Do computador</label>
        <button type="button" class="btn sec sm" id="fpMine">${ic('clip', 15)} Clipes que já mandei</button><span class="mut small" id="fpCount"></span></div>
      <div class="fpmine hidden" id="fpMineBox"></div>
      <label class="field" style="margin-top:12px"><span>Título</span><input class="inp" id="fpT" maxlength="100" required placeholder="ace no último round 😱"></label>
      <div class="frow2"><label class="field"><span>Jogo</span><input class="inp" id="fpG" maxlength="60" list="fpGL" placeholder="Valorant" value="${esc((S.me.activity && S.me.activity.type === 'playing' && S.me.activity.name) || '')}"><datalist id="fpGL">${GAME_SUGG.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
        <label class="field"><span>Quem vê</span><select class="inp" id="fpVis"><option value="public">Todo mundo</option><option value="friends">Só amigos</option></select></label></div>
      <div class="err" id="fpE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn" id="fpGo">${ic('film', 16)} Postar</button></div></form>`, m => {
    const err = t => m.querySelector('#fpE').textContent = t || '';
    const draw = () => {
      m.querySelector('#fpItems').innerHTML = items.map((it, i) => `<div class="fpit"><video src="${esc(it.local)}#t=${(it.start || 0) + 0.5}" preload="metadata" muted playsinline></video><span class="fpn">${i + 1}</span>
        <button type="button" class="fpx" data-fpx="${i}" aria-label="Tirar">${ic('x', 13)}</button>${i > 0 ? `<button type="button" class="fpl" data-fpl="${i}" aria-label="Mover para a esquerda">${ic('chevLeft', 13)}</button>` : ''}</div>`).join('')
        || `<div class="fpempty">${ic('film', 26)}<span>Adicione até ${MAX} clipes</span></div>`;
      m.querySelector('#fpCount').textContent = `${items.length} de ${MAX}`;
      m.querySelector('#fpAdd').classList.toggle('full', items.length >= MAX);
      m.querySelectorAll('[data-fpx]').forEach(b => b.onclick = () => { items.splice(+b.dataset.fpx, 1); draw(); });
      m.querySelectorAll('[data-fpl]').forEach(b => b.onclick = () => { const i = +b.dataset.fpl; [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); });
      const big = m.querySelector('.fpit:first-child video'); if(big) big.controls = true;
    };
    draw();
    m.querySelector('#fpFile').onchange = e => {
      for(const f of [...e.target.files]){
        if(items.length >= MAX){ App.toast(`No máximo ${MAX} clipes por post.`, true); break; }
        if(!/^video\//.test(f.type)){ err('Escolha só arquivos de vídeo.'); continue; }
        if(f.size > 25 * 1048576){ err(`“${f.name}” passou de 25 MB.`); continue; }
        items.push({ file: f, start: 0, local: URL.createObjectURL(f) });
      }
      e.target.value = ''; draw();
    };
    m.querySelector('#fpMine').onclick = async () => {
      const box = m.querySelector('#fpMineBox');
      if(!box.classList.contains('hidden')){ box.classList.add('hidden'); return; }
      const { data } = await App.sb.from('messages').select('attachments,created_at').eq('author_id', S.me.id).order('created_at', { ascending: false }).limit(200);
      const vids = []; (data || []).forEach(r => (r.attachments || []).forEach(a => { if(a && a.url && (a.clip || /^video\//.test(a.type || '')) && !vids.some(v => v.url === a.url)) vids.push(a); }));
      if(!vids.length){ App.toast('Você ainda não mandou clipes nem vídeos no chat.', true); return; }
      box.classList.remove('hidden');
      box.innerHTML = vids.slice(0, 30).map((a, i) => `<button type="button" data-fpi="${i}"><video src="${esc(a.url)}#t=${(+a.start || 0) + 0.5}" preload="metadata" muted playsinline></video>${a.dur ? `<small>${fdDur(a.dur)}</small>` : ''}</button>`).join('');
      box.querySelectorAll('[data-fpi]').forEach(b => b.onclick = () => {
        const a = vids[+b.dataset.fpi];
        if(items.some(x => x.url === a.url)){ items.splice(items.findIndex(x => x.url === a.url), 1); b.classList.remove('on'); draw(); return; }
        if(items.length >= MAX){ App.toast(`No máximo ${MAX} clipes por post.`, true); return; }
        items.push({ url: a.url, start: +a.start || 0, dur: a.dur, w: a.w, h: a.h, local: a.url }); b.classList.add('on'); draw();
      });
    };
    m.querySelector('#fpF').onsubmit = async e => {
      e.preventDefault(); err();
      const title = m.querySelector('#fpT').value.trim(), game = m.querySelector('#fpG').value.trim(), vis = m.querySelector('#fpVis').value;
      if(!items.length){ err('Adicione pelo menos um clipe.'); return; }
      if(!title){ err('Dê um título.'); return; }
      const b = m.querySelector('#fpGo'); b.disabled = true;
      try{
        const media = [];
        for(let i = 0; i < items.length; i++){
          const it = items[i];
          b.textContent = items.length > 1 ? `Enviando ${i + 1} de ${items.length}…` : 'Postando…';
          let url = it.url, w = it.w, h = it.h;
          if(it.file){ const meta = await uploadOne({ file: it.file }); url = meta.url; w = meta.w; h = meta.h; }
          const th = await videoThumb(it.local, it.start || 0);
          let thumb = null;
          if(th && th.blob){ try{ thumb = (await uploadOne({ file: new File([th.blob], 'thumb.jpg', { type: 'image/jpeg' }) })).url; }catch(x){} }
          media.push({ url, thumb, start: +(it.start || 0), dur: it.dur || (th && th.dur) || null, w: w || (th && th.w) || null, h: h || (th && th.h) || null });
        }
        const f = media[0];
        const row = { video_url: f.url, thumb_url: f.thumb, title, game: game && game !== 'Outro' ? game : null, visibility: vis, start_at: f.start, duration: f.dur, w: f.w, h: f.h, media };
        const { error } = await App.sb.from('feed_posts').insert(row);
        if(error) throw error;
        closeModal(); App.toast(media.length > 1 ? `Post com ${media.length} clipes no Feed! 🎬` : 'Clipe postado no Feed! 🎬');
        if(document.getElementById('feedBox')){ FD.tab = 'new'; FD.user = null; feedHeader(); feedLoad(true); }
        else feedOpen({ tab: 'new' });
      }catch(x){ b.disabled = false; b.innerHTML = `${ic('film', 16)} Postar`; err(fdMiss(x) ? FD_SQL : (x.message || String(x))); }
    };
  });
};
// menu da mensagem: postar um clipe/vídeo meu
const _msgMenuExtraFd = App.msgMenuExtra;
App.msgMenuExtra = m => {
  const out = _msgMenuExtraFd ? _msgMenuExtraFd(m) : [];
  const a = (m.attachments || []).find(x => x && x.url && !x._local && (x.clip || /^video\//.test(x.type || '')));
  if(a && m.author_id === S.me.id) out.push({ label: 'Postar no Feed', icon: ic('film', 18), onClick: () => App.feedPostModal({ url: a.url, start: +a.start || 0, dur: a.dur, w: a.w, h: a.h }) });
  return out;
};

const vBadge = (on, cls = '') => on ? `<span class="fdver ${cls}" data-tip="Criador verificado" data-tipsub="100 seguidores ou mais">${ic('check', 10)}</span>` : '';
const mediaOf = p => Array.isArray(p.media) && p.media.length ? p.media : [{ url: p.video_url, thumb: p.thumb_url, start: p.start_at, dur: p.duration }];
/* ---------- lista ---------- */
function cardHtml(p){
  const pr = prof(p.user_id);
  return `<div class="fdc" data-fp="${p.id}">
    <div class="fdth">${p.thumb_url ? `<img src="${esc(p.thumb_url)}" alt="" loading="lazy">` : `<video src="${esc(p.video_url)}#t=${(p.start_at || 0) + 1}" preload="metadata" muted playsinline></video>`}
      <span class="fdur">${p.duration ? fdDur(p.duration) : ''}</span>${p.game ? `<span class="fgame">${esc(p.game)}</span>` : ''}<span class="fplay">${ic('play', 26)}</span>
      ${mediaOf(p).length > 1 ? `<span class="fdmulti">${ic('film', 12)} ${mediaOf(p).length}</span>` : ''}${p.pinned && FD.user ? '<span class="fdpin">📌 Fixado</span>' : ''}</div>
    <div class="fdinf">${avatar(pr, 'sm')}<div class="ftx"><b>${esc(p.title)}</b><small><span class="fuser" data-fu="${p.user_id}">${esc(pr.display_name)}</span>${vBadge(p.verified)} · ${fdK(p.views)} views · ${fdAgo(p.created_at)}</small></div>
      <span class="flk ${p.liked ? 'on' : ''}">${ic('heart', 14)} ${fdK(p.likes)}</span></div></div>`;
}
async function feedLoad(reset){
  const box = document.getElementById('feedBox'); if(!box || FD.loading) return;
  if(reset){ FD.items = []; FD.offset = 0; FD.done = false; }
  if(FD.done) return;
  FD.loading = true;
  const grid = box.querySelector('#fdG');
  if(reset) grid.innerHTML = '<div class="spin" style="margin:50px auto;grid-column:1/-1"></div>';
  const { data, error } = await App.sb.rpc('feed_list', { p_tab: FD.user ? 'user' : FD.tab, p_user: FD.user, p_game: FD.game, p_offset: FD.offset });
  FD.loading = false;
  if(error){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(fdMiss(error) ? FD_SQL : error.message)}</div>`; return; }
  const rows = data || []; await ensureProfiles(rows.map(r => r.user_id));
  FD.items = FD.items.concat(rows); FD.offset += rows.length; FD.done = rows.length < 24;
  if(reset) grid.innerHTML = '';
  if(!FD.items.length){
    grid.innerHTML = `<div class="empty fdempty" style="grid-column:1/-1"><div class="fdemj">🎬</div><b>${FD.user ? 'Nenhum clipe por aqui ainda.' : FD.tab === 'following' ? 'Quem você segue ainda não postou nada.' : 'O Feed está vazio.'}</b><span>${FD.tab === 'following' && !FD.user ? 'Siga a galera clicando no nome de quem posta.' : 'Na call, aperte Alt+C para gravar os últimos 30 segundos e poste aqui.'}</span></div>`;
    return;
  }
  grid.insertAdjacentHTML('beforeend', rows.map(cardHtml).join(''));
  box.querySelector('#fdMore').classList.toggle('hidden', FD.done);
}
async function feedHeader(){
  const box = document.getElementById('feedBox'); if(!box) return;
  const h = box.querySelector('#fdUserHead');
  if(!FD.user){ h.innerHTML = ''; h.classList.add('hidden'); box.querySelector('#fdTabs').classList.remove('hidden'); return; }
  box.querySelector('#fdTabs').classList.add('hidden');
  await ensureProfiles([FD.user]);
  const p = prof(FD.user);
  h.classList.remove('hidden');
  h.innerHTML = `<button class="ibtn" id="fdBack" data-tip="Voltar">${ic('arrowLeft', 18)}</button>${avatar(p, 'lg')}<div><b>${esc(p.display_name)}<span id="fdVer"></span></b><small>@${esc(p.username)}</small><div class="fdstats" id="fdSt"></div><div id="fdVerInfo"></div></div><span class="grow"></span>${FD.user !== S.me.id ? `<button class="btn" id="fdFollow">Seguir</button>` : `<button class="btn sec hidden" id="fdPanel">${ic('poll', 16)} Painel de criador</button>`}`;
  h.querySelector('#fdBack').onclick = () => { FD.user = null; feedHeader(); feedLoad(true); };
  const { data } = await App.sb.rpc('feed_profile', { p_user: FD.user });
  if(data){
    h.querySelector('#fdVer').innerHTML = vBadge(data.verified, 'big');
    if(FD.user === S.me.id){
      const vi = h.querySelector('#fdVerInfo');
      if(data.verified){ const pb = h.querySelector('#fdPanel'); pb.classList.remove('hidden'); pb.onclick = creatorPanel; vi.innerHTML = '<span class="fdperk">✓ Você é verificado: posta até 60 clipes por dia, fixa até 3 clipes no perfil, fixa comentários e aparece mais em Em alta.</span>'; }
      else { const f = data.followers || 0; vi.innerHTML = `<div class="fdprog"><span>Faltam <b>${Math.max(0, 100 - f)}</b> seguidores para o selo de verificado ✓</span><i><b style="width:${Math.min(100, f)}%"></b></i><small>Verificado ganha: 60 clipes por dia, fixar clipes e comentários, painel de criador e mais destaque em Em alta.</small></div>`; }
    }
    h.querySelector('#fdSt').innerHTML = `<span><b>${fdK(data.clips)}</b> clipes</span><span><b>${fdK(data.followers)}</b> seguidores</span><span><b>${fdK(data.following)}</b> seguindo</span><span><b>${fdK(data.likes)}</b> curtidas</span>`;
    const fb = h.querySelector('#fdFollow');
    if(fb){ const set = on => { fb.textContent = on ? 'Seguindo' : 'Seguir'; fb.classList.toggle('sec', on); }; set(data.i_follow);
      fb.onclick = async () => { const on = fb.textContent === 'Seguindo'; await toggleFollow(FD.user, on); set(!on); feedHeader(); }; }
  }
}
async function toggleFollow(uid, on){
  const { error } = on ? await App.sb.from('follows').delete().eq('follower', S.me.id).eq('followee', uid) : await App.sb.from('follows').insert({ followee: uid });
  if(error && !/duplicate/i.test(error.message)) App.toast(fdMiss(error) ? FD_SQL : error.message, true);
  else if(!on) App.toast(`Agora você segue ${prof(uid).display_name}.`);
  FD.items.forEach(p => { if(p.user_id === uid) p.following = !on; });
}
function feedOpen(opt){
  opt = opt || {};
  document.getElementById('feedBox')?.remove();
  FD.tab = opt.tab || 'top'; FD.user = opt.user || null; FD.game = null;
  const el = document.createElement('div'); el.className = 'explore feed'; el.id = 'feedBox';
  el.innerHTML = `<div class="exbox"><div class="exhead fdhead"><div><h1>${ic('film', 26)} Feed</h1><p>Os melhores clipes da galera do Telão.</p></div><span class="grow"></span>
      <button class="btn" id="fdPost">${ic('plus', 16)} Postar clipe</button><button class="ibtn" id="fdMe" data-tip="Meus clipes">${avatar(S.me, 'sm')}</button><button class="ibtn" id="fdX" data-tip="Fechar">${ic('x', 20)}</button></div>
    <div class="fdbar" id="fdTabs"><button data-ft="top">🔥 Em alta</button><button data-ft="following">Seguindo</button><button data-ft="new">Recentes</button><span class="grow"></span>
      <input class="inp fdgame" id="fdGame" list="fdGL" placeholder="Filtrar por jogo"><datalist id="fdGL">${GAME_SUGG.slice(0, -1).map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
    <div class="fduser hidden" id="fdUserHead"></div>
    <div class="fdgrid" id="fdG"></div><div style="text-align:center;padding:14px"><button class="btn sec hidden" id="fdMore">Ver mais</button></div></div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener('keydown', kd); if(location.hash.startsWith('#clipe=')) history.replaceState(null, '', location.pathname + location.search); };
  const kd = e => { if(e.key === 'Escape' && !document.getElementById('fdView') && $('#modal').classList.contains('hidden')) close(); };
  document.addEventListener('keydown', kd);
  el.querySelector('#fdX').onclick = close; el.onclick = e => { if(e.target === el) close(); };
  el.querySelector('#fdPost').onclick = () => App.feedPostModal({});
  el.querySelector('#fdMe').onclick = () => { FD.user = S.me.id; feedHeader(); feedLoad(true); };
  const tabs = () => el.querySelectorAll('[data-ft]').forEach(b => b.classList.toggle('on', b.dataset.ft === FD.tab));
  el.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => { FD.tab = b.dataset.ft; tabs(); feedLoad(true); });
  let gt = null; el.querySelector('#fdGame').oninput = e => { clearTimeout(gt); gt = setTimeout(() => { FD.game = e.target.value.trim() || null; feedLoad(true); }, 350); };
  el.querySelector('#fdMore').onclick = () => feedLoad(false);
  el.querySelector('#fdG').addEventListener('click', e => {
    const u = e.target.closest('[data-fu]'); if(u){ e.stopPropagation(); FD.user = u.dataset.fu; feedHeader(); feedLoad(true); return; }
    const c = e.target.closest('[data-fp]'); if(c){ const p = FD.items.find(x => x.id === c.dataset.fp); if(p) feedView(p); }
  });
  // prévia ao passar o mouse
  el.querySelector('#fdG').addEventListener('mouseover', e => {
    const c = e.target.closest('.fdc'); if(!c || c.querySelector('.fprev')) return;
    const p = FD.items.find(x => x.id === c.dataset.fp); if(!p) return;
    const t = setTimeout(() => {
      if(!c.matches(':hover')) return;
      const v = document.createElement('video'); v.className = 'fprev'; v.src = p.video_url + (p.start_at ? '#t=' + p.start_at : ''); v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
      c.querySelector('.fdth').appendChild(v);
      c.addEventListener('mouseleave', () => v.remove(), { once: true });
    }, 450);
    c.addEventListener('mouseleave', () => clearTimeout(t), { once: true });
  });
  tabs(); feedHeader(); feedLoad(true);
  if(opt.post) feedView(opt.post);
}
App.feedOpen = feedOpen;

/* ---------- ver um clipe ---------- */
async function feedView(p){
  document.getElementById('fdView')?.remove();
  await ensureProfiles([p.user_id]);
  const pr = prof(p.user_id), mine = p.user_id === S.me.id, admin = S.me.is_admin;
  const el = document.createElement('div'); el.id = 'fdView'; el.className = 'fdview';
  el.innerHTML = `<div class="fvbox"><button class="ibtn fvx" id="fvX">${ic('x', 22)}</button>
    <div class="fvvid"><video id="fvV" controls autoplay playsinline></video>
      ${mediaOf(p).length > 1 ? `<button class="fvnav l" id="fvPrev" aria-label="Clipe anterior">${ic('chevLeft', 26)}</button><button class="fvnav r" id="fvNext" aria-label="Próximo clipe">${ic('chevRight', 26)}</button><div class="fvdots" id="fvDots"></div><span class="fvcount" id="fvCount"></span>` : ''}</div>
    <div class="fvside"><div class="fvhead">${avatar(pr, 'lg')}<div class="fvwho"><b class="fuser" data-fu="${p.user_id}">${esc(pr.display_name)}</b>${vBadge(p.verified)}<small>${fdAgo(p.created_at)}${p.visibility === 'friends' ? ' · só amigos' : ''}</small></div>
        ${mine ? '' : `<button class="btn sm ${p.following ? 'sec' : ''}" id="fvFol">${p.following ? 'Seguindo' : 'Seguir'}</button>`}</div>
      <h2 class="fvt">${esc(p.title)}</h2>${p.game ? `<span class="fgame inl" data-fg="${esc(p.game)}">${ic('gamepad', 13)} ${esc(p.game)}</span>` : ''}
      <div class="fvacts"><button class="fvbtn ${p.liked ? 'on' : ''}" id="fvLike">${ic('heart', 18)} <span>${fdK(p.likes)}</span></button><span class="fvbtn st">${ic('eye', 18)} ${fdK(p.views)}</span>
        <button class="fvbtn" id="fvShare">${ic('link', 18)} Copiar link</button><button class="fvbtn" id="fvSend">${ic('send', 18)} Mandar</button>
        ${mine && p.verified ? `<button class="fvbtn ${p.pinned ? 'on' : ''}" id="fvPin">${ic('pin', 18)} ${p.pinned ? 'Fixado' : 'Fixar no perfil'}</button>` : ''}
        ${mine || admin ? `<button class="fvbtn danger" id="fvDel" data-tip="Apagar">${ic('trash', 18)}</button>` : ''}</div>
      <div class="fvcom" id="fvC"><div class="spin" style="margin:20px auto"></div></div>
      <form class="fvform" id="fvF"><input class="inp" id="fvI" maxlength="500" placeholder="Comentar…" autocomplete="off"><button class="btn sm">${ic('send', 16)}</button></form></div></div>`;
  document.body.appendChild(el);
  history.replaceState(null, '', '#clipe=' + p.id);
  const med = mediaOf(p); let cur = 0;
  const showMedia = i => {
    cur = (i + med.length) % med.length; const m = med[cur], v = el.querySelector('#fvV');
    v.src = m.url + (m.start ? '#t=' + m.start : ''); v.play().catch(() => {});
    const d = el.querySelector('#fvDots'); if(d) d.innerHTML = med.map((x, k) => `<i class="${k === cur ? 'on' : ''}" data-fvd="${k}"></i>`).join('');
    const c = el.querySelector('#fvCount'); if(c) c.textContent = `${cur + 1}/${med.length}`;
    el.querySelectorAll('[data-fvd]').forEach(b => b.onclick = () => showMedia(+b.dataset.fvd));
  };
  showMedia(0);
  if(med.length > 1){
    el.querySelector('#fvPrev').onclick = () => showMedia(cur - 1); el.querySelector('#fvNext').onclick = () => showMedia(cur + 1);
    el.querySelector('#fvV').addEventListener('ended', () => { if(cur < med.length - 1) showMedia(cur + 1); });
  }
  const pinB = el.querySelector('#fvPin');
  if(pinB) pinB.onclick = async () => {
    const { error } = await App.sb.from('feed_posts').update({ pinned: !p.pinned }).eq('id', p.id);
    if(error){ App.toast(error.message, true); return; }
    p.pinned = !p.pinned; pinB.classList.toggle('on', p.pinned); pinB.innerHTML = `${ic('pin', 18)} ${p.pinned ? 'Fixado' : 'Fixar no perfil'}`;
    App.toast(p.pinned ? 'Clipe fixado no topo do seu perfil.' : 'Clipe desafixado.');
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', kd); if(location.hash.startsWith('#clipe=')) history.replaceState(null, '', location.pathname + location.search); };
  const kd = e => {
    if(e.key === 'Escape' && $('#modal').classList.contains('hidden')){ e.stopImmediatePropagation(); close(); }
    else if((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && mediaOf(p).length > 1 && !e.target.closest('input,textarea')){ e.preventDefault(); showMedia(cur + (e.key === 'ArrowRight' ? 1 : -1)); }
  };
  document.addEventListener('keydown', kd, true);
  el.querySelector('#fvX').onclick = close; el.onclick = e => { if(e.target === el) close(); };
  App.sb.rpc('feed_view', { p_post: p.id }).then(() => {}, () => {});
  el.querySelector('.fvhead [data-fu]').onclick = () => { close(); if(!document.getElementById('feedBox')) feedOpen({ user: p.user_id }); else { FD.user = p.user_id; feedHeader(); feedLoad(true); } };
  const gtag = el.querySelector('[data-fg]'); if(gtag) gtag.onclick = () => { close(); const fg = document.querySelector('#fdGame'); if(fg){ FD.user = null; feedHeader(); fg.value = p.game; FD.game = p.game; feedLoad(true); } };
  const fol = el.querySelector('#fvFol'); if(fol) fol.onclick = async () => { const on = fol.textContent === 'Seguindo'; await toggleFollow(p.user_id, on); fol.textContent = on ? 'Seguir' : 'Seguindo'; fol.classList.toggle('sec', !on); };
  el.querySelector('#fvLike').onclick = async e => {
    const b = e.currentTarget, on = b.classList.contains('on');
    b.classList.toggle('on', !on); p.liked = !on; p.likes += on ? -1 : 1; b.querySelector('span').textContent = fdK(p.likes);
    if(!on){ b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 400); }
    const { error } = on ? await App.sb.from('feed_likes').delete().eq('post_id', p.id).eq('user_id', S.me.id) : await App.sb.from('feed_likes').insert({ post_id: p.id });
    if(error && !/duplicate/i.test(error.message)) App.toast(error.message, true);
    const card = document.querySelector(`.fdc[data-fp="${p.id}"] .flk`); if(card){ card.classList.toggle('on', p.liked); card.innerHTML = `${ic('heart', 14)} ${fdK(p.likes)}`; }
  };
  // dois toques no vídeo = curtir
  el.querySelector('#fvV').addEventListener('dblclick', e => { e.preventDefault(); if(!p.liked) el.querySelector('#fvLike').click(); const h = document.createElement('div'); h.className = 'fvheart'; h.textContent = '❤️'; el.querySelector('.fvvid').appendChild(h); setTimeout(() => h.remove(), 900); });
  const link = location.origin + location.pathname + '#clipe=' + p.id;
  el.querySelector('#fvShare').onclick = () => { copy(link); App.toast('Link do clipe copiado.'); };
  el.querySelector('#fvSend').onclick = () => {
    const targets = [...S.dms.slice(0, 8), ...S.groups.slice(0, 4)];
    const r = el.querySelector('#fvSend').getBoundingClientRect();
    if(!targets.length && !M.cid){ copy(link); App.toast('Link copiado. Cole numa conversa.'); return; }
    menu(r.left, r.bottom + 6, [...(M.cid ? [{ label: 'No chat aberto', icon: ic('chat', 18), onClick: () => feedSend(M.cid, p, link) }] : []),
      ...targets.map(c => ({ label: c.kind === 'dm' ? prof(dmOther(c)).display_name : groupName(c), icon: ic('send', 16), onClick: () => feedSend(c.id, p, link) }))]);
  };
  const del = el.querySelector('#fvDel'); if(del) del.onclick = async () => {
    if(!(await confirmBox('Apagar clipe', 'O clipe some do Feed para todo mundo.', 'Apagar'))) return;
    const { error } = await App.sb.from('feed_posts').delete().eq('id', p.id);
    if(error){ App.toast(error.message, true); return; }
    close(); FD.items = FD.items.filter(x => x.id !== p.id); document.querySelector(`.fdc[data-fp="${p.id}"]`)?.remove(); App.toast('Clipe apagado.');
  };
  const loadCom = async () => {
    const { data, error } = await App.sb.from('feed_comments').select('*').eq('post_id', p.id).order('created_at', { ascending: true }).limit(200);
    const box = el.querySelector('#fvC'); if(!box) return;
    if(error){ box.innerHTML = `<p class="mut small">${esc(error.message)}</p>`; return; }
    await ensureProfiles((data || []).map(c => c.user_id));
    const list = (data || []).slice().sort((a, b) => (b.id === p.pinned_comment) - (a.id === p.pinned_comment));
    box.innerHTML = list.length ? list.map(c => `<div class="fvc ${c.id === p.pinned_comment ? 'pin' : ''}">${avatar(prof(c.user_id), 'xs')}<div>${c.id === p.pinned_comment ? `<span class="fvpinlbl">📌 Fixado por ${esc(pr.display_name)}</span>` : ''}<b>${esc(prof(c.user_id).display_name)}</b> <small>${fdAgo(c.created_at)}</small><p>${esc(c.content)}</p></div>
        ${mine && p.verified ? `<button class="ibtn sm" data-fcp="${c.id}" data-tip="${c.id === p.pinned_comment ? 'Desafixar' : 'Fixar comentário'}">${ic('pin', 13)}</button>` : ''}${c.user_id === S.me.id || mine || admin ? `<button class="ibtn sm" data-fcd="${c.id}" data-tip="Apagar">${ic('trash', 13)}</button>` : ''}</div>`).join('')
      : '<p class="mut small fvnone">Nenhum comentário ainda. Seja o primeiro!</p>';
    box.querySelectorAll('[data-fcp]').forEach(b => b.onclick = async () => {
      const to = b.dataset.fcp === p.pinned_comment ? null : b.dataset.fcp;
      const { error } = await App.sb.from('feed_posts').update({ pinned_comment: to }).eq('id', p.id);
      if(error){ App.toast(error.message, true); return; }
      p.pinned_comment = to; loadCom();
    });
    box.querySelectorAll('[data-fcd]').forEach(b => b.onclick = async () => { await App.sb.from('feed_comments').delete().eq('id', b.dataset.fcd); p.comments = Math.max(0, p.comments - 1); loadCom(); });
    box.scrollTop = box.scrollHeight;
  };
  loadCom();
  el.querySelector('#fvF').onsubmit = async e => {
    e.preventDefault(); const i = el.querySelector('#fvI'), t = i.value.trim(); if(!t) return;
    i.value = '';
    const { error } = await App.sb.from('feed_comments').insert({ post_id: p.id, content: t });
    if(error){ App.toast(error.message, true); i.value = t; return; }
    p.comments++; loadCom();
  };
}
async function creatorPanel(){
  const { data: d, error } = await App.sb.rpc('feed_creator_stats');
  if(error){ App.toast(fdMiss(error) ? FD_SQL : error.message, true); return; }
  modal(`<div class="mh"><h2>${ic('poll', 20)} Painel de criador ${vBadge(true, 'big')}</h2><p>Como seus clipes estão indo no Feed.</p></div>
    <div class="mc"><div class="crgrid">${[['Visualizações', d.views, '👀'], ['Curtidas', d.likes, '❤️'], ['Comentários', d.comments, '💬'], ['Seguidores', d.followers, '👥'], ['Seguidores novos (7 dias)', d.new_followers_7d, '📈'], ['Views nos clipes da semana', d.views_7d, '🔥']].map(([l, v, e]) => `<div class="crc"><span>${e}</span><b>${fdK(v)}</b><small>${l}</small></div>`).join('')}</div>
      <h3 style="margin-top:16px">Seus clipes mais vistos</h3><div class="crtop">${(d.top || []).map((t, i) => `<div><span>${i + 1}</span><b>${esc(t.title)}</b><small>${fdK(t.views)} views · ${fdK(t.likes)} curtidas</small></div>`).join('') || '<p class="mut">Ainda sem clipes.</p>'}</div></div>
    <div class="mf"><button class="btn" data-close>Fechar</button></div>`);
}
async function feedSend(cid, p, link){
  const { error } = await App.sb.from('messages').insert({ channel_id: cid, content: `🎬 ${p.title}\n${link}` });
  if(error) App.toast(error.message, true); else App.toast('Clipe enviado!');
}
// link de clipe no chat vira um cartãozinho clicável
const CLIP_RE = /#clipe=([0-9a-f-]{36})/gi;
const _embedsHtmlFd = embedsHtml;
embedsHtml = function(m){
  const base = _embedsHtmlFd.apply(this, arguments) || '';
  const ids = [...new Set([...String(m.content || '').matchAll(CLIP_RE)].map(x => x[1]))].slice(0, 2);
  return base + ids.map(id => `<div class="fdemb" data-fdemb="${id}"><div class="spin sm"></div></div>`).join('');
};
const FDC = new Map();
App.onDom(() => document.querySelectorAll('.fdemb[data-fdemb]:not([data-done])').forEach(async el => {
  el.dataset.done = '1'; const id = el.dataset.fdemb;
  let p = FDC.get(id);
  if(!p){
    const { data } = await App.sb.from('feed_posts').select('*').eq('id', id).maybeSingle();
    p = data; if(p) FDC.set(id, p);
  }
  if(!p){ el.innerHTML = '<span class="mut small">Clipe apagado ou só para amigos.</span>'; return; }
  await ensureProfiles([p.user_id]);
  el.innerHTML = `<div class="fdembt">${p.thumb_url ? `<img src="${esc(p.thumb_url)}" alt="">` : ''}<span class="fplay">${ic('play', 22)}</span></div><div class="fdembi"><small>${ic('film', 12)} CLIPE NO FEED</small><b>${esc(p.title)}</b><span>${esc(prof(p.user_id).display_name)}${p.game ? ' · ' + esc(p.game) : ''}</span></div>`;
  el.onclick = async () => { const { data } = await App.sb.rpc('feed_list', { p_tab: 'user', p_user: p.user_id, p_game: null, p_offset: 0 }); const full = (data || []).find(x => x.id === id) || { ...p, likes: 0, comments: 0, liked: false, following: false }; feedOpen({ tab: 'top', post: full }); };
}));

/* ---------- botão na barra e link direto ---------- */
const _renderRailFd = renderRail;
renderRail = function(){
  _renderRailFd.apply(this, arguments);
  const ex = $('#rExplore'), at = ex || $('#rAdd');
  if(at && !$('#rFeed')){
    at.insertAdjacentHTML('afterend', `<button class="ricon add feedbtn" id="rFeed" data-tip="Feed de clipes" data-tipside="r">${ic('film', 22)}</button>`);
    $('#rFeed').onclick = () => feedOpen();
  }
};
// perfil: "Ver clipes"
const _userMenuExtraFd = App.userMenuExtra;
App.userMenuExtra = uid => (_userMenuExtraFd ? _userMenuExtraFd(uid) : []).concat(uid === '7e1a0000-0000-4000-a000-000000000001' ? [] : [{ label: 'Clipes no Feed', icon: ic('film', 18), onClick: () => feedOpen({ user: uid }) }]);
const _selfMenuExtraFd = App.selfMenuExtra;
App.selfMenuExtra = () => (_selfMenuExtraFd ? _selfMenuExtraFd() : []).concat([{ label: 'Meus clipes no Feed', icon: ic('film', 18), onClick: () => feedOpen({ user: S.me.id }) }]);
const _startFd = start;
start = async function(){
  const r = await _startFd.apply(this, arguments);
  const m = location.hash.match(/^#clipe=([0-9a-f-]{36})/i);
  if(m && S.me){ setTimeout(async () => { const { data } = await App.sb.from('feed_posts').select('user_id').eq('id', m[1]).maybeSingle(); if(!data){ App.toast('Esse clipe não existe mais.', true); return; } const { data: l } = await App.sb.rpc('feed_list', { p_tab: 'user', p_user: data.user_id, p_game: null, p_offset: 0 }); const p = (l || []).find(x => x.id === m[1]); feedOpen(p ? { post: p } : {}); }, 900); }
  return r;
};
