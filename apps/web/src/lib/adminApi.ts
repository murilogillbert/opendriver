const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type Partner = {
  id: number;
  nome_fantasia: string;
  razao_social: string;
  cidade: string;
  estado: string;
  whatsapp?: string;
  status: string;
};

export type PartnerService = {
  id: number;
  partner_id: number;
  partner_nome: string;
  categoria: string;
  nome_servico: string;
  preco_open_driver?: number;
  ativo: boolean;
};

export type Lead = {
  id: number;
  nome?: string;
  telefone?: string;
  cidade?: string;
  servico_interesse?: string;
  partner_nome?: string;
  status: string;
  created_at: string;
};

export type Commission = {
  id: number;
  partner_nome: string;
  tipo_recebedor: string;
  valor_comissao: number;
  status: string;
  data_prevista_pagamento?: string;
};

export type ProductCategory = {
  id: number;
  nome: string;
  slug: string;
};

export type AdminProduct = {
  id: number;
  category_id?: number;
  categoria_nome?: string;
  partner_id?: number | null;
  partner_nome?: string | null;
  nome: string;
  slug: string;
  descricao_curta: string;
  descricao: string;
  tipo: "digital" | "fisico";
  tipo_entrega: "digital" | "fisico" | "ambos";
  offer_type?: string;
  delivery_method?: string;
  preco_original: number;
  preco_desconto: number;
  economia_estimada: number;
  economia_mensal_estimada: number;
  imagem_url?: string;
  gallery_urls?: string;
  video_url?: string;
  usage_rules?: string;
  delivery_deadline?: string;
  estoque?: number;
  destaque_home: boolean;
  status: string;
  cashback_percent?: number | null;
};

export type CheckinQrcode = {
  id: number;
  partner_id: number;
  partner_nome: string;
  partner_location_id?: number | null;
  location_nome?: string | null;
  token: string;
  label?: string | null;
  status: "ativo" | "pausado";
  product_count: number;
  event_count: number;
  created_at: string;
};

export type CashbackSummary = {
  totals: {
    saldo_total: number;
    total_creditado: number;
    total_debitado: number;
    total_expirado: number;
    total_estornado: number;
    usuarios_com_cashback: number;
  };
  top_users: Array<{ id: number; nome: string; email: string; cashback_balance: number }>;
};

export type AdminUser = {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  tipo_usuario: string;
  cidade?: string;
  estado?: string;
  status: string;
  monthly_acquisitions: number;
  total_orders: number;
  total_savings: number;
  nivel_atual: string;
  proximo_nivel: string;
  nivel_status: string;
  faltam_para_subir: number;
};

export type AdminOrder = {
  id: number;
  public_code: string;
  usuario_nome: string;
  usuario_email: string;
  produto_nome: string;
  offer_type?: string;
  delivery_method?: string;
  tipo_entrega: string;
  valor_pago_total: number;
  economia_total: number;
  voucher_code?: string;
  status: string;
  payment_status?: string;
  payment_method?: string;
  created_at: string;
  cashback_aplicado?: number;
  cashback_creditado?: number;
};

export type Overview = {
  total_leads: number;
  leads_convertidos: number;
  servicos_confirmados: number;
  receita_estimada: number;
  receita_recebida: number;
};

export type AdminMetrics = {
  total_usuarios: number;
  usuarios_ativos: number;
  total_produtos: number;
  produtos_ativos: number;
  total_pedidos: number;
  pedidos_mes: number;
  receita_produtos: number;
  receita_produto_fisico: number;
  receita_produto_digital: number;
  receita_servico: number;
  receita_voucher: number;
  economia_gerada: number;
  ticket_medio: number;
  pagamentos_aprovados: number;
  pagamentos_pendentes: number;
  pagamentos_recusados: number;
  home_views: number;
  home_conversions: number;
  total_leads: number;
  total_interacoes_bot: number;
  usuarios_com_nivel: number;
};

export type BotInteraction = {
  id: number;
  telefone?: string;
  canal: string;
  mensagem_usuario: string;
  resposta_bot: string;
  etapa_fluxo?: string;
  intencao: string;
  servico_interesse?: string;
  lead_status?: string;
  created_at: string;
};

