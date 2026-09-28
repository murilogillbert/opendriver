import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { PaymentMethod, Ride } from '@/api/types';
import { CopyField, QrCodeView } from '@/components/Media';
import { Button } from '@/components/ui/Button';
import { AppText, Card, Icon, Row, Stack } from '@/components/ui/primitives';
import { formatCurrency, formatTime } from '@/lib/format';
import { alertError } from '@/lib/recovery';
import { can } from '@/lib/ride';
import { colors } from '@/theme/tokens';
import { PaymentPicker } from './PaymentPicker';

/**
 * Pagamento que ainda depende do passageiro (UX04: só aparece quando o
 * pagamento automático não fechou sozinho). Pix: QR + copia-e-cola.
 * Falha: diz o motivo e oferece pagar de outro jeito (UX11).
 */
export function PaymentDue({ ride }: { ride: Ride }) {
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState(false);
  const [paying, setPaying] = useState(false);
  const due = Math.max(0, ride.amountDue - ride.cashbackUsed);

  const pay = async (method?: PaymentMethod) => {
    setPaying(true);
    try {
      const updated = await api.rides.pay(ride.id, method?.id);
      queryClient.setQueryData(qk.ride(ride.id), updated);
      if (queryClient.getQueryData<Ride | null>(qk.activeRide)?.id === ride.id) queryClient.setQueryData(qk.activeRide, updated);
    } catch (err) {
      alertError(err, 'Pagamento não concluído');
    } finally {
      setPaying(false);
    }
  };

  if (ride.payment.status === 'Pending' && ride.payment.pix) {
    return (
      <Stack>
        <Row>
          <Icon name="qr-code-outline" size={22} color={colors.navy} />
          <AppText variant="subtitle">Pague {formatCurrency(due)} com Pix</AppText>
        </Row>
        <AppText variant="small">
          Abra o app do seu banco e pague pelo QR ou pelo código abaixo. Confirmamos na hora
          {ride.payment.pix.expiresAt ? `; vale até ${formatTime(ride.payment.pix.expiresAt)}` : ''}.
        </AppText>
        <QrCodeView value={ride.payment.pix.copyPaste} size={180} label="QR code Pix da corrida" />
        <CopyField label="Pix copia e cola" value={ride.payment.pix.copyPaste} mono />
        <Button title="Já paguei" variant="outline" loading={paying} onPress={() => pay()} />
        <Button title="Pagar com cartão" variant="ghost" onPress={() => setPicker(true)} />
        <PaymentPicker visible={picker} selectedId={null} onSelect={(m) => void pay(m)} onClose={() => setPicker(false)} />
      </Stack>
    );
  }

  if (ride.payment.status === 'Pending') {
    return (
      <Card>
        <Row>
          <Icon name="time-outline" size={20} color={colors.warning} />
          <AppText variant="bodyStrong">Processando o pagamento de {formatCurrency(due)}…</AppText>
        </Row>
      </Card>
    );
  }

  if (can(ride, 'pay')) {
    return (
      <Stack>
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
          <Row>
            <Icon name="alert-circle" size={20} color={colors.danger} />
            <AppText variant="bodyStrong" color={colors.danger}>
              Pagamento não concluído
            </AppText>
          </Row>
          <AppText variant="small">
            {ride.payment.failureReason ?? 'Não conseguimos cobrar.'} Escolha outra forma de pagamento para quitar {formatCurrency(due)}.
          </AppText>
        </Card>
        <Button title={`Pagar ${formatCurrency(due)}`} size="lg" loading={paying} onPress={() => setPicker(true)} />
        <PaymentPicker visible={picker} selectedId={null} onSelect={(m) => void pay(m)} onClose={() => setPicker(false)} />
      </Stack>
    );
  }

  return null;
}
