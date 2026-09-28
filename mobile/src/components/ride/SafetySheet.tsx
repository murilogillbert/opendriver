import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import type { LatLng, Ride } from '@/api/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { AppText, Divider, Row } from '@/components/ui/primitives';
import { getCurrentPosition } from '@/services/location';
import { colors, radius, spacing } from '@/theme/tokens';

async function helpMessage(ride: Ride, shareUrl: string | null, at: LatLng | null): Promise<string> {
  const parts = ['Estou numa corrida da OpenDriver e preciso de ajuda.'];
  if (shareUrl) parts.push(`Acompanhe a viagem: ${shareUrl}`);
  if (at) parts.push(`Minha localização: https://www.openstreetmap.org/?mlat=${at.lat.toFixed(5)}&mlon=${at.lng.toFixed(5)}#map=17/${at.lat.toFixed(5)}/${at.lng.toFixed(5)}`);
  const car = ride.driver?.vehicle;
  if (car) parts.push(`Carro: ${car.brand} ${car.model} ${car.color}, placa ${car.plate}.`);
  return parts.join('\n');
}

/**
 * Segurança a 1 toque durante a corrida (RF15, UX13): ligar 190 (e registrar a
 * ocorrência), compartilhar a viagem, avisar contatos e relatar problema.
 */
export function SafetySheet({ ride, visible, onClose }: { ride: Ride; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const contacts = useQuery({ queryKey: qk.contacts, queryFn: () => api.me.contacts(), enabled: visible });
  const isPassenger = ride.role === 'passenger';

  const call190 = async () => {
    // Registra a emergência sem atrasar a ligação.
    getCurrentPosition()
      .then((at) => api.rides.emergency(ride.id, at))
      .catch(() => undefined);
    await Linking.openURL('tel:190').catch(() => toast.error('Não foi possível abrir o discador. Ligue 190.'));
  };

  const shareLink = async (): Promise<string | null> => (isPassenger ? (await api.rides.share(ride.id)).url : null);

  const shareTrip = async () => {
    setSharing(true);
    try {
      const url = await shareLink();
      if (url) await Share.share({ message: `Acompanhe minha corrida pela OpenDriver: ${url}` });
    } catch (err) {
      toast.error(errorMessage(err, 'Não foi possível gerar o link. Tente novamente.'));
    } finally {
      setSharing(false);
    }
  };

  const alertContact = async (phone: string) => {
    try {
      const [url, at] = await Promise.all([shareLink().catch(() => null), getCurrentPosition()]);
      const body = encodeURIComponent(await helpMessage(ride, url, at));
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:+55${phone}${sep}body=${body}`);
    } catch {
      toast.error('Não foi possível abrir as mensagens.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar segurança" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AppText variant="subtitle">Segurança</AppText>
        <Button title="Ligar 190" icon="call" variant="danger" size="lg" onPress={call190} accessibilityHint="Liga para a polícia e avisa a equipe OpenDriver" />
        {isPassenger ? (
          <Button title="Compartilhar viagem" icon="share-social-outline" variant="outline" loading={sharing} onPress={shareTrip} />
        ) : null}
        <Divider />
        <AppText variant="label">Avisar contato de confiança</AppText>
        {contacts.data?.length ? (
          contacts.data.map((c) => (
            <ListRow key={c.id} icon="chatbubble-ellipses-outline" title={c.name} subtitle="Enviar mensagem com sua localização" onPress={() => alertContact(c.phone)} />
          ))
        ) : (
          <ListRow
            icon="person-add-outline"
            title="Adicionar contatos de confiança"
            onPress={() => {
              onClose();
              router.push('/safety');
            }}
          />
        )}
        <ListRow
          icon="flag-outline"
          title="Relatar um problema"
          onPress={() => {
            onClose();
            router.push({ pathname: '/safety/report', params: { rideId: ride.id } });
          }}
        />
        <Row style={{ justifyContent: 'center' }}>
          <Button title="Voltar" variant="ghost" onPress={onClose} />
        </Row>
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
  },
});
