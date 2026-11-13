/* =====================================================================
   v6.4: SEGURANÇA · IDADE · CANAIS CONFIGURÁVEIS · FILTRO AUTOMÁTICO DE NUDEZ NA TELA
   ===================================================================== */
const isAdult = p => { if(!p || !p.birthdate) return false; const d = new Date(p.birthdate + 'T00:00:00'), t = new Date(); t.setFullYear(t.getFullYear() - 18); return d <= t; };
const isMod = sid => App.hasPerm(sid, 1) || App.hasPerm(sid, 8) || App.hasPerm(sid, 64);
const chNsfw = c => !!c && (c.nsfw || !!(S.servers.find(s => s.id === c.server_id) || {}).nsfw);

/* ---------- idade ---------- */
// cadastro: data de nascimento obrigatória (fica guardada até a pessoa entrar pela primeira vez)
(() => {
  const reg = $('#regFields'); if(!reg || $('#aBirth')) return;
  reg.insertAdjacentHTML('beforeend', `<label class="field"><span>Data de nascimento</span><input class="inp" id="aBirth" type="date" max="${new Date().toISOString().slice(0, 10)}"></label>`);
  const form = $('#authForm') || reg.closest('form');
  if(form) form.addEventListener('submit', e => {
    if(reg.classList.contains('hidden')) return;
    const v = $('#aBirth').value;
    const min = new Date(); min.setFullYear(min.getFullYear() - 13);
    if(!v){ e.preventDefault(); e.stopImmediatePropagation(); authError('Coloque sua data de nascimento.'); return; }
    if(new Date(v) > min){ e.preventDefault(); e.stopImmediatePropagation(); authError('O Telão é para maiores de 13 anos.'); return; }
    ls.set('telao-birth', v);
  }, true);
})();
async function saveBirthdate(v){
  const { data, error } = await App.sb.rpc('set_birthdate', { p_date: v });
  if(error){ App.toast(error.message, true); return null; }
  const { data: me } = await App.sb.from('profiles').select('*').eq('id', S.me.id).single();
  if(me){ S.me = me; S.profiles.set(me.id, me); }
  return data;
}
function ageModal(after){
  const max = new Date(); max.setFullYear(max.getFullYear() - 13);
  modal(`<form id="agF"><div class="mh"><h2>Confirme sua idade</h2><p>Precisamos da sua data de nascimento para liberar canais com restrição de idade. Ela não aparece para ninguém e não pode ser trocada depois.</p></div>
    <div class="mc"><label class="field"><span>Data de nascimento</span><input class="inp" type="date" id="agD" required max="${max.toISOString().slice(0, 10)}"></label><div class="err" id="agE"></div></div>
    <div class="mf"><button type="button" class="btn sec" data-close>Agora não</button><button class="btn">Confirmar</button></div></form>`, m => {
    m.querySelector('#agF').onsubmit = async e => {
      e.preventDefault();
      const v = m.querySelector('#agD').value; if(!v) return;
      if(!(await confirmBox('Confirmar data', `Sua data de nascimento é <b>${new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')}</b>? Não dá para mudar depois.`, 'Confirmar'))) return;
      const r = await saveBirthdate(v); if(r === null) return;
      closeModal(); after && after(r);
    };
  });
}
App.ageModal = ageModal;

