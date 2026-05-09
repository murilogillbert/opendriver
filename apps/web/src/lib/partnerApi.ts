// Client for the partner terminal (operated at /parceiros). Token storage is kept
// separate from the customer and admin tokens so an operator can stay logged in on
// one tab without affecting other roles.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "opendriver-partner-token";

export type PartnerProfile = {
  id: number;
  nome_fantasia: string;
  cidade: string;
  estado: string;
  whatsapp: string | null;
  operator: { id: number; nome: string; email: string };
};

export type PartnerLookup = {
  activation_id: number;
  produto_nome: string;
  offer_type: string | null;
  delivery_method: string | null;
  voucher_code: string | null;
  status: string;
  activated_at: string;
  expires_at: string | null;
  redemption_limit: number | null;
  redemption_count: number;
  cliente_primeiro_nome: string;
  economia_estimada: number;
  usable: boolean;
  expired: boolean;
  exhausted: boolean;
};

export type PartnerRedemption = {
  id: number;
  redeemed_at: string;
  confirmation_method: string;
  valor_referencia: number;
  produto_nome: string;
  cliente_nome: string;
  redemption_token: string;
};

export type PartnerStats = {
  resgates_hoje: number;
  resgates_mes: number;
  a_receber: number;
  pago_total: number;
};

export type PartnerLoginResponse = {
  user: {
    id: number;
    email: string;
    nome: string;
    tipo_usuario: string;
    partner_id: number | null;
    password_must_change: boolean;
  };
  token: string;
};

export function getPartnerToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setPartnerToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearPartnerToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit) {
  const token = getPartnerToken();
  // Only advertise application/json when we actually have a JSON body to parse — Fastify
  // refuses POST/PUT/PATCH with content-type application/json and an empty body.
  const isFormData = init?.body instanceof FormData;
  const hasBody = init?.body != null && !isFormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
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
    const body = (payload ?? {}) as {
      error?: string;
      issues?: Array<{ path?: Array<string | number>; message?: string }>;
    };
    let message = body.error ?? `partner_request_failed_${response.status}`;
    if (body.error === "validation_error" && Array.isArray(body.issues)) {
      const detail = body.issues
        .slice(0, 5)
        .map((issue) => {
          const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `${path}: ${issue.message ?? "invalid"}`;
        })
        .join(" • ");
      if (detail) message = `validation_error → ${detail}`;
    }
    const error = Object.assign(new Error(message), { status: response.status });
    throw error;
  }

  return payload as { data: T };
}

