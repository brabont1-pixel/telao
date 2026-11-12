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

---

# Avisos e atualizações (versão 4.1)

- **Aviso automático de atualização:** o app confere o `version.json` a cada minuto. **Sempre que publicar uma versão nova, troque o número dentro dele** (ex: `"4.1"` → `"4.2"`) e também a linha `const APP_VERSION = '4.1'` no começo de `src/01-core.js`, rodando `./build.sh` depois. Quem estiver com o Telão aberto vê a barra "Nova atualização do Telão — Atualizar agora".
- **Aviso para todos:** em ⚙️ → 👑 Painel do admin → 📢 Aviso para todos. O aviso aparece na hora, com som, para todo mundo que está online.

---

# Versão 5: o que tem de novo

**Antes de tudo:** rode o `supabase.sql` novo inteiro no **SQL Editor** (pode rodar por cima, não apaga nada). Depois suba todos os arquivos na Vercel, **menos o `config.js`** (mantenha o seu).

- **Som da tela separado da call:** quem transmite não manda mais o áudio da chamada junto com o da tela (Chrome/Edge atualizados). Cada pessoa tem **Volume da voz** e **Volume da tela** separados (clique com o botão direito no nome, ou use o controle de volume na tela em foco). Opcional: o som da tela abaixa sozinho quando alguém fala (Voz e vídeo).
- **Prévia ao vivo:** passe o mouse em quem está com **AO VIVO** ou câmera ligada na lista da call e aparece uma miniatura atualizada da tela.
- **Temas coloridos (Telão+):** Oceano, Floresta, Synthwave, Lava, Meia-noite dourada, Café, Sakura, Menta, Algodão-doce e Aurora animado, em Aparência.
- **Impulsos de servidor (Telão+):** cada assinante tem 3 impulsos e só troca depois de 7 dias. Quem impulsiona ganha a insígnia **Impulsionador** e um ícone do lado do nome. Níveis: 2 impulsos (ícone GIF, cor do servidor, telas 1080p60 para todos, mais sons), 5 (banner, 1440p60, todos os pacotes de som) e 9 (convite personalizado, 4K, banner animado).
- **Loja do Telão e fichas:** botão 🛍️ na barra da esquerda. Fichas grátis todo dia (sequência de dias dá mais; Telão+ ganha em dobro). Itens só do Telão: molduras animadas de avatar, **entradas sonoras na call** (batucada, plantão urgente, moedinha 8-bit…), pacotes de som para o soundboard, títulos no perfil, fundos de cartão e até 7 dias de Telão+.
- **Presentes:** dê qualquer item para um amigo (botão 🎁 na loja ou no menu da pessoa). Chega como um pacote na conversa, que a pessoa abre. Você, como admin, pode presentear Telão+ de 30/90/365 dias de graça. Presentear Telão+ com dinheiro fica para quando o pagamento for ligado.
- **Idioma:** Português, English e Español em Configurações → Idioma.
- **Acessibilidade:** alto contraste, fonte mais legível, sublinhar links, botões maiores, contorno de foco, saturação, reduzir animações, ler mensagens em voz alta e **legendas ao vivo nas chamadas** (Chrome/Edge).
- **Moderação:** dois cargos novos: **Moderar membros** e **Banir membros**. Quem tem cargo de moderador clica com o botão direito no membro e pode: silenciar ou ensurdecer na call (ninguém ouve a pessoa, mesmo se ela tentar burlar), desconectar da call, dar **castigo** no chat (1 min a 1 semana, sem mandar mensagem nem reagir), expulsar e **banir** (não volta nem com convite). Lista de banidos em Configurações do servidor → Banimentos. Administrador do servidor já tem tudo isso, e ninguém consegue moderar o dono.

---

# Corrigir o login com Google e o e-mail de confirmação

## E-mail de confirmação com a cara do Telão

1. **Enviar para qualquer pessoa (obrigatório):** o e-mail grátis do Supabase só envia para você e tem limite de 2 por hora; esse é o erro mais comum ("Error sending confirmation email"). Configure o SMTP do Gmail como na parte **C** acima (senha de app de 16 letras, porta **465**, Sender name **Telão**).
2. **Para onde o link leva:** em **Authentication → URL Configuration**:
   - **Site URL:** `https://telao-zeta-three.vercel.app`
   - **Redirect URLs:** `https://telao-zeta-three.vercel.app/**`
   Sem isso, o link do e-mail abre `localhost` e dá erro.
