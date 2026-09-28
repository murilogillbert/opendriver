import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Checkbox, ListRow, SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Card, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { formatPhone } from '@/lib/format';
import { maskPhone } from '@/lib/masks';
import { alertError, confirm } from '@/lib/recovery';
import { isPhone } from '@/lib/validation';
import { colors, spacing } from '@/theme/tokens';

/** Segurança (RF15/RF16): contatos de confiança e gravação de áudio opt-in. */
export default function Safety() {
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const contacts = useQuery({ queryKey: qk.contacts, queryFn: () => api.me.contacts() });
  const terms = useQuery({ queryKey: qk.recordingTerms, queryFn: () => api.me.recordingTerms() });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const enabled = !!me?.passenger?.recordingEnabled;

  const add = useMutation({
    mutationFn: () => api.me.addContact(name.trim(), phone),
    onSuccess: (list) => {
      queryClient.setQueryData(qk.contacts, list);
      setName('');
      setPhone('');
      setAdding(false);
    },
    onError: (err) => alertError(err, 'Não foi possível adicionar'),
  });

  const remove = async (id: string, contactName: string) => {
    if (!(await confirm('Remover contato?', `${contactName} deixará de ser um contato de confiança.`, 'Remover'))) return;
    try {
      queryClient.setQueryData(qk.contacts, await api.me.removeContact(id));
    } catch (err) {
      alertError(err);
    }
  };

  const setRecording = async (on: boolean) => {
    if (on && !agree) {
      Alert.alert('Confirme os termos', 'Marque que leu e concorda com a gravação para ativar.');
      return;
    }
    setSaving(true);
    try {
      await api.me.setRecording(on, on ? terms.data?.consentVersion : undefined);
      await refreshMe();
      toast.success(on ? 'Gravação ativada.' : 'Gravação desativada.');
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
      void terms.refetch(); // termos podem ter mudado de versão
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SectionTitle title="Contatos de confiança" />
      <AppText variant="small">Durante uma corrida, você avisa essas pessoas com 1 toque, enviando sua localização.</AppText>
      <Card style={{ padding: spacing.xs }}>
        {(contacts.data ?? []).map((c) => (
          <ListRow
            key={c.id}
            icon="person-outline"
            title={c.name}
            subtitle={formatPhone(c.phone)}
            chevron={false}
            right={<Button title="Remover" variant="ghost" size="sm" onPress={() => void remove(c.id, c.name)} />}
          />
        ))}
        {!adding ? <ListRow icon="person-add-outline" title="Adicionar contato" onPress={() => setAdding(true)} /> : null}
      </Card>
      {adding ? (
        <Card style={{ gap: spacing.md }}>
          <TextField label="Nome" value={name} onChangeText={setName} autoComplete="name" />
          <TextField label="Celular" value={phone} onChangeText={(v) => setPhone(maskPhone(v))} keyboardType="phone-pad" />
          <Button title="Salvar contato" disabled={name.trim().length < 2 || !isPhone(phone)} loading={add.isPending} onPress={() => add.mutate()} />
          <Button title="Voltar" variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : null}

      <SectionTitle title="Gravação de áudio" />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="small">{terms.data?.text ?? 'Carregando os termos…'}</AppText>
        {!enabled ? <Checkbox label="Li e concordo com a gravação das minhas viagens" checked={agree} onChange={setAgree} /> : null}
        <SwitchRow
          title="Gravar áudio das viagens"
          subtitle={enabled ? `Ativa · guardado por ${terms.data?.retentionDays ?? 30} dias, criptografado` : 'Desativada'}
          value={enabled}
          disabled={saving || !terms.data}
          onValueChange={(v) => void setRecording(v)}
        />
        {enabled ? (
          <AppText variant="small" color={colors.textMuted}>
            O app pede acesso ao microfone na primeira viagem e mostra “Gravando áudio” enquanto grava.
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}