/* canal +18: mostra o aviso no lugar do conteúdo */
const _renderMain = renderMain;
renderMain = function(){
  const r = S.route, c = r.kind === 'server' && r.cid ? findChannel(r.cid) : null;
  if(c && c.kind === 'text' && chNsfw(c) && !(isAdult(S.me) && ls.get('telao-18ok-' + c.id, false))){
    unmountMessages();
    const head = $('#mainHead'), body = $('#mainBody');
    head.innerHTML = `<div class="htitle">${ic('hash', 22)}<b>${esc(c.name)}</b><span class="tag18">+18</span></div>`;
    const adult = isAdult(S.me), known = !!S.me.birthdate;
    body.innerHTML = `<div class="gate18"><div class="g18i">18+</div><h2>Canal com restrição de idade</h2>
      <p>${known && !adult ? 'Você não tem idade para ver este canal.' : 'Este canal pode ter conteúdo para maiores de 18 anos. Para entrar, você precisa ter 18 anos ou mais.'}</p>
      <div class="g18b"><button class="btn sec" id="g18No">Voltar</button>${known && !adult ? '' : `<button class="btn" id="g18Ok">${known ? 'Entendi, continuar' : 'Confirmar minha idade'}</button>`}</div></div>`;
    $('#g18No').onclick = () => { const s = curServer(); const first = (S.channels.get(s.id) || []).find(x => x.kind === 'text' && !chNsfw(x)); go(first ? { kind:'server', sid: s.id, cid: first.id } : { kind:'home', dm:null }); };
    const ok = $('#g18Ok'); if(ok) ok.onclick = () => {
      if(known){ ls.set('telao-18ok-' + c.id, true); renderMain(); }
      else ageModal(adult => { if(adult){ ls.set('telao-18ok-' + c.id, true); } renderMain(); });
    };
    return;
  }
  _renderMain.apply(this, arguments);
  applyComposerRules();
};
/* etiquetas na lista de canais: +18, privado, modo lento, só leitura, limite */
const _renderSidebarS = renderSidebar;
renderSidebar = function(){
  _renderSidebarS.apply(this, arguments);
  document.querySelectorAll('#sbBody .ch[data-cid]').forEach(el => {
    const c = findChannel(el.dataset.cid); if(!c || el.querySelector('.chtags')) return;
    const t = [];
    if(c.nsfw) t.push('<span class="tag18">+18</span>');
    if(c.allowed_roles && c.allowed_roles.length) t.push(`<span class="cht" data-tip="Canal privado">${ic('lock', 13)}</span>`);
    if(c.readonly) t.push(`<span class="cht" data-tip="Só leitura">${ic('eye', 13)}</span>`);
    if(c.slowmode) t.push(`<span class="cht" data-tip="Modo lento: ${fmtSlow(c.slowmode)}">${ic('clock', 13)}</span>`);
    if(c.kind === 'voice' && c.user_limit){ const n = voiceUsers(c).length; t.push(`<span class="chlim">${n}/${c.user_limit}</span>`); }
    if(t.length) el.querySelector('.nm').insertAdjacentHTML('afterend', `<span class="chtags">${t.join('')}</span>`);
  });
};
const fmtSlow = s => s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h';

/* ---------- caixa de mensagem: só leitura, modo lento, sem arquivos ---------- */
const lastSent = new Map();
function applyComposerRules(){
  const ta = $('#cmp'); if(!ta) return;
  const c = findChannel(M.cid); if(!c || !c.server_id) return;
  const mod = isMod(c.server_id), form = $('#cmpF');
  const info = $('#cmpRule') || (() => { const d = document.createElement('div'); d.id = 'cmpRule'; d.className = 'cmprule'; form && form.parentNode.insertBefore(d, form); return d; })();
  const bits = [];
  if(c.readonly && !mod){ ta.disabled = true; ta.placeholder = 'Este canal é só para leitura.'; bits.push(`${ic('eye', 13)} Só leitura`); }
  if(c.slowmode) bits.push(`${ic('clock', 13)} Modo lento: ${fmtSlow(c.slowmode)}${mod ? ' (moderadores não têm limite)' : ''}`);
  if(c.no_links) bits.push('Sem links');
  if(c.no_media){ bits.push('Sem arquivos'); const at = form && form.querySelector('#attBtn, [data-attach], .attbtn'); if(at && !mod) at.style.display = 'none'; }
  info.innerHTML = bits.join('<span class="dotsep">·</span>');
  info.classList.toggle('hidden', !bits.length);
}
// contagem regressiva do modo lento depois de enviar
document.addEventListener('submit', e => {
  if(e.target.id !== 'cmpF') return;
  const c = findChannel(M.cid); if(!c || !c.slowmode || isMod(c.server_id)) return;
  const until = Date.now() + c.slowmode * 1000; lastSent.set(c.id, until);
  const ta = $('#cmp');
  const tick = () => { const left = Math.ceil((until - Date.now()) / 1000); if(!$('#cmp') || M.cid !== c.id) return;
    if(left > 0){ ta.disabled = true; ta.placeholder = `Modo lento: espere ${left} s`; setTimeout(tick, 500); } else { ta.disabled = false; ta.placeholder = `Mensagem para #${c.name}`; } };
  setTimeout(tick, 400);
}, true);

