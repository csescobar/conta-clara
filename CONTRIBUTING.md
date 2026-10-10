# Como contribuir

Leia o README e o roadmap. Escolha uma issue aberta cujas dependências estejam concluídas e registre nela a intenção de trabalhar e eventuais dúvidas. Faça uma história por vez.

Contribuições externas devem usar fork e pull request referenciando a issue. O fluxo do mantenedor e dos agentes autorizados é por commits diretamente na main.

Use dados fictícios. Nunca publique planilhas pessoais, credenciais, cookies, tokens, dumps ou chaves de recuperação. Configurações de exemplo devem conter apenas placeholders. Armazene as credenciais necessárias para recuperar backups criptografados num gerenciador de senhas; nunca inclua valores ou nomes de itens desse gerenciador no repositório.

Mantenha documentação em português. Escreva testes de comportamento com Vitest e React Testing Library para a interface; use Supertest para rotas Express, Playwright para fluxos importantes do navegador e Postgres descartável para persistência e migrações. Evite snapshots extensos: prefira testar o que a pessoa vê e faz. Para gráficos, confira resumo textual e valores; para datas e dinheiro, cubra bordas relevantes. Execute `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db` e `npm run e2e` contra uma base vazia descartável cujo nome termine em `_test`. Para a simulação de restauração, use `bash scripts/backup-restore-drill.sh`, que cria recursos Docker temporários e isolados. `npm run verify` executa essas verificações em sequência. Para interface, confira celular, desktop e teclado. Informe comandos, resultados e limitações na issue ou PR.

Commits devem explicar a mudança e referenciar a issue, por exemplo: `feat: cadastrar receitas (#9)`. Não encerre issues por trabalho parcial: primeiro valide os critérios e publique a mudança. Atualize ROADMAP.md e o checklist central ao concluir.

## Estilo e lint

`npm run lint` executa ESLint (TypeScript, hooks do React, `jsx-a11y` e uma regra que rejeita cores da paleta padrão do Tailwind e hexadecimais fora dos tokens do design system). `npm run format` aplica o Prettier e `npm run format:check` apenas verifica. A formatação em massa ficou em commit próprio, listado em `.git-blame-ignore-revs`; para o `git blame` ignorá-lo, execute uma vez `git config blame.ignoreRevsFile .git-blame-ignore-revs`. Os avisos de `react-hooks/exhaustive-deps` que restam omitem `offline` de propósito, para não repetir carregamentos a cada mudança do estado offline.

## Verificação local antes de publicar

Não há CI remoto: a verificação acontece na sua máquina, sem consumir minutos de serviços externos. `npm run hooks:install` (uma vez por clone) ativa `.githooks/pre-push`, que executa `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` antes de cada `git push`, informa a etapa que falhou e bloqueia o envio. Leva cerca de 40 s; pushes que alteram apenas arquivos `.md` ou `docs/` pulam a verificação. O hook não roda Postgres, Playwright nem Docker: use `npm run verify` antes de concluir uma issue. Em emergência, `git push --no-verify` ignora o hook. Nada o instala automaticamente (não há `postinstall`); para desativar, `git config --unset core.hooksPath`.

## Tipos no servidor

O servidor é JavaScript com verificação gradual de tipos: `npm run typecheck` também executa `tsc -p tsconfig.server.json` (`allowJs`, `strict`), que só examina os arquivos que começam com `// @ts-check`. Hoje cobrem os serviços de cartões, faturas e recorrências, o histórico de alterações, a rota de sincronização e os roteadores de compras e faturas. Ao tocar em um arquivo novo, adicione `// @ts-check`, anote as funções com JSDoc e reutilize os tipos de `server/types.js` (`Queryable`, `Pool`, `OperationResult`, `EntryRow`); `request.auth` já é tipado por `server/express.d.ts`. Entrada não confiável (corpo de requisição) usa `any` apenas na função que a valida e devolve um tipo preciso.

## Mudanças visuais

Telas e componentes têm referências visuais em `e2e/visual/references`. Ao mudar a aparência de propósito, rode `npm run e2e:visual`, confira as imagens de diferença, regrave com `npm run e2e:visual:update` e inclua as imagens alteradas no commit; os detalhes estão em [docs/design-system.md](docs/design-system.md). Mudança visual não intencional faz `npm run e2e` falhar.

