SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 1. Audit logs ------------------------------------------------------------
IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_logs (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_audit_logs PRIMARY KEY,
    actor_id BIGINT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60) NULL,
    entity_id NVARCHAR(80) NULL,
    payload NVARCHAR(MAX) NULL,
    ip_address VARCHAR(64) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_audit_logs_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_audit_logs_users FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_audit_logs_action_created' AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE INDEX ix_audit_logs_action_created ON dbo.audit_logs(action, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_audit_logs_entity' AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE INDEX ix_audit_logs_entity ON dbo.audit_logs(entity_type, entity_id);

GO

-- 2. Payment events (Mercado Pago webhook ledger) -------------------------
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.payment_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payment_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payment_events PRIMARY KEY,
    provider VARCHAR(40) NOT NULL CONSTRAINT df_payment_events_provider DEFAULT 'mercado_pago',
    event_type VARCHAR(60) NULL,
    external_id NVARCHAR(80) NULL,
    payment_id NVARCHAR(80) NULL,
    order_id BIGINT NULL,
    status NVARCHAR(40) NULL,
    status_detail NVARCHAR(80) NULL,
    raw_payload NVARCHAR(MAX) NULL,
    received_at DATETIME2 NOT NULL CONSTRAINT df_payment_events_received_at DEFAULT SYSUTCDATETIME(),
    processed_at DATETIME2 NULL,
    CONSTRAINT fk_payment_events_orders FOREIGN KEY (order_id) REFERENCES dbo.product_orders(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_events_payment_id' AND object_id = OBJECT_ID('dbo.payment_events'))
  CREATE INDEX ix_payment_events_payment_id ON dbo.payment_events(payment_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_events_received_at' AND object_id = OBJECT_ID('dbo.payment_events'))
  CREATE INDEX ix_payment_events_received_at ON dbo.payment_events(received_at DESC);

GO

-- 3. Benefit activations + redemptions -----------------------------------
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.benefit_activations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.benefit_activations (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_benefit_activations PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    order_id BIGINT NULL,
    voucher_code VARCHAR(40) NULL,
    redemption_token CHAR(12) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_benefit_activations_status DEFAULT 'ativo',
    activated_at DATETIME2 NOT NULL CONSTRAINT df_benefit_activations_activated_at DEFAULT SYSUTCDATETIME(),
    expires_at DATETIME2 NULL,
    redemption_limit INT NULL,
    redemption_count INT NOT NULL CONSTRAINT df_benefit_activations_redemption_count DEFAULT 0,
    metadata NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_benefit_activations_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_benefit_activations_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_benefit_activations_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_benefit_activations_products FOREIGN KEY (product_id) REFERENCES dbo.products(id),
    CONSTRAINT fk_benefit_activations_orders FOREIGN KEY (order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT uq_benefit_activations_token UNIQUE (redemption_token),
    CONSTRAINT ck_benefit_activations_status CHECK (status IN ('ativo', 'esgotado', 'expirado', 'cancelado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_benefit_activations_user' AND object_id = OBJECT_ID('dbo.benefit_activations'))
  CREATE INDEX ix_benefit_activations_user ON dbo.benefit_activations(user_id, status, activated_at DESC);

IF OBJECT_ID('dbo.redemptions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.redemptions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_redemptions PRIMARY KEY,
    activation_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    partner_id BIGINT NULL,
    confirmed_by BIGINT NULL,
    confirmation_method VARCHAR(30) NOT NULL CONSTRAINT df_redemptions_method DEFAULT 'token',
    valor_referencia DECIMAL(12,2) NULL,
    economia_aplicada DECIMAL(12,2) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_redemptions_status DEFAULT 'confirmado',
    notes NVARCHAR(500) NULL,
    redeemed_at DATETIME2 NOT NULL CONSTRAINT df_redemptions_redeemed_at DEFAULT SYSUTCDATETIME(),
    created_at DATETIME2 NOT NULL CONSTRAINT df_redemptions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_redemptions_activation FOREIGN KEY (activation_id) REFERENCES dbo.benefit_activations(id),
    CONSTRAINT fk_redemptions_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_redemptions_products FOREIGN KEY (product_id) REFERENCES dbo.products(id),
    CONSTRAINT fk_redemptions_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_redemptions_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_redemptions_method CHECK (confirmation_method IN ('token', 'qr', 'partner', 'admin', 'voucher')),
    CONSTRAINT ck_redemptions_status CHECK (status IN ('confirmado', 'contestado', 'cancelado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_redemptions_activation' AND object_id = OBJECT_ID('dbo.redemptions'))
  CREATE INDEX ix_redemptions_activation ON dbo.redemptions(activation_id, status, redeemed_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_redemptions_partner' AND object_id = OBJECT_ID('dbo.redemptions'))
  CREATE INDEX ix_redemptions_partner ON dbo.redemptions(partner_id, redeemed_at DESC);

GO

-- 4. Receivables (livro financeiro unificado) ----------------------------
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.receivables', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.receivables (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_receivables PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    redemption_id BIGINT NULL,
    service_order_id BIGINT NULL,
    product_order_id BIGINT NULL,
    descricao NVARCHAR(240) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_receivables_status DEFAULT 'pendente',
    due_date DATETIME2 NULL,
    settled_at DATETIME2 NULL,
    settlement_id BIGINT NULL,
    metadata NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_receivables_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_receivables_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_receivables_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_receivables_redemption FOREIGN KEY (redemption_id) REFERENCES dbo.redemptions(id),
    CONSTRAINT fk_receivables_service_order FOREIGN KEY (service_order_id) REFERENCES dbo.service_orders(id),
    CONSTRAINT fk_receivables_product_order FOREIGN KEY (product_order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT ck_receivables_status CHECK (status IN ('pendente', 'fechado', 'pago', 'contestado', 'cancelado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_receivables_partner_status' AND object_id = OBJECT_ID('dbo.receivables'))
  CREATE INDEX ix_receivables_partner_status ON dbo.receivables(partner_id, status, due_date);

IF OBJECT_ID('dbo.settlements', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.settlements (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_settlements PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    period_start DATETIME2 NOT NULL,
    period_end DATETIME2 NOT NULL,
    valor_total DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_settlements_status DEFAULT 'aberto',
    paid_at DATETIME2 NULL,
    notes NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_settlements_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_settlements_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT ck_settlements_status CHECK (status IN ('aberto', 'fechado', 'pago', 'cancelado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_receivables_settlement')
  ALTER TABLE dbo.receivables ADD CONSTRAINT fk_receivables_settlement FOREIGN KEY (settlement_id) REFERENCES dbo.settlements(id);

GO

-- 5. Geolocalizacao -------------------------------------------------------
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.partner_locations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.partner_locations (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_partner_locations PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    nome NVARCHAR(140) NOT NULL,
    endereco NVARCHAR(240) NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    raio_metros INT NOT NULL CONSTRAINT df_partner_locations_raio DEFAULT 120,
    status VARCHAR(20) NOT NULL CONSTRAINT df_partner_locations_status DEFAULT 'ativo',
    created_at DATETIME2 NOT NULL CONSTRAINT df_partner_locations_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_partner_locations_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_partner_locations_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT ck_partner_locations_status CHECK (status IN ('ativo', 'pausado', 'inativo'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_partner_locations_partner' AND object_id = OBJECT_ID('dbo.partner_locations'))
  CREATE INDEX ix_partner_locations_partner ON dbo.partner_locations(partner_id, status);

IF OBJECT_ID('dbo.location_consents', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.location_consents (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_location_consents PRIMARY KEY,
    user_id BIGINT NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    granted BIT NOT NULL,
    granted_at DATETIME2 NOT NULL CONSTRAINT df_location_consents_granted_at DEFAULT SYSUTCDATETIME(),
    revoked_at DATETIME2 NULL,
    ip_address VARCHAR(64) NULL,
    user_agent NVARCHAR(240) NULL,
    CONSTRAINT fk_location_consents_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_location_consents_user_active' AND object_id = OBJECT_ID('dbo.location_consents'))
  CREATE INDEX ix_location_consents_user_active ON dbo.location_consents(user_id, granted_at DESC);

IF OBJECT_ID('dbo.geofence_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.geofence_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_geofence_events PRIMARY KEY,
    user_id BIGINT NOT NULL,
    partner_location_id BIGINT NULL,
    partner_id BIGINT NULL,
    event_type VARCHAR(20) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    accuracy_m DECIMAL(8,2) NULL,
    distance_m DECIMAL(10,2) NULL,
    source VARCHAR(30) NOT NULL CONSTRAINT df_geofence_events_source DEFAULT 'app',
    occurred_at DATETIME2 NOT NULL CONSTRAINT df_geofence_events_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_geofence_events_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_geofence_events_partner_locations FOREIGN KEY (partner_location_id) REFERENCES dbo.partner_locations(id),
    CONSTRAINT fk_geofence_events_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT ck_geofence_events_type CHECK (event_type IN ('enter', 'dwell', 'exit'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_geofence_events_user_recent' AND object_id = OBJECT_ID('dbo.geofence_events'))
  CREATE INDEX ix_geofence_events_user_recent ON dbo.geofence_events(user_id, occurred_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_geofence_events_partner_recent' AND object_id = OBJECT_ID('dbo.geofence_events'))
  CREATE INDEX ix_geofence_events_partner_recent ON dbo.geofence_events(partner_id, occurred_at DESC);

IF OBJECT_ID('dbo.benefit_match_alerts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.benefit_match_alerts (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_benefit_match_alerts PRIMARY KEY,
    user_id BIGINT NOT NULL,
    partner_id BIGINT NOT NULL,
    activation_id BIGINT NULL,
    geofence_event_id BIGINT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_benefit_match_alerts_status DEFAULT 'pendente',
    triggered_at DATETIME2 NOT NULL CONSTRAINT df_benefit_match_alerts_triggered_at DEFAULT SYSUTCDATETIME(),
    confirmed_at DATETIME2 NULL,
    dismissed_at DATETIME2 NULL,
    redemption_id BIGINT NULL,
    notes NVARCHAR(500) NULL,
    CONSTRAINT fk_benefit_match_alerts_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_benefit_match_alerts_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_benefit_match_alerts_activation FOREIGN KEY (activation_id) REFERENCES dbo.benefit_activations(id),
    CONSTRAINT fk_benefit_match_alerts_geofence FOREIGN KEY (geofence_event_id) REFERENCES dbo.geofence_events(id),
    CONSTRAINT fk_benefit_match_alerts_redemption FOREIGN KEY (redemption_id) REFERENCES dbo.redemptions(id),
    CONSTRAINT ck_benefit_match_alerts_status CHECK (status IN ('pendente', 'notificado', 'confirmado', 'descartado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_benefit_match_alerts_status' AND object_id = OBJECT_ID('dbo.benefit_match_alerts'))
  CREATE INDEX ix_benefit_match_alerts_status ON dbo.benefit_match_alerts(status, triggered_at DESC);

GO

SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '006_operations_finance_geo.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('006_operations_finance_geo.sql');
END;