3. **O visual:** em **Authentication → Emails → Templates**:
   - **Confirm signup** · Assunto `Confirme sua conta no Telão` · cole o conteúdo de `emails/confirmar-conta.html` no corpo.
   - **Reset password** · Assunto `Nova senha do Telão` · `emails/redefinir-senha.html`.
   - **Change email address** · Assunto `Confirme seu novo e-mail` · `emails/mudar-email.html`.
4. Quando a pessoa clicar em **Confirmar minha conta**, o Telão abre direto mostrando **"Conta confirmada! Você já pode usar o Telão"**, já com a pessoa logada.

## Login com Google: o que cada erro quer dizer

| O que aparece | Como resolver |
|---|---|
| `Erro 400: redirect_uri_mismatch` (tela do Google) | No Google Cloud → Credenciais → seu ID do cliente, em **URIs de redirecionamento autorizados**, tem que estar **exatamente** `https://wslvatpyzvbrbfszdavf.supabase.co/auth/v1/callback` |
| `Acesso bloqueado` / "app em teste" | Google Cloud → **Tela de consentimento OAuth** → **Publicar app** (ou adicione os e-mails dos amigos em "Usuários de teste") |
| "O login com Google ainda não foi ativado" | Supabase → Authentication → Sign In / Providers → **Google**: ligado, com o **Client ID** e o **Client Secret** |
| "O Google recusou o login" (Unable to exchange external code) | O **Client Secret** colado no Supabase está errado ou foi trocado. Gere outro no Google Cloud e cole de novo |
| Volta para `localhost:3000` | Arrume o **Site URL** e o **Redirect URLs** (passo 2 acima) |
| "Database error saving new user" | Rode o `supabase.sql` da v5: ele deixa o cadastro à prova de falha e já usa a foto do Google como avatar |

---

# Versão 6: o que tem de novo

**Rode o `supabase.sql` de novo** no SQL Editor (tabelas novas de conexões e eventos) e suba tudo na Vercel, menos o `config.js`.

- **Visual mais autoral:** cores sólidas no lugar dos degradês rosa/roxo, sem brilho, sem vidro, cantos menores, títulos com a fonte Archivo, e textos de aviso sem emoji e sem exclamação em tudo.
- **Conexões (Configurações → Conexões):**
  - **Spotify**: mostra no perfil, na lista de membros e nas DMs a música que está tocando, com capa e barra de tempo. Os amigos podem clicar em **Ouvir junto**, que toca a mesma música no Spotify deles, no mesmo ponto (precisa de Spotify Premium e do Spotify aberto em algum aparelho).
    - **Para ativar (uma vez, só o admin):** entre em developer.spotify.com/dashboard → Create app → em Redirect URIs coloque `https://telao-zeta-three.vercel.app/` e marque Web API → copie o **Client ID** e cole em Configurações → Conexões (aparece só para o admin).
    - No modo de desenvolvimento, o Spotify libera até 25 pessoas: adicione o e-mail do Spotify de cada amigo em **User Management** no painel do app.
  - **Contas de jogo**: Steam, Xbox, PlayStation, Riot ID, Epic, Battle.net e GitHub aparecem no cartão de perfil (Perfis → Links). Riot, Epic e Battle.net copiam o nick ao clicar.
  - **Atividade**: clique no seu avatar → **Definir atividade**: Jogando, Assistindo, Ouvindo, Estudando ou Trabalhando, com o tempo ("há 32 min"). Tem lista de jogos prontos.
- **Eventos do servidor:** botão **Eventos** no topo da lista de canais. Crie um evento com data, duração e canal de voz; o pessoal marca "Tenho interesse" e recebe aviso 10 minutos antes e na hora, com botão para entrar na call. Cargo novo: **Gerenciar eventos**.
- **Telão para Windows:** veja a pasta **telao-desktop** (tem o LEIA-ME dela). Depois de gerar o instalador, cole o link em Configurações → App e instalação. Aparece o botão **Baixar para Windows** no app, na tela de login e na página `/baixar`.

## Spotify para todo mundo (versão 6.3)

O jeito principal agora é pelo **Last.fm**, que não tem limite de pessoas nem lista de liberação, e funciona com Spotify grátis ou Premium.

**Você (admin), uma vez só:**
1. Crie uma conta em last.fm (se não tiver) e entre em **last.fm/api/account/create**.
2. Em *Application name* coloque `Telão` e clique em **Submit** (o resto pode ficar vazio).
3. Copie a **API key** e cole no Telão em **Configurações → Conexões → Ativar o Spotify pelo Last.fm → Salvar**.

**Cada pessoa:** Configurações → Conexões → Spotify. Lá tem o passo a passo: criar conta grátis no Last.fm, ligar o Spotify em last.fm/settings/applications e digitar o usuário do Last.fm no Telão. A música aparece no perfil em até 30 segundos depois do play.

