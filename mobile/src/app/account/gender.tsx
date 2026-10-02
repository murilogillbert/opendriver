import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import type { Gender } from '@/api/types';
import { GENDER_PURPOSE, GenderPicker } from '@/components/GenderPicker';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { AppText, Card, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError } from '@/lib/recovery';
import { spacing } from '@/theme/tokens';

/**
 * Corridas apenas com mulheres (plano §7) — coleta de gênero da passageira, opt-in.
 *
 * A preferência salva só aparece depois de "Mulher" estar escolhido: oferecer o alternador antes
 * disso prometeria algo que o servidor recusaria (ele valida de novo — UX11).
 */
export default function AccountGender() {
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const [gender, setGender] = useState<Gender>(me?.passenger?.gender ?? null);
  const [womenOnly, setWomenOnly] = useState(!!me?.passenger?.womenOnlyPref);
  const [saving, setSaving] = useState(false);

  // Trocar pra outra opção derruba a preferência — o servidor faz o mesmo, aqui é só não mentir na tela.
  const choose = (v: Gender) => {
    setGender(v);
    if (v !== 'female') setWomenOnly(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.me.setGender(gender);
      if (gender === 'female') await api.me.setWomenOnly(womenOnly);
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
          <SectionTitle title="Preferência de corrida" />
          <Card style={{ padding: spacing.xs }}>
            <SwitchRow
              title="Apenas motoristas mulheres"
              subtitle="Suas corridas passam a ser oferecidas somente a motoristas mulheres. Você pode mudar a cada corrida."
              value={womenOnly}
              disabled={saving}
              onValueChange={setWomenOnly}
            />
          </Card>
          <AppText variant="small">
            Com a busca restrita, pode levar mais tempo para encontrar alguém — avisamos se não houver motorista mulher por perto.
          </AppText>
        </>
      ) : null}
    </Screen>
  );
}
