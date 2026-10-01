import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/primitives';
import { colors } from '@/theme/tokens';

const LABELS: { max: number; text: string }[] = [
  { max: 1, text: 'Muito ruim' },
  { max: 2, text: 'Ruim' },
  { max: 3, text: 'Ok' },
  { max: 4, text: 'Boa' },
  { max: 5, text: 'Excelente' },
];

/** Nota em passos de meia estrela (plano §2): 0,5 a 5,0. */
export function ratingLabel(n: number): string {
  if (!n) return '';
  return LABELS.find((l) => n <= l.max)?.text ?? LABELS[LABELS.length - 1]!.text;
}

const fmt = (n: number) => n.toFixed(1).replace('.', ',');

/**
 * Seleção de nota em meia estrela: cada estrela tem duas metades tocáveis
 * (toque na metade esquerda = x,5; na direita = x,0).
 */
export function RatingInput({ value, onChange, size = 40 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const pick = (v: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    onChange(v);
  };
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`Nota: ${value ? `${fmt(value)} de 5, ${ratingLabel(value)}` : 'nenhuma'}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value >= n ? 'full' : value >= n - 0.5 ? 'half' : 'empty';
        return (
          <View key={n} style={{ width: size, height: size }}>
            <Icon
              name={fill === 'full' ? 'star' : fill === 'half' ? 'star-half' : 'star-outline'}
              size={size}
              color={fill === 'empty' ? colors.textSoft : colors.warning}
            />
            <View style={[StyleSheet.absoluteFill, styles.touchRow]} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${n - 0.5} estrelas`}
                hitSlop={4}
                style={styles.half}
                onPress={() => pick(n - 0.5)}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={`${n} estrelas`} hitSlop={4} style={styles.half} onPress={() => pick(n)} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  touchRow: { flexDirection: 'row' },
  half: { flex: 1, height: '100%' },
});