/* ---------- configurações do canal (texto e voz) ---------- */
editChannelModal = function(c){
  const s = S.servers.find(x => x.id === c.server_id);
  const cats = [...new Set((S.channels.get(s.id) || []).map(x => x.category).filter(Boolean))];
  const roles = (S.roles.get(s.id) || []).filter(r => r.name !== '@everyone');
  const allowed = new Set(c.allowed_roles || []);
  const voice = c.kind === 'voice';
  const sel = (id, opts, v) => `<select class="inp" id="${id}">${opts.map(([val, l]) => `<option value="${val}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  modal(`<form id="ecF" class="chset"><div class="mh"><h2>${ic(voice ? 'volume' : 'hash', 22)} Configurar canal</h2></div>
    <div class="mc">
      <div class="tabs2" id="ecTabs"><button type="button" data-t="geral" class="on">Geral</button><button type="button" data-t="regras">${voice ? 'Chamada' : 'Regras'}</button><button type="button" data-t="acesso">Acesso</button></div>
      <div data-p="geral">
        <label class="field"><span>Nome</span><input class="inp" id="ecN" maxlength="40" value="${esc(c.name)}" required></label>
        ${voice ? '' : `<label class="field"><span>Tópico</span><textarea class="inp" id="ecT" maxlength="300" rows="3" placeholder="Diga para que serve este canal">${esc(c.topic || '')}</textarea></label>`}
        <label class="field"><span>Categoria</span><input class="inp" id="ecC" maxlength="40" list="ecCats" value="${esc(c.category || '')}" placeholder="Sem categoria"><datalist id="ecCats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        ${row('Restrição de idade (+18)', 'Só quem confirmou ter 18 anos ou mais pode entrar. Quem não tem idade vê um aviso.', toggle('ecNs', c.nsfw))}
      </div>
      <div data-p="regras" class="hidden">
        ${voice ? `
          <div class="grid2">
            <label class="field"><span>Limite de pessoas</span>${sel('ecLim', [[0, 'Sem limite'], ...[2,3,4,5,6,8,10,15,20,25,50,99].map(n => [n, n + ' pessoas'])], c.user_limit || 0)}</label>
            <label class="field"><span>Qualidade do áudio</span>${sel('ecBr', [[64,'64 kbps (economia)'],[96,'96 kbps (padrão)'],[128,'128 kbps (alta)'],[256,'256 kbps (música)'],[384,'384 kbps (estúdio)']], c.bitrate || 96)}</label>
          </div>
          <label class="field"><span>Qualidade das câmeras e telas</span>${sel('ecVq', [['auto','Automática'],['720p','Até 720p (economiza internet)'],['1080p','Até 1080p']], c.video_quality || 'auto')}</label>
          ${row('Só “pressionar para falar”', 'Todo mundo precisa segurar a tecla para falar. Bom para canais cheios.', toggle('ecPtt', c.ptt_only))}
          ${row('Bloquear câmera', 'Ninguém liga a câmera neste canal (moderadores sim).', toggle('ecNoCam', c.no_camera))}
          ${row('Bloquear compartilhar tela', 'Ninguém compartilha a tela neste canal (moderadores sim).', toggle('ecNoScr', c.no_screen))}
          <hr class="sdiv">
          ${row('Modo palco', 'Para lives, aulas e anúncios: só quem está no palco fala. Quem entra fica na plateia ouvindo e pode levantar a mão. Moderadores chamam para o palco.', toggle('ecStage', c.stage))}
          <label class="field ${c.stage ? '' : 'hidden'}" id="ecStT"><span>Assunto do palco</span><input class="inp" id="ecStTopic" maxlength="120" value="${esc(c.stage_topic || '')}" placeholder="Ex.: Sexta do karaokê, aula de violão…"></label>`
        : `
          <label class="field"><span>Modo lento</span>${sel('ecSlow', [[0,'Desligado'],[5,'5 segundos'],[10,'10 segundos'],[30,'30 segundos'],[60,'1 minuto'],[300,'5 minutos'],[900,'15 minutos'],[3600,'1 hora'],[21600,'6 horas']], c.slowmode || 0)}</label>
          <small class="mut" style="display:block;margin:-6px 0 12px">Cada pessoa espera esse tempo entre uma mensagem e outra. Moderadores não têm limite.</small>
          ${row('Só leitura (avisos)', 'Só quem gerencia canais ou mensagens pode escrever.', toggle('ecRo', c.readonly))}
          ${row('Bloquear links', 'Mensagens com links são recusadas.', toggle('ecNoL', c.no_links))}
          ${row('Bloquear arquivos e imagens', '', toggle('ecNoM', c.no_media))}`}
      </div>
      <div data-p="acesso" class="hidden">
        ${row('Canal privado', 'Só os cargos escolhidos (e quem administra) veem e entram neste canal.', toggle('ecPriv', allowed.size > 0))}
        <div id="ecRoles" class="rolepick ${allowed.size ? '' : 'hidden'}">${roles.length ? roles.map(r => `<label class="rp"><input type="checkbox" value="${r.id}" ${allowed.has(r.id) ? 'checked' : ''}><i style="background:${esc(r.color || '#888')}"></i>${esc(r.name)}</label>`).join('') : '<p class="mut small">Crie cargos em Configurações do servidor → Cargos.</p>'}</div>
      </div>
    </div>
    <div class="mf" style="justify-content:space-between"><button type="button" class="btn red" id="ecDel">${ic('trash',16)} Apagar</button><span style="display:flex;gap:10px"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></span></div></form>`, m => {
    const q = x => m.querySelector(x);
    m.querySelectorAll('#ecTabs [data-t]').forEach(b => b.onclick = () => {
      m.querySelectorAll('#ecTabs [data-t]').forEach(x => x.classList.toggle('on', x === b));
      m.querySelectorAll('[data-p]').forEach(p => p.classList.toggle('hidden', p.dataset.p !== b.dataset.t));
    });
    q('#ecPriv').onchange = e => q('#ecRoles').classList.toggle('hidden', !e.target.checked);
    if(q('#ecStage')) q('#ecStage').onchange = e => q('#ecStT').classList.toggle('hidden', !e.target.checked);
    q('#ecDel').onclick = async () => {
      if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>? ${voice ? '' : 'Todas as mensagens serão perdidas.'}`, 'Apagar canal'))) return;
      const { error } = await App.sb.from('channels').delete().eq('id', c.id);
      if(error) App.toast(error.message, true); else closeModal();
    };
    q('#ecF').onsubmit = async e => {
      e.preventDefault();
      let name = q('#ecN').value.trim(); if(!voice) name = name.toLowerCase().replace(/\s+/g, '-');
      const roleIds = q('#ecPriv').checked ? [...m.querySelectorAll('#ecRoles input:checked')].map(x => x.value) : [];
      if(q('#ecPriv').checked && !roleIds.length){ App.toast('Escolha pelo menos um cargo para o canal privado.', true); return; }
      const up = { name, category: q('#ecC').value.trim() || null, nsfw: q('#ecNs').checked, allowed_roles: roleIds.length ? roleIds : null };
      if(voice) Object.assign(up, { user_limit: +q('#ecLim').value, bitrate: +q('#ecBr').value, video_quality: q('#ecVq').value, ptt_only: q('#ecPtt').checked, no_camera: q('#ecNoCam').checked, no_screen: q('#ecNoScr').checked, stage: q('#ecStage').checked, stage_topic: q('#ecStTopic').value.trim() || null });
      else Object.assign(up, { topic: q('#ecT').value.trim() || null, slowmode: +q('#ecSlow').value, readonly: q('#ecRo').checked, no_links: q('#ecNoL').checked, no_media: q('#ecNoM').checked });
      const { error } = await App.sb.from('channels').update(up).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      closeModal(); await loadChannels(s.id); renderSidebar(); renderMain(); App.toast('Canal atualizado');
    };
  });
};

