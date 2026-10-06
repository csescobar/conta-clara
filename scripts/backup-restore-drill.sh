#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backup_image="conta-clara-backup:local"
drill_suffix="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
drill_network="conta-clara-restore-drill-${drill_suffix}"
source_container="${drill_network}-source"
target_container="${drill_network}-target"
drill_database="conta_clara_restore_drill"
drill_password="restore-drill-${drill_suffix}"
drill_directory="$(mktemp -d "${TMPDIR:-/tmp}/conta-clara-restore-drill.XXXXXX")"

cleanup() {
  docker rm -f "$source_container" "$target_container" >/dev/null 2>&1 || true
  docker network rm "$drill_network" >/dev/null 2>&1 || true
  rm -rf -- "$drill_directory"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker CLI não encontrado.' >&2
  exit 1
fi
if [[ ! -d "$repo_root/node_modules/pg" ]]; then
  echo 'Dependências Node ausentes; execute npm ci antes do teste.' >&2
  exit 1
fi

chmod 700 "$drill_directory"
if ! docker image inspect "$backup_image" >/dev/null 2>&1; then
  docker build -f "$repo_root/deploy/Backup.Dockerfile" -t "$backup_image" "$repo_root"
fi

docker network create "$drill_network" >/dev/null

for pg_container_name in "$source_container" "$target_container"; do
  docker run -d \
    --name "$pg_container_name" \
    --network "$drill_network" \
    --env "POSTGRES_PASSWORD=$drill_password" \
    --env "POSTGRES_DB=$drill_database" \
    postgres:18-alpine >/dev/null
done

wait_for_postgres() {
  local pg_container_name="$1"
  for attempt in {1..60}; do
    if docker exec "$pg_container_name" pg_isready -U postgres -d "$drill_database" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres descartável não ficou pronto: $pg_container_name" >&2
  return 1
}

wait_for_postgres "$source_container"
wait_for_postgres "$target_container"

run_migrations() {
  docker run --rm \
    --network "$drill_network" \
    --mount "type=bind,source=$repo_root/scripts,target=/workspace/scripts,readonly" \
    --mount "type=bind,source=$repo_root/server/database,target=/workspace/server/database,readonly" \
    --mount "type=bind,source=$repo_root/migrations,target=/workspace/migrations,readonly" \
    --mount "type=bind,source=$repo_root/node_modules,target=/workspace/node_modules,readonly" \
    --workdir /workspace \
    --env "DATABASE_URL=postgresql://postgres:${drill_password}@${source_container}:5432/${drill_database}" \
    --entrypoint node "$backup_image" /workspace/scripts/migrate.js
}

run_migrations

cat > "$drill_directory/seed.sql" <<'SQL'
WITH created_user AS (
  INSERT INTO users (email, display_name, password_hash)
  VALUES ('restore-drill@example.test', 'Restore Drill', 'synthetic-password-hash')
  RETURNING id
), created_space AS (
  INSERT INTO finance_spaces (name, created_by_user_id)
  SELECT 'Restore Drill Family', id FROM created_user
  RETURNING id, created_by_user_id
), created_member AS (
  INSERT INTO space_memberships (space_id, user_id, role)
  SELECT id, created_by_user_id, 'admin' FROM created_space
  RETURNING space_id, user_id
), created_category AS (
  INSERT INTO categories (space_id, name, kind, expense_class)
  SELECT space_id, 'Restore Drill Expense', 'expense', 'fixed' FROM created_member
  RETURNING id, space_id
), created_payment_method AS (
  INSERT INTO payment_methods (space_id, name)
  SELECT space_id, 'Restore Drill Method' FROM created_member
  RETURNING id, space_id
), created_rule AS (
  INSERT INTO recurrence_rules (
    space_id, created_by_user_id, updated_by_user_id, kind, description,
    category_id, payment_method_id, start_competence_on, due_day, planned_cents
  )
  SELECT m.space_id, m.user_id, m.user_id, 'expense', 'Restore Drill Rule',
    c.id, p.id, '2026-10-01', 15, 12345
  FROM created_member m
  JOIN created_category c ON c.space_id = m.space_id
  JOIN created_payment_method p ON p.space_id = m.space_id
  RETURNING id, space_id
)
INSERT INTO financial_entries (
  space_id, created_by_user_id, updated_by_user_id, kind, description,
  category_id, competence_on, due_on, planned_cents, payment_method_id,
  recurrence_rule_id
)
SELECT r.space_id, m.user_id, m.user_id, 'expense', 'Restore Drill Expense',
  c.id, '2026-10-01', '2026-10-15', 12345, p.id, r.id
FROM created_rule r
JOIN created_member m ON m.space_id = r.space_id
JOIN created_category c ON c.space_id = r.space_id
JOIN created_payment_method p ON p.space_id = r.space_id;
SQL

docker exec -i "$source_container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d "$drill_database" \
  < "$drill_directory/seed.sql" >/dev/null

docker exec "$source_container" \
  pg_dump --format=custom --no-owner --no-privileges -U postgres --dbname="$drill_database" \
  > "$drill_directory/source.dump"

mkdir -p "$drill_directory/source"
cp "$drill_directory/source.dump" "$drill_directory/source/conta-clara-restore-drill.dump"
drill_password_one="$(docker run --rm --entrypoint rclone "$backup_image" obscure 'restore-drill-password-one')"
drill_password_two="$(docker run --rm --entrypoint rclone "$backup_image" obscure 'restore-drill-password-two')"
wrong_password="$(docker run --rm --entrypoint rclone "$backup_image" obscure 'intentionally-wrong-restore-key')"

cat > "$drill_directory/rclone.conf" <<EOF
[drill-local]
type = local

[drill-crypt]
type = crypt
remote = drill-local:/drill/encrypted
filename_encryption = standard
directory_name_encryption = true
password = ${drill_password_one}
password2 = ${drill_password_two}

[wrong-crypt]
type = crypt
remote = drill-local:/drill/encrypted
filename_encryption = standard
directory_name_encryption = true
password = ${wrong_password}
password2 = ${drill_password_two}
EOF
chmod 600 "$drill_directory/rclone.conf"

run_rclone() {
  docker run --rm \
    --network "$drill_network" \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$drill_directory,target=/drill" \
    --entrypoint rclone "$backup_image" --config /drill/rclone.conf "$@"
}

run_pg_restore() {
  docker run --rm \
    --network "$drill_network" \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$drill_directory,target=/drill" \
    --env "PGHOST=$target_container" \
    --env PGUSER=postgres \
    --env "PGPASSWORD=$drill_password" \
    --env "PGDATABASE=$drill_database" \
    --entrypoint pg_restore "$backup_image" "$@"
}

run_rclone copyto \
  /drill/source/conta-clara-restore-drill.dump \
  drill-crypt:daily/conta-clara-restore-drill.dump
run_rclone cryptcheck \
  /drill/source drill-crypt:daily --one-way >/dev/null
run_rclone copyto \
  drill-crypt:daily/conta-clara-restore-drill.dump \
  /drill/restored.dump
cmp "$drill_directory/source.dump" "$drill_directory/restored.dump"

if run_rclone copyto \
  wrong-crypt:daily/conta-clara-restore-drill.dump \
  /drill/wrong-key.dump >/dev/null 2>&1; then
  echo 'A chave crypt incorreta foi aceita.' >&2
  exit 1
fi

printf 'arquivo inválido sintético\n' > "$drill_directory/invalid.dump"
if run_pg_restore --list /drill/invalid.dump >/dev/null 2>&1; then
  echo 'pg_restore aceitou um arquivo inválido.' >&2
  exit 1
fi

run_pg_restore \
  --exit-on-error --single-transaction --no-owner --no-privileges \
  --dbname="$drill_database" /drill/restored.dump

expected_migrations="$(find "$repo_root/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d '[:space:]')"
restored_counts="$(docker exec "$target_container" \
  psql -v ON_ERROR_STOP=1 -U postgres -d "$drill_database" -Atc "
    SELECT
      (SELECT count(*) FROM users WHERE email = 'restore-drill@example.test'),
      (SELECT count(*) FROM financial_entries WHERE description = 'Restore Drill Expense'),
      (SELECT count(*) FROM recurrence_rules WHERE description = 'Restore Drill Rule'),
      (SELECT count(*) FROM schema_migrations);
  ")"
expected_counts="1|1|1|${expected_migrations}"
if [[ "$restored_counts" != "$expected_counts" ]]; then
  echo "Contagens inesperadas após a restauração: $restored_counts" >&2
  exit 1
fi

echo "Restauração sintética aprovada: 1 usuário, 1 lançamento, 1 regra recorrente e ${expected_migrations} migrações; arquivo inválido e chave errada rejeitados."
