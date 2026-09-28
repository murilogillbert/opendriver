import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/primitives';
import { colors } from '@/theme/tokens';

const LABELS = ['', 'Muito ruim', 'Ruim', 'Ok', 'Boa', 'Excelente'];

export function RatingInput({ value, onChange, size = 40 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={`Nota: ${value ? `${value} de 5, ${LABELS[value]}` : 'nenhuma'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} estrela${n > 1 ? 's' : ''} — ${LABELS[n]}`}
          hitSlop={4}
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onChange(n);
          }}
        >
          <Icon name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.warning : colors.textSoft} />
        </Pressable>
      ))}
    </View>
  );
}

export const ratingLabel = (n: number) => LABELS[n] ?? '';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
