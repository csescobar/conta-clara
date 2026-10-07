# Previsão de recorrências

As regras de recorrência são compartilhadas pelo espaço financeiro. Cada regra pode gerar até 13 competências: o mês atual e os 12 meses seguintes, calculados pelo calendário de `America/Sao_Paulo`. A janela é móvel: quando o mês muda, o sistema passa a projetar a nova janela ao consultar recorrências, painel ou lançamentos. Não é preciso recriar as regras já cadastradas.

## Geração das ocorrências

Ao abrir a lista de recorrências, o painel ou os lançamentos de uma competência, o servidor gera as ocorrências que ainda faltam para as regras ativas dentro do horizonte e do período definido na própria regra. Consultar a mesma competência novamente não cria duplicatas. Uma regra iniciada antes do mês atual gera somente as ocorrências ainda não existentes; uma regra que começa depois do horizonte aguarda até a janela alcançá-la. Lançamentos manuais continuam consultáveis fora do horizonte.

O dia de vencimento é ajustado ao último dia do mês quando necessário. Por exemplo, um vencimento configurado para dia 31 cai em 30 de novembro e em 28 ou 29 de fevereiro. A competência continua sendo o mês da ocorrência.

## Alterações, pagamentos e encerramento

Ao editar uma regra, o sistema atualiza as ocorrências futuras automáticas que continuam em aberto e não foram alteradas individualmente. Isso inclui descrição, valor, categoria, forma de pagamento, vencimento e período. Ocorrências da competência atual ou de meses passados, pagamentos confirmados e lançamentos editados manualmente são preservados.

Reduzir o período retira das consultas as projeções automáticas futuras que ficam depois do novo término. Elas são identificadas como retiradas pela regra; se o período for ampliado novamente, o sistema pode restaurá-las com os dados atuais da regra. Uma ocorrência excluída manualmente é marcada separadamente e permanece pulada mesmo que o período seja ampliado. O arquivamento também retira da previsão as ocorrências automáticas futuras em aberto, sem apagar o histórico ou alterar pagamentos.

As alterações geradas pelo servidor registram a pessoa responsável no histórico. O comportamento usa somente as regras e os lançamentos do espaço compartilhado atual.

## Uso offline

O painel salva no aparelho o resumo do mês que foi aberto online. Depois, aquele mês pode ser consultado offline; um mês de painel que nunca foi carregado no aparelho pede conexão. Não há pré-carregamento dos 12 meses. A lista de lançamentos também só fica disponível offline depois de carregada. Esses dados locais são cópias de consulta, separadas por usuário e espaço, e não substituem o Postgres nem o backup. A edição das regras requer conexão.

Consulte [armazenamento offline](offline-storage.md) e [sincronização](synchronization.md) para os limites do cache e da fila de alterações.

## Verificações

`server/routes/recurrences.integration.test.js` usa PostgreSQL descartável para conferir a janela de 13 competências, idempotência, ajuste de datas, alterações, redução/ampliação do período e preservação de pagamentos, edições e exclusões manuais. `server/routes/dashboard.integration.test.js` verifica totais, gráficos e lançamentos de meses futuros. `e2e/first-release.spec.js` percorre a interface com valores fictícios e verifica edição individual, pagamento, retirada e restauração de projeções e leitura de um painel previamente carregado offline.
