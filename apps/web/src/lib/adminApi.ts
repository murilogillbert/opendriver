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
  nome: string;
  slug: string;
  descricao_curta: string;
  descricao: string;
  tipo: "digital" | "fisico";
  tipo_entrega: "digital" | "fisico" | "ambos";
  preco_original: number;
  preco_desconto: number;
  economia_estimada: number;
  economia_mensal_estimada: number;
  imagem_url?: string;
  video_url?: string;
  estoque?: number;
  destaque_home: boolean;
  status: string;
};

export type Overview = {
  total_leads: number;
  leads_convertidos: number;
  servicos_confirmados: number;
  receita_estimada: number;
  receita_recebida: number;
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
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<{ data: T }>;
}

export const adminApi = {
  async overview() {
    return (await request<Overview>("/reports/overview")).data;
  },
  async partners() {
    return (await request<Partner[]>("/partners")).data;
  },
  async services() {
    return (await request<PartnerService[]>("/partner-services")).data;
  },
  async leads() {
    return (await request<Lead[]>("/leads")).data;
  },
  async commissions() {
    return (await request<Commission[]>("/commissions")).data;
  },
  async categories() {
    return (await request<ProductCategory[]>("/product-categories")).data;
  },
  async adminProducts() {
    return (await request<AdminProduct[]>("/admin/products")).data;
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
  async bootstrapAdmin(email: string, senha: string, nome: string) {
    const response = await request<{ token: string }>("/auth/bootstrap-admin", {
      method: "POST",
      body: JSON.stringify({ email, senha, nome })
    });
    window.localStorage.setItem("opendriver-admin-token", response.data.token);
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
  async createPartner(input: Record<string, FormDataEntryValue>) {
    return request<{ id: number }>("/partners", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async createService(input: Record<string, unknown>) {
    return request<{ id: number }>("/partner-services", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateLeadStatus(id: number, status: string) {
    return request<{ id: number; status: string }>(`/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }
};
