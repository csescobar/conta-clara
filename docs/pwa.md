# Instalação e cache da PWA

O manifesto e o service worker habilitam a instalação do Conta Clara como aplicativo. Depois do primeiro carregamento online, o cache versionado guarda o shell da interface, os arquivos estáticos gerados pelo build e os ícones. Navegações sem rede abrem esse shell para que a tela de conexão possa explicar o próximo passo.

## Instalação

- Em um computador, abra a aplicação em uma origem segura e use a opção de instalação oferecida pelo navegador (no Chrome/Edge, o ícone de instalação na barra de endereço ou o menu do navegador).
- Em Android, abra a mesma origem segura no Chrome e escolha **Instalar app** ou **Adicionar à tela inicial** no menu do navegador. A aparência e o texto da opção variam por navegador e sistema.
- `localhost` é tratado como contexto seguro para desenvolvimento no mesmo dispositivo. Acesso pelo celular a partir da rede local precisa de HTTPS; a configuração de HTTPS local faz parte da issue #20.

## Limites do modo offline

O primeiro acesso precisa estar online para instalar o service worker e baixar a interface. Nesta etapa, login, sessão, leituras e alterações financeiras ainda precisam da API e do Postgres disponíveis. Respostas de `/api` nunca entram no cache. Ao abrir a PWA offline, o shell é mostrado e o login comunica que o servidor local precisa estar acessível. Armazenamento de dados e fila de operações offline pertencem à issue #18.

## Atualização e limpeza

O build gera um identificador do cache a partir do conteúdo publicado e inclui os arquivos estáticos do próprio build no pré-cache. Assim, a nova versão prepara um cache separado enquanto janelas antigas continuam abertas. O service worker novo ativa quando as janelas controladas pela versão anterior forem fechadas; na ativação, apaga somente os caches com prefixo `conta-clara-shell-` de outras versões. Não chama `skipWaiting`, não apaga IndexedDB nem caches de outros recursos. A fila offline que será criada na issue #18 continuará fora do ciclo de vida dos caches da interface.

## Verificações

`npm test` verifica manifesto, dimensões e formato PNG dos ícones, pré-cache do shell, desvio de `/api`, fallback de navegação offline e limpeza restrita ao prefixo próprio. `npm run build` gera `dist/client/service-worker.js` com a lista de assets e versão do cache do build. Nesta história, Chromium em HTTPS local confirmou manifesto e instalação sem erros reportados pelo navegador, shell offline em desktop e viewport móvel, ausência de respostas da API no cache e atualização após fechar a janela antiga. A verificação móvel usou emulação; instalar e abrir num aparelho físico depende do endereço HTTPS da rede local da issue #20.
