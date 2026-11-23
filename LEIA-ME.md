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

# Versão 6.9: jogos na chamada, modo palco, transcrição de áudio e boas-vindas

**Rode o `supabase.sql` de novo** (conta oficial, palco, ranking dos jogos e a regra nova de "editado").

- **DM de boas-vindas:** toda conta nova recebe na hora uma mensagem da conta oficial **Telão** (com o selo OFICIAL): um cartão com os primeiros passos (chamar amigos, achar ou criar servidor, deixar o perfil com a sua cara, baixar o app para Windows) e os atalhos mais úteis. Ninguém consegue responder nem adicionar a conta oficial. Você já recebe a sua quando rodar o SQL.
  - Para mandar também para quem já tinha conta: no SQL Editor rode `select public.send_welcome_all();` (manda só para quem ainda não recebeu).
- **Jogos dentro da chamada** (botão Atividades na barra da chamada):
  - **Rabisco:** um desenha, o resto adivinha digitando. Quanto mais rápido acertar, mais pontos; quem desenha ganha pontos por cada acerto. Dicas de letras aparecem com o tempo e o jogo avisa quando o palpite está "quase".
  - **Quiz:** 10 perguntas de conhecimentos gerais, 15 segundos cada, acertar rápido vale mais.
  - **Quem é mais provável:** todo mundo vota em segredo em quem combina com a frase; no fim sai a lista de "títulos".
  - Quem abre o jogo é o anfitrião; se ele sair da chamada, outro assume sem perder a partida. Nos servidores os pontos vão para o **ranking do servidor**, que aparece na tela inicial de cada jogo.
- **Modo palco** (editar canal de voz → Chamada → Modo palco): para lives, aulas e anúncios. Quem entra fica na **plateia**, ouvindo; levanta a mão ✋ para pedir para falar. Moderadores (e o dono) sobem no palco e chamam quem levantou a mão. A voz de quem está na plateia fica muda para todo mundo, mesmo que alguém tente burlar o app. Só quem está no palco pode transmitir a tela ou ligar a câmera. Dá para colocar um assunto ("Sexta do karaokê").
- **Transcrição de mensagens de voz:** enquanto você grava, o texto vai aparecendo e é enviado junto com o áudio (no Chrome e no Edge, que usam o reconhecimento de voz do navegador). Quando não sai texto (app do Windows, Firefox ou áudios antigos), aparece **Transcrever**: o Telão baixa um transcritor (Whisper, cerca de 75 MB, só na primeira vez) e transcreve no próprio aparelho. Se o áudio for seu, o texto fica salvo para todo mundo.
- **Filtro anti-nudez removido:** a tela e a câmera não são mais analisadas, e quem estava bloqueado de transmitir foi liberado.
- Correções: o aviso de toque de chamada some quando você entra pelo botão; a barra de controles da chamada não quebra mais em duas linhas.

# Versão 6.10: fechar conversa, avisos pela conta oficial, categorias e impulsos do dono

**Rode o `supabase.sql` de novo.**

- **Fechar conversa:** passe o mouse numa DM ou grupo na lista e clique no **×**. A conversa sai da lista mas nada é apagado; ela volta sozinha quando chegar mensagem nova, ou quando você abrir de novo (pelo perfil, amigos ou Ctrl+K). Vale em todos os aparelhos.
- **Avisos pela conta oficial:** no sininho → **Publicar aviso**, agora dá para escolher onde ele aparece: em **Novidades**, na **DM da conta oficial Telão** de todo mundo (chega com notificação), ou nos dois. Só você (dono do Telão) consegue mandar.
- **Efeitos sempre ligados:** a opção do Windows de desligar animações não desliga mais os efeitos do Telão. Eles só somem pelo próprio Telão: Configurações → Desempenho (Equilibrado / Modo jogo) ou Acessibilidade → Reduzir animações.
- **Categorias de verdade:** criar categoria (mesmo vazia), renomear, mover para cima/baixo, arrastar para reordenar e excluir (escolhendo se os canais ficam ou são apagados junto). Clique nos **⋯** da categoria ou com o botão direito nela. O grupo automático "Canais de texto/voz" também pode ganhar nome e virar categoria.
- **Mais opções nos canais** (botão direito no canal): editar, duplicar (com as mesmas configurações), mover para outra categoria, subir/descer e apagar. No computador dá para **arrastar e soltar** os canais entre categorias.
- **Impulsos ilimitados para o dono do Telão:** em "Impulsionar servidor" você coloca +1, +5 ou "até o nível 3" de uma vez, e tira quando quiser (sem a espera de 7 dias).

