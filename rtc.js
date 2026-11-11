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
    const pt = m[1], want = ['stereo=1','sprop-stereo=1','maxaveragebitrate=510000','useinbandfec=1'];
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
    micConstraints(){
      const P = this.prefs();
      const c = { echoCancellation: P.echo !== false, noiseSuppression: P.noise !== false, autoGainControl: P.agc !== false };
      if(P.inputId) c.deviceId = { exact: P.inputId };
      return { audio: c };
    },
    async getMic(){
      try{ return await navigator.mediaDevices.getUserMedia(this.micConstraints()); }
      catch(e){
        if(e.name === 'OverconstrainedError' || e.name === 'NotFoundError'){ // microfone escolhido sumiu: usa o padrão
          const c = this.micConstraints(); delete c.audio.deviceId; return navigator.mediaDevices.getUserMedia(c);
        }
        throw e;
      }
    },
    micEnabled(){
      const P = this.prefs();
      return !this.muted && !this.deafened && (P.mode !== 'ptt' || this.pttDown);
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
      nt.enabled = this.micEnabled(); if('contentHint' in nt) nt.contentHint = 'speech';
      const old = this.micStream;
      this.peers.forEach(p => {
        const snd = p.micSenders && p.micSenders[0];
        if(snd) snd.replaceTrack(nt).catch(()=>{});
        else p.micSenders = [p.pc.addTrack(nt, ns)];
      });
      this.micStream = ns;
      if(old) old.getTracks().forEach(t => t.stop());
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
      await new Promise(res => this.sigCh.subscribe(st => { if(st==='SUBSCRIBED') res(); }));
      await this.track();
      this.syncPeers();
      this.startSpeakLoop();
      this.onChange();
    },

    async leave(){
      if(!this.channel) return;
      this.stopScreen(true);
      this.peers.forEach((p,id)=>this.closePeer(id));
      this.peers.clear();
      if(this.micStream){ this.micStream.getTracks().forEach(t=>t.stop()); this.micStream=null; }
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
          muted: this.muted || !this.micStream, deafened: this.deafened,
          sharing: !!this.screenStream, screen: this.screenStream ? this.screenStream.id : null,
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

    syncPeers(){
      if(!this.channel) return;
      this.infos.forEach((info, sess) => { if(!this.peers.has(sess)) this.createPeer(sess); });
      this.peers.forEach((p, sess) => {
        // tolerância: a oferta pode chegar antes da presença do outro
        if(!this.infos.has(sess)){ if(Date.now() - p.created > 8000) this.closePeer(sess); }
        else this.dropStaleScreen(sess);
      });
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
        if(pc.connectionState === 'failed'){ try{ pc.restartIce(); }catch(e){} }
        this.onChange();
      };

      p.micSenders = this.micStream ? this.micStream.getTracks().map(t => pc.addTrack(t, this.micStream)) : [];
      if(this.screenStream) this.screenStream.getTracks().forEach(t => p.screenSenders.push(pc.addTrack(t, this.screenStream)));
      return p;
    },

    closePeer(sess){
      const p = this.peers.get(sess); if(!p) return;
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
      if(info.sharing) return;
      p.streams.forEach((s, id) => { if(s.getVideoTracks().length) this.removeStream(p, id); });
    },

    unlockAudio(){
      this.ensureCtx();
      this.peers.forEach(p => p.audioEls.forEach(a => a.play().catch(()=>{})));
    },

    applyVolume(p){
      const info = this.infos.get(p.remote);
      const v = info ? (this.userVolumes.get(info.user_id) ?? 1) : 1;
      p.audioEls.forEach(a => { a.muted = this.deafened; a.volume = Math.min(1, v); });
    },
    setUserVolume(userId, v){ this.userVolumes.set(userId, v); this.peers.forEach(p => this.applyVolume(p)); },

    toggleMute(){
      if(this.deafened){ this.deafened = false; this.muted = false; }
      else this.muted = !this.muted;
      this.applyMicState(); App.sfx(this.muted ? 'mute' : 'unmute');
    },
    toggleDeafen(){
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
          audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false, suppressLocalAudioPlayback:false },
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
      if(!s.getAudioTracks().length) App.toast('⚠️ Tela SEM áudio. Para mandar som: “Tela inteira” + “Compartilhar áudio do sistema”, ou uma aba + “Compartilhar áudio da aba”.', true);
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
        if(s.track.kind === 'video'){
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

    /* telas disponíveis para assistir: [{session, user_id, stream, mine}] */
    screens(){
      const out = [];
      if(this.screenStream) out.push({ session:SESSION, user_id:App.me.id, stream:this.screenStream, mine:true });
      this.peers.forEach((p, sess) => {
        const info = this.infos.get(sess);
        if(!info || !info.sharing) return;
        const vids = [...p.streams.values()].filter(s => s.getVideoTracks().some(t => t.readyState === 'live' && !t.muted));
        if(!vids.length) return;
        // prefere a tela anunciada na presença; senão a mais recente
        const s = vids.find(x => x.id === info.screen) || vids[vids.length - 1];
        out.push({ session:sess, user_id:info.user_id, stream:s, mine:false, pc:p.pc });
      });
      return out;
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
        if((this._tick = (this._tick||0) + 1) % 40 === 0) this.syncPeers();
      }, 120);
    }
  };

  window.Voice = Voice;
})();
