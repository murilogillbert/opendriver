-- Fase 1 do plano de melhorias (docs/plano-implementacao.md): cancelamento com
-- motivo/debuff/repasse (§1), avaliação em meia estrela (§2), PIN de embarque
-- com no-show (§8), e a base de validação de CRLV via Infosimples (§4).
-- Tudo aditivo no schema "opendriver"; nada no "public" do hub é tocado.

-- ---------- §1 Cancelamento ----------
ALTER TYPE "opendriver"."EarningType" ADD VALUE 'CancellationPenalty';

ALTER TABLE "opendriver"."pricing"
  ADD COLUMN "cancellation_platform_fee" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN "driver_cancel_penalty" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "opendriver"."rides"
  ADD COLUMN "cancel_reason_code" VARCHAR(40),
  ADD COLUMN "pickup_code" VARCHAR(4),
  ADD COLUMN "no_show_at" TIMESTAMP(3);

-- driver_id entra na chave porque motoristas diferentes podem cada um incorrer
-- numa CancellationPenalty na mesma corrida (A desiste tardiamente, a corrida
-- volta a Searching, B também desiste tardiamente) — risco identificado no
-- plano (§14) antes de existir uma segunda linha para o mesmo (ride_id, type).
DROP INDEX "opendriver"."driver_earnings_ride_id_type_key";
CREATE UNIQUE INDEX "driver_earnings_ride_id_type_driver_id_key" ON "opendriver"."driver_earnings"("ride_id", "type", "driver_id");

-- ---------- §2 Avaliação em meia estrela ----------
-- Idempotente de verdade: a existência do CHECK constraint é o marcador de
-- "já rodou". Um WHERE por faixa de valor (ex.: stars <= 5) NÃO seria
-- suficiente — 1 e 2 estrelas viram 2 e 4, que continuam <= 5 e seriam
-- multiplicadas de novo numa segunda execução.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ride_ratings_stars_check') THEN
    UPDATE "opendriver"."ride_ratings" SET "stars" = "stars" * 2;
    UPDATE "opendriver"."driver_profiles" SET "rating_sum" = "rating_sum" * 2 WHERE "rating_count" > 0;
    UPDATE "opendriver"."passenger_profiles" SET "rating_sum" = "rating_sum" * 2 WHERE "rating_count" > 0;
    ALTER TABLE "opendriver"."ride_ratings" ADD CONSTRAINT "ride_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 10);
  END IF;
END $$;

-- ---------- §4 Validação de CRLV (Infosimples) ----------
CREATE TYPE "opendriver"."VehicleValidationStatus" AS ENUM ('Pending', 'Auto', 'Manual', 'Rejected');

ALTER TABLE "opendriver"."vehicles"
  ADD COLUMN "renavam" VARCHAR(11),
  ADD COLUMN "chassi" VARCHAR(30),
  ADD COLUMN "uf" VARCHAR(2),
  ADD COLUMN "validation_status" "opendriver"."VehicleValidationStatus" NOT NULL DEFAULT 'Pending';

CREATE TABLE "opendriver"."vehicle_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "detail_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_validations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_validations_vehicle_id_created_at_idx" ON "opendriver"."vehicle_validations"("vehicle_id", "created_at");

ALTER TABLE "opendriver"."vehicle_validations"
  ADD CONSTRAINT "vehicle_validations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "opendriver"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
