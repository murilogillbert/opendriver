import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { FavoriteDriver } from '@/api/types';
import { RideMap } from '@/components/map/RideMap';
import { CancelReasonSheet } from '@/components/ride/CancelReasonSheet';
import { PaymentDue } from '@/components/ride/PaymentDue';
import { PersonCard } from '@/components/ride/PersonCard';
import { RatingInput } from '@/components/ride/RatingInput';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { AppText, Badge, Card, Divider, Icon, KeyValue, Row, Stack } from '@/components/ui/primitives';
import { formatCurrency, formatDateTime, formatDistance, formatDuration } from '@/lib/format';
import { alertError, confirm } from '@/lib/recovery';
import { can, isActive, paymentLabel, statusLabel, statusTone } from '@/lib/ride';
import { colors, radius, spacing } from '@/theme/tokens';

/** Recibo / detalhe da corrida (RF09): pagar pendência e avaliar também daqui. */
export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.ride(id), queryFn: () => api.rides.get(id), enabled: !!id });
  const ride = q.data;
  const canFavorite = ride?.role === 'passenger' && ride.status === 'Completed' && !!ride.driver;
  const favorites = useQuery({ queryKey: qk.favorites, queryFn: () => api.me.favorites(), enabled: canFavorite });
  const isFavorite = !!ride?.driver && (favorites.data ?? []).some((f: FavoriteDriver) => f.driverId === ride.driver!.id);
  const [stars, setStars] = useState(0);
  const [sending, setSending] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);

  const onCancelled = async (res: { cancelled: boolean; cancellationFee?: number }) => {
    setCancelSheet(false);
    await q.refetch();
    await queryClient.invalidateQueries({ queryKey: ['rides'] });
    toast.info(res.cancellationFee ? `Corrida cancelada. Taxa de ${formatCurrency(res.cancellationFee)}.` : 'Corrida cancelada.');
  };

  const toggleFavorite = async () => {
    if (!ride?.driver) return;
    try {
      if (isFavorite) await api.me.removeFavorite(ride.driver.id);
      else await api.me.addFavorite(ride.driver.id);
      await queryClient.invalidateQueries({ queryKey: qk.favorites });
      toast.success(isFavorite ? 'Removido dos favoritos.' : 'Motorista favoritado! Ele terá leve prioridade nas suas próximas corridas.');
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
    }
  };

  const otherParty = ride?.role === 'driver' ? ride.passenger : ride?.driver;
  const canBlock = !!otherParty && ride && ['Completed', 'Cancelled'].includes(ride.status);
  const block = async () => {
    if (!otherParty) return;
    if (!(await confirm(`Bloquear ${otherParty.name}?`, 'Vocês não serão mais pareados em novas corridas.', 'Bloquear'))) return;
    try {
      await api.me.block(otherParty.id);
      toast.success(`${otherParty.name} foi bloqueado.`);
    } catch (err) {
      alertError(err, 'Não foi possível bloquear');
    }
  };

  const rate = async () => {
    setSending(true);
    try {
      const next = await api.rides.rate(id, stars);
      queryClient.setQueryData(qk.ride(id), next);
      toast.success('Obrigado pela avaliação!');
    } catch (err) {
      alertError(err, 'Não foi possível enviar a avaliação');
    } finally {
      setSending(false);
    }
  };

  return (
    <QueryView query={q}>
      {(ride) => (
        <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
          <View style={styles.map}>
            <RideMap origin={ride.origin} destination={ride.destination} polyline={ride.polyline} showUser={false} interactive={false} />
          </View>
          {isActive(ride) ? (
            <Button title="Ver corrida em andamento" icon="navigate" onPress={() => router.navigate(ride.role === 'driver' ? '/drive' : '/passenger')} />
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="small">{ride.scheduledAt ? `Agendada para ${formatDateTime(ride.scheduledAt)}` : formatDateTime(ride.requestedAt)}</AppText>
            <Badge label={statusLabel[ride.status]} tone={statusTone(ride.status)} />
          </Row>
          {ride.scheduledFavoriteDriverName ? (
            <AppText variant="small">Oferta exclusiva reservada para {ride.scheduledFavoriteDriverName} antes da busca geral.</AppText>
          ) : null}
          {can(ride, 'cancel') ? (
            <Button title="Cancelar corrida" variant="outline" icon="close-circle-outline" onPress={() => setCancelSheet(true)} />
          ) : null}
          <Card style={{ gap: spacing.sm }}>
            <Row gap={6} style={{ alignItems: 'flex-start' }}>
              <Icon name="radio-button-on" size={14} color={colors.navy} />
              <AppText variant="body" style={{ flex: 1 }}>
                {ride.origin.address}
              </AppText>
            </Row>
            <Row gap={6} style={{ alignItems: 'flex-start' }}>
              <Icon name="square" size={12} color={colors.limeDark} />
              <AppText variant="body" style={{ flex: 1 }}>
                {ride.destination.address}
              </AppText>
            </Row>
            <AppText variant="small">
              {formatDistance(ride.distanceM)} · {formatDuration(ride.durationS)}
            </AppText>
          </Card>

          {ride.driver ? (
            <Card style={{ gap: spacing.sm }}>
              <PersonCard name={ride.driver.name} avatarUrl={ride.driver.avatarUrl} rating={ride.driver.rating} vehicle={ride.driver.vehicle} />
              {canFavorite ? (
                <Button
                  title={isFavorite ? 'Remover dos favoritos' : 'Favoritar motorista'}
                  variant={isFavorite ? 'outline' : 'secondary'}
                  icon={isFavorite ? 'star' : 'star-outline'}
                  size="sm"
                  onPress={() => void toggleFavorite()}
                  style={{ alignSelf: 'flex-start' }}
                />
              ) : null}
            </Card>
          ) : null}
          {ride.passenger ? (
            <Card>
              <PersonCard name={ride.passenger.name} avatarUrl={ride.passenger.avatarUrl} rating={ride.passenger.rating} />
            </Card>
          ) : null}

          <Card style={{ gap: spacing.sm }}>
            {ride.role === 'driver' ? (
              <>
                <KeyValue label="Valor da corrida" value={formatCurrency(ride.fare)} />
                <KeyValue label="Taxa da plataforma" value={`- ${formatCurrency(ride.platformFee ?? 0)}`} />
                <Divider />
                <KeyValue label="Você recebe" value={formatCurrency(ride.driverEarning ?? 0)} strong />
              </>
            ) : ride.status === 'Cancelled' ? (
              <KeyValue label="Taxa de cancelamento" value={formatCurrency(ride.cancellationFee)} strong />
            ) : (
              <>
                <KeyValue label="Corrida" value={formatCurrency(ride.fare)} />
                {ride.cashbackUsed > 0 ? <KeyValue label="Cashback do Hub" value={`- ${formatCurrency(ride.cashbackUsed)}`} /> : null}
                <Divider />
                <KeyValue label="Total pago" value={formatCurrency(Math.max(0, ride.amountDue - ride.cashbackUsed))} strong />
              </>
            )}
            {ride.role === 'passenger' && ride.amountDue > 0 ? (
              <AppText variant="small">
                {ride.payment.label} · {paymentLabel(ride)}
              </AppText>
            ) : null}
          </Card>

          {ride.role === 'passenger' ? <PaymentDue ride={ride} /> : null}

          {can(ride, 'rate') ? (
            <Stack>
              <AppText variant="bodyStrong" center>
                Avalie esta corrida
              </AppText>
              <RatingInput value={stars} onChange={setStars} />
              <Button title="Enviar avaliação" disabled={!stars} loading={sending} onPress={rate} />
            </Stack>
          ) : null}

          <Button
            title="Relatar um problema"
            variant="ghost"
            icon="flag-outline"
            onPress={() => router.push({ pathname: '/safety/report', params: { rideId: ride.id } })}
          />
          <Button
            title="Fazer reclamação"
            variant="ghost"
            icon="chatbox-ellipses-outline"
            onPress={() => router.push({ pathname: '/safety/complaint', params: { rideId: ride.id } })}
          />
          {canBlock ? <Button title={`Bloquear ${otherParty!.name}`} variant="ghost" icon="ban-outline" onPress={() => void block()} /> : null}
          <CancelReasonSheet ride={ride} visible={cancelSheet} onClose={() => setCancelSheet(false)} onCancelled={(res) => void onCancelled(res)} />
        </Screen>
      )}
    </QueryView>
  );
}

const styles = StyleSheet.create({
  map: { height: 200, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
});
