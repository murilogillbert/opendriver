import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/primitives';
import { tripDraftStore } from '@/lib/tripDraft';
import { useStore } from '@/lib/store';
import { spacing } from '@/theme/tokens';

/** Acima do mínimo real do servidor (SCHEDULE_DISPATCH_LEAD_MINUTES + margem) — evita um erro
 * imediato por diferença de relógio/tempo gasto escolhendo o horário. */
const MIN_LEAD_MINUTES = 30;
const SLOT_MINUTES = 30;
const DAYS_AHEAD = 8; // hoje + 7
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad2 = (n: number) => n.toString().padStart(2, '0');

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function dayLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Hoje';
  if (offsetDays === 1) return 'Amanhã';
  const d = startOfDay(offsetDays);
  return `${WEEKDAYS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function slotsFor(offsetDays: number): Date[] {
  const day = startOfDay(offsetDays);
  const slots: Date[] = [];
  for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
    const slot = new Date(day.getTime() + m * 60_000);
    if (slot.getTime() - Date.now() >= MIN_LEAD_MINUTES * 60_000) slots.push(slot);
  }
  return slots;
}

/** Agendar a corrida pra depois, com motorista favorito opcional (plano §5). */
export default function Schedule() {
  const draft = useStore(tripDraftStore);
  const existing = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
  const [dayOffset, setDayOffset] = useState(() => {
    if (!existing) return 0;
    const diff = Math.round((startOfDay(0).getTime() - existing.getTime()) / -86_400_000);
    return Math.min(Math.max(diff, 0), DAYS_AHEAD - 1);
  });
  const [time, setTime] = useState<Date | null>(existing);
  const [favoriteDriverId, setFavoriteDriverId] = useState<string | null>(draft.favoriteDriverId);
  const favorites = useQuery({ queryKey: qk.favorites, queryFn: () => api.me.favorites() });

  const slots = slotsFor(dayOffset);

  const pickDay = (offset: number) => {
    setDayOffset(offset);
    setTime(null); // o horário escolhido pode não existir no novo dia (ex.: já passou)
  };

  const confirm = () => {
    if (!time) return;
    tripDraftStore.set((d) => ({ ...d, scheduledAt: time.toISOString(), favoriteDriverId }));
    router.back();
  };

  const clear = () => {
    tripDraftStore.set((d) => ({ ...d, scheduledAt: null, favoriteDriverId: null }));
    router.back();
  };

  return (
    <Screen
      footer={
        <>
          <Button title={`Agendar para ${time ? dayLabel(dayOffset).toLowerCase() : '…'}`} size="lg" disabled={!time} onPress={confirm} />
          {draft.scheduledAt ? <Button title="Remover agendamento, pedir agora" variant="ghost" size="sm" onPress={clear} /> : null}
        </>
      }
    >
      <AppText variant="label">Dia</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {Array.from({ length: DAYS_AHEAD }, (_, i) => (
          <Chip key={i} label={dayLabel(i)} active={i === dayOffset} onPress={() => pickDay(i)} />
        ))}
      </ScrollView>

      <AppText variant="label">Horário</AppText>
      {slots.length ? (
        <View style={styles.grid}>
          {slots.map((s) => (
            <Chip key={s.toISOString()} label={`${pad2(s.getHours())}:${pad2(s.getMinutes())}`} active={time?.getTime() === s.getTime()} onPress={() => setTime(s)} />
          ))}
        </View>
      ) : (
        <AppText variant="small">Não há mais horários disponíveis nesse dia. Escolha outro.</AppText>
      )}

      {favorites.data?.length ? (
        <>
          <AppText variant="label">Motorista favorito (opcional)</AppText>
          <AppText variant="small">Ele recebe a oferta primeiro, com exclusividade por alguns minutos antes da busca geral.</AppText>
          <View style={styles.grid}>
            <Chip label="Qualquer motorista" active={!favoriteDriverId} onPress={() => setFavoriteDriverId(null)} />
            {favorites.data.map((f) => (
              <Chip key={f.driverId} label={f.name} active={favoriteDriverId === f.driverId} onPress={() => setFavoriteDriverId(f.driverId)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
