FROM rclone/rclone:1.75.1 AS rclone

FROM postgres:18-alpine

ENV TZ=America/Sao_Paulo
WORKDIR /opt/conta-clara-backup

RUN apk add --no-cache nodejs tzdata \
  && adduser -D -u 1000 backup \
  && mkdir -p /status \
  && chown backup:backup /status

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chown=backup:backup backup/runner.js ./runner.js

USER backup
ENTRYPOINT ["node", "/opt/conta-clara-backup/runner.js"]
