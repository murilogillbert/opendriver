SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- ─── 1. Referrals ────────────────────────────────────────────────────────
-- Each user gets a unique short code that can be shared. When a new account
-- redeems it on signup we store the link in `referrals` and pay both sides
-- a cashback bonus the first time the new user makes an approved purchase.

IF COL_LENGTH('dbo.users', 'referral_code') IS NULL
  ALTER TABLE dbo.users ADD referral_code VARCHAR(12) NULL;

IF COL_LENGTH('dbo.users', 'referred_by_user_id') IS NULL
  ALTER TABLE dbo.users ADD referred_by_user_id BIGINT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_referral_code' AND object_id = OBJECT_ID('dbo.users'))
  CREATE UNIQUE INDEX ix_users_referral_code ON dbo.users(referral_code) WHERE referral_code IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_users_referred_by')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_referred_by FOREIGN KEY (referred_by_user_id) REFERENCES dbo.users(id);

IF OBJECT_ID('dbo.referrals', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.referrals (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_referrals PRIMARY KEY,
    referrer_user_id BIGINT NOT NULL,
    referred_user_id BIGINT NOT NULL,
    referral_code VARCHAR(12) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_referrals_status DEFAULT 'pendente',
    bonus_amount DECIMAL(12,2) NOT NULL CONSTRAINT df_referrals_bonus DEFAULT 10.00,
    qualified_order_id BIGINT NULL,
    qualified_at DATETIME2 NULL,
    paid_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_referrals_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_referrals_referred UNIQUE (referred_user_id),
    CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_referrals_order FOREIGN KEY (qualified_order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT ck_referrals_status CHECK (status IN ('pendente', 'qualificado', 'pago', 'cancelado'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_referrals_referrer' AND object_id = OBJECT_ID('dbo.referrals'))
  CREATE INDEX ix_referrals_referrer ON dbo.referrals(referrer_user_id, status, created_at DESC);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- ─── 2. Payout requests (partner self-service withdrawals) ──────────────
IF OBJECT_ID('dbo.payout_requests', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payout_requests (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payout_requests PRIMARY KEY,
    partner_id BIGINT NOT NULL,
    requested_by_user_id BIGINT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_payout_requests_status DEFAULT 'solicitado',
    bank_info NVARCHAR(MAX) NULL,
    notes NVARCHAR(500) NULL,
    admin_notes NVARCHAR(500) NULL,
    requested_at DATETIME2 NOT NULL CONSTRAINT df_payout_requests_requested_at DEFAULT SYSUTCDATETIME(),
    approved_at DATETIME2 NULL,
    paid_at DATETIME2 NULL,
    rejected_at DATETIME2 NULL,
    CONSTRAINT fk_payout_requests_partner FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT fk_payout_requests_user FOREIGN KEY (requested_by_user_id) REFERENCES dbo.users(id),
    CONSTRAINT ck_payout_requests_status CHECK (status IN ('solicitado', 'em_analise', 'aprovado', 'pago', 'rejeitado', 'cancelado')),
    CONSTRAINT ck_payout_requests_amount_positive CHECK (amount > 0)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payout_requests_partner' AND object_id = OBJECT_ID('dbo.payout_requests'))
  CREATE INDEX ix_payout_requests_partner ON dbo.payout_requests(partner_id, status, requested_at DESC);

-- Link receivables to payout request when paid
IF COL_LENGTH('dbo.receivables', 'payout_request_id') IS NULL
  ALTER TABLE dbo.receivables ADD payout_request_id BIGINT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_receivables_payout_request')
  ALTER TABLE dbo.receivables ADD CONSTRAINT fk_receivables_payout_request FOREIGN KEY (payout_request_id) REFERENCES dbo.payout_requests(id);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- ─── 3. Order status history (timeline) ─────────────────────────────────
IF OBJECT_ID('dbo.order_status_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.order_status_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_order_status_events PRIMARY KEY,
    order_id BIGINT NOT NULL,
    status VARCHAR(40) NOT NULL,
    payment_status VARCHAR(40) NULL,
    note NVARCHAR(500) NULL,
    actor_id BIGINT NULL,
    actor_type VARCHAR(20) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_order_status_events_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_order_status_events_order FOREIGN KEY (order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT fk_order_status_events_actor FOREIGN KEY (actor_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_order_status_events_order' AND object_id = OBJECT_ID('dbo.order_status_events'))
  CREATE INDEX ix_order_status_events_order ON dbo.order_status_events(order_id, created_at DESC);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '013_referrals_payouts_tracking.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('013_referrals_payouts_tracking.sql');
END;
