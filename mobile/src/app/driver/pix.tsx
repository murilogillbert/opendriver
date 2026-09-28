import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { DriverProfile, PixKeyType } from '@/api/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { maskPixKey } from '@/lib/masks';
import { alertError } from '@/lib/recovery';

const TYPES: { value: PixKeyType; label: string }[] = [
  { value: 'CPF', label: 'CPF' },
  { value: 'Phone', label: 'Celular' },
  { value: 'Email', label: 'E-mail' },
  { value: 'Random', label: 'Aleatória' },
];

/** Chave Pix de recebimento (RF14). Padrão inteligente: o próprio CPF. */
export default function DriverPix() {
  const q = useQuery({ queryKey: qk.driverProfile, queryFn: () => api.driver.profile() });
  return <QueryView query={q}>{(p) => <PixForm profile={p} />}</QueryView>;
}

function initialKey(p: DriverProfile, cpf: string | null): { type: PixKeyType; key: string } {
  if (!p.pixKey || !p.pixKeyType) return { type: 'CPF', key: maskPixKey(cpf ?? '', 'CPF') };
  const type = p.pixKeyType === 'CNPJ' ? 'CPF' : p.pixKeyType;
  return { type, key: p.pixKeyType === 'Phone' ? maskPixKey(p.pixKey.replace(/^\+55/, ''), 'Phone') : maskPixKey(p.pixKey, p.pixKeyType) };
}

function PixForm({ profile }: { profile: DriverProfile }) {
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [initial] = useState(() => initialKey(profile, me?.cpf ?? null));
  const [type, setType] = useState<PixKeyType>(initial.type);
  const [key, setKey] = useState(initial.key);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const existing = profile.pixKey;

  const changeType = (t: PixKeyType) => {
    setType(t);
    setKey(t === 'CPF' ? maskPixKey(me?.cpf ?? '', 'CPF') : t === 'Email' ? (me?.email ?? '') : t === 'Phone' ? maskPixKey(me?.phone ?? '', 'Phone') : '');
  };

  const save = async () => {
    setSaving(true);
    try {
      queryClient.setQueryData(qk.driverProfile, await api.driver.setPix(type, key, existing ? password : undefined));
      await refreshMe();
      toast.success('Chave Pix salva.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Button title="Salvar chave" size="lg" disabled={!key.trim() || (!!existing && !password)} loading={saving} onPress={save} />}>
      <AppText>Seus saques vão para esta chave. Ela precisa estar no seu nome.</AppText>
      <Segmented accessibilityLabel="Tipo de chave Pix" value={type} onChange={changeType} options={TYPES} />
      <TextField
        label="Chave Pix"
        value={key}
        onChangeText={(v) => setKey(maskPixKey(v, type))}
        keyboardType={type === 'CPF' || type === 'Phone' ? 'number-pad' : type === 'Email' ? 'email-address' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {existing ? (
        <TextField label="Sua senha" value={password} onChangeText={setPassword} password autoComplete="current-password" hint="Por segurança, confirme a senha para trocar a chave." />
      ) : null}
    </Screen>
  );
}
