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

## Estado e instalação

Não há comandos de instalação da aplicação nesta etapa. Eles serão adicionados nas histórias de fundação e operação. Não é necessário fornecer credenciais ou dados financeiros para contribuir agora.

## Planejamento e contribuição

Veja [ROADMAP.md](ROADMAP.md), [issues](https://github.com/csescobar/conta-clara/issues), [CONTRIBUTING.md](CONTRIBUTING.md) e [AGENTS.md](AGENTS.md). Contas bancárias, faturas, parcelamentos e acesso remoto ficam fora da primeira versão.

## Licença

[MIT](LICENSE).
