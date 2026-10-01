import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, RefreshControl } from 'react-native';
import { api } from '@/api/client';
import type { Complaint } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText, Badge, Card } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/format';
import { colors, spacing } from '@/theme/tokens';

const STATUS_LABEL: Record<Complaint['status'], { label: string; tone: 'warning' | 'info' | 'success' }> = {
  Open: { label: 'Aberta', tone: 'warning' },
  InReview: { label: 'Em análise', tone: 'info' },
  Closed: { label: 'Concluída', tone: 'success' },
};

const CATEGORY_LABEL: Record<string, string> = {
  driver_behavior: 'Comportamento do motorista',
  vehicle_condition: 'Condição do veículo',
  route_issue: 'Rota/trajeto',
  payment_issue: 'Pagamento',
  lost_item: 'Item perdido',
  other: 'Outro',
};

/** Acompanhamento de status das reclamações abertas (plano §3). */
export default function Complaints() {
  const list = useQuery({ queryKey: ['complaints', 'mine'], queryFn: () => api.complaints.mine() });

  return (
    <Screen footer={<Button title="Fazer nova reclamação" onPress={() => router.push('/safety/complaint')} />} scroll={false}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={!list.isLoading ? <AppText color={colors.textMuted}>Você ainda não abriu nenhuma reclamação.</AppText> : null}
        renderItem={({ item }) => {
          const status = STATUS_LABEL[item.status];
          return (
            <Card style={{ gap: spacing.xs }}>
              <AppText variant="bodyStrong">{(item.category && CATEGORY_LABEL[item.category]) || 'Reclamação'}</AppText>
              <AppText variant="small">{item.description}</AppText>
              <AppText variant="caption">{formatDateTime(item.createdAt)}</AppText>
              <Badge label={status.label} tone={status.tone} />
              {item.attachmentCount > 0 ? <AppText variant="caption">{item.attachmentCount} foto(s) anexada(s)</AppText> : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
