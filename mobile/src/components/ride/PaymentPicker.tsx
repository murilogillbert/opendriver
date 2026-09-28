import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { PaymentMethod } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { AppText, Icon } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

export const methodIcon = (m: Pick<PaymentMethod, 'type'>) => (m.type === 'Pix' ? 'qr-code-outline' : 'card-outline');

/** Escolha da forma de pagamento para ESTA corrida (não muda o padrão). */
export function PaymentPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId: string | null;
  onSelect: (m: PaymentMethod) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: qk.payments, queryFn: () => api.payments.list(), enabled: visible });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AppText variant="subtitle">Pagar com</AppText>
        {(q.data?.methods ?? []).map((m) => (
          <ListRow
            key={m.id}
            icon={methodIcon(m)}
            title={m.label}
            subtitle={m.type === 'Pix' ? 'Pague pelo app do seu banco ao final' : m.expiry ? `Validade ${m.expiry}` : undefined}
            chevron={false}
            right={m.id === selectedId ? <Icon name="checkmark-circle" size={22} color={colors.limeDark} /> : null}
            onPress={() => {
              onSelect(m);
              onClose();
            }}
          />
        ))}
        <ListRow
          icon="add-circle-outline"
          title="Adicionar cartão"
          onPress={() => {
            onClose();
            router.push('/payments/add-card');
          }}
        />
        <Button title="Voltar" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
