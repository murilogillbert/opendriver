const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "opendriver-auth-token";

export type Product = {
  id: number;
  category_id?: number;
  categoria_nome?: string;
  categoria_slug?: string;
  partner_id?: number | null;
  partner_nome?: string | null;
  nome: string;
  slug: string;
  descricao_curta: string;
  descricao: string;
  tipo: "digital" | "fisico";
  tipo_entrega: "digital" | "fisico" | "ambos";
  offer_type?:
    | "produto_fisico"
    | "produto_digital"
    | "servico"
    | "voucher"
    | "beneficio_recorrente"
    | "assinatura"
    | "combo";
  delivery_method?: "digital" | "presencial" | "fisica";
  preco_original: number;
  preco_desconto: number;
  economia_estimada: number;
  economia_mensal_estimada: number;
  imagem_url?: string;
  gallery_urls?: string;
  video_url?: string;
  usage_rules?: string;
  delivery_deadline?: string;
  destaque_home: boolean;
  status: string;
};

export type Category = {
  id: number;
  nome: string;
  slug: string;
  descricao?: string;
};

export type AuthUser = {
  id: number;
  nome: string;
  email: string;
  tipo_usuario: string;
};

export type Order = {
  id: number;
  public_code: string;
  produto_nome: string;
  imagem_url?: string;
  tipo_entrega: string;
  offer_type?: string;
  delivery_method?: string;
  valor_pago_total: number;
  economia_total: number;
  voucher_code?: string;
  status: string;
  payment_status?: string;
  payment_status_detail?: string;
  payment_method?: string;
  mercado_pago_status?: string;
  payment_reference?: string;
  external_payment_id?: string;
  last_synced_at?: string;
  paid_at?: string;
  created_at: string;
  cashback_aplicado?: number;
  cashback_creditado?: number;
};

export type PaymentStatusSnapshot = {
  orderId: number | null;
  paymentId: string | null;
  paymentReference: string | null;
  paymentStatus: string;
  gatewayStatus: string | null;
  statusDetail: string | null;
  orderStatus: string | null;
  voucherCode: string | null;
  paidAt: string | null;
};

export type Notification = {
  id: number;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
};

export type BenefitActivation = {
  id: number;
  activation_code: string;
  product_nome: string;
  offer_type?: string;
  delivery_method?: string;
  imagem_url?: string;
  status: string;
  created_at: string;
};

export type CashbackTier = "Bronze" | "Prata" | "Ouro";

export type CashbackTransaction = {
  id: number;
  order_id: number | null;
  tipo: "credito" | "debito" | "expirado" | "estornado";
  valor: number;
  saldo_apos: number;
  descricao: string | null;
  expires_at: string | null;
  created_at: string;
};

export type CashbackSummary = {
  balance: number;
  tier: CashbackTier;
  tier_rate: number;
  monthly_acquisitions: number;
  expiring_soon: number;
  effective_rate: number;
  transactions: CashbackTransaction[];
};

export type CheckinPageData = {
  qrcode: { id: number; token: string; label: string | null };
  partner: { id: number; nome: string; cidade: string; estado: string };
  location: { id: number; nome: string | null; endereco: string | null } | null;
  products: Array<{
    id: number;
    nome: string;
    slug: string;
    descricao_curta: string;
    preco_original: number;
    preco_desconto: number;
    economia_estimada: number;
    imagem_url?: string | null;
    cashback_percent?: number | null;
    offer_type?: string;
    delivery_method?: string;
  }>;
};

export type SavingsSummary = {
  economia_total: number;
  pedidos: number;
  aquisicoes_mes: number;
  meta_mensal: number;
  faltam_para_subir: number;
  nivel_atual: string;
  proximo_nivel: string;
  nivel_status: string;
};

