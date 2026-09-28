import nodemailer, { type Transporter } from 'nodemailer';
import { AppError } from '../errors.js';
import { getSetting } from './settings.js';

/** Mesma conta de e-mail configurada no admin do hub (Email:GmailUser / Email:GmailAppToken). */
let cached: { transporter: Transporter; from: string } | null = null;

async function client() {
  const user = await getSetting('Email:GmailUser');
  const pass = await getSetting('Email:GmailAppToken');
  if (!user || !pass) throw new AppError('E-mail não configurado.', 503, 'email_unavailable');
  if (cached?.from !== user) cached = { transporter: nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }), from: user };
  return cached;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { transporter, from } = await client();
  const fromName = (await getSetting('OpenDriver:EmailFromName')) ?? 'OpenDriver';
  await transporter.sendMail({ from: `"${fromName}" <${from}>`, to, subject, html });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
