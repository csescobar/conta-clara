# Como contribuir

Leia o README e o roadmap. Escolha uma issue aberta cujas dependências estejam concluídas e registre nela a intenção de trabalhar e eventuais dúvidas. Faça uma história por vez.

Contribuições externas devem usar fork e pull request referenciando a issue. O fluxo do mantenedor e dos agentes autorizados é por commits diretamente na main.

Use dados fictícios. Nunca publique planilhas pessoais, credenciais, cookies, tokens, dumps ou chaves de recuperação. Configurações de exemplo devem conter apenas placeholders.

Mantenha documentação em português. Escreva testes de comportamento com Vitest e React Testing Library para a interface; use Supertest para rotas Express, Playwright para fluxos importantes do navegador e Postgres descartável para persistência e migrações. Evite snapshots extensos: prefira testar o que a pessoa vê e faz. Para gráficos, confira resumo textual e valores; para datas e dinheiro, cubra bordas relevantes. Execute `npm run typecheck`, `npm test`, `npm run build` e, quando houver mudança de banco, `npm run test:db` contra uma base vazia descartável. Para interface, confira celular, desktop e teclado. Informe comandos, resultados e limitações na issue ou PR.

Commits devem explicar a mudança e referenciar a issue, por exemplo: `feat: cadastrar receitas (#9)`. Não encerre issues por trabalho parcial: primeiro valide os critérios e publique a mudança. Atualize ROADMAP.md e o checklist central ao concluir.
