# Sincronização offline

O Postgres continua sendo a fonte de verdade. A PWA mantém lançamentos, cartões, compras com suas parcelas e operações pendentes no IndexedDB, separados por usuário e espaço financeiro, e os envia depois de confirmar a sessão. Nenhuma rotina de sincronização usa Background Sync do navegador.

## Quando sincroniza

- Depois que a sessão autenticada e o armazenamento local estiverem prontos ao abrir a aplicação.
- Quando a rede volta, após revalidar a sessão no servidor.
- Ao voltar para a janela da aplicação, se o navegador indicar conexão.
- Pela ação **Sincronizar agora**, disponível enquanto houver operações pendentes.

As operações são enviadas uma por vez. Se houver falha de rede ou a resposta se perder depois da gravação, a fila permanece no aparelho e a mesma operação é repetida com o mesmo UUID. Assim, uma criação já confirmada pelo servidor não cria um segundo lançamento, cartão ou série de compra. A compra e todas as suas parcelas são gravadas em uma única transação. Alterações locais feitas enquanto uma operação está em trânsito são preservadas como uma operação seguinte.

## Versões e conflitos

Cada lançamento, cartão e série de compra tem uma versão inteira crescente. Edição, confirmação, reversão da confirmação e exclusão de ocorrência recorrente verificam e avançam a versão dos lançamentos. Edições da série verificam a versão da compra; uma parcela futura também permanece vinculada ao identificador e ao número de sua parcela. Se outra pessoa alterar ou cancelar a compra antes da sincronização, o servidor devolve um conflito com a versão atual, sem sobrescrevê-la silenciosamente. Parcelas já pagas não são alteradas ao editar ou cancelar uma série.

A aplicação mostra um resumo da versão local e da versão do servidor para lançamentos, cartões e compras. A pessoa pode manter a versão local, adotar a versão do servidor ou, se a compra foi cancelada/removida no servidor, recriar a versão local com novos identificadores. Uma exclusão local de lançamento também pode ser mantida quando o servidor ainda tem o lançamento. A fila só é removida depois que o servidor confirma a operação ou que a pessoa escolhe descartar a versão local.

O autor de cada criação, edição ou exclusão vem da sessão autenticada no servidor. Identificadores, autoria e espaço enviados pelo cliente não definem a permissão. Um membro desativado não consegue sincronizar; as alterações locais continuam guardadas até a pessoa entrar com uma conta ativa do espaço correto.

## Idempotência e dados guardados

O servidor grava a operação aplicada, seu autor, a requisição normalizada e a resposta na mesma transação da alteração. A chave de idempotência é única dentro do espaço. Uma repetição do mesmo UUID e conteúdo recebe a resposta original; tentar reutilizar o UUID com conteúdo diferente resulta em conflito. Se isso ocorrer porque o servidor confirmou uma criação cuja resposta se perdeu enquanto a pessoa editava localmente, a interface apresenta o registro existente e transforma a edição local em atualização. O recibo é mantido no Postgres mesmo se um lançamento for excluído, para responder a tentativas atrasadas com segurança. Nesta etapa, não há rotina de expurgo dos recibos; portanto, eles ocupam espaço crescente e retêm um retrato da requisição e resposta até que uma política de retenção seja definida.

## Verificações e limites

`src/offline/offline-store.test.ts` verifica versão-base, resolução local/servidor e preservação de edição feita durante envio, incluindo compras. `src/pages/card-settings.test.tsx` verifica sincronização offline de cartões; `src/pages/card-purchases-page.test.tsx` verifica a criação de uma compra e suas parcelas. `src/offline/offline-workflow.test.tsx` verifica repetição após resposta perdida, reconexão, fila por usuário e interface de conflito. `server/routes/sync.integration.test.js` e `server/routes/purchases.integration.test.js` usam Postgres descartável para cobrir idempotência, datas de fatura, auditoria, isolamento do espaço, parcelas pagas, cancelamento e sincronização. Execute `npm test`, `npm run typecheck`, `npm run build` e `npm run test:db`.

A fila é limitada ao navegador e não constitui backup. O envio exige abrir ou focar a PWA, reconectar ou escolher a ação manual; o navegador pode suspender ou remover armazenamento local. Não existe sincronização em segundo plano, resolução automática por campo, histórico para desfazer uma sincronização nem limpeza automática de recibos.
