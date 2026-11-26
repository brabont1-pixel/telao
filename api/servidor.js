// v6.39: página pública do servidor — telao.../s/nome-bonito (ou /s/CODIGO-DO-CONVITE).
// Gera o HTML aqui no servidor para a prévia do link (Instagram, TikTok, WhatsApp) já vir com nome, descrição e capa.
// Usa só a chave pública do site (a mesma do config.js) e a função server_public do banco, que devolve só o básico.
let CFG = null, CFG_AT = 0;
async function config(req) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  if (CFG && Date.now() - CFG_AT < 600000) return CFG;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) throw new Error('host');
  const r = await fetch('https://' + host + '/config.js');
  const t = await r.text();
  const url = (t.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/) || [])[1];
  const key = (t.match(/SUPABASE_ANON_KEY\s*:\s*['"]([^'"]+)['"]/) || [])[1];
  if (!url || !key || /^sb_secret_/.test(key)) throw new Error('config');
  CFG = { url: url.replace(/\/+$/, ''), key }; CFG_AT = Date.now();
  return CFG;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '';
const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : '';

function page({ title, desc, image, body, accent, origin, canonical }) {
  const a = accent || '#ff3d7f';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Telão"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:image" content="${esc(image)}">` : ''}${canonical ? `<meta property="og:url" content="${esc(canonical)}"><link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"><meta name="theme-color" content="#0d0e12"><link rel="icon" href="/favicon.ico">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,${a}33,transparent 60%),#0d0e12;color:#f2f3f7;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:460px;background:#16171d;border:1px solid #ffffff14;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px #0008}
.ban{height:150px;background:linear-gradient(135deg,${a},#7b5cff);background-size:cover;background-position:center}
.in{padding:0 26px 26px;text-align:center}.ic{width:96px;height:96px;border-radius:28px;margin:-48px auto 12px;border:6px solid #16171d;background:${a};display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;color:#fff;overflow:hidden}
.ic img{width:100%;height:100%;object-fit:cover}h1{margin:0 0 4px;font-size:26px;line-height:1.2}.tag{display:inline-block;font-size:12px;font-weight:700;background:#ffffff14;border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:middle}
p.d{color:#b9bbc6;margin:8px 0 16px;white-space:pre-line}.st{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:18px}.st span{background:#ffffff0d;border-radius:999px;padding:6px 12px;font-size:14px;color:#dfe1ea}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#3ba55d;margin-right:6px;box-shadow:0 0 0 3px #3ba55d33}.ch{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:0 0 20px}.ch b{font-weight:600;font-size:13px;color:#9ea1ad;background:#ffffff08;border-radius:8px;padding:3px 8px}
a.go{display:block;background:${a};color:#fff;text-decoration:none;font-weight:800;font-size:17px;border-radius:14px;padding:14px;transition:transform .15s}a.go:hover{transform:translateY(-1px)}
a.sec{display:inline-block;margin-top:12px;color:#b9bbc6;font-size:14px}.ft{margin-top:18px;font-size:12px;color:#6f7280}.ft a{color:#9ea1ad}
</style></head><body>${body}</body></html>`;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim().toLowerCase();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const origin = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? 'https://' + host : '';
  const notFound = (msg) => {
    res.statusCode = 404;
    res.end(page({ title: 'Servidor não encontrado · Telão', desc: msg, origin,
      body: `<div class="card"><div class="ban"></div><div class="in"><div class="ic">?</div><h1>Servidor não encontrado</h1><p class="d">${esc(msg)}</p><a class="go" href="/">Abrir o Telão</a></div></div>` }));
  };
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return notFound('Esse link não existe ou foi trocado.');
  try {
    const c = await config(req);
    const r = await fetch(c.url + '/rest/v1/rpc/server_public', {
      method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id })
    });
    if (!r.ok) throw new Error('rpc ' + r.status);
    const s = await r.json();
    if (!s || !s.name) return notFound('Esse link não existe ou foi trocado. Peça um novo para quem te mandou.');
    const accent = safeColor(s.accent) || safeColor(s.icon_color) || '#ff3d7f';
    const icon = safeUrl(s.icon_url), banner = safeUrl(s.banner_url);
    const desc = s.description || `Servidor no Telão com ${s.members} ${s.members === 1 ? 'membro' : 'membros'}. Entra aí!`;
    const ini = String(s.name).replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    const join = '/#convite=' + encodeURIComponent(s.invite);
    const canonical = origin ? origin + '/s/' + encodeURIComponent(s.slug || id) : '';
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.end(page({ title: `${s.name} · Telão`, desc, image: banner || icon || (origin ? origin + '/icons/icon-512.png' : ''), accent, origin, canonical,
      body: `<div class="card"><div class="ban" ${banner ? `style="background-image:url('${esc(banner)}')"` : ''}></div><div class="in">
        <div class="ic" style="background:${accent}">${icon ? `<img src="${esc(icon)}" alt="">` : esc(ini)}</div>
        <h1>${esc(s.name)}${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ''}</h1>
        <p class="d">${esc(desc)}</p>
        <div class="st"><span><i class="dot"></i>${s.online} online agora</span>${s.in_call ? `<span>🔊 ${s.in_call} na call</span>` : ''}<span>👥 ${s.members} ${s.members === 1 ? 'membro' : 'membros'}</span></div>
        ${(s.channels || []).length ? `<div class="ch">${s.channels.map(n => `<b>#${esc(n)}</b>`).join('')}</div>` : ''}
        <a class="go" href="${esc(join)}">Entrar no servidor</a>
        <a class="sec" href="/baixar">Baixar o Telão para Windows</a>
        <div class="ft">Feito com <a href="/">Telão</a> · tela, voz e chat com os amigos</div></div></div>` }));
  } catch (e) {
    res.statusCode = 502;
    res.end(page({ title: 'Telão', desc: 'Não deu para carregar agora.', origin, body: `<div class="card"><div class="ban"></div><div class="in"><div class="ic">!</div><h1>Não deu para carregar</h1><p class="d">Tente de novo em alguns segundos.</p><a class="go" href="/">Abrir o Telão</a></div></div>` }));
  }
};
