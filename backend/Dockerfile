# OpenDriver API — build multi-stage (contexto de build = pasta backend/).
FROM node:22-alpine AS build
WORKDIR /src
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
COPY --from=build /src/package*.json ./
COPY --from=build /src/prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npx prisma generate
COPY --from=build /src/dist ./dist
USER app
EXPOSE 5100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:5100/health || exit 1
# Migrations: rodar `npx prisma migrate deploy` como passo de deploy (ver backend/README.md).
CMD ["node", "dist/server.js"]
