import bcrypt from "bcryptjs";
import { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

import { config } from "./config.js";
import { query, sqlTypes } from "./db.js";

export type AuthUser = {
  id: number;
  email: string;
  nome: string;
  tipo_usuario: "motorista" | "passageiro" | "parceiro" | "admin";
};

type JwtPayload = {
  sub: number;
  email: string;
  nome: string;
  tipo_usuario: AuthUser["tipo_usuario"];
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      tipo_usuario: user.tipo_usuario
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

export async function requireUser(request: FastifyRequest) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const payload = jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
  const users = await query<AuthUser>(
    `SELECT id, email, nome, tipo_usuario
       FROM dbo.users
      WHERE id = @id AND status = 'ativo'`,
    (sqlRequest) => sqlRequest.input("id", sqlTypes.BigInt, payload.sub)
  );

  const user = users[0];

  if (!user) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return user;
}

export async function requireAdmin(request: FastifyRequest) {
  const user = await requireUser(request);

  if (user.tipo_usuario !== "admin") {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  return user;
}
