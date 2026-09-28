import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Painel inferior sobre o mapa: onde vive a ação dominante da tela
 * (princípio 1). Informa a própria altura para o mapa enquadrar a rota acima.
 */
export function BottomPanel({
  children,
  footer,
  onHeight,
  maxHeight = 520,
  tabBarVisible = true,
}: {
  children: ReactNode;
  /** Botões fixos no rodapé do painel (ação dominante). */
  footer?: ReactNode;
  onHeight?: (h: number) => void;
  maxHeight?: number;
  /** Com barra de abas embaixo não precisa da margem segura inferior. */
  tabBarVisible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.panel, { paddingBottom: tabBarVisible ? spacing.md : Math.max(insets.bottom, spacing.md) }]}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.grabber} />
      <ScrollView style={{ maxHeight }} contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