async function request<T>(path: string, init?: RequestInit) {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `API request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as { data: T };
}

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

const ERROR_MESSAGES: Record<string, string> = {
  product_not_found: "Esta oferta nao esta mais disponivel.",
  payment_required_use_process_payment: "Esta oferta exige finalizacao no checkout de pagamento.",
  card_token_required: "Os dados do cartao precisam ser revalidados antes de tentar novamente.",
  card_payment_method_required: "Selecione a bandeira do cartao para continuar.",
  user_profile_incomplete: "Complete o cadastro do seu perfil antes de pagar.",
  mercado_pago_payment_failed: "O Mercado Pago recusou o pagamento. Verifique os dados do cartao ou tente outro metodo.",
  mercado_pago_access_token_missing: "O pagamento esta indisponivel no momento. Tente novamente em instantes.",
  mercado_pago_lookup_failed: "Nao foi possivel verificar o status agora. Aguarde alguns segundos.",
  mercado_pago_search_failed: "Nao foi possivel buscar o pagamento agora. Tente novamente.",
  payment_not_found: "Pagamento nao encontrado.",
  payment_order_not_found: "Pedido nao encontrado para este pagamento.",
  invalid_order_id: "Pedido invalido.",
  order_not_found: "Pedido nao encontrado.",
  invalid_webhook_signature: "Falha de seguranca na validacao do pagamento."
};

export function friendlyPaymentError(error: unknown, fallback = "Nao foi possivel processar o pagamento."): string {
  if (!(error instanceof Error)) return fallback;
  const code = error.message;
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (code.startsWith("API request failed")) return fallback;
  // Don't surface raw technical messages — fall back if it looks like a code (snake_case English)
  if (/^[a-z]+(_[a-z]+)+$/.test(code)) return fallback;
  return code;
}

export const marketplaceApi = {
  async products(options: { featured?: boolean; partnerId?: number } = {}) {
    const params = new URLSearchParams();
    if (options.featured) params.set("featured", "1");
    if (options.partnerId) params.set("partner_id", String(options.partnerId));
    const qs = params.toString();
    return (await request<Product[]>(`/products${qs ? `?${qs}` : ""}`)).data;
  },
  async partners() {
    return (
      await request<Array<{ id: number; nome_fantasia: string; cidade: string; estado: string; total_produtos: number }>>(
        "/partners"
      )
    ).data;
  },
  async partnerLocations() {
    return (
      await request<
        Array<{
          id: number;
          partner_id: number;
          partner_nome: string;
          nome: string;
          endereco: string | null;
          latitude: number;
          longitude: number;
          raio_metros: number;
          cidade: string;
          estado: string;
          checkin_token: string | null;
        }>
      >("/partner-locations")
    ).data;
  },
  async processCartPayment(input: {
    items: Array<{ product_id: number; quantidade: number }>;
    payment_method: "pix" | "credit_card" | "debit_card";
    token?: string;
    installments?: number;
    payment_method_id?: string;
    issuer_id?: string;
    cashback_amount?: number;
    checkin_token?: string | null;
  }) {
    return (
      await request<{
        cart_id: string;
        orders: Array<{
          id: number;
          public_code: string;
          voucher_code: string | null;
          product_id: number;
          quantidade: number;
          valor_pago_total: number;
          cashback_aplicado: number;
        }>;
        total: number;
        cashback_used: number;
        cash_amount: number;
        payment: {
          id?: string | number | null;
          status: string;
          status_detail?: string;
          external_reference?: string;
          qr_code_base64?: string;
          qr_code?: string;
          ticket_url?: string;
        };
      }>("/payments/process_cart_payment", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async product(idOrSlug: number | string) {
    return (await request<Product>(`/products/${encodeURIComponent(String(idOrSlug))}`)).data;
  },
  async categories() {
    return (await request<Category[]>("/product-categories")).data;
  },
  async register(input: Record<string, FormDataEntryValue>) {
    const response = await request<{ user: AuthUser; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    });
    setToken(response.data.token);
    return response.data.user;
  },
  async login(email: string, senha: string) {
    const response = await request<{ user: AuthUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, senha })
    });
    setToken(response.data.token);
    return response.data.user;
  },
  async me() {
    return (await request<AuthUser & Record<string, string>>("/me")).data;
  },
  async createOrder(productId: number, tipoEntrega: "digital" | "fisico") {
    return (
      await request<{ id: number; public_code: string; voucher_code?: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, quantidade: 1, tipo_entrega: tipoEntrega })
      })
    ).data;
  },
  async paymentConfig() {
    return (await request<{ public_key?: string }>("/payments/config")).data;
  },
  async processPayment(input: {
    product_id: number;
    payment_method: "pix" | "credit_card" | "debit_card";
    token?: string;
    installments?: number;
    payment_method_id?: string;
    issuer_id?: string;
    cashback_amount?: number;
    checkin_token?: string | null;
  }) {
    return (
      await request<{
        order: { id: number; public_code: string; voucher_code?: string };
        payment: {
          id?: string | number | null;
          status: string;
          status_detail?: string;
          external_reference?: string;
          qr_code_base64?: string;
          qr_code?: string;
          ticket_url?: string;
          cashback_used?: number;
        };
      }>("/payments/process_payment", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async myCashback() {
    return (await request<CashbackSummary>("/cashback/my")).data;
  },
  async loadCheckin(token: string) {
    return (await request<CheckinPageData>(`/checkin/${encodeURIComponent(token)}`)).data;
  },
  async trackCheckin(token: string) {
    return (
      await request<{ tracked: boolean }>(`/checkin/${encodeURIComponent(token)}/track`, {
        method: "POST",
        body: JSON.stringify({})
      })
    ).data;
  },
  async myOrders() {
    return (await request<Order[]>("/orders/my")).data;
  },
  async getOrderPaymentStatus(orderId: number) {
    return (
      await request<{
        order: Order;
        payment: PaymentStatusSnapshot;
      }>(`/orders/${orderId}/payment-status`)
    ).data;
  },
  async mySavings() {
    return (await request<SavingsSummary>("/savings/my")).data;
  },
  async myNotifications() {
    return (await request<Notification[]>("/notifications/my")).data;
  },
  async myBenefits() {
    return (await request<BenefitActivation[]>("/benefits/my")).data;
  },
  async setLocationConsent(status: "granted" | "revoked") {
    return (
      await request<{ id: number }>("/location/consent", {
        method: "POST",
        body: JSON.stringify({ status })
      })
    ).data;
  },
  async sendLocationEvent(input: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number;
    event_type?: "enter" | "exit" | "nearby";
  }) {
    return (
      await request<{ events: Array<{ id: number }>; alerts: Array<{ id: number }> }>("/location/events", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  }
};

export const money = (value?: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value ?? 0));
