import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { alertError } from '@/lib/recovery';
import { passwordProblem } from '@/lib/validation';

export default function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const problem = next ? passwordProblem(next) : null;

  const save = async () => {
    setSaving(true);
    try {
      await api.me.changePassword(current, next);
      toast.success('Senha alterada. Vale também no Hub.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível alterar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Alterar senha" size="lg" disabled={!current || !next || !!problem} loading={saving} onPress={save} />}>
      <TextField label="Senha atual" value={current} onChangeText={setCurrent} password autoComplete="current-password" textContentType="password" />
      <TextField
        label="Nova senha"
        value={next}
        onChangeText={setNext}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Mínimo de 8 caracteres, com letras e números."
        error={problem ?? undefined}
      />
    </Screen>
  );
}
