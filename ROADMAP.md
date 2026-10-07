# Roadmap — Conta Clara

Backlog inicial da primeira versão. Concluir dependências antes de iniciar uma história. Os checkboxes marcam histórias publicadas e concluídas.

## 1. Fundação e experiência

- [x] [Estruturar React/TypeScript e API Node](https://github.com/csescobar/conta-clara/issues/1) — dependências: nenhuma.
- [x] [Definir tokens e componentes do design system](https://github.com/csescobar/conta-clara/issues/2) — dependências: #1.
- [x] [Construir navegação responsiva e telas com dados fictícios](https://github.com/csescobar/conta-clara/issues/3) — dependências: #2.

## 2. Persistência e acesso

- [x] [Configurar Postgres e migrações](https://github.com/csescobar/conta-clara/issues/4) — dependências: #1.
- [x] [Implementar administrador inicial e login](https://github.com/csescobar/conta-clara/issues/5) — dependências: #4.
- [x] [Cadastrar membros por convite](https://github.com/csescobar/conta-clara/issues/6) — dependências: #5.
- [x] [Aplicar permissões do espaço financeiro compartilhado](https://github.com/csescobar/conta-clara/issues/7) — dependências: #6.

## 3. Controle financeiro

- [x] [Gerenciar categorias e formas de pagamento](https://github.com/csescobar/conta-clara/issues/8) — dependências: #7.
- [x] [Cadastrar receitas, despesas e aportes](https://github.com/csescobar/conta-clara/issues/9) — dependências: #8.
- [x] [Confirmar pagamentos e recebimentos](https://github.com/csescobar/conta-clara/issues/10) — dependências: #9.
- [x] [Registrar autoria das alterações](https://github.com/csescobar/conta-clara/issues/11) — dependências: #10.
- [x] [Gerar recorrências mensais](https://github.com/csescobar/conta-clara/issues/12) — dependências: #11.

## 4. Visão e migração

- [x] [Construir painel previsto versus realizado](https://github.com/csescobar/conta-clara/issues/13) — dependências: #12.
- [x] [Adicionar gráficos e filtros](https://github.com/csescobar/conta-clara/issues/14) — dependências: #13.
- [x] [Importar planilha com revisão](https://github.com/csescobar/conta-clara/issues/15) — dependências: #13.
- [x] [Exportar lançamentos em CSV](https://github.com/csescobar/conta-clara/issues/16) — dependências: #9.

## 5. PWA e sincronização

- [x] [Implementar instalação e cache da PWA](https://github.com/csescobar/conta-clara/issues/17) — dependências: #3, #5.
- [x] [Armazenar dados e alterações offline por usuário](https://github.com/csescobar/conta-clara/issues/18) — dependências: #17, #11; detalhes em [docs/offline-storage.md](docs/offline-storage.md).
- [x] [Sincronizar sem duplicações e tratar conflitos](https://github.com/csescobar/conta-clara/issues/19) — dependências: #18; detalhes em [docs/synchronization.md](docs/synchronization.md).

## 6. Operação e publicação

- [x] [Configurar Docker e HTTPS local](https://github.com/csescobar/conta-clara/issues/20) — dependências: #19; guia em [docs/docker-local-https.md](docs/docker-local-https.md).
- [x] [Automatizar backups criptografados no Google Drive](https://github.com/csescobar/conta-clara/issues/21) — dependências: #20.
- [x] [Validar restauração dos backups](https://github.com/csescobar/conta-clara/issues/22) — dependências: #21; guia e teste em [docs/backup-restore.md](docs/backup-restore.md).
- [x] [Concluir testes integrados e documentação de instalação](https://github.com/csescobar/conta-clara/issues/23) — dependências: #14, #15, #16, #22; guia em [docs/installation.md](docs/installation.md).

## Acompanhamento

[Issue central](https://github.com/csescobar/conta-clara/issues/24). Atualizar ambos os checklists após cada história concluída.

## Depois da primeira versão

Contas bancárias, faturas, parcelamento, integração bancária e acesso remoto serão planejados separadamente.
