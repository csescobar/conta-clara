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

## Acompanhamento da V1

[Issue central da V1](https://github.com/csescobar/conta-clara/issues/24). Atualizar ambos os checklists após cada história concluída.

## 7. Cartões e faturas (V2)

- [x] [Cadastrar cartões no espaço compartilhado](https://github.com/csescobar/conta-clara/issues/25) — dependências: V1 concluída; cadastro compartilhado, regras de ciclo e sincronização offline publicados em `d632e03`.
- [x] [Registrar compras parceladas e gerar parcelas offline](https://github.com/csescobar/conta-clara/issues/26) — dependências: #25; parcelas, edição, cancelamento e sincronização offline publicados em `5f6c734`.
- [x] [Consultar e quitar faturas, integrar painel e exportação CSV](https://github.com/csescobar/conta-clara/issues/27) — dependências: #26; consulta, quitação integral, painel, CSV e sincronização offline publicados em `ec5b7ac`.
- [x] [Validar integração e documentar cartões e faturas](https://github.com/csescobar/conta-clara/issues/28) — dependências: #25, #26, #27; testes integrados e documentação atualizados em `9022ae5`.

### Acompanhamento da V2

[Issue central da V2](https://github.com/csescobar/conta-clara/issues/29). Atualizar ambos os checklists após cada história concluída.

## Evoluções fora da V2

- [x] [Corrigir sobreposição da navegação no celular](https://github.com/csescobar/conta-clara/issues/30) — menu compacto com os outros destinos em “Mais”; validado em 320–430 px, desktop e teclado (`c0e73d0`).

## 8. Previsão e recorrências (V3)

- [x] [Projetar recorrências até 12 meses](https://github.com/csescobar/conta-clara/issues/32) — dependências: geração mensal da V1 (#12); gera mês atual + próximos 12, com ajuste de vencimento e idempotência.
- [x] [Sincronizar alterações nas regras com as projeções futuras](https://github.com/csescobar/conta-clara/issues/33) — dependências: #32; reconcilia projeções futuras automáticas, preserva pagos, editados e pulados manualmente, restaura somente retiradas pela regra e registra autoria (`79bddd7`).
- [x] [Integrar previsões mensais às telas e ao uso offline](https://github.com/csescobar/conta-clara/issues/34) — dependências: #32, #33; painel, gráficos e lançamentos exibem projeções do mês; snapshots continuam sob demanda e a interface explica o horizonte e o comportamento offline (`e3ee625`).
- [x] [Validar integração e documentar previsão de recorrências](https://github.com/csescobar/conta-clara/issues/35) — dependências: #32–#34; guia publicado e E2E confirma visualização futura, ajustes individuais, pagamento, retirada/restauração, preservação de pulos e cache offline (`807f352`).

### Acompanhamento da V3

[Issue central da V3](https://github.com/csescobar/conta-clara/issues/36). Atualizar ambos os checklists após cada história concluída.

Contas bancárias e saldos, integração bancária, importação de extratos, pagamento parcial/rotativo e acesso remoto permanecem fora desta etapa.

## Melhorias após a V3

- [x] [Ajustar tabelas dos gráficos para caber em telas mobile](https://github.com/csescobar/conta-clara/issues/37) — cabeçalhos e valores cabem em 320–430 px sem overflow horizontal; navegação por teclado e layouts desktop validados (`deeabba`).

## 9. Fundação do design system (V4)

Fases definidas a partir da auditoria de design system e engenharia de 2026-10-08. As fases 9 e 11 podem avançar em paralelo; a fase 10 depende do catálogo vivo (#43).

- [x] [Consolidar tokens semânticos de estado e superfície](https://github.com/csescobar/conta-clara/issues/38) — dependências: nenhuma; tokens `-soft`, `-surface` e `-border` por estado, sem hexadecimais avulsos, menu móvel a 12 px e escala tipográfica documentada (`f03d95f`).
- [x] [Unificar formatação de dinheiro e datas](https://github.com/csescobar/conta-clara/issues/39) — dependências: nenhuma; formatação única e segura para BigInt em `finance.ts`, `MoneyValue` com tom, sinal e variante compacta em todas as telas (`7293ff9`).
- [x] [Criar primitivos de formulário](https://github.com/csescobar/conta-clara/issues/40) — dependências: #38; seletor, texto longo, opções, data, competência e valor em reais compartilhados; datas e competências no formato brasileiro em qualquer navegador (`de4356b`).
- [ ] [Criar primitivos de sobreposição e mensagem](https://github.com/csescobar/conta-clara/issues/41) — dependências: #38.
- [ ] [Extrair componentes de composição financeira](https://github.com/csescobar/conta-clara/issues/42) — dependências: #39, #40, #41.
- [ ] [Publicar catálogo vivo e validar acessibilidade automaticamente](https://github.com/csescobar/conta-clara/issues/43) — dependências: #38, #39, #40, #41, #42.

## 10. Experiência e acessibilidade (V4)

- [ ] [Adicionar tema escuro](https://github.com/csescobar/conta-clara/issues/44) — dependências: #43.
- [ ] [Padronizar carregamento, vazio e retorno de ações](https://github.com/csescobar/conta-clara/issues/45) — dependências: #41, #43.
- [ ] [Revisar hierarquia das telas principais](https://github.com/csescobar/conta-clara/issues/46) — dependências: #42.
- [ ] [Cobrir regressão visual e teclado em todas as rotas](https://github.com/csescobar/conta-clara/issues/47) — dependências: #44, #45, #46.

## 11. Qualidade de engenharia (V4)

- [ ] [Adotar lint e formatação](https://github.com/csescobar/conta-clara/issues/48) — dependências: nenhuma.
- [ ] [Simplificar a execução dos testes Postgres](https://github.com/csescobar/conta-clara/issues/49) — dependências: nenhuma.
- [ ] [Verificar mudanças localmente antes de publicar](https://github.com/csescobar/conta-clara/issues/50) — dependências: #48, #49.
- [ ] [Reduzir o bundle inicial](https://github.com/csescobar/conta-clara/issues/51) — dependências: nenhuma.
- [ ] [Tipar o servidor gradualmente](https://github.com/csescobar/conta-clara/issues/52) — dependências: #48.
- [x] [Corrigir condições de corrida em listas filtradas e formulários](https://github.com/csescobar/conta-clara/issues/54) — dependências: nenhuma; respostas de filtros antigos descartadas, campos editados preservados ao reconectar e E2E estável em 5 execuções seguidas (`f5c02a2`).

Integração contínua remota fica fora desta etapa: a verificação acontece localmente antes do push (#50), sem consumo de serviços pagos.

### Acompanhamento da V4

[Issue central da V4](https://github.com/csescobar/conta-clara/issues/53). Atualizar ambos os checklists após cada história concluída.

## 12. Evoluções de produto (candidatas)

Candidatas a planejar após a V4; refinar escopo e critérios antes de abrir as issues.

- [ ] Orçamentos mensais por categoria com acompanhamento e alerta visual de limite.
- [ ] Busca textual e filtros salvos em lançamentos.
- [ ] Relatório anual com comparação mês a mês e evolução dos aportes.
- [ ] Lembretes locais de vencimento pela PWA, sem serviço externo.
