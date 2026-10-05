# Instruções para agentes

## Escopo

Leia README.md, ROADMAP.md e a issue indicada antes de trabalhar. Resolva uma issue por vez, apenas com dependências concluídas. Não implemente histórias futuras por iniciativa própria.

## Fluxo

1. Leia comportamento esperado, limites e critérios de aceite da issue.
2. Implemente somente o escopo autorizado e registre impedimentos; não marque trabalho parcial como concluído.
3. Escreva testes de comportamento com Vitest/React Testing Library para UI e Supertest para rotas Express. Use Playwright nos fluxos de navegador e Postgres descartável para persistência quando essas partes forem implementadas. Execute `npm run typecheck`, `npm test` e `npm run build` quando aplicáveis. Para mudanças visuais, verifique mobile, desktop e teclado. Registre evidências e limitações.
4. Revise o diff por dados privados e segredos. Faça commits diretamente na main, referenciando a issue. Publique apenas quando autorizado pelo usuário ou pelo escopo da tarefa.
5. Após publicar e validar todos os critérios, encerre a issue e atualize ROADMAP.md e o checklist da issue central. Publique também essa atualização.

## Decisões do produto

React/TypeScript, shadcn/ui, Tailwind e Recharts; Node/Express e Postgres. Usuários distintos compartilham finanças; apenas administrador gerencia usuários/backups. Valores em centavos, datas financeiras sem horário, reais e português brasileiro. Aportes separados do consumo.

## Privacidade

Use somente dados fictícios em testes, imagens e documentação. Não leia nem publique finanças reais para cumprir histórias que podem ser verificadas com fixtures. Nunca versione credenciais, tokens, dumps, dados locais ou chaves de criptografia. Não configure automações recorrentes sem pedido explícito.
