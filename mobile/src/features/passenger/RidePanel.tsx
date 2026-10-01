import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Vibration } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Ride } from '@/api/types';
import { BottomPanel } from '@/components/ride/BottomPanel';
import { CancelReasonSheet } from '@/components/ride/CancelReasonSheet';
import { PaymentDue } from '@/components/ride/PaymentDue';
import { PersonCard } from '@/components/ride/PersonCard';
import { RatingInput, ratingLabel } from '@/components/ride/RatingInput';
import { SafetySheet } from '@/components/ride/SafetySheet';
import { recordingActiveStore } from '@/components/SafetyRecorder';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { AppText, Badge, Card, Divider, Icon, KeyValue, Row, Stack } from '@/components/ui/primitives';
import { driverLocationStore } from '@/context/RealtimeContext';
import { formatCurrency, formatDistance, formatTime } from '@/lib/format';
import { haversineMeters } from '@/lib/geo';
import { alertError } from '@/lib/recovery';
import { useLiveRoute } from '@/hooks/useLiveRoute';
import { useNow } from '@/hooks/useNow';
import { can, etaFromDurationS, passengerHeadline, pickupEtaText, searchingHint } from '@/lib/ride';
import { useStore } from '@/lib/store';
import { dismissRide, tripDraftStore } from '@/lib/tripDraft';
import { colors, spacing } from '@/theme/tokens';

const FREE_CANCEL_MIN = 2;

function Headline({ ride }: { ride: Ride }) {
  return (
    <Row>
      {ride.status === 'Searching' ? <ActivityIndicator color={colors.navy} /> : null}
      <AppText variant="subtitle" style={{ flex: 1 }} accessibilityLiveRegion="polite">
        {passengerHeadline(ride)}
      </AppText>
    </Row>
  );
}

function RecordingBadge() {
  const on = useStore(recordingActiveStore);
  return on ? <Badge label="Gravando áudio da viagem" tone="danger" icon="mic" /> : null;
}

