import { Camera, GeoJSONSource, Layer, Map, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { LatLng } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { AppText, Icon } from '@/components/ui/primitives';
import { env } from '@/config/env';
import { boundsOf, decodePolyline, isValidLatLng, toLngLat } from '@/lib/geo';
import { colors } from '@/theme/tokens';

interface RideMapProps {
  /** Centro quando não há rota a enquadrar (posição do usuário). */
  center?: LatLng | null;
  origin?: LatLng | null;
  destination?: LatLng | null;
  polyline?: string | null;
  driver?: (LatLng & { heading?: number | null }) | null;
  showUser?: boolean;
  /** Altura coberta pelo painel inferior — a rota fica visível acima dele. */
  bottomInset?: number;
  /** false = mapa estático (dentro de telas roláveis). */
  interactive?: boolean;
  style?: ViewStyle;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Mapa OSM (MapLibre) da corrida: origem, destino, rota e motorista. Só
 * informação — a ação dominante fica no painel inferior (princípio 1).
 */
export const RideMap = memo(function RideMap({
  center,
  origin,
  destination,
  polyline,
  driver,
  showUser = true,
  bottomInset = 0,
  interactive = true,
  style,
}: RideMapProps) {
  const route = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);
  // Sem mapa (sem internet, servidor de tiles fora): a corrida segue; só avisa e deixa tentar de novo.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const routeGeoJson = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(
    () =>
      route.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map(toLngLat) } }
        : null,
    [route],
  );

  // Arredonda para não reanimar a câmera por variações mínimas de GPS.
  const dLat = driver ? round(driver.lat) : null;
  const dLng = driver ? round(driver.lng) : null;
  const bounds = useMemo(() => {
    const pts: LatLng[] = [];
    if (dLat !== null && dLng !== null) pts.push({ lat: dLat, lng: dLng });
    if (isValidLatLng(origin)) pts.push(origin);
    if (isValidLatLng(destination)) pts.push(destination);
    if (!pts.length || (pts.length === 1 && !route.length)) return null;
    return boundsOf(route.length ? [...pts, ...route] : pts);
  }, [dLat, dLng, origin, destination, route]);

  const cLat = center ? round(center.lat) : null;
  const cLng = center ? round(center.lng) : null;
  const padding = useMemo(() => ({ top: 80, left: 48, right: 48, bottom: bottomInset + 40 }), [bottomInset]);

  const single = !bounds ? (isValidLatLng(origin) ? origin : cLat !== null && cLng !== null ? { lat: cLat, lng: cLng } : null) : null;

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Map
        key={attempt}
        onDidFailLoadingMap={() => setFailed(true)}
        onDidFinishLoadingMap={() => setFailed(false)}
        style={StyleSheet.absoluteFill}
        mapStyle={env.mapStyleUrl}
        logo={false}
        attribution
        compass={false}
        touchPitch={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        touchRotate={false}
        attributionPosition={{ bottom: bottomInset + 8, left: 8 }}
      >
        {bounds ? (
          <Camera bounds={bounds} padding={padding} duration={600} easing="ease" />
        ) : single ? (
          <Camera center={toLngLat(single)} zoom={15} padding={padding} duration={600} easing="ease" />
        ) : null}

        {showUser ? <UserLocation animated accuracy={false} /> : null}

        {routeGeoJson ? (
          <GeoJSONSource id="route" data={routeGeoJson}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.navy, 'line-width': 8, 'line-opacity': 0.25 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.blue, 'line-width': 5 }}
            />
          </GeoJSONSource>
        ) : null}

        {isValidLatLng(origin) ? (
          <Marker id="origin" lngLat={toLngLat(origin)} anchor="center">
            <View style={styles.originDot} accessibilityLabel="Embarque" />
          </Marker>
        ) : null}
        {isValidLatLng(destination) ? (
          <Marker id="destination" lngLat={toLngLat(destination)} anchor="center">
            <View style={styles.destSquare} accessibilityLabel="Destino" />
          </Marker>
        ) : null}
        {driver && isValidLatLng(driver) ? (
          <Marker id="driver" lngLat={toLngLat(driver)} anchor="center">
            <View style={styles.car} accessibilityLabel="Motorista">
              <Icon name="car-sport" size={18} color={colors.white} />
            </View>
          </Marker>
        ) : null}
      </Map>
      {failed ? (
        <View style={[styles.fallback, { paddingBottom: bottomInset }]} pointerEvents="box-none">
          <Icon name="map-outline" size={32} color={colors.textMuted} />
          <AppText variant="bodyStrong" center>
            Não foi possível carregar o mapa
          </AppText>
          <AppText variant="small" center>
            Sua corrida continua normalmente. Confira a internet e tente de novo.
          </AppText>
          <Button
            title="Tentar de novo"
            variant="outline"
            size="sm"
            icon="refresh-outline"
            onPress={() => {
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  originDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.navy,
    borderWidth: 4,
    borderColor: colors.white,
  },
  destSquare: {
    width: 18,
    height: 18,
    borderRadius: 3,
    backgroundColor: colors.lime,
    borderWidth: 4,
    borderColor: colors.navy,
  },
  car: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
});
