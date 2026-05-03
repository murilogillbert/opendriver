SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.users', 'cpf') IS NULL
  ALTER TABLE dbo.users ADD cpf VARCHAR(14) NULL;

IF COL_LENGTH('dbo.products', 'offer_type') IS NULL
  ALTER TABLE dbo.products ADD offer_type VARCHAR(30) NULL;

IF COL_LENGTH('dbo.products', 'delivery_method') IS NULL
  ALTER TABLE dbo.products ADD delivery_method VARCHAR(30) NULL;

IF COL_LENGTH('dbo.products', 'gallery_urls') IS NULL
  ALTER TABLE dbo.products ADD gallery_urls NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.products', 'usage_rules') IS NULL
  ALTER TABLE dbo.products ADD usage_rules NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.products', 'delivery_deadline') IS NULL
  ALTER TABLE dbo.products ADD delivery_deadline NVARCHAR(120) NULL;

IF COL_LENGTH('dbo.products', 'payment_required') IS NULL
  ALTER TABLE dbo.products ADD payment_required BIT NOT NULL CONSTRAINT df_products_payment_required DEFAULT 1;

IF COL_LENGTH('dbo.products', 'offer_type') IS NOT NULL
BEGIN
  EXEC('UPDATE dbo.products SET offer_type = CASE WHEN tipo = ''fisico'' THEN ''produto_fisico'' ELSE ''produto_digital'' END WHERE offer_type IS NULL;');
  ALTER TABLE dbo.products ALTER COLUMN offer_type VARCHAR(30) NOT NULL;
END;

IF COL_LENGTH('dbo.products', 'delivery_method') IS NOT NULL
BEGIN
  EXEC('UPDATE dbo.products SET delivery_method = CASE WHEN tipo_entrega = ''fisico'' THEN ''fisica'' WHEN tipo_entrega = ''ambos'' THEN ''digital'' ELSE ''digital'' END WHERE delivery_method IS NULL;');
  ALTER TABLE dbo.products ALTER COLUMN delivery_method VARCHAR(30) NOT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_products_offer_type')
  ALTER TABLE dbo.products ADD CONSTRAINT ck_products_offer_type CHECK (offer_type IN ('produto_fisico', 'produto_digital', 'servico', 'voucher', 'beneficio_recorrente', 'assinatura', 'combo'));

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_products_delivery_method')
  ALTER TABLE dbo.products ADD CONSTRAINT ck_products_delivery_method CHECK (delivery_method IN ('digital', 'presencial', 'fisica'));

IF COL_LENGTH('dbo.product_orders', 'payment_status') IS NULL
  ALTER TABLE dbo.product_orders ADD payment_status VARCHAR(30) NOT NULL CONSTRAINT df_product_orders_payment_status DEFAULT 'approved';

IF COL_LENGTH('dbo.product_orders', 'payment_method') IS NULL
  ALTER TABLE dbo.product_orders ADD payment_method VARCHAR(30) NULL;

IF COL_LENGTH('dbo.product_orders', 'mercado_pago_payment_id') IS NULL
  ALTER TABLE dbo.product_orders ADD mercado_pago_payment_id NVARCHAR(80) NULL;

IF COL_LENGTH('dbo.product_orders', 'mercado_pago_status') IS NULL
  ALTER TABLE dbo.product_orders ADD mercado_pago_status NVARCHAR(80) NULL;

IF COL_LENGTH('dbo.product_orders', 'paid_at') IS NULL
  ALTER TABLE dbo.product_orders ADD paid_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_product_orders_payment_status')
  ALTER TABLE dbo.product_orders ADD CONSTRAINT ck_product_orders_payment_status CHECK (payment_status IN ('pending', 'approved', 'rejected', 'refunded', 'cancelled'));

IF OBJECT_ID('dbo.page_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.page_events (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_page_events PRIMARY KEY,
    event_name VARCHAR(60) NOT NULL,
    path NVARCHAR(240) NULL,
    user_id BIGINT NULL,
    metadata NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_page_events_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_page_events_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_products_offer_type_status' AND object_id = OBJECT_ID('dbo.products'))
  CREATE INDEX ix_products_offer_type_status ON dbo.products(offer_type, status, destaque_home);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_product_orders_payment_status' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_product_orders_payment_status ON dbo.product_orders(payment_status, status, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_page_events_name_created' AND object_id = OBJECT_ID('dbo.page_events'))
  CREATE INDEX ix_page_events_name_created ON dbo.page_events(event_name, created_at DESC);

