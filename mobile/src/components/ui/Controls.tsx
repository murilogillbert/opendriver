import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { colors, HIT, radius, spacing } from '@/theme/tokens';
import { AppText, Icon, type IconName } from './primitives';

/** Linha de lista tocável (menus, configurações). */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
  chevron = !!onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : colors.navy} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" color={danger ? colors.danger : undefined}>
          {title}
        </AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.textSoft} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      {content}
    </Pressable>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.limeDark, false: colors.border }}
        thumbColor={colors.white}
      />
    </View>
  );
}

/** Seletor segmentado (ex.: CPF/CNPJ, Pix/Crédito/Débito). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <AppText variant="label" color={active ? colors.navy : colors.textMuted} center>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip de filtro horizontal. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, active && styles.chipActive]}
    >
      <AppText variant="label" color={active ? colors.navy : colors.textMuted}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Caixa de seleção com rótulo (aceite de termos, usar cashback). */
export function Checkbox({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.checkboxRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Icon name="checkmark" size={16} color={colors.navy} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children ?? <AppText variant="body">{label}</AppText>}</View>
    </Pressable>
  );
}

/** Seletor de quantidade − n +. */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}: ${value}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${label}`}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        style={[styles.stepBtn, value <= min && { opacity: 0.4 }]}
        hitSlop={6}
      >
        <Icon name="remove" size={18} color={colors.navy} />
      </Pressable>
      <AppText variant="bodyStrong" style={{ minWidth: 28, textAlign: 'center' }}>
        {value}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${label}`}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        style={[styles.stepBtn, value >= max && { opacity: 0.4 }]}
        hitSlop={6}
      >
        <Icon name="add" size={18} color={colors.navy} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: HIT + 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentActive: { backgroundColor: colors.lime },
  chip: {
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
  },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
