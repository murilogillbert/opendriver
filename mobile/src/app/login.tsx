import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { isEmail } from '@/lib/validation';
import { colors } from '@/theme/tokens';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!isEmail(email)) return setError('Confira o e-mail digitado.');
    if (!password) return setError('Informe a senha.');
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // O guard de rotas leva para a tela certa.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<Button title="Entrar" size="lg" loading={loading} onPress={submit} />}>
      <AppText variant="small">Use o mesmo e-mail e senha do OpenDriverHub, se já tiver conta.</AppText>
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Link href="/forgot-password" style={{ color: colors.blue, fontWeight: '600' }}>
        Esqueci minha senha
      </Link>
    </Screen>
  );
}
