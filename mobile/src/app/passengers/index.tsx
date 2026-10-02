import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { ListRow, SwitchRow } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { QueryView } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';
import { AppText, Badge, Card, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { alertError, confirm } from '@/lib/recovery';
import { isEmail } from '@/lib/validation';
import { spacing } from '@/theme/tokens';

/**
 * Quem pode viajar nas minhas corridas (corrida para terceiros).
 *
 * Duas listas de propósito, porque a confiança é diferente: contas da plataforma entram por
 * convite + aceite (a pessoa consente em ser levada), e dependentes sem perfil são um cadastro meu
 * com CPF e nascimento — nada verificado em fonte oficial, e por isso sem opção de "apenas
 * mulheres".
 */
export default function Passengers() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  // Plano §7: só a própria convidada pode autorizar que corridas pedidas pra ela sejam restritas a
  // motoristas mulheres — a opção só existe se ela declarou isso na conta dela.
  const canAuthorizeWomenOnly = me?.passenger?.gender === 'female';
  const [authorizeWomenOnly, setAuthorizeWomenOnly] = useState(false);

  const guests = useQuery({ queryKey: qk.guestPassengers, queryFn: () => api.passengers.guests() });
  const links = useQuery({ queryKey: qk.passengerLinks, queryFn: () => api.passengers.links() });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.guestPassengers }),
      queryClient.invalidateQueries({ queryKey: qk.passengerLinks }),
    ]);

  const invite = async () => {
    setInviting(true);
    try {
      const r = await api.passengers.invite(email.trim());
      toast.success(r.message);
      setEmail('');
      await refresh();
    } catch (err) {
      alertError(err, 'Não foi possível convidar');
    } finally {
      setInviting(false);
    }
  };

  const respond = async (id: string, accept: boolean) => {
    try {
      await (accept ? api.passengers.acceptLink(id, authorizeWomenOnly) : api.passengers.declineLink(id));
      await refresh();
    } catch (err) {
      alertError(err);
    }
  };

  const unlink = async (id: string, name: string) => {
    if (!(await confirm('Desfazer o vínculo?', `${name} deixará de poder viajar nas suas corridas.`, 'Desfazer'))) return;
    try {
      await api.passengers.removeLink(id);
      await refresh();
    } catch (err) {
      alertError(err);
    }
  };

  const removeGuest = async (id: string, name: string) => {
    if (!(await confirm('Remover cadastro?', `Os dados de ${name} serão apagados. As corridas já feitas continuam no histórico.`, 'Remover'))) return;
    try {
      await api.passengers.removeGuest(id);
      await refresh();
    } catch (err) {
      alertError(err);
    }
  };

  return (
    <QueryView query={links}>
      {(l) => (
        <Screen>
          {l.received.some((r) => r.status === 'Pending') ? (
            <>
              <SectionTitle title="Convites para você" />
              <Card style={{ padding: spacing.xs }}>
                {l.received
                  .filter((r) => r.status === 'Pending')
                  .map((r) => (
                    <ListRow
                      key={r.id}
                      icon="mail-outline"
                      title={r.name}
                      subtitle="Quer poder pedir corridas para você"
                      chevron={false}
                      right={
                        <>
                          <Button title="Aceitar" size="sm" onPress={() => void respond(r.id, true)} />
                          <Button title="Recusar" variant="ghost" size="sm" onPress={() => void respond(r.id, false)} />
                        </>
                      }
                    />
                  ))}
                {canAuthorizeWomenOnly ? (
                  <SwitchRow
                    title="Permitir corrida apenas com motoristas mulheres"
                    subtitle="Ao aceitar, quem pedir a corrida poderá restringi-la a motoristas mulheres. Só você pode autorizar isso."
                    value={authorizeWomenOnly}
                    onValueChange={setAuthorizeWomenOnly}
                  />
                ) : null}
              </Card>
            </>
          ) : null}

          <SectionTitle title="Contas vinculadas" />
          <AppText variant="small">
            Pessoas com conta na OpenDriver que aceitaram viajar nas corridas que você pede. Como a conta é delas, a opção &quot;apenas
            mulheres&quot; continua valendo quando elas informaram isso no próprio perfil.
          </AppText>
          {l.owned.length ? (
            <Card style={{ padding: spacing.xs }}>
              {l.owned.map((o) => (
                <ListRow
                  key={o.id}
                  icon="person-outline"
                  title={o.name}
                  subtitle={o.status === 'Pending' ? 'Aguardando aceite' : `Vinculada em ${formatDate(o.createdAt)}`}
                  chevron={false}
                  right={
                    o.status === 'Pending' ? (
                      <Badge label="Pendente" tone="warning" />
                    ) : (
                      <Button title="Desfazer" variant="ghost" size="sm" onPress={() => void unlink(o.id, o.name)} />
                    )
                  }
                />
              ))}
            </Card>
          ) : null}

          <Card style={{ gap: spacing.sm }}>
            <AppText variant="bodyStrong">Convidar por e-mail</AppText>
            <AppText variant="small">A pessoa recebe um aviso no app e precisa aceitar antes de você poder pedir corridas para ela.</AppText>
            <TextField
              label="E-mail da conta"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Button title="Enviar convite" variant="secondary" disabled={!isEmail(email)} loading={inviting} onPress={invite} style={{ alignSelf: 'flex-start' }} />
          </Card>

          <SectionTitle title="Dependentes sem conta" />
          <AppText variant="small">
            Para quem não tem conta na OpenDriver. Precisamos de nome completo, CPF e data de nascimento — é o que identifica a pessoa no
            embarque. Esses dados ficam só com você e com o suporte; o motorista vê apenas o primeiro nome.
          </AppText>
          <QueryView query={guests}>
            {(gs) =>
              gs.length ? (
                <Card style={{ padding: spacing.xs }}>
                  {gs.map((g) => (
                    <ListRow
                      key={g.id}
                      icon="people-outline"
                      title={g.name}
                      subtitle={`${g.cpfMasked ?? 'CPF removido'} · ${formatDate(g.birthDate)}`}
                      chevron={false}
                      right={
                        <>
                          {g.minor ? <Badge label="Menor" tone="warning" /> : null}
                          <Button title="Remover" variant="ghost" size="sm" onPress={() => void removeGuest(g.id, g.name)} />
                        </>
                      }
                    />
                  ))}
                </Card>
              ) : null
            }
          </QueryView>
          <Button title="Cadastrar dependente" variant="outline" icon="person-add-outline" onPress={() => router.push('/passengers/new')} />

          <AppText variant="small">
            Passageiro com menos de 18 anos só pode viajar com um adulto responsável embarcando junto — você confirma isso ao pedir a
            corrida.
          </AppText>
        </Screen>
      )}
    </QueryView>
  );
}
