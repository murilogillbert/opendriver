# Open Driver

Projeto full-stack do modulo Bot + Parceiros + Indicacoes + Comissoes.

## Estrutura

```text
apps/web          React/Vite com landing e painel /admin
apps/api          API Node.js/TypeScript
packages/shared   Tipos e constantes compartilhadas
sql/migrations    Schema SQL Server versionado
```

## Desenvolvimento local

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev:api
npm run dev:web
```

API:

```text
http://localhost:3001
```

Web:

```text
http://localhost:5173
http://localhost:5173/admin
```

## Build

```bash
npm run build
```

## Deploy

O deploy de producao fica em `opendriver-prod`:

```bash
cd /root/opendriver-prod && bash update.sh
```

Esse comando sobe SQL Server, API, Web, Nginx e executa migrations.
