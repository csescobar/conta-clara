# Cartões, compras e faturas

Cartões e faturas pertencem ao espaço financeiro compartilhado: pessoas ativas do espaço consultam e alteram os mesmos dados com suas próprias contas. A aplicação guarda apenas apelido, titular e dias de fechamento e vencimento. Não cadastre número do cartão, validade, código de segurança ou limite.

## Cadastro do cartão e ciclo

Em **Configurações**, informe um apelido, o titular, o dia de fechamento e o dia de vencimento. Os dois dias aceitam valores de 1 a 31; em meses curtos, a data calculada é ajustada para o último dia disponível. Cartões podem ser editados, arquivados e restaurados. Um cartão arquivado deixa de aparecer nas novas compras, mas seu histórico permanece.

Ao registrar uma compra, o Conta Clara sugere a primeira fatura usando a data da compra e o fechamento do cartão. Uma compra feita até o fechamento (inclusive) entra no ciclo que fecha naquele mês; depois do fechamento, entra no próximo ciclo. A fatura é identificada pelo mês do vencimento: se a data de vencimento calculada no mês de fechamento for posterior à data de fechamento, vence nesse mesmo mês; caso contrário, vence no mês seguinte. Por exemplo, com fechamento no dia 25 e vencimento no dia 5, uma compra feita em 24 de outubro sugere novembro, enquanto uma compra feita em 26 de outubro sugere dezembro. A data sugerida pode ser corrigida no cadastro da compra.

## Compras e parcelas

As compras são registradas manualmente. O valor é tratado em centavos e pode ser dividido em até 120 parcelas, com pelo menos um centavo em cada uma. Os centavos restantes são distribuídos entre as primeiras parcelas; R$ 10,01 em três parcelas resulta em R$ 3,34, R$ 3,34 e R$ 3,33. Todas as parcelas futuras são geradas no cadastro, cada uma como uma despesa prevista na fatura do seu mês de vencimento.

É possível editar a série ou ajustar uma parcela futura, incluindo o valor e o mês de vencimento. Parcelas já pagas ficam preservadas ao alterar ou cancelar a série. Se a mudança atingir uma fatura já quitada, aplica-se a regra de revisão: a fatura passa para **Revisar quitação**, os valores efetivos anteriores são desfeitos e uma pessoa do espaço precisa confirmar novamente a quitação integral.

## Consulta e quitação

Em **Faturas**, selecione o mês de vencimento. Cada cartão mostra o fechamento, o vencimento, as compras e parcelas, o total previsto e a situação. Uma fatura pode ser quitada integralmente com o valor efetivamente pago, a data do pagamento e uma forma de pagamento opcional já cadastrada no espaço. Pagamento parcial, mínimo, juros e saldo rotativo não são controlados.

O valor efetivo pode diferir do previsto. O Conta Clara o distribui proporcionalmente entre as parcelas em centavos, preservando exatamente o total informado. A quitação confirma as despesas existentes; não cria uma nova despesa. O painel mostra a previsão no mês de vencimento da fatura e o realizado no mês da data efetiva do pagamento. A quitação pode ser revertida com confirmação explícita; a reversão reabre a fatura e remove a confirmação efetiva dos itens que a compõem.

## Exportação CSV

Na lista de lançamentos, a exportação mantém uma linha por parcela e acrescenta as colunas **Cartão**, **Fatura (MM/AAAA)**, **Parcela** e **Situação da fatura**. A situação pode ser aberta, quitada ou exigir revisão. Os campos textuais continuam protegidos contra fórmulas. Veja [exportação CSV](csv-export.md) para codificação, filtros, formato e escaping.

## Uso offline e privacidade

Depois de abrir **Faturas** conectado, os dados consultados ficam disponíveis offline naquele navegador. Meses ainda não carregados exigem uma consulta online. Uma quitação ou reversão offline entra na fila local, permanece separada por usuário e espaço e é enviada quando a aplicação reconectar. Se a versão no servidor mudou, a interface pede que a pessoa revise o conflito; operações repetidas usam a mesma chave e não duplicam a alteração.

O Postgres é a fonte de verdade. A cópia offline fica no IndexedDB, que não é criptografado pela aplicação; use somente aparelhos e perfis de navegador confiáveis. A fila não substitui o backup do banco e não sincroniza em segundo plano enquanto a PWA está fechada. Consulte [dados locais e uso offline](offline-storage.md) e [sincronização](synchronization.md).

## Limites

As compras são manuais. Não há importação de extratos, integração bancária, contas ou saldos, pagamento parcial, rotativo, juros ou conversão automática dos lançamentos antigos. Consulte [instalação](installation.md) para atualizar uma instalação Docker e aplicar migrações.
