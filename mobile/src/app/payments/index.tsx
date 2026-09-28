import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { PaymentMethod, PaymentMethods } from '@/api/types';
import { methodIcon } from '@/components/ride/PaymentPicker';
import { Button } from '@/components/ui/Button';
import { ListRow, SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { AppText, Badge, Card, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/format';
import { alertError, confirm } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

/**
 * Formas de pagamento (RF08, RF14). O padrão é usado sozinho em toda corrida
 * (zero toques para pagar — UX04). Pix fica sempre disponível.
 */
export default function Payments() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.payments, queryFn: () => api.payments.list() });

  const apply = (data: PaymentMethods) => queryClient.setQueryData(qk.payments, data);

  const makeDefault = async (m: PaymentMethod) => {
    try {
      apply(await api.payments.setDefault(m.id));
    } catch (err) {
      alertError(err);
    }
  };

  const remove = async (m: PaymentMethod) => {
    if (!(await confirm('Remover cartão?', `${m.label} deixará de aparecer nas suas corridas.`, 'Remover'))) return;
    try {
      apply(await api.payments.remove(m.id));
    } catch (err) {
      alertError(err, 'Não foi possível remover');
    }
  };

  const toggleCashback = async (v: boolean) => {
    try {
      apply(await api.payments.setUseCashback(v));
    } catch (err) {
      alertError(err);
    }
  };

  return (
    <QueryView query={q}>
      {(data) => (
        <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
          <SectionTitle title="Cashback do Hub" />
          <Card style={{ padding: spacing.xs }}>
            <SwitchRow
              title="Usar cashback nas corridas"
              subtitle={`Saldo disponível: ${formatCurrency(me?.cashbackBalance ?? 0)}`}
              value={data.useHubCashback}
              onValueChange={(v) => void toggleCashback(v)}
            />
          </Card>
          <AppText variant="small">O saldo é abatido antes de cobrar o cartão ou o Pix.</AppText>

          <SectionTitle title="Formas de pagamento" />
          <Card style={{ padding: spacing.xs }}>
            {data.methods.map((m) => (
              <ListRow
                key={m.id}
                icon={methodIcon(m)}
                title={m.label}
                subtitle={m.type === 'Pix' ? 'QR code ao final da corrida' : m.expiry ? `Validade ${m.expiry}` : undefined}
                chevron={false}
                right={m.isDefault ? <Badge label="Padrão" tone="brand" /> : <Button title="Usar" variant="ghost" size="sm" onPress={() => void makeDefault(m)} />}
                onPress={m.type === 'Card' ? () => void remove(m) : undefined}
              />
            ))}
          </Card>
          <AppText variant="small">Toque num cartão para removê-lo.</AppText>
          <Button title="Adicionar cartão" icon="add" variant="secondary" onPress={() => router.push('/payments/add-card')} />
        </Screen>
      )}
    </QueryView>
  );
}