DECLARE @combustivel BIGINT = (SELECT id FROM dbo.product_categories WHERE slug = 'combustivel');
DECLARE @automotivo BIGINT = (SELECT id FROM dbo.product_categories WHERE slug = 'automotivo');
DECLARE @digital BIGINT = (SELECT id FROM dbo.product_categories WHERE slug = 'digital');
DECLARE @farmacia BIGINT = (SELECT id FROM dbo.product_categories WHERE slug = 'farmacia');
DECLARE @alimentacao BIGINT = (SELECT id FROM dbo.product_categories WHERE slug = 'alimentacao');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'lavagem-automotiva-premium')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@automotivo, 'Lavagem Automotiva Premium', 'lavagem-automotiva-premium', 'Voucher presencial para lavagem completa em parceiro Open Driver.', 'Servico presencial com agendamento em parceiro credenciado.', 'digital', 'digital', 'servico', 'presencial', 70, 49, 21, 84, 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=900&q=80', 'Agendamento sujeito a disponibilidade do parceiro.', 'Uso presencial mediante voucher', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'troca-oleo-open-driver')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@automotivo, 'Troca de Oleo Open Driver', 'troca-oleo-open-driver', 'Servico de troca de oleo com preco negociado.', 'Voucher para troca de oleo em oficina parceira.', 'digital', 'digital', 'servico', 'presencial', 180, 149, 31, 31, 'https://images.unsplash.com/photo-1632823471565-1ecdf5c3f9bb?auto=format&fit=crop&w=900&q=80', 'Valido para modelos e oleos participantes.', 'Uso presencial mediante voucher', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'alinhamento-balanceamento')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@automotivo, 'Alinhamento e Balanceamento', 'alinhamento-balanceamento', 'Servico presencial para melhorar conforto e seguranca.', 'Voucher para alinhamento e balanceamento em parceiro credenciado.', 'digital', 'digital', 'servico', 'presencial', 160, 119, 41, 41, 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=900&q=80', 'Valido em lojas participantes.', 'Uso presencial mediante voucher', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'assistencia-mensal-guincho')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@automotivo, 'Plano Assistencia Mensal', 'assistencia-mensal-guincho', 'Guincho e suporte automotivo com assinatura mensal.', 'Beneficio recorrente para suporte e emergencia automotiva.', 'digital', 'digital', 'assinatura', 'digital', 59, 29, 30, 120, 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=900&q=80', 'Cobertura conforme regras do parceiro.', 'Liberacao digital apos pagamento', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'curso-digital-motoristas')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@digital, 'Curso Digital para Motoristas', 'curso-digital-motoristas', 'Aulas online para melhorar ganhos e atendimento.', 'Produto digital liberado na area do cliente apos confirmacao.', 'digital', 'digital', 'produto_digital', 'digital', 197, 79, 118, 118, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', 'Acesso pessoal e intransferivel.', 'Liberacao digital imediata', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'voucher-farmacia-100')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@farmacia, 'Voucher Farmacia R$100', 'voucher-farmacia-100', 'Credito para medicamentos e higiene em parceiros.', 'Voucher digital para farmacias participantes.', 'digital', 'digital', 'voucher', 'digital', 100, 85, 15, 60, 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80', 'Uso conforme rede parceira.', 'Envio digital apos pagamento', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'voucher-alimentacao-100')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@alimentacao, 'Voucher Alimentacao R$100', 'voucher-alimentacao-100', 'Credito para mercados, lanches e restaurantes.', 'Voucher digital para uso em parceiros de alimentacao.', 'digital', 'digital', 'voucher', 'digital', 100, 88, 12, 72, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', 'Uso conforme parceiros participantes.', 'Envio digital apos pagamento', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'combo-economia-motorista')
  INSERT INTO dbo.products (category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega, offer_type, delivery_method, preco_original, preco_desconto, economia_estimada, economia_mensal_estimada, imagem_url, usage_rules, delivery_deadline, destaque_home, status)
  VALUES (@automotivo, 'Combo Economia Motorista', 'combo-economia-motorista', 'Combustivel, lavagem e farmacia em uma oferta combinada.', 'Combo promocional com multiplos beneficios digitais.', 'digital', 'digital', 'combo', 'digital', 270, 219, 51, 204, 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80', 'Cada beneficio segue as regras do parceiro.', 'Liberacao digital apos pagamento', 1, 'ativo');

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '005_unified_catalog_payments.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('005_unified_catalog_payments.sql');
END;
