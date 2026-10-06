# Dados locais e uso offline

O Conta Clara armazena uma cópia de alguns dados financeiros no IndexedDB do navegador, separada pela combinação de usuário e espaço financeiro. Entradas, categorias, formas de pagamento, resumos do painel e alterações ainda não enviadas nunca são compartilhados entre os espaços locais de usuários diferentes.

## O que funciona

- Depois de consultar uma página conectado, os lançamentos carregados, os cadastros usados pelos formulários e o resumo do mês do painel ficam disponíveis neste aparelho.
- Sem rede, é possível filtrar os lançamentos disponíveis e criar, editar ou excluir itens. Cada alteração fica na fila local e sobrevive ao fechamento ou à recarga da página. Alterações repetidas no mesmo item são combinadas; criar e depois excluir um item ainda não enviado remove a operação da fila.
- A barra de status mostra a conectividade, o número de alterações pendentes e quando os dados foram atualizados online pela última vez.
- Se a sessão expirar, a aplicação retorna à tela de acesso e preserva os dados e a fila. Após autenticação novamente com o mesmo usuário e espaço, o trabalho local continua disponível.
- Ao sair com alterações pendentes, é necessário confirmar o descarte. A limpeza remove apenas os dados locais daquele usuário e espaço. Se a pessoa sair sem rede, um marcador local impede que o cookie de sessão ainda válido restaure a identidade automaticamente quando a conexão voltar.

## Limites nesta etapa

A primeira consulta de cada página, mês e cadastro precisa acontecer com o servidor disponível. Os dados salvos são a cópia do que foi consultado; páginas, meses e lançamentos nunca carregados não ficam disponíveis offline. O navegador pode remover dados locais, e a PWA não oferece cópia de segurança dos dados do IndexedDB.

A fila ainda não é enviada ao servidor. Reconexão, reautenticação e recarga não disparam alterações da fila; a sincronização e o tratamento de conflitos pertencem à issue [#19](https://github.com/csescobar/conta-clara/issues/19). A confirmação de pagamentos e recebimentos permanece desabilitada offline e enquanto houver operações pendentes.

A identidade autenticada mais recente é guardada no aparelho para habilitar o acesso offline por até sete dias desde a última verificação bem-sucedida no servidor. Depois desse período, é necessário conectar-se e autenticar. O IndexedDB não é criptografado pela aplicação; qualquer pessoa com acesso ao mesmo perfil de navegador ou à conta local do sistema pode inspecionar esses dados. Use o modo offline apenas em aparelhos confiáveis e protegidos.

## Verificação

`src/offline/offline-store.test.ts` usa IndexedDB de teste para verificar isolamento por usuário e espaço, persistência e combinação de operações, proteção contra leituras antigas do servidor, prazo da identidade offline e limpeza restrita ao espaço selecionado. `src/offline/offline-workflow.test.tsx` exercita leitura e cadastro offline, logout com confirmação de descarte, preservação da fila após expiração da sessão e bloqueio de restauração de uma identidade após logout local. A suíte geral executa junto com typecheck e build.
