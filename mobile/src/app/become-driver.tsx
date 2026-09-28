import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { AppText, Card, Icon, Row, Stack } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { alertError } from '@/lib/recovery';
import { colors } from '@/theme/tokens';

const STEPS: { icon: 'id-card-outline' | 'camera-outline' | 'car-sport-outline' | 'key-outline'; text: string }[] = [
  { icon: 'id-card-outline', text: 'Dados da CNH (categoria B ou superior, com EAR)' },
  { icon: 'camera-outline', text: 'Foto da CNH e uma selfie' },
  { icon: 'car-sport-outline', text: 'Veículo de até 15 anos e foto do CRLV' },
  { icon: 'key-outline', text: 'Chave Pix para receber seus ganhos' },
];

/** RF12: qualquer passageiro pode se cadastrar como motorista. */
export default function BecomeDriver() {
  const { becomeDriver } = useAuth();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await becomeDriver();
      router.replace('/driver/onboarding');
    } catch (err) {
      alertError(err, 'Não foi possível iniciar o cadastro');
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Começar cadastro" size="lg" loading={busy} onPress={start} />}>
      <AppText variant="title">Dirija e ganhe com a OpenDriver</AppText>
      <AppText>Você define quando fica online. Os ganhos caem no seu saldo e você saca por Pix.</AppText>
      <Card>
        <Stack>
          <AppText variant="bodyStrong">Você vai precisar de:</AppText>
          {STEPS.map((s) => (
            <Row key={s.text} gap={12}>
              <Icon name={s.icon} size={20} color={colors.navy} />
              <AppText style={{ flex: 1 }}>{s.text}</AppText>
            </Row>
          ))}
        </Stack>
      </Card>
      <AppText variant="small">Você continua podendo pedir corridas normalmente.</AppText>
    </Screen>
  );
}
