import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';
import { encryptBuffer, decryptBuffer } from '../../infra/crypto.js';
import { prisma } from '../../infra/prisma.js';
import { deleteObject, rawGet, rawPut, sniff } from '../../infra/storage/storage.js';

/**
 * Gravação de áudio da viagem (RF16):
 *  - opt-in explícito com versão do termo (consentimento auditável — LGPD);
 *  - só da corrida em que o usuário é participante, durante/logo após a viagem;
 *  - arquivo cifrado (AES-256-GCM) antes de ir ao storage privado;
 *  - acesso somente pela equipe e só com ocorrência aberta na corrida;
 *  - apagado automaticamente após RECORDING_RETENTION_DAYS (padrão 30).
 */
export const consentSchema = z.object({
  enabled: z.boolean(),
  consentVersion: z.string().max(40).optional(),
});

export async function setRecording(userId: string, input: z.infer<typeof consentSchema>) {
  if (input.enabled && input.consentVersion !== config.recording.consentVersion)
    throw new AppError('Leia e aceite os termos atuais da gravação para ativar.', 400, 'consent_outdated');
  await prisma.passengerProfile.upsert({
    where: { userId },
    create: {
      userId,
      recordingEnabled: input.enabled,
      recordingConsentAt: input.enabled ? new Date() : null,
      recordingConsentVer: input.enabled ? input.consentVersion : null,
    },
    update: input.enabled
      ? { recordingEnabled: true, recordingConsentAt: new Date(), recordingConsentVer: input.consentVersion }
      : { recordingEnabled: false },
  });
  return { enabled: input.enabled, consentVersion: config.recording.consentVersion, retentionDays: config.recording.retentionDays };
}

export function recordingTerms() {
  return {
    consentVersion: config.recording.consentVersion,
    retentionDays: config.recording.retentionDays,
    text:
      'Ao ativar, o app grava o áudio das suas viagens enquanto estiverem em andamento. As gravações são criptografadas, ' +
      `ficam guardadas por ${config.recording.retentionDays} dias e só podem ser acessadas pela equipe de segurança da OpenDriver ` +
      'quando houver uma ocorrência registrada na viagem. Você pode desativar a qualquer momento.',
  };
}

const UPLOAD_WINDOW_MS = 2 * 3600_000;

export async function uploadRecording(rideId: string, userId: string, file: Buffer) {
  const [ride, profile] = await Promise.all([
    prisma.ride.findUnique({ where: { id: rideId } }),
    prisma.passengerProfile.findUnique({ where: { userId } }),
  ]);
  if (!ride || (ride.passengerId !== userId && ride.driverId !== userId)) throw new AppError('Corrida não encontrada.', 404, 'not_found');
  if (!profile?.recordingEnabled || !profile.recordingConsentVer)
    throw new AppError('Ative a gravação nas configurações de segurança para enviar áudios.', 409, 'recording_disabled');
  const ended = ride.completedAt ?? ride.cancelledAt;
  const inWindow = ride.status === 'InProgress' || (ended && Date.now() - ended.getTime() < UPLOAD_WINDOW_MS);
  if (!ride.startedAt || !inWindow) throw new AppError('Esta viagem não aceita mais gravações.', 409, 'recording_window_closed');
  const kind = sniff(file);
  if (!kind || !kind.mime.startsWith('audio/')) throw new AppError('Formato de áudio não suportado.', 415, 'unsupported_file');

  const key = `recordings/${rideId}/${randomUUID()}.${kind.ext}.enc`;
  const { data, iv, authTag } = encryptBuffer(file);
  await rawPut(key, data);
  const rec = await prisma.rideRecording.create({
    data: {
      rideId,
      userId,
      storageKey: key,
      iv,
      authTag,
      sizeBytes: file.length,
      mimeType: kind.mime,
      consentVersion: profile.recordingConsentVer,
      expiresAt: new Date(Date.now() + config.recording.retentionDays * 24 * 3600_000),
    },
  });
  return { id: rec.id, expiresAt: rec.expiresAt };
}

/** Somente para a equipe, e só se houver ocorrência na corrida (princípio da necessidade). */
export async function readRecordingForStaff(recordingId: string): Promise<{ data: Buffer; mimeType: string }> {
  const rec = await prisma.rideRecording.findUnique({ where: { id: recordingId } });
  if (!rec || rec.deletedAt) throw new AppError('Gravação não encontrada ou já apagada.', 404, 'not_found');
  const incident = await prisma.safetyIncident.count({ where: { rideId: rec.rideId } });
  if (!incident) throw new AppError('Gravações só podem ser ouvidas quando há ocorrência registrada na viagem.', 403, 'no_incident');
  const blob = await rawGet(rec.storageKey);
  return { data: decryptBuffer(blob, rec.iv, rec.authTag), mimeType: rec.mimeType };
}

/** Job de retenção: apaga arquivos vencidos (idempotente). */
export async function purgeExpiredRecordings(): Promise<number> {
  const due = await prisma.rideRecording.findMany({ where: { expiresAt: { lte: new Date() }, deletedAt: null }, take: 200 });
  let n = 0;
  for (const r of due) {
    try {
      await deleteObject(r.storageKey);
      await prisma.rideRecording.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
      n++;
    } catch (err) {
      console.error('Falha ao apagar gravação vencida', r.id, err);
    }
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
export function startRecordingRetention(intervalMs = 60 * 60_000): void {
  if (timer) return;
  timer = setInterval(() => void purgeExpiredRecordings().catch((e) => console.error(e)), intervalMs);
  timer.unref?.();
}
