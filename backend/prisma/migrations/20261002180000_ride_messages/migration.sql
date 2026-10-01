-- Chat mascarado — mensagens rápidas (plano §11.1). Aditivo, só no schema "opendriver".
CREATE TABLE "opendriver"."ride_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ride_messages_ride_id_created_at_idx" ON "opendriver"."ride_messages"("ride_id", "created_at");

ALTER TABLE "opendriver"."ride_messages" ADD CONSTRAINT "ride_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opendriver"."ride_messages" ADD CONSTRAINT "ride_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