/** Corrida do passageiro: mostra só o que vale no estado atual (UX07). */
export function PassengerRidePanel({ ride, onHeight }: { ride: Ride; onHeight: (h: number) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [safety, setSafety] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const driverLoc = useStore(driverLocationStore);
  const live = driverLoc?.rideId === ride.id ? driverLoc : null;
  const liveRoute = useLiveRoute(ride);
  const now = useNow(15_000, ride.status === 'Searching' || ride.status === 'DriverAssigned' || ride.status === 'InProgress');

  // Motorista chegou: avisa com vibração (o passageiro pode estar com o celular no bolso).
  const lastStatus = useRef(ride.status);
  useEffect(() => {
    if (ride.status === 'DriverArrived' && lastStatus.current === 'DriverAssigned') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Vibration.vibrate([0, 300, 150, 300]);
    }
    lastStatus.current = ride.status;
  }, [ride.status]);

  const update = (next: Ride) => {
    queryClient.setQueryData(qk.ride(next.id), next);
    queryClient.setQueryData(qk.activeRide, next);
  };

  const finish = () => {
    dismissRide(ride.id);
    queryClient.setQueryData(qk.activeRide, null);
    void queryClient.invalidateQueries({ queryKey: qk.activeRide });
  };

  const afterFreeCancel =
    ride.status === 'DriverArrived' || (ride.status === 'DriverAssigned' && !!ride.acceptedAt && now - new Date(ride.acceptedAt).getTime() > FREE_CANCEL_MIN * 60_000);

  const onCancelled = (res: { cancelled: boolean; cancellationFee?: number }) => {
    setCancelSheet(false);
    finish();
    toast.info(res.cancellationFee ? `Corrida cancelada. Taxa de ${formatCurrency(res.cancellationFee)}.` : 'Corrida cancelada.');
  };

  const share = async () => {
    setBusy('share');
    try {
      const { url } = await api.rides.share(ride.id);
      await Share.share({ message: `Acompanhe minha corrida pela OpenDriver: ${url}` });
    } catch (err) {
      alertError(err, 'Não foi possível compartilhar');
    } finally {
      setBusy(null);
    }
  };

  const rate = async () => {
    setBusy('rate');
    try {
      const next = await api.rides.rate(ride.id, stars, comment.trim() || undefined);
      toast.success('Obrigado pela avaliação!');
      if (can(next, 'pay')) update(next);
      else finish();
    } catch (err) {
      alertError(err, 'Não foi possível enviar a avaliação');
    } finally {
      setBusy(null);
    }
  };

  const sendTip = async () => {
    if (!tipAmount) return;
    setBusy('tip');
    try {
      await api.rides.tip(ride.id, tipAmount);
      update({ ...ride, tipAmount, canTip: false });
      toast.success('Gorjeta enviada. Obrigado!');
    } catch (err) {
      alertError(err, 'Não foi possível dar a gorjeta');
    } finally {
      setBusy(null);
    }
  };

  const tryAgain = () => {
    tripDraftStore.set({ origin: ride.origin, destination: ride.destination, scheduledAt: null, favoriteDriverId: null });
    finish();
  };

  const sideActions = (
    <Row gap={spacing.sm}>
      {can(ride, 'safety') ? <Button title="Segurança" icon="shield-checkmark-outline" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setSafety(true)} /> : null}
      {can(ride, 'share') ? (
        <Button title="Compartilhar" icon="share-social-outline" variant="outline" size="sm" style={{ flex: 1 }} loading={busy === 'share'} onPress={share} />
      ) : null}
    </Row>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;

  switch (ride.status) {
    case 'Searching':
      body = (
        <>
          <AppText variant="small" accessibilityLiveRegion="polite">
            {searchingHint(ride.requestedAt, now)}
          </AppText>
          <Card style={{ gap: 4 }}>
            <Row gap={6}>
              <Icon name="radio-button-on" size={14} color={colors.navy} />
              <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {ride.origin.address}
              </AppText>
            </Row>
            <Row gap={6}>
              <Icon name="square" size={12} color={colors.limeDark} />
              <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {ride.destination.address}
              </AppText>
            </Row>
          </Card>
          <KeyValue label={ride.payment.label} value={formatCurrency(ride.fare)} strong />
        </>
      );
      footer = can(ride, 'cancel') ? <Button title="Cancelar" variant="outline" onPress={() => setCancelSheet(true)} /> : null;
      break;

    case 'DriverAssigned':
    case 'DriverArrived':
      body = (
        <>
          {ride.status === 'DriverAssigned' ? (
            <AppText variant="bodyStrong">
              {[etaFromDurationS(liveRoute.durationS, now) ?? pickupEtaText(ride.pickupEta, now), live ? `a ${formatDistance(haversineMeters(live, ride.origin))}` : null]
                .filter(Boolean)
                .join(' · ') || 'A caminho do embarque'}
            </AppText>
          ) : null}
          {ride.status === 'DriverArrived' ? <AppText variant="small">Confira a placa antes de entrar.</AppText> : null}
          {ride.driver ? <PersonCard name={ride.driver.name} avatarUrl={ride.driver.avatarUrl} rating={ride.driver.rating} vehicle={ride.driver.vehicle} /> : null}
          {ride.pickupCode ? (
            <Card style={styles.pinCard}>
              <AppText variant="small">Informe esse código ao motorista para iniciar a corrida</AppText>
              <AppText variant="title" center accessibilityLabel={`Código de embarque: ${ride.pickupCode.split('').join(', ')}`}>
                {ride.pickupCode}
              </AppText>
            </Card>
          ) : null}
          {sideActions}
        </>
      );
      footer = can(ride, 'cancel') ? <Button title="Cancelar" variant="ghost" onPress={() => setCancelSheet(true)} /> : null;
      break;

    case 'InProgress': {
      const staticEta = ride.startedAt ? new Date(new Date(ride.startedAt).getTime() + ride.durationS * 1000) : null;
      const etaText = etaFromDurationS(liveRoute.durationS, now) ?? (staticEta ? `Chegada prevista às ${formatTime(staticEta)}` : null);
      body = (
        <>
          <AppText variant="body" numberOfLines={2}>
            {ride.destination.address}
          </AppText>
          {etaText ? <AppText variant="small">{etaText}</AppText> : null}
          <RecordingBadge />
          {ride.driver ? <PersonCard name={ride.driver.name} avatarUrl={ride.driver.avatarUrl} rating={ride.driver.rating} vehicle={ride.driver.vehicle} /> : null}
          {sideActions}
        </>
      );
      break;
    }

    case 'Completed': {
      const paid = ride.payment.status === 'Paid' || ride.payment.status === 'NotRequired';
      body = (
        <>
          <Card style={{ gap: spacing.sm }}>
            <KeyValue label="Corrida" value={formatCurrency(ride.fare)} strong />
            {ride.cashbackUsed > 0 ? <KeyValue label="Cashback do Hub" value={`- ${formatCurrency(ride.cashbackUsed)}`} /> : null}
            {paid ? (
              <Row gap={6}>
                <Icon name="checkmark-circle" size={18} color={colors.success} />
                <AppText variant="small">Pago · {ride.payment.label}</AppText>
              </Row>
            ) : null}
          </Card>
          <PaymentDue ride={ride} />
          {ride.canTip ? (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">Quer dar uma gorjeta pro motorista?</AppText>
              <Row gap={spacing.sm}>
                {[2, 5, 10].map((v) => (
                  <Button
                    key={v}
                    title={formatCurrency(v)}
                    variant={tipAmount === v ? 'secondary' : 'outline'}
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => setTipAmount(v)}
                  />
                ))}
              </Row>
              <Button title={tipAmount ? `Dar gorjeta de ${formatCurrency(tipAmount)}` : 'Escolha um valor'} disabled={!tipAmount} loading={busy === 'tip'} onPress={sendTip} />
            </Card>
          ) : ride.tipAmount ? (
            <AppText variant="small">Você deu {formatCurrency(ride.tipAmount)} de gorjeta. Obrigado!</AppText>
          ) : null}
          {can(ride, 'rate') ? (
            <Stack>
              <Divider />
              <AppText variant="bodyStrong" center>
                Como foi a corrida com {ride.driver?.name ?? 'o motorista'}?
              </AppText>
              <RatingInput value={stars} onChange={setStars} />
              {stars ? (
                <AppText variant="small" center>
                  {ratingLabel(stars)}
                </AppText>
              ) : null}
              {stars > 0 && stars <= 3 ? (
                <TextField label="Quer contar o que houve? (opcional)" value={comment} onChangeText={setComment} multiline maxLength={500} />
              ) : null}
            </Stack>
          ) : null}
        </>
      );
      footer = can(ride, 'rate') ? (
        <>
          <Button title="Enviar avaliação" size="lg" disabled={!stars} loading={busy === 'rate'} onPress={rate} />
          {!can(ride, 'pay') ? <Button title="Pular" variant="ghost" onPress={finish} /> : null}
        </>
      ) : !can(ride, 'pay') && ride.payment.status !== 'Pending' ? (
        <Button title="Concluir" size="lg" onPress={finish} />
      ) : null;
      break;
    }

    case 'NoDrivers':
      body = <AppText>Não encontramos motorista por perto agora. Tente de novo em alguns minutos.</AppText>;
      footer = (
        <>
          <Button title="Tentar de novo" size="lg" onPress={tryAgain} />
          <Button title="Voltar" variant="ghost" onPress={finish} />
        </>
      );
      break;

    case 'Cancelled':
      body = (
        <>
          <AppText>
            {ride.cancelledBy === 'Passenger' ? 'Você cancelou esta corrida.' : 'A corrida foi cancelada. Você pode pedir outra agora.'}
          </AppText>
          {ride.cancellationFee > 0 ? <KeyValue label="Taxa de cancelamento" value={formatCurrency(ride.cancellationFee)} /> : null}
          <PaymentDue ride={ride} />
        </>
      );
      footer = !can(ride, 'pay') ? (
        <>
          {ride.cancelledBy !== 'Passenger' ? <Button title="Pedir de novo" size="lg" onPress={tryAgain} /> : null}
          <Button title="Voltar" variant={ride.cancelledBy !== 'Passenger' ? 'ghost' : 'outline'} onPress={finish} />
        </>
      ) : null;
      break;
  }

  return (
    <>
      <BottomPanel onHeight={onHeight} footer={footer}>
        <Headline ride={ride} />
        {body}
      </BottomPanel>
      {can(ride, 'safety') ? <SafetySheet ride={ride} visible={safety} onClose={() => setSafety(false)} /> : null}
      {can(ride, 'cancel') ? (
        <CancelReasonSheet
          ride={ride}
          visible={cancelSheet}
          warning={afterFreeCancel ? 'O motorista já está a caminho há mais de 2 minutos, então pode haver taxa de cancelamento.' : 'Não há cobrança para cancelar agora.'}
          onClose={() => setCancelSheet(false)}
          onCancelled={onCancelled}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pinCard: { gap: 4, alignItems: 'center' },
});