export type BenefitActivation = {
  id: number;
  user_id: number;
  user_nome: string;
  user_email?: string;
  product_id: number;
  produto_nome: string;
  voucher_code?: string;
  redemption_token: string;
  status: string;
  redemption_count: number;
  redemption_limit?: number | null;
  activated_at: string;
  expires_at?: string | null;
};

export type Redemption = {
  id: number;
  activation_id: number;
  user_nome: string;
  produto_nome: string;
  partner_nome?: string;
  confirmation_method: string;
  valor_referencia?: number;
  economia_aplicada?: number;
  status: string;
  redeemed_at: string;
};

export type Receivable = {
  id: number;
  partner_id: number;
  partner_nome: string;
  redemption_id?: number;
  product_order_id?: number;
  descricao: string;
  valor: number;
  status: string;
  due_date?: string | null;
  settled_at?: string | null;
  created_at: string;
};

export type BenefitAlert = {
  id: number;
  user_id: number;
  user_nome: string;
  partner_id: number;
  partner_nome: string;
  activation_id?: number;
  voucher_code?: string;
  redemption_token?: string;
  status: string;
  triggered_at: string;
  notes?: string | null;
};

export type PartnerLocation = {
  id: number;
  partner_id: number;
  partner_nome: string;
  nome: string;
  endereco?: string | null;
  latitude: number;
  longitude: number;
  raio_metros: number;
  status: string;
  created_at: string;
};

export type AuditLog = {
  id: number;
  actor_id?: number | null;
  actor_nome?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: string | null;
  ip_address?: string | null;
  created_at: string;
};

export type PaymentEvent = {
  id: number;
  provider: string;
  event_type?: string | null;
  payment_id?: string | null;
  order_id?: number | null;
  status?: string | null;
  status_detail?: string | null;
  received_at: string;
  processed_at?: string | null;
};

async function request<T>(path: string, init?: RequestInit) {
  const token = window.localStorage.getItem("opendriver-admin-token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;

    try {
      const body = (await response.json()) as {
        error?: string;
        issues?: Array<{ path?: Array<string | number>; message?: string }>;
      };
      if (body.error === "validation_error" && Array.isArray(body.issues)) {
        const detail = body.issues
          .slice(0, 5)
          .map((issue) => {
            const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "(root)";
            return `${path}: ${issue.message ?? "invalid"}`;
          })
          .join(" • ");
        message = detail ? `validation_error → ${detail}` : "validation_error";
      } else if (body.error) {
        message = body.error;
      }
    } catch {
      // keep default message
    }

    throw new Error(message);
  }

  return response.json() as Promise<{ data: T }>;
}

