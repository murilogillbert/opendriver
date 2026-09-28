import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { RemoteImage } from '@/components/Media';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { ListRow, SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { AppText, Card, Icon, Row, SectionTitle } from '@/components/ui/primitives';
import { links } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useActiveRide } from '@/context/RealtimeContext';
import { formatCurrency } from '@/lib/format';
import { alertError, confirm } from '@/lib/recovery';
import { isActive } from '@/lib/ride';
import { colors, spacing } from '@/theme/tokens';

const driverStatusText: Record<string, string> = {
  PendingDocuments: 'Cadastro incompleto',
  InReview: 'Em análise',
  Approved: 'Aprovado',
  Rejected: 'Precisa de ajustes',
  Suspended: 'Suspenso',
};

/** Aba Conta (passageiro e motorista): menus agrupados, só o que se aplica ao modo. */
export function AccountScreen() {
  const { me, mode, isDriver, setMode, signOut } = useAuth();
  const toast = useToast();
  const { data: ride } = useActiveRide();
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inRide = isActive(ride);

  const resend = async () => {
    if (!me) return;
    setSending(true);
    try {
      await api.auth.resendVerification(me.email);
      toast.success('Enviamos o link para o seu e-mail.');
    } catch (err) {
      alertError(err);
    } finally {
      setSending(false);
    }
  };

  const logout = async () => {
    const online = !!me?.driver?.isOnline;
    if (!(await confirm('Sair da conta?', online ? 'Você será colocado offline e deixará de receber corridas.' : 'Você precisará entrar de novo neste aparelho.', 'Sair'))) return;
    setLeaving(true);
    await signOut();
  };

  const rating = mode === 'driver' ? me?.driver?.rating : me?.passenger?.rating;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Screen edges={[]}>
        <Row gap={spacing.md}>
          <RemoteImage uri={me?.avatarUrl} style={styles.avatar} rounded={32} accessibilityLabel="Sua foto" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="subtitle">{me?.name ?? 'Sua conta'}</AppText>
            <AppText variant="small">{me?.email}</AppText>
            {rating ? (
              <Row gap={4}>
                <Icon name="star" size={14} color={colors.warning} />
                <AppText variant="small">{rating.toFixed(1).replace('.', ',')}</AppText>
              </Row>
            ) : null}
          </View>
        </Row>

        {me && !me.emailVerifiedAt ? (
          <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
            <AppText variant="bodyStrong">Confirme seu e-mail</AppText>
            <AppText variant="small">Enviamos um link para {me.email}. A confirmação é necessária para sacar ganhos.</AppText>
            <Button title="Reenviar e-mail" variant="outline" size="sm" loading={sending} onPress={resend} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}

        {isDriver ? (
          <Card style={{ padding: spacing.xs }}>
            <SwitchRow
              title="Modo motorista"
              subtitle={inRide ? 'Indisponível durante uma corrida' : mode === 'driver' ? 'Você está vendo a tela de dirigir' : 'Toque para dirigir'}
              value={mode === 'driver'}
              disabled={inRide}
              onValueChange={(v) => setMode(v ? 'driver' : 'passenger')}
            />
          </Card>
        ) : me && ['passenger', 'driver'].includes(me.role) ? (
          <Card style={{ padding: spacing.xs }}>
            <ListRow icon="car-outline" title="Quero dirigir" subtitle="Ganhe dinheiro com seu carro" onPress={() => router.push('/become-driver')} />
          </Card>
        ) : null}

        {mode === 'driver' && isDriver ? (
          <>
            <SectionTitle title="Motorista" />
            <Card style={{ padding: spacing.xs }}>
              <ListRow
                icon="id-card-outline"
                title="Cadastro e documentos"
                subtitle={me?.driver ? driverStatusText[me.driver.status] : undefined}
                onPress={() => router.push('/driver/onboarding')}
              />
              <ListRow icon="car-sport-outline" title="Veículos" onPress={() => router.push('/driver/vehicles')} />
              <ListRow icon="key-outline" title="Chave Pix para receber" subtitle={me?.driver?.hasPixKey ? 'Cadastrada' : 'Não cadastrada'} onPress={() => router.push('/driver/pix')} />
              <ListRow icon="list-outline" title="Corridas realizadas" onPress={() => router.push({ pathname: '/rides', params: { role: 'driver' } })} />
            </Card>
          </>
        ) : (
          <>
            <SectionTitle title="Viagens" />
            <Card style={{ padding: spacing.xs }}>
              <ListRow icon="list-outline" title="Minhas viagens" onPress={() => router.push({ pathname: '/rides', params: { role: 'passenger' } })} />
              <ListRow
                icon="wallet-outline"
                title="Pagamento"
                subtitle={me?.cashbackBalance ? `Cashback do Hub: ${formatCurrency(me.cashbackBalance)}` : 'Cartões e Pix'}
                onPress={() => router.push('/payments')}
              />
              <ListRow icon="bookmark-outline" title="Locais salvos" onPress={() => router.push('/places')} />
            </Card>
          </>
        )}

        <SectionTitle title="Segurança" />
        <Card style={{ padding: spacing.xs }}>
          <ListRow
            icon="shield-checkmark-outline"
            title="Contatos e gravação"
            subtitle={me?.passenger?.recordingEnabled ? 'Gravação de áudio ativada' : 'Contatos de confiança e gravação de áudio'}
            onPress={() => router.push('/safety')}
          />
          <ListRow icon="flag-outline" title="Relatar um problema" onPress={() => router.push('/safety/report')} />
        </Card>

        <SectionTitle title="Conta" />
        <Card style={{ padding: spacing.xs }}>
          <ListRow icon="person-outline" title="Dados pessoais" onPress={() => router.push('/account/profile')} />
          <ListRow icon="lock-closed-outline" title="Alterar senha" onPress={() => router.push('/account/password')} />
          <ListRow icon="document-text-outline" title="Termos de uso" onPress={() => void WebBrowser.openBrowserAsync(links.terms)} />
          <ListRow icon="eye-outline" title="Privacidade" onPress={() => void WebBrowser.openBrowserAsync(links.privacyPolicy)} />
          <ListRow icon="information-circle-outline" title="Sobre e suporte" onPress={() => router.push('/about')} />
        </Card>

        <Button title="Sair" variant="outline" icon="log-out-outline" loading={leaving} onPress={logout} />
        <Button title="Excluir minha conta" variant="ghost" onPress={() => router.push('/account/delete')} />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64 },
});
