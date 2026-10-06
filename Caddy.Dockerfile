FROM caddy:2.11.6-alpine

# HTTPS uses an unprivileged configurable port, so the bind capability is unnecessary.
RUN setcap -r /usr/bin/caddy
