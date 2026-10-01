-- Nome do passageiro quando quem pede a corrida não é quem embarca (plano,
-- extensão do §1: embarque diferente da localização atual de quem pediu).
-- Aditivo, só no schema "opendriver".
ALTER TABLE "opendriver"."rides"
  ADD COLUMN "guest_passenger_name" VARCHAR(100);
