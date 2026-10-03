-- Receita de anúncio no livro-caixa do motorista.
--
-- O openad (plataforma de anúncios em telas automotivas) credita o motorista por veiculação
-- faturável. Existem duas carteiras de motorista no ecossistema, e esta é a que ele de fato
-- olha: `opendriver.driver_earnings` já tem extrato, saldo agregado, `payout_requests` e as
-- telas de saque por PIX. A alternativa — `public.users.cashback_balance` — é cashback de
-- compras, e misturar receita de anúncio ali inviabilizaria separar as duas na contabilidade.
--
-- Aditiva: um valor novo de enum e uma coluna anulável. Nada existente muda.

-- 1. O tipo de lançamento.
--
-- `ALTER TYPE ... ADD VALUE` não roda dentro de bloco de transação no Postgres anterior ao
-- 12. Produção é 16.15, então é seguro; fica registrado porque é a primeira migration deste
-- repositório a tocar um enum existente.
ALTER TYPE "opendriver"."EarningType" ADD VALUE IF NOT EXISTS 'AdRevenue';

-- 2. Idempotência do crédito.
--
-- `@@unique([ride_id, type, driver_id])` já existe e é a trava das corridas, mas **não serve
-- aqui**: lançamento de anúncio não tem corrida (`ride_id` é nulo), e no Postgres duas linhas
-- com NULL na coluna não colidem num índice único. Sem uma trava própria, o reprocessamento
-- de um lote de analytics — que acontece, é a forma de o BullMQ se recuperar de falha —
-- pagaria o motorista de novo por veiculações já pagas.
--
-- `reference_id` é `<campaignId>:<uniqueEventId>`: `uniqueEventId` é único por dispositivo e
-- por veiculação, então identifica exatamente uma reprodução de um anúncio num tablete.
ALTER TABLE "opendriver"."driver_earnings"
  ADD COLUMN IF NOT EXISTS "reference_id" VARCHAR(160);

-- Índice único **parcial**: só as linhas que têm `reference_id`. Um índice único comum
-- permitiria vários NULL (comportamento do Postgres) e portanto funcionaria, mas o parcial
-- também mantém o índice pequeno — ele só indexa lançamentos de anúncio, não os milhões de
-- lançamentos de corrida que nunca terão este campo.
CREATE UNIQUE INDEX IF NOT EXISTS "driver_earnings_reference_id_key"
  ON "opendriver"."driver_earnings" ("reference_id")
  WHERE "reference_id" IS NOT NULL;

-- Extrato do motorista filtrado por tipo, que é o que a tela de ganhos de anúncio pede.
CREATE INDEX IF NOT EXISTS "driver_earnings_driver_type_created_idx"
  ON "opendriver"."driver_earnings" ("driver_id", "type", "created_at" DESC);
