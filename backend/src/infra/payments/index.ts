import { config } from '../../config.js';
import { getSetting } from '../settings.js';
import { asaasGateway } from './asaas.js';
import { mockGateway } from './mock.js';
import type { PaymentGateway } from './types.js';

/**
 * Gateway de pagamento, escolhido **em tempo de execução**.
 *
 * Antes era uma constante de módulo resolvida no boot a partir de `PAYMENT_PROVIDER`. Isso
 * deixava o sistema numa situação ruim de enxergar: as credenciais do Asaas entravam pela tela
 * de Integrações do hub e valiam na hora, mas **ligar** o Asaas exigia redeploy. Em produção o
 * efeito era o pior possível — credenciais corretas no lugar e o gateway simulado respondendo,
 * com QR de Pix falso e aprovação automática depois de 5 minutos.
 *
 * Precedência, nesta ordem:
 *
 *   1. `OpenDriver:PaymentProvider` — override deste serviço. Existe porque o hub suporta
 *      Mercado Pago e este backend não: sem o override, um hub em `mercadopago` deixaria as
 *      corridas em `mock` sem nada indicar. Também serve para ligar um serviço antes do outro.
 *   2. `Payments:Provider` — a escolha compartilhada, a mesma tela, o mesmo banco.
 *   3. `PAYMENT_PROVIDER` do ambiente, cujo padrão é `mock`.
 *
 * É o mesmo padrão de `OpenDriver:AsaasWebhookToken`, que já cai no token do grupo Asaas
 * quando não tem valor próprio.
 */
const INSTANCIAS: Record<string, PaymentGateway> = {
  mock: mockGateway,
  asaas: asaasGateway,
};

/** Stub injetado em teste; quando presente, vence tudo. */
let stubDeTeste: PaymentGateway | null = null;

export async function getGateway(): Promise<PaymentGateway> {
  if (stubDeTeste) return stubDeTeste;

  // `getSetting` tem cache de 30 s, então isto não é uma consulta ao banco por cobrança.
  const escolhido =
    (await getSetting('OpenDriver:PaymentProvider')) ??
    (await getSetting('Payments:Provider')) ??
    config.payments.provider;

  /**
   * Valor não reconhecido cai em `mock`, de propósito: na dúvida, não cobrar de verdade. O que
   * impede a configuração errada de passar despercebida é a validação na escrita (a tela de
   * Integrações do hub só aceita os valores do catálogo) e o aviso no admin — não o silêncio
   * aqui.
   */
  return INSTANCIAS[escolhido.trim().toLowerCase()] ?? mockGateway;
}

/** Nome do provedor em vigor, para gravar no pagamento e para a interface. */
export async function getProviderName(): Promise<string> {
  return (await getGateway()).provider;
}

/** Só para testes: injeta um gateway stub. */
export function __setGatewayForTests(g: PaymentGateway | null): void {
  stubDeTeste = g;
}

export type { CardInput, CustomerInfo, PaymentGateway } from './types.js';

/**
 * Grita no log do boot quando o pagamento está simulado.
 *
 * Não recusa o boot. Simular pagamento é legítimo em desenvolvimento e em homologação, e
 * derrubar o serviço por causa disso trocaria um problema silencioso por uma indisponibilidade.
 * O que faltava era o **sinal**: com o gateway simulado, a diferença entre "cobrou" e "fingiu
 * que cobrou" não aparecia em lugar nenhum — nem na interface, nem no log.
 *
 * Roda depois do `listen` e nunca lança: é diagnóstico, e falha de leitura de configuração não
 * pode impedir o serviço de atender.
 */
export async function avisarSePagamentoSimulado(): Promise<void> {
  try {
    const g = await getGateway();
    if (g.provider !== 'mock') {
      console.log(`Pagamento: provedor ativo "${g.provider}".`);
      return;
    }
    console.warn(
      [
        '',
        '  ATENCAO: pagamento SIMULADO. Nada e cobrado de verdade.',
        '  O Pix gera um QR falso (https://mock.local/pix/...) e a cobranca e aprovada',
        '  sozinha depois de 5 minutos.',
        '',
        '  Para cobrar de verdade: no painel do hub, Admin > Integracoes > Provedor de',
        '  pagamento, escolha "asaas". Vale na hora, sem redeploy.',
        '',
      ].join('\n'),
    );
  } catch (err) {
    console.warn('Nao consegui descobrir o provedor de pagamento ativo:', err);
  }
}
