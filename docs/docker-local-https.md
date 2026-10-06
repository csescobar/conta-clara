# Docker e HTTPS na rede local

O Compose adiciona somente dois serviços: a API/interface Conta Clara e o proxy Caddy. O PostgreSQL continua sendo o container já existente; nenhum banco, porta ou volume dele é criado ou removido pelo projeto. A rede do Postgres é declarada como externa. A API se conecta a ela sem publicar sua porta, enquanto Caddy e API se comunicam por uma rede privada deste Compose.

## Preparar a rede e as credenciais

Use um nome de rede Docker user-defined à qual o container PostgreSQL já esteja conectado. Confira com `docker network ls` e `docker inspect <nome-do-container-postgres>`. Se o banco estiver apenas na rede `bridge` padrão, crie uma rede user-defined e conecte também o container existente; isso preserva o container e não publica a porta do banco:

```sh
docker network create conta-clara-postgres
docker network connect conta-clara-postgres <nome-do-container-postgres>
```

Copie `deploy/compose.env.example` para `.env`. Configure `POSTGRES_NETWORK` com essa rede, e ajuste as duas URLs para o nome do serviço ou alias DNS do Postgres nessa rede, a base Conta Clara e os papéis próprios descritos em [docs/database.md](database.md). Senhas com caracteres reservados em uma URL precisam estar codificadas para URL. Não use a URL do banco de testes nem credenciais do usuário `postgres`.

Defina `LAN_HOST` como `localhost` para acessar só no computador. Para acessar pelo celular, prefira reservar um IP estável no roteador para o computador que hospeda a aplicação e informe esse IP tanto em `LAN_HOST` quanto em `LAN_BIND_ADDRESS`. O bind padrão `127.0.0.1` limita o serviço ao próprio computador. `HTTPS_PORT` vale `8443` por padrão para evitar conflito com serviços que já usam 443; mantenha-o acima de 1023, pois a imagem Caddy remove a capacidade de bind privilegiado.

Confira a configuração e faça a primeira inicialização:

```sh
docker compose config --quiet
docker compose build
docker compose --profile tools run --rm migrate
docker compose up -d
docker compose ps
```

O serviço `migrate` é uma tarefa separada: a URL privilegiada de migração não é passada ao container da aplicação. A API só recebe `DATABASE_URL`, usa o papel de runtime e escuta dentro do Docker. Caddy é o único serviço com porta publicada. O cookie de sessão é `Secure`, e o proxy não publica uma API administrativa.

## Acessar por HTTPS e instalar no celular

Abra `https://<LAN_HOST>:<HTTPS_PORT>`. Caddy cria a CA local e emite um certificado para o host configurado usando `tls internal`; veja a [documentação do emissor interno](https://caddyserver.com/docs/caddyfile/directives/tls). Como essa CA privada não é uma autoridade pública, o navegador mostra um aviso até que a raiz seja instalada e confiada no dispositivo.

Copie apenas o certificado raiz público do Caddy; a chave privada permanece no volume `caddy_data`:

```sh
mkdir -p local-certs
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt local-certs/caddy-root.crt
openssl x509 -in local-certs/caddy-root.crt -noout -sha256 -fingerprint
```

Confirme a impressão digital por um canal confiável antes de instalar a raiz. Não copie `/data/caddy/pki/authorities/local/root.key`, não compartilhe o volume `caddy_data` e não versione `.env` ou arquivos em `local-certs/`.

- **Android:** transfira o `caddy-root.crt` ao aparelho e use as configurações de segurança para instalar um certificado CA. O caminho pode variar por fabricante e versão; consulte [Adicionar e remover certificados no Pixel](https://support.google.com/pixelphone/answer/2844832/add-amp-remove-certificates). Conecte o aparelho ao mesmo Wi-Fi, abra o endereço HTTPS e instale a PWA pelo navegador.
- **iPhone/iPad:** transfira e instale o certificado como perfil. Depois, abra **Ajustes > Geral > Sobre > Ajustes de confiança do certificado** e habilite confiança total para a raiz Conta Clara. Um certificado instalado manualmente não passa a ser confiável para TLS automaticamente; veja as [instruções da Apple](https://support.apple.com/pt-br/102390). Conecte ao mesmo Wi-Fi, abra o endereço HTTPS no Safari e use **Adicionar à Tela de Início**.
- **Computador Linux:** importe a raiz no armazenamento de certificados do sistema e atualize o trust store da distribuição. Em Debian/Ubuntu, por exemplo: `sudo cp local-certs/caddy-root.crt /usr/local/share/ca-certificates/conta-clara.crt && sudo update-ca-certificates`.

Para verificar HTTPS no computador do servidor, com o certificado instalado no sistema:

```sh
curl --cacert local-certs/caddy-root.crt --resolve "${LAN_HOST}:${HTTPS_PORT}:127.0.0.1" "https://${LAN_HOST}:${HTTPS_PORT}/api/health"
```

Uma resposta JSON com `"status":"ok"` confirma o proxy, o certificado para o nome configurado e a API. A verificação física no celular deve ser feita na mesma rede Wi-Fi, depois de instalar a raiz; o teste `curl` local não substitui esse passo.

## Persistência, reinício e rede

Os volumes `caddy_data` e `caddy_config` preservam a CA, a chave privada e a configuração gerada pelo Caddy entre reinícios, conforme a orientação da [imagem oficial do Caddy](https://hub.docker.com/_/caddy). O Postgres mantém a persistência dele próprio. A aplicação é stateless e não guarda lançamentos em volume de arquivos.

```sh
docker compose restart
docker compose logs --tail=100 app caddy
docker compose down
```

`docker compose down` para somente os serviços desta pasta e preserva os dois volumes nomeados e o container PostgreSQL externo. Não use `docker compose down --volumes` para uma parada comum: isso apaga a CA local e exige que os dispositivos confiem numa nova raiz. Não há publicação em domínio público nem regra de encaminhamento de portas no roteador. Não configure port forwarding para `HTTPS_PORT`; mantenha o acesso restrito à rede local e às regras de firewall do computador.

O Compose define health checks para a API e para a validade do Caddyfile; Caddy só inicia depois que `/api/health` responde. O bind padrão é loopback. Para acesso pelo celular, publicar no IP da interface LAN deixa o endereço disponível nessa rede; não há regra de encaminhamento no roteador e a aplicação não altera firewall, roteador ou outros projetos Compose. Só a porta HTTPS do Caddy é publicada; a porta da API e a do banco permanecem internas.

## Verificações e limites

O Dockerfile usa build multi-stage: instala dependências, gera `dist/client` e copia para a imagem final apenas o runtime, migrations, servidor e build web. `.dockerignore` impede que credenciais, dependências e dados locais entrem no contexto de build. `compose.yaml` não define nem administra Postgres.

No ambiente de desenvolvimento, `docker compose config --quiet`, o build multi-stage, a tarefa `migrate` (oito migrações), health checks da API/Caddy, `/api/health` e `/api/auth/state` passaram com um Postgres descartável na rede externa. Depois de reiniciar os containers, a raiz exportada permaneceu idêntica e `/api/health` respondeu por HTTPS com essa raiz. A porta da API não foi publicada no host. Instalação e uso em dispositivo físico dependem de transferir e confiar a raiz em cada aparelho; precisam ser conferidos no celular da casa antes de encerrar a issue. Sem configurar essa confiança, o HTTPS existe, mas o navegador continua mostrando certificado não confiável e pode bloquear os recursos de instalação/offline da PWA.
