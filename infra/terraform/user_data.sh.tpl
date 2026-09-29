#!/bin/bash
# Primeiro boot (cloud-init): Docker + Caddy (HTTPS automático) + pasta da aplicação.
# Não sobe a API: falta o .env (segredos) e a imagem. Ver infra/deploy.sh.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io docker-compose-v2 amazon-ecr-credential-helper unattended-upgrades
systemctl enable --now docker
usermod -aG docker ubuntu

# Login no ECR via credential helper + role da instância (sem chaves no disco).
install -d -o ubuntu -g ubuntu /home/ubuntu/.docker
echo '{"credsStore":"ecr-login"}' > /home/ubuntu/.docker/config.json
chown ubuntu:ubuntu /home/ubuntu/.docker/config.json

%{ for key in extra_keys ~}
echo '${key}' >> /home/ubuntu/.ssh/authorized_keys
%{ endfor ~}

install -d -o ubuntu -g ubuntu -m 750 /opt/opendriver
cd /opt/opendriver

# Segredos: preencher à mão (ssh) — nunca no Terraform/git. Modelo: backend/.env.example
touch .env
chown ubuntu:ubuntu .env
chmod 600 .env

cat > Caddyfile <<'CADDY'
{
	email ${acme_email}
}

${domain} {
	encode gzip
	# WebSocket (Socket.IO em /realtime) passa direto pelo reverse_proxy.
	reverse_proxy api:5100
}
CADDY

cat > docker-compose.yml <<'COMPOSE'
services:
  api:
    image: ${image}
    restart: unless-stopped
    env_file: .env
    expose:
      - "5100"
  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
COMPOSE
chown ubuntu:ubuntu Caddyfile docker-compose.yml

touch /opt/opendriver/.bootstrap-done
