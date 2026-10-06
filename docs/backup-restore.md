# Restauração de backups

O backup pode ser restaurado em uma base Postgres vazia para conferência ou recuperação. A rotina não substitui nem se conecta ao banco ativo da aplicação. Mantenha o banco de destino em uma rede Docker separada até verificar os dados.

## Recuperação em outra máquina

Instale Docker Compose, obtenha o repositório e prepare a configuração OAuth do rclone conforme [Google Drive backups](google-drive-backups.md). Recrie os remotes `conta-clara-drive` e `conta-clara-crypt`; use as senhas e o salt guardados no gerenciador de senhas. O arquivo `secrets/rclone/rclone.conf` contém o token OAuth e deve ficar fora do Git, com permissões restritas. A pasta temporária da restauração conterá o dump descriptografado apenas em `tmpfs`.

Construa a imagem que contém rclone, `pg_restore` e `psql`:

```sh
docker build -f deploy/Backup.Dockerfile -t conta-clara-backup:local .
```

Confira os nomes disponíveis no remote criptografado e escolha uma cópia de `daily`, `weekly` ou `monthly`. Os nomes aparecem descriptografados pelo remote `crypt` e são ordenáveis por data:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD/secrets/rclone,target=/run/rclone" \
  --entrypoint rclone conta-clara-backup:local \
  --config /run/rclone/rclone.conf \
  lsf --files-only conta-clara-crypt:daily
```

Defina a pasta criptografada escolhida e o nome exato exibido pelo comando:

```sh
RESTORE_TIER=daily
BACKUP_FILE='conta-clara-AAAAMMDDTHHMMSSZ-identificador.dump'
RESTORE_NETWORK="conta-clara-restore-$(date +%s)"
RESTORE_CONTAINER="${RESTORE_NETWORK}-db"
RESTORE_DATABASE=conta_clara_restore
read -rsp 'Senha temporária da base descartável: ' RESTORE_PASSWORD
printf '\n'
```

Crie uma rede isolada e um Postgres temporário sem publicar portas no computador. Use uma senha temporária diferente das senhas da instalação:

```sh
docker network create "$RESTORE_NETWORK"
docker run -d --name "$RESTORE_CONTAINER" \
  --network "$RESTORE_NETWORK" \
  --env POSTGRES_PASSWORD="$RESTORE_PASSWORD" \
  --env POSTGRES_DB="$RESTORE_DATABASE" \
  postgres:18-alpine

until docker exec "$RESTORE_CONTAINER" \
  pg_isready -U postgres -d "$RESTORE_DATABASE" >/dev/null 2>&1; do sleep 1; done
```

Baixe e descriptografe o arquivo em memória, confira a cópia com `cryptcheck`, valide o formato do dump e restaure somente na base temporária. O contêiner de ferramentas se conecta apenas à rede temporária e ao Google Drive:

```sh
docker run --rm --network "$RESTORE_NETWORK" \
  --user "$(id -u):$(id -g)" \
  --tmpfs "/restore:rw,noexec,nosuid,size=1g,uid=$(id -u),gid=$(id -g)" \
  --mount "type=bind,source=$PWD/secrets/rclone,target=/run/rclone" \
  --env RCLONE_CONFIG=/run/rclone/rclone.conf \
  --env RESTORE_TIER="$RESTORE_TIER" \
  --env BACKUP_FILE="$BACKUP_FILE" \
  --env PGHOST="$RESTORE_CONTAINER" \
  --env PGUSER=postgres \
  --env PGPASSWORD="$RESTORE_PASSWORD" \
  --env PGDATABASE="$RESTORE_DATABASE" \
  --entrypoint sh conta-clara-backup:local -euc '
    remote="conta-clara-crypt:${RESTORE_TIER}"
    rclone copyto "$remote/$BACKUP_FILE" /restore/conta-clara.dump
    rclone cryptcheck /restore "$remote" --one-way
    pg_restore --list /restore/conta-clara.dump >/dev/null
    pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
      --dbname="$PGDATABASE" /restore/conta-clara.dump
  '
```

Confira migrações e tabelas essenciais no destino antes de qualquer decisão de uso:

```sh
docker run --rm --network "$RESTORE_NETWORK" \
  --env PGHOST="$RESTORE_CONTAINER" \
  --env PGUSER=postgres \
  --env PGPASSWORD="$RESTORE_PASSWORD" \
  --env PGDATABASE="$RESTORE_DATABASE" \
  --entrypoint psql conta-clara-backup:local \
  --dbname="$RESTORE_DATABASE" -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM schema_migrations) AS migrations,
          (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM financial_entries) AS entries,
          (SELECT count(*) FROM recurrence_rules) AS recurrence_rules;"
```

O resultado deve refletir a instalação restaurada, inclusive a tabela `schema_migrations` e as regras recorrentes. Não publique contagens ou resultados que revelem informações da família.

O dump não preserva proprietários nem permissões Postgres. Para uma recuperação que vá substituir a instalação, crie a base e os papéis de migração/runtime conforme [Banco de dados](database.md), restaure conectado como o proprietário de migrações e confira as permissões do papel da aplicação. Só depois da verificação, pare a aplicação antiga e altere manualmente `DATABASE_URL` e `MIGRATION_DATABASE_URL` para a nova base. A rotina de restauração não faz essa troca.

Após conferir ou cancelar a recuperação, remova o destino e a rede temporários:

```sh
docker rm -f "$RESTORE_CONTAINER"
docker network rm "$RESTORE_NETWORK"
unset RESTORE_PASSWORD
```

## Teste sintético reproduzível

Execute `scripts/backup-restore-drill.sh`. O teste cria uma rede Docker aleatória e dois Postgres descartáveis, aplica as migrações atuais, insere apenas um usuário e dados financeiros fictícios, gera um dump custom-format, criptografa e descriptografa com um remote local `rclone crypt` e restaura no segundo banco. A rotina também compara o dump restaurado byte a byte, rejeita chave incorreta e arquivo inválido, valida as contagens e remove os contêineres, a rede e os arquivos temporários ao terminar. Não usa `.env`, o Postgres da aplicação, o `rclone.conf` real nem o Google Drive.

Validação registrada em **2026-10-06**: um usuário sintético, um lançamento vinculado a uma regra recorrente e todas as migrações do repositório foram restaurados no Postgres 18 descartável; a comparação do arquivo passou e a chave incorreta e o arquivo inválido foram rejeitados. O teste não lê nem restaura o backup financeiro real.