export const partnerApi = {
  async login(email: string, senha: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha })
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: PartnerLoginResponse; error?: string };
    if (!response.ok || !payload.data) {
      throw new Error(payload.error ?? "login_failed");
    }
    if (payload.data.user.tipo_usuario !== "parceiro") {
      throw new Error("not_a_partner_account");
    }
    setPartnerToken(payload.data.token);
    return payload.data;
  },
  async logout() {
    try {
      await request<{ ok: true }>("/auth/logout", { method: "POST" });
    } catch {
      // Best-effort, even on network errors we want to clear locally.
    }
    clearPartnerToken();
  },
  async changePassword(currentPassword: string, newPassword: string) {
    const result = await request<{ token: string; password_must_change: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    setPartnerToken(result.data.token);
    return result.data;
  },
  async profile() {
    return (await request<PartnerProfile>("/partner/me")).data;
  },
  async lookup(token: string) {
    return (
      await request<PartnerLookup>(`/partner/me/lookup?token=${encodeURIComponent(token.trim().toUpperCase())}`)
    ).data;
  },
  async redeem(input: { redemption_token: string; valor_referencia?: number; notes?: string }) {
    return (
      await request<{
        redemption_id: number;
        activation_id: number;
        receivable_id: number | null;
        status: string;
      }>("/partner/me/redeem", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async recentRedemptions(limit = 20) {
    return (await request<PartnerRedemption[]>(`/partner/me/redemptions?limit=${limit}`)).data;
  },
  async stats() {
    return (await request<PartnerStats>("/partner/me/stats")).data;
  },

  // ─── Products self-service ──────────────────────────────────────────────
  async listProducts() {
    return (await request<PartnerProduct[]>("/partner/me/products")).data;
  },
  async createProduct(input: PartnerProductInput) {
    return (
      await request<{ id: number }>("/partner/me/products", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async updateProduct(id: number, input: Partial<PartnerProductInput>) {
    return (
      await request<{ id: number }>(`/partner/me/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async deleteProduct(id: number) {
    await request<{ ok: true }>(`/partner/me/products/${id}`, { method: "DELETE" });
  },
  async productSales(id: number) {
    return (
      await request<{ total_pedidos: number; total_resgates: number; receita_total: number }>(
        `/partner/me/products/${id}/sales`
      )
    ).data;
  },

  // ─── Receivables ────────────────────────────────────────────────────────
  async receivables(filters?: { from?: string; to?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return (await request<PartnerReceivable[]>(`/partner/me/receivables${qs ? `?${qs}` : ""}`)).data;
  },

  // ─── Analytics ──────────────────────────────────────────────────────────
  async analyticsRedemptions(days = 30) {
    return (
      await request<{ dia: string; total: number; receita: number }[]>(
        `/partner/me/analytics/redemptions?days=${days}`
      )
    ).data;
  },
  async analyticsTopProducts(days = 30) {
    return (
      await request<{ id: number; nome: string; resgates: number; receita: number }[]>(
        `/partner/me/analytics/top-products?days=${days}`
      )
    ).data;
  },
  async analyticsQrPerformance(days = 30) {
    return (
      await request<
        { id: number; label: string | null; token: string; status: string; scans: number; conversions: number; receita: number }[]
      >(`/partner/me/analytics/qr-performance?days=${days}`)
    ).data;
  },

  // ─── Payouts ────────────────────────────────────────────────────────────
  async listPayouts() {
    return (await request<PartnerPayout[]>("/partner/me/payout-requests")).data;
  },
  async requestPayout(input: { amount: number; bank_info: string; notes?: string }) {
    return (
      await request<{ id: number }>("/partner/me/payout-requests", {
        method: "POST",
        body: JSON.stringify(input)
      })
    ).data;
  },
  async cancelPayout(id: number) {
    await request<{ ok: true }>(`/partner/me/payout-requests/${id}`, { method: "DELETE" });
  }
};

// ─── Types for the new endpoints ───────────────────────────────────────────
export type PartnerProduct = {
  id: number;
  nome: string;
  slug: string;
  descricao_curta: string;
  status: string;
  offer_type: string;
  delivery_method: string;
  preco_original: number;
  preco_desconto: number;
  economia_estimada: number;
  cashback_percent: number | null;
  estoque: number | null;
  destaque_home: boolean;
  imagem_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerProductInput = {
  nome: string;
  descricao_curta: string;
  descricao: string;
  offer_type: string;
  delivery_method?: string;
  tipo_entrega?: string;
  tipo?: string;
  preco_original: number;
  preco_desconto: number;
  economia_estimada?: number | null;
  cashback_percent?: number | null;
  estoque?: number | null;
  imagem_url?: string | null;
  usage_rules?: string | null;
  status?: "ativo" | "pausado" | "rascunho";
};

export type PartnerReceivable = {
  id: number;
  descricao: string;
  valor: number;
  status: string;
  due_date: string | null;
  settled_at: string | null;
  created_at: string;
  payout_request_id: number | null;
  redeemed_at: string | null;
  valor_referencia: number | null;
  confirmation_method: string | null;
  produto_nome: string | null;
  cliente_nome: string | null;
};

export type PartnerPayout = {
  id: number;
  amount: number;
  status: string;
  bank_info: string | null;
  notes: string | null;
  admin_notes: string | null;
  requested_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou senha invalidos.",
  not_a_partner_account: "Esta conta nao tem acesso de parceiro.",
  partner_account_unlinked: "Sua conta nao esta vinculada a nenhum parceiro. Pedir ao admin.",
  password_change_required: "Voce precisa trocar a senha antes de operar o terminal.",
  invalid_current_password: "Senha atual incorreta.",
  new_password_same_as_current: "A nova senha precisa ser diferente da atual.",
  invalid_token: "Token invalido. Use os 12 caracteres do voucher.",
  activation_not_found: "Token nao encontrado.",
  activation_not_active: "Este voucher ja foi usado, expirou ou foi cancelado.",
  activation_expired: "Este voucher esta expirado.",
  activation_exhausted: "Este voucher ja atingiu o limite de usos.",
  voucher_belongs_to_another_partner: "Este voucher pertence a outro parceiro."
};

export function friendlyPartnerError(error: unknown, fallback = "Nao foi possivel completar a acao."): string {
  if (!(error instanceof Error)) return fallback;
  return ERROR_MESSAGES[error.message] ?? error.message;
}

export const moneyBR = (value?: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
