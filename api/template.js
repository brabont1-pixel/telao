// v6.14: busca um template público do Discord (os da galeria do Xenon usam o mesmo código).
// O navegador não consegue chamar a API do Discord direto (CORS), então o site pergunta aqui.
// Não usa nenhuma chave: é o mesmo endpoint público que o discord.new usa.
module.exports = async (req, res) => {
  const code = String((req.query && req.query.code) || '').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!/^[A-Za-z0-9-]{2,40}$/.test(code)) {
    res.statusCode = 400; res.end(JSON.stringify({ error: 'Código de template inválido.' })); return;
  }
  try {
    const r = await fetch('https://discord.com/api/v10/guilds/templates/' + encodeURIComponent(code), {
      headers: { 'User-Agent': 'Telao (https://telao-zeta-three.vercel.app, 1.0)' }
    });
    if (r.status === 404) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Esse template não existe ou foi apagado.' })); return; }
    if (r.status === 429) { res.statusCode = 429; res.end(JSON.stringify({ error: 'O Discord pediu para esperar um pouco. Tente de novo em alguns segundos.' })); return; }
    if (!r.ok) { res.statusCode = 502; res.end(JSON.stringify({ error: 'O Discord não respondeu (' + r.status + ').' })); return; }
    const t = await r.json();
    const g = t.serialized_source_guild || {};
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(JSON.stringify({
      code: t.code, name: t.name, description: t.description, usage_count: t.usage_count,
      serialized_source_guild: { name: g.name, description: g.description, verification_level: g.verification_level, roles: g.roles || [], channels: g.channels || [] }
    }));
  } catch (e) {
    res.statusCode = 502; res.end(JSON.stringify({ error: 'Não deu para falar com o Discord agora.' }));
  }
};
