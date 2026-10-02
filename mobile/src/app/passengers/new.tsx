import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Card } from '@/components/ui/primitives';
import { brDateToIso, maskCpf, maskDate, maskPhone, onlyDigits } from '@/lib/masks';
import { alertError } from '@/lib/recovery';
import { isCpf, isPhone } from '@/lib/validation';
import { spacing } from '@/theme/tokens';

const ADULT_AGE = 18;

/** Anos completos numa data — espelha `ageOn` do backend, só pra avisar antes de enviar. */
function ageFromIso(iso: string): number | null {
  const birth = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/**
 * Cadastro de dependente sem conta na plataforma (corrida para terceiros). Nome completo, CPF e
 * nascimento são obrigatórios: é o que identifica quem embarca, já que não existe conta por trás.
 * Validação completa no servidor — aqui é só para não mandar o que já sabemos estar errado.
 */
export default function NewGuestPassenger() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const birthIso = brDateToIso(birth);
  const age = birthIso ? ageFromIso(birthIso) : null;
  const errors = {
    name: name.trim().length > 0 && name.trim().length < 3 ? 'Informe o nome completo.' : undefined,
    cpf: cpf.length > 0 && !isCpf(cpf) ? 'CPF inválido.' : undefined,
    birth: birth.length === 10 && (!birthIso || age === null || age < 0) ? 'Data inválida.' : undefined,
    phone: phone.length > 0 && !isPhone(phone) ? 'Use DDD + número.' : undefined,
  };
  const valid = name.trim().length >= 3 && isCpf(cpf) && !!birthIso && !errors.birth && (!phone || isPhone(phone));

  const save = async () => {
    setSaving(true);
    try {
      await api.passengers.addGuest({
        name: name.trim(),
        cpf: onlyDigits(cpf),
        birthDate: birthIso!,
        phone: phone ? onlyDigits(phone) : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: qk.guestPassengers });
      toast.success('Passageiro cadastrado.');
      router.back();
    } catch (err) {
      alertError(err, 'Confira os dados');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Salvar" size="lg" disabled={!valid} loading={saving} onPress={save} />}>
      <AppText variant="small">
        Use para quem não tem conta na OpenDriver. Esses dados ficam guardados com você e com o suporte; o motorista vê apenas o primeiro
        nome de quem embarca.
      </AppText>
      <TextField label="Nome completo" value={name} onChangeText={setName} autoCapitalize="words" maxLength={100} error={errors.name} />
      <TextField
        label="CPF"
        value={cpf}
        onChangeText={(v) => setCpf(maskCpf(v))}
        keyboardType="number-pad"
        error={errors.cpf}
        hint="Identifica quem embarca em caso de ocorrência."
      />
      <TextField
        label="Data de nascimento"
        placeholder="DD/MM/AAAA"
        value={birth}
        onChangeText={(v) => setBirth(maskDate(v))}
        keyboardType="number-pad"
        error={errors.birth}
      />
      <TextField
        label="Telefone (opcional)"
        value={phone}
        onChangeText={(v) => setPhone(maskPhone(v))}
        keyboardType="phone-pad"
        error={errors.phone}
      />

      {age !== null && age >= 0 && age < ADULT_AGE ? (
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="bodyStrong">Passageiro menor de idade</AppText>
          <AppText variant="small">
            A cada corrida você precisará confirmar que um adulto responsável embarca junto. Menor de {ADULT_AGE} anos não pode viajar
            sozinho.
          </AppText>
        </Card>
      ) : null}
    </Screen>
  );
}
