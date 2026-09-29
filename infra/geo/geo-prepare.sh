#!/usr/bin/env bash
# Roda NA INSTÂNCIA (via ./infra/deploy.sh geo-setup). Prepara: swap, senha interna
# do Nominatim, dados do OSRM, tiles (PMTiles + fontes + estilo) e o Caddyfile.geo.
# A importação do Nominatim acontece sozinha no primeiro `up` (1–3 h).
# Variáveis exigidas: API_DOMAIN, TILES_DOMAIN, ACME_EMAIL (o deploy.sh as passa).
set -euo pipefail
: "${API_DOMAIN:?}" "${TILES_DOMAIN:?}" "${ACME_EMAIL:?}"
cd /opt/opendriver
PBF_URL=https://download.geofabrik.de/south-america/brazil/centro-oeste-latest.osm.pbf
OSRM_IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
PMTILES_IMG=ghcr.io/protomaps/go-pmtiles:v1.31.2
# MT, MS, GO e DF (com uma folga nas bordas). Zoom máx. 14: o app dá overzoom acima.
BBOX="${TILES_BBOX:--61.7,-24.2,-45.8,-7.2}"
MAXZOOM="${TILES_MAXZOOM:-14}"

# Rede de segurança contra falta de memória (importação/extração).
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Senha interna do Nominatim (só a rede do Docker enxerga o banco).
[ -f geo.env ] || (umask 077; echo "NOMINATIM_PASSWORD=$(openssl rand -hex 16)" > geo.env)

# URL pública dos tiles no compose (TileJSON aponta para ela).
sed -i "s#__TILES_DOMAIN__#$TILES_DOMAIN#g" docker-compose.geo.yml

# --- OSRM: extract → partition → customize (MLD). Antes do Nominatim, para não disputar memória.
mkdir -p osrm
if [ ! -f osrm/centro-oeste-latest.osrm.mldgr ]; then
  curl -fL -o osrm/centro-oeste-latest.osm.pbf "$PBF_URL"
  for step in "osrm-extract -p /opt/car.lua /data/centro-oeste-latest.osm.pbf" \
              "osrm-partition /data/centro-oeste-latest.osrm" \
              "osrm-customize /data/centro-oeste-latest.osrm"; do
    docker run --rm -v "$PWD/osrm:/data" "$OSRM_IMG" $step
  done
  rm -f osrm/centro-oeste-latest.osm.pbf
fi

# --- Tiles: recorte do mapa-múndi Protomaps (só baixa o necessário, por HTTP range).
mkdir -p tiles
if [ ! -f tiles/centro-oeste.pmtiles ]; then
  BUILD=$(curl -fsS https://build-metadata.protomaps.dev/builds.json | python3 -c 'import sys,json; print(max(b["key"] for b in json.load(sys.stdin)))')
  docker run --rm -v "$PWD/tiles:/data" "$PMTILES_IMG" extract "https://build.protomaps.com/$BUILD" /data/centro-oeste.pmtiles --bbox="$BBOX" --maxzoom="$MAXZOOM"
fi
# Fontes (glifos) e sprites do estilo, servidos por nós (sem depender de CDN de terceiros).
if [ ! -f "tiles/fonts/Noto Sans Regular/0-255.pbf" ]; then
  curl -fL https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.tar.gz \
    | tar -xz -C tiles --strip-components=1 --wildcards \
        '*/fonts/Noto Sans Regular/*' '*/fonts/Noto Sans Medium/*' '*/fonts/Noto Sans Italic/*' '*/sprites/v4/light*'
  test -f "tiles/fonts/Noto Sans Regular/0-255.pbf" || { echo "Fontes não encontradas após extrair basemaps-assets"; exit 1; }
fi
sed "s#__TILES_ORIGIN__#https://$TILES_DOMAIN#g" tiles-style.template.json > tiles/style.json

# --- Caddy: API + tiles (estilo/fontes/sprites estáticos; tiles via go-pmtiles).
cat > Caddyfile.geo <<CADDY
{
	email $ACME_EMAIL
}

$API_DOMAIN {
	encode gzip
	# WebSocket (Socket.IO em /realtime) passa direto pelo reverse_proxy.
	reverse_proxy api:5100
}

$TILES_DOMAIN {
	header Access-Control-Allow-Origin *
	header Cache-Control "public, max-age=3600"
	@static path /style.json /fonts/* /sprites/*
	handle @static {
		encode zstd gzip
		root * /srv/tiles
		file_server
	}
	handle {
		reverse_proxy tiles:8080
	}
}
CADDY

echo "Pronto. Confira o DNS de $API_DOMAIN e $TILES_DOMAIN e rode: ./infra/deploy.sh up"
echo "O Nominatim importa no primeiro start (1–3 h): docker compose logs -f nominatim"
