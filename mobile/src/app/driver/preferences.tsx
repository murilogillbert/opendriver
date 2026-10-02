import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { DriverProfile, Gender } from '@/api/types';
import { GENDER_PURPOSE, GenderPicker } from '@/components/GenderPicker';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { AppText, Card, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

/**
 * Preferências de atendimento da motorista (plano §7) — gênero opt-in e a opção de só receber
 * ofertas de passageiras mulheres. Nada aqui é obrigatório para dirigir.
 */
export default function DriverPreferences() {
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  return <QueryView query={q}>{(p) => <PreferencesForm profile={p} />}</QueryView>;
}

function PreferencesForm({ profile }: { profile: DriverProfile }) {
  const queryClient = useQueryClient();
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [womenOnly, setWomenOnly] = useState(profile.womenOnlyPref);
  const [saving, setSaving] = useState(false);

  const choose = (v: Gender) => {
    setGender(v);
    if (v !== 'female') setWomenOnly(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.driver.setPreferences({ gender, womenOnlyPref: gender === 'female' ? womenOnly : false });
      queryClient.setQueryData(qk.driverProfile, p);
      await refreshMe();
      toast.success('Preferências salvas.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Salvar" size="lg" loading={saving} onPress={save} />}>
      <AppText variant="small">{GENDER_PURPOSE}</AppText>
      <GenderPicker value={gender} onChange={choose} disabled={saving} />

      {gender === 'female' ? (
        <>
          <SectionTitle title="Quem você atende" />
          <Card style={{ padding: spacing.xs }}>
            <SwitchRow
              title="Atender somente passageiras mulheres"
              subtitle="Você deixa de receber ofertas de corridas de outros passageiros."
              value={womenOnly}
              disabled={saving}
              onValueChange={setWomenOnly}
            />
          </Card>
          <AppText variant="small">Com o filtro ligado você recebe menos ofertas, então pode ficar mais tempo esperando corrida.</AppText>
        </>
      ) : (
        <AppText variant="small">
          Corridas pedidas por passageiras com a opção &quot;apenas mulheres&quot; são oferecidas somente a motoristas que se declararam
          mulheres.
        </AppText>
      )}
    </Screen>
  );
}
