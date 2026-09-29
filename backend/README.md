# OpenDriver API

API do app de corridas (passageiro e motorista). Node 22 + Express 5 + Prisma 6 +
Socket.IO. Usa **o mesmo Postgres do OpenDriverHub**: as tabelas do hub
(schema `public`) nunca são alteradas; tudo do OpenDriver fica no schema
`opendriver`. Login é o mesmo do hub (mesmo `JWT_SECRET`).

Arquitetura e decisões: [`../docs/arquitetura.md`](../docs/arquitetura.md).

## Rodar localmente

Pré-requisito: um Postgres com as migrations do hub aplicadas (clone
`murilogillbert/hub` e rode `npx prisma migrate deploy` em `hub/backend`).

```bash
cp .env.example .env          # ajuste DATABASE_URL (com ?schema=opendriver) e JWT_SECRET
npm ci
psql "postgresql://…/hub" -f prisma/bootstrap/001_migrations_table.sql   # só na 1ª vez
npx prisma migrate deploy
npm run dev                   # http://localhost:5100  (Socket.IO em /realtime)
```

Para desenvolvimento use `PAYMENT_PROVIDER=mock` e `STORAGE_DRIVER=local`.

## Testes

```bash
npm run typecheck
npm test          # integração contra o Postgres local (ver tests/setup.ts)
```

Os testes cobrem autenticação compartilhada com o hub (RF11), cadastro e
aprovação de motorista, corrida ponta a ponta com oferta por socket,
pagamento (cartão, Pix, cashback do hub, falhas e nova tentativa sem
cobrança dupla), cancelamento com taxa, segurança, gravação, saques e
administração. O app mobile tem um E2E próprio contra esta API
(`mobile/tests/e2e`), executado no CI.

## Deploy (Coolify, junto do hub)

> Alternativa em AWS (EC2 + ECR + Caddy, via Terraform): veja [`infra/README.md`](../infra/README.md).

1. **Banco** — o mesmo Postgres do hub. Uma única vez, antes da primeira
   migration (o Prisma exige a tabela de histórico no schema próprio):
   ```bash
   psql "$HUB_DATABASE_URL" -f prisma/bootstrap/001_migrations_table.sql
   ```
2. **App no Coolify** — Build pack Dockerfile, contexto `backend/`,
   Dockerfile `backend/Dockerfile`, porta 5100, domínio
   `api-app.opendriver.com.br` (HTTPS). O Socket.IO usa WebSocket no mesmo
   domínio (caminho `/realtime`) — o proxy precisa permitir upgrade.
3. **Migrations** — como *pre-deploy command* (ou manualmente a cada release):
   `npx prisma migrate deploy`. Nunca rode `prisma migrate dev` ou
   `prisma db push` contra o banco compartilhado: o Prisma tentaria apagar as
   tabelas do hub.
4. **Variáveis** — veja [`.env.example`](.env.example). Obrigatórias em produção
   (a API recusa subir sem elas):
   - `DATABASE_URL` com `?schema=opendriver`;
   - `JWT_SECRET` **idêntico ao do hub** (32+ caracteres);
   - `DATA_ENCRYPTION_KEY` = `openssl rand -base64 32` (guarde fora do servidor;
     trocar invalida cartões salvos e gravações);
   - `PUBLIC_BASE_URL` https (links de acompanhamento `/t/...`);
   - `PAYMENT_PROVIDER=asaas`;
   - `MINIO_*` com **bucket privado próprio** (`opendriver-private`), sem acesso
     público — documentos e gravações ficam cifrados lá;
   - `OSRM_URL` e `NOMINATIM_URL` apontando para instâncias próprias (os
     servidores públicos do OpenStreetMap não permitem uso comercial);
   - `CORS_ORIGINS` com o domínio do painel web do hub (telas de admin).
5. **Asaas** — a conta é a mesma do hub (credenciais em Admin → Integrações do
   hub). Cadastre no Asaas um **segundo webhook** apontando para
   `https://api-app.opendriver.com.br/api/v1/payments/webhook/asaas` com o
   mesmo token (`Asaas__WebhookToken`). Cobranças que não são de corridas são
   ignoradas; o status é sempre confirmado consultando o Asaas.
6. **Painel do hub** — no build do front do hub defina
   `VITE_OPENDRIVER_API_URL=https://api-app.opendriver.com.br` para as telas
   Admin → OpenDriver.
7. **Push** — o envio usa o Expo Push Service; nada a configurar aqui além do
   app publicado com `EAS_PROJECT_ID`.

Jobs internos (rodam no próprio processo): varredura de ofertas expiradas,
reconciliação de pagamentos pendentes, motorista online sem sinal há 15 min → offline, e expurgo de gravações após
`RECORDING_RETENTION_DAYS` (30). Rode **uma** réplica, ou mova os jobs para
um worker único antes de escalar horizontalmente (o Socket.IO também
precisaria de adapter Redis).

## Endpoints principais (`/api/v1`)

| Área | Rotas |
| --- | --- |
| Auth (mesma conta do hub) | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/forgot-password`; `GET /me`; `PUT /me/profile`, `/me/password`; `POST /me/delete` |
| Passageiro | `POST /rides/quote`, `POST /rides`, `GET /rides/active`, `GET /rides`, `GET /rides/:id`, `POST /rides/:id/{cancel,pay,rating,share}` |
| Motorista | `POST /driver/become`, `GET/PUT /driver/profile`, `POST /driver/documents/:kind`, `POST /driver/vehicles`, `PUT /driver/pix`, `POST /driver/{online,offline,location}`, `GET /driver/offers/current`, `POST /driver/offers/:id/{accept,decline}`, `POST /rides/:id/{arrived,start,finish}`, ganhos e saques |
| Pagamento | `GET /payment-methods`, `POST /payment-methods/card`, `PUT /payment-methods/:id/default`, `PUT /payment-methods/preferences` |
| Segurança | contatos de confiança, `POST /rides/:id/emergency`, `POST /safety/incidents`, gravação (`/me/recording`, `POST /rides/:id/recordings`), acompanhamento público `GET /t/:token` |
| Admin (papel Admin do hub) | `/admin/metrics`, `/admin/drivers`, `/admin/vehicles`, `/admin/rides`, `/admin/payouts`, `/admin/pricing`, `/admin/incidents`, `/admin/recordings/:id` |

Tempo real (Socket.IO, `path: /realtime`, `auth: { token }`): `ride:update`,
`ride:offer`, `ride:offer_closed`, `driver:location`; o motorista envia
`driver:location` com ack.
