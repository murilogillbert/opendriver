import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { RidePassengerFor } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/Controls';
import { AppText, Icon } from '@/components/ui/primitives';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/** O que a tela de pedido precisa saber sobre quem embarca, sem ter de recarregar as listas. */
export interface RiderChoice {
  passengerFor: RidePassengerFor;
  /** Rótulo pronto ("Eu", ou o nome da pessoa). */
  label: string;
  /** Menor de idade: exige confirmar adulto responsável antes de pedir. */
  minor: boolean;
  /** A opção "apenas mulheres" pode ser oferecida para este passageiro (plano §7). */
  womenOnlyAllowed: boolean;
}

export const SELF_RIDER: RiderChoice = { passengerFor: { kind: 'self' }, label: 'Eu', minor: false, womenOnlyAllowed: true };

/**
 * Escolha de quem embarca NESTA corrida (corrida para terceiros). Substitui a antiga adivinhação
 * por distância do embarque: quem pede diz explicitamente para quem é.
 *
 * `womenOnlyAllowed` sai daqui pronto porque a regra é diferente por tipo: conta vinculada depende
 * da autorização que a própria pessoa deu no aceite; dependente sem perfil nunca pode.
 */
export function PassengerPicker({
  visible,
  selected,
  selfWomenOnlyAllowed,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: RiderChoice;
  /** Quem pede declarou `female` na própria conta — habilita "apenas mulheres" quando viaja. */
  selfWomenOnlyAllowed: boolean;
  onSelect: (choice: RiderChoice) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const guests = useQuery({ queryKey: qk.guestPassengers, queryFn: () => api.passengers.guests(), enabled: visible });
  const links = useQuery({ queryKey: qk.passengerLinks, queryFn: () => api.passengers.links(), enabled: visible });
  const accepted = (links.data?.owned ?? []).filter((l) => l.status === 'Accepted');

  const pick = (choice: RiderChoice) => {
    onSelect(choice);
    onClose();
  };
  const check = (active: boolean) => (active ? <Icon name="checkmark-circle" size={22} color={colors.limeDark} /> : null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <AppText variant="subtitle">Quem vai embarcar?</AppText>
        <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xs }}>
          <ListRow
            icon="person"
            title="Eu"
            chevron={false}
            right={check(selected.passengerFor.kind === 'self')}
            onPress={() => pick({ ...SELF_RIDER, womenOnlyAllowed: selfWomenOnlyAllowed })}
          />

          {accepted.map((l) => (
            <ListRow
              key={l.id}
              icon="person-outline"
              title={l.name}
              subtitle="Conta vinculada"
              chevron={false}
              right={check(selected.passengerFor.kind === 'linked' && selected.passengerFor.userId === l.userId)}
              onPress={() =>
                pick({ passengerFor: { kind: 'linked', userId: l.userId }, label: l.name, minor: false, womenOnlyAllowed: l.womenOnlyAllowed })
              }
            />
          ))}

          {(guests.data ?? []).map((g) => (
            <ListRow
              key={g.id}
              icon="people-outline"
              title={g.name}
              subtitle={g.minor ? `Menor de idade · ${formatDate(g.birthDate)}` : 'Dependente sem conta'}
              chevron={false}
              right={check(selected.passengerFor.kind === 'guest' && selected.passengerFor.guestPassengerId === g.id)}
              onPress={() =>
                // Dependente sem perfil nunca entra na política "apenas mulheres": não há declaração
                // de gênero da própria pessoa, só um nome informado por quem cadastrou.
                pick({ passengerFor: { kind: 'guest', guestPassengerId: g.id }, label: g.name, minor: g.minor, womenOnlyAllowed: false })
              }
            />
          ))}
        </ScrollView>

        <ListRow
          icon="person-add-outline"
          title="Cadastrar ou convidar alguém"
          onPress={() => {
            onClose();
            router.push('/passengers');
          }}
        />
        <Button title="Voltar" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  list: { maxHeight: 280 },
});
