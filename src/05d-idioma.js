/* =====================================================================
   v5: IDIOMAS — Português · English · Español
   Traduz a interface (nunca o que as pessoas escrevem).
   ===================================================================== */
const LANGS = [['pt','Português (Brasil)','🇧🇷'],['en','English','🇺🇸'],['es','Español','🇪🇸']];
if(!P.lang){ const n = (navigator.language || 'pt').slice(0, 2); P.lang = ['en','es'].includes(n) ? n : 'pt'; }
// [português, inglês, espanhol]
const DICT_RAW = [
  ['Início · amigos e conversas','Home · friends and chats','Inicio · amigos y chats'],['Adicionar um servidor','Add a server','Añadir un servidor'],
  ['Loja do Telão','Telão Shop','Tienda de Telão'],['Amigos','Friends','Amigos'],['Mensagens diretas','Direct messages','Mensajes directos'],
  ['Online','Online','En línea'],['Todos','All','Todos'],['Pendentes','Pending','Pendientes'],['Adicionar amigo','Add friend','Añadir amigo'],
  ['Mensagem','Message','Mensaje'],['Ligar','Call','Llamar'],['Dar presente','Send a gift','Regalar'],['Copiar usuário','Copy username','Copiar usuario'],
  ['Editar perfil','Edit profile','Editar perfil'],['Desfazer amizade','Remove friend','Eliminar amigo'],['Aceitar','Accept','Aceptar'],['Recusar','Decline','Rechazar'],
  ['Canais de texto','Text channels','Canales de texto'],['Canais de voz','Voice channels','Canales de voz'],['Convidar pessoas','Invite people','Invitar personas'],
  ['Impulsionar servidor','Boost server','Impulsar servidor'],['Configurações do servidor','Server settings','Ajustes del servidor'],['Criar canal','Create channel','Crear canal'],
  ['Criar categoria','Create category','Crear categoría'],['Sair do servidor','Leave server','Salir del servidor'],['Excluir servidor','Delete server','Eliminar servidor'],
  ['Membros','Members','Miembros'],['Dono do servidor','Server owner','Dueño del servidor'],['Em chamada','In a call','En llamada'],['AO VIVO','LIVE','EN VIVO'],
  ['Clique para assistir','Click to watch','Haz clic para ver'],['Assistir','Watch','Ver'],['Entrar e assistir','Join and watch','Entrar y ver'],
  ['Sair da chamada','Leave call','Salir de la llamada'],['Silenciar','Mute','Silenciar'],['Ativar microfone','Unmute','Activar micrófono'],
  ['Ensurdecer','Deafen','Ensordecer'],['Configurações','Settings','Ajustes'],['Compartilhar tela','Share screen','Compartir pantalla'],['Parar de compartilhar','Stop sharing','Dejar de compartir'],
  ['Câmera','Camera','Cámara'],['Atividades','Activities','Actividades'],['Atividades e soundboard','Activities and soundboard','Actividades y soundboard'],
  ['Assistir juntos','Watch together','Ver juntos'],['Legendas ao vivo','Live captions','Subtítulos en vivo'],['Reações na tela','On-screen reactions','Reacciones en pantalla'],
  ['Efeitos da câmera','Camera effects','Efectos de cámara'],['Tela cheia','Fullscreen','Pantalla completa'],['Modo cinema','Cinema mode','Modo cine'],['Tirar print','Screenshot','Captura'],
  ['Janela flutuante','Picture-in-picture','Ventana flotante'],['Desenhar na tela (todos veem)','Draw on screen (everyone sees)','Dibujar en pantalla (todos lo ven)'],
  ['Volume da tela','Screen volume','Volumen de la pantalla'],['Volume da voz','Voice volume','Volumen de la voz'],
  ['Responder','Reply','Responder'],['Editar','Edit','Editar'],['Mais','More','Más'],['Reagir','React','Reaccionar'],['Adicionar reação','Add reaction','Añadir reacción'],
  ['Apagar mensagem','Delete message','Eliminar mensaje'],['Copiar texto','Copy text','Copiar texto'],['Copiar link','Copy link','Copiar enlace'],['Fixar','Pin','Fijar'],
  ['Anexar arquivos','Attach files','Adjuntar archivos'],['Emoji','Emoji','Emoji'],['Mensagem de voz','Voice message','Mensaje de voz'],['Buscar','Search','Buscar'],
  ['Buscar nesta conversa','Search this chat','Buscar en este chat'],['Buscar ou ir para…','Search or jump to…','Buscar o ir a…'],['Para onde você quer ir?','Where do you want to go?','¿A dónde quieres ir?'],
  ['Mensagens fixadas','Pinned messages','Mensajes fijados'],['Nenhuma mensagem fixada ainda.','No pinned messages yet.','Aún no hay mensajes fijados.'],
  ['novas mensagens','new messages','mensajes nuevos'],['editado','edited','editado'],['Solte para enviar','Drop to send','Suelta para enviar'],['Respondendo a','Replying to','Respondiendo a'],
  ['Carregando…','Loading…','Cargando…'],['Cancelar','Cancel','Cancelar'],['Salvar','Save','Guardar'],['Salvar alterações','Save changes','Guardar cambios'],['Fechar','Close','Cerrar'],
  ['Fechar (Esc)','Close (Esc)','Cerrar (Esc)'],['Confirmar','Confirm','Confirmar'],['Remover','Remove','Quitar'],['Redefinir','Reset','Restablecer'],['Enviar','Send','Enviar'],
  ['Criar','Create','Crear'],['Copiar','Copy','Copiar'],['Apagar','Delete','Eliminar'],['Abrir','Open','Abrir'],['Baixar','Download','Descargar'],['Mostrar','Show','Mostrar'],
  ['Em breve','Coming soon','Próximamente'],['Padrão','Default','Predeterminado'],['Nenhum','None','Ninguno'],['Usar','Use','Usar'],['Tirar','Take off','Quitar'],['Retirar','Withdraw','Retirar'],
  ['Cuidado — você tem alterações não salvas!','Careful — you have unsaved changes!','¡Cuidado, tienes cambios sin guardar!'],
  ['Configurações de usuário','User settings','Ajustes de usuario'],['Minha conta','My account','Mi cuenta'],['Perfis','Profiles','Perfiles'],['Perfil','Profile','Perfil'],
  ['Loja e presentes','Shop and gifts','Tienda y regalos'],['Impulsos','Boosts','Impulsos'],['Configurações do app','App settings','Ajustes de la app'],['Aparência','Appearance','Apariencia'],
  ['Acessibilidade','Accessibility','Accesibilidad'],['Idioma','Language','Idioma'],['Voz e vídeo','Voice and video','Voz y video'],['Notificações','Notifications','Notificaciones'],
  ['Teclas de atalho','Keybinds','Atajos de teclado'],['App e instalação','App and install','App e instalación'],['Administração','Administration','Administración'],
  ['Painel do admin','Admin panel','Panel de admin'],['Sair','Log out','Cerrar sesión'],['Visão geral','Overview','Vista general'],['Cargos','Roles','Roles'],['Canais','Channels','Canales'],
  ['Convites','Invites','Invitaciones'],['Nome de exibição','Display name','Nombre visible'],['Nome de usuário','Username','Nombre de usuario'],['E-mail','Email','Correo'],
  ['Senha','Password','Contraseña'],['Mudar senha','Change password','Cambiar contraseña'],['Excluir conta','Delete account','Eliminar cuenta'],['Remoção de conta','Account removal','Eliminación de cuenta'],
  ['Entrar com','Sign-in method','Inicio de sesión con'],['Sobre mim','About me','Sobre mí'],['Membro desde','Member since','Miembro desde'],['Pronomes','Pronouns','Pronombres'],
  ['Insígnias','Badges','Insignias'],['Links','Links','Enlaces'],['Banner','Banner','Banner'],['Avatar','Avatar','Avatar'],['Cor do avatar','Avatar color','Color del avatar'],
  ['Cor do banner','Banner color','Color del banner'],['Prévia','Preview','Vista previa'],['Tema','Theme','Tema'],['Temas coloridos','Colorful themes','Temas de colores'],
  ['Escuro','Dark','Oscuro'],['Claro','Light','Claro'],['Preto (AMOLED)','Black (AMOLED)','Negro (AMOLED)'],['Cor de destaque','Accent color','Color de acento'],
  ['Escolher outra cor','Pick another color','Elegir otro color'],['Modo compacto','Compact mode','Modo compacto'],['Tamanho da fonte das conversas','Chat font size','Tamaño de letra del chat'],
  ['Configurações de voz','Voice settings','Ajustes de voz'],['Dispositivo de entrada','Input device','Dispositivo de entrada'],['Dispositivo de saída','Output device','Dispositivo de salida'],
  ['Testar microfone','Test microphone','Probar micrófono'],['Modo de entrada','Input mode','Modo de entrada'],['Processamento de voz','Voice processing','Procesamiento de voz'],
  ['Qualidade','Quality','Calidad'],['Resolução','Resolution','Resolución'],['Bitrate máximo','Max bitrate','Bitrate máximo'],
  ['Abaixar o som das telas quando alguém fala','Lower screen audio when someone talks','Bajar el audio de las pantallas cuando alguien habla'],
  ['Sons de entrar, sair e mutar','Join, leave and mute sounds','Sonidos de entrar, salir y silenciar'],
  ['Telão+','Telão+','Telão+'],['Turbine seu perfil e suas transmissões.','Supercharge your profile and your streams.','Potencia tu perfil y tus transmisiones.'],
  ['Compare','Compare','Comparar'],['Grátis','Free','Gratis'],['Seus pagamentos','Your payments','Tus pagos'],
  ['Loja','Shop','Tienda'],['Meus itens','My items','Mis artículos'],['Tudo','All','Todo'],['Decorações','Decorations','Decoraciones'],['Entradas na call','Call entrances','Entradas a la llamada'],
  ['Pacotes de som','Sound packs','Paquetes de sonido'],['Títulos','Titles','Títulos'],['Fundos de perfil','Profile backgrounds','Fondos de perfil'],
  ['Pegar fichas do dia','Claim daily coins','Reclamar fichas del día'],['Volte amanhã ✔','Come back tomorrow ✔','Vuelve mañana ✔'],['Pegar','Claim','Reclamar'],
  ['Dar um presente','Send a gift','Hacer un regalo'],['Para','To','Para'],['Presente','Gift','Regalo'],['Mensagem (opcional)','Message (optional)','Mensaje (opcional)'],
  ['Enviar presente','Send gift','Enviar regalo'],['Você ganhou um presente!','You got a gift!','¡Recibiste un regalo!'],['Aberto ✔','Opened ✔','Abierto ✔'],['Ainda fechado','Still wrapped','Aún cerrado'],
  ['Impulsos de servidor','Server boosts','Impulsos de servidor'],['Impulsos do servidor','Server boosts','Impulsos del servidor'],['Impulsionar este servidor','Boost this server','Impulsar este servidor'],
  ['O que os impulsos liberam','What boosts unlock','Lo que desbloquean los impulsos'],['Níveis','Levels','Niveles'],['Personalização liberada','Unlocked customization','Personalización desbloqueada'],
  ['Ninguém ainda — seja o primeiro!','Nobody yet — be the first!','Nadie aún, ¡sé el primero!'],['Impulsionando este servidor','Boosting this server','Impulsando este servidor'],
  ['Visão','Vision','Visión'],['Movimento','Motion','Movimiento'],['Leitura e audição','Reading and hearing','Lectura y audición'],['Leitor de tela','Screen reader','Lector de pantalla'],
  ['Alto contraste','High contrast','Alto contraste'],['Fonte mais legível','More legible font','Fuente más legible'],['Sublinhar links','Underline links','Subrayar enlaces'],
  ['Botões e áreas de toque maiores','Bigger buttons and touch areas','Botones y áreas táctiles más grandes'],['Contorno de foco bem visível','Clearly visible focus outline','Contorno de foco bien visible'],
  ['Reduzir animações','Reduce motion','Reducir animaciones'],['Ler mensagens novas em voz alta','Read new messages aloud','Leer mensajes nuevos en voz alta'],
  ['Legendas ao vivo nas chamadas','Live captions in calls','Subtítulos en vivo en llamadas'],['Mostrar legendas dos outros','Show other people\'s captions','Mostrar subtítulos de otros'],['Testar','Test','Probar'],
  ['Entrar','Log in','Entrar'],['Cadastre-se','Sign up','Regístrate'],['Continuar com Google','Continue with Google','Continuar con Google'],['Boas-vindas de volta!','Welcome back!','¡Bienvenido de nuevo!'],
  ['Que bom te ver de novo.','Great to see you again.','Qué bueno verte otra vez.'],['Precisa de uma conta?','Need an account?','¿Necesitas una cuenta?'],['Não chegou o e-mail?','Didn\'t get the email?','¿No te llegó el correo?'],
  ['Reenviar confirmação','Resend confirmation','Reenviar confirmación'],['Adicione amigos para conversar','Add friends to chat','Añade amigos para chatear'],
  ['Enviar pedido de amizade','Send friend request','Enviar solicitud de amistad'],['Nova conversa','New chat','Nuevo chat'],['Definir um status personalizado','Set a custom status','Definir un estado personalizado'],
  ['Disponível','Online','Disponible'],['Ausente','Idle','Ausente'],['Não perturbe','Do not disturb','No molestar'],['Invisível','Invisible','Invisible'],
  ['Entrar num servidor','Join a server','Unirse a un servidor'],['Criar o meu','Create my own','Crear el mío'],['Entrar no servidor','Join server','Unirse al servidor'],
  ['Nome do servidor','Server name','Nombre del servidor'],['Nome do canal','Channel name','Nombre del canal'],['Descrição','Description','Descripción'],['Texto','Text','Texto'],
  ['Atender','Answer','Contestar'],['Desconectar','Disconnect','Desconectar'],['Instalar','Install','Instalar'],['Instalar Telão','Install Telão','Instalar Telão'],
  ['Nova atualização do Telão disponível!','A new Telão update is available!','¡Hay una nueva actualización de Telão!'],['Atualizar agora','Update now','Actualizar ahora'],
  ['Clique aqui para ativar o som da chamada','Click here to enable call audio','Haz clic aquí para activar el audio de la llamada'],
  ['Esse servidor ainda não tem canais','This server has no channels yet','Este servidor aún no tiene canales'],['Nada encontrado','Nothing found','No se encontró nada'],
  ['Nada encontrado.','Nothing found.','No se encontró nada.'],['Digite para buscar mensagens.','Type to search messages.','Escribe para buscar mensajes.'],
  ['Procurar membro','Search member','Buscar miembro'],['Procurar emoji','Search emoji','Buscar emoji'],['O que está rolando?','What\'s up?','¿Qué pasa?'],
];
const DICT = new Map(DICT_RAW.map(([pt, en, es]) => [pt, { en, es }]));
// textos com partes que mudam
const RULES = [
  [/^Hoje às (.+)$/, { en:'Today at $1', es:'Hoy a las $1' }], [/^Ontem às (.+)$/, { en:'Yesterday at $1', es:'Ayer a las $1' }],
  [/^(\d+) online · (\d+) membros?$/, { en:'$1 online · $2 members', es:'$1 en línea · $2 miembros' }],
  [/^Online — (\d+)$/, { en:'Online — $1', es:'En línea — $1' }], [/^Offline — (\d+)$/, { en:'Offline — $1', es:'Desconectado — $1' }],
  [/^Todos os amigos — (\d+)$/, { en:'All friends — $1', es:'Todos los amigos — $1' }], [/^Pendentes — (\d+)$/, { en:'Pending — $1', es:'Pendientes — $1' }],
  [/^Conversar em (.+)$/, { en:'Message $1', es:'Escribir en $1' }], [/^Mensagem para (.+)$/, { en:'Message $1', es:'Mensaje para $1' }],
  [/^Meus itens \((\d+)\)$/, { en:'My items ($1)', es:'Mis artículos ($1)' }], [/^Impulso (\d)$/, { en:'Boost $1', es:'Impulso $1' }],
  [/^Nível (\d)$/, { en:'Level $1', es:'Nivel $1' }], [/^(\d+) impulsos$/, { en:'$1 boosts', es:'$1 impulsos' }],
  [/^(.+) está digitando…$/, { en:'$1 is typing…', es:'$1 está escribiendo…' }],
];
function tr(text){
  if(P.lang === 'pt' || !text) return null;
  const t = text.trim(); if(!t || t.length > 120) return null;
  const d = DICT.get(t); if(d) return text.replace(t, d[P.lang]);
  for(const [re, o] of RULES) if(re.test(t)) return text.replace(t, t.replace(re, o[P.lang]));
  return null;
}
// nunca traduz o que é conteúdo dos usuários
const SKIP = '.ct, .bub .ct, .editbox, .dn, .un, .cst, .pcard2 p, .plinks, .nm, .hd b, .mt .nm, .vu .nm, .rpl, .emb, .poll, .gt small, input, textarea, [contenteditable], [data-noi18n], script, style, code, pre';
function trNode(n){
  if(n.nodeType === 3){
    const p = n.parentElement; if(!p || p.closest(SKIP) || n.nodeValue === n._trOut) return;
    const out = tr(n.nodeValue); if(out != null && out !== n.nodeValue){ n._trOut = out; n.nodeValue = out; }
    return;
  }
  if(n.nodeType !== 1 || n.matches(SKIP)) return;
  for(const a of ['placeholder','data-tip','data-tipsub','title','aria-label']){
    const v = n.getAttribute(a); if(!v || v === (n._trA || {})[a]) continue;
    const out = tr(v); if(out != null && out !== v){ (n._trA ||= {})[a] = out; n.setAttribute(a, out); }
  }
  for(const c of n.childNodes) trNode(c);
}
let i18nObs = null;
function applyLang(){
  document.documentElement.lang = ({ pt:'pt-BR', en:'en', es:'es' })[P.lang] || 'pt-BR';
  if(P.lang === 'pt'){ if(i18nObs){ i18nObs.disconnect(); i18nObs = null; } return; }
  trNode(document.body);
  if(!i18nObs){
    i18nObs = new MutationObserver(muts => {
      for(const m of muts){
        if(m.type === 'characterData') trNode(m.target);
        else if(m.type === 'attributes') trNode(m.target);
        else m.addedNodes.forEach(trNode);
      }
    });
    i18nObs.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['placeholder','data-tip','title','aria-label'] });
  }
}
applyLang();
// toasts e confirmações também
const _toast = App.toast;
App.toast = (t, err, action) => _toast(tr(t) ?? t, err, action);

function secLang(box, back){
  box.innerHTML = `${back}<h2>Idioma</h2>
    <p class="mut">Muda os textos do Telão. As mensagens das pessoas continuam como foram escritas.</p>
    <div class="langs">${LANGS.map(([v, l, f]) => `<button data-lang="${v}" class="${P.lang === v ? 'on' : ''}"><span class="fl">${f}</span><b>${l}</b>${P.lang === v ? '<span class="ok">✔</span>' : ''}</button>`).join('')}</div>
    <p class="mut small" style="margin-top:14px">Algumas partes novas podem aparecer em português até a próxima atualização.</p>`;
  box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    const was = P.lang; P.lang = b.dataset.lang; savePrefs();
    if(was !== 'pt' && P.lang !== was){ location.reload(); return; }   // volta os textos originais
    applyLang(); renderAll(); renderSettings();
  });
}
