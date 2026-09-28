import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import { TermsConsent } from '@/components/TermsConsent';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { maskCpf, maskPhone, onlyDigits } from '@/lib/masks';
import { isCpf, isEmail, isPhone, passwordProblem } from '@/lib/validation';
import { colors } from '@/theme/tokens';

type Role = 'Passenger' | 'Driver';
type Errors = Partial<Record<'name' | 'email' | 'phone' | 'cpf' | 'password' | 'terms' | 'form', string>>;

export default function Register() {
  const { signUp } = useAuth();
  const [role, setRole] = useState<Role>('Passenger');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().split(/\s+/).length < 2 || name.trim().length < 3) e.name = 'Informe nome e sobrenome.';
    if (!isEmail(email)) e.email = 'Confira o e-mail digitado.';
    if (!isPhone(phone)) e.phone = 'Use DDD + número.';
    // CPF é exigido pelo gateway para cobrar (cartão/Pix) e pagar motoristas.
    if (!isCpf(cpf)) e.cpf = 'CPF inválido.';
    const p = passwordProblem(password);
    if (p) e.password = p;
    if (!terms) e.terms = 'Para continuar, aceite os termos.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: onlyDigits(phone),
        cpf: onlyDigits(cpf),
        role,
      });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<Button title="Criar conta" size="lg" loading={loading} onPress={submit} />}>
      <Segmented
        accessibilityLabel="Como você quer usar o app"
        value={role}
        onChange={setRole}
        options={[
          { value: 'Passenger', label: 'Quero pedir corridas' },
          { value: 'Driver', label: 'Quero dirigir' },
        ]}
      />
      {role === 'Driver' ? (
        <AppText variant="small">Depois da conta criada, você envia CNH, selfie e dados do carro. Também poderá pedir corridas.</AppText>
      ) : null}
      <TextField label="Nome completo" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={errors.email}
      />
      <TextField
        label="Celular"
        value={phone}
        onChangeText={(v) => setPhone(maskPhone(v))}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={errors.phone}
      />
      <TextField
        label="CPF"
        value={cpf}
        onChangeText={(v) => setCpf(maskCpf(v))}
        keyboardType="number-pad"
        hint="Usado nos pagamentos. Não aparece para motoristas ou passageiros."
        error={errors.cpf}
      />
      <TextField
        label="Senha"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Mínimo de 8 caracteres, com letras e números."
        error={errors.password}
      />
      <TermsConsent checked={terms} onChange={setTerms} error={errors.terms} />
      {errors.form ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {errors.form}
        </AppText>
      ) : null}
    </Screen>
  );
}