O "Spotify direto" (com Ouvir junto) continua opcional e só aparece se você configurar o Client ID do Spotify.

# Versão 6.4: segurança, canais configuráveis, idade e filtro de nudez

**Rode o `supabase.sql` de novo** no SQL Editor (colunas novas nos canais, idade e regras de mensagem).

- **Canais de texto** (engrenagem do canal → Regras/Acesso): modo lento (5 s a 6 h), só leitura (avisos), bloquear links, bloquear arquivos, +18 e canal privado por cargo. As regras valem no banco, não dá para burlar pelo app.
- **Canais de voz**: limite de pessoas, qualidade do áudio (64 a 384 kbps), qualidade de câmera/tela, só "pressionar para falar", bloquear câmera, bloquear tela, +18 e privado por cargo.
- **Idade**: o cadastro pede a data de nascimento (mínimo 13 anos). Ela não aparece para ninguém e não pode ser trocada. Canais e servidores +18 mostram um aviso e só liberam para maiores de 18.
- **Segurança da conta** (Configurações → Segurança): verificação em duas etapas com app autenticador, "sair de todos os aparelhos", aviso antes de abrir links de fora (com alerta de golpe "nitro grátis", links encurtados etc.).
  - Se aparecer erro ao ativar a verificação: Supabase → Authentication → Multi-Factor → deixe **TOTP** ligado.
- **Segurança do servidor** (Configurações do servidor → Segurança): servidor +18, nível de verificação (conta com +5 min, membro há +10 min, exigir duas etapas) e lista de ocorrências do filtro.
- **Anti-spam**: no máximo 8 mensagens a cada 10 segundos por pessoa.
- **Filtro automático de nudez/pornografia**: telas e câmeras são analisadas no próprio aparelho de quem transmite a cada 2,5 s (modelo aberto NSFWJS, pasta `models/nsfw`). Se detectar, a transmissão para na hora e a pessoa recebe um aviso. Na segunda vez em 24 h, fica 24 h sem compartilhar tela e câmera. Nada da tela é enviado para servidor nenhum.
- **Áudio**: supressão de ruído em 3 níveis (a "Forte" junta o filtro do navegador, isolamento de voz, corte de grave/zumbido, nivelador de voz e um portão que fecha o microfone no silêncio), modo música (som estéreo sem filtros) e correção de perda de pacote (a voz não picota com internet ruim).
- **Cabeçalhos de segurança** na Vercel: o site não pode ser aberto dentro de outro site (proteção contra clickjacking) e outras proteções do navegador.

# Versão 6.5: solicitações de mensagem, comunidades, tags, novidades e emojis

**Rode o `supabase.sql` de novo** no SQL Editor. Ele também publica sozinho o aviso "Chegou a versão 6.5" em Novidades.

- **Privacidade das DMs** (Configurações → Privacidade): qualquer pessoa, só quem está num servidor com você (padrão) ou só amigos. Quem não é amigo cai em **Solicitações** (embaixo de Amigos), sem notificação; você aceita ou ignora. Quando viram amigos, a conversa vira normal sozinha.
- **Comunidades** (Configurações do servidor → Comunidade): abre o servidor para o Telão inteiro, com descrição e até 3 assuntos. Ele aparece em **Explorar comunidades** (ícone de globo na barra da esquerda), ganha o selo verde de comunidade e qualquer pessoa entra sem convite (banidos não).
- **Tag do servidor** (nível 2 de impulsos): 2 a 4 letras + um símbolo. Cada membro escolhe "Usar esta tag" e ela aparece ao lado do nome em todo o Telão. Se sair do servidor ou o servidor trocar a tag, atualiza sozinho.
- **Novidades** (sininho no topo da barra): atualizações e anúncios para todas as contas, com bolinha de não lido. Você (admin) publica pelo próprio sininho → **Publicar aviso** (e pode mostrar na tela de quem está online na hora).
- **Emojis de servidor** (Configurações do servidor → Emojis): estáticos e GIF animados, 50 de cada + 25 por nível de impulso. Todo mundo usa dentro do servidor; com **Telão+** usa em qualquer servidor e nas DMs, desde que esteja no servidor do emoji (o banco confere). Escreva `:nome:` ou escolha no seletor de emoji; funciona nas reações também.
- Novo cargo: **Gerenciar emojis**.

# Versão 6.6: Telão Bot de música, celular e lista de membros

**Rode o `supabase.sql` de novo** (tabela da fila de música).

