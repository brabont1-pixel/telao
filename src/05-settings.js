/* =====================================================================
   PREFERÊNCIAS, INSÍGNIAS, PERFIL, TELÃO+ E PAINÉIS DE CONFIGURAÇÕES
   ===================================================================== */
const PRICE_TXT = 'R$ 9,90';
const PDEF = { accent:'#ff2e9a', theme:'dark', fontSize:15, compact:false, inputId:'', outputId:'', echo:true, noise:true, agc:true,
  mode:'vad', sensitivity:4, pttKey:'Backquote', muteKey:'ctrl+shift+KeyM', deafKey:'ctrl+shift+KeyD', screenKey:'', clipKey:'alt+KeyC', clipOn:true,
  notifDM:true, notifMention:true, notifCall:true, soundMsg:true, soundVoice:true, soundPtt:true };
const P = App.prefs = Object.assign({}, PDEF, ls.get('telao-prefs', {}));
if(!P.accent || P.accent.toLowerCase() === '#ff6b4a') P.accent = '#ff2e9a';
function savePrefs(){ ls.set('telao-prefs', P); applyPrefs(); }
function applyPrefs(){
  document.body.classList.remove('theme-dark','theme-amoled','theme-light');
  document.body.classList.add('theme-' + P.theme);
  document.body.classList.toggle('compact', !!P.compact);
  document.documentElement.style.setProperty('--fs', P.fontSize + 'px');
  const a = S._srvAcc || P.accent || '#ff2e9a', rs = document.documentElement.style;
  const [r,g,b] = [1,3,5].map(i => parseInt(a.slice(i, i+2), 16));
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  rs.setProperty('--acc', a);
  rs.setProperty('--acc2', `rgb(${Math.min(255, r+40)},${Math.min(255, g+40)},${Math.min(255, b+40)})`);
  rs.setProperty('--accs', `rgba(${r},${g},${b},.18)`);
  rs.setProperty('--acct', lum > 0.62 ? '#111' : '#fff');
  const tc = document.querySelector('meta[name=theme-color]'); if(tc) tc.content = P.theme === 'light' ? '#e3e5e8' : P.theme === 'amoled' ? '#000000' : '#0d0e12';
}
applyPrefs();

/* ---------- Telão+ ---------- */
const hasPlus = p => !!p && (p.is_admin || (p.plan_until && new Date(p.plan_until) > new Date()));
function plusTier(p){
  if(!p) return 'bronze';
  if(p.is_admin) return 'diamante';
  const m = p.plus_months || 1;
  return m >= 12 ? 'diamante' : m >= 6 ? 'ouro' : m >= 3 ? 'prata' : 'bronze';
}
const TIERS = { bronze:['#cd7f32','#f0b27a','Bronze (1 mês)'], prata:['#9aa4b1','#e8edf3','Prata (3 meses)'], ouro:['#d9a400','#ffe27a','Ouro (6 meses)'], diamante:['#33b8ff','#b8f0ff','Diamante (1 ano)'] };
function clampScreen(st){
  if(hasPlus(S.me)) return st;
  const r = { ...st };
  if(r.h > 1080 || (r.h === 1080 && r.fps > 30)){ r.w = 1920; r.h = 1080; r.fps = 30; }
  if(r.bitrate > 8000000) r.bitrate = 8000000;
  return r;
}

/* ---------- insígnias (desenhos originais) ---------- */
const BADGES = [
  { id:'fundador', nome:'Fundador do Telão', desc:'Criou o Telão' },
  { id:'staff', nome:'Equipe Telão', desc:'Faz parte da equipe' },
  { id:'plus', nome:'Assinante Telão+', desc:'' },
  { id:'mod', nome:'Moderador certificado', desc:'Ajuda a manter a paz' },
  { id:'dev', nome:'Desenvolvedor ativo', desc:'Cria coisas para o Telão' },
  { id:'bug2', nome:'Caçador de bugs ouro', desc:'Achou bugs graves' },
  { id:'bug1', nome:'Caçador de bugs', desc:'Ajudou a achar bugs' },
  { id:'evento', nome:'Participante de evento', desc:'Esteve num evento do Telão' },
  { id:'apoiador', nome:'Apoiador inicial', desc:'Apoiou o Telão no começo' },
  { id:'pioneiro', nome:'Membro pioneiro', desc:'Entrou no Telão em 2026' },
  { id:'chama', nome:'Casa Chama', desc:'Coragem acima de tudo' },
  { id:'raio', nome:'Casa Raio', desc:'Rápido e brilhante' },
  { id:'onda', nome:'Casa Onda', desc:'Calma e equilíbrio' },
];
const GRANTABLE = ['staff','mod','dev','bug2','bug1','evento','apoiador'];
function badgeSvg(id, tier){
  const t = TIERS[tier || 'bronze'];
  const S2 = (body, bg) => `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="6" fill="${bg}"/>${body}</svg>`;
  switch(id){
    case 'fundador': return S2('<path d="M5 16l1.5-8 3.5 3.5L12 6l2 5.5L17.5 8 19 16z" fill="#ffd54a" stroke="#b8860b" stroke-width=".8"/><rect x="5" y="16.5" width="14" height="2.2" rx="1" fill="#ffd54a"/>', '#3a2a00');
    case 'staff': return S2('<path d="M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" fill="#7c6cff"/><path d="M12 8.2l1.2 2.5 2.7.3-2 1.9.5 2.7L12 14.3l-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill="#fff"/>', '#211a5c');
    case 'plus': return `<svg viewBox="0 0 24 24"><defs><linearGradient id="pg${tier}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t[1]}"/><stop offset="1" stop-color="${t[0]}"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="#2b1650"/><path d="M12 3.8l6.5 6.2L12 20.2 5.5 10z" fill="url(#pg${tier})"/><path d="M5.5 10h13M12 3.8L9.4 10 12 20.2 14.6 10z" stroke="#fff" stroke-opacity=".55" stroke-width=".8" fill="none"/></svg>`;
    case 'mod': return S2('<path d="M12 4l7 3v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" fill="#ff8a3d"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', '#4a2200');
    case 'dev': return S2('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke="#5ec8ff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.2 6.5l-2.4 11" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>', '#0d2c44');
    case 'bug1': case 'bug2': { const c = id === 'bug2' ? '#ffcc33' : '#4ade80';
      return S2(`<ellipse cx="12" cy="13.5" rx="4.2" ry="5.2" fill="${c}"/><circle cx="12" cy="7.6" r="2.4" fill="${c}"/><path d="M12 9v9.5M7.8 11.5H4.5M7.8 15H4.5M16.2 11.5h3.3M16.2 15h3.3M10.5 6l-1.6-1.8M13.5 6l1.6-1.8" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9v9.5" stroke="#00000055" stroke-width="1.2"/>`, id === 'bug2' ? '#3d3000' : '#0b3a1e'); }
    case 'evento': return S2('<path d="M4.5 8.5h15v2.2a1.8 1.8 0 000 3.6v2.2h-15v-2.2a1.8 1.8 0 000-3.6z" fill="#ff5cc8"/><path d="M14.5 8.8v7.4" stroke="#fff" stroke-dasharray="1.4 1.2" stroke-width="1.2"/>', '#4a0d36');
    case 'apoiador': return S2('<path d="M12 19s-6.5-4-6.5-8.6A3.6 3.6 0 0112 8.3a3.6 3.6 0 016.5 2.1C18.5 15 12 19 12 19z" fill="#ff4d6d"/>', '#4a0d18');
    case 'pioneiro': return S2('<path d="M14.5 4.5c2.8.3 4.7 2.2 5 5l-6.3 6.3-5-5z" fill="#e8ecf5"/><circle cx="15.3" cy="8.7" r="1.4" fill="#3b82f6"/><path d="M8.2 10.8l-3 .6 2-3 3.3-.4M13.2 15.8l-.6 3 3-2 .4-3.3" fill="#93a4c3"/><path d="M8.6 15.4c-1.4.2-2.6 1.4-2.8 3.4 2-.2 3.2-1.4 3.4-2.8z" fill="#ff8a3d"/>', '#14233f');
    case 'chama': return S2('<path d="M12 3.8c.6 3-2.6 4.2-2.6 7.2 0 .9.4 1.6 1 2-.1-1.6 1-2.4 1.6-3.6 1.6 1.8 3.5 3.7 3.5 6.2a3.5 3.5 0 01-7 0c0-4.6 4.5-6.4 3.5-11.8z" fill="#ff5a3c"/><path d="M12 19.6a2 2 0 01-2-2c0-1.5 1.3-2.3 2-3.6.8 1.2 2 2.1 2 3.6a2 2 0 01-2 2z" fill="#ffd166"/>', '#3d0f08');
    case 'raio': return S2('<path d="M13.5 3.5L6.5 13h4.6l-1.6 7.5 7-9.6h-4.6z" fill="#ffd43b"/>', '#3a3000');
    case 'onda': return S2('<path d="M4 13.5c2.2 0 2.2-2.2 4.4-2.2s2.2 2.2 4.4 2.2 2.2-2.2 4.4-2.2c1.3 0 1.9.8 2.8 1.4M4 17.2c2.2 0 2.2-2.2 4.4-2.2s2.2 2.2 4.4 2.2 2.2-2.2 4.4-2.2c1.3 0 1.9.8 2.8 1.4" stroke="#4dabf7" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="7.5" r="2.3" fill="#a5d8ff"/>', '#0b2742');
  }
  return '';
}
function earnedBadges(p){
  if(!p) return [];
  const has = new Set(p.is_admin ? BADGES.map(b => b.id) : (p.badges || []));
  if(hasPlus(p)) has.add('plus');
  if(p.created_at && new Date(p.created_at) < new Date('2027-01-01')) has.add('pioneiro');
  if(p.house) has.add(p.house);
  return BADGES.filter(b => has.has(b.id));
}
/* insígnias que a pessoa escolheu mostrar (padrão: todas as conquistadas) */
function badgesOf(p){
  const all = earnedBadges(p);
  if(!p || !Array.isArray(p.shown_badges)) return all;
  return p.shown_badges.map(id => all.find(b => b.id === id)).filter(Boolean);
}
function badgeHtml(b, p, cls=''){
  const tier = b.id === 'plus' ? plusTier(p) : null;
  const desc = b.id === 'plus' ? (p.is_admin ? 'Vitalício' : 'Nível ' + TIERS[tier][2]) : b.desc;
  return `<span class="badge-i ${cls}" data-tip="${esc(b.nome)}" data-tipsub="${esc(desc)}">${badgeSvg(b.id, tier)}</span>`;
}
// tooltip das insígnias
document.addEventListener('mousedown', () => { const t = document.getElementById('tipEl'); if(t) t.remove(); });
document.addEventListener('mouseover', e => {
  const t = e.target.closest('[data-tip]');
  let tip = document.getElementById('tipEl');
  if(!t){ if(tip) tip.remove(); return; }
  if(!tip){ tip = document.createElement('div'); tip.id = 'tipEl'; tip.className = 'tip'; document.body.appendChild(tip); }
  tip.innerHTML = esc(t.dataset.tip) + (t.dataset.tipsub ? `<small>${esc(t.dataset.tipsub)}</small>` : '');
  const r = t.getBoundingClientRect(), w = tip.offsetWidth;
  if(t.dataset.tipside === 'r'){ tip.style.left = (r.right + 12) + 'px'; tip.style.top = (r.top + r.height/2 - tip.offsetHeight/2) + 'px'; return; }
  let top = r.top - tip.offsetHeight - 8; if(top < 4) top = r.bottom + 8;
  tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width/2 - w/2)) + 'px';
  tip.style.top = top + 'px';
});

