/* =====================================================================
   TELÃO — motor de voz e compartilhamento de tela (WebRTC em malha)
   Sinalização via Supabase Realtime (broadcast) + presença.
   ===================================================================== */
(function(){
  const SESSION = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

  // Vídeo: começa já num bitrate alto (Chrome), em vez de subir aos poucos
  function boostVideo(sdp){
    const kbps = Math.round(Math.min(Voice.screenSettings.bitrate, 6000000) / 1000);
    const pts = [...sdp.matchAll(/a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\/90000/gi)].map(m => m[1]);
    pts.forEach(pt => {
      const re = new RegExp('a=fmtp:'+pt+' ([^\\r\\n]*)');
      if(re.test(sdp)) sdp = sdp.replace(re, (l, p) => /x-google-start-bitrate/.test(p) ? l : l + ';x-google-start-bitrate=' + kbps);
      else sdp = sdp.replace(new RegExp('(a=rtpmap:'+pt+' [^\\r\\n]*)'), '$1\r\na=fmtp:'+pt+' x-google-start-bitrate=' + kbps);
    });
    return sdp;
  }
  function boostOpus(sdp){
    sdp = boostVideo(sdp);
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if(!m) return sdp;
    // qualidade da voz: o canal define o teto (padrão 96 kbps); FEC deixa a voz firme mesmo com internet ruim
    const kb = Math.max(32, Math.min(510, (Voice.channel && Voice.channel.bitrate) || 96));
    const pt = m[1], want = ['stereo=1','sprop-stereo=1','maxaveragebitrate=' + (kb * 1000),'useinbandfec=1','usedtx=0','maxplaybackrate=48000'];
    const re = new RegExp('a=fmtp:'+pt+' ([^\\r\\n]*)');
    if(re.test(sdp)) return sdp.replace(re,(l,p)=>{
      const keep = p.split(';').map(x=>x.trim()).filter(x=>x && !want.some(w=>x.split('=')[0]===w.split('=')[0]));
      return 'a=fmtp:'+pt+' '+keep.concat(want).join(';');
    });
    return sdp.replace(m[0], m[0]+'\r\na=fmtp:'+pt+' '+want.join(';'));
  }

  const Voice = {
    SESSION,
    channel: null,          // canal de voz atual {id, name, server_id, kind}
    topic: null,            // tópico de presença usado
    presenceCh: null,
    sigCh: null,
    micStream: null,
    screenStream: null,
    camStream: null,
    quality: 'good',
    onFx: ()=>{},
    peers: new Map(),       // session -> peer
    infos: new Map(),       // session -> meta de presença
    muted: false,
    deafened: false,
    screenSettings: { w:1920, h:1080, fps:60, bitrate:8000000, mode:'motion' },
    speaking: new Set(),    // sessions falando
    audioCtx: null,
    analysers: new Map(),   // session -> {an, buf, src}
    onChange: ()=>{},       // a UI substitui
    onSpeaking: ()=>{},
    userVolumes: new Map(), // user_id -> 0..2

    get active(){ return !!this.channel; },
    pttDown: false,
    prefs(){ return (window.App && App.prefs) || {}; },
    /* nível de ruído: 'off' | 'padrao' (filtro do navegador) | 'forte' (navegador + isolamento de voz + portão de ruído)
       modo música: desliga todo processamento para mandar o som limpo (violão, beat, etc.) */
    noiseLevel(){ const P = this.prefs(); return P.noiseLevel || (P.noise === false ? 'off' : 'forte'); },
    micConstraints(){
      const P = this.prefs(), lvl = this.noiseLevel(), music = !!P.musicMode;
      const sup = (navigator.mediaDevices.getSupportedConstraints && navigator.mediaDevices.getSupportedConstraints()) || {};
      const c = { echoCancellation: !music && P.echo !== false, noiseSuppression: !music && lvl !== 'off', autoGainControl: !music && P.agc !== false,
        channelCount: music ? { ideal: 2 } : { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 } };
      if(sup.voiceIsolation && !music && lvl === 'forte') c.voiceIsolation = true;
      if(P.inputId) c.deviceId = { exact: P.inputId };
      return { audio: c };
    },
    async getMic(){
      let raw;
      try{ raw = await navigator.mediaDevices.getUserMedia(this.micConstraints()); }
      catch(e){
        if(e.name === 'OverconstrainedError' || e.name === 'NotFoundError'){ // microfone escolhido sumiu: usa o padrão
          const c = this.micConstraints(); delete c.audio.deviceId; raw = await navigator.mediaDevices.getUserMedia(c);
        } else throw e;
      }
      return this.processMic(raw);
    },
    /* cadeia de áudio: corta grave de vento/ventilador, nivela a voz e fecha o microfone no silêncio (portão de ruído) */
    processMic(raw){
      const P = this.prefs(), lvl = this.noiseLevel();
      if(P.musicMode || lvl !== 'forte' || !(window.AudioContext || window.webkitAudioContext)) return raw;
      try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
        const src = ctx.createMediaStreamSource(raw);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85; hp.Q.value = 0.7;
        const hum = ctx.createBiquadFilter(); hum.type = 'notch'; hum.frequency.value = 60; hum.Q.value = 12;
        const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.gain.value = 2; pres.Q.value = 0.9;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
        const gate = ctx.createGain(); gate.gain.value = 1;
        const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0;
        const dst = ctx.createMediaStreamDestination();
        src.connect(hp).connect(hum).connect(pres).connect(comp).connect(gate).connect(dst);
        hp.connect(an);
        const buf = new Float32Array(an.fftSize);
        let floor = -60, open = false, holdUntil = 0;
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          let sum = 0; for(let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const db = 10 * Math.log10(sum / buf.length + 1e-12);
          // aprende o nível do ruído de fundo devagar
          if(!open) floor = floor * 0.995 + db * 0.005; else floor = Math.min(floor, floor * 0.9995 + db * 0.0005);
          const thr = Math.max(-58, Math.min(-28, floor + 9 + ((P.gateBoost || 0))));
          const now = ctx.currentTime;
          if(db > thr){ holdUntil = now + 0.28; if(!open){ open = true; gate.gain.cancelScheduledValues(now); gate.gain.setTargetAtTime(1, now, 0.006); } }
          else if(open && now > holdUntil){ open = false; gate.gain.cancelScheduledValues(now); gate.gain.setTargetAtTime(0.03, now, 0.06); }
        };
        const iv = setInterval(tick, 10);
        const out = dst.stream;
        out._raw = raw; out._ctx = ctx; out._iv = iv;
        const t = out.getAudioTracks()[0]; if(t && 'contentHint' in t) t.contentHint = 'speech';
        if(ctx.state === 'suspended') ctx.resume().catch(() => {});
        return out;
      }catch(e){ return raw; }
    },
    stopStream(s){
      if(!s) return;
      s.getTracks().forEach(t => t.stop());
      if(s._raw) s._raw.getTracks().forEach(t => t.stop());
      if(s._iv) clearInterval(s._iv);
      if(s._ctx) try{ s._ctx.close(); }catch(e){}
    },
    micEnabled(){
      const P = this.prefs();
      return !this.muted && !this.deafened && !this.forceMuted && !this.forceDeaf && (P.mode !== 'ptt' || this.pttDown);
    },
    setPtt(down){
      if(this.pttDown === down) return;
      this.pttDown = down;
      if(this.micStream) this.micStream.getAudioTracks().forEach(t => t.enabled = this.micEnabled());
      if(this.channel && this.prefs().mode === 'ptt' && this.prefs().soundPtt) App.sfx(down ? 'unmute' : 'mute');
      this.onSpeaking();
    },
    /* troca o microfone durante a chamada (dispositivo ou filtros mudaram) */
    async switchMic(){
      if(!this.channel) return;
      let ns;
      try{ ns = await this.getMic(); }catch(e){ App.toast('Não consegui usar esse microfone: ' + e.message, true); return; }
      const nt = ns.getAudioTracks()[0];
      nt.enabled = this.micEnabled(); if('contentHint' in nt) nt.contentHint = this.prefs().musicMode ? 'music' : 'speech';
      const old = this.micStream;
      this.peers.forEach(p => {
        const snd = p.micSenders && p.micSenders[0];
        if(snd) snd.replaceTrack(nt).catch(()=>{});
        else p.micSenders = [p.pc.addTrack(nt, ns)];
      });
      this.micStream = ns;
      if(old) this.stopStream(old);
      const a = this.analysers.get(SESSION); if(a){ try{a.src.disconnect();}catch(e){} this.analysers.delete(SESSION); }
      this.addAnalyser(SESSION, ns);
      this.track();
    },
    applySink(){
      const id = this.prefs().outputId || '';
      this.peers.forEach(p => p.audioEls.forEach(a => { if(a.setSinkId) a.setSinkId(id).catch(()=>{}); }));
    },

    ensureCtx(){
      try{ if(!this.audioCtx) this.audioCtx = new (window.AudioContext||window.webkitAudioContext)(); this.audioCtx.resume(); }catch(e){}
    },

    async join(channel, presenceCh, topic){
      if(this.channel && this.channel.id === channel.id) return;
      if(this.channel) await this.leave();
      this.ensureCtx();
      this.channel = channel; this.topic = topic; this.presenceCh = presenceCh;
      try{
        this.micStream = await this.getMic();
        this.micStream.getAudioTracks().forEach(t=>{ t.enabled = this.micEnabled(); if('contentHint' in t) t.contentHint='speech'; });
        this.addAnalyser(SESSION, this.micStream);
      }catch(e){
        this.micStream = null;
        window.App && App.toast('Sem acesso ao microfone — você entrou só para ouvir.', true);
      }
      this.sigCh = App.sb.channel('rtc:'+channel.id, { config:{ broadcast:{ self:false } } });
      this.sigCh.on('broadcast', { event:'sig' }, ({payload}) => this.onSignal(payload));
      this.sigCh.on('broadcast', { event:'fx' }, ({payload}) => this.onFx(payload, false));
      await new Promise(res => this.sigCh.subscribe(st => { if(st==='SUBSCRIBED') res(); }));
      await this.track();
      this.syncPeers();
      this.startSpeakLoop();
      this.onChange();
    },

    async leave(){
      if(!this.channel) return;
      this.stopScreen(true); this.stopCamera(true);
      this.peers.forEach((p,id)=>this.closePeer(id));
      this.peers.clear();
      if(this.micStream){ this.stopStream(this.micStream); this.micStream=null; }
      this.analysers.forEach(a=>{ try{a.src.disconnect();}catch(e){} }); this.analysers.clear();
      this.speaking.clear();
      try{ this.presenceCh && await this.presenceCh.untrack(); }catch(e){}
      try{ this.sigCh && App.sb.removeChannel(this.sigCh); }catch(e){}
      this.sigCh = null; this.presenceCh = null; this.channel = null; this.topic = null;
      clearInterval(this._speakTimer);
      this.onChange();
    },

    async track(){
      if(!this.presenceCh || !this.channel) return;
      const me = App.me;
      try{
        await this.presenceCh.track({
          session: SESSION, user_id: me.id, voice: this.channel.id,
          muted: this.muted || this.forceMuted || !this.micStream, deafened: this.deafened || this.forceDeaf, smod: !!(this.forceMuted || this.forceDeaf),
          sharing: !!this.screenStream, screen: this.screenStream ? this.screenStream.id : null,
          camera: !!this.camStream, cam: this.camStream ? this.camStream.id : null,
          at: Date.now()
        });
      }catch(e){ console.warn('track', e); }
    },

    /* chamado pela UI quando a presença do tópico muda */
    onPresence(topic, metas){
      if(topic !== this.topic || !this.channel) return;
      this.infos.clear();
      metas.forEach(m => { if(m.voice === this.channel.id && m.session !== SESSION) this.infos.set(m.session, m); });
      this.syncPeers();
      this.onChange();
    },

    waitSince: new Map(),
    syncPeers(){
      if(!this.channel) return;
      // só um lado começa a conexão (evita duas ofertas ao mesmo tempo);
      // o outro espera a oferta e, se ela não vier em 2,5 s, começa ele mesmo
      this.infos.forEach((info, sess) => {
        if(this.peers.has(sess)) return;
        if(SESSION > sess){ this.createPeer(sess); return; }
        if(!this.waitSince.has(sess)){ this.waitSince.set(sess, Date.now()); setTimeout(() => this.syncPeers(), 2600); return; }
        if(Date.now() - this.waitSince.get(sess) > 2500) this.createPeer(sess);
      });
      this.waitSince.forEach((t, sess) => { if(!this.infos.has(sess) || this.peers.has(sess)) this.waitSince.delete(sess); });
      this.peers.forEach((p, sess) => {
        // tolerância: a oferta pode chegar antes da presença do outro
        if(!this.infos.has(sess)){ if(Date.now() - p.created > 8000) this.closePeer(sess); }
        else this.dropStaleScreen(sess);
      });
    },

    sendFx(payload){
      payload = { ...payload, from: SESSION, uid: App.me.id };
      this.onFx(payload, true);
      if(this.sigCh) this.sigCh.send({ type:'broadcast', event:'fx', payload }).catch(()=>{});
    },
    send(to, data){
      if(!this.sigCh) return;
      this.sigCh.send({ type:'broadcast', event:'sig', payload:{ from:SESSION, to, ...data } });
    },

    createPeer(remote){
      const pc = new RTCPeerConnection({ iceServers: (window.TELAO_CONFIG && TELAO_CONFIG.ICE_SERVERS) || [{urls:'stun:stun.l.google.com:19302'}] });
      const p = { pc, remote, polite: SESSION < remote, created: Date.now(), makingOffer:false, ignoreOffer:false,
                  queue: Promise.resolve(), streams: new Map(), audioEls: new Map(), screenSenders: [] };
      this.peers.set(remote, p);

      pc.onicecandidate = e => { if(e.candidate) this.send(remote, { candidate: e.candidate.toJSON() }); };
      pc.onnegotiationneeded = async () => {
        try{
          p.makingOffer = true;
          const offer = await pc.createOffer();
          if(pc.signalingState !== 'stable') return;
          await pc.setLocalDescription({ type:'offer', sdp: boostOpus(offer.sdp) });
          p.offerAt = Date.now();
          this.send(remote, { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        }catch(e){ console.warn('negotiation', e); }
        finally{ p.makingOffer = false; }
      };
      pc.ontrack = e => {
        const s = (e.streams && e.streams[0]) || new MediaStream([e.track]);
        if(!p.streams.has(s.id)){
          p.streams.set(s.id, s);
          s.addEventListener('removetrack', () => { if(!s.getTracks().length){ this.removeStream(p, s.id); } this.onChange(); });
        }
        if(e.track.kind === 'audio') this.attachAudio(p, s);
        e.track.addEventListener('ended', () => this.onChange());
        e.track.addEventListener('mute', () => this.onChange());
        e.track.addEventListener('unmute', () => this.onChange());
        this.onChange();
      };
      pc.onsignalingstatechange = () => { if(pc.signalingState === 'stable') this.applyParams(p); };
      pc.onconnectionstatechange = () => {
        if(pc.connectionState === 'failed' && !p.polite){ try{ pc.restartIce(); }catch(e){} }
        if(pc.connectionState === 'connected') p.restarts = 0;
        this.onChange();
      };
      // vigia: se não conectar em alguns segundos, refaz a rota (ICE restart)
      p.restarts = 0;
      p.watch = setInterval(() => {
        if(pc.signalingState === 'closed'){ clearInterval(p.watch); return; }
        // oferta sem resposta (perdida no caminho): desfaz e manda de novo
        if(pc.signalingState === 'have-local-offer' && p.offerAt && !p.makingOffer && Date.now() - p.offerAt > (p.polite ? 4000 : 5500)){
          p.offerAt = 0;
          (async () => { try{ await pc.setLocalDescription({ type:'rollback' }); pc.restartIce(); }catch(e){} })();
          return;
        }
        const bad = ['new','failed','disconnected'].includes(pc.connectionState);
        if(!bad){ p.badSince = 0; return; }
        if(!p.badSince){ p.badSince = Date.now(); return; }
        if(Date.now() - p.badSince > 5000 && pc.signalingState === 'stable' && p.restarts < 6){
          p.restarts++; p.badSince = Date.now();
          try{ pc.restartIce(); }catch(e){}
        }
      }, 1500);

      p.micSenders = this.micStream ? this.micStream.getTracks().map(t => pc.addTrack(t, this.micStream)) : [];
      if(this.screenStream) this.screenStream.getTracks().forEach(t => p.screenSenders.push(pc.addTrack(t, this.screenStream)));
      p.camSenders = this.camStream ? this.camStream.getTracks().map(t => pc.addTrack(t, this.camStream)) : [];
      return p;
    },

    closePeer(sess){
      const p = this.peers.get(sess); if(!p) return;
      clearInterval(p.watch);
      try{ p.pc.close(); }catch(e){}
      p.audioEls.forEach(a => { a.srcObject = null; a.remove(); });
      const an = this.analysers.get(sess); if(an){ try{an.src.disconnect();}catch(e){} this.analysers.delete(sess); }
      this.speaking.delete(sess);
      this.peers.delete(sess);
    },

    onSignal(msg){
      if(!msg || msg.to !== SESSION || !this.channel) return;
      let p = this.peers.get(msg.from);
      if(!p) p = this.createPeer(msg.from);
      p.queue = p.queue.then(() => this.handleSignal(p, msg)).catch(e => console.warn('sig', e));
    },

    async handleSignal(p, msg){
      const pc = p.pc;
      if(msg.sdp){
        const desc = msg.sdp;
        const collision = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if(p.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if(desc.type === 'offer'){
          const ans = await pc.createAnswer();
          await pc.setLocalDescription({ type:'answer', sdp: boostOpus(ans.sdp) });
          this.send(p.remote, { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        }
      } else if(msg.candidate){
        try{ await pc.addIceCandidate(msg.candidate); }
        catch(e){ if(!p.ignoreOffer) console.warn('ice', e); }
      }
    },

    attachAudio(p, s){
      let a = p.audioEls.get(s.id);
      if(!a){
        a = document.createElement('audio');
        a.autoplay = true; a.playsInline = true; a.style.display = 'none';
        document.body.appendChild(a);
        p.audioEls.set(s.id, a);
      }
      if(a.srcObject !== s) a.srcObject = s;
      const sink = this.prefs().outputId; if(sink && a.setSinkId) a.setSinkId(sink).catch(()=>{});
      this.applyVolume(p);
      a.play().catch(err => { if(err && err.name !== 'AbortError') App.needAudioUnlock(); });
      // detector de fala só no microfone (stream sem vídeo)
      if(!s.getVideoTracks().length && !this.analysers.has(p.remote)) this.addAnalyser(p.remote, s);
    },

    removeStream(p, id){
      p.streams.delete(id);
      const a = p.audioEls.get(id); if(a){ a.srcObject=null; a.remove(); p.audioEls.delete(id); }
    },

    dropStaleScreen(sess){
      const p = this.peers.get(sess), info = this.infos.get(sess);
      if(!p || !info) return;
      p.streams.forEach((s, id) => {
        if(!s.getVideoTracks().length) return;
        if(id === info.screen || id === info.cam) return;
        if(!info.sharing && !info.camera) this.removeStream(p, id);
        else if(s.getVideoTracks().every(t => t.readyState === 'ended' || t.muted)) this.removeStream(p, id);
      });
    },

    unlockAudio(){
      this.ensureCtx();
      this.peers.forEach(p => p.audioEls.forEach(a => a.play().catch(()=>{})));
    },

    screenVolumes: new Map(),
    ducking: false,
    applyVolume(p){
      const info = this.infos.get(p.remote), uid = info && info.user_id;
      const voice = uid ? (this.userVolumes.get(uid) ?? 1) : 1;
      const scr = (uid ? (this.screenVolumes.get(uid) ?? 1) : 1) * (this.ducking ? 0.25 : 1);
      p.streams.forEach((s, id) => {
        const a = p.audioEls.get(id); if(!a) return;
        const isScreen = s.getVideoTracks().length > 0 || (info && info.screen === id);
        a.muted = this.deafened || this.forceDeaf;
        // silenciado por um moderador: ninguém ouve a voz dele (vale mesmo se ele tentar burlar)
        const modMuted = !isScreen && uid && App.srvVoiceMuted && App.srvVoiceMuted(uid);
        a.volume = modMuted ? 0 : Math.max(0, Math.min(1, isScreen ? scr : voice));
      });
    },
    setUserVolume(userId, v){ this.userVolumes.set(userId, v); this.peers.forEach(p => this.applyVolume(p)); },
    setScreenVolume(userId, v){ this.screenVolumes.set(userId, v); this.peers.forEach(p => this.applyVolume(p)); },

    forceMuted: false, forceDeaf: false,
    setForced(m, d){
      const ch = this.forceMuted !== m || this.forceDeaf !== d;
      this.forceMuted = !!m; this.forceDeaf = !!d;
      if(ch){ this.applyMicState(); App.sfx(m || d ? 'mute' : 'unmute'); }
    },
    toggleMute(){
      if(this.forceMuted || this.forceDeaf){ App.toast('🔇 Um moderador silenciou você nesta chamada.', true); return; }
      if(this.deafened){ this.deafened = false; this.muted = false; }
      else this.muted = !this.muted;
      this.applyMicState(); App.sfx(this.muted ? 'mute' : 'unmute');
    },
    toggleDeafen(){
      if(this.forceDeaf){ App.toast('🔇 Um moderador ensurdeceu você nesta chamada.', true); return; }
      this.deafened = !this.deafened;
      this.applyMicState(); App.sfx(this.deafened ? 'mute' : 'unmute');
    },
    applyMicState(){
      if(this.micStream) this.micStream.getAudioTracks().forEach(t => t.enabled = this.micEnabled());
      this.peers.forEach(p => this.applyVolume(p));
      this.track(); this.onChange();
    },

    /* ---------- tela ---------- */
    async startScreen(){
      if(!this.channel){ App.toast('Entre num canal de voz primeiro', true); return; }
      if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){ App.toast('Seu navegador não compartilha tela. Use Chrome ou Edge no computador.', true); return; }
      const st = this.screenSettings;
      let s;
      try{
        s = await navigator.mediaDevices.getDisplayMedia({
          video: { width:{ideal:st.w}, height:{ideal:st.h}, frameRate:{ideal:st.fps, max:st.fps} },
          // restrictOwnAudio: tira o som da própria chamada da captura (senão todo mundo ouve a call de novo pela tela)
          audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false, suppressLocalAudioPlayback:false, restrictOwnAudio:true },
          systemAudio:'include', surfaceSwitching:'include', selfBrowserSurface:'exclude'
        });
      }catch(e){ if(e.name !== 'NotAllowedError') App.toast('Não foi possível capturar: '+e.message, true); return; }
      if(this.screenStream) this.stopScreen(true);
      this.screenStream = s;
      const vt = s.getVideoTracks()[0];
      if('contentHint' in vt) vt.contentHint = st.mode;
      s.getAudioTracks().forEach(t => { if('contentHint' in t) t.contentHint = 'music'; });
      vt.addEventListener('ended', () => this.stopScreen());
      this.peers.forEach(p => { s.getTracks().forEach(t => p.screenSenders.push(p.pc.addTrack(t, s))); });
      const sup = navigator.mediaDevices.getSupportedConstraints ? navigator.mediaDevices.getSupportedConstraints() : {};
      const surface = (vt.getSettings && vt.getSettings().displaySurface) || '';
      if(s.getAudioTracks().length && !sup.restrictOwnAudio && surface === 'monitor')
        App.toast('Dica: seu navegador ainda não separa o som da chamada da tela inteira. Use fone de ouvido, ou compartilhe só uma aba/janela do jogo, para ninguém ouvir eco.');
      else if(!s.getAudioTracks().length) App.toast('⚠️ Tela SEM áudio. Para mandar som: “Tela inteira” + “Compartilhar áudio do sistema”, ou uma aba + “Compartilhar áudio da aba”.', true);
      else App.toast('Compartilhando tela com áudio 🎧');
      this.track(); this.onChange();
    },

    stopScreen(silent){
      if(!this.screenStream) return;
      this.screenStream.getTracks().forEach(t => t.stop());
      this.peers.forEach(p => { p.screenSenders.forEach(snd => { try{ p.pc.removeTrack(snd); }catch(e){} }); p.screenSenders = []; });
      this.screenStream = null;
      if(!silent){ this.track(); }
      this.onChange();
    },

    updateScreenSettings(st){
      Object.assign(this.screenSettings, st);
      if(!this.screenStream) return;
      const vt = this.screenStream.getVideoTracks()[0];
      if('contentHint' in vt) vt.contentHint = this.screenSettings.mode;
      vt.applyConstraints({ width:{ideal:this.screenSettings.w}, height:{ideal:this.screenSettings.h}, frameRate:{ideal:this.screenSettings.fps, max:this.screenSettings.fps} }).catch(()=>{});
      this.peers.forEach(p => this.applyParams(p));
    },

    applyParams(p){
      p.pc.getSenders().forEach(s => {
        if(!s.track) return;
        const prm = s.getParameters();
        if(!prm.encodings || !prm.encodings.length) return;
        if(s.track.kind === 'video' && this.camStream && this.camStream.getVideoTracks().includes(s.track)){
          prm.encodings[0].maxBitrate = 1500000; prm.encodings[0].maxFramerate = 30;
        } else if(s.track.kind === 'video'){
          prm.encodings[0].maxBitrate = this.screenSettings.bitrate;
          prm.encodings[0].maxFramerate = this.screenSettings.fps;
          prm.degradationPreference = this.screenSettings.mode === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
        } else {
          const isScreenAudio = this.screenStream && this.screenStream.getAudioTracks().includes(s.track);
          prm.encodings[0].maxBitrate = isScreenAudio ? 510000 : 96000;
        }
        s.setParameters(prm).catch(()=>{});
      });
    },

    /* telas e câmeras disponíveis: [{session, user_id, stream, mine, kind}] */
    videos(kind){
      const out = [];
      const mine = kind === 'screen' ? this.screenStream : this.camStream;
      if(mine) out.push({ session:SESSION, user_id:App.me.id, stream:mine, mine:true, kind });
      this.peers.forEach((p, sess) => {
        const info = this.infos.get(sess);
        if(!info || !(kind === 'screen' ? info.sharing : info.camera)) return;
        const live = [...p.streams.values()].filter(s => s.getVideoTracks().some(t => t.readyState === 'live' && !t.muted));
        const want = kind === 'screen' ? info.screen : info.cam, other = kind === 'screen' ? info.cam : info.screen;
        const s = live.find(x => x.id === want) || live.filter(x => x.id !== other).pop();
        if(s) out.push({ session:sess, user_id:info.user_id, stream:s, mine:false, pc:p.pc, kind });
      });
      return out;
    },
    screens(){ return this.videos('screen'); },
    cams(){ return this.videos('camera'); },

    /* ---------- câmera ---------- */
    camFx: null,
    async openCamFx(){
      const cid = this.prefs().camId;
      const raw = await navigator.mediaDevices.getUserMedia({ video: { width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}, facingMode:'user', ...(cid ? { deviceId:{ exact:cid } } : {}) } });
      const fx = window.CamFX ? CamFX.create(raw) : { stream: raw, source: raw, setEffect(){}, stop(){ raw.getTracks().forEach(t => t.stop()); }, onStatus(){} };
      await fx.setEffect(this.prefs().camFx || 'none');
      return fx;
    },
    async startCamera(pre){
      if(!this.channel){ App.toast('Entre numa chamada primeiro', true); if(pre) pre.stop(); return; }
      let fx = pre;
      if(!fx){
        try{ fx = await this.openCamFx(); }
        catch(e){ App.toast('Não consegui abrir a câmera: ' + (e.name === 'NotAllowedError' ? 'permissão negada' : e.message), true); return; }
      }
      if(this.camStream) this.stopCamera(true);
      this.camFx = fx; this.camStream = fx.stream;
      fx.source.getVideoTracks()[0].addEventListener('ended', () => this.stopCamera());
      this.peers.forEach(p => { p.camSenders = fx.stream.getVideoTracks().map(t => p.pc.addTrack(t, fx.stream)); });
      App.sfx('cam'); this.track(); this.onChange();
    },
    setCamEffect(id){ if(this.camFx) this.camFx.setEffect(id); },
    stopCamera(silent){
      if(!this.camStream) return;
      if(this.camFx){ this.camFx.stop(); this.camFx = null; } else this.camStream.getTracks().forEach(t => t.stop());
      this.peers.forEach(p => { (p.camSenders || []).forEach(snd => { try{ p.pc.removeTrack(snd); }catch(e){} }); p.camSenders = []; });
      this.camStream = null;
      if(!silent) this.track();
      this.onChange();
    },
    /* qualidade da conexão (ping) */
    async checkQuality(){
      const p = [...this.peers.values()][0]; if(!p){ this.quality = 'good'; return; }
      try{
        const st = await p.pc.getStats(); let rtt = null;
        st.forEach(r => { if(r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000; });
        this.rtt = rtt;
        const q = rtt == null ? 'good' : rtt < 150 ? 'good' : rtt < 350 ? 'ok' : 'bad';
        if(q !== this.quality){ this.quality = q; this.onChange(); }
      }catch(e){}
    },

    /* ---------- detector de fala ---------- */
    addAnalyser(sess, stream){
      if(!this.audioCtx) return;
      try{
        const tr = stream.getAudioTracks()[0]; if(!tr) return;
        const src = this.audioCtx.createMediaStreamSource(new MediaStream([tr]));
        const an = this.audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an);
        this.analysers.set(sess, { an, src, buf: new Uint8Array(an.fftSize) });
      }catch(e){}
    },
    startSpeakLoop(){
      clearInterval(this._speakTimer);
      this._speakTimer = setInterval(() => {
        let changed = false;
        this.analysers.forEach((a, sess) => {
          a.an.getByteTimeDomainData(a.buf);
          let sum = 0; for(const x of a.buf){ const d = x - 128; sum += d*d; }
          const rms = Math.sqrt(sum / a.buf.length);
          let talking = rms > 4;
          if(sess === SESSION && !this.micEnabled()) talking = false;
          if(sess === SESSION && talking){ const th = this.prefs().sensitivity ?? 4; if(rms < th) talking = false; }
          const info = this.infos.get(sess);
          if(info && info.muted) talking = false;
          if(talking !== this.speaking.has(sess)){ talking ? this.speaking.add(sess) : this.speaking.delete(sess); changed = true; }
        });
        if(changed) this.onSpeaking();
        // abaixa o som das telas enquanto alguém fala (com 1s de "soltura" pra não ficar pulsando)
        const talkingNow = this.prefs().duck !== false && [...this.speaking].some(x => x !== SESSION) && this.peers.size > 0 && this.screens().some(sc => !sc.mine);
        if(talkingNow) this._duckUntil = Date.now() + 1000;
        const duck = talkingNow || Date.now() < (this._duckUntil || 0);
        if(duck !== this.ducking){ this.ducking = duck; this.peers.forEach(p => this.applyVolume(p)); }
        if((this._tick = (this._tick||0) + 1) % 40 === 0){ this.syncPeers(); this.checkQuality(); }
      }, 120);
    }
  };

  window.Voice = Voice;
})();
