import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { DriverProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { AppText, Card, Icon } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError } from '@/lib/recovery';
import { colors, spacing } from '@/theme/tokens';

function steps(p: DriverProfile): { key: string; title: string; done: boolean; href: Href }[] {
  return [
    { key: 'personal', title: 'Dados da CNH', done: p.checklist.personalData, href: '/driver/personal' },
    { key: 'docs', title: 'Fotos da CNH e selfie', done: p.checklist.cnhPhoto && p.checklist.selfie, href: '/driver/documents' },
    { key: 'vehicle', title: 'Veículo e CRLV', done: p.checklist.vehicle, href: '/driver/vehicles' },
    { key: 'pix', title: 'Chave Pix para receber', done: p.checklist.pixKey, href: '/driver/pix' },
  ];
}

/** Cadastro do motorista (RF12/RF13): checklist com o próximo passo em destaque. */
export default function Onboarding() {
  const { refreshMe, setMode } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      queryClient.setQueryData(qk.driverProfile, await api.driver.submit());
      await refreshMe();
    } catch (err) {
      alertError(err, 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <QueryView query={q}>
      {(p) => {
        const list = steps(p);
        const next = list.find((s) => !s.done);
        const editable = p.status === 'PendingDocuments' || p.status === 'Rejected';
        const footer =
          p.status === 'Approved' ? (
            <Button
              title="Ir para Dirigir"
              size="lg"
              onPress={() => {
                setMode('driver');
                router.navigate('/drive');
              }}
            />
          ) : editable && next ? (
            <Button title={`Continuar: ${next.title}`} size="lg" onPress={() => router.push(next.href)} />
          ) : editable ? (
            <Button title="Enviar para análise" size="lg" loading={sending} onPress={submit} />
          ) : null;

        return (
          <Screen footer={footer} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
            {p.status === 'InReview' ? (
              <Card style={{ backgroundColor: colors.blueSoft, borderColor: colors.blueSoft }}>
                <AppText variant="bodyStrong">Cadastro em análise</AppText>
                <AppText variant="small">Avisaremos por notificação. Normalmente leva até 2 dias úteis.</AppText>
              </Card>
            ) : p.status === 'Rejected' ? (
              <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
                <AppText variant="bodyStrong">Precisamos de ajustes</AppText>
                <AppText variant="small">{p.rejectionReason ?? 'Confira os itens abaixo e envie de novo.'}</AppText>
              </Card>
            ) : p.status === 'Approved' ? (
              <Card style={{ backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
                <AppText variant="bodyStrong">Cadastro aprovado!</AppText>
                <AppText variant="small">Você já pode ficar online e receber corridas.</AppText>
              </Card>
            ) : p.status === 'Suspended' ? (
              <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
                <AppText variant="bodyStrong">Conta de motorista suspensa</AppText>
                <AppText variant="small">Fale com o suporte para saber mais.</AppText>
              </Card>
            ) : (
              <AppText>Complete os itens abaixo. Leva poucos minutos.</AppText>
            )}
            <Card style={{ padding: spacing.xs }}>
              {list.map((s) => (
                <ListRow
                  key={s.key}
                  icon={s.done ? 'checkmark-circle' : 'ellipse-outline'}
                  title={s.title}
                  subtitle={s.done ? 'Concluído' : 'Pendente'}
                  right={s.done ? <Icon name="checkmark" size={18} color={colors.success} /> : null}
                  onPress={() => router.push(s.href)}
                />
              ))}
            </Card>
          </Screen>
        );
      }}
    </QueryView>
  );
}
