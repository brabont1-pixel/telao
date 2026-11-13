/* =====================================================================
   v6.9: TRANSCREVER MENSAGEM DE VOZ
   Quando o texto não saiu na hora da gravação (ex.: app do Windows, Firefox), o botão
   "Transcrever" roda o Whisper no próprio aparelho. O modelo (~75 MB) é baixado uma vez e fica guardado.
   ===================================================================== */
const TRX = { pipe: null, loading: null, busy: new Set() };
const trStore = () => { try{ return JSON.parse(localStorage.getItem('telao-tr') || '{}'); }catch(e){ return {}; } };
App.trCache = url => trStore()[url] || null;
function trSave(url, text){
  try{
    const o = trStore(); o[url] = text;
    const keys = Object.keys(o); if(keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete o[k]);
    localStorage.setItem('telao-tr', JSON.stringify(o));
  }catch(e){}
}
async function whisperPipe(onProgress){
  if(TRX.pipe) return TRX.pipe;
  if(!TRX.loading) TRX.loading = (async () => {
    const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
    T.env.allowLocalModels = false;
    TRX.pipe = await T.pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
      progress_callback: p => { if(p && p.status === 'progress' && TRX.onProgress) TRX.onProgress(Math.round(p.progress || 0)); },
    });
    return TRX.pipe;
  })().catch(e => { TRX.loading = null; throw e; });
  TRX.onProgress = onProgress;
  return TRX.loading;
}
async function audio16k(url){
  const buf = await (await fetch(url)).arrayBuffer();
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ab = await new OAC(1, 16000, 16000).decodeAudioData(buf);
  if(ab.numberOfChannels === 1) return ab.getChannelData(0);
  const a = ab.getChannelData(0), b = ab.getChannelData(1), out = new Float32Array(a.length);
  for(let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}
async function transcribeVoice(btn){
  const mid = btn.dataset.trans, url = btn.dataset.turl;
  if(TRX.busy.has(url)) return;
  TRX.busy.add(url);
  const set = h => { const b = document.querySelector(`.vtr[data-turl="${CSS.escape(url)}"]`); if(b) b.innerHTML = h; };
  set(`<span class="spin xs"></span> ${TRX.pipe ? 'Transcrevendo…' : 'Preparando…'}`);
  try{
    const pipe = await whisperPipe(pct => set(`<span class="spin xs"></span> Baixando o transcritor ${pct}% (só na primeira vez)`));
    set(`<span class="spin xs"></span> Transcrevendo…`);
    const pcm = await audio16k(url);
    const lang = ({ en: 'english', es: 'spanish' })[P.lang] || 'portuguese';
    const out = await pipe(pcm, { language: lang, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    const text = String((out && out.text) || '').replace(/\s+/g, ' ').trim();
    if(!text){ set(`${ic('pen', 13)} Não deu para entender o áudio`); return; }
    trSave(url, text);
    const m = M.list.find(x => x.id === mid);
    // quem mandou o áudio salva o texto na mensagem, aí todo mundo vê
    if(m && m.author_id === S.me.id){
      const atts = (m.attachments || []).map(a => a.url === url ? { ...a, text } : a);
      App.sb.from('messages').update({ attachments: atts }).eq('id', m.id).then(({ error }) => { if(!error) m.attachments = atts; });
    }
    const box = document.querySelector(`.vtr[data-turl="${CSS.escape(url)}"]`);
    if(box) box.outerHTML = `<div class="vtext"><span class="vtl">${ic('chat', 12)} Transcrição</span>${esc(text)}</div>`;
  }catch(e){
    console.warn('transcrição', e);
    set(`${ic('pen', 13)} Não deu para transcrever agora. Tentar de novo`);
  }finally{ TRX.busy.delete(url); }
}
document.addEventListener('click', e => { const b = e.target.closest('.vtr[data-trans]'); if(b){ e.preventDefault(); transcribeVoice(b); } });
