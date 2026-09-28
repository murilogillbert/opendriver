import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api } from '@/api/client';
import { qk } from '@/api/queryKeys';
import type { Address } from '@/api/types';
import { BottomPanel } from '@/components/ride/BottomPanel';
import { AppText, Icon, Row } from '@/components/ui/primitives';
import { firstName } from '@/lib/format';
import { tripDraftStore } from '@/lib/tripDraft';
import { colors, HIT, radius, spacing } from '@/theme/tokens';

function Shortcut({ icon, title, subtitle, onPress }: { icon: 'home-outline' | 'briefcase-outline' | 'star-outline' | 'time-outline'; title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ir para ${title}`} onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}>
      <View style={styles.shortcutIcon}>
        <Icon name={icon} size={18} color={colors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const iconFor = (label: string) => (/casa/i.test(label) ? 'home-outline' : /trabalho/i.test(label) ? 'briefcase-outline' : 'star-outline');

/**
 * Estado inicial do passageiro: uma pergunta só — "Para onde?" (princípio 1).
 * Locais salvos e destinos recentes levam direto ao preço (2 toques até pedir).
 */
export function WhereToPanel({ name, onHeight, originLabel }: { name?: string; onHeight: (h: number) => void; originLabel: string }) {
  const places = useQuery({ queryKey: qk.places, queryFn: () => api.me.places(), staleTime: 5 * 60_000 });
  const go = (destination: Address) => tripDraftStore.set((d) => ({ ...d, destination }));

  const saved = places.data?.saved ?? [];
  const recent = (places.data?.recent ?? []).filter((r) => !saved.some((s) => s.address === r.address)).slice(0, 3);

  return (
    <BottomPanel onHeight={onHeight}>
      <AppText variant="subtitle">{name ? `Olá, ${firstName(name)}` : 'Olá'}</AppText>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Para onde? Buscar destino"
        onPress={() => router.push({ pathname: '/search', params: { field: 'destination' } })}
        style={({ pressed }) => [styles.search, pressed && { opacity: 0.8 }]}
      >
        <Icon name="search" size={20} color={colors.navy} />
        <AppText variant="bodyStrong" style={{ fontSize: 17 }}>
          Para onde?
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Embarque: ${originLabel}. Tocar para mudar`}
        onPress={() => router.push({ pathname: '/search', params: { field: 'origin' } })}
        hitSlop={6}
      >
        <Row gap={6}>
          <Icon name="radio-button-on" size={14} color={colors.navy} />
          <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
            Embarque: {originLabel}
          </AppText>
          <AppText variant="small" color={colors.blue}>
            Mudar
          </AppText>
        </Row>
      </Pressable>
      {saved.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {saved.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Ir para ${p.label}`} onPress={() => go(p)} style={styles.chip}>
              <Icon name={iconFor(p.label)} size={16} color={colors.navy} />
              <AppText variant="label">{p.label}</AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {recent.map((r) => (
        <Shortcut key={r.address} icon="time-outline" title={r.address.split(',')[0] ?? r.address} subtitle={r.address.split(',').slice(1).join(',').trim()} onPress={() => go(r)} />
      ))}
    </BottomPanel>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: HIT + 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: HIT },
  shortcutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