# Versão 6.11: ordenar canais e categorias como no Discord

- **Arrastar e soltar novo:** segure e arraste um canal ou uma categoria na lista. Um "fantasma" segue o mouse e uma linha rosa mostra exatamente onde vai cair. Solte em cima do nome de uma categoria para colocar o canal no começo dela. A lista rola sozinha perto da borda e **Esc** cancela.
- **No celular:** segure o dedo uns instantes em cima do canal ou da categoria e arraste.
- A ordem dos canais é salva mesmo se o `supabase.sql` novo ainda não tiver sido rodado.
- Impulsos ilimitados, criar/renomear categorias e duplicar canal precisam do `supabase.sql` da 6.10. Sem ele, agora aparece um aviso claro dizendo isso, em vez de um erro técnico.

# Versão 6.12: celular sem bugs de navegação

- **"Você"** (barra de baixo) abre a lista de configurações, com um **X** no topo para fechar.
- **Voltar** dentro de uma seção volta para a lista (ou fecha, se você abriu a seção direto de outro lugar). O **X** sempre fecha tudo e volta para onde você estava.
- **Barra de baixo** (Início, Explorar, Novidades, Você) funciona de qualquer tela: fecha configurações, janelas e o Explorar antes de trocar. O Explorar não cobre mais a barra.
- **Botão voltar do celular** (e deslizar da borda) segue a mesma lógica: seção → lista → fecha; também fecha Explorar, janelas, menus e a lista de membros.
- A lista de configurações termina acima da barra de baixo (o "Painel do admin" e o "Sair" não ficam mais escondidos atrás dela). Janelas e menus escondem a barra de baixo para ela não cobrir os botões deles.
- A Loja (e outras seções que carregam depois) tinha um "Voltar" que não funcionava: corrigido.
- **Amigos:** as abas cabem na tela e o campo de adicionar amigo não sai mais para fora.
- **Chamada:** os botões ficam centralizados; o de transmitir tela só aparece onde funciona (navegador de celular não transmite tela). Tela cheia do vídeo funciona no iPhone.
- Busca (Ctrl+K) já abre com o teclado; o seletor de emojis não abre mais o teclado sozinho por cima dos emojis.
- Avisos flutuantes não bloqueiam mais toques no que está atrás deles.
- Testado tocando em todos os botões de todas as telas num celular de 390×800 e num de 360×640.

# Versão 6.13: app do iPhone (tela de início)

- No app do iPhone, a barra de status (relógio, sinal, bateria) não cobre mais o **Voltar** e o **X** das configurações, nem os botões do topo do Explorar, das janelas e dos menus.
- **Membros do servidor:** o painel ganhou um cabeçalho com **X** para fechar (no iPhone não existe botão voltar do aparelho).
- **Menus no celular** (menu do servidor, do canal, da mensagem…) agora têm um fundo escuro atrás; tocar nele fecha o menu.
- Testado no "modo iPhone": todas as telas, janelas e menus fecham só pelo que aparece na tela, sem usar o voltar do aparelho.

# Versão 6.14: backup, templates do Discord/Xenon e pastas de servidores

**Precisa rodar o `supabase.sql` novo no Supabase** (funções de backup e a tabela `user_prefs`).

- **Ordenar canais e categorias:** nova tela no menu do servidor (e no menu da categoria) com setas para subir/descer e escolher a categoria de cada canal.
- **Backup do servidor** (Configurações do servidor → Backup, só dono e quem tem Administrador): baixar um arquivo .json com canais, categorias, cargos, permissões, emojis e, se quiser, as últimas 500 mensagens de cada canal; copiar tudo para outro servidor seu; restaurar de um arquivo; ou criar um servidor novo com ele (também em **Adicionar servidor → Criar a partir de um backup**). As mensagens antigas entram pela conta oficial com o nome de quem escreveu.
- **Templates do Discord e do Xenon:** cole um link `discord.new/…`, `discord.com/template/…` ou `xenon.bot/templates/…` e o Telão mostra a prévia e monta canais, categorias, cargos (com as permissões) e canais privados. Dá para criar um servidor novo ou aplicar no servidor atual. Fica em **Adicionar servidor** e em **Backup**. Os templates antigos do Xenon que só têm nome (tipo "starter") só funcionam dentro do Xenon.
- **Pastas e ordem dos servidores na barra:** arraste um servidor (no computador) para mudar a ordem, ou solte em cima de outro para criar uma pasta. Clique na pasta para abrir/fechar. Clique com o botão direito (ou segure no celular) num servidor ou pasta para mover, pôr/tirar da pasta, renomear, mudar a cor ou desfazer. **Organizar servidores** abre uma tela com tudo. Fica salvo na sua conta, em todos os aparelhos.
- **Correção:** reagir com emoji do servidor quebrava o botão da reação (aparecia código na tela e dava erro "row-level security").

