# Importação de planilha

A importação inicial aceita uma cópia XLSX exportada do modelo de controle financeiro. Ela exige as abas `Contas e Vencimentos` e `Fluxo de Caixa Mensal` e os cabeçalhos originais dessas abas. As colunas podem estar em outra ordem; os nomes dos cabeçalhos precisam continuar iguais.

Selecione o ano usado por datas sem ano, o mês de competência para as contas e o formato de data e moeda. A planilha foi identificada com locale `en_US`, que é o padrão: valores de texto como `1,234.56` são lidos como 1.234 reais e 56 centavos; datas como `2/3/2026` são lidas como 3 de fevereiro de 2026. Datas de texto sem ano usam o ano escolhido. Quando dia e mês puderem ser invertidos, a prévia mostra o aviso e exige confirmação explícita.

Cada linha válida de `Contas e Vencimentos` vira despesa, exceto quando a categoria é mapeada a um cadastro de aporte. O dia de vencimento é combinado com a competência escolhida; dias 29–31 que não existirem no mês ajustam para o último dia. Linhas marcadas como pagas precisam de uma data de pagamento válida e são importadas como realizadas pelo valor previsto. Categorias e formas de pagamento podem ser associadas a cadastros ativos do espaço ou ficar sem associação.

Na aba `Fluxo de Caixa Mensal`, somente um valor literal e positivo da coluna `Receitas Previstas` cria uma receita. O mês vem da coluna `Mês`, combinado ao ano escolhido. Valores de despesas, saídas e saldo do resumo não viram lançamentos. Células com fórmulas também são ignoradas. Linhas incompletas ou inválidas aparecem na lista de linhas ignoradas, com o motivo.

O XLSX é lido no navegador e nunca é enviado nem modificado. Depois da revisão, somente os lançamentos confirmados são enviados à API local. O servidor valida novamente as datas, os valores, categorias e formas de pagamento, e grava todo o lote junto com o histórico de autoria em uma transação. O conteúdo normalizado recebe uma impressão digital SHA-256 por espaço; a repetição do mesmo lote é recusada. Um lote corrigido ou mapeado de outra forma tem uma impressão digital diferente e pode ser importado após revisão.

O limite do arquivo é 10 MB; cada aba pode ter até 10.000 linhas e 50 colunas. Uma prévia aceita até 500 lançamentos. Valores devem ser positivos, ter no máximo duas casas decimais e caber em centavos inteiros seguros no JavaScript; descrições aceitam até 200 caracteres e observações até 2.000. Use o arquivo original exportado como fonte e faça uma cópia antes de editar seus dados por outros meios.

O leitor XLSX usa a distribuição oficial SheetJS CE 0.20.3 fixada no `package-lock.json`. Consulte a [documentação de instalação para bundlers](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) e os [avisos de segurança do projeto](https://cdn.sheetjs.com/advisories/).
