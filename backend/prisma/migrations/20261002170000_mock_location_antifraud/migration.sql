-- Antifraude de localização (plano §11.4). Aditivo, só no schema "opendriver".
ALTER TABLE "opendriver"."driver_profiles"
  ADD COLUMN "mock_location_flags" INTEGER NOT NULL DEFAULT 0;