/* ---------- cartão de perfil ---------- */
const LINKS = {
  instagram:['Instagram', u => 'https://instagram.com/' + u, '#e1306c'], tiktok:['TikTok', u => 'https://tiktok.com/@' + u, '#25f4ee'],
  youtube:['YouTube', u => 'https://youtube.com/@' + u, '#ff0000'], twitch:['Twitch', u => 'https://twitch.tv/' + u, '#9146ff'],
  x:['X', u => 'https://x.com/' + u, '#e7e9ea'], steam:['Steam', u => 'https://steamcommunity.com/id/' + u, '#66c0f4'],
  spotify:['Spotify', u => /^https?:/.test(u) ? u : 'https://open.spotify.com/user/' + u, '#1db954'], github:['GitHub', u => 'https://github.com/' + u, '#e6edf3'], lastfm:['Last.fm', u => 'https://www.last.fm/user/' + encodeURIComponent(u), '#d51007'],
  riot:['Riot ID', null, '#eb0029'], xbox:['Xbox', u => 'https://www.xbox.com/play/user/' + encodeURIComponent(u), '#107c10'], psn:['PlayStation', u => 'https://psnprofiles.com/' + encodeURIComponent(u), '#0070d1'],
  epic:['Epic Games', null, '#c9c9c9'], battlenet:['Battle.net', null, '#148eff'], site:['Site', u => /^https?:/.test(u) ? u : 'https://' + u, '#9aa0aa'],
};
const PROFILE_FX = [['', 'Nenhum'], ['estrelas','✨ Estrelas'], ['coracoes','💗 Corações'], ['neve','❄️ Neve'], ['fogo','🔥 Brasas'], ['confete','🎉 Confete'], ['aurora','🌌 Aurora']];
const RINGS = [['', 'Nenhum'], ['arco','🌈 Arco-íris'], ['ouro','🥇 Ouro'], ['neon','💜 Neon'], ['fogo','🔥 Fogo'], ['gelo','🧊 Gelo']];
const NAME_STYLES = [['', 'Normal'], ['fogo','Fogo'], ['oceano','Oceano'], ['neon','Neon'], ['ouro','Ouro'], ['arco','Arco-íris']];
function nameHtml(p){
  const st = hasPlus(p) && p.name_style ? ` class="nst nst-${esc(p.name_style)}"` : '';
  return `<span${st}>${esc(p.display_name)}</span>`;
}
function fxLayerHtml(fx){
  if(!fx) return '';
  const glyph = { estrelas:'✦', coracoes:'♥', neve:'❄', fogo:'•', confete:'■' }[fx];
  if(fx === 'aurora') return '<div class="pfx aurora"></div>';
  return `<div class="pfx ${esc(fx)}">${Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(3 + (i % 5) * 0.7).toFixed(1)}s;--dl:-${(i * 0.53).toFixed(2)}s;--s:${0.7 + (i % 4) * 0.25}">${glyph}</i>`).join('')}</div>`;
}
function profileCard(p, extra=''){
  const plus = hasPlus(p);
  const themed = plus && p.theme_a;
  const banner = plus && p.banner_url ? `background-image:url('${esc(p.banner_url)}')` : `background:${esc(p.banner_color || p.avatar_color || '#ff2e9a')}`;
  const style = themed ? `background:linear-gradient(180deg,${esc(p.theme_a)},${esc(p.theme_b || p.theme_a)});--pc-bg:${esc(p.theme_a)}` : '';
  const bs = badgesOf(p);
  const links = (Array.isArray(p.links) ? p.links : []).filter(l => LINKS[l.t] && l.u);
  return `<div class="pcard2 ${themed?'themed':''}" style="${style}">
    ${plus ? fxLayerHtml(p.profile_fx) : ''}
    <div class="bn" style="${banner}"></div>
    <div class="avwrap">${avatar(p,'',true)}</div>
    <div class="bdg">${bs.length ? `<div class="badges">${bs.map(b => badgeHtml(b, p)).join('')}</div>` : ''}</div>
    <div class="inner">
      <b class="dn">${nameHtml(p)}${plus ? '<span class="plustag">TELÃO+</span>' : ''}</b>
      <div class="un">@${esc(p.username)}${p.pronouns ? ` · ${esc(p.pronouns)}` : ''}</div>
      ${p.custom_status ? `<div class="cst">${p.custom_emoji ? esc(p.custom_emoji) + ' ' : ''}${esc(p.custom_status)}</div>` : ''}
      ${p.bio ? `<h6>Sobre mim</h6><p>${esc(p.bio)}</p>` : ''}
      ${links.length ? `<div class="plinks">${links.map(l => LINKS[l.t][1] ? `<a href="${esc(LINKS[l.t][1](l.u))}" target="_blank" rel="noopener" style="--lc:${LINKS[l.t][2]}"><i></i>${esc(LINKS[l.t][0])}</a>` : `<a data-copytxt="${esc(l.u)}" style="--lc:${LINKS[l.t][2]}" title="Copiar"><i></i>${esc(LINKS[l.t][0])}: ${esc(l.u)}</a>`).join('')}</div>` : ''}
      ${p.created_at ? `<h6>Membro desde</h6><p>${new Date(p.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}</p>` : ''}
      ${extra}
    </div></div>`;
}
/* cor média de uma imagem (para o fundo do avatar combinar com a foto) */
async function avgColor(file){
  try{
    const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0; for(let i = 0; i < d.length; i += 4){ r += d[i]; g += d[i+1]; b += d[i+2]; }
    const n = d.length / 4, h = v => Math.round(v / n * 0.8).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }catch(e){ return null; }
}

/* ---------- atalhos de teclado ---------- */
const KEYNAMES = { Backquote:'`', Space:'Espaço', Escape:'Esc', Enter:'Enter', Tab:'Tab', CapsLock:'Caps Lock', Backslash:'\\', Slash:'/', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']', Semicolon:'Ç', Quote:"'", Comma:',', Period:'.', IntlBackslash:'\\' };
function keyLabel(code){
  if(!code) return '';
  return code.split('+').map(k => ({ctrl:'Ctrl',shift:'Shift',alt:'Alt',meta:'⌘'}[k] || KEYNAMES[k] || k.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ').replace(/^Arrow/,'Seta '))).map(k => `<kbd>${esc(k)}</kbd>`).join(' + ');
}
const comboOf = e => [e.ctrlKey&&'ctrl', e.altKey&&'alt', e.shiftKey&&'shift', e.metaKey&&'meta'].filter(Boolean).concat(e.code).join('+');
let recordingKey = null;
window.addEventListener('keydown', e => {
  if(recordingKey){
    if(['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    const r = recordingKey; recordingKey = null;
    if(e.code === 'Escape'){ r.done(null); return; }
    r.done(r.single ? e.code : comboOf(e));
    return;
  }
  if(e.key === 'Escape'){
    if(!$('#modal').classList.contains('hidden')) return;
    if(SET){ closeSettings(); return; }
  }
  if(!S.me) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const combo = comboOf(e), hasMod = e.ctrlKey || e.altKey || e.metaKey;
  if(P.muteKey && combo === P.muteKey && (!typing || hasMod)){ e.preventDefault(); Voice.toggleMute(); ls.set('telao-muted', Voice.muted); renderUserPanel(); renderStage(); return; }
  if(P.deafKey && combo === P.deafKey && (!typing || hasMod)){ e.preventDefault(); Voice.toggleDeafen(); renderUserPanel(); renderStage(); return; }
  if(P.clipKey && combo === P.clipKey && (!typing || hasMod)){ e.preventDefault(); App.takeClip && App.takeClip(); return; }
  if(P.screenKey && combo === P.screenKey && (!typing || hasMod) && Voice.channel){ e.preventDefault(); Voice.screenStream ? Voice.stopScreen() : Voice.startScreen(); return; }
  if(P.mode === 'ptt' && !typing && e.code === P.pttKey && !e.repeat){ e.preventDefault(); Voice.setPtt(true); }
}, true);
window.addEventListener('keyup', e => { if(P.mode === 'ptt' && e.code === P.pttKey) Voice.setPtt(false); });
window.addEventListener('blur', () => Voice.setPtt(false));

/* ---------- moldura do painel ---------- */
let SET = null;
function openSettings(kind, sec, server){
  closeMenu(); closeModal();
  if(SET) closeSettings();
  const el = document.createElement('div'); el.className = 'settings'; document.body.appendChild(el);
  SET = { kind, sec: sec || (kind === 'user' ? 'account' : 'overview'), server, el, cleanups: [], mobileOpen: !!sec, direct: !!sec };
  renderSettings();
  App.onSettingsOpen && App.onSettingsOpen();
}
function closeSettings(){
  if(!SET) return;
  if(SET.dirty && !confirm('Você tem alterações não salvas. Sair mesmo assim?')) return;
  SET.cleanups.forEach(f => { try{ f(); }catch(e){} });
  SET.el.remove(); SET = null; recordingKey = null;
  document.body.classList.remove('set-open', 'set-sec');
  App.onSettingsClose && App.onSettingsClose();
}
/* "voltar" nas configurações (celular): se abriu direto numa seção, fecha; se veio da lista, volta para a lista */
function settingsBack(){
  if(!SET) return;
  if(SET.mobileOpen && !SET.direct){ SET.mobileOpen = false; renderSettings(); }
  else closeSettings();
}
App.settingsBack = settingsBack;
function setSec(sec){
  if(SET.dirty && !confirm('Você tem alterações não salvas. Descartar?')) return;
  const wasList = !SET.mobileOpen;
  SET.dirty = false; SET.sec = sec; SET.mobileOpen = true; renderSettings();
  if(wasList) App.onSettingsSec && App.onSettingsSec();
}
function renderSettings(){
  if(!SET) return;
  SET.cleanups.forEach(f => { try{ f(); }catch(e){} }); SET.cleanups = [];
  const me = S.me, plus = hasPlus(me);
  let nav;
  if(SET.kind === 'user'){
    nav = [
      ['h','Configurações de usuário'], ['account','Minha conta'], ['security','Segurança'], ['privacy','Privacidade'], ['profile','Perfis'], ['connections','Conexões'],
      ['plus', `<span style="display:inline-flex;width:18px;height:18px">${badgeSvg('plus', plusTier(me))}</span> Telão+`],
      ['shop', 'Loja e presentes'], ['boosts', `<span style="display:inline-flex">${BOOST_SVG(18)}</span> Impulsos`],
      ['h','Configurações do app'], ['appearance','Aparência'], ['perf','Desempenho'], ['a11y','Acessibilidade'], ['lang','Idioma'], ['voice','Voz e vídeo'], ['notif','Notificações'], ['keys','Teclas de atalho'], ['app','App e instalação'],
    ];
    if(me.is_admin) nav.push(['h','Administração'], ['admin','Painel do admin']);
    nav.push(['hr'], ['logout','Sair', 'danger']);
  } else {
    const s = SET.server;
    nav = [['h', esc(s.name)]];
    if(App.hasPerm(s.id, 2)) nav.push(['overview','Visão geral']);
    if(App.hasPerm(s.id, 16)) nav.push(['roles','Cargos']);
    if(App.hasPerm(s.id, 1)) nav.push(['channels','Canais']);
    nav.push(['emojis','Emojis'], ['tag','Tag do servidor'], ['members','Membros'], ['stats','Estatísticas'], ['boost', `<span style="display:inline-flex">${BOOST_SVG(16)}</span> Impulsos`]);
    if(App.hasPerm(s.id, 2)) nav.push(['invites','Convites']);
    if(App.hasPerm(s.id, 128) || App.hasPerm(s.id, 4)) nav.push(['bans','Banimentos']);
    if(App.hasPerm(s.id, 2) || App.hasPerm(s.id, 64)) nav.push(['safety','Segurança']);
    if(App.hasPerm(s.id, 2)) nav.push(['community','Comunidade']);
    if(s.owner_id === S.me.id || App.hasPerm(s.id, 32)) nav.push(['backup','Backup']);
    if(s.owner_id === S.me.id) nav.push(['hr'], ['delete','Excluir servidor','danger']);
    if(!nav.find(n => n[0] === SET.sec)) SET.sec = (nav[1] || [])[0] || 'members';
  }
  SET.el.className = 'settings' + (SET.mobileOpen ? ' sec-open' : '');
  document.body.classList.add('set-open'); document.body.classList.toggle('set-sec', !!SET.mobileOpen);
  SET.el.innerHTML = `<nav class="snav"><div class="smhead"><button class="ibtn" id="sMX" aria-label="Fechar">${ic('x', 20)}</button><b>${SET.kind === 'user' ? 'Configurações' : esc(SET.server.name)}</b></div><div class="in">${nav.map(n =>
      n[0] === 'h' ? `<h5>${n[1]}</h5>` : n[0] === 'hr' ? '<hr>' :
      `<button class="si ${SET.sec===n[0]?'on':''} ${n[2]||''}" data-sec="${n[0]}">${n[1]}</button>`).join('')}
      ${SET.kind==='user' ? '<hr><div class="ver">Telão · versão ' + APP_VERSION + '</div>' : ''}</div></nav>
    <div class="scontent"><div class="sclose"><button id="sClose" title="Fechar (Esc)">✕</button><span>ESC</span></div><div class="in" id="sIn"></div></div>`;
  SET.el.querySelector('#sClose').onclick = () => closeSettings();
  SET.el.querySelector('#sMX').onclick = () => closeSettings();
  SET.el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => {
    const sec = b.dataset.sec;
    if(sec === 'logout') return doLogout();
    if(sec === 'delete') return deleteServer(SET.server).then(ok => ok !== false && SET && closeSettings());
    setSec(sec);
  });
  const box = SET.el.querySelector('#sIn');
  const back = isMobile() ? `<button class="btn sec sm mobileback" id="sBack">← Voltar</button>` : '';
  const fn = SET.kind === 'user'
    ? { account: secAccount, profile: secProfile, plus: secPlus, shop: secShop, connections: secConnections, security: secSecurity, privacy: secPrivacy, boosts: secMyBoosts, appearance: secAppearance, perf: secPerf, a11y: secA11y, lang: secLang, voice: secVoice, notif: secNotif, keys: secKeys, app: secApp, admin: secAdmin }[SET.sec]
    : { overview: secSrvOverview, roles: secSrvRoles, channels: secSrvChannels, members: secSrvMembers, boost: secSrvBoost, bans: secSrvBans, safety: secSrvSafety, emojis: secSrvEmojis, tag: secSrvTag, community: secSrvCommunity, invites: secSrvInvites, stats: secSrvStats, backup: secSrvBackup }[SET.sec];
  if(fn) fn(box, back);
  // vale também para seções que se redesenham depois de carregar (Loja, Estatísticas…)
  box.addEventListener('click', e => { if(e.target.closest('#sBack')){ e.preventDefault(); settingsBack(); } });
}
const toggle = (id, on) => `<label class="sw"><input type="checkbox" id="${id}" ${on?'checked':''}><span></span></label>`;
const row = (title, desc, ctrl) => `<div class="srow"><div class="t"><b>${title}</b>${desc?`<small>${desc}</small>`:''}</div>${ctrl}</div>`;
async function doLogout(){
  if(!(await confirmBox('Sair', 'Tem certeza que quer sair da conta?', 'Sair'))) return;
  if(Voice.channel) await leaveVoice();
  await App.sb.auth.signOut();
}

/* ---------- Minha conta ---------- */
function secAccount(box, back){
  const p = S.me, u = S.authUser || {};
  const email = u.email || '';
  const masked = email.replace(/^(.)(.*)(@.*)$/, (m,a,b,c) => a + '*'.repeat(Math.min(b.length, 8)) + c);
  const provs = (u.app_metadata && u.app_metadata.providers) || [];
  box.innerHTML = `${back}<h2>Minha conta</h2>
    <div class="accard"><div class="banner" style="${hasPlus(p) && p.banner_url ? `background:url('${esc(p.banner_url)}') center/cover` : `background:${esc(p.banner_color || p.avatar_color)}`}"></div>
      <div class="top">${avatar(p,'',true)}<div class="nm"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div>
        <div class="badges" style="margin-bottom:12px">${badgesOf(p).map(b => badgeHtml(b,p)).join('')}</div>
        <button class="btn sm" id="aEdit" style="margin-bottom:12px">Editar perfil</button></div>
      <div class="body">
        <div class="kv"><div class="t"><small>Nome de exibição</small><span>${esc(p.display_name)}</span></div><button class="btn sec sm" data-go="profile">Editar</button></div>
        <div class="kv"><div class="t"><small>Nome de usuário</small><span>@${esc(p.username)}</span></div><button class="btn sec sm" id="aUser">Editar</button></div>
        <div class="kv"><div class="t"><small>E-mail</small><span id="aMail">${esc(masked)}</span> <a style="cursor:pointer;font-size:13px" id="aShow">Mostrar</a></div><button class="btn sec sm" id="aEmail">Editar</button></div>
        <div class="kv"><div class="t"><small>Entrar com</small><span>${provs.includes('google') ? 'Google' : ''}${provs.includes('google') && provs.includes('email') ? ' e ' : ''}${provs.includes('email') || !provs.length ? 'E-mail e senha' : ''}</span></div></div>
      </div></div>
    <hr class="sdiv"><h3>Senha</h3>
    ${row('Mudar senha', provs.includes('email') ? 'Recomendado trocar de vez em quando.' : 'Você entra com o Google. Crie uma senha para também entrar com e-mail.', `<button class="btn sm" id="aPass">${provs.includes('email') ? 'Mudar senha' : 'Criar senha'}</button>`)}
    <hr class="sdiv"><h3>Remoção de conta</h3>
    <div class="dangerbox"><div><b>Excluir conta</b><br><small>Apaga seu perfil, mensagens e servidores que você criou. Não tem volta.</small></div><button class="btn red sm" id="aDel">Excluir conta</button></div>`;
  box.querySelector('#aEdit').onclick = () => setSec('profile');
  box.querySelector('[data-go]').onclick = () => setSec('profile');
  box.querySelector('#aShow').onclick = e => { box.querySelector('#aMail').textContent = email; e.target.remove(); };
  box.querySelector('#aUser').onclick = () => modal(`<form id="uF"><div class="mh"><h2>Mudar nome de usuário</h2><p>Seus amigos usam ele para te adicionar.</p></div>
      <div class="mc"><label class="field"><span>Nome de usuário</span><input class="inp" id="uN" value="${esc(p.username)}" maxlength="24"></label><div class="err" id="uE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    m.querySelector('#uF').onsubmit = async e => {
      e.preventDefault();
      const { data, error } = await App.sb.rpc('set_username', { p_username: m.querySelector('#uN').value.replace(/^@/,'') });
      if(error){ m.querySelector('#uE').textContent = error.message; return; }
      S.me.username = data; S.profiles.set(S.me.id, S.me); closeModal(); renderSettings(); renderUserPanel(); App.toast('Nome de usuário alterado');
    };
  });
  box.querySelector('#aEmail').onclick = () => modal(`<form id="eF"><div class="mh"><h2>Mudar e-mail</h2><p>Vamos mandar um link de confirmação para o novo e-mail.</p></div>
      <div class="mc"><label class="field"><span>Novo e-mail</span><input class="inp" type="email" id="eN" required></label><div class="err" id="eE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Enviar confirmação</button></div></form>`, m => {
    m.querySelector('#eF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await App.sb.auth.updateUser({ email: m.querySelector('#eN').value.trim() }, { emailRedirectTo: location.origin + '/' });
      if(error){ m.querySelector('#eE').textContent = error.message; return; }
      closeModal(); App.toast('Confirme no seu novo e-mail para concluir a troca.');
    };
  });
  box.querySelector('#aPass').onclick = () => modal(`<form id="pF"><div class="mh"><h2>${provs.includes('email') ? 'Mudar senha' : 'Criar senha'}</h2></div>
      <div class="mc"><label class="field"><span>Nova senha</span><input class="inp" type="password" id="p1" minlength="6" required autocomplete="new-password"></label>
      <label class="field"><span>Confirme a nova senha</span><input class="inp" type="password" id="p2" minlength="6" required autocomplete="new-password"></label><div class="err" id="pE"></div></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`, m => {
    m.querySelector('#pF').onsubmit = async e => {
      e.preventDefault();
      const a = m.querySelector('#p1').value, b = m.querySelector('#p2').value;
      if(a !== b){ m.querySelector('#pE').textContent = 'As senhas não são iguais.'; return; }
      const { error } = await App.sb.auth.updateUser({ password: a });
      if(error){ m.querySelector('#pE').textContent = /reauth|recent/i.test(error.message) ? 'Por segurança, saia e entre de novo antes de trocar a senha.' : error.message; return; }
      closeModal(); App.toast('Senha salva');
    };
  });
  box.querySelector('#aDel').onclick = () => modal(`<form id="dF"><div class="mh"><h2>Excluir conta</h2><p>Isso apaga tudo e não tem volta. Digite <b>${esc(p.username)}</b> para confirmar.</p></div>
      <div class="mc"><input class="inp" id="dN" autocomplete="off"></div>
      <div class="mf"><button type="button" class="btn sec" data-close>Cancelar</button><button class="btn red">Excluir para sempre</button></div></form>`, m => {
    m.querySelector('#dF').onsubmit = async e => {
      e.preventDefault();
      if(m.querySelector('#dN').value.trim().toLowerCase() !== p.username){ App.toast('O nome não confere.', true); return; }
      if(Voice.channel) await leaveVoice();
      const { error } = await App.sb.rpc('delete_my_account');
      if(error){ App.toast(error.message, true); return; }
      await App.sb.auth.signOut();
    };
  });
}

/* ---------- Perfis ---------- */
function secProfile(box, back){
  const me = S.me, plus = hasPlus(me);
  const earned = earnedBadges(me);
  const D = { display_name: me.display_name, bio: me.bio || '', avatar_url: me.avatar_url || null, banner_url: me.banner_url || null,
              banner_color: me.banner_color || null, avatar_color: me.avatar_color, theme_a: me.theme_a || null, theme_b: me.theme_b || null,
              house: me.house || null, pronouns: me.pronouns || '', links: (Array.isArray(me.links) ? me.links : []).map(l => ({ ...l })),
              shown_badges: Array.isArray(me.shown_badges) ? [...me.shown_badges] : earned.map(b => b.id),
              profile_fx: me.profile_fx || null, avatar_ring: me.avatar_ring || null, name_style: me.name_style || null };
  const orig = JSON.stringify(D);
  const lockBox = what => `<div class="locked">${ic('lock',18)} ${what} <button class="btn sm" data-plus>Conhecer o Telão+</button></div>`;
  const chipRow = (id, list, cur) => `<div class="chips" id="${id}">${list.map(([v,l]) => `<button type="button" class="chip ${(cur||'')===v?'on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  box.innerHTML = `${back}<h2>Perfil</h2><div class="profgrid"><div>
    <div class="ptabs"><button class="on" data-pt="basico">Básico</button><button data-pt="visual">Visual</button><button data-pt="insignias">Insígnias</button><button data-pt="links">Links</button></div>

    <div data-pane="basico">
      <label class="field"><span>Nome de exibição</span><input class="inp" id="pfN" maxlength="32"></label>
      <label class="field"><span>Pronomes</span><input class="inp" id="pfPr" maxlength="30" placeholder="ex: ele/dele, ela/dela"></label>
      <label class="field"><span>Sobre mim</span><textarea class="inp" id="pfBio" maxlength="190" placeholder="Conte um pouco sobre você"></textarea><div class="counter" id="pfCnt"></div></label>
      <h3>Casa (insígnia grátis)</h3>
      <div class="chips" id="pfH">${[['', 'Nenhuma'], ['chama','Chama'], ['raio','Raio'], ['onda','Onda']].map(([v,l]) => `<button class="chip" data-h="${v}">${v ? `<span class="badge-i sm" style="margin:0">${badgeSvg(v)}</span>` : ''}${l}</button>`).join('')}</div>
    </div>

    <div data-pane="visual" class="hidden">
      <h3 style="margin-top:0">Avatar</h3>
      <div class="avedit"><div id="pfAvPrev"></div><div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfAv">${ic('image',16)} Enviar foto</button><button class="btn sec sm" id="pfAvRm">Remover foto</button></div>
        <small class="mut" style="display:block;margin-top:6px">PNG, JPG ou WEBP até ${plus?'8':'2'} MB. ${plus ? '<b style="color:#ffb39c">GIF animado liberado ✨</b>' : 'GIF animado é do <a data-plus style="cursor:pointer">Telão+</a>.'}</small>
      </div></div>
      <div id="pfAcBox"><h3>Cor do avatar <small class="mut" style="text-transform:none;font-weight:500">(só aparece quando não tem foto)</small></h3><div class="colors" id="pfAc">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
      <hr class="sdiv">
      <h3>Banner</h3>
      ${plus ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="pfBn">${ic('image',16)} Imagem ou GIF</button><button class="btn sec sm" id="pfBnRm">Remover</button></div>` : lockBox('Banner com imagem ou GIF é do Telão+.')}
      <h3>Cor do banner</h3><div class="colorrow"><input type="color" id="pfBc"><button class="btn sec sm" id="pfBcAuto">Automática</button></div>
      <hr class="sdiv">
      <h3>Tema do cartão ${plus?'':ic('lock',14)}</h3>
      ${plus ? `<div class="colorrow"><label>Principal <input type="color" id="pfTa"></label><label>Destaque <input type="color" id="pfTb"></label><button class="btn sec sm" id="pfTrm">Sem tema</button></div>` : lockBox('Cores no cartão de perfil são do Telão+.')}
      <h3>Efeito no perfil ${plus?'':ic('lock',14)}</h3>${plus ? chipRow('pfFx', PROFILE_FX, D.profile_fx) : lockBox('Partículas animadas no seu cartão.')}
      <h3>Anel do avatar ${plus?'':ic('lock',14)}</h3>${plus ? chipRow('pfRing', RINGS, D.avatar_ring) : lockBox('Um anel animado em volta do seu avatar.')}
      <h3>Estilo do nome ${plus?'':ic('lock',14)}</h3>${plus ? `<div class="chips" id="pfNs">${NAME_STYLES.map(([v,l]) => `<button type="button" class="chip ${(D.name_style||'')===v?'on':''}" data-v="${v}"><span class="${v?'nst nst-'+v:''}">${l}</span></button>`).join('')}</div>` : lockBox('Nome com gradiente colorido no chat.')}
    </div>

    <div data-pane="insignias" class="hidden">
      <p class="mut small" style="margin-bottom:12px">Escolha quais das suas insígnias aparecem no seu perfil. Você conquistou <b>${earned.length}</b>.</p>
      <div class="bpick" id="pfBp">${earned.map(b => `<label class="bpi"><input type="checkbox" data-b="${b.id}"><span class="badge-i">${badgeSvg(b.id, b.id==='plus'?plusTier(me):null)}</span><div><b>${esc(b.nome)}</b><small>${esc(b.id==='plus' ? (me.is_admin?'Vitalício':TIERS[plusTier(me)][2]) : b.desc)}</small></div></label>`).join('') || '<div class="empty">Você ainda não tem insígnias. Escolha uma Casa na aba Básico para ganhar a primeira!</div>'}</div>
      ${earned.length ? '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn sec sm" id="pfBAll">Mostrar todas</button><button class="btn sec sm" id="pfBNone">Esconder todas</button></div>' : ''}
    </div>

    <div data-pane="links" class="hidden">
      <p class="mut small" style="margin-bottom:12px">Até 5 links que aparecem no seu cartão.</p>
      <div id="pfLinks"></div>
      <button class="btn sec sm" id="pfLAdd">${ic('plus',16)} Adicionar link</button>
    </div>

    <input type="file" id="pfFile" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
    <div id="pfSave"></div>
  </div><div><h3 style="margin-top:0">Prévia</h3><div class="pcard" id="pfPrev"></div></div></div>`;
  const $b = q => box.querySelector(q);
  box.querySelectorAll('[data-pt]').forEach(t => t.onclick = () => {
    box.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x === t));
    box.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.pt));
  });
  const draft = () => ({ ...me, ...D, banner_color: D.banner_color || null });
  const setDirty = () => {
    const changed = JSON.stringify(D) !== orig;
    SET.dirty = changed;
    $b('#pfSave').innerHTML = changed ? `<div class="savebar"><span>Você tem alterações não salvas</span><button class="btn sec sm" id="pfReset">Desfazer</button><button class="btn ok sm" id="pfOk">Salvar</button></div>` : '';
    if(changed){ $b('#pfReset').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#pfOk').onclick = save; }
  };
  const drawLinks = () => {
    $b('#pfLinks').innerHTML = D.links.map((l, i) => `<div class="lrow"><select class="inp" data-lt="${i}">${Object.entries(LINKS).map(([k, v]) => `<option value="${k}" ${l.t===k?'selected':''}>${v[0]}</option>`).join('')}</select>
      <input class="inp" data-lu="${i}" value="${esc(l.u||'')}" placeholder="${l.t==='site'?'seusite.com':'seu usuário'}" maxlength="100"><button class="ibtn" data-lx="${i}">${ic('trash',16)}</button></div>`).join('');
    $b('#pfLAdd').disabled = D.links.length >= 5;
    box.querySelectorAll('[data-lt]').forEach(x => x.onchange = () => { D.links[+x.dataset.lt].t = x.value; refresh(); });
    box.querySelectorAll('[data-lu]').forEach(x => x.oninput = () => { D.links[+x.dataset.lu].u = x.value.trim().replace(/^@/, ''); refresh(true); });
    box.querySelectorAll('[data-lx]').forEach(x => x.onclick = () => { D.links.splice(+x.dataset.lx, 1); drawLinks(); refresh(); });
  };
  const refresh = (noLinks) => {
    const d = draft();
    $b('#pfPrev').innerHTML = profileCard(d);
    $b('#pfAvPrev').innerHTML = avatar(d, 'xl');
    $b('#pfAcBox').classList.toggle('hidden', !!D.avatar_url);
    box.querySelectorAll('#pfAc [data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === D.avatar_color));
    box.querySelectorAll('#pfH [data-h]').forEach(x => x.classList.toggle('on', (x.dataset.h || null) === (D.house || null)));
    box.querySelectorAll('#pfBp [data-b]').forEach(x => x.checked = D.shown_badges.includes(x.dataset.b));
    $b('#pfCnt').textContent = (190 - D.bio.length) + ' restantes';
    setDirty();
  };
  $b('#pfN').value = D.display_name; $b('#pfBio').value = D.bio; $b('#pfPr').value = D.pronouns; $b('#pfBc').value = D.banner_color || D.avatar_color || '#ff2e9a';
  $b('#pfN').oninput = e => { D.display_name = e.target.value; refresh(); };
  $b('#pfBio').oninput = e => { D.bio = e.target.value; refresh(); };
  $b('#pfPr').oninput = e => { D.pronouns = e.target.value; refresh(); };
  $b('#pfBc').oninput = e => { D.banner_color = e.target.value; refresh(); };
  $b('#pfBcAuto').onclick = () => { D.banner_color = null; $b('#pfBc').value = D.avatar_color; refresh(); };
  box.querySelectorAll('#pfAc [data-c]').forEach(x => x.onclick = () => { D.avatar_color = x.dataset.c; refresh(); });
  box.querySelectorAll('#pfH [data-h]').forEach(x => x.onclick = () => {
    const old = D.house; D.house = x.dataset.h || null;
    D.shown_badges = D.shown_badges.filter(b => b !== old); if(D.house && !D.shown_badges.includes(D.house)) D.shown_badges.push(D.house);
    refresh();
  });
  box.querySelectorAll('#pfBp [data-b]').forEach(x => x.onchange = () => {
    const id = x.dataset.b;
    D.shown_badges = x.checked ? earned.map(b => b.id).filter(b => b === id || D.shown_badges.includes(b)) : D.shown_badges.filter(b => b !== id);
    refresh();
  });
  if($b('#pfBAll')){ $b('#pfBAll').onclick = () => { D.shown_badges = earned.map(b => b.id); refresh(); }; $b('#pfBNone').onclick = () => { D.shown_badges = []; refresh(); }; }
  $b('#pfLAdd').onclick = () => { if(D.links.length < 5){ D.links.push({ t:'instagram', u:'' }); drawLinks(); refresh(); } };
  box.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => setSec('plus'));
  if(plus){
    $b('#pfTa').value = D.theme_a || '#3b1d6e'; $b('#pfTb').value = D.theme_b || '#ff2e9a';
    $b('#pfTa').oninput = e => { D.theme_a = e.target.value; D.theme_b = D.theme_b || $b('#pfTb').value; refresh(); };
    $b('#pfTb').oninput = e => { D.theme_b = e.target.value; D.theme_a = D.theme_a || $b('#pfTa').value; refresh(); };
    $b('#pfTrm').onclick = () => { D.theme_a = D.theme_b = null; refresh(); };
    $b('#pfBnRm').onclick = () => { D.banner_url = null; refresh(); };
    [['#pfFx','profile_fx'],['#pfRing','avatar_ring'],['#pfNs','name_style']].forEach(([id, key]) => box.querySelectorAll(id + ' [data-v]').forEach(c => c.onclick = () => {
      D[key] = c.dataset.v || null; box.querySelectorAll(id + ' [data-v]').forEach(x => x.classList.toggle('on', x === c)); refresh();
    }));
  }
  let target = 'avatar';
  $b('#pfAv').onclick = () => { target = 'avatar'; $b('#pfFile').click(); };
  if(plus) $b('#pfBn').onclick = () => { target = 'banner'; $b('#pfFile').click(); };
  $b('#pfAvRm').onclick = () => { D.avatar_url = null; refresh(); };
  $b('#pfFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    const gif = f.type === 'image/gif';
    if(gif && !plus){ upsell('GIF animado no avatar'); return; }
    const max = (plus ? 8 : 2) * 1024 * 1024;
    if(f.size > max){ App.toast(`Arquivo muito grande (máx. ${plus?8:2} MB).${plus?'':' Com o Telão+ vai até 8 MB.'}`, true); return; }
    App.toast('Enviando…');
    let url;
    try{
      if(target === 'avatar') url = await uploadSquare(f, 'avatar', 256);
      else {
        let blob = f, type = f.type;
        if(!gif){ const c = await compressImage(f); blob = c.blob; type = c.type; }
        const path = `${me.id}/banner-${Date.now().toString(36)}.${type.split('/')[1].replace('jpeg','jpg')}`;
        const { error } = await App.sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000' });
        if(error) throw error;
        url = App.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
      }
    }catch(err){ App.toast('Não deu para enviar: ' + err.message, true); return; }
    if(target === 'avatar'){ D.avatar_url = url; const c = await avgColor(f); if(c) D.avatar_color = c; }
    else D.banner_url = url;
    App.toast('Pronto. Clique em “Salvar”.');
    refresh();
  };
  async function save(){
    const all = earned.map(b => b.id);
    const shown = D.shown_badges.length === all.length && all.every(b => D.shown_badges.includes(b)) ? null : D.shown_badges;
    const upd = { display_name: D.display_name.trim() || me.username, bio: D.bio.trim(), pronouns: D.pronouns.trim() || null,
                  avatar_url: D.avatar_url, banner_url: D.banner_url, banner_color: D.banner_color, avatar_color: D.avatar_color,
                  theme_a: D.theme_a, theme_b: D.theme_b, house: D.house, shown_badges: shown,
                  links: D.links.filter(l => l.u).slice(0, 5), profile_fx: D.profile_fx, avatar_ring: D.avatar_ring, name_style: D.name_style };
    const { data, error } = await App.sb.from('profiles').update(upd).eq('id', me.id).select().single();
    if(error){ App.toast(error.message, true); return; }
    S.me = data; S.profiles.set(data.id, data);
    SET.dirty = false; App.toast('Perfil salvo');
    renderSettings(); renderUserPanel(); renderMembers(); if(M.el) renderMsgList(false);
  }
  drawLinks(); refresh();
}
function upsell(what){
  modal(`<div class="mh"><h2>Isso é do Telão+</h2><p>${esc(what)} faz parte do <b>Telão+</b>, por ${PRICE_TXT}/mês.</p></div>
    <div class="mc" style="text-align:center"><div style="display:inline-flex;width:64px;height:64px">${badgeSvg('plus','diamante')}</div></div>
    <div class="mf"><button class="btn sec" data-close>Agora não</button><button class="btn" id="upGo">Conhecer o Telão+</button></div>`, m => {
    m.querySelector('#upGo').onclick = () => { closeModal(); if(SET) setSec('plus'); else openSettings('user','plus'); };
  });
}

