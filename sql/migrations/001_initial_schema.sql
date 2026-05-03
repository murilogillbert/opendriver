SET XACT_ABORT ON;

IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.schema_migrations (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_schema_migrations PRIMARY KEY,
    migration_name NVARCHAR(180) NOT NULL CONSTRAINT uq_schema_migrations_name UNIQUE,
    checksum NVARCHAR(128) NULL,
    executed_at DATETIME2 NOT NULL CONSTRAINT df_schema_migrations_executed_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_users PRIMARY KEY,
    nome NVARCHAR(140) NOT NULL,
    telefone VARCHAR(30) NULL,
    email NVARCHAR(180) NULL,
    tipo_usuario VARCHAR(20) NOT NULL CONSTRAINT ck_users_tipo CHECK (tipo_usuario IN ('motorista', 'passageiro', 'parceiro', 'admin')),
    cidade NVARCHAR(120) NULL,
    estado CHAR(2) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_users_status DEFAULT 'pendente' CONSTRAINT ck_users_status CHECK (status IN ('ativo', 'inativo', 'pendente')),
    external_ref NVARCHAR(80) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_users_updated_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.drivers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.drivers (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_drivers PRIMARY KEY,
    user_id BIGINT NOT NULL,
    cpf VARCHAR(14) NULL,
    cnh VARCHAR(30) NULL,
    placa_veiculo VARCHAR(12) NULL,
    modelo_veiculo NVARCHAR(80) NULL,
    ano_veiculo SMALLINT NULL,
    cidade_operacao NVARCHAR(120) NULL,
    status_motorista VARCHAR(20) NOT NULL CONSTRAINT df_drivers_status DEFAULT 'aguardando' CONSTRAINT ck_drivers_status CHECK (status_motorista IN ('aguardando', 'aprovado', 'bloqueado')),
    codigo_indicacao VARCHAR(30) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_drivers_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_drivers_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_drivers_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT uq_drivers_user UNIQUE (user_id),
    CONSTRAINT uq_drivers_codigo_indicacao UNIQUE (codigo_indicacao)
  );
END;

IF OBJECT_ID('dbo.partners', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.partners (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_partners PRIMARY KEY,
    razao_social NVARCHAR(180) NOT NULL,
    nome_fantasia NVARCHAR(180) NOT NULL,
    cnpj VARCHAR(20) NULL,
    responsavel NVARCHAR(120) NULL,
    telefone VARCHAR(30) NULL,
    whatsapp VARCHAR(30) NULL,
    email NVARCHAR(180) NULL,
    endereco NVARCHAR(240) NULL,
    bairro NVARCHAR(120) NULL,
    cidade NVARCHAR(120) NOT NULL,
    estado CHAR(2) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_partners_status DEFAULT 'pendente' CONSTRAINT ck_partners_status CHECK (status IN ('ativo', 'inativo', 'pendente')),
    created_at DATETIME2 NOT NULL CONSTRAINT df_partners_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_partners_updated_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.partner_services', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.partner_services (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_partner_services PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    categoria VARCHAR(40) NOT NULL CONSTRAINT ck_partner_services_categoria CHECK (categoria IN ('troca_oleo', 'pneus', 'lava_jato', 'mecanica', 'alinhamento', 'balanceamento', 'outros')),
    nome_servico NVARCHAR(140) NOT NULL,
    descricao NVARCHAR(MAX) NULL,
    preco_padrao DECIMAL(12,2) NULL,
    preco_open_driver DECIMAL(12,2) NULL,
    ativo BIT NOT NULL CONSTRAINT df_partner_services_ativo DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_partner_services_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_partner_services_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_partner_services_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id)
  );
END;

IF OBJECT_ID('dbo.commission_rules', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.commission_rules (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_commission_rules PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    partner_service_id BIGINT NULL,
    tipo_comissao VARCHAR(20) NOT NULL CONSTRAINT ck_commission_rules_tipo CHECK (tipo_comissao IN ('fixa', 'percentual', 'hibrida')),
    valor_fixo DECIMAL(12,2) NULL,
    percentual DECIMAL(5,2) NULL,
    recorrencia VARCHAR(30) NOT NULL CONSTRAINT df_commission_rules_recorrencia DEFAULT 'todas_as_compras' CONSTRAINT ck_commission_rules_recorrencia CHECK (recorrencia IN ('primeira_compra', 'todas_as_compras')),
    prazo_pagamento VARCHAR(20) NOT NULL CONSTRAINT df_commission_rules_prazo DEFAULT 'mensal' CONSTRAINT ck_commission_rules_prazo CHECK (prazo_pagamento IN ('semanal', 'quinzenal', 'mensal')),
    ativo BIT NOT NULL CONSTRAINT df_commission_rules_ativo DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_commission_rules_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_commission_rules_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_commission_rules_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_commission_rules_partner_services FOREIGN KEY (partner_service_id) REFERENCES dbo.partner_services(id)
  );
END;

IF OBJECT_ID('dbo.campaigns', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.campaigns (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_campaigns PRIMARY KEY,
    nome NVARCHAR(140) NOT NULL,
    descricao NVARCHAR(MAX) NULL,
    cidade NVARCHAR(120) NULL,
    estado CHAR(2) NULL,
    canal VARCHAR(30) NOT NULL CONSTRAINT ck_campaigns_canal CHECK (canal IN ('bot', 'whatsapp', 'app', 'open_ad', 'externo')),
    data_inicio DATE NULL,
    data_fim DATE NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_campaigns_status DEFAULT 'ativa' CONSTRAINT ck_campaigns_status CHECK (status IN ('ativa', 'pausada', 'encerrada')),
    created_at DATETIME2 NOT NULL CONSTRAINT df_campaigns_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_campaigns_updated_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.leads', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.leads (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_leads PRIMARY KEY,
    public_token UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_leads_public_token DEFAULT NEWID(),
    user_id BIGINT NULL,
    driver_id BIGINT NULL,
    campaign_id BIGINT NULL,
    origem VARCHAR(30) NOT NULL CONSTRAINT ck_leads_origem CHECK (origem IN ('bot_whatsapp', 'app', 'grupo_whatsapp', 'indicacao', 'campanha')),
    telefone VARCHAR(30) NULL,
    nome NVARCHAR(140) NULL,
    cidade NVARCHAR(120) NULL,
    estado CHAR(2) NULL,
    servico_interesse NVARCHAR(140) NULL,
    partner_id BIGINT NULL,
    partner_service_id BIGINT NULL,
    status VARCHAR(30) NOT NULL CONSTRAINT df_leads_status DEFAULT 'novo' CONSTRAINT ck_leads_status CHECK (status IN ('novo', 'enviado_ao_parceiro', 'em_atendimento', 'convertido', 'perdido', 'cancelado')),
    observacao NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_leads_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_leads_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_leads_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_leads_drivers FOREIGN KEY (driver_id) REFERENCES dbo.drivers(id),
    CONSTRAINT fk_leads_campaigns FOREIGN KEY (campaign_id) REFERENCES dbo.campaigns(id),
    CONSTRAINT fk_leads_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_leads_partner_services FOREIGN KEY (partner_service_id) REFERENCES dbo.partner_services(id),
    CONSTRAINT uq_leads_public_token UNIQUE (public_token)
  );
END;

IF OBJECT_ID('dbo.referrals', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.referrals (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_referrals PRIMARY KEY,
    indicador_user_id BIGINT NULL,
    indicado_user_id BIGINT NULL,
    indicador_driver_id BIGINT NULL,
    indicado_driver_id BIGINT NULL,
    codigo_indicacao VARCHAR(30) NOT NULL,
    origem VARCHAR(40) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_referrals_status DEFAULT 'pendente' CONSTRAINT ck_referrals_status CHECK (status IN ('pendente', 'validado', 'convertido', 'cancelado')),
    valor_bonus DECIMAL(12,2) NULL,
    pago BIT NOT NULL CONSTRAINT df_referrals_pago DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT df_referrals_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_referrals_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_referrals_indicador_users FOREIGN KEY (indicador_user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_referrals_indicado_users FOREIGN KEY (indicado_user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_referrals_indicador_drivers FOREIGN KEY (indicador_driver_id) REFERENCES dbo.drivers(id),
    CONSTRAINT fk_referrals_indicado_drivers FOREIGN KEY (indicado_driver_id) REFERENCES dbo.drivers(id)
  );
END;

IF OBJECT_ID('dbo.bot_interactions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bot_interactions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_bot_interactions PRIMARY KEY,
    user_id BIGINT NULL,
    telefone VARCHAR(30) NULL,
    canal VARCHAR(20) NOT NULL CONSTRAINT ck_bot_interactions_canal CHECK (canal IN ('whatsapp', 'app', 'web')),
    mensagem_usuario NVARCHAR(MAX) NOT NULL,
    resposta_bot NVARCHAR(MAX) NOT NULL,
    etapa_fluxo NVARCHAR(80) NULL,
    intencao VARCHAR(40) NOT NULL CONSTRAINT ck_bot_interactions_intencao CHECK (intencao IN ('ativacao_motorista', 'servico_automotivo', 'indicacao', 'suporte', 'outros')),
    lead_id BIGINT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_bot_interactions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_bot_interactions_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_bot_interactions_leads FOREIGN KEY (lead_id) REFERENCES dbo.leads(id)
  );
END;

IF OBJECT_ID('dbo.service_orders', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.service_orders (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_service_orders PRIMARY KEY,
    public_code UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_service_orders_public_code DEFAULT NEWID(),
    lead_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL,
    partner_service_id BIGINT NOT NULL,
    user_id BIGINT NULL,
    driver_id BIGINT NULL,
    valor_servico DECIMAL(12,2) NOT NULL,
    data_servico DATETIME2 NOT NULL,
    comprovante_url NVARCHAR(500) NULL,
    status VARCHAR(40) NOT NULL CONSTRAINT df_service_orders_status DEFAULT 'aguardando_confirmacao' CONSTRAINT ck_service_orders_status CHECK (status IN ('aguardando_confirmacao', 'confirmado', 'contestado', 'cancelado')),
    created_at DATETIME2 NOT NULL CONSTRAINT df_service_orders_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_service_orders_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_service_orders_leads FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT fk_service_orders_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_service_orders_partner_services FOREIGN KEY (partner_service_id) REFERENCES dbo.partner_services(id),
    CONSTRAINT fk_service_orders_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_service_orders_drivers FOREIGN KEY (driver_id) REFERENCES dbo.drivers(id),
    CONSTRAINT uq_service_orders_lead UNIQUE (lead_id),
    CONSTRAINT uq_service_orders_public_code UNIQUE (public_code)
  );
END;

IF OBJECT_ID('dbo.commissions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.commissions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_commissions PRIMARY KEY,
    service_order_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL,
    user_id_recebedor BIGINT NULL,
    tipo_recebedor VARCHAR(30) NOT NULL CONSTRAINT ck_commissions_tipo_recebedor CHECK (tipo_recebedor IN ('open_driver', 'motorista_indicador', 'afiliado', 'vendedor')),
    tipo_comissao VARCHAR(20) NOT NULL CONSTRAINT ck_commissions_tipo CHECK (tipo_comissao IN ('fixa', 'percentual', 'hibrida')),
    base_calculo DECIMAL(12,2) NOT NULL,
    valor_comissao DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_commissions_status DEFAULT 'a_receber' CONSTRAINT ck_commissions_status CHECK (status IN ('a_receber', 'recebido', 'cancelado', 'contestado')),
    data_prevista_pagamento DATETIME2 NULL,
    data_pagamento DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_commissions_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_commissions_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_commissions_service_orders FOREIGN KEY (service_order_id) REFERENCES dbo.service_orders(id),
    CONSTRAINT fk_commissions_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_commissions_recebedor_users FOREIGN KEY (user_id_recebedor) REFERENCES dbo.users(id)
  );
END;

IF OBJECT_ID('dbo.payments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payments (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payments PRIMARY KEY,
    commission_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL,
    valor_pago DECIMAL(12,2) NOT NULL,
    forma_pagamento VARCHAR(30) NOT NULL CONSTRAINT ck_payments_forma CHECK (forma_pagamento IN ('pix', 'transferencia', 'dinheiro', 'boleto')),
    comprovante_url NVARCHAR(500) NULL,
    data_pagamento DATETIME2 NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_payments_status DEFAULT 'pendente' CONSTRAINT ck_payments_status CHECK (status IN ('pendente', 'pago', 'recusado')),
    observacao NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_payments_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_payments_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_payments_commissions FOREIGN KEY (commission_id) REFERENCES dbo.commissions(id),
    CONSTRAINT fk_payments_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '001_initial_schema.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('001_initial_schema.sql');
END;
