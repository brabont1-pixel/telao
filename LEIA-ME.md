# Telão: como colocar no ar

Leva uns 10 minutos, tudo grátis.

## 1. Criar o banco (Supabase)

1. Entre em **supabase.com**, crie uma conta e clique em **New project**. Dê um nome (ex: `telao`), crie uma senha para o banco e escolha a região **South America (São Paulo)**.
2. Espere o projeto ficar pronto (1 a 2 minutos).
3. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
4. Abra o arquivo `supabase.sql`, copie **tudo**, cole lá e clique em **Run**. Tem que aparecer "Success".

## 2. Ajustar o login

Em **Authentication → Sign In / Providers → Email**:

- **Opção mais fácil:** desligue **Confirm email**. A pessoa cria a conta e já entra.
- **Se quiser confirmação por e-mail:** deixe ligado. Depois do passo 4, coloque o link do seu site em **Authentication → URL Configuration → Site URL**.

## 3. Colar as chaves no app

1. No Supabase, abra **Project Settings → API** (ou **Data API / API Keys**).
2. Copie a **Project URL** e a chave **publishable** (`sb_publishable_…`) ou a **anon public**. **Nunca** a secreta (`sb_secret_…`).
3. Abra o arquivo `config.js` e cole as duas nos lugares indicados.

A chave anon pode ficar no site, porque quem protege os dados são as regras de segurança do banco. Nunca use a chave **service_role** no site.

## 4. Publicar na Vercel

**Pelo GitHub:**
1. Crie um repositório e envie todos os arquivos desta pasta, com a pasta `icons`.
2. Na Vercel, clique em **Add New → Project → Import** e depois em **Deploy**.

**Pelo terminal:** entre nesta pasta e rode `npx vercel --prod`.

Pronto! Abra o link `https://….vercel.app`, crie sua conta e chame os amigos.

## 5. Instalar como app

- **PC (Chrome/Edge):** clique no ícone de instalar na barra de endereço, ou vá em ⋮ → **Instalar Telão**.
- **Android (Chrome):** ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.

## Como usar

- **Servidores:** clique no **+** da barra da esquerda. Ao criar um servidor, ele já vem com um canal de texto `#geral` e os canais de voz "Geral" e "Telão".
- **Convidar:** clique no nome do servidor → **Convidar pessoas** e mande o link.
- **Amigos:** em 👥 Amigos → **Adicionar**, digite o nome de usuário da pessoa (ex: `lucas_10`).
- **Voz:** clique num canal de voz para entrar. Para ligar para um amigo, abra a conversa e clique em 📞.
- **Compartilhar tela:** dentro de uma chamada, clique em 🖥️. Qualquer pessoa da chamada pode compartilhar, e várias ao mesmo tempo. Clique na tela que quiser assistir.
- **Som da tela:** escolha **Tela inteira** e ligue **Compartilhar áudio do sistema** (Windows), ou escolha uma **aba** e ligue **Compartilhar áudio da aba**. A opção **Janela** não envia som.
- **Volume de cada pessoa:** clique com o botão direito no nome dela durante a chamada.

## Se algo não funcionar

| Problema | Solução |
|---|---|
| "Falta conectar o banco" | Preencha o `config.js` e publique de novo. |
| "Perfil não encontrado" | O `supabase.sql` não foi rodado (ou deu erro). Rode de novo. |
| Amigo entra na chamada mas ninguém se ouve | A rede dele bloqueia conexão direta. Adicione um servidor TURN no `config.js` (tem um exemplo lá). |
| Tela travando | Baixe o bitrate em ⚙️ Qualidade. Cada pessoa assistindo usa esse valor da sua internet de upload. |
| Atualizei o site e não mudou | Feche e abra o app (ou Ctrl+Shift+R no navegador). |

Limites do plano grátis do Supabase: 500 MB de banco (milhões de mensagens de texto) e 200 pessoas conectadas ao mesmo tempo. Sobra para um grupo de amigos.

---

# Novidades da versão 2

## A. Atualizar o banco (obrigatório)

