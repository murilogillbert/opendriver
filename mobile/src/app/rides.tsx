import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Ride } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { AppText, Badge, Card, Row } from '@/components/ui/primitives';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/ride';
import { colors, spacing } from '@/theme/tokens';

/** Histórico (RF09): lista enxuta; o detalhe fica na corrida. */
export default function Rides() {
  const params = useLocalSearchParams<{ role?: string }>();
  const role = params.role === 'driver' ? 'driver' : 'passenger';
  const q = useInfiniteQuery({
    queryKey: qk.history(role),
    queryFn: ({ pageParam }) => api.rides.history(role, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (q.isPending) return <LoadingState />;
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const value = (r: Ride) => (role === 'driver' ? (r.driverEarning ?? 0) : r.status === 'Cancelled' ? r.cancellationFee : r.fare);

  return (
    <>
      <Stack.Screen options={{ title: role === 'driver' ? 'Corridas realizadas' : 'Minhas viagens' }} />
      <FlatList
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
        data={items}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        ListEmptyComponent={
          <EmptyState
            icon="car-outline"
            title="Nenhuma corrida ainda"
            message={role === 'driver' ? 'Fique online para receber corridas.' : 'Suas viagens aparecem aqui.'}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${statusLabel[item.status]}, ${item.destination.address}, ${formatDateTime(item.requestedAt)}`}
            onPress={() => router.push({ pathname: '/ride/[id]', params: { id: item.id } })}
          >
            <Card style={{ gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="small">{item.scheduledAt ? `Agendada para ${formatDateTime(item.scheduledAt)}` : formatDateTime(item.requestedAt)}</AppText>
                <Badge label={statusLabel[item.status]} tone={statusTone(item.status)} />
              </Row>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {item.destination.address}
              </AppText>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="small" numberOfLines={1}>
                    De {item.origin.address}
                  </AppText>
                </View>
                <AppText variant="bodyStrong">{formatCurrency(value(item))}</AppText>
              </Row>
            </Card>
          </Pressable>
        )}
      />
    </>
  );
}
