import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Platform, Share, StyleSheet, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { env } from '@/config/env';
import { colors, radius, spacing } from '@/theme/tokens';
import { useToast } from './Toast';
import { Button } from './ui/Button';
import { AppText, Card, Icon, Row } from './ui/primitives';

/** Avatares: URLs absolutas; caminhos /uploads do hub são servidos pela origem do hub. */
export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads')) return `${env.hubOrigin}${url}`;
  return /^https?:\/\//.test(url) ? url : null;
}

/** Imagem remota com cache e fallback (URLs vazias/inválidas viram placeholder). */
export function RemoteImage({
  uri,
  style,
  accessibilityLabel,
  rounded = radius.md,
}: {
  uri?: string | null;
  style: ViewStyle | object;
  accessibilityLabel?: string;
  rounded?: number;
}) {
  const resolved = resolveImageUrl(uri);
  if (!resolved) {
    return (
      <View style={[style, styles.placeholder, { borderRadius: rounded }]} accessibilityLabel={accessibilityLabel}>
        <Icon name="image-outline" size={24} color={colors.textSoft} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: resolved }}
      style={[style, { borderRadius: rounded, backgroundColor: colors.surfaceAlt }]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
    />
  );
}

export function QrCodeView({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  return (
    <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel={label ?? 'QR code'}>
      <QRCode value={value} size={size} quietZone={12} backgroundColor={colors.white} color={colors.navy} ecl="M" />
    </View>
  );
}

/** Texto copiável + compartilhar (links de indicação, Pix copia-e-cola). */
export function CopyField({
  label,
  value,
  shareMessage,
  mono,
}: {
  label: string;
  value: string;
  shareMessage?: string;
  mono?: boolean;
}) {
  const toast = useToast();
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="body" selectable numberOfLines={4} style={mono ? styles.mono : undefined}>
        {value}
      </AppText>
      <Row>
        <Button
          title="Copiar"
          icon="copy-outline"
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(value);
            toast.success('Copiado!');
          }}
        />
        {shareMessage !== undefined ? (
          <Button
            title="Compartilhar"
            icon="share-social-outline"
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => Share.share({ message: shareMessage || value }).catch(() => undefined)}
          />
        ) : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  qr: {
    alignSelf: 'center',
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
});