export const adminApi = {
  async overview() {
    return (await request<Overview>("/admin/reports/overview")).data;
  },
  async metrics() {
    return (await request<AdminMetrics>("/admin/metrics")).data;
  },
  async users() {
    return (await request<AdminUser[]>("/admin/users")).data;
  },
  async orders() {
    return (await request<AdminOrder[]>("/admin/orders")).data;
  },
  async partners() {
    return (await request<Partner[]>("/admin/partners")).data;
  },
  async services() {
    return (await request<PartnerService[]>("/admin/partner-services")).data;
  },
  async leads() {
    return (await request<Lead[]>("/admin/leads")).data;
  },
  async commissions() {
    return (await request<Commission[]>("/admin/commissions")).data;
  },
  async botInteractions() {
    return (await request<BotInteraction[]>("/admin/bot/interactions")).data;
  },
  async categories() {
    return (await request<ProductCategory[]>("/product-categories")).data;
  },
  async adminProducts() {
    return (await request<AdminProduct[]>("/admin/products")).data;
  },
  async benefitActivations() {
    return (await request<BenefitActivation[]>("/admin/benefit-activations")).data;
  },
  async redemptions() {
    return (await request<Redemption[]>("/admin/redemptions")).data;
  },
  async receivables() {
    return (await request<Receivable[]>("/admin/receivables")).data;
  },
  async benefitAlerts() {
    return (await request<BenefitAlert[]>("/admin/benefit-alerts")).data;
  },
  async partnerLocations() {
    return (await request<PartnerLocation[]>("/admin/partner-locations")).data;
  },
  async auditLogs() {
    return (await request<AuditLog[]>("/admin/audit-logs?limit=100")).data;
  },
  async paymentEvents() {
    return (await request<PaymentEvent[]>("/admin/payment-events?limit=100")).data;
  },
  async session() {
    return (await request<{ id: number; email: string; nome: string; tipo_usuario: string }>("/admin/session")).data;
  },
  async loginAdmin(email: string, senha: string) {
    const response = await request<{ user: { tipo_usuario: string }; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, senha })
    });

    if (response.data.user.tipo_usuario !== "admin") {
      throw new Error("not_admin");
    }

    window.localStorage.setItem("opendriver-admin-token", response.data.token);

    return response.data.user;
  },
  async bootstrapAdmin(email: string, senha: string, nome: string, bootstrapToken: string) {
    const response = await request<{ token: string }>("/auth/bootstrap-admin", {
      method: "POST",
      body: JSON.stringify({ email, senha, nome, bootstrap_token: bootstrapToken })
    });
    window.localStorage.setItem("opendriver-admin-token", response.data.token);
  },
  async logoutAdmin() {
    try {
      await request<{ ok: true }>("/auth/logout", { method: "POST" });
    } catch {
      // Logout is best-effort: even if the server call fails (network, expired token), clear locally.
    }
    window.localStorage.removeItem("opendriver-admin-token");
  },
  async upload(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    return (
      await request<{ url: string; filename: string }>("/admin/uploads", {
        method: "POST",
        body: formData
      })
    ).data;
  },
  async createProduct(input: Record<string, unknown>) {
    return request<{ id: number }>("/admin/products", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateProduct(id: number, input: Record<string, unknown>) {
    return request<{ id: number }>(`/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },
  async deleteProduct(id: number) {
    return request<{ id: number }>(`/admin/products/${id}`, {
      method: "DELETE"
    });
  },
  async updateProductStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/admin/products/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  },
  async activateAllProducts() {
    return request<{ affected: number }>("/admin/products/activate-all", {
      method: "POST"
    });
  },
  async updateOrderStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  },
  async createPartner(input: Record<string, FormDataEntryValue>) {
    return request<{ id: number }>("/admin/partners", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async createService(input: Record<string, unknown>) {
    return request<{ id: number }>("/admin/partner-services", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateLeadStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/admin/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  },
  async createPartnerLocation(input: Record<string, unknown>) {
    return request<{ id: number }>("/admin/partner-locations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateReceivableStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/admin/receivables/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  },
  async updateBenefitAlert(id: number, payload: { status: string; notes?: string }) {
    return request<{ id: number; status: string }>(`/admin/benefit-alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  async listCheckinQrcodes() {
    return (await request<CheckinQrcode[]>("/admin/checkin-qrcodes")).data;
  },
  async createCheckinQrcode(payload: {
    partner_id: number;
    partner_location_id?: number | null;
    label?: string | null;
    product_ids: number[];
    status?: "ativo" | "pausado";
  }) {
    return (
      await request<{ id: number; token: string; url: string }>("/admin/checkin-qrcodes", {
        method: "POST",
        body: JSON.stringify(payload)
      })
    ).data;
  },
  async updateCheckinQrcode(
    id: number,
    payload: { status?: "ativo" | "pausado"; label?: string | null; product_ids?: number[] }
  ) {
    return (
      await request<{ id: number }>(`/admin/checkin-qrcodes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
    ).data;
  },
  async cashbackSummary() {
    return (await request<CashbackSummary>("/admin/cashback-summary")).data;
  },
  async refundOrder(orderId: number, reason?: string) {
    return (
      await request<{ orderId: number; alreadyCancelled: boolean }>(`/admin/orders/${orderId}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason })
      })
    ).data;
  },
  async redeemBenefit(payload: {
    redemption_token: string;
    partner_id?: number;
    confirmation_method?: string;
    valor_referencia?: number;
    notes?: string;
  }) {
    return request<{ redemption_id: number; activation_id: number; receivable_id: number | null; status: string }>(
      "/benefits/redeem",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
  }
};
