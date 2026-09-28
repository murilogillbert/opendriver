-- OpenDriver — schema inicial (tabelas exclusivas do serviço).
--
-- Banco COMPARTILHADO com o OpenDriverHub: nada aqui altera o schema "public"
-- (tabelas do hub). Só cria o schema "opendriver", seus tipos/tabelas e FKs
-- que referenciam public.users. Todos os identificadores são qualificados, então
-- o script tem o mesmo efeito independentemente do search_path.

CREATE SCHEMA IF NOT EXISTS "opendriver";

CREATE TYPE "opendriver"."DriverStatus" AS ENUM ('PendingDocuments', 'InReview', 'Approved', 'Rejected', 'Suspended');

CREATE TYPE "opendriver"."VehicleCategory" AS ENUM ('Economy', 'Comfort');

CREATE TYPE "opendriver"."VehicleStatus" AS ENUM ('InReview', 'Approved', 'Rejected');

CREATE TYPE "opendriver"."PixKeyType" AS ENUM ('CPF', 'CNPJ', 'Email', 'Phone', 'Random');

CREATE TYPE "opendriver"."PaymentMethodType" AS ENUM ('Card', 'Pix');

CREATE TYPE "opendriver"."RideStatus" AS ENUM ('Searching', 'DriverAssigned', 'DriverArrived', 'InProgress', 'Completed', 'Cancelled', 'NoDrivers');

CREATE TYPE "opendriver"."RideActor" AS ENUM ('Passenger', 'Driver', 'System', 'Admin');

CREATE TYPE "opendriver"."RidePaymentStatus" AS ENUM ('NotDue', 'Pending', 'Paid', 'Failed', 'Refunded', 'NotRequired');

CREATE TYPE "opendriver"."OfferStatus" AS ENUM ('Pending', 'Accepted', 'Declined', 'Expired', 'Withdrawn');

CREATE TYPE "opendriver"."EarningType" AS ENUM ('RideEarning', 'CancellationFee', 'Payout', 'Adjustment');

CREATE TYPE "opendriver"."PayoutStatus" AS ENUM ('Pending', 'Paid', 'Rejected');

CREATE TYPE "opendriver"."IncidentType" AS ENUM ('Emergency', 'Report');

CREATE TYPE "opendriver"."IncidentStatus" AS ENUM ('Open', 'InReview', 'Closed');