/* ---------- regras da chamada ---------- */
const _joinVoiceS = joinVoice;
joinVoice = async function(ch){
  if(ch && ch.server_id){
    const mod = isMod(ch.server_id);
    if(chNsfw(ch) && !isAdult(S.me)){
      if(!S.me.birthdate) ageModal(ok => ok ? joinVoice(ch) : App.toast('Esta chamada é só para maiores de 18 anos.', true));
      else App.toast('Esta chamada é só para maiores de 18 anos.', true);
      return;
    }
    if(ch.user_limit && !mod && !(Voice.channel && Voice.channel.id === ch.id) && voiceUsers(ch).length >= ch.user_limit){ App.toast(`A chamada está cheia (${ch.user_limit} pessoas).`, true); return; }
  }
  const r = await _joinVoiceS.apply(this, arguments);
  applyCallRules();
  return r;
};
function applyCallRules(){
  const ch = Voice.channel; if(!ch) return;
  const P = App.prefs;
  if(ch.ptt_only && !isMod(ch.server_id) && P.mode !== 'ptt'){ S._modeBefore = P.mode; P.mode = 'ptt'; Voice.applyMicState(); App.toast(`Neste canal é preciso segurar ${keyLabel(P.pttKey)} para falar.`); }
}
const _leaveVoiceS = leaveVoice;
leaveVoice = async function(){ if(S._modeBefore){ App.prefs.mode = S._modeBefore; S._modeBefore = null; } return _leaveVoiceS.apply(this, arguments); };
const _startScreen = Voice.startScreen.bind(Voice), _startCamera = Voice.startCamera.bind(Voice);
Voice.startScreen = async function(){
  const ch = this.channel;
  if(ch && ch.no_screen && ch.server_id && !isMod(ch.server_id)){ App.toast('Compartilhar a tela está bloqueado neste canal.', true); return; }
  const r = await _startScreen(...arguments);
  return r;
};
Voice.startCamera = async function(){
  const ch = this.channel;
  if(ch && ch.no_camera && ch.server_id && !isMod(ch.server_id)){ App.toast('A câmera está bloqueada neste canal.', true); return; }
  const r = await _startCamera(...arguments);
  return r;
};
/* qualidade de vídeo do canal */
const _clampS = clampScreen;
clampScreen = function(st){
  const r = _clampS(st), q = Voice.channel && Voice.channel.video_quality;
  if(q === '720p' && r.h > 720) return { ...r, w: 1280, h: 720, bitrate: Math.min(r.bitrate, 3500000) };
  if(q === '1080p' && r.h > 1080) return { ...r, w: 1920, h: 1080, bitrate: Math.min(r.bitrate, 8000000) };
  return r;
};


