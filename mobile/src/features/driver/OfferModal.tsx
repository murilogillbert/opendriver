import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { AppText, Badge, Icon, Row } from '@/components/ui/primitives';
import { formatCurrency, formatDistance, formatDuration } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

function useSecondsLeft(expiresAt: string): number {
  const end = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [end]);
  return left;
}

/**
 * Nova corrida (RF05): tudo para decidir em segundos — quanto ganha, quão
 * longe está o passageiro e para onde vai. Aceitar é 1 toque (UX06).
 */
export function OfferModal({
  offer,
  onAccept,
  onDecline,
  onExpire,
  accepting,
}: {
  offer: Offer;
  onAccept: () => void;
  onDecline: () => void;
  onExpire: () => void;
  accepting: boolean;
}) {
  const insets = useSafeAreaInsets();
  const left = useSecondsLeft(offer.expiresAt);
  const [total] = useState(() => Math.max(1, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
  const expired = useRef(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    Vibration.vibrate([0, 400, 200, 400]);
    return () => Vibration.cancel();
  }, [offer.offerId]);

  useEffect(() => {
    if (left <= 0 && !expired.current && !accepting) {
      expired.current = true;
      onExpire();
    }
  }, [left, accepting, onExpire]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.progressTrack} accessibilityLabel={`${left} segundos para responder`}>
            <View style={[styles.progress, { width: `${Math.min(100, (left / total) * 100)}%` }]} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="subtitle">Nova corrida</AppText>
            <Badge label={`${left}s`} tone={left <= 5 ? 'danger' : 'info'} icon="time-outline" />
          </Row>
          <AppText variant="title" style={{ fontSize: 34 }} accessibilityLabel={`Você recebe ${formatCurrency(offer.driverEarning)}`}>
            {formatCurrency(offer.driverEarning)}
          </AppText>
          <Row gap={spacing.sm}>
            <Badge label={offer.category === 'Comfort' ? 'Conforto' : 'Econômico'} />
            <Badge label={offer.paymentMethodType === 'Pix' ? 'Pix' : 'Cartão'} tone="neutral" icon={offer.paymentMethodType === 'Pix' ? 'qr-code-outline' : 'card-outline'} />
          </Row>
          <View style={styles.leg}>
            <Icon name="radio-button-on" size={16} color={colors.navy} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">
                {formatDuration(offer.pickupEtaS)} até o passageiro · {formatDistance(offer.pickupDistanceM)}
              </AppText>
              <AppText variant="small" numberOfLines={2}>
                {offer.origin.address}
              </AppText>
            </View>
          </View>
          <View style={styles.leg}>
            <Icon name="square" size={14} color={colors.limeDark} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">
                Viagem de {formatDuration(offer.durationS)} · {formatDistance(offer.distanceM)}
              </AppText>
              <AppText variant="small" numberOfLines={2}>
                {offer.destination.address}
              </AppText>
            </View>
          </View>
          <Row gap={spacing.md}>
            <Button title="Recusar" variant="outline" size="lg" style={{ flex: 1 }} onPress={onDecline} disabled={accepting} />
            <Button title="Aceitar" size="lg" style={{ flex: 2 }} loading={accepting} disabled={left <= 0} onPress={onAccept} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.lg,
    gap: spacing.md,
  },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progress: { height: 6, backgroundColor: colors.lime },
  leg: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
});