# Versão 6.15: rádio, assistir juntos 2, clipes da semana, mural, conquistas, aniversários, retrospectiva e regras da comunidade

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **📻 Rádio do servidor:** ao criar um canal escolha **Rádio** (ou ligue em Configurar canal → Chamada). Quem entra no canal ouve a mesma música, no mesmo ponto. Qualquer pessoa pede música (link do YouTube, ou pelo nome se a busca do YouTube estiver ativada em Conexões), até 3 na fila por pessoa. Pausar, pular, embaralhar e limpar é da moderação; os outros votam para pular (passa quando metade de quem está ouvindo vota; quem pediu a música pode pular a própria).
- **📺 Assistir juntos (melhorado):** fila de vídeos ("Pôr na fila"), passa sozinho para o próximo, botão Próximo, velocidade (0.5x a 2x) igual para todos, aviso de quem pausou, correção automática de atraso, aceita links .mp4/.webm e clipes do Telão, e pula vídeo que não pode tocar fora do YouTube. **Correção:** quem entrava na call depois não recebia o vídeo; agora recebe no mesmo ponto.
- **🎬 Clipes da semana** (menu do servidor): ranking dos clipes e vídeos da semana, votação com 🔥, selo de "Clipe da semana" para o mais votado das semanas passadas e **Assistir todos juntos na call**.
- **⭐ Mural do servidor** (menu do servidor): mensagens marcadas com ⭐ pelo menu da mensagem (**Pôr no mural**), em formato de painel com imagens, vídeos e frases.
- **🏅 Conquistas:** 14 conquistas com níveis (Bronze, Prata, Ouro, Diamante, Lendário): horas em call, mensagens, amigos, vitórias nos jogos, clipes, estrelas no mural, dias seguidos, veterano… Aparecem no cartão do perfil; "Ver todas" mostra o progresso.
- **🎂 Aniversários:** em Configurações → Perfil, ligue "Mostrar meu aniversário" (usa a data da verificação de idade; ano e idade nunca aparecem). No dia: selo 🎂 ao lado do nome, aviso no topo dos servidores com botão "Dar parabéns", e a conta oficial manda um parabéns.
- **🎬 Retrospectiva do ano:** clique no seu nome (canto de baixo) → Retrospectiva. Mostra horas em call, mensagens, servidor favorito, dupla do ano, emoji do ano, jogo do ano… e no fim dá para baixar uma imagem ou mandar no chat. Em dezembro aparece um aviso para todo mundo.
- **🎮 Jogo aberto no PC:** o app do Windows (versão 1.1) detecta jogos conhecidos e mostra "Jogando …" no perfil sozinho (dá para desligar em Conexões). O tempo de jogo entra nas conquistas e na retrospectiva. **Precisa gerar o instalador novo** com a pasta `telao-desktop` atualizada.
- **Regras para entrar** (Configurações do servidor → Comunidade): quem for entrar lê as regras e precisa aceitar; se cancelar, não entra. Membros veem as regras no menu do servidor.
- Esc agora fecha os menus abertos.

# Versão 6.16: abertura do Telão

- **Abertura animada** quando o Telão abre (site, app do celular e app do Windows): o logo da TV se desenha, a onda verde liga a tela, o nome "telão" entra letra por letra e a abertura dá um zoom para dentro do app quando tudo carregou. Toque/clique (ou Esc/Enter) para pular.
- Aparece completa na primeira vez que você abre o Telão e rápida quando só recarrega a página. Em **Configurações → Aparência → Abertura do Telão** dá para escolher: completa na primeira vez, completa sempre, rápida ou desligada, e tem o botão **Ver a abertura**. No Modo jogo ela é sempre rápida.
- Não precisa rodar SQL nem gerar instalador novo.

