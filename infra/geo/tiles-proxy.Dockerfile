# Serve estáticos (style.json, fontes, sprites) e repassa tiles/tilejson
# pro serviço go-pmtiles interno (pmtiles-internal:8080). Substitui o papel
# do Caddy no design original (infra/geo/Caddyfile.geo), adaptado pra Coolify.
FROM nginx:1.27-alpine
COPY infra/geo/tiles-proxy.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
