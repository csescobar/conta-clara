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
| Borda de campo | `#72918A` | Contorno de campos, seletores e caixas de seleção (3,42:1 sobre o cartão e 3,20:1 sobre o fundo, como pede a WCAG 1.4.11) |
| Sucesso | `#1F6A46` | Situação paga, sempre com rótulo e ícone |
| Atenção | `#76530E` | Situação pendente, sempre com rótulo e ícone |
| Erro | `#9B2C2C` | Situação atrasada ou erro, sempre com rótulo e ícone |
| Informação | `#1F5A80` | Orientação neutra que não indica problema |
| Realizado em gráficos | `#A85635` | Série realizada, distinta do verde de ação da série prevista |

### Estados

Cada estado tem texto, fundo suave, superfície e borda. Use as classes Tailwind geradas pelos tokens, nunca hexadecimais arbitrários nem a paleta padrão (`amber`, `emerald`, `red`…).

| Estado | Texto | Fundo suave (`-soft`) | Superfície (`-surface`) | Borda (`-border`) |
|---|---|---|---|---|
| `success` | `#1F6A46` | `#E8F5ED` | `#F3FAF6` | `#B7DCC5` |
| `warning` | `#76530E` | `#FBF1D6` | `#FDF8EC` | `#E8D29B` |
| `destructive` | `#9B2C2C` | `#FDECEC` | `#FFF8F8` | `#EFC4C4` |
| `info` | `#1F5A80` | `#E3EEF6` | `#F4F8FB` | `#BCD4E5` |

- Fundo suave: selos e ícones de situação (`bg-warning-soft text-warning`) e mensagens curtas de erro (`bg-destructive-soft text-destructive`).
- Superfície com borda: avisos e painéis maiores, como conflitos de sincronização (`border-warning-border bg-warning-surface text-warning`).
- `destructive-foreground` (`#FFFFFF`) é o texto sobre o botão destrutivo (7,53:1).

Contraste do texto de cada estado: sucesso 5,83:1 no fundo suave e 6,18:1 na superfície; atenção 6,19:1 e 6,57:1; erro 6,59:1 e 7,18:1; informação 6,29:1 e 6,94:1. Texto secundário mantém pelo menos 5,47:1 sobre as superfícies.

Os pares de texto mais usados têm contraste superior a 4,5:1: texto principal sobre o fundo (11,27:1), ação primária sobre branco (6,39:1), texto secundário sobre branco (5,79:1), sucesso sobre fundo de sucesso (5,83:1), atenção sobre fundo de atenção (6,19:1) e erro sobre fundo de erro (6,59:1). Foco usa contorno visível de 2 px, com separação do componente.

## Tema escuro

O tema segue a preferência do sistema (`prefers-color-scheme`) e pode ser escolhido em Configurações → Aparência (Seguir o sistema, Claro ou Escuro). A escolha fica no `localStorage` deste aparelho (`conta-clara-theme`) e nunca é enviada ao servidor. `index.html` aplica a escolha antes da primeira renderização, para a tela não piscar, e `src/lib/theme.ts` mantém `data-theme` e as cores de `<meta name="theme-color">` (claro `#1D6A61`, escuro `#0E1918`). O manifesto da PWA mantém a cor clara, porque o manifesto não muda com o tema.

