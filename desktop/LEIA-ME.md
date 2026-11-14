# Telão para Windows: como gerar o instalador (.exe)

Esta pasta é o Telão como programa de Windows. Ele abre o seu site (`https://telao-zeta-three.vercel.app`) numa janela própria. Então **toda atualização que você sobe na Vercel já aparece no programa**, sem precisar gerar outro instalador.

O que o programa tem a mais que o navegador:
- ícone no menu Iniciar e na área de trabalho, janela própria;
- fica na **bandeja** (perto do relógio) ao fechar o X, para continuar recebendo chamadas. Para sair de vez: botão direito no ícone da bandeja → Sair;
- **compartilhar tela com seletor próprio** (telas e janelas com miniatura) e com o **som do PC**;
- notificações do Windows, ícone piscando com mensagem nova, opção "Iniciar com o Windows";
- se atualiza sozinho quando você publica uma versão nova do instalador no GitHub.

## Jeito 1: no seu PC (mais fácil)

1. Instale o **Node.js** (versão LTS): https://nodejs.org/pt
2. Dê dois cliques em **GERAR-INSTALADOR.bat**.
3. Espere uns minutos (na primeira vez ele baixa o Electron). No fim, abre a pasta `dist` com o **Telao-Setup.exe**.
4. Suba esse arquivo em algum lugar com link direto (o melhor é o GitHub, no Jeito 2) e cole o link no Telão: **Configurações → App e instalação → Link do instalador**. Pronto: aparece o botão **Baixar para Windows** para todo mundo, e a página `telao-zeta-three.vercel.app/baixar` passa a funcionar.

## Jeito 2: o GitHub gera sozinho (e o app se atualiza sozinho)

1. Crie um repositório no GitHub (ex.: `telao-desktop`) e envie **todos os arquivos desta pasta**, inclusive a pasta `.github`.
2. Vá em **Actions → Instalador Windows → Run workflow**. Em uns 5 minutos o `Telao-Setup.exe` aparece em **Releases**.
3. O link fixo do instalador fica assim (troque SEU_USUARIO):
   `https://github.com/SEU_USUARIO/telao-desktop/releases/latest/download/Telao-Setup.exe`
   Cole no Telão em **Configurações → App e instalação → Link do instalador**.
4. Para lançar uma versão nova do programa: mude `"version"` no `package.json` (ex.: 1.0.1) e rode o workflow de novo. Quem já tem o Telão instalado recebe a atualização sozinho.

## Avisos

- **"O Windows protegeu o computador"**: aparece porque o instalador não tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**. Para sumir esse aviso, precisaria de um certificado de assinatura de código (pago).
- **Som da tela no programa**: o som do PC vai inteiro, então use fone de ouvido para a call não voltar pela tela. Ou compartilhe pelo Chrome/Edge escolhendo só a janela/aba.
- **Login com Google no programa**: se o Google recusar ("navegador não seguro"), entre com e-mail e senha no programa, ou entre uma vez pelo navegador.
- **Spotify**: funciona igual ao site, mas o endereço de retorno no painel do Spotify continua sendo `https://telao-zeta-three.vercel.app/`.
- Se um dia o site mudar de endereço, troque em `app-config.json`.

## Versão 1.1 do programa

- **Jogo aberto no PC:** o programa olha a lista de programas abertos a cada 20 segundos e, se for um jogo conhecido (Valorant, CS2, LoL, Minecraft, Fortnite, GTA V, Roblox, EA FC e mais de 80 outros), avisa o Telão, que mostra "Jogando …" no seu perfil e conta o tempo de jogo. Ninguém vê a lista dos seus programas: só o nome do jogo reconhecido sai do PC. Dá para desligar em Configurações → Conexões.
- Para atualizar: gere o instalador de novo (Jeito 1 ou Jeito 2 acima). Quem instalou pelo GitHub (Jeito 2) recebe sozinho.
