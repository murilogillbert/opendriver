/**
 * Formatação pt-BR sem depender de Intl (resultado idêntico em Hermes iOS/
 * Android e nos testes em Node).
 */

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234.5 → "R$ 1.234,50"; -3 → "-R$ 3,00". */
export function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const cents = Math.round(Math.abs(safe) * 100);
  const integer = Math.floor(cents / 100).toString();
  const fraction = (cents % 100).toString().padStart(2, '0');
  const sign = safe < 0 && cents > 0 ? '-' : '';
  return `${sign}R$ ${groupThousands(integer)},${fraction}`;
}

/** 12.5 → "12,5%"; 10 → "10%". */
export function formatPercent(value: number, maxFractionDigits = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round(safe * factor) / factor;
  const [int = '0', frac] = Math.abs(rounded).toString().split('.');
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${groupThousands(int)}${frac ? `,${frac}` : ''}%`;
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return `${safe < 0 ? '-' : ''}${groupThousands(Math.abs(safe).toString())}`;
}

const pad = (n: number) => n.toString().padStart(2, '0');

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "28/09/2026" (fuso local do aparelho). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "28/09/2026 14:05". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(value: string | Date): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 850 → "850 m"; 12345 → "12,3 km". */
export function formatDistance(meters: number): string {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = Math.round(m / 100) / 10;
  return `${km.toString().replace('.', ',')} km`;
}

/** 90 → "2 min"; 4000 → "1 h 7 min". Sempre arredonda para cima (expectativa honesta). */
export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.ceil((Number.isFinite(seconds) ? seconds : 0) / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "(65) 99999-1234" a partir de dígitos. */
export function formatPhone(digits: string | null | undefined): string {
  const d = (digits ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
