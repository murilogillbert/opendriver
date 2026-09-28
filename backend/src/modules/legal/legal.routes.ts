import { Router, type Response } from 'express';
import { escapeHtml } from '../../infra/email.js';

/**
 * Política de privacidade e termos de uso públicos (exigidos pela App Store e
 * pelo Google Play). O texto deve ser revisado pelo jurídico antes da
 * publicação; empresa e contato vêm de LEGAL_COMPANY / LEGAL_CONTACT_EMAIL.
 */
export const legalRouter = Router();

const UPDATED_AT = '28/09/2026';
const company = () => escapeHtml(process.env.LEGAL_COMPANY || 'OpenDriver');
const contact = () => escapeHtml(process.env.LEGAL_CONTACT_EMAIL || 'privacidade@opendriver.com.br');

function page(res: Response, title: string, body: string) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — OpenDriver</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px 64px;color:#1F2937;line-height:1.6}
h1{color:#0A1726;font-size:28px}h2{color:#0A1726;font-size:19px;margin-top:28px}li{margin:4px 0}small{color:#6B7280}</style></head>
<body><h1>${title}</h1><small>Última atualização: ${UPDATED_AT}</small>${body}</body></html>`);
}

legalRouter.get('/legal/privacidade', (_req, res) => {
  page(
    res,
    'Política de Privacidade',
    `
<p>Esta política explica como ${company()} ("nós") trata os dados pessoais de quem usa o app OpenDriver, como passageiro ou motorista, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). A conta do OpenDriver é a mesma do OpenDriverHub.</p>
<h2>1. Dados que coletamos</h2>
<ul>
<li><b>Cadastro:</b> nome, e-mail, celular, CPF e senha (guardada apenas como hash).</li>
<li><b>Localização:</b> do passageiro, para definir o embarque e mostrar o carro a caminho; do motorista, enquanto está online ou em corrida — inclusive com o app em segundo plano — para receber corridas próximas e mostrar o trajeto ao passageiro. Ao ficar offline, o envio de localização para.</li>
<li><b>Corridas:</b> origem, destino, trajeto, horários, valores, avaliações e ocorrências.</li>
<li><b>Motoristas:</b> dados e foto da CNH, selfie, dados e documento (CRLV) do veículo e chave Pix. Os documentos ficam em armazenamento privado e criptografado, acessível apenas pela equipe de análise, com registro de cada acesso.</li>
<li><b>Pagamentos:</b> o cartão é enviado uma única vez ao processador de pagamentos (Asaas); guardamos apenas um identificador (token) criptografado, a bandeira e os 4 últimos dígitos. Não armazenamos número completo nem código de segurança.</li>
<li><b>Gravação de áudio (opcional):</b> somente se você ativar. O áudio das viagens em andamento é gravado, criptografado e mantido por 30 dias; só pode ser ouvido pela equipe de segurança quando houver uma ocorrência registrada na viagem, e cada acesso é registrado. Você pode desativar a qualquer momento.</li>
<li><b>Contatos de confiança:</b> nome e telefone que você cadastra para avisar em uma emergência.</li>
<li><b>Aparelho:</b> token de notificações push e dados técnicos necessários para o funcionamento e a segurança do serviço.</li>
</ul>
<h2>2. Para que usamos</h2>
<ul>
<li>Executar o serviço de intermediação de corridas: cotar, conectar passageiro e motorista, acompanhar a viagem e cobrar (execução de contrato).</li>
<li>Verificar motoristas e veículos, prevenir fraudes e proteger usuários (legítimo interesse e cumprimento de obrigações legais).</li>
<li>Atender emergências e ocorrências de segurança (proteção da vida e legítimo interesse).</li>
<li>Gravação de áudio: apenas com o seu consentimento.</li>
<li>Cumprir obrigações legais, fiscais e regulatórias.</li>
</ul>
<h2>3. Com quem compartilhamos</h2>
<ul>
<li><b>Outro participante da corrida:</b> o passageiro vê primeiro nome, foto, nota, modelo, cor e placa do carro e a posição do motorista; o motorista vê primeiro nome, foto e nota do passageiro e os endereços da viagem. Telefones não são compartilhados.</li>
<li><b>Processador de pagamentos</b> (Asaas), para cobrar corridas.</li>
<li><b>Serviços de mapa</b> baseados em OpenStreetMap, para endereços e rotas.</li>
<li><b>Serviço de notificações</b> (Expo / Apple / Google), para avisos no celular.</li>
<li><b>Pessoas que você escolher:</b> ao compartilhar a viagem, quem tiver o link vê o trajeto e o carro até o fim da corrida.</li>
<li><b>Autoridades</b>, quando exigido por lei ou ordem judicial.</li>
</ul>
<p>Não vendemos dados pessoais.</p>
<h2>4. Por quanto tempo guardamos</h2>
<ul>
<li>Gravações de áudio: 30 dias, apagadas automaticamente.</li>
<li>Dados de corridas e pagamentos: pelo prazo exigido pela legislação fiscal e de defesa do consumidor.</li>
<li>Demais dados: enquanto a conta estiver ativa.</li>
</ul>
<h2>5. Seus direitos</h2>
<p>Você pode pedir confirmação, acesso, correção, portabilidade, informação sobre compartilhamento e revogar consentimentos. Você pode <b>excluir sua conta pelo próprio app</b> (Conta → Excluir minha conta): seus dados pessoais são anonimizados, documentos de motorista são apagados e as sessões são encerradas; registros de corridas e pagamentos são mantidos sem identificar você pelo prazo legal.</p>
<h2>6. Segurança</h2>
<p>Usamos conexão criptografada (HTTPS), senhas com hash, tokens de sessão guardados no armazenamento seguro do celular e criptografia dos documentos, gravações e tokens de cartão.</p>
<h2>7. Contato</h2>
<p>Encarregado de dados (DPO) e dúvidas: <a href="mailto:${contact()}">${contact()}</a>.</p>`,
  );
});

legalRouter.get('/legal/termos', (_req, res) => {
  page(
    res,
    'Termos de Uso',
    `