/* ---------- segurança da conta: verificação em duas etapas, sair de tudo ---------- */
async function secSecurity(box, back){
  box.innerHTML = `${back}<h2>Segurança</h2><div class="spin" style="margin:30px auto"></div>`;
  let factors = [];
  try{ const { data } = await App.sb.auth.mfa.listFactors(); factors = (data && data.totp || []).filter(f => f.status === 'verified'); }catch(e){}
  if(!SET || SET.sec !== 'security') return;
  const bd = S.me.birthdate;
  box.innerHTML = `${back}<h2>Segurança</h2>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('shield', 24)}</span><div class="t"><b>Verificação em duas etapas</b>
      <small>${factors.length ? 'Ativada. Ao entrar, além da senha, o Telão pede o código do seu app autenticador.' : 'Proteja sua conta: além da senha, pede um código de 6 números do Google Authenticator, Microsoft Authenticator ou Authy.'}</small></div>
      ${factors.length ? '<button class="btn sec sm" id="mfaOff">Desativar</button>' : '<button class="btn sm" id="mfaOn">Ativar</button>'}</div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('logout', 22)}</span><div class="t"><b>Sair de todos os aparelhos</b><small>Desconecta sua conta em todos os navegadores, celulares e no app do Windows. Use se emprestou o PC ou acha que alguém entrou.</small></div><button class="btn sec sm" id="outAll">Sair de tudo</button></div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('calendar', 22)}</span><div class="t"><b>Idade</b><small>${bd ? `Data de nascimento confirmada${isAdult(S.me) ? ' · pode entrar em canais +18' : ' · canais +18 ficam bloqueados'}. Não aparece para ninguém.` : 'Ainda não confirmada. Ela é pedida para entrar em canais com restrição de idade.'}</small></div>${bd ? '' : '<button class="btn sec sm" id="ageSet">Confirmar</button>'}</div></div>
    <div class="conncard"><div class="ch2"><span class="clogo">${ic('link', 22)}</span><div class="t"><b>Aviso antes de abrir links</b><small>Mostra para qual site o link leva antes de sair do Telão, e alerta sobre links suspeitos.</small></div>${toggle('linkWarn', P.linkWarn !== false)}</div></div>
    <p class="mut small" style="margin-top:14px">Dicas: nunca passe seu código de 6 números para ninguém (nem para “admin do Telão”). O Telão nunca pede sua senha por mensagem.</p>`;
  const $b = q => box.querySelector(q);
  const on = $b('#mfaOn'); if(on) on.onclick = mfaEnroll;
  const off = $b('#mfaOff'); if(off) off.onclick = async () => {
    if(!(await confirmBox('Desativar verificação', 'Sua conta volta a pedir só a senha. Desativar mesmo?', 'Desativar'))) return;
    for(const f of factors){ const { error } = await App.sb.auth.mfa.unenroll({ factorId: f.id }); if(error){ App.toast(error.message, true); return; } }
    App.toast('Verificação em duas etapas desativada.'); renderSettings();
  };
  $b('#outAll').onclick = async () => { if(!(await confirmBox('Sair de tudo', 'Desconectar sua conta de todos os aparelhos, inclusive este?', 'Sair de tudo'))) return; await App.sb.auth.signOut({ scope: 'global' }); location.reload(); };
  const ag = $b('#ageSet'); if(ag) ag.onclick = () => ageModal(() => renderSettings());
  $b('#linkWarn').onchange = e => { P.linkWarn = e.target.checked; savePrefs(); };
}
async function mfaEnroll(){
  const { data, error } = await App.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Telão ' + new Date().toLocaleDateString('pt-BR') });
  if(error){ App.toast(/disabled|not enabled/i.test(error.message) ? 'A verificação em duas etapas está desligada no Supabase (Authentication → Multi-Factor). Peça para o admin ligar.' : error.message, true); return; }
  const qr = data.totp.qr_code, secret = data.totp.secret, fid = data.id;
  modal(`<form id="mfF"><div class="mh"><h2>Ativar verificação em duas etapas</h2><p>1. Abra seu app autenticador e leia o QR code. 2. Digite o código de 6 números que aparecer.</p></div>
    <div class="mc" style="text-align:center"><img src="${qr.startsWith('data:') ? qr : 'data:image/svg+xml;utf8,' + encodeURIComponent(qr)}" alt="QR code" style="width:190px;height:190px;background:#fff;border-radius:10px;padding:8px">
      <p class="mut small" style="margin:8px 0 14px">Não consegue ler? Digite a chave: <code data-noi18n>${esc(secret)}</code></p>
      <input class="inp code6" id="mfC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required><div class="err" id="mfE"></div></div>
    <div class="mf"><button type="button" class="btn sec" id="mfX">Cancelar</button><button class="btn">Ativar</button></div></form>`, m => {
    m.querySelector('#mfX').onclick = async () => { await App.sb.auth.mfa.unenroll({ factorId: fid }).catch(() => {}); closeModal(); };
    m.querySelector('#mfC').focus();
    m.querySelector('#mfF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.mfa.challengeAndVerify({ factorId: fid, code: m.querySelector('#mfC').value.trim() });
      if(error){ m.querySelector('#mfE').textContent = 'Código errado. Confira a hora do celular e tente de novo.'; return; }
      closeModal(); App.toast('Verificação em duas etapas ativada.'); renderSettings();
    };
  });
}
/* ao entrar: se a conta tem verificação, pede o código antes de abrir o Telão */
const _start = start;
start = async function(session){
  try{
    const { data } = await App.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'){
      const ok = await mfaPrompt();
      if(!ok){ await App.sb.auth.signOut(); location.reload(); return; }
    }
  }catch(e){}
  await _start.apply(this, arguments);
  const b = ls.get('telao-birth', null);
  if(b && S.me && !S.me.birthdate){ await saveBirthdate(b); }
  ls.set('telao-birth', null);
};
function mfaPrompt(){
  return new Promise(async res => {
    const { data } = await App.sb.auth.mfa.listFactors();
    const f = data && (data.totp || []).find(x => x.status === 'verified');
    if(!f) return res(true);
    const el = document.createElement('div'); el.className = 'confirmed';
    el.innerHTML = `<form class="cbox2" id="mpF"><div class="cicon">${ic('shield', 40)}</div><h1 style="font-family:var(--hf);text-shadow:none;color:var(--txt)">Código de verificação</h1>
      <p>Abra seu app autenticador e digite o código de 6 números do Telão.</p>
      <input class="inp code6" id="mpC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
      <div class="err" id="mpE" style="margin:8px 0"></div><button class="btn" style="width:100%">Entrar</button><button type="button" class="btn sec" id="mpX" style="width:100%;margin-top:8px">Sair</button></form>`;
    document.body.appendChild(el); el.querySelector('#mpC').focus();
    el.querySelector('#mpX').onclick = () => { el.remove(); res(false); };
    el.querySelector('#mpF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: el.querySelector('#mpC').value.trim() });
      if(error){ el.querySelector('#mpE').textContent = 'Código errado. Tente de novo.'; return; }
      el.remove(); res(true);
    };
  });
}

