// =====================================================================
// TELÃO — configuração
// Cole aqui os dados do seu projeto Supabase (Project Settings → API).
// A chave "anon public" pode ficar no site: a segurança é feita pelo banco (RLS).
// =====================================================================
window.TELAO_CONFIG = {
  SUPABASE_URL: 'COLE_AQUI_A_PROJECT_URL',          // ex: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: 'COLE_AQUI_A_CHAVE_ANON_PUBLIC',

  // Servidores para conectar as chamadas. Os STUN abaixo funcionam na maioria das redes.
  // Se algum amigo não conseguir conectar (4G, rede de faculdade/empresa), adicione um TURN,
  // por exemplo o gratuito da Metered (metered.ca/tools/openrelay):
  // { urls: 'turn:SEU_HOST:443?transport=tcp', username: 'USUARIO', credential: 'SENHA' }
  ICE_SERVERS: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};