Abra o `supabase.sql` novo e role até o **final**. Na última linha, troque `SEU_EMAIL_AQUI@gmail.com` pelo **e-mail da sua conta no Telão**: é isso que te torna admin, com todas as insígnias e o Telão+ vitalício. Depois cole o arquivo **inteiro** no **SQL Editor** e clique em **Run**. Pode rodar de novo sem medo: nada do que já existe é apagado.

## B. Login com Google

1. Entre em **console.cloud.google.com** e crie um projeto (ex: "Telão").
2. Vá em **APIs e serviços → Tela de consentimento OAuth**: escolha **Externo**, nome "Telão" e seu e-mail. Depois clique em **Publicar app**, senão só você consegue entrar.
3. Vá em **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - **Origens JavaScript autorizadas:** `https://telao-zeta-three.vercel.app`
   - **URIs de redirecionamento autorizados:** `https://wslvatpyzvbrbfszdavf.supabase.co/auth/v1/callback`
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.
5. No Supabase, vá em **Authentication → Sign In / Providers → Google**: ative, cole os dois e salve.
6. Em **Authentication → URL Configuration**:
   - **Site URL:** `https://telao-zeta-three.vercel.app`
   - **Redirect URLs:** adicione `https://telao-zeta-three.vercel.app/**`

## C. E-mail de confirmação chegando para quem se cadastra

O e-mail grátis do Supabase **só envia para os membros da sua equipe** no painel, e no máximo uns 2 por hora. Para enviar a confirmação para o e-mail de quem está se cadastrando, conecte um SMTP. Dá para fazer com o Gmail, de graça:

1. Na sua Conta Google, ative a **Verificação em duas etapas**.
2. Acesse **myaccount.google.com/apppasswords**, crie uma senha de app chamada "Telão" e copie os 16 caracteres.
3. No Supabase, vá em **Authentication → Emails → SMTP Settings → Enable custom SMTP** e preencha:
   - **Host:** `smtp.gmail.com` · **Port:** `465`
   - **Username:** seu Gmail · **Password:** a senha de app
   - **Sender email:** seu Gmail · **Sender name:** `Telão`
4. Em **Authentication → Sign In / Providers → Email**, ligue **Confirm email**.
5. (Opcional) Em **Authentication → Emails → Templates → Confirm signup**, troque o texto para português, por exemplo:
   - Assunto: `Confirme sua conta no Telão`
   - Corpo: `<h2>Bem-vindo(a) ao Telão!</h2><p><a href="{{ .ConfirmationURL }}">Clique aqui para confirmar seu e-mail</a></p>`

O Gmail envia até cerca de 500 e-mails por dia, o que sobra para um grupo de amigos. Na tela de login, quem não recebeu o e-mail pode clicar em **Reenviar confirmação**.

## D. Telão+ (o "Nitro" do Telão)

- **Admin** (você): tem todas as insígnias e o Telão+ para sempre. Em **⚙️ → 👑 Painel do admin**, você procura qualquer pessoa e dá **+30 dias**, **+1 ano** ou insígnias.
- **Pagamento automático:** está **desligado** por enquanto. Quando quiser ligar, siga `pagamento-para-depois/LEIA-ME.md`.

---

# Versão 3: o que tem de novo

**Para atualizar:** rode o `supabase.sql` inteiro de novo no SQL Editor (não apaga nada) e suba todos os arquivos na Vercel, **menos o seu `config.js`**. Arquivos novos: `icons.js` e `emoji.js`.

### Chat
- **Fotos, vídeos, áudios e arquivos:** pelo botão ＋, arrastando para a tela ou colando com Ctrl+V. As fotos são reduzidas e convertidas para WebP antes de enviar (uma foto de 5 MB vira uns 200 KB) e aparecem na hora, com uma prévia borrada enquanto carregam.
- Visualizador de imagens em tela cheia, com setas para passar de uma foto a outra.
- **Responder** mensagens, **reações** com emoji, **fixar** mensagens e **buscar** na conversa.
- Aviso de **"fulano está digitando…"** e **mensagens de voz** (botão do microfone).
- Formatação: `**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `||spoiler||`, `` `código` ``, blocos de código com três crases, `> citação` e `# título`.
- Links do YouTube viram vídeo dentro do chat. Atalhos de emoji como `:fogo:` viram 🔥.
- **@menções** com autocompletar e `@todos`. Quando alguém te marca, a mensagem fica destacada.
- Seta ↑ edita sua última mensagem. Clicar com o botão direito numa mensagem abre o menu completo.
- Uma linha **NOVAS** mostra onde você parou de ler, e um botão leva de volta ao fim da conversa.

