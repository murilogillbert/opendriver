SET XACT_ABORT ON;

DECLARE @partner_id BIGINT;
DECLARE @service_id BIGINT;

IF NOT EXISTS (SELECT 1 FROM dbo.partners WHERE nome_fantasia = 'Parceiro Demonstracao Open Driver')
BEGIN
  INSERT INTO dbo.partners (
    razao_social, nome_fantasia, responsavel, telefone, whatsapp, email,
    endereco, bairro, cidade, estado, status
  )
  VALUES (
    'Parceiro Demonstracao Open Driver LTDA',
    'Parceiro Demonstracao Open Driver',
    'Atendimento',
    '61999990000',
    '61999990000',
    'parceiro@opendriver.local',
    'Avenida Principal, 100',
    'Centro',
    'Brasilia',
    'DF',
    'ativo'
  );
END;

SELECT @partner_id = id
  FROM dbo.partners
 WHERE nome_fantasia = 'Parceiro Demonstracao Open Driver';

IF @partner_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.partner_services WHERE partner_id = @partner_id AND nome_servico = 'Troca de oleo Open Driver')
BEGIN
  INSERT INTO dbo.partner_services (
    partner_id, categoria, nome_servico, descricao, preco_padrao, preco_open_driver, ativo
  )
  VALUES (
    @partner_id,
    'troca_oleo',
    'Troca de oleo Open Driver',
    'Servico de demonstracao para validar o fluxo de lead, ordem e comissao.',
    180.00,
    149.90,
    1
  );
END;

SELECT @service_id = id
  FROM dbo.partner_services
 WHERE partner_id = @partner_id
   AND nome_servico = 'Troca de oleo Open Driver';

IF @partner_id IS NOT NULL
   AND @service_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.commission_rules WHERE partner_id = @partner_id AND partner_service_id = @service_id)
BEGIN
  INSERT INTO dbo.commission_rules (
    partner_id, partner_service_id, tipo_comissao, valor_fixo, percentual,
    recorrencia, prazo_pagamento, ativo
  )
  VALUES (
    @partner_id,
    @service_id,
    'hibrida',
    10.00,
    5.00,
    'todas_as_compras',
    'mensal',
    1
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_migrations WHERE migration_name = '003_seed_mvp.sql')
BEGIN
  INSERT INTO dbo.schema_migrations (migration_name) VALUES ('003_seed_mvp.sql');
END;
