/* =====================================================================
   v6.27: STATUS NO PERFIL
   - jogando E ouvindo ao mesmo tempo (dois cartões)
   - tempo de jogo andando ("jogando há 1 h 05 min")
   - "Entrar na call" / "Assistir a tela" quando a pessoa está numa chamada que eu posso entrar
   ===================================================================== */
const psAgo = t => { const m = Math.max(1, Math.floor((Date.now() - t) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + ' min' : ''}`; };
function psWhereCall(uid){
  for(const metas of S.vp.values()){
    const m = metas.find(x => x.user_id === uid && x.voice);
    if(m){ const ch = findChannel(m.voice); if(ch) return { ch, meta: m }; }
  }
  return null;
}
function psCanJoin(ch){
  if(!ch || ch.kind === 'dm') return false;
  return S.servers.some(s => s.id === ch.server_id) && (S.channels.get(ch.server_id) || []).some(c => c.id === ch.id);
}
const _profileCardPS = profileCard;
profileCard = function(p, extra = ''){
  let h = _profileCardPS(p, extra);
  const a = App.actOf && App.actOf(p);
  let add = '';
  // segundo cartão: o jogo enquanto ouve música
  if(a && a.type === 'spotify' && a.also && a.also.name)
    add += `<h6>Jogando</h6><div class="actcard"><span class="nart">${ic('gamepad', 24)}</span><div class="at"><b>${esc(a.also.name)}</b><small class="mut" data-psince="${a.also.since || ''}">${a.also.since ? 'há ' + psAgo(a.also.since) : ''}</small></div></div>`;
  // chamada
  if(p.id !== S.me.id){
    const w = psWhereCall(p.id);
    if(w && psCanJoin(w.ch)){
      const here = Voice.channel && Voice.channel.id === w.ch.id;
      const s = S.servers.find(x => x.id === w.ch.server_id);
      add += `<h6>Em chamada</h6><div class="pscall"><span class="pscic">${ic('volume', 18)}</span><div><b>${esc(w.ch.name)}</b><small>${esc(s ? s.name : '')}${w.meta.sharing ? ' · compartilhando a tela' : ''}</small></div></div>
        <div class="actbtns">${here ? `<span class="mut small">Vocês estão na mesma chamada</span>` : `<button class="btn sm" data-psjoin="${w.ch.id}">${ic('phone', 15)} Entrar junto</button>`}
        ${w.meta.sharing ? `<button class="btn sec sm" data-watch="${w.ch.id}" data-wsess="${esc(w.meta.session || '')}">${ic('screenUp', 15)} Assistir a tela</button>` : ''}</div>`;
    }
  }
  if(!add) return h;
  return h.replace(/<\/div><\/div>$/, add + '</div></div>');
};
// tempo andando nos cartões abertos (inclui o "há X" do cartão principal)
setInterval(() => document.querySelectorAll('[data-psince]').forEach(e => { const t = +e.dataset.psince; if(t) e.textContent = 'há ' + psAgo(t); }), 30000);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-psjoin]');
  if(b){ e.preventDefault(); const ch = findChannel(b.dataset.psjoin); if(!ch) return; closeMenu(); document.querySelectorAll('.popout,.pcpop').forEach(x => x.remove());
    go({ kind: 'server', sid: ch.server_id, cid: ch.id }); joinVoice(ch); return; }
  const w = e.target.closest('.pcard2 [data-watch]');
  if(w){ e.preventDefault(); e.stopPropagation(); watchLive(w.dataset.watch, w.dataset.wsess); }
}, true);
