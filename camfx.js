/* Telão — efeitos de câmera (processa a webcam num canvas antes de enviar) */
(function(){
  const EFFECTS = [
    { id:'none',     nome:'Nenhum',       ic:'🙂' },
    { id:'beleza',   nome:'Suave',        ic:'✨', filter:'brightness(1.08) contrast(.94) saturate(1.08) blur(.6px)' },
    { id:'pb',       nome:'Preto e branco', ic:'🎞️', filter:'grayscale(1) contrast(1.15)' },
    { id:'vintage',  nome:'Vintage',      ic:'📜', filter:'sepia(.75) contrast(1.1) brightness(.95) saturate(1.2)', vignette:true },
    { id:'quente',   nome:'Pôr do sol',   ic:'🌅', filter:'saturate(1.35) sepia(.25) hue-rotate(-12deg) brightness(1.05)' },
    { id:'frio',     nome:'Inverno',      ic:'❄️', filter:'saturate(.9) hue-rotate(18deg) brightness(1.05) contrast(1.05)' },
    { id:'neon',     nome:'Neon',         ic:'💜', neon:true },
    { id:'desfoque', nome:'Fundo desfocado', ic:'🌫️', seg:'blur', tag:'IA' },
    { id:'estudio',  nome:'Estúdio',      ic:'🎬', seg:'color', tag:'IA' },
    { id:'cinema',   nome:'Cinema',       ic:'🎥', cinema:true },
    { id:'vhs',      nome:'VHS',          ic:'📼', vhs:true },
    { id:'pixel',    nome:'8-bit',        ic:'👾', pixel:true },
    { id:'hq',       nome:'Quadrinhos',   ic:'💥', hq:true },
    { id:'termica',  nome:'Térmica',      ic:'🌡️', thermal:true },
    { id:'ascii',    nome:'ASCII',        ic:'🔤', ascii:true },
    { id:'espelho',  nome:'Espelho',      ic:'🪞', mirror:true },
    { id:'calei',    nome:'Caleidoscópio', ic:'🔮', kaleido:true },
  ];
  const W = 960, H = 540;
  const hasFilter = (() => { try{ return 'filter' in document.createElement('canvas').getContext('2d'); }catch(e){ return false; } })();

  // paleta da câmera térmica
  const THERM = (() => { const p = []; const stops = [[0,0,0,30],[.25,60,0,140],[.5,220,30,60],[.75,255,150,0],[1,255,255,200]];
    for(let i = 0; i < 256; i++){ const t = i/255; let k = 0; while(k < stops.length-2 && t > stops[k+1][0]) k++;
      const [a0,r0,g0,b0] = stops[k], [a1,r1,g1,b1] = stops[k+1], f = (t-a0)/(a1-a0);
      p.push([r0+(r1-r0)*f, g0+(g1-g0)*f, b0+(b1-b0)*f]); } return p; })();

  // relógio num Worker: não congela quando a aba fica em segundo plano
  let ticker = null; const subs = new Set();
  function tick(f){
    subs.add(f);
    if(!ticker){
      try{
        ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type:'text/javascript' })));
        ticker.onmessage = () => subs.forEach(fn => fn());
      }catch(e){ ticker = setInterval(() => subs.forEach(fn => fn()), 33); }
    }
    return () => subs.delete(f);
  }
  let segmenter = null, segLoading = null;
  async function loadSeg(){
    if(segmenter) return segmenter;
    if(segLoading) return segLoading;
    segLoading = (async () => {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      segmenter = await vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', delegate: 'GPU' },
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      return segmenter;
    })();
    return segLoading;
  }

  function create(source){
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = source; video.play().catch(()=>{});
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d', { willReadFrequently: true });
    const mask = document.createElement('canvas'); mask.width = 256; mask.height = 144; const mctx = mask.getContext('2d');
    let fx = EFFECTS[0], running = true, t0 = performance.now(), segOK = false, lastMask = null, onStatus = () => {};
    const out = cv.captureStream(30);

    function cover(dst, w, h){ // desenha o vídeo preenchendo w×h
      const vw = video.videoWidth || 640, vh = video.videoHeight || 360, s = Math.max(w / vw, h / vh);
      const dw = vw * s, dh = vh * s; dst.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    function frame(){
      if(!running) return;
      const t = (performance.now() - t0) / 1000;
      ctx.save(); ctx.filter = 'none'; ctx.globalAlpha = 1;
      if(fx.pixel){
        tmp.width = 120; tmp.height = 68; cover(tctx, 120, 68);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, W, H); ctx.imageSmoothingEnabled = true;
      } else if(fx.ascii){
        const cw = 96, ch = 40; tmp.width = cw; tmp.height = ch; cover(tctx, cw, ch);
        const d = tctx.getImageData(0, 0, cw, ch).data, chars = ' .:-=+*#%@';
        ctx.fillStyle = '#050805'; ctx.fillRect(0, 0, W, H);
        ctx.font = 'bold 13px ui-monospace,Consolas,monospace'; ctx.textBaseline = 'top';
        const sx = W / cw, sy = H / ch;
        for(let y = 0; y < ch; y++){ for(let x = 0; x < cw; x++){ const i = (y*cw + x)*4, l = (d[i]*.3 + d[i+1]*.59 + d[i+2]*.11) / 255;
          ctx.fillStyle = `rgb(${40 + l*60|0},${120 + l*135|0},${60 + l*60|0})`; ctx.fillText(chars[Math.min(9, l*10|0)], x*sx, y*sy); } }
      } else if(fx.kaleido){
        tmp.width = W/2; tmp.height = H/2; cover(tctx, W/2, H/2);
        ctx.drawImage(tmp, 0, 0);
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(tmp, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(tmp, 0, 0); ctx.restore();
        ctx.save(); ctx.translate(W, H); ctx.scale(-1, -1); ctx.drawImage(tmp, 0, 0); ctx.restore();
      } else if(fx.mirror){
        tmp.width = W/2; tmp.height = H; tctx.drawImage(video, 0, 0, video.videoWidth || 640, video.videoHeight || 360, -W/4, 0, W, H);
        ctx.drawImage(tmp, 0, 0); ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(tmp, 0, 0); ctx.restore();
      } else if(fx.seg){
        if(!segOK){ cover(ctx, W, H); }
        else {
          // fundo
          if(fx.seg === 'blur'){ if(hasFilter) ctx.filter = 'blur(14px) brightness(.9)'; cover(ctx, W, H); ctx.filter = 'none'; }
          else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a1450'); g.addColorStop(1, '#ff2e9a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
          // pessoa recortada pela máscara
          tmp.width = W; tmp.height = H; tctx.globalCompositeOperation = 'source-over'; cover(tctx, W, H);
          tctx.globalCompositeOperation = 'destination-in'; tctx.drawImage(mask, 0, 0, W, H); tctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(tmp, 0, 0);
          if(segmenter && video.readyState >= 2){
            try{ segmenter.segmentForVideo(video, performance.now(), res => {
              const m = res.confidenceMasks && res.confidenceMasks[0]; if(!m) return;
              const arr = m.getAsFloat32Array(), mw = m.width, mh = m.height;
              if(mask.width !== mw){ mask.width = mw; mask.height = mh; }
              const img = mctx.createImageData(mw, mh);
              for(let i = 0; i < arr.length; i++){ img.data[i*4+3] = Math.min(255, Math.max(0, (arr[i] - .25) * 2.2 * 255)); }
              mctx.putImageData(img, 0, 0);
            }); }catch(e){}
          }
        }
      } else {
        if(fx.neon && hasFilter) ctx.filter = `saturate(2.6) contrast(1.25) hue-rotate(${(t * 40) % 360}deg)`;
        else if(fx.filter && hasFilter) ctx.filter = fx.filter;
        cover(ctx, W, H); ctx.filter = 'none';
        if(fx.hq || fx.thermal){
          const id = ctx.getImageData(0, 0, W, H), d = id.data;
          for(let i = 0; i < d.length; i += 4){
            const l = d[i]*.3 + d[i+1]*.59 + d[i+2]*.11;
            if(fx.thermal){ const c = THERM[l|0]; d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; }
            else { const q = v => Math.min(255, (Math.round(v / 64) * 64) * 1.1); d[i] = q(d[i]); d[i+1] = q(d[i+1]); d[i+2] = q(d[i+2]); if(l < 50){ d[i] = d[i+1] = d[i+2] = 10; } }
          }
          ctx.putImageData(id, 0, 0);
          if(fx.hq){ ctx.globalAlpha = .18; ctx.fillStyle = '#000'; for(let y = 0; y < H; y += 6) for(let x = (y/6 % 2) * 3; x < W; x += 6){ ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
        }
      }
      if(fx.vhs){
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .35; ctx.drawImage(cv, 4, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,.18)'; for(let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
        const by = (t * 90) % H; ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, by, W, 18);
        ctx.font = 'bold 26px ui-monospace,monospace'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText('▶ PLAY', 30, 50); const d = new Date(); ctx.fillText(d.toLocaleDateString('pt-BR') + '  ' + d.toLocaleTimeString('pt-BR'), 30, H - 30); ctx.shadowBlur = 0;
      }
      if(fx.vignette){ const g = ctx.createRadialGradient(W/2, H/2, H*.35, W/2, H/2, H*.85); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      if(fx.cinema){
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 62); ctx.fillRect(0, H - 62, W, 62);
        ctx.fillStyle = '#f2434b'; ctx.beginPath(); ctx.arc(32, 31, 7, 0, 7); ctx.fill();
        ctx.font = '600 18px Inter,sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('AO VIVO', 48, 37);
        ctx.font = '500 15px Inter,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('telão', W - 70, H - 26);
      }
      ctx.restore();
    }
    let busy = false;
    const untick = tick(() => { if(!running || busy || video.readyState < 2) return; busy = true; try{ frame(); }finally{ busy = false; } });

    return {
      stream: out,
      source,
      get effect(){ return fx.id; },
      onStatus(f){ onStatus = f; },
      async setEffect(id){
        fx = EFFECTS.find(e => e.id === id) || EFFECTS[0];
        if(fx.seg){
          segOK = false; onStatus('Carregando IA…');
          try{ await loadSeg(); segOK = true; onStatus(''); }
          catch(e){ onStatus('Não deu para carregar o efeito com IA neste aparelho.'); }
        } else onStatus('');
      },
      stop(){ running = false; untick(); source.getTracks().forEach(t => t.stop()); out.getTracks().forEach(t => t.stop()); video.srcObject = null; },
    };
  }
  window.CamFX = { EFFECTS, create };
})();
