import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { ApiError, errorCode } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import type { Address, Category, LatLng, PaymentMethod, Quote } from '@/api/types';
import { BottomPanel } from '@/components/ride/BottomPanel';
import { methodIcon, PaymentPicker } from '@/components/ride/PaymentPicker';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { SwitchRow } from '@/components/ui/Controls';
import { AppText, Card, Divider, Icon, KeyValue, Row } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/TextField';
import { ErrorState } from '@/components/ui/States';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDateTime, formatDistance, formatDuration } from '@/lib/format';
import { alertError } from '@/lib/recovery';
import { useStore } from '@/lib/store';
import { resetTripDraft, tripDraftStore } from '@/lib/tripDraft';
import { colors, radius, spacing } from '@/theme/tokens';

const LAST_CATEGORY = 'odh.lastCategory';

/**
 * Preço e confirmação (RF03/RF08). Ação dominante: "Pedir corrida". Tudo já
 * vem preenchido (categoria da última vez, pagamento padrão, cashback) —
 * pagar não exige nenhum toque (UX04, UX09). Detalhes só em "Ver detalhes".
 */
export function QuotePanel({
  origin,
  destination,
  needsGuestName = false,
  onHeight,
  onQuote,
}: {
  origin: Address | (LatLng & { address?: string });
  destination: Address;
  /** Embarque diferente da localização atual — provavelmente é pra outra pessoa. */
  needsGuestName?: boolean;
  onHeight: (h: number) => void;
  onQuote: (q: Quote | null) => void;
}) {
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const draft = useStore(tripDraftStore);
  const scheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
  const [category, setCategory] = useState<Category | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [useCashback, setUseCashback] = useState<boolean | null>(null);
  const [details, setDetails] = useState(false);
  const [picker, setPicker] = useState(false);
  const [guestName, setGuestName] = useState('');

  const quoteKey = ['quote', origin.lat, origin.lng, destination.lat, destination.lng, draft.scheduledAt] as const;
  const quote = useQuery({
    queryKey: quoteKey,
    queryFn: () => api.rides.quote(origin, destination, scheduledAt ?? undefined),
    staleTime: 4 * 60_000, // cotação vale 5 min no servidor
    gcTime: 0,
  });
  const payments = useQuery({ queryKey: qk.payments, queryFn: () => api.payments.list() });

  useEffect(() => {
    onQuote(quote.data ?? null);
  }, [quote.data, onQuote]);

  useEffect(() => {
    AsyncStorage.getItem(LAST_CATEGORY)
      .then((c) => (c === 'Economy' || c === 'Comfort' ? setCategory((cur) => cur ?? c) : undefined))
      .catch(() => undefined);
  }, []);

  const prices = quote.data?.prices ?? [];
  const selected = prices.find((p) => p.category === category) ?? prices[0];
  const defaultMethod = payments.data?.methods.find((m) => m.isDefault) ?? null;
  const payWith = method ?? defaultMethod;
  const balance = me?.cashbackBalance ?? 0;
  const cashbackOn = balance > 0 && (useCashback ?? payments.data?.useHubCashback ?? true);
  const cashbackUsed = selected && cashbackOn ? Math.min(balance, selected.fare) : 0;
  const toPay = selected ? Math.max(0, selected.fare - cashbackUsed) : 0;
  const needsCpf = !me?.cpf;
  const guestNameMissing = needsGuestName && !guestName.trim();

  const request = useMutation({
    mutationFn: () =>
      api.rides.request({
        quoteId: quote.data!.id,
        category: selected!.category,
        paymentMethodId: method?.id,
        useCashback: balance > 0 ? cashbackOn : undefined,
        guestPassengerName: needsGuestName ? guestName.trim() : undefined,
        scheduledAt: scheduledAt ?? undefined,
        favoriteDriverId: scheduledAt ? (draft.favoriteDriverId ?? undefined) : undefined,
      }),
    onSuccess: (ride) => {
      AsyncStorage.setItem(LAST_CATEGORY, ride.category).catch(() => undefined);
      if (ride.status === 'Scheduled') toast.success(`Corrida agendada para ${formatDateTime(ride.scheduledAt)}.`);
      else queryClient.setQueryData(qk.activeRide, ride);
      resetTripDraft();
    },
    onError: async (err) => {
      const code = errorCode(err);
      if (code === 'quote_expired' || code === 'quote_used' || code === 'quote_not_found') {
        // Preço honesto: busca de novo e deixa o passageiro confirmar o valor atualizado.
        await quote.refetch();
        toast.info('Atualizamos o preço. Confira e toque em Pedir corrida.');
        return;
      }
      if (code === 'active_ride') {
        void queryClient.invalidateQueries({ queryKey: qk.activeRide });
        return;
      }
      alertError(err, 'Não foi possível pedir a corrida');
    },
  });

  const summary = useMemo(
    () => (quote.data ? `${formatDistance(quote.data.distanceM)} · ${formatDuration(quote.data.durationS)}` : ''),
    [quote.data],
  );

  const back = () => tripDraftStore.set((d) => ({ ...d, destination: null }));

  if (quote.error) {
    const code = errorCode(quote.error);
    return (
      <BottomPanel onHeight={onHeight} footer={<Button title="Voltar" variant="outline" onPress={back} />}>
        {code === 'too_close' || code === 'too_far' || code === 'invalid_location' ? (
          <Card>
            <AppText variant="bodyStrong">{(quote.error as ApiError).message}</AppText>
            <AppText variant="small">Escolha outro destino.</AppText>
          </Card>
        ) : (
          <ErrorState error={quote.error} onRetry={() => quote.refetch()} />
        )}
      </BottomPanel>
    );
  }

  return (
    <BottomPanel
      onHeight={onHeight}
      footer={
        <>
          <Button
            title={selected ? `${scheduledAt ? 'Agendar corrida' : 'Pedir corrida'} · ${formatCurrency(toPay)}` : 'Calculando preço…'}
            size="lg"
            disabled={!selected || needsCpf || guestNameMissing}
            loading={request.isPending || quote.isPending}
            onPress={() => request.mutate()}
          />
          <Row style={{ justifyContent: 'space-between' }}>
            <Button title="Voltar" variant="ghost" size="sm" onPress={back} />
            <Button title={details ? 'Ocultar detalhes' : 'Ver detalhes'} variant="ghost" size="sm" onPress={() => setDetails((v) => !v)} disabled={!selected} />
          </Row>
        </>
      }
    >
      <View style={{ gap: 2 }}>
        <AppText variant="small" numberOfLines={1}>
          Para
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {destination.address}
        </AppText>
        {summary ? <AppText variant="small">{summary}</AppText> : null}
      </View>

      {prices.length > 1 ? (
        <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
          {prices.map((p) => {
            const active = p.category === selected?.category;
            return (
              <Pressable
                key={p.category}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={`${p.label}, ${formatCurrency(p.fare)}`}
                onPress={() => setCategory(p.category)}
                style={[styles.category, active && styles.categoryActive]}
              >
                <Icon name={p.category === 'Comfort' ? 'car-sport-outline' : 'car-outline'} size={22} color={colors.navy} />
                <AppText variant="bodyStrong">{p.label}</AppText>
                <AppText variant="body">{formatCurrency(p.fare)}</AppText>
              </Pressable>
            );
          })}
        </Row>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={scheduledAt ? `Agendada para ${formatDateTime(scheduledAt)}. Tocar para alterar` : 'Pedir agora. Tocar para agendar pra depois'}
        onPress={() => router.push('/schedule')}
        style={styles.payRow}
      >
        <Icon name="calendar-outline" size={20} color={colors.navy} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {scheduledAt ? `Agendada para ${formatDateTime(scheduledAt)}` : 'Pedir agora'}
        </AppText>
        <AppText variant="small" color={colors.blue}>
          {scheduledAt ? 'Alterar' : 'Agendar'}
        </AppText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pagamento: ${payWith?.label ?? 'Pix'}. Tocar para trocar`}
        onPress={() => setPicker(true)}
        style={styles.payRow}
      >
        <Icon name={payWith ? methodIcon(payWith) : 'qr-code-outline'} size={20} color={colors.navy} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {payWith?.label ?? 'Pix'}
        </AppText>
        <AppText variant="small" color={colors.blue}>
          Trocar
        </AppText>
      </Pressable>

      {balance > 0 ? (
        <SwitchRow
          title="Usar cashback do Hub"
          subtitle={cashbackOn && selected ? `${formatCurrency(cashbackUsed)} do seu saldo de ${formatCurrency(balance)}` : `Saldo de ${formatCurrency(balance)}`}
          value={cashbackOn}
          onValueChange={setUseCashback}
        />
      ) : null}

      {needsGuestName ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="bodyStrong">Essa corrida é pra outra pessoa?</AppText>
          <AppText variant="small">O embarque escolhido é diferente de onde você está agora. Informe o nome de quem vai pegar a corrida — é isso que o motorista vai ver.</AppText>
          <TextField label="Nome do passageiro" value={guestName} onChangeText={setGuestName} autoCapitalize="words" maxLength={100} />
        </Card>
      ) : null}

      {needsCpf ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
          <AppText variant="bodyStrong">Falta seu CPF</AppText>
          <AppText variant="small">O CPF é exigido para cobrar a corrida. Informe uma vez e pronto.</AppText>
          <Button title="Informar CPF" variant="secondary" size="sm" onPress={() => router.push('/account/profile')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      {details && selected && quote.data ? (
        <Card style={{ gap: spacing.sm }}>
          <KeyValue label="Tarifa base" value={formatCurrency(selected.breakdown.baseFare)} />
          <KeyValue label={`Distância (${formatDistance(quote.data.distanceM)})`} value={formatCurrency(selected.breakdown.distanceFare)} />
          <KeyValue label={`Tempo (${formatDuration(quote.data.durationS)})`} value={formatCurrency(selected.breakdown.timeFare)} />
          {selected.breakdown.minimumApplied ? <AppText variant="small">Valor mínimo da categoria aplicado.</AppText> : null}
          <Divider />
          <KeyValue label="Total da corrida" value={formatCurrency(selected.fare)} strong />
          {cashbackUsed > 0 ? <KeyValue label="Cashback do Hub" value={`- ${formatCurrency(cashbackUsed)}`} /> : null}
          <KeyValue label="Você paga" value={formatCurrency(toPay)} strong />
          {quote.data.routeSource === 'estimate' ? (
            <AppText variant="small">Rota aproximada. O preço acima é o que será cobrado.</AppText>
          ) : (
            <AppText variant="small">O preço é fixo e não muda com o trânsito.</AppText>
          )}
          {scheduledAt ? <AppText variant="small">Corrida agendada: o preço já inclui o acréscimo por reservar o horário.</AppText> : null}
        </Card>
      ) : null}

      <PaymentPicker visible={picker} selectedId={payWith?.id ?? null} onSelect={setMethod} onClose={() => setPicker(false)} />
    </BottomPanel>
  );
}

const styles = StyleSheet.create({
  category: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    gap: 2,
  },
  categoryActive: { borderColor: colors.navy, backgroundColor: colors.limeSoft },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
});