# Telão para Windows 1.1 (publicado)

- O código do app do Windows agora fica na pasta `desktop/` deste repositório, e o instalador é gerado pelo GitHub Actions (**Actions → Instalador Windows → Run workflow**) e publicado em **Releases**.
- Link fixo do instalador (sempre a versão mais nova): `https://github.com/brabont1-pixel/telao/releases/latest/download/Telao-Setup.exe`
- Para lançar uma versão nova do app: mude `"version"` em `desktop/package.json` e rode o workflow. Quem instalou a partir da 1.1 recebe a atualização sozinho.

# Versão 6.17 e Telão para Windows 1.2

- **Câmera:** se a câmera recusa abrir ("Could not start video source"), o Telão tenta de novo com uma qualidade menor, depois do jeito mais simples e depois com outra câmera do computador. Se mesmo assim não der, explica o motivo de verdade (câmera ocupada por outro programa, bloqueada ou não encontrada).
- **Som da tela sem o som da chamada (app do Windows 1.2):** ao compartilhar a tela com o som do PC, o app agora manda todo o som do computador **menos o do próprio Telão**. Antes, a voz da galera ia junto com a tela e todo mundo se ouvia de novo (eco). O app passou para o Electron 45. No navegador (Chrome/Edge novos) isso já era feito pelo próprio navegador.

# Versão 6.18: mover membros da call e correção no Rabisco

- **Mover membros entre canais de voz** (igual ao Discord): arraste a pessoa da lista da call (na barra de canais) para outro canal de voz. Você sempre pode se arrastar; para mover os outros precisa ser dono, Administrador ou ter "Moderar membros" (e não dá para mover quem tem cargo de admin, a não ser que você seja o dono). No celular: segure na pessoa → **Mover para…**. Quem é movido vê um aviso com o nome de quem moveu.
- **Rabisco:** quando alguém mandava um palpite, quem estava digitando perdia o campo (parava de digitar do nada). Agora o campo continua com o texto e o cursor no lugar.

# Versão 6.19: cartão de convite no chat

