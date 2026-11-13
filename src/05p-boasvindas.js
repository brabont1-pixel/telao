/* =====================================================================
   v6.9: CONTA OFICIAL DO TELÃO + DM DE BOAS-VINDAS
   A mensagem é criada pelo banco quando a conta nasce (trigger welcome_new_profile).
   ===================================================================== */
const TELAO_BOT = '7e1a0000-0000-4000-a000-000000000001';
const isBot = uid => uid === TELAO_BOT;
const officialBadge = (sm) => `<span class="offbadge ${sm ? 'sm' : ''}" data-tip="Conta oficial do Telão">${ic('check', sm ? 10 : 11)} OFICIAL</span>`;
App.isTelaoBot = isBot;

const _nameHtmlB = nameHtml;
nameHtml = function(p){ return _nameHtmlB.apply(this, arguments) + (p && isBot(p.id) ? officialBadge(true) : ''); };

function welcomeCardHtml(a){
  const nm = esc((S.me && S.me.display_name) || a.name || '');
  const desk = !window.telaoDesktop && S.cfg && S.cfg.desktop_url;
  const steps = [
    ['friends', 'userPlus', 'Chame seus amigos', 'Adicione pelo nome de usuário e já dá para conversar, ligar e transmitir a tela com som.'],
    ['explore', 'globe', 'Encontre (ou crie) um servidor', 'Veja as comunidades abertas ou crie o servidor da sua galera no botão +.'],
    ['profile', 'palette', 'Deixe o perfil com a sua cara', 'Foto, cor, banner, status e o que você está ouvindo no Spotify.'],
  ];
  if(desk) steps.push(['app', 'download', 'Baixe o Telão para Windows', 'Abre sozinho com o computador e fica mais leve enquanto você joga.']);
  const keys = [['Ctrl', 'K', 'achar qualquer coisa'], ['Alt', 'C', 'clipe dos últimos 30 s'], ['Ctrl', 'Shift', 'G', 'modo jogo']];
  return `<div class="wcard">
    <div class="wtop"><div class="wglow"></div><img class="wlogo" src="/icons/simbolo.svg" alt="">
      <div class="wtx"><span class="weye">BEM-VINDO AO TELÃO</span><h3>Que bom que você chegou, ${nm}! 🎉</h3>
      <p>Aqui é o lugar da sua galera: chamada de voz e vídeo, tela compartilhada com som, chat, servidores e jogos dentro da call.</p></div></div>
    <div class="wsteps">${steps.map(([k, i, t, d], n) => `<button class="wstep" data-wact="${k}"><span class="wn">${n + 1}</span><span class="wi">${ic(i, 18)}</span><span class="wt"><b>${t}</b><small>${d}</small></span><span class="wgo">${ic('chevRight', 16)}</span></button>`).join('')}</div>
    <div class="wkeys"><span class="wkl">${ic('keyboard', 14)} Atalhos que valem ouro</span>${keys.map(k => `<span class="wk">${k.slice(0, -1).map(x => `<kbd>${x}</kbd>`).join('+')}<small>${k[k.length - 1]}</small></span>`).join('')}</div>
    <div class="wfoot">Esta é a conta oficial do Telão. Ela não responde mensagens, mas é por aqui que chegam as novidades importantes.</div>
  </div>`;
}
App.welcomeCardHtml = welcomeCardHtml;

document.addEventListener('click', e => {
  const b = e.target.closest('[data-wact]'); if(!b) return;
  const k = b.dataset.wact;
  if(k === 'friends'){ S.friendTab = 'add'; go({ kind: 'home', dm: null }); }
  else if(k === 'explore') App.openExplore && App.openExplore();
  else if(k === 'profile') openSettings('user', 'profile');
  else if(k === 'app' && S.cfg && S.cfg.desktop_url) window.open('/baixar', '_blank', 'noopener');
});

/* na conversa com a conta oficial: sem caixa de mensagem e sem ligar */
const _mountMessagesB = mountMessages;
mountMessages = async function(ch, container, welcome){
  if(ch && ch.kind === 'dm' && isBot(dmOther(ch))){
    const p = prof(TELAO_BOT);
    arguments[2] = `<div class="welcome">${avatar(p, 'xl')}<h1>Telão ${officialBadge()}</h1><p>Canal oficial do Telão: as boas-vindas, novidades e avisos importantes chegam por aqui.</p></div>`;
  }
  const r = await _mountMessagesB.apply(this, arguments);
  if(ch && ch.kind === 'dm' && isBot(dmOther(ch))){
    const c = document.querySelector('.composer');
    if(c) c.innerHTML = `<div class="botnote">${ic('info', 16)} Esta é a conta oficial do Telão. Ela não responde mensagens.</div>`;
  }
  return r;
};
const _renderSidebarB = renderSidebar;
renderSidebar = function(){
  const r = _renderSidebarB.apply(this, arguments);
  document.querySelectorAll('.dmitem[data-dm]').forEach(el => {
    const d = S.dms.find(x => x.id === el.dataset.dm);
    if(d && isBot(dmOther(d)) && !el.querySelector('.offbadge')){ el.classList.add('botdm'); const n = el.querySelector('.nm, b, .dmt span'); (n || el).insertAdjacentHTML('beforeend', officialBadge(true)); }
  });
  return r;
};
const _renderMainB = renderMain;
renderMain = function(){
  const r = _renderMainB.apply(this, arguments);
  const d = S.route.kind === 'home' && S.route.dm && S.dms.find(x => x.id === S.route.dm);
  if(d && isBot(dmOther(d))){
    ['#dmCall', '#dmVideo', '#dmGroup'].forEach(q => { const b = document.querySelector(q); if(b) b.remove(); });
    const t = document.querySelector('#mainHead .htitle b, #mainHead .htitle'); if(t && !document.querySelector('#mainHead .offbadge')) t.insertAdjacentHTML('beforeend', officialBadge());
    document.querySelector('#mainHead')?.classList.add('botdm');
  }
  return r;
};

/* aviso do dono do Telão, mandado pela conta oficial para todo mundo */
function announceCardHtml(a){
  return `<div class="wcard acard">
    <div class="wtop"><div class="wglow"></div><img class="wlogo" src="/icons/simbolo.svg" alt="">
      <div class="wtx"><span class="weye">${ic('bell', 11)} AVISO DO TELÃO</span><h3>${esc(a.title || '')}</h3></div></div>
    ${a.body ? `<div class="abody">${richText(a.body)}</div>` : ''}
    ${a.link ? `<div class="alink"><a class="btn sm" href="${esc(a.link)}" target="_blank" rel="noopener">Saiba mais ${ic('chevRight', 14)}</a></div>` : ''}
  </div>`;
}
App.announceCardHtml = announceCardHtml;
