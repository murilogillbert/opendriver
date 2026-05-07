SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 1. Soft delete real para produtos -------------------------------------
-- "Pausado" continua sendo "ocultado mas pode reativar". "Excluido"
-- (deleted_at preenchido) some das listagens publicas/admin sem perder
-- referencia historica para pedidos antigos.
IF COL_LENGTH('dbo.products', 'deleted_at') IS NULL
  ALTER TABLE dbo.products ADD deleted_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_products_active' AND object_id = OBJECT_ID('dbo.products'))
  CREATE INDEX ix_products_active ON dbo.products(deleted_at, status);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 2. Carrinho compartilhado entre product_orders ----------------------
-- Quando um cliente paga varios produtos numa unica transacao MP, criamos
-- N product_orders compartilhando o mesmo payment_reference + cart_id.
-- O cart_id permite agrupar para refund e exibicao no admin.
IF COL_LENGTH('dbo.product_orders', 'cart_id') IS NULL
  ALTER TABLE dbo.product_orders ADD cart_id NVARCHAR(40) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_product_orders_cart' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_product_orders_cart ON dbo.product_orders(cart_id) WHERE cart_id IS NOT NULL;

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '010_cart_and_soft_delete.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('010_cart_and_soft_delete.sql');
END;
