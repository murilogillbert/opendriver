import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Card, Icon, Row } from '@/components/ui/primitives';
import { isEmail } from '@/lib/validation';
import { colors } from '@/theme/tokens';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!isEmail(email)) return setError('Confira o e-mail digitado.');
    setError(null);
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Screen footer={<Button title="Voltar para entrar" size="lg" onPress={() => router.back()} />}>
        <Card>
          <Row>
            <Icon name="mail-open-outline" size={28} color={colors.success} />
            <AppText variant="subtitle">Confira seu e-mail</AppText>
          </Row>
          <AppText>
            Se houver uma conta com {email.trim()}, enviamos um link para criar uma nova senha. O link vale por 1 hora.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title="Enviar link" size="lg" loading={loading} onPress={submit} />}>
      <AppText>Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</AppText>
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={error ?? undefined}
        returnKeyType="send"
        onSubmitEditing={submit}
      />
    </Screen>
  );
}
