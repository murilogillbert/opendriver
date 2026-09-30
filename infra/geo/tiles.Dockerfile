# Serve os tiles (PMTiles + fontes/sprites estáticos) via Coolify.
# Dados (tiles/) vêm de um volume persistente, preparados por geo-prepare.sh.
FROM ghcr.io/protomaps/go-pmtiles:v1.31.2
CMD ["serve", "/data", "--port", "8080", "--public-url", "https://tiles.opendriver.com.br"]
