import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { errorMessage } from '@/api/errors';
import type { Ride } from '@/api/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { TextField } from '@/components/ui/TextField';
import { AppText, Icon } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Motivo obrigatório pra cancelar (plano §1.2): a lista certa (passageiro ×
 * motorista) vem da API — o app nunca hard-coda. Depois de escolher, ainda dá
 * pra voltar antes de confirmar.
 */
export function CancelReasonSheet({
  ride,
  visible,
  warning,
  onClose,
  onCancelled,
}: {
  ride: Ride;
  visible: boolean;
  /** Aviso sobre possível cobrança, no topo da folha (contexto já calculado por quem chama). */
  warning?: string;
  onClose: () => void;
  onCancelled: (res: { cancelled: boolean; cancellationFee?: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const reasons = useQuery({ queryKey: qk.cancelReasons(ride.role), queryFn: () => api.rides.cancelReasons(ride.role), enabled: visible });

  const reset = () => {
    setCode(null);
    setReason('');
  };

  const confirmCancel = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const res = await api.rides.cancel(ride.id, code, reason.trim() || undefined);
      reset();
      onCancelled(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível cancelar. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AppText variant="subtitle">Por que você quer cancelar?</AppText>
        {warning ? <AppText variant="small">{warning}</AppText> : null}
        {!code ? (
          (reasons.data ?? []).map((r) => <ListRow key={r.code} title={r.label} onPress={() => setCode(r.code)} />)
        ) : (
          <>
            <ListRow title={reasons.data?.find((r) => r.code === code)?.label ?? code} chevron={false} right={<Icon name="checkmark-circle" size={22} color={colors.limeDark} />} />
            {code === 'other' ? (
              <TextField label="Conte rapidamente o que houve (opcional)" value={reason} onChangeText={setReason} multiline maxLength={200} />
            ) : null}
            <Button title="Confirmar cancelamento" variant="danger" size="lg" loading={busy} onPress={confirmCancel} />
            <Button title="Escolher outro motivo" variant="ghost" onPress={() => setCode(null)} />
          </>
        )}
        <Button title="Voltar" variant="ghost" onPress={close} />
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