/* ---------- aviso antes de abrir links de fora ---------- */
const trusted = new Set(ls.get('telao-trusted', ['youtube.com','youtu.be','spotify.com','open.spotify.com','twitch.tv','github.com','google.com','instagram.com','x.com','twitter.com','tiktok.com','last.fm','steamcommunity.com','store.steampowered.com']));
function suspicious(u){
  const h = u.hostname;
  return /xn--/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || /(bit\.ly|tinyurl|cutt\.ly|is\.gd|t\.co|shorturl)/.test(h)
    || /(disc[o0]rd|nitro|steam|free|gift|premium).*(gift|free|nitro|claim|promo)|(gift|nitro)-?(free|claim)/i.test(h) || /@/.test(u.href.split('?')[0].replace(/^https?:\/\//, ''));
}
document.addEventListener('click', async e => {
  const a = e.target.closest('.ct a[href], .emb a[href], .bub a[href]'); if(!a || P.linkWarn === false) return;
  let u; try{ u = new URL(a.href, location.href); }catch(_){ return; }
  if(u.origin === location.origin || !/^https?:$/.test(u.protocol)) return;
  const host = u.hostname.replace(/^www\./, ''), sus = suspicious(u);
  if(!sus && [...trusted].some(t => host === t || host.endsWith('.' + t))) return;
  e.preventDefault(); e.stopPropagation();
  modal(`<div class="mh"><h2>${sus ? 'Cuidado com este link' : 'Saindo do Telão'}</h2><p>${sus ? 'Este link parece suspeito (pode ser golpe de “presente grátis”, link encurtado ou site disfarçado). Só abra se você confia em quem mandou.' : 'Este link leva para um site fora do Telão:'}</p></div>
    <div class="mc"><div class="linkbox ${sus ? 'sus' : ''}">${esc(u.href.length > 140 ? u.href.slice(0, 140) + '…' : u.href)}</div>
    ${sus ? '' : `<label class="rp" style="margin-top:12px"><input type="checkbox" id="lkT"> Confiar em <b>${esc(host)}</b> daqui pra frente</label>`}</div>
    <div class="mf"><button class="btn sec" data-close>Voltar</button><button class="btn ${sus ? 'red' : ''}" id="lkGo">Abrir mesmo assim</button></div>`, m => {
    m.querySelector('#lkGo').onclick = () => {
      const t = m.querySelector('#lkT'); if(t && t.checked){ trusted.add(host); ls.set('telao-trusted', [...trusted]); }
      closeModal(); window.open(u.href, '_blank', 'noopener');
    };
  });
}, true);

/* ---------- configurações do servidor: segurança ---------- */
async function secSrvSafety(box, back){
  const s = SET.server, admin = App.hasPerm(s.id, 2);
  box.innerHTML = `${back}<h2>Segurança do servidor</h2>
    ${row('Servidor +18', 'Todos os canais exigem ter 18 anos ou mais. Quem não tem idade vê um aviso ao entrar.', toggle('ssNs', s.nsfw, !admin))}
    <h3>Nível de verificação</h3><p class="mut small">Quem não cumprir o nível consegue ler, mas não consegue mandar mensagem.</p>
    <div class="vlevels">${[[0,'Nenhum','Qualquer membro pode falar.'],[1,'Baixo','A conta precisa existir há mais de 5 minutos.'],[2,'Médio','Também precisa estar no servidor há mais de 10 minutos.'],[3,'Alto','Também precisa ter a verificação em duas etapas ligada.']].map(([v, l, d]) => `<button class="vl ${(s.verify_level || 0) === v ? 'on' : ''}" data-vl="${v}" ${admin ? '' : 'disabled'}><b>${l}</b><small>${d}</small></button>`).join('')}</div>`;
  const $b = q => box.querySelector(q);
  const upd = async v => { const { error } = await App.sb.from('servers').update(v).eq('id', s.id); if(error){ App.toast(error.message, true); return; } await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s; renderSettings(); renderSidebar(); };
  $b('#ssNs').onchange = e => upd({ nsfw: e.target.checked });
  box.querySelectorAll('[data-vl]').forEach(b => b.onclick = () => upd({ verify_level: +b.dataset.vl }));
}
