// v6.27: músicas para o "Quiz de música" na call.
// Usa a busca pública do iTunes (sem chave) e devolve só trechos de 30 s (previewUrl) — é para isso que eles existem.
// O navegador chama aqui porque a API do iTunes nem sempre libera CORS.
const GENRES = {
  sertanejo: ['Henrique e Juliano', 'Jorge e Mateus', 'Marília Mendonça', 'Gusttavo Lima', 'Zé Neto e Cristiano', 'Ana Castela', 'Maiara e Maraisa', 'Luan Santana', 'Matheus e Kauan', 'Simone Mendes'],
  funk: ['MC Ryan SP', 'MC IG', 'Anitta', 'Ludmilla', 'MC Kevin o Chris', 'Pedro Sampaio', 'MC Daniel', 'Kevin O Chris', 'MC Hariel', 'Dennis DJ'],
  trap: ['Matuê', 'Veigh', 'Teto', 'Wiu', 'Orochi', 'Filipe Ret', 'MC Cabelinho', 'L7nnon', 'Kayblack', 'Poze do Rodo'],
  pop: ['Taylor Swift', 'Dua Lipa', 'The Weeknd', 'Billie Eilish', 'Ariana Grande', 'Bruno Mars', 'Ed Sheeran', 'Olivia Rodrigo', 'Harry Styles', 'Sabrina Carpenter'],
  rock: ['Linkin Park', 'Charlie Brown Jr.', 'Legião Urbana', 'Queen', 'Nirvana', 'Arctic Monkeys', 'Foo Fighters', 'Capital Inicial', 'Red Hot Chili Peppers', 'Imagine Dragons'],
  pagode: ['Thiaguinho', 'Péricles', 'Ferrugem', 'Menos é Mais', 'Grupo Menos É Mais', 'Sorriso Maroto', 'Turma do Pagode', 'Dilsinho', 'Belo', 'Exaltasamba'],
  mpb: ['Djavan', 'Caetano Veloso', 'Gilberto Gil', 'Marisa Monte', 'Tim Maia', 'Jorge Ben Jor', 'Elis Regina', 'Seu Jorge', 'Anavitória', 'Tiago Iorc'],
  anos2000: ['Britney Spears', 'Black Eyed Peas', 'Avril Lavigne', 'Rihanna', 'Beyoncé', 'Linkin Park', 'Justin Timberlake', 'Shakira', 'Lady Gaga', 'Eminem'],
  rap: ['Racionais MCs', 'Emicida', 'Projota', 'Criolo', 'Djonga', 'Kendrick Lamar', 'Drake', 'Eminem', 'Travis Scott', 'Post Malone'],
};
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // v6.31: busca livre (música do perfil)
  const q = String((req.query && req.query.q) || '').trim().slice(0, 80);
  if (q) {
    try {
      const u = 'https://itunes.apple.com/search?' + new URLSearchParams({ term: q, entity: 'song', country: 'BR', limit: '15' });
      const r = await fetch(u, { headers: { 'User-Agent': 'Telao/1.0' } }); const j = r.ok ? await r.json() : { results: [] };
      const tracks = (j.results || []).filter(t => t.previewUrl).map(t => ({ title: String(t.trackName).slice(0, 80), artist: String(t.artistName).slice(0, 80), preview: t.previewUrl, art: t.artworkUrl100 || null }));
      res.setHeader('Cache-Control', 'public, s-maxage=3600'); res.end(JSON.stringify({ tracks }));
    } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: 'Não deu para buscar agora.' })); }
    return;
  }
  const g = String((req.query && req.query.g) || 'pop');
  const artists = GENRES[g] || GENRES.pop;
  const pick = artists.slice().sort(() => Math.random() - 0.5).slice(0, 6);
  try {
    const lists = await Promise.all(pick.map(async a => {
      const u = 'https://itunes.apple.com/search?' + new URLSearchParams({ term: a, entity: 'song', attribute: 'artistTerm', country: 'BR', limit: '25' });
      try { const r = await fetch(u, { headers: { 'User-Agent': 'Telao/1.0' } }); if (!r.ok) return []; const j = await r.json(); return j.results || []; } catch (e) { return []; }
    }));
    const seen = new Set(), out = [];
    lists.flat().forEach(t => {
      if (!t.previewUrl || !t.trackName) return;
      const k = (t.trackName + '|' + t.artistName).toLowerCase().replace(/\s*[\(\[].*?[\)\]]/g, '');
      if (seen.has(k)) return; seen.add(k);
      out.push({ title: t.trackName.replace(/\s*[\(\[](feat|ft|com|part)[^)\]]*[\)\]]/ig, '').slice(0, 80), artist: String(t.artistName).slice(0, 80), preview: t.previewUrl, art: t.artworkUrl100 || null });
    });
    if (out.length < 8) { res.statusCode = 502; res.end(JSON.stringify({ error: 'Não achei músicas agora. Tente outro estilo.' })); return; }
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.end(JSON.stringify({ genre: g, tracks: out.sort(() => Math.random() - 0.5).slice(0, 60) }));
  } catch (e) {
    res.statusCode = 502; res.end(JSON.stringify({ error: 'Não deu para buscar as músicas agora.' }));
  }
};
