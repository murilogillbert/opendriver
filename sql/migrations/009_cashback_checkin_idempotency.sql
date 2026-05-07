SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 1. Cashback wallet on users -------------------------------------------
IF COL_LENGTH('dbo.users', 'cashback_balance') IS NULL
  ALTER TABLE dbo.users ADD cashback_balance DECIMAL(12,2) NOT NULL CONSTRAINT df_users_cashback_balance DEFAULT 0;

-- 2. Optional per-product cashback override (tier still wins via max) ---
IF COL_LENGTH('dbo.products', 'cashback_percent') IS NULL
  ALTER TABLE dbo.products ADD cashback_percent DECIMAL(5,2) NULL CONSTRAINT df_products_cashback_percent DEFAULT 0;

-- 3. Cashback ledger ----------------------------------------------------
IF OBJECT_ID('dbo.cashback_transactions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cashback_transactions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_cashback_transactions PRIMARY KEY,
    user_id BIGINT NOT NULL,
    order_id BIGINT NULL,
    tipo VARCHAR(20) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    saldo_apos DECIMAL(12,2) NOT NULL,
    descricao NVARCHAR(240) NULL,
    expires_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_cashback_transactions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_cashback_transactions_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_cashback_transactions_orders FOREIGN KEY (order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT ck_cashback_transactions_tipo CHECK (tipo IN ('credito', 'debito', 'expirado', 'estornado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_cashback_user_created' AND object_id = OBJECT_ID('dbo.cashback_transactions'))
  CREATE INDEX ix_cashback_user_created ON dbo.cashback_transactions(user_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_cashback_credito_expires' AND object_id = OBJECT_ID('dbo.cashback_transactions'))
  CREATE INDEX ix_cashback_credito_expires ON dbo.cashback_transactions(user_id, expires_at) WHERE tipo = 'credito';

-- 4. Order tracks cashback applied (debit) and credited (earn) ----------
IF COL_LENGTH('dbo.product_orders', 'cashback_aplicado') IS NULL
  ALTER TABLE dbo.product_orders ADD cashback_aplicado DECIMAL(12,2) NOT NULL CONSTRAINT df_product_orders_cashback_aplicado DEFAULT 0;

IF COL_LENGTH('dbo.product_orders', 'cashback_creditado') IS NULL
  ALTER TABLE dbo.product_orders ADD cashback_creditado DECIMAL(12,2) NOT NULL CONSTRAINT df_product_orders_cashback_creditado DEFAULT 0;

-- 5. Stock tracking already exists (products.estoque). Add a guard so we
--    never decrement past zero via constraint at DB level too.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_products_estoque_nonneg')
  ALTER TABLE dbo.products ADD CONSTRAINT ck_products_estoque_nonneg CHECK (estoque IS NULL OR estoque >= 0);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 6. QR check-in -------------------------------------------------------
IF OBJECT_ID('dbo.checkin_qrcodes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.checkin_qrcodes (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_checkin_qrcodes PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    partner_location_id BIGINT NULL,
    token UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_checkin_qrcodes_token DEFAULT NEWID(),
    label NVARCHAR(140) NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_checkin_qrcodes_status DEFAULT 'ativo',
    created_at DATETIME2 NOT NULL CONSTRAINT df_checkin_qrcodes_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_checkin_qrcodes_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_checkin_qrcodes_token UNIQUE (token),
    CONSTRAINT fk_checkin_qrcodes_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_checkin_qrcodes_partner_locations FOREIGN KEY (partner_location_id) REFERENCES dbo.partner_locations(id),
    CONSTRAINT ck_checkin_qrcodes_status CHECK (status IN ('ativo', 'pausado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_checkin_qrcodes_partner' AND object_id = OBJECT_ID('dbo.checkin_qrcodes'))
  CREATE INDEX ix_checkin_qrcodes_partner ON dbo.checkin_qrcodes(partner_id, status);

IF OBJECT_ID('dbo.checkin_qrcode_products', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.checkin_qrcode_products (
    qrcode_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    ordem INT NOT NULL CONSTRAINT df_checkin_qrcode_products_ordem DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT df_checkin_qrcode_products_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_checkin_qrcode_products PRIMARY KEY (qrcode_id, product_id),
    CONSTRAINT fk_checkin_qrcode_products_qrcodes FOREIGN KEY (qrcode_id) REFERENCES dbo.checkin_qrcodes(id),
    CONSTRAINT fk_checkin_qrcode_products_products FOREIGN KEY (product_id) REFERENCES dbo.products(id)
  );
END;

IF OBJECT_ID('dbo.checkin_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.checkin_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_checkin_events PRIMARY KEY,
    qrcode_id BIGINT NOT NULL,
    user_id BIGINT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent NVARCHAR(240) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_checkin_events_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_checkin_events_qrcodes FOREIGN KEY (qrcode_id) REFERENCES dbo.checkin_qrcodes(id),
    CONSTRAINT fk_checkin_events_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_checkin_events_qrcode_created' AND object_id = OBJECT_ID('dbo.checkin_events'))
  CREATE INDEX ix_checkin_events_qrcode_created ON dbo.checkin_events(qrcode_id, created_at DESC);

IF COL_LENGTH('dbo.product_orders', 'checkin_event_id') IS NULL
BEGIN
  ALTER TABLE dbo.product_orders ADD checkin_event_id BIGINT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_product_orders_checkin_events')
  ALTER TABLE dbo.product_orders ADD CONSTRAINT fk_product_orders_checkin_events FOREIGN KEY (checkin_event_id) REFERENCES dbo.checkin_events(id);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '009_cashback_checkin_idempotency.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('009_cashback_checkin_idempotency.sql');
END;
