import '@/services/driverTracking'; // registra a tarefa de localização no escopo global
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionEffects } from '@/components/SessionEffects';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { QueryProvider } from '@/context/QueryProvider';
import { RealtimeProvider } from '@/context/RealtimeContext';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <RealtimeProvider>
              <ToastProvider>
                <StatusBar style="dark" />
                <SessionEffects />
                <RootNavigator />
              </ToastProvider>
            </RealtimeProvider>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { status, mode, isDriver } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  if (status === 'loading') return null; // splash nativo continua visível

  const signedIn = status === 'signedIn';
  const driving = signedIn && mode === 'driver' && isDriver;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.navy,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Ponto de entrada: redireciona conforme sessão e modo. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Entrar' }} />
        <Stack.Screen name="register" options={{ title: 'Criar conta' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Esqueci a senha' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !driving}>
        <Stack.Screen name="passenger" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: 'Para onde?', presentation: 'modal' }} />
        <Stack.Screen name="pick-location" options={{ title: 'Marcar no mapa', presentation: 'modal' }} />
        <Stack.Screen name="schedule" options={{ title: 'Agendar corrida', presentation: 'modal' }} />
        <Stack.Screen name="payments/index" options={{ title: 'Pagamento' }} />
        <Stack.Screen name="payments/add-card" options={{ title: 'Adicionar cartão' }} />
        <Stack.Screen name="places" options={{ title: 'Locais salvos' }} />
        <Stack.Screen name="favorites" options={{ title: 'Motoristas favoritos' }} />
        <Stack.Screen name="passengers/index" options={{ title: 'Quem viaja comigo' }} />
        <Stack.Screen name="passengers/new" options={{ title: 'Cadastrar dependente' }} />
      </Stack.Protected>

      <Stack.Protected guard={driving}>
        <Stack.Screen name="drive" options={{ headerShown: false }} />
        <Stack.Screen name="driver/payouts" options={{ title: 'Sacar' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && isDriver}>
        <Stack.Screen name="driver/onboarding" options={{ title: 'Cadastro de motorista' }} />
        <Stack.Screen name="driver/personal" options={{ title: 'Dados da CNH' }} />
        <Stack.Screen name="driver/documents" options={{ title: 'Fotos' }} />
        <Stack.Screen name="driver/vehicles" options={{ title: 'Veículos' }} />
        <Stack.Screen name="driver/vehicle-new" options={{ title: 'Novo veículo' }} />
        <Stack.Screen name="driver/pix" options={{ title: 'Chave Pix' }} />
        <Stack.Screen name="driver/preferences" options={{ title: 'Preferências de atendimento' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="ride/[id]" options={{ title: 'Corrida' }} />
        <Stack.Screen name="rides" options={{ title: 'Viagens' }} />
        <Stack.Screen name="safety/index" options={{ title: 'Segurança' }} />
        <Stack.Screen name="safety/report" options={{ title: 'Relatar problema' }} />
        <Stack.Screen name="safety/complaint" options={{ title: 'Fazer reclamação' }} />
        <Stack.Screen name="safety/complaints" options={{ title: 'Minhas reclamações' }} />
        <Stack.Screen name="account/profile" options={{ title: 'Dados pessoais' }} />
        <Stack.Screen name="account/gender" options={{ title: 'Corridas apenas com mulheres' }} />
        <Stack.Screen name="account/password" options={{ title: 'Alterar senha' }} />
        <Stack.Screen name="account/delete" options={{ title: 'Excluir conta' }} />
        <Stack.Screen name="become-driver" options={{ title: 'Dirigir com a OpenDriver' }} />
      </Stack.Protected>

      <Stack.Screen name="about" options={{ title: 'Sobre' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Não encontrado' }} />
    </Stack>
  );
}
