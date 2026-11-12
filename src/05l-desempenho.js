/* =====================================================================
   v6.7: DESEMPENHO — Qualidade · Equilibrado · Modo jogo (máximo de FPS)
   ===================================================================== */
const PERF = {
  quality:  { nome: 'Qualidade', desc: 'Tudo ligado: animações, brilhos, partículas, efeitos de vidro e transições suaves.', icon: 'star' },
  balanced: { nome: 'Equilibrado', desc: 'Corta o que mais pesa (vidro desfocado, partículas, sombras grandes) e deixa as animações mais curtas.', icon: 'sliders' },
  game:     { nome: 'Modo jogo', desc: 'O mais leve possível para sobrar FPS no jogo: sem animações nem efeitos, e o Telão trabalha menos em segundo plano. Chamada e tela continuam iguais.', icon: 'gamepad' },
};
if(!P.perf) P.perf = 'quality';
if(P.perfAuto === undefined) P.perfAuto = true;
if(P.perfShare === undefined) P.perfShare = false;
let perfTemp = null;   // modo jogo automático (janela em segundo plano / compartilhando)
function perfNow(){ return perfTemp && P.perf !== 'game' ? 'game' : P.perf; }
function applyPerf(){
  const lv = perfNow(); App.perf = lv;
  document.body.classList.toggle('perf-balanced', lv === 'balanced');
  document.body.classList.toggle('perf-game', lv === 'game');
  const ms = lv === 'game' ? 260 : lv === 'balanced' ? 160 : 120;
  if(Voice.speakMs !== ms){ Voice.speakMs = ms; if(Voice._speakTimer) Voice.startSpeakLoop(); }
  const chip = $('#perfChip');
  if(chip) chip.classList.toggle('hidden', lv !== 'game');
}
App.applyPerf = applyPerf;
applyPerf();
// automático: quando o Telão fica em segundo plano (você está no jogo) ou quando você compartilha a tela
function perfAutoCheck(){
  const bg = P.perfAuto && (document.hidden || !document.hasFocus());
  const share = P.perfShare && !!Voice.screenStream;
  const want = bg || share ? 'auto' : null;
  if(want !== perfTemp){ perfTemp = want; applyPerf(); }
}
document.addEventListener('visibilitychange', perfAutoCheck);
addEventListener('blur', () => setTimeout(perfAutoCheck, 50));
addEventListener('focus', perfAutoCheck);
setInterval(perfAutoCheck, 3000);
// atalho: Ctrl+Shift+G liga e desliga o modo jogo
document.addEventListener('keydown', e => {
  if(e.ctrlKey && e.shiftKey && (e.key === 'G' || e.key === 'g')){
    e.preventDefault();
    P.perfBefore = P.perf === 'game' ? P.perfBefore : P.perf;
    P.perf = P.perf === 'game' ? (P.perfBefore || 'quality') : 'game'; savePrefs(); applyPerf();
    App.toast(P.perf === 'game' ? 'Modo jogo ligado: o Telão fica o mais leve possível.' : `Voltou para ${PERF[P.perf].nome}.`);
    if(SET && SET.sec === 'perf') renderSettings();
  }
});
// aviso discreto "modo jogo" no canto do painel do usuário
const _renderUserPanelP = renderUserPanel;
renderUserPanel = function(){
  _renderUserPanelP.apply(this, arguments);
  const up = $('#userPanel'); if(!up || $('#perfChip')) return;
  up.insertAdjacentHTML('afterbegin', `<button class="perfchip ${App.perf === 'game' ? '' : 'hidden'}" id="perfChip" data-tip="Modo jogo ligado" data-tipsub="Ctrl+Shift+G para desligar">${ic('gamepad', 13)} Modo jogo</button>`);
  $('#perfChip').onclick = () => openSettings('user', 'perf');
};

function secPerf(box, back){
  box.innerHTML = `${back}<h2>Desempenho</h2>
    <p class="mut">Escolha quanto o Telão pode usar do seu PC ou celular. No modo jogo ele fica o mais leve possível para não roubar FPS.</p>
    <div class="perfgrid">${Object.entries(PERF).map(([k, v]) => `<button class="perfc ${P.perf === k ? 'on' : ''}" data-perf="${k}">
      <span class="pi">${ic(v.icon, 22)}</span><b>${v.nome}</b><small>${v.desc}</small>${P.perf === k ? '<span class="ok">✓ Em uso</span>' : ''}</button>`).join('')}</div>
    <h3>Automático</h3>
    ${row('Ficar no modo jogo quando o Telão estiver em segundo plano', 'Enquanto você está no jogo (o Telão minimizado ou atrás), ele economiza sozinho. Volta ao normal quando você abre o Telão de novo.', toggle('pfAuto', P.perfAuto))}
    ${row('Ficar no modo jogo enquanto eu compartilho a tela', 'Bom para transmitir jogo: sobra mais placa de vídeo para o jogo e para a transmissão.', toggle('pfShare', P.perfShare))}
    <p class="mut small" style="margin-top:12px">Atalho: <span class="keycap">Ctrl</span> + <span class="keycap">Shift</span> + <span class="keycap">G</span> liga e desliga o modo jogo de qualquer lugar do Telão.</p>
    <hr class="sdiv"><h3>O que o modo jogo muda</h3>
    <ul class="perflist"><li>Desliga animações, transições, partículas, molduras animadas e o fundo animado dos temas</li><li>Tira o efeito de vidro desfocado e as sombras (os que mais pesam na placa de vídeo)</li><li>Mensagens fora da tela não são desenhadas até você rolar até elas</li><li>Detecção de quem está falando, prévia ao vivo da tela e filtro de conteúdo rodam com menos frequência</li><li>Não muda a qualidade da voz, da câmera nem da tela que você transmite</li></ul>`;
  box.querySelectorAll('[data-perf]').forEach(b => b.onclick = () => { P.perf = b.dataset.perf; savePrefs(); applyPerf(); renderSettings(); });
  box.querySelector('#pfAuto').onchange = e => { P.perfAuto = e.target.checked; savePrefs(); perfAutoCheck(); };
  box.querySelector('#pfShare').onchange = e => { P.perfShare = e.target.checked; savePrefs(); perfAutoCheck(); };
}
