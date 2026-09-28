import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Card } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError, confirm } from '@/lib/recovery';
import { colors } from '@/theme/tokens';

/**
 * Exclusão de conta dentro do app (exigência da App Store e do Google Play).
 * A conta é compartilhada com o Hub: excluir aqui encerra os dois.
 */
export default function DeleteAccount() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!(await confirm('Excluir conta?', 'Esta ação não pode ser desfeita.', 'Excluir definitivamente'))) return;
    setBusy(true);
    try {
      await api.me.deleteAccount(password);
      await signOut();
    } catch (err) {
      alertError(err, 'Não foi possível excluir');
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Excluir minha conta" variant="danger" size="lg" disabled={!password} loading={busy} onPress={remove} />}>
      <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, gap: 8 }}>
        <AppText variant="bodyStrong">O que acontece</AppText>
        <AppText variant="small">• Sua conta OpenDriver e OpenDriverHub é encerrada (é a mesma conta).</AppText>
        <AppText variant="small">• Seus dados pessoais são anonimizados. Registros de corridas e pagamentos são mantidos pelo prazo exigido por lei, sem identificar você.</AppText>
        <AppText variant="small">• Saldo de cashback e cartões salvos são perdidos.</AppText>
        <AppText variant="small">• Não é possível excluir durante uma corrida em andamento.</AppText>
      </Card>
      <TextField label="Confirme com sua senha" value={password} onChangeText={setPassword} password autoComplete="current-password" />
    </Screen>
  );
}
