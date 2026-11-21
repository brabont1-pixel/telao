/* =====================================================================
   v6.31: CARTÃO DE ESTATÍSTICAS — horas em call, mensagens, jogo mais jogado… num cartão
   em formato de story (1080×1920) para baixar, compartilhar ou mandar no chat.
   ===================================================================== */
const SC_SQL = 'Para o cartão de estatísticas, rode o supabase.sql novo (v6.31) no Supabase.';
const scH = min => { min = min || 0; return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}`; };
const SC_THEMES = [['#ff2e9a', '#5b2bff'], ['#00c6ff', '#0b1a5c'], ['#b6ff2e', '#0a4f2c'], ['#ffb02e', '#ff2e63'], ['#1a1a24', '#3a2b55']];
function scImg(url){ return new Promise(res => { if(!url){ res(null); return; } const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; setTimeout(() => res(null), 4000); }); }
async function scDraw(st, range, theme){
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const [c1, c2] = SC_THEMES[theme];
  const gr = g.createLinearGradient(0, 0, W * .4, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // bolhas de fundo
  g.globalAlpha = .12; g.fillStyle = '#fff'; [[900, 260, 260], [120, 1500, 340], [980, 1750, 180]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }); g.globalAlpha = 1;
  const me = S.me;
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '800 40px system-ui, sans-serif'; g.fillText('TELÃO', 90, 140);
  g.font = '600 34px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(range === 30 ? 'MEUS ÚLTIMOS 30 DIAS' : range === 365 ? 'MEU ÚLTIMO ANO' : 'DESDE QUE ENTREI', 90, 190);
  // avatar
  const av = await scImg(me.avatar_url);
  g.save(); g.beginPath(); g.arc(W / 2, 400, 140, 0, Math.PI * 2); g.closePath(); g.fillStyle = me.avatar_color || '#5865f2'; g.fill(); g.clip();
  if(av) g.drawImage(av, W / 2 - 140, 260, 280, 280); else { g.fillStyle = '#fff'; g.font = '800 120px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText((me.display_name || '?').slice(0, 1).toUpperCase(), W / 2, 445); g.textAlign = 'left'; }
  g.restore(); g.lineWidth = 10; g.strokeStyle = '#fff'; g.beginPath(); g.arc(W / 2, 400, 145, 0, Math.PI * 2); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '900 84px system-ui, sans-serif'; g.fillText(String(me.display_name || '').slice(0, 18), W / 2, 640);
  g.font = '500 38px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText('@' + me.username, W / 2, 695); g.textAlign = 'left';
  // números grandes
  const big = [['🎧', scH(st.voice_min), 'em call'], ['💬', (st.messages || 0).toLocaleString('pt-BR'), 'mensagens']];
  big.forEach(([e, v, k], i) => {
    const x = 90 + i * 460, y = 780;
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect ? g.roundRect(x, y, 440, 250, 36) : g.rect(x, y, 440, 250); g.fill();
    g.font = '64px system-ui, sans-serif'; g.fillText(e, x + 34, y + 90);
    g.fillStyle = '#fff'; g.font = `900 ${String(v).length > 8 ? 58 : 72}px system-ui, sans-serif`; g.fillText(String(v), x + 34, y + 180);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '600 32px system-ui, sans-serif'; g.fillText(k, x + 34, y + 225);
  });
  const fr = st.top_friend && prof(st.top_friend.id);
  const rows = [['🎮', 'jogo mais jogado', st.top_game ? `${st.top_game.name} · ${scH(st.top_game.min)}` : '—'], ['🏠', 'servidor favorito', st.top_server ? st.top_server.name : '—'],
    ['🤝', 'quem mais conversei', fr ? fr.display_name : '—'], ['📅', 'dias ativo', String(st.days || 0)], ['🏆', 'vitórias nos jogos da call', String(st.game_wins || 0)], ['❤️', 'reações recebidas', (st.reacts_got || 0).toLocaleString('pt-BR')]];
  rows.forEach(([e, k, v], n) => {
    const y = 1100 + n * 118;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.roundRect ? g.roundRect(90, y, W - 180, 100, 26) : g.rect(90, y, W - 180, 100); g.fill();
    g.font = '46px system-ui, sans-serif'; g.fillText(e, 120, y + 66);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 28px system-ui, sans-serif'; g.fillText(k, 200, y + 38);
    g.fillStyle = '#fff'; g.font = '800 40px system-ui, sans-serif'; g.fillText(String(v).slice(0, 34), 200, y + 80);
  });
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 32px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('vem pro Telão · ' + location.host, W / 2, H - 80); g.textAlign = 'left';
  return c;
}
async function statsCard(){
  let range = 30, theme = 0, st = null, canvas = null;
  modal(`<div class="mh"><h2>📊 Meu cartão do Telão</h2><p>Suas estatísticas num cartão no formato de story.</p></div>
    <div class="mc"><div class="rltabs">${[[30, '30 dias'], [365, '1 ano'], [0, 'Desde sempre']].map(([v, l]) => `<button type="button" data-scr="${v}" class="${v === 30 ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="scthemes">${SC_THEMES.map(([a, b], i) => `<button type="button" data-sct="${i}" class="${i === 0 ? 'on' : ''}" style="background:linear-gradient(135deg,${a},${b})"></button>`).join('')}</div>
      <div class="scprev" id="scPrev"><div class="spin"></div></div></div>
    <div class="mf wrapf"><button class="btn sec" data-close>Fechar</button><button class="btn sec" id="scSend">${ic('send', 16)} Mandar no chat</button>${navigator.canShare ? `<button class="btn sec" id="scShare">${ic('upload', 16)} Compartilhar</button>` : ''}<button class="btn" id="scDl">${ic('download', 16)} Baixar</button></div>`, m => {
    const prev = m.querySelector('#scPrev');
    const draw = async reload => {
      prev.innerHTML = '<div class="spin"></div>';
      if(reload || !st){
        const { data, error } = await App.sb.rpc('my_stats', { p_days: range });
        if(error){ prev.innerHTML = `<div class="locked">${/my_stats|schema cache|does not exist/i.test(error.message) ? SC_SQL : esc(error.message)}</div>`; return; }
        st = data; if(st.top_friend) await ensureProfiles([st.top_friend.id]);
      }
      canvas = await scDraw(st, range, theme);
      canvas.className = 'sccanvas'; prev.innerHTML = ''; prev.appendChild(canvas);
    };
    m.querySelectorAll('[data-scr]').forEach(b => b.onclick = () => { range = +b.dataset.scr; m.querySelectorAll('[data-scr]').forEach(x => x.classList.toggle('on', x === b)); draw(true); });
    m.querySelectorAll('[data-sct]').forEach(b => b.onclick = () => { theme = +b.dataset.sct; m.querySelectorAll('[data-sct]').forEach(x => x.classList.toggle('on', x === b)); draw(false); });
    const blob = () => new Promise(r => canvas.toBlob(r, 'image/png'));
    m.querySelector('#scDl').onclick = async () => { if(!canvas) return; const b = await blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'meu-cartao-telao.png'; a.click(); };
    const sh = m.querySelector('#scShare'); if(sh) sh.onclick = async () => { if(!canvas) return; const f = new File([await blob()], 'meu-cartao-telao.png', { type: 'image/png' }); if(navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Meu cartão do Telão' }).catch(() => {}); else App.toast('Seu aparelho não deixa compartilhar imagem daqui. Use Baixar.', true); };
    m.querySelector('#scSend').onclick = async e => {
      if(!canvas) return; const cid = M.cid; if(!cid){ App.toast('Abra uma conversa para mandar.', true); return; }
      const b = e.currentTarget; b.disabled = true;
      try{ const meta = await uploadOne({ file: new File([await blob()], 'meu-cartao-telao.png', { type: 'image/png' }) });
        const { error } = await App.sb.from('messages').insert({ channel_id: cid, content: 'Meu cartão do Telão 📊', attachments: [meta] }); if(error) throw error; App.toast('Enviado!'); closeModal();
      }catch(x){ b.disabled = false; App.toast(x.message || String(x), true); }
    };
    draw(true);
  });
}
App.statsCard = statsCard;
const _selfMenuExtraSC = App.selfMenuExtra;
App.selfMenuExtra = () => (_selfMenuExtraSC ? _selfMenuExtraSC() : []).concat([{ label: 'Meu cartão de estatísticas', icon: '<span style="font-size:16px;width:18px;text-align:center">📊</span>', onClick: () => statsCard() }]);
