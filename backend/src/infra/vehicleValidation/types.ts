export interface VehicleValidationInput {
  plate: string;
  renavam: string;
  uf: string;
  chassi?: string;
  /** Dados já cadastrados, para conferir divergência com o que a consulta retorna. */
  registered: { brand: string; model: string; year: number };
}

export interface VehicleValidationOutput {
  /** 'approved' aprova automaticamente; 'needs_review' e 'rejected' caem em revisão manual (RF17). */
  result: 'approved' | 'needs_review' | 'rejected';
  /** Os dados retornados batem com o cadastro? */
  matched: boolean;
  /** Resumo sem PII sensível em claro além do necessário — vai para vehicle_validations.detail_json. */
  detail: Record<string, unknown>;
}

export interface VehicleValidationProvider {
  readonly name: 'mock' | 'infosimples';
  validate(input: VehicleValidationInput): Promise<VehicleValidationOutput>;
}