<p>Estes termos regem o uso do app OpenDriver, oferecido por ${company()}. Ao criar uma conta ou usar o app, você concorda com eles e com a <a href="/legal/privacidade">Política de Privacidade</a>. A conta é a mesma do OpenDriverHub.</p>
<h2>1. O serviço</h2>
<p>O OpenDriver é uma plataforma de tecnologia que conecta passageiros a motoristas parceiros independentes. O transporte é prestado pelo motorista.</p>
<h2>2. Conta</h2>
<ul><li>Você precisa ter 18 anos ou mais e informar dados verdadeiros.</li><li>Você é responsável pela sua senha e pelo uso da sua conta.</li></ul>
<h2>3. Preços e pagamento</h2>
<ul>
<li>O preço é informado antes de pedir e não muda com o trânsito.</li>
<li>O pagamento é feito pelo app: cartão salvo, Pix ou saldo de cashback do OpenDriverHub.</li>
<li>Cancelar depois que o motorista está a caminho há mais de 2 minutos, ou depois que ele chegou, pode gerar taxa de cancelamento, informada antes da confirmação.</li>
<li>Pagamentos não concluídos ficam pendentes na conta até serem quitados.</li>
</ul>
<h2>4. Motoristas</h2>
<ul>
<li>É preciso CNH válida, categoria B ou superior, com a observação de atividade remunerada (EAR), idade mínima de 21 anos e veículo com até 15 anos de fabricação e documentação regular.</li>
<li>O cadastro passa por análise; podemos recusar ou suspender cadastros que não atendam aos requisitos ou que violem estes termos.</li>
<li>Os ganhos ficam no saldo do app e podem ser sacados por Pix para chave em nome do motorista, descontada a taxa da plataforma informada em cada corrida.</li>
</ul>
<h2>5. Conduta e segurança</h2>
<ul>
<li>Respeite as leis de trânsito e trate todos com respeito. Discriminação, assédio e violência resultam em bloqueio.</li>
<li>Use o botão de segurança do app e ligue 190 em caso de emergência.</li>
<li>Avaliações devem ser honestas.</li>
</ul>
<h2>6. Responsabilidades</h2>
<p>Trabalhamos para manter o app disponível e seguro, mas não garantimos disponibilidade ininterrupta nem a existência de motorista em todos os momentos e locais.</p>
<h2>7. Encerramento</h2>
<p>Você pode excluir sua conta a qualquer momento pelo app. Podemos suspender contas que violem estes termos.</p>
<h2>8. Contato e foro</h2>
<p>Dúvidas: <a href="mailto:${contact()}">${contact()}</a>. Aplica-se a legislação brasileira.</p>`,
  );
});
