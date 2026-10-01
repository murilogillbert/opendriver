-- Corridas agendadas (plano §5). Aditivo, só no schema "opendriver".
ALTER TYPE "opendriver"."RideStatus" ADD VALUE 'Scheduled';

ALTER TABLE "opendriver"."rides"
  ADD COLUMN "scheduled_at" TIMESTAMP(3),
  ADD COLUMN "scheduled_favorite_driver_id" UUID,
  ADD COLUMN "is_scheduled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."ride_quotes"
  ADD COLUMN "scheduled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "rides_status_scheduled_at_idx" ON "opendriver"."rides"("status", "scheduled_at");

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_scheduled_favorite_driver_id_fkey" FOREIGN KEY ("scheduled_favorite_driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
