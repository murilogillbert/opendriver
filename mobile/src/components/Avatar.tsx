import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/tokens';
import { AppText } from './ui/primitives';
import { resolveImageUrl } from './Media';

/**
 * Foto de perfil, com iniciais quando não há foto.
 *
 * ============================================================================
 * Por que iniciais, e não um avatar gerado por serviço externo
 * ============================================================================
 *
 * Até 2026-10-09 todo usuário nascia com `avatarUrl` apontando para o DiceBear
 * (`api.dicebear.com/9.x/avataaars/svg`). Isso fazia a foto de **todo** usuário que nunca trocou
 * depender de um serviço de terceiro estar no ar em tempo de execução — e uma chamada externa
 * por linha em qualquer lista.
 *
 * Agora o campo nasce vazio e a ausência é desenhada aqui: `View` + `Text`, nada para baixar.
 *
 * O cálculo de inicial e cor é o mesmo do backend (`hub/backend/src/domain/avatar.ts`) e do
 * site, para a mesma pessoa aparecer igual nos três.
 */

/** Iniciais: primeira e **última** palavra — "Maria da Silva Santos" vira "MS", não "MD". */
export function iniciaisDoNome(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .filter((p) => !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()));

  if (partes.length === 0) return '?';
  const primeira = partes[0]![0]!;
  if (partes.length === 1) return primeira.toUpperCase();
  return `${primeira}${partes[partes.length - 1]![0]!}`.toUpperCase();
}

/**
 * Doze matizes com contraste garantido contra texto branco.
 *
 * Lista fixa em vez de HSL derivado de hash: matiz livre produz amarelos e ciânos claros em que
 * texto branco não se lê.
 */
const CORES = [
  '#1D4ED8',
  '#7C3AED',
  '#BE185D',
  '#B91C1C',
  '#B45309',
  '#15803D',
  '#0F766E',
  '#0E7490',
  '#4338CA',
  '#9333EA',
  '#A21CAF',
  '#166534',
];

/**
 * Cor estável para um nome (FNV-1a de 32 bits).
 *
 * Determinística de propósito: cor sorteada mudaria a cada render e pareceria defeito.
 */
export function corDoNome(nome: string): string {
  let h = 0x811c9dc5;
  const texto = nome.trim().toLowerCase();
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CORES[h % CORES.length]!;
}

export function Avatar({
  nome,
  uri,
  size = 64,
  accessibilityLabel,
}: {
  nome: string;
  uri?: string | null;
  size?: number;
  accessibilityLabel?: string;
}) {
  const resolvida = resolveImageUrl(uri);
  /**
   * Tipo literal e não `ViewStyle`: o `style` do `expo-image` espera `ImageStyle`, e os dois
   * divergem em `overflow` (`ImageStyle` não aceita `'scroll'`). Como só três campos são usados,
   * o literal serve aos dois sem conversão.
   */
  const forma: { width: number; height: number; borderRadius: number } = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (resolvida) {
    return (
      <Image
        source={{ uri: resolvida }}
        style={[forma, { backgroundColor: colors.surfaceAlt }]}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        accessibilityLabel={accessibilityLabel}
        accessible={!!accessibilityLabel}
      />
    );
  }

  return (
    <View
      style={[forma, styles.iniciais, { backgroundColor: corDoNome(nome) }]}
      accessibilityLabel={accessibilityLabel ?? `Foto de ${nome}`}
      accessible
    >
      {/*
        Tamanho da letra proporcional ao círculo, para o componente servir tanto no cabeçalho
        (32 px) quanto na tela de perfil (96 px) sem ajuste em cada chamada.
      */}
      <AppText variant="bodyStrong" color={colors.white} style={{ fontSize: size * 0.4 }}>
        {iniciaisDoNome(nome)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  iniciais: { alignItems: 'center', justifyContent: 'center' },
});
