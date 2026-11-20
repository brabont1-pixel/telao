/* =====================================================================
   v6.27: MODO STREAMER
   Esconde o que não deve aparecer na live (e-mail, links e códigos de convite, prévia de DMs)
   e silencia notificações. Liga sozinho quando você compartilha a tela (dá para desligar isso).
   ===================================================================== */
let stLast = null;
App.streamerOn = () => !!P.streamer || (P.streamerAuto !== false && !!Voice.screenStream);
function stApply(){
  const on = App.streamerOn();
  if(on === stLast) return; stLast = on;
  document.body.classList.toggle('streamer', on);
  let pill = document.getElementById('stPill');
  if(on && !pill){
    pill = document.createElement('button'); pill.id = 'stPill'; pill.className = 'stpill';
    pill.innerHTML = `<span class="dot"></span>MODO STREAMER<small>${P.streamer ? 'desligar' : 'ligado porque você está transmitindo'}</small>`;
    pill.onclick = () => { if(P.streamer){ P.streamer = false; savePrefs(); stApply(); } else stModal(); };
    document.body.appendChild(pill);
  } else if(!on && pill) pill.remove();
}
setInterval(stApply, 1000);
App.toggleStreamer = () => { P.streamer = !P.streamer; savePrefs(); stLast = null; stApply(); App.toast(P.streamer ? 'Modo streamer ligado' : 'Modo streamer desligado'); };
function stModal(){
  modal(`<div class="mh"><h2>🎥 Modo streamer</h2><p>Ligou sozinho porque você está compartilhando a tela.</p></div>
    <div class="mc"><p class="small">Enquanto estiver ligado: seu e-mail e os links e códigos de convite ficam borrados, e as notificações e o som de mensagem ficam em silêncio.</p></div>
    <div class="mf"><button class="btn sec" id="stNo">Não ligar sozinho</button><button class="btn" data-close>Ok</button></div>`, m => {
    m.querySelector('#stNo').onclick = () => { P.streamerAuto = false; savePrefs(); closeModal(); stLast = null; stApply(); App.toast('O modo streamer não vai mais ligar sozinho. Dá para mudar em Configurações → Privacidade.'); };
  });
}
// atalho no menu do seu perfil (canto de baixo)
const _secPrivacyST = secPrivacy;
secPrivacy = function(box, back){
  _secPrivacyST.apply(this, arguments);
  box.insertAdjacentHTML('afterbegin', '');
  const h2 = box.querySelector('h2');
  const html = `<div class="stbox"><h3>🎥 Modo streamer</h3>
    ${row('Modo streamer', 'Borra seu e-mail e os links e códigos de convite, e silencia notificações e o som de mensagem. Bom para live e para mostrar a tela.', toggle('stOn', !!P.streamer))}
    ${row('Ligar sozinho quando eu compartilhar a tela', '', toggle('stAuto', P.streamerAuto !== false))}</div><hr class="sdiv">`;
  if(h2) h2.insertAdjacentHTML('afterend', html); else box.insertAdjacentHTML('afterbegin', html);
  box.querySelector('#stOn').onchange = e => { P.streamer = e.target.checked; savePrefs(); stLast = null; stApply(); };
  box.querySelector('#stAuto').onchange = e => { P.streamerAuto = e.target.checked; savePrefs(); stLast = null; stApply(); };
};
const _selfMenuExtraST = App.selfMenuExtra;
App.selfMenuExtra = () => (_selfMenuExtraST ? _selfMenuExtraST() : []).concat([{ label: P.streamer ? 'Desligar modo streamer' : 'Modo streamer', icon: ic('eyeOff', 18), onClick: () => App.toggleStreamer() }]);
