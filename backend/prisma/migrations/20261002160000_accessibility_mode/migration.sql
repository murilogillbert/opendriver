-- Modo acessibilidade (plano §11.7). Aditivo, só no schema "opendriver".
ALTER TABLE "opendriver"."passenger_profiles"
  ADD COLUMN "wheelchair_accessible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."vehicles"
  ADD COLUMN "wheelchair_accessible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."rides"
  ADD COLUMN "accessibility_required" BOOLEAN NOT NULL DEFAULT false;
