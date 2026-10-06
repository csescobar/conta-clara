# Conta Clara

Controle financeiro familiar local, com finanças compartilhadas e uso pelo computador e celular. A aplicação web está em desenvolvimento: a fundação React/API, autenticação, convites, gestão de membros, cadastros compartilhados, registro e confirmação de lançamentos, histórico de alterações, recorrências mensais, painel com gráficos previsto versus realizado, importação revisada de planilha, exportação CSV e PWA com armazenamento e sincronização offline já funcionam.

## Proposta

Receitas, despesas fixas e variáveis, aportes separados do consumo, vencimentos, pagamentos e recorrências. Painel previsto versus realizado, gráficos, importação revisada de planilha e exportação CSV. PWA com consulta e lançamentos offline, sincronização e resolução de conflitos.

Cada pessoa terá seu login e acesso aos mesmos dados financeiros do seu espaço. Administrador e membro poderão alterar finanças; somente administrador gerenciará usuários e backups. O administrador gera e copia links locais de convite e redefinição de senha; não há envio por e-mail.

## Tecnologias planejadas

- React, TypeScript e Vite; shadcn/ui, Tailwind CSS e Recharts.
- Node.js 24 LTS, Express e Postgres; migrações SQL versionadas.
- Manifesto PWA, service worker e IndexedDB.
- Docker Compose e Caddy com HTTPS local por CA privada.
- pg_dump e rclone crypt para backups privados no Google Drive.

Interface em português, valores em reais, datas brasileiras e operação em America/Sao_Paulo. Postgres será a fonte de verdade após importação inicial; não haverá sincronização contínua com Google Sheets.

## Desenvolvimento

Requisitos: Node.js 24 LTS, npm e PostgreSQL. Configure uma base local conforme [docs/database.md](docs/database.md). A API e a interface são servidas na mesma origem em produção; no desenvolvimento, Vite encaminha `/api` para o Express.

```sh
npm ci
cp .env.example .env
# Defina DATABASE_URL para a base Conta Clara e aplique as migrações:
npm run db:migrate
npm run dev
```

A interface abre em `http://localhost:5173`; o endpoint de saúde da API fica em `http://localhost:3001/api/health`. No primeiro acesso, crie o administrador inicial. O servidor de desenvolvimento escuta apenas em `127.0.0.1`; para acesso por outro dispositivo, aguarde a configuração de HTTPS local da issue #20.

```sh
npm run typecheck
npm test
npm run build
npm start
```

O build fica em `dist/client`; `npm start` serve o build e a API na porta `3001` por padrão. `PORT` altera a porta e `HOST` define a interface de rede. A autenticação usa hash scrypt, cookie de sessão HttpOnly e proteção CSRF; `COOKIE_SECURE=true` deve ser usado quando a aplicação estiver atrás de HTTPS.

## Testes

Vitest executa testes de unidade e interface com React Testing Library e `user-event` em jsdom; Supertest verifica rotas HTTP do Express sem iniciar um servidor de rede. Playwright será usado nas histórias de fluxos completos do navegador, incluindo instalação/offline. Testes que dependem de persistência usam uma base Postgres descartável configurada em `.env.test`; `npm run test:db` aplica migrações e limpa as tabelas de aplicação antes dos cenários de autenticação, convites, permissões, cadastros, lançamentos, importação, histórico, recorrências e painel. As fixtures do painel conferem competências, aportes, mês vazio, virada de ano, filtros, navegação por teclado e isolamento entre espaços. Os testes do importador usam arquivos sintéticos e conferem separadores `en_US`, datas ambíguas, fórmulas ignoradas, mapeamento, confirmação explícita, autoria, transação, rollback e bloqueio de lotes repetidos. Os testes do CSV verificam caracteres acentuados, delimitadores, aspas, datas ISO, centavos exatos e proteção contra fórmulas em células textuais. Use apenas uma base vazia com sufixo `_test`. Cada história declara cenários específicos e executa os checks pertinentes antes de ser concluída.

Para o formato de arquivo aceito, interpretação de datas, categorias e limites da importação, consulte [docs/spreadsheet-import.md](docs/spreadsheet-import.md).

Para os filtros, formato e segurança do arquivo CSV, consulte [docs/csv-export.md](docs/csv-export.md).

Para instalação e cache da interface, consulte [docs/pwa.md](docs/pwa.md); [docs/offline-storage.md](docs/offline-storage.md) e [docs/synchronization.md](docs/synchronization.md) explicam os dados locais, a fila e os limites de sincronização.

Consulte [docs/design-system.md](docs/design-system.md) para tokens, acessibilidade e componentes visuais.

Para configurar o banco e executar migrações, consulte [docs/database.md](docs/database.md).

Para executar com Docker, integrar o Postgres existente e confiar o certificado HTTPS nos dispositivos da rede local, consulte [docs/docker-local-https.md](docs/docker-local-https.md).

Para configurar os backups criptografados no Google Drive, consulte [docs/google-drive-backups.md](docs/google-drive-backups.md).

Para testar a restauração em um Postgres descartável e recuperar uma cópia em outra máquina, consulte [docs/backup-restore.md](docs/backup-restore.md).

## Planejamento e contribuição

Veja [ROADMAP.md](ROADMAP.md), [issues](https://github.com/csescobar/conta-clara/issues), [CONTRIBUTING.md](CONTRIBUTING.md) e [AGENTS.md](AGENTS.md). Contas bancárias, faturas, parcelamentos e acesso remoto ficam fora da primeira versão.

## Licença

[MIT](LICENSE).
