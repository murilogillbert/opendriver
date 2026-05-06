SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.product_orders', 'payment_reference') IS NULL
  ALTER TABLE dbo.product_orders ADD payment_reference NVARCHAR(120) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_product_orders_payment_reference' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_product_orders_payment_reference ON dbo.product_orders(payment_reference, created_at DESC);

IF OBJECT_ID('dbo.payment_transactions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payment_transactions (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_payment_transactions PRIMARY KEY,
    order_id BIGINT NULL,
    user_id BIGINT NULL,
    product_id BIGINT NULL,
    provider VARCHAR(40) NOT NULL CONSTRAINT df_payment_transactions_provider DEFAULT 'mercado_pago',
    external_reference NVARCHAR(120) NULL,
    external_payment_id NVARCHAR(80) NULL,
    payment_method VARCHAR(30) NULL,
    amount DECIMAL(12,2) NULL,
    status VARCHAR(30) NOT NULL,
    status_detail NVARCHAR(120) NULL,
    request_payload NVARCHAR(MAX) NULL,
    response_payload NVARCHAR(MAX) NULL,
    last_synced_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_payment_transactions_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_payment_transactions_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_payment_transactions_orders FOREIGN KEY (order_id) REFERENCES dbo.product_orders(id),
    CONSTRAINT fk_payment_transactions_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_payment_transactions_products FOREIGN KEY (product_id) REFERENCES dbo.products(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_transactions_order' AND object_id = OBJECT_ID('dbo.payment_transactions'))
  CREATE INDEX ix_payment_transactions_order ON dbo.payment_transactions(order_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_transactions_external_reference' AND object_id = OBJECT_ID('dbo.payment_transactions'))
  CREATE INDEX ix_payment_transactions_external_reference ON dbo.payment_transactions(external_reference, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payment_transactions_external_payment_id' AND object_id = OBJECT_ID('dbo.payment_transactions'))
  CREATE INDEX ix_payment_transactions_external_payment_id ON dbo.payment_transactions(external_payment_id, created_at DESC);

UPDATE dbo.product_orders
   SET payment_reference = public_code
 WHERE payment_reference IS NULL
   AND mercado_pago_payment_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '007_payment_transactions_reconciliation.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('007_payment_transactions_reconciliation.sql');
END;
