# Conta Clara

Controle financeiro familiar local, com finanças compartilhadas e uso pelo computador e celular. A primeira versão reúne autenticação individual, espaço compartilhado, cadastro e confirmação de lançamentos, histórico, recorrências, painel previsto versus realizado, importação revisada, exportação CSV e PWA com armazenamento e sincronização offline.

A V2 permite cadastrar cartões compartilhados, registrar compras à vista ou parceladas, consultar faturas e registrar sua quitação integral, inclusive offline. As parcelas aparecem como despesas nas faturas previstas; o cadastro não guarda número, validade, CVV ou limite.

## Instalação

Para instalar em Docker com PostgreSQL e HTTPS local, siga o [guia de instalação](docs/installation.md). O primeiro acesso cria a conta administradora; convites são gerados como links locais e entregues manualmente.

## Proposta

Receitas, despesas fixas e variáveis, aportes separados do consumo, vencimentos, pagamentos e recorrências. Painel previsto versus realizado, gráficos, importação revisada de planilha e exportação CSV. PWA com consulta e lançamentos offline, sincronização e resolução de conflitos.

Cada pessoa terá seu login e acesso aos mesmos dados financeiros do seu espaço. Administrador e membro poderão alterar finanças; somente administrador gerenciará usuários e backups. O administrador gera e copia links locais de convite e redefinição de senha; não há envio por e-mail.

## Tecnologias

- React, TypeScript e Vite; shadcn/ui, Tailwind CSS e Recharts.
- Node.js 24 LTS, Express e Postgres; migrações SQL versionadas.
- Manifesto PWA, service worker e IndexedDB.
- Docker Compose e Caddy com HTTPS local por CA privada.
- pg_dump e rclone crypt para backups privados no Google Drive.

Interface em português, valores em reais, datas brasileiras e operação em America/Sao_Paulo. Postgres é a fonte de verdade após a importação inicial; não há sincronização contínua com Google Sheets.

## Desenvolvimento

Requisitos: Node.js 24 LTS, npm e PostgreSQL. Configure uma base local conforme [docs/database.md](docs/database.md). A API e a interface são servidas na mesma origem em produção; no desenvolvimento, Vite encaminha `/api` para o Express.

```sh
npm ci
cp .env.example .env
# Defina DATABASE_URL para a base Conta Clara e aplique as migrações:
npm run db:migrate
npm run dev
```

A interface abre em `http://localhost:5173`; o endpoint de saúde da API fica em `http://localhost:3001/api/health`. No primeiro acesso, crie o administrador inicial. O servidor de desenvolvimento escuta apenas em `127.0.0.1`; para usar outro dispositivo, configure o HTTPS local descrito em [docs/docker-local-https.md](docs/docker-local-https.md).

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

O build fica em `dist/client`; `npm start` serve o build e a API na porta `3001` por padrão. `PORT` altera a porta e `HOST` define a interface de rede. A autenticação usa hash scrypt, cookie de sessão HttpOnly e proteção CSRF; `COOKIE_SECURE=true` deve ser usado quando a aplicação estiver atrás de HTTPS.

## Testes

Vitest e React Testing Library verificam unidades e interface em jsdom; Supertest cobre rotas Express; Playwright executa o fluxo de navegador com duas contas fictícias. Instale o Chromium de teste uma vez com `npx playwright install chromium --only-shell`. `npm run test:db` usa `vitest.db.config.ts`: descobre sozinho todo `server/**/*.integration.test.js`, executa os arquivos em sequência (eles compartilham e limpam as mesmas tabelas) e falha logo no início se `TEST_DATABASE_URL` estiver ausente ou não terminar em `_test`. Testes de persistência e navegador usam exclusivamente `.env.test` apontado para uma base Postgres descartável terminada em `_test`; o inicializador de Playwright bloqueia qualquer outro nome e limpa as tabelas da aplicação antes do teste. O navegador exercita convite, importação, recorrência, confirmação, permissões do membro, painel e sincronização offline. `scripts/backup-restore-drill.sh` restaura um backup sintético em Postgres isolado e rejeita arquivo inválido e chave incorreta.

Para executar as verificações de desenvolvimento em sequência, depois de configurar `.env.test`, Chromium e Docker, use `npm run verify`. O comando inclui typecheck, testes de interface, build, testes Postgres, Playwright e simulação de restauração; também pode executar cada etapa separadamente com `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`, `npm run e2e` e `bash scripts/backup-restore-drill.sh`. As fixtures são fictícias; nunca aponte os testes para uma base de uso diário.

Para o formato de arquivo aceito, interpretação de datas, categorias e limites da importação, consulte [docs/spreadsheet-import.md](docs/spreadsheet-import.md).

Para os filtros, formato e segurança do arquivo CSV, consulte [docs/csv-export.md](docs/csv-export.md).

Para instalação e cache da interface, consulte [docs/pwa.md](docs/pwa.md); [docs/offline-storage.md](docs/offline-storage.md) e [docs/synchronization.md](docs/synchronization.md) explicam os dados locais, a fila e os limites de sincronização.

Para o horizonte de previsão das recorrências, vencimentos ajustados, atualização de regras e consulta offline, consulte [docs/recurring-forecasts.md](docs/recurring-forecasts.md).

Para cadastro de cartões, cálculo do ciclo, parcelas, quitação de faturas, exportação e uso offline, consulte [docs/cards-and-invoices.md](docs/cards-and-invoices.md).

Consulte [docs/design-system.md](docs/design-system.md) para tokens, acessibilidade e componentes visuais.

Para configurar o banco e executar migrações, consulte [docs/database.md](docs/database.md).

Para executar com Docker, integrar o Postgres existente e confiar o certificado HTTPS nos dispositivos da rede local, consulte [docs/docker-local-https.md](docs/docker-local-https.md).

Para configurar os backups criptografados no Google Drive, consulte [docs/google-drive-backups.md](docs/google-drive-backups.md).

Para testar a restauração em um Postgres descartável e recuperar uma cópia em outra máquina, consulte [docs/backup-restore.md](docs/backup-restore.md).

## Planejamento e contribuição

Veja [ROADMAP.md](ROADMAP.md), [issues](https://github.com/csescobar/conta-clara/issues), [CONTRIBUTING.md](CONTRIBUTING.md) e [AGENTS.md](AGENTS.md). Contas bancárias, integração bancária, pagamentos parciais e acesso remoto permanecem fora do escopo atual.

## Licença

[MIT](LICENSE).
