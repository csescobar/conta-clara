# Sistema visual

Conta Clara usa uma aparência clara, calma e acolhedora, com verde petróleo como cor de ação. A interface deve ajudar a comparar valores sem transformar cada indicador em um gráfico ou chamar atenção por excesso de cor.

## Tokens

| Função | Cor | Uso |
|---|---|---|
| Fundo | `#F5F8F7` | Fundo geral da aplicação |
| Texto principal | `#173C3A` | Títulos e conteúdo |
| Texto secundário | `#536A67` | Ajuda, metadados e descrições |
| Superfície | `#FFFFFF` | Cartões e campos |
| Ação primária | `#1D6A61` | Botão principal e foco |
| Seleção suave | `#D8EDE7` | Contexto ativo, com texto `#1A4E46` |
| Borda | `#DCE8E5` | Divisão de superfícies |
| Sucesso | `#1F6A46` | Situação paga, sempre com rótulo e ícone |
| Atenção | `#76530E` | Situação pendente, sempre com rótulo e ícone |
| Erro | `#9B2C2C` | Situação atrasada ou erro, sempre com rótulo e ícone |

Os pares de texto mais usados têm contraste superior a 4,5:1: texto principal sobre o fundo (11,27:1), ação primária sobre branco (6,39:1), texto secundário sobre branco (5,79:1), sucesso sobre fundo de sucesso (5,83:1), atenção sobre fundo de atenção (6,19:1) e erro sobre fundo de erro (6,59:1). Foco usa contorno visível de 2 px, com separação do componente.

## Tipografia, forma e espaçamento

- Usar fontes de sistema, corpo a partir de 14 px e altura de linha confortável; números financeiros usam algarismos tabulares.
- Usar escala de espaçamento baseada em 4 px. Agrupar primeiro pelo conteúdo e preservar respiro entre seções.
- Campos e botões têm altura mínima de 40 px; alvos de toque em ícones têm pelo menos 40 × 40 px.
- Usar cantos de 12 a 16 px para controles e cartões, bordas discretas e sombra leve.
- Adaptar colunas para tela estreita sem rolagem horizontal; o conteúdo pode crescer verticalmente.

## Componentes e estados

Os componentes reutilizáveis ficam em `src/components/ui`. Seguem a composição e customização local do shadcn/ui, Tailwind CSS e Radix para semântica de composição, com ícones Lucide.

- `Button`: ação principal, secundária, contorno, discreta e destrutiva; foco de teclado visível e estado desabilitado claro.
- `Card`: superfície para informação relacionada, com título e descrição semânticos.
- `FormField` e `Input`: rótulo visível ligado ao campo; ajuda e erro vinculados por `aria-describedby`.
- `MoneyValue`: entrada em centavos inteiros, saída em reais no locale `pt-BR`.
- `StatusBadge`: sempre exibe texto e ícone além da cor.
- `EmptyState`, `LoadingState` e `ErrorState`: mensagens explícitas; carregamento usa anúncio educado, erro usa alerta.

O estado vazio explica como começar quando existe uma ação disponível. Carregamento mantém o layout estável e respeita movimento reduzido. Erro descreve a situação em texto e, quando a tela oferecer recuperação, orienta uma ação. Valores, legenda ou resumo acompanham os gráficos; não comunicar resultado somente pela cor.

## Prévia e verificação

A tela inicial e o teste de `src/App.test.tsx` demonstram componentes com valores fictícios. Testar nomes acessíveis, descrição de campos, rótulos de estados, formatação de centavos e foco visível. Revisar a prévia em largura móvel e desktop ao alterar os tokens.
