import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Icon } from './ui/primitives';

type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneStyle: Record<ToastTone, { bg: string; icon: 'checkmark-circle' | 'alert-circle' | 'information-circle-outline' }> = {
  success: { bg: colors.success, icon: 'checkmark-circle' },
  error: { bg: colors.danger, icon: 'alert-circle' },
  info: { bg: colors.navySoft, icon: 'information-circle-outline' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (message: string, tone: ToastTone) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, tone });
      AccessibilityInfo.announceForAccessibility(message);
      if (tone === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (tone === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(
        () =>
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null)),
        tone === 'error' ? 4500 : 2800,
      );
    },
    [opacity],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + spacing.sm, opacity }]}
          accessibilityLiveRegion="polite"
        >
          <Pressable
            onPress={() => setToast(null)}
            style={[styles.toast, { backgroundColor: toneStyle[toast.tone].bg }]}
            accessibilityRole="alert"
          >
            <Icon name={toneStyle[toast.tone].icon} color={colors.white} />
            <AppText variant="bodyStrong" color={colors.white} style={{ flex: 1 }}>
              {toast.message}
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
