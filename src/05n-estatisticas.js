/* =====================================================================
   v6.8: TEMPO EM CALL + ESTATÍSTICAS DO SERVIDOR
   ===================================================================== */

/* ---------- tempo em call: avisa o banco a cada minuto enquanto estou numa call de servidor ---------- */
const VS = { id: null, timer: null, cid: null };
async function voicePing(){
  if(!Voice.channel || !Voice.channel.server_id){ voiceStop(); return; }
  if(VS.cid !== Voice.channel.id){ VS.id = null; VS.cid = Voice.channel.id; }
  try{
    const { data } = await App.sb.rpc('voice_ping', { p_session: VS.id, p_channel: Voice.channel.id });
    if(data) VS.id = data;
  }catch(e){}
}
function voiceStop(){ clearInterval(VS.timer); VS.timer = null; if(VS.id && VS.cid) App.sb.rpc('voice_ping', { p_session: VS.id, p_channel: VS.cid }).then(() => {}, () => {}); VS.id = null; VS.cid = null; }
const _joinVoiceT = joinVoice;
joinVoice = async function(ch){
  const r = await _joinVoiceT.apply(this, arguments);
  if(Voice.channel && Voice.channel.server_id){ voicePing(); clearInterval(VS.timer); VS.timer = setInterval(voicePing, 60000); }
  return r;
};
const _leaveVoiceT = leaveVoice;
leaveVoice = async function(){ voiceStop(); return _leaveVoiceT.apply(this, arguments); };

/* ---------- tela de estatísticas ---------- */
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DOW_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const nf = n => Number(n || 0).toLocaleString('pt-BR');
const fmtMins = m => { m = Math.round(m || 0); if(m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? ' ' + String(r).padStart(2, '0') : ''); };
S.statsDays = 30;

async function secSrvStats(box, back){
  const s = SET.server;
  box.innerHTML = `${back}<h2>Estatísticas</h2><p class="mut">Como o servidor anda: quem mais conversa, os horários mais movimentados e quanto tempo a galera passa em call. Só membros veem.</p>
    <div class="stbar"><div class="stseg" role="tablist">${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias']].map(([d, l]) => `<button role="tab" class="${S.statsDays === d ? 'on' : ''}" data-days="${d}">${l}</button>`).join('')}</div></div>
    <div id="stBody"><div class="stload">${'<div class="sk"></div>'.repeat(4)}</div></div>`;
  box.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { S.statsDays = +b.dataset.days; secSrvStats(box, back); });
  const { data, error } = await App.sb.rpc('server_stats', { p_server: s.id, p_days: S.statsDays });
  const out = box.querySelector('#stBody'); if(!out) return;
  if(error){ out.innerHTML = `<div class="empty">Não deu para carregar: ${esc(error.message)}</div>`; return; }
  const st = data || {};
  await ensureProfiles([...(st.top_chatters || []).map(x => x.uid), ...(st.top_voice || []).map(x => x.uid)]);
  out.innerHTML = statsHtml(s, st);
}

