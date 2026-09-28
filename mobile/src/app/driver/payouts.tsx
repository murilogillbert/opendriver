import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Payout } from '@/api/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Badge, Card, KeyValue, Row, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { moneyToInput, parseMoney } from '@/lib/masks';
import { alertError, confirm } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

const status: Record<Payout['status'], { label: string; tone: 'info' | 'success' | 'danger' }> = {
  Pending: { label: 'Solicitado', tone: 'info' },
  Paid: { label: 'Pago', tone: 'success' },
  Rejected: { label: 'Recusado', tone: 'danger' },
};

/** Saque por Pix (RF12/RF14). Padrão: o saldo inteiro disponível. */
export default function Payouts() {
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: qk.earningsSummary, queryFn: () => api.driver.earningsSummary() });
  const list = useQuery({ queryKey: qk.payouts, queryFn: () => api.driver.payouts() });
  // null = ainda não mexeu: sugere o saldo inteiro (UX09).
  const [typed, setAmount] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const available = summary.data?.withdrawable ?? 0;
  const amount = typed ?? (summary.data ? moneyToInput(available) : '');

  const value = parseMoney(amount);
  const invalid = !Number.isFinite(value) || value < 10 || value > available;

  const request = async () => {
    if (!(await confirm('Confirmar saque?', `${formatCurrency(value)} para a sua chave Pix cadastrada.`, 'Sacar', false))) return;
    setSending(true);
    try {
      await api.driver.requestPayout(value);
      toast.success('Saque solicitado. Você recebe no Pix em até 1 dia útil.');
      setAmount(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.payouts }),
        queryClient.invalidateQueries({ queryKey: ['driver', 'earnings'] }),
      ]);
    } catch (err) {
      alertError(err, 'Não foi possível sacar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen footer={<Button title={`Sacar ${Number.isFinite(value) ? formatCurrency(value) : ''}`} size="lg" disabled={invalid || !me?.driver?.hasPixKey} loading={sending} onPress={request} />}>
      <Card style={{ gap: spacing.sm }}>
        <KeyValue label="Disponível para saque" value={formatCurrency(available)} strong />
        {summary.data?.pendingPayout ? <KeyValue label="Em saque solicitado" value={formatCurrency(summary.data.pendingPayout)} /> : null}
      </Card>
      <TextField
        label="Valor"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        hint="Mínimo de R$ 10,00."
        error={amount && Number.isFinite(value) && value > available ? 'Acima do disponível.' : undefined}
      />
      {!me?.driver?.hasPixKey ? <AppText variant="small">Cadastre sua chave Pix na sua conta para sacar.</AppText> : null}
      {list.data?.length ? (
        <>
          <SectionTitle title="Saques" />
          {list.data.map((p) => (
            <Card key={p.id} style={{ paddingVertical: spacing.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="bodyStrong">{formatCurrency(p.amount)}</AppText>
                <Badge label={status[p.status].label} tone={status[p.status].tone} />
              </Row>
              <AppText variant="small">{formatDateTime(p.requestedAt)}</AppText>
              {p.note ? <AppText variant="small">{p.note}</AppText> : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
