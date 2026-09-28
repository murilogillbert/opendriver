import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Ride } from '@/api/types';
import { BottomPanel } from '@/components/ride/BottomPanel';
import { PersonCard } from '@/components/ride/PersonCard';
import { RatingInput } from '@/components/ride/RatingInput';
import { SafetySheet } from '@/components/ride/SafetySheet';
import { recordingActiveStore } from '@/components/SafetyRecorder';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { AppText, Badge, Card, Icon, KeyValue, Row, Stack } from '@/components/ui/primitives';
import { formatCurrency } from '@/lib/format';
import { openNavigation } from '@/lib/navigation';
import { alertError, confirm } from '@/lib/recovery';
import { can, driverHeadline } from '@/lib/ride';
import { useStore } from '@/lib/store';
import { dismissRide } from '@/lib/tripDraft';
import { colors, spacing } from '@/theme/tokens';

/**
 * Corrida do motorista: UMA ação dominante por estado (Cheguei → Iniciar →
 * Finalizar), 1 toque cada (UX06). Navegação em app externo.
 */
export function DriverRidePanel({ ride, onHeight }: { ride: Ride; onHeight: (h: number) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const recording = useStore(recordingActiveStore);
  const [busy, setBusy] = useState<string | null>(null);
  const [safety, setSafety] = useState(false);
  const [stars, setStars] = useState(0);

  const put = (next: Ride) => {
    queryClient.setQueryData(qk.ride(next.id), next);
    queryClient.setQueryData(qk.activeRide, next);
  };

  const done = () => {
    dismissRide(ride.id);
    queryClient.setQueryData(qk.activeRide, null);
    void queryClient.invalidateQueries({ queryKey: qk.activeRide });
    void queryClient.invalidateQueries({ queryKey: ['driver', 'earnings'] });
  };

  const step = async (action: 'arrived' | 'start' | 'finish') => {
    setBusy(action);
    try {
      put(await api.rides[action](ride.id));
    } catch (err) {
      alertError(err, 'Não foi possível atualizar a corrida');
      void queryClient.invalidateQueries({ queryKey: qk.activeRide });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const ok = await confirm('Cancelar esta corrida?', 'O passageiro será avisado e vamos procurar outro motorista para ele.', 'Cancelar corrida');
    if (!ok) return;
    setBusy('cancel');
    try {
      await api.rides.cancel(ride.id);
      done();
      toast.info('Corrida cancelada.');
    } catch (err) {
      alertError(err, 'Não foi possível cancelar');
    } finally {
      setBusy(null);
    }
  };

  const rate = async () => {
    setBusy('rate');
    try {
      await api.rides.rate(ride.id, stars);
      toast.success('Avaliação enviada.');
      done();
    } catch (err) {
      alertError(err, 'Não foi possível enviar a avaliação');
    } finally {
      setBusy(null);
    }
  };

  const toPickup = ride.status === 'DriverAssigned' || ride.status === 'DriverArrived';
  const target = toPickup ? ride.origin : ride.destination;

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (ride.status === 'DriverAssigned' || ride.status === 'DriverArrived' || ride.status === 'InProgress') {
    body = (
      <>
        {ride.passenger ? <PersonCard name={ride.passenger.name} avatarUrl={ride.passenger.avatarUrl} rating={ride.passenger.rating} /> : null}
        <Row gap={6} style={{ alignItems: 'flex-start' }}>
          <Icon name={toPickup ? 'radio-button-on' : 'square'} size={14} color={toPickup ? colors.navy : colors.limeDark} />
          <AppText variant="body" style={{ flex: 1 }} numberOfLines={2}>
            {target.address}
          </AppText>
        </Row>
        {ride.status === 'InProgress' && recording ? <Badge label="Gravando áudio da viagem" tone="danger" icon="mic" /> : null}
        <Row gap={spacing.sm}>
          <Button title="Navegar" icon="navigate" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void openNavigation(target, target.address)} />
          {can(ride, 'safety') ? <Button title="Segurança" icon="shield-checkmark-outline" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setSafety(true)} /> : null}
        </Row>
      </>
    );
    const main =
      ride.status === 'DriverAssigned'
        ? { key: 'arrived' as const, title: 'Cheguei' }
        : ride.status === 'DriverArrived'
          ? { key: 'start' as const, title: 'Iniciar' }
          : { key: 'finish' as const, title: 'Finalizar' };
    footer = (
      <>
        {can(ride, main.key) ? <Button title={main.title} size="lg" loading={busy === main.key} disabled={!!busy && busy !== main.key} onPress={() => void step(main.key)} /> : null}
        {can(ride, 'cancel') ? <Button title="Cancelar" variant="ghost" loading={busy === 'cancel'} disabled={!!busy && busy !== 'cancel'} onPress={cancel} /> : null}
      </>
    );
  } else if (ride.status === 'Completed') {
    body = (
      <Stack>
        <Card style={{ gap: spacing.sm }}>
          <KeyValue label="Você recebe" value={formatCurrency(ride.driverEarning ?? 0)} strong valueColor={colors.success} />
          <KeyValue label="Valor da corrida" value={formatCurrency(ride.fare)} />
          <AppText variant="small">{ride.payment.methodType === 'Pix' ? 'O passageiro paga por Pix no app.' : 'Cobrado no cartão do passageiro.'} O valor entra no seu saldo.</AppText>
        </Card>
        {can(ride, 'rate') ? (
          <>
            <AppText variant="bodyStrong" center>
              Como foi com {ride.passenger?.name ?? 'o passageiro'}?
            </AppText>
            <RatingInput value={stars} onChange={setStars} />
          </>
        ) : null}
      </Stack>
    );
    footer = can(ride, 'rate') ? (
      <>
        <Button title="Enviar avaliação" size="lg" disabled={!stars} loading={busy === 'rate'} onPress={rate} />
        <Button title="Pular" variant="ghost" onPress={done} />
      </>
    ) : (
      <Button title="Concluir" size="lg" onPress={done} />
    );
  } else {
    body = <AppText>{ride.cancelledBy === 'Passenger' ? 'O passageiro cancelou a corrida.' : 'A corrida foi encerrada.'}</AppText>;
    footer = <Button title="Voltar" size="lg" variant="outline" onPress={done} />;
  }

  return (
    <>
      <BottomPanel onHeight={onHeight} footer={footer}>
        <AppText variant="subtitle" accessibilityLiveRegion="polite">
          {driverHeadline(ride)}
        </AppText>
        {body}
      </BottomPanel>
      {can(ride, 'safety') ? <SafetySheet ride={ride} visible={safety} onClose={() => setSafety(false)} /> : null}
    </>
  );
}
