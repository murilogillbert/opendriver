-- Corrida "apenas mulheres" (plano §7). Aditivo, só no schema "opendriver".
--
-- `gender` é dado sensível: nullable de propósito (null = preferiu não informar), preenchido só por
-- opt-in explícito do próprio usuário (PUT /me/gender, PUT /driver/preferences) e nunca inferido do
-- nome. Nenhuma coluna existente é alterada ou removida.
ALTER TABLE "opendriver"."passenger_profiles"
  ADD COLUMN "gender" VARCHAR(12),
  ADD COLUMN "women_only_pref" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."driver_profiles"
  ADD COLUMN "gender" VARCHAR(12),
  ADD COLUMN "women_only_pref" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."rides"
  ADD COLUMN "women_only" BOOLEAN NOT NULL DEFAULT false;
