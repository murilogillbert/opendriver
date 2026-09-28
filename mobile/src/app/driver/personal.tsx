import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { DriverProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { brDateToIso, isoToBrDate, maskDate, onlyDigits } from '@/lib/masks';
import { alertError } from '@/lib/recovery';

const CATEGORIES = ['B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'] as const;

/** Dados da CNH (RF12). Validação completa no servidor (dígitos da CNH, idade, validade). */
export default function DriverPersonal() {
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  return <QueryView query={q}>{(p) => <PersonalForm profile={p} />}</QueryView>;
}

function PersonalForm({ profile }: { profile: DriverProfile }) {
  const queryClient = useQueryClient();
  const [cnh, setCnh] = useState(profile.cnhNumber ?? '');
  const [category, setCategory] = useState<string>(profile.cnhCategory ?? 'B');
  const [expires, setExpires] = useState(isoToBrDate(profile.cnhExpiresAt));
  const [birth, setBirth] = useState(isoToBrDate(profile.birthDate));
  const [saving, setSaving] = useState(false);

  const locked = profile.status === 'Approved' || profile.status === 'Suspended';
  const expiresIso = brDateToIso(expires);
  const birthIso = brDateToIso(birth);
  const valid = onlyDigits(cnh).length === 11 && !!expiresIso && !!birthIso;

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.driver.updateData({ cnhNumber: onlyDigits(cnh), cnhCategory: category, cnhExpiresAt: expiresIso!, birthDate: birthIso! });
      queryClient.setQueryData(qk.driverProfile, p);
      router.back();
    } catch (err) {
      alertError(err, 'Confira os dados');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={locked ? null : <Button title="Salvar" size="lg" disabled={!valid} loading={saving} onPress={save} />}>
      {locked ? <AppText variant="small">Seus dados já foram aprovados. Para alterar, fale com o suporte.</AppText> : null}
      <TextField label="Número da CNH (registro)" value={cnh} onChangeText={(v) => setCnh(onlyDigits(v).slice(0, 11))} keyboardType="number-pad" editable={!locked} hint="11 dígitos, no campo 'Nº Registro'." />
      <AppText variant="label">Categoria</AppText>
      <Segmented
        accessibilityLabel="Categoria da CNH"
        value={(CATEGORIES as readonly string[]).includes(category) ? category : 'B'}
        onChange={(v) => !locked && setCategory(v)}
        options={CATEGORIES.slice(0, 4).map((c) => ({ value: c, label: c }))}
      />
      <Segmented
        accessibilityLabel="Outras categorias da CNH"
        value={(CATEGORIES as readonly string[]).includes(category) ? category : 'B'}
        onChange={(v) => !locked && setCategory(v)}
        options={CATEGORIES.slice(4).map((c) => ({ value: c, label: c }))}
      />
      <TextField label="Validade da CNH" placeholder="DD/MM/AAAA" value={expires} onChangeText={(v) => setExpires(maskDate(v))} keyboardType="number-pad" editable={!locked} error={expires.length === 10 && !expiresIso ? 'Data inválida.' : undefined} />
      <TextField label="Data de nascimento" placeholder="DD/MM/AAAA" value={birth} onChangeText={(v) => setBirth(maskDate(v))} keyboardType="number-pad" editable={!locked} error={birth.length === 10 && !birthIso ? 'Data inválida.' : undefined} />
    </Screen>
  );
}
