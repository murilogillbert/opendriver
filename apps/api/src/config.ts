import "dotenv/config";

const numberFromEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;

  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a number`);
  }

  return value;
};

export const config = {
  env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
  port: numberFromEnv("APP_PORT", 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  jwtSecret: process.env.JWT_SECRET ?? "change_this_jwt_secret",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  mercadoPago: {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "",
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY ?? ""
  },
  sql: {
    server: process.env.SQLSERVER_HOST ?? "localhost",
    port: numberFromEnv("SQLSERVER_PORT", 1433),
    database: process.env.SQLSERVER_DATABASE ?? "OpenDriver",
    user: process.env.SQLSERVER_USER ?? "sa",
    password: process.env.SQLSERVER_PASSWORD ?? "Change_this_Strong_Password_123!"
  }
};