Os tokens escuros ficam em dois blocos idênticos de `src/styles.css`: dentro de `@media (prefers-color-scheme: dark)` para `:root:not([data-theme='light'])` e em `:root[data-theme='dark']`. Os dois valem para os mesmos pares de contraste da tabela de tokens; `src/lib/design-tokens.test.ts` calcula todos nos três conjuntos de valores e confere esta tabela com o CSS.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--background` | `#F5F8F7` | `#0E1918` | Fundo geral |
| `--foreground` | `#173C3A` | `#E4EFED` | Texto principal |
| `--card` | `#FFFFFF` | `#152322` | Superfície de cartões e campos |
| `--card-foreground` | `#173C3A` | `#E4EFED` | Texto sobre cartões |
| `--primary` | `#1D6A61` | `#4FB3A3` | Ação primária, foco e links |
| `--primary-foreground` | `#FFFFFF` | `#04201C` | Texto sobre a ação primária |
| `--secondary` | `#EAF3F1` | `#1C3230` | Superfície secundária |
| `--secondary-foreground` | `#214E49` | `#D3E8E4` | Texto sobre a superfície secundária |
| `--muted` | `#EDF2F1` | `#1B2D2B` | Superfície discreta |
| `--muted-foreground` | `#536A67` | `#9DB6B2` | Texto secundário |
| `--accent` | `#D8EDE7` | `#1F4741` | Seleção suave |
| `--accent-foreground` | `#1A4E46` | `#D6F0EA` | Texto sobre a seleção |
| `--border` | `#DCE8E5` | `#2B403D` | Divisão de superfícies |
| `--input` | `#72918A` | `#6F8F89` | Contorno de campos (3:1) |
| `--ring` | `#24776C` | `#5FC4B3` | Anel de foco |
| `--chart-realized` | `#A85635` | `#E5915F` | Série realizada nos gráficos |
| `--destructive-foreground` | `#FFFFFF` | `#2A0A0A` | Texto sobre o botão destrutivo |
| `--scrim` | `#173C3A` | `#000000` | Fundo escurecido atrás de diálogos (a 40%) |
| `--success` | `#1F6A46` | `#72D39C` | Estado success: texto e ícone |
| `--success-soft` | `#E8F5ED` | `#153A27` | Estado success: fundo suave |
| `--success-surface` | `#F3FAF6` | `#102B1E` | Estado success: superfície |
| `--success-border` | `#B7DCC5` | `#2B6A47` | Estado success: borda |
| `--warning` | `#76530E` | `#EBBD62` | Estado warning: texto e ícone |
| `--warning-soft` | `#FBF1D6` | `#3C2E0D` | Estado warning: fundo suave |
| `--warning-surface` | `#FDF8EC` | `#2B2209` | Estado warning: superfície |
| `--warning-border` | `#E8D29B` | `#755A1B` | Estado warning: borda |
| `--destructive` | `#9B2C2C` | `#F29A9A` | Estado destructive: texto e ícone |
| `--destructive-soft` | `#FDECEC` | `#431818` | Estado destructive: fundo suave |
| `--destructive-surface` | `#FFF8F8` | `#2E1313` | Estado destructive: superfície |
| `--destructive-border` | `#EFC4C4` | `#85353A` | Estado destructive: borda |
| `--info` | `#1F5A80` | `#82BDE8` | Estado info: texto e ícone |
| `--info-soft` | `#E3EEF6` | `#133345` | Estado info: fundo suave |
| `--info-surface` | `#F4F8FB` | `#102534` | Estado info: superfície |
| `--info-border` | `#BCD4E5` | `#2F607B` | Estado info: borda |

## Tipografia, forma e espaçamento

- Usar somente fontes de sistema (`ui-sans-serif`, `system-ui` e equivalentes); números financeiros usam algarismos tabulares.
- Escala tipográfica: `text-xs` (12 px) para metadados, rótulos curtos e menu móvel; `text-sm` (14 px) para corpo e controles; `text-base` (16 px) para títulos de cartão; `text-lg` e `text-xl` para títulos de diálogo e seção; `text-2xl`/`text-3xl` para títulos de página; `text-display` (28 px) para indicadores do painel. Nenhum texto fica abaixo de 12 px nem usa tamanho arbitrário.
- Quando um rótulo não couber no menu móvel, use hífen opcional (`\u00ad`) e mantenha o nome acessível completo em vez de reduzir a fonte.
- Usar escala de espaçamento baseada em 4 px. Agrupar primeiro pelo conteúdo e preservar respiro entre seções.
- Campos e botões têm altura mínima de 40 px; alvos de toque em ícones têm pelo menos 40 × 40 px.
- Usar cantos de 12 a 16 px para controles e cartões, bordas discretas e sombra leve.
- Adaptar colunas para tela estreita sem rolagem horizontal; o conteúdo pode crescer verticalmente.

## Componentes e estados

Os componentes reutilizáveis ficam em `src/components/ui`. Seguem a composição e customização local do shadcn/ui, Tailwind CSS e Radix para semântica de composição, com ícones Lucide.

