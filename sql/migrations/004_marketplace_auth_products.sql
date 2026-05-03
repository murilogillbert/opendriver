SET XACT_ABORT ON;

IF COL_LENGTH('dbo.users', 'password_hash') IS NULL
  ALTER TABLE dbo.users ADD password_hash NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.users', 'endereco') IS NULL
  ALTER TABLE dbo.users ADD endereco NVARCHAR(240) NULL;

IF COL_LENGTH('dbo.users', 'numero') IS NULL
  ALTER TABLE dbo.users ADD numero NVARCHAR(30) NULL;

IF COL_LENGTH('dbo.users', 'complemento') IS NULL
  ALTER TABLE dbo.users ADD complemento NVARCHAR(120) NULL;

IF COL_LENGTH('dbo.users', 'bairro') IS NULL
  ALTER TABLE dbo.users ADD bairro NVARCHAR(120) NULL;

IF COL_LENGTH('dbo.users', 'cep') IS NULL
  ALTER TABLE dbo.users ADD cep VARCHAR(12) NULL;

IF COL_LENGTH('dbo.users', 'reset_token') IS NULL
  ALTER TABLE dbo.users ADD reset_token NVARCHAR(120) NULL;

IF COL_LENGTH('dbo.users', 'reset_token_expires_at') IS NULL
  ALTER TABLE dbo.users ADD reset_token_expires_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_users_email_not_null' AND object_id = OBJECT_ID('dbo.users'))
  CREATE UNIQUE INDEX ux_users_email_not_null ON dbo.users(email) WHERE email IS NOT NULL;

