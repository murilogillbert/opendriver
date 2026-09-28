import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { api } from '@/api/client';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { AppText, Card } from '@/components/ui/primitives';
import { alertError } from '@/lib/recovery';
import { colors } from '@/theme/tokens';

/** Relatar problema de segurança (RF15). Emergência → 190 sempre visível. */
export default function Report() {
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();
  const toast = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const valid = text.trim().length >= 10;

  const send = async () => {
    setSending(true);
    try {
      await api.safety.report(text.trim(), rideId || undefined);
      toast.success('Recebemos seu relato. Nossa equipe vai analisar.');
      router.back();
    } catch (err) {
      alertError(err, 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen footer={<Button title="Enviar relato" size="lg" disabled={!valid} loading={sending} onPress={send} />}>
      <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
        <AppText variant="bodyStrong">Está em perigo agora?</AppText>
        <Button title="Ligar 190" icon="call" variant="danger" onPress={() => void Linking.openURL('tel:190')} />
      </Card>
      <AppText>{rideId ? 'Conte o que aconteceu nesta corrida.' : 'Conte o que aconteceu.'} Só a equipe de segurança da OpenDriver vê este relato.</AppText>
      <TextField
        label="O que aconteceu?"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        hint={valid ? `${text.trim().length}/1000` : 'Escreva pelo menos 10 caracteres.'}
      />
    </Screen>
  );
}
