import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { AppText, Icon, Row } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

/** Motorista (com carro e placa em destaque) ou passageiro: só o necessário para reconhecer. */
export function PersonCard({
  name,
  avatarUrl,
  rating,
  vehicle,
}: {
  name: string;
  avatarUrl: string | null;
  rating: number | null;
  vehicle?: { plate: string; brand: string; model: string; color: string } | null;
}) {
  return (
    <Row gap={spacing.md}>
      <Avatar nome={name} uri={avatarUrl} size={56} accessibilityLabel={`Foto de ${name}`} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={6}>
          <AppText variant="bodyStrong">{name}</AppText>
          {rating ? (
            <Row gap={2}>
              <Icon name="star" size={14} color={colors.warning} />
              <AppText variant="small">{rating.toFixed(1).replace('.', ',')}</AppText>
            </Row>
          ) : null}
        </Row>
        {vehicle ? (
          <AppText variant="small">
            {vehicle.brand} {vehicle.model} · {vehicle.color}
          </AppText>
        ) : null}
      </View>
      {vehicle ? (
        <View style={styles.plate} accessible accessibilityLabel={`Placa ${vehicle.plate.split('').join(' ')}`}>
          <AppText variant="bodyStrong" style={styles.plateText}>
            {vehicle.plate}
          </AppText>
        </View>
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56 },
  plate: {
    borderWidth: 2,
    borderColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.white,
  },
  plateText: { letterSpacing: 1.5, fontSize: 17, color: colors.navy },
});
