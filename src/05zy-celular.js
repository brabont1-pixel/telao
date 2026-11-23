/* =====================================================================
   v6.34: SOM DE OUTROS APPS VAZANDO NA CALL PELO CELULAR
   Quem está na call pelo celular e sai para o TikTok/YouTube/Instagram continua com o microfone
   aberto, e o microfone pega o som do alto-falante. O cancelamento de eco só tira o som da própria
   call, não o dos outros apps. Agora, no celular, o Telão muta o seu microfone quando você sai dele
   e desmuta quando você volta. Dá para desligar (ex.: quem fala com a tela bloqueada).
   ===================================================================== */
const IS_PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
const HM = { auto: false, t: null };
App.isPhone = IS_PHONE;
document.addEventListener('visibilitychange', () => {
  if(!IS_PHONE || P.muteOnHide === false) return;
  clearTimeout(HM.t);
  if(document.hidden){
    if(!Voice.channel || Voice.muted || Voice.deafened || Voice.forceMuted) return;
    HM.t = setTimeout(() => {
      if(!document.hidden || !Voice.channel || Voice.muted) return;
      Voice.muted = true; HM.auto = true; Voice.applyMicState();
    }, 800);
  } else if(HM.auto){
    HM.auto = false;
    if(Voice.channel && Voice.muted && !Voice.forceMuted){
      Voice.muted = false; Voice.applyMicState(); App.sfx && App.sfx('unmute');
      if(!ls.get('telao-hm-tip', false)){
        ls.set('telao-hm-tip', true);
        App.toast('🎙️ Seu microfone voltou. Ele fica mutado enquanto você está fora do Telão, para o som do TikTok e de outros apps não vazar na call. Dá para mudar em Configurações → Voz e vídeo.');
      } else App.toast('🎙️ Microfone de volta');
    }
  }
});
const _secVoiceHM = secVoice;
secVoice = function(box, back){
  _secVoiceHM.apply(this, arguments);
  box.insertAdjacentHTML('beforeend', `<hr class="sdiv"><h3>📱 No celular</h3>
    ${row('Mutar o microfone quando eu sair do Telão', 'Enquanto você está em outro app (TikTok, YouTube, Instagram…) o microfone fica mutado, para o som dele não vazar na call. Volta sozinho quando você abre o Telão de novo. Desligue se você costuma falar com a tela bloqueada.' + (IS_PHONE ? '' : ' (Só vale no celular.)'), toggle('hmOn', P.muteOnHide !== false))}`);
  box.querySelector('#hmOn').onchange = e => { P.muteOnHide = e.target.checked; savePrefs(); };
};
