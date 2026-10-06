FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
COPY --from=build --chown=node:node /app/dist/client ./dist/client
RUN mkdir -p /var/lib/conta-clara-backup && chown node:node /var/lib/conta-clara-backup

USER node
EXPOSE 3001
CMD ["npm", "start"]
