import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/primitives';
import { colors, spacing } from '@/theme/tokens';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Image source={require('../../assets/brand/logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="OpenDriver" />
        <AppText variant="title" color={colors.white} center>
          Sua corrida em poucos toques
        </AppText>
        <AppText variant="body" color="#C9D3E0" center>
          Peça corridas ou dirija com a OpenDriver. Use a mesma conta do OpenDriverHub.
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button title="Criar conta" size="lg" onPress={() => router.push('/register')} />
        <Button title="Entrar" size="lg" variant="outline" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy, padding: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  logo: { width: 180, height: 72, marginBottom: spacing.lg },
  actions: { gap: spacing.md },
});
