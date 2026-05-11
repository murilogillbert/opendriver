FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN npm run build -w @opendriver/shared
RUN npm run build -w @opendriver/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads
# wget is needed by the HEALTHCHECK below; node:alpine ships it via busybox.
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /app/uploads \
 && chown -R node:node /app

# Drop privileges. The `node` user ships with the official image (uid 1000).
USER node

VOLUME ["/app/uploads"]
EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- --tries=1 http://127.0.0.1:3001/health || exit 1

CMD ["npm", "run", "start", "-w", "@opendriver/api"]
