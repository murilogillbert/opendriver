import { FormEvent, useEffect, useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import {
  AdminMetrics,
  AdminProduct,
  AdminOrder,
  AdminUser,
  adminApi,
  AuditLog,
  BenefitActivation,
  BenefitAlert,
  BotInteraction,
  Commission,
  Lead,
  Overview,
  Partner,
  PartnerLocation,
  PartnerService,
  PaymentEvent,
  ProductCategory,
  Receivable,
  Redemption
} from "../../lib/adminApi";

type AdminTab =
  | "visao"
  | "usuarios"
  | "pedidos"
  | "bot"
  | "produtos"
  | "parceiros"
  | "leads"
  | "comissoes"
  | "validacao"
  | "beneficios"
  | "alertas"
  | "receber"
  | "locations"
  | "auditoria";

const tabs: { id: AdminTab; label: string }[] = [
  { id: "visao", label: "Visao geral" },
  { id: "usuarios", label: "Usuarios" },
  { id: "pedidos", label: "Pedidos" },
  { id: "bot", label: "Bot" },
  { id: "produtos", label: "Produtos" },
  { id: "parceiros", label: "Parceiros" },
  { id: "leads", label: "Leads" },
  { id: "comissoes", label: "Comissoes" },
  { id: "validacao", label: "Validacao" },
  { id: "beneficios", label: "Beneficios" },
  { id: "alertas", label: "Alertas geo" },
  { id: "receber", label: "Contas a receber" },
  { id: "locations", label: "Locais parceiros" },
  { id: "auditoria", label: "Auditoria" }
];

const money = (value?: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value ?? 0));

