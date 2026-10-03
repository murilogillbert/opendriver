/**
 * Identificação do controlador dos dados.
 *
 * A LGPD (art. 9º, I e art. 41) exige que o titular saiba **quem** trata os dados dele, com
 * identificação e contato do encarregado. "OpenDriver" não é pessoa jurídica: é nome fantasia.
 *
 * Os valores reais são o **padrão no código**, não só variável de ambiente. A versão anterior
 * tinha `process.env.LEGAL_COMPANY || 'OpenDriver'`, e nenhum `.env` de produção definia a
 * variável — então a página servia o fallback, que não identifica ninguém. Variável de
 * ambiente que precisa estar definida para a página ficar correta é variável que um dia não vai
 * estar definida. O `env` continua existindo para sobrescrever (outro ambiente, outra razão
 * social), mas o padrão já é a verdade.
 */
export const CONTROLADOR = {
  razaoSocial: process.env.LEGAL_COMPANY || 'Heavenbound Systems LTDA',
  nomeFantasia: process.env.LEGAL_TRADE_NAME || 'Open Driver',
  cnpj: process.env.LEGAL_CNPJ || '51.574.461/0001-09',
  endereco:
    process.env.LEGAL_ADDRESS ||
    'Rua 9, Lote 05, Rua das Pitangueiras, Lote 6, Loja 11 e 12 — Norte (Águas Claras), Brasília/DF, CEP 71.908-540',
  /** Encarregado pelo tratamento de dados (DPO) e canal de suporte. */
  contato: process.env.LEGAL_CONTACT_EMAIL || 'murilogillbert@gmail.com',
} as const;