- **Precisa rodar o `supabase.sql` novo** (função `invite_preview`).
- Quando alguém manda um link de convite de servidor (…/#convite=código) numa conversa ou canal, aparece um cartão com a cara do Telão: faixa "CONVITE PRO TELÃO", banner do servidor com linhas de TV, o ícone dentro de uma "telinha" com perninhas (rosa e verde), selo de comunidade e nível de impulso, quantos estão online, quantos membros, quantos estão **em call agora** (com selo AO VIVO), desde quando o servidor existe e a descrição.
- Botão **Entrar no servidor** para quem ainda não está (pede para aceitar as regras, se o servidor tiver) e **Abrir servidor** para quem já está. Convite que não existe mais mostra um cartão de "Convite inválido" com uma TV fora do ar.

# Versão 6.20: quem está em call na barra de servidores

- Passar o mouse num servidor da barra da esquerda mostra quem está em call em cada canal de voz (com câmera, mudo e ensurdecido), e quem está **transmitindo a tela** (selo AO VIVO). Atualiza sozinho enquanto o mouse está em cima. Nas pastas, mostra os servidores da pasta que têm gente em call.
- O ícone do servidor ganha uma bolinha verde quando tem alguém em call, e o selo vermelho **AO VIVO** quando alguém está transmitindo.

# Versão 6.21: Feed de clipes, tradução, Stop, Quem sou eu, Truco e Praça

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **🎬 Feed de clipes (estilo Medal):** botão de filme na barra da esquerda. Abas **Em alta**, **Seguindo** e **Recentes**, filtro por jogo e prévia ao passar o mouse. Para postar: depois de gravar um clipe na call (Alt+C) tem o botão **Postar no Feed**; no menu de um clipe/vídeo seu no chat tem **Postar no Feed**; ou **Postar clipe** no próprio Feed (arquivo do computador até 25 MB, ou um clipe que você já mandou). Cada clipe tem título, jogo e quem vê (todo mundo ou só amigos). Dá para curtir (ou dois cliques no vídeo), comentar, seguir quem postou, copiar o link (`#clipe=…`, que vira um cartãozinho no chat) e mandar para alguém. Cada pessoa tem a página de clipes com seguidores, seguindo e curtidas (menu do perfil → **Clipes no Feed**). Limite de 30 clipes por dia por pessoa; quem posta (ou o admin) pode apagar.
- **🌐 Traduzir mensagem:** menu da mensagem → **Traduzir**. Usa o tradutor que já vem no Chrome/Edge novos (roda no próprio computador) e, se não tiver, o MyMemory (grátis). Mostra de que língua veio e dá para esconder.
- **✋ Stop (adedonha):** 5 rodadas, 6 categorias sorteadas. Quem preencher tudo aperta **STOP** e a galera tem 3 segundos para terminar. Depois todo mundo vê as respostas e vota nas que não valem. Resposta única 10, repetida 5, letra errada ou anulada 0.
- **🤔 Quem sou eu?:** cada um recebe um personagem que todo mundo vê, menos você. Na sua vez, pergunte em voz alta (sim ou não), a galera responde nos botões, e você chuta quando souber. Quanto menos vezes, mais pontos.
- **🃏 Truco paulista:** 2 jogadores ou 4 (duplas, o parceiro fica na sua frente). Vira e manilha (zap, copas, espadas, ouros), TRUCO / SEIS / NOVE / DOZE com aceitar, correr ou aumentar, mão de onze sem truco, 12 tentos. Cada um recebe as próprias cartas em particular.
- **🌳 Praça do servidor:** ao criar um canal, escolha **Praça** (ou ligue em Configurar canal). Vira um mapa 2D com fonte, árvores, coreto e mesas. Cada pessoa é um bonequinho; ande com **WASD**/setas ou clicando no chão. Só se ouve quem está perto (o volume cai com a distância). Nas **mesas** e no **cantinho do banco**, só quem está ali dentro se ouve. No **coreto**, a praça toda ouve você. Teclas 1 a 5 mandam emojis por cima do bonequinho. "Ver telas" volta para as câmeras e telas compartilhadas.

# Versão 6.22: legendas consertadas, Praça removida
- **Legendas ao vivo** agora funcionam em qualquer lugar: no Chrome/Edge usam o reconhecimento do navegador e, se ele falhar (app do Windows, Brave, Opera, Firefox, erro de rede), trocam sozinhas para o Whisper no próprio computador (baixa ~75 MB uma vez). Aparece um selo **CC** embaixo enquanto estão ligadas (clique para desligar). Em Configurações → Acessibilidade dá para forçar o reconhecimento no computador.
- A **Praça 2D** foi retirada.

# Versão 6.23: Feed com até 5 clipes e selo de verificado

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **Até 5 clipes por post:** no "Postar no Feed", adicione vários vídeos do computador e/ou clipes que você já mandou, reordene e tire. No Feed o cartão mostra quantos clipes tem, e no player dá para passar com as setas (ou ← →); quando um acaba, o próximo começa.
- **Selo de verificado ✓ (100 seguidores):** é dado automaticamente quando a pessoa chega a 100 seguidores no Feed e fica para sempre (o admin também pode dar em Insígnias). No seu perfil do Feed aparece uma barra de quanto falta.
- **O que o verificado ganha:** 60 clipes por dia (em vez de 30), fixar até 3 clipes no topo do perfil, fixar um comentário em cada clipe, **Painel de criador** (views, curtidas, comentários, seguidores novos da semana e clipes mais vistos) e um empurrãozinho em **Em alta**.

# Versão 6.24: consertos no celular
- **Configurações do servidor no celular** abrem na lista de opções (Visão geral, Cargos, Canais, Emojis…). Antes ficava preso na Visão geral. O "Voltar" de qualquer seção volta para a lista; o X fecha.
- **O Telão começa sempre em português.** Antes, celular configurado em inglês deixava algumas palavras em inglês ("Server name", "Remove"). Para trocar de idioma, use Configurações → Idioma.
- **Foto de quem mandou DM na barra da esquerda** agora fica redonda e certinha, com a moldura animada em volta (quando a pessoa tem) e uma bolinha rosa de mensagem nova.

# Versão 6.25: bloquear pessoas e áudio no app do Windows

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **Bloquear:** clique no nome ou na foto da pessoa → **Bloquear**. Ela não consegue te mandar DM, te ligar nem te pedir amizade (a amizade é desfeita), e não recebe aviso nenhum. Na conversa com ela aparece "Você bloqueou…" com o botão Desbloquear. Nos servidores, as mensagens dela ficam escondidas para você ("mostrar" revela uma por uma). A lista de bloqueados fica em Configurações → Privacidade.
- **Mensagem de voz no app do Windows** voltou a funcionar: o app não liga mais o reconhecimento de voz do navegador (que lá não funciona e atrapalhava o microfone) e grava com o mesmo microfone escolhido para as chamadas. O texto do áudio sai pelo botão "Transcrever".

# Versão 6.26: celular como câmera, sem eco na tela, permissões das categorias e interface nova

**Precisa rodar o `supabase.sql` novo no Supabase** (só para as permissões das categorias; o resto funciona sem).

- **Celular como câmera:** numa chamada, clique na câmera → **Usar o celular** (ou, se o PC não tiver câmera, o Telão já oferece). Aparece um QR code: escaneie com o celular, toque em **Começar** e o celular vira a sua câmera, com os efeitos e tudo. O vídeo vai direto do celular para o PC pela sua rede (sem passar por servidor). O código se renova a cada 2 minutos. No celular dá para **Virar** (câmera da frente/de trás) e **Parar**. Funciona melhor com os dois no mesmo Wi-Fi.
- **Sem eco na transmissão:** quando alguém compartilha a tela com som num PC que não consegue separar o som da chamada (Windows 10, Linux), a voz de todo mundo ia junto e cada um se ouvia de volta. Agora quem transmite avisa os outros, e quem assiste ouve aquela tela bem baixinha enquanto **você** fala (e enquanto os outros falam), o tempo de a voz ir e voltar. No Windows 11 o próprio sistema já tira a voz da captura.
- **Permissões das categorias:** clique nos ⋯ da categoria → **Permissões da categoria**. **Categoria privada:** só os cargos escolhidos veem a categoria, os canais, as mensagens e entram nas chamadas dela (para os outros ela some; o dono e os Administradores sempre veem). **Limitar quem escreve:** os outros veem os canais de texto mas só leem (moderadores sempre escrevem). Categorias privadas ganham um cadeado.
- **Interface nova:** os servidores saíram da barra lateral e viraram um **dock** em cima dos canais (coluna única), com painéis soltos de cantos grandes, fundo com grade e brilhos neon, canal ativo em destaque rosa. Arrastar servidores e pastas continua funcionando (agora de lado), e a rodinha do mouse anda pelo dock.

# Versão 6.27: status no perfil, roleta, 4 jogos novos, sons do servidor, modo streamer, supressão por IA e denúncias

**Precisa rodar o `supabase.sql` novo no Supabase** (sons do servidor, denúncias e ranking dos jogos novos).

- **Status no perfil:** quem está jogando e ouvindo música ao mesmo tempo mostra os dois cartões (o jogo vem do app do Windows ou da atividade que a pessoa definiu), com o tempo de jogo andando ("há 1 h 05 min"). Se a pessoa está numa call que você pode entrar, o cartão dela mostra **Entrar junto** (e **Assistir a tela** se ela estiver transmitindo).
- **🎡 Roleta / sorteio:** na call, Atividades → Roleta. Coloque as opções (ou use "Quem está na call", "Sim ou não", "Cara ou coroa", "1 a 10") e gire: todo mundo vê a mesma roda parando no mesmo lugar. Tem também **Sortear times** com quem está na call.
- **Jogos novos** (Atividades → Jogos):
  - **🪢 Forca:** a galera chuta letras na mesma palavra (dá para usar o teclado). Letra certa dá pontos para quem chutou; errada tira uma vida do grupo. Chutar a palavra inteira vale bônus.
  - **🎵 Quiz de música:** o anfitrião escolhe o estilo (pop, sertanejo, funk, trap, rap, pagode, MPB, rock, anos 2000), toca um trecho de 30 s e a galera escolhe qual é. Mais rápido = mais pontos. Os trechos vêm da busca pública do iTunes.
  - **📞 Telefone sem fio** (3 ou mais): cada um escreve uma frase, o próximo desenha, o outro adivinha o desenho, e assim vai. No final o anfitrião mostra cada sequência passo a passo.
  - **🚢 Batalha naval:** dois capitães, 5 navios cada, tabuleiro 8×8. Acertou, atira de novo. O resto da call assiste (sem ver os navios).
- **🔊 Sons do servidor:** em Configurações do servidor → **Sons**, quem gerencia emojis sobe sons curtos (até 7 s / 1 MB, 24 por servidor). Eles aparecem no painel de Atividades da call para todo mundo tocar. Cada pessoa só toca um som a cada 3 s. Em Configurações → Voz e vídeo dá para baixar o volume da soundboard ou desligar.
- **🎥 Modo streamer:** borra seu e-mail e os links e códigos de convite, e silencia notificações e o som de mensagem. Liga sozinho quando você compartilha a tela (dá para desligar isso em Configurações → Privacidade) e tem atalho no menu do seu perfil. Aparece um aviso roxo no topo enquanto está ligado.
- **✨ Supressão de ruído por IA:** Configurações → Voz e vídeo → Supressão de ruído → **IA**. Usa uma rede neural (RNNoise) que roda no próprio computador e apaga teclado, ventilador e ar-condicionado. Baixa uma vez (~150 KB). Se não carregar, volta sozinha para a Forte.
- **🛡️ Denúncias:** menu da mensagem → **Denunciar mensagem** (spam, ofensa, assédio, conteúdo adulto, golpe ou outro). Vai para quem tem "Gerenciar mensagens" ou "Moderar membros", em Configurações do servidor → **Denúncias** (com contador). Lá dá para ver no chat, apagar a mensagem, dar castigo, banir, marcar como resolvida ou ignorar. O banco guarda uma cópia da mensagem, então apagar não some com a prova. Quem denunciou fica em segredo. Denúncias em DM vão para o admin do Telão (no painel de admin).

# Versão 6.28: botão de baixar o app para Windows
- No navegador do Windows, a barrinha de baixo agora é **Telão para Windows → Baixar**, que baixa o instalador (`Telao-Setup.exe`) direto da página de versões do GitHub (ou do link que o admin salvou em Configurações → App). O X esconde de vez. No app do Windows a barra não aparece; no celular continua a instalação como app.

# Versão 6.29: aviso de denúncias para quem modera
- Antes a denúncia só aparecia se a pessoa entrasse em Configurações do servidor → Denúncias. Agora o Telão confere todos os servidores que você modera (e as denúncias em DM, se você for o admin) ao abrir e a cada 45 s:
  - aparece um aviso **"Nova denúncia em …"** com o botão **Ver denúncias** (inclusive para as que chegaram enquanto você estava fora);
  - o ícone do servidor ganha um escudo vermelho com o número de denúncias abertas;
  - o menu do servidor tem **Denúncias (n)**, que funciona também para moderadores sem acesso às outras configurações;
  - para o admin, as denúncias de DM ficam no topo do Painel do admin e no menu do seu perfil.

# Versão 6.30: perfil inteiro na tela, chat abre no fim e fixar conversas

**Precisa rodar o `supabase.sql` novo no Supabase** (para as conversas fixadas valerem em todos os aparelhos).

- **Perfil cortado:** o cartão de perfil (e qualquer menu alto) agora se ajusta quando a capa e as insígnias terminam de carregar: fica inteiro na tela e rola se for maior que a janela.
- **Conversa abre no fim:** ao entrar numa DM ou canal, o chat fica grudado na última mensagem, mesmo enquanto imagens, vídeos, reações e cargos ainda estão carregando ou a janela muda de tamanho. Só solta quando você rola para cima.
- **📌 Fixar conversa:** passe o mouse numa conversa da lista (ou clique com o botão direito → **Fixar conversa**) e clique no alfinete. As fixadas ficam no topo, separadas por uma linha, até 10. Fica salvo na sua conta.

# Versão 6.31: rascunho, salvos, prévia de links, gravar a call, cinema, aniversários, bichinho, música do perfil e cartão

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **✏️ Rascunho salvo:** o que você começou a escrever fica guardado em cada conversa (neste aparelho). A conversa ganha um ✏️ na lista até você mandar ou apagar.
- **🔖 Mensagens salvas:** menu da mensagem → **Salvar mensagem**. Ficam no botão 🔖 no topo da conversa (e no menu do seu perfil), com atalho para ir até a mensagem. Só você vê, e a cópia fica guardada mesmo se apagarem a original (até 500).
- **🔗 Prévia de links:** links de **TikTok, Instagram, Twitch e Spotify** viram cartões no chat (o Spotify já vem com player; os outros carregam o vídeo quando você clica). O YouTube agora mostra o título embaixo da miniatura. Títulos e capas vêm pelo `/api/oembed`.
- **🔴 Gravar a call:** botão de gravar no painel da call. Grava o áudio de todo mundo (sua voz e a dos outros) num arquivo que fica só com você. Todos na call veem "🔴 Gravando" enquanto isso. No fim dá para ouvir, **baixar**, **mandar no chat** ou **transcrever** (Whisper, no próprio computador, com marcação de tempo). Para sozinha em 2 horas.
- **🎬 Modo cinema melhor:** no botão de cinema da tela tem **Modo cinema para a call toda**. A tela ocupa tudo, as câmeras ficam pequenas embaixo, aparece uma barra de reações rápidas, e os controles somem quando o mouse fica parado. Esc sai só para quem apertou.
- **🎂 Aniversários do servidor:** menu do servidor → **Aniversários**, com um calendário do ano e os próximos 30 dias (só de quem ativou "Mostrar meu aniversário"; o ano nunca aparece). No dia, a conta do Telão posta um parabéns no servidor com o botão **Dar parabéns**. Em Visão geral do servidor dá para escolher o canal ou desligar.
- **🐾 Bichinho do servidor:** aparece na lateral do servidor. Cresce com mensagens (+1, até 40 por pessoa por dia), tempo em call (+5 a cada 5 min, até 60 por dia) e carinho (+5, uma vez por dia). Passa de ovo → filhote → jovem → adulto → lendário. Se o servidor fica parado ele fica triste e depois doente, mas nunca morre. Quem gerencia o servidor muda nome, espécie (slime, gatinho, dragãozinho, robô, fantasminha, patinho) e cor.
- **🎵 Música do perfil:** Configurações → Perfil → Música do perfil. Busque e escolha um trecho de 30 s. Ele toca baixinho quando alguém abre o seu perfil, com botão de pausar. Dá para desligar a música dos outros ou mudar o volume ali mesmo.
- **📊 Cartão de estatísticas:** no menu do seu perfil → **Meu cartão de estatísticas**. Mostra horas em call, mensagens, jogo mais jogado, servidor favorito e mais, num cartão de story (30 dias, 1 ano ou desde sempre; 5 cores). Dá para baixar, compartilhar ou mandar no chat.

# Versão 6.32: bichinho opcional e trecho da música do perfil

**Precisa rodar o `supabase.sql` novo no Supabase.**

- **🐾 Bichinho opcional:** agora ele começa **desligado**. Quem gerencia o servidor liga pelo menu do servidor → **Ativar bichinho do servidor** (ou em Visão geral do servidor → Bichinho do servidor), e pode desligar do mesmo jeito; os pontos ficam guardados. Desligado, ele não aparece e não conta pontos. Cada pessoa também pode marcar **Esconder o bichinho da minha lateral** (só para ela).
- **✂️ Trecho da música do perfil:** em Configurações → Perfil → Música do perfil, depois de escolher a música aparece o editor de trecho: arraste para escolher onde começa, escolha a duração (5, 10, 15, 20 ou 30 s), ouça e salve. Quem abre seu perfil ouve só esse pedaço, em loop.

# Versão 6.33: trecho da música inteira no perfil

**Precisa rodar o `supabase.sql` novo no Supabase** (libera músicas enviadas pelo próprio Telão).

- Em Configurações → Perfil → Música do perfil, tem **Usar uma música do meu computador** (MP3, M4A, WAV, OGG… até 40 MB). Aparece a forma de onda da música **inteira**: clique ou arraste para escolher qualquer parte, escolha a duração (5 a 30 s), ouça e salve.
- A música inteira não sai do seu computador: só o pedaço escolhido é enviado para o seu perfil.
- A busca continua funcionando, mas ela só tem 30 s de cada música (é o que o iTunes libera). Para escolher em qualquer parte, use o arquivo.

# Versão 6.34: som do TikTok vazando na call pelo celular
- Quem estava na call pelo celular e ia ver TikTok/YouTube/Instagram continuava com o microfone aberto, e ele pegava o som do alto-falante (o cancelamento de eco só tira o som da própria call). Agora, **no celular, o microfone muta sozinho quando você sai do Telão e volta quando você abre de novo**. Os outros veem o ícone de mutado normalmente.
- Se você já estava mutado, continua mutado ao voltar.
- Dá para desligar em Configurações → Voz e vídeo → No celular (útil para quem fala com a tela bloqueada).