/* ---------- Telão+ ---------- */
function secPlus(box, back){
  const me = S.me, plus = hasPlus(me), tier = plusTier(me);
  const until = me.plan_until ? new Date(me.plan_until).toLocaleDateString('pt-BR') : '';
  box.innerHTML = `${back}
    <div class="plushero">
      <h1><span style="display:inline-flex;width:44px;height:44px">${badgeSvg('plus', plus ? tier : 'diamante')}</span>Telão+</h1>
      <p>Turbine seu perfil e suas transmissões.</p>
      ${plus ? `<div class="status">✅ ${me.is_admin ? 'Vitalício — você é o admin 👑' : 'Ativo até ' + until} · Insígnia ${TIERS[tier][2].split(' ')[0]}</div><br>` : ''}
      <div class="price"><b>${PRICE_TXT}</b> / mês · Pix ou cartão</div>
      ${me.is_admin ? '' : CFG.PAYMENTS ? `<button class="btn" id="plBuy">${plus ? 'Renovar +30 dias' : 'Assinar o Telão+'}</button>`
        : `<button class="btn" disabled style="opacity:.75">Em breve</button><div style="margin-top:10px;font-size:14px;opacity:.95">O pagamento online ainda não está disponível. Quer o Telão+ agora? Fale com o admin do Telão para ativar pelo Pix.</div>`}
      <div id="plMsg" style="margin-top:12px;font-size:14px"></div>
    </div>
    <div class="perks">
      <div class="perk"><div class="e">🎞️</div><b>Avatar animado</b><small>Use GIF no seu avatar.</small></div>
      <div class="perk"><div class="e">🖼️</div><b>Banner personalizado</b><small>Imagem ou GIF no topo do seu perfil.</small></div>
      <div class="perk"><div class="e">🎨</div><b>Tema do perfil</b><small>Escolha as cores do seu cartão de perfil.</small></div>
      <div class="perk"><div class="e">💎</div><b>Insígnia que evolui</b><small>Bronze → Prata → Ouro → Diamante com o tempo de assinatura.</small></div>
      <div class="perk"><div class="e">📺</div><b>Tela em alta</b><small>Transmita em 1080p 60fps, 1440p e até 4K, com até 20 Mbps.</small></div>
      <div class="perk"><div class="e">📦</div><b>Uploads maiores</b><small>Imagens de até 8 MB (grátis: 2 MB).</small></div>
    </div>
    <h3>Compare</h3>
    <table class="cmp"><tr><th></th><th>Grátis</th><th>Telão+</th></tr>
      <tr><td>Chat, voz e amigos</td><td>✅</td><td>✅</td></tr>
      <tr><td>Compartilhar tela com som</td><td>Até 1080p 30fps</td><td>Até 4K · 1440p 60fps</td></tr>
      <tr><td>Avatar</td><td>Imagem</td><td>Imagem ou GIF</td></tr>
      <tr><td>Banner do perfil</td><td>Cor</td><td>Imagem ou GIF</td></tr>
      <tr><td>Tema do perfil</td><td>—</td><td>✅</td></tr>
      <tr><td>Insígnia Telão+</td><td>—</td><td>✅</td></tr>
      <tr><td>Tamanho de upload</td><td>2 MB</td><td>8 MB</td></tr></table>
    <h3>Seus pagamentos</h3><div id="plPays" style="color:var(--mut);font-size:14px">Carregando…</div>`;
  const buy = box.querySelector('#plBuy');
  if(buy) buy.onclick = async () => {
    buy.disabled = true; const msg = box.querySelector('#plMsg'); msg.textContent = 'Abrindo o pagamento…';
    try{
      const { data, error } = await App.sb.functions.invoke('telao-checkout', { body: {} });
      if(error || !data || !data.url){
        let m = (data && data.error) || '';
        try{ if(!m && error && error.context && error.context.json) m = (await error.context.json()).error; }catch(e){}
        msg.innerHTML = '⚠️ ' + esc(m || 'O pagamento automático ainda não foi ativado.') + '<br>Fale com o admin do Telão para ativar seu plano pelo Pix.';
        buy.disabled = false; return;
      }
      location.href = data.url;
    }catch(e){ msg.textContent = '⚠️ ' + e.message; buy.disabled = false; }
  };
  App.sb.from('payments').select('*').eq('user_id', me.id).order('created_at', { ascending:false }).limit(20).then(({ data }) => {
    const el = box.querySelector('#plPays'); if(!el) return;
    const rows = (data || []).filter(x => !String(x.id).endsWith(':liberado'));
    const st = { approved:'✅ Aprovado', pending:'⏳ Pendente', in_process:'⏳ Em análise', rejected:'❌ Recusado', cancelled:'❌ Cancelado', refunded:'↩️ Devolvido' };
    el.innerHTML = rows.length ? `<table class="paytable">${rows.map(x => `<tr><td>${new Date(x.created_at).toLocaleDateString('pt-BR')}</td><td>R$ ${Number(x.amount||0).toFixed(2).replace('.',',')}</td><td>${st[x.status] || esc(x.status)}</td></tr>`).join('')}</table>` : 'Nenhum pagamento ainda.';
  });
}

