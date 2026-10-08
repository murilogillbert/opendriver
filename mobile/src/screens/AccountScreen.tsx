import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { uploadImage } from '@/api/uploadImage';
import { Avatar } from '@/components/Avatar';
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
  const { me, mode, isDriver, setMode, signOut, refreshMe } = useAuth();
  const toast = useToast();
  const { data: ride } = useActiveRide();
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [savingAccessibility, setSavingAccessibility] = useState(false);
  const [fotoBusy, setFotoBusy] = useState(false);
  const inRide = isActive(ride);

  /**
   * Troca da foto de perfil.
   *
   * O arquivo vai para a API do **hub**: o storage daqui é privado e cifrado (documento de
   * motorista, gravação de corrida), e avatar é público — aparece no `PersonCard` do outro lado
   * da corrida. Ver `api/uploadImage.ts`.
   */
  const trocarFoto = async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      toast.error('Precisamos da galeria para escolher a foto.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Quadrado: o avatar é exibido em círculo em toda tela.
      aspect: [1, 1],
      // `quality: 0.7` porque o limite do servidor é 10 MB e foto de celular moderno passa
      // disso em PNG — comprimir aqui evita a viagem inteira para levar um 413.
      quality: 0.7,
    });
    if (r.canceled || !r.assets[0]) return;

    const asset = r.assets[0];
    setFotoBusy(true);
    try {
      const url = await uploadImage({
        uri: asset.uri,
        name: asset.fileName ?? 'foto.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      /**
       * `name` e `phone` vão junto porque o servidor os exige mesmo quando só a foto muda.
       * Reenviar os valores atuais de `me` é o que evita um 400 — e aqui não há formulário
       * aberto, então não há risco de desfazer edição não salva.
       */
      await api.me.updateProfile({
        name: me?.name ?? '',
        phone: me?.phone ?? '',
        avatarUrl: url,
      });
      await refreshMe();
      toast.success('Foto atualizada.');
    } catch (err) {
      alertError(err, 'Não foi possível trocar a foto');
    } finally {
      setFotoBusy(false);
    }
  };

  const setAccessibility = async (v: boolean) => {
    setSavingAccessibility(true);
    try {
      await api.me.setAccessibility(v);
      await refreshMe();
    } catch (err) {
      alertError(err, 'Não foi possível salvar');
    } finally {
      setSavingAccessibility(false);
    }
  };

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
          <Avatar nome={me?.name ?? ''} uri={me?.avatarUrl} size={64} accessibilityLabel="Sua foto" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="subtitle">{me?.name ?? 'Sua conta'}</AppText>
            <AppText variant="small">{me?.email}</AppText>
            {rating ? (
              <Row gap={4}>
                <Icon name="star" size={14} color={colors.warning} />
                <AppText variant="small">{rating.toFixed(1).replace('.', ',')}</AppText>
              </Row>
            ) : null}
            {/*
              Botão discreto, ao lado do nome: trocar a foto é ação rara, e um botão grande aqui
              competiria com o que a tela existe para fazer (ficar online, ver ganhos).
            */}
            <Button
              title={me?.avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              variant="ghost"
              size="sm"
              icon="camera-outline"
              loading={fotoBusy}
              onPress={() => void trocarFoto()}
              style={{ alignSelf: 'flex-start' }}
            />
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
              <ListRow
                icon="options-outline"
                title="Preferências de atendimento"
                subtitle={me?.driver?.womenOnlyPref ? 'Atendendo somente passageiras mulheres' : 'Quem você atende'}
                onPress={() => router.push('/driver/preferences')}
              />
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
              <ListRow icon="star-outline" title="Motoristas favoritos" onPress={() => router.push('/favorites')} />
              <ListRow
                icon="people-outline"
                title="Quem viaja comigo"
                subtitle="Pedir corrida para outra pessoa"
                onPress={() => router.push('/passengers')}
              />
            </Card>

            <SectionTitle title="Acessibilidade" />
            <Card style={{ padding: spacing.xs }}>
              <SwitchRow
                title="Preciso de veículo acessível"
                subtitle="Suas corridas só são oferecidas a motoristas com carro adaptado para cadeira de rodas"
                value={!!me?.passenger?.wheelchairAccessible}
                disabled={savingAccessibility}
                onValueChange={(v) => void setAccessibility(v)}
              />
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
          <ListRow
            icon="woman-outline"
            title="Corridas apenas com mulheres"
            subtitle={
              me?.passenger?.gender === 'female'
                ? me.passenger.womenOnlyPref
                  ? 'Ativado por padrão nas suas corridas'
                  : 'Disponível a cada corrida'
                : 'Informe seu gênero para usar (opcional)'
            }
            onPress={() => router.push('/account/gender')}
          />
          <ListRow icon="flag-outline" title="Relatar um problema" onPress={() => router.push('/safety/report')} />
          <ListRow icon="chatbox-ellipses-outline" title="Minhas reclamações" onPress={() => router.push('/safety/complaints')} />
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