- `Button`: ação principal, secundária, contorno, discreta e destrutiva; foco de teclado visível e estado desabilitado claro.
- `Card`: superfície para informação relacionada, com título e descrição semânticos.
- `FormField` e `Input`: rótulo visível ligado ao campo; ajuda e erro vinculados por `aria-describedby`. `FormField` aceita qualquer controle de `src/components/ui/form-controls.tsx`.
- `Select` e `Textarea`: mesma aparência do `Input` (`fieldControlClassName`), com seta própria no seletor nativo.
- `Checkbox` e `RadioGroup`: rótulo clicável; `RadioGroup` usa `fieldset`/`legend` e opções segmentadas navegáveis por setas.
- `DateField`: texto com máscara DD/MM/AAAA e teclado numérico; o formulário valida com `parseBrazilianDate`. Datas ISO coladas são convertidas.
- `MonthField`: competência com máscara MM/AAAA, recebe e entrega `AAAA-MM`; texto incompleto não altera o valor e volta ao último mês válido ao sair do campo. Substitui `type="month"`, que aparecia no idioma do navegador e não funciona no Firefox e no Safari de desktop.
- `MoneyInput`: valor em reais com prefixo visual “R$”, aceita vírgula e milhar, normaliza ao sair do campo (`1234,5` → `1.234,50`) e informa centavos inteiros por `onCentsChange`. Para preencher, use `formatBrazilianAmount`.
- `MoneyValue`: recebe centavos inteiros (número, string ou BigInt) e exibe reais com algarismos tabulares. `tone` aplica a cor de receita (`income`), despesa (`expense`), aporte (`investment`) ou resultado (`balance`: sucesso se zero ou positivo, erro se negativo); `signDisplay` mostra `+` quando pedido; `compact` abrevia (ex.: “R$ 1,2 mi”) e mantém o valor exato no `title`. Use-o para valores isolados; em frases corridas, use `formatBrazilianMoney`.
- Formatação: `src/lib/finance.ts` é a única fonte para dinheiro (`formatBrazilianMoney`, `formatCompactBrazilianMoney`), datas (`formatBrazilianDate`, `formatBrazilianMonth`, `formatBrazilianMonthLong`, `formatBrazilianDateTime`, `brazilianMonthName`) e a data atual em America/Sao_Paulo (`currentSaoPauloDate`, `currentBrazilianDate`, `currentMonthInputValue`). Não criar `Intl.NumberFormat` ou `Intl.DateTimeFormat` nas telas. A exportação CSV mantém seu formato próprio.
- `StatusBadge`: sempre exibe texto e ícone além da cor.
- `DashboardCharts`: gráficos responsivos de previsto versus realizado e despesas por categoria, com aportes separados do consumo. Cada gráfico inclui resumo textual, tooltip com valor exato e tabela expansível; a navegação por teclado e leitores de tela permanecem habilitados.
- Composição financeira (`src/components/finance`): use estes blocos antes de montar markup de lista, indicador ou tabela nas páginas.
  - `EntryList` e `EntryRow`: linha com ícone opcional, título (cortado por padrão; `wrapTitle` permite quebrar), detalhes, bloco de valores (`aside`), ações e conteúdo em largura total (`children`, para formulários e detalhes). Renderiza `<li>`; `density` ajusta o respiro. `EntryAmount` monta o bloco de valores com tom, legenda e `StatusBadge`.
  - `StatCard`: indicador com rótulo, valor em destaque (`text-display` a partir de `sm`) e explicação.
  - `FilterBar`: cartão de filtros em grade (uma coluna no celular).
  - `MonthNavigator`: competência com mês anterior e próximo; usa `MonthField` e `shiftMonth`.
  - `ActionToolbar`: conjunto de ações que quebra de linha em tela estreita.
  - `DataTable`: tabela com legenda, cabeçalhos de coluna e de linha e linha de total (`emphasis`). `compact` usa colunas fixas e quebra de rótulo para caber em 320 px sem rolagem horizontal (tabelas dos gráficos).
