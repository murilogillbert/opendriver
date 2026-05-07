SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

-- 1. Liga usuario a um parceiro -----------------------------------------
-- Usuarios com tipo_usuario = 'parceiro' agora referenciam diretamente
-- o partner que operam. Permite forcar partner_id em /api/benefits/redeem
-- e expor um terminal proprio para cada parceiro logar e validar cupons.
IF COL_LENGTH('dbo.users', 'partner_id') IS NULL
  ALTER TABLE dbo.users ADD partner_id BIGINT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_users_partners')
  ALTER TABLE dbo.users ADD CONSTRAINT fk_users_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_partner' AND object_id = OBJECT_ID('dbo.users'))
  CREATE INDEX ix_users_partner ON dbo.users(partner_id) WHERE partner_id IS NOT NULL;

-- 2. Forca troca de senha no primeiro login -----------------------------
-- Senha inicial '123456' e plantada quando o admin cria o parceiro. Antes
-- do operador conseguir redimir cupons, o terminal exige a troca.
IF COL_LENGTH('dbo.users', 'password_must_change') IS NULL
  ALTER TABLE dbo.users ADD password_must_change BIT NOT NULL CONSTRAINT df_users_password_must_change DEFAULT 0;

GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '011_partner_login.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('011_partner_login.sql');
END;