- **Telão Bot de música:** entre numa call e use `/tocar link-ou-nome` em qualquer canal de texto, ou o botão **Telão Bot de música** em Atividades. Todo mundo na call ouve a mesma música, no mesmo ponto (sincronizado pelo relógio do servidor). Tem fila, pular, pausar, repetir (fila ou música), embaralhar, barra de tempo clicável e volume próprio de cada um. O bot aparece na lista da chamada.
  - Comandos: `/tocar`, `/pular`, `/pausar`, `/continuar`, `/parar`, `/fila`, `/repetir`, `/embaralhar`.
  - Toca: links do YouTube (vídeo ou playlist), links diretos de áudio (.mp3, .m4a, .ogg, .wav) e arquivos enviados pelo próprio painel do bot. Link do Spotify vira busca no YouTube.
  - **Busca pelo nome** precisa de uma chave grátis da YouTube Data API: Configurações → Conexões → "Busca do YouTube para o Telão Bot" (só o admin vê, com o passo a passo). Sem a chave, o bot toca por link normalmente.
- **Celular:** barra de navegação embaixo (Início, Explorar, Novidades, Você), botão voltar do celular volta para a lista em vez de fechar, deslizar da borda esquerda para voltar, segurar o dedo numa mensagem/membro/canal abre o menu, janelas e menus abrem de baixo para cima, botões maiores, sem zoom ao digitar no iPhone, respeita o notch e a barra do iPhone, e o player do bot fica compacto.
- **Lista de membros:** o botão de mostrar/esconder agora funciona sem recarregar o chat, lembra a escolha e, em telas menores, abre por cima em vez de sumir.

# Versão 6.7: modo de desempenho (e bot de música desligado)

- **Desempenho** (Configurações → Desempenho): três níveis.
  - **Qualidade:** tudo ligado (animações, partículas, vidro, transições).
  - **Equilibrado:** tira o que mais pesa (vidro desfocado, partículas, sombras grandes) e encurta as animações.
  - **Modo jogo:** o mais leve possível para sobrar FPS. Sem animações nem efeitos, e o Telão trabalha menos em segundo plano (detecção de fala, prévia da tela e filtro de conteúdo com menos frequência). Voz, câmera e tela transmitida continuam com a mesma qualidade.
  - Automático (ligado por padrão): entra no modo jogo sozinho quando o Telão vai para segundo plano. Opcional: modo jogo enquanto você compartilha a tela.
  - Atalho **Ctrl+Shift+G** liga e desliga o modo jogo de qualquer lugar. Quando está ligado aparece "Modo jogo" no seu painel.
- O **Telão Bot de música** foi desligado por enquanto (o código ficou guardado na pasta `desativado/`; a tabela no banco não atrapalha nada).

# Versão 6.8: clipes, estatísticas do servidor e grupos

**Rode o `supabase.sql` de novo** (grupos, tempo em call e estatísticas).

- **Clipes dos últimos 30 segundos:** numa call, aperte **Alt+C** (ou o botão de raio na barra da chamada). O Telão guarda sempre os últimos segundos da tela que você está vendo (ou da sua, ou só o áudio se ninguém transmite), com o som da chamada. Abre uma prévia: **Enviar no chat** (escolhe a conversa ou um canal do servidor, com mensagem opcional) ou **Baixar**. No chat o vídeo ganha a etiqueta "Clipe". Dá para trocar o atalho ou desligar em Configurações → Teclas de atalho → Clipes. Nada sai do computador até você enviar.
  - O atalho funciona com o Telão em foco (limite dos navegadores). No modo jogo a gravação usa menos qualidade para pesar menos.
- **Estatísticas do servidor** (menu do servidor → Estatísticas, ou Configurações do servidor): mensagens, tempo total em call, membros novos, horário de pico, mensagens por dia, mapa de calor por dia da semana × hora (horário de Brasília), quem mais conversa, quem fica mais tempo em call, canais mais ativos e que horas a galera entra em call. Períodos de 7, 30 ou 90 dias. Todo membro vê. O tempo em call começa a contar a partir desta versão.
- **Grupos de DM** (3 a 10 pessoas): botão de pessoas ao lado de "Mensagens diretas", ou "Criar grupo com essa pessoa" dentro de uma DM. Só dá para colocar amigos. Tem conversa, chamada de voz e vídeo, transmissão de tela e clipes, sem precisar de servidor. Quando alguém começa a chamada, todo mundo do grupo recebe o toque. Configurações do grupo: nome, foto, adicionar amigos (qualquer membro), tirar pessoas (só o dono) e sair. Se o dono sai, quem entrou primeiro vira o dono.
