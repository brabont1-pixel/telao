// v6.31: título e capa dos links (YouTube, TikTok, Spotify, Twitch) para os cartões no chat.
// Só consulta os oEmbed públicos dessas plataformas (lista fechada abaixo).
const PROVIDERS = [
  [/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i, u => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u)],
  [/^https:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//i, u => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u)],
  [/^https:\/\/open\.spotify\.com\//i, u => 'https://open.spotify.com/oembed?url=' + encodeURIComponent(u)],
];
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const u = String((req.query && req.query.url) || '').slice(0, 500);
  const p = PROVIDERS.find(([re]) => re.test(u));
  if (!p) { res.statusCode = 400; res.end('{"error":"link não suportado"}'); return; }
  try {
    const r = await fetch(p[1](u), { headers: { 'User-Agent': 'Mozilla/5.0 (Telao link preview)' }, redirect: 'follow' });
    if (!r.ok) { res.statusCode = 404; res.end('{"error":"não achei"}'); return; }
    const j = await r.json();
    let id = null;
    const html = String(j.html || '');
    const m = html.match(/data-video-id="(\d+)"/) || html.match(/\/video\/(\d+)/);
    if (m) id = m[1];
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.end(JSON.stringify({ title: String(j.title || '').slice(0, 200), author: String(j.author_name || '').slice(0, 100), thumb: j.thumbnail_url || null, provider: j.provider_name || null, id }));
  } catch (e) { res.statusCode = 502; res.end('{"error":"falhou"}'); }
};
