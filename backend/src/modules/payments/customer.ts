import { AppError } from '../../errors.js';
import type { CustomerInfo } from '../../infra/payments/types.js';
import { prisma } from '../../infra/prisma.js';

export async function customerInfo(userId: string): Promise<CustomerInfo> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new AppError('Conta não encontrada.', 404, 'not_found');
  return { userId: u.id, name: u.name, email: u.email, cpf: u.cpf ? u.cpf.replace(/\D/g, '') : null, phone: u.phone };
}
