import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Vehicle } from '@/api/types';
import { DocumentPhotoField } from '@/components/ImagePickerField';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, QueryView } from '@/components/ui/States';
import { AppText, Badge, Card, Row } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError, confirm } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

const statusBadge: Record<Vehicle['status'], { label: string; tone: 'success' | 'info' | 'danger' }> = {
  Approved: { label: 'Aprovado', tone: 'success' },
  InReview: { label: 'Em análise', tone: 'info' },
  Rejected: { label: 'Recusado', tone: 'danger' },
};

/** Resultado da consulta automática ao Detran (plano §4) — 'Pending' não mostra nada (sem RENAVAM informado). */
const validationHint: Record<Vehicle['validationStatus'], string | null> = {
  Pending: null,
  Auto: 'Documento validado automaticamente ✅',
  Manual: 'Recebemos os dados, vamos revisar em breve.',
  Rejected: 'A consulta ao Detran encontrou uma restrição — fale com o suporte.',
};

/** Veículos (RF13): o selecionado é o usado nas corridas. */
export default function Vehicles() {
  const { me, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  const online = !!me?.driver?.isOnline;

  const select = async (v: Vehicle) => {
    try {
      queryClient.setQueryData(qk.driverProfile, await api.driver.selectVehicle(v.id));
      await refreshMe();
    } catch (err) {
      alertError(err);
    }
  };

  const remove = async (v: Vehicle) => {
    if (!(await confirm('Remover veículo?', `${v.brand} ${v.model} (${v.plate}) sairá da sua conta.`, 'Remover'))) return;
    try {
      await api.driver.removeVehicle(v.id);
      await queryClient.invalidateQueries({ queryKey: qk.driverProfile });
      await refreshMe();
    } catch (err) {
      alertError(err, 'Não foi possível remover');
    }
  };

  const uploadCrlv = (v: Vehicle) => async (file: Parameters<typeof api.driver.uploadCrlv>[1]) => {
    await api.driver.uploadCrlv(v.id, file);
    await queryClient.invalidateQueries({ queryKey: qk.driverProfile });
  };

  return (
    <QueryView query={q}>
      {(p) => (
        <Screen footer={<Button title="Adicionar veículo" icon="add" onPress={() => router.push('/driver/vehicle-new')} />}>
          {online ? <AppText variant="small">Fique offline para trocar ou remover o veículo.</AppText> : null}
          {p.vehicles.length === 0 ? (
            <EmptyState icon="car-sport-outline" title="Nenhum veículo" message="Cadastre o carro que você vai usar nas corridas." />
          ) : (
            p.vehicles.map((v) => {
              const current = v.id === p.currentVehicleId;
              return (
                <Card key={v.id} style={{ gap: spacing.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong">
                        {v.brand} {v.model} · {v.year}
                      </AppText>
                      <AppText variant="small">
                        {v.plate} · {v.color} · {v.category === 'Comfort' ? 'Conforto' : 'Econômico'}
                      </AppText>
                    </View>
                    <Badge label={statusBadge[v.status].label} tone={statusBadge[v.status].tone} />
                  </Row>
                  {v.rejectionReason ? <AppText variant="small">{v.rejectionReason}</AppText> : null}
                  {validationHint[v.validationStatus] ? <AppText variant="small">{validationHint[v.validationStatus]}</AppText> : null}
                  {v.wheelchairAccessible ? <Badge label="Adaptado p/ cadeira de rodas" tone="info" icon="accessibility-outline" /> : null}
                  <DocumentPhotoField label="CRLV" hint="Documento do veículo, legível." done={v.hasCrlv} aspect={[3, 4]} onUpload={uploadCrlv(v)} />
                  <Row gap={spacing.sm}>
                    {current ? (
                      <Badge label="Em uso" tone="brand" icon="checkmark" />
                    ) : (
                      <Button title="Usar este" variant="outline" size="sm" disabled={online} onPress={() => void select(v)} />
                    )}
                    <Button title="Remover" variant="ghost" size="sm" disabled={online} onPress={() => void remove(v)} />
                  </Row>
                </Card>
              );
            })
          )}
        </Screen>
      )}
    </QueryView>
  );
}
