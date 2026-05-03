const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = "opendriver-auth-token";

export type Product = {
  id: number;
  category_id?: number;
  categoria_nome?: string;
  categoria_slug?: string;
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
  valor_pago_total: number;
  economia_total: number;
  voucher_code?: string;
  status: string;
  created_at: string;
};

export type Notification = {
  id: number;
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
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

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<{ data: T }>;
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

export const marketplaceApi = {
  async products(featured = false) {
    const query = featured ? "?featured=1" : "";
    return (await request<Product[]>(`/products${query}`)).data;
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
  async myOrders() {
    return (await request<Order[]>("/orders/my")).data;
  },
  async mySavings() {
    return (await request<{ economia_total: number; pedidos: number }>("/savings/my")).data;
  },
  async myNotifications() {
    return (await request<Notification[]>("/notifications/my")).data;
  }
};

export const money = (value?: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value ?? 0));
