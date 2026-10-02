import { Pressable, StyleSheet, View } from 'react-native';
import type { Gender } from '@/api/types';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Card, Icon } from './ui/primitives';

/** `null` é uma opção de verdade ("prefiro não informar"), não a ausência de resposta. */
const OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Mulher' },
  { value: 'male', label: 'Homem' },
  { value: 'other', label: 'Outro' },
  { value: null, label: 'Prefiro não informar' },
];

/** Texto de finalidade (LGPD) — o mesmo nas duas telas, pra não haver duas promessas diferentes. */
export const GENDER_PURPOSE =
  'Informar seu gênero é opcional. Usamos esse dado só para decidir quem pode pedir e atender corridas apenas com mulheres. ' +
  'Ele nunca aparece para o motorista, para o passageiro nem no seu perfil, e você pode apagar quando quiser.';

/**
 * Coleta de gênero (plano §7) — opt-in explícita, com a finalidade escrita na própria tela e
 * sempre com a saída "prefiro não informar" à mão. Nunca é pré-selecionada e nunca é inferida do
 * nome: quem não escolheu nada fica em `null`.
 */
export function GenderPicker({ value, onChange, disabled }: { value: Gender; onChange: (v: Gender) => void; disabled?: boolean }) {
  return (
    <Card style={{ padding: spacing.sm, gap: spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel="Gênero">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value ?? 'unset'}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active, disabled: !!disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.radio, active && styles.radioOn]}>{active ? <Icon name="checkmark" size={14} color={colors.navy} /> : null}</View>
            <AppText variant={active ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.limeSoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.lime, borderColor: colors.lime },
});
