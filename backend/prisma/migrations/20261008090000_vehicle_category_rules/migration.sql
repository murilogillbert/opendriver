-- Categoria de veículo decidida por regra, e não por autodeclaração do motorista.
--
-- O problema: `vehicles.category` é escolha livre do motorista (`vehicleSchema` só valida o
-- enum). A categoria define a tarifa — `pricing` tem `category` como chave primária, e
-- Conforto é mais caro em base, por km, por minuto e na mínima. Então hoje o motorista
-- escolhe quanto o passageiro paga. E não existe caminho nenhum para corrigir depois: o
-- admin só aprova ou rejeita o veículo, e o motorista não tem rota de edição — reclassificar
-- exige apagar e recadastrar.
--
-- A consulta ao Detran já devolve `marca_modelo` e `ano_fabricacao`, e hoje esse retorno é
-- usado só para conferir se bate com o que o motorista digitou. É exatamente o dado que
-- classifica o veículo, e estava sendo descartado.
--
-- Três peças, todas aditivas:
--
--   1. `detran_providers`        — qual endpoint atende cada UF e o que ele exige.
--   2. `vehicle_model_categories` — a regra marca/modelo/ano -> categoria.
--   3. colunas novas em `vehicles` — o que a regra calculou, de onde veio a categoria
--                                    vigente, e o que o Detran respondeu.
--
-- Nada existente muda de tipo, vira obrigatório ou é removido: o app publicado continua
-- funcionando sem alteração.

-- ============================================================================
-- 1. Registro de UF do Detran
-- ============================================================================
--
-- Por que no banco e não em constante no código: a lista estava fixa em duas UFs
-- (`STATE_ENDPOINT = { MT, MS }`) e qualquer outra caía em revisão manual para sempre. Pior,
-- o caminho de cada serviço da Infosimples não é verificável sem gastar consulta — uma
-- sondagem sem token devolve erro de autenticação **antes** de validar a rota, então 601 não
-- prova que o endpoint existe. Com a tabela, corrigir um caminho errado é edição no admin,
-- não deploy.
--
-- `requires_*` existe porque os serviços divergem no que pedem: MT e MS aceitam placa +
-- renavam; a consulta unificada exige chassi também; GO exige login do gov.br ou certificado
-- A1; TO exige o CPF/CNPJ do proprietário.
CREATE TABLE IF NOT EXISTS "opendriver"."detran_providers" (
  "uf"                VARCHAR(2)   PRIMARY KEY,
  "label"             VARCHAR(80)  NOT NULL,
  "endpoint"          VARCHAR(300) NOT NULL,

  "requires_chassi"   BOOLEAN      NOT NULL DEFAULT false,
  "requires_login"    BOOLEAN      NOT NULL DEFAULT false,
  "requires_cpf_cnpj" BOOLEAN      NOT NULL DEFAULT false,

  -- Chaves de `public.integration_settings` onde a credencial desta UF vive. Ficam aqui, e
  -- não o valor, para segredo continuar num lugar só e já auditado.
  "login_setting_key" VARCHAR(80),
  "senha_setting_key" VARCHAR(80),

  "active"            BOOLEAN      NOT NULL DEFAULT true,
  "notes"             VARCHAR(400),

  -- Resultado da última consulta real feita por esta UF, para o operador saber se o caminho
  -- funciona sem abrir log de servidor.
  "last_probe_at"     TIMESTAMP(3),
  "last_probe_result" VARCHAR(400),

  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"        UUID
);

-- MT e MS: único formato já exercitado em código (placa + renavam).
-- GO: endpoint existe, mas a documentação lista `login_cpf`/`login_senha` ou
--     `pkcs12_cert`/`pkcs12_pass`. Fica inativo até a credencial existir — e inativo cai em
--     revisão manual com motivo explícito, em vez de falhar calado.
-- DF: `detran-df-veiculo` foi descontinuado quando o site oficial mudou. O substituto
--     indicado pela própria Infosimples é `DETRAN / DF / Veículo (Mobile)`, que pede só
--     placa + renavam e devolve `marca` e `modelo` em campos separados.
INSERT INTO "opendriver"."detran_providers"
  ("uf", "label", "endpoint", "requires_chassi", "requires_login", "login_setting_key", "senha_setting_key", "active", "notes")
