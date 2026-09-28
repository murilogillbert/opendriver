import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '@/components/ui/primitives';
import { colors } from '@/theme/tokens';

/** Passageiro: Viagem · Hub · Conta (RF11: Hub a 1 toque). */
export default function PassengerTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Viagem', tabBarIcon: ({ color }) => <Icon name="navigate-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="hub" options={{ title: 'Hub', tabBarIcon: ({ color }) => <Icon name="storefront-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Conta', tabBarIcon: ({ color }) => <Icon name="person-circle-outline" color={color} size={22} /> }} />
    </Tabs>
  );
}