CREATE TABLE "opendriver"."driver_profiles" (
    "user_id" UUID NOT NULL,
    "status" "opendriver"."DriverStatus" NOT NULL DEFAULT 'PendingDocuments',
    "cnh_number" VARCHAR(20),
    "cnh_category" VARCHAR(5),
    "cnh_expires_at" DATE,
    "birth_date" DATE,
    "cnh_photo_key" TEXT,
    "selfie_key" TEXT,
    "rejection_reason" VARCHAR(400),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" UUID,
    "pix_key" VARCHAR(140),
    "pix_key_type" "opendriver"."PixKeyType",
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "online_since" TIMESTAMP(3),
    "current_vehicle_id" UUID,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "opendriver"."passenger_profiles" (
    "user_id" UUID NOT NULL,
    "default_payment_method_id" UUID,
    "use_hub_cashback" BOOLEAN NOT NULL DEFAULT true,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recording_consent_at" TIMESTAMP(3),
    "recording_consent_version" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passenger_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "opendriver"."vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "plate" VARCHAR(10) NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "color" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "category" "opendriver"."VehicleCategory" NOT NULL DEFAULT 'Economy',
    "crlv_key" TEXT,
    "status" "opendriver"."VehicleStatus" NOT NULL DEFAULT 'InReview',
    "rejection_reason" VARCHAR(400),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."driver_locations" (
    "driver_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("driver_id")
);

CREATE TABLE "opendriver"."asaas_customers" (
    "user_id" UUID NOT NULL,
    "customer_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asaas_customers_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "opendriver"."payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "opendriver"."PaymentMethodType" NOT NULL,
    "brand" VARCHAR(30),
    "last4" VARCHAR(4),
    "holder_name" VARCHAR(80),
    "expiry_month" INTEGER,
    "expiry_year" INTEGER,
    "token_enc" TEXT,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'mock',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."saved_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."pricing" (
    "category" "opendriver"."VehicleCategory" NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "base_fare" DECIMAL(10,2) NOT NULL,
    "per_km" DECIMAL(10,2) NOT NULL,
    "per_minute" DECIMAL(10,2) NOT NULL,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "platform_fee_percent" DECIMAL(5,2) NOT NULL,
    "cancellation_fee" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("category")
);

CREATE TABLE "opendriver"."ride_quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "passenger_id" UUID NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "origin_address" VARCHAR(300) NOT NULL,
    "dest_lat" DOUBLE PRECISION NOT NULL,
    "dest_lng" DOUBLE PRECISION NOT NULL,
    "dest_address" VARCHAR(300) NOT NULL,
    "distance_m" INTEGER NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "polyline" TEXT,
    "route_source" VARCHAR(20) NOT NULL,
    "prices" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."rides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "quote_id" UUID NOT NULL,
    "status" "opendriver"."RideStatus" NOT NULL DEFAULT 'Searching',
    "category" "opendriver"."VehicleCategory" NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "origin_address" VARCHAR(300) NOT NULL,
    "dest_lat" DOUBLE PRECISION NOT NULL,
    "dest_lng" DOUBLE PRECISION NOT NULL,
    "dest_address" VARCHAR(300) NOT NULL,
    "distance_m" INTEGER NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "polyline" TEXT,
    "fare" DECIMAL(10,2) NOT NULL,
    "platform_fee" DECIMAL(10,2) NOT NULL,
    "driver_earning" DECIMAL(10,2) NOT NULL,
    "cashback_used" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cancellation_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method_type" "opendriver"."PaymentMethodType" NOT NULL,
    "payment_method_id" UUID,
    "use_cashback" BOOLEAN NOT NULL DEFAULT false,
    "payment_status" "opendriver"."RidePaymentStatus" NOT NULL DEFAULT 'NotDue',
    "dispatch_round" INTEGER NOT NULL DEFAULT 0,
    "share_token" VARCHAR(64),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" "opendriver"."RideActor",
    "cancel_reason" VARCHAR(200),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."ride_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "status" "opendriver"."OfferStatus" NOT NULL DEFAULT 'Pending',
    "pickup_distance_m" INTEGER NOT NULL,
    "pickup_eta_s" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."ride_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "actor" "opendriver"."RideActor" NOT NULL,
    "actor_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."ride_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "method" "opendriver"."PaymentMethodType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "opendriver"."RidePaymentStatus" NOT NULL,
    "external_id" VARCHAR(80),
    "status_detail" VARCHAR(200),
    "pix_copy_paste" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."ride_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "ratee_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_ratings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."driver_earnings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "ride_id" UUID,
    "payout_id" UUID,
    "type" "opendriver"."EarningType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."payout_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "opendriver"."PayoutStatus" NOT NULL DEFAULT 'Pending',
    "pix_key" VARCHAR(140) NOT NULL,
    "pix_key_type" "opendriver"."PixKeyType" NOT NULL,
    "note" VARCHAR(400) NOT NULL DEFAULT '',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."trusted_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."safety_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID,
    "reporter_id" UUID NOT NULL,
    "type" "opendriver"."IncidentType" NOT NULL,
    "status" "opendriver"."IncidentStatus" NOT NULL DEFAULT 'Open',
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."ride_recordings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "iv" VARCHAR(40) NOT NULL,
    "auth_tag" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime_type" VARCHAR(40) NOT NULL,
    "consent_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ride_recordings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opendriver"."push_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(200) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_profiles_status_idx" ON "opendriver"."driver_profiles"("status");

CREATE INDEX "driver_profiles_is_online_idx" ON "opendriver"."driver_profiles"("is_online");

CREATE INDEX "vehicles_driver_id_idx" ON "opendriver"."vehicles"("driver_id");

CREATE INDEX "driver_locations_lat_lng_idx" ON "opendriver"."driver_locations"("lat", "lng");

CREATE INDEX "driver_locations_updated_at_idx" ON "opendriver"."driver_locations"("updated_at");

CREATE INDEX "payment_methods_user_id_idx" ON "opendriver"."payment_methods"("user_id");

CREATE INDEX "saved_places_user_id_idx" ON "opendriver"."saved_places"("user_id");

CREATE INDEX "ride_quotes_passenger_id_created_at_idx" ON "opendriver"."ride_quotes"("passenger_id", "created_at");

CREATE UNIQUE INDEX "rides_quote_id_key" ON "opendriver"."rides"("quote_id");

CREATE UNIQUE INDEX "rides_share_token_key" ON "opendriver"."rides"("share_token");

CREATE INDEX "rides_passenger_id_requested_at_idx" ON "opendriver"."rides"("passenger_id", "requested_at");

CREATE INDEX "rides_driver_id_requested_at_idx" ON "opendriver"."rides"("driver_id", "requested_at");

CREATE INDEX "rides_status_idx" ON "opendriver"."rides"("status");

CREATE INDEX "ride_offers_status_expires_at_idx" ON "opendriver"."ride_offers"("status", "expires_at");

CREATE INDEX "ride_offers_driver_id_status_idx" ON "opendriver"."ride_offers"("driver_id", "status");

CREATE UNIQUE INDEX "ride_offers_ride_id_driver_id_key" ON "opendriver"."ride_offers"("ride_id", "driver_id");

CREATE INDEX "ride_events_ride_id_created_at_idx" ON "opendriver"."ride_events"("ride_id", "created_at");

CREATE INDEX "ride_payments_ride_id_idx" ON "opendriver"."ride_payments"("ride_id");

CREATE INDEX "ride_payments_external_id_idx" ON "opendriver"."ride_payments"("external_id");

CREATE INDEX "ride_ratings_ratee_id_idx" ON "opendriver"."ride_ratings"("ratee_id");

CREATE UNIQUE INDEX "ride_ratings_ride_id_rater_id_key" ON "opendriver"."ride_ratings"("ride_id", "rater_id");

CREATE UNIQUE INDEX "driver_earnings_payout_id_key" ON "opendriver"."driver_earnings"("payout_id");

CREATE INDEX "driver_earnings_driver_id_created_at_idx" ON "opendriver"."driver_earnings"("driver_id", "created_at");

CREATE UNIQUE INDEX "driver_earnings_ride_id_type_key" ON "opendriver"."driver_earnings"("ride_id", "type");

CREATE INDEX "payout_requests_driver_id_requested_at_idx" ON "opendriver"."payout_requests"("driver_id", "requested_at");

CREATE INDEX "payout_requests_status_idx" ON "opendriver"."payout_requests"("status");

CREATE INDEX "trusted_contacts_user_id_idx" ON "opendriver"."trusted_contacts"("user_id");

CREATE INDEX "safety_incidents_status_created_at_idx" ON "opendriver"."safety_incidents"("status", "created_at");

CREATE INDEX "ride_recordings_expires_at_deleted_at_idx" ON "opendriver"."ride_recordings"("expires_at", "deleted_at");

CREATE INDEX "ride_recordings_ride_id_idx" ON "opendriver"."ride_recordings"("ride_id");

CREATE UNIQUE INDEX "push_tokens_token_key" ON "opendriver"."push_tokens"("token");

CREATE INDEX "push_tokens_user_id_idx" ON "opendriver"."push_tokens"("user_id");

ALTER TABLE "opendriver"."driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."passenger_profiles" ADD CONSTRAINT "passenger_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."asaas_customers" ADD CONSTRAINT "asaas_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_quotes" ADD CONSTRAINT "ride_quotes_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "opendriver"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."rides" ADD CONSTRAINT "rides_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "opendriver"."payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_offers" ADD CONSTRAINT "ride_offers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_offers" ADD CONSTRAINT "ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_events" ADD CONSTRAINT "ride_events_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_payments" ADD CONSTRAINT "ride_payments_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_ratings" ADD CONSTRAINT "ride_ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_ratings" ADD CONSTRAINT "ride_ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_ratings" ADD CONSTRAINT "ride_ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."driver_earnings" ADD CONSTRAINT "driver_earnings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."driver_earnings" ADD CONSTRAINT "driver_earnings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."payout_requests" ADD CONSTRAINT "payout_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."trusted_contacts" ADD CONSTRAINT "trusted_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."safety_incidents" ADD CONSTRAINT "safety_incidents_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."safety_incidents" ADD CONSTRAINT "safety_incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_recordings" ADD CONSTRAINT "ride_recordings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "opendriver"."rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."ride_recordings" ADD CONSTRAINT "ride_recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opendriver"."push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabela de preços inicial (valores de referência; ajustáveis no admin — RF17).
INSERT INTO "opendriver"."pricing" ("category", "label", "base_fare", "per_km", "per_minute", "minimum_fare", "platform_fee_percent", "cancellation_fee", "active")
VALUES
  ('Economy', 'Econômico', 4.00, 1.60, 0.30, 8.00, 20.00, 5.00, true),
  ('Comfort', 'Conforto', 6.00, 2.20, 0.40, 12.00, 20.00, 7.00, true)
ON CONFLICT ("category") DO NOTHING;
