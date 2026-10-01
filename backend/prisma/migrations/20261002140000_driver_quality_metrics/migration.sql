-- Métricas de qualidade por motorista (plano §11.6). Aditivo, só no schema "opendriver".
ALTER TABLE "opendriver"."driver_profiles"
  ADD COLUMN "offers_sent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "offers_accepted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rides_cancelled" INTEGER NOT NULL DEFAULT 0;