IF OBJECT_ID('dbo.product_categories', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.product_categories (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_product_categories PRIMARY KEY,
    nome NVARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    descricao NVARCHAR(500) NULL,
    ordem INT NOT NULL CONSTRAINT df_product_categories_ordem DEFAULT 0,
    ativo BIT NOT NULL CONSTRAINT df_product_categories_ativo DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_product_categories_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_product_categories_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_product_categories_slug UNIQUE (slug)
  );
END;

IF OBJECT_ID('dbo.products', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.products (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_products PRIMARY KEY,
    category_id BIGINT NULL,
    partner_id BIGINT NULL,
    nome NVARCHAR(160) NOT NULL,
    slug VARCHAR(180) NOT NULL,
    descricao_curta NVARCHAR(280) NOT NULL,
    descricao NVARCHAR(MAX) NOT NULL,
    tipo VARCHAR(20) NOT NULL CONSTRAINT ck_products_tipo CHECK (tipo IN ('digital', 'fisico')),
    tipo_entrega VARCHAR(20) NOT NULL CONSTRAINT ck_products_tipo_entrega CHECK (tipo_entrega IN ('digital', 'fisico', 'ambos')),
    preco_original DECIMAL(12,2) NOT NULL,
    preco_desconto DECIMAL(12,2) NOT NULL,
    economia_estimada DECIMAL(12,2) NOT NULL,
    economia_mensal_estimada DECIMAL(12,2) NOT NULL CONSTRAINT df_products_economia_mensal DEFAULT 0,
    imagem_url NVARCHAR(500) NULL,
    video_url NVARCHAR(500) NULL,
    estoque INT NULL,
    limite_resgates INT NULL,
    destaque_home BIT NOT NULL CONSTRAINT df_products_destaque DEFAULT 0,
    status VARCHAR(20) NOT NULL CONSTRAINT df_products_status DEFAULT 'ativo' CONSTRAINT ck_products_status CHECK (status IN ('ativo', 'pausado', 'esgotado', 'rascunho')),
    created_at DATETIME2 NOT NULL CONSTRAINT df_products_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_products_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_products_categories FOREIGN KEY (category_id) REFERENCES dbo.product_categories(id),
    CONSTRAINT fk_products_partners FOREIGN KEY (partner_id) REFERENCES dbo.partners(id),
    CONSTRAINT uq_products_slug UNIQUE (slug)
  );
END;

IF OBJECT_ID('dbo.product_orders', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.product_orders (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_product_orders PRIMARY KEY,
    public_code UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_product_orders_public_code DEFAULT NEWID(),
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantidade INT NOT NULL CONSTRAINT df_product_orders_quantidade DEFAULT 1,
    valor_original_total DECIMAL(12,2) NOT NULL,
    valor_pago_total DECIMAL(12,2) NOT NULL,
    economia_total DECIMAL(12,2) NOT NULL,
    tipo_entrega VARCHAR(20) NOT NULL CONSTRAINT ck_product_orders_tipo_entrega CHECK (tipo_entrega IN ('digital', 'fisico')),
    email_entrega NVARCHAR(180) NULL,
    endereco_entrega NVARCHAR(500) NOT NULL,
    voucher_code VARCHAR(40) NULL,
    status VARCHAR(30) NOT NULL CONSTRAINT df_product_orders_status DEFAULT 'confirmado' CONSTRAINT ck_product_orders_status CHECK (status IN ('pendente_pagamento', 'confirmado', 'enviado', 'entregue', 'cancelado')),
    created_at DATETIME2 NOT NULL CONSTRAINT df_product_orders_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_product_orders_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_product_orders_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_product_orders_products FOREIGN KEY (product_id) REFERENCES dbo.products(id),
    CONSTRAINT uq_product_orders_public_code UNIQUE (public_code)
  );
END;

IF OBJECT_ID('dbo.notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.notifications (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_notifications PRIMARY KEY,
    user_id BIGINT NOT NULL,
    titulo NVARCHAR(160) NOT NULL,
    mensagem NVARCHAR(700) NOT NULL,
    canal VARCHAR(20) NOT NULL CONSTRAINT df_notifications_canal DEFAULT 'interno' CONSTRAINT ck_notifications_canal CHECK (canal IN ('interno', 'email')),
    lida BIT NOT NULL CONSTRAINT df_notifications_lida DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT df_notifications_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_notifications_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_products_status_category' AND object_id = OBJECT_ID('dbo.products'))
  CREATE INDEX ix_products_status_category ON dbo.products(status, category_id, destaque_home);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_product_orders_user_created' AND object_id = OBJECT_ID('dbo.product_orders'))
  CREATE INDEX ix_product_orders_user_created ON dbo.product_orders(user_id, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_notifications_user_read' AND object_id = OBJECT_ID('dbo.notifications'))
  CREATE INDEX ix_notifications_user_read ON dbo.notifications(user_id, lida, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM dbo.product_categories WHERE slug = 'combustivel')
  INSERT INTO dbo.product_categories (nome, slug, descricao, ordem) VALUES ('Combustivel', 'combustivel', 'Vouchers e descontos para abastecimento.', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.product_categories WHERE slug = 'alimentacao')
  INSERT INTO dbo.product_categories (nome, slug, descricao, ordem) VALUES ('Alimentacao', 'alimentacao', 'Mercados, restaurantes e conveniencia.', 2);

IF NOT EXISTS (SELECT 1 FROM dbo.product_categories WHERE slug = 'farmacia')
  INSERT INTO dbo.product_categories (nome, slug, descricao, ordem) VALUES ('Farmacia', 'farmacia', 'Medicamentos, saude e higiene.', 3);

IF NOT EXISTS (SELECT 1 FROM dbo.product_categories WHERE slug = 'automotivo')
  INSERT INTO dbo.product_categories (nome, slug, descricao, ordem) VALUES ('Automotivo', 'automotivo', 'Servicos e produtos para veiculos.', 4);

IF NOT EXISTS (SELECT 1 FROM dbo.product_categories WHERE slug = 'digital')
  INSERT INTO dbo.product_categories (nome, slug, descricao, ordem) VALUES ('Digital', 'digital', 'Cursos, apps e assinaturas.', 5);

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'voucher-combustivel-100')
BEGIN
  INSERT INTO dbo.products (
    category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega,
    preco_original, preco_desconto, economia_estimada, economia_mensal_estimada,
    imagem_url, destaque_home, status
  )
  SELECT id, 'Voucher Combustivel R$100', 'voucher-combustivel-100',
         'Credito digital para abastecer em parceiros selecionados.',
         'Use o voucher em postos parceiros e reduza o custo mensal com abastecimento.',
         'digital', 'digital', 100.00, 90.00, 10.00, 180.00,
         'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80',
         1, 'ativo'
    FROM dbo.product_categories WHERE slug = 'combustivel';
END;

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'clube-farmacia')
BEGIN
  INSERT INTO dbo.products (
    category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega,
    preco_original, preco_desconto, economia_estimada, economia_mensal_estimada,
    imagem_url, destaque_home, status
  )
  SELECT id, 'Clube Farmacia', 'clube-farmacia',
         'Beneficio recorrente para medicamentos, higiene e saude.',
         'Acesso a descontos recorrentes em farmacias parceiras para compras do mes.',
         'digital', 'digital', 49.00, 19.00, 30.00, 80.00,
         'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80',
         1, 'ativo'
    FROM dbo.product_categories WHERE slug = 'farmacia';
END;

IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = 'kit-limpeza-automotiva')
BEGIN
  INSERT INTO dbo.products (
    category_id, nome, slug, descricao_curta, descricao, tipo, tipo_entrega,
    preco_original, preco_desconto, economia_estimada, economia_mensal_estimada,
    imagem_url, destaque_home, status
  )
  SELECT id, 'Kit Limpeza Automotiva', 'kit-limpeza-automotiva',
         'Produtos fisicos para manter o carro limpo gastando menos.',
         'Kit com itens essenciais de limpeza automotiva enviado para o endereco cadastrado.',
         'fisico', 'fisico', 129.00, 89.00, 40.00, 40.00,
         'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=900&q=80',
         1, 'ativo'
    FROM dbo.product_categories WHERE slug = 'automotivo';
END;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '004_marketplace_auth_products.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('004_marketplace_auth_products.sql');
END;
