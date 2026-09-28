import bcrypt from 'bcryptjs';

/** Mesmo custo do hub (bcrypt 11): senhas valem nos dois serviços. */
const ROUNDS = 11;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
