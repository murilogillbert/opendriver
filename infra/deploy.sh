#!/usr/bin/env bash
# Deploy da API OpenDriver na instância criada por infra/terraform.
# Rode da raiz do repositório, no seu PC (precisa de aws cli, docker, ssh, terraform).
#
#   ./infra/deploy.sh push      build da imagem + envio ao ECR
#   ./infra/deploy.sh migrate   bootstrap + prisma migrate deploy (schema "opendriver")
#   ./infra/deploy.sh up        puxa a imagem nova e reinicia a API
#   ./infra/deploy.sh status    containers e /health
#
# Migrations NÃO rodam sozinhas no "up": faça antes o backup do banco e o
# snapshot do schema public (pg_dump --schema-only) e compare depois.
set -euo pipefail

cd "$(dirname "$0")/.."
TF_DIR=infra/terraform
tfout() { terraform -chdir="$TF_DIR" output -raw "$1"; }

ECR_URL=$(tfout ecr_repository_url)
IP=$(tfout public_ip)
REGION=$(tfout aws_region)
DOMAIN=$(tfout domain)
TAG=${TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}
SSH=(ssh -o StrictHostKeyChecking=accept-new "ubuntu@$IP")
APP_DIR=/opt/opendriver

case "${1:-}" in
  push)
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
    docker build --platform linux/amd64 -t "$ECR_URL:$TAG" -t "$ECR_URL:latest" backend
    docker push "$ECR_URL:$TAG"
    docker push "$ECR_URL:latest"
    echo "Imagem enviada: $ECR_URL:$TAG"
    ;;
  migrate)
    read -r -p "Backup do banco e snapshot do schema public já feitos? [digite sim] " ok
    [ "$ok" = "sim" ] || { echo "Abortado."; exit 1; }
    "${SSH[@]}" "cd $APP_DIR && docker compose pull api && docker compose run --rm --no-deps api sh -c \
      'npx prisma db execute --schema prisma/schema.prisma --file prisma/bootstrap/001_migrations_table.sql && npx prisma migrate deploy'"
    ;;
  up)
    "${SSH[@]}" "cd $APP_DIR && test -s .env || { echo 'Preencha $APP_DIR/.env antes (modelo: backend/.env.example).'; exit 1; }; \
      docker compose pull && docker compose up -d && docker image prune -f"
    ;;
  status)
    "${SSH[@]}" "cd $APP_DIR && docker compose ps"
    curl -fsS "https://$DOMAIN/health" && echo
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