function statsHtml(s, st){
  const days = st.days || S.statsDays;
  const perDay = new Map((st.per_day || []).map(([d, n]) => [String(d).slice(0, 10), n]));
  const series = [];
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  for(let i = days - 1; i >= 0; i--){ const d = new Date(today); d.setDate(today.getDate() - i); const k = d.toLocaleDateString('en-CA'); series.push([k, perDay.get(k) || 0]); }
  const avg = st.messages ? st.messages / days : 0;
  const peak = series.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);

  // mapa de calor: dia da semana × hora
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  (st.heat || []).forEach(([d, h, n]) => { heat[d][h] = n; });
  const hMax = Math.max(1, ...heat.flat());
  let best = [0, 0, 0]; heat.forEach((r, d) => r.forEach((n, h) => { if(n > best[2]) best = [d, h, n]; }));

  const vHeat = new Array(24).fill(0); (st.voice_heat || []).forEach(([h, m]) => { vHeat[h] = m; });
  const chName = cid => { const c = (S.channels.get(s.id) || []).find(x => x.id === cid); return c ? '#' + c.name : 'canal apagado'; };

  const tiles = `<div class="sttiles">
    <div class="stt"><small>Mensagens</small><b>${nf(st.messages)}</b><span>${avg >= 1 ? nf(Math.round(avg)) + ' por dia, em média' : 'nos últimos ' + days + ' dias'}</span></div>
    <div class="stt"><small>Tempo em call</small><b>${fmtMins(st.voice_minutes)}</b><span>somando todo mundo</span></div>
    <div class="stt"><small>Membros</small><b>${nf(st.members)}</b><span>${st.new_members ? '+' + nf(st.new_members) + ' entraram no período' : 'ninguém novo no período'}</span></div>
    <div class="stt"><small>Horário de pico</small><b>${best[2] ? DOW[best[0]] + ', ' + best[1] + 'h' : '—'}</b><span>${best[2] ? nf(best[2]) + ' mensagens nesse horário' : 'ainda sem mensagens'}</span></div>
  </div>`;

  if(!st.messages && !st.voice_minutes) return tiles + `<div class="empty big">${ic('poll', 40)}<h3>Ainda não tem movimento suficiente</h3><p class="mut">Conversem e entrem em call que os números aparecem aqui.</p></div>`;

  const vmax = Math.max(1, ...series.map(x => x[1]));
  const perDayChart = `<div class="stcard"><h3>Mensagens por dia</h3><p class="mut small">${peak[1] ? 'Dia mais movimentado: ' + new Date(peak[0] + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ', com ' + nf(peak[1]) + ' mensagens' : ''}</p>
    <div class="stcols ${days > 40 ? 'dense' : ''}">${series.map(([k, n]) => `<div class="stc" data-tip="${nf(n)} mensage${n === 1 ? 'm' : 'ns'}" data-tipsub="${new Date(k + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}"><i style="height:${n ? Math.max(3, n / vmax * 100) : 0}%"></i></div>`).join('')}</div>
    <div class="staxis"><span>${new Date(series[0][0] + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span><span>hoje</span></div></div>`;

  const heatChart = `<div class="stcard"><h3>Horários mais movimentados</h3><p class="mut small">Mensagens por dia da semana e hora (horário de Brasília). Quanto mais forte o rosa, mais conversa.</p>
    <div class="stheat">${heat.map((r, d) => `<span class="hl">${DOW[d]}</span>${r.map((n, h) => `<i data-tip="${nf(n)} mensage${n === 1 ? 'm' : 'ns'}" data-tipsub="${DOW_FULL[d]}, ${h}h–${h + 1}h" style="--v:${n ? (12 + 88 * Math.sqrt(n / hMax)).toFixed(0) : 0}%"></i>`).join('')}`).join('')}
      <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hx">${h % 3 === 0 ? h + 'h' : ''}</span>`).join('')}</div>
    <div class="stscale"><span>menos</span><i style="--v:12%"></i><i style="--v:40%"></i><i style="--v:70%"></i><i style="--v:100%"></i><span>mais</span></div></div>`;

  const barList = (title, sub, rows, empty) => {
    const mx = Math.max(1, ...rows.map(r => r.v));
    return `<div class="stcard"><h3>${title}</h3>${sub ? `<p class="mut small">${sub}</p>` : ''}${rows.length ? `<div class="stbars">${rows.map((r, i) => `
      <div class="stb" data-tip="${esc(r.tip)}"><span class="sbk">${i + 1}</span>${r.av || ''}<span class="sbn">${esc(r.name)}</span><span class="sbt"><i style="width:${Math.max(2, r.v / mx * 100)}%"></i></span><span class="sbv">${r.label}</span></div>`).join('')}</div>` : `<p class="mut small">${empty}</p>`}</div>`;
  };
  const chatters = barList('Quem mais conversa', '', (st.top_chatters || []).map(x => { const p = prof(x.uid); return { v: x.n, name: p.display_name, av: avatar(p, 'xs'), label: nf(x.n), tip: `${p.display_name}: ${nf(x.n)} mensagens` }; }), 'Ninguém mandou mensagem no período.');
  const voice = barList('Mais tempo em call', 'Conta a partir desta versão do app.', (st.top_voice || []).map(x => { const p = prof(x.uid); return { v: x.mins, name: p.display_name, av: avatar(p, 'xs'), label: fmtMins(x.mins), tip: `${p.display_name}: ${fmtMins(x.mins)} em call` }; }), 'Ninguém ficou em call no período (ou ainda não estava contando).');
  const chans = barList('Canais mais ativos', '', (st.top_channels || []).map(x => ({ v: x.n, name: chName(x.cid), label: nf(x.n), tip: `${chName(x.cid)}: ${nf(x.n)} mensagens` })), 'Sem mensagens no período.');

  const vm = Math.max(1, ...vHeat);
  const voiceHours = vHeat.some(Boolean) ? `<div class="stcard"><h3>Que horas a galera entra em call</h3><p class="mut small">Minutos em call por hora em que a chamada começou.</p>
    <div class="stcols">${vHeat.map((m, h) => `<div class="stc" data-tip="${fmtMins(m)}" data-tipsub="começando entre ${h}h e ${h + 1}h"><i style="height:${m ? Math.max(3, m / vm * 100) : 0}%"></i></div>`).join('')}</div>
    <div class="staxis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div></div>` : '';

  return tiles + perDayChart + heatChart + `<div class="stgrid">${chatters}${voice}</div>` + `<div class="stgrid">${chans}${voiceHours}</div>`;
}

App.secSrvStats = secSrvStats;
