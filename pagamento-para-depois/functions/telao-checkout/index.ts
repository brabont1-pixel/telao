// Telão+ — cria o pagamento no Mercado Pago (Pix ou cartão) para o usuário logado.
// Segredos necessários (Edge Functions → Secrets): MP_ACCESS_TOKEN, SITE_URL
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PRICE = 9.90;   // R$ por 30 dias
const DAYS = 30;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = Deno.env.get('MP_ACCESS_TOKEN');
    const site = (Deno.env.get('SITE_URL') || '').replace(/\/+$/, '');
    if (!token || !site) return json({ error: 'Pagamento ainda não configurado (faltam os segredos MP_ACCESS_TOKEN e SITE_URL).' }, 500);

    const supa = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'Faça login primeiro.' }, 401);

    const pref = {
      items: [{ id: 'telao-plus-30', title: `Telão+ (${DAYS} dias)`, description: 'Perfil com GIF, banner, cores, insígnia e transmissão em alta qualidade',
                quantity: 1, unit_price: PRICE, currency_id: 'BRL' }],
      external_reference: user.id,
      payer: { email: user.email },
      back_urls: { success: `${site}/#plus-ok`, pending: `${site}/#plus-pendente`, failure: `${site}/#plus-erro` },
      auto_return: 'approved',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telao-mp-webhook`,
      statement_descriptor: 'TELAO PLUS',
      metadata: { user_id: user.id, days: DAYS },
    };
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pref),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: 'Mercado Pago recusou: ' + (data.message || r.status) }, 502);
    return json({ url: data.init_point });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