- Carregamento (`src/components/ui/skeleton.tsx`): `ListSkeleton`, `TextSkeleton`, `DashboardSkeleton` e `ChartsSkeleton` reproduzem a estrutura do conteúdo (ícone, título e valor das linhas; indicadores, tabela e gráficos do painel) para o layout não saltar quando o conteúdo chega. Cada um fica dentro de `SkeletonRegion` (`role="status"`, `aria-busy`, texto oculto com o que carrega) e esconde os blocos decorativos da tecnologia assistiva. Os blocos só pulsam com `motion-safe:`. Mostre o esqueleto apenas quando ainda não há dados (`loading && itens.length === 0`); em recarga com dados, mantenha a lista e use `aria-busy` (`EntryList busy`). `LoadingState` (indicador simples) fica para carregamentos que não são listas, como a troca de tela.
- `EmptyState`: título, orientação sobre como começar e a ação disponível (botão ou link). `compact` serve para listas dentro de formulários e configurações, onde o formulário acima já é a ação. Use `as="h2"` logo abaixo do título da página.
- Avisos após ações (`toast` de `toast-store`): toda ação concluída anuncia o resultado, com mensagens genéricas (sem repetir o nome do item, que já aparece na lista). Anúncio educado (`aria-live="polite"`), sem mover o foco; para ações pelo teclado, F8 leva o foco à região de avisos. **Desfazer só quando a reversão é segura**, isto é, sem perda de dados ou autoria: confirmar lançamento (desconfirmar), arquivar categoria, forma de pagamento ou cartão (restaurar) e quitar fatura (estornar). Não há desfazer para excluir lançamento (recriar perderia a autoria e o histórico), cancelar compra, arquivar regra recorrente, invalidar convite e desativar acesso; nesses casos o aviso apenas informa. O desfazer usa a versão mais recente do registro, não a que a tela tinha antes da ação.
- `LoadingState`: indicador simples com anúncio educado.
- `Alert`: mensagem inline com ícone e texto nas variantes `destructive`, `warning`, `success` e `info`. Erro e atenção usam `role="alert"`; sucesso e informação usam `role="status"`. Substitui parágrafos de erro montados à mão.
- `Dialog` (`DialogContent`, `DialogHeader`, `DialogFooter`): modal Radix que prende o foco e fecha com Esc. Ao abrir por código, devolva o foco ao gatilho com `onCloseAutoFocus`.
- `useConfirmDialog`: substitui `window.confirm` por `AlertDialog` com título, descrição, ação nomeada (“Excluir lançamento”, não “OK”) e variante destrutiva. Devolve o foco ao elemento que pediu a confirmação e só resolve `true` quando a pessoa confirma.
- `toast` e `Toaster`: anunciam o resultado de uma ação concluída sem deslocar o layout. O `Toaster` fica no `AppLayout`, acima do menu móvel; orientações persistentes continuam como `Alert`.

O estado vazio explica como começar quando existe uma ação disponível. Carregamento mantém o layout estável e respeita movimento reduzido. Erro descreve a situação em texto e, quando a tela oferecer recuperação, orienta uma ação. Valores, legenda ou resumo acompanham os gráficos; não comunicar resultado somente pela cor. Use os filtros do mesmo período do painel e mantenha valores exatos disponíveis fora dos eixos arredondados.

## Catálogo e verificação

O catálogo vivo (`src/pages/design-catalog.tsx`) mostra tokens com valor e razão de contraste lidos do CSS, a escala tipográfica e todos os componentes e estados com dados fictícios. Abra `http://localhost:5173/catalogo` com `npm run dev`. A rota só existe em desenvolvimento ou em builds com `VITE_DESIGN_CATALOG=true` (usado pelo Playwright, em `dist/e2e`); `npm run build` falha se o catálogo aparecer no pacote de produção (`scripts/check-production-bundle.js`) e, em produção, `/catalogo` redireciona para o início.

Verificações automáticas:

- `src/lib/design-tokens.test.ts` calcula o contraste de cada par declarado em `src/lib/design-tokens.ts` (texto: 4,5:1; contorno de campo, foco e gráficos: 3:1) e confere se as tabelas deste documento coincidem com `src/styles.css`. Ao alterar um token, atualize o documento.
- `src/pages/accessibility.test.tsx` executa o axe (jsdom, sem contraste) no catálogo, na confirmação aberta e na lista e no formulário de lançamentos.
- `e2e/design-catalog.spec.js` executa o axe no catálogo em 320, 768 e 1280 px e no diálogo de confirmação; `e2e/first-release.spec.js` o executa em todas as rotas autenticadas, em celular e desktop, e na prévia da importação. O contraste só é avaliado nos testes de navegador.

Regras que o axe já exigiu: `CardTitle` usa `h2` por padrão (`as="h3"` sob outro `h2`) e `EmptyState` aceita `as="h2"` logo abaixo do título da página, para manter a ordem dos níveis; tabelas que rolam na horizontal (`DataTable`) viram região rolável focável pelo teclado.

Ao adicionar um componente ou estado, inclua-o no catálogo e revise em largura móvel (320 px), desktop e teclado.
