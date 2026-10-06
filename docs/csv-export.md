# Exportação CSV

Na lista de lançamentos, use **Exportar CSV** para baixar as linhas que correspondem aos filtros atuais de competência, categoria e situação. A exportação usa a mesma lista fornecida pela API autenticada, que limita as consultas ao espaço compartilhado do usuário. O botão fica desativado enquanto a lista carrega ou quando não há resultados.

O arquivo contém cabeçalhos em português, todas as células entre aspas, delimitador `;`, codificação UTF-8 com BOM e linhas CRLF. Valores em reais usam ponto decimal, duas casas, sem separador de milhar, e indicam BRL no cabeçalho; por exemplo, `1234.56`. Datas são datas ISO `AAAA-MM-DD`, sem fuso ou horário. Campos opcionais ficam vazios. A exportação inclui previsão e valor realizado quando existir.

Campos textuais cujo primeiro conteúdo não branco começa com `=`, `+`, `-` ou `@` recebem um apóstrofo inicial para impedir que planilhas executem a célula como fórmula. Aspas, delimitadores e quebras de linha dos campos são preservados conforme as regras do CSV. A sanitização protege a abertura em planilhas e altera apenas o texto exportado; os lançamentos armazenados não são modificados.

O nome do arquivo inclui o mês selecionado quando há um filtro de competência; a ausência desse filtro gera `conta-clara-lancamentos.csv`. A exportação é feita no navegador a partir dos dados já recebidos da API local; não envia dados a serviços externos.
