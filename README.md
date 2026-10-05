# Conta Clara

Controle financeiro familiar local, com finanças compartilhadas e uso pelo computador e celular. Projeto open source em planejamento: este repositório contém documentação e backlog; ainda não existe aplicação executável.

## Proposta

Receitas, despesas fixas e variáveis, aportes separados do consumo, vencimentos, pagamentos e recorrências. Painel previsto versus realizado, gráficos, importação revisada de planilha e exportação CSV. PWA com consulta e lançamentos offline, sincronização e resolução de conflitos.

Cada pessoa terá seu login e acesso aos mesmos dados financeiros do seu espaço. Administrador e membro poderão alterar finanças; somente administrador gerenciará usuários e backups. Convites locais dispensarão envio de e-mail.

## Tecnologias planejadas

- React, TypeScript e Vite; shadcn/ui, Tailwind CSS e Recharts.
- Node.js 24 LTS, Express e Postgres; migrações SQL versionadas.
- Manifesto PWA, service worker e IndexedDB.
- Docker Compose e Caddy com HTTPS local.
- pg_dump e rclone crypt para backups privados no Google Drive.

Interface em português, valores em reais, datas brasileiras e operação em America/Sao_Paulo. Postgres será a fonte de verdade após importação inicial; não haverá sincronização contínua com Google Sheets.

## Desenvolvimento

Requisitos: Node.js 24 LTS e npm. A API e a interface são servidas na mesma origem em produção; no desenvolvimento, Vite encaminha `/api` para o Express.

```sh
npm ci
npm run dev
```

A interface de desenvolvimento abre em `http://localhost:5173`; o endpoint de saúde da API fica disponível em `http://localhost:3001/api/health`.

```sh
npm run typecheck
npm test
npm run build
npm start
```

O build fica em `dist/client`; `npm start` serve o build e a API na porta `3001` por padrão. `PORT` altera a porta do servidor. As rotas financeiras e a ligação do pool Postgres à API serão feitas nas histórias seguintes.

## Testes

Vitest executa testes de unidade e interface com React Testing Library em jsdom; Supertest verifica rotas HTTP do Express sem iniciar um servidor de rede. Playwright será usado nas histórias de fluxos completos do navegador, incluindo instalação/offline. Testes que dependem de persistência usarão um Postgres descartável no Docker. Cada história declara cenários específicos e executa os checks pertinentes antes de ser concluída.

Consulte [docs/design-system.md](docs/design-system.md) para tokens, acessibilidade e componentes visuais.

Para configurar o banco e executar migrações, consulte [docs/database.md](docs/database.md).

## Planejamento e contribuição

Veja [ROADMAP.md](ROADMAP.md), [issues](https://github.com/csescobar/conta-clara/issues), [CONTRIBUTING.md](CONTRIBUTING.md) e [AGENTS.md](AGENTS.md). Contas bancárias, faturas, parcelamentos e acesso remoto ficam fora da primeira versão.

## Licença

[MIT](LICENSE).
