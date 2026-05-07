SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- Backfill: every benefit_activation tied to a non-recurring offer must be single-use.
-- Until now redemption_limit was carrying over the optional product.limite_resgates
-- (usually NULL = unlimited), which let partners redeem the same voucher repeatedly.
-- For 'beneficio_recorrente' we leave the existing value (NULL = unlimited or the
-- explicit limit defined per product). Everything else is forced to 1, and any
-- activation that has already been redeemed at least once is marked exhausted.
UPDATE a
   SET a.redemption_limit = 1,
       a.status = CASE
                    WHEN COALESCE(a.redemption_count, 0) >= 1 AND a.status = 'ativo' THEN 'esgotado'
                    ELSE a.status
                  END,
       a.updated_at = SYSUTCDATETIME()
  FROM dbo.benefit_activations a
  JOIN dbo.products p ON p.id = a.product_id
 WHERE p.offer_type <> 'beneficio_recorrente'
   AND (a.redemption_limit IS NULL OR a.redemption_limit > 1);

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '012_single_use_activations_backfill.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('012_single_use_activations_backfill.sql');
END;
