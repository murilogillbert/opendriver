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
