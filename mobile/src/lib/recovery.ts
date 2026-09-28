import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { errorCode, errorMessage } from '@/api/errors';

/**
 * UX11: todo erro diz o que aconteceu, o que fazer e oferece a ação. O código
 * estável da API escolhe o atalho de recuperação.
 */
const RECOVERY: Record<string, { label: string; href: Href }> = {
  cpf_required: { label: 'Informar CPF', href: '/account/profile' },
  no_pix: { label: 'Cadastrar chave Pix', href: '/driver/pix' },
  too_many_cards: { label: 'Gerenciar cartões', href: '/payments' },
  card_declined: { label: 'Trocar forma de pagamento', href: '/payments' },
  card_invalid: { label: 'Trocar forma de pagamento', href: '/payments' },
  payment_method_not_found: { label: 'Escolher forma de pagamento', href: '/payments' },
  too_many_places: { label: 'Gerenciar locais', href: '/places' },
  profile_locked: { label: 'Ver cadastro', href: '/driver/onboarding' },
  incomplete: { label: 'Ver pendências', href: '/driver/onboarding' },
  no_vehicle: { label: 'Cadastrar veículo', href: '/driver/vehicles' },
  vehicle_not_approved: { label: 'Ver veículos', href: '/driver/vehicles' },
  driver_not_approved: { label: 'Ver cadastro', href: '/driver/onboarding' },
  not_driver: { label: 'Ver cadastro', href: '/driver/onboarding' },
};

export function recoveryFor(err: unknown) {
  const code = errorCode(err);
  return code ? RECOVERY[code] : undefined;
}

/** Alerta de erro com a ação de recuperação quando existir. */
export function alertError(err: unknown, title = 'Não deu certo', fallback?: string) {
  const action = recoveryFor(err);
  Alert.alert(
    title,
    errorMessage(err, fallback),
    action
      ? [
          { text: 'Agora não', style: 'cancel' },
          { text: action.label, onPress: () => router.push(action.href) },
        ]
      : [{ text: 'OK' }],
  );
}

/** Confirmação para ações destrutivas/irreversíveis (Cancelar corrida, excluir cartão…). */
export function confirm(title: string, message: string, confirmLabel: string, destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Voltar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
