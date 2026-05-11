SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 014 - Hot-path indexes and webhook dedupe table
-- - Adds covering indexes for payment_reference, FK joins and password recovery
-- - Creates webhook_events to guarantee idempotent processing of repeated provider deliveries

-- ─── Indexes ────────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_orders_payment_reference' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE UNIQUE INDEX ux_orders_payment_reference
    ON dbo.product_orders(payment_reference)
    WHERE payment_reference IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_orders_mp_payment_id' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_orders_mp_payment_id
    ON dbo.product_orders(mercado_pago_payment_id)
    WHERE mercado_pago_payment_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_orders_user' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_orders_user ON dbo.product_orders(user_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_orders_product' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_orders_product ON dbo.product_orders(product_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_orders_status_created' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_orders_status_created
    ON dbo.product_orders(status, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_referred_by' AND object_id = OBJECT_ID('dbo.users'))
  CREATE INDEX ix_users_referred_by ON dbo.users(referred_by_user_id)
    WHERE referred_by_user_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_reset_token' AND object_id = OBJECT_ID('dbo.users'))
  CREATE INDEX ix_users_reset_token ON dbo.users(reset_token)
    WHERE reset_token IS NOT NULL;
GO

IF COL_LENGTH('dbo.payment_transactions', 'external_payment_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_tx_external' AND object_id = OBJECT_ID('dbo.payment_transactions'))
  CREATE INDEX ix_payment_tx_external
    ON dbo.payment_transactions(external_payment_id)
    WHERE external_payment_id IS NOT NULL;
GO

IF COL_LENGTH('dbo.cashback_transactions', 'expires_at') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_cashback_user_expires' AND object_id = OBJECT_ID('dbo.cashback_transactions'))
  CREATE INDEX ix_cashback_user_expires
    ON dbo.cashback_transactions(user_id, expires_at)
    WHERE tipo = 'credito';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_audit_logs_actor_created' AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE INDEX ix_audit_logs_actor_created
    ON dbo.audit_logs(actor_id, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_notifications_user_created' AND object_id = OBJECT_ID('dbo.notifications'))
  CREATE INDEX ix_notifications_user_created
    ON dbo.notifications(user_id, created_at DESC);
GO

-- ─── webhook_events (idempotent dedupe) ──────────────────────────────────────
IF OBJECT_ID('dbo.webhook_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.webhook_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_webhook_events PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,
    event_id NVARCHAR(120) NOT NULL,
    event_type NVARCHAR(80) NULL,
    payload_hash CHAR(64) NULL,
    received_at DATETIME2 NOT NULL CONSTRAINT df_webhook_events_received_at DEFAULT (SYSUTCDATETIME()),
    processed_at DATETIME2 NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT df_webhook_events_status DEFAULT 'pending',
    error_message NVARCHAR(500) NULL,
    CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, event_id)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_webhook_events_received' AND object_id = OBJECT_ID('dbo.webhook_events'))
  CREATE INDEX ix_webhook_events_received
    ON dbo.webhook_events(received_at DESC);
GO