### Chamadas
- **Câmera** (vídeo), além de voz e tela.
- **Soundboard** com 10 sons que todo mundo na chamada ouve.
- **Reações flutuantes** na tela da chamada.
- **Assistir juntos:** um vídeo do YouTube tocando sincronizado para todos. Se alguém pausa, pausa para todo mundo.
- **Janela flutuante** (picture-in-picture), **print** e **gravação** da transmissão.
- Indicador de qualidade da conexão e reconexão automática se a rede oscilar.

### Social e servidores
- **Status:** Online, Ausente (entra sozinho depois de 10 minutos parado), Não perturbe (silencia as notificações) e Invisível. Também dá para escrever um **status personalizado** com emoji.
- **Ctrl+K** abre a troca rápida para ir a qualquer amigo, canal ou servidor.
- **Cargos** com cor e permissões: Administrador, Gerenciar servidor, canais, cargos e mensagens, e Expulsar.
- **Ícone de servidor com imagem**, descrição do servidor e **modelos** prontos ao criar (Jogos, Amigos, Estudos, Filmes).
- **Tópico** em cada canal e **categorias** que abrem e fecham.
- Convidar amigos direto pela lista de amigos.
- **Cor de destaque** personalizável em Configurações → Aparência.

### Para quem for mexer no código
O código fica na pasta `src/`. Depois de editar, rode `./build.sh` para gerar o `app.js`.

---

# Versão 4: o que tem de novo

**Para atualizar:** rode o `supabase.sql` de novo no SQL Editor e suba os arquivos novos na Vercel, **menos o `config.js`**. Arquivo novo nesta versão: `camfx.js`.

- **Visual novo, com cara própria:** painéis flutuantes, mensagens em balões (as suas ficam à direita, em coral), cor coral e rosa, fonte Sora nos títulos, um cartão colorido no topo de cada servidor e a barra de chamada flutuando sobre o vídeo.
- **Efeitos na câmera:** ao ligar a câmera aparece uma prévia para escolher o efeito, e dá para trocar durante a chamada. São 17 efeitos, entre eles Suave, P&B, Vintage, Neon, VHS, 8-bit, Quadrinhos, Térmica, ASCII, Caleidoscópio e Cinema. Fundo desfocado e Estúdio usam IA.
- **Assistir ao vivo:** quando alguém começa a transmitir, aparece um aviso com o botão **Assistir**. O selo **AO VIVO** também é clicável na lista de canais, de membros e de amigos.
- **Sons na chamada:** tocam quando você entra, quando alguém entra ou sai e quando uma tela começa ou para de ser compartilhada. Dá para desligar em Voz e vídeo.
- **Desenhar na tela compartilhada:** todo mundo que está assistindo vê o desenho, que some sozinho depois de alguns segundos.
- **Modo cinema**, para assistir sem distrações, e **cronômetro** da chamada.
- **Comandos com /:** `/dado`, `/moeda`, `/sorteio`, `/enquete`, `/confete`, `/eu`, `/spoiler`, `/shrug`, `/tableflip`.
- **Enquetes** com votação em tempo real.
- **Efeitos de mensagem:** "parabéns" solta confete, "te amo" solta corações e "gg" solta troféus.
- **Perfil:** pronomes, até 5 links (Instagram, TikTok, YouTube, Twitch etc.) e a escolha de quais insígnias aparecem. A cor do avatar agora é automática quando você usa foto (era o bug).
- **Exclusivos do Telão+:** anel animado no avatar, nome com gradiente e partículas no cartão de perfil.
