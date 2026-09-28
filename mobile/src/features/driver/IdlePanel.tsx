import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { BottomPanel } from '@/components/ride/BottomPanel';
import { Button } from '@/components/ui/Button';
import { AppText, Badge, Card, Row, Stack, Stat } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/format';
import { alertError } from '@/lib/recovery';
import { useStore } from '@/lib/store';
import { pushCurrentLocationNow, startDriverTracking, stopDriverTracking, trackingModeStore } from '@/services/driverTracking';
import { colors, spacing } from '@/theme/tokens';

/**
 * Motorista sem corrida: a ação dominante é Ficar online / Ficar offline.
 * Cadastro pendente → diz o que falta e leva direto ao passo.
 */
export function IdlePanel({ onHeight }: { onHeight: (h: number) => void }) {
  const { me, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const trackingMode = useStore(trackingModeStore);
  const [busy, setBusy] = useState(false);
  const profile = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  const summary = useQuery({ queryKey: qk.earningsSummary, queryFn: () => api.driver.earningsSummary(), enabled: me?.driver?.status === 'Approved' });

  const status = me?.driver?.status ?? profile.data?.status;
  const online = !!me?.driver?.isOnline;
  const vehicle = profile.data?.vehicles.find((v) => v.id === profile.data?.currentVehicleId);

  const goOnline = async () => {
    setBusy(true);
    try {
      await api.driver.online(); // valida cadastro/veículo com motivo claro
      const mode = await startDriverTracking();
      if (mode === 'denied') {
        await api.driver.offline().catch(() => undefined);
        Alert.alert('Localização necessária', 'Para receber corridas, o app precisa da sua localização. Libere nos Ajustes.', [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      await pushCurrentLocationNow();
      await refreshMe();
      void queryClient.invalidateQueries({ queryKey: qk.offer });
    } catch (err) {
      alertError(err, 'Não foi possível ficar online');
      await refreshMe();
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    try {
      await api.driver.offline();
      await stopDriverTracking();
      await refreshMe();
    } catch (err) {
      alertError(err, 'Não foi possível ficar offline');
    } finally {
      setBusy(false);
    }
  };

  if (status && status !== 'Approved') {
    const text = {
      PendingDocuments: { title: 'Complete seu cadastro', body: 'Envie seus dados, fotos, veículo e chave Pix para começar a dirigir.', cta: 'Continuar cadastro' },
      InReview: { title: 'Cadastro em análise', body: 'Estamos conferindo seus documentos. Avisaremos por notificação assim que terminar.', cta: 'Ver cadastro' },
      Rejected: {
        title: 'Seu cadastro precisa de ajustes',
        body: me?.driver?.rejectionReason ?? profile.data?.rejectionReason ?? 'Confira os itens e envie de novo.',
        cta: 'Corrigir cadastro',
      },
      Suspended: { title: 'Conta de motorista suspensa', body: 'Fale com o suporte para entender o motivo.', cta: 'Ver cadastro' },
    }[status];
    return (
      <BottomPanel onHeight={onHeight} footer={<Button title={text.cta} size="lg" onPress={() => router.push('/driver/onboarding')} />}>
        <AppText variant="subtitle">{text.title}</AppText>
        <AppText>{text.body}</AppText>
      </BottomPanel>
    );
  }

  return (
    <BottomPanel
      onHeight={onHeight}
      footer={
        online ? (
          <Button title="Ficar offline" variant="outline" size="lg" loading={busy} onPress={goOffline} />
        ) : (
          <Button title="Ficar online" size="lg" loading={busy} onPress={goOnline} />
        )
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="subtitle">{online ? 'Você está online' : 'Você está offline'}</AppText>
        <Badge label={online ? 'Recebendo corridas' : 'Sem corridas'} tone={online ? 'success' : 'neutral'} icon={online ? 'radio' : 'moon-outline'} />
      </Row>
      {online && trackingMode === 'foreground' ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
          <AppText variant="small">
            Mantenha o app aberto. Para receber corridas com a tela bloqueada, permita a localização “Sempre” nos Ajustes.
          </AppText>
          <Button title="Abrir Ajustes" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => void Linking.openSettings()} />
        </Card>
      ) : null}
      {vehicle ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="small">
            {vehicle.brand} {vehicle.model} · {vehicle.plate}
          </AppText>
          {!online ? <Button title="Trocar" variant="ghost" size="sm" onPress={() => router.push('/driver/vehicles')} /> : null}
        </Row>
      ) : null}
      {summary.data ? (
        <Stack gap={spacing.sm}>
          <Row gap={spacing.sm}>
            <View style={{ flex: 1 }}>
              <Stat label="Hoje" value={formatCurrency(summary.data.today)} hint={`${summary.data.ridesToday} corrida${summary.data.ridesToday === 1 ? '' : 's'}`} />
            </View>
            <View style={{ flex: 1 }}>
              <Stat label="Disponível" value={formatCurrency(summary.data.withdrawable)} />
            </View>
          </Row>
        </Stack>
      ) : null}
    </BottomPanel>
  );
}
