# Pagamento do Telão+ (configurar depois)

Por enquanto o Telão+ é ativado **à mão** pelo admin: Configurações → 👑 Painel do admin → procure a pessoa → **+30 dias**.

Quando quiser cobrar automaticamente (Pix e cartão) pelo Mercado Pago:

1. **Mercado Pago:** crie uma conta em mercadopago.com.br/developers → **Suas integrações → Criar aplicação**. Copie o **Access Token de produção** (`APP_USR-…`).
2. **Supabase → Edge Functions → Secrets:** adicione
   - `MP_ACCESS_TOKEN` = o token acima
   - `SITE_URL` = o link do seu site (ex: `https://telao-zeta-three.vercel.app`)
3. **Supabase → Edge Functions → Deploy a new function → Via Editor:**
   - Nome `telao-checkout`: cole o conteúdo de `functions/telao-checkout/index.ts` e clique em Deploy.
   - Nome `telao-mp-webhook`: cole `functions/telao-mp-webhook/index.ts`. Antes do Deploy, **desligue "Verify JWT"** (o Mercado Pago não manda login).
4. No `config.js` do site, troque `PAYMENTS: false` por `PAYMENTS: true` e publique de novo.

O preço (R$ 9,90 por 30 dias) fica no topo dos dois arquivos (`PRICE`). Se mudar, mude nos dois.

**Segurança:** o webhook confere cada pagamento direto na API do Mercado Pago antes de liberar, e cada pagamento só libera o plano uma vez.
