# Instalação do Conta Clara

Este guia instala o Conta Clara na rede local da casa. A aplicação não exige uma conta hospedada; o computador que executa Docker mantém a API e o PostgreSQL, e os demais aparelhos acessam pelo HTTPS local.

## Requisitos

- Docker Engine e Docker Compose v2 no computador servidor.
- Uma instância PostgreSQL acessível numa rede Docker user-defined, existente ou dedicada ao projeto.
- Navegador atualizado nos aparelhos da família e acesso à mesma rede local.
- Para backups no Google Drive, uma conta autorizada no rclone e as credenciais de recuperação do remoto criptografado guardadas num gerenciador de senhas.

## Primeira instalação

Clone o repositório e crie a configuração privada a partir do exemplo:

```sh
git clone https://github.com/csescobar/conta-clara.git
cd conta-clara
cp deploy/compose.env.example .env
chmod 600 .env
```

Edite `.env` para informar a rede e as URLs do Postgres, o IP reservado do computador servidor, a porta HTTPS e as opções de backup. Use uma base exclusiva do Conta Clara e os papéis descritos em [database.md](database.md); não use a base de testes ou o superusuário `postgres`. `.env` é privado e ignorado pelo Git. O [guia de Docker e HTTPS local](docker-local-https.md) descreve como integrar um container Postgres existente ou criar um dedicado, configurar a CA do Caddy e confiar o certificado no computador e no celular.

Valide a configuração, compile a imagem e aplique as migrações antes de iniciar os serviços:

```sh
docker compose config --quiet
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d
docker compose ps
```

Abra `https://<IP-ou-nome-local>:8443` no computador servidor. Na primeira tela, crie o acesso de administrador com um e-mail e uma senha próprios. Em **Configurações > Convidar pessoa**, gere um link de uso único e entregue-o diretamente à outra pessoa; a aplicação não envia convites por e-mail. Os dois acessos usam logins separados e compartilham as finanças do mesmo espaço.

Para adicionar a PWA no celular, conecte-o à mesma rede Wi-Fi, instale e confie a raiz pública do Caddy no aparelho e abra o endereço HTTPS. Cada dispositivo precisa confiar na CA local. O guia de [Docker e HTTPS local](docker-local-https.md) inclui os passos de Android, iPhone/iPad e Linux.

## Uso diário, atualização e recuperação

Em uso normal, `docker compose ps` confere os serviços e `docker compose logs --tail=100 app caddy` mostra os registros recentes. Para parar e iniciar novamente, use `docker compose down` e `docker compose up -d`; não use `--volumes`, pois a CA do HTTPS local precisa permanecer confiável nos aparelhos. O Postgres externo tem seu próprio container e volume.

Para atualizar, faça uma cópia de segurança válida antes de alterar a instalação, atualize o checkout e aplique a versão nova nesta ordem:

```sh
git pull --ff-only
docker compose config --quiet
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d --force-recreate
docker compose ps
```

O Compose não remove nem recria o Postgres externo. Não apague volumes para atualizar. Configure o [backup criptografado no Google Drive](google-drive-backups.md) antes de depender da instalação e siga [backup e restauração](backup-restore.md) para testar a recuperação numa base descartável. A cópia no Drive depende das duas credenciais do remoto `crypt`; mantenha a senha e o salt fora do repositório e disponíveis num gerenciador de senhas.

## Limites operacionais

- O acesso é local à rede configurada. Não encaminhe portas no roteador nem publique o serviço na internet.
- O Postgres é a fonte de verdade. A planilha é importada uma vez com prévia; não existe sincronização contínua com Google Sheets.
- Convites e redefinições de senha são links manuais de uso único; não há envio de e-mail.
- Sem rede, só ficam disponíveis os meses, páginas, categorias e formas de pagamento já carregados naquele perfil de navegador. A identidade offline vence após sete dias sem verificação no servidor; o navegador pode remover os dados locais.
- O IndexedDB não é criptografado pela aplicação. O acesso offline requer um aparelho e perfil de navegador confiáveis; a confirmação de pagamentos fica desabilitada offline.
- Ao reconectar, a fila sincroniza ao abrir, ao focar a aplicação ou pela ação **Sincronizar agora**. Não há Background Sync; conflitos precisam ser revisados manualmente. Consulte [armazenamento offline](offline-storage.md) e [sincronização](synchronization.md).
- Os testes usam registros fictícios e uma base descartável terminada em `_test`; os testes do navegador também exigem Chromium instalado. A suite de restauração sintética requer Docker.

## Desenvolvimento e contribuição

Para executar sem Compose durante o desenvolvimento, consulte os comandos e requisitos em [README.md](../README.md). Leia [CONTRIBUTING.md](../CONTRIBUTING.md), use dados fictícios e execute `npm run verify` antes de publicar uma alteração. Nunca inclua `.env`, credenciais de Drive, arquivos financeiros, dumps, backups ou chaves de recuperação em commits.
