# Sincronização offline

O Postgres continua sendo a fonte de verdade. A PWA mantém lançamentos e operações pendentes no IndexedDB, separados por usuário e espaço financeiro, e os envia depois de confirmar a sessão. Nenhuma rotina de sincronização usa Background Sync do navegador.

## Quando sincroniza

- Depois que a sessão autenticada e o armazenamento local estiverem prontos ao abrir a aplicação.
- Quando a rede volta, após revalidar a sessão no servidor.
- Ao voltar para a janela da aplicação, se o navegador indicar conexão.
- Pela ação **Sincronizar agora**, disponível enquanto houver operações pendentes.

As operações são enviadas uma por vez. Se houver falha de rede ou a resposta se perder depois da gravação, a fila permanece no aparelho e a mesma operação é repetida com o mesmo UUID. Assim, uma criação já confirmada pelo servidor não cria um segundo lançamento. Alterações locais feitas enquanto uma operação está em trânsito são preservadas como uma operação seguinte.

## Versões e conflitos

Cada lançamento tem uma versão inteira crescente. Edição, confirmação, reversão da confirmação e exclusão de ocorrência recorrente verificam e avançam essa versão. Uma edição offline informa a versão que foi consultada; se outra pessoa alterar ou remover o lançamento antes da sincronização, o servidor devolve um conflito com a versão atual, sem sobrescrevê-la silenciosamente.

A aplicação mostra um resumo da versão local e da versão do servidor. A pessoa pode manter a versão local, adotar a versão do servidor ou, se o servidor já removeu o lançamento, recriar a versão local com um novo identificador. Uma exclusão local também pode ser mantida quando o servidor ainda tem o lançamento. A fila só é removida depois que o servidor confirma a operação ou que a pessoa escolhe descartar a versão local.

O autor de cada criação, edição ou exclusão vem da sessão autenticada no servidor. Identificadores, autoria e espaço enviados pelo cliente não definem a permissão. Um membro desativado não consegue sincronizar; as alterações locais continuam guardadas até a pessoa entrar com uma conta ativa do espaço correto.

## Idempotência e dados guardados

O servidor grava a operação aplicada, seu autor, a requisição normalizada e a resposta na mesma transação da alteração financeira. A chave de idempotência é única dentro do espaço. Uma repetição do mesmo UUID e conteúdo recebe a resposta original; tentar reutilizar o UUID com conteúdo diferente resulta em conflito. Se isso ocorrer porque o servidor confirmou uma criação cuja resposta se perdeu enquanto a pessoa editava localmente, a interface apresenta o lançamento existente e transforma a edição local em atualização da mesma linha. O recibo é mantido no Postgres mesmo se o lançamento for excluído, para responder a tentativas atrasadas com segurança. Nesta etapa, não há rotina de expurgo dos recibos; portanto, eles ocupam espaço crescente e retêm um retrato da requisição e resposta até que uma política de retenção seja definida.

## Verificações e limites

`src/offline/offline-store.test.ts` verifica versão base, resolução local/servidor e preservação de edição feita durante envio. `src/offline/offline-workflow.test.tsx` verifica repetição após resposta perdida, reconexão, fila por usuário e interface de conflito. `server/routes/sync.integration.test.js` usa Postgres descartável para cobrir operações duplicadas concorrentes, repetição tardia, reutilização de chave, edições concorrentes, edição versus exclusão, autoria da sessão e membro desativado. Execute `npm test`, `npm run typecheck`, `npm run build` e `npm run test:db`.

A fila é limitada ao navegador e não constitui backup. O envio exige abrir ou focar a PWA, reconectar ou escolher a ação manual; o navegador pode suspender ou remover armazenamento local. Não existe sincronização em segundo plano, resolução automática por campo, histórico para desfazer uma sincronização nem limpeza automática de recibos.
