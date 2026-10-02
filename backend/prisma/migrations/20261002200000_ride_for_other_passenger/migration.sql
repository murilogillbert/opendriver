-- Corrida para terceiros: passageiro real diferente de quem pede e paga. Aditivo, só no schema
-- "opendriver" (nenhuma coluna existente é alterada ou removida).
--
-- Dois caminhos: outra conta da plataforma, vinculada por convite + aceite (passenger_links), ou
-- dependente sem perfil cadastrado por quem pede (guest_passengers). O CPF do dependente é de
-- terceiro e nunca é consultado por valor, então vai cifrado; o hash determinístico existe apenas
-- para a unicidade por dono.
CREATE TYPE "opendriver"."PassengerLinkStatus" AS ENUM ('Pending', 'Accepted', 'Revoked');

CREATE TABLE "opendriver"."passenger_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "linked_user_id" UUID NOT NULL,
    "status" "opendriver"."PassengerLinkStatus" NOT NULL DEFAULT 'Pending',
    -- Autorização dada pela própria passageira vinculada, no aceite, para que corridas pedidas
    -- para ela possam ser restritas a motoristas mulheres (§7). Nunca inferida de quem convida.
    "women_only_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "passenger_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passenger_links_owner_id_linked_user_id_key" ON "opendriver"."passenger_links"("owner_id", "linked_user_id");
CREATE INDEX "passenger_links_linked_user_id_status_idx" ON "opendriver"."passenger_links"("linked_user_id", "status");

ALTER TABLE "opendriver"."passenger_links" ADD CONSTRAINT "passenger_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opendriver"."passenger_links" ADD CONSTRAINT "passenger_links_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "opendriver"."guest_passengers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- Anuláveis de propósito: a exclusão da conta do dono apaga o CPF do terceiro (LGPD) sem
    -- destruir a linha que as corridas antigas referenciam.
    "cpf_enc" TEXT,
    "cpf_hash" VARCHAR(64),
    "birth_date" DATE NOT NULL,
    "phone" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "guest_passengers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_passengers_owner_id_cpf_hash_key" ON "opendriver"."guest_passengers"("owner_id", "cpf_hash");
CREATE INDEX "guest_passengers_owner_id_deleted_at_idx" ON "opendriver"."guest_passengers"("owner_id", "deleted_at");

ALTER TABLE "opendriver"."guest_passengers" ADD CONSTRAINT "guest_passengers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."rides"
  ADD COLUMN "passenger_for_id" UUID,
  ADD COLUMN "guest_passenger_id" UUID,
  ADD COLUMN "minor_accompanied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_passenger_for_id_fkey" FOREIGN KEY ("passenger_for_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_guest_passenger_id_fkey" FOREIGN KEY ("guest_passenger_id") REFERENCES "opendriver"."guest_passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
