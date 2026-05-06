SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.users', 'token_version') IS NULL
  ALTER TABLE dbo.users ADD token_version INT NOT NULL CONSTRAINT df_users_token_version DEFAULT 0;

IF COL_LENGTH('dbo.users', 'last_login_at') IS NULL
  ALTER TABLE dbo.users ADD last_login_at DATETIME2 NULL;

IF COL_LENGTH('dbo.users', 'failed_login_count') IS NULL
  ALTER TABLE dbo.users ADD failed_login_count INT NOT NULL CONSTRAINT df_users_failed_login_count DEFAULT 0;

IF COL_LENGTH('dbo.users', 'lockout_until') IS NULL
  ALTER TABLE dbo.users ADD lockout_until DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '008_auth_hardening.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('008_auth_hardening.sql');
END;
