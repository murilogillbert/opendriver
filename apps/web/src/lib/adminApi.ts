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

export type Overview = {
  total_leads: number;
  leads_convertidos: number;
  servicos_confirmados: number;
  receita_estimada: number;
  receita_recebida: number;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
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
