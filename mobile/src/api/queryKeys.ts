/** Chaves do TanStack Query num lugar só (o socket atualiza as mesmas chaves). */
export const qk = {
  me: ['me'] as const,
  activeRide: ['ride', 'active'] as const,
  ride: (id: string) => ['ride', id] as const,
  history: (role: 'passenger' | 'driver') => ['rides', 'history', role] as const,
  places: ['me', 'places'] as const,
  payments: ['payments'] as const,
  contacts: ['me', 'contacts'] as const,
  recordingTerms: ['me', 'recording'] as const,
  driverProfile: ['driver', 'profile'] as const,
  offer: ['driver', 'offer'] as const,
  earningsSummary: ['driver', 'earnings', 'summary'] as const,
  earnings: ['driver', 'earnings', 'list'] as const,
  payouts: ['driver', 'payouts'] as const,
};
