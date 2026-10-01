import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_CODES } from '../../domain/complaintCategories.js';
import { AppError } from '../../errors.js';
import { prisma } from '../../infra/prisma.js';
import { deleteObject, getDecrypted, putEncrypted, sniff } from '../../infra/storage/storage.js';
import { alertStaff } from '../safety/safety.service.js';

/**
 * Central de reclamações com foto (plano §3): extensão do SafetyIncident
 * existente (type = 'Complaint') em vez de uma tabela nova — reaproveita
 * status/resolução/auditoria já implementados para Emergency/Report.
 */
export const complaintSchema = z.object({
  rideId: z.string().uuid().optional(),
  category: z.enum(COMPLAINT_CATEGORY_CODES),
  description: z.string().trim().min(10, 'Conte em poucas palavras o que aconteceu.').max(1000),
  // Só obrigatório quando a reclamação não é de uma corrida específica — nesse caso não há como
  // descobrir o papel pela corrida.
  role: z.enum(['passenger', 'driver']).optional(),
});

export function complaintCategories() {
  return COMPLAINT_CATEGORIES;
}

export async function openComplaint(userId: string, input: z.infer<typeof complaintSchema>) {
  let role: 'passenger' | 'driver';
  if (input.rideId) {
    const ride = await prisma.ride.findUnique({ where: { id: input.rideId } });
    if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
    role = ride.passengerId === userId ? 'passenger' : 'driver';
  } else {
    if (!input.role) throw new AppError('Informe se você é passageiro ou motorista.', 400, 'role_required');
    role = input.role;
  }
  const incident = await prisma.safetyIncident.create({
    data: { rideId: input.rideId, reporterId: userId, type: 'Complaint', category: input.category, role, description: input.description },
  });
  void alertStaff('Nova reclamação', `Reclamação ${incident.id}${input.rideId ? ` na corrida ${input.rideId}` : ''} — categoria "${input.category}".`);
  return { incidentId: incident.id, status: incident.status };
}

async function loadOwnComplaint(incidentId: string, userId: string) {
  const incident = await prisma.safetyIncident.findUnique({ where: { id: incidentId } });
  if (!incident || incident.type !== 'Complaint' || incident.reporterId !== userId) throw new AppError('Reclamação não encontrada.', 404, 'not_found');
  return incident;
}

export async function uploadAttachments(incidentId: string, userId: string, files: { buffer: Buffer; ext: string }[]) {
  const incident = await loadOwnComplaint(incidentId, userId);
  const existing = await prisma.incidentAttachment.count({ where: { incidentId, deletedAt: null } });
  if (existing + files.length > config.complaints.maxAttachments)
    throw new AppError(`No máximo ${config.complaints.maxAttachments} fotos por reclamação.`, 409, 'too_many_attachments');

  const expiresAt = new Date(Date.now() + config.complaints.attachmentRetentionDays * 24 * 3600_000);
  const rows = [];
  for (const file of files) {
    const kind = sniff(file.buffer);
    if (!kind || !kind.mime.startsWith('image/')) throw new AppError('Formato de imagem não suportado.', 415, 'unsupported_file');
    const key = `complaints/${incident.id}/${randomUUID()}.${kind.ext}.enc`;
    await putEncrypted(key, file.buffer);
    rows.push({ incidentId: incident.id, storageKey: key, mimeType: kind.mime, sizeBytes: file.buffer.length, expiresAt });
  }
  await prisma.incidentAttachment.createMany({ data: rows });
  return { attached: rows.length, total: existing + rows.length };
}

function toComplaintDto(i: {
  id: string;
  rideId: string | null;
  category: string | null;
  role: string | null;
  description: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  attachments: { id: string }[];
}) {
  return {
    id: i.id,
    rideId: i.rideId,
    category: i.category,
    role: i.role,
    description: i.description,
    status: i.status,
    createdAt: i.createdAt,
    resolvedAt: i.resolvedAt,
    attachmentCount: i.attachments.length,
  };
}

export async function listMyComplaints(userId: string) {
  const rows = await prisma.safetyIncident.findMany({
    where: { reporterId: userId, type: 'Complaint' },
    include: { attachments: { where: { deletedAt: null }, select: { id: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(toComplaintDto);
}

export async function getMyComplaint(incidentId: string, userId: string) {
  const incident = await prisma.safetyIncident.findUnique({
    where: { id: incidentId },
    include: { attachments: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!incident || incident.type !== 'Complaint' || incident.reporterId !== userId) throw new AppError('Reclamação não encontrada.', 404, 'not_found');
  return toComplaintDto(incident);
}

/** Somente para a equipe (admin) — foto decifrada sob demanda, nunca por URL pública. */
export async function readComplaintAttachmentForStaff(attachmentId: string): Promise<{ data: Buffer; mimeType: string }> {
  const att = await prisma.incidentAttachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.deletedAt) throw new AppError('Foto não encontrada ou já apagada.', 404, 'not_found');
  const data = await getDecrypted(att.storageKey);
  return { data, mimeType: att.mimeType };
}

/** Job de retenção: apaga fotos vencidas (idempotente), mesmo padrão de purgeExpiredRecordings. */
export async function purgeExpiredAttachments(): Promise<number> {
  const due = await prisma.incidentAttachment.findMany({ where: { expiresAt: { lte: new Date() }, deletedAt: null }, take: 200 });
  let n = 0;
  for (const a of due) {
    try {
      await deleteObject(a.storageKey);
      await prisma.incidentAttachment.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      n++;
    } catch (err) {
      console.error('Falha ao apagar anexo de reclamação vencido', a.id, err);
    }
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
export function startComplaintAttachmentRetention(intervalMs = 60 * 60_000): void {
  if (timer) return;
  timer = setInterval(() => void purgeExpiredAttachments().catch((e) => console.error(e)), intervalMs);
  timer.unref?.();
}
