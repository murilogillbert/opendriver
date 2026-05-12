import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useTheme } from "../../lib/useTheme";

export type PartnerMapLocation = {
  id: number;
  partner_nome: string;
  nome: string;
  endereco: string | null;
  latitude: number | string;
  longitude: number | string;
  checkin_token: string | null;
  distance_km?: number | null;
};

type PartnerMapProps = {
  locations: PartnerMapLocation[];
  userPosition?: { lat: number; lng: number } | null;
  onSelect?: (location: PartnerMapLocation) => void;
  selectedId?: number | null;
};

// Custom marker built from a tiny SVG — keeps the Material-Symbols-ish pin while
// avoiding the default Leaflet PNG dance with bundler-aware URLs.
const PIN_ICON_HTML = (active: boolean) => {
  const bg = active ? "#d6b25e" : "#11161f";
  const ring = active ? "#f4df9a" : "#ffffff";
  return `
  <div style="position:relative;display:flex;height:36px;width:36px;align-items:center;justify-content:center;">
    <div style="position:absolute;inset:0;border-radius:9999px;background:${bg};border:2px solid ${ring};box-shadow:0 4px 10px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.4);transform:translateY(-3px);"></div>
    <span style="position:relative;color:#fff;font-family:'Material Symbols Outlined';font-size:18px;line-height:1;font-variation-settings:'FILL' 1,'wght' 600;">storefront</span>
  </div>`;
};

function makeMarker(active: boolean) {
  return L.divIcon({
    className: "partner-map-marker",
    html: PIN_ICON_HTML(active),
    iconSize: [36, 36],
    iconAnchor: [18, 32],
    popupAnchor: [0, -28]
  });
}

const USER_ICON_HTML = `
  <span style="display:flex;height:16px;width:16px;align-items:center;justify-content:center;border-radius:9999px;background:#2563eb;box-shadow:0 0 0 5px rgba(37,99,235,.25);">
    <span style="height:6px;width:6px;border-radius:9999px;background:#fff;"></span>
  </span>
`;

const USER_ICON = L.divIcon({
  className: "partner-user-marker",
  html: USER_ICON_HTML,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Tile providers — Carto's free tiles look great in dark + light, are dense enough
// to feel like a real navigation map, and respect attribution requirements.
const LIGHT_TILES = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
};
const DARK_TILES = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: LIGHT_TILES.attribution
};

export function PartnerMap({ locations, userPosition, onSelect, selectedId }: PartnerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const { mode } = useTheme();

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      worldCopyJump: true
    });
    map.setView([-15.78, -47.93], 4); // Brazil centroid as fallback
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      userMarkerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Swap tile layer when theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const cfg = mode === "dark" ? DARK_TILES : LIGHT_TILES;
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);
  }, [mode]);

  // Render markers + fit bounds when the location list changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const latLngs: L.LatLngExpression[] = [];

    locations.forEach((loc) => {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.marker([lat, lng], { icon: makeMarker(selectedId === loc.id) });
      const popupHtml = `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:160px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5f5747;font-weight:700;">${escapeHtml(loc.partner_nome)}</div>
          <div style="margin-top:2px;font-weight:700;color:#15110a;">${escapeHtml(loc.nome)}</div>
          ${loc.endereco ? `<div style="margin-top:4px;font-size:12px;color:#5f5747;">${escapeHtml(loc.endereco)}</div>` : ""}
          ${
            typeof loc.distance_km === "number"
              ? `<div style="margin-top:4px;font-size:11px;font-weight:700;color:#a17820;">${loc.distance_km < 1 ? `${Math.round(loc.distance_km * 1000)} m` : `${loc.distance_km.toFixed(1)} km`}</div>`
              : ""
          }
        </div>
      `;
      marker.bindPopup(popupHtml, { closeButton: false });
      marker.on("click", () => onSelect?.(loc));
      marker.addTo(layer);
      latLngs.push([lat, lng]);
    });

    if (userPosition) {
      const userMarker = L.marker([userPosition.lat, userPosition.lng], { icon: USER_ICON, interactive: false });
      userMarker.addTo(layer);
      latLngs.push([userPosition.lat, userPosition.lng]);
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0] as L.LatLngTuple, 14);
    } else if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 15 });
    }
  }, [locations, userPosition, selectedId, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export default PartnerMap;
