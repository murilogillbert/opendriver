import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Earning } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { AppText, Card, Row, SectionTitle, Stack, Stat } from '@/components/ui/primitives';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { colors, spacing } from '@/theme/tokens';

const typeLabel: Record<Earning['type'], string> = {
  RideEarning: 'Corrida',
  CancellationFee: 'Taxa de cancelamento',
  Adjustment: 'Ajuste',
  Payout: 'Saque',
};

/** Ganhos (RF12): resumo + extrato. Ação dominante: Sacar. */
export default function Earnings() {
  const summary = useQuery({ queryKey: qk.earningsSummary, queryFn: () => api.driver.earningsSummary() });
  const list = useInfiniteQuery({
    queryKey: qk.earnings,
    queryFn: ({ pageParam }) => api.driver.earnings(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (summary.isPending) return <LoadingState />;
  if (summary.error && !summary.data) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const s = summary.data!;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={items}
      keyExtractor={(e) => e.id}
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching || list.isRefetching}
          onRefresh={() => {
            void summary.refetch();
            void list.refetch();
          }}
        />
      }
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      ListHeaderComponent={
        <Stack style={{ marginBottom: spacing.md }}>
          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Stat label="Hoje" value={formatCurrency(s.today)} hint={`${s.ridesToday} corrida${s.ridesToday === 1 ? '' : 's'}`} />
            </View>
            <View style={{ flex: 1 }}>
              <Stat label="Últimos 7 dias" value={formatCurrency(s.week)} />
            </View>
          </Row>
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="caption">Disponível para saque</AppText>
            <AppText variant="title">{formatCurrency(s.withdrawable)}</AppText>
            {s.pendingPayout > 0 ? <AppText variant="small">{formatCurrency(s.pendingPayout)} em saque solicitado</AppText> : null}
            <Button title="Sacar" disabled={s.withdrawable < 10} onPress={() => router.push('/driver/payouts')} />
            {s.withdrawable < 10 ? <AppText variant="small">O saque mínimo é de R$ 10,00.</AppText> : null}
          </Card>
          <SectionTitle title="Extrato" />
        </Stack>
      }
      ListEmptyComponent={list.isPending ? <LoadingState /> : <EmptyState icon="cash-outline" title="Sem movimentações ainda" message="Seus ganhos aparecem aqui depois de cada corrida." />}
      renderItem={({ item }) => (
        <Card style={{ paddingVertical: spacing.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{typeLabel[item.type]}</AppText>
              <AppText variant="small">{formatDateTime(item.createdAt)}</AppText>
            </View>
            <AppText variant="bodyStrong" color={item.amount < 0 ? colors.danger : colors.success}>
              {item.amount < 0 ? '' : '+'}
              {formatCurrency(item.amount)}
            </AppText>
          </Row>
        </Card>
      )}
    />
  );
}
