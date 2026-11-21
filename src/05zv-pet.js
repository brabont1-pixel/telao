/* =====================================================================
   v6.31: BICHINHO DO SERVIDOR
   Cada servidor tem um mascote que cresce com a galera: mensagem (+1, até 40 por pessoa por dia),
   tempo em call (+5 a cada 5 min, até 60 por dia) e carinho (+5, uma vez por dia por pessoa).
   Se o servidor fica parado ele fica triste e depois doente — mas não morre: volta quando a galera volta.
   Fases: ovo → filhote → jovem → adulto → lendário. Quem gerencia o servidor escolhe nome, espécie e cor.
   ===================================================================== */
const PET_SQL = 'Para o bichinho do servidor, rode o supabase.sql novo (v6.31) no Supabase.';
const PET_STAGES = [[0, 'Ovo'], [60, 'Filhote'], [400, 'Jovem'], [1500, 'Adulto'], [5000, 'Lendário']];
const PET_SPECIES = { slime: 'Slime', gato: 'Gatinho', dragao: 'Dragãozinho', robo: 'Robô', fantasma: 'Fantasminha', pato: 'Patinho' };
const PET_COLORS = ['#ff2e9a', '#b6ff2e', '#2ee6ff', '#a970ff', '#ffb02e', '#ff5c5c', '#2effa8', '#ffe14d', '#5c8cff', '#f0f0f0'];
S.pets = new Map();
const petStage = xp => { let i = 0; PET_STAGES.forEach(([min], k) => { if(xp >= min) i = k; }); return i; };
const petNext = xp => { const i = petStage(xp); return i >= PET_STAGES.length - 1 ? null : PET_STAGES[i + 1][0]; };
function petMood(p){
  const h = (Date.now() - new Date(p.last_active).getTime()) / 3600000;
  if(h < 6) return { k: 'feliz', t: 'feliz', e: '😊' };
  if(h < 24) return { k: 'ok', t: 'de boa', e: '🙂' };
  if(h < 72) return { k: 'triste', t: 'com saudade da galera', e: '😢' };
  return { k: 'doente', t: 'doente de tanto esperar', e: '🤒' };
}
function petSvg(p, size = 64){
  const st = petStage(p.xp), mood = petMood(p).k, c = p.color || '#ff2e9a', sp = p.species || 'slime';
  const dark = 'rgba(0,0,0,.55)';
  if(st === 0){
    const crack = p.xp > 30 ? '<path d="M34 38l6 5 5-6 6 6 5-5" stroke="#16121c" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '';
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="petsvg st0"><ellipse cx="50" cy="90" rx="22" ry="5" fill="rgba(0,0,0,.25)"/><ellipse cx="50" cy="55" rx="26" ry="33" fill="#fff6e8"/><circle cx="40" cy="45" r="5" fill="${c}"/><circle cx="60" cy="62" r="6" fill="${c}"/><circle cx="58" cy="38" r="3.5" fill="${c}"/>${crack}</svg>`;
  }
  const scale = [0, .72, .84, .94, 1][st];
  const sick = mood === 'doente', sad = mood === 'triste' || sick;
  const body = sick ? `color-mix(in srgb, ${c} 55%, #8a9a6a)` : c;
  let ears = '', extra = '', bodyShape = `<ellipse cx="50" cy="60" rx="30" ry="27" fill="${body}"/>`;
  if(sp === 'gato') ears = `<path d="M26 44 L30 22 L42 36 Z" fill="${body}"/><path d="M74 44 L70 22 L58 36 Z" fill="${body}"/><path d="M30 29 L33 36 L37 34Z" fill="#ffb3d1"/><path d="M70 29 L67 36 L63 34Z" fill="#ffb3d1"/>`, extra = `<path d="M78 72 q14 -4 12 -18" stroke="${body}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if(sp === 'dragao') ears = `<path d="M33 38 L28 20 L40 33Z" fill="#ffe14d"/><path d="M67 38 L72 20 L60 33Z" fill="#ffe14d"/>`, extra = `<path d="M20 56 q-14 -14 -6 -24 q6 10 14 12Z" fill="${body}" opacity=".85"/><path d="M80 56 q14 -14 6 -24 q-6 10 -14 12Z" fill="${body}" opacity=".85"/>`;
  if(sp === 'robo') bodyShape = `<rect x="22" y="36" width="56" height="50" rx="12" fill="${body}"/>`, ears = `<line x1="50" y1="36" x2="50" y2="22" stroke="#bbb" stroke-width="3"/><circle cx="50" cy="20" r="5" fill="${sad ? '#888' : '#ff5c5c'}"/>`;
  if(sp === 'fantasma') bodyShape = `<path d="M22 60 q0 -30 28 -30 q28 0 28 30 v24 l-7 -6 -7 6 -7 -6 -7 6 -7 -6 -7 6 -7 -6 -7 6z" fill="${body}"/>`;
  if(sp === 'pato') extra = `<ellipse cx="50" cy="66" rx="9" ry="5" fill="#ffb02e"/>`, ears = `<path d="M46 34 q4 -10 10 -4" stroke="${body}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if(sp === 'slime') bodyShape = `<path d="M18 84 q-2 -40 32 -48 q34 8 32 48 q-8 4 -16 0 q-8 4 -16 0 q-8 4 -16 0 q-8 4 -16 0z" fill="${body}"/><ellipse cx="38" cy="50" rx="6" ry="4" fill="#fff" opacity=".35"/>`;
  const eyeY = sp === 'pato' ? 55 : 58;
  const eyes = sick ? `<path d="M36 ${eyeY - 4} l8 8 M44 ${eyeY - 4} l-8 8 M56 ${eyeY - 4} l8 8 M64 ${eyeY - 4} l-8 8" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`
    : `<circle cx="40" cy="${eyeY}" r="${sad ? 4 : 5.5}" fill="#16121c"/><circle cx="60" cy="${eyeY}" r="${sad ? 4 : 5.5}" fill="#16121c"/><circle cx="41.8" cy="${eyeY - 2}" r="1.8" fill="#fff"/><circle cx="61.8" cy="${eyeY - 2}" r="1.8" fill="#fff"/>${sad ? `<path d="M34 ${eyeY - 9} l10 3 M66 ${eyeY - 9} l-10 3" stroke="${dark}" stroke-width="2.5" stroke-linecap="round"/>` : ''}`;
  const mouth = sp === 'pato' ? '' : sad ? `<path d="M43 74 q7 -6 14 0" stroke="${dark}" stroke-width="3" fill="none" stroke-linecap="round"/>` : `<path d="M42 70 q8 8 16 0" stroke="${dark}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const cheeks = sad ? '' : `<ellipse cx="31" cy="67" rx="5" ry="3" fill="#ff7ab8" opacity=".6"/><ellipse cx="69" cy="67" rx="5" ry="3" fill="#ff7ab8" opacity=".6"/>`;
  const tear = mood === 'triste' ? `<path d="M37 64 q-3 6 0 8 q3 -2 0 -8z" fill="#7cc8ff"/>` : '';
  const crown = st >= 4 ? `<path d="M36 30 l4 -12 6 8 4 -10 4 10 6 -8 4 12z" fill="#ffd24d" stroke="#c9961a" stroke-width="1.5"/>` : st === 3 ? `<path d="M40 34 q10 -10 20 0" stroke="#ffd24d" stroke-width="4" fill="none"/>` : '';
  const sparkle = st >= 4 && !sad ? `<text x="80" y="28" font-size="14">✨</text>` : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="petsvg ${sad ? 'sad' : 'happy'}"><ellipse cx="50" cy="92" rx="${24 * scale}" ry="5" fill="rgba(0,0,0,.25)"/>
    <g transform="translate(50 92) scale(${scale}) translate(-50 -92)">${extra}${ears}${bodyShape}${eyes}${mouth}${cheeks}${tear}${crown}</g>${sparkle}</svg>`;
}
async function petLoad(sid, force){
  if(!sid) return null;
  const c = S.pets.get(sid); if(c && !force && Date.now() - c._at < 60000) return c;
  const { data, error } = await App.sb.rpc('pet_get', { p_server: sid });
  if(error){ S.pets.set(sid, { _err: error.message, _at: Date.now() }); return null; }
  data._at = Date.now(); S.pets.set(sid, data); return data;
}
function petRow(sid){
  const p = S.pets.get(sid); if(!p || p._err) return '';
  const st = petStage(p.xp), nx = petNext(p.xp), mood = petMood(p);
  const pct = nx ? Math.round((p.xp - PET_STAGES[st][0]) / (nx - PET_STAGES[st][0]) * 100) : 100;
  return `<button class="petrow mood-${mood.k}" id="sbPet"><span class="petmini">${petSvg(p, 40)}</span><span class="t"><b>${esc(p.name)} <small>${PET_STAGES[st][1]}</small></b><small>${mood.e} ${mood.t}</small><i class="petbar"><b style="width:${pct}%"></b></i></span></button>`;
}
const _renderSidebarPet = renderSidebar;
renderSidebar = function(){
  const r = _renderSidebarPet.apply(this, arguments);
  if(S.route.kind !== 'server') return r;
  const sid = S.route.sid, body = $('#sbBody'); if(!body) return r;
  const srv = S.servers.find(x => x.id === sid);
  // v6.32: o bichinho é opcional (quem gerencia liga) e cada um pode esconder da própria lateral
  if(!srv || !srv.pet_on || (P.petHidden || {})[sid]){ document.getElementById('sbPet')?.remove(); return r; }
  const put = () => {
    if(S.route.kind !== 'server' || S.route.sid !== sid) return;
    document.getElementById('sbPet')?.remove();
    const html = petRow(sid); if(!html) return;
    const ev = body.querySelector('#sbEvents');
    ev ? ev.insertAdjacentHTML('afterend', html) : body.insertAdjacentHTML('afterbegin', html);
    document.getElementById('sbPet').onclick = () => petModal(sid);
  };
  put();
  const c = S.pets.get(sid); if(!c || Date.now() - c._at > 60000) petLoad(sid).then(put);
  return r;
};
async function petSetOn(s, on){
  const { error } = await App.sb.from('servers').update({ pet_on: on }).eq('id', s.id);
  if(error){ App.toast(/pet_on|schema cache/i.test(error.message) ? 'Para ligar o bichinho, rode o supabase.sql novo (v6.32) no Supabase.' : error.message, true); return false; }
  s.pet_on = on; renderSidebar(); return true;
}
App.petSetOn = petSetOn;
function petActivate(s){
  modal(`<div class="mh"><h2>🐾 Bichinho do servidor</h2><p>Um mascote que cresce com a galera conversando, ficando em call e fazendo carinho. Se o servidor fica parado, ele fica triste (mas nunca morre).</p></div>
    <div class="mc"><div class="petbig">${petSvg({ xp: 400, species: 'slime', color: '#ff2e9a', last_active: new Date().toISOString() }, 140)}</div>
      <p class="mut small" style="text-align:center">Fica na lateral do servidor para todo mundo. Dá para desligar quando quiser em Visão geral do servidor.</p></div>
    <div class="mf"><button class="btn sec" data-close>Agora não</button><button class="btn" id="petOn">🐾 Ativar bichinho</button></div>`, m => {
    m.querySelector('#petOn').onclick = async () => { if(await petSetOn(s, true)){ closeModal(); App.toast('Bichinho ativado! Ele nasceu como ovo 🥚'); petModal(s.id); } };
  });
}
async function petModal(sid){
  const s = S.servers.find(x => x.id === sid); if(!s) return;
  if(!s.pet_on){ if(App.hasPerm(sid, 2)) petActivate(s); else App.toast('O bichinho está desligado neste servidor.', true); return; }
  const p = await petLoad(sid, true);
  if(!p){ App.toast(PET_SQL, true); return; }
  await ensureProfiles((p.top || []).map(t => t.user_id));
  const st = petStage(p.xp), nx = petNext(p.xp), mood = petMood(p), can = App.hasPerm(sid, 2);
  const pct = nx ? Math.round((p.xp - PET_STAGES[st][0]) / (nx - PET_STAGES[st][0]) * 100) : 100;
  modal(`<div class="mh"><h2>${esc(p.name)} <small class="mut">· ${PET_SPECIES[p.species] || ''} de ${esc(s.name)}</small></h2><p>O bichinho do servidor cresce com a galera conversando, ficando em call e fazendo carinho.</p></div>
    <div class="mc"><div class="petbig mood-${mood.k}" id="petBig">${petSvg(p, 170)}</div>
      <div class="petstats"><div><b>${PET_STAGES[st][1]}</b><small>fase</small></div><div><b>${mood.e} ${mood.t}</b><small>humor</small></div><div><b>${p.xp.toLocaleString('pt-BR')}</b><small>pontos</small></div><div><b>+${p.today_xp || 0}</b><small>hoje</small></div></div>
      <div class="petprog"><i class="petbar big"><b style="width:${pct}%"></b></i><small>${nx ? `Faltam <b>${nx - p.xp}</b> pontos para virar <b>${PET_STAGES[st + 1][1]}</b>` : 'Fase máxima! 👑'}</small></div>
      <div class="gacts" style="justify-content:center"><button class="btn" id="petPet" ${p.petted_today ? 'disabled' : ''}>${p.petted_today ? '💗 Você já fez carinho hoje' : '🤚 Fazer carinho (+5)'}</button></div>
      <h3>Quem mais cuidou (30 dias)</h3><div class="pettop">${(p.top || []).map((t, i) => `<div><span>${['🥇', '🥈', '🥉', '4', '5'][i]}</span>${avatar(prof(t.user_id), 'xs')}<b>${esc(prof(t.user_id).display_name)}</b><small>${t.xp} pts</small></div>`).join('') || '<small class="mut">Ninguém ainda. Bora conversar!</small>'}</div>
      <p class="mut small" style="margin-top:12px">💬 mensagem +1 (até 40 por dia) · 🎧 5 min em call +5 (até 60 por dia) · 🤚 carinho +5 por dia. Parado mais de 1 dia ele fica triste; mais de 3, doente. Ele nunca morre: é só a galera voltar.</p>
      ${can ? `<details class="petcfg"><summary>Mudar o bichinho</summary>
        <label class="field"><span>Nome</span><input class="inp" id="petN" maxlength="20" value="${esc(p.name)}"></label>
        <div class="petsp">${Object.entries(PET_SPECIES).map(([k, n]) => `<button type="button" class="${p.species === k ? 'on' : ''}" data-psp="${k}">${petSvg({ ...p, species: k, xp: Math.max(p.xp, 400) }, 52)}<small>${n}</small></button>`).join('')}</div>
        <div class="colors" id="petC">${PET_COLORS.map(c => `<button type="button" data-pc="${c}" style="background:${c}" class="${p.color === c ? 'on' : ''}"></button>`).join('')}</div>
        <button class="btn sm" id="petSave">Salvar</button></details>` : ''}
      <label class="pethide"><input type="checkbox" id="petHide" ${(P.petHidden || {})[sid] ? 'checked' : ''}> Esconder o bichinho da minha lateral</label>
      ${can ? `<button class="btn sec sm" id="petOff" style="margin-top:8px">Desligar o bichinho do servidor</button>` : ''}
      <div class="gacts" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Fechar</button></div></div>`, m => {
    m.querySelector('#petHide').onchange = e => { P.petHidden = { ...(P.petHidden || {}), [sid]: e.target.checked }; if(!e.target.checked) delete P.petHidden[sid]; savePrefs(); renderSidebar(); App.toast(e.target.checked ? 'Escondido da sua lateral. Dá para ver pelo menu do servidor.' : 'O bichinho voltou para a sua lateral.'); };
    const off = m.querySelector('#petOff');
    if(off) off.onclick = async () => { if(!(await confirmBox('Desligar o bichinho?', 'Ele some da lateral de todo mundo e para de crescer. Os pontos ficam guardados se ligar de novo.', 'Desligar'))) return; if(await petSetOn(s, false)){ App.toast('Bichinho desligado.'); } };
    const pb = m.querySelector('#petPet');
    pb.onclick = async () => {
      pb.disabled = true;
      const { data, error } = await App.sb.rpc('pet_pet', { p_server: sid });
      if(error){ App.toast(error.message, true); pb.disabled = false; return; }
      const big = m.querySelector('#petBig'); big.classList.remove('petted'); void big.offsetWidth; big.classList.add('petted');
      for(let i = 0; i < 6; i++) setTimeout(() => { const h = document.createElement('span'); h.className = 'petheart'; h.textContent = '💗'; h.style.left = (35 + Math.random() * 30) + '%'; big.appendChild(h); setTimeout(() => h.remove(), 1400); }, i * 120);
      pb.textContent = data ? '💗 Ele amou! (+5)' : '💗 Você já fez carinho hoje';
      await petLoad(sid, true); renderSidebar();
    };
    if(!can) return;
    let sp = p.species, col = p.color;
    m.querySelectorAll('[data-psp]').forEach(b => b.onclick = () => { sp = b.dataset.psp; m.querySelectorAll('[data-psp]').forEach(x => x.classList.toggle('on', x === b)); m.querySelector('#petBig').innerHTML = petSvg({ ...p, species: sp, color: col }, 170); });
    m.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { col = b.dataset.pc; m.querySelectorAll('[data-pc]').forEach(x => x.classList.toggle('on', x === b)); m.querySelector('#petBig').innerHTML = petSvg({ ...p, species: sp, color: col }, 170); });
    m.querySelector('#petSave').onclick = async () => {
      const { error } = await App.sb.rpc('pet_config', { p_server: sid, p_name: m.querySelector('#petN').value.trim(), p_species: sp, p_color: col });
      if(error){ App.toast(error.message, true); return; }
      await petLoad(sid, true); closeModal(); renderSidebar(); App.toast('Bichinho atualizado!');
    };
  });
}
App.petModal = petModal; App._petSvg = petSvg;
// em call num servidor: a cada 5 min conta para o bichinho
setInterval(() => {
  const ch = Voice.channel; if(!ch || !ch.server_id) return;
  App.sb.rpc('pet_voice_tick', { p_server: ch.server_id }).then(({ data }) => { if(data) petLoad(ch.server_id, true).then(() => { if(S.route.kind === 'server' && S.route.sid === ch.server_id) renderSidebar(); }); }, () => {});
}, 5 * 60 * 1000);
const _srvMenuExtraPet = App.srvMenuExtra;
App.srvMenuExtra = s => (_srvMenuExtraPet ? _srvMenuExtraPet(s) : []).concat(s.pet_on || App.hasPerm(s.id, 2) ? [{ label: s.pet_on ? 'Bichinho do servidor' : 'Ativar bichinho do servidor', icon: ic('paw', 18), onClick: () => petModal(s.id) }] : []);
// Visão geral do servidor: ligar/desligar
const _secSrvOverviewPet = secSrvOverview;
secSrvOverview = function(box, back){
  _secSrvOverviewPet.apply(this, arguments);
  const s = SET.server; if(!App.hasPerm(s.id, 2)) return;
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>🐾 Bichinho do servidor</h3>${row('Ativar o bichinho', 'Um mascote na lateral que cresce com a galera conversando, em call e fazendo carinho.', toggle('petOnT', !!s.pet_on))}`);
  box.querySelector('#petOnT').onchange = async e => { if(!(await petSetOn(s, e.target.checked))) e.target.checked = !e.target.checked; else App.toast(e.target.checked ? 'Bichinho ativado! 🐾' : 'Bichinho desligado.'); };
};