/* ---------- Aparência ---------- */
function secAppearance(box, back){
  box.innerHTML = `${back}<h2>Aparência</h2>
    <h3>Tema</h3>
    <div class="themes">${[['dark','Escuro','#313338'],['amoled','Preto (AMOLED)','#000'],['light','Claro','#fff']].map(([v,l,c]) => `<button data-t="${v}" class="${P.theme===v?'on':''}"><span class="sw2" style="background:${c}"></span>${l}</button>`).join('')}</div>
    <h3>Cor de destaque</h3>
    <div class="accents">${['#ff2e9a','#b6ff2e','#2ee6ff','#ff7a1a','#ffe02e','#8b5cf6','#ff4d4d','#2bd17e','#3b82f6','#e879f9','#f5f5f5','#8a8f98'].map(c => `<button data-acc="${c}" class="${(P.accent||'#ff2e9a')===c?'on':''}" style="background:${c}"></button>`).join('')}<input type="color" id="apAcc" value="${esc(P.accent||'#ff2e9a')}" title="Escolher outra cor"></div>
    <hr class="sdiv"><h3>Tamanho da fonte das conversas · <span id="apFs">${P.fontSize}px</span></h3>
    <input type="range" class="range" id="apR" min="12" max="20" step="1" value="${P.fontSize}">
    <hr class="sdiv">
    ${row('Modo compacto', 'Mostra mais mensagens na tela, com avatares menores.', toggle('apC', P.compact))}
    <h3>Prévia</h3>
    <div style="background:var(--bg2);border:1px solid var(--line);border-radius:8px;padding:6px 0">
      <div class="msg first">${avatar(S.me,'lg')}<div class="bd"><div class="hd"><b style="color:${esc(S.me.avatar_color)}">${esc(S.me.display_name)}</b><time>Hoje às 21:00</time></div><div class="ct">bora jogar? vou compartilhar a tela 🎮</div></div></div>
      <div class="msg"><div class="gap">21:00</div><div class="bd"><div class="ct">entra no canal Telão!</div></div></div>
    </div>`;
  box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { P.theme = b.dataset.t; savePrefs(); renderSettings(); });
  box.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { P.accent = b.dataset.acc; savePrefs(); renderSettings(); });
  box.querySelector('#apAcc').oninput = e => { P.accent = e.target.value; savePrefs(); };
  box.querySelector('#apR').oninput = e => { P.fontSize = +e.target.value; box.querySelector('#apFs').textContent = P.fontSize + 'px'; savePrefs(); };
  box.querySelector('#apC').onchange = e => { P.compact = e.target.checked; savePrefs(); };
}

