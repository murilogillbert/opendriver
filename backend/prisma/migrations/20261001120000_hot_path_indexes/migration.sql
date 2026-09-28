-- Só adiciona índices no schema "opendriver" (nada no "public" do hub, nenhum dado alterado).
-- Corrida ativa do motorista/passageiro: consultada a cada posição enviada pelo motorista (~4 s).
CREATE INDEX "rides_driver_id_status_idx" ON "opendriver"."rides"("driver_id", "status");
CREATE INDEX "rides_passenger_id_status_idx" ON "opendriver"."rides"("passenger_id", "status");
-- Detalhe da corrida no admin e acesso a gravações (exige ocorrência na corrida).
CREATE INDEX "safety_incidents_ride_id_idx" ON "opendriver"."safety_incidents"("ride_id");
