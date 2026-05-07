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
  }
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
