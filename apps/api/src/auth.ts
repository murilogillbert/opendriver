import bcrypt from "bcryptjs";
import { FastifyRequest } from "fastify";
import jwt, { SignOptions } from "jsonwebtoken";

import { config } from "./config.js";
import { query, sqlTypes } from "./db.js";



export type AuthUser = {
  id: number;
  email: string;
  nome: string;
  tipo_usuario: "motorista" | "passageiro" | "parceiro" | "admin";
  token_version?: number;
  partner_id?: number | null;
  password_must_change?: boolean;
};

type JwtPayload = {
  sub: number;
  email: string;
  nome: string;
  tipo_usuario: AuthUser["tipo_usuario"];
  tv: number;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser) {
  const expiresIn = (user.tipo_usuario === "admin" ? config.adminTokenTtl : config.userTokenTtl) as
    | SignOptions["expiresIn"];
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      tipo_usuario: user.tipo_usuario,
      tv: user.token_version ?? 0
    },
    config.jwtSecret,
    { expiresIn }
  );
}

export async function requireUser(request: FastifyRequest) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
  } catch {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const users = await query<AuthUser & { token_version: number; password_must_change: boolean }>(
    `SELECT id, email, nome, tipo_usuario,
            COALESCE(token_version, 0) AS token_version,
            partner_id,
            COALESCE(password_must_change, 0) AS password_must_change
       FROM dbo.users
      WHERE id = @id AND status = 'ativo'`,
    (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, payload.sub)
  );

  const user = users[0];

  if (!user) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  // Token revocation: bumping users.token_version invalidates every previously issued token for that user.
  const tokenVersion = typeof payload.tv === "number" ? payload.tv : 0;
  if (Number(user.token_version ?? 0) !== tokenVersion) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return {
    ...user,
    password_must_change: Boolean(user.password_must_change),
    partner_id: user.partner_id == null ? null : Number(user.partner_id)
  };
}

export async function requireAdmin(request: FastifyRequest) {
  const user = await requireUser(request);

  if (user.tipo_usuario !== "admin") {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  return user;
}

// Requires the caller to be authenticated as a partner with a valid partner_id link.
// Used by the partner terminal endpoints — admins should hit the regular /api/admin/* routes.
export async function requirePartner(request: FastifyRequest) {
  const user = await requireUser(request);
  if (user.tipo_usuario !== "parceiro") {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  if (user.partner_id == null) {
    throw Object.assign(new Error("partner_account_unlinked"), { statusCode: 409 });
  }
  return user as AuthUser & { partner_id: number };
}

export { clientIp } from "./http.js";
