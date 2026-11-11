// =====================================================================
// TELÃO — configuração
// Use a chave PUBLISHABLE (sb_publishable_...) ou a "anon public".
// NUNCA coloque a chave secreta (sb_secret_... / service_role) aqui.
// =====================================================================
window.TELAO_CONFIG = {
  SUPABASE_URL: 'https://wslvatpyzvbrbfszdavf.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_j0PpUUFg6MLeczW6GUFv6A_bEcW7q0Z',

  // Pagamento do Telão+ pelo Mercado Pago. Deixe false até configurar (veja pagamento-para-depois/LEIA-ME.md).
  // Enquanto estiver false, o admin ativa o plano manualmente no "Painel do admin".
  PAYMENTS: false,

  // Se algum amigo não conseguir conectar nas chamadas (4G, rede de faculdade/empresa),
  // adicione um TURN, ex: { urls: 'turn:SEU_HOST:443?transport=tcp', username: 'USUARIO', credential: 'SENHA' }
  ICE_SERVERS: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};
