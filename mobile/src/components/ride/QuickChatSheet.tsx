import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Ride } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { AppText, Row } from '@/components/ui/primitives';
import { alertError } from '@/lib/recovery';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Chat mascarado (plano §11.1): só mensagens rápidas predefinidas, sem texto
 * livre — mais seguro (nada a moderar) e mais rápido de usar guiando ou
 * esperando. A ligação com número mascarado não está aqui: precisa de um
 * provedor de telefonia que o projeto não tem contratado (ver docs/plano-implementacao.md §11.1).
 */
export function QuickChatSheet({ ride, visible, onClose }: { ride: Ride; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState<string | null>(null);
  const quick = useQuery({ queryKey: qk.quickMessages(ride.id), queryFn: () => api.rides.quickMessages(ride.id), enabled: visible });
  const messages = useQuery({ queryKey: qk.messages(ride.id), queryFn: () => api.rides.messages(ride.id), enabled: visible });

  const send = async (code: string) => {
    setSending(code);
    try {
      const msg = await api.rides.sendMessage(ride.id, code);
      queryClient.setQueryData(qk.messages(ride.id), (prev: typeof messages.data) => [...(prev ?? []), msg]);
    } catch (err) {
      alertError(err, 'Não foi possível enviar');
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar chat" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AppText variant="subtitle">Chat rápido</AppText>
        <AppText variant="small">Mensagens prontas, sem precisar digitar — nenhum contato real é compartilhado.</AppText>
        <FlatList
          data={messages.data ?? []}
          keyExtractor={(m) => m.id}
          style={styles.history}
          ListEmptyComponent={<AppText variant="small">Nenhuma mensagem ainda.</AppText>}
          renderItem={({ item }) => (
            <Row style={{ justifyContent: item.senderRole === ride.role ? 'flex-end' : 'flex-start' }}>
              <View style={[styles.bubble, item.senderRole === ride.role ? styles.bubbleMine : styles.bubbleTheirs]}>
                <AppText variant="small" color={item.senderRole === ride.role ? colors.white : colors.text}>
                  {item.label}
                </AppText>
              </View>
            </Row>
          )}
        />
        <View style={styles.chips}>
          {(quick.data ?? []).map((m) => (
            <Button key={m.code} title={m.label} variant="outline" size="sm" loading={sending === m.code} disabled={!!sending} onPress={() => void send(m.code)} />
          ))}
        </View>
        <Button title="Fechar" variant="ghost" onPress={onClose} />
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
    gap: spacing.md,
    maxHeight: '80%',
  },
  history: { maxHeight: 220 },
  bubble: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginVertical: 2, maxWidth: '80%' },
  bubbleMine: { backgroundColor: colors.navy },
  bubbleTheirs: { backgroundColor: colors.surfaceAlt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
