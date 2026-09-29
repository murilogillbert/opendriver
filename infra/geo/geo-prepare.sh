#!/usr/bin/env bash
# Roda NA INSTÂNCIA (via ./infra/deploy.sh geo-setup): swap, dados do OSRM e senha
# interna do Nominatim. A importação do Nominatim acontece sozinha no primeiro
# `up` (pode levar de 1 a 3 h; acompanhe com `docker compose logs -f nominatim`).
set -euo pipefail
cd /opt/opendriver
PBF_URL=https://download.geofabrik.de/south-america/brazil/centro-oeste-latest.osm.pbf
OSRM_IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1

# Rede de segurança contra falta de memória (importação/extração).
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Senha interna do Nominatim (só a rede do Docker enxerga o banco).
if [ ! -f geo.env ]; then
  (umask 077; echo "NOMINATIM_PASSWORD=$(openssl rand -hex 16)" > geo.env)
fi

# OSRM: extract → partition → customize (algoritmo MLD). Roda antes do Nominatim
# para os dois não disputarem memória.
mkdir -p osrm
if [ ! -f osrm/centro-oeste-latest.osrm.mldgr ]; then
  curl -fL -o osrm/centro-oeste-latest.osm.pbf "$PBF_URL"
  docker run --rm -v "$PWD/osrm:/data" "$OSRM_IMG" osrm-extract -p /opt/car.lua /data/centro-oeste-latest.osm.pbf
  docker run --rm -v "$PWD/osrm:/data" "$OSRM_IMG" osrm-partition /data/centro-oeste-latest.osrm
  docker run --rm -v "$PWD/osrm:/data" "$OSRM_IMG" osrm-customize /data/centro-oeste-latest.osrm
  rm -f osrm/centro-oeste-latest.osm.pbf
fi
echo "OSRM pronto. Agora: ./infra/deploy.sh up (o Nominatim importa no primeiro start)."
