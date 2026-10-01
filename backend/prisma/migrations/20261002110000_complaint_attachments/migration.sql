-- Central de reclamações com foto (plano §3). Aditivo, só no schema "opendriver".
ALTER TYPE "opendriver"."IncidentType" ADD VALUE 'Complaint';

ALTER TABLE "opendriver"."safety_incidents"
  ADD COLUMN "category" VARCHAR(40),
  ADD COLUMN "role" VARCHAR(12);

CREATE TABLE "opendriver"."incident_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incident_attachments_incident_id_idx" ON "opendriver"."incident_attachments"("incident_id");
CREATE INDEX "incident_attachments_expires_at_deleted_at_idx" ON "opendriver"."incident_attachments"("expires_at", "deleted_at");

ALTER TABLE "opendriver"."incident_attachments"
  ADD CONSTRAINT "incident_attachments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "opendriver"."safety_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
