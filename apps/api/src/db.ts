import sql from "mssql";

import { config } from "./config.js";

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export const sqlTypes = sql;

export function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect({
      server: config.sql.server,
      port: config.sql.port,
      database: config.sql.database,
      user: config.sql.user,
      password: config.sql.password,
      options: {
        encrypt: false,
        trustServerCertificate: true
      },
      pool: {
        min: 0,
        max: 10,
        idleTimeoutMillis: 30000
      }
    });
  }

  return poolPromise;
}

export async function query<T = unknown>(
  text: string,
  bind?: (request: sql.Request) => sql.Request
) {
  const pool = await getPool();
  const request = bind ? bind(pool.request()) : pool.request();
  const result = await request.query<T>(text);

  return result.recordset;
}

export async function execute<T = unknown>(
  text: string,
  bind?: (request: sql.Request) => sql.Request
) {
  const pool = await getPool();
  const request = bind ? bind(pool.request()) : pool.request();

  return request.query<T>(text);
}

export type TxRunner = {
  query: <T = unknown>(text: string, bind?: (request: sql.Request) => sql.Request) => Promise<T[]>;
  execute: <T = unknown>(text: string, bind?: (request: sql.Request) => sql.Request) => Promise<sql.IResult<T>>;
  raw: sql.Transaction;
};

export async function withTransaction<T>(
  fn: (tx: TxRunner) => Promise<T>,
  isolation: sql.IIsolationLevel = sqlTypes.ISOLATION_LEVEL.READ_COMMITTED
): Promise<T> {
  const pool = await getPool();
  const tx = new sqlTypes.Transaction(pool);
  await tx.begin(isolation);

  const runner: TxRunner = {
    raw: tx,
    async query<U>(text: string, bind?: (request: sql.Request) => sql.Request) {
      const request = new sqlTypes.Request(tx);
      const bound = bind ? bind(request) : request;
      const result = await bound.query<U>(text);
      return result.recordset;
    },
    async execute<U>(text: string, bind?: (request: sql.Request) => sql.Request) {
      const request = new sqlTypes.Request(tx);
      const bound = bind ? bind(request) : request;
      return bound.query<U>(text);
    }
  };

  try {
    const result = await fn(runner);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Rollback can fail if the transaction was already aborted by SQL Server (e.g. XACT_ABORT). Swallow to surface the original error.
    }
    throw error;
  }
}
