/* =====================================================================
   v6.39: PÁGINA PÚBLICA DO SERVIDOR
   telao.../s/nome-bonito → página com nome, descrição, capa, quantos estão online
   e na call agora, e o botão Entrar. Feita para colocar na bio do Instagram/TikTok
   (tem prévia bonita quando cola o link). Sem nome bonito, /s/CODIGO-DO-CONVITE também funciona.
   ===================================================================== */
const PG_SQL = 'Para a página pública, rode o supabase.sql novo (v6.39) no Supabase.';
// "online agora" da página pública: um sinal leve a cada 4 min enquanto o Telão está aberto
let pgSeenT = 0;
function pgSeen(){ if(document.hidden || !S.me || Date.now() - pgSeenT < 230000) return; pgSeenT = Date.now(); App.sb.rpc('touch_seen').then(() => {}, () => {}); }
setInterval(pgSeen, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) setTimeout(pgSeen, 3000); });
setTimeout(pgSeen, 8000);

const pgUrl = s => location.origin + '/s/' + (s.slug || s.invite_code);
const slugify = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
async function secSrvPage(box, back){
  const s = SET.server;
  const url = pgUrl(s);
  box.innerHTML = `${back}<h2>Página pública</h2>
    <p class="mut">Um link bonito para divulgar o servidor no Instagram, TikTok ou onde quiser. Mostra nome, descrição, capa, quantos estão online e na call agora, e um botão para entrar.</p>
    <label class="field"><span>Nome do link</span></label>
    <div class="copyrow pgslug"><span class="pgpre">${esc(location.host)}/s/</span><input class="inp" id="pgSlug" maxlength="24" placeholder="${esc(slugify(s.name) || 'meu-servidor')}" value="${esc(s.slug || '')}"><button class="btn" id="pgSave">Salvar</button></div>
    <small class="mut">Só letras minúsculas, números e hífen (3 a 24). Deixe vazio para usar o código do convite.</small>
    <div class="pgcard">
      <div class="pgqr" id="pgQr"><div class="spin"></div></div>
      <div class="pginfo"><b>Seu link</b><a href="${esc(url)}" target="_blank" rel="noopener" id="pgLink">${esc(url)}</a>
        <div class="gacts"><button class="btn sm" id="pgCopy">${ic('copy', 14)} Copiar</button><a class="btn sec sm" href="${esc(url)}" target="_blank" rel="noopener">${ic('globe', 14)} Abrir</a>${navigator.share ? `<button class="btn sec sm" id="pgShare">${ic('send', 14)} Compartilhar</button>` : ''}</div>
        <small class="mut">Dica: a prévia usa a capa, o ícone e a descrição do servidor (Configurações → Visão geral).</small></div>
    </div>`;
  const $b = q => box.querySelector(q);
  $b('#pgCopy').onclick = () => { copy(pgUrl(s)); $b('#pgCopy').innerHTML = `${ic('check', 14)} Copiado`; };
  const sh = $b('#pgShare'); if(sh) sh.onclick = () => navigator.share({ title: s.name, text: `Entra no ${s.name} no Telão!`, url: pgUrl(s) }).catch(() => {});
  try{
    if(!window.qrcode) await new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = '/qrcode.js'; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); });
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const n = q.getModuleCount(), m = 2; let d = '';
    for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    $b('#pgQr').innerHTML = `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b0b10"/></svg>`;
  }catch(e){ $b('#pgQr').innerHTML = ''; }
  $b('#pgSave').onclick = async () => {
    let v = slugify($b('#pgSlug').value);
    if(v && (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(v) || /^[0-9a-f]{8}$/.test(v))){ App.toast('Use de 3 a 24 letras, números ou hífen.', true); return; }
    $b('#pgSave').disabled = true;
    const { error } = await App.sb.from('servers').update({ slug: v || null }).eq('id', s.id);
    $b('#pgSave').disabled = false;
    if(error){
      App.toast(/slug|column/i.test(error.message) && /schema|exist/i.test(error.message) ? PG_SQL : /duplicate|unique|servers_slug_uq/i.test(error.message) ? 'Esse nome já é de outro servidor. Tente outro.' : error.message, true);
      return;
    }
    s.slug = v || null; App.toast(v ? 'Link salvo!' : 'Voltou para o código do convite.'); renderSettings();
  };
}
App.pgUrl = pgUrl;
