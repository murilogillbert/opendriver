import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { api } from '@/api/client';
import type { Offer } from '@/api/types';
import { qk } from '@/api/queryKeys';
import { Icon } from '@/components/ui/primitives';
import { colors } from '@/theme/tokens';

/** Motorista: Dirigir · Ganhos · Hub · Conta. */
export default function DriverTabs() {
  // Oferta chegou com outra aba aberta: leva para Dirigir (a oferta expira em segundos).
  const { data: offer } = useQuery<Offer | null>({ queryKey: qk.offer, queryFn: () => api.driver.currentOffer(), enabled: false });
  useEffect(() => {
    if (offer) router.navigate('/drive');
  }, [offer]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerTintColor: colors.navy,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dirigir', headerShown: false, tabBarIcon: ({ color }) => <Icon name="car-sport-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Ganhos', tabBarIcon: ({ color }) => <Icon name="cash-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="hub" options={{ title: 'Hub', headerShown: false, tabBarIcon: ({ color }) => <Icon name="storefront-outline" color={color} size={22} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Conta', headerShown: false, tabBarIcon: ({ color }) => <Icon name="person-circle-outline" color={color} size={22} /> }} />
    </Tabs>
  );
}
