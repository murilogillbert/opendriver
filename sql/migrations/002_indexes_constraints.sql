SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_telefone' AND object_id = OBJECT_ID('dbo.users'))
  CREATE INDEX ix_users_telefone ON dbo.users (telefone);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_partners_city_status' AND object_id = OBJECT_ID('dbo.partners'))
  CREATE INDEX ix_partners_city_status ON dbo.partners (cidade, estado, status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_partner_services_partner_category' AND object_id = OBJECT_ID('dbo.partner_services'))
  CREATE INDEX ix_partner_services_partner_category ON dbo.partner_services (partner_id, categoria, ativo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_commission_rules_lookup' AND object_id = OBJECT_ID('dbo.commission_rules'))
  CREATE INDEX ix_commission_rules_lookup ON dbo.commission_rules (partner_id, partner_service_id, ativo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_leads_status_created' AND object_id = OBJECT_ID('dbo.leads'))
  CREATE INDEX ix_leads_status_created ON dbo.leads (status, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_leads_partner' AND object_id = OBJECT_ID('dbo.leads'))
  CREATE INDEX ix_leads_partner ON dbo.leads (partner_id, partner_service_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_bot_interactions_lead_created' AND object_id = OBJECT_ID('dbo.bot_interactions'))
  CREATE INDEX ix_bot_interactions_lead_created ON dbo.bot_interactions (lead_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_service_orders_status_created' AND object_id = OBJECT_ID('dbo.service_orders'))
  CREATE INDEX ix_service_orders_status_created ON dbo.service_orders (status, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_commissions_status_payment' AND object_id = OBJECT_ID('dbo.commissions'))
  CREATE INDEX ix_commissions_status_payment ON dbo.commissions (status, data_prevista_pagamento);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_payments_commission' AND object_id = OBJECT_ID('dbo.payments'))
  CREATE INDEX ix_payments_commission ON dbo.payments (commission_id, status);

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '002_indexes_constraints.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('002_indexes_constraints.sql');
END;
