# Backups criptografados no Google Drive

O serviço opcional `backup` usa `pg_dump` para criar um dump custom-format no tmpfs do container e `rclone crypt` para criptografar os dados e nomes antes do envio. Cada nova tentativa recebe um identificador exclusivo para nunca sobrescrever uma cópia anterior. O serviço confere o conteúdo cifrado com `rclone cryptcheck` antes de remover qualquer arquivo antigo.

A pasta privada `Backups/Conta Clara` é o destino configurado no Google Drive. O serviço cria cópias diárias, mantém até 7; guarda uma cópia semanal no primeiro backup bem-sucedido de cada semana e mantém 4; e guarda uma cópia mensal no primeiro backup bem-sucedido de cada mês e mantém 6. Se a máquina perder o horário de 03:00 ou ficar desligada, o serviço executa um backup de recuperação assim que voltar; se a rede falhar, tenta novamente a cada 15 minutos. Vários dias desligada geram um único backup de recuperação, não cópias retroativas de cada dia perdido.

O status persistente fica num volume local compartilhado somente para leitura com a API. Apenas uma sessão de administrador pode consultar `/api/backups/status`; a tela **Configurações > Backups** mostra a última validação e a falha mais recente. Mensagens de erro são genéricas e não expõem URLs, tokens ou saída de comandos.

## Preparar o acesso ao Drive

O OAuth do rclone precisa de um Client ID e Client Secret próprios. O cliente compartilhado do rclone está sendo aposentado em 2026; siga o guia oficial para [criar credenciais OAuth próprias](https://rclone.org/drive/#making-your-own-client-id) e habilitar a Google Drive API. Para uma conta pessoal, publique o app OAuth para produção e permita o aviso de app não verificado durante a autorização; deixá-lo em teste pode fazer o token expirar após sete dias. Consulte também a [documentação do OAuth do Google](https://developers.google.com/identity/protocols/oauth2).

Na configuração interativa do rclone:

1. Crie um remote Google Drive chamado `conta-clara-drive`, informe o Client ID e Client Secret, escolha o escopo `drive` e use como `root_folder_id` o ID da pasta `Conta Clara` na URL do Drive.
2. Crie um remote `crypt` chamado `conta-clara-crypt`, apontando para `conta-clara-drive:`. Mantenha a criptografia de nomes e diretórios habilitada. Gere uma senha e um salt distintos; anote os dois valores originais em um gerenciador de senhas ou outro local de recuperação fora do Drive.
3. O escopo `drive` concede ao token do rclone acesso amplo de leitura e gravação ao Drive. `root_folder_id` define onde este remote começa, mas não reduz o escopo OAuth concedido pelo Google. O escopo `drive.file` é mais restrito, porém só permite ao rclone ver arquivos/pastas que ele próprio criou; a pasta atual foi criada fora desse cliente OAuth.

## Criar a configuração local

Execute estes passos na raiz do repositório, no computador que hospeda a aplicação:

```sh
mkdir -p secrets/rclone
chmod 700 secrets secrets/rclone
docker compose --profile backup build backup
docker run --rm -it --network host \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD/secrets/rclone,target=/config/rclone" \
  --entrypoint rclone conta-clara-backup:local \
  --config /config/rclone/rclone.conf config
chmod 600 secrets/rclone/rclone.conf
```

O fluxo de autorização abre um endereço local temporário em `127.0.0.1`; se o navegador não abrir sozinho, copie o endereço exibido para o navegador do computador. Entre na conta Google que receberá os backups e confirme a autorização. O arquivo `rclone.conf` contém o token OAuth e valores de criptografia apenas levemente ofuscados; o diretório e o arquivo devem permanecer privados e nunca devem ser enviados ao Git. A imagem é executada com UID 1000, correspondente ao usuário padrão desta instalação Linux. O serviço monta todo o diretório com permissão de escrita porque o rclone pode substituir o arquivo de configuração ao renovar o token OAuth; não deixe cópias extras desse arquivo.

Antes de ativar o agendamento, confirme que os dois remotes foram salvos e que o segundo realmente usa `type = crypt`. Não imprima nem cole o conteúdo do arquivo em mensagens, issues ou logs.

```sh
docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$PWD/secrets/rclone,target=/config/rclone" \
  --entrypoint rclone conta-clara-backup:local \
  --config /config/rclone/rclone.conf lsd conta-clara-crypt:
```

Depois de configurado, habilite o serviço persistente e faça a primeira execução manual:

```sh
docker compose --profile backup up -d --build backup
docker compose --profile backup exec backup node /opt/conta-clara-backup/runner.js --run-once
docker compose --profile backup logs --tail=100 backup
```

Consulte a última execução na tela **Configurações > Backups**. O container de backup usa `MIGRATION_DATABASE_URL` para que `pg_dump` possa ler todas as tabelas e sequências; se essa variável não estiver configurada, usa `DATABASE_URL`. Esse segredo é fornecido somente ao container de backup e não é incluído nos argumentos do processo nem no status da interface.

## Limites e recuperação

- O arquivo dump sem criptografia existe somente no tmpfs `/tmp` do container e é apagado ao fim da execução. O limite do tmpfs é 1 GiB; um dump maior falhará sem substituir nem excluir o último backup válido.
- O volume `backup_status` contém apenas datas, estado e códigos de erro; os dados do Postgres ficam no volume do próprio banco.
- Preserve uma cópia da senha e do salt do remote `crypt` fora do Google Drive. Perder esses valores impede descriptografar todos os dumps existentes, mesmo que o arquivo `rclone.conf` continue disponível.
- O arquivo cifrado pode ser baixado e descriptografado apenas usando o remote `conta-clara-crypt` com a mesma senha e salt. Para validar uma restauração em banco separado ou recuperar a instalação em outra máquina, siga [Restauração de backups](backup-restore.md).
- A rede e o computador precisam estar disponíveis para enviar o backup. Ao voltar, o serviço cobre o estado atual do banco com um backup pendente; não recupera snapshots históricos dos períodos em que ficou desligado.

Consulte a documentação oficial do rclone sobre [criptografia client-side](https://rclone.org/crypt/), [Google Drive](https://rclone.org/drive/) e [verificação de remotes crypt](https://rclone.org/commands/rclone_cryptcheck/).
