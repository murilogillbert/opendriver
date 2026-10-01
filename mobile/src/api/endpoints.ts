import type { HttpClient } from './http';
import type {
  AuthResponse,
  BlockedUserInfo,
  CancelReason,
  CardInput,
  Complaint,
  ComplaintCategory,
  DriverDataInput,
  DriverProfile,
  Earning,
  EarningsSummary,
  EmergencyResult,
  FavoriteDriver,
  LatLng,
  Me,
  Message,
  Offer,
  Page,
  PaymentMethod,
  PaymentMethods,
  Payout,
  PixKeyType,
  Place,
  PlacesResponse,
  Quote,
  RecordingSetting,
  RecordingTerms,
  LiveRoute,
  Ride,
  SavedPlace,
  TrustedContact,
  UploadFile,
  User,
  Vehicle,
  VehicleInput,
} from './types';

const enc = encodeURIComponent;

function form(file: UploadFile): FormData {
  const fd = new FormData();
  // React Native aceita { uri, name, type } como parte de arquivo.
  fd.append('file', file as unknown as Blob);
  return fd;
}

function multiForm(field: string, files: UploadFile[]): FormData {
  const fd = new FormData();
  for (const file of files) fd.append(field, file as unknown as Blob);
  return fd;
}

/** Endpoints da API (/api/v1). Cada função mapeia 1:1 uma rota do backend. */
export function createApi(http: HttpClient) {
  return {
    auth: {
      login: (email: string, password: string) => http.postPublic<AuthResponse>('/auth/login', { email, password }),
      register: (input: { name: string; email: string; password: string; phone: string; cpf?: string; role: 'Passenger' | 'Driver' }) =>
        http.postPublic<AuthResponse>('/auth/register', input),
      forgotPassword: (email: string) => http.postPublic<Message>('/auth/forgot-password', { email }),
      resendVerification: (email: string) => http.postPublic<Message>('/auth/verify-email/resend', { email }),
    },
    me: {
      get: () => http.get<Me>('/me'),
      updateProfile: (input: { name: string; phone: string; cpf?: string }) => http.put<User>('/me/profile', input),
      changePassword: (currentPassword: string, newPassword: string) => http.put<void>('/me/password', { currentPassword, newPassword }),
      deleteAccount: (password: string) => http.post<void>('/me/delete', { password }),
      registerPush: (token: string, platform: 'ios' | 'android') => http.post<void>('/me/push-tokens', { token, platform }),
      unregisterPush: (token: string) => http.request<void>('/me/push-tokens', { method: 'DELETE', body: { token } }),
      places: () => http.get<PlacesResponse>('/me/places'),
      addPlace: (input: { label: string; address: string; lat: number; lng: number }) => http.post<SavedPlace>('/me/places', input),
      removePlace: (id: string) => http.del<void>(`/me/places/${enc(id)}`),
      contacts: () => http.get<TrustedContact[]>('/me/trusted-contacts'),
      addContact: (name: string, phone: string) => http.post<TrustedContact[]>('/me/trusted-contacts', { name, phone }),
      removeContact: (id: string) => http.del<TrustedContact[]>(`/me/trusted-contacts/${enc(id)}`),
      favorites: () => http.get<FavoriteDriver[]>('/me/favorites'),
      addFavorite: (driverId: string) => http.post<void>('/me/favorites', { driverId }),
      removeFavorite: (driverId: string) => http.del<void>(`/me/favorites/${enc(driverId)}`),
      blocked: () => http.get<BlockedUserInfo[]>('/me/blocked'),
      block: (userId: string) => http.post<void>('/me/blocked', { userId }),
      unblock: (userId: string) => http.del<void>(`/me/blocked/${enc(userId)}`),
      recordingTerms: () => http.get<RecordingTerms>('/me/recording'),
      setRecording: (enabled: boolean, consentVersion?: string) => http.put<RecordingSetting>('/me/recording', { enabled, consentVersion }),
      setAccessibility: (wheelchairAccessible: boolean) => http.put<{ wheelchairAccessible: boolean }>('/me/accessibility', { wheelchairAccessible }),
    },
    geo: {
      search: (q: string, near?: LatLng | null, signal?: AbortSignal) =>
        http.get<Place[]>(`/geo/search?q=${enc(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ''}`, signal),
      reverse: (p: LatLng) => http.get<Place>(`/geo/reverse?lat=${p.lat}&lng=${p.lng}`),
    },
    rides: {
      quote: (origin: LatLng & { address?: string }, destination: LatLng & { address?: string }, scheduledAt?: Date) =>
        http.post<Quote>('/rides/quote', { origin, destination, scheduledAt: scheduledAt?.toISOString() }),
      request: (input: {
        quoteId: string;
        category?: string;
        paymentMethodId?: string;
        useCashback?: boolean;
        guestPassengerName?: string;
        scheduledAt?: Date;
        favoriteDriverId?: string;
        accessibilityRequired?: boolean;
      }) => http.post<Ride>('/rides', { ...input, scheduledAt: input.scheduledAt?.toISOString() }),
      active: () => http.get<Ride | null>('/rides/active'),
      get: (id: string) => http.get<Ride>(`/rides/${enc(id)}`),
      liveRoute: (id: string) => http.get<LiveRoute>(`/rides/${enc(id)}/live-route`),
      history: (role: 'passenger' | 'driver', cursor?: string | null) =>
        http.get<Page<Ride>>(`/rides?role=${role}${cursor ? `&cursor=${enc(cursor)}` : ''}`),
      cancelReasons: (role: 'passenger' | 'driver') => http.get<CancelReason[]>(`/rides/cancel-reasons?role=${role}`),
      cancel: (id: string, reasonCode: string, reason?: string) =>
        http.post<{ cancelled: boolean; cancellationFee?: number }>(`/rides/${enc(id)}/cancel`, { reasonCode, reason }),
      pay: (id: string, paymentMethodId?: string) => http.post<Ride>(`/rides/${enc(id)}/pay`, { paymentMethodId }),
      rate: (id: string, stars: number, comment?: string) => http.post<Ride>(`/rides/${enc(id)}/rating`, { stars, comment }),
      share: (id: string) => http.post<{ url: string; token: string }>(`/rides/${enc(id)}/share`),
      tip: (id: string, amount: number) => http.post<{ amount: number }>(`/rides/${enc(id)}/tip`, { amount }),
      emergency: (id: string, at?: LatLng | null) => http.post<EmergencyResult>(`/rides/${enc(id)}/emergency`, at ?? {}),
      uploadRecording: (id: string, file: UploadFile) =>
        http.request<{ id: string; expiresAt: string }>(`/rides/${enc(id)}/recordings`, { method: 'POST', body: form(file), timeoutMs: 120_000 }),
      // Motorista
      arrived: (id: string) => http.post<Ride>(`/rides/${enc(id)}/arrived`),
      start: (id: string, code: string) => http.post<Ride>(`/rides/${enc(id)}/start`, { code }),
      finish: (id: string) => http.post<Ride>(`/rides/${enc(id)}/finish`),
      noShow: (id: string) => http.post<Ride>(`/rides/${enc(id)}/no-show`),
    },
    safety: {
      report: (description: string, rideId?: string) => http.post<{ incidentId: string }>('/safety/incidents', { description, rideId }),
    },
    complaints: {
      categories: () => http.get<ComplaintCategory[]>('/complaints/categories'),
      open: (input: { rideId?: string; category: string; description: string; role?: 'passenger' | 'driver' }) =>
        http.post<{ incidentId: string; status: string }>('/complaints', input),
      uploadAttachments: (id: string, files: UploadFile[]) =>
        http.request<{ attached: number; total: number }>(`/complaints/${enc(id)}/attachments`, { method: 'POST', body: multiForm('files', files), timeoutMs: 60_000 }),
      mine: () => http.get<Complaint[]>('/me/complaints'),
      get: (id: string) => http.get<Complaint>(`/me/complaints/${enc(id)}`),
    },
    payments: {
      list: () => http.get<PaymentMethods>('/payment-methods'),
      addCard: (card: CardInput) => http.post<PaymentMethod>('/payment-methods/card', card),
      setDefault: (id: string) => http.put<PaymentMethods>(`/payment-methods/${enc(id)}/default`),
      remove: (id: string) => http.del<PaymentMethods>(`/payment-methods/${enc(id)}`),
      setUseCashback: (useHubCashback: boolean) => http.put<PaymentMethods>('/payment-methods/preferences', { useHubCashback }),
    },
    driver: {
      become: () => http.post<AuthResponse>('/driver/become'),
      profile: () => http.get<DriverProfile>('/driver/profile'),
      updateData: (input: DriverDataInput) => http.put<DriverProfile>('/driver/profile', input),
      uploadDocument: (kind: 'cnh' | 'selfie', file: UploadFile) =>
        http.request<DriverProfile>(`/driver/documents/${kind}`, { method: 'POST', body: form(file), timeoutMs: 60_000 }),
      submit: () => http.post<DriverProfile>('/driver/submit'),
      addVehicle: (input: VehicleInput) => http.post<Vehicle>('/driver/vehicles', input),
      uploadCrlv: (vehicleId: string, file: UploadFile) =>
        http.request<Vehicle>(`/driver/vehicles/${enc(vehicleId)}/crlv`, { method: 'POST', body: form(file), timeoutMs: 60_000 }),
      selectVehicle: (vehicleId: string) => http.put<DriverProfile>(`/driver/vehicles/${enc(vehicleId)}/current`),
      removeVehicle: (vehicleId: string) => http.del<void>(`/driver/vehicles/${enc(vehicleId)}`),
      setPix: (pixKeyType: PixKeyType, pixKey: string, password?: string) => http.put<DriverProfile>('/driver/pix', { pixKeyType, pixKey, password }),
      online: () => http.post<{ isOnline: boolean }>('/driver/online'),
      offline: () => http.post<{ isOnline: boolean }>('/driver/offline'),
      location: (p: LatLng & { heading?: number | null; speed?: number | null; accuracy?: number | null }) => http.post<void>('/driver/location', p),
      currentOffer: () => http.get<Offer | null>('/driver/offers/current'),
      accept: (offerId: string) => http.post<Ride>(`/driver/offers/${enc(offerId)}/accept`),
      decline: (offerId: string) => http.post<void>(`/driver/offers/${enc(offerId)}/decline`),
      earningsSummary: () => http.get<EarningsSummary>('/driver/earnings/summary'),
      earnings: (cursor?: string | null) => http.get<Page<Earning>>(`/driver/earnings${cursor ? `?cursor=${enc(cursor)}` : ''}`),
      payouts: () => http.get<Payout[]>('/driver/payouts'),
      requestPayout: (amount: number) => http.post<Payout>('/driver/payouts', { amount }),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