VALUES
  ('MT', 'Detran MT — Veículo',
   'https://api.infosimples.com/api/v2/consultas/detran/mt/veiculo',
   false, false, NULL, NULL, true,
   'Placa + renavam. Formato já exercitado em código.'),

  ('MS', 'Detran MS — Veículo',
   'https://api.infosimples.com/api/v2/consultas/detran/ms/veiculo',
   false, false, NULL, NULL, true,
   'Placa + renavam.'),

  ('DF', 'Detran DF — Veículo (Mobile)',
   'https://api.infosimples.com/api/v2/consultas/detran/df/veiculo-mobile',
   false, false, NULL, NULL, true,
   'Substitui o detran-df-veiculo, descontinuado. Devolve marca e modelo separados. Caminho ainda não confirmado por consulta real — usar o teste do admin.'),

  ('GO', 'Detran GO — Veículo',
   'https://api.infosimples.com/api/v2/consultas/detran/go/veiculo',
   false, true, 'Infosimples:GoLoginCpf', 'Infosimples:GoLoginSenha', false,
   'Exige login do gov.br (CPF + senha) ou certificado A1. Inativo até a credencial ser cadastrada em Integrações.')
ON CONFLICT ("uf") DO NOTHING;

-- ============================================================================
-- 2. Regra de categoria por marca, modelo e faixa de ano
-- ============================================================================
--
-- `model_pattern` é comparado por prefixo sobre o texto normalizado (maiúsculas, sem acento,
-- sem pontuação). Prefixo e não igualdade porque o Detran devolve o modelo com sufixo de
-- versão: "ONIX 1.0 LT", "COROLLA XEI 2.0 FLEX". Uma regra "COROLLA" casa com todas as
-- versões; uma regra "COROLLA CROSS" é mais específica e ganha pela `priority`.
--
-- `priority` menor ganha. Assim uma regra genérica da marca pode conviver com exceções de
-- modelo sem precisar enumerar tudo.
CREATE TABLE IF NOT EXISTS "opendriver"."vehicle_model_categories" (
  "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand"         VARCHAR(60)  NOT NULL,
  "model_pattern" VARCHAR(80)  NOT NULL,
  "year_from"     INTEGER,
  "year_to"       INTEGER,
  "category"      "opendriver"."VehicleCategory" NOT NULL,
  "priority"      INTEGER      NOT NULL DEFAULT 100,
  -- 'semente' = carga inicial deste repositório; 'manual' = criada no admin;
  -- 'importado' = veio de CSV.
  "source"        VARCHAR(20)  NOT NULL DEFAULT 'manual',
  "active"        BOOLEAN      NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"    UUID
);

-- Busca da regra: filtra por marca e atividade, ordena por prioridade.
CREATE INDEX IF NOT EXISTS "vehicle_model_categories_brand_active_idx"
  ON "opendriver"."vehicle_model_categories" ("brand", "active", "priority");

-- Impede duas regras idênticas. `coalesce` nas faixas porque NULL não colide em índice único
-- no Postgres, e sem isso daria para cadastrar "ONIX sem faixa de ano" várias vezes.
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_model_categories_regra_key"
  ON "opendriver"."vehicle_model_categories"
     ("brand", "model_pattern", COALESCE("year_from", 0), COALESCE("year_to", 9999));

-- ============================================================================
-- 3. O que a regra decidiu, em cada veículo
-- ============================================================================
--
-- `category` continua sendo a categoria **vigente** (a que o despacho e a tarifa leem), para
-- nada que já consulta a coluna precisar mudar. As colunas novas registram como ela foi
-- decidida.
--
-- `category_source`:
--   'driver' — autodeclarada e nenhuma regra casou (ou consulta indisponível)
--   'auto'   — decidida por regra a partir do retorno do Detran
--   'admin'  — um operador reclassificou à mão, e isso tem precedência sobre a regra
ALTER TABLE "opendriver"."vehicles"
  ADD COLUMN IF NOT EXISTS "category_source"     VARCHAR(10) NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS "category_auto"       "opendriver"."VehicleCategory",
  ADD COLUMN IF NOT EXISTS "category_divergence" BOOLEAN     NOT NULL DEFAULT false,
  -- O que o Detran respondeu, normalizado. Guardado para auditoria e para reclassificar em
  -- lote quando a regra mudar, sem consultar o Detran de novo (consulta é paga).
  ADD COLUMN IF NOT EXISTS "detran_brand"        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "detran_model"        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "detran_year"         INTEGER;

-- Fila de divergência do operador: veículo em que o motorista declarou uma categoria e a
-- regra calculou outra.
CREATE INDEX IF NOT EXISTS "vehicles_category_divergence_idx"
  ON "opendriver"."vehicles" ("category_divergence")
  WHERE "category_divergence" = true;

-- Fila de reprocessamento: veículo que nunca foi validado automaticamente.
CREATE INDEX IF NOT EXISTS "vehicles_validation_status_idx"
  ON "opendriver"."vehicles" ("validation_status");
