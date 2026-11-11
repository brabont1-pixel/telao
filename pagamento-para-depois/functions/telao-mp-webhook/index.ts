// Telão+ — recebe o aviso do Mercado Pago e libera o plano quando o pagamento é aprovado.
// IMPORTANTE: publique esta função com "Verify JWT" DESLIGADO (o Mercado Pago não manda login).
// O pagamento é sempre conferido direto na API do Mercado Pago, então avisos falsos não liberam nada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PRICE = 9.90;
const DAYS = 30;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body = {};
    try { body = await req.json(); } catch (_) { /* aviso pode vir só na URL */ }
    const type = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic');
    const id = (body.data && body.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id');
    if (type !== 'payment' || !id) return new Response('ignorado', { status: 200 });

    const token = Deno.env.get('MP_ACCESS_TOKEN');
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return new Response('pagamento não encontrado', { status: 200 });
    const pay = await r.json();

    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const userId = pay.external_reference;
    if (!userId) return new Response('sem usuário', { status: 200 });

    // registra (ou atualiza) o pagamento
    await admin.from('payments').upsert({ id: String(pay.id), user_id: userId, amount: pay.transaction_amount, status: pay.status, provider: 'mercadopago' });

    // libera só uma vez (a trava é a linha "<id>:liberado"), só se aprovado e com o valor certo
    if (pay.status === 'approved' && Number(pay.transaction_amount) >= PRICE - 0.01) {
      const { error: dup } = await admin.from('payments').insert({ id: `${pay.id}:liberado`, user_id: userId, amount: 0, status: 'liberado', provider: 'mercadopago' });
      if (!dup) {
        const { error } = await admin.rpc('admin_set_plus', { p_user: userId, p_days: DAYS });
        if (error) {
          await admin.from('payments').delete().eq('id', `${pay.id}:liberado`);
          return new Response('erro: ' + error.message, { status: 500 });
        }
      }
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response('erro: ' + String(e?.message || e), { status: 500 });
  }
});
