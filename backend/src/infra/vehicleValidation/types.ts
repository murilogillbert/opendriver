export interface VehicleValidationInput {
  plate: string;
  renavam: string;
  uf: string;
  chassi?: string;
  /**
   * CPF ou CNPJ do proprietário. Exigido por algumas UFs (TO, por exemplo) e ignorado pelas
   * demais. Opcional porque a maioria dos serviços não pede.
   */
  ownerDocument?: string;
  /** Dados já cadastrados, para conferir divergência com o que a consulta retorna. */
  registered: { brand: string; model: string; year: number };
}

/**
 * Dados do veículo como o Detran os devolveu, normalizados.
 *
 * Existe porque a consulta já trazia marca, modelo e ano, e esse retorno era usado só para
 * conferir se batia com o cadastro — e descartado em seguida. É exatamente o dado que
 * classifica o veículo em Econômico ou Conforto.
 */
export interface DadosDoDetran {
  brand: string;
  model: string;
  year: number | null;
}

export interface VehicleValidationOutput {
  /** 'approved' aprova automaticamente; 'needs_review' e 'rejected' caem em revisão manual (RF17). */
  result: 'approved' | 'needs_review' | 'rejected';
  /** Os dados retornados batem com o cadastro? */
  matched: boolean;
  /** Resumo sem PII sensível em claro além do necessário — vai para vehicle_validations.detail_json. */
  detail: Record<string, unknown>;
  /**
   * Ausente quando a consulta não chegou a responder (UF sem provedor, credencial faltando,
   * serviço fora). Nesse caso não há o que classificar, e a declaração do motorista
   * permanece — o que é diferente de "a regra decidiu manter".
   */
  detran?: DadosDoDetran;
}

export interface VehicleValidationProvider {
  readonly name: 'mock' | 'infosimples';
  validate(input: VehicleValidationInput): Promise<VehicleValidationOutput>;
}
