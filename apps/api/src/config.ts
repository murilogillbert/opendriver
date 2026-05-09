import "dotenv/config";
import path from "path";

const numberFromEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;

  if (Number.isNaN(value)) {
    throw new Error(`${name} must be a number`);
  }

  return value;
};

const resolveUploadDir = () => {
  const raw = process.env.UPLOAD_DIR ?? "uploads";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
};

const env = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const isProduction = env === "production";

const FALLBACK_JWT_SECRET = "change_this_jwt_secret";
const FALLBACK_DB_PASSWORD = "Change_this_Strong_Password_123!";

const rawJwtSecret = process.env.JWT_SECRET?.trim();
if (isProduction) {
  if (!rawJwtSecret || rawJwtSecret === FALLBACK_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET must be set to a strong, unique value in production (the placeholder 'change_this_jwt_secret' is not allowed)."
    );
  }
  if (rawJwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }
}
const jwtSecret = rawJwtSecret && rawJwtSecret.length > 0 ? rawJwtSecret : FALLBACK_JWT_SECRET;

const rawDbPassword = process.env.SQLSERVER_PASSWORD?.trim();
if (isProduction && (!rawDbPassword || rawDbPassword === FALLBACK_DB_PASSWORD)) {
  throw new Error(
    "SQLSERVER_PASSWORD must be set to a unique value in production (the example placeholder is not allowed)."
  );
}
const dbPassword = rawDbPassword && rawDbPassword.length > 0 ? rawDbPassword : FALLBACK_DB_PASSWORD;

const adminBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim() || null;
if (isProduction && !adminBootstrapToken) {
  // Hard requirement in production: the public bootstrap endpoint must never run without a shared secret.
  throw new Error(
    "ADMIN_BOOTSTRAP_TOKEN must be set in production. Set it once when seeding the first admin and rotate or unset it afterward."
  );
}

const corsRaw = process.env.CORS_ORIGIN ?? "*";
if (isProduction && corsRaw.trim() === "*") {
  throw new Error("CORS_ORIGIN must be set to an explicit allowlist in production (wildcard '*' is not allowed).");
}

const parsedCors =
  corsRaw.trim() === "*"
    ? "*"
    : corsRaw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const adminTokenTtl = process.env.ADMIN_TOKEN_TTL ?? "2h";
const userTokenTtl = process.env.USER_TOKEN_TTL ?? "7d";

export const config = {
  env,
  isProduction,
  port: numberFromEnv("APP_PORT", 3001),
  corsOrigin: parsedCors,
  jwtSecret,
  adminBootstrapToken,
  adminTokenTtl,
  userTokenTtl,
  uploadDir: resolveUploadDir(),
  uploadMaxBytes: numberFromEnv("UPLOAD_MAX_BYTES", 200 * 1024 * 1024),
  groqApiKey: process.env.GROQ_API_KEY?.trim() || null,
  mercadoPago: {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "",
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY ?? "",
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? ""
  },
  sql: {
    server: process.env.SQLSERVER_HOST ?? "localhost",
    port: numberFromEnv("SQLSERVER_PORT", 1433),
    database: process.env.SQLSERVER_DATABASE ?? "OpenDriver",
    user: process.env.SQLSERVER_USER ?? "sa",
    password: dbPassword
  }
};