/* ---------- Voz e vídeo ---------- */
function secVoice(box, back){
  const plus = hasPlus(S.me), st = Voice.screenSettings, q = `${st.w}x${st.h}x${st.fps}`;
  const resOpts = [['1280x720x30','720p · 30fps',0],['1920x1080x30','1080p · 30fps',0],['1920x1080x60','1080p · 60fps',1],['2560x1440x60','1440p · 60fps',1],['3840x2160x30','4K · 30fps',1]];
  const brOpts = [[2500000,'2,5 Mbps',0],[5000000,'5 Mbps',0],[8000000,'8 Mbps',0],[12000000,'12 Mbps',1],[20000000,'20 Mbps',1]];
  box.innerHTML = `${back}<h2>Voz e vídeo</h2>
    <h3>Configurações de voz</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <label class="field"><span>Dispositivo de entrada</span><select class="inp" id="vIn"><option value="">Padrão</option></select></label>
      <label class="field"><span>Dispositivo de saída</span><select class="inp" id="vOut"><option value="">Padrão</option></select></label>
    </div>
    <label class="field"><span>Câmera</span><select class="inp" id="vCam"><option value="">Padrão</option></select></label>
    <div id="vPerm"></div>
    <h3>Testar microfone</h3>
    <div style="display:flex;gap:12px;align-items:center"><button class="btn sm" id="vTest">Vamos verificar</button><div class="meter"><i id="vLvl"></i><span class="th" id="vTh"></span></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:14px;color:var(--txt2)">${toggle('vLoop', false)} Ouvir minha própria voz durante o teste (use fone!)</label>
    <hr class="sdiv"><h3>Modo de entrada</h3>
    <div class="chips"><button class="chip ${P.mode==='vad'?'on':''}" data-m="vad">🎙️ Detecção de voz</button><button class="chip ${P.mode==='ptt'?'on':''}" data-m="ptt">⌨️ Pressionar para falar</button></div>
    <div id="vPttInfo" style="margin-top:10px;font-size:14px;color:var(--txt2)">${P.mode==='ptt' ? `Segure <span class="keycap">${keyLabel(P.pttKey)}</span> para falar. <a style="cursor:pointer" data-go="keys">Trocar tecla</a>` : ''}</div>
    <h3>Sensibilidade do indicador de fala</h3>
    <input type="range" class="range" id="vSens" min="1" max="30" value="${P.sensitivity}">
    <small style="color:var(--mut)">A linha amarela no medidor é o limite: acima dela, seu avatar acende de verde.</small>
    <hr class="sdiv"><h3>Processamento de voz</h3>
    <div class="srow"><div class="t"><b>Supressão de ruído</b><small>Corta barulho de fundo: ventilador, teclado, rua, cachorro.</small></div></div>
    <div class="nzlv">${[['off','Desligada','Som cru do microfone.'],['padrao','Padrão','Filtro do navegador.'],['forte','Forte','Filtro do navegador + isolamento de voz + portão que fecha o microfone no silêncio. Recomendado.']].map(([v, l, d]) => `<button class="vl ${Voice.noiseLevel() === v ? 'on' : ''}" data-nz="${v}"><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    ${row('Modo música', 'Desliga todos os filtros e manda o som em estéreo, para tocar instrumento ou mostrar uma música com qualidade. Use fone.', toggle('vMusic', !!P.musicMode))}
    ${row('Cancelamento de eco', 'Evita que seus amigos ouçam o próprio eco.', toggle('vEcho', P.echo))}
    ${row('Controle automático de ganho', 'Ajusta o volume do seu microfone sozinho.', toggle('vAgc', P.agc))}
    <hr class="sdiv"><h3>Transmissão de tela ${plus ? '<span class="plustag">TELÃO+</span>' : ''}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <label class="field"><span>Resolução</span><select class="inp" id="vRes">${resOpts.map(([v,l,pl]) => `<option value="${v}" ${v===q?'selected':''} ${pl&&!plus?'disabled':''}>${l}${pl&&!plus?' 🔒':''}</option>`).join('')}</select></label>
      <label class="field"><span>Bitrate máximo</span><select class="inp" id="vBr">${brOpts.map(([v,l,pl]) => `<option value="${v}" ${v===st.bitrate?'selected':''} ${pl&&!plus?'disabled':''}>${l}${pl&&!plus?' 🔒':''}</option>`).join('')}</select></label>
      <label class="field"><span>Otimizar para</span><select class="inp" id="vMode"><option value="motion" ${st.mode==='motion'?'selected':''}>🎮 Fluidez</option><option value="detail" ${st.mode==='detail'?'selected':''}>📝 Nitidez</option></select></label>
    </div>
    ${plus ? '' : `<div class="locked">🔒 1080p 60fps, 1440p, 4K e até 20 Mbps são do Telão+. <button class="btn sm" data-plus>Conhecer</button></div>`}
    <small style="color:var(--mut);display:block;margin-top:8px">O bitrate vale para cada pessoa assistindo e usa a internet (upload) de quem transmite.</small>
    <hr class="sdiv"><h3>Sons</h3>
    ${row('Abaixar o som das telas quando alguém fala', 'Deixa a conversa por cima do som do jogo/filme que estão transmitindo.', toggle('vDuck', P.duck !== false))}
    ${row('Sons de entrar, sair e mutar', '', toggle('vSnd', P.soundVoice))}
    ${row('Bipe ao apertar o botão de falar', 'Só no modo “Pressionar para falar”.', toggle('vSndP', P.soundPtt))}`;
  const $b = s => box.querySelector(s);
  box.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => setSec('plus'));
  box.querySelectorAll('[data-go]').forEach(x => x.onclick = () => setSec(x.dataset.go));
  async function fillDevices(){
    try{
      const devs = await navigator.mediaDevices.enumerateDevices();
      const ins = devs.filter(d => d.kind === 'audioinput'), outs = devs.filter(d => d.kind === 'audiooutput');
      const noLabels = ins.length && !ins[0].label;
      $b('#vIn').innerHTML = '<option value="">Padrão</option>' + ins.filter(d => d.deviceId !== 'default').map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.inputId?'selected':''}>${esc(d.label || 'Microfone ' + (i+1))}</option>`).join('');
      $b('#vOut').innerHTML = '<option value="">Padrão</option>' + outs.filter(d => d.deviceId !== 'default').map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.outputId?'selected':''}>${esc(d.label || 'Saída ' + (i+1))}</option>`).join('');
      const cams = devs.filter(d => d.kind === 'videoinput');
      $b('#vCam').innerHTML = '<option value="">Padrão</option>' + cams.map((d,i) => `<option value="${esc(d.deviceId)}" ${d.deviceId===P.camId?'selected':''}>${esc(d.label || 'Câmera ' + (i+1))}</option>`).join('');
      if(!('setSinkId' in HTMLMediaElement.prototype)){ $b('#vOut').disabled = true; $b('#vOut').innerHTML = '<option>Seu navegador não permite escolher</option>'; }
      $b('#vPerm').innerHTML = noLabels ? `<div class="locked" style="border-color:var(--line)">Para ver os nomes dos dispositivos, permita o microfone. <button class="btn sm" id="vAllow">Permitir</button></div>` : '';
      const al = $b('#vAllow'); if(al) al.onclick = async () => { try{ (await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop()); }catch(e){} fillDevices(); };
    }catch(e){}
  }
  fillDevices();
  $b('#vCam').onchange = e => { P.camId = e.target.value; savePrefs(); if(Voice.camStream){ Voice.stopCamera(true); Voice.startCamera(); } };
  $b('#vIn').onchange = e => { P.inputId = e.target.value; savePrefs(); Voice.switchMic(); if(test) startTest(); };
  $b('#vOut').onchange = e => { P.outputId = e.target.value; savePrefs(); Voice.applySink(); if(loopEl && loopEl.setSinkId) loopEl.setSinkId(P.outputId).catch(()=>{}); };
  box.querySelectorAll('[data-m]').forEach(c => c.onclick = () => { P.mode = c.dataset.m; savePrefs(); Voice.applyMicState(); renderSettings(); });
  const th = () => { $b('#vTh').style.left = Math.min(100, P.sensitivity / 30 * 100 * 0.6) + '%'; };
  th();
  $b('#vSens').oninput = e => { P.sensitivity = +e.target.value; savePrefs(); th(); };
  const proc = (id, key) => $b(id).onchange = e => { P[key] = e.target.checked; savePrefs(); Voice.switchMic(); if(test) startTest(); };
  proc('#vEcho','echo'); proc('#vAgc','agc'); proc('#vMusic','musicMode');
  box.querySelectorAll('[data-nz]').forEach(b => b.onclick = () => { P.noiseLevel = b.dataset.nz; P.noise = b.dataset.nz !== 'off'; savePrefs(); Voice.switchMic(); renderSettings(); });
  $b('#vSnd').onchange = e => { P.soundVoice = e.target.checked; savePrefs(); };
  $b('#vDuck').onchange = e => { P.duck = e.target.checked; savePrefs(); };
  $b('#vSndP').onchange = e => { P.soundPtt = e.target.checked; savePrefs(); };
  const scr = () => {
    const [w,h,fps] = $b('#vRes').value.split('x').map(Number);
    const ns = clampScreen({ w, h, fps, bitrate: +$b('#vBr').value, mode: $b('#vMode').value });
    Voice.updateScreenSettings(ns); ls.set('telao-screen', ns); App.toast('Qualidade da tela atualizada');
  };
  ['#vRes','#vBr','#vMode'].forEach(s => $b(s).onchange = scr);
  // teste de microfone
  let test = null, raf = 0, ctx = null, loopEl = null;
  function stopTest(){
    cancelAnimationFrame(raf); if(test) test.getTracks().forEach(t => t.stop()); test = null;
    if(loopEl){ loopEl.srcObject = null; loopEl.remove(); loopEl = null; }
    if(ctx){ ctx.close().catch(()=>{}); ctx = null; }
    const b = $b('#vTest'); if(b) b.textContent = 'Vamos verificar';
    const l = $b('#vLvl'); if(l) l.style.width = '0';
  }
  async function startTest(){
    stopTest();
    try{ test = await Voice.getMic(); }catch(e){ App.toast('Sem acesso ao microfone: ' + e.message, true); return; }
    $b('#vTest').textContent = 'Parar teste';
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(test).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf); let sum = 0; for(const x of buf){ const d = x - 128; sum += d*d; }
      const rms = Math.sqrt(sum / buf.length);
      const l = $b('#vLvl'); if(!l) return;
      l.style.width = Math.min(100, rms / 30 * 100 * 0.6 * 1) + '%';
      l.style.background = rms > P.sensitivity ? 'var(--ok)' : 'var(--mut)';
      raf = requestAnimationFrame(loop);
    };
    loop();
    if($b('#vLoop').checked) startLoop();
    fillDevices();
  }
  function startLoop(){
    if(!test) return;
    loopEl = document.createElement('audio'); loopEl.autoplay = true; loopEl.srcObject = test; document.body.appendChild(loopEl);
    if(P.outputId && loopEl.setSinkId) loopEl.setSinkId(P.outputId).catch(()=>{});
  }
  $b('#vTest').onclick = () => test ? stopTest() : startTest();
  $b('#vLoop').onchange = e => { if(e.target.checked) startLoop(); else if(loopEl){ loopEl.srcObject = null; loopEl.remove(); loopEl = null; } };
  SET.cleanups.push(stopTest);
}

/* ---------- Notificações ---------- */
function secNotif(box, back){
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  box.innerHTML = `${back}<h2>Notificações</h2>
    ${row('Notificações no computador/celular', perm === 'granted' ? '✅ Ativadas neste aparelho.' : perm === 'denied' ? '❌ Bloqueadas. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço).' : perm === 'unsupported' ? 'Não suportado neste navegador.' : 'Receba avisos mesmo com o Telão em segundo plano.',
          perm === 'default' ? '<button class="btn sm" id="nAsk">Ativar</button>' : '')}
    <h3>Me avise sobre</h3>
    ${row('Mensagens diretas', '', toggle('nDM', P.notifDM))}
    ${row('Menções (@' + esc(S.me.username) + ')', 'Quando alguém te marca num canal.', toggle('nMen', P.notifMention))}
    ${row('Chamadas recebidas', '', toggle('nCall', P.notifCall))}
    <h3>Sons</h3>
    ${row('Som de nova mensagem', '', toggle('nSnd', P.soundMsg))}`;
  const a = box.querySelector('#nAsk'); if(a) a.onclick = async () => { await Notification.requestPermission(); renderSettings(); };
  [['#nDM','notifDM'],['#nMen','notifMention'],['#nCall','notifCall'],['#nSnd','soundMsg']].forEach(([s,k]) => box.querySelector(s).onchange = e => { P[k] = e.target.checked; savePrefs(); });
}

/* ---------- Teclas de atalho ---------- */
function secKeys(box, back){
  const items = [['muteKey','Silenciar / ativar microfone',false],['deafKey','Ensurdecer / ativar áudio',false],['screenKey','Compartilhar / parar tela',false],['clipKey','Clipe dos últimos 30 segundos',false],['pttKey','Pressionar para falar',true]];
  box.innerHTML = `${back}<h2>Teclas de atalho</h2>
    <p style="color:var(--txt2);font-size:14px;margin-bottom:10px">Os atalhos funcionam com o Telão aberto e em foco (é uma limitação dos navegadores). Use Ctrl/Alt nos atalhos para funcionarem até enquanto você digita.</p>
    ${items.map(([k,l,single]) => row(l, single ? (P.mode==='ptt' ? 'Segure a tecla para falar.' : 'Ative o modo “Pressionar para falar” em Voz e vídeo.') : '',
      `<div style="display:flex;gap:8px;align-items:center"><span class="keycap">${P[k] ? keyLabel(P[k]) : '<span style="color:var(--mut);font-size:13px">Nenhum</span>'}</span>
       <button class="btn sec sm keybtn" data-k="${k}" data-s="${single?1:0}">Editar atalho</button>${P[k] ? `<button class="ibtn" data-clr="${k}" title="Remover">✕</button>` : ''}</div>`)).join('')}
    <hr class="sdiv"><h3>Clipes</h3>${row('Guardar os últimos 30 segundos da call', 'Enquanto você está numa call, o Telão guarda sempre os últimos segundos da tela (ou só do áudio, se ninguém está transmitindo). Aperte o atalho para virar um clipe. Nada sai do seu computador até você enviar.', toggle('kClip', P.clipOn !== false))}
    <hr class="sdiv">${row('Restaurar padrões', '', '<button class="btn sec sm" id="kRst">Restaurar</button>')}`;
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    box.querySelectorAll('.keybtn').forEach(x => x.classList.remove('rec'));
    b.classList.add('rec'); b.textContent = 'Aperte as teclas… (Esc cancela)';
    recordingKey = { single: b.dataset.s === '1', done: code => { if(code){ P[b.dataset.k] = code; savePrefs(); } renderSettings(); } };
  });
  box.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => { P[b.dataset.clr] = ''; savePrefs(); renderSettings(); });
  box.querySelector('#kRst').onclick = () => { ['muteKey','deafKey','screenKey','pttKey','clipKey'].forEach(k => P[k] = PDEF[k]); savePrefs(); renderSettings(); };
  box.querySelector('#kClip').onchange = e => { P.clipOn = e.target.checked; savePrefs(); App.clipRefresh && App.clipRefresh(); renderStage(); };
  SET.cleanups.push(() => { recordingKey = null; });
}

/* ---------- App ---------- */
function secApp(box, back){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const desk = window.telaoDesktop, dl = (S.cfg || {}).desktop_url;
  box.innerHTML = `${back}<h2>App e instalação</h2>
    <div class="dlcard"><span class="clogo">${ic('monitor', 24)}</span><div class="t"><b>Telão para Windows</b>
      <small>${desk ? 'Você está usando o app para Windows, versão ' + esc(desk.version) + '. Ele se atualiza sozinho.' : 'Programa de verdade: abre pelo menu Iniciar, fica na bandeja, avisa de mensagens e compartilha a tela com o som do PC.'}</small></div>
      ${desk ? '' : dl ? `<a class="btn" href="${esc(dl)}" download>${ic('download', 16)} Baixar para Windows</a>` : '<span class="mut small">Em breve</span>'}</div>
    ${S.me.is_admin ? `<div class="srow"><div class="t"><b>Link do instalador (só o admin vê)</b><small>Cole o link do Telao-Setup.exe (por exemplo, o da página Releases do GitHub). Veja o LEIA-ME do app para Windows.</small></div></div>
      <div style="display:flex;gap:8px;margin-bottom:8px"><input class="inp" id="apDl" placeholder="https://github.com/…/releases/latest/download/Telao-Setup.exe" value="${esc(dl || '')}"><button class="btn sec" id="apDlOk">Salvar</button></div>` : ''}
    ${desk ? '' : row('Instalar pelo navegador', standalone ? 'Você está usando o app instalado.' : S.installEvt ? 'Instale como app: ícone próprio, janela separada e abre mais rápido.' : ios ? 'No iPhone: Compartilhar → <b>Adicionar à Tela de Início</b>.' : 'No Chrome/Edge: ícone de instalar na barra de endereço, ou menu ⋮ → <b>Instalar Telão</b>.',
          S.installEvt && !standalone ? '<button class="btn sm" id="apInst">Instalar</button>' : '')}
    ${row('Limpar cache do app', 'Use se uma atualização não aparecer.', '<button class="btn sec sm" id="apClr">Limpar e recarregar</button>')}
    <hr class="sdiv"><small style="color:var(--mut)">Telão · versão ${APP_VERSION}</small>`;
  const i = box.querySelector('#apInst'); if(i) i.onclick = doInstall;
  const dk = box.querySelector('#apDlOk'); if(dk) dk.onclick = async () => {
    const v = box.querySelector('#apDl').value.trim();
    const { error } = await App.sb.from('app_config').upsert({ key: 'desktop_url', value: v || null, updated_at: new Date().toISOString() });
    if(error){ App.toast(error.message, true); return; }
    S.cfg.desktop_url = v || null; App.toast('Link salvo. Agora todo mundo vê o botão de baixar.'); renderSettings();
  };
  box.querySelector('#apClr').onclick = async () => {
    try{ const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }catch(e){}
    location.reload();
  };
}

/* ---------- Painel do admin ---------- */
function secAdmin(box, back){
  if(!S.me.is_admin){ box.innerHTML = 'Sem acesso.'; return; }
  box.innerHTML = `${back}<h2>Painel do admin</h2>
    <p style="color:var(--txt2);font-size:14px">Dê o Telão+ (ex: quem pagou por Pix) e insígnias para qualquer pessoa.</p>
    <h3>Aviso para todos</h3>
    <p class="mut small" style="margin-bottom:8px">Aparece na hora para todo mundo que está com o Telão aberto (no topo da tela, com som).</p>
    <textarea class="inp" id="avT" maxlength="200" rows="2">Saiu uma atualização nova do Telão! Clique em "Atualizar agora" para ver as novidades 🎉</textarea>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap"><label style="display:flex;gap:8px;align-items:center;font-size:14px">${toggle('avR', true)} Mostrar botão “Atualizar agora”</label><span class="grow"></span><button class="btn" id="avGo">${ic('send',16)} Enviar para todos</button></div>
    <hr class="sdiv">
    <h3>Procurar usuário</h3>
    <input class="inp" id="adQ" placeholder="nome de usuário ou nome" autocomplete="off">
    <div class="slist adminres" id="adRes" style="margin-top:10px"></div>
    <div id="adUser"></div>
    <hr class="sdiv"><h3>Últimos pagamentos</h3><div id="adPays" style="font-size:14px;color:var(--mut)">Carregando…</div>`;
  const $b = s => box.querySelector(s);
  $b('#avGo').onclick = async () => {
    const t = $b('#avT').value.trim(); if(!t){ App.toast('Escreva o aviso.', true); return; }
    if(!(await confirmBox('Enviar aviso', `Mandar para todo mundo que está online agora?<br><br><i>“${esc(t)}”</i>`, 'Enviar', false))) return;
    await App.sendAviso(t, $b('#avR').checked);
    App.toast('Aviso enviado para todos que estão online');
  };
  let tmr;
  $b('#adQ').oninput = e => { clearTimeout(tmr); const q = e.target.value.trim().replace(/[%,()]/g,''); tmr = setTimeout(async () => {
    if(q.length < 2){ $b('#adRes').innerHTML = ''; return; }
    const { data } = await App.sb.from('profiles').select('*').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(10);
    (data || []).forEach(p => S.profiles.set(p.id, p));
    $b('#adRes').innerHTML = (data || []).map(p => `<div class="item" data-u="${p.id}">${avatar(p)}<b>${esc(p.display_name)}</b><span style="color:var(--mut)">@${esc(p.username)}</span><span class="grow"></span>${hasPlus(p)?'<span class="plustag">TELÃO+</span>':''}</div>`).join('') || '<div style="color:var(--mut)">Ninguém encontrado.</div>';
    box.querySelectorAll('[data-u]').forEach(r => r.onclick = () => showUser(r.dataset.u));
  }, 250); };
  function showUser(uid){
    const p = S.profiles.get(uid);
    const until = p.plan_until && new Date(p.plan_until) > new Date() ? 'Ativo até ' + new Date(p.plan_until).toLocaleDateString('pt-BR') : 'Sem plano';
    $b('#adUser').innerHTML = `<hr class="sdiv"><div class="profgrid"><div>
        <h3 style="margin-top:0">Telão+ · ${p.is_admin ? 'Admin (vitalício)' : until}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-days="30">+30 dias</button><button class="btn sm" data-days="90">+90 dias</button><button class="btn sm" data-days="365">+1 ano</button><button class="btn red sm" data-days="0">Remover plano</button></div>
        <h3>Insígnias</h3>
        ${GRANTABLE.map(id => { const b = BADGES.find(x => x.id === id); return `<label style="display:flex;align-items:center;gap:10px;padding:6px 0"><input type="checkbox" data-b="${id}" ${(p.badges||[]).includes(id)?'checked':''} style="accent-color:var(--acc);width:18px;height:18px"><span class="badge-i">${badgeSvg(id)}</span>${b.nome}</label>`; }).join('')}
        <button class="btn ok sm" id="adSaveB" style="margin-top:8px">Salvar insígnias</button>
      </div><div>${profileCard(p)}</div></div>`;
    box.querySelectorAll('[data-days]').forEach(b => b.onclick = async () => {
      const { error } = await App.sb.rpc('admin_set_plus', { p_user: uid, p_days: +b.dataset.days });
      if(error){ App.toast(error.message, true); return; }
      await refetch(uid); App.toast(+b.dataset.days ? 'Telão+ liberado.' : 'Plano removido.'); showUser(uid);
    });
    $b('#adSaveB').onclick = async () => {
      const list = [...box.querySelectorAll('[data-b]')].filter(x => x.checked).map(x => x.dataset.b);
      const { error } = await App.sb.rpc('admin_set_badges', { p_user: uid, p_badges: list });
      if(error){ App.toast(error.message, true); return; }
      await refetch(uid); App.toast('Insígnias salvas'); showUser(uid);
    };
  }
  async function refetch(uid){ const { data } = await App.sb.from('profiles').select('*').eq('id', uid).single(); if(data){ S.profiles.set(uid, data); if(uid === S.me.id) S.me = data; } }
  App.sb.from('payments').select('*').order('created_at', { ascending:false }).limit(30).then(async ({ data }) => {
    const rows = (data || []).filter(x => !String(x.id).endsWith(':liberado'));
    await ensureProfiles(rows.map(x => x.user_id));
    const el = $b('#adPays'); if(!el) return;
    el.innerHTML = rows.length ? `<table class="paytable">${rows.map(x => `<tr><td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(prof(x.user_id).display_name)}</td><td>R$ ${Number(x.amount||0).toFixed(2).replace('.',',')}</td><td>${esc(x.status)}</td></tr>`).join('')}</table>` : 'Nenhum pagamento ainda.';
  });
}

/* ---------- Configurações do servidor ---------- */
function secSrvOverview(box, back){
  const s = SET.server;
  const D = { name: s.name, icon_color: s.icon_color, icon_url: s.icon_url || null, description: s.description || '' };
  box.innerHTML = `${back}<h2>Visão geral do servidor</h2>
    <div class="ovrow"><div><label class="upicon big" id="soIcon" style="--sc:${esc(s.icon_color)}"></label>
      <div class="ovbtns"><button class="btn sm" id="soUp">Enviar imagem</button>${'<button class="btn sm sec" id="soRm">Remover</button>'}</div><input type="file" id="soFile" accept="image/*" hidden>
      <small class="mut">Mínimo 128×128. GIF animado libera no nível 1 de impulsos.</small></div>
    <div style="flex:1"><label class="field"><span>Nome do servidor</span><input class="inp" id="soN" maxlength="40"></label>
      <label class="field"><span>Descrição</span><textarea class="inp" id="soD" maxlength="200" rows="3" placeholder="Sobre o que é este servidor?"></textarea></label></div></div>
    <h3>Cor do ícone</h3><div class="colors" id="soC">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    <div id="soSave"></div>`;
  const $b = q => box.querySelector(q);
  $b('#soN').value = D.name; $b('#soD').value = D.description;
  const draw = () => {
    $b('#soIcon').style.setProperty('--sc', D.icon_color);
    $b('#soIcon').innerHTML = D.icon_url ? `<img src="${esc(D.icon_url)}" alt="">` : `<span>${esc(serverInitials(D.name || '?'))}</span>`;
    box.querySelectorAll('#soC [data-c]').forEach(x => x.classList.toggle('on', x.dataset.c === D.icon_color));
    const dirty = D.name.trim() !== s.name || D.icon_color !== s.icon_color || (D.icon_url||null) !== (s.icon_url||null) || D.description.trim() !== (s.description || ''); SET.dirty = dirty;
    $b('#soSave').innerHTML = dirty ? `<div class="savebar"><span>Cuidado — você tem alterações não salvas!</span><button class="btn sec sm" id="soR">Redefinir</button><button class="btn ok sm" id="soOk">Salvar alterações</button></div>` : '';
    if(dirty){ $b('#soR').onclick = () => { SET.dirty = false; renderSettings(); }; $b('#soOk').onclick = save; }
  };
  $b('#soN').oninput = e => { D.name = e.target.value; draw(); };
  $b('#soD').oninput = e => { D.description = e.target.value; draw(); };
  box.querySelectorAll('#soC [data-c]').forEach(b => b.onclick = () => { D.icon_color = b.dataset.c; draw(); });
  $b('#soUp').onclick = () => $b('#soFile').click();
  $b('#soRm').onclick = () => { D.icon_url = null; draw(); };
  $b('#soFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    if(f.type === 'image/gif' && serverLevel(s.id) < 1){ App.toast('Ícone animado libera quando o servidor chega no nível 1 de impulsos (2 impulsos).', true); return; }
    App.toast('Enviando…');
    try{ D.icon_url = await uploadSquare(f, 'server', 256); draw(); }catch(err){ App.toast(err.message, true); }
  };
  async function save(){
    const name = D.name.trim(); if(!name) return;
    const { error } = await App.sb.from('servers').update({ name, icon_color: D.icon_color, icon_url: D.icon_url, description: D.description.trim() || null }).eq('id', s.id);
    if(error){ App.toast(error.message, true); return; }
    SET.dirty = false; await loadServers(); SET.server = S.servers.find(x => x.id === s.id) || s;
    renderRail(); renderSidebar(); renderSettings(); App.toast('Servidor atualizado');
  }
  draw();
}
function secSrvRoles(box, back){
  const s = SET.server, isOwner = s.owner_id === S.me.id;
  const roles = S.roles.get(s.id) || [];
  let sel = SET.roleSel && roles.find(r => r.id === SET.roleSel) ? SET.roleSel : (roles[0] || {}).id;
  box.innerHTML = `${back}<h2>Cargos</h2><p class="mut" style="margin:-8px 0 16px;font-size:14px">Use cargos para organizar a galera e dar poderes. A cor do cargo pinta o nome da pessoa.</p>
    <div class="rolegrid"><div class="rolelist">${roles.map(r => `<button class="ritem ${r.id===sel?'on':''}" data-r="${r.id}"><i style="background:${esc(r.color)}"></i>${esc(r.name)}<small>${[...(S.memberRoles.get(s.id)||new Map()).values()].filter(x => x.has(r.id)).length}</small></button>`).join('')}
      <button class="btn sm" id="rNew">${ic('plus',16)} Criar cargo</button></div>
    <div id="rEdit">${roles.length ? '' : `<div class="empty">${ic('shield',44)}<p>Nenhum cargo ainda. Crie o primeiro, por exemplo “Moderador”.</p></div>`}</div></div>`;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { SET.roleSel = b.dataset.r; renderSettings(); });
  box.querySelector('#rNew').onclick = async () => {
    const { data, error } = await App.sb.from('server_roles').insert({ server_id: s.id, name: 'novo cargo', color: COLORS[Math.floor(Math.random()*COLORS.length)], position: roles.length + 1, perms: 0 }).select().single();
    if(error){ App.toast(error.message, true); return; }
    await loadRoles(s.id); SET.roleSel = data.id; renderSettings();
  };
  const r = roles.find(x => x.id === sel); if(!r) return;
  const locked = !isOwner && (r.perms & 48);
  const D = { name: r.name, color: r.color, perms: r.perms, hoist: r.hoist };
  const ed = box.querySelector('#rEdit');
  ed.innerHTML = `${locked ? `<div class="locked" style="border-color:var(--warn)">${ic('lock',18)} Só o dono do servidor pode editar este cargo.</div>` : ''}
    <label class="field"><span>Nome do cargo</span><input class="inp" id="rN" maxlength="32" value="${esc(r.name)}" ${locked?'disabled':''}></label>
    <label class="field"><span>Cor</span><div class="colors" id="rC">${COLORS.concat(['#99aab5']).map(c => `<button type="button" data-c="${c}" class="${c===r.color?'on':''}" style="background:${c}" ${locked?'disabled':''}></button>`).join('')}<input type="color" id="rCC" value="${esc(r.color)}" ${locked?'disabled':''}></div></label>
    ${row('Mostrar separado na lista de membros', 'Quem tem este cargo aparece num grupo próprio.', toggle('rH', r.hoist))}
    <h3>Permissões</h3>
    ${PERMS.map(([bit, n, d]) => row(n + (bit & 48 && !isOwner ? ' 🔒' : ''), d, toggle('rp' + bit, r.perms & bit))).join('')}
    <div class="rolefoot"><button class="btn red sm" id="rDel" ${locked?'disabled':''}>${ic('trash',16)} Apagar cargo</button><span class="grow"></span><button class="btn ok" id="rSave" ${locked?'disabled':''}>Salvar cargo</button></div>`;
  if(locked) ed.querySelectorAll('input').forEach(i => i.disabled = true);
  PERMS.forEach(([bit]) => { if(bit & 48 && !isOwner){ const cb = ed.querySelector('#rp' + bit); if(cb) cb.disabled = true; } });
  ed.querySelectorAll('#rC [data-c]').forEach(b => b.onclick = () => { D.color = b.dataset.c; ed.querySelectorAll('#rC [data-c]').forEach(x => x.classList.toggle('on', x === b)); ed.querySelector('#rCC').value = D.color; });
  ed.querySelector('#rCC').oninput = e => { D.color = e.target.value; ed.querySelectorAll('#rC [data-c]').forEach(x => x.classList.remove('on')); };
  ed.querySelector('#rSave').onclick = async () => {
    let perms = 0; PERMS.forEach(([bit]) => { if(ed.querySelector('#rp' + bit).checked) perms |= bit; });
    const { error } = await App.sb.from('server_roles').update({ name: ed.querySelector('#rN').value.trim() || 'cargo', color: D.color, perms, hoist: ed.querySelector('#rH').checked }).eq('id', r.id);
    if(error){ App.toast(error.message, true); return; }
    await loadRoles(s.id); renderSettings(); renderMembers(); renderSidebar(); App.toast('Cargo salvo');
  };
  ed.querySelector('#rDel').onclick = async () => {
    if(!(await confirmBox('Apagar cargo', `Apagar o cargo <b>${esc(r.name)}</b>? Quem tem ele perde as permissões.`, 'Apagar'))) return;
    const { error } = await App.sb.from('server_roles').delete().eq('id', r.id);
    if(error){ App.toast(error.message, true); return; }
    SET.roleSel = null; await loadRoles(s.id); renderSettings(); renderMembers();
  };
}
function secSrvChannels(box, back){
  const s = SET.server;
  const list = (S.channels.get(s.id) || []).slice().sort((a,b) => a.position - b.position);
  const group = kind => list.filter(c => c.kind === kind).map(c => `<div class="item" data-id="${c.id}"><span class="ic">${kind==='text'?'#':'🔊'}</span>
      <input value="${esc(c.name)}" maxlength="40" data-rn="${c.id}"><button class="ibtn" data-up="${c.id}" title="Subir">↑</button><button class="ibtn" data-dn="${c.id}" title="Descer">↓</button><button class="ibtn" data-del="${c.id}" title="Apagar">🗑️</button></div>`).join('') || '<div style="color:var(--mut);font-size:14px">Nenhum.</div>';
  box.innerHTML = `${back}<h2>Canais</h2>
    <h3>Canais de texto</h3><div class="slist">${group('text')}</div><button class="btn sec sm" data-new="text" style="margin-top:6px">+ Canal de texto</button>
    <h3>Canais de voz</h3><div class="slist">${group('voice')}</div><button class="btn sec sm" data-new="voice" style="margin-top:6px">+ Canal de voz</button>`;
  const reload = async () => { await loadChannels(s.id); renderSidebar(); if(SET) renderSettings(); };
  box.querySelectorAll('[data-rn]').forEach(inp => {
    const save = async () => {
      const c = list.find(x => x.id === inp.dataset.rn); let v = inp.value.trim();
      if(c.kind === 'text') v = v.toLowerCase().replace(/\s+/g,'-');
      if(!v || v === c.name){ inp.value = c.name; return; }
      const { error } = await App.sb.from('channels').update({ name: v }).eq('id', c.id);
      if(error){ App.toast(error.message, true); return; }
      App.toast('Canal renomeado'); reload();
    };
    inp.onblur = save; inp.onkeydown = e => { if(e.key === 'Enter') inp.blur(); };
  });
  const move = async (id, dir) => {
    const c = list.find(x => x.id === id); const same = list.filter(x => x.kind === c.kind);
    const i = same.indexOf(c), j = i + dir; if(j < 0 || j >= same.length) return;
    const o = same[j];
    const a = c.position === o.position ? i : c.position, b = c.position === o.position ? j : o.position;
    await App.sb.from('channels').update({ position: b }).eq('id', c.id);
    await App.sb.from('channels').update({ position: a }).eq('id', o.id);
    reload();
  };
  box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
  box.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => move(b.dataset.dn, 1));
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const c = list.find(x => x.id === b.dataset.del);
    if(!(await confirmBox('Apagar canal', `Apagar <b>${esc(c.name)}</b>?`, 'Apagar'))) return;
    const { error } = await App.sb.from('channels').delete().eq('id', c.id);
    if(error) App.toast(error.message, true); else reload();
  });
  box.querySelectorAll('[data-new]').forEach(b => b.onclick = () => createChannelModal(s, b.dataset.new));
}
async function secSrvMembers(box, back){
  const s = SET.server;
  box.innerHTML = `${back}<h2>Membros</h2><input class="inp" id="smQ" placeholder="Procurar membro"><div class="slist" id="smL" style="margin-top:12px">Carregando…</div>`;
  await loadMembers(s.id);
  const draw = () => {
    const q = box.querySelector('#smQ').value.toLowerCase();
    const mem = (S.members.get(s.id) || []).map(m => ({ ...m, p: prof(m.user_id) }))
      .filter(m => !q || m.p.display_name.toLowerCase().includes(q) || m.p.username.includes(q))
      .sort((a,b) => (b.user_id === s.owner_id) - (a.user_id === s.owner_id) || a.p.display_name.localeCompare(b.p.display_name));
    box.querySelector('#smL').innerHTML = `<div style="color:var(--mut);font-size:13px;margin-bottom:8px">${mem.length} membro(s)</div>` + mem.map(m => `<div class="item">${avatar(m.p,'',true)}<b>${esc(m.p.display_name)}</b><span style="color:var(--mut)">@${esc(m.p.username)}</span>
      ${badgesOf(m.p).slice(0,4).map(b => badgeHtml(b, m.p, 'sm')).join('')}<span class="grow"></span>
      ${rolesOf(s.id, m.user_id).map(r => `<span class="rpill sm"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span>`).join('')}
      ${App.hasPerm(s.id, 16) ? `<button class="btn sec sm" data-roles="${m.user_id}">${ic('shield',14)} Cargos</button>` : ''}
      ${m.user_id === s.owner_id ? `<span class="crown">${ic('crown',14)} Dono</span>` : App.hasPerm(s.id, 4) ? `<button class="btn red sm" data-kick="${m.user_id}">Expulsar</button>` : ''}</div>`).join('');
    box.querySelectorAll('[data-roles]').forEach(b => b.onclick = e => App.roleAssignMenu(s, b.dataset.roles, e.clientX, e.clientY));
    box.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
      const p = prof(b.dataset.kick);
      if(!(await confirmBox('Expulsar', `Expulsar <b>${esc(p.display_name)}</b> de ${esc(s.name)}?`, 'Expulsar'))) return;
      const { error } = await App.sb.from('server_members').delete().eq('server_id', s.id).eq('user_id', p.id);
      if(error){ App.toast(error.message, true); return; }
      await loadMembers(s.id); draw(); renderMembers();
    });
  };
  box.querySelector('#smQ').oninput = draw; draw();
}
function secSrvInvites(box, back){
  const s = SET.server, link = location.origin + '/#convite=' + s.invite_code;
  box.innerHTML = `${back}<h2>Convites</h2>
    <p style="color:var(--txt2);font-size:14px;margin-bottom:14px">Quem abrir o link (ou digitar o código) entra no servidor.</p>
    <div class="codebig">${esc(s.invite_code)}</div>
    <div class="copyrow"><input class="inp" readonly value="${esc(link)}"><button class="btn" id="siC">Copiar link</button></div>
    <hr class="sdiv">${row('Gerar novo convite', 'O link antigo para de funcionar na hora. Use se ele vazou.', '<button class="btn red sm" id="siR">Gerar novo</button>')}`;
  box.querySelector('#siC').onclick = () => copy(link);
  box.querySelector('#siR').onclick = async () => {
    const { data, error } = await App.sb.rpc('regenerate_invite', { p_server: s.id });
    if(error){ App.toast(error.message, true); return; }
    s.invite_code = data; renderSettings(); App.toast('Novo convite gerado');
  };
}

