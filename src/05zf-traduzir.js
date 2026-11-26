/* =====================================================================
   v6.21: TRADUZIR MENSAGEM (menu da mensagem → Traduzir)
   1º tenta o tradutor que já vem no Chrome/Edge (roda no próprio computador, de graça e sem mandar o texto para fora);
   se o navegador não tiver, usa o MyMemory (serviço gratuito de tradução).
   ===================================================================== */
const TR = { cache: new Map(), shown: new Map() };
const LANG_NAMES = { pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês', de: 'alemão', it: 'italiano', ja: 'japonês', ko: 'coreano', zh: 'chinês', ru: 'russo', ar: 'árabe', tr: 'turco', pl: 'polonês', nl: 'holandês', hi: 'hindi', uk: 'ucraniano', sv: 'sueco', id: 'indonésio', vi: 'vietnamita', th: 'tailandês', he: 'hebraico', el: 'grego', cs: 'tcheco', ro: 'romeno', hu: 'húngaro', fi: 'finlandês', da: 'dinamarquês', no: 'norueguês' };
const trTarget = () => P.lang || 'pt';
const langName = c => LANG_NAMES[(c || '').slice(0, 2)] || c || 'outra língua';
async function translateText(text){
  const to = trTarget(), key = to + '|' + text;
  if(TR.cache.has(key)) return TR.cache.get(key);
  let res = null;
  // 1) tradutor do próprio navegador
  try{
    if('Translator' in self && 'LanguageDetector' in self){
      const det = await LanguageDetector.create();
      const [best] = await det.detect(text);
      const from = best && best.detectedLanguage;
      if(from && from !== 'und'){
        if(from.slice(0, 2) === to) res = { same: true, from };
        else{
          const av = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
          if(av && av !== 'unavailable'){
            const t = await Translator.create({ sourceLanguage: from, targetLanguage: to });
            res = { text: await t.translate(text), from, how: 'navegador' };
          }
        }
      }
    }
  }catch(e){}
  // 2) MyMemory
  if(!res){
    const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 480)) + '&langpair=' + encodeURIComponent('Autodetect|' + (to === 'pt' ? 'pt-BR' : to)) + (S.me ? '&de=' + encodeURIComponent('telao+' + S.me.id.slice(0, 8) + '@telao.app') : ''));
    if(!r.ok) throw new Error('O tradutor não respondeu.');
    const j = await r.json();
    const t = j && j.responseData && j.responseData.translatedText;
    if(!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(t)) throw new Error(/WARNING/i.test(t || '') ? 'O limite de traduções grátis de hoje acabou. Tente amanhã.' : 'Não deu para traduzir agora.');
    const from = (j.responseData.detectedLanguage || (j.matches && j.matches[0] && j.matches[0].source) || '').slice(0, 2);
    const clean = String(t).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    res = from && from === to ? { same: true, from } : clean.trim().toLowerCase() === text.trim().toLowerCase() ? { same: true, from: from || to } : { text: clean, from, how: 'MyMemory' };
  }
  TR.cache.set(key, res);
  return res;
}
function trBox(mid, html){
  const row = document.querySelector(`[data-m="${mid}"]`); if(!row) return;
  let b = row.querySelector('.trbox');
  if(!b){ b = document.createElement('div'); b.className = 'trbox'; const ct = row.querySelector('.bub .ct'); if(ct) ct.after(b); else (row.querySelector('.bub') || row).appendChild(b); }
  b.innerHTML = html;
  const x = b.querySelector('[data-trx]'); if(x) x.onclick = e => { e.stopPropagation(); TR.shown.delete(mid); b.remove(); };
}
async function translateMsg(m){
  const text = String(m.content || '').replace(/https?:\/\/\S+/g, ' ').replace(/<a?:[a-z0-9_]+:[0-9a-f-]{36}>/gi, ' ').trim();
  if(!text){ App.toast('Não tem texto para traduzir nessa mensagem.', true); return; }
  trBox(m.id, `<span class="trtag">${ic('globe', 12)} Traduzindo…</span>`);
  try{
    const r = await translateText(text);
    if(r.same){ trBox(m.id, `<span class="trtag">${ic('globe', 12)} Essa mensagem já está em ${langName(trTarget())}.</span><button class="trx" data-trx>${ic('x', 12)}</button>`); setTimeout(() => { const b = document.querySelector(`[data-m="${m.id}"] .trbox`); if(b && !TR.shown.has(m.id)) b.remove(); }, 4000); return; }
    TR.shown.set(m.id, r);
    trBox(m.id, `<div class="trtxt">${richText(r.text)}</div><span class="trtag">${ic('globe', 12)} Traduzido do ${langName(r.from)}${r.how ? ' · ' + r.how : ''}</span><button class="trx" data-trx data-tip="Esconder tradução">${ic('x', 12)}</button>`);
  }catch(e){ trBox(m.id, `<span class="trtag err">${esc(e.message || 'Não deu para traduzir agora.')}</span><button class="trx" data-trx>${ic('x', 12)}</button>`); }
}
App.translateMsg = translateMsg;
// volta a mostrar a tradução quando a mensagem é redesenhada
App.onDom(() => {
  if(!TR.shown.size) return;
  TR.shown.forEach((r, mid) => { const row = document.querySelector(`[data-m="${mid}"]`); if(row && !row.querySelector('.trbox')) trBox(mid, `<div class="trtxt">${richText(r.text)}</div><span class="trtag">${ic('globe', 12)} Traduzido do ${langName(r.from)}${r.how ? ' · ' + r.how : ''}</span><button class="trx" data-trx>${ic('x', 12)}</button>`); });
});
const _msgMenuExtraTr = App.msgMenuExtra;
App.msgMenuExtra = m => {
  const out = _msgMenuExtraTr ? _msgMenuExtraTr(m) : [];
  if(m.content && m.content.trim() && !String(m.id).startsWith('tmp-')) out.unshift({ label: TR.shown.has(m.id) ? 'Mostrar original' : 'Traduzir', icon: ic('globe', 18), onClick: () => { if(TR.shown.has(m.id)){ TR.shown.delete(m.id); document.querySelector(`[data-m="${m.id}"] .trbox`)?.remove(); } else translateMsg(m); } });
  return out;
};
