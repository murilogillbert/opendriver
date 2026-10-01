/** Categorias de reclamação (plano §3) — fonte única, exposta via endpoint; o app nunca hard-coda. */
export const COMPLAINT_CATEGORIES = [
  { code: 'driver_behavior', label: 'Comportamento do motorista' },
  { code: 'vehicle_condition', label: 'Condição do veículo' },
  { code: 'route_issue', label: 'Problema na rota' },
  { code: 'payment_issue', label: 'Problema no pagamento' },
  { code: 'lost_item', label: 'Item perdido' },
  { code: 'other', label: 'Outro motivo' },
] as const;

export type ComplaintCategoryCode = (typeof COMPLAINT_CATEGORIES)[number]['code'];
export const COMPLAINT_CATEGORY_CODES = COMPLAINT_CATEGORIES.map((c) => c.code) as [ComplaintCategoryCode, ...ComplaintCategoryCode[]];
