-- Motoristas favoritos + bloqueio mútuo (plano §6). Aditivo, só no schema "opendriver".
CREATE TABLE "opendriver"."favorite_drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_drivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_drivers_passenger_id_driver_id_key" ON "opendriver"."favorite_drivers"("passenger_id", "driver_id");
CREATE INDEX "favorite_drivers_driver_id_idx" ON "opendriver"."favorite_drivers"("driver_id");

ALTER TABLE "opendriver"."favorite_drivers" ADD CONSTRAINT "favorite_drivers_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opendriver"."favorite_drivers" ADD CONSTRAINT "favorite_drivers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "opendriver"."blocked_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blocked_users_user_id_blocked_id_key" ON "opendriver"."blocked_users"("user_id", "blocked_id");
CREATE INDEX "blocked_users_blocked_id_idx" ON "opendriver"."blocked_users"("blocked_id");

ALTER TABLE "opendriver"."blocked_users" ADD CONSTRAINT "blocked_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opendriver"."blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
