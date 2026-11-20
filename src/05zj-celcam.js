
/* ---------------- celular como câmera ----------------
   O PC mostra um QR code com um código secreto. O celular abre /cam, liga a câmera e as duas pontas
   combinam a conexão por um canal do Supabase (só a "apresentação"). O vídeo vai direto do celular
   para o PC (WebRTC), sem passar por servidor. Depois o Telão usa esse vídeo como a sua câmera. */
const PhoneCam = (() => {
  let ch = null, pc = null, token = null, renewTimer = null, tickTimer = null, expiresAt = 0, linked = false;
  const TTL = 120000;

  function loadQR(){
    if(window.qrcode) return Promise.resolve();
    return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = '/qrcode.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  }
  function newToken(){
    const b = new Uint8Array(18); crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function qrSvg(text){
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2; let d = '';
    for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0b0b10"/></svg>`;
  }
  const send = msg => ch && ch.send({ type: 'broadcast', event: 'm', payload: Object.assign({ from: 'pc' }, msg) });

  function closeLink(tellPhone){
    clearTimeout(renewTimer); clearInterval(tickTimer);
    if(tellPhone) try{ send({ t: 'bye' }); }catch(e){}
    const c = ch, p = pc; ch = null; pc = null; linked = false;
    try{ p && p.close(); }catch(e){}
    if(c) setTimeout(() => { try{ App.sb.removeChannel(c); }catch(e){} }, 400);
  }

  function setStatus(m, text, kind){
    const el = m.querySelector('#pcSt'); if(!el) return;
    el.querySelector('em').textContent = text;
    el.className = 'pcst ' + (kind || '');
  }

  async function freshCode(m){
    closeLink(false);
    token = newToken(); expiresAt = Date.now() + TTL;
    const url = location.origin + '/cam#t=' + token;
    const box = m.querySelector('#pcQr');
    try{ await loadQR(); box.innerHTML = qrSvg(url); }
    catch(e){ box.innerHTML = `<p class="pcqerr">Não carreguei o QR. Abra no celular:<br><b>${esc(url)}</b></p>`; }
    m.querySelector('#pcLink').onclick = () => copy(url);
    setStatus(m, 'Aguardando o celular…', 'wait');
    ch = App.sb.channel('phonecam:' + token, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'm' }, ({ payload: msg }) => onMsg(m, msg)).subscribe();
    renewTimer = setTimeout(() => { if(!linked && !m.isConnected) return; if(!linked) freshCode(m); }, TTL);
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      const t = m.querySelector('#pcTtl'); if(t) t.textContent = linked ? 'Conectando direto pela sua rede…' : `Este código se renova em ${left} s`;
    }, 500);
  }

  async function onMsg(m, msg){
    if(!msg || msg.from !== 'phone') return;
    if(msg.t === 'hello'){
      if(linked){ if(pc && pc.connectionState !== 'connected') return; return; }
      linked = true; clearTimeout(renewTimer);
      setStatus(m, 'Celular encontrado. Conectando…', 'wait');
      pc = new RTCPeerConnection({ iceServers: (window.TELAO_CONFIG && TELAO_CONFIG.ICE_SERVERS) || [] });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.onicecandidate = e => { if(e.candidate) send({ candidate: e.candidate.toJSON() }); };
      let started = false;
      pc.ontrack = e => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        const go = async () => {
          if(started) return; started = true;
          setStatus(m, 'Conectado!', 'ok');
          const myPc = pc;
          await Voice.startPhoneCamera(stream, () => { if(pc === myPc) closeLink(true); });
          setTimeout(() => { if(!$('#modal').classList.contains('hidden') && $('#modal').querySelector('#pcQr')) closeModal(); }, 350);
        };
        if(pc.connectionState === 'connected') go(); else e.track.onunmute = go;
      };
      pc.onconnectionstatechange = () => {
        const s = pc && pc.connectionState;
        if(s === 'failed'){
          App.toast('O celular não conseguiu conectar. Os dois precisam estar no mesmo Wi-Fi (ou configure um TURN).', true);
          if(Voice.camIsPhone) Voice.stopCamera(); else { closeLink(true); if(m.isConnected) freshCode(m); }
        }
      };
      const off = await pc.createOffer();
      await pc.setLocalDescription(off);
      send({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } else if(msg.sdp && msg.sdp.type === 'answer' && pc){
      try{ await pc.setRemoteDescription(msg.sdp); }catch(e){}
    } else if(msg.candidate && pc){
      try{ await pc.addIceCandidate(msg.candidate); }catch(e){}
    } else if(msg.t === 'bye'){
      if(Voice.camIsPhone){ App.toast('O celular parou de mandar a câmera.'); Voice.stopCamera(); }
      else { closeLink(false); if(m.isConnected) freshCode(m); }
    }
  }

  function open(note){
    if(!Voice.channel){ App.toast('Entre numa chamada primeiro', true); return; }
    if(!window.RTCPeerConnection){ App.toast('Seu navegador não faz conexão direta (WebRTC).', true); return; }
    modal(`<div class="mh"><h2>${ic('smartphone', 22)} Usar celular como câmera</h2>
        <p>${note ? esc(note) + ' ' : ''}Escaneie com o celular. A página abre no navegador dele, e o vídeo vem direto pela sua rede, sem passar por servidor nenhum.</p></div>
      <div class="mc pcbody">
        <div class="pcqrwrap"><div class="pcqr" id="pcQr"><div class="pcqload"></div></div><span class="pcscan"></span></div>
        <div class="pcst wait" id="pcSt"><i></i><em>Gerando código…</em></div>
        <small class="pcttl" id="pcTtl"></small>
        <ol class="pcsteps"><li>Abra a câmera do celular e aponte para o código</li><li>Toque no link e depois em <b>Começar</b></li><li>Pronto: o celular vira a sua câmera na chamada</li></ol>
      </div>
      <div class="mf"><button class="btn sec" id="pcLink">${ic('link', 16)} Copiar link</button><button class="btn sec" id="pcNo">Cancelar</button></div>`, m => {
      m.querySelector('.mbox').classList.add('pcmodal');
      m.querySelector('#pcNo').onclick = () => closeModal();
      freshCode(m.querySelector('.mbox') || m);
      const modalEl = $('#modal');
      const obs = new MutationObserver(() => { if(modalEl.classList.contains('hidden') || !modalEl.querySelector('#pcQr')){ obs.disconnect(); clearInterval(tickTimer); clearTimeout(renewTimer); if(!Voice.camIsPhone) closeLink(true); } });
      obs.observe(modalEl, { attributes: true, attributeFilter: ['class'], childList: true });
    });
  }
  return { open, stop: () => closeLink(true) };
})();
App.phoneCam = PhoneCam.open;
