/**
 * Contrato da API do OpenDriver (backend/src). Datas chegam como string ISO.
 * Mantenha em sincronia com os DTOs do backend: rideDto.ts, auth.service.ts,
 * driver.service.ts, paymentMethods.service.ts, dispatch.ts (offerDto).
 */

export type UserRole = 'passenger' | 'driver' | 'admin' | 'partner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  cpf: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  /** Saldo de cashback do OpenDriverHub (mesma carteira do hub). */
  cashbackBalance: number;
}

export type DriverStatus = 'PendingDocuments' | 'InReview' | 'Approved' | 'Rejected' | 'Suspended';

export interface Me extends User {
  passenger: {
    defaultPaymentMethodId: string | null;
    useHubCashback: boolean;
    rating: number | null;
    recordingEnabled: boolean;
  } | null;
  driver: {
    status: DriverStatus;
    isOnline: boolean;
    currentVehicleId: string | null;
    hasPixKey: boolean;
    rating: number | null;
    rejectionReason: string | null;
  } | null;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface Message {
  message: string;
}

// ---------- Geo ----------
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  title: string;
  subtitle: string;
  address: string;
}

export interface SavedPlace extends LatLng {
  id: string;
  label: string;
  address: string;
}

export interface PlacesResponse {
  saved: SavedPlace[];
  recent: (LatLng & { address: string })[];
}

// ---------- Corridas ----------
export type Category = 'Economy' | 'Comfort';
export type RideStatus = 'Searching' | 'DriverAssigned' | 'DriverArrived' | 'InProgress' | 'Completed' | 'Cancelled' | 'NoDrivers';
export type PaymentStatus = 'NotDue' | 'Pending' | 'Paid' | 'Failed' | 'Refunded' | 'NotRequired';
export type PaymentMethodType = 'Card' | 'Pix';
export type PassengerAction = 'cancel' | 'pay' | 'rate' | 'share' | 'safety';
export type DriverAction = 'arrived' | 'start' | 'finish' | 'cancel' | 'rate' | 'safety' | 'no_show';
export type RideAction = PassengerAction | DriverAction;

/** Motivo de cancelamento (plano §1.2) — a lista certa por papel vem da API, nunca hard-codada. */
export interface CancelReason {
  code: string;
  label: string;
}

export interface Address extends LatLng {
  address: string;
}

export interface QuotePrice {
  category: Category;
  label: string;
  fare: number;
  platformFee: number;
  driverEarning: number;
  breakdown: { baseFare: number; distanceFare: number; timeFare: number; minimumApplied: boolean };
}

export interface Quote {
  id: string;
  origin: Address;
  destination: Address;
  distanceM: number;
  durationS: number;
  polyline: string;
  routeSource: 'osrm' | 'estimate';
  expiresAt: string;
  prices: QuotePrice[];
}

/** Trajeto restante do carro: até o embarque (`pickup`) ou até o destino (`dropoff`). */
export interface LiveRoute {
  phase: 'pickup' | 'dropoff';
  polyline: string;
  distanceM: number;
  durationS: number;
  routeSource: 'osrm' | 'estimate';
}

export interface Ride {
  id: string;
  /** Papel de quem está vendo. */
  role: 'passenger' | 'driver';
  status: RideStatus;
  category: Category;
  origin: Address;
  destination: Address;
  distanceM: number;
  durationS: number;
  polyline: string;
  fare: number;
  driverEarning?: number;
  platformFee?: number;
  cashbackUsed: number;
  cancellationFee: number;
  amountDue: number;
  payment: {
    status: PaymentStatus;
    methodType: PaymentMethodType;
    label: string;
    pix: { copyPaste: string; expiresAt: string | null } | null;
    failureReason: string | null;
  };
  driver: {
    name: string;
    avatarUrl: string | null;
    rating: number | null;
    vehicle: { plate: string; brand: string; model: string; color: string } | null;
  } | null;
  passenger: { name: string; avatarUrl: string | null; rating: number | null } | null;
  /** Instante previsto de chegada do motorista ao embarque (só enquanto a caminho). */
  pickupEta?: string | null;
  /** Ações válidas AGORA para quem está vendo (a API decide — UX07/UX14). */
  actions: RideAction[];
  requestedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: 'Passenger' | 'Driver' | 'System' | 'Admin' | null;
  /** Código de 4 dígitos pra iniciar a corrida — só visível ao passageiro (plano §8). */
  pickupCode?: string | null;
  cancelReasonCode?: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Offer {
  offerId: string;
  rideId: string;
  expiresAt: string;
  pickupDistanceM: number;
  pickupEtaS: number;
  origin: Address;
  destination: Address;
  distanceM: number;
  durationS: number;
  category: Category;
  fare: number;
  driverEarning: number;
  paymentMethodType: PaymentMethodType;
}

export interface DriverLocationEvent extends LatLng {
  rideId: string;
  heading: number | null;
  at: number;
}

// ---------- Pagamento ----------
export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  label: string;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
  isDefault: boolean;
}

export interface PaymentMethods {
  methods: PaymentMethod[];
  useHubCashback: boolean;
}

export interface CardInput {
  number: string;
  holder: string;
  expiry: string;
  cvv: string;
  postalCode: string;
  addressNumber: string;
}

// ---------- Motorista ----------
export type VehicleStatus = 'InReview' | 'Approved' | 'Rejected';
export type PixKeyType = 'CPF' | 'CNPJ' | 'Email' | 'Phone' | 'Random';

export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: number;
  category: Category;
  status: VehicleStatus;
  rejectionReason: string | null;
  hasCrlv: boolean;
}

export interface DriverProfile {
  status: DriverStatus;
  rejectionReason: string | null;
  cnhNumber: string | null;
  cnhCategory: string | null;
  cnhExpiresAt: string | null;
  birthDate: string | null;
  pixKey: string | null;
  pixKeyType: PixKeyType | null;
  isOnline: boolean;
  currentVehicleId: string | null;
  rating: number | null;
  checklist: { personalData: boolean; cnhPhoto: boolean; selfie: boolean; vehicle: boolean; pixKey: boolean };
  vehicles: Vehicle[];
}

export interface DriverDataInput {
  cnhNumber: string;
  cnhCategory: string;
  /** AAAA-MM-DD */
  cnhExpiresAt: string;
  birthDate: string;
}

export interface VehicleInput {
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: number;
  category: Category;
}

export interface EarningsSummary {
  today: number;
  week: number;
  ridesToday: number;
  balance: number;
  pendingPayout: number;
  withdrawable: number;
}

export type EarningType = 'RideEarning' | 'CancellationFee' | 'Adjustment' | 'Payout';

export interface Earning {
  id: string;
  type: EarningType;
  amount: number;
  description: string | null;
  rideId: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  amount: number;
  status: 'Pending' | 'Paid' | 'Rejected';
  note?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
}

// ---------- Segurança ----------
export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
}

export interface EmergencyResult {
  incidentId: string;
  emergencyNumber: string;
  shareUrl: string | null;
  contacts: TrustedContact[];
}

export interface RecordingTerms {
  consentVersion: string;
  retentionDays: number;
  text: string;
}

export interface RecordingSetting {
  enabled: boolean;
  consentVersion: string;
  retentionDays: number;
}

/** Arquivo local para upload multipart (uri do expo-image-picker / expo-audio). */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}
