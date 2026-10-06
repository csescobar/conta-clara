# Banco de dados local

A API usa uma instância PostgreSQL existente e exige `DATABASE_URL`. Nenhum banco é criado automaticamente na inicialização. Configure `.env` a partir de `.env.example`, mantendo esse arquivo fora do Git. Se a API rodar em outro container, use o nome do serviço e uma rede Docker comum; `localhost` dentro do container aponta para o próprio container.

## Papéis recomendados

Crie uma base `conta_clara` e credenciais exclusivas para o projeto. Para instalações duradouras, separe um papel proprietário de migrações (pode criar tabelas) do papel da aplicação (pode ler e alterar registros, sem alterar o esquema). Guarde as senhas em um gerenciador local de segredos ou em `.env`. Nunca use o usuário superusuário Postgres na aplicação.

Em uma sessão `psql` de administração, crie a base sem colocar senhas na linha de comando ou no histórico:

```sql
CREATE ROLE conta_clara_migrator LOGIN;
CREATE ROLE conta_clara_app LOGIN;
\password conta_clara_migrator
\password conta_clara_app
CREATE DATABASE conta_clara OWNER conta_clara_migrator;
GRANT CONNECT ON DATABASE conta_clara TO conta_clara_app;
\connect conta_clara
GRANT USAGE ON SCHEMA public TO conta_clara_app;
ALTER DEFAULT PRIVILEGES FOR ROLE conta_clara_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO conta_clara_app;
```

Cole as duas URLs resultantes nos valores `DATABASE_URL` e `MIGRATION_DATABASE_URL` do arquivo `.env` local.

`DATABASE_URL` identifica o papel de runtime. `MIGRATION_DATABASE_URL` pode identificar o proprietário de migrações; quando omitida, as migrações usam `DATABASE_URL`, adequado a uma instalação local simples. Restrinja a URL de migrações à máquina e aos operadores autorizados.

## Migrações

Arquivos em `migrations/` são imutáveis depois de aplicados. Mudanças de estrutura devem vir em um novo arquivo numerado. O executor usa lock consultivo para serializar instalações, aplica cada arquivo dentro de uma transação e guarda seu SHA-256 em `schema_migrations`; uma alteração posterior ou remoção de arquivo aplicado interrompe a execução.

```sh
cp .env.example .env
# Edite .env com a URL da base exclusiva Conta Clara.
npm run db:status
npm run db:migrate
```

Revise permissões antes de habilitar as rotas da aplicação. Os papéis precisam de acesso ao mesmo banco usado pelas migrações.

## Modelo inicial

- `users`, `finance_spaces` e `space_memberships` representam pessoas e o espaço compartilhado. A desativação encerra a associação com `deactivated_at`, revoga sessões e redefinições pendentes e mantém a linha de associação para preservar lançamentos históricos; só administradores ativos veem membros desativados e podem reativá-los. Após reativação, a pessoa precisa entrar novamente.
- `sessions` armazena somente hashes de tokens de sessão. Convites e links de redefinição ficam em `account_tokens`, também apenas com hash; convites expiram em 48 horas, links de redefinição em 1 hora e os dois são de uso único.
- `categories`, `payment_methods` e `financial_entries` pertencem ao espaço; chaves estrangeiras compostas impedem que um lançamento associe uma categoria, forma de pagamento ou autor de outro espaço.
- Valores financeiros são `bigint` em centavos. `competence_on` é sempre o primeiro dia do mês; vencimentos e realizações são datas sem horário.
- Valor/data efetivos são nulos em conjunto ou definidos em conjunto. Saldo e situação são derivados pela aplicação conforme as histórias financeiras.
- Exclusões relacionadas são restritas para preservar histórico. Pessoas e cadastros usados devem ser desativados/arquivados, não removidos. Consultas e alterações financeiras devem sempre usar `request.auth.spaceId`; papéis admin e member compartilham permissões financeiras, enquanto ações de gestão exigem admin.

## Teste de integração

Os testes de banco aceitam somente `TEST_DATABASE_URL`, nunca reaproveitam a URL de runtime como fallback. Aponte essa variável para uma base descartável com nome terminado em `_test`. A suíte cria o esquema e linhas fictícias; antes e depois das suítes de autenticação, convites e permissões, `TRUNCATE users CASCADE` limpa os registros das tabelas da aplicação. Não aponte para uma base de desenvolvimento ou produção.

```sh
cp .env.test.example .env.test
# Crie uma base separada, por exemplo conta_clara_test, e defina a URL acima.
npm run test:db
```

Valide qualquer restauração em uma base separada. As migrações atuais não contêm nem importam dados pessoais.
