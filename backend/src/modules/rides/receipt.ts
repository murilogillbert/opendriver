import { config } from '../../config.js';
import { escapeHtml, sendEmail } from '../../infra/email.js';
import { round2 } from '../../lib/money.js';
import type { RideRow } from './rideDto.js';

function brl(v: number): string {
  return `R$ ${round2(v).toFixed(2).replace('.', ',')}`;
}

function fmtDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Recibo por e-mail ao concluir a corrida (plano §11.8) — reaproveita
 * infra/email.ts; nunca bloqueia a conclusão da corrida se falhar.
 */
export async function sendRideReceiptEmail(ride: RideRow): Promise<void> {
  if (!ride.passenger.email) return;
  try {
    const toPay = round2(Math.max(0, Number(ride.fare) - Number(ride.cashbackUsed)));
    const rows = [
      ['Data', fmtDateTime(ride.completedAt ?? new Date())],
      ['De', escapeHtml(ride.originAddress)],
      ['Para', escapeHtml(ride.destAddress)],
      ['Corrida', brl(Number(ride.fare))],
      ...(Number(ride.cashbackUsed) > 0 ? [['Cashback do Hub', `- ${brl(Number(ride.cashbackUsed))}`]] : []),
      ['Total pago', brl(toPay)],
    ];
    const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#667">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`).join('');
    await sendEmail(
      ride.passenger.email,
      'Recibo da sua corrida — OpenDriver',
      `<p>Olá, ${escapeHtml(ride.passenger.name)}!</p><p>Aqui está o recibo da sua corrida:</p><table>${table}</table><p style="color:#667;font-size:13px">Acompanhe todas as suas viagens pelo app OpenDriver.</p>`,
    );
  } catch (err) {
    if (!config.isTest) console.warn('Falha ao enviar recibo por e-mail', ride.id, err);
  }
}
