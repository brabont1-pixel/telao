/* =====================================================================
   v6.31: PRÉVIA DE LINKS BONITA — YouTube (com título), TikTok, Instagram, Twitch e Spotify.
   O cartão aparece no chat; o player só carrega quando você clica (mais leve e mais privado).
   Título e capa vêm do /api/oembed (YouTube, TikTok, Spotify).
   ===================================================================== */
const LK_CACHE = new Map();
const LK_RES = [
  { k: 'spotify', re: /https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/i },
  { k: 'tiktok', re: /https:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/(?:video|photo)\/(\d{8,25})/i },
  { k: 'tiktoks', re: /https:\/\/(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]{5,20})\/?/i },
  { k: 'insta', re: /https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/i },
  { k: 'twclip', re: /https:\/\/(?:clips\.twitch\.tv\/|(?:www\.)?twitch\.tv\/[\w]+\/clip\/)([A-Za-z0-9_-]{5,100})/i },
  { k: 'twvod', re: /https:\/\/(?:www\.)?twitch\.tv\/videos\/(\d{5,15})/i },
  { k: 'twitch', re: /https:\/\/(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})\/?(?:[?#\s]|$)/i },
];
const LK_BRAND = {
  spotify: ['#1db954', 'Spotify', 'music'], tiktok: ['#ff0050', 'TikTok', 'play'], tiktoks: ['#ff0050', 'TikTok', 'play'], insta: ['#e1306c', 'Instagram', 'image'],
  twitch: ['#9146ff', 'Twitch', 'monitor'], twclip: ['#9146ff', 'Clipe da Twitch', 'play'], twvod: ['#9146ff', 'Vídeo da Twitch', 'play'], yt: ['#ff0000', 'YouTube', 'play'],
};
function lkFind(text){
  const out = [], seen = new Set();
  const urls = String(text || '').match(/https:\/\/[^\s<>"']+/g) || [];
  urls.forEach(u => {
    for(const r of LK_RES){ const m = u.match(r.re); if(m){ const key = r.k + ':' + m.slice(1).join('/'); if(!seen.has(key)){ seen.add(key); out.push({ k: r.k, m, url: u }); } break; } }
  });
  return out.slice(0, 2);
}
function lkMeta(url){
  if(LK_CACHE.has(url)) return LK_CACHE.get(url);
  const p = fetch('/api/oembed?url=' + encodeURIComponent(url)).then(r => r.ok ? r.json() : null).catch(() => null);
  LK_CACHE.set(url, p); return p;
}
function lkCard(it){
  const [color, label, icon] = LK_BRAND[it.k];
  const id = 'lk' + Math.random().toString(36).slice(2, 9);
  let player = '', body = '';
  if(it.k === 'spotify'){
    const type = it.m[1].toLowerCase(), tall = !['track', 'episode'].includes(type);
    return `<div class="lkc lksp ${tall ? 'tall' : ''}" style="--lk:${color}"><iframe src="https://open.spotify.com/embed/${type}/${it.m[2]}?utm_source=telao" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Spotify"></iframe></div>`;
  }
  const host = location.hostname || 'localhost';
  if(it.k === 'tiktok') player = `https://www.tiktok.com/embed/v2/${it.m[1]}`;
  else if(it.k === 'insta') player = `https://www.instagram.com/${it.m[1] === 'reels' ? 'reel' : it.m[1]}/${it.m[2]}/embed/captioned/`;
  else if(it.k === 'twitch') player = `https://player.twitch.tv/?channel=${it.m[1]}&parent=${host}&muted=false`;
  else if(it.k === 'twclip') player = `https://clips.twitch.tv/embed?clip=${it.m[1]}&parent=${host}`;
  else if(it.k === 'twvod') player = `https://player.twitch.tv/?video=${it.m[1]}&parent=${host}`;
  const vertical = it.k === 'tiktok' || it.k === 'tiktoks' || it.k === 'insta';
  const sub = it.k === 'twitch' ? `twitch.tv/${esc(it.m[1])} · ao vivo ou canal` : it.k === 'insta' ? (it.m[1] === 'p' ? 'Post' : 'Reel') : '';
  return `<div class="lkc ${vertical ? 'vert' : 'wide'}" id="${id}" style="--lk:${color}" data-lkurl="${esc(it.url)}" data-lkplayer="${esc(player)}" data-lkk="${it.k}">
    <div class="lkhead"><span class="lkic">${ic(icon, 14)}</span><b>${label}</b><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" class="lkopen" data-tip="Abrir no site">${ic('link', 13)}</a></div>
    <div class="lkthumb">${player ? `<span class="lkplay">${ic('play', 28)}</span>` : ''}<span class="lkph">${ic(icon, 36)}</span></div>
    <div class="lkinfo"><b class="lkt">${it.k === 'twitch' ? esc(it.m[1]) : ''}</b><small class="lka">${sub}</small></div></div>`;
}
const _embedsHtmlLk = embedsHtml;
embedsHtml = function(m){
  const base = _embedsHtmlLk.apply(this, arguments);
  const items = lkFind(m.content);
  return base + items.map(lkCard).join('');
};
// títulos e capas chegam depois
function lkHydrate(root){
  (root || document).querySelectorAll('.lkc[data-lkurl]:not([data-lkdone])').forEach(c => {
    c.dataset.lkdone = '1';
    const k = c.dataset.lkk; if(!['tiktok', 'tiktoks'].includes(k)) return;
    lkMeta(c.dataset.lkurl).then(j => {
      if(!j || !c.isConnected) return;
      if(j.thumb){ const t = c.querySelector('.lkthumb'); t.style.backgroundImage = `url("${String(j.thumb).replace(/"/g, '')}")`; t.classList.add('img'); }
      if(j.title) c.querySelector('.lkt').textContent = j.title;
      if(j.author) c.querySelector('.lka').textContent = '@' + j.author.replace(/^@/, '');
      if(k === 'tiktoks' && j.id){ c.dataset.lkplayer = 'https://www.tiktok.com/embed/v2/' + j.id; if(!c.querySelector('.lkplay')) c.querySelector('.lkthumb').insertAdjacentHTML('afterbegin', `<span class="lkplay">${ic('play', 28)}</span>`); }
    });
  });
  // título do YouTube embaixo da miniatura
  (root || document).querySelectorAll('.yt[data-yt]:not([data-lkdone])').forEach(y => {
    y.dataset.lkdone = '1';
    lkMeta('https://www.youtube.com/watch?v=' + y.dataset.yt).then(j => {
      if(!j || !j.title || !y.isConnected || y.nextElementSibling && y.nextElementSibling.classList.contains('ytt')) return;
      y.insertAdjacentHTML('afterend', `<div class="ytt"><b>${esc(j.title)}</b>${j.author ? `<small>${esc(j.author)}</small>` : ''}</div>`);
    });
  });
}
new MutationObserver(() => { if(document.querySelector('.lkc[data-lkurl]:not([data-lkdone]), .yt[data-yt]:not([data-lkdone])')) lkHydrate(); }).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', e => {
  const c = e.target.closest('.lkc[data-lkplayer]'); if(!c || e.target.closest('.lkopen')) return;
  const src = c.dataset.lkplayer; if(!src) { window.open(c.dataset.lkurl, '_blank', 'noopener'); return; }
  e.preventDefault();
  const th = c.querySelector('.lkthumb'); if(!th || th.querySelector('iframe')) return;
  th.innerHTML = `<iframe src="${esc(src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen title="${esc(c.dataset.lkk)}"></iframe>`;
  th.classList.add('on'); c.classList.add('playing');
});
App._lkFind = lkFind;