function AdminApp() {
  const [activeTab, setActiveTab] = useState<AdminTab>("visao");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [services, setServices] = useState<PartnerService[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [botInteractions, setBotInteractions] = useState<BotInteraction[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [activations, setActivations] = useState<BenefitActivation[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [alerts, setAlerts] = useState<BenefitAlert[]>([]);
  const [partnerLocations, setPartnerLocations] = useState<PartnerLocation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([]);
  const [redeemResult, setRedeemResult] = useState<string | null>(null);
  const [hasAdminToken, setHasAdminToken] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const reload = async () => {
    if (!window.localStorage.getItem("opendriver-admin-token")) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [
        overviewData,
        partnersData,
        servicesData,
        leadsData,
        commissionsData,
        categoryData,
        botData,
        productData,
        metricsData,
        userData,
        orderData,
        activationsData,
        redemptionsData,
        receivablesData,
        alertsData,
        locationsData,
        auditData,
        paymentEventsData
      ] = await Promise.all([
        adminApi.overview(),
        adminApi.partners(),
        adminApi.services(),
        adminApi.leads(),
        adminApi.commissions(),
        adminApi.categories(),
        adminApi.botInteractions(),
        adminApi.adminProducts(),
        adminApi.metrics(),
        adminApi.users(),
        adminApi.orders(),
        adminApi.benefitActivations().catch(() => []),
        adminApi.redemptions().catch(() => []),
        adminApi.receivables().catch(() => []),
        adminApi.benefitAlerts().catch(() => []),
        adminApi.partnerLocations().catch(() => []),
        adminApi.auditLogs().catch(() => []),
        adminApi.paymentEvents().catch(() => [])
      ]);

      setOverview(overviewData);
      setPartners(partnersData);
      setServices(servicesData);
      setLeads(leadsData);
      setCommissions(commissionsData);
      setCategories(categoryData);
      setBotInteractions(botData);
      setProducts(productData);
      setMetrics(metricsData);
      setUsers(userData);
      setOrders(orderData);
      setActivations(activationsData);
      setRedemptions(redemptionsData);
      setReceivables(receivablesData);
      setAlerts(alertsData);
      setPartnerLocations(locationsData);
      setAuditLogs(auditData);
      setPaymentEvents(paymentEventsData);
    } catch {
      window.localStorage.removeItem("opendriver-admin-token");
      setHasAdminToken(false);
      setError("Sessao admin invalida ou expirada. Entre novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const validateStoredSession = async () => {
      if (!window.localStorage.getItem("opendriver-admin-token")) {
        setIsCheckingAuth(false);
        setIsLoading(false);
        return;
      }

      try {
        await adminApi.session();
        setHasAdminToken(true);
      } catch {
        window.localStorage.removeItem("opendriver-admin-token");
        setHasAdminToken(false);
        setError("Sessao admin invalida ou expirada. Entre novamente.");
      } finally {
        setIsCheckingAuth(false);
        setIsLoading(false);
      }
    };

    void validateStoredSession();
  }, []);

  useEffect(() => {
    if (!isCheckingAuth && hasAdminToken) {
      void reload();
    }
  }, [hasAdminToken, isCheckingAuth]);

  const activeLeads = useMemo(
    () => leads.filter((lead) => !["convertido", "perdido", "cancelado"].includes(lead.status)),
    [leads]
  );

  const submitPartner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));

    await adminApi.createPartner({
      ...values,
      status: "ativo"
    });
    form.reset();
    await reload();
  };

  const submitService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));

    await adminApi.createService({
      ...values,
      partner_id: Number(values.partner_id),
      preco_padrao: values.preco_padrao ? Number(values.preco_padrao) : undefined,
      preco_open_driver: values.preco_open_driver ? Number(values.preco_open_driver) : undefined,
      ativo: true
    });
    form.reset();
    await reload();
  };

  const updateLead = async (id: number, status: string) => {
    await adminApi.updateLeadStatus(id, status);
    await reload();
  };

  const loginAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      await adminApi.loginAdmin(String(values.email), String(values.senha));
      setHasAdminToken(true);
      setIsCheckingAuth(false);
      setError(null);
      setFormMessage(null);
    } catch (authError) {
      setFormMessage(authError instanceof Error ? authError.message : "Nao foi possivel entrar.");
    }
  };

  const bootstrapAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));

    try {
      await adminApi.bootstrapAdmin(String(values.email), String(values.senha), String(values.nome));
      setHasAdminToken(true);
      setIsCheckingAuth(false);
      setError(null);
      setFormMessage(null);
    } catch (authError) {
      setFormMessage(authError instanceof Error ? authError.message : "Nao foi possivel criar admin.");
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const imageFile = formData.get("imagem") as File | null;
    const videoFile = formData.get("video") as File | null;

    let imagemUrl = String(formData.get("imagem_url") ?? "");
    let videoUrl = String(formData.get("video_url") ?? "");

    if (imageFile?.size) {
      imagemUrl = (await adminApi.upload(imageFile)).url;
    }

    if (videoFile?.size) {
      videoUrl = (await adminApi.upload(videoFile)).url;
    }

    const payload = {
      category_id: formData.get("category_id") ? Number(formData.get("category_id")) : undefined,
      nome: String(formData.get("nome")),
      slug: String(formData.get("slug") ?? "") || undefined,
      descricao_curta: String(formData.get("descricao_curta")),
      descricao: String(formData.get("descricao")),
      tipo: String(formData.get("tipo")),
      tipo_entrega: String(formData.get("tipo_entrega")),
      offer_type: String(formData.get("offer_type")),
      delivery_method: String(formData.get("delivery_method")),
      preco_original: Number(formData.get("preco_original")),
      preco_desconto: Number(formData.get("preco_desconto")),
      economia_estimada: Number(formData.get("economia_estimada") || 0),
      economia_mensal_estimada: Number(formData.get("economia_mensal_estimada") || 0),
      imagem_url: imagemUrl || undefined,
      gallery_urls: String(formData.get("gallery_urls") ?? "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
      video_url: videoUrl || undefined,
      usage_rules: String(formData.get("usage_rules") ?? "") || undefined,
      delivery_deadline: String(formData.get("delivery_deadline") ?? "") || undefined,
      estoque: formData.get("estoque") ? Number(formData.get("estoque")) : undefined,
      destaque_home: formData.get("destaque_home") === "on",
      status: String(formData.get("status"))
    };

    try {
      if (editingProduct) {
        await adminApi.updateProduct(editingProduct.id, payload);
      } else {
        await adminApi.createProduct(payload);
      }

      setFormMessage("Produto salvo com sucesso.");
      form.reset();
      setEditingProduct(null);
      await reload();
    } catch (productError) {
      setFormMessage(productError instanceof Error ? productError.message : "Nao foi possivel salvar produto.");
    }
  };

  const setProductStatus = async (id: number, status: string) => {
    await adminApi.updateProductStatus(id, status);
    await reload();
  };

  const setOrderStatus = async (id: number, status: string) => {
    await adminApi.updateOrderStatus(id, status);
    await reload();
  };

  const activateAllProducts = async () => {
    const result = await adminApi.activateAllProducts();
    setFormMessage(`${result.data.affected} beneficios/produtos ativados.`);
    await reload();
  };

  const submitRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setRedeemResult(null);

    try {
      const response = await adminApi.redeemBenefit({
        redemption_token: String(values.redemption_token).trim().toUpperCase(),
        partner_id: values.partner_id ? Number(values.partner_id) : undefined,
        confirmation_method: String(values.confirmation_method || "token"),
        valor_referencia: values.valor_referencia ? Number(values.valor_referencia) : undefined,
        notes: values.notes ? String(values.notes) : undefined
      });
      setRedeemResult(
        `Resgate ${response.data.redemption_id} confirmado (${response.data.status}). ` +
          (response.data.receivable_id ? `Conta a receber #${response.data.receivable_id} criada.` : "Sem conta a receber gerada.")
      );
      form.reset();
      await reload();
    } catch (err) {
      setRedeemResult(err instanceof Error ? err.message : "Falha ao validar token.");
    }
  };

  const submitPartnerLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));

    try {
      await adminApi.createPartnerLocation({
        partner_id: Number(values.partner_id),
        nome: String(values.nome),
        endereco: values.endereco ? String(values.endereco) : null,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        raio_metros: values.raio_metros ? Number(values.raio_metros) : 120,
        status: "ativo"
      });
      setFormMessage("Local cadastrado.");
      form.reset();
      await reload();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Falha ao cadastrar local.");
    }
  };

  const updateReceivable = async (id: number, status: string) => {
    await adminApi.updateReceivableStatus(id, status);
    await reload();
  };

  const updateAlert = async (id: number, status: string) => {
    await adminApi.updateBenefitAlert(id, { status });
    await reload();
  };

  if (isCheckingAuth) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-[#141820]">
        <section className="mx-auto max-w-4xl rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
            Open Driver
          </p>
          <h1 className="mt-2 font-display text-3xl font-black">Verificando acesso admin</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#68748a]">
            O painel sera carregado somente depois que a sessao admin for validada.
          </p>
        </section>
      </main>
    );
  }

  if (!hasAdminToken) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-[#141820]">
        <section className="mx-auto max-w-4xl">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              Open Driver
            </p>
            <h1 className="mt-2 font-display text-3xl font-black">Acesso administrativo</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#68748a]">
              Entre com uma conta admin para carregar painel, metricas, usuarios, pedidos e catalogo.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {formMessage && (
            <div className="mb-5 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm font-bold text-brand-ink">
              {formMessage}
            </div>
          )}

          <AdminLoginPrompt onLogin={loginAdmin} onBootstrap={bootstrapAdmin} />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#141820]">
      <header className="border-b border-[#dfe5ef] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              Open Driver
            </p>
            <h1 className="mt-2 font-display text-3xl font-black">Painel admin</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-4 py-2 text-sm font-black transition ${
                  activeTab === tab.id
                    ? "bg-brand-ink text-white"
                    : "border border-[#d8dfeb] bg-white text-[#344055] hover:border-brand-gold"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-7">
        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {formMessage && (
          <div className="mb-5 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm font-bold text-brand-ink">
            {formMessage}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-md border border-[#dfe5ef] bg-white px-5 py-4 text-sm font-bold">
            Carregando dados...
          </div>
        ) : (
          <>
            {activeTab === "visao" && overview && (
              <>
                <div className="grid gap-4 md:grid-cols-5">
                  <Metric label="Usuarios" value={metrics?.total_usuarios ?? "-"} />
                  <Metric label="Produtos ativos" value={metrics?.produtos_ativos ?? "-"} />
                  <Metric label="Pedidos mes" value={metrics?.pedidos_mes ?? "-"} />
                  <Metric label="Receita produtos" value={money(metrics?.receita_produtos)} />
                  <Metric label="Economia gerada" value={money(metrics?.economia_gerada)} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <Metric label="Leads" value={overview.total_leads} />
                  <Metric label="Convertidos" value={overview.leads_convertidos} />
                  <Metric label="Servicos" value={overview.servicos_confirmados} />
                  <Metric label="Usuarios nivel" value={metrics?.usuarios_com_nivel ?? "-"} />
                  <Metric label="Interacoes bot" value={metrics?.total_interacoes_bot ?? "-"} />
                  <Metric label="Ticket medio" value={money(metrics?.ticket_medio)} />
                  <Metric label="Conversao home" value={`${metrics?.home_views ? Math.round(((metrics.home_conversions ?? 0) / metrics.home_views) * 100) : 0}%`} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <Metric label="Produto fisico" value={money(metrics?.receita_produto_fisico)} />
                  <Metric label="Produto digital" value={money(metrics?.receita_produto_digital)} />
                  <Metric label="Servicos" value={money(metrics?.receita_servico)} />
                  <Metric label="Vouchers" value={money(metrics?.receita_voucher)} />
                  <Metric label="Pagamentos" value={`${metrics?.pagamentos_aprovados ?? 0}/${metrics?.pagamentos_pendentes ?? 0}/${metrics?.pagamentos_recusados ?? 0}`} />
                </div>
              </>
            )}

            {activeTab === "usuarios" && (
              hasAdminToken ? (
                <DataTable
                  headers={["Usuario", "Contato", "Tipo", "Cidade", "Nivel", "Mes", "Economia", "Status"]}
                  rows={users.map((user) => [
                    user.nome,
                    user.email ?? user.telefone ?? "-",
                    user.tipo_usuario,
                    user.cidade ? `${user.cidade}/${user.estado ?? ""}` : "-",
                    `${user.nivel_atual} (${user.nivel_status})`,
                    `${user.monthly_acquisitions}/5`,
                    money(user.total_savings),
                    user.status
                  ])}
                />
              ) : (
                <AdminLoginPrompt onLogin={loginAdmin} onBootstrap={bootstrapAdmin} />
              )
            )}

            {activeTab === "pedidos" && (
              hasAdminToken ? (
                <DataTable
                  headers={["Pedido", "Usuario", "Produto", "Valor", "Economia", "Voucher", "Status"]}
                  rows={orders.map((order) => [
                    order.public_code,
                    `${order.usuario_nome} (${order.usuario_email})`,
                    `${order.produto_nome} · ${order.offer_type ?? "-"}`,
                    money(order.valor_pago_total),
                    money(order.economia_total),
                    order.voucher_code ?? "-",
                    <select
                      key={order.id}
                      value={order.status}
                      onChange={(event) => setOrderStatus(order.id, event.target.value)}
                      className="rounded-md border border-[#ccd5e2] px-2 py-1 text-xs font-bold"
                    >
                      <option value="pendente_pagamento">Pendente</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="enviado">Enviado</option>
                      <option value="entregue">Entregue</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  ])}
                />
              ) : (
                <AdminLoginPrompt onLogin={loginAdmin} onBootstrap={bootstrapAdmin} />
              )
            )}

            {activeTab === "bot" && (
              <DataTable
                headers={["Quando", "Canal", "Intencao", "Mensagem", "Resposta", "Lead"]}
                rows={botInteractions.map((interaction) => [
                  new Date(interaction.created_at).toLocaleString("pt-BR"),
                  interaction.canal,
                  interaction.intencao,
                  interaction.mensagem_usuario,
                  interaction.resposta_bot,
                  interaction.servico_interesse ?? interaction.lead_status ?? "-"
                ])}
              />
            )}

            {activeTab === "produtos" && (
              hasAdminToken ? (
                <div className="grid gap-6 lg:grid-cols-[25rem_1fr]">
                  <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
                    <h2 className="text-lg font-black">
                      {editingProduct ? "Editar produto" : "Novo produto"}
                    </h2>
                    <form onSubmit={submitProduct} className="mt-4 grid gap-3">
                      <label className="grid gap-1 text-sm font-bold">
                        Categoria
                        <select name="category_id" defaultValue={editingProduct?.category_id ?? ""} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                          <option value="">Selecione</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.nome}</option>
                          ))}
                        </select>
                      </label>
                      <Input name="nome" label="Nome" required defaultValue={editingProduct?.nome} />
                      <Input name="slug" label="Slug" defaultValue={editingProduct?.slug} />
                      <Input name="descricao_curta" label="Descricao curta" required defaultValue={editingProduct?.descricao_curta} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-bold">
                          Tipo de oferta
                          <select name="offer_type" defaultValue={editingProduct?.offer_type ?? "produto_digital"} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                            <option value="produto_fisico">Produto fisico</option>
                            <option value="produto_digital">Produto digital</option>
                            <option value="servico">Servico</option>
                            <option value="voucher">Voucher</option>
                            <option value="beneficio_recorrente">Beneficio recorrente</option>
                            <option value="assinatura">Assinatura</option>
                            <option value="combo">Combo promocional</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-bold">
                          Forma de entrega
                          <select name="delivery_method" defaultValue={editingProduct?.delivery_method ?? "digital"} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                            <option value="digital">Digital</option>
                            <option value="presencial">Presencial</option>
                            <option value="fisica">Fisica</option>
                          </select>
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm font-bold">
                        Descricao completa
                        <textarea name="descricao" required defaultValue={editingProduct?.descricao} className="min-h-28 rounded-md border border-[#ccd5e2] px-3 py-2" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-bold">
                          Tipo
                          <select name="tipo" defaultValue={editingProduct?.tipo ?? "digital"} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                            <option value="digital">Digital</option>
                            <option value="fisico">Fisico</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-bold">
                          Entrega
                          <select name="tipo_entrega" defaultValue={editingProduct?.tipo_entrega ?? "digital"} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                            <option value="digital">Digital</option>
                            <option value="fisico">Fisica</option>
                            <option value="ambos">Ambos</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input name="preco_original" label="Preco original" type="number" step="0.01" required defaultValue={editingProduct?.preco_original} />
                        <Input name="preco_desconto" label="Preco desconto" type="number" step="0.01" required defaultValue={editingProduct?.preco_desconto} />
                        <Input name="economia_estimada" label="Economia por compra" type="number" step="0.01" defaultValue={editingProduct?.economia_estimada} />
                        <Input name="economia_mensal_estimada" label="Economia mensal" type="number" step="0.01" defaultValue={editingProduct?.economia_mensal_estimada} />
                      </div>
                      <Input name="imagem_url" label="URL imagem" defaultValue={editingProduct?.imagem_url} />
                      <Input name="imagem" label="Upload imagem" type="file" accept="image/*" />
                      <Input name="gallery_urls" label="Galeria URLs separadas por virgula" defaultValue={editingProduct?.gallery_urls} />
                      <Input name="video_url" label="URL video" defaultValue={editingProduct?.video_url} />
                      <Input name="video" label="Upload video" type="file" accept="video/*" />
                      <Input name="delivery_deadline" label="Prazo de entrega" defaultValue={editingProduct?.delivery_deadline} />
                      <label className="grid gap-1 text-sm font-bold">
                        Regras de uso
                        <textarea name="usage_rules" defaultValue={editingProduct?.usage_rules} className="min-h-24 rounded-md border border-[#ccd5e2] px-3 py-2" />
                      </label>
                      <Input name="estoque" label="Estoque" type="number" defaultValue={editingProduct?.estoque} />
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input name="destaque_home" type="checkbox" defaultChecked={Boolean(editingProduct?.destaque_home)} />
                        Destaque na home
                      </label>
                      <label className="grid gap-1 text-sm font-bold">
                        Status
                        <select name="status" defaultValue={editingProduct?.status ?? "ativo"} className="rounded-md border border-[#ccd5e2] px-3 py-2">
                          <option value="ativo">Ativo</option>
                          <option value="pausado">Pausado</option>
                          <option value="esgotado">Esgotado</option>
                          <option value="rascunho">Rascunho</option>
                        </select>
                      </label>
                      <button className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink">
                        Salvar produto
                      </button>
                    </form>
                  </section>

                  <section className="space-y-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={activateAllProducts}
                      className="rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white"
                    >
                      Ativar todos beneficios
                    </button>
                  </div>
                  <DataTable
                    headers={["Produto", "Categoria", "Preco", "Economia", "Status", "Acoes"]}
                    rows={products.map((product) => [
                      product.nome,
                      product.categoria_nome ?? "-",
                      money(product.preco_desconto),
                      money(product.economia_mensal_estimada),
                      <select
                        key={`${product.id}-status`}
                        value={product.status}
                        onChange={(event) => setProductStatus(product.id, event.target.value)}
                        className="rounded-md border border-[#ccd5e2] px-2 py-1 text-xs font-bold"
                      >
                        <option value="ativo">Ativo</option>
                        <option value="pausado">Pausado</option>
                        <option value="esgotado">Esgotado</option>
                        <option value="rascunho">Rascunho</option>
                      </select>,
                      <div className="flex gap-2" key={product.id}>
                        <button onClick={() => setEditingProduct(product)} className="rounded bg-[#e8edf5] px-2 py-1 text-xs font-black">
                          Editar
                        </button>
                        <button onClick={() => adminApi.deleteProduct(product.id).then(reload)} className="rounded bg-[#fee2e2] px-2 py-1 text-xs font-black text-red-700">
                          Pausar
                        </button>
                      </div>
                    ])}
                  />
                  </section>
                </div>
              ) : (
                <AdminLoginPrompt onLogin={loginAdmin} onBootstrap={bootstrapAdmin} />
              )
            )}

            {activeTab === "parceiros" && (
              <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
                  <h2 className="text-lg font-black">Novo parceiro</h2>
                  <form onSubmit={submitPartner} className="mt-4 grid gap-3">
                    <Input name="razao_social" label="Razao social" required />
                    <Input name="nome_fantasia" label="Nome fantasia" required />
                    <Input name="responsavel" label="Responsavel" />
                    <Input name="whatsapp" label="WhatsApp" />
                    <Input name="email" label="Email" />
                    <Input name="cidade" label="Cidade" required />
                    <Input name="estado" label="UF" required maxLength={2} />
                    <button className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink">
                      Salvar parceiro
                    </button>
                  </form>
                </section>

                <section className="space-y-6">
                  <div className="rounded-md border border-[#dfe5ef] bg-white p-5">
                    <h2 className="text-lg font-black">Novo servico</h2>
                    <form onSubmit={submitService} className="mt-4 grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 text-sm font-bold">
                        Parceiro
                        <select name="partner_id" required className="rounded-md border border-[#ccd5e2] px-3 py-2">
                          <option value="">Selecione</option>
                          {partners.map((partner) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.nome_fantasia}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-bold">
                        Categoria
                        <select name="categoria" required className="rounded-md border border-[#ccd5e2] px-3 py-2">
                          <option value="troca_oleo">Troca de oleo</option>
                          <option value="pneus">Pneus</option>
                          <option value="lava_jato">Lava jato</option>
                          <option value="mecanica">Mecanica</option>
                          <option value="outros">Outros</option>
                        </select>
                      </label>
                      <Input name="nome_servico" label="Servico" required />
                      <Input name="preco_padrao" label="Preco padrao" type="number" step="0.01" />
                      <Input name="preco_open_driver" label="Preco Open Driver" type="number" step="0.01" />
                      <button className="self-end rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white">
                        Salvar servico
                      </button>
                    </form>
                  </div>

                  <DataTable
                    headers={["Parceiro", "Cidade", "WhatsApp", "Status"]}
                    rows={partners.map((partner) => [
                      partner.nome_fantasia,
                      `${partner.cidade}/${partner.estado}`,
                      partner.whatsapp ?? "-",
                      partner.status
                    ])}
                  />
                </section>
              </div>
            )}

            {activeTab === "leads" && (
              <DataTable
                headers={["Lead", "Interesse", "Parceiro", "Status", "Acoes"]}
                rows={activeLeads.map((lead) => [
                  lead.nome ?? lead.telefone ?? `Lead #${lead.id}`,
                  lead.servico_interesse ?? "-",
                  lead.partner_nome ?? "-",
                  lead.status,
                  <div className="flex flex-wrap gap-2" key={lead.id}>
                    <button onClick={() => updateLead(lead.id, "enviado_ao_parceiro")} className="rounded bg-[#e8edf5] px-2 py-1 text-xs font-black">
                      Enviar
                    </button>
                    <button onClick={() => updateLead(lead.id, "convertido")} className="rounded bg-brand-gold px-2 py-1 text-xs font-black">
                      Converter
                    </button>
                    <button onClick={() => updateLead(lead.id, "perdido")} className="rounded bg-[#fee2e2] px-2 py-1 text-xs font-black text-red-700">
                      Perder
                    </button>
                  </div>
                ])}
              />
            )}

            {activeTab === "comissoes" && (
              <DataTable
                headers={["Parceiro", "Recebedor", "Valor", "Status", "Previsto"]}
                rows={commissions.map((commission) => [
                  commission.partner_nome,
                  commission.tipo_recebedor,
                  money(commission.valor_comissao),
                  commission.status,
                  commission.data_prevista_pagamento
                    ? new Date(commission.data_prevista_pagamento).toLocaleDateString("pt-BR")
                    : "-"
                ])}
              />
            )}

            {activeTab === "validacao" && (
              <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
                  <h2 className="text-lg font-black">Validar token de beneficio</h2>
                  <p className="mt-2 text-xs font-semibold text-[#68748a]">
                    Use o codigo de 12 caracteres exibido no QR ou na area do cliente. A confirmacao gera o
                    resgate e a conta a receber para o parceiro selecionado.
                  </p>
                  <form onSubmit={submitRedeem} className="mt-4 grid gap-3">
                    <Input name="redemption_token" label="Token (12 letras)" required maxLength={12} />
                    <label className="grid gap-1 text-sm font-bold">
                      Parceiro
                      <select name="partner_id" className="rounded-md border border-[#ccd5e2] px-3 py-2">
                        <option value="">Auto (do produto)</option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.nome_fantasia}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-bold">
                      Metodo
                      <select name="confirmation_method" className="rounded-md border border-[#ccd5e2] px-3 py-2">
                        <option value="token">Token digitado</option>
                        <option value="qr">QR Code</option>
                        <option value="partner">Confirmado por parceiro</option>
                        <option value="admin">Manual (admin)</option>
                        <option value="voucher">Voucher fisico</option>
                      </select>
                    </label>
                    <Input name="valor_referencia" label="Valor de referencia" type="number" step="0.01" />
                    <Input name="notes" label="Observacao" />
                    <button className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink">
                      Confirmar resgate
                    </button>
                  </form>
                  {redeemResult && (
                    <div className="mt-4 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-3 py-2 text-xs font-bold text-brand-ink">
                      {redeemResult}
                    </div>
                  )}
                </section>
                <DataTable
                  headers={["Resgate", "Beneficio", "Usuario", "Parceiro", "Metodo", "Valor", "Quando"]}
                  rows={redemptions.slice(0, 30).map((redemption) => [
                    `#${redemption.id}`,
                    redemption.produto_nome,
                    redemption.user_nome,
                    redemption.partner_nome ?? "-",
                    redemption.confirmation_method,
                    money(redemption.valor_referencia),
                    new Date(redemption.redeemed_at).toLocaleString("pt-BR")
                  ])}
                />
              </div>
            )}

            {activeTab === "beneficios" && (
              <DataTable
                headers={["Usuario", "Beneficio", "Token", "Voucher", "Resgates", "Status", "Ativado"]}
                rows={activations.map((activation) => [
                  activation.user_nome,
                  activation.produto_nome,
                  <code key={`token-${activation.id}`} className="font-mono text-xs">
                    {activation.redemption_token}
                  </code>,
                  activation.voucher_code ?? "-",
                  `${activation.redemption_count}/${activation.redemption_limit ?? "∞"}`,
                  activation.status,
                  new Date(activation.activated_at).toLocaleString("pt-BR")
                ])}
              />
            )}

            {activeTab === "alertas" && (
              <DataTable
                headers={["Usuario", "Parceiro", "Token", "Status", "Quando", "Acoes"]}
                rows={alerts.map((alert) => [
                  alert.user_nome,
                  alert.partner_nome,
                  alert.redemption_token ? (
                    <code key={`alert-token-${alert.id}`} className="font-mono text-xs">
                      {alert.redemption_token}
                    </code>
                  ) : (
                    "-"
                  ),
                  alert.status,
                  new Date(alert.triggered_at).toLocaleString("pt-BR"),
                  <div className="flex flex-wrap gap-2" key={`alert-actions-${alert.id}`}>
                    <button
                      onClick={() => updateAlert(alert.id, "notificado")}
                      className="rounded bg-[#e8edf5] px-2 py-1 text-xs font-black"
                    >
                      Notificar
                    </button>
                    <button
                      onClick={() => updateAlert(alert.id, "confirmado")}
                      className="rounded bg-brand-gold px-2 py-1 text-xs font-black"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => updateAlert(alert.id, "descartado")}
                      className="rounded bg-[#fee2e2] px-2 py-1 text-xs font-black text-red-700"
                    >
                      Descartar
                    </button>
                  </div>
                ])}
              />
            )}

            {activeTab === "receber" && (
              <DataTable
                headers={["Parceiro", "Descricao", "Valor", "Status", "Vencimento", "Criado", "Acoes"]}
                rows={receivables.map((receivable) => [
                  receivable.partner_nome,
                  receivable.descricao,
                  money(receivable.valor),
                  receivable.status,
                  receivable.due_date ? new Date(receivable.due_date).toLocaleDateString("pt-BR") : "-",
                  new Date(receivable.created_at).toLocaleDateString("pt-BR"),
                  <div className="flex flex-wrap gap-2" key={`rec-${receivable.id}`}>
                    <button
                      onClick={() => updateReceivable(receivable.id, "fechado")}
                      className="rounded bg-[#e8edf5] px-2 py-1 text-xs font-black"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => updateReceivable(receivable.id, "pago")}
                      className="rounded bg-brand-gold px-2 py-1 text-xs font-black"
                    >
                      Marcar pago
                    </button>
                    <button
                      onClick={() => updateReceivable(receivable.id, "cancelado")}
                      className="rounded bg-[#fee2e2] px-2 py-1 text-xs font-black text-red-700"
                    >
                      Cancelar
                    </button>
                  </div>
                ])}
              />
            )}

            {activeTab === "locations" && (
              <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
                  <h2 className="text-lg font-black">Novo local de parceiro</h2>
                  <p className="mt-2 text-xs font-semibold text-[#68748a]">
                    Locais ativos sao usados para gerar alertas de presenca quando o usuario consente
                    rastreio de localizacao.
                  </p>
                  <form onSubmit={submitPartnerLocation} className="mt-4 grid gap-3">
                    <label className="grid gap-1 text-sm font-bold">
                      Parceiro
                      <select name="partner_id" required className="rounded-md border border-[#ccd5e2] px-3 py-2">
                        <option value="">Selecione</option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.nome_fantasia}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input name="nome" label="Nome do local" required />
                    <Input name="endereco" label="Endereco" />
                    <Input name="latitude" label="Latitude" type="number" step="0.0000001" required />
                    <Input name="longitude" label="Longitude" type="number" step="0.0000001" required />
                    <Input name="raio_metros" label="Raio (m)" type="number" min={20} max={5000} defaultValue={120} />
                    <button className="rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white">
                      Salvar local
                    </button>
                  </form>
                </section>
                <DataTable
                  headers={["Parceiro", "Local", "Coordenadas", "Raio", "Status"]}
                  rows={partnerLocations.map((loc) => [
                    loc.partner_nome,
                    loc.nome,
                    `${loc.latitude}, ${loc.longitude}`,
                    `${loc.raio_metros} m`,
                    loc.status
                  ])}
                />
              </div>
            )}

            {activeTab === "auditoria" && (
              <div className="grid gap-6">
                <DataTable
                  headers={["Quando", "Ator", "Acao", "Entidade", "IP"]}
                  rows={auditLogs.map((log) => [
                    new Date(log.created_at).toLocaleString("pt-BR"),
                    log.actor_nome ?? (log.actor_id ? `#${log.actor_id}` : "sistema"),
                    log.action,
                    `${log.entity_type ?? "-"}${log.entity_id ? ` #${log.entity_id}` : ""}`,
                    log.ip_address ?? "-"
                  ])}
                />
                <div>
                  <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#68748a]">
                    Webhooks de pagamento
                  </h3>
                  <DataTable
                    headers={["Recebido", "Provider", "Tipo", "Payment ID", "Pedido", "Status"]}
                    rows={paymentEvents.map((event) => [
                      new Date(event.received_at).toLocaleString("pt-BR"),
                      event.provider,
                      event.event_type ?? "-",
                      event.payment_id ?? "-",
                      event.order_id ? `#${event.order_id}` : "-",
                      event.status ?? "-"
                    ])}
                  />
                </div>
              </div>
            )}

            {activeTab === "visao" && services.length > 0 && (
              <div className="mt-6">
                <DataTable
                  headers={["Servico", "Parceiro", "Categoria", "Preco OD", "Ativo"]}
                  rows={services.map((service) => [
                    service.nome_servico,
                    service.partner_nome,
                    service.categoria,
                    money(service.preco_open_driver),
                    service.ativo ? "sim" : "nao"
                  ])}
                />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#68748a]">{label}</p>
      <strong className="mt-3 block text-2xl font-black">{value}</strong>
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;

  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      <input {...inputProps} className="rounded-md border border-[#ccd5e2] px-3 py-2" />
    </label>
  );
}

function AdminAuthCard({
  title,
  onSubmit,
  includeName = false
}: {
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  includeName?: boolean;
}) {
  return (
    <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3">
        {includeName && <Input name="nome" label="Nome" required />}
        <Input name="email" label="Email" type="email" required />
        <Input name="senha" label="Senha" type="password" required minLength={8} />
        <button className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink">
          Continuar
        </button>
      </form>
    </section>
  );
}

function AdminLoginPrompt({
  onLogin,
  onBootstrap
}: {
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onBootstrap: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <AdminAuthCard title="Entrar como admin" onSubmit={onLogin} />
      <AdminAuthCard title="Criar primeiro admin" onSubmit={onBootstrap} includeName />
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-md border border-[#dfe5ef] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#eef2f7] text-xs font-black uppercase tracking-[0.12em] text-[#68748a]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-4 py-5 font-bold text-[#68748a]">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-[#edf1f6]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 align-middle font-semibold">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminApp;
