-- Executar UMA vez, antes do primeiro `prisma migrate deploy` do OpenDriver,
-- no banco compartilhado com o hub.
--
-- Por quê: o datasource usa multiSchema (["opendriver", "public"]). Com o
-- schema "public" (do hub) já populado e SEM tabela de histórico no schema
-- padrão "opendriver", o migrate deploy do Prisma 6 aborta ("migration
-- persistence is not initialized"). Criar a tabela de histórico vazia no
-- schema do OpenDriver (mesma DDL que o Prisma usa) resolve, sem tocar em
-- nada do hub. Idempotente.
CREATE SCHEMA IF NOT EXISTS "opendriver";

CREATE TABLE IF NOT EXISTS "opendriver"."_prisma_migrations" (
    "id"                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    "checksum"            VARCHAR(64)  NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER      NOT NULL DEFAULT 0
);
